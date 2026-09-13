import unittest

from ai_lego.errors import InvariantViolation
from ai_lego.platform.workflow.executor import execute_workflow_ir


class WorkflowExecutorTests(unittest.TestCase):
    def test_executes_nodes_in_order_and_exposes_outputs(self):
        ir = {
            "id": "life-decision-v1",
            "nodes": [
                {"node_kind": "method", "method_id": "framing.problem_statement", "label": "problem", "input": "source.text"},
                {"node_kind": "method", "method_id": "decision.mcda", "label": "decision", "input": "outputs.problem.statement"},
            ],
        }
        calls = []

        def frame(payload, _node):
            calls.append("frame")
            self.assertEqual(payload, {"source.text": "Should I study?"})
            return {"statement": "Should I study?"}

        def decide(payload, _node):
            calls.append("decide")
            self.assertEqual(payload, {"outputs.problem.statement": "Should I study?"})
            return {"selected": "study"}

        result = execute_workflow_ir(
            ir,
            {"source": {"text": "Should I study?"}},
            {"framing.problem_statement": frame, "decision.mcda": decide},
        )
        self.assertEqual(result.status, "SUCCEEDED")
        self.assertEqual(calls, ["frame", "decide"])
        self.assertEqual(result.context["outputs"]["decision"], {"selected": "study"})
        self.assertEqual([step.status for step in result.steps], ["SUCCEEDED", "SUCCEEDED"])

    def test_missing_input_fails_closed_and_does_not_run_downstream_nodes(self):
        ir = {"id": "research-v1", "nodes": [{"node_kind": "capability", "ref": "literature_search", "input": "research.question"}, {"node_kind": "method", "method_id": "evidence.triangulation", "input": "steps.0"}]}
        reached = []
        result = execute_workflow_ir(ir, {}, {"literature_search": lambda *_: reached.append("bad")})
        self.assertEqual(result.status, "FAILED")
        self.assertIn("WORKFLOW_INPUT_NOT_FOUND", result.steps[0].error)
        self.assertEqual(reached, [])
        self.assertEqual(len(result.steps), 1)

    def test_unknown_handler_fails_closed(self):
        ir = {"id": "research-v1", "nodes": [{"node_kind": "method", "method_id": "research.unknown"}]}
        result = execute_workflow_ir(ir, {}, {})
        self.assertEqual(result.status, "FAILED")
        self.assertIn("WORKFLOW_HANDLER_NOT_REGISTERED", result.steps[0].error)

    def test_invalid_input_declaration_is_rejected(self):
        ir = {"id": "bad", "nodes": [{"node_kind": "method", "method_id": "x.y", "input": {"guess": "no"}}]}
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_INPUT_DECLARATION_INVALID"):
            execute_workflow_ir(ir, {}, {})


if __name__ == "__main__":
    unittest.main()
