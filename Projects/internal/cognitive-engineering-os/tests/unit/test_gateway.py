"""Offline, deterministic tests for the AIGateway decision logic (registry resolution, egress policy, dispatch).

No real network/GPU call here -- that would make CI depend on Ollama being installed and running, which is not
this repo's CI contract. Real-exec evidence for the actual HTTP/SDK calls is a separate, manually-run smoke path
(same split as ``--transcription fixture|offline-stt``): see docs/PHASE5_RESEARCH_SLICE.md's Gateway section and
the 2026-09-04 WORKLOG entry for the real Anthropic + real local Ollama calls this suite intentionally does not
repeat here.
"""

from __future__ import annotations

import json
import unittest
from unittest import mock

from ai_lego.errors import AdapterUnavailable, InvariantViolation
from ai_lego.platform.ai_execution.gateway import AIGateway, GatewayResult, ollama_available


class ModelProfileResolutionTests(unittest.TestCase):
    def test_unregistered_profile_raises_with_the_profile_id_named(self):
        gateway = AIGateway({})
        with self.assertRaisesRegex(InvariantViolation, "MODEL_PROFILE_NOT_REGISTERED: 'missing-profile'"):
            gateway.complete("missing-profile", system="s", prompt="p")

    def test_unimplemented_provider_raises_naming_the_provider(self):
        gateway = AIGateway({"p1": {"provider": "google", "model_identifier": "x"}})
        with self.assertRaisesRegex(InvariantViolation, "PROVIDER_NOT_IMPLEMENTED: 'google'"):
            gateway.complete("p1", system="s", prompt="p")


class EgressPolicyTests(unittest.TestCase):
    """EC §101 / MP §61 / network-egress.yaml rule EGRESS-MP64-1: Restricted -> external_model = DENY."""

    def setUp(self):
        self.registry = {
            "cloud": {"provider": "anthropic", "model_identifier": "claude-haiku-4-5-20251001"},
            "local": {"provider": "self-hosted", "model_identifier": "gemma3:4b"},
        }

    def test_restricted_to_external_model_is_denied_before_any_key_or_network_use(self):
        # api_key is deliberately a poison value: if the guard did not fire first, this test would instead
        # fail on an SDK auth error, which would still prove the guard was bypassed but for the wrong reason.
        gateway = AIGateway(self.registry, api_key="POISON-should-never-be-read")
        with self.assertRaisesRegex(InvariantViolation, "EGRESS_MP64_1_VIOLATION.*Restricted.*anthropic"):
            gateway.complete("cloud", system="s", prompt="p", classification_tag="Restricted")

    def test_restricted_to_self_hosted_is_allowed_by_the_same_check(self):
        gateway = AIGateway(self.registry)
        with mock.patch("urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({"message": {"content": "ok"}, "prompt_eval_count": 1, "eval_count": 1}).encode("utf-8")
            result = gateway.complete("local", system="s", prompt="p", classification_tag="Restricted")
        self.assertEqual(result.provider, "self-hosted")

    def test_non_restricted_classification_does_not_block_external_model(self):
        gateway = AIGateway(self.registry, api_key="k")
        with mock.patch("anthropic.Anthropic") as anthropic_cls:
            client = anthropic_cls.return_value
            block = mock.Mock(type="text", text="ok")
            client.messages.create.return_value = mock.Mock(content=[block], usage=mock.Mock(input_tokens=3, output_tokens=1))
            result = gateway.complete("cloud", system="s", prompt="p", classification_tag="Internal")
        self.assertEqual(result.provider, "anthropic")

    def test_unset_classification_tag_does_not_block_external_model(self):
        gateway = AIGateway(self.registry, api_key="k")
        with mock.patch("anthropic.Anthropic") as anthropic_cls:
            client = anthropic_cls.return_value
            block = mock.Mock(type="text", text="ok")
            client.messages.create.return_value = mock.Mock(content=[block], usage=mock.Mock(input_tokens=3, output_tokens=1))
            result = gateway.complete("cloud", system="s", prompt="p")
        self.assertEqual(result.provider, "anthropic")


class AnthropicDispatchTests(unittest.TestCase):
    def test_missing_api_key_raises_adapter_unavailable_not_a_bare_key_error(self):
        gateway = AIGateway({"cloud": {"provider": "anthropic", "model_identifier": "claude-haiku-4-5-20251001"}})
        with self.assertRaisesRegex(AdapterUnavailable, "ANTHROPIC_API_KEY_MISSING"):
            gateway.complete("cloud", system="s", prompt="p")

    def test_successful_call_carries_trace_id_and_prompt_version_through(self):
        gateway = AIGateway({"cloud": {"provider": "anthropic", "model_identifier": "claude-haiku-4-5-20251001"}}, api_key="k")
        with mock.patch("anthropic.Anthropic") as anthropic_cls:
            client = anthropic_cls.return_value
            block = mock.Mock(type="text", text="PONG")
            client.messages.create.return_value = mock.Mock(content=[block], usage=mock.Mock(input_tokens=5, output_tokens=1))
            result = gateway.complete("cloud", system="s", prompt="p", trace_id="T-1", prompt_version="v3")
        self.assertIsInstance(result, GatewayResult)
        self.assertEqual(result.text, "PONG")
        self.assertEqual(result.trace_id, "T-1")
        self.assertEqual(result.prompt_version, "v3")
        self.assertEqual(result.input_tokens, 5)


class OllamaDispatchTests(unittest.TestCase):
    def test_request_is_posted_to_the_configured_endpoint_uri(self):
        registry = {"local": {"provider": "self-hosted", "model_identifier": "gemma3:4b", "endpoint": {"uri": "http://127.0.0.1:9999"}}}
        gateway = AIGateway(registry)
        with mock.patch("urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({"message": {"content": "hi"}, "prompt_eval_count": 2, "eval_count": 4}).encode("utf-8")
            gateway.complete("local", system="s", prompt="p")
            request_obj = urlopen.call_args[0][0]
        self.assertEqual(request_obj.full_url, "http://127.0.0.1:9999/api/chat")

    def test_ollama_error_body_raises_adapter_unavailable_naming_the_model(self):
        gateway = AIGateway({"local": {"provider": "self-hosted", "model_identifier": "missing-model"}})
        with mock.patch("urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({"error": "model not found"}).encode("utf-8")
            with self.assertRaisesRegex(AdapterUnavailable, "OLLAMA_CALL_FAILED.*missing-model"):
                gateway.complete("local", system="s", prompt="p")

    def test_unreachable_service_raises_adapter_unavailable(self):
        import urllib.error

        gateway = AIGateway({"local": {"provider": "self-hosted", "model_identifier": "gemma3:4b"}})
        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("connection refused")):
            with self.assertRaisesRegex(AdapterUnavailable, "OLLAMA_UNAVAILABLE"):
                gateway.complete("local", system="s", prompt="p")


class AvailabilityProbeTests(unittest.TestCase):
    def test_available_when_version_endpoint_responds(self):
        with mock.patch("urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({"version": "0.33.3"}).encode("utf-8")
            available, reason = ollama_available()
        self.assertTrue(available)
        self.assertIn("0.33.3", reason)

    def test_unavailable_when_connection_fails(self):
        import urllib.error

        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("refused")):
            available, reason = ollama_available()
        self.assertFalse(available)
        self.assertIn("could not reach", reason)


if __name__ == "__main__":
    unittest.main()
