"""``devops_sre.soak_test`` -- thirty-seventh Method Atlas slice, TWELFTH from the `devops_sre` family (F19).

Atlas's own formula (F19 tool table, L855: "持續負載→memory/resource
leak→degradation", benefit "找慢性問題") grounds SIX real invariants
this module enforces: (1) `samples` has at least 3 entries (Atlas's own
"持續" implies a real duration, not a two-point snapshot); (2)
`elapsed_minutes` is STRICTLY increasing across samples; (3) EVERY
sample's own `measurement.load_rps` EQUALS `sustained_load_rps` --
Atlas's own "持續負載", the exact opposite discipline from
`devops_sre.stress_test`'s own escalating ladder; (4) every sample
reports the SAME set of resource names; (5) `degradation_thresholds` is
valid and RE-VERIFIED BY THE GATE, not builder-only (the lesson
`devops_sre.capacity_model`'s, `devops_sre.load_test`'s, and
`devops_sre.stress_test`'s own critic rounds each taught, applied here
from the first draft); (6) `degradation` is COMPUTED (first sample vs
last sample), never caller-supplied, `overall_degraded` fully derived
with no caller override.

Reuses `devops_sre.load_test`'s own per-measurement shape (the same
four fields `devops_sre.stress_test`'s own `_measurement_is_valid`
checks); reimplemented here (not imported), the same "each module owns
its own runtime validation" boundary that module's own docstring
already draws.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.soak_test.analysis import detect_degradation
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "devops_sre.soak_test"
RECORD_ID_PREFIX = "SOAKTEST-"  # = typed-object schema id pattern; used only when the API auto-supplies record_id
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.soak_test.analysis.detect_degradation"
_KNOWN_MEASUREMENT_KEYS = frozenset({"load_rps", "latency_p95_ms", "error_rate", "resource_utilization"})
_KNOWN_SAMPLE_KEYS = frozenset({"elapsed_minutes", "measurement"})
_KNOWN_THRESHOLD_KEYS = frozenset({"latency_p95_increase_ms_max", "error_rate_increase_max", "resource_increase_max"})
_KNOWN_DEGRADATION_KEYS = frozenset({"latency_degraded", "error_rate_degraded", "degraded_resources", "overall_degraded"})


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
    error_rate a fraction, a valid utilization map. Same shape as devops_sre.load_test's/devops_sre
    .stress_test's own measurement -- reimplemented here, not imported."""
    if not isinstance(measurement, dict) or set(measurement.keys()) != _KNOWN_MEASUREMENT_KEYS:
        return False
    return (
        _is_finite_nonnegative(measurement["load_rps"])
        and _is_finite_positive(measurement["latency_p95_ms"])
        and _is_fraction(measurement["error_rate"])
        and _utilization_map_is_valid(measurement["resource_utilization"])
    )


def _sample_is_valid(sample: Any) -> bool:
    """Shared predicate: exactly the two known keys, elapsed_minutes finite and >= 0, a valid measurement."""
    if not isinstance(sample, dict) or set(sample.keys()) != _KNOWN_SAMPLE_KEYS:
        return False
    return _is_finite_nonnegative(sample["elapsed_minutes"]) and _measurement_is_valid(sample["measurement"])


def _samples_are_valid(samples: Any) -> bool:
    """Shared predicate: at least 3 valid samples. Does NOT check ordering, constant-load, or resource-set
    uniformity -- see the dedicated predicates below. Called by BOTH the builder and the gate."""
    if not isinstance(samples, list) or len(samples) < 3:
        return False
    return all(_sample_is_valid(s) for s in samples)


def _elapsed_minutes_strictly_increasing(samples: list[dict[str, Any]]) -> bool:
    """Shared predicate (precondition: ``_samples_are_valid`` already true): Atlas's own time-ordered series --
    each sample's own elapsed_minutes strictly exceeds the one before it."""
    return all(samples[i]["elapsed_minutes"] > samples[i - 1]["elapsed_minutes"] for i in range(1, len(samples)))


def _load_matches_sustained(samples: list[dict[str, Any]], sustained_load_rps: Any) -> bool:
    """Shared predicate (precondition: ``_samples_are_valid`` already true, sustained_load_rps already
    finite/positive): Atlas's own '持續負載' -- EVERY sample's own measurement.load_rps EQUALS the declared
    constant load level."""
    return all(s["measurement"]["load_rps"] == sustained_load_rps for s in samples)


def _resource_sets_are_uniform(samples: list[dict[str, Any]]) -> bool:
    """Shared predicate (precondition: ``_samples_are_valid`` already true): the SAME set of resource names
    across every sample's own measurement -- the same like-for-like discipline devops_sre.load_test's and
    devops_sre.stress_test's own resource-set invariants already establish."""
    names = {frozenset(s["measurement"]["resource_utilization"]) for s in samples}
    return len(names) == 1


def _thresholds_are_valid(thresholds: Any) -> bool:
    """Shared predicate: exactly the three known keys, all finite and non-negative (the two fraction fields
    additionally bounded to [0, 1]). Called by BOTH the builder and the gate -- the gate's own re-check
    applies the lesson devops_sre.capacity_model's, devops_sre.load_test's, and devops_sre.stress_test's own
    critic rounds each caught."""
    if not isinstance(thresholds, dict) or set(thresholds.keys()) != _KNOWN_THRESHOLD_KEYS:
        return False
    return (
        _is_finite_nonnegative(thresholds["latency_p95_increase_ms_max"])
        and _is_fraction(thresholds["error_rate_increase_max"])
        and _is_fraction(thresholds["resource_increase_max"])
    )


def _degradation_shape_is_valid(degradation: Any) -> bool:
    """Shared predicate: exactly the four known keys, three bools plus a list of non-empty strings. Does NOT
    check correctness against the raw samples -- see the gate's own recomputation."""
    if not isinstance(degradation, dict) or set(degradation.keys()) != _KNOWN_DEGRADATION_KEYS:
        return False
    if not isinstance(degradation["latency_degraded"], bool) or not isinstance(degradation["error_rate_degraded"], bool):
        return False
    if not isinstance(degradation["overall_degraded"], bool):
        return False
    resources = degradation["degraded_resources"]
    return isinstance(resources, list) and all(_is_nonempty_str(name) for name in resources)


def generate_soak_test_record(
    record_id: str,
    system_under_test: str,
    sustained_load_rps: float,
    samples: list[dict[str, Any]],
    degradation_thresholds: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/soak-test-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed and COMPUTES degradation (comparing samples[0] against samples[-1]), never
    accepting it from the caller. REBUILDS every nested object from known fields."""
    if not _is_nonempty_str(record_id) or not _is_nonempty_str(system_under_test):
        raise InvariantViolation(f"SOAKTEST_EMPTY_RECORD_FIELD: record_id/system_under_test must both be non-empty strings, got {record_id!r}/{system_under_test!r}")
    if not _is_finite_positive(sustained_load_rps):
        raise InvariantViolation(f"SOAKTEST_INVALID_SUSTAINED_LOAD: sustained_load_rps must be a finite number > 0, got {sustained_load_rps!r}")
    if not _samples_are_valid(samples):
        raise InvariantViolation(f"SOAKTEST_INVALID_SAMPLES: samples must be a list of at least 3 valid {{elapsed_minutes, measurement}} entries, got {samples!r}")
    if not _elapsed_minutes_strictly_increasing(samples):
        raise InvariantViolation("SOAKTEST_ELAPSED_NOT_INCREASING: samples must be ordered by STRICTLY increasing elapsed_minutes -- Atlas's own formula (F19 L855) observes a time-ordered series")
    if not _load_matches_sustained(samples, sustained_load_rps):
        raise InvariantViolation(f"SOAKTEST_LOAD_NOT_CONSTANT: every sample's own measurement.load_rps must equal sustained_load_rps={sustained_load_rps!r} -- Atlas's own formula (F19 L855) is 持續負載 (constant load), not an escalating ladder")
    if not _resource_sets_are_uniform(samples):
        raise InvariantViolation("SOAKTEST_RESOURCE_SET_MISMATCH: every sample must report the SAME set of resource names")
    if not _thresholds_are_valid(degradation_thresholds):
        raise InvariantViolation(f"SOAKTEST_INVALID_THRESHOLDS: degradation_thresholds {degradation_thresholds!r} must carry exactly latency_p95_increase_ms_max/error_rate_increase_max/resource_increase_max, all finite and non-negative (the latter two also in [0, 1])")

    rebuilt_samples = [
        {"elapsed_minutes": s["elapsed_minutes"], "measurement": {
            "load_rps": s["measurement"]["load_rps"],
            "latency_p95_ms": s["measurement"]["latency_p95_ms"],
            "error_rate": s["measurement"]["error_rate"],
            "resource_utilization": dict(s["measurement"]["resource_utilization"]),
        }}
        for s in samples
    ]
    rebuilt_thresholds = {
        "latency_p95_increase_ms_max": degradation_thresholds["latency_p95_increase_ms_max"],
        "error_rate_increase_max": degradation_thresholds["error_rate_increase_max"],
        "resource_increase_max": degradation_thresholds["resource_increase_max"],
    }
    degradation = detect_degradation(rebuilt_samples[0]["measurement"], rebuilt_samples[-1]["measurement"], rebuilt_thresholds)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_under_test": system_under_test,
        "sustained_load_rps": sustained_load_rps,
        "samples": rebuilt_samples,
        "degradation_thresholds": rebuilt_thresholds,
        "degradation": degradation,
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
    provenance/computation_provenance_ref/engine, all of which SoakTestRecord also carries at the top level.
    TENTH reuse of this gate this session (after root_cause.pareto/decision.ahp/decision.mcda/devops_sre
    .error_budget/database_data.data_lineage/database_data.reconciliation/devops_sre.capacity_model/devops_sre
    .load_test/devops_sre.stress_test -- independently recounted, not copied from a sibling docstring, per the
    lesson devops_sre.load_test's own critic round taught about inherited off-by-one ordinals;
    computation.monte_carlo deliberately does NOT reuse it, per its own docstring)."""
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_soak_test_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- id/system_under_test/
    sustained_load_rps, the samples' own shape/ordering/constant-load/resource-set uniformity, the
    degradation_thresholds' own validity, and only once those hold, RECOMPUTES degradation via the SAME
    function the builder uses, comparing against the stored value. Does not trust any stored value. FAILS
    CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("soak_test_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not _is_nonempty_str(record.get("system_under_test")):
        return _result("soak_test_integrity", False, [{"reason": "id/system_under_test missing or empty"}], validator, timestamp)
    if not _is_finite_positive(record.get("sustained_load_rps")):
        return _result("soak_test_integrity", False, [{"reason": "sustained_load_rps missing or invalid"}], validator, timestamp)
    samples = record.get("samples")
    if not _samples_are_valid(samples):
        return _result("soak_test_integrity", False, [{"reason": "samples invalid (fewer than 3 entries, or a sample is malformed)"}], validator, timestamp)
    if not _elapsed_minutes_strictly_increasing(samples):
        return _result("soak_test_integrity", False, [{"reason": "elapsed_minutes not strictly increasing"}], validator, timestamp)
    if not _load_matches_sustained(samples, record["sustained_load_rps"]):
        return _result("soak_test_integrity", False, [{"reason": "one or more samples do not match sustained_load_rps"}], validator, timestamp)
    if not _resource_sets_are_uniform(samples):
        return _result("soak_test_integrity", False, [{"reason": "samples resource sets differ across the series"}], validator, timestamp)
    thresholds = record.get("degradation_thresholds")
    if not _thresholds_are_valid(thresholds):
        return _result("soak_test_integrity", False, [{"reason": "degradation_thresholds invalid (unknown/missing keys or values out of range)"}], validator, timestamp)

    degradation = record.get("degradation")
    if not _degradation_shape_is_valid(degradation):
        return _result("soak_test_integrity", False, [{"reason": "degradation missing or invalid (unknown/missing keys or wrong types)"}], validator, timestamp)

    try:
        recomputed = detect_degradation(samples[0]["measurement"], samples[-1]["measurement"], thresholds)
    except ValueError as error:
        return _result("soak_test_integrity", False, [{"reason": f"cannot recompute: {error}"}], validator, timestamp)

    mismatches: dict[str, Any] = {}
    for field in ("latency_degraded", "error_rate_degraded", "degraded_resources", "overall_degraded"):
        if degradation.get(field) != recomputed[field]:
            mismatches[field] = {"stored": degradation.get(field), "recomputed": recomputed[field]}
    return _result("soak_test_integrity", not mismatches, [{"mismatches": mismatches, "samples_recorded": len(samples)}], validator, timestamp)


def evaluate_soak_test_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_soak_test_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
