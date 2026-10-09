"""Roles and consent (docs/platform/STEP34_SHARED_RULES.md §3 R2, §5, §6; card 13), on a real PostgreSQL."""

from __future__ import annotations

import contextlib
import io
import uuid

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.apps.cli import grant_role
from ai_lego.data import db
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform import visibility
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.visibility import Viewer
from tests.unit.facilitator_fixture import make_eligible
from tests.unit.test_api_main import ApiTestCase


class ConsentCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.repo = ProjectSourceRepository(self.databases)
        self.docs = CaseDocs(self.repo)
        self.store = IdentityStore(self.databases)
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: self.repo
        self.tenant_id = self.tenant["tenant_id"]
        self.me = self.identity["identity_id"]
        self._login()
        self.group = self.client.post("/groups", json={"name": "合夥", "purpose": "decision"}).json()["group_id"]
        self.viewer, self.outsider, self.facilitator = self.person(), self.person(), self.person()
        self.join(self.group, self.viewer)
        self.case = self.client.post("/projects", json={"name": "我的案子", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        self.shared, self.unlisted = self.card("分享的卡"), self.card("沒分享的卡")

    def person(self) -> str:
        identity = str(uuid.uuid4())
        with self.databases.for_tenant(self.tenant_id) as connection:
            connection.execute("INSERT INTO identity (identity_id, tenant_id, email, display_name, status, created_at) VALUES (%s,%s,%s,'x','active',%s)",
                               (identity, self.tenant_id, f"{identity}@example.com", db.now()))
        return identity

    def join(self, group: str, identity: str, role: str = "participant") -> None:
        with self.databases.for_tenant(self.tenant_id) as connection:
            ProjectSourceRepository.add_member(connection, self.tenant_id, group, identity, role)

    def card(self, text: str, case: str | None = None) -> str:
        response = self.client.post(f"/projects/{case or self.case}/docs/sense.card", json={"content": {"category": "事件", "text": text}})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["doc_id"]

    def consent(self, *docs: str, purpose: str = "group", target: str | None = None, follow: bool = True, version: int | None = None, case: str | None = None, **more):
        items = [{"project_id": case or self.case, "kind": "sense.card", "doc_id": doc, **({"version": version} if version else {})} for doc in docs]
        return self.client.post("/me/consents", json={"purpose": purpose, "target": target or self.group, "items": items, "follow_versions": follow, **more})

    def seen(self, who: str, kind: str = "group", grantee: str | None = None) -> list[tuple[str, str]]:
        found = visibility.shared_with(self.docs, self.repo, Viewer(self.tenant_id, who), kind, grantee or self.group)
        return [(item["doc_id"], item["content"]["text"]) for item in found]


class GroupConsentTests(ConsentCase):
    def test_a_member_sees_exactly_the_consented_documents_and_nothing_added_later(self):
        other_case = self.client.post("/projects", json={"name": "另一案", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        self.card("另一案的卡", other_case)
        self.assertEqual(self.consent(self.shared).status_code, 200)
        self.assertEqual(self.seen(self.viewer), [(self.shared, "分享的卡")])
        self.card("後來加的卡")
        self.assertEqual(self.seen(self.viewer), [(self.shared, "分享的卡")])
        self.assertEqual(self.seen(self.me), [])   # one's own consent is not a read path for oneself

    def test_withdrawing_empties_the_next_read_and_a_new_version_shares_again(self):
        made = self.consent(self.shared).json()
        withdrawn = self.client.post(f"/me/consents/{made['doc_id']}/withdraw").json()
        self.assertEqual((withdrawn["version"], withdrawn["content"]["withdrawn"]), (2, True))
        self.assertEqual(self.seen(self.viewer), [])
        again = self.consent(self.shared, doc_id=made["doc_id"], base_version=2).json()
        self.assertEqual((again["version"], again["content"]["withdrawn"]), (3, False))
        self.assertEqual(self.seen(self.viewer), [(self.shared, "分享的卡")])

    def test_one_who_left_and_one_never_in_see_nothing(self):
        self.consent(self.shared)
        self.join(self.group, self.outsider)
        self.repo.leave_group(self.tenant_id, self.group, self.outsider)
        self.assertEqual(self.seen(self.outsider), [])
        stranger = self.person()
        self.assertEqual(self.seen(stranger), [])
        self.repo.leave_group(self.tenant_id, self.group, self.viewer)
        self.assertEqual(self.seen(self.viewer), [])

    def test_a_consent_naming_someone_elses_case_is_refused(self):
        theirs = self.repo.create_project({"project_id": str(uuid.uuid4()), "tenant_id": self.tenant_id, "workspace_id": self.store.list_workspaces(self.tenant_id)[0]["workspace_id"],
                                           "name": "別人的", "purpose": "p", "data_classification": "Confidential", "status": "active", "version": 1,
                                           "created_by_identity_id": self.viewer, "created_at": "2026-10-08T00:00:00Z"})["project_id"]
        from ai_lego.data.events import record_log

        their_card = self.docs.save(self.tenant_id, record_log.case(theirs), "sense.card", {"category": "事件", "text": "別人的卡"}, record_log.user(self.viewer, "SENSE"))["doc_id"]
        response = self.consent(their_card, case=theirs)
        self.assertEqual((response.status_code, response.json()["detail"].split(":")[0]), (404, "CONSENT_ITEM_NOT_FOUND"))
        generic = self.client.post("/me/docs/govern.consent", json={"content": {"purpose": "group", "target": self.group, "follow_versions": True, "withdrawn": False,
                                                                                "items": [{"project_id": theirs, "kind": "sense.card", "doc_id": their_card}]}})
        self.assertEqual(generic.status_code, 404, generic.text)   # every save path runs the same check
        self.assertEqual(self.client.get("/me/consents").json(), [])

    def test_a_group_erased_while_a_consent_is_saved_leaves_no_consent_naming_it(self):
        """Codex F2: the save holds the group lock from its check to its commit; the erase waits, then takes the consent."""
        import threading
        from unittest import mock

        from ai_lego.core.domain import doc_kinds

        holding, release, real, first, outcome = threading.Event(), threading.Event(), doc_kinds.validate, threading.Lock(), {}

        def validate(*args, **kwargs):   # inside the consent's save, after its check
            if first.acquire(blocking=False):
                holding.set()
                release.wait(20)
            return real(*args, **kwargs)

        def erase():
            outcome["erased"] = self.repo.erase_group(self.tenant_id, self.group, self.me)["consents"]
        with mock.patch.object(doc_kinds, "validate", validate):
            saver = threading.Thread(target=lambda: outcome.setdefault("saved", self.consent(self.shared).status_code), daemon=True)
            saver.start()
            self.assertTrue(holding.wait(10))
            eraser = threading.Thread(target=erase, daemon=True)
            eraser.start()
            eraser.join(0.5)
            self.assertTrue(eraser.is_alive(), "the erase did not wait for the consent's save")
            release.set()
            saver.join(20)
            eraser.join(20)
        self.assertEqual((outcome["saved"], outcome["erased"]), (200, 1))
        self.assertEqual(self.client.get("/me/consents").json(), [])

    def test_a_pinned_consent_reads_its_version_and_a_following_one_the_newest(self):
        self.client.put(f"/projects/{self.case}/docs/sense.card/{self.shared}", json={"content": {"category": "事件", "text": "改過的卡"}, "base_version": 1})
        self.consent(self.shared, follow=False, version=1)
        self.assertEqual(self.seen(self.viewer), [(self.shared, "分享的卡")])
        self.consent(self.unlisted)
        self.client.put(f"/projects/{self.case}/docs/sense.card/{self.unlisted}", json={"content": {"category": "事件", "text": "新的一版"}, "base_version": 1})
        self.assertEqual(sorted(self.seen(self.viewer)), sorted([(self.shared, "分享的卡"), (self.unlisted, "新的一版")]))


class FacilitatorConsentTests(ConsentCase):
    def test_only_the_named_facilitator_inside_a_group_both_are_in(self):
        self.consent(self.shared, purpose="facilitator", target=self.facilitator)
        self.assertEqual(self.seen(self.facilitator, "facilitator", self.facilitator), [])   # not in a group with me yet
        workshop = self.client.post("/groups", json={"name": "工作坊", "purpose": "workshop"}).json()["group_id"]
        self.join(workshop, self.facilitator, "facilitator")
        self.assertEqual(self.seen(self.facilitator, "facilitator", self.facilitator), [])   # not trained (card 61): reads nothing
        make_eligible(self.docs, self.tenant_id, self.facilitator)
        self.assertEqual(self.seen(self.facilitator, "facilitator", self.facilitator), [(self.shared, "分享的卡")])
        self.assertEqual(self.seen(self.viewer, "facilitator", self.facilitator), [])   # someone else asking as them
        self.join(workshop, self.outsider, "facilitator")
        make_eligible(self.docs, self.tenant_id, self.outsider)
        self.assertEqual(self.seen(self.outsider, "facilitator", self.outsider), [])     # a facilitator not named


class RoleTests(ConsentCase):
    def run_cli(self, *args: str) -> int:
        with contextlib.redirect_stdout(io.StringIO()):
            return grant_role.main(["--tenant", self.tenant_id, "--identity", self.viewer, "--role", "appeal_handler", *args], databases=self.databases)

    def test_the_cli_grants_and_revokes_and_no_web_route_writes_roles(self):
        viewer = Viewer(self.tenant_id, self.viewer)
        self.assertFalse(visibility.is_appeal_handler(self.store, viewer))
        self.assertEqual(self.run_cli("--by", "營運者"), 0)
        self.assertTrue(visibility.is_appeal_handler(self.store, viewer))
        self.assertEqual(self.run_cli("--revoke"), 0)
        self.assertFalse(visibility.is_appeal_handler(self.store, viewer))
        api = PRODUCT_ROOT / "ai_lego" / "apps" / "api"
        writers = [f"{path.name}:{number}" for path in api.rglob("*.py") for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
                   if "identity_roles" in line or "grant_role(" in line or "revoke_role(" in line]
        self.assertEqual(writers, [])
