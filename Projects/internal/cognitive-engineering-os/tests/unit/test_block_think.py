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
        self.assertEqual(self._ask("direct_advice", round_["doc_id"]).status_code, 502)
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
            self.assertEqual(self._ask("diverge", round_["doc_id"]).status_code, 502, answer)
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
        self.assertEqual(self._ask("counter", round_["doc_id"]).status_code, 502)

    def test_the_counter_aims_at_the_item_i_marked(self):
        self._grant("counter")
        round_ = self._round(own=("觀察：他每次都改條件", "假設或替代解釋：他其實想退出"))
        self._answer("counter", round_["doc_id"], target=1)
        self.assertEqual(json.loads(self.provider.calls[-1][1].split("\n", 1)[1])["strongest_argument"], "假設或替代解釋：他其實想退出")
        for target in (5, -1, "1", True):
            self._answer("counter", round_["doc_id"], target=target)
            self.assertNotIn("strongest_argument", self.provider.calls[-1][1])

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
        self.assertTrue(all("reaction" not in card["content"] and "picked" not in card["content"] for card in found))
        self.assertEqual(self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]}).json(), {"created": 0})
        self.client.delete(f"{self.base}/docs/think.card/{found[0]['doc_id']}")
        self.assertEqual(self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]}).json(), {"created": 0})
        self.assertEqual(len(self._cards()), 9)

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

    def test_my_reaction_on_an_ai_card_keeps_its_first_version_the_ais(self):
        self._grant("counter")
        batch = self._answer("counter", self._round()["doc_id"])
        self.client.post(f"{self.base}/think/expand", json={"batch": batch["doc_id"]})
        card = self._cards()[0]
        reacted = self.client.put(f"{self.base}/docs/think.card/{card['doc_id']}", json={"content": {**card["content"], "reaction": "反感", "reason": "他只是想談價", "stance": "維持", "picked": True}, "base_version": 1}).json()
        self.assertEqual(reacted["author"], "joint")
        versions = self.client.get(f"{self.base}/docs/think.card/{card['doc_id']}/versions").json()
        self.assertEqual([version["author"] for version in versions], ["ai", "joint"])
        text = ("claim", "mechanism", "benefit", "risk", "assumption")
        self.assertEqual({key: versions[0]["content"].get(key) for key in text}, {key: versions[1]["content"].get(key) for key in text})
        self.assertNotIn("reaction", versions[0]["content"])

    def test_a_card_i_write_is_mine_and_needs_its_round(self):
        round_ = self._round()
        mine = self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "我自己的想法", "round": round_["doc_id"]}}).json()
        self.assertEqual((mine["author"], mine["block"]), ("user", "THINK"))
        self.assertEqual(self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "沒有輪"}}).status_code, 400)
        self.assertEqual(self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "x", "round": "r", "score": 3}}).status_code, 400)

    # -- 回覆 -------------------------------------------------------------------------------------------------------------------
    def test_replies_keep_to_the_cards_own_sections(self):
        round_ = self._round()
        reply = self._answer("mirror", round_["doc_id"], {"sections": [{"title": "你的動機", "items": ["x"]}, {"title": "空白", "items": ["沒有講到錢", ""]}, {"title": "空白", "items": ["重複"]}], "question": "一題"})
        self.assertEqual(reply["content"]["sections"], [{"title": "空白", "items": ["沒有講到錢"]}])
        self.assertEqual((reply["content"]["round"], reply["content"]["action"], reply["content"]["role"]), (round_["doc_id"], "mirror", "鏡子"))
        junk = self._answer("mirror", round_["doc_id"], {"sections": [{"title": ["事實"], "items": ["x"]}, {"title": {"a": 1}, "items": ["y"]}, {"title": "情緒", "items": ["生氣"]}]})   # a title that is not even text
        self.assertEqual(junk["content"]["sections"], [{"title": "情緒", "items": ["生氣"]}])
        self.provider.answer = {"sections": [{"title": "你的動機", "items": ["x"]}]}
        self.assertEqual(self._ask("mirror", round_["doc_id"]).status_code, 502)

    def test_a_question_only_role_gives_one_question_and_nothing_else(self):
        round_ = self._round()
        saved = self._answer("socratic", round_["doc_id"], {"question": "你要先弄清楚什麼？", "sections": [{"title": "事實", "items": ["x"]}], "premise": "p"})
        self.assertEqual(set(saved["content"]), {"round", "action", "role", "question", "sourced"})
        self.provider.answer = {"sections": [{"title": "事實", "items": ["x"]}]}
        self.assertEqual(self._ask("ask_conclusion", round_["doc_id"]).status_code, 502)

    def test_the_ai_asks_one_question_at_a_time(self):
        self.assertEqual(actions._one_question("你要先弄清楚什麼？還是先看他的條件？", 300), "你要先弄清楚什麼？")
        self.assertEqual(actions._one_question("他說「你到底要不要？」，你怎麼想？還有嗎？", 300), "他說「你到底要不要？」，你怎麼想？")   # a mark inside quotes is not the end
        self.assertEqual(actions._one_question("What do you want? And why?", 300), "What do you want?")
        self.assertEqual(actions._one_question("先想想你要什麼", 300), "先想想你要什麼")
        self.assertEqual(actions._one_question(None, 300), "")
        round_ = self._round()
        saved = self._answer("socratic", round_["doc_id"], {"question": "你要先弄清楚什麼？他想要什麼？"})
        self.assertEqual(saved["content"]["question"], "你要先弄清楚什麼？")
        mirror = self._answer("mirror", round_["doc_id"], {**ANSWERS["mirror"], "question": "哪一點最讓你在意？還是哪一點最讓你怕？"})
        self.assertEqual(mirror["content"]["question"], "哪一點最讓你在意？")
        self._grant("propose_options")
        handed_back = self._answer("diverge", round_["doc_id"], {"handback": "資料不足", "question": "這件事會影響誰？誰會反對？"})
        self.assertEqual(handed_back["content"]["question"], "這件事會影響誰？")

    def test_the_look_back_names_two_strengths_and_one_practice(self):
        round_ = self._round()
        saved = self._answer("look_back", round_["doc_id"], {"sections": [{"title": "思考強項", "items": ["a", "b", "c"]}, {"title": "下次練習點", "items": ["x", "y"]}]})
        self.assertEqual([(section["title"], len(section["items"])) for section in saved["content"]["sections"]], [("思考強項", 2), ("下次練習點", 1)])

    def test_criteria_come_with_their_premise_and_how_they_fail(self):
        self._grant("propose_options")
        round_ = self._round()
        self.provider.answer = {**ANSWERS["criteria"], "fails_when": ""}
        self.assertEqual(self._ask("criteria", round_["doc_id"]).status_code, 502)
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
        self.assertEqual(self._ask("diverge", round_["doc_id"]).status_code, 502)

    def test_i_answer_a_reply_and_the_ai_cannot_answer_for_me(self):
        reply = self._answer("mirror", self._round()["doc_id"])
        answer = self.client.post(f"{self.base}/docs/think.response", json={"content": {"reply": reply["doc_id"], "response": "改寫", "note": "其實他是在試探"}}).json()
        self.assertEqual((answer["author"], answer["block"]), ("user", "THINK"))
        self.assertEqual(self.client.post(f"{self.base}/docs/think.response", json={"content": {"reply": reply["doc_id"], "response": "同意"}}).status_code, 400)

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
        allowed = {"think.round", "think.card", "map.map", "sense.card"}
        for key, action in thinks.items():
            self.assertEqual(set(action.reads), allowed, key)
        round_doc = {"doc_id": "R1", "kind": "think.round", "author": "user", "content": {"problem": "要不要接", "own": ["觀察：他改了條件"], "criteria": ["能反悔"]}}
        data = {"think.round": [round_doc], "think.card": [], "map.map": [], "sense.card": [{"content": {"category": "恐懼", "text": "怕被騙"}}]}
        for key, action in thinks.items():
            asked: list[str] = []

            def read(kind, asked=asked, key=key, action=action):
                asked.append(kind)
                if kind not in action.reads:
                    raise InvariantViolation(f"AI_READ_REFUSED: {key} read {kind}")
                return data[kind]
            action.build_input({"round": "R1"}, read)
            self.assertTrue(set(asked) <= allowed, (key, asked))

    def test_the_map_is_read_in_place_of_the_sense_cards_and_a_bad_map_does_not_break_a_turn(self):
        round_doc = {"doc_id": "R1", "kind": "think.round", "author": "user", "content": {"problem": "要不要接", "own": ["觀察：他改了條件"]}}
        sense = [{"content": {"category": "恐懼", "text": "怕被騙"}}]
        good = {"doc_id": "M", "author": "user", "content": {"layers": {"facts": [{"text": "他改了三次", "self_said": True}, {"text": "合約簽了"}], "interests": ["他要現金流"]}, "claims": [{"text": "合約有效", "kind": "法律"}],
                                                             "core_conflict": "我要尊重還是要錢", "unwinnable": True}}
        def message(maps):
            data = {"think.round": [round_doc], "think.card": [], "map.map": maps, "sense.card": sense}
            return actions._message({"round": "R1"}, lambda kind: data[kind])
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
        mine = self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "我選這個", "round": round_["doc_id"], "picked": True, "reaction": "共鳴", "reason": "因為便宜"}}).json()
        self.client.post(f"{self.base}/docs/think.card", json={"content": {"claim": "我沒選的", "round": round_["doc_id"]}})
        self._set_round(round_, reflection="我太快相信第一個想法")
        self._answer("look_back", round_["doc_id"])
        sent = self.provider.calls[-1][1]
        self.assertIn("我選這個", sent)
        self.assertIn("因為便宜", sent)
        self.assertIn("我太快相信第一個想法", sent)
        self.assertNotIn("我沒選的", sent)
        self.assertEqual(mine["author"], "user")


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


if __name__ == "__main__":
    unittest.main()
