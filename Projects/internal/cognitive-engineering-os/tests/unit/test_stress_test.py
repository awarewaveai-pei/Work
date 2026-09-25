"""Mutation-style tests for ``devops_sre.stress_test`` (thirty-sixth Method Atlas slice, eleventh from the
`devops_sre` family). Atlas's own formula (超過預期負載->觀察 cliff/recovery) is proven at BOTH independent
layers -- construction-time and gate re-derivation, the gate RECOMPUTING breaking_point/recovered fresh
rather than trusting stored values. Every gate-layer test tampers ONE field and pins the SPECIFIC evidence."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.stress_test.analysis import find_breaking_point
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.stress_test import (
    METHOD_ID,
    all_gates_pass,
    evaluate_genuine_compute_gate,
    evaluate_stress_test_gates,
    evaluate_stress_test_integrity_gate,
    evaluate_provenance_required_gate,
    generate_stress_test_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/stress-test-record.schema.yaml"
TS = "2026-09-05T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _step(load_rps, p95=240, error_rate=0.004, util=None):
    return {"load_rps": load_rps, "latency_p95_ms": p95, "error_rate": error_rate, "resource_utilization": {"cpu": 0.72, "db_connections": 0.91, "memory": 0.55} if util is None else util}


def _breaking_ladder():
    return [
        _step(500, p95=240, error_rate=0.004),
        _step(750, p95=310, error_rate=0.006),
        _step(900, p95=480, error_rate=0.02),
        _step(1000, p95=1800, error_rate=0.35),
    ]


def _non_breaking_ladder():
    return [_step(500, p95=240, error_rate=0.004), _step(750, p95=280, error_rate=0.005)]


def _thresholds(p95_max=500, err_max=0.05):
    return {"latency_p95_ms_max": p95_max, "error_rate_max": err_max}


def _recovery(reduced=600, p95=260, error_rate=0.005, recovered=True):
    return {"reduced_load_rps": reduced, "latency_p95_ms": p95, "error_rate": error_rate, "recovered": recovered}


def _build(record_id="STRESSTEST-T-001", sut="checkout-api", expected=500, load_steps=None, thresholds=None, recovery=_recovery):
    steps = _breaking_ladder() if load_steps is None else load_steps
    return generate_stress_test_record(record_id, sut, expected, steps, _thresholds() if thresholds is None else thresholds, recovery() if callable(recovery) else recovery, _prov())


def _valid_record():
    return _build()


def _valid_no_cliff_record():
    return _build(record_id="STRESSTEST-T-002", load_steps=_non_breaking_ladder(), recovery=None)


class ComputeTests(unittest.TestCase):
    """Real search logic, not just 'does it run'."""

    def test_finds_the_first_breaching_step_by_order(self):
        result = find_breaking_point(_breaking_ladder(), 500, 0.05)
        self.assertEqual(result, {"step_index": 3, "load_rps": 1000})

    def test_returns_none_when_no_step_breaches(self):
        self.assertIsNone(find_breaking_point(_non_breaking_ladder(), 500, 0.05))

    def test_breach_by_error_rate_alone_is_found(self):
        steps = [_step(500, p95=240, error_rate=0.001), _step(600, p95=250, error_rate=0.9)]
        self.assertEqual(find_breaking_point(steps, 1000, 0.05), {"step_index": 1, "load_rps": 600})

    def test_breach_by_latency_alone_is_found(self):
        steps = [_step(500, p95=240, error_rate=0.001), _step(600, p95=9000, error_rate=0.001)]
        self.assertEqual(find_breaking_point(steps, 500, 0.05), {"step_index": 1, "load_rps": 600})

    def test_first_step_can_itself_be_the_breaking_point(self):
        steps = [_step(500, p95=9000, error_rate=0.9), _step(600, p95=250, error_rate=0.001)]
        self.assertEqual(find_breaking_point(steps, 500, 0.05), {"step_index": 0, "load_rps": 500})

    def test_boundary_value_exactly_at_threshold_does_not_breach(self):
        """Atlas gives no basis for treating exactly-on-budget as a breach -- inclusive, mirrors load_test."""
        steps = [_step(500, p95=500, error_rate=0.05), _step(600, p95=500, error_rate=0.05)]
        self.assertIsNone(find_breaking_point(steps, 500, 0.05))

    def test_fewer_than_two_steps_is_refused(self):
        with self.assertRaises(ValueError):
            find_breaking_point([_step(500)], 500, 0.05)

    def test_infinite_latency_threshold_is_refused(self):
        with self.assertRaises(ValueError):
            find_breaking_point(_breaking_ladder(), float("inf"), 0.05)

    def test_error_rate_threshold_above_one_is_refused(self):
        with self.assertRaises(ValueError):
            find_breaking_point(_breaking_ladder(), 500, 1.5)

    def test_two_breaching_steps_returns_the_first_not_the_last(self):
        """Regression for a critic-caught Major: no prior fixture had two breaching steps, so an accumulator
        mutation that kept overwriting to the LAST breach survived the entire suite undetected."""
        steps = [_step(100, p95=100, error_rate=0.0), _step(200, p95=900, error_rate=0.0), _step(300, p95=950, error_rate=0.9)]
        self.assertEqual(find_breaking_point(steps, 500, 0.05), {"step_index": 1, "load_rps": 200})

    def test_search_is_by_caller_supplied_order_not_by_resorting_load_rps(self):
        """Regression for a critic-caught Major: the function must search load_steps in the ORDER supplied,
        never re-sort by load_rps first -- a mutation that sorted before searching survived because every
        prior fixture happened to already be in ascending load_rps order. This ladder is deliberately NOT
        monotonic (find_breaking_point itself carries no ordering guard -- that is the caller's own
        precondition, enforced separately in generate_stress_test_record)."""
        steps = [_step(900, p95=9000, error_rate=0.9), _step(500, p95=100, error_rate=0.0)]
        self.assertEqual(find_breaking_point(steps, 500, 0.05), {"step_index": 0, "load_rps": 900})


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_record_with_cliff_and_recovery_validates_and_is_computed(self):
        record = _valid_record()
        self.contracts.validate(RECORD_SCHEMA, record, "stress test record with cliff")
        self.assertEqual(record["breaking_point"], {"step_index": 3, "load_rps": 1000})
        self.assertTrue(record["recovery"]["recovered"])

    def test_record_with_no_cliff_validates_with_null_breaking_point_and_no_recovery(self):
        record = _valid_no_cliff_record()
        self.contracts.validate(RECORD_SCHEMA, record, "stress test record without cliff")
        self.assertIsNone(record["breaking_point"])
        self.assertIsNone(record["recovery"])

    def test_recovery_can_legitimately_report_recovered_false(self):
        record = _build(record_id="STRESSTEST-T-003", recovery=_recovery(p95=1500, error_rate=0.4, recovered=False))
        self.assertFalse(record["recovery"]["recovered"])

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_stress_test_record("STRESSTEST-T-004", "s", 500, _breaking_ladder(), _thresholds(), _recovery(), _prov(), version="2.3.4", generated_by_method="devops_sre.stress_test@test")
        self.assertEqual(record["generated_by_method"], "devops_sre.stress_test@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_stresstest_prefix(self):
        record = _valid_record()
        record["id"] = "LOADTEST-1"
        with self.assertRaisesRegex(Exception, "STRESSTEST-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_recovery_present_when_breaking_point_null(self):
        record = _valid_no_cliff_record()
        record["recovery"] = _recovery()
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema recovery/breaking_point coupling")

    def test_schema_layer_rejects_recovery_null_when_breaking_point_found(self):
        record = _valid_record()
        record["recovery"] = None
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema recovery/breaking_point coupling reverse")

    def test_schema_layer_rejects_recovery_key_absent_when_breaking_point_found(self):
        """Regression for a critic-caught Major: the first draft's `else` branch used `properties` alone,
        which JSON Schema never enforces against an ABSENT key (only a present-but-wrong-type one) -- a
        record with breaking_point non-null and recovery simply OMITTED passed undetected."""
        record = _valid_record()
        del record["recovery"]
        with self.assertRaisesRegex(Exception, "recovery"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema recovery key-absent coupling")

    def test_schema_layer_rejects_a_reused_load_measurement_shape_violation(self):
        """Proves the cross-file $defs/load_measurement $ref genuinely constrains this schema too."""
        record = _valid_record()
        record["load_steps"][0]["extra_field"] = "x"
        with self.assertRaisesRegex(Exception, "extra_field"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema reused load_measurement additionalProperties")

    def test_schema_layer_rejects_extra_key_on_breaking_point(self):
        record = _valid_record()
        record["breaking_point"]["approved_by"] = "nobody"
        with self.assertRaisesRegex(Exception, "approved_by"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema breaking_point additionalProperties")

    # --- scalar fields ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_EMPTY_RECORD_FIELD"):
            _build(record_id="")

    def test_zero_expected_load_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_EXPECTED_LOAD"):
            _build(expected=0)

    def test_infinite_expected_load_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_EXPECTED_LOAD"):
            _build(expected=float("inf"))

    # --- ladder ---
    def test_single_step_ladder_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_LADDER"):
            _build(load_steps=[_step(500)], recovery=None)

    def test_non_increasing_ladder_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_LADDER_NOT_INCREASING"):
            _build(load_steps=[_step(750), _step(500)], recovery=None)

    def test_equal_load_rps_steps_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_LADDER_NOT_INCREASING"):
            _build(load_steps=[_step(500), _step(500)], recovery=None)

    def test_mismatched_resource_sets_across_steps_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_RESOURCE_SET_MISMATCH"):
            _build(load_steps=[_step(500, util={"cpu": 0.5}), _step(600, util={"memory": 0.5})], recovery=None)

    def test_ladder_never_exceeding_expected_load_is_refused(self):
        """The core '超過預期負載' invariant: every step at or below expected_load_rps."""
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_NEVER_EXCEEDS_EXPECTED"):
            _build(expected=1000, load_steps=[_step(500), _step(750)], recovery=None)

    def test_ladder_exactly_at_expected_load_is_refused(self):
        """Strictly greater, not >=."""
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_NEVER_EXCEEDS_EXPECTED"):
            _build(expected=750, load_steps=[_step(500), _step(750)], recovery=None)

    def test_measurement_with_extra_key_is_refused_at_construction(self):
        bad = dict(_step(750), extra="x")
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_LADDER"):
            _build(load_steps=[_step(500), bad], recovery=None)

    # --- thresholds ---
    def test_infinite_latency_threshold_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_THRESHOLDS"):
            _build(thresholds=_thresholds(p95_max=float("inf")))

    def test_error_threshold_above_one_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_THRESHOLDS"):
            _build(thresholds=_thresholds(err_max=2))

    def test_thresholds_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_THRESHOLDS"):
            _build(thresholds=dict(_thresholds(), p99_max=900))

    # --- recovery coupling (the core bidirectional-iff invariant) ---
    def test_recovery_supplied_when_no_breaking_point_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_UNEXPECTED_RECOVERY"):
            _build(load_steps=_non_breaking_ladder(), recovery=_recovery())

    def test_recovery_missing_when_breaking_point_found_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_MISSING_RECOVERY"):
            _build(recovery=None)

    def test_recovery_at_or_above_breaking_load_is_refused(self):
        """The core reduction invariant: strictly below, not <=."""
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_RECOVERY_NOT_REDUCED"):
            _build(recovery=_recovery(reduced=1000))

    def test_recovery_above_breaking_load_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_RECOVERY_NOT_REDUCED"):
            _build(recovery=_recovery(reduced=1200))

    def test_recovery_with_wrong_recovered_flag_is_refused(self):
        """The core full-derivation invariant: caller cannot assert recovered:true for a measurement that
        does not actually clear the thresholds."""
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_RECOVERED_NOT_DERIVED"):
            _build(recovery=_recovery(p95=9000, error_rate=0.9, recovered=True))

    def test_recovery_with_wrong_recovered_false_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_RECOVERED_NOT_DERIVED"):
            _build(recovery=_recovery(p95=100, error_rate=0.001, recovered=False))

    def test_recovery_derivation_requires_both_metrics_healthy_not_either(self):
        """Regression for a critic-caught Major: _derive_recovered's AND survived being turned into OR,
        because both existing recovered:false fixtures breached BOTH metrics at once. Healthy latency with a
        bad error rate must still be recovered:false -- and the reverse."""
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_RECOVERED_NOT_DERIVED"):
            _build(recovery=_recovery(p95=100, error_rate=0.9, recovered=True))  # latency fine, errors not
        record = _build(record_id="STRESSTEST-T-005", recovery=_recovery(p95=100, error_rate=0.9, recovered=False))
        self.assertFalse(record["recovery"]["recovered"])
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_RECOVERED_NOT_DERIVED"):
            _build(recovery=_recovery(p95=9000, error_rate=0.001, recovered=True))  # errors fine, latency not
        record2 = _build(record_id="STRESSTEST-T-006", recovery=_recovery(p95=9000, error_rate=0.001, recovered=False))
        self.assertFalse(record2["recovery"]["recovered"])

    def test_recovery_exactly_at_both_thresholds_is_recovered_inclusive(self):
        """Regression for a critic-caught Major: the inclusive <= boundary on recovered was unpinned (only
        the mirror-image breaking-point boundary had a test). Atlas gives no basis for treating exactly-on-
        budget as a failure at either the cliff or the recovery side."""
        record = _build(recovery=_recovery(p95=500, error_rate=0.05, recovered=True))
        self.assertTrue(record["recovery"]["recovered"])

    def test_bool_load_rps_is_refused_not_coerced(self):
        """bool is a subclass of int in Python -- True/False must be rejected as load_rps, not coerced."""
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_LADDER"):
            _build(load_steps=[_step(500), _step(True)], recovery=None)

    def test_empty_utilization_map_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_LADDER"):
            _build(load_steps=[_step(500, util={}), _step(750)], recovery=None)

    def test_zero_load_rps_is_accepted(self):
        """load_rps:0 is legal (minimum:0, not exclusiveMinimum) -- distinct from expected_load_rps/thresholds
        which must be strictly positive."""
        record = _build(expected=1, load_steps=[_step(0, p95=50, error_rate=0.0), _step(2)], recovery=None)
        self.assertEqual(record["load_steps"][0]["load_rps"], 0)

    def test_recovery_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_RECOVERY"):
            _build(recovery=dict(_recovery(), approved_by="nobody"))

    def test_recovery_non_bool_recovered_is_refused_not_coerced(self):
        with self.assertRaisesRegex(InvariantViolation, "STRESSTEST_INVALID_RECOVERY"):
            _build(recovery=dict(_recovery(), recovered=1))

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        steps, thresholds, recovery = _breaking_ladder(), _thresholds(), _recovery()
        record = generate_stress_test_record("STRESSTEST-T-010", "s", 500, steps, thresholds, recovery, _prov())
        steps[0]["load_rps"] = 999
        thresholds["latency_p95_ms_max"] = 1
        recovery["recovered"] = False
        self.assertEqual(record["load_steps"][0]["load_rps"], 500)
        self.assertEqual(record["breaking_thresholds"]["latency_p95_ms_max"], 500)
        self.assertTrue(record["recovery"]["recovered"])

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_stress_test_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_stress_test_integrity_gate(record, "test", TS)

    def test_valid_record_with_cliff_passes_all_three_gates(self):
        results = evaluate_stress_test_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "stress_test_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_record_without_cliff_passes_all_three_gates(self):
        self.assertTrue(all_gates_pass(evaluate_stress_test_gates(_valid_no_cliff_record(), "test", TS)))

    def test_hand_tampered_breaking_point_index_fails_the_gate_via_recomputation(self):
        record = _valid_record()
        record["breaking_point"] = {"step_index": 2, "load_rps": 900}
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "breaking_point mismatch")
        self.assertEqual(gate["evidence"][0]["stored"], {"step_index": 2, "load_rps": 900})
        self.assertEqual(gate["evidence"][0]["recomputed"], {"step_index": 3, "load_rps": 1000})

    def test_hand_tampered_breaking_point_smuggled_to_null_fails_the_gate(self):
        """The headline regression: a hand-tampered record claiming NO cliff was found when the raw ladder
        clearly breaches thresholds."""
        record = _valid_record()
        record["breaking_point"] = None
        record["recovery"] = None
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "breaking_point mismatch")
        self.assertIsNone(gate["evidence"][0]["stored"])

    def test_hand_tampered_recovered_flag_fails_the_gate(self):
        record = _valid_record()
        record["recovery"]["recovered"] = False
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery.recovered mismatch")
        self.assertEqual(gate["evidence"][0]["stored"], False)
        self.assertEqual(gate["evidence"][0]["recomputed"], True)

    def test_hand_tampered_recovery_present_on_no_cliff_record_fails_the_gate(self):
        record = _valid_no_cliff_record()
        record["recovery"] = _recovery()
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery present but breaking_point is null")

    def test_hand_tampered_recovery_removed_from_cliff_record_fails_the_gate(self):
        record = _valid_record()
        record["recovery"] = None
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery missing or invalid (unknown/missing keys or values out of range)")

    def test_hand_tampered_reduced_load_at_breaking_point_fails_the_gate(self):
        record = _valid_record()
        record["recovery"]["reduced_load_rps"] = 1000
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery.reduced_load_rps not strictly below the breaking point's own load_rps")
        self.assertEqual(gate["evidence"][0]["reduced_load_rps"], 1000)
        self.assertEqual(gate["evidence"][0]["breaking_point_load_rps"], 1000)

    def test_hand_tampered_non_increasing_ladder_fails_the_gate(self):
        record = _valid_record()
        record["load_steps"][1]["load_rps"] = 400
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "load_steps not strictly increasing")

    def test_hand_tampered_resource_set_mismatch_fails_the_gate(self):
        record = _valid_record()
        record["load_steps"][2]["resource_utilization"] = {"cpu": 0.5}
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "load_steps resource sets differ across steps")

    def test_hand_tampered_thresholds_infinite_fails_the_gate_before_recomputation(self):
        """The capacity_model/load_test lesson: the gate must re-validate the caller-supplied thresholds."""
        record = _valid_record()
        record["breaking_thresholds"]["latency_p95_ms_max"] = float("inf")
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "breaking_thresholds invalid (unknown/missing keys or values out of range)")

    def test_hand_tampered_ladder_no_longer_exceeds_expected_load_fails_the_gate(self):
        record = _valid_no_cliff_record()
        record["expected_load_rps"] = 10000
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "no load_steps entry exceeds expected_load_rps")

    def test_hand_tampered_empty_record_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "id/system_under_test missing or empty")

    def test_hand_tampered_empty_system_under_test_fails_the_gate(self):
        record = _valid_record()
        record["system_under_test"] = " "
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "id/system_under_test missing or empty")

    def test_hand_tampered_expected_load_zero_fails_the_gate(self):
        record = _valid_record()
        record["expected_load_rps"] = 0
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "expected_load_rps missing or invalid")

    def test_hand_tampered_ladder_too_short_fails_the_gate(self):
        record = _valid_record()
        record["load_steps"] = [record["load_steps"][0]]
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "load_steps invalid (fewer than 2 entries, or a step is malformed)")

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
