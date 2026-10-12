"""LEARN 回顧校準: the person's review kept as written (process apart from luck, a wrong source flagged, trust in five
aspects), what they did unaided listed without a score, habits across their own cases, the next blocks proposed, and the
daily calibration card outside any case, given back as written (LEARN has no AI turn since 2026-10-12)."""

from __future__ import annotations

import re
import unittest

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.kinds import learn
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate
from tests.unit.test_block_decide import LEAN, Provider
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

REVIEW = {"judgment_version": 1, "outcome": "他下個月又改條件", "prediction_result": "部分對上", "missed": "我沒問他的成本",
          "review_checks": {"measured_right": "我只看價格", "paper_vs_strength": "合約不等於他願意", "accumulating": "有", "opponent_learns": "他學會了拖"},
          "step_done": "談了", "direction": "還沒解決", "process": "我先寫下了預測", "luck": "他剛好心情好", "decision": "出新版判斷", "updated_conditions": "如果他再改一次就退出",
          "done_when_met": "部分做到", "trust": {"reliability": "整理得準", "context": "它不知道我們的交情"}, "delegate_note": "找反例我自己來",
          "wrong_sources": [{"source": "同業群組的說法", "why": "後來查到是舊價格"}]}


def d(created_at: str, author: str = "user", **content) -> dict:
    return {"doc_id": f"d-{created_at}", "author": author, "created_at": created_at, "version": 1, "content": content}


class PatternAndMoveTests(unittest.TestCase):
    def test_a_habit_is_only_said_when_it_shows_in_two_cases(self):
        self.assertEqual(learn.pattern_hints([{"intensity": "強"}, {"intensity": "弱"}, {"wont_change": False}]), [])
        [strong] = learn.pattern_hints([{"intensity": "強"}, {"intensity": "強"}, {"intensity": "弱"}])
        self.assertIn("2 個案子", strong)
        self.assertIn("不是說對或錯", strong)
        self.assertEqual(len(learn.pattern_hints([{"intensity": "強", "wont_change": True}, {"intensity": "強", "wont_change": True}])), 2)

    def records(self, **over):
        found = {
            "think.round": [d("2026-10-01T08:00:00Z", problem="我想知道要不要退出", own=["他在試探", "成本真的漲了"])],
            "sense.mirror": [d("2026-10-01T09:00:00Z", "ai", summary="你寫了一件事")],
            "decide.judgment": [d("2026-10-02T08:00:00Z", problem_definition="合作條件不穩", alternative="也可能是成本", uncertainty="不知道他的成本", change_condition="他願意寫進合約",
                                  confidence=60, facts=[{"text": "他三次改價", "credibility": "中"}])],
            "learn.calibration": [d("2026-10-20T08:00:00Z", prediction_result="部分對上", trust={"context": "它不知道我們的交情"})],
            "sense.review": [d("2026-10-01T10:00:00Z", decision="刪掉")],
        }
        found.update(over)
        return found

    def test_what_the_person_did_unaided_is_listed_item_by_item_with_no_score(self):
        moves = learn.own_moves(self.records(), [], "P1")
        self.assertEqual([move["item"] for move in moves], [learn.GROWTH[index] for index in (0, 1, 2, 3, 4, 5, 6)])
        by_item = {move["item"]: move["seen"] for move in moves}
        self.assertIn("先寫了自己怎麼定義", by_item[learn.GROWTH[0]])
        self.assertIn("3 個想法", by_item[learn.GROWTH[1]])
        self.assertIn("信心 60%", by_item[learn.GROWTH[4]])
        self.assertIn("部分對上", by_item[learn.GROWTH[4]])
        self.assertIn("刪掉 1 份 AI 整理", by_item[learn.GROWTH[5]])
        self.assertTrue(all(set(move) == {"item", "seen"} for move in moves))
        self.assertEqual(learn.own_moves({}, [], "P1"), [])   # nothing to show is nothing listed, never a zero

    def test_a_problem_the_ai_defined_first_is_not_the_persons_move(self):
        late = self.records(**{"think.round": [d("2026-10-01T09:30:00Z", problem="我想知道要不要退出")], "decide.judgment": []})
        self.assertNotIn(learn.GROWTH[0], [move["item"] for move in learn.own_moves(late, [], "P1")])

    def test_writing_no_to_what_would_change_it_is_not_a_falsifiable_condition(self):
        no = self.records(**{"decide.judgment": [d("2026-10-02T08:00:00Z", change_condition="沒有", confidence=60)]})
        self.assertNotIn(learn.GROWTH[3], [move["item"] for move in learn.own_moves(no, [], "P1")])

    def test_less_scaffolding_is_shown_beside_the_last_case_not_ranked(self):
        history = [{"project": "P0", "ai_docs": 7}, {"project": "P1", "ai_docs": 2}]
        moves = learn.own_moves(self.records(), history, "P1")
        seen = next(move["seen"] for move in moves if move["item"] == learn.GROWTH[8])
        self.assertIn("這個案子 1", seen)
        self.assertIn("上一個案子 7", seen)
        self.assertIn("不能直接比", seen)

    def test_every_growth_item_is_one_of_the_nine_and_none_is_a_habit_the_system_names(self):
        self.assertEqual(len(learn.GROWTH), 9)
        moves = [move["item"] for move in learn.own_moves(self.records(), [{"project": "P0", "ai_docs": 1}], "P1")]
        self.assertNotIn(learn.GROWTH[7], moves)   # the habit across cases is a hint the system gives, not something the person did


class LearnBase(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = Provider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"

    def save(self, kind, content, project=None):
        response = self.client.post(f"/projects/{project or self.pid}/docs/{kind}", json={"content": content})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def mine(self, kind, content):
        response = self.client.post(f"/me/docs/{kind}", json={"content": content})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()


class CalibrationTests(LearnBase):
    def test_the_review_is_the_persons_alone_and_stays(self):
        spec = doc_kinds.require("learn.calibration")
        self.assertEqual((spec.authors, spec.deletable), (frozenset({"user"}), False))
        self.assertTrue(all(field.human_only for field in spec.fields.values()))
        with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
            doc_kinds.validate("learn.calibration", REVIEW, "ai")
        saved = self.save("learn.calibration", REVIEW)
        self.assertEqual((saved["author"], saved["block"]), ("user", "LEARN"))
        self.assertEqual(saved["content"]["process"], "我先寫下了預測")   # process and luck are written apart
        self.assertEqual(saved["content"]["luck"], "他剛好心情好")
        self.assertEqual(saved["content"]["wrong_sources"][0]["source"], "同業群組的說法")   # a wrong source is stored in my kind
        self.assertEqual(self.client.delete(f"{self.base}/docs/learn.calibration/{saved['doc_id']}").status_code, 400)
        self.assertIn("DOC_FIELD_REQUIRED: learn.calibration.outcome", self.client.post(f"{self.base}/docs/learn.calibration", json={"content": {"judgment_version": 1}}).text)

    def test_the_blocks_picked_for_the_next_round_go_to_the_assembler_once_each(self):
        saved = self.save("learn.calibration", {**REVIEW, "next_blocks": ["GATHER", "COMPUTE"]})
        self.assertEqual([(n["by"], n["propose"], n["open"]) for n in saved["notices"] if n["type"] == "proposal"], [("LEARN", "GATHER", True), ("LEARN", "COMPUTE", True)])
        again = self.client.put(f"{self.base}/docs/learn.calibration/{saved['doc_id']}", json={"content": {**REVIEW, "next_blocks": ["GATHER", "COMPUTE", "VERIFY"]}, "base_version": 1}).json()
        self.assertEqual([n["propose"] for n in again["notices"] if n["type"] == "proposal"], ["VERIFY"])   # only what is new
        self.assertEqual(sorted(item["propose"] for item in self.client.get(f"{self.base}/proposals").json()), ["COMPUTE", "GATHER", "VERIFY"])
        self.assertEqual(self.client.post(f"{self.base}/docs/learn.calibration", json={"content": {**REVIEW, "next_blocks": ["SENSE"]}}).status_code, 400)   # not a block a proposal can name

    def test_a_high_risk_word_has_govern_add_the_guardrails(self):
        saved = self.save("learn.calibration", {**REVIEW, "outcome": "律師說合約要重簽"})
        self.assertEqual([(n["type"], n["category"], n["found_by"]) for n in saved["notices"] if n["type"] == "guardrail"], [("guardrail", "法律", "LEARN")])

    def test_the_day_to_come_back_is_one_record_you_can_move(self):
        first = self.save("learn.revisit", {"on": "2026-11-01"})
        self.assertEqual(self.client.post(f"{self.base}/docs/learn.revisit", json={"content": {"on": "2026-11-08"}}).status_code, 409)
        moved = self.client.put(f"{self.base}/docs/learn.revisit/{first['doc_id']}", json={"content": {"on": "2026-11-08"}, "base_version": 1}).json()
        self.assertEqual((moved["version"], moved["content"]["on"]), (2, "2026-11-08"))
        self.assertEqual(self.client.put(f"{self.base}/docs/learn.revisit/{first['doc_id']}", json={"content": {"on": "next week"}, "base_version": 2}).status_code, 400)

    def test_the_blocks_not_used_yet_are_listed_for_the_person_to_pick_from(self):
        self.save("decide.judgment", LEAN)
        unused = {item["code"]: item["open"] for item in self.client.get(f"{self.base}/learn/unused_blocks").json()["unused"]}
        self.assertEqual((unused["GATHER"], unused["COMPUTE"], unused["ACT"]), (True, True, True))
        self.assertNotIn("DECIDE", unused)
        self.assertNotIn("LEARN", unused)


class HistoryTests(LearnBase):
    def judged(self, project, intensity, change="他願意寫進合約"):
        self.save("decide.judgment", {**LEAN, "intensity_now": intensity, "change_condition": change}, project=project)

    def test_one_line_per_case_written_by_the_platform_and_kept_in_my_own_history(self):
        self.judged(self.pid, "強", "沒有")
        entry = self.client.post(f"{self.base}/learn/history").json()["entry"]
        self.assertEqual((entry["author"], entry["block"], entry["version"]), ("system", "LEARN", 1))
        self.assertEqual(entry["content"], {"project": self.pid, "judgment_version": 1, "intensity": "強", "wont_change": True, "moves": [learn.GROWTH[2]], "ai_docs": 0, "own_docs": 1})   # 「沒有」 is no falsifiable condition: only the uncertainty shows
        again = self.client.post(f"{self.base}/learn/history").json()["entry"]
        self.assertEqual((again["doc_id"], again["version"]), (entry["doc_id"], 2))   # the same case stays one line
        self.assertEqual(len(self.client.get("/me/docs/learn.history").json()), 1)
        forged = self.client.post("/me/docs/learn.history", json={"content": {"project": "P", "intensity": "強"}})
        self.assertEqual(forged.status_code, 403)   # only the platform writes it

    def test_the_same_habit_in_two_cases_is_pointed_out_without_blame(self):
        self.judged(self.pid, "強")
        self.assertEqual(self.client.post(f"{self.base}/learn/history").json()["hints"], [])
        second = self._create_project(name="第二個案子")["project_id"]
        self.judged(second, "強")
        hints = self.client.post(f"/projects/{second}/learn/history").json()["hints"]
        self.assertEqual(len(hints), 1)
        self.assertIn("2 個案子", hints[0])
        self.assertEqual(self.client.get("/me/learn/patterns").json(), {"hints": hints, "cases": 2})

    def test_the_history_and_the_moves_are_only_mine(self):
        self.judged(self.pid, "強")
        self.client.post(f"{self.base}/learn/history")
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity("colleague-id", self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(self.client.get("/me/learn/patterns").json(), {"hints": [], "cases": 0})
        self.assertEqual(self.client.get("/me/docs/learn.history").json(), [])
        for path in ("learn/moves", "learn/unused_blocks"):
            self.assertEqual(self.client.get(f"{self.base}/{path}").status_code, 404, path)
        self.assertEqual(self.client.post(f"{self.base}/learn/history").status_code, 404)

    def test_the_moves_come_from_the_cases_own_records(self):
        self.save("decide.judgment", {**LEAN, "problem_definition": "合作條件不穩", "alternative": "也可能是成本"})
        moves = self.client.get(f"{self.base}/learn/moves").json()["moves"]
        self.assertEqual([move["item"] for move in moves], [learn.GROWTH[0], learn.GROWTH[1], learn.GROWTH[2], learn.GROWTH[3]])


class DailyCardTests(LearnBase):
    def test_the_card_lives_outside_any_case_with_the_counterexample_the_persons(self):
        spec = doc_kinds.require("learn.daily")
        self.assertEqual((spec.owner, spec.authors), ("person", frozenset({"user"})))
        card = self.mine("learn.daily", {"about": "信念", "text": "我一定要先講話才安全"})
        self.assertEqual((card["author"], card["block"]), ("user", "LEARN"))
        edited = self.client.put(f"/me/docs/learn.daily/{card['doc_id']}", json={"content": {**card["content"], "counterexample": "上次我先聽，也沒事", "change_condition": "如果對方先講了"}, "base_version": 1}).json()
        self.assertEqual((edited["version"], edited["author"]), (2, "user"))
        self.assertEqual(self.client.get(f"{self.base}/docs/learn.daily").status_code, 404)   # not a case's kind

    def test_a_high_risk_word_suggests_opening_a_case_without_copying_the_card(self):
        saved = self.mine("learn.daily", {"about": "決定", "text": "我想把存款全投進去"})
        [notice] = [n for n in saved["notices"] if n["type"] == "suggest_case"]   # GOVERN's one notice for this (block_hooks/govern.py)
        self.assertEqual(notice["categories"], ["金錢"])
        self.assertNotIn("存款", str(notice))
        self.assertIn("開一個案子", notice["notice"])
        self.assertEqual(self.client.get(f"{self.base}/docs/govern.guardrail").json(), [])   # the guardrails are added inside a case, not by the card
        self.assertEqual([n for n in self.mine("learn.daily", {"about": "情緒", "text": "今天有點累"})["notices"] if n["type"] == "suggest_case"], [])

    def test_the_mirror_is_the_card_as_written_not_an_ai_turn_and_a_mirror_saved_before_stays_readable(self):
        """LEARN.mirror is the page showing the daily card as written (MyLearnPage.tsx); the gate has no such turn and the card is all it needs."""
        card = self.mine("learn.daily", {"about": "信念", "text": "我一定要先講話才安全"})
        self.assertEqual(self.client.post("/me/ai/LEARN/mirror", json={"context": {"card": card["doc_id"]}}).status_code, 404)
        self.assertEqual(self.provider.calls, [])
        self.assertEqual(doc_kinds.require("learn.daily_mirror").authors, frozenset({"ai"}))
        self.assertEqual(self.client.post("/me/docs/learn.daily_mirror", json={"content": {"summary": "x"}}).status_code, 403)   # only the AI wrote it, and no AI does now
        self.assertEqual(self.client.get("/me/docs/learn.daily_mirror").json(), [])
        self.assertEqual(self.client.get("/me/docs/learn.daily").json()[0]["content"], {"about": "信念", "text": "我一定要先講話才安全"})   # as written, nothing added

    def test_a_crisis_word_in_the_card_still_brings_help_without_any_model(self):
        saved = self.mine("learn.daily", {"about": "情緒", "text": "我不想活了"})
        self.assertEqual([notice["type"] for notice in saved["notices"] if notice["type"] == "crisis"], ["crisis"])
        self.assertEqual(self.provider.calls, [])

    def test_the_two_practices_and_a_sprint_are_the_persons_own_records(self):
        practice = self.mine("learn.practice", {"daily": True, "weekly_sprints": 2})
        self.assertEqual(self.client.post("/me/docs/learn.practice", json={"content": {"daily": False}}).status_code, 409)   # one setting, changed as a new version
        self.assertEqual(self.client.put(f"/me/docs/learn.practice/{practice['doc_id']}", json={"content": {"daily": True, "weekly_sprints": 3}, "base_version": 1}).json()["version"], 2)
        self.assertEqual(self.client.put(f"/me/docs/learn.practice/{practice['doc_id']}", json={"content": {"weekly_sprints": 9}, "base_version": 2}).status_code, 400)
        sprint = self.mine("learn.sprint", {"project": self.pid, "note": "做完一輪 25 分鐘循環"})
        self.assertEqual(sprint["content"]["project"], self.pid)
        self.assertEqual(self.client.delete(f"/me/docs/learn.sprint/{sprint['doc_id']}").status_code, 200)
        habit = self.mine("learn.habit", {"keep": "先寫預測再看結果", "change": "情緒強的時候先放著", "project": self.pid})
        self.assertEqual((habit["author"], habit["block"]), ("user", "LEARN"))
        self.assertEqual(self.client.get(f"{self.base}/docs/learn.habit").status_code, 404)   # across cases: not a case's kind
        with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
            doc_kinds.validate("learn.habit", {"keep": "x"}, "ai")


class CompareTests(LearnBase):
    """LEARN.compare is the review page's own side-by-side table and 「你自己做到的」 (LearnPage.tsx, own_moves), not an AI turn."""

    def test_the_turn_is_gone_and_a_comparison_the_ai_saved_before_stays_a_kind_the_case_holds(self):
        self.save("decide.judgment", {**LEAN, "conclusion": "先談一次", "confidence": 60})
        self.save("act.task", {"title": "跟他談", "prediction": "我猜他會讓步一半"})
        self.assertEqual({name for (block, name) in ai_gate.actions() if block == "LEARN"}, set())
        self.assertEqual(self.client.post(f"{self.base}/ai/LEARN/compare", json={"context": {}}).status_code, 404)
        self.assertEqual(self.provider.calls, [])
        self.assertEqual(doc_kinds.require("learn.compare").authors, frozenset({"ai"}))
        self.assertEqual(self.client.post(f"{self.base}/docs/learn.compare", json={"content": {"side_by_side": "x"}}).status_code, 403)
        self.assertEqual(self.client.get(f"{self.base}/docs/learn.compare").json(), [])


class WebParityTests(unittest.TestCase):
    def test_the_choices_and_questions_match_the_engine(self):
        page = (PRODUCT_ROOT / "apps" / "cognitive-web" / "lib" / "learn.ts").read_text(encoding="utf-8")
        for name, values in (("DECISIONS", learn.DECISIONS), ("PREDICTION_RESULT", learn.PREDICTION_RESULT), ("DONE_WHEN", learn.DONE_WHEN), ("DAILY_ABOUT", learn.DAILY_ABOUT), ("NEXT_BLOCKS", learn.PROPOSABLE)):
            found = re.search(rf"export const {name} = \[(.*?)\] as const;", page, re.S)
            self.assertIsNotNone(found, name)
            self.assertEqual(tuple(re.findall(r'"([^"]+)"', found.group(1))), values, name)
        for name, keys in (("REVIEW_CHECKS", learn.REVIEW_CHECK_KEYS), ("TRUST", learn.TRUST_KEYS)):
            found = re.search(rf"export const {name}(?::[^=]*)? = \[(.*?)\];", page, re.S)
            self.assertIsNotNone(found, name)
            self.assertEqual(tuple(re.findall(r'key: "([^"]+)"', found.group(1))), keys, name)


if __name__ == "__main__":
    unittest.main()
