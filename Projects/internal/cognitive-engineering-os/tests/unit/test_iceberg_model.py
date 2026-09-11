"""Mutation-style tests for ``systems.iceberg_model`` (F09 systems-thinking family, Atlas L547).

Atlas's own top-down dig order (Event->Pattern->Structure->Mental Model) is
proven at BOTH independent layers: the construction-time builder refuses a
deeper level populated while a shallower one is empty, and the independent
gate re-derives the same rule directly from a raw (possibly hand-tampered)
dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.systems.iceberg_model import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_iceberg_model_gates,
    evaluate_provenance_required_gate,
    evaluate_top_down_completeness_gate,
    generate_iceberg_model_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

ICEBERG_MODEL_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/iceberg-model-analysis.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        events=["本週客服工單量暴增 3 倍"],
        patterns=["每次新版本發布後一週內工單量都會上升"],
        structures=["QA 環境與 production 設定漂移"],
        mental_models=["團隊認為先上線、有問題再修比較快"],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "ICEBERG-T-001", **overrides: object):
    return generate_iceberg_model_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(ICEBERG_MODEL_ANALYSIS_SCHEMA, _valid_analysis(), "iceberg model analysis")

    def test_events_only_is_legal_a_run_may_stop_at_the_surface_level(self):
        analysis = generate_iceberg_model_analysis("ICEBERG-T-002", events=["表面事件"], provenance=PROVENANCE)
        self.contracts.validate(ICEBERG_MODEL_ANALYSIS_SCHEMA, analysis, "events-only analysis")
        self.assertEqual(analysis["patterns"], [])
        self.assertEqual(analysis["structures"], [])
        self.assertEqual(analysis["mental_models"], [])

    def test_events_and_patterns_only_is_legal(self):
        analysis = generate_iceberg_model_analysis("ICEBERG-T-003", events=["e"], patterns=["p"], provenance=PROVENANCE)
        self.contracts.validate(ICEBERG_MODEL_ANALYSIS_SCHEMA, analysis, "events+patterns analysis")

    def test_no_events_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_NO_EVENTS"):
            generate_iceberg_model_analysis("ICEBERG-T-004", events=[], provenance=PROVENANCE)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_iceberg_model_analysis, "ICEBERG-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/systems.iceberg_model.contract.yaml")
        self.assertEqual(analysis["id"], "ICEBERG-T-INVOKE")

    def test_empty_catalog_blocks_iceberg_model_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ICEBERG_MODEL_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_non_string_level_item(self):
        analysis = _valid_analysis()
        analysis["patterns"] = [123]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ICEBERG_MODEL_ANALYSIS_SCHEMA, analysis, "analysis with a non-string pattern item")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "systems.iceberg_model.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "systems.iceberg_model contract")


class TopDownCompletenessTests(unittest.TestCase):
    """Atlas L547: 'Event->Pattern->Structure->Mental Model / 由事件往下挖深層結構' -- a deeper level may only
    be populated once every shallower level already is."""

    def test_structures_without_patterns_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_STRUCTURE_WITHOUT_PATTERN"):
            _valid_analysis(patterns=[])

    def test_mental_models_without_structures_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_MENTAL_MODEL_WITHOUT_STRUCTURE"):
            _valid_analysis(structures=[])

    def test_mental_models_without_patterns_or_structures_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_MENTAL_MODEL_WITHOUT_STRUCTURE"):
            _valid_analysis(patterns=[], structures=[])

    def test_well_formed_four_level_analysis_is_accepted(self):
        analysis = _valid_analysis()
        self.assertTrue(analysis["patterns"] and analysis["structures"] and analysis["mental_models"])

    def test_non_string_level_item_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_LEVEL_ITEM"):
            _valid_analysis(patterns=[123])

    def test_blank_string_level_item_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_LEVEL_ITEM"):
            _valid_analysis(patterns=["   "])

    def test_non_list_level_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_LEVEL"):
            _valid_analysis(patterns="not-a-list")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis' raw dict directly (never going through the builder again), then call the
    gates. Proves the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_iceberg_model_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_top_down_gate_catches_hand_tampered_structures_without_patterns(self):
        record = copy.deepcopy(_valid_analysis())
        record["patterns"] = []
        gate = evaluate_top_down_completeness_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_top_down_gate_catches_hand_tampered_mental_models_without_structures(self):
        record = copy.deepcopy(_valid_analysis())
        record["structures"] = []
        gate = evaluate_top_down_completeness_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_top_down_gate_catches_empty_events(self):
        record = copy.deepcopy(_valid_analysis())
        record["events"] = []
        gate = evaluate_top_down_completeness_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_top_down_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_top_down_completeness_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_top_down_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_top_down_completeness_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_iceberg_model_gates(bad, "test", "2026-09-11T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_analysis())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ICEBERG-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_VERSION"):
            generate_iceberg_model_analysis("ICEBERG-T-005", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ICE_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "systems.iceberg_model")

    def test_evaluate_iceberg_model_gates_returns_two_gates_in_order(self):
        results = evaluate_iceberg_model_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "top_down_completeness"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "events", "patterns", "structures", "mental_models", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
