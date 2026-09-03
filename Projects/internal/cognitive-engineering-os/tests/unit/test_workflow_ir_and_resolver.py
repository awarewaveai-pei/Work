import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog, state_transition
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir

TRANSITION = "ai-lego://specs/execution/execution-state-machine.schema.yaml#/state_transition_event"
RESOLUTION = "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result"
WORKFLOW_IR = "ai-lego://specs/workflow/workflow-ir.schema.yaml"


class WorkflowIrTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_research_recipe_compiles_to_the_seven_step_ir_and_validates(self):
        # The recipe's own prose says "8 steps"; its normative `steps:` block has 7
        # (transcribe, coder 1, coder 2, literature_search, run_statistics,
        # evidence.triangulation, artifact). The compiler follows the block, not
        # the prose -- see OQ-P5-6 in docs/PHASE5_RESEARCH_SLICE.md.
        ir = compile_recipe_to_workflow_ir(self.spec_root, "research-qualitative-v1", "R4")
        self.contracts.validate(WORKFLOW_IR, ir, "compiled IR")
        self.assertEqual(len(ir["nodes"]), 7)
        self.assertEqual(ir["compiled_from"], {"source_kind": "recipe", "recipe_id": "research-qualitative-v1", "recipe_version": "1.0.0"})
        method_ids = [node["method_id"] for node in ir["nodes"] if node["node_kind"] == "method"]
        capability_refs = [node["ref"] for node in ir["nodes"] if node["node_kind"] == "capability"]
        self.assertEqual(method_ids, ["research.qualitative_coding", "research.qualitative_coding", "evidence.triangulation"])
        self.assertEqual(capability_refs, ["transcribe", "literature_search", "run_statistics", "artifact.generate_research_paper"])
        self.assertEqual(ir["references"]["cognitive_method_atlas"]["required"], True)

    def test_unknown_recipe_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RECIPE_NOT_FOUND"):
            compile_recipe_to_workflow_ir(self.spec_root, "does-not-exist", "R1")


class MethodResolverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_empty_catalog_blocks_with_the_canonical_signal(self):
        result = MethodCatalog.empty("snapshot").resolve(["research.qualitative_coding"])
        self.contracts.validate(RESOLUTION, result, "blocked")
        self.assertEqual(result["candidate_methods"], [])
        self.assertEqual(result["blocked"]["status"], METHOD_RESOLUTION_BLOCKED)

    def test_live_catalog_resolves_contracted_methods_and_blocks_unknown_ones(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve(["research.qualitative_coding", "evidence.triangulation"])
        self.contracts.validate(RESOLUTION, resolved, "resolved")
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([item["method_id"] for item in resolved["candidate_methods"]], ["research.qualitative_coding", "evidence.triangulation"])
        blocked = live.resolve(["research.qualitative_coding", "research.imaginary_method"])
        self.assertEqual(blocked["blocked"]["status"], METHOD_RESOLUTION_BLOCKED)
        self.assertIn("research.imaginary_method", blocked["blocked"]["reason"])

    def test_state_transitions_validate_and_skips_are_rejected_by_the_schema(self):
        self.contracts.validate(TRANSITION, state_transition(None, "RECEIVED", "2026-08-31T00:00:00Z", "EX-T"), "entry")
        self.contracts.validate(TRANSITION, state_transition("RISK_CLASSIFIED", "BLOCKED", "2026-08-31T00:00:20Z", "EX-T", METHOD_RESOLUTION_BLOCKED), "block")
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TRANSITION, state_transition("RECEIVED", "RISK_CLASSIFIED", "2026-08-31T00:00:01Z", "EX-T"), "skip")
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TRANSITION, state_transition("CLOSED", "RECEIVED", "2026-08-31T00:00:01Z", "EX-T"), "reopen")


if __name__ == "__main__":
    unittest.main()
