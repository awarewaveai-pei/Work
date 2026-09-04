"""``devops_sre.chaos_engineering`` -- twenty-second Method Atlas slice, third from the `devops_sre` family.

Atlas §11.43's own explicit step 5 (L2216, "不符合預期立即停止" -- stop
immediately if not as expected) directly implies a real invariant this
module enforces: an experiment record claiming
``recovered_as_hypothesized: false`` must carry ``status: stopped``,
never ``completed`` -- same "raise before construction on a real,
Atlas-implied structural rule" discipline every prior forbidden-state
guard this session built already established.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "devops_sre.chaos_engineering"
VALID_STATUSES = frozenset({"completed", "stopped"})


def generate_chaos_experiment(
    experiment_id: str,
    steady_state_hypothesis: str,
    blast_radius: str,
    injected_failure: str,
    recovered_as_hypothesized: bool,
    status: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    findings: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/chaos-experiment.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: the 3 required protocol fields are non-empty, status is valid, and
    recovered_as_hypothesized:false forbids status:completed."""
    for name, value in (("steady_state_hypothesis", steady_state_hypothesis), ("blast_radius", blast_radius), ("injected_failure", injected_failure)):
        if not value or not value.strip():
            raise InvariantViolation(f"CHAOS_EMPTY_REQUIRED_FIELD: {name!r} must be non-empty")
    if status not in VALID_STATUSES:
        raise InvariantViolation(f"CHAOS_INVALID_STATUS: {status!r} not in {sorted(VALID_STATUSES)}")
    if not recovered_as_hypothesized and status == "completed":
        raise InvariantViolation("CHAOS_UNRECOVERED_CANNOT_COMPLETE: Atlas's own step 5 (§11.43: stop immediately if not as expected) forbids status:completed here")

    record: dict[str, Any] = {
        "id": experiment_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "steady_state_hypothesis": steady_state_hypothesis,
        "blast_radius": blast_radius,
        "injected_failure": injected_failure,
        "recovered_as_hypothesized": recovered_as_hypothesized,
        "status": status,
        "provenance": provenance,
    }
    if findings is not None:
        record["findings"] = findings
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(experiment: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(experiment.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": experiment.get("provenance")}], validator, timestamp)


def evaluate_unrecovered_forbids_completed_gate(experiment: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the recovered-forbids-completed invariant structurally on any record handed to it -- not just
    trusting the builder's own construction-time check already ran."""
    unrecovered = not experiment.get("recovered_as_hypothesized", True)
    passed = not (unrecovered and experiment.get("status") == "completed")
    return _result("unrecovered_forbids_completed", passed, [{"recovered_as_hypothesized": experiment.get("recovered_as_hypothesized"), "status": experiment.get("status")}], validator, timestamp)


def evaluate_chaos_experiment_gates(experiment: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(experiment, validator, timestamp),
        evaluate_unrecovered_forbids_completed_gate(experiment, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
