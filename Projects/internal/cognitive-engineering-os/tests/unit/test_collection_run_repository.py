"""Collection run record + repository state machine (RESEARCH_LINES_MASTER_PLAN WC-P1-03)."""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.collection_run import collection_run_record
from ai_lego.core.domain.project import project_record
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation

TENANT = "22222222-2222-4222-8222-222222222222"
PROJECT = "11111111-1111-4111-8111-111111111111"
IDENTITY = "44444444-4444-4444-8444-444444444444"
SEEDS = [{"uri": "entity://Jane%20Doe", "meta": {"entityKind": "person", "anchors": ["La Trobe"]}}]
REPORT = {"fetched": 5, "written": 3, "unchanged": 1, "refused": 1, "stopped_by": "frontier_empty"}


def _run(run_id: str = "run1", project_id: str = PROJECT) -> dict:
    return collection_run_record(run_id, project_id, TENANT, len(SEEDS), 50, IDENTITY, "2026-09-26T10:00:00Z")


class CollectionRunRepositoryTests(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.repo = ProjectSourceRepository(Path(self._dir.name) / "projects.sqlite3")
        self.repo.create_project(project_record(PROJECT, TENANT, "33333333-3333-4333-8333-333333333333", "Dossier", "Risk.", "Confidential", IDENTITY, "2026-09-26T00:00:00Z"))

    def tearDown(self):
        self._dir.cleanup()

    def _event_types(self) -> list[str]:
        return [e["event_type"] for e in self.repo.list_events(TENANT, f"project:{PROJECT}")]

    def test_requested_running_completed_in_order(self):
        self.repo.create_collection_run(_run(), SEEDS)
        self.assertEqual(self.repo.mark_collection_running(TENANT, "run1")["status"], "running")
        done = self.repo.finish_collection_run(TENANT, "run1", "completed", REPORT)
        self.assertEqual((done["status"], done["report"]), ("completed", REPORT))
        self.assertIsNotNone(done["completed_at"])
        self.assertEqual(self._event_types()[-3:], ["CollectionRequested", "CollectionStarted", "CollectionCompleted"])

    def test_a_finished_run_cannot_move_again(self):
        self.repo.create_collection_run(_run(), SEEDS)
        self.repo.finish_collection_run(TENANT, "run1", "failed", None)
        for step in (lambda: self.repo.finish_collection_run(TENANT, "run1", "completed", REPORT), lambda: self.repo.mark_collection_running(TENANT, "run1")):
            with self.assertRaisesRegex(InvariantViolation, "COLLECTION_RUN_STATE_INVALID"):
                step()

    def test_what_get_returns_matches_the_schema_and_never_carries_seeds(self):
        contracts = SchemaContracts(resolve_spec_root())
        self.repo.create_collection_run(_run(), SEEDS)
        requested = self.repo.get_collection_run(TENANT, PROJECT, "run1")
        contracts.validate("ai-lego://specs/domain/collection-run.schema.yaml", requested, "collection_run")
        self.repo.mark_collection_running(TENANT, "run1")
        contracts.validate("ai-lego://specs/domain/collection-run.schema.yaml", self.repo.finish_collection_run(TENANT, "run1", "completed", REPORT), "collection_run")
        self.assertNotIn("Jane", str(requested))
        self.assertEqual(self.repo.collection_run_seeds(TENANT, "run1"), SEEDS)

    def test_another_tenant_sees_nothing(self):
        self.repo.create_collection_run(_run(), SEEDS)
        self.assertIsNone(self.repo.get_collection_run("99999999-9999-4999-8999-999999999999", PROJECT, "run1"))
        with self.assertRaisesRegex(InvariantViolation, "COLLECTION_RUN_STATE_INVALID"):
            self.repo.mark_collection_running("99999999-9999-4999-8999-999999999999", "run1")

    def test_a_run_needs_a_real_project(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.repo.create_collection_run(_run(project_id="55555555-5555-4555-8555-555555555555"), SEEDS)

    def test_event_payloads_carry_ids_and_counts_only(self):
        self.repo.create_collection_run(_run(), SEEDS)
        self.repo.mark_collection_running(TENANT, "run1")
        self.repo.finish_collection_run(TENANT, "run1", "completed", REPORT)
        for event in self.repo.list_events(TENANT, f"project:{PROJECT}"):
            if event["event_type"].startswith("Collection"):
                self.assertLessEqual(set(event["payload"]), {"run_id", "seeds_count", "max_fetches", "status", "report"})
                self.assertNotIn("Jane", str(event["payload"]))

    def test_a_malformed_report_is_refused(self):
        self.repo.create_collection_run(_run(), SEEDS)
        with self.assertRaisesRegex(InvariantViolation, "COLLECTION_RUN_REPORT_INVALID"):
            self.repo.finish_collection_run(TENANT, "run1", "completed", {**REPORT, "written": -1})
        self.assertEqual(self.repo.get_collection_run(TENANT, PROJECT, "run1")["status"], "requested")


if __name__ == "__main__":
    unittest.main()
