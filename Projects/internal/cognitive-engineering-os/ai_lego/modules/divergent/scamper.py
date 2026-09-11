"""``divergent.scamper`` -- 1st member of the `divergent` family (F03, Divergent Ideation),
methods/contracts/divergent.scamper.contract.yaml. F03 is entirely unbuilt before this entry (zero
pre-existing implementation, grep-confirmed).

Atlas cites this method TWICE: F03 table row (L383: "SCAMPER｜改造已有產品/流程｜Substitute/Combine/Adapt/
Modify/Put/Eliminate/Reverse｜系統化創新｜不等於市場驗證") and a dedicated §11.10 section (L1406-1432: the 7
lenses worked list, benefit "可產生大量具方向性的 variant", and an explicit limitation -- "它能產生 ideas，
不能證明 customer demand 或 business viability"). §4 additionally gives a rare literal composition formula
for this specific method (L189: "SCAMPER = EXPAND + ASSOCIATE + TRANSFORM").

**Different shape from its own "best combo" sibling**: F04's `association.morphological_analysis` cross-
references this method as its own best-paired predecessor for an "已有產品想改良" scenario (Atlas §28 L4471),
and that module's own docstring already flagged SCAMPER as an "unbuilt sibling at write time" doing
combinatorial dimension x option generation. SCAMPER here is NOT that shape: it is a 7-LENS CLOSED-VOCABULARY
transformation exercise over a single subject, one disclosed idea + reasoning per lens application -- no
dimensions, no combinatorial generation, no GENUINE_COMPUTE combination math. The only GENUINE_COMPUTE-adjacent
structural safeguard here is `validation_status` (see below), not a combinatorial artifact.

Two real invariant classes, each enforced BOTH at construction (raise BEFORE any record is built) AND
independently by a gate that re-derives from raw fields, same "shared predicate, reused by both layers"
discipline every sibling module in this suite already establishes:

1. ``entries``: a non-empty list of well-shaped ``{lens, transformed_idea, reasoning}`` entries, each
   ``lens`` one of the 7 Atlas-cited values (SUBSTITUTE/COMBINE/ADAPT/MODIFY/PUT/ELIMINATE/REVERSE -- see
   ``VALID_LENSES``), each ``transformed_idea``/``reasoning`` a non-empty string. No completeness requirement
   across the 7 lenses (Atlas gives none) and no lens-uniqueness requirement (Atlas gives none either) -- see
   the method contract's own ``compilation_decisions``.
2. ``validation_status`` must ALWAYS equal ``VALIDATION_STATUS`` ("UNVALIDATED_IDEATION") on every record this
   module builds -- structurally guaranteed by parameter elimination (``generate_scamper_session`` has no
   ``validation_status`` parameter at all, same "structural elimination" pattern
   ``strategy.business_model_canvas``'s own ``VALIDATION_STATUS`` constant already establishes for an
   analogous "don't let the output overclaim its own status" caution, here grounded in Atlas's own F03
   caution "不等於市場驗證" / §11.10's own explicit limitation). The independent gate re-checks this field
   against the record's own raw data anyway, so a hand-tampered record that bypassed the builder entirely
   (e.g. claiming ``VALIDATED``) is still caught.

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` case-insensitively
for "scamper" before writing any of this method's own files: zero pre-existing implementation (only the F04
cross-reference in ``ai_lego/modules/association/morphological_analysis.py``'s own module docstring, disclosed
above -- not a real contract/schema/module for this method).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "divergent.scamper"
RECORD_ID_PREFIX = "SCAMPER-"

SUBSTITUTE = "SUBSTITUTE"
COMBINE = "COMBINE"
ADAPT = "ADAPT"
MODIFY = "MODIFY"
PUT = "PUT"
ELIMINATE = "ELIMINATE"
REVERSE = "REVERSE"
VALID_LENSES: frozenset[str] = frozenset({SUBSTITUTE, COMBINE, ADAPT, MODIFY, PUT, ELIMINATE, REVERSE})
# Atlas's own F03 table row (L383) + §11.10 (L1410-1417) seven-value CLOSED vocabulary, SCREAMING_SNAKE_CASE.
# PUT (not PUT_TO_USE or PUT_TO_ANOTHER_USE) -- see method contract's own compilation_decisions for the full
# disclosure of the table-row-vs-dedicated-section wording difference.

VALIDATION_STATUS = "UNVALIDATED_IDEATION"
# Atlas's own F03 caution ("不等於市場驗證") and §11.10's own stated limitation, made structural (see module
# docstring "invariant 2"). NOT a caller-settable parameter of generate_scamper_session -- every record this
# builder produces carries exactly this value, no code path allows any other.

_ENTRY_REQUIRED_KEYS = frozenset({"lens", "transformed_idea", "reasoning"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _entry_shape_ok(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _ENTRY_REQUIRED_KEYS:
        return False
    if entry.get("lens") not in VALID_LENSES:
        return False
    if not _is_nonempty_str(entry.get("transformed_idea")):
        return False
    return _is_nonempty_str(entry.get("reasoning"))


def _entries_are_valid(entries: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift
    from the other -- same discipline every sibling module in this package establishes. Real invariant 1
    from the module docstring: a non-empty list of well-shaped ``{lens, transformed_idea, reasoning}``
    entries, each lens legal, each transformed_idea/reasoning non-empty."""
    if not isinstance(entries, list) or not entries:
        return False, "EMPTY"
    for entry in entries:
        if not isinstance(entry, dict) or set(entry.keys()) != _ENTRY_REQUIRED_KEYS:
            return False, "SHAPE"
        if entry.get("lens") not in VALID_LENSES:
            return False, "UNKNOWN_LENS"
        if not _is_nonempty_str(entry.get("transformed_idea")):
            return False, "EMPTY_TRANSFORMED_IDEA"
        if not _is_nonempty_str(entry.get("reasoning")):
            return False, "EMPTY_REASONING"
    return True, None


def entry(lens: str, transformed_idea: str, reasoning: str) -> dict[str, Any]:
    """One item of ``typed-objects/scamper-session.schema.yaml#/properties/entries``. Convenience
    constructor only -- emits ONLY the 3 known-good keys; does NOT itself enforce non-emptiness of the
    overall list (``generate_scamper_session`` validates whatever list of dicts it is handed regardless of
    how each entry was built, same convention ``strategy.business_model_canvas``'s own ``block_entry``
    already establishes)."""
    if lens not in VALID_LENSES:
        raise InvariantViolation(f"SCAMPER_UNKNOWN_LENS: {lens!r} is not one of {sorted(VALID_LENSES)} (Atlas F03 L383 / §11.10 L1410-1417 seven-lens vocabulary)")
    if not _is_nonempty_str(transformed_idea):
        raise InvariantViolation(f"SCAMPER_EMPTY_TRANSFORMED_IDEA: lens {lens!r} must carry a non-empty transformed_idea, got {transformed_idea!r}")
    if not _is_nonempty_str(reasoning):
        raise InvariantViolation(f"SCAMPER_EMPTY_REASONING: lens {lens!r} must carry non-empty reasoning, got {reasoning!r}")
    return {"lens": lens, "transformed_idea": transformed_idea, "reasoning": reasoning}


def generate_scamper_session(
    session_id: str,
    entries: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/scamper-session.schema.yaml``.

    Enforces real invariant 1 fail-closed, same family-wide "raise-before-construction" discipline every
    sibling module in this package already establishes. Invariant 2 (``validation_status``) is enforced by
    NOT accepting it as a parameter at all -- see module docstring "invariant 2". There is no code path
    through which a caller could construct a record via this builder whose stored ``validation_status``
    disagrees with ``VALIDATION_STATUS``.
    """
    if not _is_nonempty_str(session_id) or not session_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SCAMPER_INVALID_ID: session_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {session_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SCAMPER_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"SCAMPER_INVALID_PROVENANCE: provenance must be a schema-valid provenance_record, got {provenance!r}")

    valid, reason = _entries_are_valid(entries)
    if not valid:
        if reason == "EMPTY":
            raise InvariantViolation(
                f"SCAMPER_EMPTY_SESSION: entries must be a non-empty list -- a SCAMPER session with zero lens applications has not actually "
                f"transformed the subject (Atlas's own '系統化創新' / '可產生大量具方向性的 variant' benefit), got {entries!r}"
            )
        if reason == "UNKNOWN_LENS":
            raise InvariantViolation(f"SCAMPER_UNKNOWN_LENS: entries contains a lens outside {sorted(VALID_LENSES)}, got {entries!r}")
        if reason == "EMPTY_TRANSFORMED_IDEA":
            raise InvariantViolation(f"SCAMPER_EMPTY_TRANSFORMED_IDEA: every entry must carry a non-empty 'transformed_idea', got {entries!r}")
        if reason == "EMPTY_REASONING":
            raise InvariantViolation(f"SCAMPER_EMPTY_REASONING: every entry must carry non-empty 'reasoning', got {entries!r}")
        raise InvariantViolation(f"SCAMPER_INVALID_ENTRY_SHAPE: entries must be a list of well-shaped {{lens, transformed_idea, reasoning}} entries, got {entries!r}")

    return {
        "id": session_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "entries": [dict(e) for e in entries],
        "validation_status": VALIDATION_STATUS,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid.
    Record-level only (entries carry no per-entry provenance field -- see module docstring / method
    contract's own compilation_decisions: SCAMPER entries are ideation-stage creative transformations, not
    individually evidence-cited facts, same convention association.morphological_analysis already
    establishes for its own dimensions/constraints)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_scamper_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_scamper_session``, so a hand-tampered record that bypassed the builder
    entirely is caught here exactly as a builder-refused one would have been. In particular, this is the
    ONLY place ``validation_status`` is checked against ``VALIDATION_STATUS`` -- proves the builder's
    parameter-elimination guarantee is ALSO independently re-checked, not merely assumed because the
    builder never exposed the field (catches, e.g., a hand-tampered record claiming ``VALIDATED``). Fails
    closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("scamper_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("scamper_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("scamper_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    valid, reason = _entries_are_valid(record.get("entries"))
    if not valid:
        return _result(
            "scamper_integrity",
            False,
            [{"reason": f"entries invalid ({reason}) -- must be a non-empty list of well-shaped {{lens, transformed_idea, reasoning}} entries"}],
            validator,
            timestamp,
        )

    if record.get("validation_status") != VALIDATION_STATUS:
        return _result(
            "scamper_integrity",
            False,
            [{"reason": f"INVALID_VALIDATION_STATUS: expected exactly {VALIDATION_STATUS!r}, got {record.get('validation_status')!r}"}],
            validator,
            timestamp,
        )

    return _result("scamper_integrity", True, [{"entry_count": len(record["entries"])}], validator, timestamp)


def evaluate_scamper_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the declared ``quality.provenance_required``
    property, then the independent structural-integrity re-derivation (which also re-checks
    ``validation_status``). No ``evidence_labeling_required`` gate -- the contract sets that quality flag
    false (see divergent.scamper.contract.yaml's own ``quality``/``compilation_decisions``), same "only
    emit gates for what is actually declared true" discipline ``strategy.bcg_matrix``'s own
    ``evaluate_bcg_matrix_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_scamper_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
