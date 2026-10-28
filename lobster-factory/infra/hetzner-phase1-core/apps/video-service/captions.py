"""Caption cues for videos whose voice WE produced from the script (D11: captionSource "script_tts").

Pure functions, no ffmpeg/edge-tts import, so the timing rules are unit-testable. A cue is
{"startMs": int, "endMs": int, "text": str}, absolute on the finished video's timeline.
"""
from typing import Iterable

SCENE_TAIL_S = 0.5  # pipeline._audio_duration adds this after each scene's voice


def proportional_cues(segments: list, duration_ms: int) -> list:
    """Spread text segments over duration_ms by character count (voices without word timings: OpenAI TTS)."""
    segments = [s.strip() for s in segments if s and s.strip()]
    if not segments or duration_ms <= 0:
        return []
    total = sum(len(s) for s in segments)
    cues, t = [], 0.0
    for s in segments:
        span = duration_ms * len(s) / total
        cues.append({"startMs": round(t), "endMs": round(t + span), "text": s})
        t += span
    return cues


def clamp_cues(cues: Iterable[dict], duration_ms: int) -> list:
    """Sorted, non-overlapping cues inside [0, duration_ms]; empty or zero-length ones are dropped."""
    out, prev_end = [], 0
    for c in sorted(cues, key=lambda c: c["startMs"]):
        start = max(int(c["startMs"]), prev_end)
        end = min(int(c["endMs"]), duration_ms)
        text = (c.get("text") or "").strip()
        if text and end > start:
            out.append({"startMs": start, "endMs": end, "text": text})
            prev_end = end
    return out


def assemble(scene_cues: list, scene_audio_s: list, intro_s: float = 0.0) -> list:
    """Per-scene cues (ms from that scene's start) -> absolute cues. Scene i lasts audio_i + SCENE_TAIL_S."""
    out, offset_ms = [], round(intro_s * 1000)
    for cues, audio_s in zip(scene_cues, scene_audio_s):
        scene_ms = round((audio_s + SCENE_TAIL_S) * 1000)
        for c in clamp_cues(cues, scene_ms):
            out.append({"startMs": c["startMs"] + offset_ms, "endMs": c["endMs"] + offset_ms, "text": c["text"]})
        offset_ms += scene_ms
    return out


def _ts(ms: int, sep: str) -> str:
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, milli = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{milli:03d}"


def to_srt(cues: list) -> str:
    return "".join(f"{i}\n{_ts(c['startMs'], ',')} --> {_ts(c['endMs'], ',')}\n{c['text']}\n\n" for i, c in enumerate(cues, 1))


def to_vtt(cues: list) -> str:
    return "WEBVTT\n\n" + "".join(f"{_ts(c['startMs'], '.')} --> {_ts(c['endMs'], '.')}\n{c['text']}\n\n" for c in cues)
