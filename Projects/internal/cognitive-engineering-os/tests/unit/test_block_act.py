"""ACT 行動與觀察: a task card the person writes (prediction first), observation notes, the weekly-then-monthly/quarterly/
yearly rhythm and the reminders it makes, and the AI's one turn (split) that never promises or sets a number."""

from __future__ import annotations

import datetime
import re
import unittest

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.kinds import act
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate
from tests.unit.test_block_decide import Provider
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

D = datetime.date
TASK = {"title": "跟他談一次條件", "prediction": "我猜他會讓步一半", "due": "2099-01-01", "risk": "他可能翻臉", "stop_condition": "他再改一次就不談了", "escalate_condition": "談不攏就找人幫忙", "owner": "我", "irreversible": False,
        "whose_wish": "是我自己想談"}


def doc(doc_id, created_at, **content):
    return {"doc_id": doc_id, "content": content, "created_at": created_at, "at": created_at, "author": "user", "version": 1}


def begun(doc_id, started_at, **content):
    """A task as the reminders route hands it over: with the day the person first marked it 進行中 or 完成."""
    return {**doc(doc_id, started_at, **content), "started_at": started_at}


class RhythmTests(unittest.TestCase):
    start = D(2026, 10, 1)

    def test_weekly_for_the_first_month_then_by_the_persons_long_rhythm(self):
        weekly = [D(2026, 10, 8), D(2026, 10, 15), D(2026, 10, 22), D(2026, 10, 29)]
        self.assertEqual(act.checkpoints(self.start, "月", D(2026, 12, 31)), weekly + [D(2026, 11, 1), D(2026, 12, 1)])
        self.assertEqual(act.checkpoints(self.start, "季", D(2027, 1, 31)), weekly + [D(2027, 1, 1)])
        self.assertEqual(act.checkpoints(self.start, "年", D(2027, 12, 31)), weekly + [D(2027, 10, 1)])
        self.assertEqual(act.checkpoints(self.start, None, D(2026, 10, 7)), [])

    def test_a_month_end_start_does_not_double_a_checkpoint(self):
        self.assertEqual(act.add_months(D(2026, 1, 31), 1), D(2026, 2, 28))
        self.assertEqual(act.checkpoints(D(2026, 1, 31), "月", D(2026, 3, 31))[-2:], [D(2026, 2, 28), D(2026, 3, 31)])

    def test_one_note_in_a_period_settles_it(self):
        today = D(2026, 10, 8)
        self.assertEqual(act.observation_due(self.start, "月", [], D(2026, 10, 7)), None)
        self.assertEqual(act.observation_due(self.start, "月", [], today), {"since": "2026-10-08", "weekly": True})
        self.assertIsNone(act.observation_due(self.start, "月", [D(2026, 10, 5)], today))
        self.assertEqual(act.observation_due(self.start, "月", [D(2026, 10, 8)], D(2026, 10, 16)), {"since": "2026-10-15", "weekly": True})   # a note on the checkpoint belongs to the week before
        self.assertIsNone(act.observation_due(self.start, "月", [D(2026, 10, 9)], D(2026, 10, 16)))
        self.assertEqual(act.observation_due(self.start, "月", [], D(2026, 11, 2)), {"since": "2026-11-01", "weekly": False})
        self.assertIsNone(act.observation_due(self.start, "月", [D(2026, 10, 30)], D(2026, 11, 2)))

    def test_what_is_due_in_a_case(self):
        task = begun("T1", "2026-10-01T08:00:00Z", title="談一次", due="2026-10-20", status="進行中")
        self.assertEqual(act.case_reminders([task], [], [], [], D(2026, 10, 7)), [])
        self.assertEqual([(item["kind"], item["since"]) for item in act.case_reminders([task], [], [], [], D(2026, 10, 8))], [("note", "2026-10-08")])
        noted = [doc("N1", "2026-10-05T08:00:00Z", task="T1", happened="談了")]
        self.assertEqual(act.case_reminders([task], noted, [], [], D(2026, 10, 8)), [])
        self.assertEqual(act.case_reminders([begun("T1", "2026-10-01T08:00:00Z", title="談一次", status="完成")], [], [], [], D(2026, 10, 8)), [])   # a finished task needs no more notes

    def test_the_weeks_count_from_the_day_the_person_acted_not_from_the_card(self):
        """行動後第一個月，系統每週提醒你記一次: a card written on the 1st and begun on the 10th is first due on the 17th."""
        written_only = doc("T1", "2026-10-01T08:00:00Z", title="談一次", status="未開始")
        self.assertEqual(act.case_reminders([written_only], [], [], [], D(2026, 10, 30)), [])   # not begun: nothing to observe yet
        task = {**begun("T1", "2026-10-10T08:00:00Z", title="談一次", status="進行中"), "created_at": "2026-10-01T08:00:00Z"}
        self.assertEqual(act.case_reminders([task], [], [], [], D(2026, 10, 16)), [])   # a week after the card would already be due
        self.assertEqual([item["since"] for item in act.case_reminders([task], [], [], [], D(2026, 10, 17))], ["2026-10-17"])

    def test_the_day_of_acting_is_the_first_version_marked_in_progress_or_done(self):
        versions = [{"at": "2026-10-01T08:00:00Z", "content": {"status": "未開始"}}, {"at": "2026-10-03T08:00:00Z", "content": {"status": "擱置"}},
                    {"at": "2026-10-05T08:00:00Z", "content": {"status": "完成"}}, {"at": "2026-10-06T08:00:00Z", "content": {"status": "進行中"}}]
        self.assertEqual(act.started_at(versions), "2026-10-05T08:00:00Z")
        self.assertIsNone(act.started_at(versions[:2]))
        self.assertIsNone(act.started_at([{"at": "2026-10-01T08:00:00Z", "content": {}}]))
        self.assertIsNone(act.started_at([]))

    def test_a_task_that_is_due_brings_the_person_back_to_review_until_they_do(self):
        task = doc("T1", "2026-10-01T08:00:00Z", title="談一次", due="2026-10-20", status="完成")
        [review] = act.case_reminders([task], [], [], [], D(2026, 10, 21))
        self.assertEqual((review["block"], review["kind"], review["since"]), ("LEARN", "review", "2026-10-20"))
        reviewed = [doc("C1", "2026-10-21T08:00:00Z", judgment_version=1, outcome="他讓步了")]
        self.assertEqual(act.case_reminders([task], [], reviewed, [], D(2026, 10, 25)), [])
        stopped = doc("T2", "2026-10-01T08:00:00Z", title="算了", due="2026-10-10", status="停掉")
        self.assertEqual(act.case_reminders([stopped], [], [], [], D(2026, 10, 25)), [])   # a stopped task's date does not nag

    def test_a_review_written_before_the_due_date_and_updated_after_it_settles_the_reminder(self):
        """The review is one document with versions (LearnPage updates it): it counts from its latest version, not from the first."""
        task = doc("T1", "2026-10-01T08:00:00Z", title="談一次", due="2026-10-20", status="完成")
        first_written = doc("C1", "2026-10-10T08:00:00Z", judgment_version=1, outcome="還在等")
        self.assertEqual([item["kind"] for item in act.case_reminders([task], [], [first_written], [], D(2026, 10, 25))], ["review"])   # not looked at again since the due day
        updated_after = {**first_written, "at": "2026-10-22T08:00:00Z", "version": 2}
        self.assertEqual(act.case_reminders([task], [], [updated_after], [], D(2026, 10, 25)), [])

    def test_with_no_act_the_day_the_person_picked_brings_them_back(self):
        revisit = doc("R1", "2026-10-01T08:00:00Z", on="2026-11-01")
        self.assertEqual(act.case_reminders([], [], [], [revisit], D(2026, 10, 31)), [])
        self.assertEqual([item["kind"] for item in act.case_reminders([], [], [], [revisit], D(2026, 11, 1))], ["review"])

    def test_the_persons_own_day_decides_not_the_servers(self):
        late = begun("T1", "2026-10-01T20:00:00Z", title="談一次", status="進行中")   # 10-02 in Taipei
        self.assertEqual(act.case_reminders([late], [], [], [], D(2026, 10, 8), 480), [])
        self.assertEqual([item["since"] for item in act.case_reminders([late], [], [], [], D(2026, 10, 9), 480)], ["2026-10-09"])
        self.assertEqual(act.local_date("2026-10-02T18:30:00Z", 480), D(2026, 10, 3))

    def test_the_two_practices(self):
        today = D(2026, 10, 7)   # a Wednesday
        self.assertEqual(act.practice_reminders(None, [], [], today), [])
        self.assertEqual([item["kind"] for item in act.practice_reminders({"daily": True}, [], [], today)], ["daily"])
        self.assertEqual(act.practice_reminders({"daily": True}, [doc("D1", "2026-10-07T01:00:00Z", about="決定", text="x")], [], today), [])
        self.assertEqual(act.practice_reminders({"daily": True}, [doc("D1", "2026-10-06T18:30:00Z", about="決定", text="x")], [], today, 480), [])   # written at 02:30 on the 7th, Taipei
        sprints = [doc("S1", "2026-10-06T08:00:00Z", project="P"), doc("S0", "2026-10-04T08:00:00Z", project="P")]   # Sunday = last week
        [left] = act.practice_reminders({"weekly_sprints": 2}, [], sprints, today)
        self.assertEqual((left["kind"], left["since"], left["text"]), ("sprint", "2026-10-05", "這週還差 1 次 30 分鐘的思考衝刺"))
        self.assertEqual(act.practice_reminders({"weekly_sprints": 2}, [], sprints + [doc("S2", "2026-10-07T08:00:00Z", project="P")], today), [])
        self.assertEqual(act.practice_reminders({"daily": False, "weekly_sprints": 0}, [], [], today), [])


class ActBase(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = Provider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"

    def task(self, content=None, project=None):
        response = self.client.post(f"/projects/{project or self.pid}/docs/act.task", json={"content": content or TASK})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def ask(self, name, **over):
        return self.client.post(f"{self.base}/ai/ACT/{name}", json={"context": {}, **over})


class TaskAndNoteTests(ActBase):
    def test_the_task_is_the_persons_the_prediction_is_required_and_every_version_stays(self):
        spec = doc_kinds.require("act.task")
        self.assertEqual(spec.authors, frozenset({"user"}))
        self.assertTrue(all(field.human_only for field in spec.fields.values()))
        with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
            doc_kinds.validate("act.task", TASK, "ai")
        missing = self.client.post(f"{self.base}/docs/act.task", json={"content": {"title": "談一次"}})
        self.assertIn("DOC_FIELD_REQUIRED: act.task.prediction", missing.text)
        saved = self.task()
        self.assertEqual((saved["author"], saved["block"], saved["version"]), ("user", "ACT", 1))
        self.assertEqual(saved["content"]["whose_wish"], "是我自己想談")   # 行動前問：這正好是誰希望我做的
        for status in ("進行中", "完成", "進行中"):   # rapid flips: every one stays
            saved = self.client.put(f"{self.base}/docs/act.task/{saved['doc_id']}", json={"content": {**TASK, "status": status}, "base_version": saved["version"]}).json()
        versions = self.client.get(f"{self.base}/docs/act.task/{saved['doc_id']}/versions").json()
        self.assertEqual([item["content"].get("status") for item in versions], [None, "進行中", "完成", "進行中"])
        removed = self.client.delete(f"{self.base}/docs/act.task/{saved['doc_id']}")
        self.assertEqual(removed.status_code, 400)
        self.assertIn("DOC_NOT_DELETABLE", removed.text)

    def test_a_note_has_five_cells_and_numbers_and_stays(self):
        task = self.task()
        note = {"task": task["doc_id"], "happened": "他讓步了", "thoughts": "比我想的順", "adjustment": "下次先寫下來", "blocker": "他沒回訊息", "numbers": [{"name": "價格", "value": 90, "unit": "萬"}]}
        saved = self.client.post(f"{self.base}/docs/act.note", json={"content": note})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["content"]["numbers"], note["numbers"])
        self.assertEqual(self.client.post(f"{self.base}/docs/act.note", json={"content": {"happened": "沒有指到哪個任務"}}).status_code, 400)
        self.assertEqual(self.client.delete(f"{self.base}/docs/act.note/{saved.json()['doc_id']}").status_code, 400)
        self.assertEqual(self.client.post(f"{self.base}/docs/act.note", json={"content": {**note, "numbers": [{"name": "價格", "value": 80, "unit": "萬"}], "score": 3}}).status_code, 400)

    def test_a_high_risk_task_has_govern_add_the_guardrails_and_the_hold_is_the_persons(self):
        saved = self.task({**TASK, "title": "跟銀行借款", "irreversible": True, "hold": "請人覆核"})
        self.assertEqual([(n["type"], n["category"], n["found_by"]) for n in saved["notices"]], [("guardrail", "金錢", "ACT")])
        self.assertEqual(saved["content"]["hold"], "請人覆核")
        self.assertEqual(self.task({**TASK, "title": "跟銀行借款", "risk": "再借一次"})["notices"], [])   # once

    def test_an_irreversible_step_needs_the_persons_answer_when_the_case_is_guarded_or_its_own_words_would_guard_it(self):
        """有護欄時不可逆的一步要先等或請人覆核: the server holds it, not only the page. GOVERN adds wait_or_review for every category."""
        words = {**TASK, "title": "跟銀行借款", "irreversible": True}
        refused = self.client.post(f"{self.base}/docs/act.task", json={"content": words})   # no guardrail yet: the words alone would add one
        self.assertEqual(refused.status_code, 400)
        self.assertIn("ACT_HOLD_REQUIRED", refused.text)
        self.assertEqual(self.client.get(f"{self.base}/docs/act.task").json(), [])
        self.assertEqual(self.client.get(f"{self.base}/docs/govern.guardrail").json(), [])   # a refused save leaves no guardrail behind
        clean = self.task({**TASK, "title": "約時間", "irreversible": True})   # nothing high-risk, no guardrail: the person's step, no hold asked
        self.assertEqual(clean["content"]["irreversible"], True)
        self.assertEqual(self.task({**TASK, "title": "約時間", "irreversible": False})["content"].get("hold"), None)   # an undoable step is never held
        answered = self.task({**words, "hold": "我想過了，照做"})   # the person's own answer is enough, whichever it is
        self.assertEqual(answered["content"]["hold"], "我想過了，照做")
        self.assertIn("wait_or_review", {item["content"]["guardrail"] for item in self.client.get(f"{self.base}/docs/govern.guardrail").json()})
        guarded = self.client.post(f"{self.base}/docs/act.task", json={"content": {**TASK, "title": "約時間", "irreversible": True}})   # the case now has wait_or_review
        self.assertEqual((guarded.status_code, "ACT_HOLD_REQUIRED" in guarded.text), (400, True))
        self.assertEqual(self.task({**TASK, "title": "約時間", "irreversible": True, "hold": "先等一下"})["content"]["hold"], "先等一下")
        flip = self.client.put(f"{self.base}/docs/act.task/{clean['doc_id']}", json={"content": {**clean["content"], "status": "進行中"}, "base_version": 1})
        self.assertEqual((flip.status_code, "ACT_HOLD_REQUIRED" in flip.text), (400, True))   # the earlier step was saved before the guardrail: saving it again asks too
        self.assertEqual(self.client.put(f"{self.base}/docs/act.task/{clean['doc_id']}", json={"content": {**clean["content"], "status": "進行中", "hold": "請人覆核"}, "base_version": 1}).status_code, 200)

    def test_a_crisis_word_in_a_note_brings_help(self):
        task = self.task()
        saved = self.client.post(f"{self.base}/docs/act.note", json={"content": {"task": task["doc_id"], "thoughts": "我不想活了"}}).json()
        self.assertEqual(saved["notices"][0]["type"], "crisis")

    def test_a_colleague_reaches_none_of_it(self):
        self.task()
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity("colleague-id", self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(self.client.get(f"{self.base}/docs/act.task").status_code, 404)
        self.assertEqual(self.client.get(f"{self.base}/act/reminders").status_code, 404)
        self.assertEqual(self.ask("split").status_code, 404)


class ReminderRouteTests(ActBase):
    def test_the_case_list_gets_what_is_due_across_my_cases_and_nobody_elses(self):
        today = (datetime.date.today() + datetime.timedelta(days=10)).isoformat()
        first = self.task()
        self.task({**TASK, "title": "還沒開始的"})   # written, not begun: nothing to observe
        self.client.put(f"{self.base}/docs/act.task/{first['doc_id']}", json={"content": {**TASK, "status": "進行中"}, "base_version": 1})
        second = self._create_project(name="第二個案子")["project_id"]
        self.client.post(f"/projects/{second}/docs/learn.revisit", json={"content": {"on": datetime.date.today().isoformat()}})
        self.client.post("/me/docs/learn.practice", json={"content": {"daily": True, "weekly_sprints": 2}})
        found = self.client.get(f"/me/reminders?today={today}").json()
        self.assertEqual(sorted((item["scope"], item["kind"]) for item in found), [("case", "note"), ("case", "review"), ("person", "daily"), ("person", "sprint")])
        note = next(item for item in found if item["kind"] == "note")
        self.assertIn("跟他談一次條件", note["text"])
        self.assertNotIn("還沒開始的", note["text"])
        self.assertEqual((note["project_id"], note["project_name"], note["path"], note["block"]), (self.pid, "EdD study", f"/projects/{self.pid}/act", "ACT"))
        self.assertEqual(next(item for item in found if item["kind"] == "review")["path"], f"/projects/{second}/learn")
        self.assertEqual([item["kind"] for item in self.client.get(f"{self.base}/act/reminders?today={today}").json()], ["note"])
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity("colleague-id", self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(self.client.get(f"/me/reminders?today={today}").json(), [])

    def test_a_bad_day_or_no_session_is_refused(self):
        self.assertEqual(self.client.get("/me/reminders?today=next-week").status_code, 400)
        self.assertEqual(self.client.get("/me/reminders?utc_offset=9999").status_code, 422)
        self.client.cookies.clear()
        self.assertEqual(self.client.get("/me/reminders").status_code, 401)


class AiTurnTests(ActBase):
    def test_splitting_the_next_step_needs_the_contracts_option_permission_and_the_person_picks(self):
        self.client.post(f"{self.base}/docs/decide.judgment", json={"content": {"uncertainty": "不知道", "change_condition": "他願意寫進合約", "confidence": 50, "intensity_now": "弱", "next_step": "這週先跟他談一次條件"}})
        self.provider.answer = {"options": [{"step": "先傳訊息約時間", "why_small": "只是約", "reversible": True, "undo": "取消約"}, {"step": "直接簽約", "why_small": "x", "reversible": False, "undo": "其實可以退"},
                                            {"step": "", "reversible": True}, {"step": "壞的"}, "x"], "promise": "我替你談"}
        denied = self.ask("split")
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.provider.calls, [])
        self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": ["propose_options"]}})
        saved = self.ask("split").json()["saved"]
        self.assertEqual((saved["author"], saved["kind"]), ("ai", "act.split"))
        self.assertEqual([(item["step"], item["reversible"], item["undo"]) for item in saved["content"]["options"]], [("先傳訊息約時間", True, "取消約"), ("直接簽約", False, "")])
        self.assertNotIn("promise", saved["content"])
        self.assertIn("這週先跟他談一次條件", self.provider.calls[0][1])
        self.assertIn("do not recommend one", self.provider.calls[0][0])

    def test_there_must_be_a_next_step_to_split(self):
        self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": ["propose_options"]}})
        self.assertEqual(self.ask("split").status_code, 400)
        self.assertEqual(self.provider.calls, [])

    def test_flag_and_trend_are_code_now_not_ai_turns_and_their_saved_ai_records_stay_readable(self):
        """ACT.flag and ACT.trend are plain code (apps/cognitive-web/lib/act.ts); the gate no longer lists them, and an AI record saved before is still a kind the case holds."""
        self.assertEqual({name for (block, name) in ai_gate.actions() if block == "ACT"}, {"split"})
        task = self.task()
        for name in ("flag", "trend"):
            self.assertEqual(self.ask(name).status_code, 404, name)
            self.assertIn("ai", doc_kinds.require(f"act.{name}").authors, name)
        self.assertEqual(self.provider.calls, [])
        self.assertEqual(self.client.get(f"{self.base}/docs/act.flag").json(), [])
        self.assertEqual(self.client.get(f"{self.base}/docs/act.task").json()[0]["doc_id"], task["doc_id"])

    def test_the_ai_cannot_write_the_persons_task_or_note_and_reads_only_the_cards_kinds(self):
        for kind, content in (("act.split", {"options": [{"step": "x"}]}), ("act.flag", {"irreversible": ["x"]}), ("act.trend", {"summary": "x"})):
            self.assertEqual(self.client.post(f"{self.base}/docs/{kind}", json={"content": content}).status_code, 403, kind)
        self.assertEqual(set(ai_gate.actions()[("ACT", "split")].reads), {"decide.judgment", "act.task"})
        self.assertEqual(ai_gate.actions()[("ACT", "split")].needs, "propose_options")


class WebParityTests(unittest.TestCase):
    def test_the_status_and_rhythm_choices_match_the_engine(self):
        page = (PRODUCT_ROOT / "apps" / "cognitive-web" / "lib" / "act.ts").read_text(encoding="utf-8")
        for name, values in (("STATUS", act.STATUS), ("LONG_RHYTHM", act.LONG_RHYTHM)):
            found = re.search(rf"export const {name} = \[(.*?)\] as const;", page, re.S)
            self.assertIsNotNone(found, name)
            self.assertEqual(tuple(re.findall(r'"([^"]+)"', found.group(1))), values, name)


if __name__ == "__main__":
    unittest.main()
