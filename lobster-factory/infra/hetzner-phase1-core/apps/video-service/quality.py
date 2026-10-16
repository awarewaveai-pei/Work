"""Deterministic technical media QA primitives.

The worker owns ffprobe execution; the rule evaluator stays pure so profiles
can be tested and replaced without coupling the HTTP service to a provider.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class Finding:
    rule_id: str
    severity: str
    message: str
    evidence: dict[str, Any]


def evaluate_probe(probe: dict[str, Any], expected_size: tuple[int, int] | None = None) -> dict[str, Any]:
    streams = probe.get("streams")
    format_info = probe.get("format") or {}
    findings: list[Finding] = []
    if not isinstance(streams, list) or not streams:
        findings.append(Finding("container.video_stream", "fail", "no video stream", {}))
    video = next((s for s in streams if s.get("codec_type") == "video"), None) if isinstance(streams, list) else None
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None) if isinstance(streams, list) else None
    if video is None:
        findings.append(Finding("container.video_stream", "fail", "video stream is required", {}))
    else:
        width, height = int(video.get("width") or 0), int(video.get("height") or 0)
        if width <= 0 or height <= 0:
            findings.append(Finding("container.dimensions", "fail", "invalid dimensions", {"width": width, "height": height}))
        if expected_size and (width, height) != expected_size:
            findings.append(Finding("output.profile_dimensions", "fail", "dimensions do not match output profile", {"actual": [width, height], "expected": list(expected_size)}))
    if audio is None:
        findings.append(Finding("container.audio_stream", "fail", "audio stream is required", {}))
    try:
        duration = float(format_info.get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0
    if duration <= 0:
        findings.append(Finding("duration.positive", "fail", "duration must be positive", {"duration": duration}))
    status = "failed" if any(f.severity == "fail" for f in findings) else "passed"
    return {
        "status": status,
        "detector": {"id": "media.qa_technical", "version": "1.0.0"},
        "measurements": {"durationSeconds": duration, "streamCount": len(streams) if isinstance(streams, list) else 0},
        "findings": [{"ruleId": f.rule_id, "severity": f.severity, "message": f.message, "evidence": f.evidence} for f in findings],
    }


def evaluate_signal_quality(
    probe: dict[str, Any],
    signal: dict[str, Any] | None = None,
    captions: Iterable[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Evaluate render signals without coupling the rules to ffmpeg.

    Signal extraction is performed by the worker; this function is deterministic
    and therefore remains easy to test.  Black/freeze and loudness findings are
    warnings by default so an unusual documentary shot is reviewable instead of
    being silently discarded.  Structural probe failures remain hard failures.
    """
    signal = signal or {}
    findings: list[Finding] = []
    duration = float((probe.get("format") or {}).get("duration") or 0)
    black_ratio = signal.get("blackRatio")
    if isinstance(black_ratio, (int, float)) and black_ratio > 0.20:
        findings.append(Finding("picture.black_frames", "warn", "black frames exceed 20% of the output", {"blackRatio": black_ratio}))
    freeze_events = signal.get("freezeEvents")
    if isinstance(freeze_events, (int, float)) and freeze_events > 0:
        findings.append(Finding("picture.freeze", "warn", "freeze events detected", {"freezeEvents": freeze_events}))
    # A measurement that could not be taken is not a pass: the worker's ffmpeg pass failed, or there is audio and no
    # loudness reading came back (Codex 2026-10-16). Only when a signal pass was attempted (signal given).
    exit_code = signal.get("ffmpegExitCode")
    if isinstance(exit_code, int) and exit_code != 0:
        findings.append(Finding("signal.probe_failed", "fail", "the signal measurement pass failed", {"ffmpegExitCode": exit_code}))
    integrated_lufs = signal.get("integratedLufs")
    has_audio = any(s.get("codec_type") == "audio" for s in probe.get("streams") or [])
    if signal and has_audio and not isinstance(integrated_lufs, (int, float)):
        findings.append(Finding("audio.loudness_unmeasured", "fail", "the output has audio but no loudness was measured", {}))
    if isinstance(integrated_lufs, (int, float)) and (integrated_lufs < -30 or integrated_lufs > -6):
        findings.append(Finding("audio.loudness", "fail", "integrated loudness is outside -30 to -6 LUFS", {"integratedLufs": integrated_lufs}))
    true_peak = signal.get("truePeakDb")
    if isinstance(true_peak, (int, float)) and true_peak > -1:
        findings.append(Finding("audio.true_peak", "fail", "true peak exceeds -1 dBTP", {"truePeakDb": true_peak}))
    if captions is not None:
        previous_end = 0
        for index, cue in enumerate(captions):
            start, end = cue.get("startMs"), cue.get("endMs")
            text = cue.get("text", "")
            if not isinstance(start, int) or not isinstance(end, int) or end <= start or start < previous_end or end > round(duration * 1000):
                findings.append(Finding("caption.timing", "fail", "caption timing is outside the media duration or overlaps", {"index": index, "startMs": start, "endMs": end}))
            elif isinstance(text, str) and text and len(text) / ((end - start) / 1000) > 22:
                findings.append(Finding("caption.reading_speed", "warn", "caption reading speed exceeds 22 characters per second", {"index": index}))
            if isinstance(end, int):
                previous_end = max(previous_end, end)
    status = "failed" if any(f.severity == "fail" for f in findings) else ("warned" if findings else "passed")
    return {
        "status": status,
        "detector": {"id": "media.qa_signal", "version": "1.0.0"},
        "measurements": {"durationSeconds": duration, **signal},
        "findings": [{"ruleId": f.rule_id, "severity": f.severity, "message": f.message, "evidence": f.evidence} for f in findings],
    }
