"""THINK 共思考 and 協作合約 (build step 1): the person writes first (the API refuses an AI turn for a round with no version of
their own), every AI turn needs the permission its role needs, what the AI gives is its own kind and always 「它自己說的」, an AI
batch is laid out as AI-authored cards once, and the web page's tables are the engine's."""

from __future__ import annotations

import json
import re
import unittest
import uuid

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.kinds import collab_contract
from ai_lego.core.domain.kinds import think as kinds
from ai_lego.errors import InvariantViolation
from ai_lego.core.domain.evidence_words import CARD_CELL_KEYS, NOT_FOUND, cell
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform import ai_gate
from ai_lego.platform.ai_actions import think as actions
from ai_lego.platform.ai_gateway.provider import AiCompletion
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

WEB = PRODUCT_ROOT / "apps" / "cognitive-web" / "components" / "blocks"


def cards(count: int, methods=kinds.DIVERGE_METHODS, **extra) -> list[dict]:
    return [{"claim": f"方向{index}", "mechanism": "怎麼運作", "benefit": "好處", "risk": "風險", "assumption": "要驗證的假設", **({"method": methods[index % len(methods)]} if methods else {}), **extra} for index in range(count)]


ANSWERS = {
    "mirror": {"sections": [{"title": "事實", "items": ["他第三次改條件"]}, {"title": "情緒", "items": ["生氣"]}], "question": "哪一點最讓你在意？"},
    "audit": {"sections": [{"title": "已知", "items": ["他改了三次"]}, {"title": "猜測", "items": ["他想逼我退出"]}]},
    "socratic": {"question": "這件事你真正想弄清楚的是什麼？"},
    "ask_conclusion": {"question": "現在你的結論是什麼？什麼會改變它？"},
    "look_back": {"sections": [{"title": "思考強項", "items": ["你先寫了假設", "你找了反例"]}, {"title": "下次練習點", "items": ["多寫一個我不知道"]}]},
    "criteria": {"sections": [{"title": "判準", "items": ["能不能反悔？"]}], "premise": "你有兩個以上的選項", "fails_when": "選項其實只有一個"},
    "diverge": {"cards": cards(10)},
    "counter": {"cards": cards(3, kinds.COUNTER_ANGLES)},
    "direct_advice": {"cards": cards(2, (), premise="他還願意談", fails_when="他已經決定退出")},
}
ALWAYS_ACTIONS = ("mirror", "audit", "socratic", "ask_conclusion", "look_back")
GRANT_NEEDED = {"diverge": "propose_options", "counter": "counter", "criteria": "propose_options", "direct_advice": "direct_advice"}


class ThinkProvider:
    model = "test-think-model"

    def __init__(self) -> None:
        self.answer: dict = {}
        self.calls: list[tuple[str, str]] = []

    def complete(self, system, user, *, max_tokens):
        raise AssertionError("the gate asks for JSON")

    def complete_json(self, system, user, *, max_tokens, **options):
        self.calls.append((system, user))
        return AiCompletion(text=json.dumps(self.answer, ensure_ascii=False), model=self.model, input_tokens=10, output_tokens=20)


NO_LEDGER = type("NoLedger", (), {"claims": staticmethod(lambda: [])})()


class ThinkApiTests(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = ThinkProvider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"
        self.contract: dict | None = None

    def _round(self, problem="要不要接這個案子", own=("觀察：他第三次改條件",), pid=None, **extra) -> dict:
        content = {"problem": problem, **({"own": list(own)} if own else {}), **extra}
        response = self.client.post(f"/projects/{pid or self.pid}/docs/think.round", json={"content": content})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _set_round(self, doc: dict, **fields) -> dict:
        response = self.client.put(f"{self.base}/docs/think.round/{doc['doc_id']}", json={"content": {**doc["content"], **fields}, "base_version": doc["version"]})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _grant(self, *permissions: str) -> None:
        """The case's contract with exactly these permissions (a new version when one exists)."""
        content = {"permissions": list(permissions)}
        if self.contract is None:
            response = self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": content})
        else:
            response = self.client.put(f"{self.base}/docs/collab_contract.terms/{self.contract['doc_id']}", json={"content": content, "base_version": self.contract["version"]})
        self.assertEqual(response.status_code, 200, response.text)
        self.contract = response.json()

    def _ask(self, action: str, round_id: str | None, **context):
        return self.client.post(f"{self.base}/ai/THINK/{action}", json={"context": {**({"round": round_id} if round_id else {}), **context}})

    def _answer(self, action: str, round_id: str, answer: dict | None = None, **context) -> dict:
        self.provider.answer = ANSWERS[action] if answer is None else answer
        response = self._ask(action, round_id, **context)
        self.assertEqual(response.status_code, 200, (action, response.text))
        return response.json()["saved"]

    def _cards(self) -> list[dict]:
        return self.client.get(f"{self.base}/docs/think.card").json()

    def _answer_in(self, pid: str, action: str) -> dict:
        round_ = self._round(pid=pid)
        self.provider.answer = ANSWERS[action]
        response = self.client.post(f"/projects/{pid}/ai/THINK/{action}", json={"context": {"round": round_["doc_id"]}})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["saved"]

    def _card(self, round_id: str, claim: str = "我自己的想法", pid: str | None = None) -> dict:
        response = self.client.post(f"/projects/{pid or self.pid}/docs/think.card", json={"content": {"claim": claim, "round": round_id}})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _react(self, card: dict, expect: int = 200, **fields) -> dict:
        response = self.client.post(f"{self.base}/docs/think.reaction", json={"content": {"card": card["doc_id"], **fields}})
        self.assertEqual(response.status_code, expect, response.text)
        return response.json()

    def _put_reaction(self, reaction: dict, content: dict, expect: int = 200) -> dict:
        response = self.client.put(f"{self.base}/docs/think.reaction/{reaction['doc_id']}", json={"content": content, "base_version": reaction["version"]})
        self.assertEqual(response.status_code, expect, response.text)
        return response.json()

    # -- 先想再看 -----------------------------------------------------------------------------------------------------------
    def test_the_ai_waits_for_my_own_version(self):
        self._grant(*collab_contract.GRANTABLE)
        empty = self._round(own=())
        for action in kinds.ACTION_FACETS:
            if action == "direct_advice":
                continue
            refused = self._ask(action, empty["doc_id"])
            self.assertEqual(refused.status_code, 400, (action, refused.text))
            self.assertIn("THINK_OWN_VERSION_REQUIRED", refused.json()["detail"])
        self.assertEqual(self.provider.calls, [])
        label_only = self._set_round(empty, own=["觀察：  ", "我不知道："])   # a label with nothing after it is nothing
        self.assertEqual(self._ask("mirror", empty["doc_id"]).status_code, 400)
        self._set_round(label_only, own=["我不知道：他到底想不想談"])
        self._answer("mirror", empty["doc_id"])
        self.assertEqual(len(self.provider.calls), 1)
        self.assertIn("他到底想不想談", self.provider.calls[0][1])

    def test_own_texts_counts_only_what_is_written_after_the_label(self):
        self.assertEqual(actions.own_texts({"own": ["觀察：", "觀察：x", "隨便寫", "  ", "我不知道： y "]}), ["觀察：x", "隨便寫", "我不知道： y"])
        self.assertEqual(actions.own_texts({}), [])

    def test_a_round_of_mine_is_needed_and_only_in_this_case(self):
        self._grant(*collab_contract.GRANTABLE)
        for context in ({}, {"round": "no-such-round"}, {"round": 7}):
            refused = self.client.post(f"{self.base}/ai/THINK/mirror", json={"context": context})
            self.assertEqual(refused.status_code, 400, refused.text)
            self.assertIn("THINK_ROUND_REQUIRED", refused.json()["detail"])
        other = self._create_project(name="另一個案子")["project_id"]
        elsewhere = self._round(pid=other)
        self.assertEqual(self._ask("mirror", elsewhere["doc_id"]).status_code, 400)
        self.assertEqual(self.provider.calls, [])

    def test_direct_advice_skips_my_version_but_needs_its_permission(self):
        round_ = self._round(own=())
        self.provider.answer = ANSWERS["direct_advice"]
        refused = self._ask("direct_advice", round_["doc_id"])
        self.assertEqual(refused.status_code, 403, refused.text)
        self.assertIn("AI_PERMISSION_DENIED", refused.json()["detail"])
        self.assertEqual(self.provider.calls, [])
        self._grant("direct_advice")
        saved = self._answer("direct_advice", round_["doc_id"])
        self.assertEqual((saved["kind"], saved["author"]), ("think.batch", "ai"))
        self.assertEqual(len(saved["content"]["cards"]), 2)
        self.assertTrue(all(card["premise"] and card["fails_when"] for card in saved["content"]["cards"]))
        self.assertIn('"own_version": []', self.provider.calls[0][1])

    def test_advice_without_its_premise_or_how_it_fails_is_refused(self):
        self._grant("direct_advice")
        round_ = self._round(own=())
        self.provider.answer = {"cards": [{**card, "fails_when": ""} for card in ANSWERS["direct_advice"]["cards"]]}
        self.assertEqual(self._ask("direct_advice", round_["doc_id"]).status_code, 422)
        self.assertEqual(self._cards(), [])

    # -- 協作合約 --------------------------------------------------------------------------------------------------------------
    def test_the_contract_decides_which_turns_run(self):
        round_ = self._round()
        self.assertEqual({action: ai_gate.actions()[("THINK", action)].needs for action in kinds.ACTION_FACETS},
                         {**{action: "organize" for action in ("mirror", "audit", "look_back")}, **{action: "ask" for action in ("socratic", "ask_conclusion")}, **GRANT_NEEDED})
        for action in GRANT_NEEDED:
            self.provider.answer = ANSWERS[action]
            refused = self._ask(action, round_["doc_id"])
            self.assertEqual(refused.status_code, 403, (action, refused.text))
            self.assertIn("AI_PERMISSION_DENIED", refused.json()["detail"])
        self.assertEqual(self.provider.calls, [])
        for action in ALWAYS_ACTIONS:
            self._answer(action, round_["doc_id"])
        self.assertEqual(len(self.provider.calls), len(ALWAYS_ACTIONS))
        self._grant("counter")
        self.assertEqual(self._ask("diverge", round_["doc_id"]).status_code, 403)   # one permission is not another
        self._answer("counter", round_["doc_id"])
        self._grant("counter", "propose_options", "direct_advice")
        for action in ("diverge", "criteria", "direct_advice"):
            self._answer(action, round_["doc_id"])

    def test_a_revoked_permission_stops_the_next_turn(self):
        round_ = self._round()
        self._grant("counter")
        self._answer("counter", round_["doc_id"])
        self._grant()
        refused = self._ask("counter", round_["doc_id"])
        self.assertEqual(refused.status_code, 403)
        versions = self.client.get(f"{self.base}/docs/collab_contract.terms/{self.contract['doc_id']}/versions").json()
        self.assertEqual([item["content"].get("permissions") for item in versions], [["counter"], None])

    def test_the_places_switch_is_a_version_of_the_contract_like_every_other_change(self):
        self._grant("counter")
        url = f"{self.base}/docs/collab_contract.terms/{self.contract['doc_id']}"
        held_back = self.client.put(url, json={"content": {"permissions": ["counter"], "hide_places": True}, "base_version": 1})
        self.assertEqual(held_back.status_code, 200, held_back.text)
        self.assertEqual(self.client.put(url, json={"content": {"permissions": ["counter"], "hide_places": "yes"}, "base_version": 2}).status_code, 400)
        self.assertEqual(self.client.put(url, json={"content": {"permissions": ["counter"]}, "base_version": 2}).status_code, 200)
        versions = self.client.get(f"{url}/versions").json()
        self.assertEqual([item["content"].get("hide_places") for item in versions], [None, True, None])

    # -- 它自己說的 -------------------------------------------------------------------------------------------------------------
    def test_nothing_the_ai_says_has_a_source(self):
        round_ = self._round()
        saved = self._answer("mirror", round_["doc_id"], {**ANSWERS["mirror"], "sourced": "有來源"})
        self.assertEqual(saved["content"]["sourced"], "它自己說的")
        self._grant("propose_options")
        batch = self._answer("diverge", round_["doc_id"], {**ANSWERS["diverge"], "sourced": "有來源"})
        self.assertEqual(batch["content"]["sourced"], "它自己說的")
        self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]})
        self.assertEqual({card["content"]["sourced"] for card in self._cards()}, {"它自己說的"})

    def test_the_ai_saves_its_own_kinds_never_my_round_or_my_cards(self):
        self.assertEqual({action.output_kind for key, action in ai_gate.actions().items() if key[0] == "THINK"}, {"think.reply", "think.batch"})
        round_spec = doc_kinds.require("think.round")
        self.assertEqual(round_spec.authors, frozenset({"user"}))
        self.assertEqual({name for name, field in round_spec.fields.items() if field.human_only}, {"problem", "own", "reflection"})
        with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
            doc_kinds.validate("think.round", {"problem": "x"}, "ai")
        for kind in ("think.batch", "think.reply"):
            forged = self.client.post(f"{self.base}/docs/{kind}", json={"content": {"round": "r", "action": "mirror", "role": "鏡子", "sourced": "有來源"}})
            self.assertEqual(forged.status_code, 403, (kind, forged.text))

    # -- 發散 -------------------------------------------------------------------------------------------------------------------
    def test_diverge_gives_eight_to_fifteen_directions_with_four_methods(self):
        self._grant("propose_options")
        round_ = self._round()
        for answer in ({"cards": cards(7)}, {"cards": cards(10, kinds.DIVERGE_METHODS[:3])}, {"cards": cards(12, ())}, {"cards": [{**card, "claim": "同一個"} for card in cards(10)]}):
            self.provider.answer = answer
            self.assertEqual(self._ask("diverge", round_["doc_id"]).status_code, 422, answer)
        self.assertEqual(self.client.get(f"{self.base}/docs/think.batch").json(), [])
        many = self._answer("diverge", round_["doc_id"], {"cards": cards(20) + [{"claim": "沒有發散法", "mechanism": "m", "benefit": "b", "risk": "r", "assumption": "a"}]})
        self.assertEqual(len(many["content"]["cards"]), 15)
        self.assertGreaterEqual(len({card["method"] for card in many["content"]["cards"]}), 4)
        self.assertTrue(all(card["method"] in kinds.DIVERGE_METHODS for card in many["content"]["cards"]))
        bare = {"claim": "沒有發散法", "mechanism": "m", "benefit": "b", "risk": "r", "assumption": "a"}
        kept = self._answer("diverge", round_["doc_id"], {"cards": [bare] + cards(10)})   # a direction that names no method is not one of the 8 to 15
        self.assertEqual((len(kept["content"]["cards"]), all("method" in card for card in kept["content"]["cards"])), (10, True))

    def test_a_card_missing_one_of_its_five_fields_is_dropped(self):
        self._grant("counter")
        round_ = self._round()
        short = [{key: value for key, value in card.items() if key != "risk"} for card in cards(2, kinds.COUNTER_ANGLES)]
        saved = self._answer("counter", round_["doc_id"], {"cards": short + cards(1, kinds.COUNTER_ANGLES)})
        self.assertEqual(len(saved["content"]["cards"]), 1)
        self.provider.answer = {"cards": short}
        self.assertEqual(self._ask("counter", round_["doc_id"]).status_code, 422)

    def test_the_counter_aims_at_the_item_i_marked(self):
        self._grant("counter")
        round_ = self._round(own=("觀察：他每次都改條件", "假設或替代解釋：他其實想退出"))
        self._answer("counter", round_["doc_id"], target=1)
        self.assertEqual(json.loads(self.provider.calls[-1][1].split("\n", 1)[1])["strongest_argument"], "假設或替代解釋：他其實想退出")
        for target in (5, -1, "1", True):
            self._answer("counter", round_["doc_id"], target=target)
            self.assertNotIn("strongest_argument", self.provider.calls[-1][1])

    def test_a_card_is_sourced_only_when_it_rests_on_a_checked_claim_that_origins_support(self):
        """有查證時讀 VERIFY 的主張帳本: 「有來源」 is the system's reading of the ledger, never the model's say."""
        docs, owner, me = CaseDocs(self._repo), record_log.case(self.pid), record_log.user(self.identity["identity_id"], "VERIFY")
        tenant = self.tenant["tenant_id"]
        supported = docs.save(tenant, owner, "verify.claim", {"text": "公會 2019 年改了範本", "sentence": "可以查的事實", "from": "訊息"}, me)["doc_id"]
        unsupported = docs.save(tenant, owner, "verify.claim", {"text": "同業都這樣改", "sentence": "可以查的事實", "from": "訊息"}, me)["doc_id"]
        cells = {key: cell(NOT_FOUND, why="沒有寫") for key in CARD_CELL_KEYS}
        card = docs.save(tenant, owner, "gather.source", {"source_id": "", "url": "https://a.example", "found_by": {"by": "系統找的"}, "cells": cells,
                                                         "snapshot": {"sha256": "a" * 64, "fetched_at": "2026-10-04T00:00:00Z"}}, record_log.system("GATHER"))["doc_id"]
        docs.save(tenant, owner, "gather.origins", {"groups": [{"cards": [card], "how": "單獨"}], "rules_version": "1"}, record_log.system("GATHER"))
        distrusted = docs.save(tenant, owner, "verify.claim", {"text": "公會也改了第 8 條", "sentence": "可以查的事實", "from": "訊息"}, me)["doc_id"]
        for claim in (supported, distrusted):
            docs.save(tenant, owner, "verify.stance", {"claim": claim, "claim_version": 1, "card": card, "snapshot": "a" * 64, "stance": "支持"}, me)
        docs.save(tenant, owner, "verify.verdict", {"claim": supported, "claim_version": 1, "verdict": "採信", "reason": "公告原文"}, me)
        docs.save(tenant, owner, "verify.verdict", {"claim": distrusted, "claim_version": 1, "verdict": "不採信", "reason": "只有一個出處"}, me)
        docs.save(tenant, owner, "verify.search", {"claim": unsupported, "claim_version": 1, "state": "查不到"}, record_log.system("VERIFY"))
        self._grant("propose_options")
        round_ = self._round()
        answer = cards(10)
        answer[0], answer[1], answer[2], answer[3], answer[4] = ({**answer[0], "rests_on": 1}, {**answer[1], "rests_on": 2}, {**answer[2], "rests_on": 9},
                                                              {**answer[3], "rests_on": -1}, {**answer[4], "rests_on": 3})
        batch = self._answer("diverge", round_["doc_id"], {"cards": answer})
        shown = json.loads(self.provider.calls[-1][1].split("\n", 1)[1])["checked_claims"]
        self.assertEqual([(item["n"], item["text"], item["origins_for"]) for item in shown], [(1, "公會 2019 年改了範本", 1), (2, "同業都這樣改", 0), (3, "公會也改了第 8 條", 1)])
        self.assertIn("never state it as fact", shown[2]["note"])   # the person does not trust it: said so, not left to the model
        self.assertNotIn("note", shown[0])
        self.assertEqual(shown[1]["note"], "the person has not judged this claim yet: do not state it as fact")   # the true reason, never "does not trust"
        laid = batch["content"]["cards"]
        # only a claim that may stand as a fact (evidence.usable_as_fact) gives 有來源: supported AND trusted on its current version
        self.assertEqual([(item["sourced"], item.get("rests_on")) for item in laid[:5]], [("有來源", supported)] + [("它自己說的", None)] * 4)
        schema = ai_gate.actions()[("THINK", "diverge")].output_schema["properties"]["cards"]["items"]
        self.assertNotIn("rests_on", schema["required"])   # a card that rests on nothing leaves it out
        self.assertEqual(batch["content"]["sourced"], "它自己說的")   # not every card rests on a sourced claim
        self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]})
        first = next(card for card in self._cards() if card["content"]["batch_index"] == 0)
        self.assertEqual((first["content"]["sourced"], first["content"]["rests_on"]), ("有來源", supported))
        url = f"{self.base}/docs/think.card/{first['doc_id']}"
        kept_label = self.client.put(url, json={"content": {**first["content"], "claim": "我改過的說法"}, "base_version": first["version"]})
        self.assertIn("THINK_CARD_SOURCE_GOES_WITH_WORDS", kept_label.json()["detail"])   # rewritten words cannot keep the claim's label
        body = {key: value for key, value in first["content"].items() if key != "rests_on"}
        rewritten = self.client.put(url, json={"content": {**body, "claim": "我改過的說法", "sourced": "它自己說的"}, "base_version": first["version"]})
        self.assertEqual((rewritten.status_code, rewritten.json()["author"], rewritten.json()["content"]["sourced"]), (200, "joint", "它自己說的"))

    # -- 卡 ---------------------------------------------------------------------------------------------------------------------
    def test_a_batch_becomes_ai_cards_once_and_a_deleted_one_stays_deleted(self):
        self._grant("propose_options")
        round_ = self._round()
        batch = self._answer("diverge", round_["doc_id"])
        expanded = self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]})
        self.assertEqual((expanded.status_code, expanded.json()), (200, {"created": 10}))
        found = self._cards()
        self.assertEqual(len(found), 10)
        self.assertEqual({(card["author"], card["block"], card["content"]["round"], card["content"]["role"], card["content"]["batch"]) for card in found}, {("ai", "THINK", round_["doc_id"], "發散夥伴", batch["doc_id"])})
        self.assertEqual(self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]}).json(), {"created": 0})
        self.client.delete(f"{self.base}/docs/think.card/{found[0]['doc_id']}")
        self.assertEqual(self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]}).json(), {"created": 0})
        self.assertEqual(len(self._cards()), 9)
        for card in self._cards():
            self.client.delete(f"{self.base}/docs/think.card/{card['doc_id']}")
        self.assertEqual(self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]}).json(), {"created": 0})   # every card deleted: still not laid out again
        self.assertEqual(self._cards(), [])
        notes = self.client.get(f"{self.base}/docs/think.laid_out").json()
        self.assertEqual([(note["author"], note["content"]) for note in notes], [("system", {"batch": batch["doc_id"], "created": 10})])
        self.assertEqual(self.client.delete(f"{self.base}/docs/think.laid_out/{notes[0]['doc_id']}").status_code, 400)   # the note stays
        forged = self.client.post(f"{self.base}/docs/think.laid_out", json={"content": {"batch": "x"}})
        self.assertEqual(forged.status_code, 403, forged.text)

    def test_only_a_batch_the_ai_saved_can_be_laid_out(self):
        self.assertEqual(self.client.post(f"{self.base}/think/expand", json={"batch": str(uuid.uuid4())}).status_code, 404)
        self.assertEqual(self.client.post(f"{self.base}/think/expand", json={}).status_code, 422)
        self._grant("propose_options")
        batch = self._answer("diverge", self._round()["doc_id"])
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]}).status_code, 404)
        self.assertEqual(self.client.get(f"{self.base}/docs/think.round").status_code, 404)

    def test_my_reaction_is_my_own_record_and_the_ai_card_stays_the_ais(self):
        self._grant("counter")
        batch = self._answer("counter", self._round()["doc_id"])
        self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]})
        card = self._cards()[0]
        reacted = self._react(card, reaction="反感", reason="他只是想談價", stance="維持", picked=True)
        self.assertEqual((reacted["kind"], reacted["author"], reacted["block"]), ("think.reaction", "user", "THINK"))
        after = self._cards()[0]
        self.assertEqual((after["author"], after["version"], after["content"]), ("ai", 1, card["content"]))   # still the AI's words, untouched
        self.assertEqual({"reaction", "reason", "stance", "picked"} & set(doc_kinds.require("think.card").fields), set())
        edited = self.client.put(f"{self.base}/docs/think.card/{card['doc_id']}", json={"content": {**card["content"], "claim": "我改過的主張"}, "base_version": 1}).json()
        self.assertEqual(edited["author"], "joint")   # only changing its words makes it 共同
        self.assertTrue(self.client.get(f"{self.base}/docs/think.reaction").json()[0]["content"]["picked"])

    def test_only_i_write_a_reaction_and_it_has_the_fields_the_card_names(self):
        spec = doc_kinds.require("think.reaction")
        self.assertEqual(spec.authors, frozenset({"user"}))
        self.assertEqual(set(spec.fields), {"card", "reaction", "reason", "stance", "picked"})
        with self.assertRaisesRegex(InvariantViolation, "RECORD_AUTHOR_NOT_ALLOWED"):
            doc_kinds.check_record("DocSaved", {"kind": "think.reaction", "content": {"card": "x"}}, "ai", "THINK", "case")
        card = self._card(self._round()["doc_id"])
        for bad in ({"reaction": "喜歡"}, {"stance": "同意"}, {"picked": "yes"}, {"score": 3}):
            response = self.client.post(f"{self.base}/docs/think.reaction", json={"content": {"card": card["doc_id"], **bad}})
            self.assertEqual(response.status_code, 400, (bad, response.text))

    def test_a_reaction_points_at_a_card_of_this_case(self):
        mine = self._card(self._round()["doc_id"])
        other = self._create_project(name="另一個案子")["project_id"]
        elsewhere = self._card(self._round(pid=other)["doc_id"], pid=other)
        for content in ({"card": elsewhere["doc_id"], "picked": True}, {"card": "no-such-card"}, {"card": ["x"]}, {"picked": True}):
            refused = self.client.post(f"{self.base}/docs/think.reaction", json={"content": content})
            self.assertEqual(refused.status_code, 404, (content, refused.text))
            self.assertIn("THINK_CARD_NOT_FOUND", refused.json()["detail"])
        self.client.delete(f"{self.base}/docs/think.card/{mine['doc_id']}")
        self.assertEqual(self._react(mine, 404, picked=True)["detail"][:20], "THINK_CARD_NOT_FOUND")
        self.assertEqual(self.client.get(f"{self.base}/docs/think.reaction").json(), [])

    def test_one_reaction_per_card_and_it_stays_with_its_card(self):
        round_ = self._round()["doc_id"]
        first, second = self._card(round_, "一"), self._card(round_, "二")
        mine = self._react(first, reaction="共鳴")
        self.assertIn("THINK_REACTION_ALREADY_GIVEN", self._react(first, 409, reason="再一個")["detail"])
        mine = self._put_reaction(mine, {"card": first["doc_id"], "reaction": "反感", "reason": "改了"})
        self.assertIn("THINK_REACTION_CARD_FIXED", self._put_reaction(mine, {"card": second["doc_id"], "reaction": "反感"}, 400)["detail"])
        theirs = self._react(second, picked=True)
        self.assertIn("THINK_REACTION_ALREADY_GIVEN", self._put_reaction(theirs, {"card": first["doc_id"], "picked": True}, 409)["detail"])
        self.assertEqual(sorted(item["content"]["card"] for item in self.client.get(f"{self.base}/docs/think.reaction").json()), sorted([first["doc_id"], second["doc_id"]]))

    def test_at_most_three_picks_in_a_round(self):
        round_, next_round = self._round()["doc_id"], self._round(problem="另一個問題")["doc_id"]
        cards = [self._card(round_, f"卡{index}") for index in range(5)]
        picks = [self._react(card, picked=True) for card in cards[:3]]
        maybe = self._react(cards[3], reaction="共鳴", reason="先不選")   # a reaction that picks nothing is fine
        refused = self._put_reaction(maybe, {"card": cards[3]["doc_id"], "picked": True}, 400)
        self.assertIn("THINK_PICK_LIMIT", refused["detail"])
        self._react(self._card(next_round, "另一輪的卡"), picked=True)   # the limit is per round
        self._put_reaction(picks[0], {"card": cards[0]["doc_id"], "picked": True, "reason": "還是選這張"})   # saving a picked one again is not a fourth
        self.client.delete(f"{self.base}/docs/think.card/{cards[2]['doc_id']}")   # a pick on a card that is gone counts for nothing
        self._put_reaction(maybe, {"card": cards[3]["doc_id"], "picked": True})
        self.assertIn("THINK_PICK_LIMIT", self._react(cards[4], 400, picked=True)["detail"])
        self._put_reaction(picks[1], {"card": cards[1]["doc_id"], "reaction": "共鳴"})   # take one back: there is room again
        self._react(cards[4], picked=True)

    def test_a_reason_on_a_reaction_can_ask_govern_for_guardrails(self):
        card = self._card(self._round(problem="換工作")["doc_id"])
        reacted = self._react(card, reason="我怕被告，要找律師")
        self.assertEqual([notice["category"] for notice in reacted["notices"] if notice["type"] == "guardrail"], ["法律"])

    def test_a_card_belongs_to_a_live_round_of_this_case(self):
        mine = self._round()["doc_id"]
        other = self._create_project(name="另一個案子")["project_id"]
        elsewhere = self._round(pid=other)["doc_id"]
        gone = self._round(problem="會刪掉的一輪")
        self.client.delete(f"{self.base}/docs/think.round/{gone['doc_id']}")
        for round_id in (elsewhere, "no-such-round", gone["doc_id"], ["x"]):
            refused = self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "x", "round": round_id}})
            self.assertEqual(refused.status_code, 404, (round_id, refused.text))
            self.assertIn("THINK_ROUND_NOT_FOUND", refused.json()["detail"])
        self.assertEqual(self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "x", "round": mine}}).status_code, 200)
        self.assertEqual(len(self._cards()), 1)

    def test_a_card_keeps_what_the_system_set_when_it_was_made(self):
        self._grant("counter")
        round_, second = self._round()["doc_id"], self._round(problem="另一輪")["doc_id"]
        batch = self._answer("counter", round_)
        self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]})
        card = self._cards()[0]
        url = f"{self.base}/docs/think.card/{card['doc_id']}"
        for field, value in (("sourced", "有來源"), ("rests_on", "C1"), ("role", "鏡子"), ("method", "反例" if card["content"]["method"] != "反例" else "失敗模式"), ("batch", "other-batch"), ("batch_index", 9), ("round", second)):
            refused = self.client.put(url, json={"content": {**card["content"], field: value}, "base_version": 1})
            self.assertEqual(refused.status_code, 400, (field, refused.text))
            self.assertIn("THINK_CARD_FIELD_FIXED", refused.json()["detail"])
            self.assertIn(field, refused.json()["detail"])
        dropped = self.client.put(url, json={"content": {key: value for key, value in card["content"].items() if key != "sourced"}, "base_version": 1})
        self.assertEqual(dropped.status_code, 400, dropped.text)   # taking the label off is a change too
        untouched = self._cards()[0]
        self.assertEqual((untouched["author"], untouched["version"], untouched["content"]), ("ai", 1, card["content"]))
        edited = self.client.put(url, json={"content": {**card["content"], "claim": "我改過的主張"}, "base_version": 1}).json()
        self.assertEqual((edited["author"], edited["content"]["sourced"], edited["content"]["batch"]), ("joint", "它自己說的", batch["doc_id"]))
        mine = self._card(round_, "我自己的")
        for field, value in (("role", "反方教練"), ("sourced", "有來源"), ("rests_on", "C1"), ("batch", batch["doc_id"]), ("batch_index", 0), ("method", "反例")):
            refused = self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "冒充", "round": round_, field: value}})
            self.assertEqual(refused.status_code, 400, (field, refused.text))
            self.assertIn("THINK_CARD_FIELD_FIXED", refused.json()["detail"])
        self.assertEqual(self.client.put(f"{self.base}/docs/think.card/{mine['doc_id']}", json={"content": {"claim": "我改了字", "round": round_}, "base_version": 1}).status_code, 200)
        self.assertEqual(len(self._cards()), 4)   # the AI's three and mine

    def test_a_card_cannot_be_moved_out_of_a_full_round_to_get_a_fourth_pick(self):
        round_, other = self._round()["doc_id"], self._round(problem="另一輪")["doc_id"]
        cards = [self._card(round_, f"卡{index}") for index in range(4)]
        for card in cards[:3]:
            self._react(card, picked=True)
        first = self._cards()[0]
        moved = self.client.put(f"{self.base}/docs/think.card/{first['doc_id']}", json={"content": {**first["content"], "round": other}, "base_version": first["version"]})
        self.assertEqual(moved.status_code, 400, moved.text)
        self.assertIn("THINK_PICK_LIMIT", self._react(cards[3], 400, picked=True)["detail"])

    def test_my_own_version_stays_once_the_ai_has_answered(self):
        self._grant("propose_options")
        asked, quiet = self._round(own=("觀察：他第三次改條件",)), self._round(problem="沒有問過 AI 的一輪")
        self.assertEqual(self._set_round(quiet, own=["觀察：改了也行"])["version"], 2)   # nothing answered yet: still yours to change
        self._answer("mirror", asked["doc_id"])
        for own in (["觀察：換成 AI 的話"], [], ["觀察：他第三次改條件", "我不知道：多一項"]):
            refused = self.client.put(f"{self.base}/docs/think.round/{asked['doc_id']}", json={"content": {**asked["content"], "own": own}, "base_version": 1})
            self.assertEqual(refused.status_code, 400, (own, refused.text))
            self.assertIn("THINK_OWN_VERSION_FIXED", refused.json()["detail"])
        later = self._set_round(asked, problem="問題我可以再改", criteria=["能反悔"], reflection="我先寫了")   # everything else stays yours
        self.assertEqual(later["content"]["own"], ["觀察：他第三次改條件"])
        batched = self._round(problem="發散的一輪", own=("觀察：A",))
        self._answer("diverge", batched["doc_id"])
        self.assertEqual(self.client.put(f"{self.base}/docs/think.round/{batched['doc_id']}", json={"content": {**batched["content"], "own": ["觀察：B"]}, "base_version": 1}).status_code, 400)
        reply = self.client.get(f"{self.base}/docs/think.reply").json()[0]
        self.client.delete(f"{self.base}/docs/think.reply/{reply['doc_id']}")   # take the AI's turn away and the round is yours again
        again = self.client.get(f"{self.base}/docs/think.round").json()
        current = next(item for item in again if item["doc_id"] == asked["doc_id"])
        self.assertEqual(self._set_round(current, own=["觀察：重寫"])["content"]["own"], ["觀察：重寫"])

    def test_a_card_i_write_is_mine_and_needs_its_round(self):
        round_ = self._round()
        mine = self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "我自己的想法", "round": round_["doc_id"]}}).json()
        self.assertEqual((mine["author"], mine["block"]), ("user", "THINK"))
        self.assertEqual(self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "沒有輪"}}).status_code, 400)
        self.assertEqual(self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "x", "round": round_["doc_id"], "score": 3}}).status_code, 400)

    # -- 回覆 -------------------------------------------------------------------------------------------------------------------
    def test_replies_keep_to_the_cards_own_sections(self):
        round_ = self._round()
        reply = self._answer("mirror", round_["doc_id"], {"sections": [{"title": "你的動機", "items": ["x"]}, {"title": "空白", "items": ["沒有講到錢", ""]}, {"title": "空白", "items": ["重複"]}], "question": "一題"})
        self.assertEqual(reply["content"]["sections"], [{"title": "空白", "items": ["沒有講到錢"]}])
        self.assertEqual((reply["content"]["round"], reply["content"]["action"], reply["content"]["role"]), (round_["doc_id"], "mirror", "鏡子"))
        junk = self._answer("mirror", round_["doc_id"], {"sections": [{"title": ["事實"], "items": ["x"]}, {"title": {"a": 1}, "items": ["y"]}, {"title": "情緒", "items": ["生氣"]}]})   # a title that is not even text
        self.assertEqual(junk["content"]["sections"], [{"title": "情緒", "items": ["生氣"]}])
        self.provider.answer = {"sections": [{"title": "你的動機", "items": ["x"]}]}
        self.assertEqual(self._ask("mirror", round_["doc_id"]).status_code, 422)

    def test_a_question_only_role_gives_one_question_and_nothing_else(self):
        round_ = self._round()
        saved = self._answer("socratic", round_["doc_id"], {"question": "你要先弄清楚什麼？", "sections": [{"title": "事實", "items": ["x"]}], "premise": "p"})
        self.assertEqual(set(saved["content"]), {"round", "action", "role", "question", "sourced"})
        self.provider.answer = {"sections": [{"title": "事實", "items": ["x"]}]}
        self.assertEqual(self._ask("ask_conclusion", round_["doc_id"]).status_code, 422)

    def test_the_ai_asks_one_question_at_a_time(self):
        self.assertEqual(actions._one_question("你要先弄清楚什麼？還是先看他的條件？", 300), "你要先弄清楚什麼？")
        self.assertEqual(actions._one_question("他說「你到底要不要？」，你怎麼想？還有嗎？", 300), "他說「你到底要不要？」，你怎麼想？")   # a mark inside quotes is not the end
        self.assertEqual(actions._one_question("What do you want? And why?", 300), "What do you want?")
        self.assertEqual(actions._one_question("先想想你要什麼", 300), "先想想你要什麼")
        self.assertEqual(actions._one_question(None, 300), "")
        self.assertEqual(actions._one_question("他說「你要不要？ 你怎麼想？還有嗎？", 300), "他說「你要不要？")   # a quote that never closes hides nothing
        self.assertEqual(actions._one_question("你怎麼看（他的條件？還有呢？ 還有嗎？", 300), "你怎麼看（他的條件？")
        self.assertEqual(actions._one_question("他說「要不要？」，然後呢", 300), "他說「要不要？」，然後呢")   # a closed quote still hides its own mark
        self.assertEqual(actions._one_sentence("資料不足，我先不給建議。你想先弄清楚哪一點？", 200), "資料不足，我先不給建議。")
        self.assertEqual(actions._one_sentence("Not enough to go on. Which part matters?", 200), "Not enough to go on.")
        self.assertEqual(actions._one_sentence("版本 3.5 還沒定", 200), "版本 3.5 還沒定")
        self.assertEqual(len(actions._one_sentence("字" * 500, 200)), 200)
        round_ = self._round()
        saved = self._answer("socratic", round_["doc_id"], {"question": "你要先弄清楚什麼？他想要什麼？"})
        self.assertEqual(saved["content"]["question"], "你要先弄清楚什麼？")
        mirror = self._answer("mirror", round_["doc_id"], {**ANSWERS["mirror"], "question": "哪一點最讓你在意？還是哪一點最讓你怕？"})
        self.assertEqual(mirror["content"]["question"], "哪一點最讓你在意？")
        self._grant("propose_options")
        handed_back = self._answer("diverge", round_["doc_id"], {"handback": "資料不足", "question": "這件事會影響誰？誰會反對？"})
        self.assertEqual(handed_back["content"]["question"], "這件事會影響誰？")
        wordy = self._answer("mirror", round_["doc_id"], {"handback": "資料不足，先不給建議。你可以這樣做：先談條件，再談期限。", "question": "你想先弄清楚哪一點？"})
        self.assertEqual(wordy["content"]["handback"], "資料不足，先不給建議。")

    def test_the_look_back_names_two_strengths_and_one_practice(self):
        round_ = self._round()
        saved = self._answer("look_back", round_["doc_id"], {"sections": [{"title": "思考強項", "items": ["a", "b", "c"]}, {"title": "下次練習點", "items": ["x", "y"]}]})
        self.assertEqual([(section["title"], len(section["items"])) for section in saved["content"]["sections"]], [("思考強項", 2), ("下次練習點", 1)])

    def test_criteria_come_with_their_premise_and_how_they_fail(self):
        self._grant("propose_options")
        round_ = self._round()
        self.provider.answer = {**ANSWERS["criteria"], "fails_when": ""}
        self.assertEqual(self._ask("criteria", round_["doc_id"]).status_code, 422)
        saved = self._answer("criteria", round_["doc_id"])
        self.assertEqual((saved["content"]["premise"], saved["content"]["fails_when"]), ("你有兩個以上的選項", "選項其實只有一個"))

    def test_an_audit_follows_the_focus_the_person_chose(self):
        round_ = self._round()
        self._answer("audit", round_["doc_id"], focus="separate")
        self.assertIn("文化宗教", self.provider.calls[-1][1])
        self.assertIn("lawyer or the source must confirm", self.provider.calls[-1][1])
        self._answer("audit", round_["doc_id"], focus="somewhere else")
        self.assertIn("已知", self.provider.calls[-1][1])
        self.assertNotIn("文化宗教", self.provider.calls[-1][1])

    def test_a_handback_replaces_the_advice_with_one_question(self):
        self._grant("propose_options", "direct_advice")
        round_ = self._round()
        batch = self._answer("diverge", round_["doc_id"], {"cards": cards(10), "handback": "你還沒說清楚誰會受影響", "question": "這件事會影響誰？"})
        self.assertEqual((batch["content"].get("cards"), batch["content"]["handback"], batch["content"]["question"]), (None, "你還沒說清楚誰會受影響", "這件事會影響誰？"))
        self.assertEqual(self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]}).json(), {"created": 0})
        reply = self._answer("mirror", round_["doc_id"], {"sections": [{"title": "事實", "items": ["x"]}], "handback": "資料不足", "question": "你想先弄清楚哪一點？"})
        self.assertNotIn("sections", reply["content"])
        self.provider.answer = {"cards": cards(10), "handback": "資料不足"}
        self.assertEqual(self._ask("diverge", round_["doc_id"]).status_code, 422)

    def test_i_answer_a_reply_and_the_ai_cannot_answer_for_me(self):
        reply = self._answer("mirror", self._round()["doc_id"])
        answer = self.client.post(f"{self.base}/docs/think.response", json={"content": {"reply": reply["doc_id"], "version": reply["version"], "response": "改寫", "note": "其實他是在試探"}}).json()
        self.assertEqual((answer["author"], answer["block"], answer["content"]["version"]), ("user", "THINK", 1))
        self.assertEqual(self.client.post(f"{self.base}/docs/think.response", json={"content": {"reply": reply["doc_id"], "version": 1, "response": "同意"}}).status_code, 400)

    def test_my_answer_names_a_reply_of_this_case_and_the_version_i_answered(self):
        reply = self._answer("mirror", self._round()["doc_id"])
        other = self._create_project(name="另一個案子")["project_id"]
        elsewhere = self._answer_in(other, "mirror")
        post = lambda content: self.client.post(f"{self.base}/docs/think.response", json={"content": content})
        for content in ({"reply": "no-such-reply", "version": 1, "response": "確認"}, {"reply": elsewhere["doc_id"], "version": 1, "response": "確認"}, {"reply": ["x"], "version": 1, "response": "確認"}, {"version": 1, "response": "確認"}):
            refused = post(content)
            self.assertEqual(refused.status_code, 404, (content, refused.text))
            self.assertIn("THINK_REPLY_NOT_FOUND", refused.json()["detail"])
        stale = post({"reply": reply["doc_id"], "version": 7, "response": "確認"})
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertIn("THINK_REPLY_STALE", stale.json()["detail"])
        self.assertEqual(post({"reply": reply["doc_id"], "response": "確認"}).status_code, 400)   # no version at all is the kind's own 「required」
        self.assertEqual(post({"reply": reply["doc_id"], "version": 1, "response": "確認"}).status_code, 200)

    # -- 安全 -------------------------------------------------------------------------------------------------------------------
    def test_a_crisis_in_my_round_stops_the_ai_before_any_call(self):
        saved = self._round(problem="我不想活了")
        self.assertEqual(saved["notices"][0]["type"], "crisis")
        turn = self._ask("mirror", saved["doc_id"]).json()
        self.assertEqual(turn["stopped"], "crisis")
        self.assertEqual(self.provider.calls, [])

    def test_a_high_risk_round_asks_govern_for_guardrails_once(self):
        saved = self._round(problem="要不要告他，合約怎麼辦")
        self.assertEqual([notice["category"] for notice in saved["notices"] if notice["type"] == "guardrail"], ["法律"])
        guardrails = self.client.get(f"{self.base}/docs/govern.guardrail").json()
        self.assertEqual({(item["content"]["category"], item["content"]["found_by"], item["author"]) for item in guardrails}, {("法律", "THINK", "system")})
        self.assertEqual(len(guardrails), 3)
        self._set_round(saved, own=["觀察：律師還沒回"])
        self.assertEqual(len(self.client.get(f"{self.base}/docs/govern.guardrail").json()), 3)
        round_ = self._round(problem="換工作")
        card = self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "投資一筆錢", "round": round_["doc_id"]}}).json()
        self.assertEqual([notice["category"] for notice in card["notices"]], ["金錢"])

    # -- 讀什麼 -----------------------------------------------------------------------------------------------------------------
    def test_every_turn_reads_only_what_the_card_allows(self):
        thinks = {key: action for key, action in ai_gate.actions().items() if key[0] == "THINK"}
        self.assertEqual(len(thinks), 9)
        allowed = {"think.round", "think.card", "think.reaction", "map.map", "sense.card", "verify.claim"}   # verify.claim: 有查證時讀主張帳本
        for key, action in thinks.items():
            self.assertEqual(set(action.reads), allowed, key)
        round_doc = {"doc_id": "R1", "kind": "think.round", "author": "user", "content": {"problem": "要不要接", "own": ["觀察：他改了條件"], "criteria": ["能反悔"]}}
        data = {"think.round": [round_doc], "think.card": [], "think.reaction": [], "map.map": [], "sense.card": [{"content": {"category": "恐懼", "text": "怕被騙"}}]}
        for key, action in thinks.items():
            asked: list[str] = []

            def read(kind, asked=asked, key=key, action=action):
                asked.append(kind)
                if kind not in action.reads:
                    raise InvariantViolation(f"AI_READ_REFUSED: {key} read {kind}")
                return data[kind]
            read.evidence = NO_LEDGER
            action.build_input({"round": "R1"}, read)
            self.assertTrue(set(asked) <= allowed, (key, asked))

    def test_the_map_is_read_in_place_of_the_sense_cards_and_a_bad_map_does_not_break_a_turn(self):
        round_doc = {"doc_id": "R1", "kind": "think.round", "author": "user", "content": {"problem": "要不要接", "own": ["觀察：他改了條件"]}}
        sense = [{"content": {"category": "恐懼", "text": "怕被騙"}}]
        good = {"doc_id": "M", "author": "user", "content": {"layers": {"facts": [{"text": "他改了三次", "self_said": True}, {"text": "合約簽了"}], "interests": ["他要現金流"]}, "claims": [{"text": "合約有效", "kind": "法律"}],
                                                             "core_conflict": "我要尊重還是要錢", "unwinnable": True}}
        def message(maps):
            data = {"think.round": [round_doc], "think.card": [], "think.reaction": [], "map.map": maps, "sense.card": sense}
            read = lambda kind: data[kind]
            read.evidence = NO_LEDGER
            return actions._message({"round": "R1"}, read)
        shown = message([good])
        self.assertIn("他改了三次", shown)
        self.assertIn("no outside source", shown)
        self.assertIn("我要尊重還是要錢", shown)
        self.assertNotIn("怕被騙", shown)
        for broken in ({"layers": "x", "claims": 5}, {"layers": {"facts": "x", "core": [1, None]}}):
            self.assertIn("怕被騙", message([{"doc_id": "M", "author": "user", "content": broken}]))
        self.assertIn("怕被騙", message([]))

    def test_only_my_picks_and_my_reflection_go_to_the_look_back(self):
        round_ = self._round()
        mine = self._card(round_["doc_id"], "我選這個")
        self._card(round_["doc_id"], "我沒選的")
        self._react(mine, reaction="共鳴", reason="因為便宜", picked=True)
        self._set_round(round_, reflection="我太快相信第一個想法")
        self._answer("look_back", round_["doc_id"])
        sent = self.provider.calls[-1][1]
        self.assertIn("我選這個", sent)
        self.assertIn("因為便宜", sent)
        self.assertIn("我太快相信第一個想法", sent)
        self.assertNotIn("我沒選的", sent)
        self.assertEqual(mine["author"], "user")

    def test_an_ai_card_i_picked_goes_to_the_criteria_as_the_ais(self):
        self._grant("propose_options")
        round_ = self._round()
        batch = self._answer("diverge", round_["doc_id"])
        self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]})
        card = self._cards()[0]
        self._react(card, picked=True)
        self._answer("criteria", round_["doc_id"])
        picked = json.loads(self.provider.calls[-1][1].split("\n", 1)[1])["cards_the_person_picked"]
        self.assertEqual([(row["by"], row["claim"]) for row in picked], [("an AI card the person kept as it was", card["content"]["claim"])])


class ThinkWebTests(unittest.TestCase):
    """The pages carry the engine's tables as constants; a drift would make a button offer what the engine refuses."""

    def setUp(self):
        self.think = (WEB / "ThinkPage.tsx").read_text(encoding="utf-8")
        self.contract = (WEB / "CollabPermissions.tsx").read_text(encoding="utf-8")

    def _list(self, text: str, name: str) -> list[str]:
        match = re.search(rf"export const {name} = \[(.*?)\] as const;", text)
        self.assertIsNotNone(match, name)
        return re.findall(r'"([^"]+)"', match.group(1))

    def test_the_constants_are_the_engines(self):
        for name, expected in (("ROLES", kinds.ROLES), ("MODES", kinds.MODES), ("OWN_TYPES", kinds.OWN_TYPES), ("REACTIONS", kinds.REACTIONS), ("STANCES", kinds.STANCES), ("RESPONSES", kinds.RESPONSES)):
            self.assertEqual(self._list(self.think, name), list(expected), name)
        self.assertEqual(int(re.search(r"export const MAX_PICKED = (\d+);", self.think).group(1)), kinds.MAX_PICKED)
        self.assertEqual(int(re.search(r"export const MIN_OWN_CARDS = (\d+);", self.think).group(1)), kinds.MIN_OWN_CARDS)

    def test_every_action_is_the_role_mode_and_permission_the_engine_has(self):
        rows = re.findall(r'^  (\w+): \{ role: "([^"]+)", mode: "([^"]+)", needs: "(\w+)", title: "[^"]*" \},$', self.think, re.M)
        engine = {name: action for (block, name), action in ai_gate.actions().items() if block == "THINK"}
        self.assertEqual(sorted(name for name, *_ in rows), sorted(engine))
        for name, role, mode, needs in rows:
            self.assertEqual((role, mode), kinds.ACTION_FACETS[name], name)
            self.assertEqual(needs, engine[name].needs, name)

    def test_the_seven_command_cards_are_the_specs_modes_and_roles(self):
        block = re.search(r"export const COMMANDS.*?\n\];", self.think, re.S).group(0)
        found = re.findall(r'\{ title: "[^"]+", action: "(\w+)"(?:, focus: "(\w+)")? \}', block)
        self.assertEqual(found, [("mirror", ""), ("diverge", ""), ("counter", ""), ("audit", "checkable"), ("socratic", ""), ("audit", "separate"), ("ask_conclusion", "")])
        self.assertEqual([kinds.ACTION_FACETS[action][::-1] for action, _ in found],
                         [("鏡像", "鏡子"), ("發散", "發散夥伴"), ("挑戰", "反方教練"), ("查證", "證據稽核者"), ("只問問題", "蘇格拉底引導者"), ("查證", "證據稽核者"), ("只問問題", "決策教練")])

    def test_the_phases_are_the_specs_seven_in_twenty_five_minutes(self):
        rows = re.findall(r'\{ from: (\d+), to: (\d+), name: "([^"]+)", hint: "[^"]+", action: "(\w*)" \}', self.think)
        self.assertEqual([(int(a), int(b), name) for a, b, name, _ in rows],
                         [(0, 3, "先有自己的版本"), (3, 6, "鏡像"), (6, 11, "發散"), (11, 15, "挑戰"), (15, 20, "建立判準"), (20, 23, "人做選擇"), (23, 25, "回看自己怎麼想")])
        self.assertTrue(all(action in kinds.ACTION_FACETS for *_, action in rows if action))

    def test_the_contract_page_words_are_the_engines(self):
        words = dict(re.findall(r'^  (\w+): "([^"]+)",$', re.search(r"export const GRANTABLE_WORDS.*?\n\};", self.contract, re.S).group(0), re.M))
        self.assertEqual(words, collab_contract.GRANTABLE)
        self.assertEqual(self._list(self.contract, "ALWAYS"), list(collab_contract.ALWAYS))
        self.assertEqual(self._list(self.contract, "SCOPES"), list(doc_kinds.require("collab_contract.terms").fields["scope"].choices))

    def test_the_places_switch_is_the_contracts_field_not_a_permission(self):
        self.assertNotIn("use_location", collab_contract.GRANTABLE)
        self.assertEqual(doc_kinds.require("collab_contract.terms").fields["hide_places"].type, "bool")
        self.assertIn('hide_places?: boolean', self.contract)
        self.assertNotIn("use_location", self.contract)
        self.assertNotIn("use_location", (WEB / "ContractPage.tsx").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
