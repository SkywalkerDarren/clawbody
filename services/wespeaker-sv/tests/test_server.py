"""
Tests for Speaker Verification FastAPI Server.

TDD Phase: RED - These tests should fail initially.
"""

import base64
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from fastapi.testclient import TestClient


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client with mocked verifier."""
        with patch("sv_service.server.SpeakerVerifier") as mock_verifier_cls:
            mock_verifier = MagicMock()
            mock_verifier.is_available.return_value = True
            mock_verifier.get_config.return_value = MagicMock(
                model="voxblink2_samresnet100_ft",
                threshold=0.6,
                device="cpu",
                apply_vad=True,
            )
            mock_verifier_cls.return_value = mock_verifier

            with patch("sv_service.server.SpeakerStorage"):
                from sv_service.server import app

                with TestClient(app) as client:
                    yield client

    def test_health_returns_ready(self, client):
        """Health endpoint should return ready status."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert "model" in data


class TestEnrollEndpoint:
    """Tests for /enroll endpoint."""

    @pytest.fixture
    def mock_embedding(self) -> np.ndarray:
        """Create a mock embedding."""
        return np.random.randn(512).astype(np.float32)

    @pytest.fixture
    def sample_audio_base64(self) -> str:
        """Create sample audio as base64."""
        audio = np.random.randn(16000).astype(np.float32)
        audio_int16 = (audio * 32768).astype(np.int16)
        return base64.b64encode(audio_int16.tobytes()).decode()

    @pytest.fixture
    def client(self, mock_embedding):
        """Create test client with mocked dependencies."""
        with patch("sv_service.server.SpeakerVerifier") as mock_verifier_cls:
            mock_verifier = MagicMock()
            mock_verifier.is_available.return_value = True
            mock_verifier.extract_embedding.return_value = mock_embedding
            mock_verifier.get_config.return_value = MagicMock(
                model="voxblink2_samresnet100_ft",
                threshold=0.6,
                device="cpu",
                apply_vad=True,
            )
            mock_verifier_cls.return_value = mock_verifier

            with patch("sv_service.server.SpeakerStorage") as mock_storage_cls:
                mock_storage = MagicMock()
                mock_storage.enroll.return_value = MagicMock(
                    success=True,
                    speaker_id="user_001",
                    speaker_name="Alice",
                    embedding_count=1,
                    message="Enrolled successfully",
                )
                mock_storage_cls.return_value = mock_storage

                from sv_service.server import app

                with TestClient(app) as client:
                    yield client

    def test_enroll_success(self, client, sample_audio_base64):
        """Enroll endpoint should return success."""
        response = client.post(
            "/enroll",
            json={
                "speaker_id": "user_001",
                "speaker_name": "Alice",
                "audio": sample_audio_base64,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["speaker_id"] == "user_001"
        assert data["speaker_name"] == "Alice"
        assert data["embedding_count"] == 1

    def test_enroll_missing_speaker_id(self, client, sample_audio_base64):
        """Enroll should fail without speaker_id."""
        response = client.post(
            "/enroll",
            json={
                "speaker_name": "Alice",
                "audio": sample_audio_base64,
            },
        )
        assert response.status_code == 422  # Validation error


class TestVerifyEndpoint:
    """Tests for /verify endpoint."""

    @pytest.fixture
    def mock_embedding(self) -> np.ndarray:
        """Create a mock embedding."""
        return np.random.randn(512).astype(np.float32)

    @pytest.fixture
    def sample_audio_base64(self) -> str:
        """Create sample audio as base64."""
        audio = np.random.randn(16000).astype(np.float32)
        audio_int16 = (audio * 32768).astype(np.int16)
        return base64.b64encode(audio_int16.tobytes()).decode()

    @pytest.fixture
    def client_verified(self, mock_embedding):
        """Create test client that returns verified result."""
        with patch("sv_service.server.SpeakerVerifier") as mock_verifier_cls:
            mock_verifier = MagicMock()
            mock_verifier.is_available.return_value = True
            mock_verifier.extract_embedding.return_value = mock_embedding
            mock_verifier.cosine_similarity.return_value = 0.85
            mock_verifier.get_config.return_value = MagicMock(
                model="voxblink2_samresnet100_ft",
                threshold=0.6,
                device="cpu",
                apply_vad=True,
            )
            mock_verifier_cls.return_value = mock_verifier

            with patch("sv_service.server.SpeakerStorage") as mock_storage_cls:
                from datetime import datetime, timezone

                from sv_service.storage import Speaker

                mock_storage = MagicMock()
                mock_storage.get_all_speakers_with_embeddings.return_value = {
                    "user_001": mock_embedding,
                }
                mock_storage.get_speaker.return_value = Speaker(
                    id="user_001",
                    name="Alice",
                    enrolled_at=datetime.now(timezone.utc),
                    embedding_count=1,
                )
                mock_storage_cls.return_value = mock_storage

                from sv_service.server import app

                with TestClient(app) as client:
                    yield client

    def test_verify_success(self, client_verified, sample_audio_base64):
        """Verify endpoint should return verified result."""
        response = client_verified.post(
            "/verify",
            json={"audio": sample_audio_base64},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verified"] is True
        assert data["speaker_id"] == "user_001"
        assert data["speaker_name"] == "Alice"
        assert data["confidence"] == 0.85
        assert data["threshold"] == 0.6

    @pytest.fixture
    def client_unverified(self, mock_embedding):
        """Create test client that returns unverified result."""
        with patch("sv_service.server.SpeakerVerifier") as mock_verifier_cls:
            mock_verifier = MagicMock()
            mock_verifier.is_available.return_value = True
            mock_verifier.extract_embedding.return_value = mock_embedding
            mock_verifier.cosine_similarity.return_value = 0.3  # Below threshold
            mock_verifier.get_config.return_value = MagicMock(
                model="voxblink2_samresnet100_ft",
                threshold=0.6,
                device="cpu",
                apply_vad=True,
            )
            mock_verifier_cls.return_value = mock_verifier

            with patch("sv_service.server.SpeakerStorage") as mock_storage_cls:
                mock_storage = MagicMock()
                mock_storage.get_all_speakers_with_embeddings.return_value = {
                    "user_001": mock_embedding,
                }
                mock_storage_cls.return_value = mock_storage

                from sv_service.server import app

                with TestClient(app) as client:
                    yield client

    def test_verify_below_threshold(self, client_unverified, sample_audio_base64):
        """Verify should return unverified when below threshold."""
        response = client_unverified.post(
            "/verify",
            json={"audio": sample_audio_base64},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verified"] is False
        assert data["speaker_id"] is None


class TestSpeakersEndpoint:
    """Tests for /speakers endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client with mocked storage."""
        with patch("sv_service.server.SpeakerVerifier") as mock_verifier_cls:
            mock_verifier = MagicMock()
            mock_verifier.is_available.return_value = True
            mock_verifier.get_config.return_value = MagicMock(
                model="voxblink2_samresnet100_ft",
                threshold=0.6,
                device="cpu",
                apply_vad=True,
            )
            mock_verifier_cls.return_value = mock_verifier

            with patch("sv_service.server.SpeakerStorage") as mock_storage_cls:
                from datetime import datetime, timezone

                from sv_service.storage import Speaker

                mock_storage = MagicMock()
                mock_storage.list_speakers.return_value = [
                    Speaker(
                        id="user_001",
                        name="Alice",
                        enrolled_at=datetime.now(timezone.utc),
                        embedding_count=3,
                    ),
                    Speaker(
                        id="user_002",
                        name="Bob",
                        enrolled_at=datetime.now(timezone.utc),
                        embedding_count=1,
                    ),
                ]
                mock_storage.delete_speaker.return_value = True
                mock_storage_cls.return_value = mock_storage

                from sv_service.server import app

                with TestClient(app) as client:
                    yield client

    def test_list_speakers(self, client):
        """List speakers should return all enrolled speakers."""
        response = client.get("/speakers")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["id"] == "user_001"
        assert data[1]["id"] == "user_002"

    def test_delete_speaker(self, client):
        """Delete speaker should return success."""
        response = client.delete("/speakers/user_001")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


class TestConfigEndpoint:
    """Tests for /config endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        with patch("sv_service.server.SpeakerVerifier") as mock_verifier_cls:
            mock_verifier = MagicMock()
            mock_verifier.is_available.return_value = True
            mock_verifier.get_config.return_value = MagicMock(
                model="voxblink2_samresnet100_ft",
                threshold=0.6,
                device="cpu",
                apply_vad=True,
            )
            mock_verifier_cls.return_value = mock_verifier

            with patch("sv_service.server.SpeakerStorage"):
                from sv_service.server import app

                with TestClient(app) as client:
                    yield client

    def test_get_config(self, client):
        """Get config should return current configuration."""
        response = client.get("/config")
        assert response.status_code == 200
        data = response.json()
        assert data["model"] == "voxblink2_samresnet100_ft"
        assert data["threshold"] == 0.6
        assert data["device"] == "cpu"
        assert data["apply_vad"] is True

    def test_update_config(self, client):
        """Update config should modify configuration."""
        response = client.post(
            "/config",
            json={"threshold": 0.8},
        )
        assert response.status_code == 200
