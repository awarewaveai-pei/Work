"""Mutation-style tests for ``foresight.backcasting`` (F13 foresight family, Atlas F13 table row L683).

Atlas's own pipeline ("future state->milestones backward->today actions")
is proven at BOTH independent layers: the construction-time builder
refuses an out-of-order milestone chain or a plan with zero today_actions,
and the independent gate re-derives both rules directly from a raw
(possibly hand-tampered) dict, never trusting that the builder's own check
already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.backcasting import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_backcasting_gates,
    evaluate_lands_on_today_gate,
    evaluate_milestone_chain_gate,
    evaluate_provenance_required_gate,
    generate_backcasting_plan,
    milestone,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

BACKCASTING_PLAN_SCHEMA = "ai-lego://specs/cognitive/typed-objects/backcasting-plan.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _well_formed_milestones() -> list[dict]:
    return [
        milestone("BC-T-M1", "遠期里程碑", 3),
        milestone("BC-T-M2", "中期里程碑", 2),
        milestone("BC-T-M3", "近期里程碑", 1),
    ]


def _valid_plan(*, record_id: str = "BCAST-T-001"):
    return generate_backcasting_plan(record_id, "理想未來狀態", _well_formed_milestones(), ["今天就能做的行動一", "今天就能做的行動二"], PROVENANCE)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_plan_validates_against_the_real_schema(self):
        self.contracts.validate(BACKCASTING_PLAN_SCHEMA, _valid_plan(), "backcasting plan")

    def test_single_milestone_and_single_action_is_legal(self):
        plan = generate_backcasting_plan("BCAST-T-002", "x", [milestone("BC-T2-M1", "m", 1)], ["a"], PROVENANCE)
        self.contracts.validate(BACKCASTING_PLAN_SCHEMA, plan, "minimal plan")

    def test_no_milestones_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCAST_NO_MILESTONES"):
            generate_backcasting_plan("BCAST-T-003", "x", [], ["a"], PROVENANCE)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, plan = live.invoke(METHOD_ID, generate_backcasting_plan, "BCAST-T-INVOKE", "x", _well_formed_milestones(), ["a"], PROVENANCE)
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.backcasting.contract.yaml")
        self.assertEqual(plan["id"], "BCAST-T-INVOKE")

    def test_empty_catalog_blocks_backcasting_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        plan = _valid_plan()
        plan["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BACKCASTING_PLAN_SCHEMA, plan, "plan with a smuggled top-level key")

    def test_schema_rejects_empty_today_actions(self):
        plan = _valid_plan()
        plan["today_actions"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BACKCASTING_PLAN_SCHEMA, plan, "plan with empty today_actions")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.backcasting.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.backcasting contract")


class MilestoneChainTests(unittest.TestCase):
    """Atlas's own 'milestones backward' stage -- horizon strictly decreasing in list order, no duplicate or
    out-of-order value."""

    def test_well_formed_descending_chain_is_accepted(self):
        plan = _valid_plan()
        horizons = [m["horizon"] for m in plan["milestones"]]
        self.assertEqual(horizons, sorted(horizons, reverse=True))

    def test_out_of_order_horizon_is_refused(self):
        milestones = [milestone("BC-T4-M1", "m1", 1), milestone("BC-T4-M2", "m2", 2)]
        with self.assertRaisesRegex(InvariantViolation, "BCAST_MILESTONES_OUT_OF_ORDER"):
            generate_backcasting_plan("BCAST-T-004", "x", milestones, ["a"], PROVENANCE)

    def test_duplicate_horizon_is_refused(self):
        milestones = [milestone("BC-T5-M1", "m1", 2), milestone("BC-T5-M2", "m2", 2)]
        with self.assertRaisesRegex(InvariantViolation, "BCAST_MILESTONES_OUT_OF_ORDER"):
            generate_backcasting_plan("BCAST-T-005", "x", milestones, ["a"], PROVENANCE)

    def test_duplicate_milestone_id_is_refused(self):
        milestones = [milestone("BC-T6-M1", "m1", 2), milestone("BC-T6-M1", "m2", 1)]
        with self.assertRaisesRegex(InvariantViolation, "BCAST_DUPLICATE_MILESTONE_ID"):
            generate_backcasting_plan("BCAST-T-006", "x", milestones, ["a"], PROVENANCE)

    def test_horizon_as_bool_is_refused_not_silently_accepted(self):
        """isinstance(True, int) is True in Python -- horizon must reject bool even though it structurally
        passes an int check without an explicit guard."""
        with self.assertRaisesRegex(InvariantViolation, "BCAST_INVALID_MILESTONE"):
            milestone("BC-T7-M1", "m", True)  # type: ignore[arg-type]

    def test_horizon_as_date_string_is_refused_not_crashed(self):
        """This module's own disclosed representation choice is an ordinal int, not an ISO date -- a date
        string is a non-orderable value under that representation and must be refused fail-closed."""
        with self.assertRaisesRegex(InvariantViolation, "BCAST_INVALID_MILESTONE"):
            milestone("BC-T8-M1", "m", "2029-01-01")  # type: ignore[arg-type]

    def test_no_today_actions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCAST_NO_TODAY_ACTIONS"):
            generate_backcasting_plan("BCAST-T-009", "x", _well_formed_milestones(), [], PROVENANCE)

    def test_blank_today_action_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCAST_NO_TODAY_ACTIONS"):
            generate_backcasting_plan("BCAST-T-010", "x", _well_formed_milestones(), ["   "], PROVENANCE)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID plan's raw dict directly (never going through the builder again), then call the
    gates. Proves the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_plan(self):
        results = evaluate_backcasting_gates(_valid_plan(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_chain_gate_catches_hand_tampered_reversed_order(self):
        record = copy.deepcopy(_valid_plan())
        record["milestones"] = list(reversed(record["milestones"]))
        gate = evaluate_milestone_chain_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_chain_gate_catches_hand_tampered_duplicate_horizon(self):
        record = copy.deepcopy(_valid_plan())
        record["milestones"][1]["horizon"] = record["milestones"][0]["horizon"]
        gate = evaluate_milestone_chain_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_lands_on_today_gate_catches_hand_tampered_empty_today_actions(self):
        record = copy.deepcopy(_valid_plan())
        record["today_actions"] = []
        gate = evaluate_lands_on_today_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_chain_gate_fails_closed_on_malformed_top_level(self):
        for bad in (None, "not-a-dict", 42, 3.14, [], True, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_milestone_chain_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_lands_on_today_gate_fails_closed_on_malformed_top_level(self):
        for bad in (None, "not-a-dict", 42, 3.14, [], True, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_lands_on_today_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_chain_gate_fails_closed_on_malformed_milestone_entries_without_crashing_on_comparison(self):
        """A malformed milestone (e.g. horizon as a string) sits alongside well-shaped ones -- the gate must
        not attempt a raw '<=' comparison across the malformed entry's non-int horizon."""
        record = copy.deepcopy(_valid_plan())
        record["milestones"][1]["horizon"] = "not-an-int"
        gate = evaluate_milestone_chain_gate(record, "test", "2026-09-12T00:00:00Z")  # must not raise
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42, 3.14, True, {}):
            with self.subTest(bad=bad):
                results = evaluate_backcasting_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_plan(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_invalid(self):
        record = copy.deepcopy(_valid_plan())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BCAST-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCAST_INVALID_ID"):
            generate_backcasting_plan("WRONG-PREFIX-001", "x", _well_formed_milestones(), ["a"], PROVENANCE)

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCAST_INVALID_VERSION"):
            generate_backcasting_plan("BCAST-T-011", "x", _well_formed_milestones(), ["a"], PROVENANCE, version=1)  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCAST_INVALID_PROVENANCE"):
            generate_backcasting_plan("BCAST-T-012", "x", _well_formed_milestones(), ["a"], {"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.backcasting")

    def test_evaluate_backcasting_gates_returns_three_gates_in_order(self):
        results = evaluate_backcasting_gates(_valid_plan(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "milestone_chain", "lands_on_today"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        plan = _valid_plan()
        self.assertEqual(
            set(plan.keys()),
            {"id", "version", "generated_by_method", "future_state", "milestones", "today_actions", "provenance"},
        )



class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of this batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_plan()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_backcasting_plan(base["id"], base["future_state"], base["milestones"], base["today_actions"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
