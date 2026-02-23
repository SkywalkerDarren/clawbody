"""
Speaker Verifier using WeSpeaker.

Handles voice embedding extraction and similarity computation.
"""

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torchaudio
import torchaudio.compliance.kaldi as kaldi
import yaml
from silero_vad import get_speech_timestamps, load_silero_vad

logger = logging.getLogger(__name__)


@dataclass
class SVConfig:
    """Speaker verification configuration."""

    model: str = "voxblink2_samresnet100_ft"
    threshold: float = 0.6
    device: str = "cpu"
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
    """Speaker verification using WeSpeaker models."""

    def __init__(self, config: SVConfig):
        self._config = config
        self._model: torch.nn.Module | None = None
        self._vad = None
        self._resample_rate = 16000
        self._frontend_type = "fbank"

        self._load_model()

    def _get_model_dir(self, model_name: str) -> Path:
        """Get model directory, downloading if necessary."""
        # Check common locations
        cache_dir = Path.home() / ".cache" / "wespeaker"
        model_dir = cache_dir / model_name

        if model_dir.exists() and (model_dir / "avg_model.pt").exists():
            return model_dir

        # Model name to download URL mapping (for models not in Hub)
        model_urls = {
            "voxblink2_samresnet100_ft": "https://wenet.org.cn/downloads?models=wespeaker&version=voxblink2_samresnet100_ft.zip",
            "voxblink2_samresnet100": "https://wenet.org.cn/downloads?models=wespeaker&version=voxblink2_samresnet100.zip",
        }

        # Try to download using wespeaker hub first
        try:
            from wespeaker.cli.hub import Hub  # type: ignore[import-not-found]

            if model_name in Hub.Assets:
                return Path(Hub.get_model(model_name))
        except ImportError:
            pass

        # Try direct download for known models
        if model_name in model_urls:
            logger.info(f"Downloading model {model_name}...")
            self._download_model(model_urls[model_name], model_dir)
            if model_dir.exists() and (model_dir / "avg_model.pt").exists():
                return model_dir

        # Fallback: check if it's a direct path
        if Path(model_name).exists():
            return Path(model_name)

        raise FileNotFoundError(f"Model {model_name} not found. Please download it first.")

    def _download_model(self, url: str, target_dir: Path) -> None:
        """Download and extract model from URL."""
        import io
        import zipfile
        import tarfile
        import requests

        target_dir.mkdir(parents=True, exist_ok=True)

        try:
            logger.info(f"Downloading from {url}")
            response = requests.get(url, stream=True, timeout=300)
            response.raise_for_status()

            content = response.content

            # Try zip first
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zf:
                    zf.extractall(target_dir)
                    logger.info(f"Extracted zip to {target_dir}")
                    return
            except zipfile.BadZipFile:
                pass

            # Try tar.gz
            try:
                with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as tf:
                    tf.extractall(target_dir)
                    logger.info(f"Extracted tar.gz to {target_dir}")
                    return
            except tarfile.TarError:
                pass

            logger.error("Failed to extract model archive")
        except Exception as e:
            logger.error(f"Failed to download model: {e}")

    def _load_model(self) -> None:
        """Load WeSpeaker model."""
        try:
            model_dir = self._get_model_dir(self._config.model)

            config_path = model_dir / "config.yaml"
            model_path = model_dir / "avg_model.pt"

            if not config_path.exists() or not model_path.exists():
                logger.warning(f"Model files not found in {model_dir}")
                return

            # Load config
            with open(config_path) as f:
                model_config = yaml.safe_load(f)

            # Load model
            from wespeaker.models.speaker_model import get_speaker_model  # type: ignore[import-not-found]
            from wespeaker.utils.checkpoint import load_checkpoint  # type: ignore[import-not-found]

            self._model = get_speaker_model(model_config["model"])(**model_config["model_args"])

            # Check frontend type
            if "dataset_args" in model_config and "frontend" in model_config["dataset_args"]:
                self._frontend_type = model_config["dataset_args"]["frontend"]

            load_checkpoint(self._model, str(model_path))
            setattr(self._model, "frontend_type", self._frontend_type)
            self._model = self._model.to(torch.device(self._config.device))  # type: ignore[union-attr]
            self._model.eval()

            # Load VAD
            if self._config.apply_vad:
                self._vad = load_silero_vad()

            logger.info(f"Loaded WeSpeaker model: {self._config.model}")

        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self._model = None

    def is_available(self) -> bool:
        """Check if verifier is ready."""
        return self._model is not None

    def extract_embedding(self, audio: np.ndarray, sample_rate: int = 16000) -> np.ndarray | None:
        """
        Extract speaker embedding from audio.

        Args:
            audio: Audio samples as float32 numpy array
            sample_rate: Sample rate of audio

        Returns:
            Embedding vector or None if extraction failed
        """
        if self._model is None:
            return None

        try:
            # Convert to torch tensor
            pcm = torch.from_numpy(audio).float().unsqueeze(0)

            # Apply VAD if enabled
            if self._config.apply_vad and self._vad is not None:
                pcm = self._apply_vad(pcm, sample_rate)
                if pcm is None:
                    return None

            # Resample if needed
            if sample_rate != self._resample_rate:
                pcm = torchaudio.transforms.Resample(
                    orig_freq=sample_rate, new_freq=self._resample_rate
                )(pcm)

            # Compute features
            feats = self._compute_features(pcm)

            # Extract embedding
            with torch.no_grad():
                outputs = self._model(feats)
                outputs = outputs[-1] if isinstance(outputs, tuple) else outputs

            embedding = outputs[0].cpu().numpy()
            return embedding

        except Exception as e:
            logger.error(f"Embedding extraction failed: {e}")
            return None

    def _apply_vad(self, pcm: torch.Tensor, sample_rate: int) -> torch.Tensor | None:
        """Apply VAD to remove silence."""
        vad_sample_rate = 16000
        wav = pcm

        if wav.size(0) > 1:
            wav = wav.mean(dim=0, keepdim=True)

        if sample_rate != vad_sample_rate:
            transform = torchaudio.transforms.Resample(
                orig_freq=sample_rate, new_freq=vad_sample_rate
            )
            wav = transform(wav)

        segments = get_speech_timestamps(wav, self._vad, return_seconds=True)

        if len(segments) == 0:
            return None

        pcm_total = torch.Tensor()
        for segment in segments:
            start = int(segment["start"] * sample_rate)
            end = int(segment["end"] * sample_rate)
            pcm_temp = pcm[0, start:end]
            pcm_total = torch.cat([pcm_total, pcm_temp], 0)

        return pcm_total.unsqueeze(0)

    def _compute_features(self, pcm: torch.Tensor) -> torch.Tensor:
        """Compute acoustic features from audio."""
        feat = kaldi.fbank(
            pcm,
            num_mel_bins=80,
            frame_length=25,
            frame_shift=10,
            sample_frequency=self._resample_rate,
            window_type="hamming",
        )
        # Apply CMN
        feat = feat - torch.mean(feat, dim=0)
        feat = feat.unsqueeze(0)
        return feat

    def cosine_similarity(self, e1: np.ndarray, e2: np.ndarray) -> float:
        """
        Compute cosine similarity between two embeddings.

        Returns normalized score in [0, 1] range.
        """
        e1_t = torch.from_numpy(e1)
        e2_t = torch.from_numpy(e2)

        cosine_score = torch.dot(e1_t, e2_t) / (torch.norm(e1_t) * torch.norm(e2_t))
        cosine_score = cosine_score.item()

        # Normalize from [-1, 1] to [0, 1]
        return (cosine_score + 1.0) / 2

    def get_config(self) -> SVConfig:
        """Get current configuration."""
        return self._config

    def update_config(self, **kwargs) -> None:
        """Update configuration parameters."""
        if "threshold" in kwargs:
            self._config.threshold = kwargs["threshold"]
        if "apply_vad" in kwargs:
            self._config.apply_vad = kwargs["apply_vad"]
            if self._config.apply_vad and self._vad is None:
                self._vad = load_silero_vad()
