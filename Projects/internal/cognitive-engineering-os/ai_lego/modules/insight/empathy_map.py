"""``insight.empathy_map`` -- F06 human/customer-insight family, 3rd member built (9 concurrent siblings
open F06 in this same batch, none read or touched here; see ``persona.py`` for the family's own established
record-level-only-provenance convention, reused not edited).

Atlas cites this method ONCE: the F06 tool table row (L463: "Empathy Map｜Says/Thinks/Does/Feels｜用訪談/
觀察填寫且標 fact/inference｜找語言與行為差距｜不可純 AI 猜"). Grep-confirmed the only real hit
case-insensitively across the whole Atlas file -- no dedicated section, same thin-citation class
``strategy.ansoff``/``strategy.bcg_matrix``/``insight.persona`` already establish.

**Design-shape investigation (task-mandated, disclosed here)**: read ``strategy.porter_five_forces``'s
``FORCE_NAMES`` (closed SET, completeness required, EXACT cardinality 5, no position) and
``divergent.scamper``'s ``VALID_LENSES`` (closed enum, NO completeness requirement, open-ended count) before
choosing this method's own shape. Atlas's own citation lists Says/Thinks/Does/Feels as 4 co-equal quadrants
with no cited sequence -- like Porter, completeness across all 4 is the method's own definition (an empathy
map covering only 2 of the 4 quadrants has not actually built an empathy map). UNLIKE Porter, nothing in
Atlas's own citation caps the total entry count at 4 -- real interview/observation practice commonly yields
multiple Says/Thinks/Does/Feels observations per quadrant (task-mandated: "entries may have MORE than 4").
So ``QUADRANT_NAMES`` below is a shape distinct from both precedents: a closed SET requiring per-value
coverage at least once each (like Porter's completeness) but WITHOUT Porter's exact-cardinality cap and
WITHOUT position (like scamper's open-endedness) -- a completeness FLOOR, not an exact count.

Atlas's own citation gives two real invariants, each enforced BOTH at construction (raise BEFORE any record
is built) AND independently re-derived by a gate that never trusts a stored value, same two-layer discipline
every sibling module in this package already establishes:

1. ``entries`` covers all 4 ``QUADRANT_NAMES`` (SAYS/THINKS/DOES/FEELS) at least once each. Missing any of
   the 4 is refused; more than 4 entries (multiple observations per quadrant) is explicitly allowed;
   unrecognized quadrant names are refused.
2. Every entry's ``basis`` is one of the 2 ``VALID_BASES`` (FACT/INFERENCE) -- directly mechanizing Atlas's
   own "標 fact/inference" instruction and its "不可純 AI 猜" caution: an entry with no fact/inference label
   is exactly the un-grounded guessing this caution warns against, so ``basis`` is REQUIRED on every entry,
   never optional or defaulted (task-mandated restraint: no silent default to either FACT or INFERENCE).

A third, weaker invariant: ``subject`` (top-level, required, non-empty) and every entry's ``content``
(required, non-empty) -- an empty subject or content entry has not disclosed what is actually being
observed.

**Provenance placement (batch-wide decision for this whole F06 batch, disclosed in the method contract's own
compilation_decisions)**: record-level ONLY -- a single top-level ``provenance`` field, no per-entry
provenance. This deliberately avoids the per-item/record-level ambiguity that hit both the F02 and F03
batches (2026-09-11 WORKLOG). NOTE: ``basis`` is a DIFFERENT, method-specific concept (Atlas's own "標
fact/inference" instruction) from ``provenance``'s epistemic_type/authorship_state axes -- the two are never
conflated: ``basis`` classifies THIS observation as grounded-in-interview-fact vs. an inferred read;
``provenance`` classifies HOW the record itself was produced (human/AI, evidence/hypothesis/etc).

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-insensitively
for "empathy_map"/"EmpathyMap" before writing any of this method's own files: zero pre-existing
implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "insight.empathy_map"
RECORD_ID_PREFIX = "EMPATHY-"

SAYS = "SAYS"
THINKS = "THINKS"
DOES = "DOES"
FEELS = "FEELS"
QUADRANT_NAMES: frozenset[str] = frozenset({SAYS, THINKS, DOES, FEELS})
# Atlas F06 L463 verbatim "Says/Thinks/Does/Feels", transcribed as SCREAMING_SNAKE_CASE. See module
# docstring's design-shape investigation for why this is a closed SET requiring per-value completeness (like
# strategy.porter_five_forces's FORCE_NAMES) but WITHOUT an exact-cardinality cap (unlike FORCE_NAMES' exact
# count of 5).

FACT = "FACT"
INFERENCE = "INFERENCE"
VALID_BASES: frozenset[str] = frozenset({FACT, INFERENCE})
# Atlas F06 L463's own "標 fact/inference" instruction, made a closed 2-value enum. REQUIRED on every entry,
# never defaulted -- see module docstring invariant 2 (mechanizes "不可純 AI 猜").

_ENTRY_REQUIRED_KEYS = frozenset({"quadrant", "content", "basis"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _entries_are_valid(entries: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this package establishes. Real invariants 1+2 from
    the module docstring, re-derived from raw fields, never trusting a stored value.

    Deliberately does NOT short-circuit on ``len(entries) < 4`` up front: a per-entry SHAPE/UNKNOWN_QUADRANT/
    EMPTY_CONTENT/INVALID_BASIS defect is checked FIRST for every entry, and only after every entry is
    individually well-formed is the cross-entry completeness (all 4 quadrants covered) checked -- same
    reason-priority discipline ``strategy.porter_five_forces``'s own ``_forces_are_valid`` already
    establishes, so a too-narrow entries list (e.g. all 4+ entries well-formed but all sharing one quadrant)
    reports the correct ``MISSING_QUADRANTS`` reason instead of being misclassified as a generic shape
    defect."""
    if not isinstance(entries, list):
        return False, "SHAPE"
    if not entries:
        return False, "EMPTY"
    seen_quadrants: set[str] = set()
    for entry_dict in entries:
        if not isinstance(entry_dict, dict) or set(entry_dict.keys()) != _ENTRY_REQUIRED_KEYS:
            return False, "SHAPE"
        quadrant = entry_dict.get("quadrant")
        if quadrant not in QUADRANT_NAMES:
            return False, "UNKNOWN_QUADRANT"
        seen_quadrants.add(quadrant)
        if not _is_nonempty_str(entry_dict.get("content")):
            return False, "EMPTY_CONTENT"
        if entry_dict.get("basis") not in VALID_BASES:
            return False, "INVALID_BASIS"
    if QUADRANT_NAMES - seen_quadrants:
        return False, "MISSING_QUADRANTS"
    return True, None


def entry(quadrant: str, content: str, basis: str) -> dict[str, Any]:
    """One item of ``typed-objects/empathy-map.schema.yaml#/properties/entries``. Convenience constructor
    only -- emits ONLY the 3 known-good keys; does NOT itself enforce the 4-quadrant completeness invariant
    (``generate_empathy_map`` validates whatever list of dicts it is handed regardless of how each entry was
    built, same convention ``divergent.scamper``'s own ``entry`` already establishes)."""
    if quadrant not in QUADRANT_NAMES:
        raise InvariantViolation(f"EMPATHY_UNKNOWN_QUADRANT: {quadrant!r} is not one of {sorted(QUADRANT_NAMES)} (Atlas F06 L463 Says/Thinks/Does/Feels vocabulary)")
    if not _is_nonempty_str(content):
        raise InvariantViolation(f"EMPATHY_EMPTY_CONTENT: quadrant {quadrant!r} must carry non-empty content, got {content!r}")
    if basis not in VALID_BASES:
        raise InvariantViolation(
            f"EMPATHY_INVALID_BASIS: {basis!r} is not one of {sorted(VALID_BASES)} (Atlas F06 L463's own '標 fact/inference' instruction; "
            f"REQUIRED, never defaulted -- see module docstring)"
        )
    return {"quadrant": quadrant, "content": content, "basis": basis}


def generate_empathy_map(
    map_id: str,
    subject: str,
    entries: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/empathy-map.schema.yaml``.

    Enforces all three real invariants fail-closed, same family-wide "raise-before-construction" discipline
    every sibling module in this package already establishes -- never a record that itself proves it was
    built illegally.
    """
    if not _is_nonempty_str(map_id) or not map_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"EMPATHY_INVALID_ID: map_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {map_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"EMPATHY_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(subject):
        raise InvariantViolation(
            f"EMPATHY_EMPTY_SUBJECT: subject must be a non-empty string -- an empathy map with no named subject has not disclosed who is being "
            f"observed, got {subject!r}"
        )
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"EMPATHY_INVALID_PROVENANCE: provenance must be a schema-valid provenance_record, got {provenance!r}")

    valid, reason = _entries_are_valid(entries)
    if not valid:
        if reason == "EMPTY":
            raise InvariantViolation(
                f"EMPATHY_EMPTY_ENTRIES: entries must be a non-empty list -- an empathy map with zero observations has not actually observed "
                f"anything, got {entries!r}"
            )
        if reason == "UNKNOWN_QUADRANT":
            raise InvariantViolation(f"EMPATHY_UNKNOWN_QUADRANT: entries contains a quadrant outside {sorted(QUADRANT_NAMES)}, got {entries!r}")
        if reason == "EMPTY_CONTENT":
            raise InvariantViolation(f"EMPATHY_EMPTY_CONTENT: every entry must carry non-empty content, got {entries!r}")
        if reason == "INVALID_BASIS":
            raise InvariantViolation(f"EMPATHY_INVALID_BASIS: every entry's basis must be one of {sorted(VALID_BASES)}, got {entries!r}")
        if reason == "MISSING_QUADRANTS":
            missing = sorted(QUADRANT_NAMES - {e.get("quadrant") for e in entries if isinstance(e, dict)})
            raise InvariantViolation(
                f"EMPATHY_MISSING_QUADRANTS: entries must cover all 4 of {sorted(QUADRANT_NAMES)} at least once each -- Atlas F06 L463's own "
                f"Says/Thinks/Does/Feels IS the method's definition, missing {missing}, got {entries!r}"
            )
        raise InvariantViolation(f"EMPATHY_INVALID_ENTRY_SHAPE: entries must be a list of well-shaped {{quadrant, content, basis}} entries, got {entries!r}")

    return {
        "id": map_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject": subject,
        "entries": [dict(e) for e in entries],
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid.
    Record-level only (entries carry no per-entry provenance field -- see module docstring / method
    contract's own compilation_decisions: this whole F06 batch's deliberate record-level-only decision, same
    convention ``insight.persona``/``divergent.scamper``'s own identical gate already establishes)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_empathy_map_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives ALL real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_empathy_map``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. In particular, this is the ONLY place the
    cross-entry 4-quadrant completeness is re-checked from the record's own ``entries``. Fails closed on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("empathy_map_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("empathy_map_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("empathy_map_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject")):
        return _result("empathy_map_integrity", False, [{"reason": "EMPTY_SUBJECT"}], validator, timestamp)

    valid, reason = _entries_are_valid(record.get("entries"))
    if not valid:
        return _result(
            "empathy_map_integrity",
            False,
            [{"reason": f"entries invalid ({reason}) -- must cover all 4 quadrants {sorted(QUADRANT_NAMES)} at least once, each entry well-shaped"}],
            validator,
            timestamp,
        )

    return _result("empathy_map_integrity", True, [{"entry_count": len(record["entries"])}], validator, timestamp)


def evaluate_empathy_map_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the declared ``quality.provenance_required``
    property, then the independent structural-and-completeness integrity re-derivation. No
    ``evidence_labeling_required`` gate -- the contract sets that quality flag false (no
    ``supporting_evidence_refs`` field exists on this type; ``basis`` is the distinct Atlas-cited mechanism --
    see insight.empathy_map.contract.yaml's own ``quality``/``compilation_decisions``), same "only emit gates
    for what is actually declared true" discipline ``strategy.bcg_matrix``'s own ``evaluate_bcg_matrix_gates``
    already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_empathy_map_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
