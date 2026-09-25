"""Mutation-style tests for ``strategy.pestel`` (2nd F08 context/strategy family tenant, after `strategy.swot`).

5 real invariants beyond per-field completeness (dimension enum, source_type
enum, effective_from/effective_to date format, effective_to>=effective_from
ordering, non-empty factor set), exercised at BOTH layers: construction-time
refusal (``pestel_factor``/``generate_pestel_analysis`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_pestel_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely, never calling the builder itself). Schema
conformance is checked against the real spec-root schema this same slice added
(``typed-objects/pestel-analysis.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.pestel import (
    ANALYSIS_ID_PREFIX,
    DIMENSIONS,
    METHOD_ID,
    SOURCE_TYPES,
    all_gates_pass,
    evaluate_evidence_labeling_required_gate,
    evaluate_pestel_gates,
    evaluate_pestel_integrity_gate,
    evaluate_provenance_required_gate,
    generate_pestel_analysis,
    pestel_factor,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

PESTEL_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/pestel-analysis.schema.yaml"


def _factor(**overrides):
    defaults = dict(
        factor_id="PESTEL-T-001-F1",
        dimension="POLITICAL",
        statement="地方政府宣布新的能源使用審查",
        geography="SG",
        source="政策公告",
        source_type="official",
        effective_from="2026-08-01",
        effective_to=None,
        trend="審查門檻逐年收緊",
        implication="需提前納入合規評估",
        confidence="high",
        provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        supporting_evidence_refs=["E-401"],
    )
    defaults.update(overrides)
    return pestel_factor(**defaults)


def _valid_factors():
    return [
        _factor(),
        pestel_factor(
            "PESTEL-T-001-F2", "ECONOMIC", "雲端運算成本下降", "APAC", "市場研究報告", "research",
            "2026-01-01", "2026-12-31", "年降幅約 6-8%", "新進入者門檻降低", 0.7,
            make_provenance("EVIDENCE", "AI_SUGGESTED"), supporting_evidence_refs=["E-402"],
        ),
    ]


def _valid_analysis():
    return generate_pestel_analysis("PESTEL-T-001", _valid_factors())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_pestel_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(PESTEL_ANALYSIS_SCHEMA, _valid_analysis(), "pestel analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_pestel_analysis, "PESTEL-T-INVOKE", _valid_factors())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.pestel.contract.yaml")
        self.assertEqual(analysis["id"], "PESTEL-T-INVOKE")

    def test_empty_catalog_blocks_pestel_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_pestel_and_swot_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.swot"])
        self.assertIsNone(resolved["blocked"])

    def test_id_is_distinct_from_strategy_swot_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.swot")
        self.assertEqual(METHOD_ID, "strategy.pestel")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PESTEL_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_factor_item(self):
        analysis = _valid_analysis()
        analysis["factors"][0]["confidence_note"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PESTEL_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled factor key")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_analysis())
        tampered["factors"][0]["statement"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PESTEL_ANALYSIS_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_pestel_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check causal.synthetic_control.contract.yaml's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.pestel.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.pestel contract")


class DimensionEnumTests(unittest.TestCase):
    """Atlas L1368's own 6-way split (resolving the P/E/S/T/E/L acronym's Economic-vs-Environmental ambiguity)."""

    def test_all_six_real_dimensions_are_accepted(self):
        self.assertEqual(DIMENSIONS, {"POLITICAL", "ECONOMIC", "SOCIAL", "TECHNOLOGICAL", "ENVIRONMENTAL", "LEGAL"})
        for dimension in DIMENSIONS:
            factor = _factor(dimension=dimension)
            self.assertEqual(factor["dimension"], dimension)

    def test_invalid_dimension_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_INVALID_DIMENSION"):
            _factor(dimension="MACROECONOMIC")

    def test_lowercase_dimension_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_INVALID_DIMENSION"):
            _factor(dimension="political")


class SourceTypeEnumTests(unittest.TestCase):
    """Atlas L1390's own closed enum -- the ONE enum Atlas's own citation names explicitly for this method."""

    def test_all_four_real_source_types_are_accepted(self):
        self.assertEqual(SOURCE_TYPES, {"official", "research", "market", "other"})
        for source_type in SOURCE_TYPES:
            factor = _factor(source_type=source_type)
            self.assertEqual(factor["source_type"], source_type)

    def test_invalid_source_type_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_INVALID_SOURCE_TYPE"):
            _factor(source_type="rumor")


class EffectiveWindowTests(unittest.TestCase):
    """Atlas L1402's own benefit-line rationale for effective_from/effective_to existing at all."""

    def test_null_effective_to_is_accepted_as_open_ended(self):
        factor = _factor(effective_from="2026-08-01", effective_to=None)
        self.assertIsNone(factor["effective_to"])

    def test_effective_to_equal_to_effective_from_is_accepted(self):
        factor = _factor(effective_from="2026-08-01", effective_to="2026-08-01")
        self.assertEqual(factor["effective_from"], factor["effective_to"])

    def test_effective_to_after_effective_from_is_accepted(self):
        factor = _factor(effective_from="2026-08-01", effective_to="2026-12-31")
        self.assertGreater(factor["effective_to"], factor["effective_from"])

    def test_effective_to_before_effective_from_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_EFFECTIVE_TO_BEFORE_FROM"):
            _factor(effective_from="2026-12-31", effective_to="2026-01-01")

    def test_malformed_effective_from_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_INVALID_EFFECTIVE_FROM"):
            _factor(effective_from="2026/08/01")

    def test_malformed_effective_to_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_INVALID_EFFECTIVE_TO"):
            _factor(effective_to="not-a-date")

    def test_non_string_effective_from_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_INVALID_EFFECTIVE_FROM"):
            _factor(effective_from=20260801)


class RequiredFieldCompletenessTests(unittest.TestCase):
    def test_empty_factor_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_INVALID_FACTOR_ID"):
            _factor(factor_id="")

    def test_empty_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_EMPTY_STATEMENT"):
            _factor(statement="")

    def test_whitespace_only_geography_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_EMPTY_GEOGRAPHY"):
            _factor(geography="   ")

    def test_empty_source_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_EMPTY_SOURCE"):
            _factor(source="")

    def test_empty_trend_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_EMPTY_TREND"):
            _factor(trend="")

    def test_empty_implication_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_EMPTY_IMPLICATION"):
            _factor(implication="")

    def test_none_confidence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_MISSING_CONFIDENCE"):
            _factor(confidence=None)

    def test_zero_confidence_is_accepted(self):
        """confidence is untyped/unconstrained (see schema compilation_decisions) -- 0 is a legitimate value, not
        the same as missing."""
        factor = _factor(confidence=0)
        self.assertEqual(factor["confidence"], 0)

    def test_string_confidence_is_accepted(self):
        factor = _factor(confidence="low")
        self.assertEqual(factor["confidence"], "low")

    def test_empty_factor_set_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_EMPTY_FACTOR_SET"):
            generate_pestel_analysis("PESTEL-T-002", [])

    def test_invalid_analysis_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_INVALID_ID"):
            generate_pestel_analysis("WRONG-PREFIX-001", _valid_factors())

    def test_invalid_analysis_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PESTEL_INVALID_VERSION"):
            generate_pestel_analysis("PESTEL-T-003", _valid_factors(), version=1)


class GateMutationTests(unittest.TestCase):
    def test_valid_analysis_passes_all_three_gates(self):
        results = evaluate_pestel_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "evidence_labeling_required", "pestel_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        analysis = _valid_analysis()
        analysis["factors"][0] = {**analysis["factors"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("PESTEL-T-001-F1", gate["evidence"][0]["invalid_provenance_ids"])

    def test_evidence_labeled_factor_with_no_supporting_refs_fails_evidence_labeling_gate(self):
        analysis = _valid_analysis()
        fabricated = _factor(factor_id="PESTEL-T-001-F3", supporting_evidence_refs=None)
        analysis["factors"].append(fabricated)
        gate = evaluate_evidence_labeling_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(any(p["id"] == "PESTEL-T-001-F3" for p in gate["evidence"][0]["problems"]))

    def test_gate_catches_non_dict_analysis(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_pestel_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["id"] = "WRONG-001"
        gate = evaluate_pestel_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["version"] = 1
        gate = evaluate_pestel_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_dimension(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["factors"][0]["dimension"] = "MACROECONOMIC"
        gate = evaluate_pestel_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_source_type(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["factors"][0]["source_type"] = "rumor"
        gate = evaluate_pestel_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_backwards_window(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["factors"][0]["effective_from"] = "2026-12-31"
        analysis["factors"][0]["effective_to"] = "2026-01-01"
        gate = evaluate_pestel_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_factors(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["factors"] = []
        gate = evaluate_pestel_integrity_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_passes_a_genuinely_valid_hand_built_analysis(self):
        gate = evaluate_pestel_integrity_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_fails_on_non_dict_analysis(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_pestel_gates_returns_three_gates_in_order(self):
        results = evaluate_pestel_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "pestel_integrity"])

    def test_analysis_id_prefix_constant(self):
        self.assertEqual(ANALYSIS_ID_PREFIX, "PESTEL-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.pestel")

    def test_builder_does_not_leak_extra_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(set(analysis.keys()), {"id", "version", "generated_by_method", "factors"})
        self.assertEqual(
            set(analysis["factors"][0].keys()),
            {"id", "dimension", "statement", "geography", "source", "source_type", "effective_from", "effective_to", "trend", "implication", "confidence", "provenance", "supporting_evidence_refs"},
        )


if __name__ == "__main__":
    unittest.main()
