"""TEACH keeps practice records private, content versioned, and AI feedback unscored."""

from __future__ import annotations

import unittest

from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate
from ai_lego.platform.ai_actions import teach as teach_actions
from ai_lego.platform.block_hooks import teach as teach_hooks
from ai_lego.platform import lessons as teach_lessons
from tests.unit.test_block_decide import Provider
from tests.unit.test_project_source_api import ProjectSourceApiTestCase


LESSON = "course-self-understanding"
PRACTICE_CASE = "taiwan-central-weather"
RUN = {"lesson": LESSON, "lesson_version": 1, "practice_case": PRACTICE_CASE, "role": "提出者", "notes": "我先寫出看到的事情，再列出一個反例。"}


class TeachKindTests(unittest.TestCase):
    def test_person_records_and_system_completion_have_the_declared_authors(self):
        for kind in ("teach.run", "teach.aar", "teach.practice_consent"):
            spec = doc_kinds.require(kind)
            self.assertEqual((spec.owner, spec.authors), ("person", frozenset({"user"})))
            self.assertTrue(all(field.human_only for field in spec.fields.values()))
        self.assertEqual(doc_kinds.require("teach.completion").authors, frozenset({"system"}))
        self.assertEqual(doc_kinds.require("teach.practice_consent").from_case, "project_id")
        self.assertTrue(doc_kinds.require("teach.completion").deletable)
        self.assertEqual(doc_kinds.require("teach.completion_preference").fields["keep"].type, "bool")

    def test_ai_actions_import_the_loader_guards_instead_of_copying_them(self):
        self.assertIs(teach_actions._SCORE_OR_RANK_WORDS, teach_lessons._SCORE_OR_RANK_WORDS)
        self.assertIs(teach_actions._VULNERABLE_DEMAND, teach_lessons._VULNERABLE_DEMAND)

    def test_completion_cannot_be_written_by_the_person(self):
        with self.assertRaisesRegex(InvariantViolation, "RECORD_AUTHOR_NOT_ALLOWED"):
            doc_kinds.check_record("DocSaved", {"kind": "teach.completion", "content": {"course": "自我理解", "lesson_versions": {"course-self-understanding": 1}, "at": "2026-10-04"}}, "user", "TEACH", "person")

    def test_ai_output_shapes_have_no_score_like_key(self):
        score_like = {"score", "scores", "rank", "ranking", "rating", "grade", "feedback_score"}
        for action in teach_actions.ACTIONS:
            self.assertFalse(set(action.output_schema.get("properties", {})) & score_like, action.name)
            self.assertFalse(set(doc_kinds.require(action.output_kind).fields) & score_like, action.name)

    def test_ai_actions_are_person_actions_and_limit_their_record_reads(self):
        actions = {key: action for key, action in ai_gate.actions().items() if key[0] == "TEACH"}
        self.assertEqual(set(actions), {("TEACH", "opponent"), ("TEACH", "feedback_on_moves")})
        self.assertTrue(all(action.outside_case for action in actions.values()))
        self.assertEqual(set(actions[("TEACH", "opponent")].reads), {"teach.run", "teach.practice_consent"})
        self.assertEqual(set(actions[("TEACH", "feedback_on_moves")].reads), {"teach.run", "teach.practice_consent"})


class TeachApiTests(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = Provider({"challenge": "先說明你看見的資料，還缺哪個反例？", "question": "你要先檢查哪個地方？", "move_feedback": [{"move": "提出反例", "feedback": "你已經寫出反例。"}]})
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()

    def save(self, kind: str, content: dict):
        response = self.client.post(f"/me/docs/{kind}", json={"content": content})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_lesson_list_includes_drafts_and_get_returns_one_lesson(self):
        response = self.client.get("/blocks/teach/lessons", params={"subject": "自我理解"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([item["id"] for item in response.json()], [LESSON])
        self.assertEqual(response.json()[0]["label"], "草稿")
        single = self.client.get(f"/blocks/teach/lessons/{LESSON}")
        self.assertEqual((single.status_code, single.json()["version"]), (200, 1))
        self.assertEqual(self.client.get("/blocks/teach/lessons/not-a-lesson").status_code, 404)

    def test_practice_cases_prefer_my_place_and_explain_fallback(self):
        self.save("govern.location", {"where": "台灣"})
        local = self.client.get("/blocks/teach/practice-cases").json()
        self.assertFalse(local["fallback"])
        self.assertEqual({item["place"] for item in local["cases"][:3]}, {"台灣"})
        self.save("govern.location", {"where": "火星"})
        fallback = self.client.get("/blocks/teach/practice-cases").json()
        self.assertTrue(fallback["fallback"])
        self.assertIn("其他地方", fallback["message"])

    def test_unknown_lesson_version_is_refused(self):
        response = self.client.post("/me/docs/teach.run", json={"content": {**RUN, "lesson_version": 99}})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("TEACH_LESSON_VERSION_UNKNOWN", response.text)

    def test_a_completed_one_lesson_course_writes_one_system_completion_and_notices(self):
        saved = self.save("teach.run", RUN)
        self.assertEqual([notice["notice"] for notice in saved["notices"] if notice["type"] == "teach_completion"], ["你上完了『自我理解』的課"])
        completions = self.client.get("/me/docs/teach.completion").json()
        self.assertEqual(len(completions), 1)
        self.assertEqual((completions[0]["author"], completions[0]["content"]["course"]), ("system", "自我理解"))
        again = self.save("teach.run", {**RUN, "notes": "我重新做一輪，不鎖住原本的案例。"})
        self.assertEqual([notice for notice in again["notices"] if notice["type"] == "teach_completion"], [])
        self.assertEqual(len(self.client.get("/me/docs/teach.completion").json()), 1)

    def test_person_cannot_forge_completion_and_can_skip_or_switch_by_saving_another_run(self):
        forged = self.client.post("/me/docs/teach.completion", json={"content": {"course": "自我理解", "lesson_versions": {LESSON: 1}, "at": "2026-10-04"}})
        self.assertEqual(forged.status_code, 403, forged.text)
        other = {**RUN, "practice_case": "international-oxford-notice", "role": "反方"}
        response = self.client.post("/me/docs/teach.run", json={"content": other})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(self.client.get("/me/docs/teach.run").json()), 1)
        self.assertEqual(self.client.get("/me/docs/teach.run").json()[0]["content"]["practice_case"], "international-oxford-notice")

    def test_real_case_context_requires_person_consent_before_the_model_call(self):
        self.save("teach.run", RUN)
        refused = self.client.post("/me/ai/TEACH/opponent", json={"context": {"real_case": "a-real-project"}})
        self.assertEqual(refused.status_code, 400, refused.text)
        self.assertIn("TEACH_PRACTICE_CONSENT_REQUIRED", refused.text)
        self.assertEqual(self.provider.calls, [])
        project = self._create_project()
        self.save("teach.practice_consent", {"project_id": project["project_id"]})
        allowed = self.client.post("/me/ai/TEACH/opponent", json={"context": {"run": self.client.get("/me/docs/teach.run").json()[0]["doc_id"]}})
        self.assertEqual(allowed.status_code, 200, allowed.text)
        self.assertIn('"opponent_role": "反方"', self.provider.calls[-1][1])
        feedback = self.client.post("/me/ai/TEACH/feedback_on_moves", json={"context": {}})
        self.assertEqual(feedback.status_code, 200, feedback.text)
        self.assertEqual(feedback.json()["saved"]["content"], {"move_feedback": [{"move": "提出反例", "feedback": "你已經寫出反例。"}]})

    def test_unknown_practice_case_consent_is_refused_and_erasing_the_case_erases_consent(self):
        unknown = self.client.post("/me/docs/teach.practice_consent", json={"content": {"project_id": "no-such-case"}})
        self.assertIn(unknown.status_code, (400, 404), unknown.text)
        project = self._create_project()
        self.save("teach.practice_consent", {"project_id": project["project_id"]})
        self.assertEqual(len(self.client.get("/me/docs/teach.practice_consent").json()), 1)
        erased = self.client.delete(f"/projects/{project['project_id']}")
        self.assertEqual(erased.status_code, 200, erased.text)
        self.assertEqual(self.client.get("/me/docs/teach.practice_consent").json(), [])

    def test_ai_text_cannot_score_rank_or_request_vulnerable_disclosure(self):
        self.save("teach.run", RUN)
        for answer, action, expected in (
            ({"challenge": "這次我給你 6 分，排名在中間。"}, "opponent", "TEACH_AI_OUTPUT_REFUSED"),
            ({"move_feedback": [{"move": "提出反例", "feedback": "這一輪評分 3/5，名次第二。"}]}, "feedback_on_moves", "TEACH_AI_OUTPUT_REFUSED"),
            ({"challenge": "請說出你的創傷，才可以繼續。"}, "opponent", "TEACH_PRIVATE_DISCLOSURE_REFUSED"),
        ):
            self.provider.answer = answer
            response = self.client.post(f"/me/ai/TEACH/{action}", json={"context": {"run": self.client.get("/me/docs/teach.run").json()[0]["doc_id"]}})
            self.assertNotEqual(response.status_code, 200, response.text)
            self.assertIn(expected, response.text)
        self.assertEqual(self.client.get("/me/docs/teach.opponent").json(), [])
        self.assertEqual(self.client.get("/me/docs/teach.feedback").json(), [])

    def test_missing_run_id_is_refused_instead_of_using_the_latest_run(self):
        self.save("teach.run", RUN)
        response = self.client.post("/me/ai/TEACH/opponent", json={"context": {"run": "no-such-run"}})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("TEACH_RUN_NOT_FOUND", response.text)
        self.assertEqual(self.provider.calls, [])

    def test_completion_opt_out_is_person_controlled_and_defaults_to_keep(self):
        self.save("teach.run", RUN)
        self.assertEqual(len(self.client.get("/me/docs/teach.completion").json()), 1)
        self.client.delete(f"/me/docs/teach.completion/{self.client.get('/me/docs/teach.completion').json()[0]['doc_id']}")
        preference = self.save("teach.completion_preference", {"keep": False})
        self.assertEqual(preference["content"]["keep"], False)
        response = self.client.post("/me/docs/teach.run", json={"content": {**RUN, "notes": "選擇不保留這次完成紀錄。"}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get("/me/docs/teach.completion").json(), [])

    def test_another_person_cannot_read_my_runs(self):
        self.save("teach.run", RUN)
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity("teach-colleague", self.tenant["tenant_id"], "teach-colleague@example.com", "Colleague", "correct-horse-battery")
        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "teach-colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(self.client.get("/me/docs/teach.run").json(), [])


class CompletionGuardTests(unittest.TestCase):
    def test_completion_waits_for_the_last_required_lesson(self):
        class Docs:
            def __init__(self):
                self.saved = []

            def current(self, _tenant_id, _owner, kind):
                if kind == "teach.run":
                    return [{"content": {"lesson": "lesson-a", "lesson_version": 1}}]
                return []

            def save(self, *_args, **_kwargs):
                self.saved.append(True)
                return {"kind": "teach.completion"}

        docs = Docs()
        lessons = {
            "lesson-a": {"version": 1},
            "lesson-b": {"version": 1},
        }
        self.assertIsNone(teach_hooks._completion_for(docs, "tenant", record_log.person("person"), "course", ["lesson-a", "lesson-b"], lessons))
        self.assertEqual(docs.saved, [])

    def test_completion_uses_the_newest_version_for_each_of_two_lessons(self):
        class Docs:
            def __init__(self):
                self.saved = []

            def current(self, _tenant_id, _owner, kind):
                if kind == "teach.run":
                    return [
                        {"content": {"lesson": "lesson-a", "lesson_version": 2}},
                        {"content": {"lesson": "lesson-b", "lesson_version": 1}},
                        {"content": {"lesson": "lesson-a", "lesson_version": 1}},
                    ]
                return []

            def save(self, *_args, **_kwargs):
                self.saved.append(True)
                return {"kind": "teach.completion"}

        docs = Docs()
        lessons = {"lesson-a": {"version": 2}, "lesson-b": {"version": 1}}
        self.assertIsNotNone(teach_hooks._completion_for(docs, "tenant", record_log.person("person"), "course", ["lesson-a", "lesson-b"], lessons))
        self.assertEqual(docs.saved, [True])

if __name__ == "__main__":
    unittest.main()
