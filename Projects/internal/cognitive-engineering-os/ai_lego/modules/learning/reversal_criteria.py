"""``learning.reversal_criteria`` -- eighth Method Atlas slice, first from the ``learning`` family (F17), and the
first method whose subject is a ``Decision`` reference rather than a ``CauseHypothesisSet`` chain or a standalone
analytical run.

A fifth structural shape this session: not a chain (five_whys), a
calculated ranking (pareto), a graph (causal.dag), or a pairwise-comparison
matrix (decision.ahp) -- a set of MONITORING RULES (indicator + condition +
committed action + accountable owner, Atlas §11.33's own worked YAML
example, L1980-1985), meant to be evaluated over time against real
observations via ``ai_lego/compute/monitoring/triggers.py``, not produced
once and left static.

Builds instances of ``typed-objects/reversal-criteria-set.schema.yaml``,
whose ``criteria[]`` items EMBED the already-ratified
``specs/decision/reversal.schema.yaml#/definitions/single_indicator_form``
(``indicator``/``condition``/``action``/``owner``) rather than a
competing, independently-invented shape -- corrected 2026-09-04, same
session, after a later read of ``specs/decision/decision.schema.yaml``
surfaced that this exact concept already had a canonical schema this
module's first draft had not checked for. ``reversal_criterion()``'s own
``condition`` parameter is named to match that embedded schema's field
name directly, not a locally-invented synonym.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.monitoring.triggers import VALID_OPERATORS, consecutive_threshold_triggered
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "learning.reversal_criteria"


def structured_rule(op: str, threshold: float, consecutive_periods: int) -> dict[str, Any]:
    """One optional ``structured_rule`` value. Validated eagerly against
    ``ai_lego.compute.monitoring.triggers``'s own known operator set, same discipline
    ``swot_factor``'s category check and ``dag_node``'s role check already established."""
    if op not in VALID_OPERATORS:
        raise InvariantViolation(f"REVERSALCRITERIA_UNKNOWN_OPERATOR: {op!r} not one of {sorted(VALID_OPERATORS)}")
    if consecutive_periods < 1:
        raise InvariantViolation(f"REVERSALCRITERIA_INVALID_CONSECUTIVE_PERIODS: {consecutive_periods} (must be >= 1)")
    return {"operator": op, "threshold": threshold, "consecutive_periods": consecutive_periods}


def reversal_criterion(
    criterion_id: str,
    indicator: str,
    condition: str,
    action: str,
    owner: str,
    provenance: dict[str, Any],
    *,
    rule: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/reversal-criteria-set.schema.yaml#/properties/criteria`` -- an instance of
    ``specs/decision/reversal.schema.yaml#/definitions/single_indicator_form`` (field names ``indicator``/
    ``condition``/``action``/``owner`` match that embedded schema directly) plus this method's own ``id``/
    ``structured_rule`` additions.

    ``action``/``owner`` are validated non-empty at construction time
    (method contract precondition: a criterion with no accountable owner
    or defined action is decorative, not enforceable -- Atlas's own named
    benefit, L1990)."""
    if not action.strip():
        raise InvariantViolation(f"REVERSALCRITERIA_EMPTY_ACTION: criterion {criterion_id!r} has no action")
    if not owner.strip():
        raise InvariantViolation(f"REVERSALCRITERIA_EMPTY_OWNER: criterion {criterion_id!r} has no owner")
    record: dict[str, Any] = {
        "id": criterion_id,
        "indicator": indicator,
        "condition": condition,
        "action": action,
        "owner": owner,
        "provenance": provenance,
    }
    if rule is not None:
        record["structured_rule"] = rule
    return record


def generate_reversal_criteria_set(
    set_id: str,
    decision_ref: str,
    criteria: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/reversal-criteria-set.schema.yaml``. Enforces the method contract's own
    precondition (at least one criterion) fail-closed."""
    if not criteria:
        raise InvariantViolation("REVERSALCRITERIA_EMPTY_SET: reversal-criteria-set.schema.yaml requires criteria minItems:1")
    return {
        "id": set_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "decision_ref": decision_ref,
        "criteria": list(criteria),
        "provenance": provenance,
    }


def evaluate_criterion_trigger(criterion: dict[str, Any], observations: list[float]) -> bool | None:
    """Evaluates ``criterion["structured_rule"]`` (if present) against ``observations`` via the real compute
    layer. Returns ``None`` (not evaluable) for a purely qualitative criterion with no ``structured_rule`` --
    NEVER guessed as True or False, since there is nothing mechanical to check."""
    rule = criterion.get("structured_rule")
    if rule is None:
        return None
    return consecutive_threshold_triggered(observations, rule["operator"], rule["threshold"], rule["consecutive_periods"])


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(criteria_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every criterion and the overall record carry a
    schema-valid provenance_record."""
    criteria = criteria_set.get("criteria", [])
    invalid = [c["id"] for c in criteria if not provenance_is_valid(c.get("provenance"))]
    overall_valid = provenance_is_valid(criteria_set.get("provenance"))
    passed = bool(criteria) and not invalid and overall_valid
    return _result("provenance_required", passed, [{"criteria_checked": len(criteria), "invalid_provenance_ids": invalid, "overall_provenance_valid": overall_valid}], validator, timestamp)


def evaluate_actionable_gate(criteria_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Method contract precondition, re-checked here as a real structural gate (not just a one-time construction
    check a hand-crafted record could bypass): every criterion names a non-empty owner and action. Atlas's own
    named benefit (L1990) -- prevents the organization refusing to change course to save face -- depends on this."""
    criteria = criteria_set.get("criteria", [])
    problems = [c.get("id") for c in criteria if not (c.get("owner") or "").strip() or not (c.get("action") or "").strip()]
    passed = bool(criteria) and not problems
    return _result("actionable", passed, [{"criteria_checked": len(criteria), "non_actionable_ids": problems}], validator, timestamp)


def evaluate_reversal_criteria_gates(criteria_set: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(criteria_set, validator, timestamp),
        evaluate_actionable_gate(criteria_set, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
