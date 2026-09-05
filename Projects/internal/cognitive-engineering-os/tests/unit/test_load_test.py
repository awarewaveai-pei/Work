"""Mutation-style tests for ``devops_sre.load_test`` (thirty-fifth Method Atlas slice, tenth from the
`devops_sre` family). Atlas's own formula (baseline->target load->latency/errors/resources) is proven at BOTH
independent layers -- construction-time and gate re-derivation, the gate RECOMPUTING latency_ratio/
error_rate_delta/bottleneck/status fresh rather than trusting stored values.

The compute layer (``ai_lego/compute/load_test/comparison.py``) is tested for real arithmetic correctness
(hand-verified cases, exact Decimal results, deterministic tie-break), not just "does it run". Every gate-layer
test tampers ONE field and pins the SPECIFIC evidence; sorted evidence lists are pinned with two elements so
the sort itself is load-bearing (the untested-sort class two prior slices' own critic rounds each caught)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.load_test.comparison import compare_load_measurements, find_bottleneck
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.load_test import (
    METHOD_ID,
    all_gates_pass,
    evaluate_genuine_compute_gate,
    evaluate_load_test_gates,
    evaluate_load_test_integrity_gate,
    evaluate_provenance_required_gate,
    generate_load_test_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/load-test-record.schema.yaml"
TS = "2026-09-05T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _baseline():
    return {"load_rps": 100, "latency_p95_ms": 120, "error_rate": 0.001, "resource_utilization": {"cpu": 0.35, "db_connections": 0.40, "memory": 0.50}}


def _target(p95=240, error_rate=0.004, load=500, util=None):
    return {"load_rps": load, "latency_p95_ms": p95, "error_rate": error_rate, "resource_utilization": {"cpu": 0.72, "db_connections": 0.91, "memory": 0.55} if util is None else util}


def _acceptance(p95_max=300, err_max=0.01):
    return {"latency_p95_ms_max": p95_max, "error_rate_max": err_max}


def _build(record_id="LOADTEST-T-001", sut="checkout-api", baseline=None, target=None, acceptance=None):
    return generate_load_test_record(record_id, sut, _baseline() if baseline is None else baseline, _target() if target is None else target, _acceptance() if acceptance is None else acceptance, _prov())


def _valid_record():
    return _build()


class ComputeTests(unittest.TestCase):
    """Real arithmetic, not just 'does it run'."""

    def test_latency_ratio_and_error_delta_are_exact(self):
        """Hand-verified: 240/120 = 2.0; 0.004 - 0.001 = 0.003 EXACTLY (raw float gives 0.0030000000000000005)."""
        result = compare_load_measurements(120, 240, 0.001, 0.004)
        self.assertEqual(result["latency_ratio"], 2.0)
        self.assertEqual(result["error_rate_delta"], 0.003)

    def test_error_delta_can_be_negative(self):
        self.assertEqual(compare_load_measurements(100, 100, 0.05, 0.02)["error_rate_delta"], -0.03)

    def test_latency_ratio_below_one_when_target_is_faster(self):
        self.assertEqual(compare_load_measurements(200, 100, 0, 0)["latency_ratio"], 0.5)

    def test_zero_baseline_latency_is_refused_not_division_error(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_LATENCY"):
            compare_load_measurements(0, 240, 0.001, 0.004)

    def test_negative_target_latency_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_LATENCY"):
            compare_load_measurements(120, -1, 0.001, 0.004)

    def test_nan_and_inf_latency_are_refused(self):
        for bad in (float("nan"), float("inf")):
            with self.subTest(bad=bad), self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_LATENCY"):
                compare_load_measurements(bad, 240, 0.001, 0.004)

    def test_error_rate_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_ERROR_RATE"):
            compare_load_measurements(120, 240, 0.001, 1.5)

    def test_bool_error_rate_is_refused_not_coerced(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_ERROR_RATE"):
            compare_load_measurements(120, 240, True, 0.004)

    def test_bottleneck_is_the_highest_utilization(self):
        self.assertEqual(find_bottleneck({"cpu": 0.72, "db_connections": 0.91, "memory": 0.55}), {"resource": "db_connections", "utilization": 0.91})

    def test_bottleneck_tie_resolves_to_lexicographically_smallest_name_regardless_of_insertion_order(self):
        """The tie-break is load-bearing: a naive max() over (value, name) would pick 'memory' here."""
        self.assertEqual(find_bottleneck({"memory": 0.9, "cpu": 0.9, "disk": 0.1})["resource"], "cpu")
        self.assertEqual(find_bottleneck({"cpu": 0.9, "memory": 0.9, "disk": 0.1})["resource"], "cpu")

    def test_bottleneck_empty_map_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_UTILIZATION"):
            find_bottleneck({})

    def test_bottleneck_utilization_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_UTILIZATION"):
            find_bottleneck({"cpu": 1.2})

    def test_bottleneck_blank_resource_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_UTILIZATION"):
            find_bottleneck({" ": 0.5})

    def test_bottleneck_non_dict_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_UTILIZATION"):
            find_bottleneck([("cpu", 0.5)])

    def test_overflowing_ratio_is_refused_not_stored_as_inf(self):
        """Regression for a critic-caught Major: predicate-valid, schema-valid inputs (a denormal baseline p95 and
        a near-max target p95) reach the ratio and produce inf -- the output finiteness guard is the ONLY thing
        between them and a stored inf latency_ratio, and it was untested (removing it survived the suite)."""
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_COMPARISON_OVERFLOW"):
            compare_load_measurements(5e-324, 1.7e308, 0.001, 0.004)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_passed_record_validates_against_the_real_schema_and_is_computed(self):
        record = _valid_record()
        self.contracts.validate(RECORD_SCHEMA, record, "passed load test record")
        self.assertEqual(record["status"], "passed")
        self.assertEqual(record["latency_ratio"], 2.0)
        self.assertEqual(record["error_rate_delta"], 0.003)
        self.assertEqual(record["bottleneck"], {"resource": "db_connections", "utilization": 0.91})

    def test_failed_record_validates_and_is_computed(self):
        record = _build(record_id="LOADTEST-T-002", target=_target(p95=420))
        self.contracts.validate(RECORD_SCHEMA, record, "failed load test record")
        self.assertEqual(record["status"], "failed")
        self.assertEqual(record["latency_ratio"], 3.5)

    def test_error_budget_alone_can_fail_the_test(self):
        self.assertEqual(_build(target=_target(error_rate=0.02))["status"], "failed")

    def test_exactly_on_both_budgets_is_passed_inclusive(self):
        """Atlas gives no basis for treating exactly-on-budget as a failure -- both boundaries inclusive."""
        self.assertEqual(_build(target=_target(p95=300, error_rate=0.01))["status"], "passed")

    def test_exactly_on_latency_budget_but_over_error_budget_is_failed(self):
        self.assertEqual(_build(target=_target(p95=300, error_rate=0.0100001))["status"], "failed")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_load_test_record("LOADTEST-T-003", "s", _baseline(), _target(), _acceptance(), _prov(), version="2.3.4", generated_by_method="devops_sre.load_test@test")
        self.assertEqual(record["generated_by_method"], "devops_sre.load_test@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    # --- schema-layer pins (the schema is the only defense for a hand-built record) ---
    def test_schema_layer_rejects_an_id_without_the_loadtest_prefix(self):
        record = _valid_record()
        record["id"] = "GAMEDAY-1"
        with self.assertRaisesRegex(Exception, "LOADTEST-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_an_extra_key_inside_a_measurement(self):
        record = _valid_record()
        record["target"]["p99"] = 400
        with self.assertRaisesRegex(Exception, "p99"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema extra key")

    def test_schema_layer_rejects_utilization_above_one(self):
        record = _valid_record()
        record["target"]["resource_utilization"]["cpu"] = 1.5
        with self.assertRaisesRegex(Exception, "1.5"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema utilization range")

    def test_schema_layer_rejects_a_caller_asserted_status_value(self):
        record = _valid_record()
        record["status"] = "mostly_passed"
        with self.assertRaisesRegex(Exception, "mostly_passed"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema status enum")

    # Regression for a critic-caught Major: 17 schema constraints survived deletion with a green suite; the
    # highest-value ones are pinned below so a regeneration cannot silently drop them.
    def test_schema_layer_rejects_a_blank_resource_name_via_property_names(self):
        record = _valid_record()
        for side in ("baseline", "target"):
            record[side]["resource_utilization"][" "] = 0.5
        with self.assertRaisesRegex(Exception, "' '"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema propertyNames")

    def test_schema_layer_requires_engine_at_top_level(self):
        record = _valid_record()
        del record["engine"]
        with self.assertRaisesRegex(Exception, "engine"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_pins_engine_const(self):
        record = _valid_record()
        record["engine"] = "llm"
        with self.assertRaisesRegex(Exception, r"\['engine'\]"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema engine const")

    def test_schema_layer_rejects_an_extra_key_inside_acceptance(self):
        record = _valid_record()
        record["acceptance"]["p99_max"] = 500
        with self.assertRaisesRegex(Exception, "p99_max"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema acceptance additionalProperties")

    def test_schema_layer_bounds_error_rate_delta(self):
        record = _valid_record()
        record["error_rate_delta"] = 1.5
        with self.assertRaisesRegex(Exception, "1.5"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema error_rate_delta bounds")

    def test_schema_layer_pins_computation_provenance_ref_pattern(self):
        record = _valid_record()
        record["computation_provenance_ref"] = "numpy.divide"
        with self.assertRaisesRegex(Exception, "numpy.divide"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema computation_provenance_ref pattern")

    def test_builder_refuses_an_overflowing_pair_at_construction(self):
        bad = _baseline()
        bad["latency_p95_ms"] = 5e-324
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_COMPARISON_OVERFLOW"):
            _build(baseline=bad, target=_target(p95=1.7e308))

    # --- scalar fields ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_EMPTY_RECORD_FIELD"):
            _build(record_id="")

    def test_whitespace_only_system_under_test_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_EMPTY_RECORD_FIELD"):
            _build(sut="  ")

    # --- measurements ---
    def test_measurement_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_MEASUREMENT"):
            _build(target=dict(_target(), p99=400))

    def test_measurement_missing_error_rate_is_refused(self):
        bad = _target()
        del bad["error_rate"]
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_MEASUREMENT"):
            _build(target=bad)

    def test_baseline_not_a_dict_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_MEASUREMENT"):
            _build(baseline="100rps")

    def test_zero_baseline_latency_is_refused_at_construction(self):
        bad = _baseline()
        bad["latency_p95_ms"] = 0
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_MEASUREMENT"):
            _build(baseline=bad)

    def test_negative_load_is_refused(self):
        bad = _baseline()
        bad["load_rps"] = -1
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_MEASUREMENT"):
            _build(baseline=bad)

    def test_bool_load_is_refused_not_coerced(self):
        bad = _baseline()
        bad["load_rps"] = False
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_MEASUREMENT"):
            _build(baseline=bad)

    def test_nan_error_rate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_MEASUREMENT"):
            _build(target=_target(error_rate=float("nan")))

    def test_empty_utilization_map_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_MEASUREMENT"):
            _build(target=_target(util={}))

    def test_utilization_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_MEASUREMENT"):
            _build(target=_target(util={"cpu": 1.01, "db_connections": 0.5, "memory": 0.5}))

    def test_blank_resource_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_MEASUREMENT"):
            _build(target=_target(util={"": 0.5, "db_connections": 0.5, "memory": 0.5, "cpu": 0.1}))

    # --- acceptance ---
    def test_acceptance_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_ACCEPTANCE"):
            _build(acceptance=dict(_acceptance(), p99_max=500))

    def test_acceptance_zero_latency_budget_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_ACCEPTANCE"):
            _build(acceptance=_acceptance(p95_max=0))

    def test_acceptance_infinite_latency_budget_is_refused(self):
        """An infinite budget would make status:passed trivially true for any latency -- the same class of
        silent certification devops_sre.capacity_model's own critic round caught for infinite thresholds."""
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_ACCEPTANCE"):
            _build(acceptance=_acceptance(p95_max=float("inf")))

    def test_acceptance_error_budget_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_ACCEPTANCE"):
            _build(acceptance=_acceptance(err_max=2))

    def test_acceptance_not_a_dict_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_INVALID_ACCEPTANCE"):
            _build(acceptance=300)

    # --- cross-measurement invariants ---
    def test_target_load_equal_to_baseline_is_refused(self):
        """The core baseline->target invariant: strictly greater, not >=."""
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_LOAD_NOT_INCREASED"):
            _build(target=_target(load=100))

    def test_target_load_below_baseline_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOADTEST_LOAD_NOT_INCREASED"):
            _build(target=_target(load=50))

    def test_mismatched_resource_sets_are_refused_with_sorted_evidence(self):
        """Two names on each side so the SORT of each evidence list is load-bearing."""
        with self.assertRaisesRegex(InvariantViolation, r"only_in_baseline': \['db_connections', 'memory'\].*only_in_target': \['disk', 'queue'\]"):
            _build(target=_target(util={"queue": 0.5, "cpu": 0.5, "disk": 0.5}))

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        baseline, target, acceptance = _baseline(), _target(), _acceptance()
        record = generate_load_test_record("LOADTEST-T-010", "s", baseline, target, acceptance, _prov())
        target["resource_utilization"]["db_connections"] = 0.1
        target["latency_p95_ms"] = 999
        acceptance["latency_p95_ms_max"] = 1
        baseline["load_rps"] = 1000
        self.assertEqual(record["target"]["resource_utilization"]["db_connections"], 0.91)
        self.assertEqual(record["target"]["latency_p95_ms"], 240)
        self.assertEqual(record["acceptance"]["latency_p95_ms_max"], 300)
        self.assertEqual(record["baseline"]["load_rps"], 100)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_load_test_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_load_test_integrity_gate(record, "test", TS)

    def test_valid_record_passes_all_three_gates(self):
        results = evaluate_load_test_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "load_test_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_failed_record_passes_all_three_gates(self):
        self.assertTrue(all_gates_pass(evaluate_load_test_gates(_build(target=_target(p95=420)), "test", TS)))

    def test_hand_tampered_status_on_a_failed_record_fails_the_gate_via_recomputation(self):
        """The headline gate-layer regression: a failed test hand-edited to claim passed (raw inputs untouched)."""
        record = _build(target=_target(p95=420))
        record["status"] = "passed"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["mismatches"], {"status": {"stored": "passed", "recomputed": "failed"}})

    def test_hand_tampered_bottleneck_fails_the_gate(self):
        record = _valid_record()
        record["bottleneck"] = {"resource": "cpu", "utilization": 0.72}
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("bottleneck", gate["evidence"][0]["mismatches"])

    def test_hand_tampered_latency_ratio_fails_the_gate(self):
        record = _valid_record()
        record["latency_ratio"] = 1.0
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["mismatches"]["latency_ratio"], {"stored": 1.0, "recomputed": 2.0})

    def test_hand_tampered_error_rate_delta_fails_the_gate(self):
        record = _valid_record()
        record["error_rate_delta"] = 0.0
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("error_rate_delta", gate["evidence"][0]["mismatches"])

    def test_hand_tampered_raw_target_latency_fails_the_gate_because_computed_fields_no_longer_match(self):
        record = _valid_record()
        record["target"]["latency_p95_ms"] = 420  # stored status/latency_ratio now stale
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(set(gate["evidence"][0]["mismatches"]), {"latency_ratio", "status"})

    def test_hand_tampered_acceptance_infinite_budget_fails_the_gate_before_recomputation(self):
        """The capacity_model lesson: the gate must re-validate the caller-supplied thresholds themselves."""
        record = _valid_record()
        record["acceptance"]["latency_p95_ms_max"] = float("inf")
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "acceptance thresholds invalid (unknown/missing keys or values out of range)")

    def test_hand_tampered_acceptance_extra_key_fails_the_gate(self):
        record = _valid_record()
        record["acceptance"]["approved_by"] = "nobody"
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "acceptance thresholds invalid (unknown/missing keys or values out of range)")

    def test_hand_tampered_target_load_lowered_to_baseline_fails_the_gate(self):
        record = _valid_record()
        record["target"]["load_rps"] = 100
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "target load not strictly greater than baseline load")
        self.assertEqual(gate["evidence"][0]["target_load_rps"], 100)

    def test_hand_tampered_resource_sets_fail_the_gate_with_sorted_evidence(self):
        record = _valid_record()
        record["target"]["resource_utilization"] = {"queue": 0.5, "cpu": 0.5, "disk": 0.5}
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "baseline/target resource sets differ")
        self.assertEqual(gate["evidence"][0]["only_in_baseline"], ["db_connections", "memory"])
        self.assertEqual(gate["evidence"][0]["only_in_target"], ["disk", "queue"])

    def test_hand_built_overflowing_record_fails_the_gate_via_cannot_recompute_not_a_crash(self):
        """Regression for a critic-caught Major: the gate's own `except InvariantViolation` branch was
        unreachable by any test (replacing it with a bare call survived the suite). A hand-built record whose
        raw measurements are individually valid but overflow on comparison must fail closed with a reason."""
        record = _valid_record()
        record["baseline"]["latency_p95_ms"] = 5e-324
        record["target"]["latency_p95_ms"] = 1.7e308
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(gate["evidence"][0]["reason"].startswith("cannot recompute: LOADTEST_COMPARISON_OVERFLOW"))

    def test_hand_tampered_extra_key_on_baseline_fails_the_gate(self):
        record = _valid_record()
        record["baseline"]["p99"] = 1
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "baseline measurement invalid (unknown/missing keys or values out of range)")

    def test_hand_tampered_utilization_above_one_on_target_fails_the_gate(self):
        record = _valid_record()
        record["target"]["resource_utilization"]["cpu"] = 1.5
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "target measurement invalid (unknown/missing keys or values out of range)")

    def test_hand_tampered_empty_record_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "id/system_under_test missing or empty")

    def test_hand_tampered_empty_system_under_test_fails_the_gate(self):
        record = _valid_record()
        record["system_under_test"] = " "
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "id/system_under_test missing or empty")

    def test_hand_tampered_engine_fails_the_genuine_compute_gate(self):
        record = _valid_record()
        record["engine"] = "llm"
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", TS)["status"], "FAIL")

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
        before = copy.deepcopy(record)
        self._gate(record)
        self.assertEqual(record, before)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")
                self.assertEqual(evaluate_genuine_compute_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
