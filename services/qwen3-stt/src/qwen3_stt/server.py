"""
Qwen3-STT FastAPI 服务

提供 HTTP/WebSocket API 用于语音识别，支持流式转录
"""

import asyncio
import base64
import io
import json
import logging
import os
import tempfile
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 模型配置
MODEL_PATH = os.getenv("QWEN_ASR_MODEL", "Qwen/Qwen3-ASR-1.7B")
GPU_MEMORY_UTILIZATION = float(os.getenv("GPU_MEMORY_UTILIZATION", "0.3"))  # 降低显存占用
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "32"))
MAX_MODEL_LEN = int(os.getenv("MAX_MODEL_LEN", "4096"))  # 限制最大序列长度，语音转录不需要太长

# 全局模型实例
asr_model = None


class SessionState(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    PROCESSING = "processing"
    CLOSED = "closed"


@dataclass
class StreamingSession:
    session_id: str
    state: SessionState
    language: str
    created_at: datetime
    last_activity: datetime
    audio_buffer: bytearray = field(default_factory=bytearray)
    streaming_state: Any = None  # Qwen ASR streaming state
    transcripts: list = field(default_factory=list)
    total_samples: int = 0


# 会话管理
sessions: dict[str, StreamingSession] = {}
SESSION_TIMEOUT_SEC = int(os.getenv("SESSION_TIMEOUT_SEC", "30"))
MAX_CONCURRENT_SESSIONS = int(os.getenv("MAX_CONCURRENT_SESSIONS", "1"))  # 单输入源，只需1个会话


def _resample_to_16k(wav: np.ndarray, sr: int) -> np.ndarray:
    """重采样到 16kHz"""
    if sr == 16000:
        return wav.astype(np.float32, copy=False)
    wav = wav.astype(np.float32, copy=False)
    dur = wav.shape[0] / float(sr)
    n16 = int(round(dur * 16000))
    if n16 <= 0:
        return np.zeros((0,), dtype=np.float32)
    x_old = np.linspace(0.0, dur, num=wav.shape[0], endpoint=False)
    x_new = np.linspace(0.0, dur, num=n16, endpoint=False)
    return np.interp(x_new, x_old, wav).astype(np.float32)


def _decode_audio(audio_bytes: bytes) -> tuple[np.ndarray, int]:
    """解码音频数据，支持 WAV 格式和原始 PCM"""
    # 尝试作为 WAV 格式解码
    try:
        with io.BytesIO(audio_bytes) as f:
            wav, sr = sf.read(f, dtype="float32", always_2d=False)
        return np.asarray(wav, dtype=np.float32), int(sr)
    except Exception:
        pass

    # 回退到原始 PCM 16-bit, 16kHz
    pcm_array = np.frombuffer(audio_bytes, dtype=np.int16)
    wav = pcm_array.astype(np.float32) / 32768.0
    return wav, 16000


def _pcm_to_float32(pcm_bytes: bytes, sample_rate: int = 16000) -> np.ndarray:
    """将 PCM 16-bit 数据转换为 float32"""
    pcm_array = np.frombuffer(pcm_bytes, dtype=np.int16)
    return pcm_array.astype(np.float32) / 32768.0


async def cleanup_expired_sessions():
    """清理过期会话"""
    while True:
        await asyncio.sleep(10)
        now = datetime.now()
        expired = [
            sid
            for sid, session in sessions.items()
            if (now - session.last_activity).total_seconds() > SESSION_TIMEOUT_SEC
        ]
        for sid in expired:
            logger.info(f"Cleaning up expired session: {sid}")
            sessions.pop(sid, None)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global asr_model
    logger.info(f"Loading Qwen3-ASR model: {MODEL_PATH}")
    logger.info(f"GPU memory utilization: {GPU_MEMORY_UTILIZATION}")

    try:
        from qwen_asr import Qwen3ASRModel

        asr_model = Qwen3ASRModel.LLM(
            model=MODEL_PATH,
            gpu_memory_utilization=GPU_MEMORY_UTILIZATION,
            max_new_tokens=MAX_NEW_TOKENS,
            max_model_len=MAX_MODEL_LEN,  # 限制 KV cache 大小
        )
        logger.info("Qwen3-ASR model loaded successfully")

        # 模型预热: 使用 1 秒静音音频
        logger.info("Warming up model with 1s silent audio...")
        warmup_start = datetime.now()
        try:
            silent_audio = np.zeros(16000, dtype=np.float32)  # 1 秒 16kHz 静音
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                sf.write(tmp.name, silent_audio, 16000, format="WAV")
                tmp_path = tmp.name
            try:
                _ = asr_model.transcribe(tmp_path)
            finally:
                os.unlink(tmp_path)
            warmup_time = (datetime.now() - warmup_start).total_seconds()
            logger.info(f"Model warmup completed in {warmup_time:.2f}s")
        except Exception as e:
            logger.warning(f"Model warmup failed (non-critical): {e}")

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        asr_model = None

    # 启动会话清理任务
    cleanup_task = asyncio.create_task(cleanup_expired_sessions())

    yield

    cleanup_task.cancel()
    if asr_model is not None:
        del asr_model
    logger.info("Model unloaded")


app = FastAPI(
    title="Qwen3-STT Service",
    description="本地 Qwen3-ASR 语音识别服务，支持流式转录",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === 请求/响应模型 ===


class HealthResponse(BaseModel):
    status: str
    model: str | None
    active_sessions: int


class TranscribeRequest(BaseModel):
    audio: str = Field(..., description="Base64 编码的音频数据")
    language: str = Field("auto", description="语言 (auto, zh, en, ja, ko)")
    enable_timestamps: bool = Field(False, description="是否返回时间戳")


class TranscriptSegment(BaseModel):
    text: str
    start_time: float | None = None
    end_time: float | None = None
    confidence: float | None = None
    is_final: bool = True


class TranscriptionResult(BaseModel):
    text: str
    segments: list[TranscriptSegment]
    language: str
    duration: float


class CreateSessionRequest(BaseModel):
    language: str = Field("auto", description="语言")


class CreateSessionResponse(BaseModel):
    session_id: str
    state: str
    ws_url: str


class SendChunkResponse(BaseModel):
    text: str | None
    is_final: bool
    confidence: float | None = None


class SendChunkRequest(BaseModel):
    audio: str = Field(..., description="Base64 编码的 PCM 音频块")


# === API 端点 ===


@app.get("/health", response_model=HealthResponse)
async def health():
    """健康检查"""
    return HealthResponse(
        status="ready" if asr_model is not None else "unavailable",
        model=MODEL_PATH if asr_model is not None else None,
        active_sessions=len(sessions),
    )


@app.post("/transcribe", response_model=TranscriptionResult)
async def transcribe(req: TranscribeRequest):
    """批量转录完整音频"""
    if asr_model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        # 解码音频
        audio_bytes = base64.b64decode(req.audio)
        wav, sr = _decode_audio(audio_bytes)
        wav16k = _resample_to_16k(wav, sr)

        duration = len(wav16k) / 16000.0

        # 保存到临时文件 (qwen_asr 需要文件路径)
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
            sf.write(tmp_path, wav16k, 16000, format="WAV")

        try:
            # 转录
            result = asr_model.transcribe(tmp_path)
            text = result.text if hasattr(result, "text") else str(result)
            language = result.language if hasattr(result, "language") else req.language
        finally:
            import os
            os.unlink(tmp_path)

        segments = [
            TranscriptSegment(
                text=text,
                start_time=0.0,
                end_time=duration,
                confidence=0.95,
                is_final=True,
            )
        ]

        return TranscriptionResult(
            text=text,
            segments=segments,
            language=language,
            duration=duration,
        )
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(500, f"Transcription failed: {e}")


@app.post("/sessions", response_model=CreateSessionResponse)
async def create_session(req: CreateSessionRequest):
    """创建流式转录会话"""
    if asr_model is None:
        raise HTTPException(503, "Model not loaded")

    if len(sessions) >= MAX_CONCURRENT_SESSIONS:
        raise HTTPException(429, "Maximum concurrent sessions reached")

    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    now = datetime.now()

    # 初始化流式状态 - 平衡延迟和准确性
    streaming_state = asr_model.init_streaming_state(
        unfixed_chunk_num=2,
        unfixed_token_num=5,
        chunk_size_sec=1.0,  # 1秒的处理窗口
    )

    session = StreamingSession(
        session_id=session_id,
        state=SessionState.IDLE,
        language=req.language,
        created_at=now,
        last_activity=now,
        streaming_state=streaming_state,
    )
    sessions[session_id] = session

    logger.info(f"Created session: {session_id}")

    return CreateSessionResponse(
        session_id=session_id,
        state=session.state.value,
        ws_url=f"/sessions/{session_id}/stream",
    )


@app.post("/sessions/{session_id}/chunks", response_model=SendChunkResponse)
async def send_chunk(session_id: str, req: SendChunkRequest):
    """发送音频块到会话 (HTTP 方式)"""
    if asr_model is None:
        raise HTTPException(503, "Model not loaded")

    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, f"Session not found: {session_id}")

    if session.state == SessionState.CLOSED:
        raise HTTPException(400, "Session is closed")

    try:
        # 解码音频块 (PCM 16-bit, 16kHz, mono)
        audio_bytes = base64.b64decode(req.audio)
        wav16k = _pcm_to_float32(audio_bytes)

        session.state = SessionState.LISTENING
        session.last_activity = datetime.now()
        session.total_samples += len(wav16k)

        # 流式转录
        asr_model.streaming_transcribe(wav16k, session.streaming_state)

        text = session.streaming_state.text
        language = session.streaming_state.language

        if text:
            return SendChunkResponse(
                text=text,
                is_final=False,
                confidence=0.85,
            )
        return SendChunkResponse(text=None, is_final=False)

    except Exception as e:
        logger.error(f"Chunk processing failed: {e}")
        raise HTTPException(500, f"Processing failed: {e}")


@app.post("/sessions/{session_id}/end", response_model=TranscriptionResult)
async def end_session(session_id: str):
    """结束会话并获取最终结果"""
    if asr_model is None:
        raise HTTPException(503, "Model not loaded")

    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, f"Session not found: {session_id}")

    try:
        session.state = SessionState.PROCESSING

        # 完成流式转录
        asr_model.finish_streaming_transcribe(session.streaming_state)

        text = session.streaming_state.text or ""
        language = session.streaming_state.language or session.language
        duration = session.total_samples / 16000.0

        session.state = SessionState.CLOSED
        sessions.pop(session_id, None)

        logger.info(f"Session ended: {session_id}, text: {text[:50]}...")

        return TranscriptionResult(
            text=text,
            segments=[
                TranscriptSegment(
                    text=text,
                    start_time=0.0,
                    end_time=duration,
                    is_final=True,
                )
            ],
            language=language,
            duration=duration,
        )
    except Exception as e:
        logger.error(f"End session failed: {e}")
        sessions.pop(session_id, None)
        raise HTTPException(500, f"End session failed: {e}")


@app.delete("/sessions/{session_id}")
async def cancel_session(session_id: str):
    """取消会话"""
    session = sessions.pop(session_id, None)
    if not session:
        raise HTTPException(404, f"Session not found: {session_id}")

    logger.info(f"Session cancelled: {session_id}")
    return {"status": "cancelled", "session_id": session_id}


@app.websocket("/sessions/{session_id}/stream")
async def websocket_stream(websocket: WebSocket, session_id: str):
    """WebSocket 流式转录"""
    if asr_model is None:
        await websocket.close(code=1011, reason="Model not loaded")
        return

    session = sessions.get(session_id)
    if not session:
        await websocket.close(code=1008, reason="Session not found")
        return

    await websocket.accept()
    logger.info(f"WebSocket connected: {session_id}")

    try:
        session.state = SessionState.LISTENING

        while True:
            # 接收消息
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            session.last_activity = datetime.now()

            # 处理二进制音频数据
            if "bytes" in message:
                audio_bytes = message["bytes"]
                wav16k = _pcm_to_float32(audio_bytes)
                session.total_samples += len(wav16k)

                # 流式转录
                asr_model.streaming_transcribe(wav16k, session.streaming_state)

                text = session.streaming_state.text
                if text:
                    await websocket.send_json(
                        {
                            "type": "transcript",
                            "data": {
                                "text": text,
                                "is_final": False,
                                "confidence": 0.85,
                            },
                        }
                    )

            # 处理 JSON 控制消息
            elif "text" in message:
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")

                    if msg_type == "end":
                        # 结束会话
                        session.state = SessionState.PROCESSING
                        asr_model.finish_streaming_transcribe(session.streaming_state)

                        text = session.streaming_state.text or ""
                        language = session.streaming_state.language or session.language
                        duration = session.total_samples / 16000.0

                        await websocket.send_json(
                            {
                                "type": "final",
                                "data": {
                                    "text": text,
                                    "language": language,
                                    "duration": duration,
                                },
                            }
                        )
                        break

                    elif msg_type == "cancel":
                        await websocket.send_json({"type": "cancelled"})
                        break

                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.send_json({"type": "error", "error": str(e)})
    finally:
        session.state = SessionState.CLOSED
        sessions.pop(session_id, None)


@app.get("/languages")
async def list_languages():
    """列出支持的语言"""
    return {
        "languages": [
            {"code": "auto", "name": "自动检测"},
            {"code": "zh", "name": "中文"},
            {"code": "en", "name": "英文"},
            {"code": "ja", "name": "日文"},
            {"code": "ko", "name": "韩文"},
            {"code": "yue", "name": "粤语"},
        ]
    }


def main():
    """启动服务"""
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8766"))

    logger.info(f"Starting Qwen3-STT service on {host}:{port}")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
