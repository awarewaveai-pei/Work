"""When the AI cannot answer (2026-10-11 walk): the reason reaches the page (never a 502/504, which Cloudflare replaces with
its own page), an answer cut by our own cap says so (AI_ANSWER_TRUNCATED) and no action's cap is below the floor, and
every refusal is logged -- without the person's words."""

from __future__ import annotations

import json
import re
import unittest

from ai_lego import PRODUCT_ROOT
from ai_lego.apps.api import main as api_main
from ai_lego.data.events import record_log
from ai_lego.errors import InvariantViolation
from ai_lego.platform import ai_gate
from ai_lego.platform.ai_gate import MIN_MAX_TOKENS, AiAction
from ai_lego.platform.ai_gateway.draft import AiDraftProviderError
from ai_lego.platform.ai_gateway.provider import MAX_OUTPUT_TOKENS, AiCompletion, AnthropicProvider
from tests.unit.test_api_main import ApiTestCase

AI_LEGO = PRODUCT_ROOT / "ai_lego"


def _codes() -> set[str]:
    """Every AI_* code the engine can raise, read from its source."""
    found = set()
    for path in AI_LEGO.rglob("*.py"):
        found |= set(re.findall(r"\b(AI_[A-Z][A-Z_]+)(?=[:\"'])", path.read_text(encoding="utf-8")))
    return found


class StatusTests(unittest.TestCase):
    def test_no_ai_code_answers_a_server_error(self):
        codes = _codes() | {"AI_PROVIDER_UNAVAILABLE"}   # egress.py builds it from error_prefix="AI_PROVIDER"
        self.assertTrue({"AI_ANSWER_INVALID", "AI_ANSWER_TRUNCATED", "AI_PROVIDER_REFUSAL", "AI_DAILY_TOKEN_BUDGET_EXCEEDED"} <= codes, codes)
        for code in sorted(codes):
            status = api_main.ai_failure_status(InvariantViolation(f"{code}: x"))
            with self.subTest(code=code):
                self.assertTrue(status is None or 400 <= status < 500, status)   # None: the route's own 4xx
                if code.startswith("AI_ANSWER"):
                    self.assertEqual(status, 422)
                if code.startswith("AI_PROVIDER"):
                    self.assertEqual(status, 424)
        wrapped = AiDraftProviderError("AI_DRAFT_FAILED: x")
        wrapped.__cause__ = api_main.AiBudgetRefused("AI_DAILY_TOKEN_BUDGET_EXCEEDED: 1/1")
        self.assertEqual(api_main.ai_failure_status(wrapped), 429)
        for cause, status in (("AI_ANSWER_TRUNCATED: x", 422), ("AI_PROVIDER_REFUSAL: x", 424)):   # Codex 2026-10-11 F2
            wrapped = AiDraftProviderError("AI_DRAFT_FAILED: x")
            wrapped.__cause__ = InvariantViolation(cause)
            self.assertEqual(api_main.ai_failure_status(wrapped), status, cause)

    def test_no_route_answers_502_or_504(self):
        chosen = re.compile(r"(?:status_code\s*=|\belse|\breturn|\bif)\s*50[24]\b|\b50[24]\s+if\b")   # a status chosen, not a comment naming one
        found = [f"{path.relative_to(AI_LEGO)}:{number}" for path in (AI_LEGO / "apps").rglob("*.py")
                 for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1) if chosen.search(line.split("#")[0])]
        self.assertEqual(found, [])


class CapTests(unittest.TestCase):
    def test_every_action_cap_is_at_least_the_floor(self):
        for (block, name), action in ai_gate.actions().items():
            with self.subTest(action=f"{block}.{name}"):
                self.assertGreaterEqual(action.max_tokens, MIN_MAX_TOKENS)
                self.assertLessEqual(action.max_tokens, MAX_OUTPUT_TOKENS)
        with self.assertRaisesRegex(InvariantViolation, "AI_ACTION_INVALID: GOVERN.t max_tokens 1500"):
            AiAction(block="GOVERN", name="t", needs="organize", instructions="", output_kind="govern.explanation", output_schema={}, reads=(),
                     build_input=lambda context, read: "", outside_case=True, max_tokens=1500)


class _Docs:
    def current(self, *args, **kwargs):
        return []

    def save(self, *args, **kwargs):
        return {}


class _Echo:
    """Answers with the person's words in a field that must be text: the answer is refused (AI_ANSWER_INVALID)."""
    model = "test"
    output_tokens = 315

    def complete_json(self, system, user, *, max_tokens, **options):
        return AiCompletion(text=json.dumps({"explanation": [user]}, ensure_ascii=False), model="test", input_tokens=1, output_tokens=315)


class RefusalLogTests(unittest.TestCase):
    def test_a_refusal_is_logged_with_its_reason_and_without_the_persons_words(self):
        words = "合夥人第三次改合約條件"
        action = AiAction(block="GOVERN", name="probe", needs="organize", instructions="", output_kind="govern.explanation", output_schema={},
                          reads=(), build_input=lambda context, read: context["text"], outside_case=True)
        with self.assertLogs("ai_lego.platform.ai_gate", "WARNING") as logged, self.assertRaisesRegex(InvariantViolation, "AI_ANSWER_INVALID"):
            ai_gate.ask_ai(action, tenant_id="t", identity_id="i", project_id=None, context={"text": words}, docs=_Docs(), provider=_Echo())
        [line] = logged.output
        self.assertIn("action=GOVERN.probe code=AI_ANSWER_INVALID output_tokens=315 reason=DOC_FIELD_INVALID", line)
        self.assertNotIn(words, line)
        self.assertNotIn("合夥", line)


class RouteTests(ApiTestCase):
    """The block route answers each failure with its status and its reason (main.ai_failure_status)."""

    def setUp(self):
        super().setUp()
        self._login()

    def _ask(self, provider):
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: provider
        return self.client.post("/me/ai/GOVERN/explain", json={"context": {"topic": "where"}})

    def _anthropic(self, payload):
        return AnthropicProvider("test-key", fetch=lambda *args, **kwargs: payload)

    def test_each_failure_reaches_the_page_with_its_reason(self):
        cut = self._anthropic({"content": [{"type": "tool_use", "name": "answer", "input": {"explanation": "你可以寫"}}], "stop_reason": "max_tokens",
                               "usage": {"input_tokens": 5, "output_tokens": MIN_MAX_TOKENS}, "model": "claude-opus-5-5"})
        refused = self._ask(cut)
        self.assertEqual(refused.status_code, 422, refused.text)
        self.assertTrue(refused.json()["detail"].startswith("AI_ANSWER_TRUNCATED: the answer reached our cap"), refused.text)

        class Down:
            model = "claude-opus-5-5"

            def complete_json(self, *args, **kwargs):
                raise InvariantViolation("AI_PROVIDER_UNAVAILABLE: HTTP 529 from api.anthropic.com")

        down = self._ask(Down())
        self.assertEqual((down.status_code, down.json()["detail"]), (424, "AI_PROVIDER_UNAVAILABLE: HTTP 529 from api.anthropic.com"))
        invalid = self._ask(self._anthropic({"content": [{"type": "tool_use", "name": "answer", "input": {"explanation": ["not text"]}}], "stop_reason": "tool_use",
                                             "usage": {"input_tokens": 5, "output_tokens": 9}, "model": "claude-opus-5-5"}))
        self.assertEqual(invalid.status_code, 422, invalid.text)
        self.assertTrue(invalid.json()["detail"].startswith("AI_ANSWER_INVALID"))


if __name__ == "__main__":
    unittest.main()
