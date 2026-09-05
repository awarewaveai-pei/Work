"""``devops_sre.capacity_model`` -- thirty-first Method Atlas slice, SIXTH from the `devops_sre` family
(F19).

Atlas's own benefit column (F19 tool table, L852: "防容量事故與過度採
購" -- prevent both capacity incidents AND over-provisioning) directly
implies the real invariant this module enforces: `status` is a
three-way classification (`insufficient` / `healthy` /
`over_provisioned`), FULLY DERIVED from a computed `headroom_ratio`
against two caller-supplied thresholds -- not a caller-asserted label,
and not a one-directional override the way `database_data
.backup_restore_drill`/`database_data.reconciliation`'s own status
fields legitimately allow (there is no operational-judgment reading of
"is this ratio above or below these two numbers" the way there is for
a drill's own pass/fail call).

`projected_workload`/`required_resources`/`headroom_ratio` are GENUINE
COMPUTE (`ai_lego.compute.capacity_model.projection`), never
caller-asserted -- the same Trusted Compute discipline every prior
CALCULATED_RESULT method in this package already established.
``evaluate_capacity_integrity_gate`` RECOMPUTES all three, and the
derived `status`, fresh from the record's own raw input fields rather
than trusting the stored computed fields.

A critic review of this slice's own first draft found the gate
recomputed the four COMPUTED fields but never re-validated the two
THRESHOLD fields the builder itself requires (`low_threshold_ratio <
high_threshold_ratio`, both finite) -- so a record hand-tampered to
reverse or infinitize its own thresholds passed every gate and the
schema, in one case making `status: healthy` mathematically
UNREACHABLE regardless of real headroom (silently defeating the
over-provisioning half of Atlas's own two-sided benefit), and in the
other certifying a resource at 0.03% of its required capacity as
`healthy`. Fixed with a single shared `_thresholds_are_valid` predicate
-- exactly the same "every precondition the builder enforces, the gate
re-verifies" invariant `database_data.expand_contract_migration`'s own
module docstring already commits to, applied here to the ONE
precondition class the first draft had missed: the builder's own raw
input fields, not just its own computed outputs.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.capacity_model.projection import compute_headroom_ratio, project_workload
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "devops_sre.capacity_model"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.capacity_model.projection.compute_headroom_ratio"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_real_number(value: Any) -> bool:
    """``bool`` is a subclass of ``int`` in Python -- excluded explicitly."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _thresholds_are_valid(low_threshold_ratio: Any, high_threshold_ratio: Any) -> bool:
    """Shared predicate: are both thresholds real, finite numbers with ``low < high``? Called by BOTH the
    builder's construction-time check and the gate's independent re-derivation -- a critic review of this
    slice's own first draft found the gate never re-checked this precondition at all, only the builder did,
    so a record hand-tampered to reverse or infinitize its own thresholds passed the gate unchallenged."""
    return (
        _is_real_number(low_threshold_ratio)
        and _is_real_number(high_threshold_ratio)
        and math.isfinite(low_threshold_ratio)
        and math.isfinite(high_threshold_ratio)
        and low_threshold_ratio < high_threshold_ratio
    )


def _derive_status(headroom_ratio: float, low_threshold_ratio: float, high_threshold_ratio: float) -> str:
    """Shared predicate: the three-way classification, computed the SAME way by both the builder and the
    gate's own independent re-derivation. Atlas's own benefit column names both failure directions, so
    `healthy` is deliberately the inclusive middle band (both boundary values count as healthy, not as
    insufficient/over_provisioned) -- there is no textual basis for treating either boundary as itself a
    failure state. Callers MUST validate thresholds via `_thresholds_are_valid` before calling this -- it
    does not itself re-check them."""
    if headroom_ratio < low_threshold_ratio:
        return "insufficient"
    if headroom_ratio > high_threshold_ratio:
        return "over_provisioned"
    return "healthy"


def generate_capacity_model_record(
    record_id: str,
    resource_name: str,
    current_workload: float,
    growth_rate_per_period: float,
    periods_ahead: int,
    resource_coefficient: float,
    current_capacity: float,
    low_threshold_ratio: float,
    high_threshold_ratio: float,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/capacity-model-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: record_id/resource_name non-empty, thresholds valid
    (``_thresholds_are_valid``), and every numeric input's own validity (delegated to
    ``ai_lego.compute.capacity_model.projection``, which now raises a domain exception -- not a raw
    TypeError/AttributeError -- on a non-numeric or overflowing value). ``projected_workload``/
    ``required_resources``/``headroom_ratio``/``status`` are always COMPUTED here, never caller-supplied."""
    if not _is_nonempty_str(record_id):
        raise InvariantViolation(f"CAPACITYMODEL_EMPTY_RECORD_ID: record_id must be a non-empty string, got {record_id!r}")
    if not _is_nonempty_str(resource_name):
        raise InvariantViolation(f"CAPACITYMODEL_EMPTY_RESOURCE_NAME: resource_name must be a non-empty string, got {resource_name!r}")
    if not _thresholds_are_valid(low_threshold_ratio, high_threshold_ratio):
        raise InvariantViolation(f"CAPACITYMODEL_INVALID_THRESHOLDS: low_threshold_ratio/high_threshold_ratio must both be finite numbers with low strictly less than high, got {low_threshold_ratio!r}/{high_threshold_ratio!r}")

    projected_workload = project_workload(current_workload, growth_rate_per_period, periods_ahead)
    computed = compute_headroom_ratio(projected_workload, resource_coefficient, current_capacity)
    status = _derive_status(computed["headroom_ratio"], low_threshold_ratio, high_threshold_ratio)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "resource_name": resource_name,
        "current_workload": current_workload,
        "growth_rate_per_period": growth_rate_per_period,
        "periods_ahead": periods_ahead,
        "resource_coefficient": resource_coefficient,
        "current_capacity": current_capacity,
        "low_threshold_ratio": low_threshold_ratio,
        "high_threshold_ratio": high_threshold_ratio,
        "projected_workload": projected_workload,
        "required_resources": computed["required_resources"],
        "headroom_ratio": computed["headroom_ratio"],
        "status": status,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- it only ever inspected
    provenance/computation_provenance_ref/engine, all of which CapacityModelRecord also carries at the top
    level. Seventh reuse of this gate this session (CORRECTED from "Eighth" by devops_sre.load_test's own
    critic round -- the six predecessors listed here plus this module make seven; after root_cause.pareto/decision.ahp/decision.mcda/
    devops_sre.error_budget/database_data.data_lineage/database_data.reconciliation, and -- via the
    reconciliation-slice's own null-provenance fail-closed fix -- benefiting every prior reuser too)."""
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_capacity_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid thresholds
    (``_thresholds_are_valid``) AND, only once those are confirmed valid, projected_workload,
    required_resources, headroom_ratio, and status via the SAME compute functions and the SAME
    ``_derive_status`` predicate the builder uses. Does not trust any stored value. FAILS CLOSED on
    malformed/missing/invalid input rather than crashing.

    A critic review of this slice's own first draft found this gate re-derived the four COMPUTED fields but
    never re-validated the two THRESHOLD fields the builder itself requires -- so a record hand-tampered to
    reverse or infinitize its own thresholds passed unchallenged. The threshold check now runs FIRST and
    independently of the computed-field recomputation below."""
    if not _thresholds_are_valid(record.get("low_threshold_ratio"), record.get("high_threshold_ratio")):
        return _result(
            "capacity_integrity", False,
            [{"reason": "threshold ordering/finiteness precondition violated", "low_threshold_ratio": record.get("low_threshold_ratio"), "high_threshold_ratio": record.get("high_threshold_ratio")}],
            validator, timestamp,
        )

    try:
        projected_workload = project_workload(record["current_workload"], record["growth_rate_per_period"], record["periods_ahead"])
        computed = compute_headroom_ratio(projected_workload, record["resource_coefficient"], record["current_capacity"])
        recomputed_status = _derive_status(computed["headroom_ratio"], record["low_threshold_ratio"], record["high_threshold_ratio"])
    except (KeyError, InvariantViolation, TypeError):
        return _result("capacity_integrity", False, [{"reason": "raw input fields missing or invalid -- cannot recompute"}], validator, timestamp)

    mismatches: dict[str, Any] = {}
    if record.get("projected_workload") != projected_workload:
        mismatches["projected_workload"] = {"stored": record.get("projected_workload"), "recomputed": projected_workload}
    if record.get("required_resources") != computed["required_resources"]:
        mismatches["required_resources"] = {"stored": record.get("required_resources"), "recomputed": computed["required_resources"]}
    if record.get("headroom_ratio") != computed["headroom_ratio"]:
        mismatches["headroom_ratio"] = {"stored": record.get("headroom_ratio"), "recomputed": computed["headroom_ratio"]}
    if record.get("status") != recomputed_status:
        mismatches["status"] = {"stored": record.get("status"), "recomputed": recomputed_status}

    passed = not mismatches
    return _result("capacity_integrity", passed, [{"mismatches": mismatches}], validator, timestamp)


def evaluate_capacity_model_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_capacity_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
