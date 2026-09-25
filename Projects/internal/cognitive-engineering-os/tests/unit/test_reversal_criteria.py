"""Mutation-style tests for ``learning.reversal_criteria`` (eighth Method Atlas slice, first from the learning
family, fifth structural shape this session -- a monitoring rule, not a chain/ranking/graph/matrix).

The compute layer (``ai_lego/compute/monitoring/triggers.py``) is checked
against known consecutive-threshold cases (a clean crossing, a dip that
breaks the streak, insufficient history, and the boundary difference
between ``>`` and ``>=`` at exactly the threshold value).
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.monitoring.triggers import consecutive_threshold_triggered
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.learning.reversal_criteria import (
    METHOD_ID,
    all_gates_pass,
    evaluate_actionable_gate,
    evaluate_criterion_trigger,
    evaluate_provenance_required_gate,
    evaluate_reversal_criteria_gates,
    generate_reversal_criteria_set,
    reversal_criterion,
    structured_rule,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

REVERSAL_CRITERIA_SET_SCHEMA = "ai-lego://specs/cognitive/typed-objects/reversal-criteria-set.schema.yaml"
DECISION_REVERSAL_SINGLE_FORM = "ai-lego://specs/decision/reversal.schema.yaml#/definitions/single_indicator_form"


def _structured_criterion():
    return reversal_criterion(
        "RCS-T-001-C1", "CAC", "> 300 USD for 3 consecutive months", "re_review", "growth_lead",
        make_provenance("DECISION", "HUMAN_APPROVED"), rule=structured_rule(">", 300, 3),
    )


def _qualitative_criterion():
    return reversal_criterion(
        "RCS-T-001-C2", "escalations", "two escalations in one quarter", "escalate", "product_lead",
        make_provenance("DECISION", "HUMAN_APPROVED"),
    )


def _valid_set():
    return generate_reversal_criteria_set("RCS-T-001", "DEC-T-001", [_structured_criterion(), _qualitative_criterion()], make_provenance("DECISION", "HUMAN_APPROVED"))


class TriggerComputeTests(unittest.TestCase):
    """Real comparison logic against known cases, not just 'does it run'."""

    def test_atlas_worked_example_crossing_case_triggers(self):
        self.assertTrue(consecutive_threshold_triggered([250, 310, 320, 305], ">", 300, 3))

    def test_a_dip_breaks_the_consecutive_streak(self):
        self.assertFalse(consecutive_threshold_triggered([250, 310, 290, 305], ">", 300, 3))

    def test_insufficient_history_never_triggers(self):
        self.assertFalse(consecutive_threshold_triggered([310, 320], ">", 300, 3))

    def test_strictly_greater_vs_greater_or_equal_at_exact_threshold(self):
        self.assertFalse(consecutive_threshold_triggered([300, 300, 300], ">", 300, 3))
        self.assertTrue(consecutive_threshold_triggered([300, 300, 300], ">=", 300, 3))

    def test_unknown_operator_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TRIGGER_UNKNOWN_OPERATOR"):
            consecutive_threshold_triggered([1, 2, 3], "!=", 1, 1)

    def test_invalid_consecutive_periods_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TRIGGER_INVALID_CONSECUTIVE_PERIODS"):
            consecutive_threshold_triggered([1, 2, 3], ">", 1, 0)


class SchemaConsolidationTests(unittest.TestCase):
    """Regression guard for the 2026-09-04 duplicate-schema correction: reversal_criterion() must build an
    instance of decision/reversal.schema.yaml's own single_indicator_form (field names indicator/condition/
    action/owner), not a competing, independently-invented shape. See reversal-criteria-set.schema.yaml's own
    description for the full correction record."""

    @classmethod
    def setUpClass(cls):
        cls.contracts = SchemaContracts(resolve_spec_root())

    def test_a_built_criterion_stripped_to_its_base_fields_validates_against_the_canonical_reversal_schema(self):
        criterion = _structured_criterion()
        base_fields = {k: v for k, v in criterion.items() if k in {"indicator", "condition", "action", "owner"}}
        self.contracts.validate(DECISION_REVERSAL_SINGLE_FORM, base_fields, "criterion base fields")

    def test_field_is_named_condition_not_condition_description(self):
        """The retired v1.0.0 name, kept as an explicit regression guard so this mistake cannot silently return."""
        criterion = _structured_criterion()
        self.assertIn("condition", criterion)
        self.assertNotIn("condition_description", criterion)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_reversal_criteria_set_validates_against_the_real_schema(self):
        self.contracts.validate(REVERSAL_CRITERIA_SET_SCHEMA, _valid_set(), "reversal criteria set")

    def test_empty_action_is_refused_at_construction_not_left_to_schema_validation(self):
        with self.assertRaisesRegex(InvariantViolation, "REVERSALCRITERIA_EMPTY_ACTION"):
            reversal_criterion("RCS-T-002-C1", "x", "y", "  ", "owner", make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_empty_owner_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "REVERSALCRITERIA_EMPTY_OWNER"):
            reversal_criterion("RCS-T-003-C1", "x", "y", "action", "", make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_empty_criteria_set_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REVERSALCRITERIA_EMPTY_SET"):
            generate_reversal_criteria_set("RCS-T-004", "DEC-T-004", [], make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_unknown_operator_in_structured_rule_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "REVERSALCRITERIA_UNKNOWN_OPERATOR"):
            structured_rule("!=", 1, 1)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_reversal_criteria_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class TriggerEvaluationTests(unittest.TestCase):
    def test_structured_criterion_triggers_on_a_real_crossing(self):
        self.assertTrue(evaluate_criterion_trigger(_structured_criterion(), [250, 310, 320, 305]))

    def test_structured_criterion_does_not_trigger_on_a_dip(self):
        self.assertFalse(evaluate_criterion_trigger(_structured_criterion(), [250, 310, 290, 305]))

    def test_qualitative_criterion_with_no_structured_rule_is_never_guessed(self):
        """No structured_rule -> None, not False -- a qualitative criterion is genuinely not mechanically
        evaluable, and that must be distinguishable from 'evaluated and did not trigger'."""
        self.assertIsNone(evaluate_criterion_trigger(_qualitative_criterion(), [1, 2, 3]))


class GateMutationTests(unittest.TestCase):
    def test_valid_set_passes_both_gates(self):
        results = evaluate_reversal_criteria_gates(_valid_set(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "actionable"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        criteria_set = _valid_set()
        criteria_set["criteria"][0] = {**criteria_set["criteria"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(criteria_set, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_empty_owner_fails_actionable_gate(self):
        """Mutation-style: the actionable gate re-checks structurally, it does not just trust that the builder's
        own construction-time check already ran (a hand-crafted/tampered record must still be caught)."""
        criteria_set = _valid_set()
        criteria_set["criteria"][0] = {**criteria_set["criteria"][0], "owner": "   "}
        gate = evaluate_actionable_gate(criteria_set, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
