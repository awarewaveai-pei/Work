"""Invitations: the only way into a group (docs/platform/STEP34_SHARED_RULES.md §4, card 12), on a real PostgreSQL."""

from __future__ import annotations

import ast
import hashlib
import inspect
import textwrap
import unittest
import uuid
from datetime import timedelta
from unittest import mock

from ai_lego.apps.api import main as api_main
from ai_lego.data import db
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import rulesets, visibility
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.rulesets import govern
from ai_lego.platform.visibility import Viewer
from tests.unit.test_api_main import ApiTestCase
from tests.unit.test_groups_core import NOTE, registered

PASSWORD = "correct-horse-battery"


class InviteCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.repo = ProjectSourceRepository(self.databases)
        self.store = IdentityStore(self.databases)
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: self.repo
        self.tenant_id = self.tenant["tenant_id"]
        self.me = self.identity["identity_id"]
        self._login()
        self.group = self.client.post("/groups", json={"name": "讀書會", "purpose": "class"}).json()["group_id"]

    def invite(self, group: str | None = None) -> dict:
        response = self.client.post(f"/groups/{group or self.group}/invites", json={})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def as_visitor(self, token: str, email: str):
        self.client.cookies.clear()
        return self.client.post("/invites/accept", json={"token": token, "email": email, "display_name": email.split("@")[0], "password": PASSWORD})

    def login(self, email: str, tenant_id: str | None = None) -> None:
        self.client.cookies.clear()
        self.assertEqual(self.client.post("/auth/login", json={"tenant_id": tenant_id or self.tenant_id, "email": email, "password": PASSWORD}).status_code, 200)

    def identity_of(self, email: str) -> dict | None:
        return self.store._find_identity_by_email(self.tenant_id, email)


class OneTimeLinkTests(InviteCase):
    def test_a_visitor_joins_once_and_the_second_accept_is_refused(self):
        made = self.invite()
        joined = self.as_visitor(made["token"], "new@example.com")
        self.assertEqual(joined.status_code, 200, joined.text)
        self.assertEqual((joined.json()["group_id"], joined.json()["review_state"]), (self.group, "confirmed"))
        newcomer = self.identity_of("new@example.com")
        with self.databases.for_tenant(self.tenant_id) as connection:
            self.assertEqual(connection.execute("SELECT invited_by FROM identity WHERE identity_id=%s", (newcomer["identity_id"],)).fetchone()[0], self.me)
        self.assertEqual(self.as_visitor(made["token"], "second@example.com").status_code, 404)
        self.assertIsNone(self.identity_of("second@example.com"))

    def test_only_the_hash_is_stored_and_the_token_is_in_no_answer_but_the_create(self):
        made = self.invite()
        token, digest = made["token"], hashlib.sha256(made["token"].encode()).hexdigest()
        with self.databases.for_tenant(self.tenant_id) as connection:
            stored = connection.execute("SELECT token_hash FROM group_invites WHERE invite_id=%s", (made["invite_id"],)).fetchone()[0]
        self.assertEqual(stored, digest)
        answers = [self.client.get(f"/groups/{self.group}/invites"), self.client.get(f"/groups/{self.group}"), self.client.get("/groups")]
        answers.append(self.client.delete(f"/groups/{self.group}/invites/{self.invite()['invite_id']}"))
        answers.append(self.as_visitor(token, "join@example.com"))
        answers.append(self.as_visitor(token, "again@example.com"))
        for answer in answers:
            self.assertNotIn(token, answer.text)
            self.assertNotIn(digest, answer.text)
        self.login("user@example.com")
        self.assertEqual(self.client.get(f"/groups/{self.group}/invites").json(), [])

    def test_every_refusal_is_one_404_with_one_body(self):
        used, expired, revoked, closed_one, erased_one = (self.invite() for _ in range(5))
        self.assertEqual(self.as_visitor(used["token"], "used@example.com").status_code, 200)
        self.login("user@example.com")
        self.assertEqual(self.client.delete(f"/groups/{self.group}/invites/{revoked['invite_id']}").status_code, 200)
        closed = self.client.post("/groups", json={"name": "結束的", "purpose": "decision"}).json()["group_id"]
        erased = self.client.post("/groups", json={"name": "刪掉的", "purpose": "decision"}).json()["group_id"]
        closed_one, erased_one = self.invite(closed), self.invite(erased)
        self.client.post(f"/groups/{closed}/close")
        self.client.delete(f"/groups/{erased}")
        other = self.store.create_tenant(str(uuid.uuid4()), "Other", "jurisdiction-pack.tw.v1", "local-dev", "k")
        self.store.create_identity(str(uuid.uuid4()), other["tenant_id"], "elsewhere@example.com", "elsewhere", PASSWORD)
        answers = {
            "unknown": self.as_visitor("not-a-token", "u1@example.com"),
            "used": self.as_visitor(used["token"], "u2@example.com"),
            "revoked": self.as_visitor(revoked["token"], "u3@example.com"),
            "closed": self.as_visitor(closed_one["token"], "u4@example.com"),
            "erased": self.as_visitor(erased_one["token"], "u5@example.com"),
        }
        with mock.patch.object(db, "now", lambda: db.datetime.now(db.timezone.utc) + timedelta(days=8)):
            answers["expired"] = self.as_visitor(expired["token"], "u6@example.com")
        self.login("elsewhere@example.com", other["tenant_id"])
        answers["other tenant"] = self.client.post("/invites/accept", json={"token": expired["token"]})
        self.assertEqual({name: (answer.status_code, answer.json()) for name, answer in answers.items()},
                         {name: (404, {"detail": IdentityStore.INVITE_REFUSED}) for name in answers})
        for number in range(1, 7):
            self.assertIsNone(self.identity_of(f"u{number}@example.com"))

    def test_a_visitors_account_and_membership_are_made_together_or_not_at_all(self):
        made = self.invite()
        with mock.patch.object(ProjectSourceRepository, "add_member", side_effect=RuntimeError("injected after create_identity")), self.assertRaises(RuntimeError):
            self.store.accept_invite(made["token"], visitor={"email": "half@example.com", "display_name": "half", "password": PASSWORD})
        self.assertIsNone(self.identity_of("half@example.com"))
        with self.databases.for_tenant(self.tenant_id) as connection:
            self.assertIsNone(connection.execute("SELECT used_at FROM group_invites WHERE invite_id=%s", (made["invite_id"],)).fetchone()[0])
        self.assertEqual(self.as_visitor(made["token"], "half@example.com").status_code, 200)

    def test_a_signed_in_person_of_another_tenant_cannot_accept(self):
        made = self.invite()
        other = self.store.create_tenant(str(uuid.uuid4()), "Other", "jurisdiction-pack.tw.v1", "local-dev", "k")
        stranger = self.store.create_identity(str(uuid.uuid4()), other["tenant_id"], "b@example.com", "b", PASSWORD)
        self.login("b@example.com", other["tenant_id"])
        self.assertEqual(self.client.post("/invites/accept", json={"token": made["token"]}).status_code, 404)
        self.assertEqual(self.repo.list_groups_for(other["tenant_id"], stranger["identity_id"]), [])
        self.assertEqual(self.as_visitor(made["token"], "fresh@example.com").status_code, 200)   # still unused

    def test_a_participant_cannot_invite(self):
        self.assertEqual(self.as_visitor(self.invite()["token"], "p@example.com").status_code, 200)
        self.login("p@example.com")
        response = self.client.post(f"/groups/{self.group}/invites", json={})
        self.assertEqual((response.status_code, response.json()["detail"].split(":")[0]), (403, "GROUP_INVITE_NOT_ALLOWED"))


class LimitTests(InviteCase):
    def people(self, count: int) -> list[str]:
        made = [str(uuid.uuid4()) for _ in range(count)]
        with self.databases.for_tenant(self.tenant_id) as connection:
            for identity in made:
                connection.execute("INSERT INTO identity (identity_id, tenant_id, email, display_name, status, created_at) VALUES (%s,%s,%s,'x','active',now())",
                                   (identity, self.tenant_id, f"{identity}@example.com"))
                ProjectSourceRepository.add_member(connection, self.tenant_id, self.group, identity, "participant")
        for identity in made:
            self.repo.hand_over(self.tenant_id, self.group, self.me, identity)
        return made

    def test_the_26th_open_invitation_and_the_11th_of_a_day_are_refused_by_the_ruleset(self):
        rules = rulesets.require("govern.invites").items
        self.assertEqual((rules["open_per_group"], rules["created_per_identity_per_day"], rules["expires_days"]), (25, 10, 7))
        b, c = self.people(2)
        for _ in range(10):
            self.store.create_invite(self.tenant_id, self.group, b)
        with self.assertRaisesRegex(InvariantViolation, "^GROUP_INVITES_PER_DAY"):
            self.store.create_invite(self.tenant_id, self.group, b)
        for _ in range(10):
            self.store.create_invite(self.tenant_id, self.group, c)
        for _ in range(5):
            self.store.create_invite(self.tenant_id, self.group, self.me)
        with self.assertRaisesRegex(InvariantViolation, "^GROUP_INVITES_TOO_MANY"):
            self.store.create_invite(self.tenant_id, self.group, self.me)
        tighter = rulesets.Ruleset("govern.invites", "GOVERN", "邀請的上限", "1", "x", {**rules, "created_per_identity_per_day": 0})
        fresh = self.client.post("/groups", json={"name": "新", "purpose": "class"}).json()["group_id"]
        with mock.patch.object(rulesets, "require", lambda name: tighter), self.assertRaisesRegex(InvariantViolation, "^GROUP_INVITES_PER_DAY"):
            self.store.create_invite(self.tenant_id, fresh, self.me)

    def test_the_rules_changed_without_a_new_version_are_refused(self):
        changed = rulesets.Ruleset("govern.invites", "GOVERN", govern.INVITES.title, "1", govern.INVITES.maintainer, {**govern.INVITES.items, "open_per_group": 250})
        with self.assertRaisesRegex(InvariantViolation, "^RULESET_CHANGED_WITHOUT_VERSION"):
            rulesets.check(changed, govern.HISTORY)


class FloodingTests(InviteCase):
    def test_the_sixth_account_through_one_inviter_in_a_day_is_held_until_the_convener_confirms(self):
        tokens = [self.invite()["token"] for _ in range(6)]
        states = [self.as_visitor(token, f"f{number}@example.com").json()["review_state"] for number, token in enumerate(tokens)]
        self.assertEqual(states, ["confirmed"] * 5 + ["pending_review"])
        held = self.identity_of("f5@example.com")["identity_id"]
        first = self.identity_of("f0@example.com")["identity_id"]
        self.assertNotIn(held, self.repo.agreement_members(self.tenant_id, self.group))
        docs = CaseDocs(self.repo)
        with registered(NOTE):
            docs.save(self.tenant_id, record_log.group(self.group), "collab.s34_note", {"text": "先寫的"}, record_log.user(first, "COLLAB"))
            self.assertEqual(visibility.visible(docs, Viewer(self.tenant_id, held), self.group, "collab.s34_note"), [])
            self.login("f5@example.com")
            self.assertIn("等召集人確認", self.client.get(f"/groups/{self.group}").json()["held_notice"])
            self.login("user@example.com")
            members = {member["identity_id"]: member for member in self.client.get(f"/groups/{self.group}").json()["members"]}
            self.assertIn("等你確認", members[held]["notice"])
            self.assertEqual(self.client.post(f"/groups/{self.group}/members/{held}/confirm").status_code, 200)
            self.assertEqual(len(visibility.visible(docs, Viewer(self.tenant_id, held), self.group, "collab.s34_note")), 1)
        self.assertIn(held, self.repo.agreement_members(self.tenant_id, self.group))


class ConstantTimeTests(unittest.TestCase):
    def test_the_token_is_matched_in_constant_time_never_with_equals(self):
        tree = ast.parse(textwrap.dedent(inspect.getsource(IdentityStore.accept_invite)))
        compares = [node for node in ast.walk(tree) if isinstance(node, ast.Compare) and any(isinstance(op, (ast.Eq, ast.NotEq)) for op in node.ops)]
        self.assertEqual([ast.unparse(node) for node in compares if "token" in ast.unparse(node)], [])
        calls = [ast.unparse(node.func) for node in ast.walk(tree) if isinstance(node, ast.Call)]
        self.assertIn("hmac.compare_digest", calls)
