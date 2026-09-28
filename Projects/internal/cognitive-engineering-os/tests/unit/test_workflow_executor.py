import unittest
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from tests.unit.method_testkit import shared_method_catalog
from ai_lego.platform.workflow.executor import COMPLETED_STEP_STATUSES, STEP_STATUSES, WorkflowStepResult, execute_workflow_ir
from tests.unit.thread_testkit import HANG_GUARD_S


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

    def test_catalog_gate_blocks_unregistered_method_before_handler(self):
        ir = {"id": "research-v1", "nodes": [{"node_kind": "method", "method_id": "research.unknown"}]}
        reached = []
        catalog = MethodCatalog.empty("test:no-contract")
        result = execute_workflow_ir(
            ir,
            {},
            {"research.unknown": lambda *_: reached.append("ran")},
            catalogs={"method": catalog},
        )
        self.assertEqual(result.status, "FAILED")
        self.assertIn("METHOD_RESOLUTION_BLOCKED", result.steps[0].error)
        self.assertEqual(reached, [])
        self.assertEqual(catalog.invocations, [])

    def test_gate_failure_stops_before_downstream_and_is_durable(self):
        ir = {
            "id": "gated-v1",
            "nodes": [
                {"node_kind": "method", "method_id": "one.step", "label": "one"},
                {"node_kind": "method", "method_id": "two.step", "label": "two", "input": "outputs.one"},
            ],
        }
        calls = []

        def first(_payload, _node):
            calls.append("first")
            return {"value": 1}

        def second(_payload, _node):
            calls.append("second")
            return {"value": 2}

        def first_gate(output, context, node):
            self.assertEqual(output, {"value": 1})
            self.assertEqual(context["outputs"]["one"], {"value": 1})
            self.assertEqual(node["method_id"], "one.step")
            return [{"id": "quality", "status": "FAIL", "reason": "test mutation"}]

        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "gated.json"
            result = execute_workflow_ir(
                ir,
                {},
                {"one.step": first, "two.step": second},
                gate_runners={0: first_gate},
                journal_path=journal,
            )
            self.assertEqual(result.status, "FAILED")
            self.assertEqual(calls, ["first"])
            self.assertEqual(result.steps[0].status, "FAILED")
            self.assertEqual(result.steps[0].gates[0]["status"], "FAIL")
            self.assertNotIn("one", result.context["outputs"])
            persisted = __import__("json").loads(journal.read_text(encoding="utf-8"))
            self.assertEqual(persisted["status"], "FAILED")
            self.assertEqual(persisted["steps"][0]["gates"][0]["id"], "quality")
            SchemaContracts(resolve_spec_root()).validate("ai-lego://specs/execution/workflow-journal.schema.yaml", persisted, "gated workflow journal")

    def test_workflow_gate_failure_is_durable_after_all_steps_and_resume_rechecks_it(self):
        ir = {"id": "workflow-gated-v1", "nodes": [{"node_kind": "method", "method_id": "one.step", "label": "one"}]}
        calls = []
        gate_calls = []

        def handler(_payload, _node):
            calls.append("handler")
            return {"ok": True}

        def workflow_gate(context, workflow):
            gate_calls.append((context["outputs"]["one"], workflow["id"]))
            return [{"gate_id": "workflow_quality", "status": "FAIL", "evidence": [{"reason": "test mutation"}], "validator": "test", "timestamp": "2026-09-14T00:00:00Z"}]

        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "workflow-gated.json"
            first = execute_workflow_ir(ir, {}, {"one.step": handler}, workflow_gate_runner=workflow_gate, journal_path=journal)
            self.assertEqual(first.status, "FAILED")
            self.assertEqual(calls, ["handler"])
            self.assertEqual(len(gate_calls), 1)
            self.assertEqual(first.workflow_gates[0]["status"], "FAIL")
            persisted = __import__("json").loads(journal.read_text(encoding="utf-8"))
            self.assertEqual(persisted["status"], "FAILED")
            self.assertEqual(persisted["workflow_gates"][0]["gate_id"], "workflow_quality")
            SchemaContracts(resolve_spec_root()).validate("ai-lego://specs/execution/workflow-journal.schema.yaml", persisted, "workflow-gated journal")
            resumed = execute_workflow_ir(ir, {}, {"one.step": handler}, workflow_gate_runner=workflow_gate, journal_path=journal, resume=True)
            self.assertEqual(resumed.status, "FAILED")
            self.assertEqual(calls, ["handler"])
            self.assertEqual(len(gate_calls), 2)

    def test_live_catalog_descriptor_is_recorded_for_successful_invocation(self):
        ir = {"id": "research-v1", "nodes": [{"node_kind": "method", "method_id": "research.qualitative_coding"}]}
        catalog = shared_method_catalog(resolve_spec_root())
        result = execute_workflow_ir(
            ir,
            {},
            {"research.qualitative_coding": lambda *_: {"validated": True}},
            catalogs={"method": catalog},
        )
        self.assertEqual(result.status, "SUCCEEDED")
        self.assertEqual(result.steps[0].contract["ref"], "research.qualitative_coding")
        self.assertEqual(len(catalog.invocations), 1)

    def test_invalid_input_declaration_is_rejected(self):
        ir = {"id": "bad", "nodes": [{"node_kind": "method", "method_id": "x.y", "input": {"guess": "no"}}]}
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_INPUT_DECLARATION_INVALID"):
            execute_workflow_ir(ir, {}, {})

    def test_explicit_bindings_are_resolved_and_exposed_to_adapter(self):
        ir = {
            "id": "bindings-v1",
            "nodes": [{"node_kind": "method", "method_id": "one.step", "bindings": {"question": "source.text"}}],
        }
        seen = []

        def handler(payload, _node):
            seen.append(payload)
            return {"ok": True}

        result = execute_workflow_ir(ir, {"source": {"text": "Should I study?"}}, {"one.step": handler})
        self.assertEqual(result.status, "SUCCEEDED")
        self.assertEqual(seen[0]["__bindings__"], {"question": "Should I study?"})
        self.assertEqual(result.steps[0].input_paths, ("source.text",))

    def test_missing_explicit_binding_fails_before_adapter(self):
        ir = {"id": "bindings-v1", "nodes": [{"node_kind": "method", "method_id": "one.step", "bindings": {"question": "source.missing"}}]}
        reached = []
        result = execute_workflow_ir(ir, {"source": {}}, {"one.step": lambda *_: reached.append(True)})
        self.assertEqual(result.status, "FAILED")
        self.assertIn("WORKFLOW_INPUT_NOT_FOUND", result.steps[0].error)
        self.assertEqual(reached, [])

    def test_durable_execution_persists_after_each_step_and_resume_skips_successes(self):
        ir = {
            "id": "durable-v1",
            "nodes": [
                {"node_kind": "method", "method_id": "one.step", "label": "one"},
                {"node_kind": "method", "method_id": "two.step", "label": "two", "input": "outputs.one"},
            ],
        }
        calls = []
        failed_once = {"value": False}

        def first(payload, _node):
            calls.append("first")
            return {"value": 1}

        def second(payload, _node):
            calls.append("second")
            if not failed_once["value"]:
                failed_once["value"] = True
                raise InvariantViolation("temporary failure")
            return {"value": payload["outputs.one"]["value"] + 1}

        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "run.json"
            first_result = execute_workflow_ir(ir, {}, {"one.step": first, "two.step": second}, journal_path=journal)
            self.assertEqual(first_result.status, "FAILED")
            self.assertEqual(calls, ["first", "second"])
            self.assertEqual(first_result.steps[0].status, "SUCCEEDED")
            resumed = execute_workflow_ir(ir, {}, {"one.step": first, "two.step": second}, journal_path=journal, resume=True)
            self.assertEqual(resumed.status, "SUCCEEDED")
            self.assertEqual(calls, ["first", "second", "second"])
            self.assertEqual(resumed.context["outputs"]["two"], {"value": 2})
            self.assertEqual(__import__("json").loads(journal.read_text(encoding="utf-8"))["status"], "SUCCEEDED")
            SchemaContracts(resolve_spec_root()).validate("ai-lego://specs/execution/workflow-journal.schema.yaml", __import__("json").loads(journal.read_text(encoding="utf-8")), "durable workflow journal")
            completed_again = execute_workflow_ir(ir, {}, {"one.step": first, "two.step": second}, journal_path=journal, resume=True)
            self.assertEqual(completed_again.status, "SUCCEEDED")
            self.assertEqual(calls, ["first", "second", "second"])

    def test_failed_journal_with_not_invoked_step_resumes_to_succeeded(self):
        class _Catalog:
            def is_resolvable(self, ref):
                return ref != "optional.capability"

            def invoke(self, ref, handler, payload, node):
                return None, handler(payload, node)

        ir = {
            "id": "not-invoked-resume-v1",
            "nodes": [
                {"node_kind": "capability", "ref": "optional.capability", "label": "optional", "necessity": "RECOMMENDED"},
                {"node_kind": "method", "method_id": "one.step", "label": "one"},
            ],
        }
        catalog = _Catalog()
        attempts = []

        def flaky(_payload, _node):
            attempts.append("one")
            if len(attempts) == 1:
                raise InvariantViolation("temporary failure")
            return {"value": 1}

        contracts = SchemaContracts(resolve_spec_root())
        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "run.json"
            first = execute_workflow_ir(ir, {}, {"one.step": flaky}, catalogs={"capability": catalog, "method": catalog}, journal_path=journal)
            self.assertEqual(first.status, "FAILED")
            self.assertEqual([step.status for step in first.steps], ["NOT_INVOKED", "FAILED"])
            contracts.validate("ai-lego://specs/execution/workflow-journal.schema.yaml", __import__("json").loads(journal.read_text(encoding="utf-8")), "failed journal with NOT_INVOKED step")
            resumed = execute_workflow_ir(ir, {}, {"one.step": flaky}, catalogs={"capability": catalog, "method": catalog}, journal_path=journal, resume=True)
            self.assertEqual(resumed.status, "SUCCEEDED")
            self.assertEqual([step.status for step in resumed.steps], ["NOT_INVOKED", "SUCCEEDED"])
            self.assertEqual(resumed.context["outputs"]["optional"]["status"], "NOT_INVOKED")
            self.assertEqual(attempts, ["one", "one"])
            contracts.validate("ai-lego://specs/execution/workflow-journal.schema.yaml", __import__("json").loads(journal.read_text(encoding="utf-8")), "resumed journal with NOT_INVOKED step")

    def test_step_status_constants_match_journal_schema_enum(self):
        import yaml

        schema = yaml.safe_load((resolve_spec_root() / "specs" / "execution" / "workflow-journal.schema.yaml").read_text(encoding="utf-8"))
        self.assertEqual(set(schema["$defs"]["step"]["properties"]["status"]["enum"]), set(STEP_STATUSES))
        self.assertEqual(STEP_STATUSES - COMPLETED_STEP_STATUSES, {"FAILED"})

    def test_step_result_rejects_a_status_the_journal_schema_does_not_know(self):
        for status in sorted(STEP_STATUSES):
            WorkflowStepResult(0, "one", "method", "one.step", status, ())
        with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_STEP_STATUS_INVALID"):
            WorkflowStepResult(0, "one", "method", "one.step", "SKIPPED", ())

    def test_concurrent_new_runs_atomically_claim_one_journal(self):
        ir = {"id": "atomic-claim-v1", "nodes": [{"node_kind": "method", "method_id": "one.step"}]}
        journal_barrier = threading.Barrier(2)

        def handler(_payload, _node):
            return {"ok": True}

        def synchronized_first_write(path, payload, *, create_only=False):
            if create_only:
                journal_barrier.wait(HANG_GUARD_S)
            return original_first_write(path, payload, create_only=create_only)

        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "atomic.json"
            from ai_lego.platform.workflow import executor as executor_module

            original_first_write = executor_module._atomic_write_journal
            with patch.object(executor_module, "_atomic_write_journal", side_effect=synchronized_first_write):
                with ThreadPoolExecutor(max_workers=2) as pool:
                    futures = [
                        pool.submit(execute_workflow_ir, ir, {}, {"one.step": handler}, journal_path=journal)
                        for _ in range(2)
                    ]
                    outcomes = []
                    for future in futures:
                        try:
                            outcomes.append(("SUCCEEDED", future.result(HANG_GUARD_S).status))
                        except InvariantViolation as error:
                            outcomes.append(("ERROR", str(error)))

        self.assertEqual([kind for kind, _ in outcomes].count("SUCCEEDED"), 1)
        errors = [value for kind, value in outcomes if kind == "ERROR"]
        self.assertEqual(len(errors), 1)
        self.assertIn("WORKFLOW_JOURNAL_EXISTS_REQUIRES_RESUME", errors[0])

    def test_durable_resume_refuses_changed_inputs(self):
        ir = {"id": "durable-v1", "nodes": [{"node_kind": "method", "method_id": "one.step"}]}
        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "run.json"
            execute_workflow_ir(ir, {"source": "a"}, {"one.step": lambda *_: {"ok": True}}, journal_path=journal)
            with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_JOURNAL_INPUT_MISMATCH"):
                execute_workflow_ir(ir, {"source": "b"}, {"one.step": lambda *_: {"ok": True}}, journal_path=journal, resume=True)

    def test_journal_projection_omits_raw_source_but_resume_rehydrates_it(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "projected.json"
            ir = {"id": "projection-v1", "nodes": [{"node_kind": "method", "method_id": "one.step", "label": "one", "bindings": {"value": "source.secret"}}]}
            source = {"secret": "do-not-persist-this"}
            projector = lambda context: {"steps": context["steps"], "outputs": context["outputs"]}
            result = execute_workflow_ir(
                ir,
                {"source": source},
                {"one.step": lambda payload, _node: {"echo": payload["__bindings__"]["value"]}},
                journal_path=journal,
                journal_context_projector=projector,
            )
            self.assertEqual(result.status, "SUCCEEDED")
            persisted = __import__("json").loads(journal.read_text(encoding="utf-8"))
            self.assertNotIn("source", persisted["context"])
            resumed = execute_workflow_ir(
                ir,
                {"source": source},
                {"one.step": lambda payload, _node: {"echo": payload["__bindings__"]["value"]}},
                journal_path=journal,
                resume=True,
                journal_context_projector=projector,
            )
            self.assertEqual(resumed.status, "SUCCEEDED")


if __name__ == "__main__":
    unittest.main()
