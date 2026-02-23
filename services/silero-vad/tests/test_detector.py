"""
Silero VAD Detector Tests

TDD: Write tests first, then implement.
"""

from unittest.mock import MagicMock

import numpy as np
import pytest
import torch

from vad_service.detector import SileroVADDetector, VADConfig, VADEvent, VADState


class TestVADConfig:
    """Test VAD configuration."""

    def test_default_config(self):
        """Default config should have sensible values."""
        config = VADConfig()

        assert config.threshold == 0.5
        assert config.min_speech_ms == 250
        assert config.min_silence_ms == 500
        assert config.speech_pad_ms == 300
        assert config.sample_rate == 16000

    def test_custom_config(self):
        """Custom config values should be respected."""
        config = VADConfig(
            threshold=0.7,
            min_speech_ms=300,
            min_silence_ms=600,
            speech_pad_ms=200,
            sample_rate=8000,
        )

        assert config.threshold == 0.7
        assert config.min_speech_ms == 300
        assert config.min_silence_ms == 600
        assert config.speech_pad_ms == 200
        assert config.sample_rate == 8000


class TestVADState:
    """Test VAD state enum."""

    def test_states_exist(self):
        """All required states should exist."""
        assert VADState.IDLE is not None
        assert VADState.SPEAKING is not None


class TestVADEvent:
    """Test VAD event dataclass."""

    def test_speech_start_event(self):
        """speech_start event should have correct type."""
        event = VADEvent(type="speech_start", timestamp=1.0)

        assert event.type == "speech_start"
        assert event.timestamp == 1.0
        assert event.confidence is None
        assert event.audio_buffer is None

    def test_speech_end_event_with_buffer(self):
        """speech_end event should include audio buffer."""
        audio = np.zeros(16000, dtype=np.float32)
        event = VADEvent(
            type="speech_end",
            timestamp=2.0,
            confidence=0.95,
            audio_buffer=audio,
        )

        assert event.type == "speech_end"
        assert event.timestamp == 2.0
        assert event.confidence == 0.95
        assert event.audio_buffer is not None
        assert len(event.audio_buffer) == 16000


class TestSileroVADDetector:
    """Test Silero VAD detector."""

    @pytest.fixture
    def detector(self):
        """Create a detector instance."""
        config = VADConfig(
            threshold=0.5,
            min_speech_ms=100,  # Lower for testing
            min_silence_ms=200,  # Lower for testing
        )
        return SileroVADDetector(config)

    @pytest.fixture
    def mock_detector(self):
        """Create a detector with mocked model."""
        config = VADConfig(
            threshold=0.5,
            min_speech_ms=100,  # Lower for testing
            min_silence_ms=200,  # Lower for testing
        )
        detector = SileroVADDetector(config)

        # Create mock model
        mock_model = MagicMock()
        mock_model.reset_states = MagicMock()
        detector._model = mock_model

        return detector, mock_model

    def test_initialization(self, detector):
        """Detector should initialize in IDLE state."""
        assert detector.state == VADState.IDLE
        assert detector.is_available()

    def test_get_config(self, detector):
        """Should return current config."""
        config = detector.get_config()

        assert config.threshold == 0.5
        assert config.min_speech_ms == 100
        assert config.min_silence_ms == 200

    def test_update_config(self, detector):
        """Should update config values."""
        detector.update_config(threshold=0.7, min_speech_ms=300)

        config = detector.get_config()
        assert config.threshold == 0.7
        assert config.min_speech_ms == 300
        # Unchanged values should remain
        assert config.min_silence_ms == 200

    def test_reset(self, detector):
        """Reset should clear state and buffers."""
        # Simulate some state
        detector._audio_buffer = np.zeros(1000, dtype=np.float32)
        detector._state = VADState.SPEAKING

        detector.reset()

        assert detector.state == VADState.IDLE
        assert len(detector._audio_buffer) == 0

    def test_process_silence_returns_none(self, detector):
        """Processing silence should return None."""
        # Create silent audio (zeros)
        silence = np.zeros(512, dtype=np.float32)

        event = detector.process_chunk(silence)

        assert event is None
        assert detector.state == VADState.IDLE

    def test_process_speech_triggers_start(self, mock_detector):
        """Processing speech should trigger speech_start after min duration."""
        detector, mock_model = mock_detector

        # Mock model to return high probability (speech detected)
        mock_model.return_value = torch.tensor(0.9)

        # Create audio chunks
        chunk_size = 512
        duration_samples = int(0.15 * 16000)  # 150ms > min_speech_ms (100ms)

        events = []
        for i in range(0, duration_samples, chunk_size):
            chunk = np.random.randn(chunk_size).astype(np.float32) * 0.1
            event = detector.process_chunk(chunk)
            if event:
                events.append(event)

        # Should have speech_start event
        start_events = [e for e in events if e.type == "speech_start"]
        assert len(start_events) >= 1
        assert detector.state == VADState.SPEAKING

    def test_speech_end_returns_buffer(self, mock_detector):
        """speech_end should return accumulated audio buffer."""
        detector, mock_model = mock_detector

        chunk_size = 512

        # First, trigger speech start (high probability)
        mock_model.return_value = torch.tensor(0.9)
        duration_samples = int(0.2 * 16000)  # 200ms

        for i in range(0, duration_samples, chunk_size):
            chunk = np.random.randn(chunk_size).astype(np.float32) * 0.1
            detector.process_chunk(chunk)

        assert detector.state == VADState.SPEAKING

        # Now send silence to trigger speech_end (low probability)
        mock_model.return_value = torch.tensor(0.1)
        silence_duration = int(0.3 * 16000)  # 300ms > min_silence_ms (200ms)

        events = []
        for i in range(0, silence_duration, chunk_size):
            chunk = np.zeros(chunk_size, dtype=np.float32)
            event = detector.process_chunk(chunk)
            if event:
                events.append(event)

        # Should have speech_end event with audio buffer
        end_events = [e for e in events if e.type == "speech_end"]
        assert len(end_events) >= 1

        end_event = end_events[0]
        assert end_event.audio_buffer is not None
        assert len(end_event.audio_buffer) > 0
        assert detector.state == VADState.IDLE

    def test_state_machine_full_cycle(self, mock_detector):
        """Test complete state machine cycle: IDLE -> SPEAKING -> IDLE."""
        detector, mock_model = mock_detector
        chunk_size = 512

        # Start in IDLE
        assert detector.state == VADState.IDLE

        # Send speech (high probability)
        mock_model.return_value = torch.tensor(0.9)
        speech_samples = int(0.2 * 16000)

        speech_start_seen = False
        for i in range(0, speech_samples, chunk_size):
            chunk = np.random.randn(chunk_size).astype(np.float32) * 0.1
            event = detector.process_chunk(chunk)
            if event and event.type == "speech_start":
                speech_start_seen = True

        assert speech_start_seen
        assert detector.state == VADState.SPEAKING

        # Send silence (low probability)
        mock_model.return_value = torch.tensor(0.1)
        silence_samples = int(0.3 * 16000)

        speech_end_seen = False
        audio_buffer = None
        for i in range(0, silence_samples, chunk_size):
            chunk = np.zeros(chunk_size, dtype=np.float32)
            event = detector.process_chunk(chunk)
            if event and event.type == "speech_end":
                speech_end_seen = True
                audio_buffer = event.audio_buffer

        assert speech_end_seen
        assert audio_buffer is not None
        assert detector.state == VADState.IDLE


class TestSileroVADDetectorEdgeCases:
    """Test edge cases and error handling."""

    @pytest.fixture
    def detector(self):
        """Create a detector instance."""
        return SileroVADDetector(VADConfig())

    def test_empty_chunk(self, detector):
        """Empty chunk should not crash."""
        event = detector.process_chunk(np.array([], dtype=np.float32))
        assert event is None

    def test_wrong_dtype_converted(self, detector):
        """Non-float32 input should be converted."""
        chunk = np.zeros(512, dtype=np.int16)
        # Should not raise
        event = detector.process_chunk(chunk)
        assert event is None

    def test_very_short_speech_ignored(self, detector):
        """Speech shorter than min_speech_ms should be ignored."""
        # Default min_speech_ms is 250ms, send only 50ms of "speech"
        short_speech = np.random.randn(int(0.05 * 16000)).astype(np.float32) * 0.5

        event = detector.process_chunk(short_speech)

        # Should not trigger speech_start
        assert event is None or event.type != "speech_start"

    def test_brief_silence_during_speech_ignored(self, detector):
        """Brief silence during speech should not trigger speech_end."""
        detector._state = VADState.SPEAKING
        detector._speech_start_time = 0.0
        detector._audio_buffer = np.zeros(int(0.5 * 16000), dtype=np.float32)

        # Send brief silence (less than min_silence_ms)
        brief_silence = np.zeros(int(0.1 * 16000), dtype=np.float32)

        event = detector.process_chunk(brief_silence)

        # Should still be speaking (brief silence ignored)
        # Note: actual behavior depends on implementation
        assert detector.state == VADState.SPEAKING or event is None

    def test_multiple_reset_safe(self, detector):
        """Multiple resets should be safe."""
        detector.reset()
        detector.reset()
        detector.reset()

        assert detector.state == VADState.IDLE
