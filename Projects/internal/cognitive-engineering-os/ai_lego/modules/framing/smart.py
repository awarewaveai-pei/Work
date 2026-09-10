"""``framing.smart`` -- F01 framing family (methods/contracts/framing.smart.contract.yaml).

Atlas F01 table row (L335: "S/M/A/R/T 逐項補齊") + dedicated §12.4 section (L2584-2589), which also
states the limit this method's own contract compilation_decisions disclose: SMART must not be used to
nicely-quantify a wrong goal -- Goal Framing (``framing.goal_statement``, F01 row L334, built
concurrently in this same batch, not read here) must complete first. This method REFINES an
already-stated goal via 5 fixed criteria; it does not itself frame one.

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND
independently by a gate that re-derives from raw fields -- the same discipline
``ai_lego.modules.root_cause.kepner_tregoe`` already establishes:

1. ``criteria`` is EXACTLY the five entries {SPECIFIC, MEASURABLE, ACHIEVABLE, RELEVANT, TIME_BOUND},
   one each, in that literal order, each with a non-empty ``justification``.
2. The TIME_BOUND entry's ``target_date`` is a syntactically AND calendrically valid ISO-8601 date
   (e.g. rejects ``2026-02-30``). The schema's own ``format: date`` is annotation-only in this
   codebase (``SchemaContracts`` builds ``Draft202012Validator`` with no ``format_checker``) -- this
   module is the only real enforcement point.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "framing.smart"
RECORD_ID_PREFIX = "SMART-"
CRITERION_ORDER: tuple[str, ...] = ("SPECIFIC", "MEASURABLE", "ACHIEVABLE", "RELEVANT", "TIME_BOUND")
# Atlas's own literal five-letter F01 row (L335), transcribed verbatim and in Atlas's own order -- the
# same "positionally-ordered pipeline" invariant class root_cause.kepner_tregoe's own DIMENSION_ORDER
# already establishes.
TIME_BOUND_CRITERION = "TIME_BOUND"

_CRITERION_REQUIRED_KEYS = frozenset({"criterion", "justification", "provenance"})
_CRITERION_ALLOWED_KEYS = _CRITERION_REQUIRED_KEYS | frozenset({"target_date", "supporting_evidence_refs"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _valid_iso_date(value: Any) -> bool:
    """Syntactic AND calendrical validity (rejects e.g. '2026-02-30', which a bare regex would accept)."""
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _shaped(entry: Any, required_keys: frozenset[str], allowed_keys: frozenset[str]) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    return required_keys <= keys and keys <= allowed_keys


def _refs_shape_ok(entry: dict[str, Any]) -> bool:
    refs = entry.get("supporting_evidence_refs")
    return refs is None or (isinstance(refs, list) and bool(refs) and all(isinstance(r, str) for r in refs))


def _criteria_are_valid(criteria: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Real invariant: exactly 5 entries, one per
    CRITERION_ORDER value, POSITIONALLY in that literal order, each with a non-empty justification;
    TIME_BOUND carries a valid target_date, every OTHER criterion must NOT carry one (schema's own
    $defs/criterion_entry allows target_date structurally on any entry -- this is the runtime-layer
    tightening, same class of precision root_cause.kepner_tregoe's own "explicit empty is_not is
    malformed" check already establishes)."""
    if not isinstance(criteria, list) or len(criteria) != len(CRITERION_ORDER):
        return False, "SHAPE"
    for position, expected_criterion in enumerate(CRITERION_ORDER):
        entry = criteria[position]
        if not _shaped(entry, _CRITERION_REQUIRED_KEYS, _CRITERION_ALLOWED_KEYS):
            return False, "SHAPE"
        if entry.get("criterion") != expected_criterion:
            return False, "SHAPE"
        if not _is_nonempty_str(entry.get("justification")):
            return False, "EMPTY_JUSTIFICATION"
        if not _refs_shape_ok(entry):
            return False, "SHAPE"
        if expected_criterion == TIME_BOUND_CRITERION:
            if not _valid_iso_date(entry.get("target_date")):
                return False, "INVALID_TARGET_DATE"
        elif "target_date" in entry:
            return False, "SHAPE"  # target_date is TIME_BOUND-only
    return True, None


def criterion_entry(
    criterion: str,
    justification: str,
    provenance: dict[str, Any],
    *,
    target_date: str | None = None,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/smart-goal-record.schema.yaml#/properties/criteria``."""
    record: dict[str, Any] = {"criterion": criterion, "justification": justification, "provenance": provenance}
    if target_date is not None:
        record["target_date"] = target_date
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_smart_goal_record(
    record_id: str,
    goal_statement: str,
    criteria: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    refines_goal_statement_ref: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/smart-goal-record.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed, same family-wide "raise-before
    -construction" discipline every sibling module in this suite establishes -- never a record that
    itself proves it was built illegally.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SMART_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SMART_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(goal_statement):
        raise InvariantViolation(f"SMART_EMPTY_GOAL_STATEMENT: goal_statement must be a non-empty string, got {goal_statement!r}")
    if refines_goal_statement_ref is not None and not _is_nonempty_str(refines_goal_statement_ref):
        raise InvariantViolation(
            f"SMART_INVALID_REFINES_GOAL_STATEMENT_REF: refines_goal_statement_ref, when present, must be a non-empty string, got {refines_goal_statement_ref!r}"
        )

    criteria_ok, reason = _criteria_are_valid(criteria)
    if not criteria_ok:
        if reason == "EMPTY_JUSTIFICATION":
            raise InvariantViolation(f"SMART_EMPTY_JUSTIFICATION: every one of {CRITERION_ORDER} must carry a non-empty 'justification', got {criteria!r}")
        if reason == "INVALID_TARGET_DATE":
            raise InvariantViolation(f"SMART_INVALID_TARGET_DATE: TIME_BOUND must carry a syntactically and calendrically valid ISO-8601 target_date, got {criteria!r}")
        raise InvariantViolation(
            f"SMART_INVALID_CRITERIA_SET: criteria must be EXACTLY the five entries {CRITERION_ORDER} in that literal order, well-shaped, target_date TIME_BOUND-only, got {criteria!r}"
        )

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "goal_statement": goal_statement,
        "generated_by_method": generated_by_method,
        "criteria": [dict(c) for c in criteria],
        "provenance": provenance,
    }
    if refines_goal_statement_ref:
        record["refines_goal_statement_ref"] = refines_goal_statement_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every criterion AND the overall record carry a
    schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    criteria = record.get("criteria")
    criteria = criteria if isinstance(criteria, list) else []
    invalid = [c.get("criterion") for c in criteria if isinstance(c, dict) and not provenance_is_valid(c.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(criteria) and not invalid and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"criteria_checked": len(criteria), "invalid_provenance_criteria": invalid, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- same real structural check
    root_cause.kepner_tregoe already uses: an EVIDENCE-labeled criterion must actually cite
    supporting_evidence_refs."""
    criteria = record.get("criteria") if isinstance(record, dict) else None
    criteria = criteria if isinstance(criteria, list) else []
    problems: list[dict[str, Any]] = []
    for c in criteria:
        if not isinstance(c, dict):
            continue
        epistemic_type = (c.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"criterion": c.get("criterion"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not c.get("supporting_evidence_refs"):
            problems.append({"criterion": c.get("criterion"), "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(criteria) and not problems
    return _result("evidence_labeling_required", passed, [{"criteria_checked": len(criteria), "problems": problems}], validator, timestamp)


def evaluate_smart_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored
    value and does NOT call ``generate_smart_goal_record``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. FAILS CLOSED on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("smart_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("smart_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("smart_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("goal_statement")):
        return _result("smart_integrity", False, [{"reason": "goal_statement missing or empty"}], validator, timestamp)
    ref = record.get("refines_goal_statement_ref")
    if ref is not None and not _is_nonempty_str(ref):
        return _result("smart_integrity", False, [{"reason": "refines_goal_statement_ref present but not a non-empty string"}], validator, timestamp)

    criteria_ok, reason = _criteria_are_valid(record.get("criteria"))
    if not criteria_ok:
        return _result(
            "smart_integrity",
            False,
            [{"reason": f"criteria invalid ({reason}) -- must be exactly {CRITERION_ORDER} in that literal order, non-empty justification, target_date TIME_BOUND-only and calendar-valid"}],
            validator,
            timestamp,
        )

    return _result("smart_integrity", True, [{"criteria_count": len(record["criteria"])}], validator, timestamp)


def evaluate_smart_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality``
    properties, then the independent structural-integrity re-derivation."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_smart_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
