"""``devops_sre.blue_green_deployment`` -- twenty-third Method Atlas slice, fourth from the `devops_sre` family.

Atlas §11.42's own explicit sequencing rule (L2192-2193, "Green 完整部署
與驗證後才切流量" -- Green is fully deployed and verified before traffic
cutover) directly implies a real invariant this module enforces: a plan
cannot claim ``cutover_status: cut_over`` while ``green_verified`` is
false -- same "raise before construction on a real, Atlas-implied
structural rule" discipline every prior forbidden-state guard this
session built already established.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "devops_sre.blue_green_deployment"
VALID_CUTOVER_STATUSES = frozenset({"not_cut_over", "cut_over"})


def generate_blue_green_deployment_plan(
    plan_id: str,
    blue_environment: str,
    green_environment: str,
    green_verified: bool,
    cutover_status: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    blue_retained: bool | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/blue-green-deployment-plan.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: both environments non-empty, cutover_status valid, and cutover_status:cut_over
    requires green_verified:true."""
    if not blue_environment or not blue_environment.strip():
        raise InvariantViolation("BLUEGREEN_EMPTY_BLUE_ENVIRONMENT: must be non-empty")
    if not green_environment or not green_environment.strip():
        raise InvariantViolation("BLUEGREEN_EMPTY_GREEN_ENVIRONMENT: must be non-empty")
    if cutover_status not in VALID_CUTOVER_STATUSES:
        raise InvariantViolation(f"BLUEGREEN_INVALID_CUTOVER_STATUS: {cutover_status!r} not in {sorted(VALID_CUTOVER_STATUSES)}")
    if cutover_status == "cut_over" and not green_verified:
        raise InvariantViolation("BLUEGREEN_CUTOVER_WITHOUT_VERIFICATION: Atlas's own rule (§11.42: Green fully deployed and verified before traffic cutover) forbids cutover_status:cut_over here")

    record: dict[str, Any] = {
        "id": plan_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "blue_environment": blue_environment,
        "green_environment": green_environment,
        "green_verified": green_verified,
        "cutover_status": cutover_status,
        "provenance": provenance,
    }
    if blue_retained is not None:
        record["blue_retained"] = blue_retained
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(plan: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(plan.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": plan.get("provenance")}], validator, timestamp)


def evaluate_cutover_requires_verification_gate(plan: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the verify-before-cutover invariant structurally on any record handed to it -- not just trusting
    the builder's own construction-time check already ran."""
    passed = not (plan.get("cutover_status") == "cut_over" and not plan.get("green_verified"))
    return _result("cutover_requires_verification", passed, [{"green_verified": plan.get("green_verified"), "cutover_status": plan.get("cutover_status")}], validator, timestamp)


def evaluate_blue_green_deployment_plan_gates(plan: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(plan, validator, timestamp),
        evaluate_cutover_requires_verification_gate(plan, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
