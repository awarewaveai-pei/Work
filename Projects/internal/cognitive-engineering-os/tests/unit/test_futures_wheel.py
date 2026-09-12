"""Mutation-style tests for ``foresight.futures_wheel`` (F13 foresight family, Atlas §11.28).

Atlas §11.28's own order-parent consistency rule is proven at BOTH
independent layers: the construction-time builder refuses an orphan/
skipped-order impact or a wrong center-parent reference, and the
independent gate re-derives the same rule directly from a raw (possibly
hand-tampered) dict, never trusting that the builder's own check already
ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.futures_wheel import (
    CENTER_EVENT_PARENT_ID,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_futures_wheel_gates,
    evaluate_order_parent_consistency_gate,
    evaluate_provenance_required_gate,
    generate_futures_wheel,
    impact,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

FUTURES_WHEEL_SCHEMA = "ai-lego://specs/cognitive/typed-objects/futures-wheel.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _well_formed_impacts() -> list[dict]:
    return [
        impact("FW-T-B1", 1, CENTER_EVENT_PARENT_ID, "採用增加"),
        impact("FW-T-B2", 1, CENTER_EVENT_PARENT_ID, "功能商品化"),
        impact("FW-T-C1", 2, "FW-T-B1", "工作角色改變"),
        impact("FW-T-D1", 3, "FW-T-C1", "職涯教育體系改變"),
    ]


def _valid_wheel(*, record_id: str = "FWHEEL-T-001", center_event: str = "AI 成本下降"):
    return generate_futures_wheel(record_id, center_event, _well_formed_impacts(), PROVENANCE)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_wheel_validates_against_the_real_schema(self):
        self.contracts.validate(FUTURES_WHEEL_SCHEMA, _valid_wheel(), "futures wheel")

    def test_first_order_only_is_legal(self):
        wheel = generate_futures_wheel("FWHEEL-T-002", "x", [impact("FW-T2-B1", 1, CENTER_EVENT_PARENT_ID, "d")], PROVENANCE)
        self.contracts.validate(FUTURES_WHEEL_SCHEMA, wheel, "first-order-only wheel")

    def test_no_impacts_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_NO_IMPACTS"):
            generate_futures_wheel("FWHEEL-T-003", "x", [], PROVENANCE)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, wheel = live.invoke(METHOD_ID, generate_futures_wheel, "FWHEEL-T-INVOKE", "x", _well_formed_impacts(), PROVENANCE)
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.futures_wheel.contract.yaml")
        self.assertEqual(wheel["id"], "FWHEEL-T-INVOKE")

    def test_empty_catalog_blocks_futures_wheel_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        wheel = _valid_wheel()
        wheel["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FUTURES_WHEEL_SCHEMA, wheel, "wheel with a smuggled top-level key")

    def test_schema_rejects_an_out_of_range_order(self):
        wheel = _valid_wheel()
        wheel["impacts"][0]["order"] = 4
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FUTURES_WHEEL_SCHEMA, wheel, "wheel with order=4")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.futures_wheel.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.futures_wheel contract")


class OrderParentConsistencyTests(unittest.TestCase):
    """Atlas §11.28: an order-1 impact's parent is the center event; an order-N impact's parent must be a
    declared order-(N-1) impact -- no orphans, no skipped orders."""

    def test_well_formed_chain_is_accepted(self):
        wheel = _valid_wheel()
        self.assertEqual({i["order"] for i in wheel["impacts"]}, {1, 2, 3})

    def test_order_1_with_wrong_parent_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_FIRST_ORDER_PARENT_MUST_BE_CENTER"):
            generate_futures_wheel("FWHEEL-T-004", "x", [impact("FW-T4-B1", 1, "NOT-CENTER", "d")], PROVENANCE)

    def test_order_2_pointing_at_center_directly_is_refused(self):
        impacts = [impact("FW-T5-B1", 1, CENTER_EVENT_PARENT_ID, "d1"), impact("FW-T5-C1", 2, CENTER_EVENT_PARENT_ID, "d2")]
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_ORPHAN_OR_SKIPPED_ORDER"):
            generate_futures_wheel("FWHEEL-T-005", "x", impacts, PROVENANCE)

    def test_order_3_skipping_straight_to_order_1_parent_is_refused(self):
        impacts = [impact("FW-T6-B1", 1, CENTER_EVENT_PARENT_ID, "d1"), impact("FW-T6-D1", 3, "FW-T6-B1", "d2")]
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_ORPHAN_OR_SKIPPED_ORDER"):
            generate_futures_wheel("FWHEEL-T-006", "x", impacts, PROVENANCE)

    def test_dangling_parent_reference_is_refused(self):
        impacts = [impact("FW-T7-B1", 1, CENTER_EVENT_PARENT_ID, "d1"), impact("FW-T7-C1", 2, "NO-SUCH-IMPACT", "d2")]
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_ORPHAN_OR_SKIPPED_ORDER"):
            generate_futures_wheel("FWHEEL-T-007", "x", impacts, PROVENANCE)

    def test_no_order_1_impact_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_NO_FIRST_ORDER_IMPACT"):
            generate_futures_wheel("FWHEEL-T-008", "x", [impact("FW-T8-C1", 2, "FW-T8-B1", "d")], PROVENANCE)

    def test_duplicate_impact_id_is_refused(self):
        impacts = [impact("FW-T9-B1", 1, CENTER_EVENT_PARENT_ID, "d1"), impact("FW-T9-B1", 1, CENTER_EVENT_PARENT_ID, "d2")]
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_DUPLICATE_IMPACT_ID"):
            generate_futures_wheel("FWHEEL-T-009", "x", impacts, PROVENANCE)

    def test_order_as_bool_is_refused_not_silently_accepted(self):
        """isinstance(True, int) is True in Python -- order must reject bool even though it structurally
        passes an int membership check without an explicit guard."""
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_INVALID_IMPACT"):
            impact("FW-T10-B1", True, CENTER_EVENT_PARENT_ID, "d")  # type: ignore[arg-type]

    def test_order_as_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_INVALID_IMPACT"):
            impact("FW-T11-B1", "1", CENTER_EVENT_PARENT_ID, "d")  # type: ignore[arg-type]

    def test_center_event_blank_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_INVALID_CENTER_EVENT"):
            generate_futures_wheel("FWHEEL-T-012", "   ", _well_formed_impacts(), PROVENANCE)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID wheel's raw dict directly (never going through the builder again), then call the
    gates. Proves the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_wheel(self):
        results = evaluate_futures_wheel_gates(_valid_wheel(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_gate_catches_hand_tampered_order_1_parent(self):
        record = copy.deepcopy(_valid_wheel())
        record["impacts"][0]["parent_id"] = "NOT-THE-CENTER"
        gate = evaluate_order_parent_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_order_gap(self):
        record = copy.deepcopy(_valid_wheel())
        # Remove the order-2 parent that the order-3 impact depends on.
        record["impacts"] = [i for i in record["impacts"] if i["order"] != 2]
        gate = evaluate_order_parent_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_id(self):
        record = copy.deepcopy(_valid_wheel())
        record["impacts"].append(dict(record["impacts"][0]))
        gate = evaluate_order_parent_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_malformed_top_level(self):
        for bad in (None, "not-a-dict", 42, 3.14, [], True, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_order_parent_consistency_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_malformed_impact_entries(self):
        record = copy.deepcopy(_valid_wheel())
        record["impacts"] = [None, "not-a-dict", 42, [], True, {}, {"junk": 1}]
        gate = evaluate_order_parent_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_when_one_impact_has_a_none_id_alongside_well_shaped_string_ids(self):
        """A malformed entry (id=None) is filtered out of the well-shaped set before duplicate/order-linkage
        computation -- but the malformed entry itself must still surface as a FAIL, not be silently dropped."""
        record = copy.deepcopy(_valid_wheel())
        record["impacts"].append({"id": None, "order": 1, "parent_id": CENTER_EVENT_PARENT_ID, "description": "d"})
        gate = evaluate_order_parent_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42, 3.14, True, {}):
            with self.subTest(bad=bad):
                results = evaluate_futures_wheel_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_wheel(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_invalid(self):
        record = copy.deepcopy(_valid_wheel())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "FWHEEL-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_INVALID_ID"):
            generate_futures_wheel("WRONG-PREFIX-001", "x", _well_formed_impacts(), PROVENANCE)

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_INVALID_VERSION"):
            generate_futures_wheel("FWHEEL-T-013", "x", _well_formed_impacts(), PROVENANCE, version=1)  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FWHEEL_INVALID_PROVENANCE"):
            generate_futures_wheel("FWHEEL-T-014", "x", _well_formed_impacts(), {"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.futures_wheel")

    def test_evaluate_futures_wheel_gates_returns_two_gates_in_order(self):
        results = evaluate_futures_wheel_gates(_valid_wheel(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "order_parent_consistency"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        wheel = _valid_wheel()
        self.assertEqual(
            set(wheel.keys()),
            {"id", "version", "generated_by_method", "center_event", "impacts", "provenance"},
        )



class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of this batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_wheel()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_futures_wheel(base["id"], base["center_event"], base["impacts"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
