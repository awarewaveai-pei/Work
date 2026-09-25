"""Mutation-style tests for ``devops_sre.error_budget`` (twenty-fourth Method Atlas slice, fifth from the
`devops_sre` family). Atlas's own benefit text (burn too fast automatically lowers release risk) is proven at
BOTH independent layers -- construction-time and gate re-derivation -- same discipline every prior
forbidden-state guard this session built already established. The compute layer
(``ai_lego/compute/error_budget/budget.py``) is tested for real arithmetic correctness, not just "does it run".
``evaluate_genuine_compute_gate`` is proven to be the SAME function object
``modules.research.gates.evaluate_statistical_gate`` already uses, reused unchanged.

Includes a critic-caught regression (this file's own first review pass): Atlas's own worked example (§11.40
L2151, SLO 99.9% -> 0.1% budget) computed UNROUNDED landed ``burn_rate`` at ``0.9999999999999991`` for an
exactly-consumed budget -- just under the ``>= 1.0`` exhaustion threshold, silently defeating the one invariant
this slice exists to enforce. Fixed by rounding in the compute layer; regression-tested here through the full
``generate_error_budget_record`` pipeline, not through hand-fed intermediate values (a hand-fed
``error_budget_ratio=0.001`` literal is a value the real pipeline never produces -- ``calculate_error_budget_ratio
(0.999)`` itself returns ``0.0010000000000000009`` before rounding -- and testing against it would have missed
this exact bug)."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.error_budget.budget import calculate_burn_rate, calculate_error_budget_ratio
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre import error_budget as error_budget_module
from ai_lego.modules.devops_sre.error_budget import (
    METHOD_ID,
    all_gates_pass,
    evaluate_error_budget_gates,
    evaluate_exhausted_forbids_unrestricted_gate,
    evaluate_genuine_compute_gate,
    generate_error_budget_record,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

ERROR_BUDGET_SCHEMA = "ai-lego://specs/cognitive/typed-objects/error-budget-record.schema.yaml"


def _healthy_record():
    return generate_error_budget_record(
        "EB-T-001", "Checkout API", 0.999, 0.0005, "unrestricted",
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"), related_slo_id="SLO-T-001",
    )


def _exhausted_record():
    return generate_error_budget_record(
        "EB-T-EXH", "Checkout API", 0.999, 0.002, "frozen",
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )


class ComputeTests(unittest.TestCase):
    """Real arithmetic, not just 'does it run'."""

    def test_error_budget_ratio_is_one_minus_slo(self):
        self.assertEqual(calculate_error_budget_ratio(0.999), 0.001)
        self.assertEqual(calculate_error_budget_ratio(0.9), 0.1)

    def test_slo_target_of_exactly_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_SLO_OUT_OF_RANGE"):
            calculate_error_budget_ratio(1.0)

    def test_slo_target_of_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_SLO_OUT_OF_RANGE"):
            calculate_error_budget_ratio(0.0)

    def test_slo_target_with_too_many_nines_underflows_to_a_degenerate_budget_and_is_refused(self):
        """13+ nines of SLO precision rounds `1 - slo` to exactly 0.0 at the 12-decimal rounding this module
        applies -- the postcondition guard must catch this, not silently return a zero budget that would make
        every downstream calculate_burn_rate call divide by zero."""
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_SLO_OUT_OF_RANGE"):
            calculate_error_budget_ratio(0.9999999999999)

    def test_burn_rate_half_budget_consumed(self):
        self.assertEqual(calculate_burn_rate(0.0005, 0.001), 0.5)

    def test_burn_rate_double_the_budget(self):
        self.assertEqual(calculate_burn_rate(0.002, 0.001), 2.0)

    def test_burn_rate_exactly_at_budget_through_the_real_pipeline_is_one(self):
        """Driven through calculate_error_budget_ratio's own real output, not a hand-typed 0.001 literal --
        the hand-typed literal is exactly the value that hid the critic-caught rounding bug."""
        budget = calculate_error_budget_ratio(0.999)
        self.assertEqual(calculate_burn_rate(budget, budget), 1.0)

    def test_negative_observed_failure_rate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_INVALID_FAILURE_RATE"):
            calculate_burn_rate(-0.001, 0.001)

    def test_nan_observed_failure_rate_is_refused(self):
        """A realistic output of a failures/total metrics pipeline with a zero denominator, not a contrived
        input -- NaN compares False to everything including `< 0`, so a naive negativity check alone would
        silently accept it."""
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_INVALID_FAILURE_RATE"):
            calculate_burn_rate(float("nan"), 0.001)

    def test_infinite_observed_failure_rate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_INVALID_FAILURE_RATE"):
            calculate_burn_rate(float("inf"), 0.001)

    def test_zero_error_budget_ratio_is_refused_by_calculate_burn_rate_directly(self):
        """calculate_burn_rate guards its own divisor rather than relying solely on
        calculate_error_budget_ratio's own invariant -- both public functions are independently callable."""
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_ZERO_BUDGET"):
            calculate_burn_rate(0.001, 0.0)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_record_validates_against_the_real_schema(self):
        self.contracts.validate(ERROR_BUDGET_SCHEMA, _healthy_record(), "error budget record")

    def test_exhausted_budget_frozen_is_legal(self):
        record = _exhausted_record()
        self.assertTrue(record["budget_exhausted"])
        self.contracts.validate(ERROR_BUDGET_SCHEMA, record, "exhausted budget record")

    def test_atlas_worked_example_exactly_consumes_budget_and_forbids_unrestricted(self):
        """Regression for the critic-caught float-rounding bug: SLO 99.9% (Atlas's own worked example, §11.40
        L2151) with observed_failure_rate exactly at the budget must be treated as exhausted, not silently
        accepted as healthy."""
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_EXHAUSTED_FORBIDS_UNRESTRICTED"):
            generate_error_budget_record("EB-T-006", "svc", 0.999, 0.001, "unrestricted", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_atlas_worked_example_exactly_consumes_budget_is_legal_when_frozen(self):
        record = generate_error_budget_record("EB-T-007", "svc", 0.999, 0.001, "frozen", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        self.assertEqual(record["burn_rate"], 1.0)
        self.assertTrue(record["budget_exhausted"])
        self.contracts.validate(ERROR_BUDGET_SCHEMA, record, "exactly-exhausted record")

    def test_empty_service_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_EMPTY_SERVICE"):
            generate_error_budget_record("EB-T-003", "", 0.999, 0.0005, "unrestricted", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_invalid_release_policy_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_INVALID_RELEASE_POLICY"):
            generate_error_budget_record("EB-T-004", "x", 0.999, 0.0005, "throttled", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_exhausted_budget_with_unrestricted_policy_is_refused_at_construction(self):
        """Atlas's own benefit text (§11.40): burn too fast automatically lowers release risk."""
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_EXHAUSTED_FORBIDS_UNRESTRICTED"):
            generate_error_budget_record("EB-T-005", "x", 0.999, 0.002, "unrestricted", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_observed_failure_rate_above_one_is_refused_at_construction(self):
        """Contract precondition 2 ('observed_failure_rate is between 0 and 1 inclusive') is enforced by the
        builder itself, not left to the schema layer alone."""
        with self.assertRaisesRegex(InvariantViolation, "ERRORBUDGET_FAILURE_RATE_OUT_OF_RANGE"):
            generate_error_budget_record("EB-T-008", "x", 0.999, 5.0, "frozen", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_error_budget_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_both_gates(self):
        results = evaluate_error_budget_gates(_healthy_record(), "test", "2026-09-05T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"genuine_compute", "exhausted_forbids_unrestricted"})
        self.assertTrue(all_gates_pass(results))

    def test_exhausted_record_passes_both_gates(self):
        results = evaluate_error_budget_gates(_exhausted_record(), "test", "2026-09-05T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_healthy_to_exhausted_flag_fails_the_gate(self):
        """Mutation direction 1: a healthy record's own stored budget_exhausted flag flipped to True without
        changing the raw slo/observed fields -- the recomputed value no longer matches the stored one."""
        record = _healthy_record()
        record["budget_exhausted"] = True
        gate = evaluate_exhausted_forbids_unrestricted_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_exhausted_record_hidden_as_unrestricted_fails_the_gate(self):
        """Mutation direction 2 (the direction that actually matters): an exhausted record with
        budget_exhausted/release_policy BOTH flipped to hide the exhaustion (budget_exhausted:false,
        release_policy:unrestricted) while slo_target_ratio/observed_failure_rate are left untouched. A gate
        that only re-reads the stored budget_exhausted boolean would pass this; re-derivation from the raw
        fields must not."""
        record = _exhausted_record()
        record["budget_exhausted"] = False
        record["release_policy"] = "unrestricted"
        gate = evaluate_exhausted_forbids_unrestricted_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        all_results = evaluate_error_budget_gates(record, "test", "2026-09-05T00:00:00Z")
        self.assertFalse(all_gates_pass(all_results))

    def test_hand_tampered_burn_rate_alone_fails_the_consistency_check(self):
        """A record whose stored burn_rate/error_budget_ratio no longer match what the raw fields recompute is
        a FAIL even when budget_exhausted and release_policy both look internally consistent with each other --
        this is a consistency check on the whole record, not merely a policy check on two fields."""
        record = _healthy_record()
        record["burn_rate"] = 0.0001
        gate = evaluate_exhausted_forbids_unrestricted_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_missing_raw_fields_fail_closed_rather_than_pass(self):
        """A record missing the raw slo_target_ratio/observed_failure_rate fields the gate needs to recompute
        from cannot be verified -- it must FAIL closed, not default to PASS."""
        record = _healthy_record()
        del record["slo_target_ratio"]
        gate = evaluate_exhausted_forbids_unrestricted_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_genuine_compute_gate_is_the_real_evaluate_statistical_gate_function_reused_unchanged(self):
        """Proves the reuse is real function identity, not a coincidentally-identical rewrite."""
        self.assertIs(error_budget_module.evaluate_statistical_gate, evaluate_statistical_gate)

    def test_hand_tampered_wrong_epistemic_type_fails_the_genuine_compute_gate(self):
        record = _healthy_record()
        record["provenance"] = make_provenance("AI_INFERENCE", "AI_GENERATED")
        gate = evaluate_genuine_compute_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        """Every gate in this module's own aggregate must fail closed, not crash, on a non-dict top-level
        argument -- the same regression class ``root_cause.fault_tree``'s own
        ``test_non_dict_record_fails_all_gates_not_a_crash`` proves for its family. BOTH gates needed the
        ``isinstance`` guard: ``evaluate_exhausted_forbids_unrestricted_gate``'s own
        ``except (KeyError, InvariantViolation, TypeError)`` looked sufficient by inspection (subscripting a
        non-dict with a string key raises ``TypeError``) but only shields the recomputation block -- its own
        evidence-building code afterward calls ``record.get(...)`` unconditionally, which raises
        ``AttributeError`` on a non-dict record. This test running red before the fix is what caught that a
        code-reading argument alone had missed."""
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                results = evaluate_error_budget_gates(bad_record, "test", "2026-09-05T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


if __name__ == "__main__":
    unittest.main()
