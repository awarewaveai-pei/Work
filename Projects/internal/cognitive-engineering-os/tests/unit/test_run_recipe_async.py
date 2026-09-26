"""``run_recipe`` async runs (plan §3.3 "非同步 run 旗標", §12.8 WC-P3-02): ``async:true`` returns 202 +
RUNNING immediately, the same existing status endpoint reaches a terminal state, the synchronous path is
unchanged, and a background-thread exception still leaves a readable failure in the journal."""

from __future__ import annotations

import os
import time
import uuid
from unittest.mock import patch

from ai_lego.apps.api import main as api_main
from ai_lego.apps.cli.run_life_decision_slice import fixture_source
from tests.unit.test_api_main import ApiTestCase

RUN_URL = "/recipes/life-decision-v1/run"


def _run_id() -> str:
    return "async-" + uuid.uuid4().hex[:12]


def _poll_until_terminal(client, recipe_id: str, run_id: str, *, timeout: float = 15.0, interval: float = 0.05):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = client.get(f"/recipes/{recipe_id}/runs/{run_id}")
        if last.status_code == 200 and last.json().get("status") in {"SUCCEEDED", "FAILED"}:
            return last
        time.sleep(interval)
    return last


class RunRecipeAsyncTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self._login()
        self._env = patch.dict(os.environ, {"COGNITIVE_OS_JOURNAL_KEY_MODE": "disabled"}, clear=False)
        self._env.start()

    def tearDown(self):
        self._env.stop()
        super().tearDown()

    def _post(self, **extra):
        run_id = extra.pop("run_id", None) or _run_id()
        return self.client.post(RUN_URL, json={"source": fixture_source(), "run_id": run_id, **extra}), run_id

    def test_async_true_returns_202_running_immediately(self):
        response, run_id = self._post(**{"async": True})
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json(), {"status": "RUNNING", "run_id": run_id, "journal_ref": response.json()["journal_ref"]})
        self.assertIn(run_id, response.json()["journal_ref"])

    def test_async_run_reaches_a_terminal_state_via_the_existing_status_endpoint(self):
        response, run_id = self._post(**{"async": True})
        self.assertEqual(response.status_code, 202)
        final = _poll_until_terminal(self.client, "life-decision-v1", run_id)
        self.assertIsNotNone(final)
        self.assertEqual(final.status_code, 200)
        self.assertEqual(final.json()["status"], "SUCCEEDED")

    def test_sync_path_behavior_and_return_shape_are_unchanged(self):
        response, run_id = self._post()  # no "async" key at all, same as before this card
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["run_id"], run_id)
        self.assertIn(body["status"], {"PASS", "GATE_FAILED", "FAILED"})
        self.assertEqual(set(body), {"status", "run_id", "workflow", "gates", "workflow_gates", "journal_ref", "method_resolution", "capability_resolution"})
        explicit_false, run_id_2 = self._post(**{"async": False})
        self.assertEqual(explicit_false.status_code, 200)
        self.assertEqual(explicit_false.json()["run_id"], run_id_2)

    def test_async_non_bool_is_400(self):
        response, _ = self._post(**{"async": "yes"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("WORKFLOW_ASYNC_INVALID", response.text)

    def test_background_exception_leaves_a_readable_failure_not_a_silent_hang(self):
        """execute_workflow_ir already journals its own per-step failures; this simulates the residual case --
        an exception it raises after writing RUNNING but outside that per-step handling (e.g. the workflow-gate
        runner) -- and checks the async wrapper's backstop still turns the journal FAILED and readable."""

        def _write_running_then_raise(workflow_ir, initial_context, handlers, **kwargs):
            context = dict(initial_context)
            context.setdefault("steps", {})
            context.setdefault("outputs", {})
            record = api_main._journal_record(
                workflow_ir, initial_context, "RUNNING", context, [], 0,
                kwargs.get("journal_context_projector"), kwargs.get("journal_context_protector"),
            )
            api_main._atomic_write_journal(kwargs["journal_path"], record, create_only=True)
            raise RuntimeError("boom-injected-for-test")

        # The patch must outlive the `with` block: the background thread calls execute_workflow_ir on its own
        # schedule, which can (and did, before this fix) run after a `with`-scoped patch already reverted --
        # a race that made the real executor run instead of this fake and left `final` without a status.
        patcher = patch.object(api_main, "execute_workflow_ir", side_effect=_write_running_then_raise)
        patcher.start()
        try:
            response, run_id = self._post(**{"async": True})
            self.assertEqual(response.status_code, 202)
            final = _poll_until_terminal(self.client, "life-decision-v1", run_id)
        finally:
            patcher.stop()
        self.assertIsNotNone(final)
        self.assertEqual(final.json()["status"], "FAILED")
        errors = [step.get("error", "") for step in final.json()["steps"]]
        self.assertTrue(any("boom-injected-for-test" in error for error in errors), final.json())

    def test_human_required_missing_is_422_and_writes_no_journal(self):
        source = fixture_source()
        source["decision"]["weights"] = []  # a human-only value-judgment field, emptied
        run_id = _run_id()
        response = self.client.post(RUN_URL, json={"source": source, "run_id": run_id, "async": True})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "HUMAN_REQUIRED_MISSING")
        status = self.client.get(f"/recipes/life-decision-v1/runs/{run_id}")
        self.assertEqual(status.status_code, 404, "a refused run must never claim a journal file")
