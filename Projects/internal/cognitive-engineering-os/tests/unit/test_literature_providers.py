"""``literature_search`` registered provider (OpenAlex) -- egress gate, provider registry, normalization, recipe run.

No test opens a socket: ``fetch_json`` is the single seam and is replaced with a fixture callable.
"""

from __future__ import annotations

import unittest
import urllib.request as urllib_request
from unittest.mock import patch

from ai_lego import resolve_spec_root
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research import literature_providers as lp
from ai_lego.modules.research.evidence_triangulation import OFFLINE_SOURCE_STALE, triangulate_themes_and_literature
from ai_lego.platform.workflow.ir import compile_recipe_to_workflow_ir
from tests.unit.test_api_main import ApiTestCase

ALLOW = {lp.EGRESS_ALLOWLIST_ENV: "api.openalex.org"}

OPENALEX_FIXTURE = {
    "meta": {"count": 2},
    "results": [
        {
            "id": "https://openalex.org/W1234567890",
            "display_name": "Arts-based inquiry in doctoral education",
            "publication_year": 2021,
            "doi": "https://doi.org/10.1000/example.1",
            "authorships": [{"author": {"display_name": "A. Author"}}, {"author": {"display_name": "B. Writer"}}],
            "primary_location": {"source": {"display_name": "Journal of Education Research"}},
            "open_access": {"is_oa": True},
            "cited_by_count": 12,
            "abstract_inverted_index": {"Arts-based": [0], "inquiry": [1], "works.": [2]},
        },
        {"id": "https://openalex.org/W999", "display_name": ""},  # partial: must be dropped, never fabricated
        {"id": "https://openalex.org/", "display_name": "id with no work token"},  # derives an empty literature_id: dropped
    ],
}


def _fake_fetch(url: str) -> dict:
    assert url.startswith(lp.OPENALEX_WORKS_URL + "?"), url
    return OPENALEX_FIXTURE


class EgressGateTests(unittest.TestCase):
    def test_host_missing_from_allowlist_is_refused_before_any_io(self):
        calls: list[str] = []
        with self.assertRaisesRegex(InvariantViolation, "NETWORK_EGRESS_DENIED"):
            lp.openalex_literature_search("q", environ={}, fetch=lambda url: calls.append(url) or {})
        self.assertEqual(calls, [])

    def test_allowlist_is_case_and_whitespace_insensitive(self):
        self.assertEqual(lp.egress_allowlist({lp.EGRESS_ALLOWLIST_ENV: " API.OpenAlex.org , x.example "}), frozenset({"api.openalex.org", "x.example"}))

    def test_provider_failure_is_explicit_not_a_fixture_fallback(self):
        def boom(url: str) -> dict:
            raise OSError("connection reset")

        with self.assertRaisesRegex(InvariantViolation, "LITERATURE_PROVIDER_UNAVAILABLE"):
            lp.openalex_literature_search("q", environ=ALLOW, fetch=boom)

    def test_malformed_response_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LITERATURE_PROVIDER_MALFORMED_RESPONSE"):
            lp.openalex_literature_search("q", environ=ALLOW, fetch=lambda url: {"meta": {}})

    def test_allowlist_entry_with_scheme_or_port_is_a_named_configuration_error(self):
        for bad in ("https://api.openalex.org", "api.openalex.org:443", "api.openalex.org/works", ".openalex.org"):
            with self.subTest(bad=bad), self.assertRaisesRegex(InvariantViolation, "EGRESS_ALLOWLIST_ENTRY_INVALID"):
                lp.egress_allowlist({lp.EGRESS_ALLOWLIST_ENV: bad})

    def test_cross_host_redirect_is_refused_by_the_same_allowlist(self):
        handler = lp._NoCrossHostRedirects()
        with patch.dict("os.environ", ALLOW), self.assertRaisesRegex(InvariantViolation, "NETWORK_EGRESS_DENIED"):
            handler.redirect_request(None, None, 301, "Moved", {}, "https://cdn.other-host.example/works")

    def test_cross_host_redirect_is_refused_even_between_two_allowlisted_hosts(self):
        """urllib forwards every request header (an API key included) onto the redirected request, so the
        allowlist alone is not the invariant -- the redirect must stay on the origin host (critic 2026-09-17)."""
        handler = lp._NoCrossHostRedirects()
        req = urllib_request.Request("https://api.anthropic.com/v1/messages", headers={"x-api-key": "sk-test"})
        both = {lp.EGRESS_ALLOWLIST_ENV: "api.openalex.org,api.anthropic.com"}
        with patch.dict("os.environ", both), self.assertRaisesRegex(InvariantViolation, "cross-host redirect"):
            handler.redirect_request(req, None, 302, "Found", {}, "https://api.openalex.org/works")
        with patch.dict("os.environ", both), self.assertRaisesRegex(InvariantViolation, "non-https"):
            handler.redirect_request(req, None, 302, "Found", {}, "http://api.anthropic.com/v1/messages")
        with patch.dict("os.environ", both), patch.object(urllib_request.HTTPRedirectHandler, "redirect_request", return_value="ok"):
            self.assertEqual(handler.redirect_request(req, None, 302, "Found", {}, "https://API.anthropic.com/v1/other"), "ok")

    def test_fetch_json_refuses_non_https_and_maps_http_client_errors(self):
        import http.client

        with patch.dict("os.environ", ALLOW), self.assertRaisesRegex(InvariantViolation, "only https"):
            lp.fetch_json("http://api.openalex.org/works")
        with patch.dict("os.environ", ALLOW), patch.object(lp._OPENER, "open", side_effect=http.client.BadStatusLine("garbage")):
            with self.assertRaisesRegex(InvariantViolation, r"LITERATURE_PROVIDER_UNAVAILABLE: BadStatusLine reaching api\.openalex\.org"):
                lp.fetch_json("https://api.openalex.org/works")

    def test_same_host_redirect_still_goes_through_the_gate_and_is_allowed(self):
        handler = lp._NoCrossHostRedirects()
        with patch.dict("os.environ", ALLOW), patch.object(urllib_request.HTTPRedirectHandler, "redirect_request", return_value="ok") as parent:
            self.assertEqual(handler.redirect_request(None, None, 301, "Moved", {}, "https://api.openalex.org/works?x=1"), "ok")
            parent.assert_called_once()

    def test_oversized_body_is_refused_not_buffered(self):
        class FakeResponse:
            def __init__(self, size: int):
                self._data = b"{" + b" " * size + b"}"

            def read(self, n: int = -1) -> bytes:
                return self._data if n < 0 else self._data[:n]

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        with patch.dict("os.environ", ALLOW), patch.object(lp._OPENER, "open", return_value=FakeResponse(lp.MAX_BODY_BYTES + 10)), self.assertRaisesRegex(InvariantViolation, "body exceeds"):
            lp.fetch_json("https://api.openalex.org/works?search=q")

    def test_per_page_bounds_and_bool_trap(self):
        for bad in (0, lp.MAX_PER_PAGE + 1, True, "10"):
            with self.subTest(bad=bad), self.assertRaisesRegex(InvariantViolation, "LITERATURE_SEARCH_PER_PAGE_INVALID"):
                lp.openalex_literature_search("q", per_page=bad, environ=ALLOW, fetch=_fake_fetch)


class NormalizationTests(unittest.TestCase):
    def test_openalex_results_become_citable_literature_items(self):
        result = lp.openalex_literature_search("arts-based inquiry", environ=ALLOW, fetch=_fake_fetch)["literature"]
        self.assertEqual(result["retrieval"]["mode"], "ONLINE_PROVIDER")
        self.assertEqual(result["retrieval"]["side_state"], "NEEDS_HUMAN_REVIEW")
        self.assertEqual(result["retrieval"]["citation_verification"], "NOT_PERFORMED")
        self.assertEqual(result["retrieval"]["total_count_reported"], 2)
        self.assertEqual(result["retrieval"]["returned_count"], 1)  # partial + empty-id items dropped
        self.assertEqual(result["retrieval"]["status_code"], lp.ONLINE_SOURCE_UNVERIFIED)
        item = result["items"][0]
        self.assertEqual(item["literature_id"], "W1234567890")
        self.assertEqual(item["source_kind"], lp.SOURCE_KIND_OPENALEX)
        self.assertEqual(item["abstract"], "Arts-based inquiry works.")
        self.assertIn("A. Author, B. Writer", item["citation"])
        self.assertIn("(2021)", item["citation"])
        self.assertTrue(item["open_access"])
        self.assertEqual(item["provenance"]["epistemic_type"], "SOURCE_FACT")
        self.assertEqual(item["derived_provenance"]["epistemic_type"], "CALCULATED_RESULT")

    def test_unhashable_provider_value_is_refused_not_a_type_error(self):
        with self.assertRaisesRegex(InvariantViolation, "LITERATURE_PROVIDER_UNREGISTERED"):
            lp.literature_search_adapter({"research.question": "q", "research.provider": ["openalex"]}, {})

    def test_set_id_is_deterministic_for_the_same_question(self):
        a = lp.openalex_literature_search("Same Question", environ=ALLOW, fetch=_fake_fetch)["literature"]["set_id"]
        b = lp.openalex_literature_search("same question ", environ=ALLOW, fetch=_fake_fetch)["literature"]["set_id"]
        self.assertEqual(a, b)

    def test_mailto_is_only_sent_when_configured(self):
        seen: list[str] = []

        def spy(url: str) -> dict:
            seen.append(url)
            return OPENALEX_FIXTURE

        lp.openalex_literature_search("q", environ=ALLOW, fetch=spy)
        lp.openalex_literature_search("q", environ={**ALLOW, lp.EGRESS_MAILTO_ENV: "ops@example.org"}, fetch=spy)
        self.assertNotIn("mailto", seen[0])
        self.assertIn("mailto=ops%40example.org", seen[1])


class AdapterRegistryTests(unittest.TestCase):
    def test_missing_provider_keeps_offline_fixture_behaviour(self):
        out = lp.literature_search_adapter({"research.question": "q"}, {})["literature"]
        self.assertEqual(out["retrieval"]["status_code"], OFFLINE_SOURCE_STALE)

    def test_unregistered_provider_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LITERATURE_PROVIDER_UNREGISTERED"):
            lp.literature_search_adapter({"research.question": "q", "research.provider": "scihub"}, {})

    def test_openalex_provider_goes_through_the_egress_gate(self):
        with patch.dict("os.environ", {lp.EGRESS_ALLOWLIST_ENV: ""}), self.assertRaisesRegex(InvariantViolation, "NETWORK_EGRESS_DENIED"):
            lp.literature_search_adapter({"research.question": "q", "research.provider": "openalex"}, {})

    def test_triangulation_cross_references_provider_items(self):
        literature = lp.openalex_literature_search("q", environ=ALLOW, fetch=_fake_fetch)
        payload = {
            "outputs.coding": {"coding_outputs": {"theme_set": {"themes": [{"theme_id": "T1", "label": "boundaries"}]}}},
            "outputs.literature": literature,
        }
        finding = triangulate_themes_and_literature(payload, {})["triangulation"]["findings"][0]
        self.assertEqual(finding["literature_refs"], ["W1234567890"])
        self.assertEqual(finding["validation_status"], "NEEDS_HUMAN_REVIEW")
        self.assertIn("unverified", finding["reason"])


class OnlineRecipeTests(ApiTestCase):
    def test_recipe_compiles_and_binds_provider_from_source(self):
        ir = compile_recipe_to_workflow_ir(resolve_spec_root(), "edd-literature-search-online-v1", "R0")
        self.assertEqual(ir["nodes"][0]["bindings"]["research.provider"], "source.provider")

    def test_recipe_runs_through_the_api_with_a_registered_provider(self):
        self._login()
        source = {"research_question": "arts-based inquiry in doctoral education", "provider": "openalex", "per_page": 5}
        with patch.dict("os.environ", ALLOW), patch.object(lp, "fetch_json", _fake_fetch):
            response = self.client.post("/recipes/edd-literature-search-online-v1/run", json={"source": source, "run_id": "api-edd-online-test"})
        self.assertEqual(response.status_code, 200, response.text)
        literature = response.json()["workflow"]["context"]["outputs"]["online_literature_search"]["literature"]
        self.assertEqual(literature["retrieval"]["mode"], "ONLINE_PROVIDER")
        self.assertEqual(literature["items"][0]["literature_id"], "W1234567890")

    def test_recipe_fails_closed_when_egress_is_not_allowlisted(self):
        self._login()
        source = {"research_question": "q", "provider": "openalex", "per_page": 5}
        with patch.dict("os.environ", {lp.EGRESS_ALLOWLIST_ENV: ""}), patch.object(lp, "fetch_json", _fake_fetch):
            response = self.client.post("/recipes/edd-literature-search-online-v1/run", json={"source": source, "run_id": "api-edd-online-denied"})
        # Durable-run convention: HTTP 200 with the run journaled as FAILED and the step error recorded.
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["status"], "FAILED")
        self.assertIn("NETWORK_EGRESS_DENIED", body["workflow"]["steps"][0]["error"])
        self.assertNotIn("online_literature_search", body["workflow"]["context"]["outputs"])


if __name__ == "__main__":
    unittest.main()
