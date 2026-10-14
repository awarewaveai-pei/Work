"""A block AI turn whose longest answer outruns a request runs in the background (ai_lego/apps/api/blocks/ai.py): the
8000-token EXPRESS draft needs ~118 s, the request may wait 85 s. Every check is still answered at once; the page gets the
same answer by asking after the turn; the turn's state is in the record log, erased with its case."""

from __future__ import annotations

import threading
import time
import unittest
from unittest import mock

from ai_lego.apps.api import main as api_main
from ai_lego.apps.api.blocks import ai as ai_routes
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction, actions
from ai_lego.platform.ai_gateway.provider import (BACKGROUND_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS, FIRST_TOKEN_SECONDS, MAX_OUTPUT_TOKENS,
                                                  OUTPUT_TOKENS_PER_SECOND, ProviderCallError)
from tests.unit.test_block_decide import Provider
from tests.unit.test_project_source_api import ProjectSourceApiTestCase

DRAFT = "/ai/EXPRESS/draft_from_outline"


class WhichTurnsWaitTests(unittest.TestCase):
    def test_a_turn_is_waited_for_only_when_its_longest_answer_fits_the_request(self):
        for (block, name), action in actions().items():
            longest = action.max_tokens / OUTPUT_TOKENS_PER_SECOND
            self.assertEqual(action.background, longest > DEFAULT_TIMEOUT_SECONDS - FIRST_TOKEN_SECONDS, f"{block}.{name}: {longest:.0f} s")
        self.assertTrue(actions()[("EXPRESS", "draft_from_outline")].background)
        self.assertFalse(actions()[("THINK", "mirror")].background)

    def test_a_background_turn_fits_its_own_timeout_and_the_wait_fits_the_request(self):
        self.assertLess(MAX_OUTPUT_TOKENS / OUTPUT_TOKENS_PER_SECOND, BACKGROUND_TIMEOUT_SECONDS)
        self.assertLess(ai_routes.SYNC_WAIT_SECONDS, DEFAULT_TIMEOUT_SECONDS)

    def test_a_group_action_is_never_a_background_turn(self):
        with self.assertRaisesRegex(InvariantViolation, "AI_ACTION_INVALID: COLLAB.x runs in a group"):
            AiAction(block="COLLAB", name="x", needs="organize", instructions="", output_kind="collab.differences", output_schema={}, reads=(),
                     build_input=lambda context, read: "", in_group=True, max_tokens=8000)


class SlowProvider(Provider):
    """A model that answers only when the test lets it (``go``), as a two-minute draft does, or fails with ``failure``."""

    def __init__(self, answer: dict) -> None:
        super().__init__(answer)
        self.go = threading.Event()
        self.failure: Exception | None = None
        self.max_tokens: list[int] = []

    def complete_json(self, system, user, *, max_tokens, **options):
        self.max_tokens.append(max_tokens)
        if not self.go.wait(10):
            raise AssertionError("the test never let the model answer")
        if self.failure is not None:
            raise self.failure
        return super().complete_json(system, user, max_tokens=max_tokens, **options)


class BackgroundTurnApiTests(ProjectSourceApiTestCase):
    def setUp(self):
        super().setUp()
        self.provider = SlowProvider({})
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: self.provider
        self._login()
        self.project = self._create_project()
        self.base = f"/projects/{self.project['project_id']}"
        self.card = self.save("sense.card", {"category": "事件", "text": "我看到了一個選項。"})
        self.save("express.selection", {"items": [self.ref(self.card)], "format": "摘要", "reader": "合夥人"})
        self.provider.answer = {"sentences": [{"text": "我看見了一個選項。", "refs": [{"kind": "sense.card", "doc_id": self.card["doc_id"]}], "unchecked": False, "author": "ai"}]}
        self.short_wait = mock.patch.object(ai_routes, "SYNC_WAIT_SECONDS", 0.2)
        self.short_wait.start()
        self.addCleanup(self.short_wait.stop)
        self.addCleanup(self.provider.go.set)   # never leave a runner waiting

    def save(self, kind: str, content: dict) -> dict:
        response = self.client.post(f"{self.base}/docs/{kind}", json={"content": content})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def ref(self, doc: dict) -> dict:
        return {"project_id": self.project["project_id"], "kind": doc["kind"], "doc_id": doc["doc_id"]}

    def started(self) -> str:
        response = self.client.post(f"{self.base}{DRAFT}", json={"context": {}})
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()["status"], "PENDING")
        return response.json()["turn"]

    def settled(self, turn: str):
        for _ in range(200):
            response = self.client.get(f"{self.base}/ai/turns/{turn}")
            if response.status_code != 202:
                return response
            time.sleep(0.05)
        self.fail("the turn never finished")

    def turn_rows(self) -> int:
        with self._repo.transaction(self.tenant["tenant_id"]) as connection:
            return connection.execute("SELECT COUNT(*) FROM events WHERE tenant_id=%s AND aggregate_id LIKE 'aiturn:%%'", (self.tenant["tenant_id"],)).fetchone()[0]

    def test_an_8000_token_draft_finishes_in_the_background_and_the_page_gets_it(self):
        turn = self.started()
        waiting = self.client.get(f"{self.base}/ai/turns/{turn}")
        self.assertEqual((waiting.status_code, waiting.json()["status"]), (202, "PENDING"), waiting.text)
        self.assertTrue(waiting.json()["since"])
        self.provider.go.set()
        done = self.settled(turn)
        self.assertEqual(done.status_code, 200, done.text)
        saved = done.json()["saved"]
        self.assertEqual((saved["kind"], saved["author"], saved["version"]), ("express.draft", "ai", 1))
        self.assertEqual(saved["content"]["sentences"][0]["text"], "我看見了一個選項。")
        self.assertEqual(done.json()["model"], "test-model")
        self.assertEqual(self.provider.max_tokens, [8000])
        self.assertEqual([doc["doc_id"] for doc in self.client.get(f"{self.base}/docs/express.draft").json()], [saved["doc_id"]])
        store = api_main.app.dependency_overrides[api_main.get_store]()   # metered as any turn: the call's real cost, settled
        self.assertEqual(store.ai_usage_totals(self.tenant["tenant_id"], identity_id=self.identity["identity_id"])["output_tokens"], 20)

    def test_a_failure_reaches_the_page_with_its_status_and_keeps_only_codes(self):
        self.provider.failure = ProviderCallError("AI_PROVIDER_REFUSAL: the model said 我的秘密", reason="refusal")
        turn = self.started()
        self.provider.go.set()
        failed = self.settled(turn)
        self.assertEqual((failed.status_code, failed.json()["detail"]), (424, "AI_PROVIDER_REFUSAL"), failed.text)
        kept = CaseDocs(self._repo).turn_records(self.tenant["tenant_id"], record_log.case(self.project["project_id"]), turn)
        self.assertEqual([record["event_type"] for record in kept], ["AiTurnStarted", "AiTurnFailed"])
        self.assertNotIn("秘密", str(kept))
        with mock.patch.object(ai_routes, "SYNC_WAIT_SECONDS", 10):   # done inside the wait: the same status and code, the reason too (the asker's own turn, nothing kept)
            quick = self.client.post(f"{self.base}{DRAFT}", json={"context": {}})
        self.assertEqual((quick.status_code, quick.json()["detail"].split(":")[0]), (424, "AI_PROVIDER_REFUSAL"), quick.text)

    def test_the_crisis_stop_and_the_hand_back_are_answered_at_once(self):
        with mock.patch.object(ai_routes, "_launch_turn", side_effect=AssertionError("no turn may start")):
            hurt = self.save("sense.card", {"category": "事件", "text": "我不想活了"})
            selection = self.client.get(f"{self.base}/docs/express.selection").json()[0]
            self.client.put(f"{self.base}/docs/express.selection/{selection['doc_id']}", json={"content": {**selection["content"], "items": [self.ref(hurt)]}, "base_version": 1})
            stopped = self.client.post(f"{self.base}{DRAFT}", json={"context": {}})
            self.assertEqual((stopped.status_code, stopped.json().get("stopped")), (200, "crisis"), stopped.text)
            claim = self.save("verify.claim", {"text": "某件事真的發生了", "sentence": "可以查的事實", "from": "我加的"})
            self.client.put(f"{self.base}/docs/express.selection/{selection['doc_id']}", json={"content": {**selection["content"], "items": [self.ref(claim)]}, "base_version": 2})
            handed = self.client.post(f"{self.base}{DRAFT}", json={"context": {}})
            self.assertEqual((handed.status_code, list(handed.json())), (200, ["handback"]), handed.text)
        self.assertEqual(self.provider.max_tokens, [])
        self.assertEqual(self.turn_rows(), 0)

    def test_a_turn_whose_runner_died_says_so_and_no_one_else_reads_it(self):
        with mock.patch.object(ai_routes, "_launch_turn", side_effect=lambda **kwargs: kwargs["lock"].release()):   # the server restarted
            turn = self.started()
        lost = self.client.get(f"{self.base}/ai/turns/{turn}")
        self.assertEqual((lost.status_code, lost.json()["detail"]), (503, ai_routes.RUNNER_LOST), lost.text)
        self._login_as_a_different_tenant()
        self.assertEqual(self.client.get(f"{self.base}/ai/turns/{turn}").status_code, 404)

    def test_an_erased_account_gets_no_more_turn_records(self):
        """A person's background turn that ends after their account was erased writes nothing (record_log.require_person, via
        CaseDocs.record_turn): Codex review 2026-10-14 asked twice."""
        store = api_main.app.dependency_overrides[api_main.get_store]()
        docs, me = CaseDocs(self._repo), record_log.person(self.identity["identity_id"])
        docs.record_turn(self.tenant["tenant_id"], me, "T-before", "AiTurnStarted", {"block": "TEACH", "action": "opponent"}, record_log.user(self.identity["identity_id"], "TEACH"))
        self.assertTrue(store.delete_identity(self.tenant["tenant_id"], self.identity["identity_id"]))
        with self.assertRaisesRegex(InvariantViolation, "IDENTITY_ERASED"):
            docs.record_turn(self.tenant["tenant_id"], me, "T-before", "AiTurnFailed", {"status": 424, "error": "AI_PROVIDER_REFUSAL"}, record_log.system("TEACH"))

    def test_erasing_the_case_erases_its_turns(self):
        turn = self.started()
        self.provider.go.set()
        self.assertEqual(self.settled(turn).status_code, 200)
        self.assertEqual(self.turn_rows(), 2)
        self.assertEqual(self.client.delete(self.base).status_code, 200)
        self.assertEqual(self.turn_rows(), 0)


if __name__ == "__main__":
    unittest.main()
