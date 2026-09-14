import unittest

from ai_lego.modules.art_therapy.workflow_gates import evaluate_art_therapy_project_workflow_gate


class ArtTherapyWorkflowGateTests(unittest.TestCase):
    def test_passes_only_for_the_non_diagnostic_unscreened_chain(self):
        workflow = {"nodes": [
            {"node_kind": "method", "method_id": "framing.problem_statement"},
            {"node_kind": "method", "method_id": "divergent.random_stimulus"},
            {"node_kind": "method", "method_id": "association.mind_map"},
        ]}
        context = {"steps": {"1": {"entries": [{"feasibility_status": "NOT_YET_SCREENED"}]}}, "outputs": {}}
        result = evaluate_art_therapy_project_workflow_gate(context, workflow, "test", "2026-09-14T00:00:00Z")
        self.assertEqual(result[0]["status"], "PASS")

    def test_rejects_screened_or_diagnostic_output(self):
        workflow = {"nodes": [
            {"node_kind": "method", "method_id": "framing.problem_statement"},
            {"node_kind": "method", "method_id": "divergent.random_stimulus"},
            {"node_kind": "method", "method_id": "association.mind_map"},
        ]}
        context = {"steps": {"1": {"entries": [{"feasibility_status": "FEASIBLE"}]}}, "outputs": {"diagnosis": "not allowed"}}
        result = evaluate_art_therapy_project_workflow_gate(context, workflow, "test", "2026-09-14T00:00:00Z")
        self.assertEqual(result[0]["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
