"""End-to-end tests for the Cognitive OS Phase 1 API (``ai_lego.apps.api.main``) via FastAPI's
real ``TestClient`` (a real ASGI request/response cycle, not a mocked router) against a real
temp-file SQLite identity store."""

from __future__ import annotations

import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from ai_lego.apps.api import main as api_main
from ai_lego.apps.cli.run_life_decision_slice import fixture_source
from ai_lego.platform.identity.store import IdentityStore


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self._tmpdir.name) / "identity.sqlite3"
        api_main.app.dependency_overrides[api_main.get_store] = lambda: IdentityStore(self.db_path)
        # base_url is https:// (not the TestClient default http://testserver) because the login
        # cookie is Secure -- deliberately, since Phase 1 deploys behind real TLS
        # (COGNITIVE_OS_DEPLOYMENT_BLUEPRINT.md) -- a Secure cookie is silently dropped by any
        # HTTP client, which would otherwise make every authenticated test fail for a reason
        # that has nothing to do with the code under test.
        self.client = TestClient(api_main.app, base_url="https://testserver")

        store = IdentityStore(self.db_path)
        self.tenant = store.create_tenant(
            tenant_id=str(uuid.uuid4()),
            legal_name="Test Tenant",
            home_jurisdiction="jurisdiction-pack.tw.v1",
            data_residency_region="local-dev",
            encryption_root_key_ref="test-kek-ref",
        )
        store.create_workspace(str(uuid.uuid4()), self.tenant["tenant_id"], "Default")
        self.identity = store.create_identity(str(uuid.uuid4()), self.tenant["tenant_id"], "user@example.com", "User", "correct-horse-battery")

    def tearDown(self):
        api_main.app.dependency_overrides.clear()
        self._tmpdir.cleanup()

    def _login(self) -> None:
        response = self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "user@example.com", "password": "correct-horse-battery"})
        self.assertEqual(response.status_code, 200, response.text)


class HealthTests(ApiTestCase):
    def test_health_requires_no_auth_and_touches_no_store(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class DashboardTests(ApiTestCase):
    def test_dashboard_requires_no_auth_and_serves_html(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response.headers["content-type"])
        self.assertIn("Cognitive OS", response.text)

    def test_dashboard_sets_frame_options_to_block_clickjacking(self):
        """This is the app's first page with a real login form -- an attacker iframing it to
        overlay a fake UI (or clickjack the logout/demo buttons) is a newly-relevant risk that
        didn't exist before this route (critic finding, 2026-09-12)."""
        response = self.client.get("/")
        self.assertEqual(response.headers.get("x-frame-options"), "DENY")

    def test_dashboard_get_does_not_accept_query_string_credentials(self):
        """GET / must not itself read/process credentials server-side -- that would be a second,
        undocumented auth path alongside POST /auth/login."""
        response = self.client.get("/", params={"tenant_id": "x", "email": "y", "password": "z"})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(api_main.SESSION_COOKIE, response.cookies)

    def test_dashboard_never_interpolates_catalog_data_via_innerhtml(self):
        """Regression guard (critic finding, 2026-09-12): method_id is free text from a YAML `id`
        field with no format enforcement (contract_catalog.scan_contract_files only checks it's
        truthy). Building a DOM row via `.innerHTML = \\`...${m.method_id}...\\`` would be a stored
        XSS reachable by any unauthenticated visitor of / (since /methods is public). Rendering
        must go through textContent/createElement instead -- assert the source never assigns
        innerHTML to a template literal that interpolates a `m.` field."""
        html = api_main._DASHBOARD_HTML
        self.assertNotRegex(html, r"innerHTML\s*=\s*`[^`]*\$\{m\.")
        self.assertIn("Open Input", html)
        self.assertIn("runLive", html)
        self.assertIn("Run Recipe", html)
        self.assertIn("runRecipe", html)
        self.assertIn("recipe-json", html)


class UnauthenticatedAccessTests(ApiTestCase):
    def test_list_methods_requires_no_auth(self):
        """Browsing the Atlas is deliberately public -- only invoke/demo require a session."""
        response = self.client.get("/methods")
        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(response.json()), 40)

    def test_get_one_method_requires_no_auth(self):
        response = self.client.get("/methods/foresight.cross_impact_analysis")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ref"], "foresight.cross_impact_analysis")

    def test_get_unknown_method_is_404(self):
        response = self.client.get("/methods/nonexistent.method")
        self.assertEqual(response.status_code, 404)

    def test_list_recipes_reads_active_recipe_files(self):
        response = self.client.get("/recipes")
        self.assertEqual(response.status_code, 200, response.text)
        research = next(recipe for recipe in response.json() if recipe["recipe_id"] == "research-qualitative-v1")
        self.assertEqual((research["status"], research["step_count"]), ("ACTIVE", 7))

    def test_recipe_plan_compiles_and_resolves_against_live_catalogs(self):
        response = self.client.get("/recipes/research-qualitative-v1/plan")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "READY")
        self.assertEqual(len(payload["workflow_ir"]["nodes"]), 7)
        self.assertTrue(payload["plan_executability"]["executable"])
        self.assertTrue(payload["plan_executability"]["fully_resolved"])

    def test_unknown_recipe_plan_is_404(self):
        response = self.client.get("/recipes/does-not-exist/plan")
        self.assertEqual(response.status_code, 404, response.text)

    def test_get_method_form_is_derived_from_the_live_builder_signature(self):
        response = self.client.get("/methods/foresight.cross_impact_analysis/form")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["method_id"], "foresight.cross_impact_analysis")
        self.assertEqual(payload["schema_source"], "builder_signature_only")
        parameter_names = [parameter["name"] for parameter in payload["parameters"]]
        self.assertEqual(parameter_names[:4], ["record_id", "events", "impact_pairs", "provenance"])
        self.assertIn("version", parameter_names)
        self.assertIn("generated_by_method", parameter_names)

    def test_method_form_for_unknown_method_is_404(self):
        response = self.client.get("/methods/nonexistent.method/form")
        self.assertEqual(response.status_code, 404, response.text)

    def test_invoke_without_session_is_401(self):
        response = self.client.post("/methods/foresight.cross_impact_analysis/invoke", json={})
        self.assertEqual(response.status_code, 401)

    def test_demo_without_session_is_401(self):
        response = self.client.get("/methods/foresight.cross_impact_analysis/demo")
        self.assertEqual(response.status_code, 401)


class LoginTests(ApiTestCase):
    def test_correct_credentials_log_in_and_set_a_cookie(self):
        response = self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "user@example.com", "password": "correct-horse-battery"})
        self.assertEqual(response.status_code, 200)
        self.assertIn(api_main.SESSION_COOKIE, response.cookies)

    def test_wrong_password_is_401(self):
        response = self.client.post("/auth/login", json={"tenant_id": self.tenant["tenant_id"], "email": "user@example.com", "password": "wrong-password-here"})
        self.assertEqual(response.status_code, 401)

    def test_logout_revokes_the_session(self):
        self._login()
        self.client.post("/auth/logout")
        response = self.client.post("/methods/foresight.cross_impact_analysis/invoke", json={})
        self.assertEqual(response.status_code, 401)


class InvokeTests(ApiTestCase):
    def test_invoke_a_real_method_end_to_end(self):
        self._login()
        body = {
            "events": [{"event_id": "E1", "description": "d1"}, {"event_id": "E2", "description": "d2"}],
            "impact_pairs": [{"event_a_id": "E1", "event_b_id": "E2", "conditional_probability_shift": 0.1}],
        }
        response = self.client.post("/methods/foresight.cross_impact_analysis/invoke", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["record"]["id"].startswith("XIMPACT-"))
        self.assertTrue(all(g["status"] in {"PASS", "NOT_APPLICABLE"} for g in payload["gate_results"]))

    def test_invoke_a_real_refusal_is_400_not_500(self):
        self._login()
        body = {"events": [{"event_id": "E1", "description": "only one"}], "impact_pairs": []}
        response = self.client.post("/methods/foresight.cross_impact_analysis/invoke", json=body)
        self.assertEqual(response.status_code, 400)
        self.assertIn("XIMPACT_TOO_FEW_EVENTS", response.json()["detail"])

    def test_invoke_a_method_missing_record_id_prefix_is_501_not_500(self):
        """Regression test (2026-09-13): a real production invoke of strategy.swot crashed with a
        raw 500 -- record_id_prefix() raised MethodDispatchError OUTSIDE the try/except that was
        supposed to catch exactly that exception type, because it was called one line below the
        block instead of inside it. architecture.adr is one of 45 modules (out of 254) that, like
        swot.py was until this same fix, has no RECORD_ID_PREFIX constant -- this proves the API
        itself no longer crashes for that whole class of gap, not just for the one module that
        happened to get invoked first."""
        self._login()
        response = self.client.post("/methods/architecture.adr/invoke", json={})
        self.assertEqual(response.status_code, 501, response.text)
        self.assertIn("DISPATCH_UNAVAILABLE", response.json()["detail"])
        self.assertIn("RECORD_ID_PREFIX", response.json()["detail"])

    def test_invoke_strategy_swot_end_to_end(self):
        """Regression test (2026-09-13): strategy.swot itself was missing RECORD_ID_PREFIX, which
        is what surfaced the 500-instead-of-501 bug above during a real invoke against the
        production API with real project data -- see WORKLOG 2026-09-13."""
        self._login()
        body = {
            "analysis_id": "SWOT-TEST-001",
            "knowledge_set_ref": "KS-TEST-001",
            "knowledge_set": [{"evidence_id": "E-1", "content": "c", "source": "s", "provenance": {"epistemic_type": "EVIDENCE", "authorship_state": "HUMAN_APPROVED", "locked": None}}],
            "factors": [
                {"id": "F1", "category": "STRENGTH", "statement": "s1", "geography": "TW", "time": "2026-Q3", "source": "src", "provenance": {"epistemic_type": "EVIDENCE", "authorship_state": "HUMAN_APPROVED", "locked": None}, "supporting_evidence_refs": ["E-1"]},
                {"id": "F2", "category": "WEAKNESS", "statement": "w1", "geography": "TW", "time": "2026-Q3", "source": "src", "provenance": {"epistemic_type": "EVIDENCE", "authorship_state": "HUMAN_APPROVED", "locked": None}, "supporting_evidence_refs": ["E-1"]},
            ],
        }
        response = self.client.post("/methods/strategy.swot/invoke", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["record"]["id"].startswith("SWOT-"))

    def test_invoke_unknown_method_is_404(self):
        self._login()
        response = self.client.post("/methods/nonexistent.method/invoke", json={})
        self.assertEqual(response.status_code, 404)

    def test_invoke_denied_for_suspended_tenant(self):
        self._login()
        store = IdentityStore(self.db_path)
        with store._connect() as conn:  # noqa: SLF001
            conn.execute("UPDATE tenant SET status = 'suspended' WHERE tenant_id = ?", (self.tenant["tenant_id"],))
        body = {
            "events": [{"event_id": "E1", "description": "d1"}, {"event_id": "E2", "description": "d2"}],
            "impact_pairs": [{"event_a_id": "E1", "event_b_id": "E2", "conditional_probability_shift": 0.1}],
        }
        response = self.client.post("/methods/foresight.cross_impact_analysis/invoke", json=body)
        self.assertEqual(response.status_code, 403)

    def test_invoke_a_method_with_non_uniform_builder_name(self):
        """market_admission_control's builder is named generate_market_admission -- proves the
        API's generic dispatch (not a hand-maintained adapter table) actually works end-to-end
        over HTTP, not just at the dispatch-module unit-test level."""
        self._login()
        body = {
            "market_id": "test-market",
            "stages": [
                {"stage": stage, "status": "PASS", "note": "n"}
                for stage in ["jurisdiction_pack", "legal_freshness", "data_residency", "ai_provider", "security_privacy", "localization_accessibility", "sector_controls"]
            ],
            "human_signoff": "reviewer@example.com",
        }
        response = self.client.post("/methods/jurisdiction.market_admission_control/invoke", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["record"]["admission_decision"], "ENABLE")


class RecipeRunTests(ApiTestCase):
    def test_life_recipe_runs_through_shared_executor_and_gates(self):
        self._login()
        response = self.client.post("/recipes/life-decision-v1/run", json={"source": fixture_source(), "run_id": "api-life-test"})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(len(payload["workflow"]["steps"]), 3)
        self.assertTrue(all(gate["status"] == "PASS" for gates in payload["gates"].values() for gate in gates))

    def test_life_recipe_resume_reuses_stable_journal_namespace(self):
        self._login()
        source = fixture_source()
        run_id = "api-life-resume-" + uuid.uuid4().hex[:12]
        first = self.client.post("/recipes/life-decision-v1/run", json={"source": source, "run_id": run_id})
        self.assertEqual(first.status_code, 200, first.text)
        resumed = self.client.post("/recipes/life-decision-v1/run", json={"source": source, "run_id": run_id, "resume": True})
        self.assertEqual(resumed.status_code, 200, resumed.text)
        self.assertEqual(resumed.json()["status"], "PASS")

    def test_recipe_run_requires_authentication(self):
        response = self.client.post("/recipes/life-decision-v1/run", json={"source": fixture_source()})
        self.assertEqual(response.status_code, 401)

    def test_edd_evidence_recipe_runs_as_a_reusable_method_chain(self):
        self._login()
        source = {
            "assumptions": {
                "record_id": "AMAP-API-001",
                "mapped_assumptions": [{"assumption_id": "ASM-1", "impact": "HIGH", "uncertainty": "HIGH"}],
                "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None},
            },
            "evidence_matrix": {
                "record_id": "EVIDMATRIX-API-001",
                "claims": [{"claim_id": "C-1", "statement": "The intervention may improve reflective practice", "provenance": {"epistemic_type": "HUMAN_OPINION", "authorship_state": "HUMAN_ORIGINAL", "locked": None}}],
                "evidence_items": [{"evidence_id": "E-1", "content": "Interview observation", "provenance": {"epistemic_type": "EVIDENCE", "authorship_state": "SOURCE_QUOTATION", "locked": None}}],
                "links": [{"claim_id": "C-1", "evidence_id": "E-1", "relation": "SUPPORTS"}],
                "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None},
            },
            "argument": {
                "record_id": "TOULMIN-API-001",
                "claim": "The intervention is worth further study",
                "grounds": ["Interview observation suggests improved reflection"],
                "warrant": "Observed improvement is a reason to conduct a structured follow-up",
                "backing": ["The evidence matrix links the observation to the claim"],
                "qualifier": "provisionally",
                "rebuttal": "A larger sample may not reproduce the observation",
                "provenance": {"epistemic_type": "AI_INFERENCE", "authorship_state": "AI_GENERATED", "locked": None},
            },
        }
        response = self.client.post("/recipes/edd-research-evidence-v1/run", json={"source": source, "run_id": "api-edd-test"})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual([step["ref"] for step in payload["workflow"]["steps"]], ["epistemic.assumption_mapping", "epistemic.evidence_matrix", "epistemic.toulmin_model"])

    def test_art_reflection_recipe_preserves_non_diagnostic_boundary(self):
        self._login()
        source = {
            "stimulus": {
                "session_id": "RANDOMSTIM-API-001",
                "entries": [{"stimulus": "blue stone", "forced_connection": "A blue stone suggests steadiness.", "resulting_idea": "Draw a steady place."}],
                "provenance": {"epistemic_type": "HUMAN_OPINION", "authorship_state": "HUMAN_ORIGINAL", "locked": None},
            },
            "mind_map": {
                "record_id": "MINDMAP-API-001",
                "central_topic": "A steady place",
                "main_branches": [{"id": "MB-API-1", "label": "quiet water", "provenance": {"epistemic_type": "HUMAN_OPINION", "authorship_state": "HUMAN_ORIGINAL", "locked": None}}],
                "provenance": {"epistemic_type": "HUMAN_OPINION", "authorship_state": "HUMAN_ORIGINAL", "locked": None},
            },
        }
        response = self.client.post("/recipes/art-therapy-creative-reflection-v1/run", json={"source": source, "run_id": "api-art-test"})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual([step["ref"] for step in payload["workflow"]["steps"]], ["divergent.random_stimulus", "association.mind_map"])


class DemoTests(ApiTestCase):
    def test_demo_runs_the_real_cli_slice(self):
        self._login()
        response = self.client.get("/methods/foresight.cross_impact_analysis/demo")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["exit_code"], 0)
        self.assertIn("PASS", payload["stdout"])

    def test_demo_unknown_method_is_404(self):
        self._login()
        response = self.client.get("/methods/nonexistent.method/demo")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
