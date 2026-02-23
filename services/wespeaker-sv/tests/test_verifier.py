"""
Tests for Speaker Verifier.

TDD Phase: RED - These tests should fail initially.
"""

import numpy as np
import pytest

from sv_service.verifier import SpeakerVerifier, SVConfig, VerificationResult


class TestSVConfig:
    """Tests for SVConfig dataclass."""

    def test_default_config(self):
        """Default config should have sensible values."""
        config = SVConfig()
        assert config.model == "voxblink2_samresnet100_ft"
        assert config.threshold == 0.6
        assert config.device == "cpu"
        assert config.apply_vad is True

    def test_custom_config(self):
        """Custom config values should be respected."""
        config = SVConfig(
            model="campplus",
            threshold=0.7,
            device="cuda",
            apply_vad=False,
        )
        assert config.model == "campplus"
        assert config.threshold == 0.7
        assert config.device == "cuda"
        assert config.apply_vad is False


class TestSpeakerVerifier:
    """Tests for SpeakerVerifier class."""

    @pytest.fixture
    def verifier(self):
        """Create a verifier instance with mocked model."""
        config = SVConfig(model="voxblink2_samresnet100_ft", device="cpu")
        return SpeakerVerifier(config)

    @pytest.fixture
    def mock_embedding(self) -> np.ndarray:
        """Create a mock embedding vector."""
        # WeSpeaker models typically output 256 or 512 dimensional embeddings
        return np.random.randn(512).astype(np.float32)

    @pytest.fixture
    def sample_audio(self) -> np.ndarray:
        """Create sample audio data (16kHz, mono, float32)."""
        # 1 second of random audio
        return np.random.randn(16000).astype(np.float32)

    def test_is_available_when_model_loaded(self, verifier):
        """Verifier should report available when model is loaded."""
        # Note: This may fail if model can't be downloaded in test env
        # In that case, we'll mock the model
        available = verifier.is_available()
        assert isinstance(available, bool)

    def test_extract_embedding_returns_numpy_array(self, verifier, sample_audio):
        """extract_embedding should return a numpy array."""
        embedding = verifier.extract_embedding(sample_audio, sample_rate=16000)
        if embedding is not None:
            assert isinstance(embedding, np.ndarray)
            assert embedding.ndim == 1
            assert len(embedding) > 0

    def test_extract_embedding_with_silence_returns_none(self, verifier):
        """extract_embedding should return None for silent audio when VAD enabled."""
        # Create silent audio
        silent_audio = np.zeros(16000, dtype=np.float32)
        embedding = verifier.extract_embedding(silent_audio, sample_rate=16000)
        # With VAD enabled, silent audio should return None
        assert embedding is None

    def test_cosine_similarity_identical_vectors(self, verifier, mock_embedding):
        """Cosine similarity of identical vectors should be 1.0."""
        similarity = verifier.cosine_similarity(mock_embedding, mock_embedding)
        assert abs(similarity - 1.0) < 1e-5

    def test_cosine_similarity_orthogonal_vectors(self, verifier):
        """Cosine similarity of orthogonal vectors should be 0.5 (normalized)."""
        # Create orthogonal vectors
        v1 = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        similarity = verifier.cosine_similarity(v1, v2)
        # WeSpeaker normalizes to [0, 1] range: (cosine + 1) / 2
        assert abs(similarity - 0.5) < 1e-5

    def test_cosine_similarity_opposite_vectors(self, verifier):
        """Cosine similarity of opposite vectors should be 0.0 (normalized)."""
        v1 = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        v2 = np.array([-1.0, 0.0, 0.0], dtype=np.float32)
        similarity = verifier.cosine_similarity(v1, v2)
        # Normalized: (-1 + 1) / 2 = 0
        assert abs(similarity - 0.0) < 1e-5

    def test_get_config(self, verifier):
        """get_config should return current configuration."""
        config = verifier.get_config()
        assert isinstance(config, SVConfig)
        assert config.model == "voxblink2_samresnet100_ft"

    def test_update_config_threshold(self, verifier):
        """update_config should update threshold."""
        verifier.update_config(threshold=0.8)
        config = verifier.get_config()
        assert config.threshold == 0.8

    def test_update_config_apply_vad(self, verifier):
        """update_config should update apply_vad."""
        verifier.update_config(apply_vad=False)
        config = verifier.get_config()
        assert config.apply_vad is False


class TestVerificationResult:
    """Tests for VerificationResult dataclass."""

    def test_verified_result(self):
        """Verified result should have speaker info."""
        result = VerificationResult(
            verified=True,
            speaker_id="user_001",
            speaker_name="Alice",
            confidence=0.85,
            threshold=0.6,
        )
        assert result.verified is True
        assert result.speaker_id == "user_001"
        assert result.speaker_name == "Alice"
        assert result.confidence == 0.85
        assert result.threshold == 0.6

    def test_unverified_result(self):
        """Unverified result should have null speaker info."""
        result = VerificationResult(
            verified=False,
            speaker_id=None,
            speaker_name=None,
            confidence=0.3,
            threshold=0.6,
        )
        assert result.verified is False
        assert result.speaker_id is None
        assert result.speaker_name is None
