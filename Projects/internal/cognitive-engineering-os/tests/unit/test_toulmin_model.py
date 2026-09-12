"""Mutation-style tests for ``epistemic.toulmin_model`` (F10 epistemic-quality family, Atlas L574).

Atlas's own missing-bridge rule (防止缺推理橋梁) is proven at BOTH independent
layers: the construction-time builder refuses a claim+grounds record with a
blank/whitespace-only warrant, and the independent gate re-derives the same
rule (plus the related backing-without-warrant rule) directly from a raw
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
from ai_lego.modules.epistemic.toulmin_model import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_missing_bridge_gate,
    evaluate_provenance_required_gate,
    evaluate_toulmin_model_gates,
    generate_toulmin_argument,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

TOULMIN_ARGUMENT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/toulmin-argument.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        claim="團隊應該在下一季增加兩名後端工程師",
        grounds=["API 平均回應時間從 200ms 上升到 800ms"],
        warrant="回應時間變慢是工程產能不足的直接徵兆",
        backing=["前次擴編讓回應時間恢復到 300ms 以下"],
        qualifier="假設流量成長率維持在 +-20% 區間內",
        rebuttal="若下一季功能凍結則不需要立即擴編",
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_argument(*, record_id: str = "TOULMIN-T-001", **overrides: object):
    return generate_toulmin_argument(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_argument_validates_against_the_real_schema(self):
        self.contracts.validate(TOULMIN_ARGUMENT_SCHEMA, _valid_argument(), "toulmin argument")

    def test_claim_grounds_warrant_only_is_legal_backing_qualifier_rebuttal_are_optional(self):
        argument = generate_toulmin_argument("TOULMIN-T-002", claim="c", grounds=["g"], warrant="w", provenance=PROVENANCE)
        self.contracts.validate(TOULMIN_ARGUMENT_SCHEMA, argument, "minimal argument")
        self.assertEqual(argument["backing"], [])
        self.assertIsNone(argument["qualifier"])
        self.assertIsNone(argument["rebuttal"])

    def test_no_grounds_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_NO_GROUNDS"):
            generate_toulmin_argument("TOULMIN-T-003", claim="c", grounds=[], warrant="w", provenance=PROVENANCE)

    def test_blank_claim_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_INVALID_CLAIM"):
            generate_toulmin_argument("TOULMIN-T-004", claim="   ", grounds=["g"], warrant="w", provenance=PROVENANCE)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, argument = live.invoke(METHOD_ID, generate_toulmin_argument, "TOULMIN-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/epistemic.toulmin_model.contract.yaml")
        self.assertEqual(argument["id"], "TOULMIN-T-INVOKE")

    def test_empty_catalog_blocks_toulmin_model_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        argument = _valid_argument()
        argument["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOULMIN_ARGUMENT_SCHEMA, argument, "argument with a smuggled top-level key")

    def test_schema_rejects_blank_warrant(self):
        argument = _valid_argument()
        argument["warrant"] = "   "
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOULMIN_ARGUMENT_SCHEMA, argument, "argument with a blank warrant")

    def test_schema_rejects_non_string_grounds_item(self):
        argument = _valid_argument()
        argument["grounds"] = [123]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TOULMIN_ARGUMENT_SCHEMA, argument, "argument with a non-string grounds item")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "epistemic.toulmin_model.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "epistemic.toulmin_model contract")


class MissingBridgeTests(unittest.TestCase):
    """Atlas L574: '防止缺推理橋梁' -- warrant is the bridge; a claim+grounds pair with a blank warrant is a
    bare assertion, not a Toulmin argument. backing may only be non-empty if warrant is also non-empty."""

    def test_blank_warrant_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_MISSING_WARRANT"):
            _valid_argument(backing=[], warrant="   ")

    def test_empty_warrant_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_MISSING_WARRANT"):
            _valid_argument(backing=[], warrant="")

    def test_backing_with_blank_warrant_is_refused_as_backing_without_warrant_not_missing_warrant(self):
        """Both conditions are true here (warrant IS blank, and backing IS populated) -- the builder checks
        backing-without-warrant FIRST, so this specific combination raises the more specific code."""
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_BACKING_WITHOUT_WARRANT"):
            _valid_argument(backing=["some backing"], warrant="   ")

    def test_well_formed_argument_with_backing_and_warrant_is_accepted(self):
        argument = _valid_argument()
        self.assertTrue(argument["warrant"].strip())
        self.assertTrue(argument["backing"])

    def test_argument_with_warrant_but_no_backing_is_accepted(self):
        argument = _valid_argument(backing=[])
        self.assertEqual(argument["backing"], [])
        self.assertTrue(argument["warrant"].strip())

    def test_non_string_grounds_item_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_INVALID_LIST_ITEM"):
            _valid_argument(grounds=[123])

    def test_non_list_grounds_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_INVALID_LIST"):
            _valid_argument(grounds="not-a-list")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID argument's raw dict directly (never going through the builder again), then call the
    gates. Proves the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_argument(self):
        results = evaluate_toulmin_model_gates(_valid_argument(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_missing_bridge_gate_catches_hand_tampered_blank_warrant(self):
        record = copy.deepcopy(_valid_argument())
        record["warrant"] = ""
        gate = evaluate_missing_bridge_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_missing_bridge_gate_reports_both_problems_when_backing_populated_and_warrant_blank(self):
        record = copy.deepcopy(_valid_argument())
        record["warrant"] = "   "
        gate = evaluate_missing_bridge_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        problems = gate["evidence"][0]["problems"]
        self.assertEqual(len(problems), 2)

    def test_missing_bridge_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_missing_bridge_gate(_valid_argument(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_missing_bridge_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_missing_bridge_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_toulmin_model_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_argument(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_argument())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingRegressionTests(unittest.TestCase):
    """F09 critic lesson (WORKLOG 2026-09-12): a shallow copy of a list field can leave the returned 'validated'
    record sharing a mutable list object with the caller's own input. Mutate the caller's original list AFTER
    construction and confirm the returned record is unaffected."""

    def test_mutating_callers_grounds_list_after_construction_does_not_affect_the_record(self):
        caller_list = ["原始 grounds"]
        argument = generate_toulmin_argument("TOULMIN-T-ALIAS-1", claim="c", grounds=caller_list, warrant="w", provenance=PROVENANCE)
        caller_list.append("INJECTED-AFTER-CONSTRUCTION")
        self.assertEqual(argument["grounds"], ["原始 grounds"])

    def test_mutating_callers_backing_list_after_construction_does_not_affect_the_record(self):
        caller_list = ["原始 backing"]
        argument = generate_toulmin_argument("TOULMIN-T-ALIAS-2", claim="c", grounds=["g"], warrant="w", backing=caller_list, provenance=PROVENANCE)
        caller_list.append("INJECTED-AFTER-CONSTRUCTION")
        self.assertEqual(argument["backing"], ["原始 backing"])


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "TOULMIN-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_INVALID_ID"):
            _valid_argument(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_INVALID_VERSION"):
            generate_toulmin_argument("TOULMIN-T-005", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_INVALID_PROVENANCE"):
            _valid_argument(provenance={"epistemic_type": "NOT_REAL"})

    def test_invalid_qualifier_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_INVALID_QUALIFIER"):
            _valid_argument(qualifier=123)  # type: ignore[arg-type]

    def test_invalid_rebuttal_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TOULMIN_INVALID_REBUTTAL"):
            _valid_argument(rebuttal=123)  # type: ignore[arg-type]

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "epistemic.toulmin_model")

    def test_evaluate_toulmin_model_gates_returns_two_gates_in_order(self):
        results = evaluate_toulmin_model_gates(_valid_argument(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "missing_bridge"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        argument = _valid_argument()
        self.assertEqual(
            set(argument.keys()),
            {"id", "version", "generated_by_method", "claim", "grounds", "warrant", "backing", "qualifier", "rebuttal", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
