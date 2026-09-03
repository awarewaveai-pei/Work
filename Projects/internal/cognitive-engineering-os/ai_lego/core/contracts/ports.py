"""Ports for the ingest pipeline (Stable Ports/Adapters, REPOSITORY_ARCHITECTURE.md §Worker Placement).

The same use-case (``ingest a source -> transcript``) has two adapters per port:

* a deterministic, dependency-free adapter used by tests/CI on any machine, and
* a real local adapter (Windows SAPI speech synthesis, offline faster-whisper)
  used when the machine has them.

Both produce records of the SAME shape, and every record names which adapter
produced it (``audio_mode`` / ``transcription_mode``), so evidence can never
silently pass a fixture off as a real transcription.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol


class AudioFixtureFactory(Protocol):
    """Produce one synthetic WAV file and return its decoded metadata."""

    mode: str

    def synthesize(self, text: str, output_path: Path) -> dict[str, Any]:
        """Return ``{audio_path, audio_sha256, decoded_sample_rate, decoded_frames, duration_seconds, audio_mode}``."""


class Transcriber(Protocol):
    """Turn decoded audio metadata into a transcript record."""

    mode: str

    def transcribe(self, audio_metadata: dict[str, Any], declared_speech_text: str | None) -> dict[str, Any]:
        """Return ``audio_metadata`` extended with ``transcription_mode, language, language_probability, text, segments``.

        ``declared_speech_text`` is what the fixture *intended* to say. A real
        speech-to-text adapter must ignore it (its output is what was actually
        recognised); the fixture adapter is allowed to return it verbatim.
        """
