"""Mutation-style tests for ``jurisdiction.compliance_gap_analysis`` (F23 global jurisdiction/compliance/
localization family, Atlas L938).

Atlas's own "required controls vs implemented->gaps" pipeline stage is proven at BOTH independent layers: the
construction-time builder refuses a caller-asserted gap set that disagrees with the real
required-minus-implemented set difference (whether missing a real gap or annotating a non-gap), and the
independent gates re-derive the same rule directly from a raw (possibly hand-tampered) dict, never trusting
that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.jurisdiction.compliance_gap_analysis import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_compliance_gap_analysis_gates,
    evaluate_gap_completeness_gate,
    evaluate_gap_derivation_gate,
    evaluate_provenance_required_gate,
    generate_compliance_gap_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

CGAP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/compliance-gap-analysis-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        required_controls=["CTRL-1", "CTRL-2", "CTRL-3"],
        implemented_controls=["CTRL-1"],
        gap_annotations=[
            {"control_id": "CTRL-2", "severity": "high", "plan": "assign Security Lead, target close 2026-10-31"},
            {"control_id": "CTRL-3", "severity": "critical", "plan": "blocks go-live -- escalate this week"},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "CGAP-T-001", **overrides: object):
    return generate_compliance_gap_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(CGAP_SCHEMA, _valid_analysis(), "compliance gap analysis")

    def test_fully_implemented_controls_yields_zero_gaps(self):
        analysis = generate_compliance_gap_analysis(
            "CGAP-T-002",
            required_controls=["CTRL-1"],
            implemented_controls=["CTRL-1"],
            gap_annotations=[],
            provenance=PROVENANCE,
        )
        self.assertEqual(analysis["gaps"], [])
        self.contracts.validate(CGAP_SCHEMA, analysis, "zero-gap analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_compliance_gap_analysis, "CGAP-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/jurisdiction.compliance_gap_analysis.contract.yaml")
        self.assertEqual(analysis["id"], "CGAP-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CGAP_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_invalid_severity_value(self):
        analysis = _valid_analysis()
        analysis["gaps"][0]["severity"] = "catastrophic"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CGAP_SCHEMA, analysis, "analysis with an invalid severity")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "jurisdiction.compliance_gap_analysis.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "jurisdiction.compliance_gap_analysis contract")


class RequiredControlsTests(unittest.TestCase):
    def test_empty_required_controls_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_EMPTY_REQUIRED_CONTROLS"):
            generate_compliance_gap_analysis("CGAP-T-003", required_controls=[], implemented_controls=[], gap_annotations=[], provenance=PROVENANCE)

    def test_duplicate_required_control_is_refused(self):
        kwargs = _kwargs()
        kwargs["required_controls"] = ["CTRL-1", "CTRL-1", "CTRL-2", "CTRL-3"]
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_DUPLICATE_REQUIRED_CONTROL"):
            generate_compliance_gap_analysis("CGAP-T-004", **kwargs)

    def test_duplicate_implemented_control_is_refused(self):
        kwargs = _kwargs()
        kwargs["implemented_controls"] = ["CTRL-1", "CTRL-1"]
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_DUPLICATE_IMPLEMENTED_CONTROL"):
            generate_compliance_gap_analysis("CGAP-T-005", **kwargs)


class GapDerivationTests(unittest.TestCase):
    """Atlas L938's own 'required controls vs implemented->gaps' pipeline stage -- gaps mechanically derived,
    never accepted as a caller-asserted list that disagrees with the real set difference."""

    def test_omitting_a_real_gap_is_refused(self):
        kwargs = _kwargs()
        kwargs["gap_annotations"] = kwargs["gap_annotations"][:-1]  # drop the real CTRL-3 gap
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_GAP_MISMATCH"):
            generate_compliance_gap_analysis("CGAP-T-006", **kwargs)

    def test_annotating_a_non_gap_control_is_refused(self):
        kwargs = _kwargs()
        kwargs["gap_annotations"].append({"control_id": "CTRL-1", "severity": "low", "plan": "not a real gap -- CTRL-1 is implemented"})
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_GAP_MISMATCH"):
            generate_compliance_gap_analysis("CGAP-T-007", **kwargs)

    def test_duplicate_gap_annotation_is_refused(self):
        kwargs = _kwargs()
        kwargs["gap_annotations"].append(dict(kwargs["gap_annotations"][0]))
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_DUPLICATE_GAP_ANNOTATION"):
            generate_compliance_gap_analysis("CGAP-T-008", **kwargs)

    def test_correctly_derived_gaps_are_accepted(self):
        analysis = _valid_analysis()
        self.assertEqual({g["control_id"] for g in analysis["gaps"]}, {"CTRL-2", "CTRL-3"})

    def test_gap_missing_severity_is_refused(self):
        kwargs = _kwargs()
        del kwargs["gap_annotations"][0]["severity"]
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_INVALID_GAP"):
            generate_compliance_gap_analysis("CGAP-T-009", **kwargs)

    def test_gap_missing_plan_is_refused(self):
        kwargs = _kwargs()
        kwargs["gap_annotations"][0]["plan"] = ""
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_INVALID_GAP"):
            generate_compliance_gap_analysis("CGAP-T-010", **kwargs)

    def test_gap_invalid_severity_value_is_refused(self):
        kwargs = _kwargs()
        kwargs["gap_annotations"][0]["severity"] = "super-duper-high"
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_INVALID_GAP"):
            generate_compliance_gap_analysis("CGAP-T-011", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        analysis = generate_compliance_gap_analysis("CGAP-T-012", **kwargs)
        kwargs["gap_annotations"][0]["severity"] = "low"
        self.assertEqual(analysis["gaps"][0]["severity"], "high")
        self.assertIsNot(analysis["gaps"], kwargs["gap_annotations"])
        self.assertIsNot(analysis["required_controls"], kwargs["required_controls"])
        self.assertIsNot(analysis["implemented_controls"], kwargs["implemented_controls"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_compliance_gap_analysis_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_gap_derivation_gate_catches_hand_tampered_non_gap_annotation(self):
        record = copy.deepcopy(_valid_analysis())
        record["gaps"].append({"control_id": "CTRL-1", "severity": "low", "plan": "not a real gap"})
        gate = evaluate_gap_derivation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gap_derivation_gate_catches_hand_tampered_missing_gap(self):
        record = copy.deepcopy(_valid_analysis())
        record["gaps"] = record["gaps"][:-1]
        gate = evaluate_gap_derivation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gap_derivation_gate_passes_a_genuinely_correct_derivation(self):
        gate = evaluate_gap_derivation_gate(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gap_completeness_gate_catches_hand_tampered_empty_plan(self):
        record = copy.deepcopy(_valid_analysis())
        record["gaps"][0]["plan"] = ""
        gate = evaluate_gap_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_compliance_gap_analysis_gates(bad, "test", "2026-09-12T00:00:00Z")
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


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CGAP-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_INVALID_VERSION"):
            generate_compliance_gap_analysis("CGAP-T-013", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COMPLIANCEGAP_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "jurisdiction.compliance_gap_analysis")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_compliance_gap_analysis_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "gap_derivation", "gap_completeness"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "required_controls", "implemented_controls", "gaps", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """This corpus's own ``foresight.cross_impact_analysis`` module docstring records that 11 of a prior
    14-method batch returned the caller's own ``provenance`` dict BY REFERENCE rather than a copy -- mutating
    the caller's dict after construction silently rewrote the already-returned 'validated' record's provenance
    too, with no exception. This method's builder ``copy.deepcopy``s provenance at the return statement; this
    test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_analysis()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_compliance_gap_analysis(
            base["id"], base["required_controls"], base["implemented_controls"], base["gaps"], provenance
        )
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
