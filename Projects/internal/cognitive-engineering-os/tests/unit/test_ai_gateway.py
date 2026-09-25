"""AI gateway: provider seam, JSON extraction, draft/validate/repair loop, recipe source assembly, API routes.

No network: every test uses a scripted fake provider or patches the egress seam."""

from __future__ import annotations

import inspect
import json
import threading
import time
import unittest
from unittest.mock import patch

from ai_lego import resolve_spec_root
from ai_lego.apps.api import main as api_main
from ai_lego.apps.api.dispatch import resolve_builder
from ai_lego.apps.cli.run_flowchart_slice import fixture_args
from ai_lego.errors import InvariantViolation
from tests.unit.method_testkit import shared_method_catalog
from ai_lego.platform.ai_gateway import draft as draft_mod
from ai_lego.platform.ai_gateway.draft import build_prompt, draft_method_kwargs, draft_recipe_source, extract_json_object, method_input_spec, recipe_draft_plan
from ai_lego.platform.ai_gateway.provider import API_KEY_ENV, DAILY_TOKEN_BUDGET_ENV, DEFAULT_DAILY_TOKEN_BUDGET, MODEL_ENV, AiCompletion, AnthropicProvider, provider_from_env
from ai_lego.platform.net import egress
from tests.unit.test_api_main import ApiTestCase

SPEC_ROOT = resolve_spec_root()
CATALOG = shared_method_catalog(SPEC_ROOT)


def flowchart_kwargs() -> dict:
    args, kwargs = fixture_args()
    return dict(inspect.signature(resolve_builder("systems.flowchart")).bind(*args, **kwargs).arguments)


class ScriptedProvider:
    """Returns the scripted texts in order; records every prompt."""

    model = "fake-model"

    def __init__(self, *texts: str):
        self.texts = list(texts)
        self.prompts: list[tuple[str, str]] = []

    def complete(self, system: str, user: str, *, max_tokens: int) -> AiCompletion:
        self.prompts.append((system, user))
        text = self.texts.pop(0) if self.texts else "{}"
        return AiCompletion(text=text, model=self.model, input_tokens=100, output_tokens=50)


class ExtractionTests(unittest.TestCase):
    def test_fenced_and_prose_wrapped_objects_are_extracted(self):
        self.assertEqual(extract_json_object('```json\n{"a": 1}\n```'), {"a": 1})
        self.assertEqual(extract_json_object('Here you go:\n{"a": {"b": [1, 2]}} trailing'), {"a": {"b": [1, 2]}})

    def test_non_objects_are_refused(self):
        for text in ("no json here", "[1, 2]", '{"a": '):
            with self.assertRaisesRegex(InvariantViolation, "AI_DRAFT_NOT_JSON"):
                extract_json_object(text)


class ProviderTests(unittest.TestCase):
    def test_unconfigured_env_yields_none_not_a_fixture(self):
        with patch.dict("os.environ", {API_KEY_ENV: "", MODEL_ENV: ""}):
            self.assertIsNone(provider_from_env())

    def test_env_key_and_model_are_honoured(self):
        with patch.dict("os.environ", {API_KEY_ENV: "sk-test", MODEL_ENV: "claude-x"}):
            provider = provider_from_env()
        self.assertIsInstance(provider, AnthropicProvider)
        self.assertEqual(provider.model, "claude-x")

    def test_egress_is_denied_before_any_socket(self):
        provider = AnthropicProvider("sk-test")
        with patch.dict("os.environ", {egress.EGRESS_ALLOWLIST_ENV: "api.openalex.org"}), patch.object(egress._OPENER, "open") as opened:
            with self.assertRaisesRegex(InvariantViolation, "NETWORK_EGRESS_DENIED"):
                provider.complete("s", "u", max_tokens=10)
        opened.assert_not_called()

    def test_messages_api_request_and_response_are_mapped(self):
        seen = {}

        def fake_fetch(url, timeout, *, method, headers, body, max_bytes, error_prefix):
            seen.update(url=url, method=method, headers=headers, body=body)
            return {"content": [{"type": "text", "text": "{\"ok\": true}"}], "model": "claude-real", "usage": {"input_tokens": 7, "output_tokens": 3}}

        provider = AnthropicProvider("sk-test", "claude-x", fetch=fake_fetch)
        completion = provider.complete("SYS", "USER", max_tokens=99)
        self.assertEqual(seen["method"], "POST")
        self.assertEqual(seen["headers"]["x-api-key"], "sk-test")
        self.assertEqual(seen["body"]["messages"], [{"role": "user", "content": "USER"}])
        self.assertEqual(seen["body"]["system"], "SYS")
        self.assertEqual((completion.text, completion.model, completion.input_tokens, completion.output_tokens), ('{"ok": true}', "claude-real", 7, 3))

    def test_empty_or_malformed_provider_output_is_an_explicit_error(self):
        provider = AnthropicProvider("sk-test", fetch=lambda *a, **k: {"content": [], "stop_reason": "max_tokens"})
        with self.assertRaisesRegex(InvariantViolation, "AI_PROVIDER_EMPTY_RESPONSE"):
            provider.complete("s", "u", max_tokens=10)
        provider = AnthropicProvider("sk-test", fetch=lambda *a, **k: {"nope": 1})
        with self.assertRaisesRegex(InvariantViolation, "AI_PROVIDER_MALFORMED_RESPONSE"):
            provider.complete("s", "u", max_tokens=10)

    def test_http_errors_never_echo_the_response_body(self):
        import io
        import urllib.error

        error = urllib.error.HTTPError("https://api.anthropic.com/v1/messages", 401, "Unauthorized", {}, io.BytesIO(b'{"error": "secret-echo sk-test"}'))
        provider = AnthropicProvider("sk-test")
        with patch.dict("os.environ", {egress.EGRESS_ALLOWLIST_ENV: "api.anthropic.com"}), patch.object(egress._OPENER, "open", side_effect=error):
            with self.assertRaisesRegex(InvariantViolation, r"^AI_PROVIDER_UNAVAILABLE: HTTP 401 from api\.anthropic\.com$"):
                provider.complete("s", "u", max_tokens=10)


class DraftLoopTests(unittest.TestCase):
    def test_spec_carries_contract_schema_and_builder_parameters(self):
        spec = method_input_spec(SPEC_ROOT, CATALOG, "systems.flowchart")
        self.assertIn("nodes", [p["name"] for p in spec["parameters"]])
        self.assertIn("Flowchart Record", spec["schema_yaml"])
        self.assertEqual(spec["record_id_prefix"], "FLOW-")
        prompt = build_prompt(spec, "brief text", exclude_params=("provenance",))
        self.assertIn("brief text", prompt)
        self.assertIn("DO NOT produce these keys", prompt)

    def test_build_prompt_names_the_literal_record_id_param_for_a_record_id_style_method(self):
        spec = method_input_spec(SPEC_ROOT, CATALOG, "systems.flowchart")
        prompt = build_prompt(spec, "brief text")
        self.assertIn("'record_id' if present must start with 'FLOW-'", prompt)

    def test_build_prompt_names_the_real_identity_param_for_a_domain_specific_id_method(self):
        """Regression guard (2026-09-18): this used to hardcode the literal string 'record_id' even
        when the builder's actual identity param is named something else (analysis_id/canvas_id/...),
        producing a vacuous prefix instruction the model could never act on. If a future signature
        reorder ever moves the identity param off position 0, this test -- not just the "convention
        holds for all 285 methods today" critic spot-check -- is what catches it."""
        spec = method_input_spec(SPEC_ROOT, CATALOG, "architecture.atam")
        self.assertEqual(spec["parameters"][0]["name"], "analysis_id")
        prompt = build_prompt(spec, "brief text")
        self.assertIn("'analysis_id' if present must start with 'ATAM-'", prompt)
        self.assertNotIn("'record_id' if present must start with", prompt)

    def test_valid_draft_passes_builder_and_gates_in_one_attempt(self):
        provider = ScriptedProvider(json.dumps(flowchart_kwargs(), ensure_ascii=False))
        result = draft_method_kwargs("systems.flowchart", "早上出門流程", provider=provider, spec_root=SPEC_ROOT, catalog=CATALOG)
        self.assertTrue(result.validation["ok"], result.validation)
        self.assertEqual(result.attempts, 1)
        self.assertEqual(result.kwargs["provenance"], {"epistemic_type": "AI_SUGGESTION", "authorship_state": "AI_SUGGESTED", "locked": None})
        self.assertEqual((result.input_tokens, result.output_tokens), (100, 50))

    def test_refused_draft_gets_exactly_one_repair_round_with_the_refusal_in_the_prompt(self):
        good = flowchart_kwargs()
        bad = dict(good)
        bad["edges"] = [dict(e, to_ref="MISSING") for e in good["edges"]]
        provider = ScriptedProvider(json.dumps(bad), json.dumps(good))
        result = draft_method_kwargs("systems.flowchart", "x", provider=provider, spec_root=SPEC_ROOT, catalog=CATALOG)
        self.assertTrue(result.validation["ok"], result.validation)
        self.assertEqual(result.attempts, 2)
        self.assertIn("REFUSED", provider.prompts[1][1])
        self.assertIn("MISSING", provider.prompts[1][1])

    def test_persistently_refused_draft_is_returned_with_the_refusal_not_accepted(self):
        bad = dict(flowchart_kwargs())
        bad["nodes"] = []
        provider = ScriptedProvider(json.dumps(bad), json.dumps(bad), json.dumps(bad))
        result = draft_method_kwargs("systems.flowchart", "x", provider=provider, spec_root=SPEC_ROOT, catalog=CATALOG)
        self.assertFalse(result.validation["ok"])
        self.assertEqual(result.attempts, 2)
        self.assertEqual(len(provider.texts), 1, "no third attempt")
        self.assertTrue(result.validation["error"])

    def test_unknown_keys_are_dropped_and_human_authorship_cannot_be_claimed(self):
        kwargs = flowchart_kwargs()
        kwargs["provenance"] = {"epistemic_type": "SOURCE_FACT", "authorship_state": "HUMAN_APPROVED", "locked": "LOCKED_FACT"}
        kwargs["injected"] = "x"
        provider = ScriptedProvider(json.dumps(kwargs))
        result = draft_method_kwargs("systems.flowchart", "x", provider=provider, spec_root=SPEC_ROOT, catalog=CATALOG)
        self.assertNotIn("injected", result.kwargs)
        self.assertEqual(result.kwargs["provenance"], {"epistemic_type": "AI_SUGGESTION", "authorship_state": "AI_SUGGESTED", "locked": None})

    def test_nested_item_provenance_is_forced_to_ai_suggested(self):
        """Item-level provenance (66 builders carry it per item) is not covered by the top-level stamp; gates check
        provenance shape only, so a model claiming HUMAN_APPROVED items would otherwise pass (critic 2026-09-17)."""
        from tests.unit.test_api_main import business_foundation_source

        swot = business_foundation_source()["swot"]  # factors[] and knowledge_set[] each carry HUMAN_APPROVED provenance
        provider = ScriptedProvider(json.dumps(swot))
        result = draft_method_kwargs("strategy.swot", "x", provider=provider, spec_root=SPEC_ROOT, catalog=CATALOG)
        self.assertTrue(result.validation["ok"], result.validation)
        for item in [*result.kwargs["factors"], *result.kwargs["knowledge_set"]]:
            self.assertEqual(item["provenance"]["authorship_state"], "AI_SUGGESTED", item)
            self.assertIsNone(item["provenance"]["locked"])
        nested = {"a": [{"b": {"epistemic_type": "DECISION", "authorship_state": "HUMAN_ORIGINAL", "locked": "LOCKED_DECISION"}}], "c": {"authorship_state": "HUMAN_ORIGINAL"}}
        draft_mod._force_ai_authorship(nested)
        self.assertEqual(nested["a"][0]["b"]["authorship_state"], "AI_SUGGESTED")
        self.assertIsNone(nested["a"][0]["b"]["locked"])
        self.assertEqual(nested["c"], {"authorship_state": "HUMAN_ORIGINAL"}, "a lone authorship key is not a provenance object")

    def test_provider_failure_carries_tokens_already_consumed(self):
        bad = dict(flowchart_kwargs())
        bad["nodes"] = []

        class FailsSecond(ScriptedProvider):
            def complete(self, system, user, *, max_tokens):
                if self.prompts:
                    raise InvariantViolation("AI_PROVIDER_UNAVAILABLE: HTTP 529 from api.anthropic.com")
                return super().complete(system, user, max_tokens=max_tokens)

        with self.assertRaises(draft_mod.AiDraftProviderError) as ctx:
            draft_method_kwargs("systems.flowchart", "x", provider=FailsSecond(json.dumps(bad)), spec_root=SPEC_ROOT, catalog=CATALOG)
        self.assertEqual((ctx.exception.input_tokens, ctx.exception.output_tokens), (100, 50))

    def test_brief_limits_and_non_dispatchable_methods_are_refused(self):
        provider = ScriptedProvider()
        with self.assertRaisesRegex(InvariantViolation, "AI_DRAFT_BRIEF_REQUIRED"):
            draft_method_kwargs("systems.flowchart", "  ", provider=provider, spec_root=SPEC_ROOT, catalog=CATALOG)
        with self.assertRaisesRegex(InvariantViolation, "AI_DRAFT_BRIEF_TOO_LONG"):
            draft_method_kwargs("systems.flowchart", "x" * (draft_mod.MAX_BRIEF_CHARS + 1), provider=provider, spec_root=SPEC_ROOT, catalog=CATALOG)
        with self.assertRaisesRegex(InvariantViolation, "METHOD_RESOLUTION_BLOCKED"):
            draft_method_kwargs("nope.nothing", "x", provider=provider, spec_root=SPEC_ROOT, catalog=CATALOG)
        self.assertEqual(provider.prompts, [], "no model call before the cheap checks pass")

    def test_every_active_dispatchable_method_has_a_draftable_spec(self):
        """The prompt builder must not crash on any real contract (schema lookup is heuristic for 58 contracts)."""
        from ai_lego.apps.api.dispatch import MethodDispatchError

        with_schema = 0
        total = 0
        for method_id in sorted(CATALOG.contracts):
            if not CATALOG.is_resolvable(method_id):
                continue
            try:
                spec = method_input_spec(SPEC_ROOT, CATALOG, method_id)
            except MethodDispatchError:
                continue
            total += 1
            with_schema += bool(spec["schema_yaml"])
            build_prompt(spec, "b")
        self.assertGreater(total, 275, f"{total} dispatchable methods; every ACTIVE contract except the non-method utility modules must draft")
        self.assertGreater(with_schema / total, 0.9, f"{with_schema}/{total} methods resolved a typed-object schema")


class RecipeDraftTests(unittest.TestCase):
    def test_plan_separates_source_and_upstream_params(self):
        plan = {n["label"]: n for n in recipe_draft_plan(SPEC_ROOT, "business-plan-full-v1")}
        self.assertEqual(sorted(plan["net_present_value_analysis"]["upstream_params"]), ["cash_flows", "discount_rate", "subject_ref"])
        self.assertEqual(plan["net_present_value_analysis"]["source_params"], {"record_id": "source.npv.record_id", "provenance": "source.npv.provenance"})
        self.assertNotIn("proposal", plan, "capability nodes are not drafted")

    def test_source_is_assembled_node_by_node_and_upstream_params_skip_validation(self):
        good = flowchart_kwargs()
        # art-therapy-unstick-v1: 4 method nodes; drive only the first with a real-shaped draft, the rest with junk
        vm = {"record_id": "VISMET-1", "felt_experience": "卡住", "image": "一堵牆", "metaphor_statement": "我像撞牆", "elements": [{"element": "牆", "meaning": "限制", "provenance": {"epistemic_type": "AI_SUGGESTION", "authorship_state": "AI_SUGGESTED", "locked": None}}]}
        provider = ScriptedProvider(json.dumps(vm, ensure_ascii=False), json.dumps(vm, ensure_ascii=False))
        first = draft_recipe_source("art-therapy-unstick-v1", "我卡在一個問題上", provider=provider, spec_root=SPEC_ROOT, catalog=CATALOG, labels=["visual_metaphor"])
        self.assertEqual([n["label"] for n in first["nodes"]], ["visual_metaphor"])
        self.assertIn("visual_metaphor", first["source"])
        self.assertEqual(first["source"]["visual_metaphor"]["image"], "一堵牆")
        self.assertEqual(first["usage"], {"input_tokens": 200, "output_tokens": 100})
        second = draft_recipe_source("art-therapy-unstick-v1", "x", provider=ScriptedProvider("{}"), spec_root=SPEC_ROOT, catalog=CATALOG, labels=["metaphor_dialogue"], source=first["source"])
        self.assertIn("visual_metaphor", second["source"], "earlier nodes are carried, not dropped")
        self.assertIn("metaphor_dialogue", second["source"])
        self.assertIs(second["nodes"][0]["ok"], False)
        with self.assertRaisesRegex(InvariantViolation, "AI_DRAFT_UNKNOWN_NODE_LABELS"):
            draft_recipe_source("art-therapy-unstick-v1", "x", provider=provider, spec_root=SPEC_ROOT, catalog=CATALOG, labels=["nope"])
        del good


class ApiRouteTests(ApiTestCase):
    def _use(self, provider):
        api_main.app.dependency_overrides[api_main.get_ai_provider] = lambda: provider

    def test_routes_require_a_session(self):
        for path in ("/ai/status", "/recipes/art-therapy-unstick-v1/draft-plan"):
            self.assertEqual(self.client.get(path).status_code, 401, path)
        self.assertEqual(self.client.post("/ai/draft/method/systems.flowchart", json={"brief": "x"}).status_code, 401)

    def test_unconfigured_provider_answers_503_and_status_says_so(self):
        self._login()
        self._use(None)
        self.assertEqual(self.client.get("/ai/status").json()["configured"], False)
        response = self.client.post("/ai/draft/method/systems.flowchart", json={"brief": "x"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("AI_PROVIDER_UNCONFIGURED", response.json()["detail"])

    def test_method_draft_is_validated_audited_and_metered(self):
        self._login()
        self._use(ScriptedProvider(json.dumps(flowchart_kwargs(), ensure_ascii=False)))
        response = self.client.post("/ai/draft/method/systems.flowchart", json={"brief": "早上出門"})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["validation"]["ok"])
        self.assertEqual(body["usage"], {"input_tokens": 100, "output_tokens": 50})
        status = self.client.get("/ai/status").json()
        self.assertEqual(status["usage"], {"calls": 1, "input_tokens": 100, "output_tokens": 50})
        self.assertEqual(status["budget"], {"daily_limit": DEFAULT_DAILY_TOKEN_BUDGET, "used_today": 150, "remaining_today": DEFAULT_DAILY_TOKEN_BUDGET - 150})
        invoked = self.client.post("/methods/systems.flowchart/invoke", json=body["draft"])
        self.assertEqual(invoked.status_code, 200, invoked.text)
        self.assertTrue(all(g["status"] == "PASS" for g in invoked.json()["gate_results"]))

    def test_daily_token_budget_blocks_further_drafts_once_exceeded(self):
        """OQ-AIDRAFT-2 (answered 2026-09-17): Phase 1 has no billing/credits, so a per-tenant daily token
        ceiling is the only thing stopping a runaway loop from an unbounded Anthropic bill."""
        self._login()
        self._use(ScriptedProvider(json.dumps(flowchart_kwargs(), ensure_ascii=False)))
        with patch.dict("os.environ", {DAILY_TOKEN_BUDGET_ENV: "100"}):
            response = self.client.post("/ai/draft/method/systems.flowchart", json={"brief": "x"})
            self.assertEqual(response.status_code, 200, response.text)  # 0 used before this call -> allowed
            status = self.client.get("/ai/status").json()
            self.assertEqual(status["budget"], {"daily_limit": 100, "used_today": 150, "remaining_today": 0})
            blocked = self.client.post("/ai/draft/method/systems.flowchart", json={"brief": "x"})
            self.assertEqual(blocked.status_code, 429, blocked.text)
            self.assertIn("AI_DAILY_TOKEN_BUDGET_EXCEEDED", blocked.json()["detail"])

    def test_daily_token_budget_only_counts_todays_usage(self):
        self._login()
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.record_ai_usage(self.tenant["tenant_id"], self.identity["identity_id"], "draft:x", "m", 500, 500)  # unbounded timestamp -> "today"
        with store._connect() as conn:
            conn.execute("UPDATE ai_usage SET used_at = '2000-01-01T00:00:00Z'")
        with patch.dict("os.environ", {DAILY_TOKEN_BUDGET_ENV: "100"}):
            status = self.client.get("/ai/status").json()
            self.assertEqual(status["usage"]["input_tokens"], 500, "all-time total still includes it")
            self.assertEqual(status["budget"]["used_today"], 0, "a year-2000 row must not count against today's budget")

    def test_misconfigured_budget_env_fails_closed_not_open(self):
        self._login()
        self._use(ScriptedProvider("{}"))
        for bad in ("not-a-number", "0", "-5"):
            with patch.dict("os.environ", {DAILY_TOKEN_BUDGET_ENV: bad}):
                response = self.client.post("/ai/draft/method/systems.flowchart", json={"brief": "x"})
                self.assertEqual(response.status_code, 503, (bad, response.text))
                self.assertIn("AI_DAILY_TOKEN_BUDGET_INVALID", response.json()["detail"])

    def test_ai_budget_lock_serializes_concurrent_requests_for_the_same_tenant(self):
        """Deterministic proof (not timing-luck-dependent) of the critic-found TOCTOU fix (2026-09-17): a
        second concurrent request for the SAME tenant must not reach the provider at all while the first is
        still inside the check-budget/call-provider/record-usage critical section. Without
        api_main._ai_budget_lock_for actually being held across that whole section, both requests would read
        the same pre-call usage total and both proceed immediately."""
        self._login()
        entered_count: list[int] = []
        count_lock = threading.Lock()
        release = threading.Event()

        class BlockingProvider(ScriptedProvider):
            def complete(self, system, user, *, max_tokens):
                with count_lock:
                    entered_count.append(1)
                release.wait(timeout=5)
                return super().complete(system, user, max_tokens=max_tokens)

        self._use(BlockingProvider(json.dumps(flowchart_kwargs(), ensure_ascii=False), json.dumps(flowchart_kwargs(), ensure_ascii=False)))
        results: dict[str, int] = {}

        def call(key):
            results[key] = self.client.post("/ai/draft/method/systems.flowchart", json={"brief": "x"}).status_code

        first = threading.Thread(target=call, args=("first",))
        first.start()
        deadline = time.monotonic() + 5
        while not entered_count and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertEqual(entered_count, [1], "first request never reached the provider")

        second = threading.Thread(target=call, args=("second",))
        second.start()
        time.sleep(0.3)
        self.assertEqual(entered_count, [1], "second request reached the provider while the first still held the tenant's budget lock -- the TOCTOU race is back")

        release.set()
        first.join(timeout=5)
        second.join(timeout=5)
        self.assertEqual(results.get("first"), 200)
        self.assertEqual(results.get("second"), 200)

    def test_ai_budget_lock_does_not_serialize_different_tenants(self):
        self.assertIsNot(api_main._ai_budget_lock_for("tenant-a"), api_main._ai_budget_lock_for("tenant-b"))
        self.assertIs(api_main._ai_budget_lock_for("tenant-a"), api_main._ai_budget_lock_for("tenant-a"))

    def test_unknown_method_is_404_and_provider_failures_are_502(self):
        self._login()
        self._use(ScriptedProvider("{}"))
        self.assertEqual(self.client.post("/ai/draft/method/nope.nothing", json={"brief": "x"}).status_code, 404)

        class Broken:
            model = "b"

            def complete(self, *a, **k):
                raise InvariantViolation("AI_PROVIDER_UNAVAILABLE: HTTP 529 from api.anthropic.com")

        self._use(Broken())
        response = self.client.post("/ai/draft/method/systems.flowchart", json={"brief": "x"})
        self.assertEqual(response.status_code, 502)
        self.assertIn("AI_PROVIDER_UNAVAILABLE", response.json()["detail"])
        self.assertEqual(self.client.get("/ai/status").json()["usage"]["calls"], 1, "a failed call is still metered")

    def test_recipe_draft_requires_one_to_three_labels_per_request(self):
        self._login()
        self._use(ScriptedProvider("{}"))
        for labels in (None, [], ["visual_metaphor", "metaphor_dialogue", "reframing", "value_clarification"]):
            response = self.client.post("/ai/draft/recipe/art-therapy-unstick-v1", json={"brief": "x", "labels": labels})
            self.assertEqual(response.status_code, 400, labels)
            self.assertIn("AI_DRAFT_LABELS_REQUIRED", response.json()["detail"])

    def test_recipe_draft_plan_and_node_draft_round_trip(self):
        self._login()
        plan = self.client.get("/recipes/art-therapy-unstick-v1/draft-plan")
        self.assertEqual(plan.status_code, 200)
        self.assertEqual([n["label"] for n in plan.json()["nodes"]], ["visual_metaphor", "metaphor_dialogue", "reframing", "value_clarification"])
        self.assertEqual(self.client.get("/recipes/nope/draft-plan").status_code, 404)
        self._use(ScriptedProvider("{}"))
        response = self.client.post("/ai/draft/recipe/art-therapy-unstick-v1", json={"brief": "x", "labels": ["reframing"], "source": {"visual_metaphor": {"a": 1}}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["source"]["visual_metaphor"], {"a": 1})
        self.assertIs(response.json()["nodes"][0]["ok"], False)
        self.assertEqual(self.client.post("/ai/draft/recipe/nope", json={"brief": "x", "labels": ["a"]}).status_code, 404)


if __name__ == "__main__":
    unittest.main()
