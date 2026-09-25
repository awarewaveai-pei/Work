"""Mutation-style tests for ``decision.expected_value`` (7th Method Atlas slice from the decision family,
after ``decision.ahp``/``decision.mcda``/``decision.impact_effort``/``decision.ice``/``decision.rice``/
``decision.moscow``).

The compute layer (``ai_lego/compute/expected_value/calculation.py``) is
checked against a known arithmetic case plus boundary/edge inputs for both
of its own real invariants: states-sum-to-1.0 (mutual exclusivity and
exhaustiveness) and per-state shape validity -- including a precisely
constructed floating-point overflow case that exploits the tolerance slack
on the sum-to-1.0 check (a convex combination is normally bounded within
[min(outcome_value), max(outcome_value)], so overflow is NOT reachable
through arbitrary large inputs the way RICE's multiply-divide formula is --
it requires values at/near ``sys.float_info.max`` combined with the
tolerance's own slack, proven reachable here, not dead code). The
``genuine_compute`` gate is proven to actually RE-DERIVE ``expected_value``
from the record's own raw ``states`` (not merely check shape/resolvability
the way ``decision.mcda``/``decision.ahp``'s own gate does) via a battery of
hand-tampered records. ``states_mutually_exclusive_exhaustive`` is proven to
be an independent, dedicated diagnostic separate from ``genuine_compute``.
"""

from __future__ import annotations

import math
import sys
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.expected_value.calculation import DEFAULT_PROBABILITY_TOLERANCE, MIN_STATES, compute_expected_value
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.expected_value import (
    METHOD_ID,
    all_gates_pass,
    evaluate_expected_value_gates,
    evaluate_expected_value_genuine_compute_gate,
    evaluate_provenance_required_gate,
    evaluate_states_mutually_exclusive_exhaustive_gate,
    generate_expected_value_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

EXPECTED_VALUE_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/expected-value-record.schema.yaml"
GATE_RESULT_SCHEMA = "ai-lego://specs/execution/gate.schema.yaml#/gate_result"
METHOD_SCHEMA = "ai-lego://specs/cognitive/method.schema.yaml"
TS = "2026-09-08T00:00:00Z"


def _states(p1=0.3, v1=50000, p2=0.7, v2=-10000):
    return [
        {"id": "STATE-SUCCESS", "label": "產品成功", "probability": p1, "outcome_value": v1},
        {"id": "STATE-FAILURE", "label": "產品失敗", "probability": p2, "outcome_value": v2},
    ]


def _provenance():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _valid_record(**overrides):
    kwargs = dict(record_id="EXPECTEDVALUE-T-001", decision_subject="投資新產品線 Q1 launch", states=_states(), provenance=_provenance())
    kwargs.update(overrides)
    return generate_expected_value_record(**kwargs)


class ComputeLayerArithmeticTests(unittest.TestCase):
    """Real arithmetic against known cases, not just 'does it run'."""

    def test_known_case_computes_correctly(self):
        self.assertEqual(compute_expected_value(_states()), 8000.0)  # 0.3*50000 + 0.7*-10000 = 15000-7000

    def test_certain_single_outcome_via_two_degenerate_states(self):
        """A 'certain' outcome modeled as one state at probability 1.0 and a padding state at 0.0."""
        states = [{"probability": 1.0, "outcome_value": 42}, {"probability": 0.0, "outcome_value": 999}]
        self.assertEqual(compute_expected_value(states), 42.0)

    def test_zero_outcome_value_contributes_nothing(self):
        states = [{"probability": 0.5, "outcome_value": 0}, {"probability": 0.5, "outcome_value": 100}]
        self.assertEqual(compute_expected_value(states), 50.0)

    def test_negative_outcome_value_is_accepted_and_computed(self):
        """The task's own invariant: outcome_value is unbounded -- a loss is valid, not floored to 0."""
        states = [{"probability": 0.5, "outcome_value": -100}, {"probability": 0.5, "outcome_value": -200}]
        self.assertEqual(compute_expected_value(states), -150.0)

    def test_all_negative_outcomes_yields_negative_expected_value(self):
        states = [{"probability": 0.9, "outcome_value": -1000}, {"probability": 0.1, "outcome_value": -50}]
        self.assertEqual(compute_expected_value(states), -905.0)

    def test_three_state_case_computes_correctly(self):
        states = [
            {"probability": 0.2, "outcome_value": 100},
            {"probability": 0.3, "outcome_value": 200},
            {"probability": 0.5, "outcome_value": -40},
        ]
        self.assertEqual(compute_expected_value(states), 20 + 60 - 20)  # 60.0

    def test_result_rounded_to_eight_decimals(self):
        states = [{"probability": 1 / 3, "outcome_value": 1}, {"probability": 2 / 3, "outcome_value": 1}]
        result = compute_expected_value(states)
        self.assertEqual(result, round((1 / 3) * 1 + (2 / 3) * 1, 8))

    def test_large_but_realistic_finite_inputs_compute_without_error(self):
        states = [{"probability": 0.4, "outcome_value": 1e15}, {"probability": 0.6, "outcome_value": 2e15}]
        self.assertEqual(compute_expected_value(states), 1.6e15)

    def test_integer_inputs_accepted(self):
        states = [{"probability": 1, "outcome_value": 10}, {"probability": 0, "outcome_value": 20}]
        self.assertEqual(compute_expected_value(states), 10.0)

    def test_states_carrying_extra_id_label_keys_do_not_affect_arithmetic(self):
        """The compute layer only reads probability/outcome_value -- extra keys (id/label) are inert to it."""
        self.assertEqual(compute_expected_value(_states()), 8000.0)


class ComputeLayerTooFewStatesTests(unittest.TestCase):
    """MIN_STATES=2 -- a single state has zero probabilistic content (probability trivially forced to 1.0)."""

    def test_min_states_constant_is_two(self):
        self.assertEqual(MIN_STATES, 2)

    def test_empty_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_TOO_FEW_STATES"):
            compute_expected_value([])

    def test_single_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_TOO_FEW_STATES"):
            compute_expected_value([{"probability": 1.0, "outcome_value": 5}])

    def test_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_TOO_FEW_STATES"):
            compute_expected_value(None)

    def test_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_TOO_FEW_STATES"):
            compute_expected_value("not a list")

    def test_exactly_two_states_is_accepted(self):
        result = compute_expected_value(_states())
        self.assertTrue(math.isfinite(result))


class ComputeLayerStateShapeTests(unittest.TestCase):
    def test_non_dict_state_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_STATE_SHAPE"):
            compute_expected_value([{"probability": 0.5, "outcome_value": 1}, "not a dict"])

    def test_non_dict_state_entry_reports_its_own_index(self):
        with self.assertRaisesRegex(InvariantViolation, r"states\[1\]"):
            compute_expected_value([{"probability": 0.5, "outcome_value": 1}, "not a dict"])

    def test_each_invalid_probability_value_is_individually_refused(self):
        invalid_probabilities = [float("nan"), float("inf"), float("-inf"), None, "0.5", True, False, -0.1, 1.1]
        for bad in invalid_probabilities:
            with self.subTest(probability=bad):
                states = [{"probability": bad, "outcome_value": 1}, {"probability": 0.5, "outcome_value": 1}]
                with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_PROBABILITY"):
                    compute_expected_value(states)

    def test_each_invalid_outcome_value_is_individually_refused(self):
        invalid_outcomes = [float("nan"), float("inf"), float("-inf"), None, "100", True, False]
        for bad in invalid_outcomes:
            with self.subTest(outcome_value=bad):
                states = [{"probability": 0.5, "outcome_value": bad}, {"probability": 0.5, "outcome_value": 1}]
                with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_OUTCOME_VALUE"):
                    compute_expected_value(states)

    def test_outcome_value_of_negative_number_is_accepted_not_refused(self):
        """Confirms outcome_value's own negative-allowed contract -- NOT in the invalid list above."""
        states = [{"probability": 0.5, "outcome_value": -5000}, {"probability": 0.5, "outcome_value": 5000}]
        self.assertEqual(compute_expected_value(states), 0.0)

    def test_probability_of_exactly_zero_is_accepted(self):
        states = [{"probability": 0.0, "outcome_value": 999}, {"probability": 1.0, "outcome_value": 1}]
        self.assertEqual(compute_expected_value(states), 1.0)

    def test_probability_of_exactly_one_is_accepted(self):
        states = [{"probability": 1.0, "outcome_value": 7}, {"probability": 0.0, "outcome_value": 999}]
        self.assertEqual(compute_expected_value(states), 7.0)

    def test_error_message_names_the_offending_state_id_when_present(self):
        states = [{"id": "BAD-STATE", "probability": -1, "outcome_value": 1}, {"probability": 1.0, "outcome_value": 1}]
        with self.assertRaisesRegex(InvariantViolation, "BAD-STATE"):
            compute_expected_value(states)


class ComputeLayerSumToOneInvariantTests(unittest.TestCase):
    """Invariant #1: states must be mutually exclusive and exhaustive -- probabilities sum to 1.0 within
    tolerance (mirrors ai_lego/compute/mcda/scoring.py::validate_weights_sum_to_one's own tolerance
    convention for the identical invariant class)."""

    def test_default_tolerance_is_one_e_minus_six(self):
        self.assertEqual(DEFAULT_PROBABILITY_TOLERANCE, 1e-6)

    def test_sum_less_than_one_is_refused(self):
        states = [{"probability": 0.3, "outcome_value": 1}, {"probability": 0.5, "outcome_value": 1}]  # 0.8
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE"):
            compute_expected_value(states)

    def test_sum_greater_than_one_is_refused(self):
        states = [{"probability": 0.7, "outcome_value": 1}, {"probability": 0.7, "outcome_value": 1}]  # 1.4
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE"):
            compute_expected_value(states)

    def test_sum_of_zero_is_refused(self):
        states = [{"probability": 0.0, "outcome_value": 1}, {"probability": 0.0, "outcome_value": 1}]
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE"):
            compute_expected_value(states)

    def test_three_states_summing_to_less_than_one_is_refused(self):
        states = [{"probability": 0.2, "outcome_value": 1}, {"probability": 0.2, "outcome_value": 1}, {"probability": 0.2, "outcome_value": 1}]  # 0.6
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE"):
            compute_expected_value(states)

    def test_sum_exactly_one_is_accepted(self):
        states = [{"probability": 0.5, "outcome_value": 1}, {"probability": 0.5, "outcome_value": 1}]
        self.assertEqual(compute_expected_value(states), 1.0)

    def test_sum_just_within_tolerance_is_accepted(self):
        """|sum - 1.0| = 5e-7 < 1e-6 tolerance -- must PASS."""
        states = [{"probability": 0.3, "outcome_value": 1}, {"probability": 0.7 + 5e-7, "outcome_value": 1}]
        result = compute_expected_value(states)
        self.assertTrue(math.isfinite(result))

    def test_sum_just_outside_tolerance_is_refused(self):
        """|sum - 1.0| = 5e-5, well past the 1e-6 tolerance -- must FAIL."""
        states = [{"probability": 0.3, "outcome_value": 1}, {"probability": 0.7 + 5e-5, "outcome_value": 1}]
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE"):
            compute_expected_value(states)

    def test_custom_tolerance_widens_acceptance(self):
        states = [{"probability": 0.3, "outcome_value": 1}, {"probability": 0.6, "outcome_value": 1}]  # sum=0.9
        with self.assertRaises(InvariantViolation):
            compute_expected_value(states)  # default tolerance refuses
        result = compute_expected_value(states, tolerance=0.2)  # widened tolerance accepts
        self.assertTrue(math.isfinite(result))

    def test_error_message_reports_the_actual_sum(self):
        states = [{"probability": 0.1, "outcome_value": 1}, {"probability": 0.1, "outcome_value": 1}]
        with self.assertRaisesRegex(InvariantViolation, "sum=0.2"):
            compute_expected_value(states)


class ComputeLayerOverflowTests(unittest.TestCase):
    """A convex combination (Sigma p_i*v_i with Sigma p_i=1, each p_i in [0,1]) is mathematically bounded
    within [min(v_i), max(v_i)] -- unlike RICE's multiply-divide formula, overflow is NOT reachable through
    arbitrarily large ordinary inputs. It IS reachable by exploiting the sum-to-1.0 tolerance's own slack
    (allowing total probability mass slightly over 1.0) combined with outcome_value at sys.float_info.max --
    proven here, not asserted."""

    def test_overflowing_combination_via_tolerance_slack_is_refused(self):
        """probability sum = 1 + 9e-7 (within the 1e-6 tolerance) at outcome_value = float max -- the
        slight over-1.0 weighting pushes the weighted sum past the largest representable double."""
        max_float = sys.float_info.max
        states = [{"probability": 1.0, "outcome_value": max_float}, {"probability": 9e-7, "outcome_value": max_float}]
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_SUM_OVERFLOW"):
            compute_expected_value(states)

    def test_non_overflowing_extreme_combination_still_computes(self):
        """Exact sum-to-1.0, at float max -- a true convex combination of equal values, must equal that
        value exactly, no overflow."""
        max_float = sys.float_info.max
        states = [{"probability": 0.5, "outcome_value": max_float}, {"probability": 0.5, "outcome_value": max_float}]
        result = compute_expected_value(states)
        self.assertTrue(math.isfinite(result))
        self.assertEqual(result, max_float)

    def test_mixed_sign_extreme_values_do_not_overflow(self):
        max_float = sys.float_info.max
        states = [{"probability": 0.5, "outcome_value": max_float}, {"probability": 0.5, "outcome_value": -max_float}]
        result = compute_expected_value(states)
        self.assertEqual(result, 0.0)


class GenerateExpectedValueRecordConstructionTests(unittest.TestCase):
    def test_valid_record_validates_against_the_real_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        contracts.validate(EXPECTED_VALUE_RECORD_SCHEMA, _valid_record(), "expected value record")

    def test_expected_value_matches_manual_calculation(self):
        record = _valid_record()
        self.assertEqual(record["expected_value"], 8000.0)

    def test_record_id_must_start_with_prefix(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_RECORD_ID"):
            _valid_record(record_id="NOT-EXPECTEDVALUE-001")

    def test_record_id_ev_prefix_alone_is_refused(self):
        """'EV-' is a DIFFERENT, unrelated prefix (decision-journal's own Evidence ids) -- must not pass."""
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_RECORD_ID"):
            _valid_record(record_id="EV-001")

    def test_record_id_empty_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_RECORD_ID"):
            _valid_record(record_id="")

    def test_record_id_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_RECORD_ID"):
            _valid_record(record_id=None)

    def test_version_must_be_a_string(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_VERSION"):
            _valid_record(version=1.0)

    def test_decision_subject_empty_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_DECISION_SUBJECT"):
            _valid_record(decision_subject="")

    def test_decision_subject_whitespace_only_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_DECISION_SUBJECT"):
            _valid_record(decision_subject="   ")

    def test_decision_subject_none_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_DECISION_SUBJECT"):
            _valid_record(decision_subject=None)

    def test_states_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_STATES"):
            _valid_record(states="not a list")

    def test_states_too_few_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_STATES"):
            _valid_record(states=[{"id": "S1", "label": "x", "probability": 1.0, "outcome_value": 1}])

    def test_state_missing_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_STATES"):
            _valid_record(states=[{"id": "S1", "probability": 0.5, "outcome_value": 1}, {"id": "S2", "label": "y", "probability": 0.5, "outcome_value": 1}])

    def test_state_missing_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_STATES"):
            _valid_record(states=[{"label": "x", "probability": 0.5, "outcome_value": 1}, {"id": "S2", "label": "y", "probability": 0.5, "outcome_value": 1}])

    def test_state_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_STATES"):
            _valid_record(states=[{"id": "S1", "label": "  ", "probability": 0.5, "outcome_value": 1}, {"id": "S2", "label": "y", "probability": 0.5, "outcome_value": 1}])

    def test_state_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_STATES"):
            _valid_record(states=[{"id": "S1", "label": "x", "probability": 0.5, "outcome_value": 1, "extra": True}, {"id": "S2", "label": "y", "probability": 0.5, "outcome_value": 1}])

    def test_state_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_INVALID_STATES"):
            _valid_record(states=["not a dict", {"id": "S2", "label": "y", "probability": 1.0, "outcome_value": 1}])

    def test_duplicate_state_id_is_refused(self):
        states = [
            {"id": "SAME", "label": "x", "probability": 0.5, "outcome_value": 1},
            {"id": "SAME", "label": "y", "probability": 0.5, "outcome_value": 2},
        ]
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_DUPLICATE_STATE_ID"):
            _valid_record(states=states)

    def test_duplicate_state_id_names_the_offending_id(self):
        states = [
            {"id": "DUP-1", "label": "x", "probability": 0.5, "outcome_value": 1},
            {"id": "DUP-1", "label": "y", "probability": 0.5, "outcome_value": 2},
        ]
        with self.assertRaisesRegex(InvariantViolation, "DUP-1"):
            _valid_record(states=states)

    def test_nonexhaustive_states_propagates_from_compute_layer(self):
        states = [{"id": "S1", "label": "x", "probability": 0.3, "outcome_value": 1}, {"id": "S2", "label": "y", "probability": 0.3, "outcome_value": 1}]
        with self.assertRaisesRegex(InvariantViolation, "EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE"):
            _valid_record(states=states)

    def test_generated_by_method_defaults_correctly(self):
        self.assertEqual(_valid_record()["generated_by_method"], "decision.expected_value")

    def test_version_defaults_to_one_zero_zero(self):
        self.assertEqual(_valid_record()["version"], "1.0.0")

    def test_custom_version_is_accepted(self):
        self.assertEqual(_valid_record(version="2.1.0")["version"], "2.1.0")

    def test_engine_field_is_the_deterministic_compute_literal(self):
        self.assertEqual(_valid_record()["engine"], "local_python_deterministic_compute")

    def test_computation_provenance_ref_points_at_compute_expected_value(self):
        self.assertEqual(_valid_record()["computation_provenance_ref"], "ai_lego.compute.expected_value.calculation.compute_expected_value")

    def test_states_are_copied_not_aliased(self):
        states = _states()
        record = _valid_record(states=states)
        record["states"][0]["label"] = "mutated"
        self.assertNotEqual(states[0]["label"], "mutated")

    def test_states_list_itself_is_a_new_list(self):
        states = _states()
        record = _valid_record(states=states)
        record["states"].append({"id": "INJECTED", "label": "x", "probability": 0, "outcome_value": 0})
        self.assertEqual(len(states), 2)

    def test_record_id_prefix_constant_is_not_ev_dash(self):
        """Guards against a future accidental revert to the colliding 'EV-' prefix."""
        from ai_lego.modules.decision.expected_value import RECORD_ID_PREFIX

        self.assertEqual(RECORD_ID_PREFIX, "EXPECTEDVALUE-")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(resolve_spec_root())
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_expected_value_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class StatesMutuallyExclusiveExhaustiveGateTests(unittest.TestCase):
    """Invariant #1's own dedicated gate -- independent diagnostic, re-derived directly from the record's
    own raw states."""

    def test_valid_record_passes(self):
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(_valid_record(), "test", TS)
        self.assertEqual(gate["status"], "PASS")

    def test_tampered_nonexhaustive_states_fails(self):
        record = _valid_record()
        record["states"] = [{"id": "S1", "label": "x", "probability": 0.3, "outcome_value": 1}, {"id": "S2", "label": "y", "probability": 0.3, "outcome_value": 1}]
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_tampered_overexhaustive_states_fails(self):
        record = _valid_record()
        record["states"] = [{"id": "S1", "label": "x", "probability": 0.8, "outcome_value": 1}, {"id": "S2", "label": "y", "probability": 0.8, "outcome_value": 1}]
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_reports_the_actual_probability_sum_as_evidence(self):
        record = _valid_record()
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(record, "test", TS)
        self.assertAlmostEqual(gate["evidence"][0]["probability_sum"], 1.0)

    def test_too_few_states_fails(self):
        record = _valid_record()
        record["states"] = [{"id": "S1", "label": "x", "probability": 1.0, "outcome_value": 1}]
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_states_not_a_list_fails_closed(self):
        record = _valid_record()
        record["states"] = "not a list"
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_states_missing_entirely_fails_closed(self):
        record = _valid_record()
        del record["states"]
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_state_entry_not_a_dict_fails_closed(self):
        record = _valid_record()
        record["states"] = ["not a dict", {"id": "S2", "label": "y", "probability": 1.0, "outcome_value": 1}]
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_state_missing_probability_fails_closed(self):
        record = _valid_record()
        record["states"] = [{"id": "S1", "label": "x", "outcome_value": 1}, {"id": "S2", "label": "y", "probability": 1.0, "outcome_value": 1}]
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_state_probability_of_nan_fails_closed(self):
        record = _valid_record()
        record["states"] = [{"id": "S1", "label": "x", "probability": float("nan"), "outcome_value": 1}, {"id": "S2", "label": "y", "probability": 1.0, "outcome_value": 1}]
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_a_non_dict_record(self):
        gate = evaluate_states_mutually_exclusive_exhaustive_gate("not a dict", "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_none(self):
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(None, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_passes_within_tolerance_slack(self):
        record = _valid_record()
        record["states"] = [{"id": "S1", "label": "x", "probability": 0.3, "outcome_value": 1}, {"id": "S2", "label": "y", "probability": 0.7 + 4e-7, "outcome_value": 1}]
        gate = evaluate_states_mutually_exclusive_exhaustive_gate(record, "test", TS)
        self.assertEqual(gate["status"], "PASS")


class GenuineComputeGateTests(unittest.TestCase):
    """Invariant #2: the gate RE-INVOKES compute_expected_value against the record's own raw states and
    compares to the stored expected_value -- never trusts it. Strictly stronger than decision.mcda/
    decision.ahp's own genuine_compute gate, which checks only shape/resolvability."""

    def test_valid_record_passes_the_gate(self):
        gate = evaluate_expected_value_genuine_compute_gate(_valid_record(), "test", TS)
        self.assertEqual(gate["status"], "PASS")

    def test_inflated_expected_value_is_caught(self):
        record = _valid_record()
        record["expected_value"] = record["expected_value"] + 999999
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_deflated_expected_value_is_caught(self):
        record = _valid_record()
        record["expected_value"] = 0.0001
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_sign_flipped_expected_value_is_caught(self):
        record = _valid_record()
        record["expected_value"] = -record["expected_value"]
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_tampered_outcome_value_without_recomputed_expected_value_is_caught(self):
        """A caller who edits states[].outcome_value but forgets to recompute expected_value must be caught."""
        record = _valid_record()
        record["states"][0]["outcome_value"] = 999999
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_tampered_probability_that_breaks_sum_to_one_is_caught_without_crashing(self):
        """genuine_compute transitively re-enforces invariant #1 too (compute_expected_value itself
        raises), proving this gate does not silently skip the sum check when re-deriving."""
        record = _valid_record()
        record["states"][0]["probability"] = 0.1  # 0.1 + 0.7 = 0.8, no longer exhaustive
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["recompute_succeeded"])
        self.assertIn("EXPECTEDVALUE_PROBABILITIES_DO_NOT_SUM_TO_ONE", gate["evidence"][1]["recompute_error"])

    def test_tampered_probability_out_of_range_is_caught_without_crashing(self):
        record = _valid_record()
        record["states"][0]["probability"] = 5.0
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["recompute_succeeded"])
        self.assertIn("EXPECTEDVALUE_INVALID_PROBABILITY", gate["evidence"][1]["recompute_error"])

    def test_tampered_outcome_value_to_nan_is_caught_without_crashing(self):
        record = _valid_record()
        record["states"][0]["outcome_value"] = float("nan")
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["recompute_succeeded"])

    def test_tampered_states_down_to_one_entry_is_caught(self):
        record = _valid_record()
        record["states"] = [{"id": "S1", "label": "x", "probability": 1.0, "outcome_value": record["expected_value"]}]
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["states_present_and_list"])

    def test_tampered_engine_field_is_caught(self):
        record = _valid_record()
        record["engine"] = "llm_mental_math"
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["engine_is_deterministic_compute_not_llm"])

    def test_tampered_computation_provenance_ref_is_caught(self):
        record = _valid_record()
        record["computation_provenance_ref"] = "ai_lego.compute.nonexistent.nope"
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["computation_provenance_ref_resolves"])

    def test_gate_fails_closed_on_a_non_dict_record(self):
        gate = evaluate_expected_value_genuine_compute_gate(None, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_a_stored_expected_value_that_overflowed_before_recompute_is_even_attempted(self):
        record = _valid_record()
        max_float = sys.float_info.max
        record["states"] = [{"id": "S1", "label": "x", "probability": 1.0, "outcome_value": max_float}, {"id": "S2", "label": "y", "probability": 9e-7, "outcome_value": max_float}]
        record["expected_value"] = 123.0  # any stored value -- the recompute itself fails first
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertFalse(gate["evidence"][0]["recompute_succeeded"])
        self.assertIn("EXPECTEDVALUE_SUM_OVERFLOW", gate["evidence"][1]["recompute_error"])

    def test_gate_reports_both_recomputed_and_stored_values_as_evidence(self):
        record = _valid_record()
        record["expected_value"] = 1.0
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertIn("recomputed_expected_value", gate["evidence"][1])
        self.assertIn("stored_expected_value", gate["evidence"][1])
        self.assertEqual(gate["evidence"][1]["stored_expected_value"], 1.0)

    def test_this_gate_is_strictly_stronger_than_a_resolvability_only_check(self):
        """A record with a schema-valid, resolvable computation_provenance_ref but a WRONG stored value
        would pass decision.mcda/decision.ahp's own resolvability-only genuine_compute gate design -- this
        gate must still catch it."""
        record = _valid_record()
        record["expected_value"] = record["expected_value"] + 1.0
        self.assertTrue(record["computation_provenance_ref"].startswith("ai_lego.compute."))  # ref still resolves
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_valid_record_with_three_states_passes(self):
        record = _valid_record(states=[
            {"id": "S1", "label": "a", "probability": 0.2, "outcome_value": 100},
            {"id": "S2", "label": "b", "probability": 0.3, "outcome_value": 200},
            {"id": "S3", "label": "c", "probability": 0.5, "outcome_value": -40},
        ])
        gate = evaluate_expected_value_genuine_compute_gate(record, "test", TS)
        self.assertEqual(gate["status"], "PASS")


class ProvenanceRequiredGateTests(unittest.TestCase):
    def test_valid_record_passes(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", TS)
        self.assertEqual(gate["status"], "PASS")

    def test_missing_provenance_fails(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_malformed_provenance_fails(self):
        record = _valid_record()
        record["provenance"] = {"epistemic_type": "NOT_REAL"}
        gate = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_simulated_result_epistemic_type_is_schema_valid_but_disclosed_as_unexpected(self):
        """SIMULATED_RESULT is a valid enum member (Monte Carlo uses it) so provenance_is_valid itself
        does not reject it here -- the CALCULATED_RESULT expectation is documented (schema description),
        not mechanically enforced by this gate. Documents the boundary, does not assert a stronger
        guarantee than what is actually checked."""
        record = _valid_record()
        record["provenance"] = make_provenance("SIMULATED_RESULT", "AI_GENERATED")
        gate = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "PASS")

    def test_gate_fails_closed_on_a_non_dict_record(self):
        gate = evaluate_provenance_required_gate(42, "test", TS)
        self.assertEqual(gate["status"], "FAIL")


class EvaluateExpectedValueGatesTests(unittest.TestCase):
    def test_valid_record_passes_all_three_gates(self):
        results = evaluate_expected_value_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "states_mutually_exclusive_exhaustive", "genuine_compute"})
        self.assertTrue(all_gates_pass(results))

    def test_gates_returned_in_a_stable_order(self):
        results = evaluate_expected_value_gates(_valid_record(), "test", TS)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "states_mutually_exclusive_exhaustive", "genuine_compute"])

    def test_all_gates_pass_returns_false_when_sum_invariant_fails(self):
        record = _valid_record()
        record["states"][0]["probability"] = 0.1
        results = evaluate_expected_value_gates(record, "test", TS)
        self.assertFalse(all_gates_pass(results))

    def test_all_gates_pass_returns_false_when_genuine_compute_fails(self):
        record = _valid_record()
        record["expected_value"] = -1.0
        results = evaluate_expected_value_gates(record, "test", TS)
        self.assertFalse(all_gates_pass(results))

    def test_every_gate_result_validates_against_the_gate_result_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        results = evaluate_expected_value_gates(_valid_record(), "test", TS)
        for gate in results:
            with self.subTest(gate_id=gate["gate_id"]):
                contracts.validate(GATE_RESULT_SCHEMA, gate, f"expected value gate {gate['gate_id']}")


class SchemaLayerIndependentEnforcementTests(unittest.TestCase):
    """The typed-object schema's own additionalProperties:false independently refuses a hand-crafted
    bypass carrying an unknown top-level or per-state key -- same second-layer discipline every sibling
    schema in this family already establishes."""

    def test_unknown_top_level_key_is_refused_by_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_record()
        tampered["approved"] = True
        with self.assertRaises(SchemaValidationError):
            contracts.validate(EXPECTED_VALUE_RECORD_SCHEMA, tampered, "hand-crafted bypass")

    def test_unknown_per_state_key_is_refused_by_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_record()
        tampered["states"][0]["confidence_note"] = "just a hunch"
        with self.assertRaises(SchemaValidationError):
            contracts.validate(EXPECTED_VALUE_RECORD_SCHEMA, tampered, "hand-crafted bypass")

    def test_probability_outside_zero_to_one_is_refused_by_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_record()
        tampered["states"][0]["probability"] = 1.5
        with self.assertRaises(SchemaValidationError):
            contracts.validate(EXPECTED_VALUE_RECORD_SCHEMA, tampered, "hand-crafted bypass")

    def test_wrong_id_prefix_is_refused_by_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_record()
        tampered["id"] = "EV-2026-09-08-001"
        with self.assertRaises(SchemaValidationError):
            contracts.validate(EXPECTED_VALUE_RECORD_SCHEMA, tampered, "hand-crafted bypass")


class MethodContractValidationTests(unittest.TestCase):
    """The contract's own ``verification.method`` text CLAIMS it was validated against
    ``method.schema.yaml`` -- actually re-runs that check here so the claim stays true if the contract
    file ever drifts (R4: claim-before-verify, not just asserted once by hand -- same pattern
    ``decision.impact_effort``'s own ``SpecConformanceTests.test_method_contract_yaml_itself_validates_against_method_schema``
    establishes)."""

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_method_contract_yaml_itself_validates_against_method_schema(self):
        import yaml

        contract_path = self.spec_root / "methods" / "contracts" / "decision.expected_value.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate(METHOD_SCHEMA, instance, "decision.expected_value contract")

    def test_typed_object_schema_file_itself_is_valid_yaml_and_carries_its_own_id(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "expected-value-record.schema.yaml"
        instance = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(instance["$id"], "ai-lego://specs/cognitive/typed-objects/expected-value-record.schema.yaml")


if __name__ == "__main__":
    unittest.main()
