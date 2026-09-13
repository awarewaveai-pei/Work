"""Mutation-style tests for ``feasibility.telos`` (F14 feasibility/economics family, first member built this
batch).

THE real invariant (Atlas §12.24's own 5-element checklist made structural: all 5 dimensions required, each
carrying >=1 non-empty entry across its own assumptions/evidence/gaps/stop_conditions combined), exercised at
BOTH layers: construction-time refusal (a plain Python ``TypeError`` for an omitted dimension, or
``InvariantViolation`` for an entirely-empty one) and independent gate re-derivation
(``evaluate_five_dimensions_complete_gate`` catching a hand-tampered raw dict that bypassed the builder entirely,
never calling the builder itself). Schema conformance is checked against the real spec-root schema this same
batch added (``typed-objects/telos-feasibility-assessment.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.feasibility.telos import (
    DIMENSION_NAMES,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    dimension,
    evaluate_five_dimensions_complete_gate,
    evaluate_provenance_required_gate,
    evaluate_telos_gates,
    generate_telos_assessment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

TELOS_ASSESSMENT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/telos-feasibility-assessment.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        technical=dimension(assumptions=["現有團隊具備所需的資料庫遷移工具操作能力"]),
        economic=dimension(gaps=["尚未取得完整的遷移人力成本估算"]),
        legal=dimension(stop_conditions=["若客戶資料需跨境傳輸且無合法傳輸機制，立即停止"]),
        operational=dimension(evidence=["新機房已通過內部維運團隊的資源盤點"]),
        schedule=dimension(assumptions=["供應商可在遷移週末前完成新機房網路配置"]),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_assessment(*, record_id: str = "TELOS-T-001", **overrides: object):
    return generate_telos_assessment(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_assessment_validates_against_the_real_schema(self):
        self.contracts.validate(TELOS_ASSESSMENT_SCHEMA, _valid_assessment(), "telos assessment")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, assessment = live.invoke(METHOD_ID, generate_telos_assessment, "TELOS-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/feasibility.telos.contract.yaml")
        self.assertEqual(assessment["id"], "TELOS-T-INVOKE")

    def test_empty_catalog_blocks_telos_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        assessment = _valid_assessment()
        assessment["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TELOS_ASSESSMENT_SCHEMA, assessment, "assessment with a smuggled top-level key")

    def test_schema_rejects_missing_dimension(self):
        assessment = _valid_assessment()
        del assessment["schedule"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TELOS_ASSESSMENT_SCHEMA, assessment, "assessment with schedule removed")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "feasibility.telos.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "feasibility.telos contract")


class DimensionHelperTests(unittest.TestCase):
    """``dimension()`` -- shared shape/non-empty predicate the builder and gate both consult."""

    def test_dimension_with_one_assumption_is_valid(self):
        d = dimension(assumptions=["x"])
        self.assertEqual(d, {"assumptions": ["x"], "evidence": [], "gaps": [], "stop_conditions": []})

    def test_dimension_with_only_stop_conditions_is_valid(self):
        """A dimension may legitimately have only stop_conditions populated (a hard blocker with no assumptions
        recorded yet) -- the combined-total rule, not a per-field minimum."""
        d = dimension(stop_conditions=["blocker"])
        self.assertEqual(sum(len(d[f]) for f in ("assumptions", "evidence", "gaps", "stop_conditions")), 1)

    def test_entirely_empty_dimension_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TELOS_INVALID_DIMENSION"):
            dimension()

    def test_dimension_with_non_string_list_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TELOS_INVALID_DIMENSION"):
            dimension(assumptions=[123])

    def test_dimension_with_empty_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TELOS_INVALID_DIMENSION"):
            dimension(evidence=["   "])


class FiveDimensionsRequiredTests(unittest.TestCase):
    """Atlas §12.24: all 5 dimensions required, each must actually be assessed (>=1 combined entry)."""

    def test_dimension_names_constant(self):
        self.assertEqual(DIMENSION_NAMES, ("technical", "economic", "legal", "operational", "schedule"))

    def test_omitting_a_dimension_raises_type_error(self):
        kwargs = _kwargs()
        del kwargs["schedule"]
        with self.assertRaises(TypeError):
            generate_telos_assessment("TELOS-T-002", **kwargs)

    def test_all_five_dimensions_present_in_a_valid_record(self):
        assessment = _valid_assessment()
        for name in DIMENSION_NAMES:
            self.assertIn(name, assessment)

    def test_caller_supplied_dict_that_is_entirely_empty_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "TELOS_INVALID_DIMENSION"):
            _valid_assessment(schedule={"assumptions": [], "evidence": [], "gaps": [], "stop_conditions": []})

    def test_caller_supplied_dict_missing_a_list_field_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "TELOS_INVALID_DIMENSION"):
            _valid_assessment(schedule={"assumptions": ["x"], "evidence": [], "gaps": []})

    def test_caller_supplied_non_dict_dimension_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "TELOS_INVALID_DIMENSION"):
            _valid_assessment(schedule="not-a-dict")

    def test_gate_catches_a_missing_dimension_key(self):
        assessment = copy.deepcopy(_valid_assessment())
        del assessment["schedule"]
        gate = evaluate_five_dimensions_complete_gate(assessment, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("missing dimension: 'schedule'", gate["evidence"][0]["problems"][0])

    def test_gate_catches_a_hand_tampered_entirely_emptied_dimension(self):
        assessment = copy.deepcopy(_valid_assessment())
        assessment["schedule"] = {"assumptions": [], "evidence": [], "gaps": [], "stop_conditions": []}
        gate = evaluate_five_dimensions_complete_gate(assessment, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_five_dimensions_complete_gate(_valid_assessment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_fails_closed_on_non_dict(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_five_dimensions_complete_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        assessment = generate_telos_assessment("TELOS-T-003", **kwargs)
        kwargs["schedule"]["assumptions"].append("SMUGGLED_AFTER_RETURN")
        self.assertNotIn("SMUGGLED_AFTER_RETURN", assessment["schedule"]["assumptions"])
        self.assertIsNot(assessment["schedule"]["assumptions"], kwargs["schedule"]["assumptions"])


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of a sibling batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        assessment = generate_telos_assessment("TELOS-T-004", **{**_kwargs(), "provenance": provenance})
        self.assertIsNot(assessment["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(assessment["provenance"]["epistemic_type"], "AI_INFERENCE")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_assessment(self):
        results = evaluate_telos_gates(_valid_assessment(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_telos_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_evaluate_telos_gates_returns_two_gates_in_order(self):
        results = evaluate_telos_gates(_valid_assessment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "five_dimensions_complete"])


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_assessment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        assessment = copy.deepcopy(_valid_assessment())
        assessment["provenance"] = None
        gate = evaluate_provenance_required_gate(assessment, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "TELOS-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TELOS_INVALID_ID"):
            _valid_assessment(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TELOS_INVALID_VERSION"):
            generate_telos_assessment("TELOS-T-005", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TELOS_INVALID_PROVENANCE"):
            _valid_assessment(provenance={"epistemic_type": "NOT_REAL"})


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "feasibility.telos")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        assessment = _valid_assessment()
        self.assertEqual(set(assessment.keys()), {"id", "version", "generated_by_method", *DIMENSION_NAMES, "provenance"})


if __name__ == "__main__":
    unittest.main()
