"""
Speaker Storage.

Handles persistence of speaker embeddings to JSON file.
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class Speaker:
    """Speaker information."""

    id: str
    name: str
    enrolled_at: datetime
    embedding_count: int


@dataclass
class EnrollmentResult:
    """Result of speaker enrollment."""

    success: bool
    speaker_id: str
    speaker_name: str
    embedding_count: int
    message: str = ""


class SpeakerStorage:
    """JSON-based speaker embedding storage."""

    def __init__(self, storage_path: Path):
        self._path = storage_path
        self._data: dict = {"speakers": {}}
        self._load()

    def _load(self) -> None:
        """Load data from file."""
        if self._path.exists():
            try:
                with open(self._path) as f:
                    self._data = json.load(f)
                logger.info(f"Loaded {len(self._data.get('speakers', {}))} speakers")
            except Exception as e:
                logger.error(f"Failed to load storage: {e}")
                self._data = {"speakers": {}}

    def _save(self) -> None:
        """Save data to file."""
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with open(self._path, "w") as f:
                json.dump(self._data, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save storage: {e}")

    def enroll(self, speaker_id: str, speaker_name: str, embedding: np.ndarray) -> EnrollmentResult:
        """
        Enroll a speaker with an embedding.

        Multiple enrollments for the same speaker will accumulate embeddings.
        """
        speakers = self._data.setdefault("speakers", {})

        if speaker_id in speakers:
            # Add to existing speaker
            speaker_data = speakers[speaker_id]
            speaker_data["embeddings"].append(embedding.tolist())
            # Recompute mean embedding
            embeddings = np.array(speaker_data["embeddings"])
            speaker_data["mean_embedding"] = embeddings.mean(axis=0).tolist()
            embedding_count = len(speaker_data["embeddings"])
        else:
            # New speaker
            speakers[speaker_id] = {
                "name": speaker_name,
                "enrolled_at": datetime.now(timezone.utc).isoformat(),
                "embeddings": [embedding.tolist()],
                "mean_embedding": embedding.tolist(),
            }
            embedding_count = 1

        self._save()

        return EnrollmentResult(
            success=True,
            speaker_id=speaker_id,
            speaker_name=speaker_name,
            embedding_count=embedding_count,
            message="Enrolled successfully",
        )

    def list_speakers(self) -> list[Speaker]:
        """List all enrolled speakers."""
        speakers = []
        for speaker_id, data in self._data.get("speakers", {}).items():
            enrolled_at = datetime.fromisoformat(data["enrolled_at"])
            speakers.append(
                Speaker(
                    id=speaker_id,
                    name=data["name"],
                    enrolled_at=enrolled_at,
                    embedding_count=len(data["embeddings"]),
                )
            )
        return speakers

    def get_speaker(self, speaker_id: str) -> Speaker | None:
        """Get speaker by ID."""
        speakers = self._data.get("speakers", {})
        if speaker_id not in speakers:
            return None

        data = speakers[speaker_id]
        return Speaker(
            id=speaker_id,
            name=data["name"],
            enrolled_at=datetime.fromisoformat(data["enrolled_at"]),
            embedding_count=len(data["embeddings"]),
        )

    def delete_speaker(self, speaker_id: str) -> bool:
        """Delete a speaker."""
        speakers = self._data.get("speakers", {})
        if speaker_id not in speakers:
            return False

        del speakers[speaker_id]
        self._save()
        return True

    def get_mean_embedding(self, speaker_id: str) -> np.ndarray | None:
        """Get mean embedding for a speaker."""
        speakers = self._data.get("speakers", {})
        if speaker_id not in speakers:
            return None

        return np.array(speakers[speaker_id]["mean_embedding"], dtype=np.float32)

    def get_all_speakers_with_embeddings(self) -> dict[str, np.ndarray]:
        """Get all speakers with their mean embeddings."""
        result = {}
        for speaker_id, data in self._data.get("speakers", {}).items():
            result[speaker_id] = np.array(data["mean_embedding"], dtype=np.float32)
        return result
