"""FACILITATE's records, derived eligibility and supervision (docs/platform/STEP34_SHARED_RULES.md §5, §9, §11; card 61) on a
real PostgreSQL: a group of facilitators F and G, participants P1 P2, a supervisor S and an outsider X, each signed in on
their own client; the convener C is the default user."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from ai_lego.apps.api import main as api_main
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform import visibility
from ai_lego.platform.block_hooks.facilitate import drift_records
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.scripts import load_scripts
from ai_lego.platform.visibility import Viewer
from tests.unit.facilitator_fixture import make_eligible, run_content
from tests.unit.test_api_main import ApiTestCase

PASSWORD = "correct-horse-battery"
SCRIPT = load_scripts().items[0]


class FacilitateCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.repo = ProjectSourceRepository(self.databases)
        self.store = IdentityStore(self.databases)
        self.docs = CaseDocs(self.repo)
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: self.repo
        self.tenant_id = self.tenant["tenant_id"]
        self._login()   # the convener C
        self.group = self.client.post("/groups", json={"name": "工作坊", "purpose": "workshop"}).json()["group_id"]
        self.ids: dict[str, str] = {}
        self.clients: dict[str, TestClient] = {}
        for name, role in (("F", "facilitator"), ("G", "facilitator"), ("P1", "participant"), ("P2", "participant"), ("S", None), ("X", None)):
            self.ids[name] = self.store.create_identity(str(uuid.uuid4()), self.tenant_id, f"{name.lower()}-{uuid.uuid4().hex[:6]}@example.com", f"名字{name}", PASSWORD)["identity_id"]
            if role:
                self.join(self.group, name, role)

    def join(self, group: str, name: str, role: str) -> None:
        with self.databases.for_tenant(self.tenant_id) as connection:
            ProjectSourceRepository.add_member(connection, self.tenant_id, group, self.ids[name], role)

    def as_(self, name: str) -> TestClient:
        if name not in self.clients:
            client = TestClient(api_main.app, base_url="https://testserver")
            response = client.post("/auth/login", json={"tenant_id": self.tenant_id, "email": self.store.get_identity(self.ids[name])["email"], "password": PASSWORD})
            self.assertEqual(response.status_code, 200, response.text)
            self.clients[name] = client
        return self.clients[name]

    def viewer(self, name: str) -> Viewer:
        return Viewer(self.tenant_id, self.ids[name])

    def eligible(self, name: str) -> dict[str, str]:
        return make_eligible(self.docs, self.tenant_id, self.ids[name])

    def log(self, by: str, group: str | None = None, **more):
        content = {"group_id": group or self.group, "script": SCRIPT["id"], "script_version": SCRIPT["version"], "followed": "照稿", **more}
        return self.as_(by).post("/me/docs/facilitate.log", json={"content": content})

    def supervisor(self, name: str = "S") -> None:
        """name: trained, a facilitator of a group of their own, and one log -- an eligible supervisor."""
        own = self.client.post("/groups", json={"name": f"{name} 的班", "purpose": "class"}).json()["group_id"]
        self.join(own, name, "facilitator")
        self.eligible(name)
        self.assertEqual(self.log(name, own).status_code, 200)

    def email(self, name: str) -> str:
        return self.store.get_identity(self.ids[name])["email"]

    def name(self, supervisee: str, supervisor: str = "S"):
        return self.as_(supervisee).post("/facilitate/supervisors", json={"email": self.email(supervisor)})

    def appeal(self, text: str = "帶領的人一直打斷我"):
        return self.as_("P1").post("/me/appeals", json={"group_id": self.group, "about_identity_id": self.ids["F"], "text": text})


class EligibilityTests(FacilitateCase):
    def test_an_untrained_identity_cannot_be_set_as_facilitator_a_trained_one_can(self):
        token = self.client.post(f"/groups/{self.group}/invites", json={"role": "facilitator"}).json()["token"]
        refused = self.as_("X").post("/invites/accept", json={"token": token})
        self.assertEqual((refused.status_code, refused.json()["detail"].split(":")[0]), (403, "GROUP_FACILITATOR_NOT_TRAINED"))
        self.assertIsNone(self.repo.get_group_for(self.tenant_id, self.group, self.ids["X"]))
        visitor = TestClient(api_main.app, base_url="https://testserver").post("/invites/accept", json={"token": token, "email": "new@example.com", "display_name": "新人", "password": PASSWORD})
        self.assertEqual(visitor.status_code, 403, visitor.text)
        self.assertIsNone(self.store.identity_by_email(self.tenant_id, "new@example.com"))   # a new account is not made for a refused invitation
        for lesson in ("facilitator-how-to-lead", "facilitator-donts", "facilitator-when-to-escalate"):   # the course through the pages' own save path
            version = next(item["version"] for item in self.as_("X").get("/blocks/teach/lessons").json() if item["id"] == lesson)
            self.assertEqual(self.as_("X").post("/me/docs/teach.run", json={"content": run_content(lesson, version)}).status_code, 200)
        joined = self.as_("X").post("/invites/accept", json={"token": token})
        self.assertEqual(joined.status_code, 200, joined.text)
        self.assertEqual(self.repo.get_group_for(self.tenant_id, self.group, self.ids["X"])["my_role"], "facilitator")

    def test_eligibility_is_asked_again_after_a_lesson_run_is_deleted(self):
        runs = self.eligible("P1")
        self.assertTrue(visibility.is_eligible_facilitator(self.docs, self.viewer("P1")))
        self.assertEqual(self.as_("P1").get("/facilitate/me").json(), {"facilitator": True, "supervisor": False})
        self.assertEqual(self.as_("P1").delete(f"/me/docs/teach.run/{runs['facilitator-donts']}").status_code, 200)
        self.assertFalse(visibility.is_eligible_facilitator(self.docs, self.viewer("P1")))   # the same call, now false: nothing was remembered
        self.assertEqual(self.as_("P1").get("/facilitate/me").json(), {"facilitator": False, "supervisor": False})

    def test_a_supervisor_needs_the_course_and_a_log(self):
        self.join(self.group, "S", "facilitator")
        self.assertEqual((visibility.is_eligible_facilitator(self.docs, self.viewer("S")), visibility.is_eligible_supervisor(self.docs, self.viewer("S"))), (False, False))
        self.eligible("S")
        self.assertEqual((visibility.is_eligible_facilitator(self.docs, self.viewer("S")), visibility.is_eligible_supervisor(self.docs, self.viewer("S"))), (True, False))
        self.assertEqual(self.name("F").status_code, 404)   # trained, never led: not yet someone to name
        self.assertEqual(self.log("S").status_code, 200)
        self.assertEqual(visibility.is_eligible_supervisor(self.docs, self.viewer("S")), True)
        self.assertEqual(self.name("F").status_code, 200)

    def test_a_trained_facilitator_loses_the_participants_consented_items_with_the_training(self):
        runs = self.eligible("F")
        self.shared_card("P1", "F")
        self.assertEqual({name: len(items) for name, items in self.consented().items()}, {"P1": 1, "P2": 0})
        self.as_("F").delete(f"/me/docs/teach.run/{runs['facilitator-how-to-lead']}")
        self.assertEqual(visibility.shared_with(self.docs, self.repo, self.viewer("F"), "facilitator", self.ids["F"]), [])
        self.assertEqual({name: len(items) for name, items in self.consented().items()}, {"P1": 0, "P2": 0})

    def shared_card(self, owner: str, with_whom: str, text: str = "分享的卡") -> str:
        """The owner opens a case with two cards and consents to show only the first to ``with_whom``; returns its doc id."""
        case = self.as_(owner).post("/projects", json={"name": "我的案子", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        shown = self.as_(owner).post(f"/projects/{case}/docs/sense.card", json={"content": {"category": "事件", "text": text}}).json()["doc_id"]
        self.as_(owner).post(f"/projects/{case}/docs/sense.card", json={"content": {"category": "事件", "text": "沒分享的卡"}})
        consent = self.as_(owner).post("/me/consents", json={"purpose": "facilitator", "target": self.ids[with_whom], "follow_versions": True,
                                                              "items": [{"project_id": case, "kind": "sense.card", "doc_id": shown}]})
        self.assertEqual(consent.status_code, 200, consent.text)
        return shown

    def consented(self, by: str = "F") -> dict[str, list[dict]]:
        response = self.as_(by).get(f"/groups/{self.group}/facilitate/consented")
        self.assertEqual(response.status_code, 200, response.text)
        return {self.name_of(item["identity_id"]): item["shared"] for item in response.json()["participants"]}

    def name_of(self, identity_id: str) -> str:
        return next(name for name, found in self.ids.items() if found == identity_id)


class LogTests(FacilitateCase):
    def test_a_log_is_written_by_a_facilitator_of_its_group_for_a_script_that_exists(self):
        self.assertEqual(self.log("F").status_code, 200)
        self.assertEqual(self.log("P1").status_code, 400)   # a participant leads nothing
        self.assertEqual(self.log("X").status_code, 404)    # not in the group: the group's own 404
        self.assertEqual(self.log("F", str(uuid.uuid4())).status_code, 404)
        self.assertEqual(self.log("F", script_version=SCRIPT["version"] + 1).status_code, 400)
        self.assertEqual(self.log("F", script="no.such_script").status_code, 400)
        self.assertEqual(self.log("F", followed="", deviated=[{"what": "跳過第二步"}]).status_code, 400)   # a deviation says why
        self.assertEqual(self.log("F", followed="", deviated=[{"what": "跳過", "why": "時間不夠", "score": 3}]).status_code, 400)
        self.assertEqual(self.log("F", followed="", deviated=[]).status_code, 400)   # an empty log is no log
        self.assertEqual(self.log("F", followed="", deviated=[{"what": "跳過第二步", "why": "時間不夠"}]).status_code, 200)
        self.assertEqual(self.as_("S").post("/me/docs/facilitate.supervision_link", json={"content": {}}).status_code, 404)   # a link is not a person's record to post


class SupervisionTests(FacilitateCase):
    def setUp(self):
        super().setUp()
        self.supervisor()
        self.assertEqual(self.log("F").status_code, 200)
        self.assertEqual(self.log("G", followed="", deviated=[{"what": "G 的偏離", "why": "G 的理由"}]).status_code, 200)

    def test_the_supervisor_reads_the_supervisees_logs_and_masked_appeals_and_nothing_else(self):
        doc_id = self.appeal().json()["doc_id"]
        case = self.as_("P1").post("/projects", json={"name": "P1 的案子", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        self.assertEqual(self.name("F").status_code, 200)
        self.assertEqual([item["supervisee"] for item in self.as_("S").get("/facilitate/supervisees").json()], [self.ids["F"]])
        logs = self.as_("S").get(f"/facilitate/supervisees/{self.ids['F']}/logs").json()
        self.assertEqual([item["content"]["followed"] for item in logs], ["照稿"])
        [seen] = self.as_("S").get(f"/facilitate/supervisees/{self.ids['F']}/appeals").json()
        self.assertEqual((seen["doc_id"], set(seen)), (doc_id, set(visibility.MASKED_KEYS)))
        unknown = self.as_("S").get(f"/facilitate/supervisees/{uuid.uuid4()}/logs")
        for other in ("G", "P1", "X"):   # another facilitator, a participant, an outsider: all the answer of a person who is not there
            for path in ("logs", "appeals"):
                with self.subTest(other=other, path=path):
                    answer = self.as_("S").get(f"/facilitate/supervisees/{self.ids[other]}/{path}")
                    self.assertEqual((answer.status_code, answer.json()), (404, unknown.json()))
        self.assertEqual(self.as_("S").get(f"/projects/{case}/docs/sense.card").status_code, 404)   # a participant's case
        self.assertEqual(self.as_("S").get(f"/groups/{self.group}/facilitate/consented").status_code, 404)   # not in that group at all
        self.assertEqual(self.as_("S").get(f"/groups/{self.group}").status_code, 404)

    def test_an_ineligible_supervisor_cannot_save_feedback(self):
        self.assertEqual(self.name("F").status_code, 200)
        saved = self.as_("S").post("/me/docs/facilitate.supervision", json={"content": {"supervisee": self.ids["F"], "feedback": "下次先問問題"}})
        self.assertEqual(saved.status_code, 200, saved.text)
        stranger = self.as_("S").post("/me/docs/facilitate.supervision", json={"content": {"supervisee": self.ids["G"], "feedback": "G 沒有找我"}})
        self.assertEqual((stranger.status_code, stranger.json()["detail"].split(":")[0]), (404, "FACILITATE_SUPERVISEE_NOT_FOUND"))
        self.eligible("X")   # trained, never led: not a supervisor, so F cannot name them
        self.assertEqual(self.name("F", "X").status_code, 404)
        self.supervisor("P2")   # P2 qualifies and is named, then loses the course
        self.assertEqual(self.name("G", "P2").status_code, 200)
        self.assertEqual(self.as_("P2").delete(f"/me/docs/teach.run/{self.eligible_runs('P2')['facilitator-donts']}").status_code, 200)
        refused = self.as_("P2").post("/me/docs/facilitate.supervision", json={"content": {"supervisee": self.ids["G"], "feedback": "我已不是督導"}})
        self.assertEqual((refused.status_code, refused.json()["detail"].split(":")[0]), (400, "FACILITATE_SUPERVISOR_NOT_ELIGIBLE"))

    def eligible_runs(self, name: str) -> dict[str, str]:
        return {item["content"]["lesson"]: item["doc_id"] for item in self.as_(name).get("/me/docs/teach.run").json()}

    def test_the_unit_assigned_link_is_invalid_when_the_supervisor_loses_eligibility(self):
        doc_id = self.appeal().json()["doc_id"]
        assigned = self.client.post(f"/groups/{self.group}/facilitate/assignments", json={"supervisee": self.ids["F"], "email": self.email("S")})
        self.assertEqual(assigned.status_code, 200, assigned.text)
        self.assertEqual([item["doc_id"] for item in self.as_("S").get("/govern/appeals").json()], [doc_id])
        self.assertEqual(self.as_("S").get(f"/facilitate/supervisees/{self.ids['F']}/logs").status_code, 200)
        [mine] = self.as_("F").get("/facilitate/supervisors").json()   # the leader sees who the unit gave them, and that it stands
        self.assertEqual((mine["assigned_by"], mine["supervisor"], mine["stands"]), ("unit", self.ids["S"], True))
        self.assertEqual([item["supervisor"] for item in self.as_("F").get(f"/groups/{self.group}/facilitate/assignments").json()], [self.ids["S"]])   # the unit note
        self.assertEqual(self.as_("P1").get(f"/groups/{self.group}/facilitate/assignments").json(), [])
        self.assertEqual(self.as_("S").delete(f"/me/docs/teach.run/{self.eligible_runs('S')['facilitator-donts']}").status_code, 200)   # S loses the course
        self.assertEqual(self.as_("S").get("/govern/appeals").json(), [])
        self.assertEqual(self.as_("S").get("/facilitate/supervisees").json(), [])
        self.assertEqual(self.as_("S").get(f"/facilitate/supervisees/{self.ids['F']}/logs").status_code, 404)
        self.assertEqual(self.as_("S").get(f"/facilitate/supervisees/{self.ids['F']}/appeals").status_code, 404)
        [mine] = self.as_("F").get("/facilitate/supervisors").json()
        self.assertFalse(mine["stands"])

    def test_a_unit_link_needs_a_convener_and_ends_when_the_leader_leaves_the_unit(self):
        body = {"supervisee": self.ids["F"], "email": self.email("S")}
        self.assertEqual(self.as_("P1").post(f"/groups/{self.group}/facilitate/assignments", json=body).status_code, 403)
        self.assertEqual(self.as_("F").post(f"/groups/{self.group}/facilitate/assignments", json=body).status_code, 403)   # the leader does not assign their own
        self.assertEqual(self.client.post(f"/groups/{self.group}/facilitate/assignments", json={**body, "supervisee": self.ids["P1"]}).status_code, 404)   # not a leader
        self.assertEqual(self.client.post(f"/groups/{self.group}/facilitate/assignments", json={**body, "email": self.email("X")}).status_code, 404)   # not a supervisor
        self.assertEqual(self.client.post(f"/groups/{self.group}/facilitate/assignments", json=body).status_code, 200)
        self.assertTrue(self.client.post(f"/groups/{self.group}/facilitate/assignments", json=body).json()["already"])
        self.assertEqual(len(self.as_("S").get("/facilitate/supervisees").json()), 1)
        self.repo.leave_group(self.tenant_id, self.group, self.ids["F"])
        self.assertEqual(self.as_("S").get("/facilitate/supervisees").json(), [])   # no longer the unit's leader: the unit's word ends with it

    def test_a_link_stands_only_for_the_person_who_could_make_it(self):
        self.assertEqual(self.name("F").status_code, 200)
        forged = {"supervisee": self.ids["G"], "supervisor": self.ids["S"], "assigned_by": "self"}   # G never named S: X wrote it
        self.docs.save(self.tenant_id, record_log.platform(self.tenant_id), "facilitate.supervision_link", forged, record_log.user(self.ids["X"], "FACILITATE"))
        unit = {**forged, "assigned_by": "unit", "group_id": self.group}   # a unit link written by someone who is not the group's convener
        self.docs.save(self.tenant_id, record_log.platform(self.tenant_id), "facilitate.supervision_link", unit, record_log.user(self.ids["P1"], "FACILITATE"))
        self.assertEqual([item["supervisee"] for item in self.as_("S").get("/facilitate/supervisees").json()], [self.ids["F"]])
        self.assertEqual(self.as_("S").get(f"/facilitate/supervisees/{self.ids['G']}/logs").status_code, 404)

    def test_a_link_is_one_and_only_its_writer_takes_it_back(self):
        self.assertEqual(self.name("F").status_code, 200)
        self.assertTrue(self.name("F").json()["already"])
        self.assertEqual(self.name("F", "F").status_code, 404)    # nobody supervises themself
        self.assertEqual(self.as_("F").post("/facilitate/supervisors", json={"email": "nobody@example.com"}).json(), self.name("F", "X").json())   # unknown and unfit answer alike
        [mine] = self.as_("F").get("/facilitate/supervisors").json()
        self.assertEqual(self.as_("S").delete(f"/facilitate/supervisors/{mine['doc_id']}").status_code, 404)
        self.assertEqual(len(self.as_("S").get("/facilitate/supervisees").json()), 1)
        self.assertEqual(self.as_("F").delete(f"/facilitate/supervisors/{mine['doc_id']}").status_code, 200)
        self.assertEqual(self.as_("S").get("/facilitate/supervisees").json(), [])

    def test_the_supervisee_reads_their_own_feedback_and_nobody_else_does(self):
        self.assertEqual((self.name("F").status_code, self.name("G").status_code), (200, 200))
        for about, text in (("F", "F 的回饋"), ("G", "G 的回饋")):
            self.assertEqual(self.as_("S").post("/me/docs/facilitate.supervision", json={"content": {"supervisee": self.ids[about], "feedback": text}}).status_code, 200)
        self.assertEqual([item["feedback"] for item in self.as_("F").get("/facilitate/feedback").json()], ["F 的回饋"])
        self.assertEqual([item["feedback"] for item in self.as_("G").get("/facilitate/feedback").json()], ["G 的回饋"])
        for other in ("P1", "X", "C"):
            self.assertEqual((self.client if other == "C" else self.as_(other)).get("/facilitate/feedback").json(), [])


class DriftTests(FacilitateCase):
    def test_drift_records_exclude_a_log_when_a_participant_did_not_consent(self):
        self.assertEqual(self.log("F", followed="照稿", deviated=[{"what": "跳過第二步", "why": "時間不夠"}]).status_code, 200)
        f, p1, p2 = self.ids["F"], self.ids["P1"], self.ids["P2"]
        records, excluded = drift_records(self.docs, self.repo, self.tenant_id, {f, p1})
        self.assertEqual((records, excluded), ([], ["not_all_consented"]))
        records, excluded = drift_records(self.docs, self.repo, self.tenant_id, {f, p1, p2})
        self.assertEqual(excluded, [])
        [record] = records
        self.assertEqual(set(record["content"]), {"script", "script_version", "deviated"})   # the deviations, never what followed
        self.assertEqual(record["content"]["deviated"], [{"what": "跳過第二步", "why": "時間不夠"}])
        self.assertEqual(drift_records(self.docs, self.repo, self.tenant_id, {p1, p2}), ([], []))   # the facilitator did not consent: nothing of theirs


class LedByTests(FacilitateCase):
    def test_a_case_naming_the_facilitator_is_known_to_them_only_while_they_lead_the_participants_group(self):
        self.eligible("F")
        for name in ("P1", "X"):
            case = self.as_(name).post("/projects", json={"name": "案", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
            saved = self.as_(name).post(f"/projects/{case}/docs/assembler.intake", json={"content": {"purpose": "複雜決策", "question": "要不要搬家", "package": "個人複雜決策",
                                                                                                       "led_by": {"facilitator_identity_id": self.ids["F"]}}})
            self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual([item["owner_identity_id"] for item in visibility.led_cases(self.docs, self.repo, self.viewer("F"))], [self.ids["P1"]])   # X is in no group F leads
        self.assertEqual(visibility.led_cases(self.docs, self.repo, self.viewer("G")), [])   # G was not named
        bad = self.as_("P2").post("/projects", json={"name": "案", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        for led_by in ({"facilitator_identity_id": self.ids["F"], "note": "自由寫的字"}, {"facilitator_identity_id": ""}, "F"):
            refused = self.as_("P2").post(f"/projects/{bad}/docs/assembler.intake", json={"content": {"purpose": "複雜決策", "question": "q", "package": "個人複雜決策", "led_by": led_by}})
            self.assertEqual(refused.status_code, 400, led_by)


class StopTests(FacilitateCase):
    def test_a_participant_who_wants_to_stop_gets_help_for_their_place_and_the_place_is_not_returned(self):
        self.assertEqual(self.as_("P1").post("/me/docs/govern.location", json={"content": {"where": "台灣"}}).status_code, 200)
        taiwan = self.as_("F").post(f"/groups/{self.group}/facilitate/stop", json={"participant": self.ids["P1"]})
        other = self.as_("F").post(f"/groups/{self.group}/facilitate/stop", json={"participant": self.ids["P2"]})
        none = self.as_("F").post(f"/groups/{self.group}/facilitate/stop", json={})
        self.assertEqual((taiwan.status_code, other.status_code, none.status_code), (200, 200, 200))
        self.assertEqual(set(taiwan.json()), {"notice", "resources", "fallback"})
        self.assertNotEqual(taiwan.json()["resources"], other.json()["resources"])   # the lines follow where the participant is ...
        self.assertEqual(other.json(), none.json())                                   # ... and a place nobody gave is the general lines
        self.assertNotIn(self.ids["P1"], taiwan.text)
        self.assertEqual(self.as_("P1").post(f"/groups/{self.group}/facilitate/stop", json={}).status_code, 403)   # a participant does not call it for others
        self.assertEqual(self.as_("X").post(f"/groups/{self.group}/facilitate/stop", json={}).status_code, 404)
        self.assertEqual(self.as_("F").post(f"/groups/{self.group}/facilitate/stop", json={"participant": self.ids["X"]}).status_code, 404)   # not in this group
