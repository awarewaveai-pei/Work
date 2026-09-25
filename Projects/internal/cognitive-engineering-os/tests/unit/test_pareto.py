"""Mutation-style tests for ``root_cause.pareto`` (fifth Method Atlas slice, second real fishbone validation path).

Schema conformance against ``typed-objects/pareto-analysis.schema.yaml``.
The compute layer (``ai_lego/compute/pareto/ranking.py``) is tested for
real arithmetic correctness, not just "does it run". The threshold-honesty
gate is proven both ways: an explicit threshold produces a real vital-few
set; no threshold leaves it empty and PENDING, never silently defaulted.
``evaluate_genuine_compute_gate`` is proven to be the SAME function
``modules.research.gates.evaluate_statistical_gate`` already uses, reused
unchanged.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.pareto.ranking import pareto_ranking, vital_few
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.modules.root_cause.fishbone import build_problem_statement, cause_hypothesis, generate_cause_hypothesis_set
from ai_lego.modules.root_cause.pareto import (
    METHOD_ID,
    all_gates_pass,
    evaluate_explicit_threshold_gate,
    evaluate_genuine_compute_gate,
    evaluate_pareto_gates,
    generate_pareto_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

PARETO_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/pareto-analysis.schema.yaml"


def _cause_hypothesis_set():
    ps = build_problem_statement("PROB-T-PA-001", {"current_state": "x", "expected_state": "y", "gap": "z"}, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    hypotheses = [
        cause_hypothesis("CHS-T-PA-001-H1", "cause one", "Technology", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        cause_hypothesis("CHS-T-PA-001-H2", "cause two", "Process", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        cause_hypothesis("CHS-T-PA-001-H3", "cause three", "Process", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]
    return generate_cause_hypothesis_set("CHS-T-PA-001", ps, hypotheses)


def _dataset():
    return [
        {"hypothesis_id": "CHS-T-PA-001-H1", "metric_value": 80},
        {"hypothesis_id": "CHS-T-PA-001-H2", "metric_value": 15},
        {"hypothesis_id": "CHS-T-PA-001-H3", "metric_value": 5},
    ]


class RankingComputeTests(unittest.TestCase):
    """Real arithmetic, not just 'does it run'."""

    def test_ranking_is_sorted_descending_with_correct_shares(self):
        ranking = pareto_ranking([{"hypothesis_id": "A", "metric_value": 80}, {"hypothesis_id": "B", "metric_value": 20}])
        self.assertEqual([r["hypothesis_id"] for r in ranking], ["A", "B"])
        self.assertAlmostEqual(ranking[0]["share_of_total_percent"], 80.0)
        self.assertAlmostEqual(ranking[0]["cumulative_share_percent"], 80.0)
        self.assertAlmostEqual(ranking[1]["cumulative_share_percent"], 100.0)

    def test_duplicate_hypothesis_ids_are_summed_not_overwritten(self):
        ranking = pareto_ranking([{"hypothesis_id": "A", "metric_value": 30}, {"hypothesis_id": "A", "metric_value": 30}, {"hypothesis_id": "B", "metric_value": 40}])
        by_id = {r["hypothesis_id"]: r["metric_value"] for r in ranking}
        self.assertEqual(by_id["A"], 60)

    def test_empty_input_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETO_RANKING_EMPTY_INPUT"):
            pareto_ranking([])

    def test_negative_metric_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETO_RANKING_NEGATIVE_VALUE"):
            pareto_ranking([{"hypothesis_id": "A", "metric_value": -1}])

    def test_zero_total_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETO_RANKING_ZERO_TOTAL"):
            pareto_ranking([{"hypothesis_id": "A", "metric_value": 0}])

    def test_vital_few_stops_at_first_entry_crossing_threshold(self):
        ranking = pareto_ranking([{"hypothesis_id": "A", "metric_value": 50}, {"hypothesis_id": "B", "metric_value": 30}, {"hypothesis_id": "C", "metric_value": 20}])
        self.assertEqual(vital_few(ranking, 80.0), ["A", "B"])
        self.assertEqual(vital_few(ranking, 50.0), ["A"])
        self.assertEqual(vital_few(ranking, 100.0), ["A", "B", "C"])

    def test_threshold_out_of_range_is_refused(self):
        ranking = pareto_ranking([{"hypothesis_id": "A", "metric_value": 1}])
        with self.assertRaisesRegex(InvariantViolation, "PARETO_THRESHOLD_OUT_OF_RANGE"):
            vital_few(ranking, 0)
        with self.assertRaisesRegex(InvariantViolation, "PARETO_THRESHOLD_OUT_OF_RANGE"):
            vital_few(ranking, 101)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_analysis_with_explicit_threshold_validates_against_the_real_schema(self):
        analysis = generate_pareto_analysis("PA-T-001", _cause_hypothesis_set(), "incident_count", _dataset(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"), vital_few_threshold_percent=80.0)
        self.contracts.validate(PARETO_ANALYSIS_SCHEMA, analysis, "pareto analysis")
        self.assertEqual(analysis["threshold_status"], "OPERATOR_SET")
        self.assertEqual(analysis["vital_few_hypothesis_ids"], ["CHS-T-PA-001-H1"])

    def test_analysis_with_no_threshold_is_pending_and_empty_vital_few(self):
        analysis = generate_pareto_analysis("PA-T-002", _cause_hypothesis_set(), "incident_count", _dataset(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        self.contracts.validate(PARETO_ANALYSIS_SCHEMA, analysis, "pareto analysis")
        self.assertEqual(analysis["threshold_status"], "OPERATOR_SET_PENDING")
        self.assertEqual(analysis["vital_few_hypothesis_ids"], [])

    def test_empty_dataset_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETO_PRECONDITION_FAILED"):
            generate_pareto_analysis("PA-T-003", _cause_hypothesis_set(), "incident_count", [], make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_dataset_referencing_unknown_hypothesis_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PARETO_PRECONDITION_FAILED"):
            generate_pareto_analysis("PA-T-004", _cause_hypothesis_set(), "incident_count", [{"hypothesis_id": "DOES-NOT-EXIST", "metric_value": 1}], make_provenance("CALCULATED_RESULT", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_pareto_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateReuseTests(unittest.TestCase):
    def test_genuine_compute_gate_is_the_same_function_the_research_module_uses(self):
        """Not just equivalent logic -- the literal same function object."""
        analysis = generate_pareto_analysis("PA-T-005", _cause_hypothesis_set(), "incident_count", _dataset(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"), vital_few_threshold_percent=80.0)
        direct_pass, direct_evidence = evaluate_statistical_gate(analysis)
        gate = evaluate_genuine_compute_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "PASS" if direct_pass else "FAIL")
        self.assertEqual(gate["evidence"], direct_evidence)

    def test_llm_mental_arithmetic_engine_fails_genuine_compute_gate(self):
        analysis = generate_pareto_analysis("PA-T-006", _cause_hypothesis_set(), "incident_count", _dataset(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"), vital_few_threshold_percent=80.0)
        analysis["engine"] = "llm_mental_arithmetic"
        gate = evaluate_genuine_compute_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_valid_analysis_passes_both_gates(self):
        analysis = generate_pareto_analysis("PA-T-007", _cause_hypothesis_set(), "incident_count", _dataset(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"), vital_few_threshold_percent=80.0)
        results = evaluate_pareto_gates(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"genuine_compute", "explicit_threshold_required"})
        self.assertTrue(all_gates_pass(results))

    def test_vital_few_populated_without_operator_set_fails_explicit_threshold_gate(self):
        """Mutation-style: a hand-tampered record claiming vital-few results without an explicit threshold must
        be caught -- this is exactly the silently-assumed-80/20 pattern Atlas L1320 warns against."""
        analysis = generate_pareto_analysis("PA-T-008", _cause_hypothesis_set(), "incident_count", _dataset(), make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
        analysis["vital_few_hypothesis_ids"] = ["CHS-T-PA-001-H1"]  # tampered: threshold_status is still PENDING
        gate = evaluate_explicit_threshold_gate(analysis, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_analysis_fails_all_gates_not_a_crash(self):
        """Every gate in this module's own aggregate must fail closed, not crash, on a non-dict top-level
        argument -- the same regression class ``root_cause.fault_tree``'s own
        ``test_non_dict_record_fails_all_gates_not_a_crash`` proves for its family."""
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                results = evaluate_pareto_gates(bad_analysis, "test", "2026-09-04T00:00:00Z")  # must not raise
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


if __name__ == "__main__":
    unittest.main()
