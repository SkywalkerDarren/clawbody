"""
Qwen3-TTS FastAPI 服务

提供 HTTP API 用于语音合成
"""

import base64
import io
import logging
import os
from contextlib import asynccontextmanager

import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 模型配置
MODEL_ID = os.getenv("QWEN_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice")
DEVICE = os.getenv("QWEN_TTS_DEVICE", "cuda:0")
DTYPE = torch.bfloat16

# 全局模型实例
model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global model
    logger.info(f"Loading Qwen3-TTS model: {MODEL_ID}")
    logger.info(f"Device: {DEVICE}, Dtype: {DTYPE}")

    try:
        from qwen_tts import Qwen3TTSModel

        model = Qwen3TTSModel.from_pretrained(
            MODEL_ID,
            device_map=DEVICE,
            dtype=DTYPE,
            attn_implementation="flash_attention_2",
        )
        logger.info("Model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        model = None

    yield

    if model is not None:
        del model
        torch.cuda.empty_cache()
    logger.info("Model unloaded")


app = FastAPI(
    title="Qwen3-TTS Service",
    description="本地 Qwen3-TTS 语音合成服务",
    version="1.0.0",
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
    device: str


class SpeakersResponse(BaseModel):
    speakers: list[str]
    languages: list[str]


class CustomVoiceRequest(BaseModel):
    text: str = Field(..., description="要合成的文本")
    language: str = Field("Auto", description="语言 (Auto, Chinese, English, Japanese, Korean)")
    speaker: str = Field("Vivian", description="说话人")
    instruct: str | None = Field(None, description="情感/风格指令")


class VoiceDesignRequest(BaseModel):
    text: str = Field(..., description="要合成的文本")
    language: str = Field("Auto", description="语言")
    instruct: str = Field(..., description="声音设计描述")


class VoiceCloneRequest(BaseModel):
    text: str = Field(..., description="要合成的文本")
    language: str = Field("Auto", description="语言")
    ref_audio: str = Field(..., description="参考音频 (base64 或 URL)")
    ref_text: str = Field(..., description="参考音频的文本")


class SynthesisResponse(BaseModel):
    audio: str = Field(..., description="音频数据 (base64 WAV)")
    sample_rate: int
    duration_ms: int


# === API 端点 ===


@app.get("/health", response_model=HealthResponse)
async def health():
    """健康检查"""
    return HealthResponse(
        status="ready" if model is not None else "unavailable",
        model=MODEL_ID if model is not None else None,
        device=DEVICE,
    )


@app.get("/speakers", response_model=SpeakersResponse)
async def get_speakers():
    """获取支持的说话人和语言"""
    if model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        speakers = model.get_supported_speakers()
        languages = model.get_supported_languages()
        return SpeakersResponse(speakers=speakers, languages=languages)
    except Exception:
        return SpeakersResponse(
            speakers=["Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Ryan", "Aiden"],
            languages=["Auto", "Chinese", "English", "Japanese", "Korean"],
        )


@app.post("/synthesize", response_model=SynthesisResponse)
async def synthesize(req: CustomVoiceRequest):
    """自定义声音合成"""
    if model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        wavs, sr = model.generate_custom_voice(
            text=req.text,
            language=req.language,
            speaker=req.speaker,
            instruct=req.instruct or "",
        )

        audio_base64 = _wav_to_base64(wavs[0], sr)
        duration_ms = int(len(wavs[0]) / sr * 1000)

        return SynthesisResponse(audio=audio_base64, sample_rate=sr, duration_ms=duration_ms)
    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        raise HTTPException(500, f"Synthesis failed: {e}")


@app.post("/synthesize/design", response_model=SynthesisResponse)
async def synthesize_design(req: VoiceDesignRequest):
    """声音设计合成"""
    if model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        wavs, sr = model.generate_voice_design(
            text=req.text,
            language=req.language,
            instruct=req.instruct,
        )

        audio_base64 = _wav_to_base64(wavs[0], sr)
        duration_ms = int(len(wavs[0]) / sr * 1000)

        return SynthesisResponse(audio=audio_base64, sample_rate=sr, duration_ms=duration_ms)
    except Exception as e:
        logger.error(f"Voice design synthesis failed: {e}")
        raise HTTPException(500, f"Synthesis failed: {e}")


@app.post("/synthesize/clone", response_model=SynthesisResponse)
async def synthesize_clone(req: VoiceCloneRequest):
    """声音克隆合成"""
    if model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        ref_audio = req.ref_audio
        if not ref_audio.startswith("http"):
            ref_audio = _base64_to_audio(ref_audio)

        wavs, sr = model.generate_voice_clone(
            text=req.text,
            language=req.language,
            ref_audio=ref_audio,
            ref_text=req.ref_text,
        )

        audio_base64 = _wav_to_base64(wavs[0], sr)
        duration_ms = int(len(wavs[0]) / sr * 1000)

        return SynthesisResponse(audio=audio_base64, sample_rate=sr, duration_ms=duration_ms)
    except Exception as e:
        logger.error(f"Voice clone synthesis failed: {e}")
        raise HTTPException(500, f"Synthesis failed: {e}")


@app.post("/synthesize/raw")
async def synthesize_raw(req: CustomVoiceRequest):
    """直接返回 WAV 音频"""
    if model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        wavs, sr = model.generate_custom_voice(
            text=req.text,
            language=req.language,
            speaker=req.speaker,
            instruct=req.instruct or "",
        )

        buffer = io.BytesIO()
        sf.write(buffer, wavs[0], sr, format="WAV")
        buffer.seek(0)

        return Response(
            content=buffer.read(),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=output.wav"},
        )
    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        raise HTTPException(500, f"Synthesis failed: {e}")


# === 工具函数 ===


def _wav_to_base64(wav_data, sample_rate: int) -> str:
    """将音频数据转换为 base64 WAV"""
    buffer = io.BytesIO()
    sf.write(buffer, wav_data, sample_rate, format="WAV")
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")


def _base64_to_audio(b64_str: str) -> tuple:
    """将 base64 音频转换为 numpy 数组"""
    audio_bytes = base64.b64decode(b64_str)
    buffer = io.BytesIO(audio_bytes)
    data, sr = sf.read(buffer)
    return (data, sr)


def main():
    """启动服务"""
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8765"))

    logger.info(f"Starting Qwen3-TTS service on {host}:{port}")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
