"""
Silero VAD Detector

Voice Activity Detection using Silero VAD model.
"""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Literal

import numpy as np
import torch

logger = logging.getLogger(__name__)


class VADState(Enum):
    """VAD state machine states."""

    IDLE = "idle"
    SPEAKING = "speaking"


@dataclass
class VADConfig:
    """VAD configuration."""

    threshold: float = 0.5
    min_speech_ms: int = 250
    min_silence_ms: int = 500
    speech_pad_ms: int = 300
    sample_rate: int = 16000


@dataclass
class VADEvent:
    """VAD event."""

    type: Literal["speech_start", "speech_end"]
    timestamp: float
    confidence: float | None = None
    audio_buffer: np.ndarray | None = None


class SileroVADDetector:
    """Silero VAD detector with state machine."""

    # Silero VAD requires exactly 512 samples at 16kHz (32ms)
    WINDOW_SIZE = 512

    def __init__(self, config: VADConfig | None = None):
        self._config = config or VADConfig()
        self._state = VADState.IDLE
        self._model = None
        self._audio_buffer: np.ndarray = np.array([], dtype=np.float32)
        self._pending_audio: np.ndarray = np.array([], dtype=np.float32)  # Buffer for incomplete windows
        self._speech_start_time: float = 0.0
        self._silence_start_time: float | None = None
        self._current_time: float = 0.0
        self._speech_frames: int = 0
        self._silence_frames: int = 0

        self._load_model()

    def _load_model(self) -> None:
        """Load Silero VAD model from torch.hub."""
        try:
            result = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                trust_repo=True,
            )
            self._model = result[0]  # type: ignore[index]
            self._model.eval()
            logger.info("Silero VAD model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Silero VAD model: {e}")
            self._model = None

    def is_available(self) -> bool:
        """Check if VAD model is available."""
        return self._model is not None

    @property
    def state(self) -> VADState:
        """Get current state."""
        return self._state

    def get_config(self) -> VADConfig:
        """Get current configuration."""
        return VADConfig(
            threshold=self._config.threshold,
            min_speech_ms=self._config.min_speech_ms,
            min_silence_ms=self._config.min_silence_ms,
            speech_pad_ms=self._config.speech_pad_ms,
            sample_rate=self._config.sample_rate,
        )

    def update_config(self, **kwargs) -> None:
        """Update configuration values."""
        if "threshold" in kwargs:
            self._config.threshold = kwargs["threshold"]
        if "min_speech_ms" in kwargs:
            self._config.min_speech_ms = kwargs["min_speech_ms"]
        if "min_silence_ms" in kwargs:
            self._config.min_silence_ms = kwargs["min_silence_ms"]
        if "speech_pad_ms" in kwargs:
            self._config.speech_pad_ms = kwargs["speech_pad_ms"]
        if "sample_rate" in kwargs:
            self._config.sample_rate = kwargs["sample_rate"]

    def reset(self) -> None:
        """Reset detector state."""
        self._state = VADState.IDLE
        self._audio_buffer = np.array([], dtype=np.float32)
        self._pending_audio = np.array([], dtype=np.float32)
        self._speech_start_time = 0.0
        self._silence_start_time = None
        self._current_time = 0.0
        self._speech_frames = 0
        self._silence_frames = 0

        # Reset model state
        if self._model is not None:
            self._model.reset_states()

    def process_chunk(self, audio: np.ndarray) -> VADEvent | None:
        """
        Process audio chunk and return VAD event if state changes.

        Args:
            audio: Audio chunk as float32 numpy array (16kHz mono)

        Returns:
            VADEvent if speech_start or speech_end detected, None otherwise
        """
        if len(audio) == 0:
            return None

        if self._model is None:
            return None

        # Convert to float32 if needed
        if audio.dtype != np.float32:
            audio = audio.astype(np.float32)
            # Normalize int16 range to float32
            if audio.max() > 1.0 or audio.min() < -1.0:
                audio = audio / 32768.0

        # Add to pending buffer
        self._pending_audio = np.concatenate([self._pending_audio, audio])

        # Process complete windows (512 samples each)
        event = None
        while len(self._pending_audio) >= self.WINDOW_SIZE:
            window = self._pending_audio[: self.WINDOW_SIZE]
            self._pending_audio = self._pending_audio[self.WINDOW_SIZE :]

            result = self._process_window(window)
            if result is not None:
                event = result  # Keep the last event

        return event

    def _process_window(self, audio: np.ndarray) -> VADEvent | None:
        """Process a single 512-sample window."""
        # Calculate chunk duration
        chunk_duration = len(audio) / self._config.sample_rate
        self._current_time += chunk_duration

        # Run VAD inference
        try:
            audio_tensor = torch.from_numpy(audio)
            speech_prob = self._model(audio_tensor, self._config.sample_rate).item()
        except Exception as e:
            logger.error(f"VAD inference failed: {e}")
            return None

        is_speech = speech_prob >= self._config.threshold

        # State machine logic
        if self._state == VADState.IDLE:
            if is_speech:
                self._speech_frames += 1
                speech_duration_ms = (
                    self._speech_frames * len(audio) / self._config.sample_rate
                ) * 1000

                # Accumulate audio for potential speech
                self._audio_buffer = np.concatenate([self._audio_buffer, audio])

                if speech_duration_ms >= self._config.min_speech_ms:
                    # Transition to SPEAKING
                    self._state = VADState.SPEAKING
                    self._speech_start_time = self._current_time - (speech_duration_ms / 1000)
                    self._silence_frames = 0

                    return VADEvent(
                        type="speech_start",
                        timestamp=self._speech_start_time,
                        confidence=speech_prob,
                    )
            else:
                # Reset speech frame counter on silence
                self._speech_frames = 0
                self._audio_buffer = np.array([], dtype=np.float32)

        elif self._state == VADState.SPEAKING:
            # Always accumulate audio while speaking
            self._audio_buffer = np.concatenate([self._audio_buffer, audio])

            if is_speech:
                # Reset silence counter
                self._silence_frames = 0
                self._silence_start_time = None
            else:
                self._silence_frames += 1
                if self._silence_start_time is None:
                    self._silence_start_time = self._current_time

                silence_duration_ms = (
                    self._silence_frames * len(audio) / self._config.sample_rate
                ) * 1000

                if silence_duration_ms >= self._config.min_silence_ms:
                    # Transition to IDLE
                    self._state = VADState.IDLE

                    # Return speech_end with audio buffer
                    event = VADEvent(
                        type="speech_end",
                        timestamp=self._current_time,
                        confidence=speech_prob,
                        audio_buffer=self._audio_buffer.copy(),
                    )

                    # Reset buffers
                    self._audio_buffer = np.array([], dtype=np.float32)
                    self._speech_frames = 0
                    self._silence_frames = 0
                    self._silence_start_time = None

                    return event

        return None
