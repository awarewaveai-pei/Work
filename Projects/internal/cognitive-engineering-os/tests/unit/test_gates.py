"""Mutation-style tests: every gate must be able to FAIL for the reason its contract names."""

import copy
import unittest

from ai_lego.compute.statistics.reliability import interrater_reliability_result
from ai_lego.core.domain.claim import claim_record
from ai_lego.core.domain.evidence import build_sentence_provenance, evidence_record, source_node
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.knowledge.provenance import build_evidence_graph
from ai_lego.modules.research.gates import GATE_ORDER, evaluate_method_specific_gates, evaluate_research_workflow_integrity_gate, evaluate_statistical_gate, genuine_compute_provenance
from ai_lego.modules.research.qualitative_coding import assemble_coding_outputs
from ai_lego.modules.research.review import fixture_review
from ai_lego.modules.research.synthetic_fixtures import expanded_synthetic_coder_judgments


def _complete_inputs():
    locked, suggestion = fixture_review()
    coding = assemble_coding_outputs(locked, suggestion, "2026-08-31T00:00:23Z")
    coder_a, coder_b = expanded_synthetic_coder_judgments()
    statistics = interrater_reliability_result(coder_a, coder_b)
    evidence = evidence_record("E-1", "quote", "SRC-1", make_provenance("EVIDENCE", "SOURCE_QUOTATION"))
    claim = claim_record("C-1", "statement", [evidence], make_provenance("AI_INFERENCE", "HUMAN_APPROVED"))
    graph = build_evidence_graph([source_node("SRC-1", "audio 00:00:14")], [evidence], [claim])
    sentence = build_sentence_provenance("SP-1", "statement", claim, evidence, {"locator_type": "audio_timestamp", "start_seconds": 14, "media_type": "audio"}, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    transcriptions = [{"source_id": "SRC-1", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")}]
    return {"coding_outputs": coding, "statistics": statistics, "sentence_provenances": [sentence], "evidence_graph": graph, "claims": [claim], "transcriptions": transcriptions}


def _statuses(inputs):
    results = evaluate_method_specific_gates(**inputs, validator="test", timestamp="2026-08-31T00:00:26Z")
    return {result["gate_id"]: result["status"] for result in results}


class GateTests(unittest.TestCase):
    def test_research_workflow_integrity_checks_cross_node_handoffs(self):
        inputs = _complete_inputs()
        workflow = {
            "nodes": [
                {"node_kind": "method", "method_id": "research.qualitative_coding"},
                {"node_kind": "capability", "ref": "run_statistics"},
                {"node_kind": "method", "method_id": "evidence.triangulation"},
                {"node_kind": "capability", "ref": "artifact.generate_research_paper", "bindings": {"interrater_reliability_result": "outputs.statistics.interrater_reliability_result"}},
            ]
        }
        context = {"steps": {
            "0": inputs["coding_outputs"],
            "1": {"statistics": inputs["statistics"]},
            "2": {"triangulation": {"status": "NEEDS_HUMAN_REVIEW"}},
            "3": {"artifact": {"artifact_type": "ResearchMemoArtifact"}},
        }}
        result = evaluate_research_workflow_integrity_gate(context, workflow, "test", "2026-09-14T00:00:00Z")
        self.assertEqual(result[0]["status"], "PASS")

    def test_research_workflow_integrity_rejects_publication_bound_triangulation(self):
        workflow = {"nodes": [{"node_kind": "method", "method_id": "evidence.triangulation"}]}
        context = {"steps": {"0": {"triangulation": {"status": "PASS"}}}}
        result = evaluate_research_workflow_integrity_gate(context, workflow, "test", "2026-09-14T00:00:00Z")
        self.assertEqual(result[0]["status"], "FAIL")

    def test_complete_inputs_pass_all_five_in_catalog_order(self):
        results = evaluate_method_specific_gates(**_complete_inputs(), validator="test", timestamp="2026-08-31T00:00:26Z")
        self.assertEqual([result["gate_id"] for result in results], GATE_ORDER)
        self.assertTrue(all(result["status"] == "PASS" for result in results), results)
        self.assertTrue(all(result["evidence"] for result in results))

    def test_missing_saturation_assessment_fails_methodology_and_integrity_only(self):
        inputs = _complete_inputs()
        del inputs["coding_outputs"]["saturation_assessment"]
        statuses = _statuses(inputs)
        self.assertEqual(statuses["methodology"], "FAIL")
        self.assertEqual(statuses["research_integrity"], "FAIL")
        self.assertEqual(statuses["citation"], "PASS")
        self.assertEqual(statuses["authorship"], "PASS")

    def test_dangling_supports_edge_fails_citation(self):
        inputs = _complete_inputs()
        inputs["evidence_graph"]["edges"] = [edge for edge in inputs["evidence_graph"]["edges"] if edge["relation_type"] != "SUPPORTS"]
        statuses = _statuses(inputs)
        self.assertEqual(statuses["citation"], "FAIL")
        self.assertEqual(statuses["research_integrity"], "FAIL")

    def test_llm_asserted_number_fails_statistical(self):
        inputs = _complete_inputs()
        inputs["statistics"] = {**inputs["statistics"], "engine": "llm_mental_arithmetic", "computation_provenance_ref": None}
        self.assertEqual(_statuses(inputs)["statistical"], "FAIL")

    def test_ai_code_presented_as_human_approved_without_action_fails_authorship(self):
        inputs = _complete_inputs()
        code = copy.deepcopy(inputs["coding_outputs"]["coder_1"]["code_set"][2])
        code["provenance"]["authorship_state"] = "HUMAN_APPROVED"  # no recorded human action on this one
        inputs["coding_outputs"]["coder_1"]["code_set"][2] = code
        self.assertEqual(_statuses(inputs)["authorship"], "FAIL")

    def test_locked_code_without_lock_marker_fails_authorship(self):
        inputs = _complete_inputs()
        inputs["coding_outputs"]["coder_1"]["code_set"][0]["provenance"]["locked"] = None
        self.assertEqual(_statuses(inputs)["authorship"], "FAIL")

    def test_transcript_without_provenance_fails_integrity_only(self):
        inputs = _complete_inputs()
        inputs["transcriptions"] = [{"source_id": "SRC-1"}]
        statuses = _statuses(inputs)
        self.assertEqual(statuses["research_integrity"], "FAIL")
        self.assertEqual([statuses[g] for g in ("citation", "statistical", "methodology", "authorship")], ["PASS"] * 4)

    def test_rejected_suggestion_is_excluded_and_still_passes(self):
        locked, suggestion = fixture_review()
        coding = assemble_coding_outputs(locked, {**suggestion, "action": "REJECT", "result_label": None}, "2026-08-31T00:00:23Z")
        self.assertEqual(len(coding["rejected"]), 1)
        self.assertNotIn("CODE-C1-002", [code["code_id"] for code in coding["coder_1"]["code_set"]])
        inputs = _complete_inputs()
        inputs["coding_outputs"] = coding
        self.assertEqual(_statuses(inputs)["authorship"], "PASS")


class GenuineComputeProvenanceTests(unittest.TestCase):
    """``genuine_compute_provenance`` fixes a real bug (2026-09-18, WORKLOG same date): ``POST
    /methods/{id}/invoke`` defaults an un-supplied ``provenance`` to ``epistemic_type=AI_INFERENCE``
    (main.py:784), which every one of the ~20 genuine-compute methods reusing ``evaluate_statistical_gate``
    then failed on every real dashboard invocation (the dashboard never sends a ``provenance`` field)."""

    def test_normalizes_the_exact_main_py_default_to_a_passing_record(self):
        buggy_default = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = {
            "engine": "local_python_deterministic_compute",
            "computation_provenance_ref": "ai_lego.compute.ahp.weights.geometric_mean_weights",
            "provenance": genuine_compute_provenance(buggy_default),
        }
        passed, evidence = evaluate_statistical_gate(record)
        self.assertTrue(passed, evidence)

    def test_the_unfixed_default_actually_fails_first(self):
        """Proves the test above is not a tautology -- the exact same default, unnormalized, must fail."""
        buggy_default = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = {
            "engine": "local_python_deterministic_compute",
            "computation_provenance_ref": "ai_lego.compute.ahp.weights.geometric_mean_weights",
            "provenance": buggy_default,
        }
        passed, _ = evaluate_statistical_gate(record)
        self.assertFalse(passed)

    def test_authorship_state_passes_through_unchanged(self):
        provenance = make_provenance("AI_INFERENCE", "HUMAN_APPROVED")
        normalized = genuine_compute_provenance(provenance)
        self.assertEqual(normalized["epistemic_type"], "CALCULATED_RESULT")
        self.assertEqual(normalized["authorship_state"], "HUMAN_APPROVED")

    def test_already_correct_provenance_is_returned_by_identity_not_rebuilt(self):
        """Every real fixture in this corpus already supplies CALCULATED_RESULT (e.g. every _prov() helper
        across tests/unit/test_{impact_effort,ice,kano,pareto_frontier,data_quality_dimensions,...}.py), and
        5 of the 19 fixed modules have their own test asserting the record's stored provenance IS
        (identity) the caller's object, not a copy (e.g. test_impact_effort.py::
        test_provenance_is_deliberately_aliased_not_rebuilt). This must keep holding."""
        provenance = make_provenance("CALCULATED_RESULT", "AI_GENERATED")
        self.assertIs(genuine_compute_provenance(provenance), provenance)

    def test_non_dict_input_passes_through_unchanged_not_a_new_crash(self):
        """Before this fix, a non-dict provenance was stored as-is (crashing later, if at all, inside the
        gate's own .get() call) -- this must not become a NEW construction-time crash."""
        self.assertIsNone(genuine_compute_provenance(None))
        self.assertEqual(genuine_compute_provenance("not-a-dict"), "not-a-dict")

    def test_a_locked_value_valid_for_the_original_epistemic_type_is_cleared_not_left_dangling(self):
        """Critic-caught (2026-09-18): LOCK_REQUIRES has no entry for CALCULATED_RESULT, so a caller-supplied
        `locked` that was valid for their ORIGINAL epistemic_type (LOCKED_FACT needs SOURCE_FACT) becomes
        schema-invalid the instant epistemic_type is forced to CALCULATED_RESULT -- this must not leave the
        result in that invalid, misleadingly-gate-passing state."""
        provenance = make_provenance("SOURCE_FACT", "HUMAN_APPROVED", locked="LOCKED_FACT")
        normalized = genuine_compute_provenance(provenance)
        self.assertEqual(normalized["epistemic_type"], "CALCULATED_RESULT")
        self.assertIsNone(normalized["locked"])
        record = {
            "engine": "local_python_deterministic_compute",
            "computation_provenance_ref": "ai_lego.compute.ahp.weights.geometric_mean_weights",
            "provenance": normalized,
        }
        from ai_lego.core.domain.provenance import provenance_is_valid

        self.assertTrue(provenance_is_valid(record["provenance"]))
        passed, evidence = evaluate_statistical_gate(record)
        self.assertTrue(passed, evidence)


if __name__ == "__main__":
    unittest.main()
