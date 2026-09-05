"""Mutation-style tests for ``devops_sre.soak_test`` (thirty-seventh Method Atlas slice, twelfth from the
`devops_sre` family). Atlas's own formula (持續負載->memory/resource leak->degradation) is proven at BOTH
independent layers -- construction-time and gate re-derivation, the gate RECOMPUTING degradation fresh from
samples[0]/samples[-1] rather than trusting stored values. Learning directly from devops_sre.stress_test's own
critic round: every OR-branch of overall_degraded, every boundary, and every multi-element sorted list is
pinned with a case that isolates it from its siblings."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.soak_test.analysis import detect_degradation
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.soak_test import (
    METHOD_ID,
    all_gates_pass,
    evaluate_genuine_compute_gate,
    evaluate_provenance_required_gate,
    evaluate_soak_test_gates,
    evaluate_soak_test_integrity_gate,
    generate_soak_test_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/soak-test-record.schema.yaml"
TS = "2026-09-05T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _measurement(load_rps=200, p95=140, error_rate=0.002, util=None):
    return {"load_rps": load_rps, "latency_p95_ms": p95, "error_rate": error_rate, "resource_utilization": {"cpu": 0.40, "memory": 0.35, "db_connections": 0.30} if util is None else util}


def _sample(elapsed, **kw):
    return {"elapsed_minutes": elapsed, "measurement": _measurement(**kw)}


def _stable_samples():
    return [
        _sample(0, p95=140, error_rate=0.002, util={"cpu": 0.40, "memory": 0.35, "db_connections": 0.30}),
        _sample(60, p95=142, error_rate=0.002, util={"cpu": 0.41, "memory": 0.36, "db_connections": 0.31}),
        _sample(120, p95=141, error_rate=0.003, util={"cpu": 0.40, "memory": 0.37, "db_connections": 0.30}),
        _sample(180, p95=143, error_rate=0.002, util={"cpu": 0.42, "memory": 0.38, "db_connections": 0.31}),
    ]


def _leaking_samples():
    return [
        _sample(0, p95=140, error_rate=0.002, util={"cpu": 0.40, "memory": 0.35, "db_connections": 0.30}),
        _sample(60, p95=145, error_rate=0.002, util={"cpu": 0.41, "memory": 0.55, "db_connections": 0.31}),
        _sample(120, p95=150, error_rate=0.003, util={"cpu": 0.40, "memory": 0.75, "db_connections": 0.30}),
        _sample(180, p95=155, error_rate=0.003, util={"cpu": 0.42, "memory": 0.95, "db_connections": 0.31}),
    ]


def _thresholds(latency=20, error=0.01, resource=0.10):
    return {"latency_p95_increase_ms_max": latency, "error_rate_increase_max": error, "resource_increase_max": resource}


def _build(record_id="SOAKTEST-T-001", sut="checkout-api", load=200, samples=None, thresholds=None):
    return generate_soak_test_record(record_id, sut, load, _stable_samples() if samples is None else samples, _thresholds() if thresholds is None else thresholds, _prov())


def _valid_stable_record():
    return _build()


def _valid_leaking_record():
    return _build(record_id="SOAKTEST-T-002", samples=_leaking_samples())


class ComputeTests(unittest.TestCase):
    """Real arithmetic, not just 'does it run'."""

    def test_stable_series_is_not_degraded(self):
        result = detect_degradation(_measurement(p95=140, error_rate=0.002, util={"cpu": 0.40}), _measurement(p95=143, error_rate=0.002, util={"cpu": 0.42}), _thresholds())
        self.assertEqual(result, {"latency_degraded": False, "error_rate_degraded": False, "degraded_resources": [], "overall_degraded": False})

    def test_latency_alone_can_trigger_overall_degraded(self):
        """OR-branch isolation: latency bad, error/resources fine."""
        result = detect_degradation(_measurement(p95=100, error_rate=0.002, util={"cpu": 0.40}), _measurement(p95=500, error_rate=0.002, util={"cpu": 0.40}), _thresholds())
        self.assertEqual(result["latency_degraded"], True)
        self.assertEqual(result["error_rate_degraded"], False)
        self.assertEqual(result["degraded_resources"], [])
        self.assertTrue(result["overall_degraded"])

    def test_error_rate_alone_can_trigger_overall_degraded(self):
        """OR-branch isolation: error bad, latency/resources fine."""
        result = detect_degradation(_measurement(p95=140, error_rate=0.001, util={"cpu": 0.40}), _measurement(p95=143, error_rate=0.5, util={"cpu": 0.40}), _thresholds())
        self.assertEqual(result["latency_degraded"], False)
        self.assertEqual(result["error_rate_degraded"], True)
        self.assertEqual(result["degraded_resources"], [])
        self.assertTrue(result["overall_degraded"])

    def test_resource_alone_can_trigger_overall_degraded(self):
        """OR-branch isolation: a resource leaked, latency/error fine."""
        result = detect_degradation(_measurement(p95=140, error_rate=0.002, util={"cpu": 0.40, "memory": 0.30}), _measurement(p95=141, error_rate=0.002, util={"cpu": 0.41, "memory": 0.90}), _thresholds())
        self.assertEqual(result["latency_degraded"], False)
        self.assertEqual(result["error_rate_degraded"], False)
        self.assertEqual(result["degraded_resources"], ["memory"])
        self.assertTrue(result["overall_degraded"])

    def test_two_degraded_resources_are_both_named_and_sorted(self):
        """Regression class from devops_sre.stress_test's own critic round: a sort with only one real element
        proves nothing -- this fixture leaks two resources whose ALPHABETICAL order differs from insertion
        order, so only a real sort produces the expected list."""
        first = _measurement(util={"zebra": 0.10, "alpha": 0.10, "cpu": 0.40})
        last = _measurement(util={"zebra": 0.95, "alpha": 0.95, "cpu": 0.41})
        result = detect_degradation(first, last, _thresholds())
        self.assertEqual(result["degraded_resources"], ["alpha", "zebra"])

    def test_exactly_at_threshold_is_not_degraded_inclusive(self):
        """Atlas gives no basis for treating exactly-on-budget as degradation -- strictly greater only.
        Deliberately uses 0.40-0.30 for the resource delta: caught during this module's own first draft
        (before any critic review) that raw float subtraction gives 0.10000000000000003 here, not exactly
        0.10 -- which would silently exceed a threshold of exactly 0.10. Fixed with Decimal; this is the
        regression test for that fix."""
        result = detect_degradation(_measurement(p95=100, error_rate=0.0, util={"cpu": 0.30}), _measurement(p95=120, error_rate=0.01, util={"cpu": 0.40}), _thresholds(latency=20, error=0.01, resource=0.10))
        self.assertEqual(result, {"latency_degraded": False, "error_rate_degraded": False, "degraded_resources": [], "overall_degraded": False})

    def test_decimal_increase_is_exact_not_raw_float(self):
        """Direct proof the fix works: raw float 0.40-0.30 != 0.10 exactly, but the computed increase must
        compare as if it were."""
        result = detect_degradation(_measurement(util={"cpu": 0.30}), _measurement(util={"cpu": 0.40}), _thresholds(resource=0.10))
        self.assertEqual(result["degraded_resources"], [])
        result_over = detect_degradation(_measurement(util={"cpu": 0.30}), _measurement(util={"cpu": 0.41}), _thresholds(resource=0.10))
        self.assertEqual(result_over["degraded_resources"], ["cpu"])

    def test_decimal_latency_increase_is_exact_not_raw_float(self):
        """Regression for a critic-caught Major: the Decimal fix covers all three arithmetic sites in code,
        but only the resource-utilization site had a boundary test that could actually distinguish Decimal
        from raw float -- reverting JUST the latency line to raw subtraction survived the whole suite.
        Raw float: 100.9 - 100.7 == 0.20000000000000284 > 0.2 (false positive); Decimal must land exactly."""
        result = detect_degradation(_measurement(p95=100.7, error_rate=0.0, util={"cpu": 0.1}), _measurement(p95=100.9, error_rate=0.0, util={"cpu": 0.1}), _thresholds(latency=0.2, error=1, resource=1))
        self.assertFalse(result["latency_degraded"])
        result_over = detect_degradation(_measurement(p95=100.7, error_rate=0.0, util={"cpu": 0.1}), _measurement(p95=100.91, error_rate=0.0, util={"cpu": 0.1}), _thresholds(latency=0.2, error=1, resource=1))
        self.assertTrue(result_over["latency_degraded"])

    def test_decimal_error_rate_increase_is_exact_not_raw_float(self):
        """Regression for the same critic-caught Major, the error_rate arithmetic site: reverting just this
        line to raw subtraction also survived the whole suite (0.9 - 0.7 == 0.20000000000000007 in raw float)."""
        result = detect_degradation(_measurement(p95=100, error_rate=0.7, util={"cpu": 0.1}), _measurement(p95=100, error_rate=0.9, util={"cpu": 0.1}), _thresholds(latency=1000, error=0.2, resource=1))
        self.assertFalse(result["error_rate_degraded"])
        result_over = detect_degradation(_measurement(p95=100, error_rate=0.7, util={"cpu": 0.1}), _measurement(p95=100, error_rate=0.91, util={"cpu": 0.1}), _thresholds(latency=1000, error=0.2, resource=1))
        self.assertTrue(result_over["error_rate_degraded"])

    def test_resource_utilization_that_shrinks_is_never_flagged(self):
        """A resource that got LESS busy is not a leak."""
        result = detect_degradation(_measurement(util={"cpu": 0.90}), _measurement(util={"cpu": 0.10}), _thresholds())
        self.assertEqual(result["degraded_resources"], [])

    def test_resource_already_busy_and_flat_is_not_flagged(self):
        """A resource near-saturated at t=0 that stays flat has not leaked (compilation_decisions #4)."""
        result = detect_degradation(_measurement(util={"cpu": 0.95}), _measurement(util={"cpu": 0.96}), _thresholds(resource=0.10))
        self.assertEqual(result["degraded_resources"], [])

    def test_invalid_threshold_is_refused(self):
        with self.assertRaises(ValueError):
            detect_degradation(_measurement(), _measurement(), _thresholds(latency=float("inf")))

    def test_non_dict_measurement_is_refused_not_crashed(self):
        with self.assertRaises(ValueError):
            detect_degradation("not-a-dict", _measurement(), _thresholds())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_stable_record_validates_against_the_real_schema_and_is_computed(self):
        record = _valid_stable_record()
        self.contracts.validate(RECORD_SCHEMA, record, "stable soak test record")
        self.assertFalse(record["degradation"]["overall_degraded"])

    def test_leaking_record_validates_and_names_the_leak(self):
        record = _valid_leaking_record()
        self.contracts.validate(RECORD_SCHEMA, record, "leaking soak test record")
        self.assertEqual(record["degradation"]["degraded_resources"], ["memory"])
        self.assertTrue(record["degradation"]["overall_degraded"])

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_soak_test_record("SOAKTEST-T-003", "s", 200, _stable_samples(), _thresholds(), _prov(), version="2.3.4", generated_by_method="devops_sre.soak_test@test")
        self.assertEqual(record["generated_by_method"], "devops_sre.soak_test@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_stable_record()["generated_by_method"], METHOD_ID)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_soaktest_prefix(self):
        record = _valid_stable_record()
        record["id"] = "STRESSTEST-1"
        with self.assertRaisesRegex(Exception, "SOAKTEST-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_fewer_than_three_samples(self):
        record = _valid_stable_record()
        record["samples"] = record["samples"][:2]
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema minItems on samples")

    def test_schema_layer_rejects_a_reused_load_measurement_shape_violation(self):
        """Proves the cross-file $defs/load_measurement $ref genuinely constrains this schema too."""
        record = _valid_stable_record()
        record["samples"][0]["measurement"]["extra_field"] = "x"
        with self.assertRaisesRegex(Exception, "extra_field"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema reused load_measurement additionalProperties")

    def test_schema_layer_rejects_extra_key_on_a_sample_wrapper(self):
        record = _valid_stable_record()
        record["samples"][0]["note"] = "x"
        with self.assertRaisesRegex(Exception, "note"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema sample wrapper additionalProperties")

    def test_schema_layer_rejects_extra_key_on_degradation_thresholds(self):
        record = _valid_stable_record()
        record["degradation_thresholds"]["p99_max"] = 1
        with self.assertRaisesRegex(Exception, "p99_max"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema thresholds additionalProperties")

    def test_schema_layer_rejects_extra_key_on_degradation(self):
        record = _valid_stable_record()
        record["degradation"]["approved_by"] = "nobody"
        with self.assertRaisesRegex(Exception, "approved_by"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema degradation additionalProperties")

    def test_schema_layer_requires_degradation_at_top_level(self):
        record = _valid_stable_record()
        del record["degradation"]
        with self.assertRaisesRegex(Exception, "degradation"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    # --- scalar fields ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_EMPTY_RECORD_FIELD"):
            _build(record_id="")

    def test_zero_sustained_load_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_SUSTAINED_LOAD"):
            _build(load=0)

    def test_infinite_sustained_load_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_SUSTAINED_LOAD"):
            _build(load=float("inf"))

    # --- samples ---
    def test_two_samples_is_refused(self):
        """The core minimum-duration invariant: 2 samples is a load_test-shaped pair, not a soak."""
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_SAMPLES"):
            _build(samples=_stable_samples()[:2])

    def test_sample_with_extra_key_is_refused_at_construction(self):
        bad = dict(_sample(999), note="x")
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_SAMPLES"):
            _build(samples=_stable_samples()[:2] + [bad])

    def test_non_increasing_elapsed_minutes_is_refused(self):
        samples = _stable_samples()
        samples[2]["elapsed_minutes"] = samples[1]["elapsed_minutes"]
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_ELAPSED_NOT_INCREASING"):
            _build(samples=samples)

    def test_out_of_order_elapsed_minutes_is_refused(self):
        samples = _stable_samples()
        samples[1]["elapsed_minutes"], samples[2]["elapsed_minutes"] = samples[2]["elapsed_minutes"], samples[1]["elapsed_minutes"]
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_ELAPSED_NOT_INCREASING"):
            _build(samples=samples)

    def test_one_sample_at_a_different_load_is_refused(self):
        """The core '持續負載' invariant: EVERY sample must match, not just most."""
        samples = _stable_samples()
        samples[2]["measurement"]["load_rps"] = 999
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_LOAD_NOT_CONSTANT"):
            _build(samples=samples)

    def test_resource_set_differing_on_an_intermediate_sample_is_refused(self):
        """Regression class: only checking samples[0] vs samples[-1] would miss a mismatch introduced in the
        MIDDLE of the series -- this must be caught across the WHOLE series, not just the endpoints."""
        samples = _stable_samples()
        samples[2]["measurement"]["resource_utilization"] = {"cpu": 0.40, "memory": 0.35}  # missing db_connections
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_RESOURCE_SET_MISMATCH"):
            _build(samples=samples)

    # --- thresholds ---
    def test_infinite_latency_threshold_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_THRESHOLDS"):
            _build(thresholds=_thresholds(latency=float("inf")))

    def test_error_threshold_above_one_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_THRESHOLDS"):
            _build(thresholds=_thresholds(error=2))

    def test_negative_resource_threshold_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_THRESHOLDS"):
            _build(thresholds=_thresholds(resource=-0.1))

    def test_thresholds_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_THRESHOLDS"):
            _build(thresholds=dict(_thresholds(), p99_increase_ms_max=50))

    def test_resource_threshold_above_one_is_refused(self):
        """Regression for a critic-caught Major: only the LOW boundary of error_rate_increase_max and the
        HIGH boundary of resource_increase_max had tests -- the mirror pair (resource high / error low) was
        untested, the same mirror-image-boundary class stress_test's own critic round already caught once."""
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_THRESHOLDS"):
            _build(thresholds=_thresholds(resource=1.5))

    def test_negative_error_threshold_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_THRESHOLDS"):
            _build(thresholds=_thresholds(error=-0.1))

    # --- measurement-level validity, not just the sample wrapper ---
    def test_measurement_with_extra_key_is_refused_at_construction(self):
        """Regression for a critic-caught Major: _measurement_is_valid's exact-key-set check had no test at
        the builder or gate layer (only via SchemaContracts.validate) -- a mutation weakening it to a subset
        check survived both."""
        samples = _stable_samples()
        samples[1]["measurement"] = dict(samples[1]["measurement"], extra_field="x")
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_SAMPLES"):
            _build(samples=samples)

    def test_empty_utilization_map_is_refused_at_construction(self):
        """Regression for a critic-caught Minor: with an empty utilization map, Atlas's entire memory/resource
        leak half of the formula silently becomes a no-op that the gate would happily confirm."""
        samples = _stable_samples()
        samples[1]["measurement"]["resource_utilization"] = {}
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_SAMPLES"):
            _build(samples=samples)

    def test_bool_error_rate_is_refused_not_coerced(self):
        """Regression for a critic-caught Minor: bool is a subclass of int in Python -- the documented
        exclusion had no test."""
        samples = _stable_samples()
        samples[1]["measurement"]["error_rate"] = False
        with self.assertRaisesRegex(InvariantViolation, "SOAKTEST_INVALID_SAMPLES"):
            _build(samples=samples)

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        samples, thresholds = _stable_samples(), _thresholds()
        record = generate_soak_test_record("SOAKTEST-T-010", "s", 200, samples, thresholds, _prov())
        samples[0]["measurement"]["resource_utilization"]["memory"] = 0.99
        samples[0]["elapsed_minutes"] = 999
        thresholds["latency_p95_increase_ms_max"] = 0
        self.assertEqual(record["samples"][0]["measurement"]["resource_utilization"]["memory"], 0.35)
        self.assertEqual(record["samples"][0]["elapsed_minutes"], 0)
        self.assertEqual(record["degradation_thresholds"]["latency_p95_increase_ms_max"], 20)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_soak_test_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_soak_test_integrity_gate(record, "test", TS)

    def test_valid_stable_record_passes_all_three_gates(self):
        results = evaluate_soak_test_gates(_valid_stable_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "soak_test_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_leaking_record_passes_all_three_gates(self):
        self.assertTrue(all_gates_pass(evaluate_soak_test_gates(_valid_leaking_record(), "test", TS)))

    def test_hand_tampered_overall_degraded_fails_the_gate_via_recomputation(self):
        record = _valid_leaking_record()
        record["degradation"]["overall_degraded"] = False
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["mismatches"], {"overall_degraded": {"stored": False, "recomputed": True}})

    def test_hand_tampered_degraded_resources_emptied_fails_the_gate(self):
        record = _valid_leaking_record()
        record["degradation"]["degraded_resources"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("degraded_resources", gate["evidence"][0]["mismatches"])

    def test_hand_tampered_latency_degraded_flipped_fails_the_gate(self):
        record = _valid_stable_record()
        record["degradation"]["latency_degraded"] = True
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["mismatches"]["latency_degraded"], {"stored": True, "recomputed": False})

    def test_hand_tampered_raw_last_sample_fails_the_gate_because_computed_field_now_stale(self):
        record = _valid_stable_record()
        record["samples"][-1]["measurement"]["latency_p95_ms"] = 9000  # stored degradation now stale
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("latency_degraded", gate["evidence"][0]["mismatches"])

    def test_hand_tampered_thresholds_infinite_fails_the_gate_before_recomputation(self):
        """The capacity_model/load_test/stress_test lesson: the gate must re-validate the caller-supplied
        thresholds themselves, before trusting the stored degradation verdict."""
        record = _valid_stable_record()
        record["degradation_thresholds"]["latency_p95_increase_ms_max"] = float("inf")
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "degradation_thresholds invalid (unknown/missing keys or values out of range)")

    def test_hand_tampered_thresholds_extra_key_fails_the_gate(self):
        record = _valid_stable_record()
        record["degradation_thresholds"]["approved_by"] = "nobody"
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "degradation_thresholds invalid (unknown/missing keys or values out of range)")

    def test_hand_tampered_extra_key_on_a_measurement_fails_the_gate(self):
        """Gate-layer companion to the builder's own regression: the exact-key-set check on measurement must
        be re-derived by the gate, not just the sample wrapper's own."""
        record = _valid_stable_record()
        record["samples"][1]["measurement"]["signed_off_by"] = "nobody"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "samples invalid (fewer than 3 entries, or a sample is malformed)")

    def test_hand_tampered_load_mismatch_on_a_middle_sample_fails_the_gate(self):
        record = _valid_stable_record()
        record["samples"][1]["measurement"]["load_rps"] = 999
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more samples do not match sustained_load_rps")

    def test_hand_tampered_resource_set_mismatch_on_middle_sample_fails_the_gate(self):
        record = _valid_stable_record()
        record["samples"][1]["measurement"]["resource_utilization"] = {"cpu": 0.5}
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "samples resource sets differ across the series")

    def test_hand_tampered_non_increasing_elapsed_minutes_fails_the_gate(self):
        record = _valid_stable_record()
        record["samples"][2]["elapsed_minutes"] = record["samples"][1]["elapsed_minutes"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "elapsed_minutes not strictly increasing")

    def test_hand_tampered_empty_record_id_fails_the_gate(self):
        record = _valid_stable_record()
        record["id"] = ""
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "id/system_under_test missing or empty")

    def test_hand_tampered_empty_system_under_test_fails_the_gate(self):
        record = _valid_stable_record()
        record["system_under_test"] = " "
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "id/system_under_test missing or empty")

    def test_hand_tampered_sustained_load_zero_fails_the_gate(self):
        record = _valid_stable_record()
        record["sustained_load_rps"] = 0
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "sustained_load_rps missing or invalid")

    def test_hand_tampered_too_few_samples_fails_the_gate(self):
        record = _valid_stable_record()
        record["samples"] = record["samples"][:2]
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "samples invalid (fewer than 3 entries, or a sample is malformed)")

    def test_hand_tampered_degradation_shape_invalid_fails_the_gate(self):
        record = _valid_stable_record()
        record["degradation"]["latency_degraded"] = "yes"
        self.assertEqual(self._gate(record)["evidence"][0]["reason"], "degradation missing or invalid (unknown/missing keys or wrong types)")

    def test_hand_tampered_engine_fails_the_genuine_compute_gate(self):
        record = _valid_stable_record()
        record["engine"] = "llm"
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", TS)["status"], "FAIL")

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_leaking_record()
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
        record = _valid_stable_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
