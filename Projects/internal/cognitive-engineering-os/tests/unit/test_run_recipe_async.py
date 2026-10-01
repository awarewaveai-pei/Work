"""``run_recipe`` async runs (plan §3.3 "非同步 run 旗標", §12.8 WC-P3-02): ``async:true`` returns 202 +
RUNNING immediately, the same existing status endpoint reaches a terminal state, the synchronous path is
unchanged, and a background-thread exception still leaves a readable failure in the journal."""

from __future__ import annotations

import os
import tempfile
import threading
import time
import uuid
from pathlib import Path
from unittest.mock import patch

from ai_lego.apps.api import main as api_main
from ai_lego.apps.cli.run_life_decision_slice import fixture_source
from ai_lego.errors import InvariantViolation
from tests.unit.test_api_main import ApiTestCase
from tests.unit.thread_testkit import HANG_GUARD_S
from ai_lego.core.support import read_json, write_json
from ai_lego.platform.workflow.run_lock import acquire_run_lock, lock_path_for, run_lock_state

RUN_URL = "/recipes/life-decision-v1/run"


def _run_id() -> str:
    return "async-" + uuid.uuid4().hex[:12]


def _poll_until_terminal(client, recipe_id: str, run_id: str, *, timeout: float = HANG_GUARD_S, interval: float = 0.05):
    # deadlock guard only, never a speed bound (thread_testkit docstring): a loaded Windows run took >15 s here
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
        self.assertEqual(final.json()["status"], "SUCCEEDED", final.json())

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
        # a finished sync run releases its run_id: a resubmit hears "exists, resume", never "in flight"
        again, _ = self._post(run_id=run_id)
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.json()["detail"]["code"], "WORKFLOW_RUN_EXISTS_REQUIRES_RESUME")

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
        self.assertEqual(final.json()["status"], "FAILED", final.json())
        errors = [step.get("error", "") for step in final.json()["steps"]]
        self.assertTrue(any("boom-injected-for-test" in error for error in errors), final.json())

    def test_status_is_running_not_404_before_the_journal_exists_and_a_duplicate_is_409(self):
        # Codex oracle 2026-09-27: 202 was returned while an immediate GET still said 404.
        release = threading.Event()

        def _block_then_raise(workflow_ir, initial_context, handlers, **kwargs):
            release.wait(10)
            raise RuntimeError("released-for-test")

        patcher = patch.object(api_main, "execute_workflow_ir", side_effect=_block_then_raise)
        patcher.start()
        try:
            response, run_id = self._post(**{"async": True})
            self.assertEqual(response.status_code, 202)
            status = self.client.get(f"/recipes/life-decision-v1/runs/{run_id}")
            self.assertEqual(status.status_code, 200, status.text)
            self.assertEqual(status.json()["status"], "RUNNING")
            second, _ = self._post(**{"async": True, "run_id": run_id})
            self.assertEqual(second.status_code, 409)
            self.assertEqual(second.json()["detail"]["code"], "WORKFLOW_RUN_IN_FLIGHT")
            # Codex oracle 2026-09-28: the same run_id on the SYNC path must not start a second execution either.
            third, _ = self._post(run_id=run_id)
            self.assertEqual(third.status_code, 409)
            self.assertEqual(third.json()["detail"]["code"], "WORKFLOW_RUN_IN_FLIGHT")
            release.set()
            final = _poll_until_terminal(self.client, "life-decision-v1", run_id)
        finally:
            release.set()
            patcher.stop()
        self.assertEqual(final.json()["status"], "FAILED", final.json())

    def test_resubmitting_a_finished_run_id_is_409_and_leaves_its_journal_untouched(self):
        response, run_id = self._post(**{"async": True})
        self.assertEqual(response.status_code, 202)
        final = _poll_until_terminal(self.client, "life-decision-v1", run_id)
        self.assertEqual(final.json()["status"], "SUCCEEDED", final.json())
        again, _ = self._post(**{"async": True, "run_id": run_id})
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.json()["detail"]["code"], "WORKFLOW_RUN_EXISTS_REQUIRES_RESUME")
        after = self.client.get(f"/recipes/life-decision-v1/runs/{run_id}")
        self.assertEqual(after.json(), final.json(), "a refused resubmission must not touch the finished journal")

    def test_forced_failure_never_leaks_the_host_journal_path_into_the_error_text(self):
        """critic C1 remainder: ``_fail_recipe_journal`` must not let a host filesystem path (the same one
        ``workflow_journal_path``'s docstring already says stays API-internal) survive into the journal's
        own error text just because the raising exception happened to mention it."""
        run_id = _run_id()
        journal_path = api_main.workflow_journal_path(self.tenant["tenant_id"], run_id)

        def _raise_with_path(workflow_ir, initial_context, handlers, **kwargs):
            raise RuntimeError(f"boom while touching {journal_path}")

        with patch.object(api_main, "execute_workflow_ir", side_effect=_raise_with_path):
            response, _ = self._post(**{"async": True, "run_id": run_id})
            self.assertEqual(response.status_code, 202)
            final = _poll_until_terminal(self.client, "life-decision-v1", run_id)
        self.assertIsNotNone(final)
        self.assertEqual(final.json()["status"], "FAILED", final.json())
        errors = [step.get("error", "") for step in final.json()["steps"]]
        self.assertTrue(any("boom while touching" in error for error in errors), final.json())
        self.assertFalse(any(str(journal_path) in error for error in errors), final.json())

    def test_background_thread_never_rewrites_a_journal_that_belongs_to_another_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "run.json"
            path.write_text('{"status": "SUCCEEDED", "steps": []}', encoding="utf-8")
            before = path.read_bytes()
            lease = acquire_run_lock(Path(tmp) / "r.lock")
            with patch.object(api_main, "execute_workflow_ir", side_effect=InvariantViolation("WORKFLOW_JOURNAL_EXISTS_REQUIRES_RESUME: run.json")):
                api_main._run_recipe_async(lease=lease, workflow_ir={}, initial_context={}, handlers={}, catalogs={}, gate_runners={}, workflow_gate_runner=None, journal_path=path, resume=False, journal_context_projector=None, journal_context_protector=None)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(run_lock_state(lease.path), "free", "the background runner releases its run lock whatever happened")

    def test_resume_true_with_no_existing_journal_is_404_not_a_fabricated_run(self):
        """Before this fix: resume:true on a run_id with no journal file fell through to the 202 path,
        then the background thread's first executor call raised (nothing to resume) and
        ``_fail_recipe_journal`` fabricated a FAILED journal for a run that never really started."""
        run_id = _run_id()
        response, _ = self._post(**{"async": True, "resume": True, "run_id": run_id})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], {"code": "WORKFLOW_RUN_NOT_FOUND", "run_id": run_id})
        status = self.client.get(f"/recipes/life-decision-v1/runs/{run_id}")
        self.assertEqual(status.status_code, 404, "a refused resume must never fabricate a journal")

    def test_human_required_missing_is_422_and_writes_no_journal(self):
        source = fixture_source()
        source["decision"]["weights"] = []  # a human-only value-judgment field, emptied
        run_id = _run_id()
        response = self.client.post(RUN_URL, json={"source": source, "run_id": run_id, "async": True})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "HUMAN_REQUIRED_MISSING")
        status = self.client.get(f"/recipes/life-decision-v1/runs/{run_id}")
        self.assertEqual(status.status_code, 404, "a refused run must never claim a journal file")


class RunLockAcrossProcessesTests(ApiTestCase):
    """The run lock is an OS lock on a file next to the journal, so a runner in ANOTHER worker process is simulated
    by locking it from a second handle -- nothing in this process's memory knows about it (Codex r3, critic
    2026-09-28). test_run_lock.py proves the same with a real second process that is killed."""

    def setUp(self):
        super().setUp()
        self._login()
        self._env = patch.dict(os.environ, {"COGNITIVE_OS_JOURNAL_KEY_MODE": "disabled"}, clear=False)
        self._env.start()

    def tearDown(self):
        self._env.stop()
        super().tearDown()

    _post = RunRecipeAsyncTests._post

    def _journal(self, run_id: str) -> Path:
        return api_main.workflow_journal_path(self.tenant["tenant_id"], run_id)

    def _status(self, run_id: str):
        return self.client.get(f"/recipes/life-decision-v1/runs/{run_id}")

    def test_a_run_held_by_another_worker_is_409_on_both_paths_and_status_says_running(self):
        run_id = _run_id()
        other_worker = acquire_run_lock(lock_path_for(self._journal(run_id)), tag="life-decision-v1")
        try:
            for extra in ({"async": True}, {}):
                response, _ = self._post(run_id=run_id, **extra)
                self.assertEqual(response.status_code, 409, extra)
                self.assertEqual(response.json()["detail"]["code"], "WORKFLOW_RUN_IN_FLIGHT")
            status = self._status(run_id)
            self.assertEqual((status.status_code, status.json()["status"], status.json()["runner"]), (200, "RUNNING", "alive"))
        finally:
            other_worker.release()
        response, _ = self._post(run_id=run_id)
        self.assertEqual(response.status_code, 200, "a released run_id is free again")

    def test_an_accepted_run_whose_worker_died_before_its_journal_is_lost_not_missing(self):
        run_id = _run_id()
        acquire_run_lock(lock_path_for(self._journal(run_id)), tag="life-decision-v1").release()  # accepted, then the worker died
        status = self._status(run_id)
        self.assertEqual((status.status_code, status.json()["status"], status.json()["runner"], status.json()["journal_written"]), (200, "LOST", "lost", False))
        never = self._status(_run_id())
        self.assertEqual(never.status_code, 404, "a run_id never accepted is still just not found")
        response, _ = self._post(run_id=run_id)
        self.assertEqual(response.status_code, 200, "a lost run_id can be submitted again")

    def test_a_refused_sync_resume_leaves_no_trace(self):
        # critic 2026-09-28 r2: the sync path took the lock (creating its file) before the executor refused, so the
        # never-run id read back as LOST forever. Every refusal now happens before the lock.
        run_id = _run_id()
        response, _ = self._post(run_id=run_id, **{"resume": True})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], {"code": "WORKFLOW_RUN_NOT_FOUND", "run_id": run_id})
        self.assertEqual(run_lock_state(lock_path_for(self._journal(run_id))), "absent")
        self.assertEqual(self._status(run_id).status_code, 404)

    def test_a_lost_run_is_only_visible_under_its_own_recipe(self):
        run_id = _run_id()
        acquire_run_lock(lock_path_for(self._journal(run_id)), tag="life-decision-v1").release()
        self.assertEqual(self._status(run_id).json()["status"], "LOST")
        other = self.client.get(f"/recipes/some-other-recipe/runs/{run_id}")
        self.assertEqual(other.status_code, 404)

    def _crashed_mid_run(self) -> tuple[str, Path]:
        """A real finished run, rewound to 'step 1 done, RUNNING' with its lock free: what a worker killed after its
        first checkpoint leaves on disk. Step 0 carries a probe the executor never writes, so a resume that re-ran
        step 0 instead of restoring it loses the probe."""
        response, run_id = self._post()
        self.assertEqual(response.status_code, 200)
        journal = self._journal(run_id)
        record = read_json(journal)
        self.assertEqual(record["status"], "SUCCEEDED", record)
        self.assertGreater(len(record["steps"]), 1)
        first = dict(record["steps"][0])
        first["output"] = {**(first.get("output") or {}), "resume_probe": "restored-not-rerun"}
        record.update({"status": "RUNNING", "next_index": 1, "steps": [first]})
        write_json(journal, record)
        return run_id, journal

    def test_a_running_journal_whose_runner_died_reports_lost_and_resume_continues_from_the_next_step(self):
        run_id, journal = self._crashed_mid_run()
        status = self._status(run_id)
        self.assertEqual((status.json()["status"], status.json()["runner"], len(status.json()["steps"])), ("RUNNING", "lost", 1))
        response, _ = self._post(run_id=run_id, **{"async": True, "resume": True})
        self.assertEqual(response.status_code, 202, response.text)
        final = _poll_until_terminal(self.client, "life-decision-v1", run_id)
        self.assertEqual(final.json()["status"], "SUCCEEDED", final.json())
        self.assertNotIn("runner", final.json())
        self.assertGreater(len(final.json()["steps"]), 1, "ran to the end")
        record = read_json(journal)
        self.assertEqual(record["steps"][0]["output"].get("resume_probe"), "restored-not-rerun", "step 0 was restored, not executed again")
        self.assertEqual(run_lock_state(lock_path_for(journal)), "free", "the recovering runner released its lock")

    def test_a_running_journal_with_a_live_runner_is_never_taken_over(self):
        run_id, journal = self._crashed_mid_run()
        live_worker = acquire_run_lock(lock_path_for(journal))
        try:
            before = journal.read_bytes()
            response, _ = self._post(run_id=run_id, **{"resume": True})
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json()["detail"]["code"], "WORKFLOW_RUN_IN_FLIGHT")
            self.assertEqual(journal.read_bytes(), before, "a live runner's journal is not touched")
            self.assertEqual(self._status(run_id).json()["runner"], "alive")
        finally:
            live_worker.release()
