"""Project collection runs over HTTP: plan/confirm, grant exchange, completion (RESEARCH_LINES_MASTER_PLAN WC-P1-04,
§12.7 I-d/I-f/I-g/I-h). Real TestClient, real SQLite for both stores; the Collection Service is a recording fake."""

from __future__ import annotations

import os
import sqlite3
import uuid
from unittest.mock import patch

from ai_lego.apps.api import main as api_main
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import COLLECTOR_EMAIL
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

RUNS_TOKEN = "runs-token-for-tests-only"
SEEDS = [{"uri": "entity://Acme%20Ltd", "meta": {"entityKind": "organization"}}, {"uri": "https://acme.example/about"}]
REPORT = {"fetched": 4, "written": 3, "unchanged": 0, "refused": 1, "stopped_by": "frontier_empty"}


class FakeCollectionService:
    def __init__(self, fail: bool = False):
        self.calls: list[dict] = []
        self.fail = fail

    def start_run(self, grant_ref, project_id, run_id, seeds, budget):
        self.calls.append({"grant_ref": grant_ref, "project_id": project_id, "run_id": run_id, "seeds": seeds, "budget": dict(budget)})
        if self.fail:
            raise InvariantViolation("COLLECTION_SERVICE_UNAVAILABLE: HTTP 502 from app.aware-wave.com")
        return {"ok": True, "trigger_run_id": "trig_1"}


class CollectionApiTestCase(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.service = FakeCollectionService()
        api_main.app.dependency_overrides[api_main.get_collection_service] = lambda: self.service
        self.store = api_main.app.dependency_overrides[api_main.get_store]()
        self._env = patch.dict(os.environ, {"COLLECT_RESEARCH_RUNS_TOKEN": RUNS_TOKEN}, clear=False)
        self._env.start()
        self._login()
        self.project = self._create_project()

    def tearDown(self):
        self._env.stop()
        super().tearDown()

    def _collector(self) -> dict:
        return self.store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], COLLECTOR_EMAIL, "Research Collector", "x" * 24)

    def _confirm(self, project_id: str | None = None):
        return self.client.post(f"/projects/{project_id or self.project['project_id']}/collections", json={"seeds": SEEDS, "budget": {"fetches": 50}, "confirm": True})

    def _exchange(self, grant_ref: str, token: str = RUNS_TOKEN):
        return self.client.post(f"/collect-grants/{grant_ref}/exchange", headers={"Authorization": f"Bearer {token}"})

    def _run_count(self) -> int:
        conn = sqlite3.connect(self._repo.db_path)
        try:
            return conn.execute("SELECT COUNT(*) FROM collection_runs").fetchone()[0]
        finally:
            conn.close()

    def _grant_count(self) -> int:
        conn = sqlite3.connect(self.db_path)
        try:
            return conn.execute("SELECT COUNT(*) FROM collect_grant").fetchone()[0]
        finally:
            conn.close()


class CollectionRequestTests(CollectionApiTestCase):
    def test_routes_require_a_session(self):
        self.client.post("/auth/logout")
        response = self.client.post(f"/projects/{self.project['project_id']}/collections", json={"seeds": SEEDS})
        self.assertEqual(response.status_code, 401)

    def test_without_confirm_only_the_plan_comes_back_and_nothing_is_written(self):
        response = self.client.post(f"/projects/{self.project['project_id']}/collections", json={"seeds": SEEDS})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"plan": {"seeds": 2, "max_queries": 16, "max_fetches": 200}, "confirm_required": True})
        self.assertEqual((self._run_count(), self._grant_count(), len(self.service.calls)), (0, 0, 0))

    def test_confirm_without_a_collector_identity_is_a_clear_409(self):
        response = self._confirm()
        self.assertEqual(response.status_code, 409)
        self.assertIn("COLLECTOR_IDENTITY_MISSING", response.text)
        self.assertEqual(self._run_count(), 0)

    def test_confirm_hands_only_a_grant_reference_to_the_collection_service(self):
        self._collector()
        response = self._confirm()
        self.assertEqual(response.status_code, 202, response.text)
        run_id = response.json()["run_id"]
        call = self.service.calls[0]
        self.assertEqual((call["project_id"], call["run_id"], call["seeds"], call["budget"]), (self.project["project_id"], run_id, SEEDS, {"fetches": 50}))
        conn = sqlite3.connect(self.db_path)
        try:
            token_hash = conn.execute("SELECT token_hash FROM collect_grant WHERE grant_ref=?", (call["grant_ref"],)).fetchone()[0]
        finally:
            conn.close()
        self.assertIsNone(token_hash)  # no token exists until next-admin exchanges the reference
        self.assertEqual(self.client.get(f"/projects/{self.project['project_id']}/collections/{run_id}").json()["status"], "requested")

    def test_a_refusing_collection_service_fails_the_run_and_kills_its_grant(self):
        self._collector()
        self.service.fail = True
        response = self._confirm()
        self.assertEqual(response.status_code, 502)
        grant_ref = self.service.calls[0]["grant_ref"]
        self.assertEqual(self.client.get(f"/projects/{self.project['project_id']}/collections/{self.service.calls[0]['run_id']}").json()["status"], "failed")
        self.assertEqual(self._exchange(grant_ref).status_code, 410)

    def test_no_configured_service_is_503(self):
        self._collector()
        api_main.app.dependency_overrides[api_main.get_collection_service] = lambda: None
        self.assertEqual(self._confirm().status_code, 503)
        self.assertEqual(self._run_count(), 0)

    def test_seed_and_budget_shapes_are_checked(self):
        for body in ({"seeds": []}, {"seeds": [{"uri": "http://plain.example"}]}, {"seeds": SEEDS, "budget": {"fetches": 201}}, {"seeds": SEEDS, "extra": 1}):
            response = self.client.post(f"/projects/{self.project['project_id']}/collections", json=body)
            self.assertIn(response.status_code, (400, 422), body)

    def test_another_tenant_cannot_read_the_run(self):
        self._collector()
        run_id = self._confirm().json()["run_id"]
        self._login_as_a_different_tenant()
        self.assertEqual(self.client.get(f"/projects/{self.project['project_id']}/collections/{run_id}").status_code, 404)


class GrantExchangeAndCompleteTests(CollectionApiTestCase):
    def setUp(self):
        super().setUp()
        self._collector()
        self.run_id = self._confirm().json()["run_id"]
        self.grant_ref = self.service.calls[0]["grant_ref"]

    def _complete(self, token: str, body: dict, project_id: str | None = None, run_id: str | None = None):
        return self.client.post(
            f"/projects/{project_id or self.project['project_id']}/collections/{run_id or self.run_id}/complete",
            json=body,
            headers={"Authorization": f"Grant {token}"},
        )

    def test_exchange_needs_the_runs_bearer(self):
        self.assertEqual(self._exchange(self.grant_ref, "wrong").status_code, 401)
        with patch.dict(os.environ, {"COLLECT_RESEARCH_RUNS_TOKEN": ""}):
            self.assertEqual(self._exchange(self.grant_ref, "").status_code, 401)

    def test_exchange_is_one_shot_and_starts_the_run(self):
        first = self._exchange(self.grant_ref)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(set(first.json()), {"grant_token", "project_id", "run_id", "expires_at"})
        self.assertEqual(self._exchange(self.grant_ref).status_code, 409)
        self.assertEqual(self._exchange("no-such-reference").status_code, 404)
        self.assertEqual(self.client.get(f"/projects/{self.project['project_id']}/collections/{self.run_id}").json()["status"], "running")

    def test_complete_ends_the_run_and_voids_the_grant(self):
        token = self._exchange(self.grant_ref).json()["grant_token"]
        response = self._complete(token, {"status": "completed", "report": REPORT})
        self.assertEqual(response.json(), {"run_id": self.run_id, "status": "completed"})
        run = self.client.get(f"/projects/{self.project['project_id']}/collections/{self.run_id}").json()
        self.assertEqual((run["status"], run["report"]), ("completed", REPORT))
        self.assertEqual(self._complete(token, {"status": "completed", "report": REPORT}).status_code, 401)

    def test_a_grant_cannot_complete_another_project_or_run(self):
        token = self._exchange(self.grant_ref).json()["grant_token"]
        other = self._create_project(name="Other project")
        self.assertEqual(self._complete(token, {"status": "completed", "report": REPORT}, project_id=other["project_id"]).status_code, 403)
        self.assertEqual(self._complete(token, {"status": "completed", "report": REPORT}, run_id="someotherrun").status_code, 403)

    def test_a_malformed_report_still_ends_the_run_as_failed(self):
        token = self._exchange(self.grant_ref).json()["grant_token"]
        response = self._complete(token, {"status": "completed", "report": {**REPORT, "written": -1}})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get(f"/projects/{self.project['project_id']}/collections/{self.run_id}").json()["status"], "failed")

    def test_no_or_wrong_scheme_is_401(self):
        self.assertEqual(self.client.post(f"/projects/{self.project['project_id']}/collections/{self.run_id}/complete", json={"status": "failed"}).status_code, 401)
        token = self._exchange(self.grant_ref).json()["grant_token"]
        response = self.client.post(f"/projects/{self.project['project_id']}/collections/{self.run_id}/complete", json={"status": "failed"}, headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(response.status_code, 401)


class RunDeadlineTests(CollectionApiTestCase):
    """The run and its grant share one deadline; past it the run reads failed and nothing is written (no repair on read)."""

    PAST = "2000-01-01T00:00:00Z"

    def _expire(self, run_id: str) -> None:
        for db, statement in ((self._repo.db_path, "UPDATE collection_runs SET deadline_at=? WHERE run_id=?"), (self.db_path, "UPDATE collect_grant SET expires_at=? WHERE run_id=?")):
            conn = sqlite3.connect(db)
            try:
                conn.execute(statement, (self.PAST, run_id))
                conn.commit()
            finally:
                conn.close()

    def _get(self, run_id: str) -> dict:
        return self.client.get(f"/projects/{self.project['project_id']}/collections/{run_id}").json()

    def test_the_grant_expires_exactly_at_the_run_deadline(self):
        self._collector()
        run_id = self._confirm().json()["run_id"]
        conn = sqlite3.connect(self.db_path)
        try:
            grant_expiry = conn.execute("SELECT expires_at FROM collect_grant WHERE run_id=?", (run_id,)).fetchone()[0]
        finally:
            conn.close()
        self.assertEqual(grant_expiry, self._get(run_id)["deadline_at"])

    def test_a_run_nobody_finished_reads_failed_after_its_deadline_without_any_write(self):
        self._collector()
        run_id = self._confirm().json()["run_id"]
        self._expire(run_id)
        events_before = self._repo.list_events(self.tenant["tenant_id"], f"project:{self.project['project_id']}")
        self.assertEqual(self._get(run_id)["status"], "failed")
        self.assertEqual(self._repo.list_events(self.tenant["tenant_id"], f"project:{self.project['project_id']}"), events_before)
        self.assertEqual(self._exchange(self.service.calls[0]["grant_ref"]).status_code, 410)

    def test_a_crash_after_the_run_row_is_written_still_ends_in_failed(self):
        self._collector()
        with patch.object(type(self.store), "issue_collect_grant", side_effect=RuntimeError("identity db unavailable")):
            with self.assertRaises(RuntimeError):
                self._confirm()
        conn = sqlite3.connect(self._repo.db_path)
        try:
            run_id = conn.execute("SELECT run_id FROM collection_runs").fetchone()[0]
        finally:
            conn.close()
        self.assertEqual(self._get(run_id)["status"], "requested")  # open until its deadline, never forever
        self._expire(run_id)
        self.assertEqual(self._get(run_id)["status"], "failed")

