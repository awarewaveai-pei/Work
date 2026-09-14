import unittest

from ai_lego.platform.workflow.gates import evaluate_workflow_completion_gate


class WorkflowCompletionGateTests(unittest.TestCase):
    def test_passes_only_when_every_declared_node_committed(self):
        workflow = {
            "nodes": [
                {"node_kind": "method", "method_id": "one"},
                {"node_kind": "capability", "ref": "two", "necessity": "REQUIRED_BY_RISK"},
            ]
        }
        context = {"steps": {"0": {"value": 1}, "1": {"value": 2}}}
        result = evaluate_workflow_completion_gate(context, workflow, "test", "2026-09-14T00:00:00Z")
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"][0]["committed_step_indexes"], [0, 1])

    def test_fails_when_a_declared_node_was_not_committed(self):
        workflow = {"nodes": [{"node_kind": "method", "method_id": "one"}, {"node_kind": "method", "method_id": "two"}]}
        result = evaluate_workflow_completion_gate({"steps": {"0": {"value": 1}}}, workflow, "test", "2026-09-14T00:00:00Z")
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["missing_step_indexes"], [1])

    def test_fails_when_a_required_capability_is_not_invoked(self):
        workflow = {"nodes": [{"node_kind": "capability", "ref": "required.capability", "necessity": "REQUIRED_BY_RISK"}]}
        result = evaluate_workflow_completion_gate({"steps": {"0": {"status": "NOT_INVOKED"}}}, workflow, "test", "2026-09-14T00:00:00Z")
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["required_capabilities_not_invoked"], ["required.capability"])


if __name__ == "__main__":
    unittest.main()
