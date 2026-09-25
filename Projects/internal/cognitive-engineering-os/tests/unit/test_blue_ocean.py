"""Mutation-style tests for ``strategy.blue_ocean`` (14th and LAST F08 `context/strategy` family
member, after ``strategy.swot``/``strategy.pestel``/``strategy.steepv``/``strategy.three_c``/
``strategy.tows``/``strategy.porter_five_forces``/``strategy.ansoff``/``strategy.value_chain``/
``strategy.stp``/``strategy.vrio``).

Four real invariants (factor count >=2; closed 4-value errc_action; CREATE-vs-existing-factor
industry_standard_level asymmetry; non-empty new_value_curve_summary), exercised at THREE layers:
construction-time refusal (``generate_blue_ocean_analysis``/``blue_ocean_factor`` raising a specific
``InvariantViolation`` code), independent gate re-derivation (``evaluate_factor_count_gate``/
``evaluate_errc_action_valid_gate``/``evaluate_industry_standard_level_consistency_gate``/
``evaluate_new_value_curve_summary_disclosed_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely), and the real JSON Schema itself (minItems, enum, if/then), checked against the
spec-root schema this same slice added (``typed-objects/blue-ocean-analysis.schema.yaml``), not a
schema this test file invents.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.blue_ocean import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_ERRC_ACTIONS,
    VALID_INDUSTRY_STANDARD_LEVELS,
    all_gates_pass,
    blue_ocean_factor,
    evaluate_errc_action_valid_gate,
    evaluate_factor_count_gate,
    evaluate_industry_standard_level_consistency_gate,
    evaluate_new_value_curve_summary_disclosed_gate,
    evaluate_provenance_required_gate,
    evaluate_blue_ocean_gates,
    generate_blue_ocean_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

BLUE_OCEAN_SCHEMA = "ai-lego://specs/cognitive/typed-objects/blue-ocean-analysis.schema.yaml"


def _factors():
    return [
        blue_ocean_factor(
            "BO-T-001-F1", "業務員人力銷售據點數量", "ELIMINATE", "傳統據點成本高昂，全數線上化可去除此成本", make_provenance("EVIDENCE", "HUMAN_APPROVED"), industry_standard_level="HIGH"
        ),
        blue_ocean_factor(
            "BO-T-001-F2", "結帳流程速度", "RAISE", "拉高至一鍵結帳可放大既有 A/B 測試框架優勢", make_provenance("EVIDENCE", "AI_SUGGESTED"), industry_standard_level="MEDIUM"
        ),
        blue_ocean_factor("BO-T-001-F3", "購後社群共創回饋機制", "CREATE", "產業內尚無此功能，可建立差異化黏著度", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]


def _valid_analysis(analysis_id="BLUEOCEAN-T-001", competing_factors=None, new_value_curve_summary="去除高成本據點、拉高結帳速度、創造共創回饋機制，構成新價值曲線"):
    return generate_blue_ocean_analysis(analysis_id, competing_factors if competing_factors is not None else _factors(), new_value_curve_summary)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(BLUE_OCEAN_SCHEMA, _valid_analysis(), "Blue Ocean analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_blue_ocean_analysis, "BLUEOCEAN-T-INVOKE", _factors(), "new curve found")
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.blue_ocean.contract.yaml")
        self.assertEqual(analysis["id"], "BLUEOCEAN-T-INVOKE")

    def test_empty_catalog_blocks_blue_ocean_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_INVALID_ID"):
            _valid_analysis(analysis_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_INVALID_ID"):
            _valid_analysis(analysis_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_INVALID_VERSION"):
            generate_blue_ocean_analysis("BLUEOCEAN-T-002", _factors(), "new curve found", version=1)

    def test_id_is_distinct_from_sibling_machine_ids(self):
        self.assertNotEqual(METHOD_ID, "strategy.value_chain")
        self.assertNotEqual(METHOD_ID, "strategy.three_c")
        self.assertEqual(METHOD_ID, "strategy.blue_ocean")

    def test_blue_ocean_and_value_chain_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.value_chain"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check
        strategy.three_c.contract.yaml's own test suite already establishes -- not just a one-time
        manual claim in prose."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.blue_ocean.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.blue_ocean contract")


class ErrcActionEnumTests(unittest.TestCase):
    def test_invalid_errc_action_is_refused_at_construction_not_left_to_schema_validation(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_INVALID_ERRC_ACTION"):
            blue_ocean_factor("BO-T-BAD-001", "結帳流程速度", "OPTIMIZE", "reasoning", make_provenance("HYPOTHESIS", "AI_GENERATED"), industry_standard_level="MEDIUM")

    def test_empty_factor_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_EMPTY_FACTOR_NAME"):
            blue_ocean_factor("BO-T-BAD-002", "", "RAISE", "reasoning", make_provenance("HYPOTHESIS", "AI_GENERATED"), industry_standard_level="MEDIUM")

    def test_whitespace_only_factor_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_EMPTY_FACTOR_NAME"):
            blue_ocean_factor("BO-T-BAD-003", "   ", "RAISE", "reasoning", make_provenance("HYPOTHESIS", "AI_GENERATED"), industry_standard_level="MEDIUM")

    def test_empty_rationale_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_EMPTY_RATIONALE"):
            blue_ocean_factor("BO-T-BAD-004", "結帳流程速度", "RAISE", "", make_provenance("HYPOTHESIS", "AI_GENERATED"), industry_standard_level="MEDIUM")

    def test_whitespace_only_rationale_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_EMPTY_RATIONALE"):
            blue_ocean_factor("BO-T-BAD-005", "結帳流程速度", "RAISE", "   ", make_provenance("HYPOTHESIS", "AI_GENERATED"), industry_standard_level="MEDIUM")

    def test_valid_errc_actions_constant_matches_atlas_l526_grid(self):
        self.assertEqual(VALID_ERRC_ACTIONS, frozenset({"ELIMINATE", "REDUCE", "RAISE", "CREATE"}))

    def test_valid_industry_standard_levels_constant(self):
        self.assertEqual(VALID_INDUSTRY_STANDARD_LEVELS, frozenset({"LOW", "MEDIUM", "HIGH"}))


class IndustryStandardLevelInvariantTests(unittest.TestCase):
    """Atlas's own '→ERRC' (F08 L526): ELIMINATE/REDUCE/RAISE apply to an EXISTING competing factor
    (industry_standard_level REQUIRED); CREATE introduces a never-before-offered factor (industry_
    standard_level FORBIDDEN)."""

    def test_eliminate_without_level_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_MISSING_INDUSTRY_STANDARD_LEVEL"):
            blue_ocean_factor("BO-T-006-F1", "結帳流程速度", "ELIMINATE", "reasoning", make_provenance("EVIDENCE", "AI_SUGGESTED"))

    def test_reduce_without_level_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_MISSING_INDUSTRY_STANDARD_LEVEL"):
            blue_ocean_factor("BO-T-007-F1", "結帳流程速度", "REDUCE", "reasoning", make_provenance("EVIDENCE", "AI_SUGGESTED"))

    def test_raise_without_level_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_MISSING_INDUSTRY_STANDARD_LEVEL"):
            blue_ocean_factor("BO-T-008-F1", "結帳流程速度", "RAISE", "reasoning", make_provenance("EVIDENCE", "AI_SUGGESTED"))

    def test_create_with_level_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_UNEXPECTED_INDUSTRY_STANDARD_LEVEL_FOR_CREATE"):
            blue_ocean_factor("BO-T-009-F1", "購後共創回饋機制", "CREATE", "reasoning", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), industry_standard_level="LOW")

    def test_create_without_level_is_accepted(self):
        factor = blue_ocean_factor("BO-T-010-F1", "購後共創回饋機制", "CREATE", "reasoning", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertNotIn("industry_standard_level", factor)

    def test_invalid_industry_standard_level_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_INVALID_INDUSTRY_STANDARD_LEVEL"):
            blue_ocean_factor("BO-T-011-F1", "結帳流程速度", "RAISE", "reasoning", make_provenance("EVIDENCE", "AI_SUGGESTED"), industry_standard_level="VERY_HIGH")

    def test_each_of_eliminate_reduce_raise_with_a_valid_level_is_accepted(self):
        for action in ("ELIMINATE", "REDUCE", "RAISE"):
            with self.subTest(action=action):
                factor = blue_ocean_factor(f"BO-T-012-{action}", "結帳流程速度", action, "reasoning", make_provenance("EVIDENCE", "AI_SUGGESTED"), industry_standard_level="MEDIUM")
                self.assertEqual(factor["industry_standard_level"], "MEDIUM")


class FactorCountInvariantTests(unittest.TestCase):
    """Atlas's own 'Strategy Canvas' (F08 L526): a value curve plotted through a single point is not
    a curve."""

    def test_empty_factors_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_INSUFFICIENT_FACTORS"):
            generate_blue_ocean_analysis("BLUEOCEAN-T-013", [], "new curve found")

    def test_single_factor_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_INSUFFICIENT_FACTORS"):
            generate_blue_ocean_analysis("BLUEOCEAN-T-014", _factors()[:1], "new curve found")

    def test_two_factors_is_accepted(self):
        analysis = generate_blue_ocean_analysis("BLUEOCEAN-T-015", _factors()[:2], "new curve found")
        self.assertEqual(len(analysis["competing_factors"]), 2)

    def test_only_create_factors_no_completeness_requirement_across_errc_actions(self):
        """See the contract's own compilation_decisions: unlike three_c's dimension coverage or
        value_chain's category coverage, Blue Ocean has NO completeness requirement across the 4 ERRC
        actions -- an analysis using only CREATE (or any subset) is legitimate."""
        factors = [
            blue_ocean_factor("BO-T-016-F1", "共創回饋 A", "CREATE", "reasoning A", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            blue_ocean_factor("BO-T-016-F2", "共創回饋 B", "CREATE", "reasoning B", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        analysis = generate_blue_ocean_analysis("BLUEOCEAN-T-016", factors, "new curve found")
        self.assertEqual({f["errc_action"] for f in analysis["competing_factors"]}, {"CREATE"})


class NewValueCurveSummaryInvariantTests(unittest.TestCase):
    """Atlas's own '創造新價值曲線' (F08 L526, the method's own name): Blue Ocean's whole stated
    purpose is delivering a new value curve."""

    def test_empty_new_value_curve_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_EMPTY_NEW_VALUE_CURVE_SUMMARY"):
            _valid_analysis(new_value_curve_summary="")

    def test_whitespace_only_new_value_curve_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_EMPTY_NEW_VALUE_CURVE_SUMMARY"):
            _valid_analysis(new_value_curve_summary="   ")

    def test_none_new_value_curve_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BLUEOCEAN_EMPTY_NEW_VALUE_CURVE_SUMMARY"):
            _valid_analysis(new_value_curve_summary=None)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then
    call the gates. These prove the gates re-derive from raw fields rather than trusting the builder's
    own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_blue_ocean_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_gate_catches_hand_tampered_insufficient_factors(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["competing_factors"] = analysis["competing_factors"][:1]
        gate = evaluate_factor_count_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_errc_action(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["competing_factors"][0]["errc_action"] = "OPTIMIZE"
        gate = evaluate_errc_action_valid_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BO-T-001-F1", gate["evidence"][0]["invalid_errc_action_ids"])

    def test_gate_catches_hand_tampered_create_with_smuggled_level(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["competing_factors"][2]["industry_standard_level"] = "LOW"  # F3 is CREATE
        gate = evaluate_industry_standard_level_consistency_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BO-T-001-F3", gate["evidence"][0]["violation_ids"])

    def test_gate_catches_hand_tampered_existing_factor_with_level_stripped(self):
        analysis = copy.deepcopy(_valid_analysis())
        del analysis["competing_factors"][0]["industry_standard_level"]  # F1 is ELIMINATE
        gate = evaluate_industry_standard_level_consistency_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BO-T-001-F1", gate["evidence"][0]["violation_ids"])

    def test_gate_catches_hand_tampered_empty_new_value_curve_summary(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["new_value_curve_summary"] = ""
        gate = evaluate_new_value_curve_summary_disclosed_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_missing_provenance(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["competing_factors"][0] = {**analysis["competing_factors"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BO-T-001-F1", gate["evidence"][0]["invalid_provenance_ids"])

    def test_all_gates_catch_non_dict_analysis(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                self.assertEqual(evaluate_factor_count_gate(bad_analysis, "test", "t")["status"], "FAIL")
                self.assertEqual(evaluate_errc_action_valid_gate(bad_analysis, "test", "t")["status"], "FAIL")
                self.assertEqual(evaluate_industry_standard_level_consistency_gate(bad_analysis, "test", "t")["status"], "FAIL")
                self.assertEqual(evaluate_new_value_curve_summary_disclosed_gate(bad_analysis, "test", "t")["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_analysis, "test", "t")["status"], "FAIL")

    def test_hand_tampered_analysis_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = copy.deepcopy(_valid_analysis())
        tampered["competing_factors"][2]["industry_standard_level"] = "LOW"
        with self.assertRaises(SchemaValidationError):
            contracts.validate(BLUE_OCEAN_SCHEMA, tampered, "tampered analysis with CREATE carrying a level")
        gate = evaluate_industry_standard_level_consistency_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class SchemaLevelCoverageTests(unittest.TestCase):
    """Proves the schema's own minItems/enum/if-then constraints are real, not just the runtime
    gates."""

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_schema_rejects_fewer_than_two_factors(self):
        analysis = {
            "id": "BLUEOCEAN-T-SCHEMA-001",
            "version": "1.0.0",
            "generated_by_method": "strategy.blue_ocean",
            "competing_factors": _factors()[:1],
            "new_value_curve_summary": "new curve found",
        }
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BLUE_OCEAN_SCHEMA, analysis, "analysis with only 1 factor")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """Same discipline as rct-record.schema.yaml's own test: additionalProperties:false must
        reject a smuggled top-level key."""
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BLUE_OCEAN_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_factor_item_key(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["competing_factors"][0]["confidence"] = 0.9
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BLUE_OCEAN_SCHEMA, analysis, "analysis with a smuggled factor-item key")

    def test_schema_rejects_out_of_enum_errc_action(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["competing_factors"][0]["errc_action"] = "OPTIMIZE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BLUE_OCEAN_SCHEMA, analysis, "analysis with an out-of-enum errc_action")

    def test_schema_rejects_existing_factor_missing_industry_standard_level(self):
        analysis = copy.deepcopy(_valid_analysis())
        del analysis["competing_factors"][0]["industry_standard_level"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BLUE_OCEAN_SCHEMA, analysis, "ELIMINATE factor missing industry_standard_level")

    def test_schema_rejects_create_factor_with_industry_standard_level(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["competing_factors"][2]["industry_standard_level"] = "LOW"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BLUE_OCEAN_SCHEMA, analysis, "CREATE factor illegally carrying industry_standard_level")

    def test_schema_accepts_the_unmodified_valid_example(self):
        self.contracts.validate(BLUE_OCEAN_SCHEMA, _valid_analysis(), "unmodified valid example")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_blue_ocean_gates_returns_five_gates_in_order(self):
        results = evaluate_blue_ocean_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(
            [r["gate_id"] for r in results],
            ["provenance_required", "factor_count", "errc_action_valid", "industry_standard_level_consistency", "new_value_curve_summary_disclosed"],
        )

    def test_evaluate_blue_ocean_gates_all_pass_on_a_valid_analysis(self):
        results = evaluate_blue_ocean_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BLUEOCEAN-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.blue_ocean")

    def test_builder_does_not_leak_extra_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(set(analysis.keys()), {"id", "version", "generated_by_method", "competing_factors", "new_value_curve_summary"})

    def test_create_factor_does_not_leak_industry_standard_level_key(self):
        factor = blue_ocean_factor("BO-T-017-F1", "共創回饋機制", "CREATE", "reasoning", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual(set(factor.keys()), {"id", "factor_name", "errc_action", "rationale", "provenance"})

    def test_existing_factor_includes_industry_standard_level_key(self):
        factor = blue_ocean_factor("BO-T-018-F1", "結帳流程速度", "RAISE", "reasoning", make_provenance("EVIDENCE", "AI_SUGGESTED"), industry_standard_level="MEDIUM")
        self.assertEqual(set(factor.keys()), {"id", "factor_name", "errc_action", "rationale", "provenance", "industry_standard_level"})


if __name__ == "__main__":
    unittest.main()
