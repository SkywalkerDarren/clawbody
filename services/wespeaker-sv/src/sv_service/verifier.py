"""
Speaker Verifier using WeSpeaker ONNX models.

Handles voice embedding extraction and similarity computation.
"""

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import onnxruntime as ort
import requests
import torch
import torchaudio.compliance.kaldi as kaldi
from silero_vad import get_speech_timestamps, load_silero_vad

logger = logging.getLogger(__name__)

# ModelScope API for model list
MODELSCOPE_API = "https://modelscope.cn/api/v1/datasets/wenet/wespeaker_pretrained_models/oss/tree"


@dataclass
class SVConfig:
    """Speaker verification configuration."""

    model: str = "voxblink2_samresnet100_ft"
    threshold: float = 0.6
    device: str = "cuda"
    apply_vad: bool = True


@dataclass
class VerificationResult:
    """Result of speaker verification."""

    verified: bool
    speaker_id: str | None
    speaker_name: str | None
    confidence: float
    threshold: float


class SpeakerVerifier:
    """Speaker verification using WeSpeaker ONNX models."""

    def __init__(self, config: SVConfig):
        self._config = config
        self._session: ort.InferenceSession | None = None
        self._vad = None
        self._resample_rate = 16000

        self._load_model()

    def _get_model_url(self, model_name: str) -> str | None:
        """Get model download URL from ModelScope API."""
        try:
            response = requests.get(MODELSCOPE_API, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Find the .onnx file for this model
            onnx_filename = f"{model_name}.onnx"
            for item in data.get("Data", []):
                if item.get("Key") == onnx_filename:
                    return item.get("Url")

            logger.error(f"Model {onnx_filename} not found in ModelScope")
            return None
        except Exception as e:
            logger.error(f"Failed to fetch model list: {e}")
            return None

    def _get_model_path(self, model_name: str) -> Path:
        """Get model path, downloading if necessary."""
        cache_dir = Path.home() / ".cache" / "wespeaker"
        cache_dir.mkdir(parents=True, exist_ok=True)
        model_path = cache_dir / f"{model_name}.onnx"

        if model_path.exists():
            return model_path

        # Get download URL from ModelScope
        url = self._get_model_url(model_name)
        if not url:
            raise FileNotFoundError(
                f"Model {model_name} not found. Check available models at:\n"
                f"  {MODELSCOPE_API}"
            )

        logger.info(f"Downloading model {model_name}...")

        try:
            response = requests.get(url, timeout=600, stream=True)
            response.raise_for_status()

            # Write to file
            total_size = int(response.headers.get("content-length", 0))
            downloaded = 0

            with open(model_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        pct = downloaded * 100 // total_size
                        print(f"\rDownloading {model_name}: {pct}%", end="", flush=True)

            print()  # newline after progress
            logger.info(f"Downloaded model to {model_path}")
            return model_path

        except Exception as e:
            # Clean up partial download
            if model_path.exists():
                model_path.unlink()
            logger.error(f"Failed to download model: {e}")
            raise FileNotFoundError(f"Failed to download model {model_name}: {e}")

    def _load_model(self) -> None:
        """Load ONNX model."""
        try:
            model_path = self._get_model_path(self._config.model)

            # Setup ONNX Runtime
            providers = ["CPUExecutionProvider"]
            if self._config.device.startswith("cuda"):
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

            so = ort.SessionOptions()
            so.inter_op_num_threads = 4
            so.intra_op_num_threads = 4

            self._session = ort.InferenceSession(
                str(model_path), sess_options=so, providers=providers
            )

            # Check which provider is actually used
            actual_provider = self._session.get_providers()[0]
            logger.info(f"Loaded ONNX model: {self._config.model} (provider: {actual_provider})")

            # Load VAD
            if self._config.apply_vad:
                self._vad = load_silero_vad()
                logger.info("Loaded Silero VAD")

        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self._session = None

    def is_available(self) -> bool:
        """Check if model is loaded."""
        return self._session is not None

    def _compute_fbank(
        self,
        waveform: torch.Tensor,
        sample_rate: int,
        num_mel_bins: int = 80,
        frame_length: int = 25,
        frame_shift: int = 10,
    ) -> torch.Tensor:
        """Extract fbank features."""
        waveform = waveform * (1 << 15)
        mat = kaldi.fbank(
            waveform,
            num_mel_bins=num_mel_bins,
            frame_length=frame_length,
            frame_shift=frame_shift,
            dither=0.0,
            sample_frequency=sample_rate,
            window_type="hamming",
            use_energy=False,
        )
        # CMN (Cepstral Mean Normalization)
        mat = mat - torch.mean(mat, dim=0)
        return mat

    def _apply_vad(self, waveform: np.ndarray, sample_rate: int) -> np.ndarray | None:
        """Apply VAD to remove silence."""
        if self._vad is None:
            return waveform

        wav_tensor = torch.from_numpy(waveform)
        if wav_tensor.dim() == 1:
            wav_tensor = wav_tensor.unsqueeze(0)

        timestamps = get_speech_timestamps(wav_tensor, self._vad, sampling_rate=sample_rate)

        if not timestamps:
            return None

        # Concatenate speech segments
        speech_chunks = []
        for ts in timestamps:
            speech_chunks.append(waveform[ts["start"] : ts["end"]])

        return np.concatenate(speech_chunks) if speech_chunks else None

    def extract_embedding(self, audio: bytes | np.ndarray) -> np.ndarray | None:
        """Extract speaker embedding from audio.

        Args:
            audio: PCM audio bytes (16-bit, 16kHz, mono) or numpy array

        Returns:
            Embedding vector or None if extraction failed
        """
        if self._session is None:
            logger.error("Model not loaded")
            return None

        try:
            # Convert bytes to numpy array
            if isinstance(audio, bytes):
                audio_np = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0
            else:
                audio_np = audio.astype(np.float32)

            # Apply VAD
            if self._config.apply_vad:
                audio_np = self._apply_vad(audio_np, self._resample_rate)
                if audio_np is None or len(audio_np) < self._resample_rate * 0.3:
                    logger.warning("Audio too short after VAD")
                    return None

            # Convert to tensor
            waveform = torch.from_numpy(audio_np).unsqueeze(0)

            # Extract fbank features
            feats = self._compute_fbank(waveform, self._resample_rate)
            feats = feats.unsqueeze(0).numpy()  # Add batch dimension

            # Run inference
            embeddings = self._session.run(
                output_names=["embs"], input_feed={"feats": feats}
            )

            return embeddings[0].squeeze()

        except Exception as e:
            logger.error(f"Embedding extraction failed: {e}")
            return None

    @staticmethod
    def cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Compute cosine similarity between two embeddings."""
        emb1 = emb1.flatten()
        emb2 = emb2.flatten()
        return float(np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2)))

    def get_config(self) -> SVConfig:
        """Get current configuration."""
        return self._config

    def update_config(self, **kwargs) -> None:
        """Update configuration."""
        if "threshold" in kwargs:
            self._config.threshold = kwargs["threshold"]
        if "apply_vad" in kwargs:
            self._config.apply_vad = kwargs["apply_vad"]
            if self._config.apply_vad and self._vad is None:
                self._vad = load_silero_vad()
