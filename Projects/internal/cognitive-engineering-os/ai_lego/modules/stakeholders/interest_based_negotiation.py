"""``stakeholders.interest_based_negotiation`` -- F07 利害關係人／權力／協商 (Stakeholder / Power /
Negotiation) family, OPENING member (F07 had zero built methods before this batch -- grep-confirmed no
``ai_lego/modules/stakeholders/`` non-placeholder module existed at batch start; 1 of 10 concurrent agents
opening this family's 10 members in the same parallel batch).

Atlas's ONLY citation is the F07 tool table row (L494: "Interest-Based Negotiation｜從 position 轉 interests｜
人與問題分離→interests→options→客觀標準｜創造可接受方案") -- Fisher & Ury principled negotiation. Grep-confirmed
case-insensitively across the whole Atlas file: exactly 1 hit for this method's own row; §11.17 ZOPA's own
搭配 line (L1595: "BATNA + ZOPA + Interest-Based Negotiation") names this method as a companion of two OTHER
F07 siblings but adds no field structure of its own for THIS method, and an unrelated generic
policy-checklist chain ("→ Conflict / Negotiation", L3390) is a category label, not a method-specific
citation. No dedicated §11.x/§12.x section, no §4 composition formula, no §22.3 gate-table row.

Structurally the closest existing precedent is ``insight.interview`` (a fixed-length, positionally-named
pipeline where each stage is its own field rather than a uniform ``stages[]`` array) -- the row's own chain
names 4 semantically distinct steps (a narrative separation step, then 3 plural lists), so this module models
them as 4 separate named fields, 3 of them list-shaped, the same "shared predicate keyed by field name"
discipline ``insight.interview``'s own ``STAGE_FIELDS``/``LIST_STAGE_FIELDS`` split already establishes.

Two real invariants, both enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this package already establishes:

1. **All 4 of STAGE_FIELDS present and non-empty**, in the row's own literal order
   (``separate_people_from_problem``/``interests``/``options``/``objective_criteria``) -- none of the row's
   own 4 pipeline steps may be skipped; ``interests``/``options``/``objective_criteria`` must each be a
   non-empty list of non-empty strings (the row's own plural nouns), ``separate_people_from_problem`` a
   non-empty string.
2. **If the OPTIONAL ``position`` field is present (non-null), no ``interests`` entry may be a
   case/whitespace-insensitive verbatim echo of it** -- the row's own opening phrase, "從 position 轉
   interests" (transform position INTO interests), is not satisfied by a caller pasting the same text into
   ``interests`` under a different field name. ``position`` itself is nullable: a negotiation record
   legitimately may not have captured an explicit stated position, in which case this second invariant does
   not apply (nothing to echo). This mirrors ``framing.goal_statement``'s own ``success_condition != goal``
   echo-check class, generalized from a single-field pair to a per-list-entry check.

Provenance is RECORD-LEVEL ONLY (no per-item provenance on interests[]/options[]/objective_criteria[]
entries) -- matching ``insight.jtbd``/``insight.interview``'s own F06-batch placement, applied here as this
F07 batch's own equivalent decision, to avoid the per-item/record-level provenance-placement ambiguity that
hit the F02/F03 batches. An InterestBasedNegotiationRecord's fields describe one coherent negotiation
analysis, not a list of independently-sourced items each needing its own epistemic stamp.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for
"interest_based_negotiation"/"InterestBasedNegotiation" before writing any of this method's own files: zero
pre-existing implementation. This module does not import or reference any other F07 sibling (e.g. ZOPA/BATNA)
-- each of the 10 concurrent F07 build agents owns fully independent files.
"""

from __future__ import annotations

import unicodedata
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "stakeholders.interest_based_negotiation"
RECORD_ID_PREFIX = "IBN-"

# Atlas F07 table row's own literal chain (L494: "人與問題分離→interests→options→客觀標準"), transcribed
# verbatim and in the row's own order as 4 separate named fields (see module docstring for why this differs
# from a uniform stages[] array). LIST_STAGE_FIELDS names the 3 plural-list-shaped stages so callers and
# tests share one source of truth for "which fields are lists vs a plain string".
STAGE_FIELDS: tuple[str, ...] = (
    "separate_people_from_problem",
    "interests",
    "options",
    "objective_criteria",
)
assert len(STAGE_FIELDS) == 4, "Atlas L494's own chain has exactly 4 stages"
LIST_STAGE_FIELDS: frozenset[str] = frozenset({"interests", "options", "objective_criteria"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_null_or_nonempty_str(value: Any) -> bool:
    """``position``'s own shape: either None (no stated position was recorded -- legitimate) or a non-empty
    string (an empty string is refused, same discipline every other content field in this record uses)."""
    return value is None or _is_nonempty_str(value)


def _normalize(value: str) -> str:
    """Case/whitespace/Unicode-form-insensitive comparison key for the per-entry echo check (invariant #2).
    Same helper ROLE ``framing.goal_statement``'s own ``_normalize`` establishes for its own echo check, but
    NOT the same implementation -- ``framing.goal_statement.py`` is still plain ``casefold()`` as of this
    writing (an R4 claim-before-verify correction: an earlier version of this docstring claimed they were
    "the same", which was false; grep-confirmed before writing this correction).

    Two hardening passes, both from critic-found gaps (2026-09-11):
    1. ``unicodedata.normalize("NFKC", ...)`` runs first: without it, an NFD-decomposed or full-width-Latin
       restatement of ``position`` compares unequal to its own NFC/half-width original under plain
       ``casefold()``, silently defeating the one invariant this method's contract calls its "own distinctive
       contribution".
    2. Default-ignorable (Unicode category ``Cf`` -- zero-width space/joiner, soft hyphen, BOM, etc.) are
       stripped BEFORE the NFKC pass: NFKC alone does not remove them, so a single U+200B inserted into an
       otherwise-verbatim restatement rendered visually identical yet still compared unequal, an even easier
       bypass than the NFD/full-width cases NFKC alone already closes."""
    no_default_ignorables = "".join(char for char in value if unicodedata.category(char) != "Cf")
    return " ".join(unicodedata.normalize("NFKC", no_default_ignorables).strip().casefold().split())


def _is_nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(_is_nonempty_str(v) for v in value)


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline ``insight.jtbd``/``bcg_matrix``/``functional_decomposition``
    already establish."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _stage_value_is_valid(field: str, value: Any) -> bool:
    """Shared predicate for one stage's own value: the 3 list fields (interests/options/objective_criteria)
    need a non-empty list of non-empty strings, ``separate_people_from_problem`` needs a non-empty string.
    Called by BOTH the builder and the gate."""
    if field in LIST_STAGE_FIELDS:
        return _is_nonempty_str_list(value)
    return _is_nonempty_str(value)


def _stages_are_valid(record_like: dict[str, Any]) -> bool:
    """Invariant 1: all 4 of STAGE_FIELDS present in ``record_like`` with valid content. Does not check
    ``position`` (invariant 2, checked separately). Called by BOTH the builder and the gate."""
    return all(_stage_value_is_valid(field, record_like.get(field)) for field in STAGE_FIELDS)


def _position_echoed_by_interests(position: str, interests: list[Any]) -> bool:
    """Invariant 2's own predicate: True if ANY entry in ``interests`` normalizes to the same text as
    ``position``. Per-entry, not a whole-list check -- a caller could otherwise bury one verbatim-restated
    position among several genuine interests and still pass a whole-list-only comparison. Only meaningful
    once ``interests`` is already known to be a non-empty list of non-empty strings (callers check
    ``_stages_are_valid`` first); non-string entries are skipped rather than raising here, since a malformed
    ``interests`` list is already caught by invariant 1."""
    normalized_position = _normalize(position)
    return any(isinstance(entry, str) and _normalize(entry) == normalized_position for entry in interests)


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_interest_based_negotiation_record(
    record_id: str,
    separate_people_from_problem: str,
    interests: list[str],
    options: list[str],
    objective_criteria: list[str],
    provenance: dict[str, Any],
    *,
    position: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/interest-based-negotiation.schema.yaml``. Enforces both real invariants
    fail-closed, same family-wide "raise-before-construction" discipline every sibling module in this package
    already establishes: id/version/provenance shape, then the 4-stage completeness invariant, then
    ``position``'s own null-or-non-empty shape, then (only if ``position`` is not None) the per-entry
    anti-echo invariant against ``interests``.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"IBN_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"IBN_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"IBN_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    candidate = {
        "separate_people_from_problem": separate_people_from_problem,
        "interests": interests,
        "options": options,
        "objective_criteria": objective_criteria,
    }
    if not _stages_are_valid(candidate):
        invalid = [f for f in STAGE_FIELDS if not _stage_value_is_valid(f, candidate.get(f))]
        raise InvariantViolation(
            f"IBN_INVALID_STAGES: every one of the row's own 4 pipeline stages must be present and non-empty "
            f"(interests/options/objective_criteria as non-empty lists of non-empty strings, "
            f"separate_people_from_problem as a non-empty string); invalid/missing: {invalid}"
        )
    if not _is_null_or_nonempty_str(position):
        raise InvariantViolation(f"IBN_INVALID_POSITION: position must be None or a non-empty string, got {position!r}")
    if position is not None and _position_echoed_by_interests(position, interests):
        raise InvariantViolation(
            f"IBN_INTEREST_ECHOES_POSITION: at least one interests entry is a verbatim (case/whitespace-insensitive) echo "
            f"of position -- the row's own '從 position 轉 interests' transform verb is not satisfied by restating "
            f"position under a different field name, got position={position!r} interests={interests!r}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "separate_people_from_problem": separate_people_from_problem,
        "interests": list(interests),
        "options": list(options),
        "objective_criteria": list(objective_criteria),
        "position": position,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input. Never
# call generate_interest_based_negotiation_record -- a hand-tampered record that bypassed the builder
# entirely must be caught exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own RECORD-LEVEL provenance is
    schema-valid (no per-item provenance on interests[]/options[]/objective_criteria[] -- see module
    docstring). Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_ibn_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_interest_based_negotiation_record``, so a hand-tampered record that bypassed
    the builder entirely is caught here exactly as a builder-refused one would have been. Fails closed on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("ibn_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("ibn_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("ibn_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    if not _stages_are_valid(record):
        invalid = [f for f in STAGE_FIELDS if not _stage_value_is_valid(f, record.get(f))]
        return _result("ibn_integrity", False, [{"reason": f"one or more of the row's own 4 pipeline stages missing/invalid: {invalid}"}], validator, timestamp)

    position = record.get("position")
    if not _is_null_or_nonempty_str(position):
        return _result("ibn_integrity", False, [{"reason": "position present but not null and not a non-empty string"}], validator, timestamp)
    if position is not None and _position_echoed_by_interests(position, record["interests"]):
        return _result("ibn_integrity", False, [{"reason": "an interests entry verbatim-echoes position"}], validator, timestamp)

    return _result(
        "ibn_integrity",
        True,
        [{"interest_count": len(record["interests"]), "option_count": len(record["options"]), "criteria_count": len(record["objective_criteria"])}],
        validator,
        timestamp,
    )


def evaluate_interest_based_negotiation_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent structural integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract
    sets that flag to ``false``, same "only emit gates for what is actually declared true" discipline every
    sibling module already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_ibn_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
