"""The parts every block builds on: documents (kinds, versions, delete, the AI/joint authorship rule, the human-only
field), the AI gate (協作合約 permission, crisis stop, read whitelist, saved as the AI's), hooks (SENSE proposes VERIFY)
and the crisis notice on a save."""

from __future__ import annotations

import json
import unittest
import uuid

from ai_lego.apps.api import main as api_main
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.data.events import record_log
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate, safety
from ai_lego.platform.ai_gateway.provider import AiCompletion
from tests.unit.test_project_source_api import ProjectSourceApiTestCase


class MirrorProvider:
    model = "test-mirror-model"

    def __init__(self, answer: dict | None = None) -> None:
        self.answer = answer or {"summary": "你寫了一件事和一個擔心。", "gaps": ["沒有一張卡講到錢，是沒發生還是沒寫？"], "question": "哪一張卡最重？", "extra": "dropped"}
        self.calls: list[tuple[str, str]] = []

    def complete(self, system, user, *, max_tokens):
        raise AssertionError("the gate asks for JSON")

    def complete_json(self, system, user, *, max_tokens, **options):
        self.calls.append((system, user))
        return AiCompletion(text=json.dumps(self.answer, ensure_ascii=False), model=self.model, input_tokens=10, output_tokens=20)


class DocKindRulesTests(unittest.TestCase):
    def test_a_kind_with_a_person_only_field_cannot_take_another_author(self):
        with self.assertRaisesRegex(InvariantViolation, "only the person authors it"):
            DocKind("x.y", "DECIDE", "t", {"conclusion": Field(human_only=True)}, authors=frozenset({"user", "ai"}))

    def test_the_ai_cannot_fill_a_person_only_field(self):
        kind = DocKind("x.z", "DECIDE", "t", {"conclusion": Field(human_only=True)})
        doc_kinds.kinds.cache_clear()
        original = doc_kinds.kinds
        try:
            doc_kinds.kinds = lambda: {**original(), "x.z": kind}   # type: ignore[assignment]
            with self.assertRaisesRegex(InvariantViolation, "RECORD_HUMAN_ONLY_FIELD"):
                doc_kinds.validate("x.z", {"conclusion": "do it"}, "ai")
            self.assertEqual(doc_kinds.validate("x.z", {"conclusion": "do it"}, "user"), {"conclusion": "do it"})
        finally:
            doc_kinds.kinds = original   # type: ignore[assignment]

    def test_unknown_fields_and_bad_choices_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DOC_FIELD_UNKNOWN"):
            doc_kinds.validate("sense.card", {"category": "事件", "text": "x", "score": 3}, "user")
        with self.assertRaisesRegex(InvariantViolation, "DOC_FIELD_INVALID"):
            doc_kinds.validate("sense.card", {"category": "不存在", "text": "x"}, "user")

    def test_every_kind_and_action_loads(self):
        self.assertIn("sense.card", doc_kinds.kinds())
        self.assertIn(("SENSE", "mirror"), ai_gate.actions())


class WebBlockListTests(unittest.TestCase):
    """apps/cognitive-web/lib/blocks.ts names the blocks for the pages; the codes, their order and which are open come
    from the engine (core/domain/blocks.py, kinds/assembler.py OPEN_BLOCKS)."""

    def test_the_pages_list_the_engines_blocks_and_open_ones(self):
        import re
        from ai_lego import PRODUCT_ROOT
        from ai_lego.core.domain.blocks import BLOCKS
        from ai_lego.core.domain.kinds.assembler import BUILD_STEP, OPEN_BLOCKS

        text = (PRODUCT_ROOT / "apps" / "cognitive-web" / "lib" / "blocks.ts").read_text(encoding="utf-8")
        rows = re.findall(r'\{ code: "([A-Z]+)", n: (\d+),.*?step: (\d+) \}', text)
        self.assertEqual([code for code, _, _ in rows], list(BLOCKS))
        self.assertEqual([int(n) for _, n, _ in rows], list(range(1, len(BLOCKS) + 1)))
        self.assertEqual(sorted(code for code, _, step in rows if int(step) <= BUILD_STEP), sorted(OPEN_BLOCKS))
        self.assertIn(f"export const OPEN_STEP = {BUILD_STEP};", text)

    def test_the_intake_page_offers_the_engines_purposes_and_packages(self):
        import re
        from ai_lego import PRODUCT_ROOT
        from ai_lego.core.domain.kinds.assembler import PACKAGE_OPENS_AT, PACKAGES, PURPOSE_PACKAGE, PURPOSES

        text = (PRODUCT_ROOT / "apps" / "cognitive-web" / "components" / "blocks" / "IntakePage.tsx").read_text(encoding="utf-8")
        rows = re.findall(r'\{ purpose: "([^"]+)", package: "([^"]+)", blocks: \[([^\]]*)\], opens: (\d+),', text)
        self.assertEqual([purpose for purpose, *_ in rows], list(PURPOSES))
        for purpose, package, blocks, opens in rows:
            self.assertEqual(package, PURPOSE_PACKAGE[purpose])
            self.assertEqual(tuple(re.findall(r'"([A-Z]+)"', blocks)), PACKAGES[package], package)
            self.assertEqual(int(opens), PACKAGE_OPENS_AT[package], package)

    def test_a_high_risk_intake_adds_the_guardrails_once(self):
        import tempfile
        from pathlib import Path
        from ai_lego.data.repositories.case_docs import CaseDocs
        from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
        from ai_lego.platform.block_hooks import after_save

        with tempfile.TemporaryDirectory() as folder:
            docs = CaseDocs(ProjectSourceRepository(Path(folder) / "p.sqlite3"))
            owner = record_log.case("P")
            intake = docs.save("t", owner, "assembler.intake", {"purpose": "複雜決策", "question": "要不要續約", "risk": "合約和錢", "package": "個人複雜決策"}, record_log.user("me", "ASSEMBLER"))
            notices = after_save(docs, "t", owner, intake)
            self.assertEqual([notice["category"] for notice in notices], ["法律", "金錢"])
            self.assertEqual(len(docs.current("t", owner, "govern.guardrail")), 6)
            self.assertEqual(after_save(docs, "t", owner, intake), [])


class SafetyTests(unittest.TestCase):
    def test_signals_and_places(self):
        self.assertTrue(safety.crisis_signal("最近真的不想活了"))
        self.assertFalse(safety.crisis_signal("合夥人又改條件"))
        self.assertIn("1925", [item["contact"] for item in safety.resources("台灣台北")])
        self.assertNotIn("1925", [item["contact"] for item in safety.resources(None)])


class BlockFoundationApiTests(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = MirrorProvider()
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.pid = self._create_project()["project_id"]
        self.base = f"/projects/{self.pid}"

    def _card(self, text="合夥人第三次改條件", category="事件"):
        response = self.client.post(f"{self.base}/docs/sense.card", json={"content": {"category": category, "text": text}})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_a_card_is_mine_versioned_and_deletable(self):
        card = self._card()
        self.assertEqual((card["author"], card["block"], card["version"]), ("user", "SENSE", 1))
        edited = self.client.put(f"{self.base}/docs/sense.card/{card['doc_id']}", json={"content": {"category": "事件", "text": "他第三次改條件"}, "base_version": 1}).json()
        self.assertEqual(edited["version"], 2)
        stale = self.client.put(f"{self.base}/docs/sense.card/{card['doc_id']}", json={"content": {"category": "事件", "text": "x"}, "base_version": 1})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(len(self.client.get(f"{self.base}/docs/sense.card/{card['doc_id']}/versions").json()), 2)
        self.assertEqual(self.client.delete(f"{self.base}/docs/sense.card/{card['doc_id']}").status_code, 200)
        self.assertEqual(self.client.get(f"{self.base}/docs/sense.card").json(), [])
        history = self.client.get(f"{self.base}/history").json()   # the case's own stream; the card's content is gone from the file
        dump = "\n".join(sqlite_dump(self._repo.db_path))
        self.assertNotIn("第三次改條件", dump)

    def test_someone_elses_claim_proposes_verify(self):
        card = self._card("聽說同業都這樣改")
        self.assertEqual([(n["type"], n["propose"], n["open"]) for n in card["notices"]], [("proposal", "VERIFY", False)])
        self.assertEqual(self._card("網路上寫他們常這樣")["notices"], [])   # one open proposal at a time

    def test_a_crisis_word_in_a_card_brings_help(self):
        card = self._card("我不想活了")
        self.assertEqual(card["notices"][0]["type"], "crisis")

    def test_the_mirror_is_the_ais_and_my_unchanged_confirmation_stays_the_ais(self):
        self._card()
        turn = self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}})
        self.assertEqual(turn.status_code, 200, turn.text)
        mirror = turn.json()["saved"]
        self.assertEqual((mirror["author"], mirror["kind"]), ("ai", "sense.mirror"))
        self.assertNotIn("extra", mirror["content"])
        system, user = self.provider.calls[0]
        self.assertIn("Never write the person's conclusion", system)
        self.assertIn("合夥人第三次改條件", user)
        same = self.client.put(f"{self.base}/docs/sense.mirror/{mirror['doc_id']}", json={"content": mirror["content"], "base_version": 1}).json()
        self.assertEqual(same["author"], "ai")
        rewritten = self.client.put(f"{self.base}/docs/sense.mirror/{mirror['doc_id']}", json={"content": {**mirror["content"], "summary": "我改過"}, "base_version": 2}).json()
        self.assertEqual(rewritten["author"], "joint")
        calls = self.client.get(f"{self.base}/docs/govern.ai_call").json()   # 版本紀錄: which model, which instructions
        self.assertEqual([(call["content"]["block"], call["content"]["model"], len(call["content"]["instructions_sha256"])) for call in calls], [("SENSE", "test-mirror-model", 64)])

    def test_a_crisis_stops_the_ai_before_any_call(self):
        self._card("我想結束自己")
        turn = self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).json()
        self.assertEqual(turn["stopped"], "crisis")
        self.assertEqual(self.provider.calls, [])
        self.assertEqual([doc["content"]["reason"] for doc in self.client.get(f"{self.base}/docs/govern.stop").json()], ["crisis"])

    def test_the_contract_decides_what_the_ai_may_do(self):
        from ai_lego.core.domain.kinds.collab_contract import GRANTABLE
        action = ai_gate.AiAction(block="SENSE", name="t", needs="counter", instructions="", output_kind="sense.mirror", output_schema={},
                                  reads=(), build_input=lambda c, r: "")
        from ai_lego.data.repositories.case_docs import CaseDocs
        docs = CaseDocs(self._repo)
        with self.assertRaisesRegex(InvariantViolation, "AI_PERMISSION_DENIED"):
            ai_gate.ask_ai(action, tenant_id=self.tenant["tenant_id"], identity_id=str(uuid.uuid4()), project_id=self.pid, context={}, docs=docs, provider=self.provider)
        self.assertEqual(self.provider.calls, [])
        self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": ["counter"]}})
        ai_gate.ask_ai(action, tenant_id=self.tenant["tenant_id"], identity_id=str(uuid.uuid4()), project_id=self.pid, context={}, docs=docs, provider=self.provider)
        self.assertEqual(len(self.provider.calls), 1)
        self.assertIn("counter", GRANTABLE)

    def test_an_action_reads_only_what_its_card_allows(self):
        action = ai_gate.AiAction(block="SENSE", name="peek", needs="organize", instructions="", output_kind="sense.mirror", output_schema={},
                                  reads=("sense.card",), build_input=lambda c, read: str(read("assembler.intake")))
        from ai_lego.data.repositories.case_docs import CaseDocs
        with self.assertRaisesRegex(InvariantViolation, "AI_READ_REFUSED"):
            ai_gate.ask_ai(action, tenant_id=self.tenant["tenant_id"], identity_id=str(uuid.uuid4()), project_id=self.pid, context={}, docs=CaseDocs(self._repo), provider=self.provider)

    def test_a_crisis_anywhere_in_what_the_model_would_read_stops_it(self):
        """critic 2026-10-03: the strongest-emotion note went to the model unchecked."""
        self._card()
        self.client.post(f"{self.base}/docs/sense.state", json={"content": {"emotion": "絕望", "intensity": "強", "distance_note": "十年後我已經不想活了"}})
        self.assertEqual(self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).json().get("stopped"), "crisis")
        self.assertEqual(self.provider.calls, [])

    def test_one_contract_one_intake_one_state_per_case(self):
        self.assertEqual(self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": []}}).status_code, 200)
        second = self.client.post(f"{self.base}/docs/collab_contract.terms", json={"content": {"permissions": ["counter"]}})
        self.assertEqual(second.status_code, 409, second.text)

    def test_a_proposal_is_the_systems_and_the_answer_is_mine(self):
        forged = self.client.post(f"{self.base}/docs/assembler.proposal.decide", json={"content": {"propose": "ACT", "why": "forged"}})
        self.assertEqual(forged.status_code, 403)
        proposal = self._card("聽說同業都這樣改")["notices"][0]
        self.assertEqual(len(self.client.get(f"{self.base}/proposals").json()), 1)
        answer = self.client.post(f"{self.base}/docs/assembler.answer", json={"content": {"proposal": proposal["doc_id"], "answer": "declined"}}).json()
        self.assertEqual(answer["author"], "user")
        self.assertEqual(self.client.get(f"{self.base}/proposals").json(), [])
        stored = self.client.get(f"{self.base}/docs/{proposal['kind']}").json()[0]
        self.assertEqual(stored["author"], "system")

    def test_the_mirror_marks_only_the_seven_signals_with_the_cards_own_questions(self):
        self.provider.answer = {"summary": "s", "gaps": ["a", "b", "c", "d"], "explore": [{"signal": "x", "question": "你是不是童年創傷？"}, {"signal": "身份", "question": "自己編的問題"}]}
        self._card()
        mirror = self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).json()["saved"]
        from ai_lego.platform.ai_actions.sense import SIGNAL_QUESTIONS
        self.assertEqual(mirror["content"]["explore"], [{"signal": "身份", "question": SIGNAL_QUESTIONS["身份"]}])
        self.assertEqual(len(mirror["content"]["gaps"]), 3)

    def test_a_broken_model_answer_is_the_models_failure(self):
        self.provider.answer = {"summary": ""}
        self._card()
        self.assertEqual(self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).status_code, 502)

    def test_a_colleague_reaches_none_of_it(self):
        self._card()
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "colleague@example.com", "Colleague", "correct-horse-battery")
        self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "colleague@example.com", "password": "correct-horse-battery"})
        self.assertEqual(self.client.get(f"{self.base}/docs/sense.card").status_code, 404)
        self.assertEqual(self.client.post(f"{self.base}/ai/SENSE/mirror", json={"context": {}}).status_code, 404)

    def test_the_ai_cannot_post_as_itself_and_unknown_kinds_are_404(self):
        self.assertEqual(self.client.get(f"{self.base}/docs/nope.kind").status_code, 404)
        self.assertEqual(self.client.get(f"{self.base}/docs/govern.location").status_code, 404)   # a person's kind, not a case's
        guardrail = self.client.post(f"{self.base}/docs/govern.guardrail", json={"content": {"guardrail": "professional", "category": "健康", "found_by": "SENSE"}})
        self.assertEqual(guardrail.status_code, 403)   # system-only: a person cannot write GOVERN's guardrail


def sqlite_dump(path):
    import sqlite3
    connection = sqlite3.connect(path)
    try:
        return list(connection.iterdump())
    finally:
        connection.close()


if __name__ == "__main__":
    unittest.main()
