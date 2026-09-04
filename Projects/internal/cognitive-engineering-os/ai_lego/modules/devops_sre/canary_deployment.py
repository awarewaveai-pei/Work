"""``devops_sre.canary_deployment`` -- twenty-first Method Atlas slice, second from the `devops_sre` family.

Atlas §11.41's own explicit rule (L2172-2174, "任何階段 unhealthy:
ROLLBACK") directly implies a real invariant this module enforces: a plan
cannot claim ``outcome: completed`` while any of its stages is marked
unhealthy -- same "raise before construction on a real, Atlas-implied
structural rule" discipline every prior forbidden-state guard this
session built already established.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "devops_sre.canary_deployment"
VALID_TRAFFIC_PERCENTS = frozenset({1, 5, 25, 50, 100})
VALID_OUTCOMES = frozenset({"completed", "rolled_back", "in_progress"})


def generate_canary_deployment_plan(
    plan_id: str,
    release_under_rollout: str,
    stages: list[dict[str, Any]],
    outcome: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/canary-deployment-plan.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: at least 1 stage, every traffic_percent valid, outcome valid, and any unhealthy
    stage forbids outcome:completed."""
    if not stages:
        raise InvariantViolation("CANARY_NO_STAGES: at least 1 required")
    invalid_percents = sorted({s["traffic_percent"] for s in stages} - VALID_TRAFFIC_PERCENTS)
    if invalid_percents:
        raise InvariantViolation(f"CANARY_INVALID_TRAFFIC_PERCENT: {invalid_percents} not in {sorted(VALID_TRAFFIC_PERCENTS)}")
    if outcome not in VALID_OUTCOMES:
        raise InvariantViolation(f"CANARY_INVALID_OUTCOME: {outcome!r} not in {sorted(VALID_OUTCOMES)}")

    has_unhealthy = any(not s["healthy"] for s in stages)
    if has_unhealthy and outcome == "completed":
        raise InvariantViolation("CANARY_UNHEALTHY_STAGE_CANNOT_COMPLETE: Atlas's own rule (§11.41: any unhealthy stage -> ROLLBACK) forbids outcome:completed here")

    return {
        "id": plan_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "release_under_rollout": release_under_rollout,
        "stages": list(stages),
        "outcome": outcome,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(plan: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(plan.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": plan.get("provenance")}], validator, timestamp)


def evaluate_unhealthy_forbids_completed_gate(plan: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the unhealthy-forbids-completed invariant structurally on any record handed to it -- not just
    trusting the builder's own construction-time check already ran."""
    has_unhealthy = any(not s.get("healthy", True) for s in plan.get("stages", []))
    passed = not (has_unhealthy and plan.get("outcome") == "completed")
    return _result("unhealthy_forbids_completed", passed, [{"has_unhealthy_stage": has_unhealthy, "outcome": plan.get("outcome")}], validator, timestamp)


def evaluate_canary_deployment_plan_gates(plan: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(plan, validator, timestamp),
        evaluate_unhealthy_forbids_completed_gate(plan, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
