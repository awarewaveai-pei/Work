"""SYNTHETIC fixtures for the Research Mode slice. Nothing here describes a real person.

Names, employers, cities and quotes are invented. P4 is deliberately noisy
(declared full name vs. spoken nickname, a compound employer, a city that is
also an ordinary English word) to stress the PII detector against real
speech-to-text output.
"""

from __future__ import annotations

from typing import Any

PROJECT_ID = "PRJ-BURNOUT-01"

SYNTHETIC_TRANSCRIPTS: list[dict[str, Any]] = [
    {
        "source_id": "SRC-1",
        "subject_id": "P1",
        "display": "Synthetic participant P1",
        "name": "Mara Linden",
        "employer": "Northbridge Media",
        "city": "Berlin",
        "timestamp": "00:00:14",
        "quote": "After the restructure, I kept checking messages after dinner because I worried I would miss something.",
        "speech_text": "My name is Mara Linden. I work for Northbridge Media in Berlin. After the restructure, I kept checking messages after dinner because I worried I would miss something.",
    },
    {
        "source_id": "SRC-2",
        "subject_id": "P2",
        "display": "Synthetic participant P2",
        "name": "Elias Morgan",
        "employer": "Cedar Systems",
        "city": "Dublin",
        "timestamp": "00:00:22",
        "quote": "I began planning my evenings around whether another urgent message would arrive.",
        "speech_text": "My name is Elias Morgan. I work for Cedar Systems in Dublin. I began planning my evenings around whether another urgent message would arrive.",
    },
    {
        "source_id": "SRC-3",
        "subject_id": "P3",
        "display": "Synthetic participant P3",
        "name": "Noor Patel",
        "employer": "Fjord Labs",
        "city": "Oslo",
        "timestamp": "00:00:31",
        "quote": "Some weeks I finish work feeling empty before I have even logged off.",
        "speech_text": "My name is Noor Patel. I work for Fjord Labs in Oslo. Some weeks I finish work feeling empty before I have even logged off.",
    },
    {
        "source_id": "SRC-4",
        "subject_id": "P4",
        "display": "Synthetic participant P4",
        "name": "Alexandra Nguyen",
        "employer": "Harbor & Pine Analytics",
        "city": "Reading",
        "timestamp": "00:00:39",
        "quote": "Reading project updates late at night makes it difficult to stop thinking about tomorrow.",
        "speech_text": "My name is Lex Nguyen. I work for Harbor and Pine Analytics in Reading. Reading project updates late at night makes it difficult to stop thinking about tomorrow.",
    },
]

SYNTHETIC_CONSENT = b"SYNTHETIC PUBLIC RESEARCH CONSENT TEMPLATE v1 -- no real participant data."

# P2's three synthetic PII values: their ABSENCE from every runtime artefact
# after erasure is the readback check tests perform.
P2_SYNTHETIC_PII_VALUES = ("Elias Morgan", "Cedar Systems", "Dublin")

SUGGESTED_LABEL = "after_hours_monitoring"

# Open-coding labels a synthetic second coder assigned independently, one per source.
CODER_TWO_LABELS: dict[str, str] = {
    "SRC-1": "after_hours_monitoring",
    "SRC-2": "evening_planning_around_messages",
    "SRC-3": "emotional_exhaustion",
    "SRC-4": "late_night_rumination",
}

# AI-suggested codes coder 1 has NOT reviewed yet (they stay AI_SUGGESTED).
CODER_ONE_PENDING_AI_LABELS: dict[str, str] = {
    "SRC-3": "emotional_exhaustion",
    "SRC-4": "late_night_rumination",
}

# Axial coding: label -> category. Labels a human typed during review that are
# not in this map land in the honest "pending_axial_review" category.
CATEGORY_OF_LABEL: dict[str, str] = {
    "after_hours_monitoring": "boundary_erosion",
    "evening_planning_around_messages": "boundary_erosion",
    "emotional_exhaustion": "emotional_exhaustion",
    "late_night_rumination": "rumination",
}

# Selective coding (prompt v11 champion): theme -> categories.
THEMES_V11: list[tuple[str, list[str]]] = [
    ("boundary_erosion", ["boundary_erosion"]),
    ("emotional_exhaustion", ["emotional_exhaustion", "rumination"]),
]


def expanded_synthetic_coder_judgments() -> tuple[list[str], list[str]]:
    """48 balanced synthetic coding units over exactly two labels, for Cohen's Kappa."""
    coder_a = ["boundary"] * 24 + ["fatigue"] * 24
    coder_b = ["boundary"] * 21 + ["fatigue"] * 3 + ["boundary"] * 3 + ["fatigue"] * 21
    return coder_a, coder_b
