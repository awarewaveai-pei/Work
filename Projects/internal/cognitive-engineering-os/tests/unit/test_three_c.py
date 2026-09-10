"""Mutation-style tests for ``strategy.three_c`` (2nd F08 `context/strategy` family member,
after ``strategy.swot``).

Two real invariants (dimension coverage across CUSTOMER/COMPETITOR/COMPANY;
non-empty ``fit_summary``), exercised at THREE layers: construction-time
refusal (``generate_three_c_analysis``/``three_c_finding`` raising a specific
``InvariantViolation`` code), independent gate re-derivation
(``evaluate_dimension_coverage_gate``/``evaluate_fit_summary_disclosed_gate``
catching a hand-tampered raw dict that bypassed the builder entirely), and
the real JSON Schema itself (``allOf`` contains/minContains, checked against
the spec-root schema this same slice added
(``typed-objects/three-c-analysis.schema.yaml``), not a schema this test file
invents).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.three_c import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_DIMENSIONS,
    all_gates_pass,
    evaluate_dimension_coverage_gate,
    evaluate_fit_summary_disclosed_gate,
    evaluate_provenance_required_gate,
    evaluate_three_c_gates,
    generate_three_c_analysis,
    three_c_finding,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

THREE_C_SCHEMA = "ai-lego://specs/cognitive/typed-objects/three-c-analysis.schema.yaml"


def _findings():
    return [
        three_c_finding("3C-T-001-F1", "CUSTOMER", "loyal customer base cares most about checkout speed", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        three_c_finding("3C-T-001-F2", "COMPETITOR", "no competitor offers checkout A/B tooling", make_provenance("EVIDENCE", "AI_SUGGESTED")),
        three_c_finding("3C-T-001-F3", "COMPANY", "existing A/B framework is directly reusable", make_provenance("SOURCE_FACT", "HUMAN_APPROVED")),
    ]


def _valid_analysis(analysis_id="3C-T-001", findings=None, fit_summary="customer need, competitor gap, and company capability all point to the same opportunity"):
    return generate_three_c_analysis(analysis_id, findings if findings is not None else _findings(), fit_summary)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(THREE_C_SCHEMA, _valid_analysis(), "3C analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_three_c_analysis, "3C-T-INVOKE", _findings(), "fit found")
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.three_c.contract.yaml")
        self.assertEqual(analysis["id"], "3C-T-INVOKE")

    def test_empty_catalog_blocks_three_c_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THREEC_INVALID_ID"):
            _valid_analysis(analysis_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THREEC_INVALID_ID"):
            _valid_analysis(analysis_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THREEC_INVALID_VERSION"):
            generate_three_c_analysis("3C-T-002", _findings(), "fit found", version=1)

    def test_id_is_distinct_from_swot_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.swot")
        self.assertEqual(METHOD_ID, "strategy.three_c")

    def test_three_c_and_swot_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.swot"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check
        causal.rct.contract.yaml's own test suite already establishes -- not just a one-time manual claim in prose."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.three_c.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.three_c contract")


class DimensionEnumTests(unittest.TestCase):
    def test_invalid_dimension_is_refused_at_construction_not_left_to_schema_validation(self):
        with self.assertRaisesRegex(InvariantViolation, "THREEC_INVALID_DIMENSION"):
            three_c_finding("3C-T-BAD-001", "POLITICAL", "statement", make_provenance("HYPOTHESIS", "AI_GENERATED"))

    def test_empty_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THREEC_EMPTY_STATEMENT"):
            three_c_finding("3C-T-BAD-002", "CUSTOMER", "", make_provenance("HYPOTHESIS", "AI_GENERATED"))

    def test_whitespace_only_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THREEC_EMPTY_STATEMENT"):
            three_c_finding("3C-T-BAD-003", "CUSTOMER", "   ", make_provenance("HYPOTHESIS", "AI_GENERATED"))

    def test_valid_dimensions_constant_matches_atlas_l517_split(self):
        self.assertEqual(VALID_DIMENSIONS, frozenset({"CUSTOMER", "COMPETITOR", "COMPANY"}))


class DimensionCoverageInvariantTests(unittest.TestCase):
    """Atlas's own '三面向' (three dimensions, F08 L517/§12.12): a record missing a whole dimension has not
    actually done a 3C analysis."""

    def test_empty_findings_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "THREEC_EMPTY_FINDINGS_SET"):
            generate_three_c_analysis("3C-T-003", [], "fit found")

    def test_missing_company_dimension_is_refused(self):
        findings = [f for f in _findings() if f["dimension"] != "COMPANY"]
        with self.assertRaisesRegex(InvariantViolation, "THREEC_MISSING_DIMENSION_COVERAGE"):
            generate_three_c_analysis("3C-T-004", findings, "fit found")

    def test_missing_customer_dimension_is_refused(self):
        findings = [f for f in _findings() if f["dimension"] != "CUSTOMER"]
        with self.assertRaisesRegex(InvariantViolation, "THREEC_MISSING_DIMENSION_COVERAGE"):
            generate_three_c_analysis("3C-T-005", findings, "fit found")

    def test_only_one_dimension_present_is_refused(self):
        findings = [
            three_c_finding("3C-T-006-F1", "CUSTOMER", "a", make_provenance("HYPOTHESIS", "AI_GENERATED")),
            three_c_finding("3C-T-006-F2", "CUSTOMER", "b", make_provenance("HYPOTHESIS", "AI_GENERATED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "THREEC_MISSING_DIMENSION_COVERAGE"):
            generate_three_c_analysis("3C-T-006", findings, "fit found")

    def test_extra_findings_in_one_dimension_is_accepted_coverage_is_uncapped(self):
        """See three-c-analysis.schema.yaml OQ-THREECANALYSIS-1: dimension coverage is >=1 per C, not exactly 1."""
        findings = _findings() + [three_c_finding("3C-T-007-F4", "CUSTOMER", "a second customer finding", make_provenance("HYPOTHESIS", "AI_GENERATED"))]
        analysis = generate_three_c_analysis("3C-T-007", findings, "fit found")
        self.assertEqual(len(analysis["findings"]), 4)


class FitSummaryInvariantTests(unittest.TestCase):
    """Atlas's own '→找 fit' (F08 L517): 3C's whole stated purpose is finding fit."""

    def test_empty_fit_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THREEC_EMPTY_FIT_SUMMARY"):
            _valid_analysis(fit_summary="")

    def test_whitespace_only_fit_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THREEC_EMPTY_FIT_SUMMARY"):
            _valid_analysis(fit_summary="   ")

    def test_none_fit_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "THREEC_EMPTY_FIT_SUMMARY"):
            _valid_analysis(fit_summary=None)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_three_c_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_gate_catches_hand_tampered_missing_dimension(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["findings"][2]["dimension"] = "CUSTOMER"  # was COMPANY -- now zero COMPANY findings remain
        gate = evaluate_dimension_coverage_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("COMPANY", gate["evidence"][0]["missing_dimensions"])

    def test_gate_catches_hand_tampered_empty_fit_summary(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["fit_summary"] = ""
        gate = evaluate_fit_summary_disclosed_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_missing_provenance(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["findings"][0] = {**analysis["findings"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("3C-T-001-F1", gate["evidence"][0]["invalid_provenance_ids"])

    def test_dimension_coverage_gate_catches_non_dict_analysis(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                gate = evaluate_dimension_coverage_gate(bad_analysis, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_fit_summary_gate_catches_non_dict_analysis(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                gate = evaluate_fit_summary_disclosed_gate(bad_analysis, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_provenance_gate_catches_non_dict_analysis(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_analysis_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = copy.deepcopy(_valid_analysis())
        tampered["findings"][2]["dimension"] = "CUSTOMER"
        with self.assertRaises(SchemaValidationError):
            contracts.validate(THREE_C_SCHEMA, tampered, "tampered analysis missing COMPANY")
        gate = evaluate_dimension_coverage_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class SchemaLevelCoverageTests(unittest.TestCase):
    """Proves the schema's own allOf contains/minContains constraint is real, not just the runtime gate."""

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_schema_rejects_fewer_than_three_findings(self):
        analysis = {
            "id": "3C-T-SCHEMA-001",
            "version": "1.0.0",
            "generated_by_method": "strategy.three_c",
            "findings": _findings()[:2],
            "fit_summary": "fit found",
        }
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(THREE_C_SCHEMA, analysis, "analysis with only 2 findings")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """Same discipline as rct-record.schema.yaml's own test: additionalProperties:false must reject a
        smuggled top-level key."""
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(THREE_C_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_finding_item_key(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["findings"][0]["confidence"] = 0.9
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(THREE_C_SCHEMA, analysis, "analysis with a smuggled finding-item key")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_three_c_gates_returns_three_gates_in_order(self):
        results = evaluate_three_c_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "dimension_coverage", "fit_summary_disclosed"])

    def test_evaluate_three_c_gates_all_pass_on_a_valid_analysis(self):
        results = evaluate_three_c_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "3C-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.three_c")

    def test_builder_does_not_leak_extra_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(set(analysis.keys()), {"id", "version", "generated_by_method", "findings", "fit_summary"})


if __name__ == "__main__":
    unittest.main()
