"""
WeSpeaker Speaker Verification FastAPI Server.

HTTP API for speaker enrollment and verification.
"""

import base64
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from sv_service.storage import SpeakerStorage
from sv_service.verifier import SpeakerVerifier, SVConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
verifier: SpeakerVerifier | None = None
storage: SpeakerStorage | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    global verifier, storage

    logger.info("Initializing Speaker Verification service...")

    config = SVConfig(
        model=os.getenv("SV_MODEL", "voxblink2_samresnet100_ft"),
        threshold=float(os.getenv("SV_THRESHOLD", "0.6")),
        device=os.getenv("SV_DEVICE", "cpu"),
        apply_vad=os.getenv("SV_APPLY_VAD", "true").lower() == "true",
    )

    verifier = SpeakerVerifier(config)

    storage_path = Path(os.getenv("SV_STORAGE_PATH", "./data/speakers.json"))
    storage = SpeakerStorage(storage_path)

    if verifier.is_available():
        logger.info("Speaker Verification service ready")
    else:
        logger.warning("Model not loaded - service running in limited mode")

    yield

    verifier = None
    storage = None
    logger.info("Speaker Verification service shutdown")


app = FastAPI(
    title="WeSpeaker Speaker Verification Service",
    description="Speaker enrollment and verification using WeSpeaker",
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


class EnrollRequest(BaseModel):
    speaker_id: str = Field(..., description="Unique speaker identifier")
    speaker_name: str = Field(..., description="Speaker display name")
    audio: str = Field(..., description="Base64 encoded PCM audio (16-bit, 16kHz, mono)")


class EnrollResponse(BaseModel):
    success: bool
    speaker_id: str
    speaker_name: str
    embedding_count: int
    message: str | None = None


class VerifyRequest(BaseModel):
    audio: str = Field(..., description="Base64 encoded PCM audio (16-bit, 16kHz, mono)")


class VerifyResponse(BaseModel):
    verified: bool
    speaker_id: str | None
    speaker_name: str | None
    confidence: float
    threshold: float


class SpeakerResponse(BaseModel):
    id: str
    name: str
    enrolled_at: str
    embedding_count: int


class DeleteResponse(BaseModel):
    success: bool


class ConfigRequest(BaseModel):
    threshold: float | None = Field(None, ge=0.0, le=1.0)
    apply_vad: bool | None = None


class ConfigResponse(BaseModel):
    model: str
    threshold: float
    device: str
    apply_vad: bool


# === API Endpoints ===


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    if verifier is None:
        return HealthResponse(status="unavailable", model="unknown")

    config = verifier.get_config()
    status = "ready" if verifier.is_available() else "degraded"
    return HealthResponse(status=status, model=config.model)


@app.post("/enroll", response_model=EnrollResponse)
async def enroll(req: EnrollRequest):
    """Enroll a speaker with voice sample."""
    if verifier is None or storage is None:
        raise HTTPException(503, "Service not available")

    if not verifier.is_available():
        raise HTTPException(503, "Model not loaded")

    try:
        # Decode audio
        audio_bytes = base64.b64decode(req.audio)
        audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
        audio_float32 = audio_int16.astype(np.float32) / 32768.0

        # Extract embedding
        embedding = verifier.extract_embedding(audio_float32, sample_rate=16000)
        if embedding is None:
            return EnrollResponse(
                success=False,
                speaker_id=req.speaker_id,
                speaker_name=req.speaker_name,
                embedding_count=0,
                message="Failed to extract embedding (no speech detected)",
            )

        # Store embedding
        result = storage.enroll(req.speaker_id, req.speaker_name, embedding)

        logger.info(
            f"Enrolled speaker {req.speaker_id} ({req.speaker_name}), "
            f"embeddings: {result.embedding_count}"
        )

        return EnrollResponse(
            success=result.success,
            speaker_id=result.speaker_id,
            speaker_name=result.speaker_name,
            embedding_count=result.embedding_count,
            message=result.message,
        )

    except Exception as e:
        logger.error(f"Enrollment failed: {e}")
        raise HTTPException(500, f"Enrollment failed: {e}")


@app.post("/verify", response_model=VerifyResponse)
async def verify(req: VerifyRequest):
    """Verify speaker identity."""
    if verifier is None or storage is None:
        raise HTTPException(503, "Service not available")

    if not verifier.is_available():
        raise HTTPException(503, "Model not loaded")

    try:
        # Decode audio
        audio_bytes = base64.b64decode(req.audio)
        audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
        audio_float32 = audio_int16.astype(np.float32) / 32768.0

        # Extract embedding
        embedding = verifier.extract_embedding(audio_float32, sample_rate=16000)
        if embedding is None:
            return VerifyResponse(
                verified=False,
                speaker_id=None,
                speaker_name=None,
                confidence=0.0,
                threshold=verifier.get_config().threshold,
            )

        # Compare with all enrolled speakers
        all_speakers = storage.get_all_speakers_with_embeddings()
        if not all_speakers:
            return VerifyResponse(
                verified=False,
                speaker_id=None,
                speaker_name=None,
                confidence=0.0,
                threshold=verifier.get_config().threshold,
            )

        best_speaker_id = None
        best_score = 0.0

        for speaker_id, speaker_embedding in all_speakers.items():
            score = verifier.cosine_similarity(embedding, speaker_embedding)
            if score > best_score:
                best_score = score
                best_speaker_id = speaker_id

        config = verifier.get_config()
        verified = best_score >= config.threshold

        if verified and best_speaker_id:
            speaker = storage.get_speaker(best_speaker_id)
            speaker_name = speaker.name if speaker else None
        else:
            best_speaker_id = None
            speaker_name = None

        logger.info(
            f"Verification: verified={verified}, speaker={best_speaker_id}, "
            f"confidence={best_score:.3f}, threshold={config.threshold}"
        )

        return VerifyResponse(
            verified=verified,
            speaker_id=best_speaker_id,
            speaker_name=speaker_name,
            confidence=best_score,
            threshold=config.threshold,
        )

    except Exception as e:
        logger.error(f"Verification failed: {e}")
        raise HTTPException(500, f"Verification failed: {e}")


@app.get("/speakers", response_model=list[SpeakerResponse])
async def list_speakers():
    """List all enrolled speakers."""
    if storage is None:
        raise HTTPException(503, "Service not available")

    speakers = storage.list_speakers()
    return [
        SpeakerResponse(
            id=s.id,
            name=s.name,
            enrolled_at=s.enrolled_at.isoformat(),
            embedding_count=s.embedding_count,
        )
        for s in speakers
    ]


@app.delete("/speakers/{speaker_id}", response_model=DeleteResponse)
async def delete_speaker(speaker_id: str):
    """Delete a speaker."""
    if storage is None:
        raise HTTPException(503, "Service not available")

    deleted = storage.delete_speaker(speaker_id)
    if deleted:
        logger.info(f"Deleted speaker {speaker_id}")

    return DeleteResponse(success=deleted)


@app.get("/config", response_model=ConfigResponse)
async def get_config():
    """Get current configuration."""
    if verifier is None:
        raise HTTPException(503, "Service not available")

    config = verifier.get_config()
    return ConfigResponse(
        model=config.model,
        threshold=config.threshold,
        device=config.device,
        apply_vad=config.apply_vad,
    )


@app.post("/config", response_model=ConfigResponse)
async def update_config(req: ConfigRequest):
    """Update configuration."""
    if verifier is None:
        raise HTTPException(503, "Service not available")

    updates = {}
    if req.threshold is not None:
        updates["threshold"] = req.threshold
    if req.apply_vad is not None:
        updates["apply_vad"] = req.apply_vad

    if updates:
        verifier.update_config(**updates)
        logger.info(f"Updated config: {updates}")

    config = verifier.get_config()
    return ConfigResponse(
        model=config.model,
        threshold=config.threshold,
        device=config.device,
        apply_vad=config.apply_vad,
    )


def main():
    """Start the server."""
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8768"))

    logger.info(f"Starting WeSpeaker SV service on {host}:{port}")
    uvicorn.run(app, host=host, port=port, access_log=False)


if __name__ == "__main__":
    main()
