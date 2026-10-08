"""The group (docs/platform/STEP34_SHARED_RULES.md §2, card 10): G1-G5 on a real PostgreSQL, the migration and its
CHECKs, tenant isolation, and the account erasure's part in groups."""

from __future__ import annotations

import contextlib
import threading
import uuid
from typing import Any, Iterator
from unittest import mock

import psycopg
from psycopg import errors

from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.data import db
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import IdentityStore
from tests.pg import PgTestCase, dump
from tests.unit.case_fixture import a_case
from tests.unit.test_api_main import ApiTestCase

NOTE = DocKind("collab.s34_note", "COLLAB", "測試紀錄", {"text": Field("text", 500)}, owner="group")
REVIEW = DocKind("collab.s34_review", "COLLAB", "測試回顧", {"text": Field("text", 500)}, owner="group", after_close=True)
# Until card 13 registers the real govern.consent, a stand-in with the fields erase_group reads (purpose, target).
CONSENT = DocKind("govern.consent", "GOVERN", "同意", {"purpose": Field("choice", choices=("group", "facilitator", "research")), "target": Field("text", 200)}, owner="person")


@contextlib.contextmanager
def registered(*extra: DocKind) -> Iterator[None]:
    """Test-only kinds beside the real ones (a real kind of the same name wins)."""
    real = doc_kinds.kinds()
    every = {**{kind.kind: kind for kind in extra}, **real}
    with mock.patch.object(doc_kinds, "kinds", lambda: every):
        yield


REAL_CONSENT = "govern.consent" in doc_kinds.kinds()


def consent_content(target: str) -> dict[str, Any]:
    if REAL_CONSENT:   # card 13's kind
        return {"purpose": "group", "target": target, "items": [], "follow_versions": True, "withdrawn": False}
    return {"purpose": "group", "target": target}


def make_people(databases: db.Databases, region: str, count: int) -> tuple[str, str, list[str]]:
    """A real tenant, its workspace and ``count`` active identities (rows only: no password, no login)."""
    store = IdentityStore(databases)
    tenant = store.create_tenant(str(uuid.uuid4()), "Group Tenant", "jurisdiction-pack.tw.v1", region, "kek")["tenant_id"]
    workspace = store.create_workspace(str(uuid.uuid4()), tenant, "Default")["workspace_id"]
    people = [str(uuid.uuid4()) for _ in range(count)]
    with databases.for_tenant(tenant) as connection:
        for index, identity in enumerate(people):
            connection.execute("INSERT INTO identity (identity_id, tenant_id, email, display_name, status, created_at) VALUES (%s,%s,%s,%s,'active',%s)",
                               (identity, tenant, f"p{index}-{identity[:6]}@example.com", f"成員{index}", db.now()))
    return tenant, workspace, people


class GroupCase(PgTestCase):
    def setUp(self):
        self.tenant, self.workspace, (self.a, self.b, self.c) = make_people(self.databases, self.REGION, 3)
        self.repo = ProjectSourceRepository(self.databases)
        self.docs = CaseDocs(self.repo)
        patcher = registered(NOTE, REVIEW, CONSENT)
        patcher.__enter__()
        self.addCleanup(patcher.__exit__, None, None, None)
        self.group = self.repo.create_group(self.tenant, self.workspace, "decision", "第三位合夥人", self.a)["group_id"]
        for person in (self.b, self.c):
            with self.databases.for_tenant(self.tenant) as connection:
                ProjectSourceRepository.add_member(connection, self.tenant, self.group, person, "participant")
        self.owner = record_log.group(self.group)

    def write(self, who: str, kind: str = "collab.s34_note", text: str = "我的立場", group: str | None = None) -> dict[str, Any]:
        return self.docs.save(self.tenant, record_log.group(group or self.group), kind, {"text": text}, record_log.user(who, "COLLAB"))

    def refused(self, action) -> str:
        with self.assertRaises(InvariantViolation) as caught:
            action()
        return str(caught.exception).split(":")[0]

    def rows(self, query: str, *parameters) -> list[Any]:
        with self.databases.for_tenant(self.tenant) as connection:
            return connection.execute(query, parameters).fetchall()

    def group_events(self, group: str | None = None) -> int:
        return self.rows("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND owner_kind='group' AND owner_id=%s", self.tenant, group or self.group)[0][0]


class OwnerKindTests(GroupCase):
    def test_a_group_record_names_the_group_as_its_owner(self):
        saved = self.write(self.b)
        row = self.rows("SELECT owner_kind, owner_id, author_identity_id FROM events WHERE tenant_id=%s AND aggregate_id=%s", self.tenant, f"doc:{saved['doc_id']}")[0]
        self.assertEqual(tuple(row), ("group", self.group, self.b))
        self.assertEqual(record_log.Owner.group(self.group), self.owner)

    def test_a_group_kind_cannot_be_saved_for_a_case_and_after_close_is_for_groups_only(self):
        case = a_case(self.repo, self.tenant, str(uuid.uuid4()))
        self.assertEqual(self.refused(lambda: self.docs.save(self.tenant, case, "collab.s34_note", {"text": "x"}, record_log.user(self.a, "COLLAB"))), "RECORD_OWNER_NOT_ALLOWED")
        with self.assertRaisesRegex(InvariantViolation, "^DOC_KIND_INVALID"):
            DocKind("collab.bad", "COLLAB", "x", {"text": Field()}, owner="case", after_close=True)


class G1WriteWhileOpenTests(GroupCase):
    def test_a_write_to_a_closed_group_is_refused_unless_its_kind_is_after_close(self):
        self.write(self.b)
        self.repo.close_group(self.tenant, self.group, self.a)
        self.assertEqual(self.refused(lambda: self.write(self.b)), "GROUP_CLOSED")
        self.assertEqual(self.write(self.b, "collab.s34_review", "回顧")["version"], 1)
        self.assertEqual(self.group_events(), 2)

    def test_a_write_to_an_erased_group_is_refused(self):
        self.repo.erase_group(self.tenant, self.group, self.a)
        self.assertEqual(self.refused(lambda: self.docs.save(self.tenant, self.owner, "collab.s34_review", {"text": "x"}, record_log.system("COLLAB"))), "GROUP_ERASED")
        self.assertEqual(self.group_events(), 0)

    def test_a_missing_group_and_a_non_member_writer_get_the_same_refusal(self):
        outsider = make_people(self.databases, self.REGION, 1)[2][0]
        self.assertEqual(self.refused(lambda: self.write(self.b, group=str(uuid.uuid4()))), "GROUP_NOT_FOUND")
        self.assertEqual(self.refused(lambda: self.write(outsider)), "GROUP_NOT_FOUND")

    def test_a_batch_into_a_group_holds_the_same_rules(self):
        self.repo.close_group(self.tenant, self.group, self.a)
        items = [{"kind": "collab.s34_note", "content": {"text": "x"}}]
        self.assertEqual(self.refused(lambda: self.docs.save_many(self.tenant, self.owner, items, record_log.user(self.b, "COLLAB"))), "GROUP_CLOSED")


class _Racing(GroupCase):
    """Two real connections: the first save that reaches doc_kinds.validate (inside its transaction, after its checks and
    locks, before its write) waits there until ``release`` is set."""

    def setUp(self):
        super().setUp()
        self.holding, self.release, self.outcomes = threading.Event(), threading.Event(), {}
        real, first = doc_kinds.validate, threading.Lock()

        def validate(*args, **kwargs):
            if first.acquire(blocking=False):
                self.holding.set()
                self.release.wait(20)
            return real(*args, **kwargs)
        patcher = mock.patch.object(doc_kinds, "validate", validate)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.release.set)

    def run_as(self, name: str, action) -> threading.Thread:
        def target():
            try:
                self.outcomes[name] = action()
            except InvariantViolation as error:
                self.outcomes[name] = str(error).split(":")[0]
        thread = threading.Thread(target=target, daemon=True)
        thread.start()
        return thread


class G1RaceTests(_Racing):
    def erase(self):
        return lambda: self.repo.erase_group(self.tenant, self.group, self.a)["records"]

    def test_the_erase_waits_for_the_write_in_flight_and_takes_it_with_the_group(self):
        writer = self.run_as("writer", lambda: self.write(self.b)["version"])
        self.assertTrue(self.holding.wait(10))
        eraser = self.run_as("eraser", self.erase())
        eraser.join(0.5)
        self.assertTrue(eraser.is_alive(), "the erase did not wait for the writer holding the group lock")
        self.release.set()
        writer.join(20)
        eraser.join(20)
        self.assertEqual(self.outcomes["writer"], 1)   # it was in first: it wrote
        self.assertEqual(self.outcomes["eraser"], 1)   # and its record went with the group
        self.assertEqual(self.group_events(), 0)

    def test_a_writer_that_comes_while_the_erase_holds_the_group_gets_group_erased_and_writes_nothing(self):
        erasing, go, real = threading.Event(), threading.Event(), ProjectSourceRepository._erase_consents_naming

        def slowly(connection, tenant_id, group_id):   # inside the erase's transaction, its lock held
            erasing.set()
            go.wait(20)
            return real.__func__(ProjectSourceRepository, connection, tenant_id, group_id)
        with mock.patch.object(ProjectSourceRepository, "_erase_consents_naming", staticmethod(slowly)):
            eraser = self.run_as("eraser", self.erase())
            self.assertTrue(erasing.wait(10))
            writer = self.run_as("writer", lambda: self.write(self.b)["version"])
            writer.join(0.5)
            self.assertTrue(writer.is_alive(), "the writer did not wait for the erase holding the group lock")
            go.set()
            self.release.set()   # a save that skipped the lock is paused inside itself: let it finish, so it shows
            eraser.join(20)
            writer.join(20)
        self.assertEqual(self.outcomes["writer"], "GROUP_ERASED")
        self.assertEqual(self.group_events(), 0)


class G3LeaveTests(GroupCase):
    def test_one_who_left_reads_nothing_writes_nothing_and_what_they_wrote_stays(self):
        mine = self.write(self.b, text="離開前寫的")
        self.repo.leave_group(self.tenant, self.group, self.b)
        self.assertIsNone(self.repo.get_group_for(self.tenant, self.group, self.b))
        self.assertEqual([group["group_id"] for group in self.repo.list_groups_for(self.tenant, self.b)], [])
        self.assertNotIn(self.b, [member["identity_id"] for member in self.repo.group_members(self.tenant, self.group)])
        self.assertEqual(self.refused(lambda: self.write(self.b)), "GROUP_NOT_FOUND")
        self.assertEqual([doc["doc_id"] for doc in self.docs.current(self.tenant, self.owner, "collab.s34_note")], [mine["doc_id"]])

    def test_one_who_left_may_delete_what_they_wrote_and_nobody_deletes_anothers(self):
        mine, theirs = self.write(self.b), self.write(self.c)
        self.assertEqual(self.refused(lambda: self.docs.delete(self.tenant, self.owner, "collab.s34_note", theirs["doc_id"], record_log.user(self.b, "COLLAB"))), "DOC_NOT_YOURS")
        self.repo.leave_group(self.tenant, self.group, self.b)
        self.docs.delete(self.tenant, self.owner, "collab.s34_note", mine["doc_id"], record_log.user(self.b, "COLLAB"))
        self.assertEqual([doc["doc_id"] for doc in self.docs.current(self.tenant, self.owner, "collab.s34_note")], [theirs["doc_id"]])

    def test_one_who_left_and_is_invited_back_is_a_member_again(self):
        self.repo.leave_group(self.tenant, self.group, self.b)
        with self.databases.for_tenant(self.tenant) as connection:
            ProjectSourceRepository.add_member(connection, self.tenant, self.group, self.b, "participant")
        self.assertEqual(self.repo.get_group_for(self.tenant, self.group, self.b)["my_role"], "participant")
        with self.databases.for_tenant(self.tenant) as connection:
            self.assertEqual(self.refused(lambda: ProjectSourceRepository.add_member(connection, self.tenant, self.group, self.b, "participant")), "GROUP_ALREADY_MEMBER")


class G4EraseTests(GroupCase):
    def test_erase_removes_the_group_its_members_invites_and_consents_and_nothing_of_the_members_own(self):
        other = self.repo.create_group(self.tenant, self.workspace, "class", "另一個群組", self.b)["group_id"]
        self.write(self.b, text="GROUP-WORDS-B")
        self.write(self.a, text="GROUP-WORDS-A")
        self.write(self.b, text="OTHER-GROUP-WORDS", group=other)
        case = a_case(self.repo, self.tenant, str(uuid.uuid4()))
        self.docs.save(self.tenant, case, "sense.card", {"category": "事件", "text": "CASE-WORDS"}, record_log.user(self.b, "SENSE"))
        self.docs.save(self.tenant, record_log.person(self.b), "govern.location", {"where": "PERSON-PLACE"}, record_log.user(self.b, "GOVERN"))
        naming = self.docs.save(self.tenant, record_log.person(self.b), "govern.consent", consent_content(self.group), record_log.user(self.b, "GOVERN"))
        self.docs.save(self.tenant, record_log.person(self.b), "govern.consent", consent_content(self.group), record_log.user(self.b, "GOVERN"),
                       doc_id=naming["doc_id"], base_version=1)
        kept = self.docs.save(self.tenant, record_log.person(self.b), "govern.consent", consent_content(other), record_log.user(self.b, "GOVERN"))
        with self.databases.for_tenant(self.tenant) as connection:
            connection.execute("INSERT INTO group_invites (invite_id, tenant_id, group_id, role, token_hash, inviter_identity_id, created_at, expires_at) "
                               "VALUES (%s,%s,%s,'participant',%s,%s,%s,%s)", (str(uuid.uuid4()), self.tenant, self.group, "a" * 64, self.a, db.now(), db.now()))
        erased = self.repo.erase_group(self.tenant, self.group, self.a)
        self.assertEqual(erased, {"records": 2, "consents": 2, "invites": 1, "members": 3})
        self.assertEqual(self.group_events(), 0)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM group_members WHERE tenant_id=%s AND group_id=%s", self.tenant, self.group)[0][0], 0)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM group_invites WHERE tenant_id=%s AND group_id=%s", self.tenant, self.group)[0][0], 0)
        self.assertEqual(tuple(self.rows("SELECT status, name FROM platform_groups WHERE group_id=%s", self.group)[0]), ("erased", ""))
        everything = "\n".join(dump(self.databases))
        for gone in ("GROUP-WORDS-B", "GROUP-WORDS-A", "第三位合夥人"):
            self.assertNotIn(gone, everything)
        for stays in ("OTHER-GROUP-WORDS", "CASE-WORDS", "PERSON-PLACE"):
            self.assertIn(stays, everything)
        consents = [doc["doc_id"] for doc in self.docs.current(self.tenant, record_log.person(self.b), "govern.consent")]
        self.assertEqual(consents, [kept["doc_id"]])
        self.assertIsNone(self.repo.get_group_for(self.tenant, self.group, self.a))

    def test_only_a_convener_erases_or_closes(self):
        self.assertEqual(self.refused(lambda: self.repo.erase_group(self.tenant, self.group, self.b)), "GROUP_CONVENER_ONLY")
        self.assertEqual(self.refused(lambda: self.repo.close_group(self.tenant, self.group, self.b)), "GROUP_CONVENER_ONLY")
        outsider = make_people(self.databases, self.REGION, 1)[2][0]
        self.assertEqual(self.refused(lambda: self.repo.erase_group(self.tenant, self.group, outsider)), "GROUP_NOT_FOUND")
        self.assertEqual(self.refused(lambda: self.repo.erase_group(self.tenant, str(uuid.uuid4()), self.a)), "GROUP_NOT_FOUND")


class G5ConvenerTests(_Racing):
    def test_the_last_convener_cannot_leave_and_after_handing_over_can(self):
        self.assertEqual(self.refused(lambda: self.repo.leave_group(self.tenant, self.group, self.a)), "GROUP_LAST_CONVENER")
        self.repo.close_group(self.tenant, self.group, self.a)
        self.assertEqual(self.refused(lambda: self.repo.leave_group(self.tenant, self.group, self.a)), "GROUP_LAST_CONVENER")   # closed: still theirs to erase
        self.assertEqual(self.refused(lambda: self.repo.hand_over(self.tenant, self.group, self.b, self.c)), "GROUP_CONVENER_ONLY")
        self.repo.hand_over(self.tenant, self.group, self.a, self.b)
        self.repo.leave_group(self.tenant, self.group, self.a)
        self.assertEqual([(m["identity_id"], m["role"]) for m in self.repo.group_members(self.tenant, self.group)], [(self.b, "convener"), (self.c, "participant")])

    def test_two_conveners_leaving_at_once_leave_one(self):
        self.repo.hand_over(self.tenant, self.group, self.a, self.b)
        holding, go, real = threading.Event(), threading.Event(), ProjectSourceRepository._conveners_and
        first = threading.Lock()

        def slowly(connection, tenant_id, group_id, identity_id):
            found = real(connection, tenant_id, group_id, identity_id)
            if first.acquire(blocking=False):   # the first leaver holds the conveners' rows here
                holding.set()
                go.wait(20)
            return found
        with mock.patch.object(ProjectSourceRepository, "_conveners_and", staticmethod(slowly)):
            one = self.run_as("a", lambda: self.repo.leave_group(self.tenant, self.group, self.a))
            self.assertTrue(holding.wait(10))
            two = self.run_as("b", lambda: self.repo.leave_group(self.tenant, self.group, self.b))
            two.join(0.5)
            self.assertTrue(two.is_alive(), "the second leaver did not wait for the first's rows")
            go.set()
            one.join(20)
            two.join(20)
        self.assertEqual(sorted(map(str, self.outcomes.values())), ["GROUP_LAST_CONVENER", "None"])
        self.assertEqual(len([m for m in self.repo.group_members(self.tenant, self.group) if m["role"] == "convener"]), 1)


class AccountErasureInGroupsTests(GroupCase):
    def test_a_members_erasure_takes_their_membership_and_their_records_and_leaves_the_others(self):
        from ai_lego.platform.erasure import Erasure

        self.write(self.b, text="B-IN-GROUP")
        others = self.write(self.a, text="A-IN-GROUP")
        erasure = Erasure(self.repo, None, None, None)
        counts = erasure.decide_person(self.tenant, self.b, lambda: [])
        self.assertEqual((counts["memberships"], counts["group_records"]), (1, 1))
        self.assertEqual([member["identity_id"] for member in self.repo.group_members(self.tenant, self.group)], [self.a, self.c])
        self.assertEqual([doc["doc_id"] for doc in self.docs.current(self.tenant, self.owner, "collab.s34_note")], [others["doc_id"]])
        self.assertNotIn("B-IN-GROUP", "\n".join(dump(self.databases)))

    def test_the_only_convener_is_not_erased_until_the_group_is_handed_over(self):
        from ai_lego.platform.erasure import Erasure

        erasure = Erasure(self.repo, None, None, None)
        self.write(self.a)
        self.assertEqual(self.repo.groups_led_alone(self.tenant, self.a), [self.group])
        self.assertEqual(self.refused(lambda: erasure.decide_person(self.tenant, self.a, lambda: [])), "ACCOUNT_IS_LAST_CONVENER")
        self.assertEqual(self.group_events(), 1)
        self.repo.hand_over(self.tenant, self.group, self.a, self.c)
        self.assertEqual(self.repo.groups_led_alone(self.tenant, self.a), [])
        erasure.decide_person(self.tenant, self.a, lambda: [])
        self.assertEqual(self.group_events(), 0)


class MigrationTests(GroupCase):
    def test_upgrade_downgrade_upgrade(self):
        database = self.pg.create_database(migrated=False)
        self.addCleanup(self.pg.drop_database, database)
        url = self.pg.url(database)
        tables = {"platform_groups", "group_members", "group_invites", "identity_roles"}

        def present() -> set[str]:
            with psycopg.connect(url) as connection:
                return {row[0] for row in connection.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()")} & tables
        db.migrate(url)
        self.assertEqual(present(), tables)
        db.downgrade(url, "0004")
        self.assertEqual(present(), set())
        db.migrate(url)
        self.assertEqual(present(), tables)

    def test_the_checks_refuse_a_bad_role_status_purpose_and_granted_role(self):
        bad = {
            "role": ("UPDATE group_members SET role='boss' WHERE group_id=%s", (self.group,)),
            "status": ("UPDATE platform_groups SET status='paused' WHERE group_id=%s", (self.group,)),
            "purpose": ("UPDATE platform_groups SET purpose='party' WHERE group_id=%s", (self.group,)),
            "name": ("UPDATE platform_groups SET name='   ' WHERE group_id=%s", (self.group,)),
            "review": ("UPDATE group_members SET review_state='maybe' WHERE group_id=%s", (self.group,)),
            "granted": ("INSERT INTO identity_roles (tenant_id, identity_id, role, granted_by, granted_at) VALUES (%s,%s,'admin','operator',now())", (self.tenant, self.a)),
            "token": ("INSERT INTO group_invites (invite_id, tenant_id, group_id, role, token_hash, inviter_identity_id, created_at, expires_at) VALUES ('i',%s,%s,'participant','raw-token',%s,now(),now())",
                      (self.tenant, self.group, self.a)),
        }
        for name, (query, parameters) in bad.items():
            with self.subTest(name), self.assertRaises(errors.CheckViolation):
                with self.databases.for_tenant(self.tenant) as connection:
                    connection.execute(query, parameters)

    def test_a_member_of_another_tenant_is_refused_by_the_schema_and_by_add_member(self):
        other_tenant, _, (stranger,) = make_people(self.databases, self.REGION, 1)
        with self.assertRaises(errors.ForeignKeyViolation), self.databases.for_tenant(self.tenant) as connection:
            connection.execute("INSERT INTO group_members (group_id, tenant_id, identity_id, role, joined_at) VALUES (%s,%s,%s,'participant',now())", (self.group, self.tenant, stranger))
        with self.databases.for_tenant(self.tenant) as connection:
            self.assertEqual(self.refused(lambda: ProjectSourceRepository.add_member(connection, self.tenant, self.group, stranger, "participant")), "GROUP_MEMBER_UNKNOWN")
        self.assertIsNone(self.repo.get_group_for(other_tenant, self.group, stranger))
        with self.databases.for_tenant(other_tenant) as connection:   # the group's id from the other tenant: not there
            self.assertEqual(self.refused(lambda: ProjectSourceRepository.add_member(connection, other_tenant, self.group, stranger, "participant")), "GROUP_NOT_FOUND")


class GroupApiTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: ProjectSourceRepository(self.databases)
        self._login()
        self.me = self.identity["identity_id"]

    def login_as(self, email: str, tenant: dict | None = None) -> str:
        store = IdentityStore(self.databases)
        tenant_id = (tenant or self.tenant)["tenant_id"]
        found = store._find_identity_by_email(tenant_id, email) or store.create_identity(str(uuid.uuid4()), tenant_id, email, email.split("@")[0], "correct-horse-battery")
        self.assertEqual(self.client.post("/auth/login", json={"tenant_id": tenant_id, "email": email, "password": "correct-horse-battery"}).status_code, 200)
        return found["identity_id"]

    def make(self, name: str = "讀書會") -> str:
        response = self.client.post("/groups", json={"name": name, "purpose": "class"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["my_role"], "convener")
        return response.json()["group_id"]

    def answers(self, group_id: str) -> list[tuple[int, Any]]:
        calls = [("get", f"/groups/{group_id}"), ("post", f"/groups/{group_id}/leave"), ("post", f"/groups/{group_id}/close"),
                 ("delete", f"/groups/{group_id}"), ("post", f"/groups/{group_id}/members/{self.me}/convener")]
        return [(response.status_code, response.json()) for response in (getattr(self.client, method)(path) for method, path in calls)]

    def missing(self, group_id: str) -> list[tuple[int, Any]]:
        return [(404, {"detail": f"GROUP_NOT_FOUND: {group_id!r}"})] * 5

    def test_a_member_sees_the_group_and_its_members(self):
        group_id = self.make()
        self.assertEqual([group["group_id"] for group in self.client.get("/groups").json()], [group_id])
        body = self.client.get(f"/groups/{group_id}").json()
        self.assertEqual((body["name"], body["purpose"], body["status"]), ("讀書會", "class", "open"))
        self.assertEqual([(member["identity_id"], member["role"]) for member in body["members"]], [(self.me, "convener")])

    def test_g2_a_non_member_a_missing_group_an_erased_group_and_one_who_left_get_the_same_answer(self):
        group_id = self.make()
        mine_erased = self.make("要刪掉的")
        self.assertEqual(self.client.delete(f"/groups/{mine_erased}").status_code, 200)
        self.login_as("colleague@example.com")
        self.assertEqual(self.answers(group_id), self.missing(group_id))
        self.assertEqual(self.answers(mine_erased), self.missing(mine_erased))
        unknown = str(uuid.uuid4())
        self.assertEqual(self.answers(unknown), self.missing(unknown))

    def test_g2_one_who_left_gets_the_same_answer_as_for_no_group(self):
        group_id = self.make()
        member = self.login_as("member@example.com")
        repo = ProjectSourceRepository(self.databases)
        with self.databases.for_tenant(self.tenant["tenant_id"]) as connection:
            ProjectSourceRepository.add_member(connection, self.tenant["tenant_id"], group_id, member, "participant")
        self.assertEqual(self.client.get(f"/groups/{group_id}").status_code, 200)
        self.assertEqual(self.client.post(f"/groups/{group_id}/close").status_code, 403)   # a member: the role decides
        self.assertEqual(self.client.post(f"/groups/{group_id}/leave").status_code, 200)
        self.assertEqual(self.answers(group_id), self.missing(group_id))
        self.assertIsNotNone(repo.get_group_for(self.tenant["tenant_id"], group_id, self.me))

    def test_a_group_of_another_tenant_is_not_reachable_by_its_id(self):
        group_id = self.make()
        store = IdentityStore(self.databases)
        other = store.create_tenant(str(uuid.uuid4()), "Other", "jurisdiction-pack.tw.v1", "local-dev", "k")
        store.create_workspace(str(uuid.uuid4()), other["tenant_id"], "Default")
        self.login_as("other@example.com", other)
        self.assertEqual(self.answers(group_id), self.missing(group_id))

    def test_the_last_convener_cannot_leave_and_the_route_says_so(self):
        group_id = self.make()
        response = self.client.post(f"/groups/{group_id}/leave")
        self.assertEqual((response.status_code, response.json()["detail"].split(":")[0]), (409, "GROUP_LAST_CONVENER"))

    def test_a_bad_name_or_purpose_is_refused(self):
        for body in ({"name": " ", "purpose": "class"}, {"name": "x" * 121, "purpose": "class"}, {"name": "ok", "purpose": "party"}):
            with self.subTest(body=body):
                self.assertEqual(self.client.post("/groups", json=body).status_code, 400)

    def test_an_account_that_leads_a_group_alone_is_not_erased_and_nothing_is(self):
        self.make()
        project = self.client.post("/projects", json={"name": "我的案子", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        response = self.client.post("/govern/account/erase", json={"confirm": "刪除我的帳號"})
        self.assertEqual((response.status_code, response.json()["detail"].split(":")[0]), (409, "ACCOUNT_IS_LAST_CONVENER"))
        self.assertEqual(self.client.get(f"/projects/{project}").status_code, 200)
