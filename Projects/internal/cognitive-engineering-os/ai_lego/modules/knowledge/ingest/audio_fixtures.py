"""Audio fixture adapters for the ``AudioFixtureFactory`` port.

* ``SyntheticToneAudioFactory`` -- deterministic PCM WAV written with the
  standard library ``wave`` module. Runs on any OS, no dependencies, same
  bytes for the same text every time (replayable CAS hashes). It contains no
  speech, so it pairs only with the fixture transcriber.
* ``WindowsSapiSpeechAudioFactory`` -- real spoken audio generated locally by
  Windows SAPI (no network, no paid service). Pairs with the offline
  faster-whisper transcriber for an end-to-end speech-to-text run.

Both decode the file they wrote (all frames, not just the header) before
returning metadata, and both enforce the 10-30 second fixture window.
"""

from __future__ import annotations

import math
import shutil
import struct
import subprocess
import sys
import wave
from pathlib import Path
from typing import Any

from ai_lego.core.support import b64, sha256_bytes
from ai_lego.errors import AdapterUnavailable, InvariantViolation

MIN_SECONDS = 10.0
MAX_SECONDS = 30.0


def wave_metadata(path: Path, audio_mode: str) -> dict[str, Any]:
    """Decode a PCM WAV completely and describe it; raises if it is not decodable."""
    try:
        with wave.open(str(path), "rb") as handle:
            sample_rate = handle.getframerate()
            frames = handle.getnframes()
            channels = handle.getnchannels()
            width = handle.getsampwidth()
            decoded = handle.readframes(frames)
    except (wave.Error, EOFError, OSError) as error:
        raise InvariantViolation(f"AUDIO_DECODE_FAILED: {path.name}: {error}") from error
    if len(decoded) != frames * channels * width:
        raise InvariantViolation(f"AUDIO_DECODE_TRUNCATED: {path.name}")
    duration = frames / sample_rate
    if not MIN_SECONDS <= duration <= MAX_SECONDS:
        raise InvariantViolation(f"AUDIO_DURATION_OUT_OF_RANGE: {path.name} is {duration:.2f}s, fixture window is {MIN_SECONDS:.0f}-{MAX_SECONDS:.0f}s")
    return {
        "audio_path": str(path),
        "audio_sha256": sha256_bytes(path.read_bytes()),
        "decoded_sample_rate": sample_rate,
        "decoded_frames": frames,
        "decoded_channels": channels,
        "decoded_sample_width_bytes": width,
        "duration_seconds": round(duration, 3),
        "audio_mode": audio_mode,
    }


class SyntheticToneAudioFactory:
    mode = "SYNTHETIC_TONE_WAV_STDLIB"

    def __init__(self, duration_seconds: float = 12.0, sample_rate: int = 16000) -> None:
        self.duration_seconds = duration_seconds
        self.sample_rate = sample_rate

    def synthesize(self, text: str, output_path: Path) -> dict[str, Any]:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        frequency = 220.0 + (int(sha256_bytes(text.encode("utf-8"))[:8], 16) % 440)
        frames = int(self.duration_seconds * self.sample_rate)
        fade = 0.05
        samples = bytearray()
        for index in range(frames):
            moment = index / self.sample_rate
            envelope = min(1.0, moment / fade, (self.duration_seconds - moment) / fade)
            samples += struct.pack("<h", int(12000 * envelope * math.sin(2 * math.pi * frequency * moment)))
        with wave.open(str(output_path), "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(self.sample_rate)
            handle.writeframes(bytes(samples))
        return wave_metadata(output_path, self.mode)


class WindowsSapiSpeechAudioFactory:
    mode = "WINDOWS_SAPI_SPEECH_WAV"

    @staticmethod
    def availability() -> tuple[bool, str]:
        if sys.platform != "win32":
            return False, f"Windows SAPI speech synthesis is unavailable on {sys.platform}"
        if shutil.which("powershell.exe") is None:
            return False, "powershell.exe not found on PATH"
        return True, "Windows SAPI via powershell.exe"

    def synthesize(self, text: str, output_path: Path) -> dict[str, Any]:
        available, reason = self.availability()
        if not available:
            raise AdapterUnavailable(f"SAPI_UNAVAILABLE: {reason}")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        text_b64 = b64(text.encode("utf-8"))
        path_b64 = b64(str(output_path).encode("utf-8"))
        script = (
            "Add-Type -AssemblyName System.Speech; "
            "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            "$s.Rate = -1; "
            "$p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + path_b64 + "')); "
            "$t = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + text_b64 + "')); "
            "$s.SetOutputToWaveFile($p); $s.Speak($t); $s.Dispose()"
        )
        executable = shutil.which("powershell.exe")
        if executable is None:
            raise AdapterUnavailable("SAPI_UNAVAILABLE: powershell.exe not found on PATH")
        try:
            subprocess.run(
                [executable, "-NoProfile", "-NonInteractive", "-Command", script],
                check=True,
                capture_output=True,
                text=True,
            )
        except (subprocess.CalledProcessError, OSError) as error:
            raise AdapterUnavailable(f"SAPI_SYNTHESIS_FAILED: {output_path.name}: {error}") from error
        return wave_metadata(output_path, self.mode)
