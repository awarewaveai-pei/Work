"""Appeals (docs/platform/STEP34_SHARED_RULES.md §9, card 30) on a real PostgreSQL: a group of facilitator F, participants
P1 P2, an appeal handler H and an outsider X, each signed in on their own client."""

from __future__ import annotations

import json
import uuid

from fastapi.testclient import TestClient

from ai_lego.apps.api import main as api_main
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform import visibility
from ai_lego.platform.erasure import Erasure
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.scripts import load_scripts
from tests.pg import dump
from tests.unit.facilitator_fixture import make_eligible
from tests.unit.test_api_main import ApiTestCase

PASSWORD = "correct-horse-battery"


class AppealCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.repo = ProjectSourceRepository(self.databases)
        self.store = IdentityStore(self.databases)
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: self.repo
        self.tenant_id = self.tenant["tenant_id"]
        self._login()   # the convener: user@example.com
        self.group = self.client.post("/groups", json={"name": "工作坊", "purpose": "workshop"}).json()["group_id"]
        self.ids: dict[str, str] = {}
        self.clients: dict[str, TestClient] = {}
        for name, role in (("F", "facilitator"), ("P1", "participant"), ("P2", "participant"), ("H", None), ("X", None), ("S", None)):
            self.ids[name] = self.store.create_identity(str(uuid.uuid4()), self.tenant_id, f"{name.lower()}-{uuid.uuid4().hex[:6]}@example.com", f"名字{name}", PASSWORD)["identity_id"]
            if role:
                with self.databases.for_tenant(self.tenant_id) as connection:
                    ProjectSourceRepository.add_member(connection, self.tenant_id, self.group, self.ids[name], role)
        self.store.grant_role(self.tenant_id, self.ids["H"], "appeal_handler", "營運者")

    def as_(self, name: str) -> TestClient:
        if name not in self.clients:
            client = TestClient(api_main.app, base_url="https://testserver")
            identity = self.store.get_identity(self.ids[name])
            response = client.post("/auth/login", json={"tenant_id": self.tenant_id, "email": identity["email"], "password": PASSWORD})
            self.assertEqual(response.status_code, 200, response.text)
            self.clients[name] = client
        return self.clients[name]

    def appeal(self, by: str = "P1", about: str = "F", text: str = "帶領的人一直打斷我", **more):
        return self.as_(by).post("/me/appeals", json={"group_id": self.group, "about_identity_id": self.ids[about], "text": text, **more})

    def reads_nothing(self, name: str, doc_id: str) -> None:
        client = self.as_(name)
        self.assertEqual(client.get("/me/appeals").json(), [])
        self.assertEqual(client.get("/govern/appeals").json(), [])
        self.assertEqual(json.loads(client.get("/me/appeals/export").content), {"appeals": []})
        missing = client.get(f"/govern/appeals/{uuid.uuid4()}")
        found = client.get(f"/govern/appeals/{doc_id}")
        self.assertEqual((found.status_code, found.json()), (missing.status_code, missing.json()))   # not even that it exists
        self.assertEqual(found.status_code, 404)
        self.assertEqual(client.delete(f"/me/appeals/{doc_id}").status_code, 404)


class WhoReadsAnAppealTests(AppealCase):
    def test_the_facilitator_it_is_about_reads_nothing_even_as_a_handler(self):
        made = self.appeal()
        self.assertEqual(made.status_code, 200, made.text)
        self.reads_nothing("F", made.json()["doc_id"])
        self.store.grant_role(self.tenant_id, self.ids["F"], "appeal_handler", "營運者")
        self.reads_nothing("F", made.json()["doc_id"])

    def test_the_handler_reads_it_with_no_trace_of_who_wrote_it(self):
        doc_id = self.appeal().json()["doc_id"]
        [seen] = self.as_("H").get("/govern/appeals").json()
        self.assertEqual(set(seen), set(visibility.MASKED_KEYS))
        self.assertEqual((seen["doc_id"], seen["text"], seen["named"], seen["about_identity_id"]), (doc_id, "帶領的人一直打斷我", False, self.ids["F"]))
        writer = self.store.get_identity(self.ids["P1"])
        for answer in (seen, self.as_("H").get(f"/govern/appeals/{doc_id}").json()):
            text = json.dumps(answer, ensure_ascii=False)
            for trace in (self.ids["P1"], writer["email"], writer["display_name"]):
                self.assertNotIn(trace, text)

    def test_a_named_appeal_shows_its_author_to_the_handler(self):
        self.appeal(named=True)
        [seen] = self.as_("H").get("/govern/appeals").json()
        self.assertEqual((seen["named"], seen["author_identity_id"], seen["author_name"]), (True, self.ids["P1"], "名字P1"))

    def test_an_outsider_and_another_participant_read_nothing(self):
        doc_id = self.appeal().json()["doc_id"]
        for name in ("X", "P2"):
            with self.subTest(name=name):
                self.reads_nothing(name, doc_id)
        self.assertEqual(self.client.get("/govern/appeals").json(), [])   # the convener too

    def test_the_supervisor_of_the_facilitator_reads_it_masked(self):
        """S has finished the leader course and led once (a log); F names S as their supervisor; only then does S read it."""
        made = self.appeal()
        doc_id = made.json()["doc_id"]
        other = self.client.post("/groups", json={"name": "帶領者交流", "purpose": "workshop"}).json()["group_id"]
        with self.databases.for_tenant(self.tenant_id) as connection:
            ProjectSourceRepository.add_member(connection, self.tenant_id, other, self.ids["S"], "facilitator")
        make_eligible(CaseDocs(self.repo), self.tenant_id, self.ids["S"])
        script = load_scripts().items[0]
        log = self.as_("S").post("/me/docs/facilitate.log", json={"content": {"group_id": other, "script": script["id"], "script_version": script["version"], "followed": "照稿"}})
        self.assertEqual(log.status_code, 200, log.text)
        self.reads_nothing("S", doc_id)   # eligible, but nobody named S yet
        named = self.as_("F").post("/facilitate/supervisors", json={"email": self.store.get_identity(self.ids["S"])["email"]})
        self.assertEqual(named.status_code, 200, named.text)
        [seen] = self.as_("S").get("/govern/appeals").json()
        self.assertEqual(set(seen), set(visibility.MASKED_KEYS))
        self.assertEqual((seen["doc_id"], seen["text"], seen["about_identity_id"], seen["named"]), (doc_id, "帶領的人一直打斷我", self.ids["F"], False))
        for trace in (self.ids["P1"], self.store.get_identity(self.ids["P1"])["email"], "名字P1"):
            self.assertNotIn(trace, json.dumps(seen, ensure_ascii=False))
        self.assertEqual(self.as_("S").get(f"/govern/appeals/{doc_id}").status_code, 200)
        self.assertEqual(self.as_("S").get("/me/appeals").json(), [])   # not S's own
        self.reads_nothing("F", doc_id)   # the facilitator it is about still reads nothing, whoever supervises them


class TheAuthorsAppealTests(AppealCase):
    def test_the_author_reads_exports_and_deletes_and_then_nobody_reads_it(self):
        made = self.appeal(text="UNIQUE-APPEAL-WORDS").json()
        [mine] = self.as_("P1").get("/me/appeals").json()
        self.assertEqual((mine["doc_id"], mine["text"], mine["named"], mine["author_identity_id"]), (made["doc_id"], "UNIQUE-APPEAL-WORDS", False, self.ids["P1"]))
        exported = self.as_("P1").get("/me/appeals/export")
        self.assertIn("attachment", exported.headers["content-disposition"])
        self.assertEqual([item["doc_id"] for item in json.loads(exported.content)["appeals"]], [made["doc_id"]])
        self.assertEqual(self.as_("P1").delete(f"/me/appeals/{made['doc_id']}").status_code, 200)
        for name in ("P1", "H", "F"):
            self.assertEqual(self.as_(name).get("/govern/appeals" if name == "H" else "/me/appeals").json(), [])
        self.assertNotIn("UNIQUE-APPEAL-WORDS", "\n".join(dump(self.databases)))

    def test_one_who_left_the_group_still_deletes_their_appeal(self):
        doc_id = self.appeal().json()["doc_id"]
        self.repo.leave_group(self.tenant_id, self.group, self.ids["P1"])
        self.assertEqual(self.as_("P1").delete(f"/me/appeals/{doc_id}").status_code, 200)
        self.assertEqual(self.as_("H").get("/govern/appeals").json(), [])

    def test_the_account_erasure_takes_the_appeals_its_person_wrote(self):
        self.appeal(text="ERASED-WITH-ACCOUNT")
        kept = self.appeal(by="P2", text="P2 的申訴").json()["doc_id"]
        Erasure(self.repo, None, None, None).decide_person(self.tenant_id, self.ids["P1"], lambda: [])
        self.assertNotIn("ERASED-WITH-ACCOUNT", "\n".join(dump(self.databases)))
        self.assertEqual([item["doc_id"] for item in self.as_("H").get("/govern/appeals").json()], [kept])

    def test_a_crisis_in_an_appeal_shows_the_writer_the_notice(self):
        made = self.appeal(text="我不想活了").json()
        self.assertEqual([notice["type"] for notice in made["notices"]], ["crisis"])


class WhoMayAppealTests(AppealCase):
    def test_only_a_participant_about_a_facilitator_of_that_group(self):
        refused = {"outsider": self.appeal(by="X"), "about a participant": self.appeal(about="P2"), "the facilitator": self.appeal(by="F", about="F"),
                   "the convener": self.client.post("/me/appeals", json={"group_id": self.group, "about_identity_id": self.ids["F"], "text": "x"})}
        for why, response in refused.items():
            with self.subTest(why=why):
                self.assertEqual((response.status_code, response.json()["detail"].split(":")[0]), (404, "GROUP_NOT_FOUND"))
        generic = self.as_("X").post("/me/docs/govern.appeal", json={"content": {"group_id": self.group, "about_identity_id": self.ids["F"], "text": "x", "named": False}})
        self.assertEqual(generic.status_code, 404)   # no other save path writes one
        self.assertEqual(self.as_("H").get("/govern/appeals").json(), [])

    def test_anonymous_by_default(self):
        self.assertIs(self.appeal().json()["content"]["named"], False)

    def test_casedocs_refuses_to_read_the_platforms_documents_any_other_way(self):
        from ai_lego.data.events import record_log
        from ai_lego.errors import InvariantViolation

        doc_id = self.appeal().json()["doc_id"]
        docs = CaseDocs(self.repo)
        for read in (lambda: docs.current(self.tenant_id, record_log.platform(self.tenant_id), "govern.appeal"),
                     lambda: docs.versions(self.tenant_id, record_log.platform(self.tenant_id), "govern.appeal", doc_id)):
            with self.assertRaisesRegex(InvariantViolation, "^DOC_PLATFORM_READ_NEEDS_VISIBILITY"):
                read()
        with self.assertRaisesRegex(InvariantViolation, "^DOC_NOT_YOURS"):
            docs.delete(self.tenant_id, record_log.platform(self.tenant_id), "govern.appeal", doc_id, record_log.user(self.ids["F"], "GOVERN"))
