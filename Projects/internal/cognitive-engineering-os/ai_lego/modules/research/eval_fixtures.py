"""SYNTHETIC units, anchors and codebook definitions for the MP section 70 eval ONLY (round 11).

Nothing here describes a real person; every name, employer, city and sentence is invented. These units exist so the
golden set can reach TEST_EVAL_STRATEGY section 2.2's 30-case minimum with cases that are each a distinct production
call with a distinct expected answer -- not by re-running the four slice fixtures under new ids.

They are deliberately kept OUT of ``synthetic_fixtures``: the research slice, its golden hashes and its Kappa
computation must not change because the eval grew. The eval builds these units through the same
``detect_synthetic_pii`` / ``redact_transcript`` pipeline the slice uses, so each opens with the identity sentence.

Anchor origin (stated on the dataset's maturity block, never implied otherwise): ``EVAL_ANCHOR_LABELS`` are the
fixture AUTHORS' assignments over invented participants -- ``SYNTHETIC_AUTHOR_LABELLED`` -- not human research
coders' labels on real data. The 30-case COUNT rule is met by them; section 2.3's human calibration is not.

Why the codebook carries DEFINITIONS (the GC-CB-001 decision, round 11): the round 9/10 runs assigned SRC-1 ("I kept
checking messages after dinner") to ``evening_planning_around_messages`` on some seeds and ``after_hours_monitoring``
on others. The anchor is right -- checking is monitoring; arranging one's evening around messages is SRC-2's
sentence -- and the model's error is not random: a codebook of bare labels asks the second coder to infer each
label's boundary from its name, and two neighbouring labels are then separable only by guessing. A codebook in
qualitative coding is label + definition + boundary; the definitions below are written so that each pair of
neighbours (monitoring/planning, rumination/sleep, exhaustion/withdrawal) is told apart by an explicit criterion.
"""

from __future__ import annotations

from typing import Any

# label -> definition. No ": " inside a definition (the prompt renders "- label: definition").
EVAL_CODEBOOK_DEFINITIONS: dict[str, str] = {
    "after_hours_monitoring": "the participant describes checking or watching work channels (email, chat, phone) outside working hours so as not to miss something; the act is looking, not rearranging plans",
    "evening_planning_around_messages": "the participant describes arranging, avoiding or conditioning personal evening plans on work messages that might arrive; the act is planning, not the checking itself",
    "emotional_exhaustion": "the participant describes feeling drained, empty or unable to care about work; energy depletion rather than thoughts, sleep or other people",
    "late_night_rumination": "the participant describes repetitive, hard-to-stop thinking about work late in the day or at night, without saying that sleep itself was lost",
    "sleep_disruption": "the participant describes sleep itself being lost or broken because of work; waking in the night, not falling asleep, or sleeping less",
    "withdrawal_from_others": "the participant describes pulling away from family, friends or social contact because work has used up their energy",
}

# The four slice labels are a subset of the six eval labels, so the same definitions apply to the slice units.
SLICE_CODEBOOK_LABELS = ("after_hours_monitoring", "evening_planning_around_messages", "emotional_exhaustion", "late_night_rumination")

EVAL_CATEGORY_OF_LABEL: dict[str, str] = {
    "after_hours_monitoring": "boundary_erosion",
    "evening_planning_around_messages": "boundary_erosion",
    "emotional_exhaustion": "depletion",
    "withdrawal_from_others": "depletion",
    "late_night_rumination": "night_intrusion",
    "sleep_disruption": "night_intrusion",
}

# Each unit: the identity frame the PII pipeline expects, then ONE sentence whose anchor is unambiguous under the
# definitions above. ``quote`` is the sentence alone (the PII-free text axial coding is shown).
EVAL_TRANSCRIPTS: list[dict[str, Any]] = [
    {"source_id": "ESRC-01", "subject_id": "E01", "name": "Ines Duarte", "employer": "Tagus Freight", "city": "Lisbon", "quote": "I keep my work email open on my phone at the dinner table so I can see new messages as they come in.", "anchor": "after_hours_monitoring"},
    {"source_id": "ESRC-02", "subject_id": "E02", "name": "Tomas Ferreira", "employer": "Douro Analytics", "city": "Porto", "quote": "Most nights I glance at the team channel every half hour until I go to bed, just in case someone needs an answer.", "anchor": "after_hours_monitoring"},
    {"source_id": "ESRC-03", "subject_id": "E03", "name": "Lotte Claes", "employer": "Leie Studio", "city": "Ghent", "quote": "I stopped booking anything on weekday evenings because a request might come in and I would have to drop it.", "anchor": "evening_planning_around_messages"},
    {"source_id": "ESRC-04", "subject_id": "E04", "name": "Bram Visser", "employer": "Vecht Software", "city": "Utrecht", "quote": "Before I agree to dinner with friends I check whether a release is scheduled, so my evening depends on what might land.", "anchor": "evening_planning_around_messages"},
    {"source_id": "ESRC-05", "subject_id": "E05", "name": "Freja Lund", "employer": "Oresund Health", "city": "Malmo", "quote": "By Thursday I have nothing left; I sit at my desk and cannot bring myself to care about the next ticket.", "anchor": "emotional_exhaustion"},
    {"source_id": "ESRC-06", "subject_id": "E06", "name": "Mikkel Holm", "employer": "Kattegat Retail", "city": "Aarhus", "quote": "I used to enjoy the work, and now I feel completely drained before the day has even started.", "anchor": "emotional_exhaustion"},
    {"source_id": "ESRC-07", "subject_id": "E07", "name": "Kadri Tamm", "employer": "Baltic Cloud", "city": "Tallinn", "quote": "Late in the evening I sit on the sofa replaying the stand-up in my head, thinking about what I should have said.", "anchor": "late_night_rumination"},
    {"source_id": "ESRC-08", "subject_id": "E08", "name": "Janis Ozols", "employer": "Daugava Print", "city": "Riga", "quote": "Once the house is quiet my mind goes straight back to the unresolved bug and will not let it go.", "anchor": "late_night_rumination"},
    {"source_id": "ESRC-09", "subject_id": "E09", "name": "Priya Sharma", "employer": "Aire Consulting", "city": "Leeds", "quote": "I wake up at three in the morning with my heart racing about the deadline and cannot get back to sleep.", "anchor": "sleep_disruption"},
    {"source_id": "ESRC-10", "subject_id": "E10", "name": "Ciaran Walsh", "employer": "Lee Valley Foods", "city": "Cork", "quote": "Some nights I do not fall asleep until well past two because I am still wired from the evening calls.", "anchor": "sleep_disruption"},
    {"source_id": "ESRC-11", "subject_id": "E11", "name": "Sigrid Berg", "employer": "Fjell Energy", "city": "Bergen", "quote": "I have stopped answering my sister's calls because I do not have the energy to talk about anything.", "anchor": "withdrawal_from_others"},
    {"source_id": "ESRC-12", "subject_id": "E12", "name": "Aino Virtanen", "employer": "Aura Devices", "city": "Turku", "quote": "At weekends I cancel plans and stay home alone; being around people feels like more work.", "anchor": "withdrawal_from_others"},
]

for _entry in EVAL_TRANSCRIPTS:
    _entry["speech_text"] = f"My name is {_entry['name']}. I work for {_entry['employer']} in {_entry['city']}. {_entry['quote']}"

EVAL_ANCHOR_LABELS: dict[str, str] = {entry["source_id"]: entry["anchor"] for entry in EVAL_TRANSCRIPTS}
EVAL_CODEBOOK: list[str] = sorted(EVAL_CODEBOOK_DEFINITIONS)
ANCHOR_ORIGIN = "SYNTHETIC_AUTHOR_LABELLED"


def slice_definitions() -> dict[str, str]:
    """Definitions restricted to the four slice labels (the GC-CB-001 codebook), for the with-definitions control cases."""
    return {label: EVAL_CODEBOOK_DEFINITIONS[label] for label in SLICE_CODEBOOK_LABELS}
