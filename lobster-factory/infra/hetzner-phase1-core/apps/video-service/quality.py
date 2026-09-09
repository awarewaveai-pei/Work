"""Deterministic technical media QA primitives.

The worker owns ffprobe execution; the rule evaluator stays pure so profiles
can be tested and replaced without coupling the HTTP service to a provider.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


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
