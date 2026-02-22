"""
Qwen3-TTS FastAPI 服务

提供 HTTP API 用于语音合成，支持自定义声音
"""

import base64
import io
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

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
MODEL_ID = os.getenv("QWEN_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")  # 改用 Base 模型支持 clone
DEVICE = os.getenv("QWEN_TTS_DEVICE", "cuda:0")
DTYPE = torch.bfloat16
USE_FLASH_ATTN = os.getenv("USE_FLASH_ATTN", "auto")

# 声音目录
VOICES_DIR = Path(__file__).parent.parent.parent / "voices"

# 全局模型实例
model = None
custom_model = None  # CustomVoice 模型 (可选)
voice_prompts: dict = {}  # 缓存的 voice clone prompts


def _check_flash_attn() -> str | None:
    """检查 FlashAttention 是否可用"""
    if USE_FLASH_ATTN == "false":
        return None
    try:
        import flash_attn  # noqa: F401
        return "flash_attention_2"
    except ImportError:
        if USE_FLASH_ATTN == "true":
            logger.warning("FlashAttention requested but not installed")
        return None


def _load_voice_profiles() -> None:
    """加载自定义声音配置"""
    global voice_prompts

    if not VOICES_DIR.exists():
        logger.info(f"Voices directory not found: {VOICES_DIR}")
        return

    library_file = VOICES_DIR / "library.json"
    if not library_file.exists():
        return

    try:
        library = json.loads(library_file.read_text())
        voices = library.get("voices", [])

        for voice in voices:
            voice_id = voice.get("id")
            voice_file = VOICES_DIR / voice.get("file", "")
            ref_text = voice.get("text", "")

            if voice_file.exists() and ref_text:
                logger.info(f"Loading voice profile: {voice_id}")
                try:
                    # 创建 voice clone prompt
                    prompt = model.create_voice_clone_prompt(
                        ref_audio=str(voice_file),
                        ref_text=ref_text,
                    )
                    voice_prompts[voice_id] = {
                        "prompt": prompt,
                        "file": str(voice_file),
                        "text": ref_text,
                        "instruct": voice.get("instruct", ""),
                    }
                    logger.info(f"  ✓ Loaded: {voice_id}")
                except Exception as e:
                    logger.warning(f"  ✗ Failed to load {voice_id}: {e}")

        logger.info(f"Loaded {len(voice_prompts)} custom voice(s)")
    except Exception as e:
        logger.error(f"Failed to load voice profiles: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global model, custom_model
    logger.info(f"Loading Qwen3-TTS model: {MODEL_ID}")
    logger.info(f"Device: {DEVICE}, Dtype: {DTYPE}")

    attn_impl = _check_flash_attn()
    if attn_impl:
        logger.info(f"Using attention implementation: {attn_impl}")
    else:
        logger.info("Using default attention implementation (no FlashAttention)")

    try:
        from qwen_tts import Qwen3TTSModel

        kwargs = {
            "device_map": DEVICE,
            "dtype": DTYPE,
        }
        if attn_impl:
            kwargs["attn_implementation"] = attn_impl

        # 加载 Base 模型 (用于 clone)
        model = Qwen3TTSModel.from_pretrained(MODEL_ID, **kwargs)
        logger.info("Base model loaded successfully")

        # 加载自定义声音配置
        _load_voice_profiles()

        # 可选: 加载 CustomVoice 模型
        try:
            custom_model = Qwen3TTSModel.from_pretrained(
                "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", **kwargs
            )
            logger.info("CustomVoice model loaded successfully")
        except Exception as e:
            logger.warning(f"CustomVoice model not loaded: {e}")
            custom_model = None

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        model = None

    yield

    if model is not None:
        del model
    if custom_model is not None:
        del custom_model
    torch.cuda.empty_cache()
    logger.info("Model unloaded")


app = FastAPI(
    title="Qwen3-TTS Service",
    description="本地 Qwen3-TTS 语音合成服务，支持自定义声音",
    version="1.1.0",
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
    custom_voices: list[str]


class SpeakersResponse(BaseModel):
    speakers: list[str]
    custom_voices: list[str]
    languages: list[str]


class SynthesizeRequest(BaseModel):
    text: str = Field(..., description="要合成的文本")
    language: str = Field("Auto", description="语言")
    voice: str = Field("Vivian", description="声音 (内置或自定义)")
    instruct: str | None = Field(None, description="情感/风格指令 (仅内置声音)")


class VoiceCloneRequest(BaseModel):
    text: str = Field(..., description="要合成的文本")
    language: str = Field("Auto", description="语言")
    ref_audio: str = Field(..., description="参考音频 (base64 或 URL 或文件路径)")
    ref_text: str = Field(..., description="参考音频的文本")


class RegisterVoiceRequest(BaseModel):
    voice_id: str = Field(..., description="声音 ID")
    ref_audio: str = Field(..., description="参考音频 (base64)")
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
        custom_voices=list(voice_prompts.keys()),
    )


@app.get("/speakers", response_model=SpeakersResponse)
async def get_speakers():
    """获取支持的说话人和语言"""
    builtin = []
    if custom_model is not None:
        try:
            builtin = custom_model.get_supported_speakers()
        except Exception:
            builtin = ["Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Ryan", "Aiden"]

    languages = ["Auto", "Chinese", "English", "Japanese", "Korean"]
    try:
        if custom_model is not None:
            languages = custom_model.get_supported_languages()
    except Exception:
        pass

    return SpeakersResponse(
        speakers=builtin,
        custom_voices=list(voice_prompts.keys()),
        languages=languages,
    )


@app.post("/synthesize", response_model=SynthesisResponse)
async def synthesize(req: SynthesizeRequest):
    """
    统一合成接口

    - 如果 voice 是自定义声音 ID，使用 clone 模式
    - 否则使用内置声音 (CustomVoice 模型)
    """
    if model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        # 检查是否是自定义声音
        if req.voice in voice_prompts:
            logger.info(f"Using custom voice: {req.voice}")
            prompt_data = voice_prompts[req.voice]

            wavs, sr = model.generate_voice_clone(
                text=req.text,
                language=req.language,
                voice_clone_prompt=prompt_data["prompt"],
            )
        elif custom_model is not None:
            # 使用内置声音
            logger.info(f"Using builtin voice: {req.voice}")
            wavs, sr = custom_model.generate_custom_voice(
                text=req.text,
                language=req.language,
                speaker=req.voice,
                instruct=req.instruct or "",
            )
        else:
            raise HTTPException(400, f"Voice not found: {req.voice}. CustomVoice model not loaded.")

        audio_base64 = _wav_to_base64(wavs[0], sr)
        duration_ms = int(len(wavs[0]) / sr * 1000)

        return SynthesisResponse(audio=audio_base64, sample_rate=sr, duration_ms=duration_ms)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        raise HTTPException(500, f"Synthesis failed: {e}")


@app.post("/synthesize/clone", response_model=SynthesisResponse)
async def synthesize_clone(req: VoiceCloneRequest):
    """声音克隆合成 (一次性)"""
    if model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        ref_audio = req.ref_audio
        if ref_audio.startswith("data:") or len(ref_audio) > 500:
            # base64
            ref_audio = _base64_to_audio(ref_audio.split(",")[-1] if "," in ref_audio else ref_audio)

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


@app.post("/voices/register")
async def register_voice(req: RegisterVoiceRequest):
    """注册自定义声音 (运行时)"""
    if model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        # 解码音频
        audio_data = _base64_to_audio(req.ref_audio)

        # 创建 prompt
        prompt = model.create_voice_clone_prompt(
            ref_audio=audio_data,
            ref_text=req.ref_text,
        )

        voice_prompts[req.voice_id] = {
            "prompt": prompt,
            "text": req.ref_text,
            "runtime": True,
        }

        logger.info(f"Registered voice: {req.voice_id}")
        return {"status": "ok", "voice_id": req.voice_id}
    except Exception as e:
        logger.error(f"Failed to register voice: {e}")
        raise HTTPException(500, f"Failed to register voice: {e}")


@app.get("/voices")
async def list_voices():
    """列出所有可用声音"""
    builtin = []
    if custom_model is not None:
        try:
            builtin = custom_model.get_supported_speakers()
        except Exception:
            builtin = ["Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Ryan", "Aiden"]

    custom = [
        {
            "id": k,
            "text": v.get("text", ""),
            "instruct": v.get("instruct", ""),
            "runtime": v.get("runtime", False),
        }
        for k, v in voice_prompts.items()
    ]

    return {"builtin": builtin, "custom": custom}


@app.post("/synthesize/raw")
async def synthesize_raw(req: SynthesizeRequest):
    """直接返回 WAV 音频"""
    if model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        if req.voice in voice_prompts:
            prompt_data = voice_prompts[req.voice]
            wavs, sr = model.generate_voice_clone(
                text=req.text,
                language=req.language,
                voice_clone_prompt=prompt_data["prompt"],
            )
        elif custom_model is not None:
            wavs, sr = custom_model.generate_custom_voice(
                text=req.text,
                language=req.language,
                speaker=req.voice,
                instruct=req.instruct or "",
            )
        else:
            raise HTTPException(400, f"Voice not found: {req.voice}")

        buffer = io.BytesIO()
        sf.write(buffer, wavs[0], sr, format="WAV")
        buffer.seek(0)

        return Response(
            content=buffer.read(),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=output.wav"},
        )
    except HTTPException:
        raise
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
