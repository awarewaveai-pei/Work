"""Mutation-style tests for ``strategy.steepv`` (F08 context/strategy family, Atlas F08 table row L516).

Two real invariants, each exercised at BOTH layers: construction-time refusal (``generate_steepv_analysis``
raising a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_values_dimension_disclosed_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance -- including the schema's own
``contains``/``minContains`` VALUES-required structural constraint -- is checked against the real spec-root
schema this same session added (``typed-objects/steepv-analysis.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.steepv import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_DIMENSIONS,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_steepv_gates,
    evaluate_values_dimension_disclosed_gate,
    generate_steepv_analysis,
    is_values_dimension,
    steepv_factor,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

STEEPV_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/steepv-analysis.schema.yaml"


def _factors(*, include_values: bool = True):
    factors = [
        steepv_factor("STEEPV-T-001-F1", "SOCIAL", "aging population share is rising", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-501"]),
        steepv_factor("STEEPV-T-001-F2", "TECHNOLOGICAL", "generative AI adoption accelerating", make_provenance("EVIDENCE", "AI_SUGGESTED")),
    ]
    if include_values:
        factors.append(steepv_factor("STEEPV-T-001-F3", "VALUES", "younger consumers weight sustainability commitments more heavily, durably", make_provenance("HYPOTHESIS", "HUMAN_APPROVED")))
    return factors


def _valid_analysis():
    return generate_steepv_analysis("STEEPV-T-001", _factors())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_steepv_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(STEEPV_ANALYSIS_SCHEMA, _valid_analysis(), "steepv analysis")

    def test_schema_rejects_an_analysis_with_no_values_factor(self):
        """The schema's own contains/minContains:1 constraint, not just the Python builder, refuses this."""
        analysis = {
            "id": "STEEPV-T-BAD-001",
            "version": "1.0.0",
            "generated_by_method": METHOD_ID,
            "factors": _factors(include_values=False),
        }
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STEEPV_ANALYSIS_SCHEMA, analysis, "analysis with no VALUES factor")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STEEPV_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_per_factor_key(self):
        analysis = _valid_analysis()
        analysis["factors"][0] = {**analysis["factors"][0], "geography": "TW"}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STEEPV_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled per-factor key")

    def test_schema_rejects_a_seventh_dimension_value(self):
        with self.assertRaisesRegex(InvariantViolation, "STEEPV_INVALID_DIMENSION"):
            steepv_factor("STEEPV-T-BAD-002-F1", "LEGAL", "statement", make_provenance("HYPOTHESIS", "AI_GENERATED"))

    def test_empty_factors_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "STEEPV_EMPTY_FACTOR_SET"):
            generate_steepv_analysis("STEEPV-T-002", [])

    def test_missing_values_dimension_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "STEEPV_MISSING_VALUES_DIMENSION"):
            generate_steepv_analysis("STEEPV-T-003", _factors(include_values=False))

    def test_invalid_dimension_is_refused_at_construction_not_left_to_schema_validation(self):
        with self.assertRaisesRegex(InvariantViolation, "STEEPV_INVALID_DIMENSION"):
            steepv_factor("STEEPV-T-004-F1", "LEGAL", "statement", make_provenance("HYPOTHESIS", "AI_GENERATED"))

    def test_is_values_dimension_matches_atlas_l516_split(self):
        self.assertTrue(is_values_dimension("VALUES"))
        for other in VALID_DIMENSIONS - {"VALUES"}:
            self.assertFalse(is_values_dimension(other))

    def test_valid_dimensions_are_exactly_the_six_l516_letters(self):
        self.assertEqual(VALID_DIMENSIONS, frozenset({"SOCIAL", "TECHNOLOGICAL", "ECONOMIC", "ENVIRONMENTAL", "POLITICAL", "VALUES"}))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_empty_catalog_blocks_steepv_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "STEEPV-")

    def test_builder_copies_factors_list_not_aliases_caller_list(self):
        factors = _factors()
        analysis = generate_steepv_analysis("STEEPV-T-005", factors)
        factors.append(steepv_factor("STEEPV-T-005-F99", "POLITICAL", "mutated in place", make_provenance("HYPOTHESIS", "AI_GENERATED")))
        self.assertEqual(len(analysis["factors"]), 3)


class GateMutationTests(unittest.TestCase):
    def test_valid_analysis_passes_both_gates(self):
        results = evaluate_steepv_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "values_dimension_disclosed"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        analysis = _valid_analysis()
        analysis["factors"][0] = {**analysis["factors"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("STEEPV-T-001-F1", gate["evidence"][0]["invalid_provenance_ids"])

    def test_provenance_required_gate_fails_on_non_dict_input(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evaluate_steepv_gates_returns_two_gates_in_order(self):
        results = evaluate_steepv_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "values_dimension_disclosed"])


class ValuesDimensionGateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis' raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work -- same
    discipline causal.counterfactual_reasoning's own integrity-gate tests already establish."""

    def test_gate_passes_a_genuinely_valid_hand_built_analysis(self):
        gate = evaluate_values_dimension_disclosed_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")
        self.assertEqual(gate["evidence"][0]["values_factor_count"], 1)

    def test_gate_catches_hand_tampered_values_factor_stripped_out(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["factors"] = [f for f in analysis["factors"] if f["dimension"] != "VALUES"]
        gate = evaluate_values_dimension_disclosed_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_factors(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["factors"] = []
        gate = evaluate_values_dimension_disclosed_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_dimension(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["factors"][0]["dimension"] = "LEGAL"
        gate = evaluate_values_dimension_disclosed_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_analysis(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                gate = evaluate_values_dimension_disclosed_gate(bad_analysis, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_list_factors(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["factors"] = "not-a-list"
        gate = evaluate_values_dimension_disclosed_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_counts_multiple_values_factors(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["factors"].append(steepv_factor("STEEPV-T-001-F4", "VALUES", "a second, distinct values claim", make_provenance("HYPOTHESIS", "AI_SUGGESTED")))
        gate = evaluate_values_dimension_disclosed_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")
        self.assertEqual(gate["evidence"][0]["values_factor_count"], 2)


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.steepv")


if __name__ == "__main__":
    unittest.main()
