import unittest
from unittest.mock import patch

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog, state_transition
from tests.unit.method_testkit import shared_method_catalog
from ai_lego.platform.workflow.executor import missing_workflow_input_paths
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir, project_workflow_ir, workflow_dataflow_issues

TRANSITION = "ai-lego://specs/execution/execution-state-machine.schema.yaml#/state_transition_event"
RESOLUTION = "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result"
WORKFLOW_IR = "ai-lego://specs/workflow/workflow-ir.schema.yaml"


class WorkflowIrTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_research_recipe_compiles_to_the_seven_step_ir_and_validates(self):
        # The recipe's normative `steps:` block has 7 nodes (transcribe, coder 1, coder 2, literature_search,
        # run_statistics, evidence.triangulation, artifact); its prose was corrected to say so on 2026-09-04
        # (OQ-P5-6). The compiler follows the block, never prose.
        ir = compile_recipe_to_workflow_ir(self.spec_root, "research-qualitative-v1", "R4")
        self.contracts.validate(WORKFLOW_IR, ir, "compiled IR")
        self.assertEqual(len(ir["nodes"]), 7)
        self.assertEqual(ir["compiled_from"], {"source_kind": "recipe", "recipe_id": "research-qualitative-v1", "recipe_version": "1.0.0"})
        method_ids = [node["method_id"] for node in ir["nodes"] if node["node_kind"] == "method"]
        capability_refs = [node["ref"] for node in ir["nodes"] if node["node_kind"] == "capability"]
        self.assertEqual(method_ids, ["research.qualitative_coding", "research.qualitative_coding", "evidence.triangulation"])
        self.assertEqual(capability_refs, ["transcribe", "literature_search", "run_statistics", "artifact.generate_research_paper"])
        self.assertEqual(ir["references"]["cognitive_method_atlas"]["required"], True)

    def test_recipe_compiler_rejects_schema_invalid_recipe_before_ir_compilation(self):
        malformed = {"id": "malformed-recipe", "status": "ACTIVE", "version": "1.0.0", "name": "Malformed"}
        with patch("ai_lego.platform.workflow.ir.load_recipe", return_value=malformed):
            with self.assertRaisesRegex(SchemaValidationError, "SCHEMA_VALIDATION_FAILED"):
                compile_recipe_to_workflow_ir(self.spec_root, "malformed-recipe", "R1")

    def test_recipe_workflow_gate_refs_are_compiled_into_ir(self):
        ir = compile_recipe_to_workflow_ir(self.spec_root, "edd-research-evidence-v1", "R1")
        self.assertEqual(ir["workflow_gate_refs"], ["workflow_execution_integrity"])

    def test_every_active_recipe_compiles_and_passes_dataflow_validation(self):
        recipe_dir = self.spec_root / "recipes" / "validated"
        recipe_ids = sorted(path.name.removesuffix(".recipe.yaml") for path in recipe_dir.glob("*.recipe.yaml"))
        self.assertGreaterEqual(len(recipe_ids), 12)
        for recipe_id in recipe_ids:
            with self.subTest(recipe_id=recipe_id):
                ir = compile_recipe_to_workflow_ir(self.spec_root, recipe_id, "R1")
                self.contracts.validate(WORKFLOW_IR, ir, f"compiled {recipe_id}")
                self.assertEqual(workflow_dataflow_issues(ir), ())

    def test_unknown_recipe_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RECIPE_NOT_FOUND"):
            compile_recipe_to_workflow_ir(self.spec_root, "does-not-exist", "R1")

    def test_capability_only_recipe_compiles_without_optional_atlas_references(self):
        ir = compile_recipe_to_workflow_ir(self.spec_root, "champion-challenger", "R1")
        self.assertNotIn("references", ir)
        self.assertEqual([node["node_kind"] for node in ir["nodes"]], ["capability"] * 4)

    def test_projection_keeps_compiled_node_identity_and_allows_only_explicit_bindings(self):
        ir = compile_recipe_to_workflow_ir(self.spec_root, "research-qualitative-v1", "R4")
        projected = project_workflow_ir(
            ir,
            [1, 4, 3, 5],
            {1: {"label": "coding", "input": "research.coding_request"}},
            workflow_id="research-qualitative-v1:runtime",
        )

        self.assertEqual([node["method_id"] if node["node_kind"] == "method" else node["ref"] for node in projected["nodes"]], ["research.qualitative_coding", "run_statistics", "literature_search", "evidence.triangulation"])
        self.assertEqual(projected["nodes"][0]["input"], "research.coding_request")
        self.assertIn("outputs.coding.coder_1.code_set", projected["nodes"][1]["input"])
        self.assertEqual(projected["projection"], {"source_node_indexes": [1, 4, 3, 5], "source_workflow_id": "research-qualitative-v1"})
        with self.assertRaisesRegex(InvariantViolation, "PROJECTION_BINDING_NOT_SELECTED"):
            project_workflow_ir(ir, [1], {4: {"label": "wrong"}})
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_IR_PROJECTION_IDENTITY_OVERRIDE"):
            project_workflow_ir(ir, [1], {1: {"method_id": "different.method"}})
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_IR_PROJECTION_BINDING_INVALID"):
            project_workflow_ir(ir, [1], {1: "not-an-object"})

    def test_projection_refuses_a_subgraph_that_drops_an_output_producer(self):
        ir = {"id": "projection-source", "nodes": [{"label": "producer"}, {"label": "consumer", "input": "outputs.producer.value"}]}
        # An omitted producer may be an intentional external boundary; a
        # producer selected after its consumer is never a valid projection.
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_PROJECTION_DATAFLOW_INVALID"):
            project_workflow_ir(ir, [1, 0])

    def test_projection_refuses_an_output_typo_instead_of_treating_it_as_external(self):
        ir = {"id": "projection-source", "nodes": [{"label": "producer"}, {"label": "consumer", "input": "outputs.typo.value"}]}
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_PROJECTION_DATAFLOW_INVALID"):
            project_workflow_ir(ir, [1])

    def test_source_preflight_checks_only_initial_source_paths(self):
        ir = compile_recipe_to_workflow_ir(self.spec_root, "life-decision-v1", "R1")
        missing = missing_workflow_input_paths(ir, {"source": {"problem": {}}})
        self.assertIn("source.problem.problem_id", missing)
        self.assertIn("source.swot.analysis_id", missing)
        self.assertIn("source.decision.options", missing)
        self.assertNotIn("outputs.SWOT_analysis", missing)

    def test_dataflow_checker_rejects_unknown_and_forward_output_references(self):
        issues = workflow_dataflow_issues(
            {
                "nodes": [
                    {"label": "consumer", "input": ["outputs.missing", "outputs.producer"]},
                    {"label": "producer", "input": "source.value"},
                ]
            }
        )
        self.assertEqual(len(issues), 2)
        self.assertIn("unknown output 'outputs.missing'", issues[0])
        self.assertIn("from node 1 that has not completed yet", issues[1])

    def test_dataflow_checker_accepts_nested_fields_from_prior_output(self):
        self.assertEqual(
            workflow_dataflow_issues(
                {
                    "nodes": [
                        {"label": "producer", "input": "source.value"},
                        {"label": "consumer", "input": "outputs.producer.result.items"},
                    ]
                }
            ),
            (),
        )

    def test_dataflow_checker_applies_the_same_rule_to_step_outputs(self):
        issues = workflow_dataflow_issues(
            {
                "nodes": [
                    {"label": "first", "input": "source.value"},
                    {"label": "second", "input": "steps.2.value"},
                    {"label": "third", "input": "steps.9.value"},
                ]
            }
        )
        self.assertTrue(any("references step 2 that has not completed yet" in issue for issue in issues))
        self.assertTrue(any("unknown step path 'steps.9.value'" in issue for issue in issues))


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
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve(["research.qualitative_coding", "evidence.triangulation"])
        self.contracts.validate(RESOLUTION, resolved, "resolved")
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([item["method_id"] for item in resolved["candidate_methods"]], ["research.qualitative_coding", "evidence.triangulation"])
        blocked = live.resolve(["research.qualitative_coding", "research.imaginary_method"])
        self.assertEqual(blocked["blocked"]["status"], METHOD_RESOLUTION_BLOCKED)
        self.assertIn("research.imaginary_method", blocked["blocked"]["reason"])

    # --- ADR-023 Consequences 5: the per-invocation gate, mirror-image of the capability side -------------------------
    def test_empty_catalog_blocks_the_invocation_and_never_reaches_the_implementation(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, "METHOD_RESOLUTION_BLOCKED.*research.qualitative_coding"):
            empty.require("research.qualitative_coding")
        reached = []
        with self.assertRaisesRegex(InvariantViolation, "METHOD_RESOLUTION_BLOCKED"):
            empty.invoke("research.qualitative_coding", lambda: reached.append("ran"))
        self.assertEqual(reached, [], "a blocked invocation must not execute the implementation at all")
        self.assertEqual(empty.invocations, [], "a blocked invocation must not be logged as an invocation")

    def test_the_abstract_base_catalog_refuses_to_scan_instead_of_globbing_nothing(self):
        from ai_lego.platform.ai_execution.contract_catalog import ContractCatalog

        with self.assertRaisesRegex(InvariantViolation, "CONTRACT_CATALOG_ABSTRACT: ContractCatalog"):
            ContractCatalog.from_spec_root(self.spec_root)
        with self.assertRaisesRegex(InvariantViolation, ": no ACTIVE contract in catalog"):
            ContractCatalog.empty("abstract").require("anything")

    def test_live_catalog_invoke_calls_through_with_the_contract_descriptor_and_logs_only_what_ran(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, value = live.invoke("research.qualitative_coding", lambda a, b: a * b, 6, 7)
        self.assertEqual(value, 42)
        self.assertEqual(descriptor["ref"], "research.qualitative_coding")
        self.assertEqual(descriptor["path"], "methods/contracts/research.qualitative_coding.contract.yaml")
        self.assertRegex(descriptor["content_sha256"], r"^[0-9a-f]{64}$")
        with self.assertRaises(InvariantViolation):
            live.invoke("research.imaginary_method", lambda: "never")
        self.assertEqual([entry["ref"] for entry in live.invocations], ["research.qualitative_coding"])
        self.assertRegex(live.label, r"^live:methods/contracts@[0-9a-f]{12}$")
        self.assertNotIn(str(self.spec_root), live.label)

    def test_state_transitions_validate_and_skips_are_rejected_by_the_schema(self):
        self.contracts.validate(TRANSITION, state_transition(None, "RECEIVED", "2026-08-31T00:00:00Z", "EX-T"), "entry")
        self.contracts.validate(TRANSITION, state_transition("RISK_CLASSIFIED", "BLOCKED", "2026-08-31T00:00:20Z", "EX-T", METHOD_RESOLUTION_BLOCKED), "block")
        # The capability-side block fires one primary state later (ADR-023 Decision 3); the schema accepts it as a side-state transition.
        self.contracts.validate(TRANSITION, state_transition("METHODS_RESOLVED", "BLOCKED", "2026-08-31T00:00:21Z", "EX-T", "CAPABILITY_RESOLUTION_BLOCKED"), "capability block")
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TRANSITION, state_transition("RECEIVED", "RISK_CLASSIFIED", "2026-08-31T00:00:01Z", "EX-T"), "skip")
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TRANSITION, state_transition("CLOSED", "RECEIVED", "2026-08-31T00:00:01Z", "EX-T"), "reopen")


if __name__ == "__main__":
    unittest.main()
