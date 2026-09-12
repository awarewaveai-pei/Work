"""Mutation-style tests for ``epistemic.ladder_of_inference`` (F10 epistemic-quality family, Atlas L572).

Atlas's own ascending climb order (data->meaning->assumption->conclusion) is
proven at BOTH independent layers: the construction-time builder refuses a
higher rung populated while a lower one is empty, and the independent gate
re-derives the same rule directly from a raw (possibly hand-tampered) dict,
never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.epistemic.ladder_of_inference import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_ascending_completeness_gate,
    evaluate_ladder_of_inference_gates,
    evaluate_provenance_required_gate,
    generate_ladder_of_inference_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

LADDER_OF_INFERENCE_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/ladder-of-inference-analysis.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        observed_data=["客戶在會議中遲到 10 分鐘"],
        meanings_assigned=["這代表他不重視這次合作"],
        assumptions_made=["假設準時等於重視程度"],
        conclusions_drawn=["這個客戶不值得投入更多資源"],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "LADDER-T-001", **overrides: object):
    return generate_ladder_of_inference_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(LADDER_OF_INFERENCE_ANALYSIS_SCHEMA, _valid_analysis(), "ladder of inference analysis")

    def test_observed_data_only_is_legal_a_run_may_stop_at_the_data_rung(self):
        analysis = generate_ladder_of_inference_analysis("LADDER-T-002", observed_data=["原始資料"], provenance=PROVENANCE)
        self.contracts.validate(LADDER_OF_INFERENCE_ANALYSIS_SCHEMA, analysis, "observed-data-only analysis")
        self.assertEqual(analysis["meanings_assigned"], [])
        self.assertEqual(analysis["assumptions_made"], [])
        self.assertEqual(analysis["conclusions_drawn"], [])

    def test_observed_data_and_meanings_only_is_legal(self):
        analysis = generate_ladder_of_inference_analysis("LADDER-T-003", observed_data=["d"], meanings_assigned=["m"], provenance=PROVENANCE)
        self.contracts.validate(LADDER_OF_INFERENCE_ANALYSIS_SCHEMA, analysis, "observed_data+meanings_assigned analysis")

    def test_no_observed_data_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LADDER_NO_OBSERVED_DATA"):
            generate_ladder_of_inference_analysis("LADDER-T-004", observed_data=[], provenance=PROVENANCE)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_ladder_of_inference_analysis, "LADDER-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/epistemic.ladder_of_inference.contract.yaml")
        self.assertEqual(analysis["id"], "LADDER-T-INVOKE")

    def test_empty_catalog_blocks_ladder_of_inference_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LADDER_OF_INFERENCE_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_non_string_rung_item(self):
        analysis = _valid_analysis()
        analysis["meanings_assigned"] = [123]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LADDER_OF_INFERENCE_ANALYSIS_SCHEMA, analysis, "analysis with a non-string meaning item")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "epistemic.ladder_of_inference.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "epistemic.ladder_of_inference contract")


class AscendingCompletenessTests(unittest.TestCase):
    """Atlas L572: '追 data→meaning→assumption→conclusion' -- a higher rung may only be populated once every
    lower rung already is."""

    def test_assumptions_without_meanings_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LADDER_ASSUMPTION_WITHOUT_MEANING"):
            _valid_analysis(meanings_assigned=[])

    def test_conclusions_without_assumptions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LADDER_CONCLUSION_WITHOUT_ASSUMPTION"):
            _valid_analysis(assumptions_made=[])

    def test_conclusions_without_meanings_or_assumptions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LADDER_CONCLUSION_WITHOUT_ASSUMPTION"):
            _valid_analysis(meanings_assigned=[], assumptions_made=[])

    def test_well_formed_four_rung_analysis_is_accepted(self):
        analysis = _valid_analysis()
        self.assertTrue(analysis["meanings_assigned"] and analysis["assumptions_made"] and analysis["conclusions_drawn"])

    def test_non_string_rung_item_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "LADDER_INVALID_RUNG_ITEM"):
            _valid_analysis(meanings_assigned=[123])

    def test_blank_string_rung_item_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LADDER_INVALID_RUNG_ITEM"):
            _valid_analysis(meanings_assigned=["   "])

    def test_non_list_rung_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LADDER_INVALID_RUNG"):
            _valid_analysis(meanings_assigned="not-a-list")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis' raw dict directly (never going through the builder again), then call the
    gates. Proves the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_ladder_of_inference_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_ascending_gate_catches_hand_tampered_assumptions_without_meanings(self):
        record = copy.deepcopy(_valid_analysis())
        record["meanings_assigned"] = []
        gate = evaluate_ascending_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_ascending_gate_catches_hand_tampered_conclusions_without_assumptions(self):
        record = copy.deepcopy(_valid_analysis())
        record["assumptions_made"] = []
        gate = evaluate_ascending_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_ascending_gate_catches_empty_observed_data(self):
        record = copy.deepcopy(_valid_analysis())
        record["observed_data"] = []
        gate = evaluate_ascending_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_ascending_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_ascending_completeness_gate(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_ascending_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_ascending_completeness_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_ladder_of_inference_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_analysis())
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

    def test_mutating_callers_observed_data_list_after_construction_does_not_affect_the_record(self):
        caller_list = ["原始觀察"]
        analysis = generate_ladder_of_inference_analysis("LADDER-T-ALIAS-1", observed_data=caller_list, provenance=PROVENANCE)
        caller_list.append("INJECTED-AFTER-CONSTRUCTION")
        self.assertEqual(analysis["observed_data"], ["原始觀察"])

    def test_mutating_callers_meanings_assigned_list_after_construction_does_not_affect_the_record(self):
        caller_list = ["原始意義"]
        analysis = generate_ladder_of_inference_analysis("LADDER-T-ALIAS-2", observed_data=["d"], meanings_assigned=caller_list, provenance=PROVENANCE)
        caller_list.append("INJECTED-AFTER-CONSTRUCTION")
        self.assertEqual(analysis["meanings_assigned"], ["原始意義"])


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "LADDER-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LADDER_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LADDER_INVALID_VERSION"):
            generate_ladder_of_inference_analysis("LADDER-T-005", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LADDER_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "epistemic.ladder_of_inference")

    def test_evaluate_ladder_of_inference_gates_returns_two_gates_in_order(self):
        results = evaluate_ladder_of_inference_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "ascending_completeness"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "observed_data", "meanings_assigned", "assumptions_made", "conclusions_drawn", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
