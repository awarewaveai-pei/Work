"""規範與脈絡: the notes are the person's (every version stays, the stance and the four checks are theirs alone); the AI only
points at facets not looked at yet and assumes no country; the hooks add guardrails from the person's words, never from labels."""

from __future__ import annotations

import json
import unittest

from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.evidence_words import CARD_CELL_KEYS, NOT_FOUND, cell
from ai_lego.core.domain.kinds.context import FACET_NAMES, FACETS, FACETS_VERSION, case_claims, claim_counts
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate
from ai_lego.platform.ai_gateway.provider import AiCompletion
from tests.unit.test_project_source_api import ProjectSourceApiTestCase


class ScriptedProvider:
    model = "test-context-model"

    def __init__(self) -> None:
        self.answer: dict = {}
        self.calls: list[tuple[str, str]] = []

    def complete(self, system, user, *, max_tokens):
        raise AssertionError("the gate asks for JSON")

    def complete_json(self, system, user, *, max_tokens, **options):
        self.calls.append((system, user))
        return AiCompletion(text=json.dumps(self.answer, ensure_ascii=False), model=self.model, input_tokens=10, output_tokens=20)


class ContextTestCase(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = ScriptedProvider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"

    def _intake(self, **extra):
        content = {"purpose": "複雜決策", "question": "合夥人又改條件，我要不要續約", "package": "個人複雜決策", **extra}
        response = self.client.post(f"{self.base}/docs/assembler.intake", json={"content": content})
        self.assertEqual(response.status_code, 200, response.text)

    def _notes(self, content, doc=None):
        if doc is None:
            response = self.client.post(f"{self.base}/docs/context.notes", json={"content": content})
        else:
            response = self.client.put(f"{self.base}/docs/context.notes/{doc['doc_id']}", json={"content": content, "base_version": doc["version"]})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _point(self, over=None):
        body = {"context": {}, **({"doc_id": over["doc_id"], "base_version": over["version"]} if over else {})}
        return self.client.post(f"{self.base}/ai/CONTEXT/point_facets", json=body)


class ContextKindTests(ContextTestCase):
    def test_the_spec_is_the_cards_fifteen_facets_with_a_version(self):
        spec = self.client.get("/blocks/context/spec").json()
        self.assertEqual(spec["version"], FACETS_VERSION)
        self.assertEqual([item["facet"] for item in spec["facets"]], [
            "地理／地形／地域", "歷史與集體記憶", "國際關係", "戰爭與武裝衝突", "國內政治情勢", "經濟", "教育狀況", "資訊環境", "認知作戰與資訊戰", "群體處境", "文化", "宗教", "法律", "倫理", "道德"])
        self.assertTrue(all(item["definition"] for item in spec["facets"]))
        self.assertEqual(len(spec["facet_questions"]), 2)
        self.assertEqual([check["key"] for check in spec["checks"]], ["rights_duties", "norm_origin", "claim_kind", "stance"])
        self.assertEqual(len(spec["public_issue"]["questions"]), 5)
        self.assertEqual(spec["own_first"]["facets"], ["文化", "宗教"])   # ask for the person's own understanding first
        self.assertIn("先寫你自己怎麼理解", spec["own_first"]["note"])
        self.assertEqual(spec["public_issue"]["package"], "公共議題判斷")

    def test_no_facet_example_is_a_war_or_a_foreign_case_and_every_facet_is_kept(self):
        """2026-10-12 walk: 「例：阿富汗禁止女性受教育」 was shown on a personal contract case. The examples are everyday ones; the list is whole."""
        self.assertEqual(len(FACETS), 15)
        self.assertNotIn("阿富汗", " ".join(definition for _, definition in FACETS))
        self.assertTrue(FACETS_VERSION >= "2026-10-12")   # a changed list is a new version (a note records the one it was written with)

    def test_every_save_is_a_new_version_and_the_notes_cannot_be_deleted(self):
        first = self._notes({"facets_version": FACETS_VERSION, "facets": [{"facet": "文化", "relevant": True, "defines_normal": "重人情", "is_cause": "可能"}], "jurisdictions": ["台灣"]})
        self.assertEqual((first["author"], first["block"], first["version"]), ("user", "CONTEXT", 1))
        second = self._notes({"facets": [], "stance": "暫時遵守", "stance_kind": "暫時遵守"}, first)
        self.assertEqual(second["version"], 2)
        self.assertEqual(self.client.post(f"{self.base}/docs/context.notes", json={"content": {"stance": "x"}}).status_code, 409)
        self.assertIn("DOC_NOT_DELETABLE", self.client.delete(f"{self.base}/docs/context.notes/{first['doc_id']}").text)
        self.assertEqual([item["version"] for item in self.client.get(f"{self.base}/docs/context.notes/{first['doc_id']}/versions").json()], [1, 2])

    def test_the_checks_the_stance_and_the_public_issue_answers_are_the_persons_alone(self):
        for field in ("rights_duties", "norm_origin", "stance_kind", "stance", "recheck_when", "interface"):
            self.assertTrue(doc_kinds.require("context.notes").fields[field].human_only, field)
        with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
            doc_kinds.validate("context.notes", {"stance": "他是對的"}, "ai")
        saved = self._notes({"interface": {"1": "在公共議題上，我的判斷權…", "3": "不確定"}, "stance_kind": "沒看見別的可能"})
        self.assertEqual(saved["content"]["interface"]["3"], "不確定")
        self.assertEqual(self.client.post(f"{self.base}/docs/context.pointers", json={"content": {}}).status_code, 403)   # the AI's pointers are not the person's to post

    def test_a_stance_outside_the_four_is_refused(self):
        self.assertEqual(self.client.post(f"{self.base}/docs/context.notes", json={"content": {"stance_kind": "無所謂"}}).status_code, 400)

    def test_a_colleague_reaches_none_of_it(self):
        import uuid
        self._notes({"stance": "x"})
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(self.client.get(f"{self.base}/docs/context.notes").status_code, 404)
        self.assertEqual(self._point().status_code, 404)


class CaseClaimsTests(ContextTestCase):
    """2026-10-12 walk: 「目前標了：事實 0、法律 0」 while VERIFY held a claim tagged 法律. One case = one set of claims, whichever list it was
    written in; a claim carried from MAP to VERIFY is one claim."""

    def _map(self, claims):
        response = self.client.post(f"{self.base}/docs/map.map", json={"content": {"claims": claims}})
        self.assertEqual(response.status_code, 200, response.text)

    def _claim(self, **content):
        response = self.client.post(f"{self.base}/docs/verify.claim", json={"content": content})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _read(self):
        response = self.client.get(f"{self.base}/context/claims")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_a_law_claim_written_only_in_verify_is_counted(self):
        self._claim(text="民法允許合夥一方自行調整分潤比例", sentence="可以查的事實", law=True, **{"from": "我加的"})
        shown = self._read()
        self.assertEqual(shown["counts"], {"事實": 0, "法律": 1, "價值": 0, "文化宗教": 0, "其他": 0})
        self.assertEqual([(item["from"], item["kind"], item["missing"]) for item in shown["claims"]], [("VERIFY", "法律", ["適用法域", "時效", "來源"])])

    def test_the_two_lists_are_one_set_and_a_claim_carried_over_counts_once(self):
        self._map([{"id": "m1", "text": "他三次改價", "kind": "事實", "by": "user"},
                   {"id": "m2", "text": "合約須用書面", "kind": "法律", "by": "user", "details": {"jurisdiction": "台灣"}},
                   {"id": "m3", "text": "守約比賺錢重要", "kind": "價值", "by": "user"}])
        self._claim(text="他三次改價", sentence="可以查的事實", law=True, jurisdiction="台灣", limitation="十五年", law_source="民法第125條", map_claim="m1", **{"from": "MAP"})
        self._claim(text="快轉給家人", sentence="叫你去做的事", **{"from": "我加的"})
        shown = self._read()
        self.assertEqual(shown["counts"], {"事實": 0, "法律": 2, "價值": 1, "文化宗教": 0, "其他": 1})   # m1 is 法律 now (VERIFY says so), counted once
        by_id = {item["id"]: item for item in shown["claims"]}
        self.assertEqual((by_id["m1"]["kind"], by_id["m1"]["missing"], by_id["m1"]["from"]), ("法律", [], "MAP"))   # the details written in VERIFY count for it
        self.assertEqual(by_id["m2"]["missing"], ["時效", "來源"])
        self.assertEqual(sum(shown["counts"].values()), len(shown["claims"]))

    def test_the_count_is_the_cases_own_and_needs_a_session_of_its_owner(self):
        self.assertEqual(self._read(), {"claims": [], "counts": {"事實": 0, "法律": 0, "價值": 0, "文化宗教": 0, "其他": 0}})
        self.assertEqual(self.client.get("/projects/not-a-case/context/claims").status_code, 404)

    def test_the_rules_without_a_database(self):
        map_claims = [{"id": "a", "text": "A", "kind": "法律", "details": {"jurisdiction": "台灣", "limitation": "x", "source": "y"}}, {"id": "b", "text": "B", "kind": "文化宗教"}]
        verified = [{"doc_id": "v1", "text": "A", "sentence": "可以查的事實", "map_claim": "a"}, {"doc_id": "v2", "text": "C", "sentence": "對事實的解釋"},
                    {"doc_id": "v3", "text": "D", "sentence": "價值判斷"}, {"doc_id": "v4", "text": "E", "sentence": "可以查的事實", "law": True, "jurisdiction": "日本", "limitation": "1年", "law_source": "民法"}]
        claims = case_claims(map_claims, verified)
        self.assertEqual([(item["id"], item["kind"], item["missing"]) for item in claims], [("a", "法律", []), ("b", "文化宗教", []), ("v2", "", []), ("v3", "價值", []), ("v4", "法律", [])])
        self.assertEqual(claim_counts(claims), {"事實": 0, "法律": 2, "價值": 1, "文化宗教": 1, "其他": 1})

    def test_two_verify_claims_made_from_one_map_claim_share_their_details(self):
        both = [{"doc_id": "v1", "text": "A", "sentence": "可以查的事實", "map_claim": "a", "law": True, "jurisdiction": "台灣", "limitation": "十五年", "law_source": "民法"},
                {"doc_id": "v2", "text": "A", "sentence": "可以查的事實", "map_claim": "a"}]
        for order in (both, both[::-1]):
            [claim] = case_claims([{"id": "a", "text": "A", "kind": "事實"}], order)
            self.assertEqual((claim["kind"], claim["missing"]), ("法律", []), order)


class ContextAiTests(ContextTestCase):
    def test_pointing_is_always_allowed_and_reads_only_what_the_card_lists(self):
        action = ai_gate.actions()[("CONTEXT", "point_facets")]
        self.assertEqual((action.needs, action.reads), ("point_gaps", ("assembler.intake", "map.map", "context.notes")))
        self._intake()
        self.provider.answer = {"facets": [{"facet": "文化", "why": "你寫「又改條件」，這可能是這一行的做法"}]}
        turn = self._point()   # no contract at all: point_gaps is one of the always-allowed
        self.assertEqual(turn.status_code, 200, turn.text)
        self.assertEqual((turn.json()["saved"]["author"], turn.json()["saved"]["block"]), ("ai", "CONTEXT"))

    def test_only_facets_not_looked_at_yet_are_listed_and_never_the_notes_themselves(self):
        self._intake(happened_in=["高雄"])
        self._notes({"facets": [{"facet": "文化", "relevant": True, "defines_normal": "重人情的細節", "is_cause": "可能"}, {"facet": "宗教", "relevant": False}], "stance": "我暫時遵守", "rights_duties": "合約之外我沒有義務"})
        self.provider.answer = {"facets": []}
        self.assertEqual(self._point().status_code, 200)
        user = self.provider.calls[0][1]
        self.assertIn("經濟", user)
        self.assertNotIn("什麼被當成理所當然", user)   # 文化: ticked, not listed again
        self.assertNotIn("教義、教團", user)           # 宗教: marked 無關, not listed again
        for private in ("重人情的細節", "我暫時遵守", "合約之外我沒有義務"):
            self.assertNotIn(private, user)
        self.assertEqual(user.count("高雄"), 1)         # the places come once, from the gate (the action never reads them itself)
        self.assertIn("do not assume any country", self.provider.calls[0][0])
        self.assertIn("do not speak for any party", self.provider.calls[0][0])

    def test_a_fact_from_outside_is_not_sent_but_my_own_words_are(self):
        """CONTEXT reads no source cards, so it cannot count a linked fact's origins: it holds every outside fact back
        (critic 2026-10-04 C1: the stored count went stale once an origin was marked 不用)."""
        self._intake()
        docs, owner = CaseDocs(self._repo), record_log.case(self.pid)
        cells = {key: cell(NOT_FOUND, why="沒有寫") for key in CARD_CELL_KEYS}
        cards = [docs.save(self.tenant["tenant_id"], owner, "gather.source", {"source_id": "", "url": f"https://{n}.example", "found_by": {"by": "系統找的"}, "cells": cells,
                                                                            "snapshot": {"sha256": n * 64, "fetched_at": "2026-10-04T00:00:00Z"}}, record_log.system("GATHER"))["doc_id"] for n in "ab"]
        docs.save(self.tenant["tenant_id"], owner, "gather.origins", {"groups": [{"cards": [card], "how": "單獨"} for card in cards], "rules_version": "1"}, record_log.system("GATHER"))
        mine = {"id": "f1", "text": "合夥人第三次改條件", "by": "user", "sources": 0, "self_said": True}
        thin = {"id": "f2", "text": "網路上說同業都這樣改", "by": "user", "sources": 0, "self_said": False}
        linked = {"id": "f3", "text": "公告寫明下月調價", "by": "user", "sources": 2, "self_said": False, "cards": cards}
        saved = self.client.post(f"{self.base}/docs/map.map", json={"content": {"layers": {"facts": [mine, thin, linked, {"text": "沒有編號的外部說法", "self_said": False}]}}})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.provider.answer = {"facets": []}
        self.assertEqual(self._point().status_code, 200)
        user = self.provider.calls[0][1]
        self.assertIn("合夥人第三次改條件", user)
        self.assertNotIn("公告寫明下月調價", user)   # two origins, but CONTEXT cannot count them: held back, never trusted from the map's copy
        self.assertNotIn("網路上說同業都這樣改", user)
        self.assertNotIn("沒有編號的外部說法", user)

    def test_the_places_go_unless_the_contract_withholds_them(self):
        """規範與脈絡: 每次呼叫 AI 時，系統把發生地和你在哪裡交給 AI；你在協作合約裡可以不給."""
        self._intake(happened_in=["高雄"])
        self.provider.answer = {"facets": []}
        self._point()
        self.assertIn("高雄", self.provider.calls[0][1])
        self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"hide_places": True}})
        self._point()
        self.assertNotIn("高雄", self.provider.calls[1][1])
        self.assertIn("You were not told where", self.provider.calls[1][0])

    def test_the_answer_is_held_to_the_fifteen_and_to_five_and_an_empty_one_is_kept_as_empty(self):
        self._intake()
        self.provider.answer = {"facets": [{"facet": "不存在的面向", "why": "x"}, {"facet": "經濟", "why": "你提到續約的錢", "extra": 1}, {"facet": "經濟", "why": "again"}, *[{"facet": name, "why": "w"} for name in FACET_NAMES[:6]]]}
        saved = self._point().json()["saved"]
        self.assertEqual([item["facet"] for item in saved["content"]["facets"]], ["經濟", "地理／地形／地域", "歷史與集體記憶", "國際關係", "戰爭與武裝衝突"])
        self.provider.answer = {"facets": []}
        again = self._point(over=saved)
        self.assertEqual((again.status_code, again.json()["saved"]["content"], again.json()["saved"]["version"]), (200, {}, 2))

    def test_a_crisis_in_what_it_would_send_stops_it_before_any_call(self):
        """The question is not on CONTEXT's read list (card: 發生地、你在哪裡、當事人各在哪裡、目的、MAP 的地圖), so it never
        reaches the model; a crisis word in a place or a map line does, and stops it."""
        self._intake(question="我撐不下去，想結束自己")
        self.client.post(f"{self.base}/docs/map.map", json={"content": {"layers": {"facts": [{"id": "f1", "text": "他第三次改條件", "by": "user", "sources": 0, "self_said": True}]}}})
        self.provider.answer = {"facets": []}
        self.assertEqual(self._point().status_code, 200)
        self.assertNotIn("撐不下去", self.provider.calls[0][1])
        intake = self.client.get(f"{self.base}/docs/assembler.intake").json()[0]
        self.client.put(f"{self.base}/docs/assembler.intake/{intake['doc_id']}", json={"content": {**intake["content"], "others_in": ["想結束自己的那個人在台中"]}, "base_version": intake["version"]})
        turn = self._point().json()
        self.assertEqual(turn["stopped"], "crisis")
        self.assertEqual(len(self.provider.calls), 1)

    def test_with_nothing_to_read_or_nothing_left_to_point_at_the_model_is_not_called(self):
        self.assertEqual(self._point().status_code, 400)   # no purpose, no map yet
        self._intake()
        self._notes({"facets": [{"facet": name, "relevant": False} for name in FACET_NAMES]})
        self.assertEqual(self._point().status_code, 400)
        self.assertEqual(self.provider.calls, [])


class ContextHookTests(ContextTestCase):
    def test_a_high_risk_word_the_person_wrote_adds_guardrails_but_a_facet_label_does_not(self):
        quiet = self._notes({"facets": [{"facet": "法律", "relevant": False}, {"facet": "經濟", "relevant": True, "defines_normal": "照月結", "is_cause": "不是"}]})
        self.assertEqual([n for n in quiet["notices"] if n["type"] == "guardrail"], [])
        loud = self._notes({"facets": [{"facet": "法律", "relevant": True, "defines_normal": "合約寫明可以提前終止", "is_cause": "不確定"}]}, quiet)
        self.assertEqual([n["category"] for n in loud["notices"] if n["type"] == "guardrail"], ["法律"])
        self.assertEqual({doc["content"]["found_by"] for doc in self.client.get(f"{self.base}/docs/govern.guardrail").json()}, {"CONTEXT"})

    def test_a_facet_named_by_the_person_counts_as_their_words(self):
        saved = self._notes({"facets": [{"facet": "合約糾紛", "relevant": True, "custom": True, "definition": "我自己加的"}]})
        self.assertEqual([n["category"] for n in saved["notices"] if n["type"] == "guardrail"], ["法律"])

    def test_a_crisis_word_inside_a_facet_note_brings_help(self):
        saved = self._notes({"facets": [{"facet": "群體處境", "relevant": True, "defines_normal": "我常被打", "is_cause": "是"}]})
        self.assertEqual([n["type"] for n in saved["notices"] if n["type"] == "crisis"], ["crisis"])


if __name__ == "__main__":
    unittest.main()
