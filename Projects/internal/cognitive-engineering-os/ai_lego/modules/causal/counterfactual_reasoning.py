"""``causal.counterfactual_reasoning`` -- F11 "Causal & Research Reasoning" family (methods/contracts/
causal.counterfactual_reasoning.contract.yaml), 2nd real member built (``causal.dag`` is the first). Built in
parallel with ``causal.theory_of_change`` / ``causal.logic_model`` / ``causal.process_tracing`` / ``causal.rct``
(4 other concurrent agents, same batch -- not read or depended on here, per this task's own scope boundary).

Atlas's ONLY citation for this method: F11 tool table row
(AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:617 -- "Counterfactual Reasoning｜比較 actual vs
no-intervention｜intervention→actual→counterfactual→assumptions｜明確因果基準"). Grep-confirmed zero other
mentions of "counterfactual" anywhere in the Atlas file -- no dedicated section exists, unlike ``causal.dag``'s
own §11.21 worked mermaid example.

**Due diligence (VERIFIED before writing):** grepped the whole ``ai_lego`` tree case-insensitively for
"counterfactual" -- zero pre-existing implementation.

**Structural point, taken literally from the table's own 4-stage pipeline:** this method exists to make an
explicit WHAT-IF comparison. Two real invariants, both enforced at construction (raise BEFORE any record is
built) AND independently re-derived by a gate that never trusts a stored value, same two-layer discipline
every sibling module in this suite already establishes:

1. ``intervention``/``actual_outcome``/``counterfactual_outcome`` must be pairwise distinct
   (case/whitespace-insensitive) -- same "not an echo" class ``ai_lego/modules/framing/problem_statement.py``'s
   own ``expected_state != current_state`` check already establishes, extended here to all 3 pairs:
   ``actual_outcome == counterfactual_outcome`` is the core degenerate case (no real comparative claim is
   being made at all); ``intervention`` colliding with either outcome field is a different but equally real
   copy-paste echo.
2. ``assumptions`` must be a non-empty list of non-empty strings -- Atlas's own 4th pipeline stage. An
   unstated counterfactual claim with zero disclosed assumptions is exactly the correlation=causation trap
   F11's own shared framing rule (L635, "每條 edge 都應綁 evidence/rationale/confidence", written for
   ``causal.dag``'s per-edge shape) exists to prevent -- generalized here to this method's own single-claim
   shape as a disclosure requirement, not reused verbatim as a per-assumption evidence/rationale/confidence
   object (see the method contract's own ``compilation_decisions`` for the full reasoning on why that shape
   does not transfer).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "causal.counterfactual_reasoning"
RECORD_ID_PREFIX = "CFR-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same helper role as
    ``framing/problem_statement.py``'s own ``_normalize``, reused for the identical echo-invariant purpose."""
    return " ".join(value.strip().casefold().split())


def _outcomes_are_distinct(intervention: Any, actual_outcome: Any, counterfactual_outcome: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this suite already establishes.

    Assumes all 3 arguments already passed the non-empty-string check; only called after that.
    """
    normalized_intervention = _normalize(intervention)
    normalized_actual = _normalize(actual_outcome)
    normalized_counterfactual = _normalize(counterfactual_outcome)
    if normalized_actual == normalized_counterfactual:
        return False, "COUNTERFACTUAL_ECHOES_ACTUAL"
    if normalized_actual == normalized_intervention:
        return False, "ACTUAL_ECHOES_INTERVENTION"
    if normalized_counterfactual == normalized_intervention:
        return False, "COUNTERFACTUAL_ECHOES_INTERVENTION"
    return True, None


def _assumptions_are_valid(assumptions: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate.

    Real invariant: >=1 entry (Atlas's own 4th pipeline stage), every entry a non-empty string.
    """
    if not isinstance(assumptions, list) or len(assumptions) < 1:
        return False, "TOO_FEW"
    if not all(_is_nonempty_str(a) for a in assumptions):
        return False, "SHAPE"
    return True, None


def generate_counterfactual_reasoning_record(
    record_id: str,
    intervention: str,
    actual_outcome: str,
    counterfactual_outcome: str,
    assumptions: list[str],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/counterfactual-reasoning-record.schema.yaml``.

    Enforces both real invariants fail-closed -- never a record that itself proves it was built illegally,
    same family-wide "raise-before-construction" discipline every sibling module in this suite already
    establishes.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"COUNTERFACTUAL_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"COUNTERFACTUAL_INVALID_VERSION: version must be a string, got {version!r}")

    if not _is_nonempty_str(intervention):
        raise InvariantViolation(f"COUNTERFACTUAL_EMPTY_INTERVENTION: intervention must be a non-empty string, got {intervention!r}")
    if not _is_nonempty_str(actual_outcome):
        raise InvariantViolation(f"COUNTERFACTUAL_EMPTY_ACTUAL_OUTCOME: actual_outcome must be a non-empty string, got {actual_outcome!r}")
    if not _is_nonempty_str(counterfactual_outcome):
        raise InvariantViolation(f"COUNTERFACTUAL_EMPTY_COUNTERFACTUAL_OUTCOME: counterfactual_outcome must be a non-empty string, got {counterfactual_outcome!r}")

    distinct, reason = _outcomes_are_distinct(intervention, actual_outcome, counterfactual_outcome)
    if not distinct:
        if reason == "COUNTERFACTUAL_ECHOES_ACTUAL":
            raise InvariantViolation(
                f"COUNTERFACTUAL_COUNTERFACTUAL_ECHOES_ACTUAL: counterfactual_outcome must genuinely differ from actual_outcome (case/whitespace-insensitive) "
                f"-- an identical pair makes no real WHAT-IF comparison, got actual_outcome={actual_outcome!r} counterfactual_outcome={counterfactual_outcome!r}"
            )
        if reason == "ACTUAL_ECHOES_INTERVENTION":
            raise InvariantViolation(
                f"COUNTERFACTUAL_ACTUAL_ECHOES_INTERVENTION: actual_outcome must genuinely differ from intervention (case/whitespace-insensitive), "
                f"got intervention={intervention!r} actual_outcome={actual_outcome!r}"
            )
        raise InvariantViolation(
            f"COUNTERFACTUAL_COUNTERFACTUAL_ECHOES_INTERVENTION: counterfactual_outcome must genuinely differ from intervention (case/whitespace-insensitive), "
            f"got intervention={intervention!r} counterfactual_outcome={counterfactual_outcome!r}"
        )

    assumptions_ok, assumptions_reason = _assumptions_are_valid(assumptions)
    if not assumptions_ok:
        if assumptions_reason == "TOO_FEW":
            raise InvariantViolation(
                f"COUNTERFACTUAL_EMPTY_ASSUMPTIONS: assumptions must carry at least 1 entry (Atlas's own 4th pipeline stage -- an undisclosed-assumption "
                f"counterfactual claim is the correlation=causation risk F11's own framing rule exists to prevent), got {assumptions!r}"
            )
        raise InvariantViolation(f"COUNTERFACTUAL_INVALID_ASSUMPTIONS: every assumptions entry must be a non-empty string, got {assumptions!r}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "intervention": intervention,
        "actual_outcome": actual_outcome,
        "counterfactual_outcome": counterfactual_outcome,
        "assumptions": list(assumptions),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own whole-record provenance_record is
    schema-valid. Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"record_provenance_valid": passed}], validator, timestamp)


def evaluate_counterfactual_reasoning_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives both real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_counterfactual_reasoning_record``, so a hand-tampered record that bypassed the
    builder entirely is caught here exactly as a builder-refused one would have been. Fails closed on
    malformed input."""
    if not isinstance(record, dict):
        return _result("counterfactual_reasoning_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("counterfactual_reasoning_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("counterfactual_reasoning_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    intervention = record.get("intervention")
    actual_outcome = record.get("actual_outcome")
    counterfactual_outcome = record.get("counterfactual_outcome")
    if not _is_nonempty_str(intervention):
        return _result("counterfactual_reasoning_integrity", False, [{"reason": "intervention missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(actual_outcome):
        return _result("counterfactual_reasoning_integrity", False, [{"reason": "actual_outcome missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(counterfactual_outcome):
        return _result("counterfactual_reasoning_integrity", False, [{"reason": "counterfactual_outcome missing or empty"}], validator, timestamp)

    distinct, reason = _outcomes_are_distinct(intervention, actual_outcome, counterfactual_outcome)
    if not distinct:
        return _result("counterfactual_reasoning_integrity", False, [{"reason": reason}], validator, timestamp)

    assumptions_ok, assumptions_reason = _assumptions_are_valid(record.get("assumptions"))
    if not assumptions_ok:
        return _result("counterfactual_reasoning_integrity", False, [{"reason": f"assumptions invalid ({assumptions_reason})"}], validator, timestamp)

    return _result(
        "counterfactual_reasoning_integrity",
        True,
        [{"assumptions_count": len(record["assumptions"])}],
        validator,
        timestamp,
    )


def evaluate_counterfactual_reasoning_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_counterfactual_reasoning_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
