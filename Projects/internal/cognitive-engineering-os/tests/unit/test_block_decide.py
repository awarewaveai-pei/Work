"""DECIDE 判斷: the judgment card is the person's alone (every field human-only, every version kept), 「什麼會改變結論」
is required and 「沒有」 is accepted but flagged, the AI only checks and gives nothing new after 「現在我要自己下結論」,
and the card proposes COMPUTE / COLLAB and calls GOVERN for guardrails."""

from __future__ import annotations

import ast
import contextlib
import json
import re
import unittest

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.core.domain.kinds import decide
from ai_lego.data.events import record_log
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate
from ai_lego.platform.ai_actions import decide as decide_actions
from ai_lego.platform.ai_gateway.provider import AiCompletion
from tests.unit.test_project_source_api import ProjectSourceApiTestCase


class Provider:
    """A model that answers one fixed object and remembers what it was asked."""
    model = "test-model"

    def __init__(self, answer: dict | None = None) -> None:
        self.answer = answer if answer is not None else {}
        self.calls: list[tuple[str, str]] = []

    def complete(self, system, user, *, max_tokens):
        raise AssertionError("the gate asks for JSON")

    def complete_json(self, system, user, *, max_tokens, **options):
        self.calls.append((system, user))
        return AiCompletion(text=json.dumps(self.answer, ensure_ascii=False), model=self.model, input_tokens=10, output_tokens=20)


@contextlib.contextmanager
def stub_kinds(*stubs: DocKind):
    """Documents of another block that this block reads (their own workers build the real kinds)."""
    original = doc_kinds.kinds
    doc_kinds.kinds = lambda: {**original(), **{stub.kind: stub for stub in stubs}}   # type: ignore[assignment]
    try:
        yield
    finally:
        doc_kinds.kinds = original   # type: ignore[assignment]


NOTES = DocKind("context.notes", "CONTEXT", "規範與脈絡", {"jurisdictions": Field("list", 10), "rights_duties": Field("text", 2000), "stance": Field("text", 2000),
                                                       "facets": Field("json", 8000), "interface": Field("json", 4000)}, singleton=True)

FULL = {
    "conclusion": "先跟合夥人談一次條件，再決定要不要拆夥", "problem_definition": "合作條件不穩，因為他三次改價", "facts": [{"text": "他三次改價", "sources": 1, "self_said": False, "credibility": "中"}],
    "assumptions": "他不是故意的", "norm_context": "合約沒寫價格調整", "alternative": "也可能是成本真的漲了", "options": ["談一次", "退出"], "criteria": "不要賠錢、不要翻臉",
    "uncertainty": "我不知道他的成本", "change_condition": "如果他願意寫進合約", "next_step": "這週先跟他談一次條件", "deciders": "我和他", "affected": ["合夥人", "員工"],
    "confidence": 60, "stop_answers": {"unknown": "他的成本", "value_vs_delay": "再等不值得", "reversible_enough": "是", "exit_or_escalate": "談不攏就退出"},
    "pre_checks": {"resources": "夠", "warned": "沒有", "pulled": "沒有", "deadline": "沒有"}, "intensity_now": "中",
    "influences_listed": [{"kind": "ai", "text": "AI 在旁邊"}], "influences_asked": [{"who": "家庭", "answer": "有", "note": "媽媽很擔心"}], "influences_added": ["同學的意見"],
}
LEAN = {"uncertainty": "不知道", "change_condition": "他願意白紙黑字寫下來", "confidence": 50, "intensity_now": "弱"}


class DecideBase(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = Provider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"

    def put(self, content, kind="decide.judgment", base=None):
        return self.client.post(f"{self.base}/docs/{kind}", json={"content": content}) if base is None else self.client.put(f"{self.base}/docs/{kind}/{base['doc_id']}", json={"content": content, "base_version": base["version"]})

    def judge(self, content=None, base=None):
        response = self.put(content or LEAN, base=base)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def check(self):
        listed = self.client.get(f"{self.base}/docs/decide.check")   # checking again = the check's next version
        held = listed.json() if listed.status_code == 200 else []
        over = {"doc_id": held[0]["doc_id"], "base_version": held[0]["version"]} if held else {}
        return self.client.post(f"{self.base}/ai/DECIDE/check", json={"context": {}, **over})


class JudgmentCardTests(DecideBase):
    def test_every_field_is_the_persons_alone_and_no_ai_can_take_the_card(self):
        spec = doc_kinds.require("decide.judgment")
        self.assertEqual((spec.authors, spec.singleton, spec.deletable), (frozenset({"user"}), True, False))
        self.assertTrue(all(field.human_only for field in spec.fields.values()))
        with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
            doc_kinds.validate("decide.judgment", LEAN, "ai")

    def test_the_whole_card_is_saved_by_the_person_and_every_version_stays(self):
        first = self.judge(FULL)
        self.assertEqual((first["author"], first["block"], first["version"]), ("user", "DECIDE", 1))
        second = self.judge({**FULL, "confidence": 40, "revision_reason": "他回信了"}, base=first)
        self.assertEqual(second["version"], 2)
        versions = self.client.get(f"{self.base}/docs/decide.judgment/{first['doc_id']}/versions").json()
        self.assertEqual([(item["version"], item["content"]["confidence"]) for item in versions], [(1, 60), (2, 40)])
        self.assertEqual(versions[1]["content"]["revision_reason"], "他回信了")
        self.assertEqual(versions[0]["content"]["influences_listed"], FULL["influences_listed"])   # what the system listed is kept with the version
        self.assertEqual(self.put(LEAN).status_code, 409)   # one judgment per case: the next one is a version
        removed = self.client.delete(f"{self.base}/docs/decide.judgment/{first['doc_id']}")
        self.assertEqual(removed.status_code, 400)
        self.assertIn("DOC_NOT_DELETABLE", removed.text)

    def test_what_would_change_it_confidence_and_the_uncertainty_are_required(self):
        for missing in ("change_condition", "uncertainty", "confidence", "intensity_now"):
            response = self.put({key: value for key, value in LEAN.items() if key != missing})
            self.assertEqual(response.status_code, 400, missing)
            self.assertIn(f"DOC_FIELD_REQUIRED: decide.judgment.{missing}", response.text)

    def test_writing_no_is_accepted_and_the_system_flags_it(self):
        saved = self.judge({**LEAN, "change_condition": "沒有"})
        self.assertEqual(saved["content"]["change_condition"], "沒有")
        for text in ("沒有", "沒有。", " 無 ", "沒有任何證據", "None", "「沒有」"):
            self.assertTrue(decide.wont_change(text), text)
        for text in ("沒有，除非他道歉", "如果他願意寫進合約", "", None, 5):
            self.assertFalse(decide.wont_change(text), repr(text))

    def test_no_field_scores_or_ranks_a_belief(self):
        names = {name for spec in doc_kinds.kinds().values() if spec.block in ("DECIDE", "ACT", "LEARN") for name in spec.fields}
        self.assertEqual(names & record_log.SCORE_KEYS, set())

    def test_the_ai_cannot_forge_a_check_or_a_review_as_the_person(self):
        forged = self.client.post(f"{self.base}/docs/decide.check", json={"content": {"gaps": ["x"]}})
        self.assertEqual(forged.status_code, 403)   # decide.check takes only the AI
        self.assertEqual(doc_kinds.require("decide.check").authors, frozenset({"ai"}))
        self.assertEqual(doc_kinds.require("decide.review").authors, frozenset({"user"}))

    def test_not_deciding_yet_is_a_record_and_the_seal_cannot_be_taken_back(self):
        paused = self.client.post(f"{self.base}/docs/decide.pause", json={"content": {"why": "還在等他回信"}})
        self.assertEqual(paused.status_code, 200)
        self.assertEqual(self.client.delete(f"{self.base}/docs/decide.pause/{paused.json()['doc_id']}").status_code, 200)
        seal = self.client.post(f"{self.base}/docs/decide.seal", json={"content": {"for_version": 1}}).json()
        self.assertEqual(self.client.delete(f"{self.base}/docs/decide.seal/{seal['doc_id']}").status_code, 400)

    def test_a_colleague_reaches_none_of_it(self):
        self.judge(FULL)
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity("colleague-id", self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(self.client.get(f"{self.base}/docs/decide.judgment").status_code, 404)
        self.assertEqual(self.check().status_code, 404)


class CheckTests(DecideBase):
    def test_the_check_is_the_ais_reads_only_the_judgment_and_never_rewrites_it(self):
        self.provider.answer = {"clarity": ["「再決定」是指什麼？"], "reversibility": ["退出：合約簽了就退不回"], "gaps": ["還沒寫替代假設"], "question": "你最怕他哪一點？",
                                "conclusion": "AI 替你寫的結論", "confidence": 99}
        saved = self.judge(FULL)
        with stub_kinds(NOTES):
            self.client.post(f"{self.base}/docs/context.notes", json={"content": {"jurisdictions": ["台灣"], "stance": "我傾向談", "facets": [{"facet": "經濟", "relevant": True}, {"facet": "宗教", "relevant": False}], "interface": {"1": "各自的界線"}}})
            turn = self.check()
        self.assertEqual(turn.status_code, 200, turn.text)
        check = turn.json()["saved"]
        self.assertEqual((check["author"], check["kind"], check["block"]), ("ai", "decide.check", "DECIDE"))
        self.assertEqual(check["content"]["reversibility"], ["退出：合約簽了就退不回"])
        self.assertNotIn("conclusion", check["content"])   # the model's extra keys are dropped
        self.assertEqual(self.client.get(f"{self.base}/docs/decide.judgment").json()[0]["version"], saved["version"])   # the card is untouched
        system, user = self.provider.calls[0]
        self.assertIn("do not write, complete or improve their conclusion", system)
        self.assertIn("先跟合夥人談一次條件", user)
        self.assertNotIn("AI 在旁邊", user)   # the system's own influence list is not the person's claim
        self.assertIn("台灣", user)
        self.assertIn("經濟", user)   # a facet marked relevant is read; one marked not relevant is not
        self.assertNotIn("宗教", user)
        self.assertIn("各自的界線", user)
        self.assertEqual({"decide.judgment", "decide.seal", "context.notes"}, set(ai_gate.actions()[("DECIDE", "check")].reads))

    def test_a_check_before_any_judgment_is_refused_without_a_model_call(self):
        self.assertEqual(self.check().status_code, 400)
        self.assertEqual(self.provider.calls, [])

    def test_after_i_conclude_myself_the_ai_gives_this_version_no_new_answer(self):
        """The card: 你按「現在我要自己下結論」之後，AI 不准再給新答案."""
        first = self.judge()
        self.assertEqual(self.check().status_code, 200)
        calls = len(self.provider.calls)
        self.client.post(f"{self.base}/docs/decide.seal", json={"content": {"for_version": 2}})   # drafting version 2
        refused = self.check()
        self.assertEqual(refused.status_code, 403)
        self.assertIn("AI_SEALED", refused.text)
        second = self.judge({**LEAN, "revision_reason": "我自己想清楚了"}, base=first)   # version 2 is saved: still sealed
        self.assertEqual(self.check().status_code, 403)
        self.judge({**LEAN, "revision_reason": "再想了一次"}, base=second)   # version 3 is free again
        self.assertEqual(self.check().status_code, 200)
        self.assertEqual(len(self.provider.calls), calls + 1)

    def test_the_seal_binds_even_when_the_contract_grants_more(self):
        self.judge()
        self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": ["counter", "direct_advice"]}})
        self.client.post(f"{self.base}/docs/decide.seal", json={"content": {"for_version": 1}})
        self.assertEqual(self.check().status_code, 403)

    def test_a_crisis_in_the_card_stops_the_check(self):
        saved = self.client.post(f"{self.base}/docs/decide.judgment", json={"content": {**LEAN, "conclusion": "我不想活了"}}).json()
        self.assertEqual(saved["notices"][0]["type"], "crisis")
        self.assertEqual(self.check().json().get("stopped"), "crisis")
        self.assertEqual(self.provider.calls, [])

    def test_the_person_confirms_what_cannot_be_undone(self):
        self.judge()
        self.provider.answer = {"reversibility": ["退出：簽了就退不回"]}
        check = self.check().json()["saved"]
        review = self.client.post(f"{self.base}/docs/decide.review", json={"content": {"check": check["doc_id"], "version": check["version"], "irreversible": ["退出：簽了就退不回"], "hold": "請人覆核", "reviewer": "律師朋友"}})
        self.assertEqual((review.status_code, review.json()["author"]), (200, "user"))

    def test_the_check_only_pointers_are_trimmed_to_the_card(self):
        self.judge()
        self.provider.answer = {"clarity": [f"c{n}" for n in range(9)], "gaps": ["", "g"], "revisitable": 5, "question": "q"}
        content = self.check().json()["saved"]["content"]
        self.assertEqual((len(content["clarity"]), content["gaps"], "revisitable" in content), (6, ["g"], False))
        self.assertEqual(decide_actions.LISTS["clarity"], 6)


class ProposalTests(DecideBase):
    def proposals(self):
        return [(item["propose"], item["guardrail"]) for item in self.client.get(f"{self.base}/proposals").json()]

    def test_comparing_cost_income_or_probability_proposes_compute_once(self):
        saved = self.judge({**LEAN, "criteria": "比兩條路的成本和收入"})
        self.assertEqual([(n["by"], n["propose"], n["open"]) for n in saved["notices"] if n["type"] == "proposal"], [("DECIDE", "COMPUTE", False)])
        proposal = self.client.get(f"{self.base}/proposals").json()[0]
        self.client.post(f"{self.base}/docs/assembler.answer", json={"content": {"proposal": proposal["doc_id"], "answer": "declined"}})
        again = self.judge({**LEAN, "criteria": "還是比成本", "revision_reason": "再看"}, base=saved)
        self.assertEqual([n for n in again["notices"] if n["type"] == "proposal"], [])   # a declined proposal is not made again
        self.assertEqual(self.proposals(), [])

    def test_someone_affected_who_also_decides_proposes_collab_and_marks_the_guardrail(self):
        saved = self.judge({**LEAN, "affected": ["第三位合夥人", "員工"], "deciders": "我和第三位合夥人"})
        self.assertEqual([n["propose"] for n in saved["notices"] if n["type"] == "proposal"], ["COLLAB"])
        self.assertEqual(self.proposals(), [("COLLAB", False)])
        why = self.client.get(f"{self.base}/proposals").json()[0]["why"]
        self.assertNotIn("護欄", why)
        self.assertNotIn("第三位合夥人", why)   # a proposal is never deleted: none of the person's words (not a name) go into it

    def test_the_collab_proposal_says_it_is_a_guardrail_when_the_case_has_one(self):
        self.client.post(f"{self.base}/docs/assembler.intake", json={"content": {"purpose": "複雜決策", "question": "要不要續約", "risk": "合約和錢", "package": "個人複雜決策"}})
        self.judge({**LEAN, "affected": ["第三位合夥人"], "deciders": "第三位合夥人和我"})
        self.assertEqual(self.proposals(), [("COLLAB", True)])
        self.assertIn("這是護欄的群組程序", self.client.get(f"{self.base}/proposals").json()[0]["why"])

    def test_alone_nothing_is_proposed(self):
        saved = self.judge({**LEAN, "affected": ["員工"], "deciders": "我"})
        self.assertEqual(saved["notices"], [])

    def test_a_high_risk_word_has_govern_add_the_guardrails_by_category_only(self):
        saved = self.judge({**LEAN, "conclusion": "找律師看合約再簽"})
        self.assertEqual([(n["type"], n["category"], n["found_by"]) for n in saved["notices"]], [("guardrail", "法律", "DECIDE")])
        guardrails = self.client.get(f"{self.base}/docs/govern.guardrail").json()
        self.assertEqual(sorted(doc["content"]["guardrail"] for doc in guardrails), ["professional", "require_sources", "wait_or_review"])
        self.assertNotIn("律師", json.dumps(guardrails, ensure_ascii=False))
        self.assertEqual(self.judge({**LEAN, "conclusion": "找律師看合約再簽", "revision_reason": "x"}, base=saved)["notices"], [])   # once


class ProposalWordsTests(unittest.TestCase):
    def test_every_proposal_of_these_blocks_has_fixed_words(self):
        """A proposal outlives deleted content, so its ``why`` is fixed words: one check for every hook file lives in
        test_block_foundation.ProposalWordsTests; here, that DECIDE and LEARN do propose (the check is not vacuous for them)."""
        calls = {name: sum(1 for node in ast.walk(ast.parse((PRODUCT_ROOT / "ai_lego" / "platform" / "block_hooks" / f"{name}.py").read_text(encoding="utf-8")))
                           if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "propose") for name in ("decide", "learn")}
        self.assertGreaterEqual(sum(calls.values()), 3, calls)


class WebParityTests(unittest.TestCase):
    """The page's words and keys (lib/decide.ts) come from the engine's: one list each (the page lists the questions, the engine the keys)."""
    @classmethod
    def setUpClass(cls):
        cls.page = (PRODUCT_ROOT / "apps" / "cognitive-web" / "lib" / "decide.ts").read_text(encoding="utf-8")

    def keys(self, name):
        found = re.search(rf"export const {name}(?::[^=]*)? = \[(.*?)\];", self.page, re.S)
        self.assertIsNotNone(found, name)
        return tuple(re.findall(r'(?:key|who): "([^"]+)"', found.group(1)))

    def test_stop_questions_pre_checks_and_asked_list_match_the_engine(self):
        self.assertEqual(self.keys("STOP_QUESTIONS"), decide.STOP_KEYS)
        self.assertEqual(self.keys("PRE_CHECKS"), decide.PRE_CHECK_KEYS)
        self.assertEqual(self.keys("ASKED"), decide.ASKED)

    def test_the_no_change_pattern_is_the_same_on_both_sides(self):
        found = re.search(r"export const NO_CHANGE = /(.*)/i;", self.page)
        self.assertIsNotNone(found)
        self.assertEqual(found.group(1), decide.NO_CHANGE)

    def test_the_choice_lists_match_the_engine(self):
        for name, values in (("INTENSITY", decide.INTENSITY), ("CREDIBILITY", decide.CREDIBILITY), ("HOLD", decide.HOLD), ("UNWINNABLE", decide.UNWINNABLE), ("ASKED_ANSWER", decide.ASKED_ANSWER)):
            found = re.search(rf"export const {name} = \[(.*?)\] as const;", self.page, re.S)
            self.assertIsNotNone(found, name)
            self.assertEqual(tuple(re.findall(r'"([^"]+)"', found.group(1))), values, name)


if __name__ == "__main__":
    unittest.main()
