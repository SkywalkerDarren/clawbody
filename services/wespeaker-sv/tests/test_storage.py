"""
Tests for Speaker Storage.

TDD Phase: RED - These tests should fail initially.
"""

import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pytest

from sv_service.storage import EnrollmentResult, Speaker, SpeakerStorage


class TestSpeaker:
    """Tests for Speaker dataclass."""

    def test_speaker_creation(self):
        """Speaker should store all required fields."""
        now = datetime.now(timezone.utc)
        speaker = Speaker(
            id="user_001",
            name="Alice",
            enrolled_at=now,
            embedding_count=3,
        )
        assert speaker.id == "user_001"
        assert speaker.name == "Alice"
        assert speaker.enrolled_at == now
        assert speaker.embedding_count == 3


class TestEnrollmentResult:
    """Tests for EnrollmentResult dataclass."""

    def test_successful_enrollment(self):
        """Successful enrollment should have all fields."""
        result = EnrollmentResult(
            success=True,
            speaker_id="user_001",
            speaker_name="Alice",
            embedding_count=1,
            message="Enrolled successfully",
        )
        assert result.success is True
        assert result.speaker_id == "user_001"
        assert result.embedding_count == 1

    def test_failed_enrollment(self):
        """Failed enrollment should have error message."""
        result = EnrollmentResult(
            success=False,
            speaker_id="",
            speaker_name="",
            embedding_count=0,
            message="Failed to extract embedding",
        )
        assert result.success is False
        assert "Failed" in result.message


class TestSpeakerStorage:
    """Tests for SpeakerStorage class."""

    @pytest.fixture
    def temp_storage_path(self) -> Path:
        """Create a temporary file for storage."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            return Path(f.name)

    @pytest.fixture
    def storage(self, temp_storage_path: Path) -> SpeakerStorage:
        """Create a storage instance with temp file."""
        return SpeakerStorage(temp_storage_path)

    @pytest.fixture
    def mock_embedding(self) -> np.ndarray:
        """Create a mock embedding vector."""
        return np.random.randn(512).astype(np.float32)

    def test_empty_storage_list_speakers(self, storage):
        """Empty storage should return empty list."""
        speakers = storage.list_speakers()
        assert speakers == []

    def test_enroll_new_speaker(self, storage, mock_embedding):
        """Enrolling new speaker should succeed."""
        result = storage.enroll("user_001", "Alice", mock_embedding)
        assert result.success is True
        assert result.speaker_id == "user_001"
        assert result.speaker_name == "Alice"
        assert result.embedding_count == 1

    def test_enroll_same_speaker_multiple_times(self, storage, mock_embedding):
        """Enrolling same speaker multiple times should accumulate embeddings."""
        storage.enroll("user_001", "Alice", mock_embedding)
        storage.enroll("user_001", "Alice", mock_embedding)
        result = storage.enroll("user_001", "Alice", mock_embedding)

        assert result.success is True
        assert result.embedding_count == 3

    def test_list_speakers_after_enrollment(self, storage, mock_embedding):
        """list_speakers should return enrolled speakers."""
        storage.enroll("user_001", "Alice", mock_embedding)
        storage.enroll("user_002", "Bob", mock_embedding)

        speakers = storage.list_speakers()
        assert len(speakers) == 2

        ids = {s.id for s in speakers}
        assert "user_001" in ids
        assert "user_002" in ids

    def test_get_speaker(self, storage, mock_embedding):
        """get_speaker should return speaker data."""
        storage.enroll("user_001", "Alice", mock_embedding)

        speaker = storage.get_speaker("user_001")
        assert speaker is not None
        assert speaker.id == "user_001"
        assert speaker.name == "Alice"

    def test_get_nonexistent_speaker(self, storage):
        """get_speaker should return None for nonexistent speaker."""
        speaker = storage.get_speaker("nonexistent")
        assert speaker is None

    def test_delete_speaker(self, storage, mock_embedding):
        """delete_speaker should remove speaker."""
        storage.enroll("user_001", "Alice", mock_embedding)
        assert storage.get_speaker("user_001") is not None

        deleted = storage.delete_speaker("user_001")
        assert deleted is True
        assert storage.get_speaker("user_001") is None

    def test_delete_nonexistent_speaker(self, storage):
        """delete_speaker should return False for nonexistent speaker."""
        deleted = storage.delete_speaker("nonexistent")
        assert deleted is False

    def test_get_mean_embedding(self, storage):
        """get_mean_embedding should return averaged embedding."""
        # Enroll with multiple embeddings
        emb1 = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        emb2 = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        emb3 = np.array([0.0, 0.0, 1.0], dtype=np.float32)

        storage.enroll("user_001", "Alice", emb1)
        storage.enroll("user_001", "Alice", emb2)
        storage.enroll("user_001", "Alice", emb3)

        mean_emb = storage.get_mean_embedding("user_001")
        assert mean_emb is not None

        # Mean should be approximately [1/3, 1/3, 1/3]
        expected = np.array([1 / 3, 1 / 3, 1 / 3], dtype=np.float32)
        np.testing.assert_array_almost_equal(mean_emb, expected, decimal=5)

    def test_get_mean_embedding_nonexistent(self, storage):
        """get_mean_embedding should return None for nonexistent speaker."""
        mean_emb = storage.get_mean_embedding("nonexistent")
        assert mean_emb is None

    def test_persistence_save_and_load(self, temp_storage_path, mock_embedding):
        """Storage should persist data to file."""
        # Create storage and enroll
        storage1 = SpeakerStorage(temp_storage_path)
        storage1.enroll("user_001", "Alice", mock_embedding)
        storage1.enroll("user_002", "Bob", mock_embedding)

        # Create new storage instance from same file
        storage2 = SpeakerStorage(temp_storage_path)
        speakers = storage2.list_speakers()

        assert len(speakers) == 2
        ids = {s.id for s in speakers}
        assert "user_001" in ids
        assert "user_002" in ids

    def test_storage_file_format(self, temp_storage_path, mock_embedding):
        """Storage file should be valid JSON with expected structure."""
        storage = SpeakerStorage(temp_storage_path)
        storage.enroll("user_001", "Alice", mock_embedding)

        with open(temp_storage_path) as f:
            data = json.load(f)

        assert "speakers" in data
        assert "user_001" in data["speakers"]
        assert data["speakers"]["user_001"]["name"] == "Alice"
        assert "embeddings" in data["speakers"]["user_001"]
        assert "mean_embedding" in data["speakers"]["user_001"]
        assert "enrolled_at" in data["speakers"]["user_001"]

    def test_get_all_speakers_with_embeddings(self, storage, mock_embedding):
        """get_all_speakers_with_embeddings should return dict of id -> mean_embedding."""
        storage.enroll("user_001", "Alice", mock_embedding)
        storage.enroll("user_002", "Bob", mock_embedding)

        all_speakers = storage.get_all_speakers_with_embeddings()
        assert len(all_speakers) == 2
        assert "user_001" in all_speakers
        assert "user_002" in all_speakers
        assert isinstance(all_speakers["user_001"], np.ndarray)
