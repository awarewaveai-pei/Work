"""``devops_sre.load_test`` -- thirty-fifth Method Atlas slice, TENTH from the `devops_sre` family (F19).

Atlas's own formula (F19 tool table, L853: "baseline→target load→
latency/errors/resources", benefit "找性能瓶頸") grounds FIVE real
invariants this module enforces: (1) `target.load_rps` is STRICTLY
greater than `baseline.load_rps`; (2) both measurements report the
SAME set of resource names; (3) every measured number is finite and in
range; (4) the caller-supplied `acceptance` thresholds are valid --
re-verified by the gate, not builder-only (the lesson
`devops_sre.capacity_model`'s own critic round taught); (5)
`latency_ratio`/`error_rate_delta`/`bottleneck`/`status` are GENUINE
COMPUTE (`ai_lego.compute.load_test.comparison` plus the shared
`_derive_status` predicate), never caller-asserted, and `status` is
FULLY DERIVED with no conservative override (same reasoning as
capacity_model's own status). Requiring both measurements is this
record's encoding of EC §50's own "不要用單次 benchmark".

Written applying every lesson this session's own history established,
from the first draft: shared predicates for EVERY precondition
(record scalar fields, each measurement's own key set and value ranges,
the acceptance block's own key set and ranges, load ordering, resource-
set equality) called by BOTH the builder and the gate; the builder
REBUILDS every nested object (including the utilization map) so a
caller's later mutation cannot reach the stored record; and every
evidence list the gate emits is SORTED so its ordering is provable, not
incidental (the untested-sort class two prior slices' own critic
rounds each caught).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.load_test.comparison import compare_load_measurements, find_bottleneck
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "devops_sre.load_test"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.load_test.comparison.compare_load_measurements"
_KNOWN_MEASUREMENT_KEYS = frozenset({"load_rps", "latency_p95_ms", "error_rate", "resource_utilization"})
_KNOWN_ACCEPTANCE_KEYS = frozenset({"latency_p95_ms_max", "error_rate_max"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_real_number(value: Any) -> bool:
    """``bool`` is a subclass of ``int`` in Python -- excluded explicitly."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_finite_nonnegative(value: Any) -> bool:
    return _is_real_number(value) and math.isfinite(value) and value >= 0


def _is_finite_positive(value: Any) -> bool:
    return _is_real_number(value) and math.isfinite(value) and value > 0


def _is_fraction(value: Any) -> bool:
    return _is_real_number(value) and math.isfinite(value) and 0 <= value <= 1


def _utilization_map_is_valid(utilization: Any) -> bool:
    """Shared predicate: a non-empty dict of non-empty string names to finite fractions in [0, 1]."""
    if not isinstance(utilization, dict) or not utilization:
        return False
    return all(_is_nonempty_str(name) and _is_fraction(value) for name, value in utilization.items())


def _measurement_is_valid(measurement: Any) -> bool:
    """Shared predicate: is one load measurement fully valid -- exactly the four known keys, load_rps finite
    and >= 0, latency_p95_ms finite and > 0, error_rate a fraction, and a valid utilization map? Called by BOTH
    the builder (which additionally rebuilds from known fields) and the gate (where this IS the only defense,
    since the gate does not rebuild anything)."""
    if not isinstance(measurement, dict) or set(measurement.keys()) != _KNOWN_MEASUREMENT_KEYS:
        return False
    return (
        _is_finite_nonnegative(measurement["load_rps"])
        and _is_finite_positive(measurement["latency_p95_ms"])
        and _is_fraction(measurement["error_rate"])
        and _utilization_map_is_valid(measurement["resource_utilization"])
    )


def _acceptance_is_valid(acceptance: Any) -> bool:
    """Shared predicate: exactly the two known keys, latency_p95_ms_max finite and > 0, error_rate_max a
    fraction. Called by BOTH the builder and the gate -- the gate's own re-check is exactly what
    `devops_sre.capacity_model`'s own first draft was missing for its thresholds."""
    if not isinstance(acceptance, dict) or set(acceptance.keys()) != _KNOWN_ACCEPTANCE_KEYS:
        return False
    return _is_finite_positive(acceptance["latency_p95_ms_max"]) and _is_fraction(acceptance["error_rate_max"])


def _load_is_increased(baseline: dict[str, Any], target: dict[str, Any]) -> bool:
    """Shared predicate (precondition: both measurements valid): Atlas's own 'baseline->target load' order --
    the target load is STRICTLY greater than the baseline load."""
    return target["load_rps"] > baseline["load_rps"]


def _resource_set_mismatch(baseline: dict[str, Any], target: dict[str, Any]) -> dict[str, list[str]]:
    """Shared predicate (precondition: both measurements valid): which resource names appear on only one side?
    Returns ``{"only_in_baseline": [...], "only_in_target": [...]}`` with both lists SORTED (deterministic
    evidence), both empty when the sets match. Called by BOTH the builder and the gate."""
    baseline_names = set(baseline["resource_utilization"])
    target_names = set(target["resource_utilization"])
    return {
        "only_in_baseline": sorted(baseline_names - target_names),
        "only_in_target": sorted(target_names - baseline_names),
    }


def _derive_status(target: dict[str, Any], acceptance: dict[str, Any]) -> str:
    """Shared predicate (precondition: target and acceptance valid): passed iff the TARGET measurement's own p95
    AND error rate are each at or under their budget (both boundaries inclusive -- Atlas gives no basis for
    treating exactly-on-budget as a failure). Computed the SAME way by the builder and the gate; no caller
    override (see the method contract's own compilation_decisions)."""
    within_latency = target["latency_p95_ms"] <= acceptance["latency_p95_ms_max"]
    within_errors = target["error_rate"] <= acceptance["error_rate_max"]
    return "passed" if within_latency and within_errors else "failed"


def _rebuild_measurement(measurement: dict[str, Any]) -> dict[str, Any]:
    """Copy exactly the known fields, including a fresh copy of the utilization map, so the stored record never
    aliases the caller's own objects."""
    return {
        "load_rps": measurement["load_rps"],
        "latency_p95_ms": measurement["latency_p95_ms"],
        "error_rate": measurement["error_rate"],
        "resource_utilization": dict(measurement["resource_utilization"]),
    }


def _compute_fields(baseline: dict[str, Any], target: dict[str, Any], acceptance: dict[str, Any]) -> dict[str, Any]:
    """The four COMPUTED fields, derived the SAME way by the builder and the gate from validated inputs."""
    compared = compare_load_measurements(baseline["latency_p95_ms"], target["latency_p95_ms"], baseline["error_rate"], target["error_rate"])
    return {
        "latency_ratio": compared["latency_ratio"],
        "error_rate_delta": compared["error_rate_delta"],
        "bottleneck": find_bottleneck(target["resource_utilization"]),
        "status": _derive_status(target, acceptance),
    }


def generate_load_test_record(
    record_id: str,
    system_under_test: str,
    baseline: dict[str, Any],
    target: dict[str, Any],
    acceptance: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/load-test-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed and COMPUTES latency_ratio/error_rate_delta/bottleneck/status, never accepting
    them from the caller. REBUILDS both measurements and the acceptance block from known fields."""
    if not _is_nonempty_str(record_id) or not _is_nonempty_str(system_under_test):
        raise InvariantViolation(f"LOADTEST_EMPTY_RECORD_FIELD: record_id/system_under_test must both be non-empty strings, got {record_id!r}/{system_under_test!r}")
    if not _measurement_is_valid(baseline):
        raise InvariantViolation(f"LOADTEST_INVALID_MEASUREMENT: baseline {baseline!r} is not a valid load measurement (unknown/missing keys, or load_rps/latency_p95_ms/error_rate/resource_utilization out of range)")
    if not _measurement_is_valid(target):
        raise InvariantViolation(f"LOADTEST_INVALID_MEASUREMENT: target {target!r} is not a valid load measurement (unknown/missing keys, or load_rps/latency_p95_ms/error_rate/resource_utilization out of range)")
    if not _acceptance_is_valid(acceptance):
        raise InvariantViolation(f"LOADTEST_INVALID_ACCEPTANCE: {acceptance!r} must carry exactly latency_p95_ms_max (finite, > 0) and error_rate_max (finite, in [0, 1])")
    if not _load_is_increased(baseline, target):
        raise InvariantViolation(
            f"LOADTEST_LOAD_NOT_INCREASED: target.load_rps={target['load_rps']!r} must be STRICTLY greater than baseline.load_rps={baseline['load_rps']!r} -- "
            "Atlas's own formula (F19 L853) is baseline->target load, not a re-measurement at the same or lower load"
        )
    mismatch = _resource_set_mismatch(baseline, target)
    if mismatch["only_in_baseline"] or mismatch["only_in_target"]:
        raise InvariantViolation(f"LOADTEST_RESOURCE_SET_MISMATCH: baseline and target must report the same resource names, {mismatch}")

    rebuilt_baseline = _rebuild_measurement(baseline)
    rebuilt_target = _rebuild_measurement(target)
    rebuilt_acceptance = {"latency_p95_ms_max": acceptance["latency_p95_ms_max"], "error_rate_max": acceptance["error_rate_max"]}
    computed = _compute_fields(rebuilt_baseline, rebuilt_target, rebuilt_acceptance)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_under_test": system_under_test,
        "baseline": rebuilt_baseline,
        "target": rebuilt_target,
        "acceptance": rebuilt_acceptance,
        "latency_ratio": computed["latency_ratio"],
        "error_rate_delta": computed["error_rate_delta"],
        "bottleneck": computed["bottleneck"],
        "status": computed["status"],
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- it only ever inspects
    provenance/computation_provenance_ref/engine, all of which LoadTestRecord also carries at the top level.
    EIGHTH reuse of this gate this session (after root_cause.pareto/decision.ahp/decision.mcda/
    devops_sre.error_budget/database_data.data_lineage/database_data.reconciliation/devops_sre.capacity_model
    -- a critic review found capacity_model's own docstring called itself the eighth while listing six
    predecessors, and this module's first draft inherited that off-by-one; both corrected in the same commit.
    computation.monte_carlo deliberately does NOT reuse it, per its own docstring)."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_load_test_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- id/system_under_test,
    both measurements' own shape and ranges, the acceptance block's own validity, load ordering, resource-set
    equality -- and only once those hold, RECOMPUTES latency_ratio/error_rate_delta/bottleneck/status via the
    SAME compute functions and the SAME shared predicates the builder uses, comparing against the stored
    values. Does not trust any stored value. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("load_test_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not _is_nonempty_str(record.get("system_under_test")):
        return _result("load_test_integrity", False, [{"reason": "id/system_under_test missing or empty"}], validator, timestamp)
    baseline = record.get("baseline")
    target = record.get("target")
    if not _measurement_is_valid(baseline):
        return _result("load_test_integrity", False, [{"reason": "baseline measurement invalid (unknown/missing keys or values out of range)"}], validator, timestamp)
    if not _measurement_is_valid(target):
        return _result("load_test_integrity", False, [{"reason": "target measurement invalid (unknown/missing keys or values out of range)"}], validator, timestamp)
    acceptance = record.get("acceptance")
    if not _acceptance_is_valid(acceptance):
        return _result("load_test_integrity", False, [{"reason": "acceptance thresholds invalid (unknown/missing keys or values out of range)"}], validator, timestamp)
    if not _load_is_increased(baseline, target):
        return _result("load_test_integrity", False, [{"reason": "target load not strictly greater than baseline load", "baseline_load_rps": baseline["load_rps"], "target_load_rps": target["load_rps"]}], validator, timestamp)
    mismatch = _resource_set_mismatch(baseline, target)
    if mismatch["only_in_baseline"] or mismatch["only_in_target"]:
        return _result("load_test_integrity", False, [{"reason": "baseline/target resource sets differ", **mismatch}], validator, timestamp)

    try:
        computed = _compute_fields(baseline, target, acceptance)
    except InvariantViolation as error:
        return _result("load_test_integrity", False, [{"reason": f"cannot recompute: {error}"}], validator, timestamp)

    mismatches: dict[str, Any] = {}
    for field in ("latency_ratio", "error_rate_delta", "bottleneck", "status"):
        if record.get(field) != computed[field]:
            mismatches[field] = {"stored": record.get(field), "recomputed": computed[field]}
    return _result("load_test_integrity", not mismatches, [{"mismatches": mismatches}], validator, timestamp)


def evaluate_load_test_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_load_test_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
