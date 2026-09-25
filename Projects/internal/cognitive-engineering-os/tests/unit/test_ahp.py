"""Mutation-style tests for ``decision.ahp`` (seventh Method Atlas slice, first from the decision family).

The compute layer (``ai_lego/compute/ahp/weights.py``) is checked against
known Saaty-method cases: a perfectly-consistent 4:2:1 weight ratio (exact
expected weights and CR=0), a mildly inconsistent case (small but nonzero
CR), and a deliberately circular/highly-inconsistent case (large CR,
correctly flagged). ``evaluate_genuine_compute_gate`` is proven to be the
SAME function ``root_cause.pareto`` already reuses from
``modules.research.gates`` -- the second method family to lean on it.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.ahp.weights import build_pairwise_matrix, consistency_ratio, geometric_mean_weights, rank_options
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decision.ahp import (
    METHOD_ID,
    all_gates_pass,
    evaluate_ahp_gates,
    evaluate_consistency_gate,
    evaluate_genuine_compute_gate,
    generate_ahp_analysis,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

AHP_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/ahp-analysis.schema.yaml"


def _criteria():
    return [{"id": "C1", "label": "cost"}, {"id": "C2", "label": "quality"}, {"id": "C3", "label": "speed"}]


def _consistent_comparisons():
    """True weight ratio 4:2:1 -- exactly consistent."""
    return [
        {"criterion_a_id": "C1", "criterion_b_id": "C2", "value": 2.0},
        {"criterion_a_id": "C1", "criterion_b_id": "C3", "value": 4.0},
        {"criterion_a_id": "C2", "criterion_b_id": "C3", "value": 2.0},
    ]


class ComputeLayerTests(unittest.TestCase):
    """Real arithmetic against known Saaty-method cases, not just 'does it run'."""

    def test_perfectly_consistent_matrix_yields_exact_expected_weights_and_zero_cr(self):
        matrix = build_pairwise_matrix(["C1", "C2", "C3"], _consistent_comparisons())
        weights = geometric_mean_weights(matrix)
        self.assertAlmostEqual(weights[0], 4 / 7, places=6)
        self.assertAlmostEqual(weights[1], 2 / 7, places=6)
        self.assertAlmostEqual(weights[2], 1 / 7, places=6)
        _lambda_max, _ci, cr = consistency_ratio(matrix, weights)
        self.assertAlmostEqual(cr, 0.0, places=6)

    def test_mildly_inconsistent_matrix_has_small_but_nonzero_cr_under_threshold(self):
        comparisons = [
            {"criterion_a_id": "C1", "criterion_b_id": "C2", "value": 3.0},
            {"criterion_a_id": "C1", "criterion_b_id": "C3", "value": 5.0},
            {"criterion_a_id": "C2", "criterion_b_id": "C3", "value": 2.0},
        ]
        matrix = build_pairwise_matrix(["C1", "C2", "C3"], comparisons)
        weights = geometric_mean_weights(matrix)
        _lambda_max, _ci, cr = consistency_ratio(matrix, weights)
        self.assertGreater(cr, 0.0)
        self.assertLess(cr, 0.10)

    def test_circular_preference_is_flagged_highly_inconsistent(self):
        """A>B by 9, B>C by 9, C>A by 9 -- a textbook incoherent judgment set."""
        comparisons = [
            {"criterion_a_id": "C1", "criterion_b_id": "C2", "value": 9.0},
            {"criterion_a_id": "C2", "criterion_b_id": "C3", "value": 9.0},
            {"criterion_a_id": "C1", "criterion_b_id": "C3", "value": 1 / 9},
        ]
        matrix = build_pairwise_matrix(["C1", "C2", "C3"], comparisons)
        weights = geometric_mean_weights(matrix)
        _lambda_max, _ci, cr = consistency_ratio(matrix, weights)
        self.assertGreater(cr, 0.10)

    def test_two_criteria_are_always_consistent(self):
        """RI=0 for n<=2 -- no inconsistency is measurable with only two criteria."""
        matrix = build_pairwise_matrix(["C1", "C2"], [{"criterion_a_id": "C1", "criterion_b_id": "C2", "value": 7.0}])
        weights = geometric_mean_weights(matrix)
        _lambda_max, _ci, cr = consistency_ratio(matrix, weights)
        self.assertEqual(cr, 0.0)

    def test_incomplete_comparisons_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AHP_INCOMPLETE_COMPARISONS"):
            build_pairwise_matrix(["C1", "C2", "C3"], [{"criterion_a_id": "C1", "criterion_b_id": "C2", "value": 1.0}])

    def test_value_outside_saaty_scale_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AHP_VALUE_OUT_OF_SAATY_SCALE"):
            build_pairwise_matrix(["C1", "C2"], [{"criterion_a_id": "C1", "criterion_b_id": "C2", "value": 15.0}])

    def test_duplicate_comparison_is_refused(self):
        dup = [{"criterion_a_id": "C1", "criterion_b_id": "C2", "value": 1.0}, {"criterion_a_id": "C2", "criterion_b_id": "C1", "value": 1.0}]
        with self.assertRaisesRegex(InvariantViolation, "AHP_DUPLICATE_COMPARISON"):
            build_pairwise_matrix(["C1", "C2"], dup)

    def test_rank_options_computes_correct_weighted_sums(self):
        ranking = rank_options({"C1": 0.5, "C2": 0.3, "C3": 0.2}, [
            {"option_id": "A", "criterion_id": "C1", "score": 1.0},
            {"option_id": "A", "criterion_id": "C2", "score": 0.0},
            {"option_id": "A", "criterion_id": "C3", "score": 0.0},
            {"option_id": "B", "criterion_id": "C1", "score": 0.2},
            {"option_id": "B", "criterion_id": "C2", "score": 1.0},
            {"option_id": "B", "criterion_id": "C3", "score": 1.0},
        ])
        # weights {C1:0.5, C2:0.3, C3:0.2}: A = 0.5*1.0 = 0.5; B = 0.5*0.2 + 0.3*1.0 + 0.2*1.0 = 0.6 -- B wins clearly.
        self.assertEqual(ranking[0]["option_id"], "B")
        self.assertAlmostEqual(ranking[0]["weighted_score"], 0.6)
        self.assertAlmostEqual(ranking[1]["weighted_score"], 0.5)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_ahp_analysis_validates_against_the_real_schema(self):
        analysis = generate_ahp_analysis("AHP-T-001", "test goal", _criteria(), _consistent_comparisons(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        self.contracts.validate(AHP_ANALYSIS_SCHEMA, analysis, "ahp analysis")
        self.assertTrue(analysis["consistent"])
        self.assertEqual(analysis["ranking"], [])  # no options supplied

    def test_analysis_with_options_produces_a_real_ranking(self):
        analysis = generate_ahp_analysis(
            "AHP-T-002", "test goal", _criteria(), _consistent_comparisons(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
            options=[{"id": "O1", "label": "x"}], option_scores=[{"option_id": "O1", "criterion_id": "C1", "score": 1.0}, {"option_id": "O1", "criterion_id": "C2", "score": 0.0}, {"option_id": "O1", "criterion_id": "C3", "score": 0.0}],
        )
        self.contracts.validate(AHP_ANALYSIS_SCHEMA, analysis, "ahp analysis")
        self.assertEqual(len(analysis["ranking"]), 1)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_ahp_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateReuseAndMutationTests(unittest.TestCase):
    def test_genuine_compute_gate_is_the_same_function_pareto_already_reuses(self):
        analysis = generate_ahp_analysis("AHP-T-003", "g", _criteria(), _consistent_comparisons(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        direct_pass, direct_evidence = evaluate_statistical_gate(analysis)
        gate = evaluate_genuine_compute_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "PASS" if direct_pass else "FAIL")
        self.assertEqual(gate["evidence"], direct_evidence)

    def test_valid_analysis_passes_all_three_gates(self):
        analysis = generate_ahp_analysis("AHP-T-004", "g", _criteria(), _consistent_comparisons(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        results = evaluate_ahp_gates(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "consistency_required"})
        self.assertTrue(all_gates_pass(results))

    def test_inconsistent_analysis_fails_the_consistency_gate(self):
        """Mutation-style: a hand-tampered record claiming consistent:true despite a high CR must be caught."""
        analysis = generate_ahp_analysis("AHP-T-005", "g", _criteria(), _consistent_comparisons(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        analysis["consistency_ratio"] = 0.35
        analysis["consistent"] = True  # tampered: real CR is 0.35, way over 0.10
        gate = evaluate_consistency_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_honestly_reported_inconsistent_flag_also_fails_the_gate(self):
        analysis = generate_ahp_analysis("AHP-T-006", "g", _criteria(), _consistent_comparisons(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        analysis["consistency_ratio"] = 0.35
        analysis["consistent"] = False  # honest this time
        gate = evaluate_consistency_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_analysis_fails_all_gates_not_a_crash(self):
        """Every gate in this module's own aggregate must fail closed, not crash, on a non-dict top-level
        argument -- the same regression class ``root_cause.fault_tree``'s own
        ``test_non_dict_record_fails_all_gates_not_a_crash`` proves for its family."""
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                results = evaluate_ahp_gates(bad_analysis, "test", "2026-09-04T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


if __name__ == "__main__":
    unittest.main()
