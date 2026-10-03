"""共用紀錄's one write entry (ai_lego/data/events/record_log.py) and the owner rule (ARCH_DECIDED 1, 2, 5 on the
cognitive-sovereignty supervisor page): every record names its author, its block and its owner; erasure goes by owner;
a case is read only by the person who opened it."""

from __future__ import annotations

import re
import sqlite3
import tempfile
import unittest
import uuid
from pathlib import Path

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain.blocks import FAMILY_BLOCK
from ai_lego.data.events import record_log
from ai_lego.data.repositories.custom_workflow_repository import CustomWorkflowRepository
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

ME = str(uuid.uuid4())


def _conn() -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    record_log.migrate(connection)
    return connection


class AppendRefusesTests(unittest.TestCase):
    def _append(self, event_type="TaskNoted", payload=None, writer=None, owner=None):
        return record_log.append(_conn(), "t", "project:p", event_type, payload or {"task_id": "x"},
                                 writer=writer or record_log.user(ME, "ACT"), owner=owner or record_log.case("p"))

    def test_a_good_record_carries_author_block_owner_and_its_type_version(self):
        event = self._append()
        self.assertEqual((event["author"], event["block"], event["owner_kind"], event["owner_id"], event["schema_version"]), ("user", "ACT", "case", "p", "1.0.0"))

    def test_no_author_is_refused(self):
        with self.assertRaises(InvariantViolation):
            record_log.Writer("", "ACT")
        with self.assertRaisesRegex(InvariantViolation, "RECORD_AUTHOR_INVALID"):
            record_log.Writer("someone", "ACT")

    def test_a_user_record_names_the_signed_in_person(self):
        with self.assertRaisesRegex(InvariantViolation, "RECORD_AUTHOR_IDENTITY_REQUIRED"):
            record_log.Writer("user", "ACT")

    def test_the_ai_cannot_write_what_only_the_person_writes(self):
        with self.assertRaisesRegex(InvariantViolation, "RECORD_AUTHOR_NOT_ALLOWED"):
            self._append("InterpretationJudged", {"interpretation_id": "i", "stance": "agree", "text": ""}, writer=record_log.ai("MAP"))

    def test_a_block_that_does_not_write_this_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RECORD_BLOCK_NOT_ALLOWED"):
            self._append(writer=record_log.user(ME, "SENSE"))

    def test_an_unregistered_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RECORD_TYPE_UNREGISTERED"):
            self._append("SomethingNew")

    def test_the_wrong_owner_kind_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RECORD_OWNER_NOT_ALLOWED"):
            self._append(owner=record_log.person(ME))

    def test_a_score_anywhere_in_the_payload_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RECORD_SCORE_REFUSED"):
            self._append(payload={"task_id": "x", "numbers": [{"name": "n", "rating": 3}]})

    def test_every_registered_type_names_real_authors_blocks_and_owners(self):
        for name, kind in record_log.EVENT_TYPES.items():
            self.assertTrue(kind.authors and kind.blocks and kind.owners, name)


class OneEntryTests(unittest.TestCase):
    def test_nothing_but_record_log_writes_or_deletes_an_events_row(self):
        """The invariant behind 「收成一個入口」: a second writer would be a record with no author check."""
        # A migration may fill in an old row's owner (UPDATE events SET owner_kind=...) or drop an old row no owner can be
        # found for (DELETE FROM events WHERE owner_kind IS NULL ...); nothing else touches a row.
        pattern = re.compile(r"INSERT\s+INTO\s+events\b|DELETE\s+FROM\s+events\b(?!\s+WHERE owner_kind IS NULL)|UPDATE\s+events\s+SET\s+(?!owner_kind=)", re.IGNORECASE)
        offenders = [f"{path.relative_to(PRODUCT_ROOT)}:{number}: {line.strip()}"
                     for path in (PRODUCT_ROOT / "ai_lego").rglob("*.py") if path.name != "record_log.py"
                     for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1) if pattern.search(line)]
        self.assertEqual(offenders, [])

    def test_every_tool_family_in_the_catalog_has_a_block(self):
        catalog = api_main.get_catalog()
        families = {entry.get("family") for entry in catalog.contracts.values()}
        self.assertEqual(sorted(family for family in families if family not in FAMILY_BLOCK), [])


class LegacyFileTests(unittest.TestCase):
    """A database written before authors and owners existed opens, gets owners from what each row names, keeps no guessed author."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.path = Path(self._tmp.name) / "projects.sqlite3"
        old = sqlite3.connect(self.path)
        old.executescript(
            "CREATE TABLE events (event_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, aggregate_id TEXT NOT NULL, sequence INTEGER NOT NULL,"
            " event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, schema_version TEXT NOT NULL, correlation_id TEXT NOT NULL, causation_id TEXT,"
            " payload_json TEXT NOT NULL, UNIQUE (tenant_id, aggregate_id, sequence));"
        )
        rows = [("e1", "project:P1", "ProjectCreated", '{"project_id":"P1"}'), ("e2", "source:S1", "SourceAdded", '{"project_id":"P1","source_id":"S1"}'),
                ("e3", "project:P0", "ProjectErased", '{"project_id":"P0","erased_by_identity_id":"X"}')]
        for event_id, aggregate, kind, payload in rows:
            old.execute("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)", (event_id, "t", aggregate, 1, kind, "2026-09-01T00:00:00Z", "1.0.0", event_id, None, payload))
        old.commit()
        old.close()

    def tearDown(self):
        self._tmp.cleanup()

    def test_owners_come_from_the_row_authors_stay_unrecorded(self):
        ProjectSourceRepository(self.path)
        connection = sqlite3.connect(self.path)
        got = {row[0]: row[1:] for row in connection.execute("SELECT event_id, owner_kind, owner_id, author, block FROM events")}
        connection.close()
        self.assertEqual(got, {"e1": ("case", "P1", None, None), "e2": ("case", "P1", None, None), "e3": ("platform", "t", None, None)})

    def test_a_row_with_no_derivable_owner_stops_the_file_from_opening(self):
        connection = sqlite3.connect(self.path)
        connection.execute("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)", ("e9", "t", "mystery:1", 1, "X", "2026-09-01T00:00:00Z", "1.0.0", "e9", None, "{}"))
        connection.commit()
        connection.close()
        with self.assertRaisesRegex(InvariantViolation, "RECORD_OWNER_MISSING"):
            ProjectSourceRepository(self.path)


class OwnerScopedNameTests(unittest.TestCase):
    """critic 2026-10-03 M1: a workspace-wide unique name told a colleague my case's name existed."""

    def test_an_old_file_moves_to_names_unique_per_person_and_keeps_its_rows(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "projects.sqlite3"
            old = sqlite3.connect(path)
            old.executescript(
                "CREATE TABLE platform_projects (tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, workspace_id TEXT NOT NULL, name TEXT NOT NULL,"
                " purpose TEXT NOT NULL, data_classification TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL,"
                " created_by_identity_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, project_id), UNIQUE (tenant_id, workspace_id, name));"
                "INSERT INTO platform_projects VALUES ('t','P1','w','合作','p','Confidential','active',1,'A','2026-09-01T00:00:00Z');"
            )
            old.commit()
            old.close()
            repo = ProjectSourceRepository(path)
            row = {"tenant_id": "t", "workspace_id": "w", "name": "合作", "purpose": "p", "data_classification": "Confidential", "status": "active", "version": 1, "created_at": "2026-10-03T00:00:00Z"}
            repo.create_project({**row, "project_id": "P2", "created_by_identity_id": "B"})   # a colleague may use the same name
            with self.assertRaises(sqlite3.IntegrityError):
                repo.create_project({**row, "project_id": "P3", "created_by_identity_id": "A"})   # I may not, twice
            self.assertEqual(sorted(project["project_id"] for project in repo.list_projects("t")), ["P1", "P2"])


class CustomWorkflowOwnerTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = CustomWorkflowRepository(Path(self._tmp.name) / "wf.sqlite3")
        self.record = {"workflow_id": "W1", "tenant_id": "t", "title": "Mine", "method_ids": ["a.b"], "created_by_identity_id": ME, "created_at": "2026-10-03T00:00:00Z", "updated_at": "2026-10-03T00:00:00Z"}
        self.repo.create(self.record)

    def tearDown(self):
        self._tmp.cleanup()

    def test_only_its_maker_sees_or_changes_it(self):
        other = str(uuid.uuid4())
        self.assertIsNone(self.repo.get("t", "W1", other))
        self.assertEqual(self.repo.list("t", other), [])
        self.assertIsNone(self.repo.update("t", "W1", "x", ["a.b"], "2026-10-03T00:00:01Z", other))
        self.assertFalse(self.repo.delete("t", "W1", other))
        self.assertEqual(self.repo.get("t", "W1", ME)["title"], "Mine")

    def test_deleting_it_leaves_nothing_of_it(self):
        self.assertTrue(self.repo.delete("t", "W1", ME))
        connection = sqlite3.connect(self.repo.db_path)
        left = connection.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        connection.close()
        self.assertEqual(left, 0)


class CaseOwnerApiTests(ProjectSourceApiTestCase):
    """The same organisation is not enough: another person in it sees none of my cases."""

    def setUp(self):
        super().setUp()
        self._login()
        self.project = self._create_project()
        self.pid = self.project["project_id"]

    def _login_as_a_colleague(self) -> None:
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        response = self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(response.status_code, 200, response.text)

    def test_a_colleague_gets_the_same_404_as_for_no_case(self):
        self._login_as_a_colleague()
        for path in (f"/projects/{self.pid}", f"/projects/{self.pid}/history", f"/projects/{self.pid}/analyses", f"/projects/{self.pid}/tasks", f"/projects/{self.pid}/sources"):
            self.assertEqual(self.client.get(path).status_code, 404, path)
        self.assertEqual(self.client.get("/projects").json(), [])
        self.assertEqual(self.client.delete(f"/projects/{self.pid}").status_code, 404)

    def test_a_case_cannot_be_erased_while_a_synthesis_writes_into_it(self):
        from ai_lego.platform.workflow.run_lock import acquire_run_lock
        lock = acquire_run_lock(api_main._synthesis_lock_path(self.tenant["tenant_id"], self.pid), tag="SYN-RUNNING")
        try:
            self.assertEqual(self.client.delete(f"/projects/{self.pid}").status_code, 409)
        finally:
            lock.release()
        self.assertEqual(self.client.delete(f"/projects/{self.pid}").status_code, 200)

    def test_deleting_the_case_through_the_api_erases_its_runs(self):
        import json as _json
        connection = sqlite3.connect(self.db_path)
        try:
            me = connection.execute("SELECT identity_id FROM identity WHERE email='user@example.com'").fetchone()[0]
        finally:
            connection.close()
        journal = api_main.workflow_journal_path(self.tenant["tenant_id"], "run-" + uuid.uuid4().hex[:8], me)
        journal.parent.mkdir(parents=True, exist_ok=True)
        journal.write_text("{}", encoding="utf-8")
        case_file = api_main._run_case_path(journal)
        case_file.write_text(_json.dumps({"project_id": self.pid, "artifacts": []}), encoding="utf-8")
        self.assertEqual(self.client.delete(f"/projects/{self.pid}").status_code, 200)
        self.assertFalse(journal.exists() or case_file.exists())

    def test_my_case_records_name_me_and_the_block(self):
        self.client.post(f"/projects/{self.pid}/sources", json={"title": "Note", "media_type": "text/plain", "data_classification": "Confidential", "content": "hello"})
        history = self.client.get(f"/projects/{self.pid}/history").json()
        created = next(event for event in history if event["event_type"] == "ProjectCreated")
        self.assertEqual((created["author"], created["block"], created["owner_kind"], created["owner_id"]), ("user", "ASSEMBLER", "case", self.pid))
        repo = api_main.app.dependency_overrides[api_main.get_project_source_repository]()
        source_events = [event for source in repo.list_sources(self.tenant["tenant_id"], self.pid) for event in repo.list_events(self.tenant["tenant_id"], f"source:{source['source_id']}")]
        self.assertEqual([(event["author"], event["block"], event["owner_id"]) for event in source_events], [("user", "GATHER", self.pid)])


if __name__ == "__main__":
    unittest.main()
