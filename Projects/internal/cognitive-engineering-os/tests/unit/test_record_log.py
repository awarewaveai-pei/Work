"""共用紀錄's one write entry (ai_lego/data/events/record_log.py) and the owner rule (ARCH_DECIDED 1, 2, 5 on the
cognitive-sovereignty supervisor page): every record names its author, its block and its owner; erasure goes by owner;
a case is read only by the person who opened it. One aggregate's records are totally ordered across connections
(docs/platform/STORAGE_SWITCH.md invariant 1)."""

from __future__ import annotations

import re
import threading
import time
import unittest
import uuid
from unittest import mock

from psycopg import errors

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain.blocks import FAMILY_BLOCK
from ai_lego.data.events import record_log
from ai_lego.data.repositories.custom_workflow_repository import CustomWorkflowRepository
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from tests.pg import PgTestCase, add_tenant
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

ME = str(uuid.uuid4())


class AppendRefusesTests(PgTestCase):
    def _append(self, event_type="TaskNoted", payload=None, writer=None, owner=None):
        with self.databases.transaction(self.REGION) as connection:
            return record_log.append(connection, "t", "project:p", event_type, payload or {"task_id": "x"},
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


class OwnerScopedNameTests(PgTestCase):
    """critic 2026-10-03 M1: a workspace-wide unique name told a colleague my case's name existed."""

    def test_a_name_is_unique_per_person_not_per_workspace(self):
        tenant = add_tenant(self.databases, str(uuid.uuid4()))
        repo = ProjectSourceRepository(self.databases)
        row = {"tenant_id": tenant, "workspace_id": "w", "name": "合作", "purpose": "p", "data_classification": "Confidential", "status": "active", "version": 1, "created_at": "2026-10-03T00:00:00Z"}
        repo.create_project({**row, "project_id": "P1", "created_by_identity_id": "A"})
        repo.create_project({**row, "project_id": "P2", "created_by_identity_id": "B"})   # a colleague may use the same name
        with self.assertRaises(errors.UniqueViolation):
            repo.create_project({**row, "project_id": "P3", "created_by_identity_id": "A"})   # I may not, twice
        self.assertEqual(sorted(project["project_id"] for project in repo.list_projects(tenant)), ["P1", "P2"])


class CustomWorkflowOwnerTests(PgTestCase):
    def setUp(self):
        self.tenant = add_tenant(self.databases, str(uuid.uuid4()))
        self.repo = CustomWorkflowRepository(self.databases)
        self.record = {"workflow_id": "W1", "tenant_id": self.tenant, "title": "Mine", "method_ids": ["a.b"], "created_by_identity_id": ME, "created_at": "2026-10-03T00:00:00Z", "updated_at": "2026-10-03T00:00:00Z"}
        self.repo.create(self.record)

    def test_only_its_maker_sees_or_changes_it(self):
        other = str(uuid.uuid4())
        self.assertIsNone(self.repo.get(self.tenant, "W1", other))
        self.assertEqual(self.repo.list(self.tenant, other), [])
        self.assertIsNone(self.repo.update(self.tenant, "W1", "x", ["a.b"], "2026-10-03T00:00:01Z", other))
        self.assertFalse(self.repo.delete(self.tenant, "W1", other))
        self.assertEqual(self.repo.get(self.tenant, "W1", ME)["title"], "Mine")

    def test_deleting_it_leaves_nothing_of_it(self):
        self.assertTrue(self.repo.delete(self.tenant, "W1", ME))
        with self.databases.transaction(self.REGION) as connection:
            left = connection.execute("SELECT COUNT(*) FROM events WHERE tenant_id=%s", (self.tenant,)).fetchone()[0]
        self.assertEqual(left, 0)


class AppendOrderTests(PgTestCase):
    """Invariant 1 through the real append: one aggregate's records, written by many connections at once, are numbered
    1..n with no gap and no duplicate; the aggregate's lock is what orders them, the UNIQUE key is the backstop."""

    WRITERS, APPENDS = 4, 25

    def _append(self, tenant: str, aggregate: str) -> dict:
        with self.databases.transaction(self.REGION) as connection:
            return record_log.append(connection, tenant, aggregate, "TaskNoted", {"task_id": "x"}, writer=record_log.user(ME, "ACT"), owner=record_log.case("p"))

    def _sequences(self, tenant: str, aggregate: str) -> list[int]:
        with self.databases.transaction(self.REGION) as connection:
            return [row[0] for row in connection.execute("SELECT sequence FROM events WHERE tenant_id=%s AND aggregate_id=%s ORDER BY sequence", (tenant, aggregate))]

    @staticmethod
    def _slow_now():
        """record_log._now() runs between the MAX(sequence) read and the INSERT: a pause there opens the race on every run."""
        real = record_log._now

        def slow():
            time.sleep(0.003)
            return real()
        return mock.patch.object(record_log, "_now", slow)

    def test_writers_racing_on_one_aggregate_leave_no_gap_and_no_duplicate(self):
        tenant, aggregate = "t-race", f"project:{uuid.uuid4()}"
        failures: list[str] = []
        start = threading.Barrier(self.WRITERS, timeout=30)

        def writer() -> None:
            try:
                start.wait()
                for _ in range(self.APPENDS):
                    self._append(tenant, aggregate)
            except Exception as error:   # noqa: BLE001 -- collected, asserted empty below
                failures.append(f"{type(error).__name__}: {error}")

        with self._slow_now():
            threads = [threading.Thread(target=writer) for _ in range(self.WRITERS)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=120)
        self.assertEqual(failures, [])
        self.assertEqual(self._sequences(tenant, aggregate), list(range(1, self.WRITERS * self.APPENDS + 1)))

    def test_without_the_lock_the_unique_key_refuses_the_second_writer(self):
        """Both writers read MAX(sequence) before either inserts (the lock switched off, a barrier inside the window): the
        UNIQUE key turns the second insert into an error, never a second record numbered 1."""
        tenant, aggregate = "t-backstop", f"project:{uuid.uuid4()}"
        both_read = threading.Barrier(2, timeout=10)
        real_now, outcomes = record_log._now, []

        def now_after_both_read():
            both_read.wait()
            return real_now()

        def writer() -> None:
            try:
                self._append(tenant, aggregate)
                outcomes.append("written")
            except errors.UniqueViolation as error:
                outcomes.append(error.diag.constraint_name)

        with mock.patch.object(record_log, "lock_aggregate", lambda *args: None), mock.patch.object(record_log, "_now", now_after_both_read):
            threads = [threading.Thread(target=writer) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=30)
        self.assertEqual(sorted(outcomes), ["uq_events_aggregate_sequence", "written"])
        self.assertEqual(self._sequences(tenant, aggregate), [1])


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
        with self.databases.for_tenant(self.tenant["tenant_id"]) as connection:
            me = connection.execute("SELECT identity_id FROM identity WHERE tenant_id=%s AND email='user@example.com'", (self.tenant["tenant_id"],)).fetchone()[0]
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
