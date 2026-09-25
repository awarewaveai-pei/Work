"""Mutation-style tests for ``devops_sre.capacity_model`` (thirty-first Method Atlas slice, sixth from the
`devops_sre` family). Atlas's own two-sided benefit column (prevent both capacity incidents AND
over-provisioning) is proven at BOTH independent layers -- construction-time and gate re-derivation, the
gate RECOMPUTING projected_workload/required_resources/headroom_ratio/status fresh rather than trusting
stored values.

The compute layer (``ai_lego/compute/capacity_model/projection.py``) is tested for real arithmetic
correctness (hand-verified cases), not just "does it run" -- including the exact scenario the CLI slice
itself demonstrates (1000 req/s, 10%/period growth, 6 periods, 0.002 cores/req/s coefficient)."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.capacity_model.projection import compute_headroom_ratio, project_workload
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.capacity_model import (
    METHOD_ID,
    all_gates_pass,
    evaluate_capacity_integrity_gate,
    evaluate_capacity_model_gates,
    evaluate_genuine_compute_gate,
    evaluate_provenance_required_gate,
    generate_capacity_model_record,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CAPACITY_MODEL_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/capacity-model-record.schema.yaml"


def _healthy_record():
    return generate_capacity_model_record(
        "CAPMODEL-T-001", "test resource", 1000.0, 0.10, 6, 0.002, 5.0, 0.15, 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED")
    )


class ComputeTests(unittest.TestCase):
    """Real arithmetic, not just 'does it run'."""

    def test_project_workload_zero_periods_returns_current_workload_unchanged(self):
        self.assertEqual(project_workload(1000.0, 0.10, 0), 1000.0)

    def test_project_workload_compounds_correctly(self):
        """Hand-verified: 1000 * 1.1^6 = 1771.561."""
        self.assertAlmostEqual(project_workload(1000.0, 0.10, 6), 1771.561, places=6)

    def test_project_workload_zero_growth_rate_returns_current_workload(self):
        self.assertEqual(project_workload(1000.0, 0.0, 10), 1000.0)

    def test_project_workload_negative_growth_rate_shrinks(self):
        self.assertAlmostEqual(project_workload(1000.0, -0.10, 1), 900.0, places=6)

    def test_project_workload_negative_workload_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_WORKLOAD"):
            project_workload(-1.0, 0.10, 6)

    def test_project_workload_growth_rate_at_or_below_negative_one_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_GROWTH_RATE"):
            project_workload(1000.0, -1.0, 6)
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_GROWTH_RATE"):
            project_workload(1000.0, -1.5, 6)

    def test_project_workload_negative_periods_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_PERIODS"):
            project_workload(1000.0, 0.10, -1)

    def test_project_workload_non_integer_periods_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_PERIODS"):
            project_workload(1000.0, 0.10, 6.5)

    def test_project_workload_nan_workload_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_WORKLOAD"):
            project_workload(float("nan"), 0.10, 6)

    def test_project_workload_infinite_growth_rate_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_GROWTH_RATE"):
            project_workload(1000.0, float("inf"), 6)

    def test_project_workload_bool_periods_ahead_is_rejected_not_coerced(self):
        """Regression for a critic-caught scrutiny point: bool is a subclass of int in Python -- True/False
        must be rejected as periods_ahead, not silently coerced to 1/0 periods."""
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_PERIODS"):
            project_workload(1000.0, 0.10, True)
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_PERIODS"):
            project_workload(1000.0, 0.10, False)

    def test_project_workload_non_numeric_workload_raises_not_crashes(self):
        """Regression for a critic-caught Major: a non-numeric current_workload (e.g. a string, the shape
        JSON/form input can produce) must fail closed via InvariantViolation, not escape as a raw TypeError
        from math.isfinite -- the exact bug class two immediately-prior slices already fixed elsewhere."""
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_WORKLOAD"):
            project_workload("1000", 0.10, 6)

    def test_project_workload_non_numeric_growth_rate_raises_not_crashes(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_GROWTH_RATE"):
            project_workload(1000.0, "0.10", 6)

    def test_project_workload_huge_periods_ahead_raises_not_crashes(self):
        """Regression for a critic-caught Major: decimal.Overflow for a large-but-schema-legal periods_ahead
        must fail closed via InvariantViolation, not escape uncaught (the try block's own exponentiation
        step was previously OUTSIDE the exception handler)."""
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_PROJECTION_OVERFLOW"):
            project_workload(1000.0, 0.10, 10**7)

    def test_compute_headroom_ratio_non_numeric_coefficient_raises_not_crashes(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_COEFFICIENT"):
            compute_headroom_ratio(1000.0, "0.002", 5.0)

    def test_compute_headroom_ratio_bool_capacity_is_rejected(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_CAPACITY"):
            compute_headroom_ratio(1000.0, 0.002, True)

    def test_compute_headroom_ratio_hand_verified_healthy_case(self):
        """Hand-verified: required = 1771.561 * 0.002 = 3.543122; headroom = (5 - 3.543122) / 5 = 0.2913756."""
        result = compute_headroom_ratio(1771.561, 0.002, 5.0)
        self.assertAlmostEqual(result["required_resources"], 3.543122, places=6)
        self.assertAlmostEqual(result["headroom_ratio"], 0.2913756, places=6)

    def test_compute_headroom_ratio_hand_verified_insufficient_case(self):
        """Hand-verified: (3 - 3.543122) / 3 = -0.18104066666666666."""
        result = compute_headroom_ratio(1771.561, 0.002, 3.0)
        self.assertAlmostEqual(result["headroom_ratio"], -0.18104066666666666, places=6)

    def test_compute_headroom_ratio_exact_fit_is_zero(self):
        result = compute_headroom_ratio(100.0, 1.0, 100.0)
        self.assertEqual(result["headroom_ratio"], 0.0)

    def test_compute_headroom_ratio_zero_coefficient_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_COEFFICIENT"):
            compute_headroom_ratio(1000.0, 0.0, 5.0)

    def test_compute_headroom_ratio_negative_coefficient_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_COEFFICIENT"):
            compute_headroom_ratio(1000.0, -0.1, 5.0)

    def test_compute_headroom_ratio_zero_capacity_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_CAPACITY"):
            compute_headroom_ratio(1000.0, 0.002, 0.0)

    def test_compute_headroom_ratio_negative_capacity_raises(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_CAPACITY"):
            compute_headroom_ratio(1000.0, 0.002, -5.0)

    def test_compute_headroom_ratio_repeated_multiplication_does_not_accumulate_float_drift(self):
        """Decimal's own narrower, honest benefit here (see this module's docstring): numerically stable
        compounding/division across realistic magnitudes, not big-integer exactness (this module's public
        signature takes float, unlike reconciliation's own string-input design). A required==capacity case
        at a magnitude where naive repeated float multiplication is known to drift must still land exactly
        on zero headroom."""
        result = compute_headroom_ratio(3.0, 0.1, 0.3)
        self.assertEqual(result["headroom_ratio"], 0.0)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_healthy_record_validates_against_the_real_schema(self):
        self.contracts.validate(CAPACITY_MODEL_RECORD_SCHEMA, _healthy_record(), "capacity model record")

    def test_healthy_record_has_status_healthy(self):
        self.assertEqual(_healthy_record()["status"], "healthy")

    def test_insufficient_capacity_yields_status_insufficient(self):
        record = generate_capacity_model_record(
            "CAPMODEL-T-002", "test resource", 1000.0, 0.10, 6, 0.002, 3.0, 0.15, 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED")
        )
        self.assertEqual(record["status"], "insufficient")
        self.contracts.validate(CAPACITY_MODEL_RECORD_SCHEMA, record, "insufficient capacity model record")

    def test_over_provisioned_capacity_yields_status_over_provisioned(self):
        record = generate_capacity_model_record(
            "CAPMODEL-T-003", "test resource", 1000.0, 0.10, 6, 0.002, 50.0, 0.15, 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED")
        )
        self.assertEqual(record["status"], "over_provisioned")
        self.contracts.validate(CAPACITY_MODEL_RECORD_SCHEMA, record, "over-provisioned capacity model record")

    def test_headroom_ratio_exactly_at_low_threshold_is_healthy_inclusive(self):
        """Atlas gives no basis for treating either boundary itself as a failure -- the middle band is
        inclusive of both threshold values. Construct a case where headroom_ratio lands exactly on
        low_threshold_ratio."""
        computed = compute_headroom_ratio(1771.561, 0.002, 5.0)  # headroom_ratio ~= 0.2913756
        record = generate_capacity_model_record(
            "CAPMODEL-T-004", "test resource", 1000.0, 0.10, 6, 0.002, 5.0, computed["headroom_ratio"], 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED")
        )
        self.assertEqual(record["status"], "healthy")

    def test_headroom_ratio_exactly_at_high_threshold_is_healthy_inclusive(self):
        """Regression for a critic-caught Major: only the LOW boundary was tested, and a real mutation
        (changing the high-boundary '>' to '>=') was proven to survive the entire suite undetected. This
        mirrors the low-boundary test for the high side."""
        computed = compute_headroom_ratio(1771.561, 0.002, 5.0)  # headroom_ratio ~= 0.2913756
        record = generate_capacity_model_record(
            "CAPMODEL-T-004B", "test resource", 1000.0, 0.10, 6, 0.002, 5.0, 0.15, computed["headroom_ratio"], make_provenance("CALCULATED_RESULT", "AI_GENERATED")
        )
        self.assertEqual(record["status"], "healthy")

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_EMPTY_RECORD_ID"):
            generate_capacity_model_record("", "x", 1000.0, 0.10, 6, 0.002, 5.0, 0.15, 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_empty_resource_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_EMPTY_RESOURCE_NAME"):
            generate_capacity_model_record("CAPMODEL-T-005", "", 1000.0, 0.10, 6, 0.002, 5.0, 0.15, 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_whitespace_only_resource_name_is_refused(self):
        """Regression: neither the schema's own minLength:1 nor a bare `not value` check would catch this --
        the guard must actually strip whitespace before checking emptiness."""
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_EMPTY_RESOURCE_NAME"):
            generate_capacity_model_record("CAPMODEL-T-005B", "   ", 1000.0, 0.10, 6, 0.002, 5.0, 0.15, 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_non_string_resource_name_is_refused_not_crashed(self):
        """Regression for a critic-caught Major: a non-string resource_name (e.g. an int) must fail closed,
        not escape as a raw AttributeError from calling .strip() on it."""
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_EMPTY_RESOURCE_NAME"):
            generate_capacity_model_record("CAPMODEL-T-005C", 123, 1000.0, 0.10, 6, 0.002, 5.0, 0.15, 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_low_threshold_equal_to_high_threshold_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_THRESHOLDS"):
            generate_capacity_model_record("CAPMODEL-T-006", "x", 1000.0, 0.10, 6, 0.002, 5.0, 0.30, 0.30, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_low_threshold_greater_than_high_threshold_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_THRESHOLDS"):
            generate_capacity_model_record("CAPMODEL-T-007", "x", 1000.0, 0.10, 6, 0.002, 5.0, 0.60, 0.15, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_infinite_low_threshold_is_refused_at_construction(self):
        """Regression for the critic-caught Critical (C2): ±inf thresholds reach the compute layer through
        the SANCTIONED public builder with zero tampering (e.g. from a YAML config typo -- YAML natively
        parses '-.inf'/'​.inf' as float infinities) -- must be refused, not silently certify any capacity as
        healthy."""
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_THRESHOLDS"):
            generate_capacity_model_record("CAPMODEL-T-007B", "x", 1000.0, 0.10, 6, 0.002, 0.001, float("-inf"), 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_infinite_high_threshold_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_THRESHOLDS"):
            generate_capacity_model_record("CAPMODEL-T-007C", "x", 1000.0, 0.10, 6, 0.002, 0.001, 0.15, float("inf"), make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_nan_threshold_is_refused_at_construction(self):
        """NaN makes every comparison False, so a naive `low >= high` ordering check alone would NOT catch
        this (NaN >= anything is False) -- the finiteness check must run independently of the ordering
        check, not be assumed to follow from it."""
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_THRESHOLDS"):
            generate_capacity_model_record("CAPMODEL-T-007D", "x", 1000.0, 0.10, 6, 0.002, 5.0, float("nan"), 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_invalid_workload_propagates_from_compute_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "CAPACITYMODEL_INVALID_WORKLOAD"):
            generate_capacity_model_record("CAPMODEL-T-008", "x", -1.0, 0.10, 6, 0.002, 5.0, 0.15, 0.60, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_capacity_model_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_all_three_gates(self):
        results = evaluate_capacity_model_gates(_healthy_record(), "test", "2026-09-05T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "capacity_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_status_fails_the_gate_via_recomputation(self):
        """The critical discipline this slice's own module docstring commits to: the gate RECOMPUTES status
        from the raw inputs, so flipping the stored status (while leaving current_workload/growth_rate_per_
        period/etc. untouched) is still caught -- a gate that only re-read the stored status would NOT catch
        this."""
        record = _healthy_record()
        record["status"] = "insufficient"
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("status", gate["evidence"][0]["mismatches"])

    def test_hand_tampered_headroom_ratio_fails_the_gate(self):
        record = _healthy_record()
        record["headroom_ratio"] = -0.99
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("headroom_ratio", gate["evidence"][0]["mismatches"])

    def test_hand_tampered_projected_workload_fails_the_gate(self):
        record = _healthy_record()
        record["projected_workload"] = 1.0
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("projected_workload", gate["evidence"][0]["mismatches"])

    def test_hand_tampered_required_resources_fails_the_gate(self):
        record = _healthy_record()
        record["required_resources"] = 999.0
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("required_resources", gate["evidence"][0]["mismatches"])

    def test_hand_tampered_raw_current_workload_with_stale_computed_fields_fails_the_gate(self):
        """A record hand-tampered at the RAW input layer (current_workload changed) while its own computed
        fields are left stale/consistent-with-the-ORIGINAL-input must also be caught -- the gate recomputes
        from current_workload, not from whatever the stored computed fields happen to already agree on."""
        record = _healthy_record()
        record["current_workload"] = 999999.0
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("projected_workload", gate["evidence"][0]["mismatches"])

    def test_missing_raw_fields_fails_closed_not_a_crash(self):
        record = _healthy_record()
        del record["current_workload"]
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "raw input fields missing or invalid -- cannot recompute")

    def test_invalid_raw_field_type_fails_closed_not_a_crash(self):
        record = _healthy_record()
        record["current_workload"] = "not-a-number"
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "raw input fields missing or invalid -- cannot recompute")

    def test_hand_tampered_reversed_thresholds_fails_the_gate(self):
        """Regression for the critic-caught Critical (C1): the gate must independently re-validate
        low_threshold_ratio < high_threshold_ratio, not only recompute the four downstream fields against
        whatever thresholds happen to be stored. A record hand-tampered to swap its own thresholds (while
        every OTHER field stays a byte-for-byte valid healthy record) must be caught -- prior to this fix,
        this exact tamper passed all three gates and the schema, making status:healthy unreachable."""
        record = _healthy_record()
        record["low_threshold_ratio"], record["high_threshold_ratio"] = record["high_threshold_ratio"], record["low_threshold_ratio"]
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "threshold ordering/finiteness precondition violated")

    def test_hand_tampered_infinite_threshold_fails_the_gate(self):
        """Regression for the critic-caught Critical (C2): the gate must reject non-finite thresholds even
        though `low < high` technically holds for `-inf < 0.60` -- prior to this fix this tamper certified a
        resource at a fraction of a percent of its required capacity as status:healthy."""
        record = _healthy_record()
        record["low_threshold_ratio"] = float("-inf")
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "threshold ordering/finiteness precondition violated")

    def test_hand_tampered_nan_threshold_fails_the_gate(self):
        record = _healthy_record()
        record["high_threshold_ratio"] = float("nan")
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "threshold ordering/finiteness precondition violated")

    def test_hand_tampered_huge_periods_ahead_fails_the_gate_not_a_crash(self):
        """Gate-layer companion to the builder's own decimal.Overflow regression."""
        record = _healthy_record()
        record["periods_ahead"] = 10**7
        gate = evaluate_capacity_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "raw input fields missing or invalid -- cannot recompute")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _healthy_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_genuine_compute_gate_is_the_real_evaluate_statistical_gate_function_reused_unchanged(self):
        """Proves the reuse is real function identity -- seventh reuse this session, after root_cause.pareto/
        decision.ahp/decision.mcda/devops_sre.error_budget/database_data.data_lineage/database_data
        .reconciliation."""
        from ai_lego.modules.devops_sre import capacity_model as capacity_model_module

        self.assertIs(capacity_model_module.evaluate_statistical_gate, evaluate_statistical_gate)

    def test_hand_tampered_wrong_epistemic_type_fails_the_genuine_compute_gate(self):
        record = _healthy_record()
        record["provenance"] = make_provenance("AI_INFERENCE", "AI_GENERATED")
        gate = evaluate_genuine_compute_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        """Every gate in this module's own aggregate must fail closed, not crash, on a non-dict top-level
        argument -- the same regression class ``root_cause.fault_tree``'s own
        ``test_non_dict_record_fails_all_gates_not_a_crash`` proves for its family."""
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                results = evaluate_capacity_model_gates(bad_record, "test", "2026-09-05T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


if __name__ == "__main__":
    unittest.main()
