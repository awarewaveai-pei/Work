"""Mutation-style tests for ``decision.mcda`` (tenth Method Atlas slice, second from the decision family,
the natural extension of ``decision.ahp``).

The compute layer (``ai_lego/compute/mcda/scoring.py``) is checked against
3 known normalization cases: mixed-direction criteria, a tied criterion
(no distinction between options), and a 3-option all-minimize case.
Atlas §22.3's own no-automatic-authority rule (L4154) is proven at BOTH
independent layers, the same discipline ``test_red_team.py`` already
established for its own table-cited sibling rule.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.ahp.weights import rank_options
from ai_lego.compute.mcda.scoring import normalize_scores, validate_weights_sum_to_one
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.mcda import (
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_genuine_compute_gate,
    evaluate_mcda_gates,
    evaluate_no_automatic_authority_gate,
    evaluate_sensitivity_disclosed_gate,
    generate_mcda_analysis,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

MCDA_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/mcda-analysis.schema.yaml"


def _options():
    return [{"id": "O1", "label": "build"}, {"id": "O2", "label": "outsource"}]


def _criteria():
    return [{"id": "C1", "label": "cost", "direction": "minimize"}, {"id": "C2", "label": "speed", "direction": "maximize"}, {"id": "C3", "label": "maintainability", "direction": "maximize"}]


def _raw_scores():
    return [
        {"option_id": "O1", "criterion_id": "C1", "raw_value": 80000},
        {"option_id": "O1", "criterion_id": "C2", "raw_value": 4},
        {"option_id": "O1", "criterion_id": "C3", "raw_value": 9},
        {"option_id": "O2", "criterion_id": "C1", "raw_value": 50000},
        {"option_id": "O2", "criterion_id": "C2", "raw_value": 8},
        {"option_id": "O2", "criterion_id": "C3", "raw_value": 5},
    ]


def _weights():
    return [{"criterion_id": "C1", "weight": 0.4}, {"criterion_id": "C2", "weight": 0.3}, {"criterion_id": "C3", "weight": 0.3}]


def _valid_analysis():
    return generate_mcda_analysis("MCDA-T-001", _options(), _criteria(), _raw_scores(), _weights(), "manually checked, stable outside a narrow band", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))


class ComputeLayerTests(unittest.TestCase):
    """Real arithmetic against known normalization cases, not just 'does it run'."""

    def test_mixed_direction_normalization_is_correct(self):
        normalized = {(n["option_id"], n["criterion_id"]): n["normalized_value"] for n in normalize_scores(_raw_scores(), _criteria())}
        self.assertAlmostEqual(normalized[("O1", "C1")], 0.0)  # minimize: highest cost -> 0.0
        self.assertAlmostEqual(normalized[("O2", "C1")], 1.0)  # minimize: lowest cost -> 1.0
        self.assertAlmostEqual(normalized[("O1", "C2")], 0.0)  # maximize: lowest speed -> 0.0
        self.assertAlmostEqual(normalized[("O2", "C2")], 1.0)  # maximize: highest speed -> 1.0

    def test_tied_criterion_normalizes_all_options_to_one(self):
        """When every option scores identically on a criterion, it draws no distinction -- normalized to 1.0 for
        all (documented compilation decision, not left undefined)."""
        criteria = [{"id": "C1", "label": "compliance", "direction": "maximize"}]
        raw = [{"option_id": "O1", "criterion_id": "C1", "raw_value": 5}, {"option_id": "O2", "criterion_id": "C1", "raw_value": 5}]
        normalized = normalize_scores(raw, criteria)
        self.assertTrue(all(n["normalized_value"] == 1.0 for n in normalized))

    def test_three_option_all_minimize_normalization(self):
        criteria = [{"id": "C1", "label": "defect_rate", "direction": "minimize"}]
        raw = [{"option_id": "O1", "criterion_id": "C1", "raw_value": 10}, {"option_id": "O2", "criterion_id": "C1", "raw_value": 5}, {"option_id": "O3", "criterion_id": "C1", "raw_value": 20}]
        normalized = {n["option_id"]: n["normalized_value"] for n in normalize_scores(raw, criteria)}
        self.assertAlmostEqual(normalized["O2"], 1.0)  # lowest defect rate -> best -> 1.0
        self.assertAlmostEqual(normalized["O3"], 0.0)  # highest defect rate -> worst -> 0.0
        self.assertAlmostEqual(normalized["O1"], 10 / 15)  # (20-10)/(20-5)

    def test_invalid_direction_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_INVALID_DIRECTION"):
            normalize_scores([{"option_id": "O1", "criterion_id": "C1", "raw_value": 1}], [{"id": "C1", "label": "x", "direction": "higher_is_better"}])

    def test_unknown_criterion_in_raw_score_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_UNKNOWN_CRITERION_IN_RAW_SCORE"):
            normalize_scores([{"option_id": "O1", "criterion_id": "C99", "raw_value": 1}], _criteria())

    def test_weights_summing_to_one_are_accepted(self):
        validate_weights_sum_to_one(_weights(), ["C1", "C2", "C3"])  # must not raise

    def test_weights_not_summing_to_one_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_WEIGHTS_DO_NOT_SUM_TO_ONE"):
            validate_weights_sum_to_one([{"criterion_id": "C1", "weight": 0.5}, {"criterion_id": "C2", "weight": 0.6}], ["C1", "C2"])

    def test_negative_weight_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_NEGATIVE_WEIGHT"):
            validate_weights_sum_to_one([{"criterion_id": "C1", "weight": -0.5}, {"criterion_id": "C2", "weight": 1.5}], ["C1", "C2"])

    def test_score_stage_reuses_rank_options_unchanged(self):
        """The Score stage is not reimplemented -- it is the exact same function decision.ahp already uses."""
        analysis = _valid_analysis()
        weight_by_criterion = {w["criterion_id"]: w["weight"] for w in _weights()}
        option_scores = [{"option_id": n["option_id"], "criterion_id": n["criterion_id"], "score": n["normalized_value"]} for n in analysis["normalized_scores"]]
        direct_ranking = rank_options(weight_by_criterion, option_scores)
        self.assertEqual(analysis["ranking"], direct_ranking)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_mcda_analysis_validates_against_the_real_schema(self):
        analysis = _valid_analysis()
        self.contracts.validate(MCDA_ANALYSIS_SCHEMA, analysis, "mcda analysis")

    def test_ranking_correctly_favors_outsourcing_in_this_weighting(self):
        analysis = _valid_analysis()
        # weights {C1:0.4, C2:0.3, C3:0.3}: O1 (build) = 0.3; O2 (outsource) = 0.4+0.3 = 0.7 -- O2 wins clearly.
        self.assertEqual(analysis["ranking"][0]["option_id"], "O2")
        self.assertAlmostEqual(analysis["ranking"][0]["weighted_score"], 0.7)
        self.assertAlmostEqual(analysis["ranking"][1]["weighted_score"], 0.3)

    def test_too_few_options_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_TOO_FEW_OPTIONS"):
            generate_mcda_analysis("MCDA-T-002", [{"id": "O1", "label": "solo"}], _criteria(), [{"option_id": "O1", "criterion_id": "C1", "raw_value": 1}], [{"criterion_id": "C1", "weight": 1.0}], "n/a", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_empty_sensitivity_notes_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "MCDA_SENSITIVITY_NOTES_EMPTY"):
            generate_mcda_analysis("MCDA-T-003", _options(), _criteria(), _raw_scores(), _weights(), "   ", make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_architecture_trade_off_matrix_stays_a_true_duplicate_of_mcda(self):
        """architecture.trade_off_matrix (F18 row L825) was deliberately registered as a contract-only entry
        that reuses this method's own pipeline/schema instead of building a second module (critic-confirmed
        field-for-field identity, 2026-09-07, OQ-TOM-3) -- the highest-risk part of that decision is silent
        drift if decision.mcda's own contract shape ever changes underneath it without anyone re-checking.
        Guards both halves: the resolver can still resolve the reused machine_id, and its contract's
        inputs/outputs/forbidden_transition/cognitive_primitives still equal this contract's own."""
        import yaml

        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve(["architecture.trade_off_matrix"])
        self.assertIsNone(resolved["blocked"])

        contracts_dir = self.spec_root / "methods" / "contracts"
        mcda_contract = yaml.safe_load((contracts_dir / "decision.mcda.contract.yaml").read_text(encoding="utf-8"))
        tom_contract = yaml.safe_load((contracts_dir / "architecture.trade_off_matrix.contract.yaml").read_text(encoding="utf-8"))
        for field in ("inputs", "outputs", "forbidden_transition", "cognitive_primitives"):
            with self.subTest(field=field):
                self.assertEqual(tom_contract[field], mcda_contract[field], f"architecture.trade_off_matrix.{field} drifted from decision.mcda.{field}")

    def test_empty_catalog_blocks_mcda_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class NoAutomaticAuthorityTests(unittest.TestCase):
    """Atlas §22.3 L4154: 'MCDA may not directly output Automatic Authority.' Proven at both independent layers,
    same discipline test_red_team.py's own NoFinalAuthorityTests class already established for a sibling rule."""

    def test_top_level_authority_key_is_refused_at_construction(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaisesRegex(InvariantViolation, "MCDA_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN"):
            assert_no_automatic_authority_claim(analysis)

    def test_clean_record_passes_the_authority_check(self):
        assert_no_automatic_authority_claim(_valid_analysis())  # must not raise

    def test_non_dict_record_is_refused_not_crashed_by_the_authority_assert(self):
        """This gate's own precedent had no isinstance guard and would crash with AttributeError (``dict.keys``
        called on a non-dict) instead of failing closed -- the same fix ``decision.impact_effort``'s own
        equivalent already documented this function as missing."""
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                with self.assertRaisesRegex(InvariantViolation, "MCDA_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN"):
                    assert_no_automatic_authority_claim(bad_record)

    def test_schema_layer_independently_refuses_a_hand_crafted_bypass(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_analysis()
        tampered["approved"] = True
        with self.assertRaises(SchemaValidationError):
            contracts.validate(MCDA_ANALYSIS_SCHEMA, tampered, "hand-crafted bypass")

    def test_gate_reuses_assert_no_automatic_authority_claim_and_fails_on_a_tampered_record(self):
        analysis = _valid_analysis()
        analysis["decision"] = "outsource"
        gate = evaluate_no_automatic_authority_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class GateReuseAndMutationTests(unittest.TestCase):
    def test_genuine_compute_gate_is_the_same_function_pareto_and_ahp_already_reuse(self):
        analysis = _valid_analysis()
        direct_pass, direct_evidence = evaluate_statistical_gate(analysis)
        gate = evaluate_genuine_compute_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "PASS" if direct_pass else "FAIL")
        self.assertEqual(gate["evidence"], direct_evidence)

    def test_valid_analysis_passes_all_four_gates(self):
        results = evaluate_mcda_gates(_valid_analysis(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "sensitivity_disclosed", "no_automatic_authority_claim"})
        self.assertTrue(all_gates_pass(results))

    def test_blank_sensitivity_notes_fails_the_disclosure_gate(self):
        """Mutation-style: a hand-tampered record with whitespace-only notes must be caught."""
        analysis = _valid_analysis()
        analysis["sensitivity_notes"] = "   "
        gate = evaluate_sensitivity_disclosed_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_analysis_fails_all_gates_not_a_crash(self):
        """Every gate in this module's own aggregate must fail closed, not crash, on a non-dict top-level
        argument -- the same regression class ``root_cause.fault_tree``'s own
        ``test_non_dict_record_fails_all_gates_not_a_crash`` proves for its family."""
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                results = evaluate_mcda_gates(bad_analysis, "test", "2026-09-04T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


if __name__ == "__main__":
    unittest.main()
