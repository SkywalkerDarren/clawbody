"""
Silero VAD FastAPI Server

HTTP API for Voice Activity Detection.
"""

import base64
import logging
import os
from contextlib import asynccontextmanager

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from vad_service.detector import SileroVADDetector, VADConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global detector instance
detector: SileroVADDetector | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    global detector

    logger.info("Initializing Silero VAD detector...")

    config = VADConfig(
        threshold=float(os.getenv("VAD_THRESHOLD", "0.5")),
        min_speech_ms=int(os.getenv("MIN_SPEECH_MS", "250")),
        min_silence_ms=int(os.getenv("MIN_SILENCE_MS", "500")),
        speech_pad_ms=int(os.getenv("SPEECH_PAD_MS", "300")),
        sample_rate=int(os.getenv("SAMPLE_RATE", "16000")),
    )

    detector = SileroVADDetector(config)

    if detector.is_available():
        logger.info("Silero VAD detector ready")
    else:
        logger.error("Failed to initialize VAD detector")

    yield

    detector = None
    logger.info("VAD detector shutdown")


app = FastAPI(
    title="Silero VAD Service",
    description="Voice Activity Detection service using Silero VAD",
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


# === Request/Response Models ===


class HealthResponse(BaseModel):
    status: str
    model: str


class ProcessRequest(BaseModel):
    audio: str = Field(..., description="Base64 encoded PCM audio (16-bit, 16kHz, mono)")
    reset: bool = Field(False, description="Reset detector state before processing")


class ProcessResponse(BaseModel):
    is_speech: bool
    confidence: float
    event: str | None = Field(None, description="'speech_start' or 'speech_end' or null")
    audio_buffer: str | None = Field(None, description="Base64 PCM audio (on speech_end)")


class ConfigRequest(BaseModel):
    threshold: float | None = Field(None, ge=0.0, le=1.0)
    min_speech_ms: int | None = Field(None, ge=0)
    min_silence_ms: int | None = Field(None, ge=0)
    speech_pad_ms: int | None = Field(None, ge=0)


class ConfigResponse(BaseModel):
    threshold: float
    min_speech_ms: int
    min_silence_ms: int
    speech_pad_ms: int
    sample_rate: int


class ResetResponse(BaseModel):
    success: bool


# === API Endpoints ===


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    if detector is None or not detector.is_available():
        return HealthResponse(status="unavailable", model="silero-vad")
    return HealthResponse(status="ready", model="silero-vad")


@app.post("/process", response_model=ProcessResponse)
async def process(req: ProcessRequest):
    """
    Process audio chunk for voice activity detection.

    Returns VAD result and event if state changed.
    """
    if detector is None or not detector.is_available():
        raise HTTPException(503, "VAD detector not available")

    if req.reset:
        detector.reset()

    try:
        # Decode base64 PCM audio (16-bit signed integer)
        audio_bytes = base64.b64decode(req.audio)
        audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
        audio_float32 = audio_int16.astype(np.float32) / 32768.0

        # Process chunk
        event = detector.process_chunk(audio_float32)

        # Determine if current chunk is speech (based on state)
        is_speech = detector.state.value == "speaking"
        confidence = 0.0

        response = ProcessResponse(
            is_speech=is_speech,
            confidence=confidence,
            event=None,
            audio_buffer=None,
        )

        if event:
            response.event = event.type
            response.confidence = event.confidence or 0.0

            if event.type == "speech_start":
                logger.info(f"🎤 Speech started (confidence: {response.confidence:.2f})")
            elif event.type == "speech_end" and event.audio_buffer is not None:
                # Convert float32 back to int16 for transmission
                audio_int16_out = (event.audio_buffer * 32768).astype(np.int16)
                response.audio_buffer = base64.b64encode(audio_int16_out.tobytes()).decode()
                duration = len(event.audio_buffer) / 16000
                logger.info(f"⏹️  Speech ended (duration: {duration:.2f}s, buffer: {len(audio_int16_out)} samples)")

        return response

    except Exception as e:
        logger.error(f"Processing failed: {e}")
        raise HTTPException(500, f"Processing failed: {e}")


@app.get("/config", response_model=ConfigResponse)
async def get_config():
    """Get current VAD configuration."""
    if detector is None:
        raise HTTPException(503, "VAD detector not available")

    config = detector.get_config()
    return ConfigResponse(
        threshold=config.threshold,
        min_speech_ms=config.min_speech_ms,
        min_silence_ms=config.min_silence_ms,
        speech_pad_ms=config.speech_pad_ms,
        sample_rate=config.sample_rate,
    )


@app.post("/config", response_model=ConfigResponse)
async def update_config(req: ConfigRequest):
    """Update VAD configuration."""
    if detector is None:
        raise HTTPException(503, "VAD detector not available")

    updates = {}
    if req.threshold is not None:
        updates["threshold"] = req.threshold
    if req.min_speech_ms is not None:
        updates["min_speech_ms"] = req.min_speech_ms
    if req.min_silence_ms is not None:
        updates["min_silence_ms"] = req.min_silence_ms
    if req.speech_pad_ms is not None:
        updates["speech_pad_ms"] = req.speech_pad_ms

    if updates:
        detector.update_config(**updates)

    config = detector.get_config()
    return ConfigResponse(
        threshold=config.threshold,
        min_speech_ms=config.min_speech_ms,
        min_silence_ms=config.min_silence_ms,
        speech_pad_ms=config.speech_pad_ms,
        sample_rate=config.sample_rate,
    )


@app.post("/reset", response_model=ResetResponse)
async def reset():
    """Reset VAD detector state."""
    if detector is None:
        raise HTTPException(503, "VAD detector not available")

    detector.reset()
    return ResetResponse(success=True)


def main():
    """Start the server."""
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8767"))

    logger.info(f"Starting Silero VAD service on {host}:{port}")
    uvicorn.run(app, host=host, port=port, access_log=False)


if __name__ == "__main__":
    main()
