"""
Silero VAD Server Tests

Integration tests for the FastAPI server.
"""

import base64
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from fastapi.testclient import TestClient

from vad_service.detector import VADConfig, VADEvent, VADState


@pytest.fixture
def mock_detector():
    """Create a mock detector."""
    detector = MagicMock()
    detector.is_available.return_value = True
    detector.state = VADState.IDLE
    detector.get_config.return_value = VADConfig()
    detector.process_chunk.return_value = None
    return detector


@pytest.fixture
def client(mock_detector):
    """Create test client with mocked detector."""
    with patch("vad_service.server.SileroVADDetector") as MockDetector:
        MockDetector.return_value = mock_detector

        from vad_service.server import app

        with TestClient(app) as client:
            # Inject mock detector
            import vad_service.server as server_module

            server_module.detector = mock_detector
            yield client


class TestHealthEndpoint:
    """Test /health endpoint."""

    def test_health_ready(self, client, mock_detector):
        """Health check returns ready when detector available."""
        mock_detector.is_available.return_value = True

        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["model"] == "silero-vad"

    def test_health_unavailable(self, client, mock_detector):
        """Health check returns unavailable when detector not available."""
        mock_detector.is_available.return_value = False

        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "unavailable"


class TestProcessEndpoint:
    """Test /process endpoint."""

    def test_process_silence(self, client, mock_detector):
        """Process silent audio returns no event."""
        mock_detector.process_chunk.return_value = None
        mock_detector.state = VADState.IDLE

        # Create silent audio
        audio = np.zeros(512, dtype=np.int16)
        audio_b64 = base64.b64encode(audio.tobytes()).decode()

        response = client.post("/process", json={"audio": audio_b64})

        assert response.status_code == 200
        data = response.json()
        assert data["is_speech"] is False
        assert data["event"] is None
        assert data["audio_buffer"] is None

    def test_process_speech_start(self, client, mock_detector):
        """Process speech triggers speech_start event."""
        mock_detector.process_chunk.return_value = VADEvent(
            type="speech_start",
            timestamp=0.5,
            confidence=0.9,
        )
        mock_detector.state = VADState.SPEAKING

        audio = np.random.randint(-1000, 1000, 512, dtype=np.int16)
        audio_b64 = base64.b64encode(audio.tobytes()).decode()

        response = client.post("/process", json={"audio": audio_b64})

        assert response.status_code == 200
        data = response.json()
        assert data["is_speech"] is True
        assert data["event"] == "speech_start"
        assert data["confidence"] == 0.9

    def test_process_speech_end_with_buffer(self, client, mock_detector):
        """Process silence after speech returns speech_end with buffer."""
        audio_buffer = np.random.randn(16000).astype(np.float32)
        mock_detector.process_chunk.return_value = VADEvent(
            type="speech_end",
            timestamp=1.5,
            confidence=0.1,
            audio_buffer=audio_buffer,
        )
        mock_detector.state = VADState.IDLE

        audio = np.zeros(512, dtype=np.int16)
        audio_b64 = base64.b64encode(audio.tobytes()).decode()

        response = client.post("/process", json={"audio": audio_b64})

        assert response.status_code == 200
        data = response.json()
        assert data["event"] == "speech_end"
        assert data["audio_buffer"] is not None

        # Verify audio buffer can be decoded
        decoded = base64.b64decode(data["audio_buffer"])
        decoded_audio = np.frombuffer(decoded, dtype=np.int16)
        assert len(decoded_audio) == len(audio_buffer)

    def test_process_with_reset(self, client, mock_detector):
        """Process with reset flag calls detector.reset()."""
        mock_detector.process_chunk.return_value = None
        mock_detector.state = VADState.IDLE

        audio = np.zeros(512, dtype=np.int16)
        audio_b64 = base64.b64encode(audio.tobytes()).decode()

        response = client.post("/process", json={"audio": audio_b64, "reset": True})

        assert response.status_code == 200
        mock_detector.reset.assert_called_once()

    def test_process_detector_unavailable(self, client, mock_detector):
        """Process returns 503 when detector unavailable."""
        mock_detector.is_available.return_value = False

        audio = np.zeros(512, dtype=np.int16)
        audio_b64 = base64.b64encode(audio.tobytes()).decode()

        response = client.post("/process", json={"audio": audio_b64})

        assert response.status_code == 503


class TestConfigEndpoint:
    """Test /config endpoints."""

    def test_get_config(self, client, mock_detector):
        """Get config returns current configuration."""
        mock_detector.get_config.return_value = VADConfig(
            threshold=0.6,
            min_speech_ms=300,
            min_silence_ms=600,
            speech_pad_ms=200,
            sample_rate=16000,
        )

        response = client.get("/config")

        assert response.status_code == 200
        data = response.json()
        assert data["threshold"] == 0.6
        assert data["min_speech_ms"] == 300
        assert data["min_silence_ms"] == 600
        assert data["speech_pad_ms"] == 200
        assert data["sample_rate"] == 16000

    def test_update_config(self, client, mock_detector):
        """Update config modifies configuration."""
        mock_detector.get_config.return_value = VADConfig(
            threshold=0.7,
            min_speech_ms=300,
            min_silence_ms=500,
            speech_pad_ms=300,
            sample_rate=16000,
        )

        response = client.post("/config", json={"threshold": 0.7, "min_speech_ms": 300})

        assert response.status_code == 200
        mock_detector.update_config.assert_called_once()
        data = response.json()
        assert data["threshold"] == 0.7


class TestResetEndpoint:
    """Test /reset endpoint."""

    def test_reset(self, client, mock_detector):
        """Reset endpoint calls detector.reset()."""
        response = client.post("/reset")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_detector.reset.assert_called_once()
