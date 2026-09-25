"""Mutation-style tests for ``systems.stock_and_flow`` (F09 systems thinking family, second member this batch).

Both real invariants are proven at BOTH independent layers: the builder refuses to construct a record with a
dangling ``target_stock_id`` or a flow-less stock, and the gate independently re-derives the same checks against
a hand-tampered record that bypassed the builder entirely.
"""

from __future__ import annotations

import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.systems.stock_and_flow import (
    METHOD_ID,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_stock_and_flow_gates,
    evaluate_stock_flow_integrity_gate,
    flow,
    generate_stock_and_flow_model,
    stock,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

STOCK_AND_FLOW_MODEL_SCHEMA = "ai-lego://specs/cognitive/typed-objects/stock-and-flow-model.schema.yaml"


def _stocks():
    return [stock("S1", "活躍訂閱數", 10000)]


def _flows():
    return [flow("F1", "新註冊", "IN", "S1", "每週新註冊"), flow("F2", "流失", "OUT", "S1", "每週取消")]


def _valid_model():
    return generate_stock_and_flow_model("SNF-T-001", _stocks(), _flows(), make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_model_validates_against_the_real_schema(self):
        self.contracts.validate(STOCK_AND_FLOW_MODEL_SCHEMA, _valid_model(), "stock and flow model")

    def test_multiple_stocks_each_with_their_own_flow_validates(self):
        stocks = [stock("S1", "a", 100), stock("S2", "b", 0)]
        flows = [flow("F1", "in-a", "IN", "S1", "x"), flow("F2", "in-b", "IN", "S2", "y")]
        model = generate_stock_and_flow_model("SNF-T-002", stocks, flows, make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(STOCK_AND_FLOW_MODEL_SCHEMA, model, "two-stock model")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_stock_and_flow_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class ConstructionInvariantTests(unittest.TestCase):
    def test_empty_stocks_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SNF_INVALID_STOCKS"):
            generate_stock_and_flow_model("SNF-T-010", [], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_stock_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SNF_DUPLICATE_STOCK_ID"):
            generate_stock_and_flow_model("SNF-T-011", [stock("S1", "a", 1), stock("S1", "b", 2)], _flows(), make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_non_finite_initial_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SNF_INVALID_INITIAL_VALUE"):
            stock("S1", "a", math.nan)

    def test_infinite_initial_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SNF_INVALID_INITIAL_VALUE"):
            stock("S1", "a", math.inf)

    def test_boolean_initial_value_is_refused_not_silently_coerced(self):
        """Python's bool is an int subclass -- True/False must not silently pass as 1/0."""
        with self.assertRaisesRegex(InvariantViolation, "SNF_INVALID_INITIAL_VALUE"):
            stock("S1", "a", True)

    def test_huge_int_initial_value_does_not_crash_math_isfinite(self):
        """Regression class already fixed in stakeholders.game_theory/challenge.stress_testing/challenge.hazop:
        math.isfinite itself raises OverflowError on a huge int's implicit float conversion. int is
        unconditionally accepted without going through math.isfinite."""
        model = generate_stock_and_flow_model("SNF-T-015", [stock("S1", "a", 10**400)], [flow("F1", "x", "IN", "S1", "y")], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(model["stocks"][0]["initial_value"], 10**400)

    def test_invalid_direction_is_refused_at_the_flow_constructor(self):
        with self.assertRaisesRegex(InvariantViolation, "SNF_INVALID_DIRECTION"):
            flow("F1", "x", "SIDEWAYS", "S1", "y")

    def test_flow_referencing_unknown_stock_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SNF_FLOW_UNKNOWN_STOCK"):
            generate_stock_and_flow_model("SNF-T-016", _stocks(), [flow("F1", "x", "IN", "S-GHOST", "y")], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_flow_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SNF_DUPLICATE_FLOW_ID"):
            generate_stock_and_flow_model("SNF-T-017", _stocks(), [flow("F1", "x", "IN", "S1", "y"), flow("F1", "z", "OUT", "S1", "w")], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_stock_with_zero_flows_is_refused(self):
        """The real invariant this method exists to enforce: Atlas's own stocks->in/out flows sequence means a
        stock nothing flows into or out of has not actually been modeled."""
        stocks = [stock("S1", "a", 1), stock("S2", "isolated", 0)]
        with self.assertRaisesRegex(InvariantViolation, "SNF_STOCK_WITHOUT_FLOW"):
            generate_stock_and_flow_model("SNF-T-018", stocks, _flows(), make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_correctly_modeled_model_passes_construction(self):
        generate_stock_and_flow_model("SNF-T-019", _stocks(), _flows(), make_provenance("AI_INFERENCE", "AI_GENERATED"))  # must not raise


class GateMutationTests(unittest.TestCase):
    def test_valid_model_passes_both_gates(self):
        results = evaluate_stock_and_flow_gates(_valid_model(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "stock_flow_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        model = _valid_model()
        model["provenance"] = None
        gate = evaluate_provenance_required_gate(model, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                results = evaluate_stock_and_flow_gates(bad_record, "test", "2026-09-11T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_stock_spliced_in_after_construction_with_no_flow_fails_the_integrity_gate(self):
        """Independent, second layer: a record that bypassed the builder entirely (a stock injected post-hoc,
        untouched by any flow) is still caught by the gate's own re-derivation."""
        model = _valid_model()
        model["stocks"].append(stock("S-INJECTED", "isolated", 0))
        gate = evaluate_stock_flow_integrity_gate(model, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_dangling_target_stock_id_on_a_hand_tampered_record_fails_the_integrity_gate(self):
        model = _valid_model()
        model["flows"][0]["target_stock_id"] = "S-GHOST"
        gate = evaluate_stock_flow_integrity_gate(model, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_unknown_top_level_key_on_a_hand_tampered_record_fails_the_integrity_gate(self):
        model = _valid_model()
        model["approved"] = True
        gate = evaluate_stock_flow_integrity_gate(model, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
