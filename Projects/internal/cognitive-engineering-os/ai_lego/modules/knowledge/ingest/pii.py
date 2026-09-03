"""Synthetic PII detection over ACTUAL transcript text (never over the fixture's intent).

The fixtures all open with a structured identity sentence ("My name is X. I
work for Y in Z.") so the three protected fields can be extracted from what
was really transcribed. When real speech-to-text renders a name differently
(the recorded "Noor" -> "Nor" case), the recognised form is what gets
encrypted -- substituting the fixture's declared value would hide the
mismatch.

This is a narrow English pattern, not general entity extraction; see
docs/PHASE5_RESEARCH_SLICE.md "Current limitations".
"""

from __future__ import annotations

import re

from ai_lego.errors import InvariantViolation

IDENTITY_SENTENCE = re.compile(
    r"\bmy name is (?P<name>[A-Za-z]+(?: [A-Za-z]+)+)\.\s+i work for "
    r"(?P<employer>[A-Za-z]+(?: [A-Za-z]+)*) in (?P<city>[A-Za-z]+)\b",
    re.IGNORECASE,
)
PII_FIELDS = ("name", "employer", "city")


def detect_synthetic_pii(transcript_text: str, source_id: str) -> dict[str, str]:
    match = IDENTITY_SENTENCE.search(transcript_text)
    if match is None:
        raise InvariantViolation(f"STT_PII_DETECTION_FAILED: {source_id}: identity sentence absent from actual transcript: {transcript_text!r}")
    return {field: match.group(field) for field in PII_FIELDS}


def redact_transcript(transcript_text: str, pii: dict[str, str]) -> str:
    """Replace the FIRST occurrence of each detected value with a field marker, case-insensitively."""
    result = transcript_text
    for field, value in pii.items():
        start = result.casefold().find(value.casefold())
        if start < 0:
            raise InvariantViolation(f"REDACTION_TARGET_MISSING: {field} not present in transcript")
        result = result[:start] + f"[{field.upper()}]" + result[start + len(value):]
    return result
