import unittest

from ai_lego.errors import InvariantViolation
from ai_lego.platform.workflow.workflow_gates import WorkflowGateRegistry


class WorkflowGateRegistryTests(unittest.TestCase):
    def test_evaluates_registered_refs_in_declaration_order(self):
        registry = WorkflowGateRegistry()
        registry.register("first", lambda _context, _workflow: [{"gate_id": "first", "status": "PASS"}])
        registry.register("second", lambda _context, _workflow: [{"gate_id": "second", "status": "PASS"}])
        result = registry.evaluate(["first", "second"], {}, {})
        self.assertEqual([gate["gate_id"] for gate in result], ["first", "second"])

    def test_missing_ref_fails_closed_before_evaluation(self):
        registry = WorkflowGateRegistry()
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_GATE_UNAVAILABLE"):
            registry.require_for(["not_registered"])

    def test_duplicate_ref_is_rejected(self):
        registry = WorkflowGateRegistry()
        registry.register("one", lambda _context, _workflow: [])
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_GATE_REF_DUPLICATE"):
            registry.require_for(["one", "one"])


if __name__ == "__main__":
    unittest.main()
