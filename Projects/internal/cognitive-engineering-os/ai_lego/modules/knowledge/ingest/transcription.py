"""Transcriber adapters for the ``Transcriber`` port.

* ``FixtureTranscriber`` -- returns the fixture's declared speech text as the
  transcript. Deterministic, dependency-free; labelled
  ``SYNTHETIC_FIXTURE_TRANSCRIPT`` so no evidence can mistake it for
  recognition.
* ``OfflineFasterWhisperTranscriber`` -- real speech-to-text with a locally
  cached faster-whisper model (CPU, int8). It never downloads a model: if the
  cache is absent it raises ``AdapterUnavailable`` so the caller skips
  VISIBLY instead of silently degrading to the fixture.

Speaker labels from either adapter are alternating placeholders, not
diarization, and say so in every segment.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from ai_lego.errors import AdapterUnavailable, InvariantViolation

DIARIZATION_PLACEHOLDER = "NAIVE_ALTERNATING_SPEAKERS_PLACEHOLDER"
WHISPER_MODEL_ENV = "AI_LEGO_WHISPER_MODEL_DIR"
WHISPER_SNAPSHOT_GLOB = "models--Systran--faster-whisper-medium/snapshots/*/model.bin"


class FixtureTranscriber:
    mode = "SYNTHETIC_FIXTURE_TRANSCRIPT"

    def transcribe(self, audio_metadata: dict[str, Any], declared_speech_text: str | None) -> dict[str, Any]:
        if not declared_speech_text or not declared_speech_text.strip():
            raise InvariantViolation("FIXTURE_TRANSCRIPT_MISSING: fixture transcriber needs the declared speech text")
        sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", declared_speech_text.strip()) if part.strip()]
        slot = audio_metadata["duration_seconds"] / len(sentences)
        segments = [
            {
                "start_seconds": round(index * slot, 3),
                "end_seconds": round((index + 1) * slot, 3),
                "text": sentence,
                "speaker": f"SPEAKER_{index % 2:02d}",
                "diarization": DIARIZATION_PLACEHOLDER,
            }
            for index, sentence in enumerate(sentences)
        ]
        return {
            **audio_metadata,
            "transcription_mode": self.mode,
            "language": "en",
            "language_probability": 1.0,
            "text": " ".join(sentences),
            "segments": segments,
        }


def resolve_offline_whisper_model_dir() -> Path | None:
    """First match wins: explicit env var, then $HF_HUB_CACHE, then $HF_HOME/hub, then the default ~/.cache/huggingface/hub.

    Hugging Face's own layout puts the hub cache at ``$HF_HOME/hub`` (not
    ``$HF_HOME/huggingface/hub`` -- that mistake makes an explicitly relocated
    cache silently report unavailable). ``HF_HUB_CACHE`` overrides both when set.
    """
    explicit = os.environ.get(WHISPER_MODEL_ENV)
    if explicit:
        candidate = Path(explicit)
        return candidate if candidate.joinpath("model.bin").is_file() else None
    if os.environ.get("HF_HUB_CACHE"):
        hub_root = Path(os.environ["HF_HUB_CACHE"])
    elif os.environ.get("HF_HOME"):
        hub_root = Path(os.environ["HF_HOME"]) / "hub"
    else:
        hub_root = Path.home() / ".cache" / "huggingface" / "hub"
    for model_bin in sorted(hub_root.glob(WHISPER_SNAPSHOT_GLOB)):
        return model_bin.parent
    return None


def offline_stt_availability() -> tuple[bool, str]:
    try:
        import faster_whisper  # noqa: F401
    except Exception as error:  # ImportError or a broken native dependency
        return False, f"faster_whisper not importable: {error}"
    model_dir = resolve_offline_whisper_model_dir()
    if model_dir is None:
        return False, f"no cached faster-whisper Medium model (set {WHISPER_MODEL_ENV} or populate the HF cache)"
    return True, f"faster_whisper + model at {model_dir}"


class OfflineFasterWhisperTranscriber:
    mode = "OFFLINE_FASTER_WHISPER_MEDIUM_CPU_INT8"

    def __init__(self, model_dir: Path | None = None) -> None:
        model_dir = model_dir or resolve_offline_whisper_model_dir()
        if model_dir is None or not model_dir.joinpath("model.bin").is_file():
            raise AdapterUnavailable("OFFLINE_STT_MODEL_MISSING: no cached faster-whisper Medium model; downloads are deliberately not attempted")
        try:
            from faster_whisper import WhisperModel

            self.model = WhisperModel(str(model_dir), device="cpu", compute_type="int8")
        except Exception as error:
            raise AdapterUnavailable(f"OFFLINE_STT_INIT_FAILED: {error}") from error
        self.model_dir = model_dir

    def transcribe(self, audio_metadata: dict[str, Any], declared_speech_text: str | None = None) -> dict[str, Any]:
        del declared_speech_text  # a real recogniser must not be told what it is supposed to hear
        audio_path = Path(audio_metadata["audio_path"])
        try:
            segments, info = self.model.transcribe(str(audio_path), language="en", beam_size=1, vad_filter=False)
            rows = list(segments)
        except Exception as error:
            raise InvariantViolation(f"OFFLINE_STT_FAILED: {audio_path.name}: {error}") from error
        text = " ".join(segment.text.strip() for segment in rows if segment.text.strip()).strip()
        if not text:
            raise InvariantViolation(f"OFFLINE_STT_EMPTY: {audio_path.name}")
        return {
            **audio_metadata,
            "transcription_mode": self.mode,
            "language": info.language,
            "language_probability": round(info.language_probability, 6),
            "text": text,
            "segments": [
                {
                    "start_seconds": round(segment.start, 3),
                    "end_seconds": round(segment.end, 3),
                    "text": segment.text.strip(),
                    "speaker": f"SPEAKER_{index % 2:02d}",
                    "diarization": DIARIZATION_PLACEHOLDER,
                }
                for index, segment in enumerate(rows)
            ],
        }
