"""POST /projects/{id}/sources/ingest (RESEARCH_LINES_MASTER_PLAN WC-P1-05, §3.4 C1/C2, I-e): grant-bound, hash
re-verified, idempotent, supersede, one write transaction; content follows the repository's blob lifecycle rule."""

from __future__ import annotations

import hashlib
import sqlite3
from unittest.mock import patch

from ai_lego.core.domain.source import COLLECTED_PROVENANCE
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from tests.unit.test_api_collections import CollectionApiTestCase


def c1(url: str, text: str, **overrides) -> dict:
    item = {
        "canonical_url": url,
        "source_uri": url + "?utm=x",
        "content_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "mime": "text/html",
        "content_type": "web_page",
        "title": "Page " + url[-1],
        "author": "Jane Doe",
        "published_at": "2026-01-02",
        "fetched_at": "2026-09-26T01:02:03.456Z",
        "text": text,
        "provenance": dict(COLLECTED_PROVENANCE),
        "collector": "collect/http-html",
        "source_class": "reference",
        "relevance": {"entityConfidence": 0.9},
        "schema_version": "1",
    }
    item.update(overrides)
    return item


class IngestApiTests(CollectionApiTestCase):
    def setUp(self):
        super().setUp()
        self.collector = self._collector()
        self.run_id = self._confirm().json()["run_id"]
        self.grant_ref = self.service.calls[0]["grant_ref"]
        self.token = self._exchange(self.grant_ref).json()["grant_token"]
        self.pid = self.project["project_id"]

    def _ingest(self, sources: list[dict], token: str | None = None, project_id: str | None = None, run_id: str | None = None):
        return self.client.post(
            f"/projects/{project_id or self.pid}/sources/ingest",
            json={"run_id": run_id or self.run_id, "sources": sources},
            headers={"Authorization": f"Grant {token or self.token}"},
        )

    def _rows(self, project_id: str | None = None) -> list[dict]:
        return self._repo.list_sources(self.tenant["tenant_id"], project_id or self.pid)

    def _blobs(self) -> int:
        return len(self._source_cas.list_objects(self.tenant["tenant_id"]))

    def test_created_then_resent_is_all_unchanged(self):
        batch = [c1("https://acme.example/a", "alpha"), c1("https://acme.example/b", "beta")]
        first = self._ingest(batch)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual([r["outcome"] for r in first.json()["results"]], ["created", "created"])
        again = self._ingest(batch)
        self.assertEqual([r["outcome"] for r in again.json()["results"]], ["unchanged", "unchanged"])
        self.assertEqual(len(self._rows()), 2)

    def test_changed_text_supersedes_the_old_version(self):
        created = self._ingest([c1("https://acme.example/a", "alpha")]).json()["results"][0]["source_id"]
        result = self._ingest([c1("https://acme.example/a", "alpha v2")]).json()["results"][0]
        self.assertEqual(result["outcome"], "superseded")
        rows = {row["source_id"]: row for row in self._rows()}
        self.assertEqual(rows[created]["status"], "superseded")
        self.assertEqual((rows[result["source_id"]]["status"], rows[result["source_id"]]["supersedes_source_id"]), ("active", created))
        events = self._repo.list_events(self.tenant["tenant_id"], f"source:{created}")
        self.assertEqual(events[-1]["event_type"], "SourceSuperseded")

    def test_a_bad_hash_refuses_the_whole_batch_before_any_write(self):
        response = self._ingest([c1("https://acme.example/a", "alpha"), c1("https://acme.example/b", "beta", content_sha256="0" * 64)])
        self.assertEqual(response.status_code, 400)
        self.assertIn("SOURCE_HASH_MISMATCH", response.text)
        self.assertEqual((len(self._rows()), self._blobs()), (0, 0))

    def test_missing_wrong_or_expired_grant_is_401(self):
        no_header = self.client.post(f"/projects/{self.pid}/sources/ingest", json={"run_id": self.run_id, "sources": [c1("https://acme.example/a", "alpha")]})
        self.assertEqual(no_header.status_code, 401)
        self.assertEqual(self._ingest([c1("https://acme.example/a", "alpha")], token="not-a-token").status_code, 401)
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("UPDATE collect_grant SET expires_at='2000-01-01T00:00:00Z' WHERE grant_ref=?", (self.grant_ref,))
            conn.commit()
        finally:
            conn.close()
        self.assertEqual(self._ingest([c1("https://acme.example/a", "alpha")]).status_code, 401)
        self.assertEqual(len(self._rows()), 0)

    def test_a_grant_never_writes_into_another_project(self):
        other = self._create_project(name="Other project")
        response = self._ingest([c1("https://acme.example/a", "alpha")], project_id=other["project_id"])
        self.assertEqual(response.status_code, 403)
        self.assertEqual(len(self._rows(other["project_id"])), 0)

    def test_after_completion_the_grant_is_dead(self):
        self.client.post(
            f"/projects/{self.pid}/collections/{self.run_id}/complete",
            json={"status": "completed", "report": {"fetched": 0, "written": 0, "unchanged": 0, "refused": 0, "stopped_by": "frontier_empty"}},
            headers={"Authorization": f"Grant {self.token}"},
        )
        self.assertEqual(self._ingest([c1("https://acme.example/a", "alpha")]).status_code, 401)

    def test_rows_carry_the_collector_identity_the_project_classification_and_the_provenance(self):
        self._ingest([c1("https://acme.example/a", "alpha")])
        row = self._rows()[0]
        self.assertEqual(row["created_by_identity_id"], self.collector["identity_id"])
        self.assertEqual((row["data_classification"], row["media_type"]), ("Confidential", "text/plain"))
        self.assertEqual((row["canonical_url"], row["source_class"], row["authors"]), ("https://acme.example/a", "reference", ["Jane Doe"]))
        self.assertEqual(row["provenance"], COLLECTED_PROVENANCE)
        self.assertEqual(row["fetched_at"], "2026-09-26T01:02:03.456Z")

    def test_provenance_other_than_collected_evidence_is_refused(self):
        bad = c1("https://acme.example/a", "alpha", provenance={"epistemic_type": "SOURCE_FACT", "authorship_state": "SOURCE_QUOTATION", "locked": None})
        self.assertEqual(self._ingest([bad]).status_code, 400)
        self.assertEqual(len(self._rows()), 0)

    def test_a_run_that_is_not_running_takes_no_sources(self):
        conn = sqlite3.connect(self._repo.db_path)
        try:
            conn.execute("UPDATE collection_runs SET status='failed' WHERE run_id=?", (self.run_id,))
            conn.commit()
        finally:
            conn.close()
        response = self._ingest([c1("https://acme.example/a", "alpha")])
        self.assertEqual(response.status_code, 409)
        self.assertIn("COLLECTION_RUN_NOT_RUNNING", response.text)

    def test_the_last_copy_of_a_url_in_one_batch_wins(self):
        results = self._ingest([c1("https://acme.example/a", "first"), c1("https://acme.example/a", "second")]).json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(self._rows()[0]["content_sha256"], hashlib.sha256(b"second").hexdigest())

    # Blob lifecycle (project_source_repository.py module docstring): rows first, content under the write lock, then
    # commit; garbage is removed only by collect_unreferenced_blobs. The three tests below pin each half of that rule.

    def test_a_batch_the_database_refuses_writes_no_content(self):
        self._ingest([c1("https://acme.example/kept", "kept")])
        before = (len(self._rows()), self._blobs())
        real_insert = ProjectSourceRepository._insert_source

        def refuse_the_new_url(connection, record, cas_path, writer):
            if record["canonical_url"].endswith("/new"):
                raise InvariantViolation("SOURCE_STORAGE_REFERENCE_INVALID")
            return real_insert(connection, record, cas_path, writer)

        with patch.object(ProjectSourceRepository, "_insert_source", staticmethod(refuse_the_new_url)):
            response = self._ingest([c1("https://acme.example/b", "beta"), c1("https://acme.example/new", "brand new text")])
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual((len(self._rows()), self._blobs()), before)  # beta's row rolled back; no content written

    def test_a_failed_content_write_leaves_only_garbage_that_the_collector_removes(self):
        self._ingest([c1("https://acme.example/kept", "kept")])
        rows_before, blobs_before = len(self._rows()), self._blobs()
        real_put = self._source_cas.put
        calls: list[bytes] = []

        def fail_the_second_put(tenant_id, content):
            calls.append(content)
            if len(calls) == 2:
                raise OSError("disk full")
            return real_put(tenant_id, content)

        with patch.object(self._source_cas, "put", side_effect=fail_the_second_put), self.assertRaises(OSError):
            self._ingest([c1("https://acme.example/b", "beta"), c1("https://acme.example/c", "gamma")])
        self.assertEqual(len(self._rows()), rows_before)
        self.assertEqual(self._blobs(), blobs_before + 1)  # beta's content: no committed row points at it
        self.assertEqual(self._repo.collect_unreferenced_blobs(self.tenant["tenant_id"], self._source_cas), 1)
        self.assertEqual(self._blobs(), blobs_before)  # the referenced "kept" blob stayed

    def test_the_collector_cannot_run_between_a_content_write_and_its_commit(self):
        """Codex F2: a collection between the blob write and the rows' commit would delete a live blob. The write lock
        makes the collector wait instead (timeout 0 here, so waiting shows up as 'database is locked')."""
        real_put, real_connect = self._source_cas.put, sqlite3.connect
        outcome: list[object] = []

        def put_then_collect(tenant_id, content):
            written = real_put(tenant_id, content)
            with patch("sqlite3.connect", lambda path, **_: real_connect(path, timeout=0)):
                try:
                    outcome.append(self._repo.collect_unreferenced_blobs(tenant_id, self._source_cas))
                except sqlite3.OperationalError as error:
                    outcome.append(str(error))
            return written

        with patch.object(self._source_cas, "put", side_effect=put_then_collect):
            response = self._ingest([c1("https://acme.example/a", "alpha")])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(outcome, ["database is locked"])
        source_id = response.json()["results"][0]["source_id"]
        cas_path = self._repo.get_source_content_reference(self.tenant["tenant_id"], self.pid, source_id)
        self.assertEqual(self._source_cas.read(self.tenant["tenant_id"], cas_path), b"alpha")
