"""FACILITATE's AI partner (docs/platform/STEP34_SHARED_RULES.md §11; card 62): it reads nothing a participant wrote, scores
no one, never writes a log, and every pointer answer ends with the same fixed sentence."""

from __future__ import annotations

import ast
import unittest
from unittest import mock

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate
from ai_lego.platform.ai_actions import facilitate as ai
from ai_lego.platform.lessons import load_practice_cases
from ai_lego.platform.scripts import FACIL_DONTS
from tests.unit.test_block_decide import Provider
from tests.unit.test_block_facilitate import SCRIPT, FacilitateCase

OWN_KINDS = {"facilitate.log", "facilitate.practice_reply", "facilitate.pointers"}   # the leader's own, and the AI's answers to them
FILE = PRODUCT_ROOT / "ai_lego" / "platform" / "ai_actions" / "facilitate.py"
SCORE_LIKE = {"score", "scores", "rank", "ranking", "rating", "grade", "feedback_score"}


class GateTests(unittest.TestCase):
    def actions(self) -> dict[str, ai_gate.AiAction]:
        return {key[1]: action for key, action in ai_gate.actions().items() if key[0] == "FACILITATE"}

    def test_both_actions_read_only_the_leaders_own_log(self):
        actions = self.actions()
        self.assertEqual(set(actions), {"play_participant", "point_at_deviations"})
        self.assertEqual((actions["play_participant"].reads, actions["point_at_deviations"].reads), ((), ("facilitate.log",)))
        for action in actions.values():
            for kind in action.reads:   # a record of the leader's own, written by the leader: never a participant's, a group's or the platform's
                spec = doc_kinds.require(kind)
                self.assertEqual((spec.owner, spec.block, spec.authors), ("person", "FACILITATE", frozenset({"user"})), kind)

    def test_the_actions_file_names_no_kind_that_is_not_the_leaders_own(self):
        named = {node.value for node in ast.walk(ast.parse(FILE.read_text(encoding="utf-8"))) if isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value in doc_kinds.kinds()}
        self.assertEqual(named - OWN_KINDS, set())
        self.assertEqual(named, OWN_KINDS)

    def test_no_answer_has_a_score_or_rank_key_and_the_ai_never_writes_a_log(self):
        for action in self.actions().values():
            self.assertFalse(set(action.output_schema["properties"]) & SCORE_LIKE, action.name)
            self.assertFalse(set(doc_kinds.require(action.output_kind).fields) & SCORE_LIKE, action.name)
            self.assertNotIn(action.output_kind, {"facilitate.log", "facilitate.supervision", "facilitate.supervision_link"})
            self.assertEqual(doc_kinds.require(action.output_kind).authors, frozenset({"ai"}))
        with self.assertRaisesRegex(InvariantViolation, "RECORD_AUTHOR_NOT_ALLOWED"):
            doc_kinds.check_record("DocSaved", {"kind": "facilitate.log", "content": {"group_id": "g", "script": "s", "script_version": 1, "followed": "x"}}, "ai", "FACILITATE", "person")


class AiCase(FacilitateCase):
    def setUp(self):
        super().setUp()
        self.provider = Provider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self.lines = ["開場說明了步驟。", "我請大家寫下看到的事。"]
        self.drift = {"what": "我替他們總結了結論", "why": "時間不夠"}

    def point(self, by: str = "F", **context):
        return self.as_(by).post("/me/ai/FACILITATE/point_at_deviations", json={"context": context})

    def written(self, by: str = "F", **more) -> str:
        made = self.log(by, followed="\n".join(self.lines), deviated=[self.drift], **more)
        self.assertEqual(made.status_code, 200, made.text)
        return made.json()["doc_id"]

    def asked(self) -> str:
        return "\n".join(user for _, user in self.provider.calls)

    def shared_to_leader(self, owner: str, with_whom: str, text: str) -> str:
        """The owner shows one card of their case to the leader (a consent): nothing the AI may read."""
        case = self.as_(owner).post("/projects", json={"name": "案", "purpose": "p", "data_classification": "Confidential"}).json()["project_id"]
        card = self.as_(owner).post(f"/projects/{case}/docs/sense.card", json={"content": {"category": "事件", "text": text}}).json()["doc_id"]
        self.as_(owner).post("/me/consents", json={"purpose": "facilitator", "target": self.ids[with_whom], "follow_versions": True, "items": [{"project_id": case, "kind": "sense.card", "doc_id": card}]})
        return card


class PointerTests(AiCase):
    def test_a_pointer_names_a_line_of_the_leaders_log_and_one_of_the_four_and_the_fixed_sentence_ends_every_answer(self):
        log = self.written()
        self.provider.answer = {"pointers": [{"n": 3, "dont": FACIL_DONTS[0], "why": "這一行說你替參與者做了總結。", "line": "模型自己打的行"}]}
        made = self.point(log=log)
        self.assertEqual(made.status_code, 200, made.text)
        content = made.json()["saved"]["content"]
        line = "沒照稿：我替他們總結了結論（理由：時間不夠）"
        self.assertEqual(content["pointers"], [{"n": 3, "line": line, "dont": FACIL_DONTS[0], "text": f"這裡可能偏離「{FACIL_DONTS[0]}」：這一行說你替參與者做了總結。"}])
        self.assertEqual((content["handback"], content["log"], content["log_version"]), (ai.HANDBACK, log, 1))
        self.assertEqual(made.json()["saved"]["author"], "ai")
        self.provider.answer = {"pointers": []}   # pointing at nothing is an answer too, and it ends the same way
        none = self.point()
        self.assertEqual((none.status_code, none.json()["saved"]["content"]["handback"]), (200, ai.HANDBACK))
        self.assertNotIn("pointers", none.json()["saved"]["content"])

    def test_a_pointer_that_invents_a_line_or_decides_or_scores_is_not_saved(self):
        self.written()
        for pointer in ({"n": 99, "dont": FACIL_DONTS[0], "why": "這一行可能。"}, {"n": 1, "dont": "不在清單上的一條", "why": "這一行可能。"},
                        {"n": 1, "dont": FACIL_DONTS[1], "why": "你這樣做錯了。"}, {"n": 1, "dont": FACIL_DONTS[1], "why": "這一行給你 6 分。"},
                        {"n": 1, "dont": FACIL_DONTS[1], "why": "你的表現很差。"}, {"n": 1, "dont": FACIL_DONTS[1], "why": ""}):
            with self.subTest(pointer=pointer):
                self.provider.answer = {"pointers": [pointer]}
                refused = self.point()
                self.assertEqual(refused.status_code, 502, refused.text)
        self.assertEqual(self.as_("F").get("/me/docs/facilitate.pointers").json(), [])

    def test_it_reads_only_my_own_log_and_nothing_a_participant_shared_with_me(self):
        self.shared_to_leader("P1", "F", "參與者分享的卡片：不該被 AI 讀到")
        other = self.written("G")
        self.assertEqual(self.point("F").status_code, 400)   # F has no log of their own
        self.assertEqual(self.point("F", log=other).status_code, 400)   # naming G's log does not make it F's
        self.assertEqual(self.provider.calls, [])
        log = self.written("F")
        self.provider.answer = {"pointers": []}
        self.assertEqual(self.point("F", log=log).status_code, 200)
        self.assertNotIn("不該被 AI 讀到", self.asked())
        by_hand = self.as_("F").post("/me/docs/facilitate.pointers", json={"content": {"log": log, "log_version": 1, "handback": "x"}})
        self.assertEqual(by_hand.status_code, 403)   # the AI's answer is not written by hand

    def test_a_crisis_in_the_log_stops_the_turn_before_the_model(self):
        self.lines = ["我不想活了"]
        self.written()
        stopped = self.point()
        self.assertEqual((stopped.status_code, stopped.json()["stopped"]), (200, "crisis"))
        self.assertEqual(self.provider.calls, [])


class PracticeTests(AiCase):
    def say(self, **more):
        context = {"script": SCRIPT["id"], "step": 1, "practice_case": load_practice_cases().items[0]["id"], "say": "請大家說說你們在公告上看到什麼。", **more}
        return self.as_("F").post("/me/ai/FACILITATE/play_participant", json={"context": context})

    def test_only_a_reviewed_script_is_practised_and_nothing_real_reaches_the_model(self):
        self.provider.answer = {"reply": "我看到公告上寫了時間和地點。"}
        refused = self.say()   # the three seed scripts are drafts
        self.assertEqual((refused.status_code, refused.json()["detail"].split(":")[0]), (400, "FACILITATE_SCRIPT_NOT_REVIEWED"))
        self.assertEqual(self.provider.calls, [])
        self.shared_to_leader("P1", "F", "參與者分享的卡片：不該被 AI 讀到")
        with mock.patch.object(ai, "usable_for_leading", lambda: [{**SCRIPT, "state": "reviewed"}]):
            made = self.say(earlier=[{"leader": "歡迎", "participant": "嗯"}])
            self.assertEqual(made.status_code, 200, made.text)
            self.assertEqual(made.json()["saved"]["content"], {"script": SCRIPT["id"], "step": 1, "reply": "我看到公告上寫了時間和地點。"})
            self.assertEqual(made.json()["saved"]["author"], "ai")
            asked = self.asked()
            self.assertIn(SCRIPT["steps"][0]["what"], asked)
            self.assertIn(load_practice_cases().items[0]["text"], asked)
            for private in ("不該被 AI 讀到", self.ids["P1"], self.ids["F"], "@example.com"):
                self.assertNotIn(private, asked)
            self.assertEqual(self.say(step=99).status_code, 400)
            self.assertEqual(self.say(say="").status_code, 400)
            self.provider.answer = {"reply": "你的排名是第二。"}
            self.assertEqual(self.say().status_code, 502)   # it does not rank the leader
            self.provider.answer = {"reply": "我看到時間。"}
            calls = len(self.provider.calls)
            crisis = self.say(say="我想結束自己")
            self.assertEqual(crisis.json().get("stopped"), "crisis")
            self.assertEqual(len(self.provider.calls), calls)
