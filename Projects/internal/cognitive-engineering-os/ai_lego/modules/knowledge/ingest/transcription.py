"""Transcriber adapters for the ``Transcriber`` port.

* ``FixtureTranscriber`` -- returns the fixture's declared speech text as the
  transcript. Deterministic, dependency-free; labelled
  ``SYNTHETIC_FIXTURE_TRANSCRIPT`` so no evidence can mistake it for
  recognition.
* ``OfflineFasterWhisperTranscriber`` -- real speech-to-text with a locally
  cached faster-whisper model (CPU, int8). It never downloads a model: if the
  cache is absent it raises ``AdapterUnavailable`` so the caller skips
  VISIBLY instead of silently degrading to the fixture.

* ``MeetingServiceTranscriber`` -- real GPU speech-to-text AND real speaker
  diarization, by reusing the operator's existing meeting-service tool
  (``lobster-factory/.../apps/meeting-service/lib/{transcribe,diarize}.py``:
  its CUDA DLL registration + device probe, and its pyannote 3.1 pipeline
  with exclusive/overlap/proximity relabelling). Only ``pick_device``,
  ``preflight`` and ``diarize`` are reused; the whisper call itself is made
  here so the language is this adapter's parameter instead of
  meeting-service's hard-coded ``zh`` (its own ``transcribe()`` is built for
  Mandarin meetings, this slice's fixtures are English). Loaded by file path
  under a private module name, never ``import lib`` -- ``lib`` is too generic
  a top-level name to trust on ``sys.path``.

Speaker labels from the first two adapters are alternating placeholders, not
diarization, and say so in every segment; the third carries real pyannote
labels and says which of the three relabelling routes produced each one.
"""

from __future__ import annotations

import importlib.util
import os
import re
from pathlib import Path
from types import ModuleType
from typing import Any, Callable

from ai_lego import REPO_ROOT
from ai_lego.errors import AdapterUnavailable, InvariantViolation

DIARIZATION_PLACEHOLDER = "NAIVE_ALTERNATING_SPEAKERS_PLACEHOLDER"
DIARIZATION_PYANNOTE = "PYANNOTE_SPEAKER_DIARIZATION_3_1"
DIARIZATION_NO_MATCH = "PYANNOTE_NO_SPEECH_REGION_MATCH"
SPEAKER_UNRESOLVED = "SPEAKER_UNRESOLVED"
WHISPER_MODEL_ENV = "AI_LEGO_WHISPER_MODEL_DIR"
WHISPER_SNAPSHOT_GLOB = "models--Systran--faster-whisper-medium/snapshots/*/model.bin"
MEETING_SERVICE_DIR_ENV = "AI_LEGO_MEETING_SERVICE_DIR"
DEFAULT_MEETING_SERVICE_DIR = REPO_ROOT / "lobster-factory" / "infra" / "hetzner-phase1-core" / "apps" / "meeting-service"
MEETING_SERVICE_LIBS = ("transcribe", "diarize")


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


def resolve_meeting_service_dir() -> Path:
    explicit = os.environ.get(MEETING_SERVICE_DIR_ENV)
    return Path(explicit) if explicit else DEFAULT_MEETING_SERVICE_DIR


def load_meeting_service_lib(name: str, service_dir: Path | None = None) -> ModuleType:
    """Load ``<service_dir>/lib/<name>.py`` by path under a private module name (no ``import lib``)."""
    service_dir = service_dir or resolve_meeting_service_dir()
    source = service_dir / "lib" / f"{name}.py"
    if not source.is_file():
        raise AdapterUnavailable(f"MEETING_SERVICE_LIB_MISSING: {source} (set {MEETING_SERVICE_DIR_ENV} to the meeting-service checkout)")
    spec = importlib.util.spec_from_file_location(f"ai_lego_ext_meeting_service_{name}", source)
    if spec is None or spec.loader is None:
        raise AdapterUnavailable(f"MEETING_SERVICE_LIB_UNLOADABLE: {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def meeting_service_availability(service_dir: Path | None = None) -> tuple[bool, str]:
    """(bool, reason) like the other adapters. Checks files + imports + HF token presence; never downloads, never logs the token."""
    service_dir = service_dir or resolve_meeting_service_dir()
    missing = [name for name in MEETING_SERVICE_LIBS if not (service_dir / "lib" / f"{name}.py").is_file()]
    if missing:
        return False, f"meeting-service libs missing under {service_dir}: {', '.join(missing)}"
    for package in ("av", "faster_whisper", "pyannote.audio", "torch"):
        try:
            importlib.import_module(package)
        except Exception as error:  # ImportError or a broken native dependency
            return False, f"{package} not importable: {error}"
    if not os.environ.get("HF_TOKEN"):
        return False, "HF_TOKEN not set (pyannote/speaker-diarization-3.1 is a gated model; the token is read from the environment, never printed)"
    return True, f"meeting-service libs at {service_dir}; av/faster_whisper/pyannote.audio/torch importable; HF_TOKEN present"


def map_diarized_segment(row: dict[str, Any]) -> dict[str, Any]:
    """meeting-service segment (after ``diarize`` relabelled it in place) -> this port's segment shape.

    A row the diarizer could not place (``speaker == "?"`` or absent) is reported as ``SPEAKER_UNRESOLVED`` with
    ``DIARIZATION_NO_MATCH`` -- never quietly folded into a real speaker. ``speaker_inference`` names which of the
    diarizer's three routes produced the label (``direct`` exclusive-span hit, ``overlap`` fallback, ``proximity``
    nearest-region guess), so a downstream reader can weight it.
    """
    label = row.get("speaker")
    unresolved = not label or label == "?"
    return {
        "start_seconds": round(float(row["start"]), 3),
        "end_seconds": round(float(row["end"]), 3),
        "text": str(row["text"]).strip(),
        "speaker": SPEAKER_UNRESOLVED if unresolved else f"SPEAKER_{label}",
        "diarization": DIARIZATION_NO_MATCH if unresolved else DIARIZATION_PYANNOTE,
        "speaker_inference": None if unresolved else (row.get("speaker_inferred") or "direct"),
        "avg_logprob": row.get("avg_logprob"),
        "no_speech_prob": row.get("no_speech_prob"),
    }


class MeetingServiceTranscriber:
    mode = "MEETING_SERVICE_FASTER_WHISPER_GPU_PYANNOTE_3_1"

    def __init__(self, model_name: str = "large-v3", language: str = "en", service_dir: Path | None = None, log: Callable[[str], Any] | None = None) -> None:
        self.log = log or (lambda _message: None)
        self.service_dir = service_dir or resolve_meeting_service_dir()
        available, reason = meeting_service_availability(self.service_dir)
        if not available:
            raise AdapterUnavailable(f"MEETING_SERVICE_UNAVAILABLE: {reason}")
        self.transcribe_lib = load_meeting_service_lib("transcribe", self.service_dir)
        self.diarize_lib = load_meeting_service_lib("diarize", self.service_dir)
        self.model_name = model_name
        self.language = language
        try:
            self.model, self.backend = self.transcribe_lib.pick_device(model_name, self.log)
        except Exception as error:
            raise AdapterUnavailable(f"MEETING_SERVICE_MODEL_INIT_FAILED: {model_name}: {error}") from error

    def transcribe(self, audio_metadata: dict[str, Any], declared_speech_text: str | None = None) -> dict[str, Any]:
        del declared_speech_text  # a real recogniser must not be told what it is supposed to hear
        audio_path = str(audio_metadata["audio_path"])
        try:
            self.transcribe_lib.preflight(audio_path, self.log)
            segments, info = self.model.transcribe(audio_path, language=self.language, beam_size=1, vad_filter=True, vad_parameters={"min_silence_duration_ms": 500})
            rows = [
                {"id": s.id, "start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip(), "avg_logprob": round(s.avg_logprob, 4), "no_speech_prob": round(s.no_speech_prob, 4)}
                for s in segments
                if s.text.strip()
            ]
        except Exception as error:
            raise InvariantViolation(f"MEETING_SERVICE_STT_FAILED: {Path(audio_path).name}: {error}") from error
        if not rows:
            raise InvariantViolation(f"MEETING_SERVICE_STT_EMPTY: {Path(audio_path).name}")
        try:
            summary = self.diarize_lib.diarize(audio_path, rows, None, self.log)  # relabels rows in place
        except Exception as error:
            raise InvariantViolation(f"MEETING_SERVICE_DIARIZATION_FAILED: {Path(audio_path).name}: {error}") from error
        return {
            **audio_metadata,
            "transcription_mode": self.mode,
            "stt_model": self.model_name,
            "stt_backend": self.backend,
            "language": info.language,
            "language_probability": round(info.language_probability, 6),
            "text": " ".join(row["text"] for row in rows),
            "segments": [map_diarized_segment(row) for row in rows],
            "diarization_summary": {"speakers": list(summary.get("speakers", [])), "overlap_sec": summary.get("overlap_sec"), "turns": len(summary.get("turns", []))},
        }
