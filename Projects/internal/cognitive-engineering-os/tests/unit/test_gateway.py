"""Offline, deterministic tests for the AIGateway decision logic (registry resolution, egress policy, dispatch).

No real network/GPU call here -- that would make CI depend on Ollama being installed and running, which is not
this repo's CI contract. Real-exec evidence for the actual HTTP calls is a separate, manually-run smoke path
(same split as ``--transcription fixture|offline-stt``): see docs/PHASE5_RESEARCH_SLICE.md's Gateway section and
the 2026-09-04 WORKLOG entry for the real Anthropic + real local Ollama calls this suite intentionally does not
repeat here. Both providers go through ``platform.net.egress``; these tests stop at its two openers.
"""

from __future__ import annotations

import http.server
import json
import threading
import unittest
import urllib.error
from unittest import mock

from ai_lego.errors import AdapterUnavailable, InvariantViolation
from ai_lego.platform.ai_execution.gateway import AIGateway, GatewayResult, ollama_available
from ai_lego.platform.net import egress

CLOUD = {"provider": "anthropic", "model_identifier": "claude-haiku-4-5-20251001"}
ALLOWED = {egress.EGRESS_ALLOWLIST_ENV: "api.anthropic.com"}


def answer(payload):
    response = mock.MagicMock()
    response.__enter__.return_value.read.return_value = json.dumps(payload).encode("utf-8")
    return response


def claude(text="ok", input_tokens=3, output_tokens=1):
    return answer({"content": [{"type": "text", "text": text}], "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
                   "model": CLOUD["model_identifier"], "stop_reason": "end_turn"})


def local(payload):
    return mock.patch.object(egress._LOOPBACK_OPENER, "open", return_value=answer(payload))


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
        self.registry = {"cloud": CLOUD, "local": {"provider": "self-hosted", "model_identifier": "gemma3:4b"}}

    def test_restricted_to_external_model_is_denied_before_any_key_or_network_use(self):
        # api_key is deliberately a poison value: if the guard did not fire first, this test would instead
        # fail on an auth error, which would still prove the guard was bypassed but for the wrong reason.
        gateway = AIGateway(self.registry, api_key="POISON-should-never-be-read")
        with mock.patch.object(egress._OPENER, "open") as opened:
            with self.assertRaisesRegex(InvariantViolation, "EGRESS_MP64_1_VIOLATION.*Restricted.*anthropic"):
                gateway.complete("cloud", system="s", prompt="p", classification_tag="Restricted")
        opened.assert_not_called()

    def test_restricted_to_self_hosted_is_allowed_by_the_same_check(self):
        gateway = AIGateway(self.registry)
        with local({"message": {"content": "ok"}, "prompt_eval_count": 1, "eval_count": 1}):
            result = gateway.complete("local", system="s", prompt="p", classification_tag="Restricted")
        self.assertEqual(result.provider, "self-hosted")

    def test_non_restricted_classification_does_not_block_external_model(self):
        gateway = AIGateway(self.registry, api_key="k")
        with mock.patch.dict("os.environ", ALLOWED), mock.patch.object(egress._OPENER, "open", return_value=claude()):
            for tag in ("Internal", None):
                self.assertEqual(gateway.complete("cloud", system="s", prompt="p", classification_tag=tag).provider, "anthropic")

    def test_the_cloud_model_is_reached_only_through_the_egress_allowlist(self):
        """Codex 2026-10-04 F1: the SDK took ANTHROPIC_BASE_URL from the environment and never asked the allowlist."""
        gateway = AIGateway(self.registry, api_key="k")
        with mock.patch.dict("os.environ", {egress.EGRESS_ALLOWLIST_ENV: "", "ANTHROPIC_BASE_URL": "https://elsewhere.example"}), \
                mock.patch.object(egress._OPENER, "open") as opened:
            with self.assertRaisesRegex(AdapterUnavailable, "ANTHROPIC_CALL_FAILED: NETWORK_EGRESS_DENIED"):
                gateway.complete("cloud", system="s", prompt="p")
        opened.assert_not_called()
        with mock.patch.dict("os.environ", {**ALLOWED, "ANTHROPIC_BASE_URL": "https://elsewhere.example"}), \
                mock.patch.object(egress._OPENER, "open", return_value=claude()) as opened:
            gateway.complete("cloud", system="s", prompt="p")
        self.assertEqual(opened.call_args[0][0].full_url, "https://api.anthropic.com/v1/messages")

    def test_a_local_model_off_this_machine_is_refused_before_any_connection(self):
        """Codex 2026-10-04 F1: endpoint.uri could name any host, and a case's words went there over plain http."""
        for uri in ("http://ollama.example:11434", "http://localhost:11434", "http://10.0.0.5:11434", "file:///etc/passwd"):
            gateway = AIGateway({"local": {"provider": "self-hosted", "model_identifier": "gemma3:4b", "endpoint": {"uri": uri}}})
            with mock.patch.object(egress._LOOPBACK_OPENER, "open") as opened:
                with self.assertRaisesRegex(InvariantViolation, "NETWORK_EGRESS_DENIED"):
                    gateway.complete("local", system="s", prompt="p")
            opened.assert_not_called()


class AnthropicDispatchTests(unittest.TestCase):
    def test_missing_api_key_raises_adapter_unavailable_not_a_bare_key_error(self):
        gateway = AIGateway({"cloud": CLOUD})
        with self.assertRaisesRegex(AdapterUnavailable, "ANTHROPIC_API_KEY_MISSING"):
            gateway.complete("cloud", system="s", prompt="p")

    def test_successful_call_carries_trace_id_and_prompt_version_through(self):
        gateway = AIGateway({"cloud": CLOUD}, api_key="k")
        with mock.patch.dict("os.environ", ALLOWED), mock.patch.object(egress._OPENER, "open", return_value=claude("PONG", 5, 1)):
            result = gateway.complete("cloud", system="s", prompt="p", trace_id="T-1", prompt_version="v3")
        self.assertIsInstance(result, GatewayResult)
        self.assertEqual((result.text, result.trace_id, result.prompt_version, result.input_tokens), ("PONG", "T-1", "v3", 5))


class OllamaDispatchTests(unittest.TestCase):
    def test_request_is_posted_to_the_configured_endpoint_uri(self):
        for uri in ("http://127.0.0.1:9999", "http://[::1]:9999"):
            gateway = AIGateway({"local": {"provider": "self-hosted", "model_identifier": "gemma3:4b", "endpoint": {"uri": uri}}})
            with local({"message": {"content": "hi"}, "prompt_eval_count": 2, "eval_count": 4}) as opened:
                gateway.complete("local", system="s", prompt="p")
            self.assertEqual(opened.call_args[0][0].full_url, f"{uri}/api/chat")

    def test_ollama_error_body_raises_adapter_unavailable_naming_the_model(self):
        gateway = AIGateway({"local": {"provider": "self-hosted", "model_identifier": "missing-model"}})
        with local({"error": "model not found"}):
            with self.assertRaisesRegex(AdapterUnavailable, "OLLAMA_CALL_FAILED.*missing-model"):
                gateway.complete("local", system="s", prompt="p")

    def test_unreachable_service_raises_adapter_unavailable(self):
        gateway = AIGateway({"local": {"provider": "self-hosted", "model_identifier": "gemma3:4b"}})
        with mock.patch.object(egress._LOOPBACK_OPENER, "open", side_effect=urllib.error.URLError("connection refused")):
            with self.assertRaisesRegex(AdapterUnavailable, "OLLAMA_UNAVAILABLE"):
                gateway.complete("local", system="s", prompt="p")


class RealLoopbackTests(unittest.TestCase):
    """A real socket on 127.0.0.1: the call the CLI makes to Ollama, without Ollama installed."""

    def setUp(self):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                asked = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
                if self.path.startswith("/moved/"):
                    self.send_response(302)
                    self.send_header("Location", "http://127.0.0.1:1/api/chat")
                    self.end_headers()
                    return
                body = json.dumps({"message": {"content": "heard " + asked["messages"][1]["content"]}, "prompt_eval_count": 3, "eval_count": 2}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def gateway(self, base):
        return AIGateway({"local": {"provider": "self-hosted", "model_identifier": "gemma3:4b", "endpoint": {"uri": base}}})

    def test_a_model_on_this_machine_answers_over_a_real_socket(self):
        result = self.gateway(self.base).complete("local", system="s", prompt="hello")
        self.assertEqual((result.text, result.input_tokens, result.output_tokens), ("heard hello", 3, 2))

    def test_a_redirect_from_it_is_not_followed(self):
        with self.assertRaisesRegex(InvariantViolation, "NETWORK_EGRESS_DENIED: a service on this machine redirected"):
            self.gateway(self.base + "/moved").complete("local", system="s", prompt="hello")

    def test_it_is_reached_directly_never_through_a_proxy_from_the_environment(self):
        dead = "http://127.0.0.1:1"   # a proxy that refuses every connection: the call works only if it goes direct
        with mock.patch.dict("os.environ", {"http_proxy": dead, "HTTP_PROXY": dead, "no_proxy": "", "NO_PROXY": ""}):
            with mock.patch.object(egress, "_LOOPBACK_OPENER", egress._direct_opener()):
                result = self.gateway(self.base).complete("local", system="s", prompt="direct")
        self.assertEqual(result.text, "heard direct")


class AvailabilityProbeTests(unittest.TestCase):
    def test_available_when_version_endpoint_responds(self):
        with local({"version": "0.33.3"}):
            available, reason = ollama_available()
        self.assertTrue(available)
        self.assertIn("0.33.3", reason)

    def test_unavailable_when_connection_fails(self):
        with mock.patch.object(egress._LOOPBACK_OPENER, "open", side_effect=urllib.error.URLError("refused")):
            available, reason = ollama_available()
        self.assertFalse(available)
        self.assertIn("could not reach", reason)


if __name__ == "__main__":
    unittest.main()
