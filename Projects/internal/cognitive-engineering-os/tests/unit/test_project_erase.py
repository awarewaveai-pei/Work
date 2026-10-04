"""DELETE /projects/{id} -- project-level erasure (RESEARCH_LINES_MASTER_PLAN WC-P1-06, D10, K7; the negative checks of
the §5 P1 DoD): nothing of the Project reads back except one ProjectErased tombstone; content shared with another Project
of the tenant survives."""

from __future__ import annotations

from ai_lego.apps.api import main as api_main
from ai_lego.errors import InvariantViolation
from tests.unit.test_api_collections import CollectionApiTestCase
from tests.pg import dump
from tests.unit.test_api_ingest import c1

NOTE = {"title": "Interview notes", "media_type": "text/plain", "data_classification": "Confidential", "content": "Jane Doe said the gallery paid late."}


class ProjectEraseTests(CollectionApiTestCase):
    FRESH_TABLES = True   # a test reads the whole database for what must be gone

    def setUp(self):
        super().setUp()
        self.pid = self.project["project_id"]
        self.tid = self.tenant["tenant_id"]
        self.note = self.client.post(f"/projects/{self.pid}/sources", json=NOTE).json()
        self._collector()
        self.run_id = self._confirm().json()["run_id"]
        self.token = self._exchange(self.service.calls[0]["grant_ref"]).json()["grant_token"]
        self.client.post(f"/projects/{self.pid}/sources/ingest", json={"run_id": self.run_id, "sources": [c1("https://acme.example/a", "alpha")]}, headers={"Authorization": f"Grant {self.token}"})
        artifacts = api_main.app.dependency_overrides[api_main.get_artifact_store]()
        self.artifact_ref = artifacts.put(self.tid, "method_interpretation", {"record": {"who": "Jane Doe"}})
        self._repo.save_interpretation(self.tid, self.pid, "INTERP-ERASE1", self.artifact_ref, "2026-09-26T00:00:00Z", block="MAP")
        self.note_cas = self._repo.get_source_content_reference(self.tid, self.pid, self.note["source_id"])

    def _erase(self, project_id: str | None = None):
        return self.client.delete(f"/projects/{project_id or self.pid}")

    def test_nothing_of_the_project_reads_back(self):
        response = self._erase()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["erased"]["sources"], 2)
        self.assertEqual(self.client.get(f"/projects/{self.pid}").status_code, 404)
        self.assertEqual(self._repo.list_sources(self.tid, self.pid), [])
        with self.assertRaises(InvariantViolation):
            self._source_cas.read(self.tid, self.note_cas)
        with self.assertRaises(InvariantViolation):
            api_main.app.dependency_overrides[api_main.get_artifact_store]().read(self.tid, self.artifact_ref)
        self.assertIsNone(self._repo.get_collection_run(self.tid, self.pid, self.run_id))

    def test_only_the_tombstone_is_left_in_the_event_log(self):
        self._erase()
        events = self._repo.list_events(self.tid, f"project:{self.pid}")
        self.assertEqual([e["event_type"] for e in events], ["ProjectErased"])
        self.assertNotIn("Jane", str(events[0]["payload"]))
        self.assertEqual(self._repo.list_events(self.tid, f"source:{self.note['source_id']}"), [])

    def test_nothing_personal_is_left_in_any_row_of_the_database(self):
        """Every row of every table. SQLite's secure_delete also kept this for the file's free pages; PostgreSQL keeps a
        deleted row's bytes until a vacuum reuses the space (docs/platform/STORAGE_SWITCH.md "Erasure and the bytes on
        disk", an open decision): that half does not carry over."""
        self._erase()
        everything = "\n".join(dump(self.databases))
        for personal in ("Jane Doe", "acme.example", "Interview notes"):
            self.assertNotIn(personal, everything)

    def test_content_shared_with_another_project_survives(self):
        other = self._create_project(name="Other project")
        self.client.post(f"/projects/{other['project_id']}/sources", json=NOTE)
        self._erase()
        other_ref = self._repo.get_source_content_reference(self.tid, other["project_id"], self._repo.list_sources(self.tid, other["project_id"])[0]["source_id"])
        self.assertEqual(self._source_cas.read(self.tid, other_ref).decode("utf-8"), NOTE["content"])

    def test_the_run_grant_dies_with_the_project(self):
        self._erase()
        response = self.client.post(f"/projects/{self.pid}/sources/ingest", json={"run_id": self.run_id, "sources": [c1("https://acme.example/b", "beta")]}, headers={"Authorization": f"Grant {self.token}"})
        self.assertEqual(response.status_code, 401)

    def test_another_tenant_cannot_erase_it(self):
        self._login_as_a_different_tenant()
        self.assertEqual(self._erase().status_code, 404)
        self.assertEqual(len(self._repo.list_sources(self.tid, self.pid)), 2)

    def test_a_second_erase_is_404(self):
        self._erase()
        self.assertEqual(self._erase().status_code, 404)

    def test_a_blob_already_gone_does_not_stop_the_erase(self):
        self._source_cas.unlink(self.tid, self.note_cas)
        self.assertEqual(self._erase().status_code, 200)
        self.assertEqual(self._repo.list_sources(self.tid, self.pid), [])
