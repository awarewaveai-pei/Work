"""MAP 拆解: the map is the person's (every version stays, the core conflict is theirs alone), the AI offers placements,
other readings, a method and claim kinds as kinds of its own, and the hooks propose GATHER / VERIFY / TEACH only for what is
new. Each guard below has a test that goes red when the guard is taken out."""

from __future__ import annotations

import json
import unittest

from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.evidence_words import CARD_CELL_KEYS, NOT_FOUND, cell
from ai_lego.core.domain.kinds.map import LAYER_KEYS, thin_facts
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate, evidence
from ai_lego.platform.ai_actions.map import map_tools
from ai_lego.platform.ai_gateway.provider import AiCompletion
from ai_lego.platform.block_hooks.map import WHY_GATHER, WHY_TEACH, WHY_VERIFY
from tests.unit.test_project_source_api import ProjectSourceApiTestCase


class ScriptedProvider:
    model = "test-map-model"

    def __init__(self) -> None:
        self.answer: dict = {}
        self.calls: list[tuple[str, str]] = []

    def complete(self, system, user, *, max_tokens):
        raise AssertionError("the gate asks for JSON")

    def complete_json(self, system, user, *, max_tokens, **options):
        self.calls.append((system, user))
        return AiCompletion(text=json.dumps(self.answer, ensure_ascii=False), model=self.model, input_tokens=10, output_tokens=20)


FACT = {"id": "f1", "text": "合夥人第三次改條件", "by": "user", "sources": 0, "self_said": True, "place": "台北"}
READING = {"id": "i1", "text": "他沒把我當夥伴", "by": "user"}
OUTSIDE = {"id": "f2", "text": "網路上說他同業都這樣改", "by": "user", "sources": 0, "self_said": False}   # from outside, no source card linked: counts 0


class MapApiTestCase(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = ScriptedProvider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"

    def _grant(self, *permissions):
        self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": list(permissions)}})

    def _save_map(self, content, doc=None):
        if doc is None:
            response = self.client.post(f"{self.base}/docs/map.map", json={"content": content})
        else:
            response = self.client.put(f"{self.base}/docs/map.map/{doc['doc_id']}", json={"content": content, "base_version": doc["version"]})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _card(self, text, category="事件"):
        response = self.client.post(f"{self.base}/docs/sense.card", json={"content": {"category": category, "text": text}})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _ask(self, name, context=None, over=None):
        body = {"context": context or {}, **({"doc_id": over["doc_id"], "base_version": over["version"]} if over else {})}
        return self.client.post(f"{self.base}/ai/MAP/{name}", json=body)

    def _source_card(self, url):
        """A source card on its own grouped origin, as GATHER leaves it (the system writes both)."""
        docs, owner = CaseDocs(self._repo), record_log.case(self.pid)
        cells = {key: cell(NOT_FOUND, why="沒有寫") for key in CARD_CELL_KEYS}
        card = docs.save(self.tenant["tenant_id"], owner, "gather.source", {"source_id": "", "url": url, "title": url, "found_by": {"by": "系統找的"}, "cells": cells,
                         "snapshot": {"sha256": url.encode().hex()[:64].ljust(64, "0"), "fetched_at": "2026-10-04T00:00:00Z"}}, record_log.system("GATHER"))["doc_id"]
        current = docs.current(self.tenant["tenant_id"], owner, "gather.origins")
        groups = (current[0]["content"]["groups"] if current else []) + [{"cards": [card], "how": "單獨"}]
        docs.save(self.tenant["tenant_id"], owner, "gather.origins", {"groups": groups, "rules_version": "1"}, record_log.system("GATHER"),
                  doc_id=current[0]["doc_id"] if current else None, base_version=current[0]["version"] if current else None)
        return card

    def _proposals(self):
        return [item["propose"] for item in self.client.get(f"{self.base}/proposals").json()]


class MapKindTests(MapApiTestCase):
    def test_every_save_is_a_new_version_and_none_can_be_deleted(self):
        first = self._save_map({"layers": {"facts": [FACT]}})
        self.assertEqual((first["author"], first["block"], first["version"]), ("user", "MAP", 1))
        second = self._save_map({"layers": {"facts": [FACT, READING]}}, first)
        self.assertEqual(second["version"], 2)
        self.assertEqual(len(self.client.get(f"{self.base}/docs/map.map/{first['doc_id']}/versions").json()), 2)
        self.assertEqual(self.client.post(f"{self.base}/docs/map.map", json={"content": {"layers": {}}}).status_code, 409)   # one map: the next version, not a second map
        refused = self.client.delete(f"{self.base}/docs/map.map/{first['doc_id']}")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("DOC_NOT_DELETABLE", refused.text)
        self.assertEqual(len(self.client.get(f"{self.base}/docs/map.map").json()), 1)

    def test_the_core_conflict_is_the_persons_alone(self):
        with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
            doc_kinds.validate("map.map", {"core_conflict": "信任破裂"}, "ai")
        self.assertEqual(doc_kinds.require("map.map").authors, frozenset({"user"}))
        saved = self._save_map({"core_conflict": "我們對合作的期待不同"})
        self.assertEqual(saved["content"]["core_conflict"], "我們對合作的期待不同")

    def test_what_the_ai_offers_is_the_ais_and_the_person_cannot_post_it_as_theirs(self):
        for kind in ("map.placement", "map.alternatives", "map.method_pick", "map.claim_proposal"):
            self.assertEqual(doc_kinds.require(kind).authors, frozenset({"ai"}), kind)
            posted = self.client.post(f"{self.base}/docs/{kind}", json={"content": {}})
            self.assertEqual(posted.status_code, 403, kind)

    def test_no_kind_of_this_block_keeps_a_score(self):
        from ai_lego.data.events.record_log import SCORE_KEYS
        for kind in doc_kinds.kinds().values():
            if kind.block in ("MAP", "CONTEXT"):
                self.assertFalse(SCORE_KEYS & set(kind.fields), kind.kind)

    def test_a_fact_from_outside_with_under_two_sources_is_the_one_the_ai_stops_on(self):
        layers = {"facts": [FACT, OUTSIDE, {"id": "f3", "text": "公告寫明", "sources": 2, "self_said": False}, {"id": "f4", "text": "他說的", "sources": "x", "self_said": False},
                            {"id": "f5", "text": "沒有標記的一條", "sources": 0}, {"id": "f6", "text": "標記不是真值", "sources": True, "self_said": "true"}]}
        self.assertEqual(thin_facts(layers), ["f2", "f4", "f5", "f6"])   # only 我自己說的 or two sources passes; no mark = from outside
        self.assertEqual(thin_facts(None), [])

    def test_the_tools_to_pick_are_the_map_families_and_the_route_marks_the_used_ones(self):
        tools = map_tools()
        self.assertGreater(len(tools), 100)
        self.assertEqual(tools["systems.iceberg_model"]["name"], "冰山模型")
        self.assertEqual(self.client.get(f"{self.base}/map/methods").json()[0]["version"], next(iter(tools.values()))["version"])
        self.assertTrue(all(tool["version"] for tool in tools.values()))   # the version the map records when a tool is picked
        self.assertNotIn("decision.eisenhower_matrix", tools)   # DECIDE's, not a way to split a matter
        listed = {item["method_id"]: item for item in self.client.get(f"{self.base}/map/methods").json()}
        self.assertEqual(set(listed), set(tools))
        self.assertFalse(any(item["used"] for item in listed.values()))
        self._save_map({"method": "冰山模型", "method_id": "systems.iceberg_model"})
        repo_writer = record_log.user(self.identity["identity_id"], "MAP")
        self._repo.append_event(self.tenant["tenant_id"], self.pid, "InterpretationRequested", {"interpretation_id": "i-1", "method_id": "root_cause.fishbone"}, repo_writer)
        self._repo.append_event(self.tenant["tenant_id"], self.pid, "InterpretationRequested", {"interpretation_id": "i-2", "method_id": "systems.causal_loop_diagram"}, repo_writer)
        self._repo.append_event(self.tenant["tenant_id"], self.pid, "InterpretationCreated", {"interpretation_id": "i-1"}, record_log.ai("MAP"))
        used = {item["method_id"] for item in self.client.get(f"{self.base}/map/methods").json() if item["used"]}
        self.assertEqual(used, {"systems.iceberg_model", "root_cause.fishbone"})   # i-2 never finished: not a use

    def test_the_spec_is_the_cards_words(self):
        spec = self.client.get("/blocks/map/spec").json()
        self.assertEqual([layer["key"] for layer in spec["layers"]], list(LAYER_KEYS))
        self.assertEqual(spec["layers"][0]["question"], "到底發生了什麼？")
        self.assertEqual([item["kind"] for item in spec["claim_kinds"]], ["事實", "法律", "價值", "文化宗教"])
        self.assertEqual([detail["key"] for detail in spec["claim_kinds"][1]["details"]], ["jurisdiction", "limitation", "source"])
        self.assertEqual(len(spec["unwinnable"]["questions"]), 8)
        self.assertEqual(len(spec["unwinnable"]["reasons"]), 2)
        self.assertIn("不是 Farrell 說的", spec["unwinnable"]["reasons_reading"])   # the two reasons are his, the reading after them is ours

    def test_a_colleague_reaches_none_of_it(self):
        import uuid
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(self.client.get(f"{self.base}/map/methods").status_code, 404)
        self.assertEqual(self._ask("place").status_code, 404)


class MapAiTests(MapApiTestCase):
    def test_each_action_reads_and_needs_what_the_card_says(self):
        found = {name: action for (block, name), action in ai_gate.actions().items() if block == "MAP"}
        self.assertEqual({name: action.reads for name, action in found.items()}, {
            "place": ("sense.card", "map.map"), "alternatives": ("map.map", "context.notes", "gather.source"), "method": ("assembler.intake", "map.map"),
            "claims": ("map.map", "context.notes", "gather.source")})   # gather.source: a fact linked to source cards is counted live
        self.assertEqual({name: action.needs for name, action in found.items()}, {"place": "organize", "alternatives": "propose_options", "method": "organize", "claims": "organize"})

    def test_placing_cards_offers_only_cards_not_in_a_layer_and_the_answer_is_held_to_the_six_layers(self):
        placed, free = self._card("合夥人第三次改條件"), self._card("我很怕他生氣", "恐懼")
        self._save_map({"layers": {"facts": [{**FACT, "card": placed["doc_id"]}]}})
        self.provider.answer = {"placements": [{"card": free["doc_id"], "layer": "interests"}, {"card": free["doc_id"], "layer": "facts"}, {"card": "x", "layer": "nowhere"}, {"card": "y", "layer": "core", "extra": 1}], "note": "dropped"}
        turn = self._ask("place")
        self.assertEqual(turn.status_code, 200, turn.text)
        system, user = self.provider.calls[0]
        self.assertIn("我很怕他生氣", user)
        self.assertNotIn("合夥人第三次改條件", user)   # already placed: not sent again
        self.assertIn("a feeling, a fear", system)
        saved = turn.json()["saved"]
        self.assertEqual((saved["author"], saved["kind"], saved["block"]), ("ai", "map.placement", "MAP"))
        self.assertEqual(saved["content"]["placements"], [{"card": free["doc_id"], "layer": "interests"}, {"card": "y", "layer": "core"}])   # one per card, only the six layers

    def test_with_every_card_placed_the_model_is_not_called(self):
        card = self._card("合夥人第三次改條件")
        self._save_map({"layers": {"facts": [{**FACT, "card": card["doc_id"]}]}})
        self.assertEqual(self._ask("place").status_code, 400)
        self.assertEqual(self.provider.calls, [])

    def test_another_reading_needs_the_contract_to_grant_propose_options(self):
        self._save_map({"layers": {"facts": [FACT], "interpretations": [READING]}})
        denied = self._ask("alternatives")
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.provider.calls, [])
        self._grant("propose_options")
        self.provider.answer = {"items": [{"about": "i1", "view": "他可能在趕時間，不是不當夥伴", "check": "問他為什麼改"}, {"about": "i1", "view": ""}]}
        turn = self._ask("alternatives")
        self.assertEqual(turn.status_code, 200, turn.text)
        self.assertEqual(turn.json()["saved"]["content"]["items"], [{"about": "i1", "view": "他可能在趕時間，不是不當夥伴", "check": "問他為什麼改"}])
        self.assertIn("never as what really happened", self.provider.calls[0][0])
        self.assertIn("what a culture or a religion means or requires", self.provider.calls[0][0])   # no culture or religion defined for the person

    def test_a_fact_from_outside_with_under_two_sources_is_held_back_until_the_person_says_so(self):
        self._grant("propose_options")
        self._save_map({"layers": {"facts": [FACT, OUTSIDE]}})
        self.provider.answer = {"items": [{"about": "f1", "view": "也許是市場變了"}]}
        self._ask("alternatives")
        self.assertIn("合夥人第三次改條件", self.provider.calls[0][1])
        self.assertNotIn("網路上說他同業都這樣改", self.provider.calls[0][1])
        self._ask("alternatives", {"use_thin": ["f2"]}, over=self.client.get(f"{self.base}/docs/map.alternatives").json()[0])
        self.assertIn("網路上說他同業都這樣改", self.provider.calls[1][1])

    def test_a_fact_linked_to_source_cards_is_counted_live_and_held_back_when_its_origins_drop(self):
        """Step 2: 分到六層的來源卡 -- the count behind a fact is the system's (evidence), never the number the page sent."""
        self._grant("propose_options")
        a, b = self._source_card("https://a.example"), self._source_card("https://b.example")
        linked = {"id": "f3", "text": "公會 2019 年改了範本", "by": "user", "sources": 2, "self_said": False, "cards": [a, b]}
        self._save_map({"layers": {"facts": [FACT, linked]}})
        self.provider.answer = {"items": [{"about": "f1", "view": "也許是市場變了"}]}
        self._ask("alternatives")
        self.assertIn("公會 2019 年改了範本", self.provider.calls[0][1])
        found = evidence.origins(CaseDocs(self._repo), self.tenant["tenant_id"], record_log.case(self.pid))
        dropped = next(origin for origin in found if any(card["card"] == b for card in origin["cards"]))
        self.client.post(f"{self.base}/docs/gather.mark", json={"content": {"origin": dropped["origin_id"], "cards": [b], "mark": "不用", "reason": "查不到誰辦的"}})
        self._ask("alternatives", over=self.client.get(f"{self.base}/docs/map.alternatives").json()[0])
        self.assertNotIn("公會 2019 年改了範本", self.provider.calls[1][1])   # one origin left: held back, though the map still says 2

    def test_the_page_cannot_overstate_a_facts_sources_or_link_a_card_from_elsewhere(self):
        a = self._source_card("https://a.example")
        for fact, code in (({"id": "f3", "text": "x", "by": "user", "sources": 5, "self_said": False}, "MAP_FACT_SOURCES_WRONG"),   # critic m1: no card, no count
                           ({"id": "f3", "text": "x", "by": "user", "sources": 2, "self_said": False, "cards": [a]}, "MAP_FACT_SOURCES_WRONG"),
                           ({"id": "f3", "text": "x", "by": "user", "sources": 1, "self_said": True, "cards": [a]}, "MAP_FACT_SOURCES_WRONG"),
                           ({"id": "f3", "text": "x", "by": "user", "sources": 0, "self_said": False, "cards": ["not-a-card"]}, "MAP_FACT_CARD_UNKNOWN")):
            response = self.client.post(f"{self.base}/docs/map.map", json={"content": {"layers": {"facts": [fact]}}})
            self.assertEqual(response.status_code, 400, response.text)
            self.assertIn(code, response.json()["detail"])
        self._save_map({"layers": {"facts": [{"id": "f3", "text": "x", "by": "user", "sources": 1, "self_said": False, "cards": [a]}]}})

    def test_my_own_stance_never_reaches_the_model_but_the_facets_i_ticked_do(self):
        self._grant("propose_options")
        self._save_map({"layers": {"facts": [FACT]}})
        self.client.post(f"{self.base}/docs/context.notes", json={"content": {
            "facets": [{"facet": "文化", "relevant": True, "defines_normal": "我們這行重人情", "is_cause": "也許"}, {"facet": "宗教", "relevant": False}],
            "jurisdictions": ["台灣"], "stance": "我站在甲方這一邊", "stance_kind": "仍有保留", "rights_duties": "合約沒寫的我沒有義務"}})
        self.provider.answer = {"items": [{"about": "f1", "view": "也許是慣例"}]}
        self.assertEqual(self._ask("alternatives").status_code, 200)
        user = self.provider.calls[0][1]
        self.assertIn("我們這行重人情", user)
        self.assertIn("台灣", user)
        self.assertNotIn("宗教", user)   # marked 無關: not part of the lens
        for private in ("我站在甲方這一邊", "仍有保留", "合約沒寫的我沒有義務"):
            self.assertNotIn(private, user)

    def test_the_method_offered_is_one_not_used_in_this_case_and_only_a_real_tool(self):
        self._save_map({"method": "冰山模型", "method_id": "systems.iceberg_model"})
        self.provider.answer = {"picks": [{"method_id": "systems.iceberg_model", "reason": "已經用過"}, {"method_id": "made.up", "reason": "不存在"}, {"method_id": "systems.causal_loop_diagram", "reason": "你的問題有來回的影響"}]}
        turn = self._ask("method", {"used": ["systems.causal_loop_diagram"]})
        self.assertEqual(turn.status_code, 200, turn.text)
        user = self.provider.calls[0][1]
        self.assertNotIn("systems.iceberg_model —", user)    # the one in the map
        self.assertNotIn("systems.causal_loop_diagram —", user)   # the one the page says was used
        self.assertIn("root_cause.fishbone —", user)
        self.assertEqual([pick["method_id"] for pick in turn.json()["saved"]["content"]["picks"]], ["systems.iceberg_model", "systems.causal_loop_diagram"])   # unknown id dropped; the page filters the used

    def test_claims_are_marked_never_defined_and_a_culture_line_carries_no_meaning_from_the_model(self):
        self._save_map({"layers": {"facts": [FACT], "interpretations": [{"id": "i2", "text": "他們的傳統不准這樣", "by": "user"}]}})
        self.provider.answer = {"proposals": [{"item": "i2", "kind": "文化宗教", "meaning": "在該宗教裡這是禁忌"}, {"item": "i2", "kind": "法律"}, {"item": "f1", "kind": "意見"}, {"item": "f1", "kind": "事實"}]}
        turn = self._ask("claims")
        self.assertEqual(turn.status_code, 200, turn.text)
        self.assertEqual(turn.json()["saved"]["content"]["proposals"], [{"item": "i2", "kind": "文化宗教"}, {"item": "f1", "kind": "事實"}])
        self.assertIn("Never say what a law provides", self.provider.calls[0][0])

    def test_a_crisis_in_the_map_stops_the_ai_before_any_call(self):
        self._grant("propose_options")
        self._save_map({"layers": {"facts": [{**FACT, "text": "我不想活了"}]}})
        turn = self._ask("alternatives").json()
        self.assertEqual(turn["stopped"], "crisis")
        self.assertEqual(self.provider.calls, [])

    def test_the_tool_and_its_version_are_kept_with_the_map(self):
        saved = self._save_map({"method": "冰山模型", "method_id": "systems.iceberg_model", "method_version": "1.0.0"})
        self.assertEqual(saved["content"]["method_version"], "1.0.0")

    def test_a_rerun_is_the_next_version_of_the_same_offer(self):
        self._card("合夥人第三次改條件")
        self.provider.answer = {"placements": []}
        first = self._ask("place").json()["saved"]
        self.assertEqual(self._ask("place").status_code, 409)   # a second offer beside the first is refused; the page passes the earlier one
        again = self._ask("place", over=first).json()["saved"]
        self.assertEqual((again["doc_id"], again["version"]), (first["doc_id"], 2))

    def test_what_i_took_or_dropped_is_kept_and_stays(self):
        review = self.client.post(f"{self.base}/docs/map.review", json={"content": {"suggestion": "s", "version": 1, "key": "f1", "decision": "不採用"}})
        self.assertEqual((review.status_code, review.json()["author"]), (200, "user"))
        self.assertEqual(self.client.delete(f"{self.base}/docs/map.review/{review.json()['doc_id']}").status_code, 400)


class MapHookTests(MapApiTestCase):
    def test_a_gap_proposes_gather_once_and_saving_again_with_the_same_gap_proposes_nothing(self):
        first = self._save_map({"gaps": ["合約原文"]})
        self.assertEqual([(n["propose"], n["open"], n["why"]) for n in first["notices"] if n["type"] == "proposal"], [("GATHER", False, WHY_GATHER)])   # recorded; GATHER opens in step 2
        again = self._save_map({"gaps": ["合約原文"], "layers": {"facts": [FACT]}}, first)
        self.assertEqual([n for n in again["notices"] if n["type"] == "proposal"], [])
        self.assertEqual(self._proposals(), ["GATHER"])

    def test_a_declined_proposal_does_not_come_back_with_the_next_save(self):
        claims = [{"id": "c1", "text": "同業都這樣改", "kind": "事實", "by": "user"}]
        first = self._save_map({"gaps": ["合約原文"], "claims": claims})
        self.assertEqual({n["propose"] for n in first["notices"] if n["type"] == "proposal"}, {"GATHER", "VERIFY"})
        for item in self.client.get(f"{self.base}/proposals").json():
            self.client.post(f"{self.base}/docs/assembler.answer", json={"content": {"proposal": item["doc_id"], "answer": "declined"}})
        again = self._save_map({"gaps": ["合約原文"], "claims": claims, "layers": {"facts": [FACT]}}, first)
        self.assertEqual([n for n in again["notices"] if n["type"] == "proposal"], [])   # only what is new since the last version is proposed
        self.assertEqual(self._proposals(), [])

    def test_a_claim_that_can_be_checked_proposes_verify_and_a_value_does_not(self):
        value = self._save_map({"claims": [{"id": "c1", "text": "我該不該忍", "kind": "價值", "by": "user"}]})
        self.assertEqual([n["propose"] for n in value["notices"] if n["type"] == "proposal"], [])
        fact = self._save_map({"claims": [{"id": "c1", "text": "我該不該忍", "kind": "價值", "by": "user"}, {"id": "c2", "text": "同業都這樣改", "kind": "事實", "by": "ai"}]}, value)
        self.assertEqual([n["propose"] for n in fact["notices"] if n["type"] == "proposal"], ["VERIFY"])
        self.assertEqual(self.client.get(f"{self.base}/proposals").json()[0]["why"], WHY_VERIFY)
        self.assertNotIn("同業都這樣改", WHY_VERIFY)   # a proposal is never deleted: it must not carry the person's words

    def test_the_first_use_of_a_method_in_this_case_proposes_its_lesson_once(self):
        first = self._save_map({"method": "冰山模型", "method_id": "systems.iceberg_model"})
        self.assertEqual([n["propose"] for n in first["notices"] if n["type"] == "proposal"], ["TEACH"])
        self.assertEqual(self.client.get(f"{self.base}/proposals").json()[0]["why"], WHY_TEACH)
        second = self._save_map({"method": "冰山模型", "method_id": "systems.iceberg_model", "gaps": ["x"]}, first)
        self.assertEqual([n["propose"] for n in second["notices"] if n["type"] == "proposal"], ["GATHER"])   # not TEACH again
        for item in self.client.get(f"{self.base}/proposals").json():
            self.client.post(f"{self.base}/docs/assembler.answer", json={"content": {"proposal": item["doc_id"], "answer": "declined"}})   # skip the lesson
        third = self._save_map({"method": "魚骨圖", "method_id": "root_cause.fishbone"}, second)
        self.assertEqual([n["propose"] for n in third["notices"] if n["type"] == "proposal"], ["TEACH"])   # a method new to the case

    def test_a_method_id_is_a_catalog_tool_so_no_words_of_mine_become_a_proposal(self):
        """critic 2026-10-03 M2: method_id was free text and became a TEACH proposal's topic, which is never deleted."""
        refused = self.client.post(f"{self.base}/docs/map.map", json={"content": {"method": "x", "method_id": "我先生每晚的事"}})
        self.assertEqual(refused.status_code, 400, refused.text)
        self.assertEqual(self._proposals(), [])

    def test_a_declined_lesson_does_not_come_back_when_the_same_method_is_saved_again(self):
        first = self._save_map({"method": "冰山模型", "method_id": "systems.iceberg_model"})
        for item in self.client.get(f"{self.base}/proposals").json():
            self.client.post(f"{self.base}/docs/assembler.answer", json={"content": {"proposal": item["doc_id"], "answer": "declined"}})
        again = self._save_map({"method": "冰山模型", "method_id": "systems.iceberg_model", "layers": {"facts": [FACT]}}, first)
        self.assertEqual([n for n in again["notices"] if n["type"] == "proposal"], [])   # the method is not new to this case any more
        self.assertEqual(self._proposals(), [])

    def test_a_method_already_run_the_older_way_in_this_case_is_not_new(self):
        self._repo.append_event(self.tenant["tenant_id"], self.pid, "InterpretationRequested", {"interpretation_id": "i-1", "method_id": "systems.iceberg_model"}, record_log.user(self.identity["identity_id"], "MAP"))
        self._repo.append_event(self.tenant["tenant_id"], self.pid, "InterpretationCreated", {"interpretation_id": "i-1"}, record_log.ai("MAP"))
        saved = self._save_map({"method": "冰山模型", "method_id": "systems.iceberg_model"})
        self.assertEqual([n for n in saved["notices"] if n["type"] == "proposal"], [])

    def test_a_high_risk_word_in_a_line_adds_guardrails_but_a_label_does_not(self):
        quiet = self._save_map({"layers": {"facts": [{**FACT, "text": "他又說要換個時間見面"}]}, "claims": [{"id": "c1", "text": "同業的做法", "kind": "法律", "by": "user"}]})
        self.assertEqual([n for n in quiet["notices"] if n["type"] == "guardrail"], [])   # the kind 「法律」 is a label, not what the person wrote
        loud = self._save_map({"layers": {"facts": [{**FACT, "text": "他要提告"}]}}, quiet)
        self.assertEqual([n["category"] for n in loud["notices"] if n["type"] == "guardrail"], ["法律"])
        self.assertEqual({doc["content"]["found_by"] for doc in self.client.get(f"{self.base}/docs/govern.guardrail").json()}, {"MAP"})

    def test_a_crisis_word_inside_a_layer_still_brings_help(self):
        saved = self._save_map({"layers": {"facts": [{**FACT, "text": "他說要殺了他"}]}})
        self.assertEqual([n["type"] for n in saved["notices"] if n["type"] == "crisis"], ["crisis"])


if __name__ == "__main__":
    unittest.main()
