"""``devops_sre.stress_test`` -- thirty-sixth Method Atlas slice, ELEVENTH from the `devops_sre` family (F19).

Atlas's own formula (F19 tool table, L854: "超過預期負載→觀察
cliff/recovery", benefit "了解安全餘量") grounds FIVE real invariants
this module enforces: (1) `load_steps` has at least 2 entries with
STRICTLY increasing `load_rps` and the SAME resource-name set
throughout (reusing `devops_sre.load_test`'s own `_measurement_is_valid`
-shaped predicate, applied per-step); (2) at least one step's own
`load_rps` STRICTLY exceeds `expected_load_rps`; (3) `breaking_thresholds`
is valid and RE-VERIFIED BY THE GATE, not builder-only (the lesson
`devops_sre.capacity_model`'s and `devops_sre.load_test`'s own critic
rounds taught, applied here from the first draft); (4) `breaking_point`
is COMPUTED (`ai_lego.compute.stress_test.analysis.find_breaking_point`),
never caller-supplied, `null` a legitimate outcome; (5) `recovery` is
REQUIRED iff `breaking_point` is not null and FORBIDDEN otherwise, its
own `reduced_load_rps` STRICTLY below the breaking step's own
`load_rps`, and its own `recovered` FULLY DERIVED against
`breaking_thresholds` -- no caller override.

Reuses `devops_sre.load_test`'s own per-measurement shape: a step here
carries EXACTLY the same four fields
(`load_rps`/`latency_p95_ms`/`error_rate`/`resource_utilization`) that
method's own `_measurement_is_valid` checks, so this module reimplements
that same predicate rather than importing a private helper across
modules (the schema-layer reuse is the real cross-file sharing; the
runtime predicate is duplicated on purpose, the same "each module owns
its own runtime validation" boundary `devops_sre.game_day`'s own
independent predicates already draw relative to `devops_sre
.runbook_execution`'s).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.stress_test.analysis import find_breaking_point
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate, genuine_compute_provenance

METHOD_ID = "devops_sre.stress_test"
RECORD_ID_PREFIX = "STRESSTEST-"  # = typed-object schema id pattern; used only when the API auto-supplies record_id
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.stress_test.analysis.find_breaking_point"
_KNOWN_MEASUREMENT_KEYS = frozenset({"load_rps", "latency_p95_ms", "error_rate", "resource_utilization"})
_KNOWN_THRESHOLD_KEYS = frozenset({"latency_p95_ms_max", "error_rate_max"})
_KNOWN_RECOVERY_KEYS = frozenset({"reduced_load_rps", "latency_p95_ms", "error_rate", "recovered"})


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
    if not isinstance(utilization, dict) or not utilization:
        return False
    return all(_is_nonempty_str(name) and _is_fraction(value) for name, value in utilization.items())


def _measurement_is_valid(measurement: Any) -> bool:
    """Shared predicate: exactly the four known keys, load_rps finite and >= 0, latency_p95_ms finite and > 0,
    error_rate a fraction, a valid utilization map. Same shape as devops_sre.load_test's own measurement --
    reimplemented here (not imported) since each module owns its own runtime validation."""
    if not isinstance(measurement, dict) or set(measurement.keys()) != _KNOWN_MEASUREMENT_KEYS:
        return False
    return (
        _is_finite_nonnegative(measurement["load_rps"])
        and _is_finite_positive(measurement["latency_p95_ms"])
        and _is_fraction(measurement["error_rate"])
        and _utilization_map_is_valid(measurement["resource_utilization"])
    )


def _ladder_is_valid(load_steps: Any) -> bool:
    """Shared predicate: at least 2 valid measurements. Does NOT check ordering or resource-set equality --
    see ``_load_rps_is_strictly_increasing``/``_resource_sets_are_uniform``. Called by BOTH the builder and
    the gate."""
    if not isinstance(load_steps, list) or len(load_steps) < 2:
        return False
    return all(_measurement_is_valid(step) for step in load_steps)


def _load_rps_is_strictly_increasing(load_steps: list[dict[str, Any]]) -> bool:
    """Shared predicate (precondition: ``_ladder_is_valid`` already true): Atlas's own escalating-ladder order
    -- each step's own load_rps strictly exceeds the one before it."""
    return all(load_steps[i]["load_rps"] > load_steps[i - 1]["load_rps"] for i in range(1, len(load_steps)))


def _resource_sets_are_uniform(load_steps: list[dict[str, Any]]) -> bool:
    """Shared predicate (precondition: ``_ladder_is_valid`` already true): the SAME set of resource names
    across every step -- the same like-for-like discipline devops_sre.load_test's own resource-set invariant
    already establishes, extended from two measurements to N."""
    names = {frozenset(step["resource_utilization"]) for step in load_steps}
    return len(names) == 1


def _exceeds_expected_load(load_steps: list[dict[str, Any]], expected_load_rps: Any) -> bool:
    """Shared predicate (precondition: ``_ladder_is_valid`` already true, expected_load_rps already
    finite/positive): Atlas's own '超過預期負載' -- at least one step's own load_rps strictly exceeds the
    expected load."""
    return any(step["load_rps"] > expected_load_rps for step in load_steps)


def _thresholds_are_valid(thresholds: Any) -> bool:
    """Shared predicate: exactly the two known keys, latency_p95_ms_max finite and > 0, error_rate_max a
    fraction. Called by BOTH the builder and the gate -- the gate's own re-check applies the lesson
    devops_sre.capacity_model's and devops_sre.load_test's own critic rounds each caught."""
    if not isinstance(thresholds, dict) or set(thresholds.keys()) != _KNOWN_THRESHOLD_KEYS:
        return False
    return _is_finite_positive(thresholds["latency_p95_ms_max"]) and _is_fraction(thresholds["error_rate_max"])


def _recovery_shape_is_valid(recovery: Any) -> bool:
    """Shared predicate: exactly the four known keys, reduced_load_rps finite and > 0, latency_p95_ms finite
    and > 0, error_rate a fraction, recovered a bool. Does NOT check the reduced-load-vs-breaking-point
    coupling or recovered's own correctness -- see the callers below."""
    if not isinstance(recovery, dict) or set(recovery.keys()) != _KNOWN_RECOVERY_KEYS:
        return False
    return (
        _is_finite_positive(recovery["reduced_load_rps"])
        and _is_finite_positive(recovery["latency_p95_ms"])
        and _is_fraction(recovery["error_rate"])
        and isinstance(recovery["recovered"], bool)
    )


def _derive_recovered(latency_p95_ms: float, error_rate: float, thresholds: dict[str, Any]) -> bool:
    """Shared predicate: recovered iff BOTH the reduced-load latency and error rate are back within
    breaking_thresholds -- fully derived, no caller override, the same discipline devops_sre.load_test's own
    status already establishes."""
    return latency_p95_ms <= thresholds["latency_p95_ms_max"] and error_rate <= thresholds["error_rate_max"]


def generate_stress_test_record(
    record_id: str,
    system_under_test: str,
    expected_load_rps: float,
    load_steps: list[dict[str, Any]],
    breaking_thresholds: dict[str, Any],
    recovery: dict[str, Any] | None,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/stress-test-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed and COMPUTES breaking_point (and, when applicable, recovery.recovered), never
    accepting them from the caller. REBUILDS every nested object from known fields."""
    if not _is_nonempty_str(record_id) or not _is_nonempty_str(system_under_test):
        raise InvariantViolation(f"STRESSTEST_EMPTY_RECORD_FIELD: record_id/system_under_test must both be non-empty strings, got {record_id!r}/{system_under_test!r}")
    if not _is_finite_positive(expected_load_rps):
        raise InvariantViolation(f"STRESSTEST_INVALID_EXPECTED_LOAD: expected_load_rps must be a finite number > 0, got {expected_load_rps!r}")
    if not _ladder_is_valid(load_steps):
        raise InvariantViolation(f"STRESSTEST_INVALID_LADDER: load_steps must be a list of at least 2 valid load measurements, got {load_steps!r}")
    if not _load_rps_is_strictly_increasing(load_steps):
        raise InvariantViolation("STRESSTEST_LADDER_NOT_INCREASING: load_steps must be ordered by STRICTLY increasing load_rps -- Atlas's own formula (F19 L854) escalates, it does not repeat or reverse")
    if not _resource_sets_are_uniform(load_steps):
        raise InvariantViolation("STRESSTEST_RESOURCE_SET_MISMATCH: every load_steps entry must report the SAME set of resource names")
    if not _exceeds_expected_load(load_steps, expected_load_rps):
        raise InvariantViolation(f"STRESSTEST_NEVER_EXCEEDS_EXPECTED: no load_steps entry exceeds expected_load_rps={expected_load_rps!r} -- Atlas's own formula (F19 L854) requires exceeding the expected load")
    if not _thresholds_are_valid(breaking_thresholds):
        raise InvariantViolation(f"STRESSTEST_INVALID_THRESHOLDS: breaking_thresholds {breaking_thresholds!r} must carry exactly latency_p95_ms_max (finite, > 0) and error_rate_max (finite, in [0, 1])")

    rebuilt_steps = [{"load_rps": s["load_rps"], "latency_p95_ms": s["latency_p95_ms"], "error_rate": s["error_rate"], "resource_utilization": dict(s["resource_utilization"])} for s in load_steps]
    rebuilt_thresholds = {"latency_p95_ms_max": breaking_thresholds["latency_p95_ms_max"], "error_rate_max": breaking_thresholds["error_rate_max"]}
    breaking_point = find_breaking_point(rebuilt_steps, rebuilt_thresholds["latency_p95_ms_max"], rebuilt_thresholds["error_rate_max"])

    if breaking_point is None:
        if recovery is not None:
            raise InvariantViolation(f"STRESSTEST_UNEXPECTED_RECOVERY: breaking_point is null (no cliff found) but recovery={recovery!r} was supplied -- recovery is only meaningful after a real breaking point")
        rebuilt_recovery = None
    else:
        if recovery is None:
            raise InvariantViolation("STRESSTEST_MISSING_RECOVERY: breaking_point was found but no recovery observation was supplied -- Atlas's own formula (F19 L854) observes cliff/recovery together")
        if not _recovery_shape_is_valid(recovery):
            raise InvariantViolation(f"STRESSTEST_INVALID_RECOVERY: recovery {recovery!r} is not a valid recovery observation (unknown/missing keys or values out of range)")
        if not recovery["reduced_load_rps"] < breaking_point["load_rps"]:
            raise InvariantViolation(f"STRESSTEST_RECOVERY_NOT_REDUCED: recovery.reduced_load_rps={recovery['reduced_load_rps']!r} must be STRICTLY less than the breaking point's own load_rps={breaking_point['load_rps']!r}")
        computed_recovered = _derive_recovered(recovery["latency_p95_ms"], recovery["error_rate"], rebuilt_thresholds)
        if recovery["recovered"] != computed_recovered:
            raise InvariantViolation(f"STRESSTEST_RECOVERED_NOT_DERIVED: recovery.recovered={recovery['recovered']!r} does not match the computed value {computed_recovered!r} for latency_p95_ms={recovery['latency_p95_ms']!r}/error_rate={recovery['error_rate']!r} against breaking_thresholds")
        rebuilt_recovery = {"reduced_load_rps": recovery["reduced_load_rps"], "latency_p95_ms": recovery["latency_p95_ms"], "error_rate": recovery["error_rate"], "recovered": computed_recovered}

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_under_test": system_under_test,
        "expected_load_rps": expected_load_rps,
        "load_steps": rebuilt_steps,
        "breaking_thresholds": rebuilt_thresholds,
        "breaking_point": breaking_point,
        "recovery": rebuilt_recovery,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": genuine_compute_provenance(provenance),
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
    provenance/computation_provenance_ref/engine, all of which StressTestRecord also carries at the top level.
    NINTH reuse of this gate this session (after root_cause.pareto/decision.ahp/decision.mcda/devops_sre
    .error_budget/database_data.data_lineage/database_data.reconciliation/devops_sre.capacity_model/devops_sre
    .load_test -- carefully recounted after devops_sre.load_test's own critic round found the immediately
    prior ordinal wrong; computation.monte_carlo deliberately does NOT reuse it, per its own docstring)."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_stress_test_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- id/system_under_test/
    expected_load_rps, the ladder's own shape/ordering/resource-set uniformity/exceeds-expected, the
    breaking_thresholds' own validity, and only once those hold, RECOMPUTES breaking_point (and, if present,
    recovery.recovered) via the SAME functions the builder uses, comparing against the stored values. Does
    not trust any stored value. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("stress_test_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not _is_nonempty_str(record.get("system_under_test")):
        return _result("stress_test_integrity", False, [{"reason": "id/system_under_test missing or empty"}], validator, timestamp)
    if not _is_finite_positive(record.get("expected_load_rps")):
        return _result("stress_test_integrity", False, [{"reason": "expected_load_rps missing or invalid"}], validator, timestamp)
    load_steps = record.get("load_steps")
    if not _ladder_is_valid(load_steps):
        return _result("stress_test_integrity", False, [{"reason": "load_steps invalid (fewer than 2 entries, or a step is malformed)"}], validator, timestamp)
    if not _load_rps_is_strictly_increasing(load_steps):
        return _result("stress_test_integrity", False, [{"reason": "load_steps not strictly increasing"}], validator, timestamp)
    if not _resource_sets_are_uniform(load_steps):
        return _result("stress_test_integrity", False, [{"reason": "load_steps resource sets differ across steps"}], validator, timestamp)
    if not _exceeds_expected_load(load_steps, record["expected_load_rps"]):
        return _result("stress_test_integrity", False, [{"reason": "no load_steps entry exceeds expected_load_rps"}], validator, timestamp)
    thresholds = record.get("breaking_thresholds")
    if not _thresholds_are_valid(thresholds):
        return _result("stress_test_integrity", False, [{"reason": "breaking_thresholds invalid (unknown/missing keys or values out of range)"}], validator, timestamp)

    recomputed_breaking_point = find_breaking_point(load_steps, thresholds["latency_p95_ms_max"], thresholds["error_rate_max"])
    stored_breaking_point = record.get("breaking_point")
    if stored_breaking_point != recomputed_breaking_point:
        return _result("stress_test_integrity", False, [{"reason": "breaking_point mismatch", "stored": stored_breaking_point, "recomputed": recomputed_breaking_point}], validator, timestamp)

    recovery = record.get("recovery")
    if recomputed_breaking_point is None:
        if recovery is not None:
            return _result("stress_test_integrity", False, [{"reason": "recovery present but breaking_point is null"}], validator, timestamp)
        return _result("stress_test_integrity", True, [{"breaking_point": None, "steps_recorded": len(load_steps)}], validator, timestamp)

    if not _recovery_shape_is_valid(recovery):
        return _result("stress_test_integrity", False, [{"reason": "recovery missing or invalid (unknown/missing keys or values out of range)"}], validator, timestamp)
    if not recovery["reduced_load_rps"] < recomputed_breaking_point["load_rps"]:
        return _result("stress_test_integrity", False, [{"reason": "recovery.reduced_load_rps not strictly below the breaking point's own load_rps", "reduced_load_rps": recovery["reduced_load_rps"], "breaking_point_load_rps": recomputed_breaking_point["load_rps"]}], validator, timestamp)
    recomputed_recovered = _derive_recovered(recovery["latency_p95_ms"], recovery["error_rate"], thresholds)
    if recovery["recovered"] != recomputed_recovered:
        return _result("stress_test_integrity", False, [{"reason": "recovery.recovered mismatch", "stored": recovery["recovered"], "recomputed": recomputed_recovered}], validator, timestamp)

    return _result("stress_test_integrity", True, [{"breaking_point": recomputed_breaking_point, "recovered": recovery["recovered"], "steps_recorded": len(load_steps)}], validator, timestamp)


def evaluate_stress_test_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_stress_test_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
