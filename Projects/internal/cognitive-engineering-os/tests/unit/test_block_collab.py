"""COLLAB's group records and routes (card 20; docs/platform/STEP34_SHARED_RULES.md §7) on a real group of three over HTTP,
on PostgreSQL: write before see, one stance per option kept with its reason, dissent nobody else removes, authority taken
back share by share, closing and reopening, a closed group, consent, membership, and no counts anywhere."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from fastapi.testclient import TestClient

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain.kinds.collab import KINDS
from ai_lego.core.domain.kinds.context import INTERFACE_QUESTIONS
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform import integrity
from ai_lego.platform.identity.store import IdentityStore
from tests.unit.test_api_main import ApiTestCase
from tests.unit.test_visibility import LEGO, REVIEWED_COUNTS, owner_uses

PASSWORD = "correct-horse-battery"
GROUP_KINDS = [spec.kind for spec in KINDS if spec.owner == "group"]
COUNT_KEYS = re.compile(r"count|votes?|tally|total|score|rank|percent|majority", re.I)


class CollabCase(ApiTestCase):
    """a = the convener, b and c = participants, each with their own signed-in client."""

    def setUp(self):
        super().setUp()
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: ProjectSourceRepository(self.databases)
        self.tenant_id = self.tenant["tenant_id"]
        self.clients: dict[str, TestClient] = {}
        self.a, self.b, self.c = (self.person(name) for name in ("甲", "乙", "丙"))
        made = self.as_(self.a).post("/groups", json={"name": "第三位合夥人", "purpose": "decision"})
        self.assertEqual(made.status_code, 200, made.text)
        self.group = made.json()["group_id"]
        for who in (self.b, self.c):
            with self.databases.for_tenant(self.tenant_id) as connection:
                ProjectSourceRepository.add_member(connection, self.tenant_id, self.group, who, "participant")
        self.base = f"/groups/{self.group}/collab"

    def person(self, name: str) -> str:
        email = f"{uuid.uuid4().hex[:8]}@example.com"
        identity = IdentityStore(self.databases).create_identity(str(uuid.uuid4()), self.tenant_id, email, name, PASSWORD)["identity_id"]
        client = TestClient(api_main.app, base_url="https://testserver")
        self.assertEqual(client.post("/auth/login", json={"tenant_id": self.tenant_id, "email": email, "password": PASSWORD}).status_code, 200)
        self.clients[identity] = client
        return identity

    def as_(self, who: str) -> TestClient:
        return self.clients[who]

    def post(self, who: str, kind: str, expect: int = 200, **content) -> dict[str, Any]:
        response = self.as_(who).post(f"{self.base}/{kind}", json={"content": content})
        self.assertEqual(response.status_code, expect, response.text)
        return response.json()

    def put(self, who: str, kind: str, doc_id: str, base_version: int, **content):
        return self.as_(who).put(f"{self.base}/{kind}/{doc_id}", json={"content": content, "base_version": base_version})

    def get(self, who: str, path: str) -> Any:
        response = self.as_(who).get(f"{self.base}/{path}")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def everything(self, who: str) -> str:
        """Every read route of the block, as one text: what this member could ever be shown."""
        bodies = [self.as_(who).get(f"{self.base}/{kind}").json() for kind in GROUP_KINDS]
        bodies += [self.as_(who).get(f"{self.base}/view/{view}").json() for view in ("dissent", "authority", "shared")]
        return json.dumps(bodies, ensure_ascii=False)

    def option(self, who: str = None, text: str = "先試做三個月") -> str:
        return self.post(who or self.a, "collab.option", round=1, text=text)["doc_id"]


class BlindTests(CollabCase):
    def test_1_before_writing_their_own_position_no_route_shows_anothers_of_that_round(self):
        mine = self.post(self.a, "collab.position", round=1, text="甲的立場：要先談錢")
        for viewer in (self.b, self.c):
            self.assertNotIn("甲的立場", self.everything(viewer))
            self.assertEqual(self.as_(viewer).get(f"{self.base}/collab.position/{mine['doc_id']}/versions").status_code, 404)

    def test_2_after_writing_they_see_all_of_that_round_and_not_of_the_next(self):
        self.post(self.a, "collab.position", round=1, text="甲的立場一")
        self.post(self.a, "collab.position", round=2, text="甲的立場二")
        self.post(self.b, "collab.position", round=1, text="乙的立場一")
        seen = {item["content"]["text"] for item in self.get(self.b, "collab.position")}
        self.assertEqual(seen, {"甲的立場一", "乙的立場一"})
        self.assertNotIn("甲的立場二", self.everything(self.b))

    def test_the_convener_is_not_exempt_and_the_interface_answers_are_blind_too(self):
        self.post(self.b, "collab.position", round=1, text="乙的立場")
        self.post(self.b, "collab.interface_answers", round=1, answers=[{"q": INTERFACE_QUESTIONS[0], "text": "乙的回答"}])
        self.assertNotIn("乙的", self.everything(self.a))
        self.post(self.a, "collab.interface_answers", round=1, answers=[{"q": INTERFACE_QUESTIONS[2], "text": "甲的回答"}])
        self.assertEqual({item["who"] for item in self.get(self.a, "collab.interface_answers")}, {"你", "乙"})

    def test_what_changed_is_written_after_ones_own_position_and_is_blind(self):
        self.assertEqual(self.as_(self.b).post(f"{self.base}/collab.change", json={"content": {"round": 1, "after_reading": "changed", "what": "x"}}).status_code, 409)
        self.post(self.b, "collab.position", round=1, text="乙")
        self.post(self.b, "collab.change", round=1, after_reading="changed", what="乙讀完改變了")
        self.assertNotIn("乙讀完改變了", self.everything(self.c))

    def test_one_position_per_round_and_a_place_only_its_writer_reads(self):
        self.post(self.b, "collab.position", round=1, text="乙")
        self.post(self.b, "collab.position", 409, round=1, text="又一份")
        self.post(self.b, "collab.place", where="高雄")
        for viewer in (self.a, self.c):
            self.assertNotIn("高雄", self.everything(viewer))
        self.assertEqual([item["content"]["where"] for item in self.get(self.b, "collab.place")], ["高雄"])


class StanceAndDissentTests(CollabCase):
    def test_3_an_objection_keeps_its_reason_one_live_stance_per_member_and_option(self):
        option = self.option()
        stance = self.post(self.b, "collab.stance", option=option, stance="異議", reason="三個月太短")
        self.assertEqual((stance["content"]["stance"], stance["content"]["reason"]), ("異議", "三個月太短"))
        self.post(self.b, "collab.stance", 409, option=option, stance="同意", reason="改主意")
        self.assertEqual(self.put(self.b, "collab.stance", stance["doc_id"], 1, option=option, stance="異議", reason="三個月太短，要半年").status_code, 200)
        self.assertEqual(len(self.as_(self.b).get(f"{self.base}/collab.stance/{stance['doc_id']}/versions").json()), 2)

    def test_stances_on_an_option_are_shown_after_marking_it_yourself(self):
        option = self.option()
        self.post(self.b, "collab.stance", option=option, stance="異議", reason="乙的理由")
        self.assertNotIn("乙的理由", self.everything(self.c))
        self.post(self.c, "collab.stance", option=option, stance="同意", reason="丙的理由")
        self.assertIn("乙的理由", self.everything(self.c))

    def test_4_a_majority_cannot_hide_a_dissent_and_the_member_chooses_how_it_is_signed(self):
        option = self.option()
        objection = self.post(self.b, "collab.stance", option=option, stance="異議", reason="這樣對新人不公平")
        self.assertEqual(objection["notices"][-1]["type"], "dissent_kept")
        for who in (self.a, self.c):
            self.post(who, "collab.stance", option=option, stance="同意", reason="可以")
            self.assertEqual(self.put(who, "collab.stance", objection["doc_id"], 1, option=option, stance="同意", reason="多數同意").status_code, 403)
            self.assertIn(self.as_(who).delete(f"{self.base}/collab.stance/{objection['doc_id']}").status_code, (403, 409))
            [kept] = self.get(who, "view/dissent")
            self.assertIn(self.as_(who).delete(f"{self.base}/collab.dissent/{kept['doc_id']}").status_code, (403, 409))
        self.assertEqual([item["content"]["stance"] for item in self.get(self.b, "collab.stance") if item["mine"]], ["異議"])
        self.assertEqual([(item["reason"], item["who"]) for item in self.get(self.a, "view/dissent")], [("這樣對新人不公平", "乙")])
        self.post(self.b, "collab.label", label="匿名")
        text = self.everything(self.a)
        self.assertEqual([item["who"] for item in self.get(self.a, "view/dissent")], ["匿名"])
        self.assertNotIn(self.b, text)
        self.assertNotIn("乙", text)
        self.put(self.b, "collab.stance", objection["doc_id"], 1, option=option, stance="同意", reason="被說服了")
        self.assertEqual([item["reason"] for item in self.get(self.a, "view/dissent")], ["這樣對新人不公平"])   # kept after a change of mind too

    def test_9_no_answer_carries_a_count_a_tally_or_a_rank(self):
        option = self.option()
        for who, said in ((self.a, "同意"), (self.b, "異議"), (self.c, "同意")):
            self.post(who, "collab.stance", option=option, stance=said, reason="理由")

        def keys(value: Any) -> set[str]:
            if isinstance(value, dict):
                return set(value) | {key for item in value.values() for key in keys(item)}
            return {key for item in value for key in keys(item)} if isinstance(value, list) else set()

        found = set().union(*(keys(json.loads(self.everything(who))) for who in (self.a, self.b, self.c)))
        self.assertEqual(sorted(key for key in found if COUNT_KEYS.search(key)), [])
        snapshot = integrity.Snapshot.live()
        self.assertEqual(integrity.no_scores(snapshot, "COLLAB") + integrity.human_only_conclusions(snapshot, "COLLAB"), [])


class AuthorityTests(CollabCase):
    def test_5_three_grant_to_a_b_takes_back_their_share_a_represents_two_and_the_scope_is_renegotiated(self):
        shares = {who: self.post(who, "collab.authority", to=self.a, scope="代表大家談合約") for who in (self.a, self.b, self.c)}
        [given] = self.get(self.c, "view/authority")["current"]
        self.assertEqual((given["to"], sorted(given["grantors"])), ("甲", sorted(["甲", "你", "乙"])))
        self.assertEqual(self.put(self.b, "collab.authority", shares[self.c]["doc_id"], 1, to=self.a, scope="代表大家談合約", revoked_by=[self.b]).status_code, 403)
        self.assertEqual(self.put(self.b, "collab.authority", shares[self.b]["doc_id"], 1, to=self.a, scope="代表大家談合約", revoked_by=[self.c]).status_code, 403)
        revoked = self.put(self.b, "collab.authority", shares[self.b]["doc_id"], 1, to=self.a, scope="代表大家談合約", revoked_by=[self.b])
        self.assertEqual(revoked.status_code, 200, revoked.text)
        self.assertEqual(revoked.json()["notices"][-1]["notice"], "範圍要重新談")
        view = self.get(self.a, "view/authority")
        [given] = view["current"]
        self.assertEqual(sorted(given["grantors"]), sorted(["你", "丙"]))   # A represents two
        self.assertEqual([(notice["to"], notice["taken_back_by"], notice["notice"]) for notice in view["renegotiate"]], [("你", "乙", "範圍要重新談")])
        self.assertEqual(self.put(self.b, "collab.authority", shares[self.b]["doc_id"], 2, to=self.a, scope="代表大家談合約", revoked_by=[]).status_code, 409)


class ClosingTests(CollabCase):
    CLOSING = {"why_end": "大家都說完了", "reopen_if": "三個月後營收沒到", "review_on": "2027-01-15", "owner": "甲"}

    def test_6_closing_needs_all_four_and_only_a_convener_writes_it(self):
        for missing in self.CLOSING:
            with self.subTest(missing=missing):
                self.post(self.a, "collab.closing", 400, **{key: value for key, value in self.CLOSING.items() if key != missing})
        self.post(self.b, "collab.closing", 403, **self.CLOSING)
        self.post(self.a, "collab.closing", **self.CLOSING)

    def test_7_any_member_reopens_the_convener_cannot_remove_it_and_the_group_stays_open(self):
        self.post(self.a, "collab.closing", **self.CLOSING)
        reopen = self.post(self.c, "collab.reopen", reason="營收的數字算錯了")
        self.assertIn(self.as_(self.a).delete(f"{self.base}/collab.reopen/{reopen['doc_id']}").status_code, (403, 409))
        self.assertEqual(self.as_(self.a).get(f"/groups/{self.group}").json()["status"], "open")
        self.assertEqual([item["content"]["reason"] for item in self.get(self.a, "collab.reopen")], ["營收的數字算錯了"])

    def test_8_a_closed_group_takes_only_reviews_consequences_and_reopen_requests(self):
        self.assertEqual(self.as_(self.a).post(f"/groups/{self.group}/close").status_code, 200)
        self.post(self.b, "collab.position", 409, round=1, text="太晚了")
        self.post(self.b, "collab.option", 409, round=1, text="新方案")
        self.post(self.b, "collab.review", text="回頭看，三個月確實太短")
        self.post(self.c, "collab.consequence", decision="試做三個月", observed="第二個月就超支")
        self.post(self.c, "collab.reopen", reason="超支了，要重談")   # COLLAB.card.txt: 任何參與者都可以提出重開

    def test_the_convener_deletes_nobody_elses_record(self):
        mine = self.post(self.b, "collab.position", round=1, text="乙")
        self.assertEqual(self.as_(self.a).delete(f"{self.base}/collab.position/{mine['doc_id']}").status_code, 403)
        self.assertEqual(self.as_(self.b).delete(f"{self.base}/collab.position/{mine['doc_id']}").status_code, 200)

    def test_the_decision_goes_to_the_conveners_own_case_as_a_pointer(self):
        closing = self.post(self.a, "collab.closing", **self.CLOSING)
        case = self.as_(self.a).post("/projects", json={"name": "我的案子", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        theirs = self.as_(self.b).post("/projects", json={"name": "乙的案子", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        self.assertEqual(self.as_(self.b).post(f"{self.base}/handoff", json={"project_id": theirs, "closing": closing["doc_id"], "to": "DECIDE"}).status_code, 403)
        self.assertEqual(self.as_(self.a).post(f"{self.base}/handoff", json={"project_id": theirs, "closing": closing["doc_id"], "to": "DECIDE"}).status_code, 404)
        made = self.as_(self.a).post(f"{self.base}/handoff", json={"project_id": case, "closing": closing["doc_id"], "to": "DECIDE"})
        self.assertEqual(made.status_code, 200, made.text)
        self.assertEqual(made.json()["content"], {"group_id": self.group, "closing": closing["doc_id"], "to": "DECIDE"})   # ids, not the words
        [pointer] = self.as_(self.a).get(f"/projects/{case}/collab/handoffs").json()
        self.assertEqual(pointer["closing"]["reopen_if"], "三個月後營收沒到")


class MembershipAndConsentTests(CollabCase):
    def routes(self, doc_id: str) -> list[tuple[str, str, dict | None]]:
        calls = [("get", f"{self.base}/{kind}", None) for kind in GROUP_KINDS] + [("post", f"{self.base}/{kind}", {"content": {}}) for kind in GROUP_KINDS]
        calls += [("get", f"{self.base}/view/{view}", None) for view in ("dissent", "authority", "shared")]
        calls += [("put", f"{self.base}/collab.option/{doc_id}", {"content": {"round": 1, "text": "x"}, "base_version": 1}),
                  ("delete", f"{self.base}/collab.option/{doc_id}", None), ("get", f"{self.base}/collab.option/{doc_id}/versions", None),
                  ("post", f"{self.base}/handoff", {"project_id": "x", "closing": "x", "to": "DECIDE"})]
        return calls

    def answers(self, who: str, doc_id: str) -> set[tuple[int, str]]:
        client = self.as_(who)
        return {(response.status_code, response.json()["detail"]) for response in
                (getattr(client, method)(path, **({"json": body} if body is not None else {})) for method, path, body in self.routes(doc_id))}

    def test_a_non_member_gets_the_missing_groups_404_from_every_route(self):
        option = self.option()
        outsider = self.person("外人")
        self.assertEqual(self.answers(outsider, option), {(404, f"GROUP_NOT_FOUND: {self.group!r}")})

    def test_a_member_who_left_reads_nothing_new_and_still_deletes_what_they_wrote(self):
        mine = self.post(self.c, "collab.option", round=1, text="丙的方案")
        self.assertEqual(self.as_(self.c).post(f"/groups/{self.group}/leave").status_code, 200)
        self.post(self.a, "collab.option", round=1, text="之後的方案")
        answers = self.answers(self.c, self.option())
        self.assertEqual(answers, {(404, f"GROUP_NOT_FOUND: {self.group!r}")})
        self.assertEqual(self.as_(self.c).delete(f"{self.base}/collab.option/{mine['doc_id']}").status_code, 200)

    def test_another_members_case_is_read_only_through_their_consent_and_only_the_parts_collab_reads(self):
        case = self.as_(self.b).post("/projects", json={"name": "乙的案子", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        mapped = self.as_(self.b).post(f"/projects/{case}/docs/map.map", json={"content": {"core_conflict": "乙的地圖：錢和信任"}}).json()
        felt = self.as_(self.b).post(f"/projects/{case}/docs/sense.card", json={"content": {"category": "感受", "text": "乙的感受：很累"}}).json()
        self.assertEqual(self.get(self.a, "view/shared"), [])
        items = [{"project_id": case, "kind": kind, "doc_id": doc["doc_id"]} for kind, doc in (("map.map", mapped), ("sense.card", felt))]
        consent = self.as_(self.b).post("/me/consents", json={"purpose": "group", "target": self.group, "items": items, "follow_versions": True})
        self.assertEqual(consent.status_code, 200, consent.text)
        shared = self.get(self.a, "view/shared")
        self.assertEqual([(item["kind"], item["who"], item["content"]["core_conflict"]) for item in shared], [("map.map", "乙", "乙的地圖：錢和信任")])
        self.assertNotIn("乙的感受", self.everything(self.a))
        self.as_(self.b).post(f"/me/consents/{consent.json()['doc_id']}/withdraw")
        self.assertEqual(self.get(self.a, "view/shared"), [])

    def test_an_erased_account_takes_its_dissent_and_renegotiation_notices_with_it(self):
        option = self.option()
        self.post(self.b, "collab.stance", option=option, stance="異議", reason="乙的異議")
        share = self.post(self.b, "collab.authority", to=self.a, scope="談合約")
        self.put(self.b, "collab.authority", share["doc_id"], 1, to=self.a, scope="談合約", revoked_by=[self.b])
        self.post(self.a, "collab.stance", option=option, stance="同意", reason="可以")
        self.assertEqual(len(self.get(self.a, "collab.dissent")), 1)
        self.assertEqual(self.as_(self.b).post("/govern/account/erase", json={"confirm": "刪除我的帳號"}).status_code, 200)
        self.assertEqual((self.get(self.a, "collab.dissent"), self.get(self.a, "collab.renegotiate")), ([], []))
        self.assertEqual(self._sql("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND owner_kind='group' AND (author_identity_id=%s OR payload_json::text LIKE %s)",
                                   self.tenant_id, self.b, "%乙的%")[0][0], 0)


class ContractTests(CollabCase):
    def test_the_interface_questions_are_the_cards_own(self):
        text = (PRODUCT_ROOT / "docs" / "platform" / "step34-cards" / "COLLAB.card.txt").read_text(encoding="utf-8")
        on_card = tuple(re.findall(r"^[①②③④⑤⑥⑦⑧⑨](.+)$", text, re.M))
        self.assertEqual(on_card, INTERFACE_QUESTIONS)

    def test_an_answer_to_a_question_not_asked_or_twice_is_refused(self):
        for answers in ([{"q": "自己編的問題", "text": "x"}], [{"q": INTERFACE_QUESTIONS[0], "text": "x"}] * 2, []):
            self.post(self.b, "collab.interface_answers", 400, round=1, answers=answers)

    def test_no_route_of_collab_builds_a_person_or_group_owner_outside_the_reviewed_list(self):
        found = {key: count for key, count in owner_uses(LEGO).items() if key[0].endswith("/collab.py")}
        self.assertTrue(found)
        self.assertEqual({key: count for key, count in found.items() if REVIEWED_COUNTS.get(key) != count}, {})
