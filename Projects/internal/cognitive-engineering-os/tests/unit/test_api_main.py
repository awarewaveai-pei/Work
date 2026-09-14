"""End-to-end tests for the Cognitive OS Phase 1 API (``ai_lego.apps.api.main``) via FastAPI's
real ``TestClient`` (a real ASGI request/response cycle, not a mocked router) against a real
temp-file SQLite identity store."""

from __future__ import annotations

import tempfile
import unittest
import uuid
import json
import os
from unittest.mock import patch
from pathlib import Path

from fastapi.testclient import TestClient
from fastapi import FastAPI

from ai_lego.apps.api import main as api_main
from ai_lego.apps.cli.run_life_decision_slice import fixture_source
from ai_lego.modules.research.review import fixture_review
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.core.support import b64
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation


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


def business_foundation_source() -> dict:
    provenance = make_provenance("EVIDENCE", "HUMAN_APPROVED")
    hypothesis_provenance = make_provenance("HYPOTHESIS", "AI_SUGGESTED")
    factors = [
        {"id": "SWOT-API-F1", "category": "STRENGTH", "statement": "existing educator network", "geography": "TW", "time": "2026-Q3", "source": "interview notes", "provenance": provenance, "supporting_evidence_refs": ["E-API-1"]},
        {"id": "SWOT-API-F2", "category": "OPPORTUNITY", "statement": "growing demand for reflective learning", "geography": "TW", "time": "2026-Q3", "source": "field observation", "provenance": provenance, "supporting_evidence_refs": ["E-API-1"]},
    ]
    blocks = [
        {"block": name, "content": f"disclosed hypothesis for {name.lower()}", "provenance": hypothesis_provenance}
        for name in ["CUSTOMER_SEGMENTS", "VALUE_PROPOSITIONS", "CHANNELS", "CUSTOMER_RELATIONSHIPS", "REVENUE_STREAMS", "KEY_RESOURCES", "KEY_ACTIVITIES", "KEY_PARTNERS", "COST_STRUCTURE"]
    ]
    forces = [
        {"force": name, "intensity": "MEDIUM", "assessment": f"assessment for {name.lower()}", "provenance": hypothesis_provenance}
        for name in ["INDUSTRY_RIVALRY", "NEW_ENTRANTS", "SUBSTITUTES", "SUPPLIER_POWER", "BUYER_POWER"]
    ]
    return {
        "swot": {"analysis_id": "SWOT-API-001", "knowledge_set_ref": "KS-API-001", "knowledge_set": [{"evidence_id": "E-API-1", "content": "educator interview observation", "source": "interview-1", "provenance": provenance}], "factors": factors},
        "tows": {"record_id": "TOWS-API-001", "pairings": [{"id": "TOWS-API-P1", "internal_factor_id": "SWOT-API-F1", "external_factor_id": "SWOT-API-F2", "strategy_option": "use the educator network to test the reflective learning offer"}], "provenance": make_provenance("AI_INFERENCE", "AI_SUGGESTED")},
        "porter": {"analysis_id": "PFF-API-001", "forces": forces, "overall_attractiveness": "moderately attractive pending validation", "provenance": make_provenance("AI_INFERENCE", "AI_SUGGESTED")},
        "business_model": {"canvas_id": "BMC-API-001", "blocks": blocks, "provenance": make_provenance("AI_INFERENCE", "AI_SUGGESTED")},
    }


def business_feasibility_source() -> dict:
    return {
        "break_even": {
            "record_id": "BEVEN-API-001",
            "subject_ref": "project:reflective-learning",
            "fixed_cost": 12000,
            "contribution_margin_per_unit": 80,
            "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        },
        "npv": {
            "record_id": "NPV-API-001",
            "subject_ref": "project:reflective-learning",
            "cash_flows": [{"period": 0, "amount": -12000}, {"period": 1, "amount": 9000}, {"period": 2, "amount": 11000}],
            "discount_rate": 0.1,
            "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        },
    }


def art_project_ideation_source() -> dict:
    human = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
    return {
        "project_problem": {
            "problem_id": "PROB-ART-API-001",
            "current_state": "The workshop has a theme but no shared project direction.",
            "expected_state": "The workshop has a participant-authored project direction to discuss.",
            "gap": "A visible bridge is needed between the theme and possible making activities.",
            "provenance": human,
        },
        "stimulus": {
            "session_id": "RANDOMSTIM-ART-API-001",
            "entries": [{
                "stimulus": "blue stone",
                "forced_connection": "A blue stone suggests steadiness.",
                "resulting_idea": "Draw a steady place for the project.",
            }],
            "provenance": human,
        },
        "mind_map": {
            "record_id": "MINDMAP-ART-API-001",
            "central_topic": "A steady place for the project",
            "main_branches": [{
                "id": "MB-ART-API-1",
                "label": "quiet water",
                "provenance": human,
            }],
            "provenance": human,
        },
    }


def business_planning_feasibility_source() -> dict:
    source = business_foundation_source()
    source.update(business_feasibility_source())
    provenance = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
    source.update(
        {
            "scenarios": {
                "record_id": "SCEN-API-001",
                "critical_uncertainties": ["demand", "delivery capacity"],
                "scenarios": [
                    {
                        "id": f"SCEN-API-001-S{i}",
                        "drivers": ["demand"],
                        "assumptions": ["explicit workshop assumption"],
                        "narrative": "A coherent scenario narrative.",
                        "stakeholder_responses": ["partners respond"],
                        "competitor_responses": ["competitors respond"],
                        "second_third_order_effects": ["capacity changes"],
                        "signposts": ["monthly demand signal"],
                        "strategy_performance": "strategy remains testable",
                        "reversal_condition": "demand falls below the reviewed threshold",
                    }
                    for i in range(1, 5)
                ],
                "provenance": provenance,
            },
            "risks": {
                "record_id": "RREG-API-001",
                "risks": [
                    {"risk_id": "R-API-1", "description": "supplier delay", "probability": 0.2, "impact": 0.5, "owner": "operations", "control": "backup supplier", "trigger": "late confirmation"},
                    {"risk_id": "R-API-2", "description": "capacity shortfall", "probability": 0.3, "impact": 0.8, "owner": "project lead", "control": "staged rollout", "trigger": "queue exceeds limit"},
                ],
                "provenance": provenance,
            },
            "tco": {
                "record_id": "TCO-API-001",
                "subject_ref": "project:reflective-learning",
                "cost_categories": {key: 0 for key in ["purchase", "implementation", "migration", "people", "operation", "support", "security", "compliance", "downtime", "exit", "data_egress", "decommission"]},
                "provenance": provenance,
            },
            "unit_economics": {
                "record_id": "UECON-API-001",
                "subject_ref": "project:reflective-learning",
                "cac": 1200,
                "ltv": 4200,
                "gross_margin": 0.72,
                "payback_period": 8,
                "churn_rate": 0.03,
                "arpu": 350,
                "contribution_margin": 180,
                "provenance": provenance,
            },
        }
    )
    return source


class HealthTests(ApiTestCase):
    def test_health_requires_no_auth_and_touches_no_store(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class CorsConfigurationTests(unittest.TestCase):
    def test_cors_is_disabled_by_default(self):
        target = FastAPI()
        self.assertEqual(api_main.configure_cors(target, ""), ())
        client = TestClient(target, base_url="https://testserver")
        response = client.get("/", headers={"Origin": "https://plugin.example"})
        self.assertNotIn("access-control-allow-origin", response.headers)

    def test_explicit_origin_allows_credentials_and_preflight(self):
        target = FastAPI()
        api_main.configure_cors(target, "https://plugin.example")
        client = TestClient(target, base_url="https://testserver")
        response = client.options("/", headers={"Origin": "https://plugin.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "https://plugin.example")
        self.assertEqual(response.headers["access-control-allow-credentials"], "true")

    def test_wildcard_and_non_http_origins_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "must not contain"):
            api_main.configure_cors(FastAPI(), "*")
        with self.assertRaisesRegex(ValueError, "ORIGIN_INVALID"):
            api_main.configure_cors(FastAPI(), "chrome-extension://abc")


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
        self.assertIn("Run Selected Recipe", html)
        self.assertIn("runRecipe", html)
        self.assertIn("recipe-json", html)
        self.assertIn("prepareRecipe", html)
        self.assertIn("recipe-run-btn", html)
        self.assertIn("/recipes/${encodeURIComponent(recipeId)}/form", html)
        self.assertIn("recipe-fields", html)
        self.assertIn("Build JSON from fields", html)
        self.assertIn("applyRecipeFields", html)


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

    def test_lens_contract_is_not_advertised_as_an_invokable_method(self):
        response = self.client.get("/methods")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("stakeholder.regulator", {entry["method_id"] for entry in response.json()})

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
        self.assertTrue(payload["adapter_readiness"]["ready"])
        self.assertEqual(
            payload["adapter_readiness"]["registered"],
            ["artifact.generate_research_paper", "literature_search", "run_statistics", "transcribe"],
        )
        self.assertEqual(payload["adapter_readiness"]["blocking"], [])
        self.assertTrue(payload["binding_readiness"]["ready"])
        self.assertTrue(payload["method_dispatch_readiness"]["ready"])
        self.assertEqual(payload["method_dispatch_readiness"]["missing"], [])

    def test_all_capability_only_recipes_have_a_non_500_plan_response(self):
        for recipe_id in ("champion-challenger", "db-migration-expand-contract", "method-deprecation-retirement"):
            with self.subTest(recipe_id=recipe_id):
                response = self.client.get(f"/recipes/{recipe_id}/plan")
                self.assertEqual(response.status_code, 200, response.text)
                self.assertIn(response.json()["status"], {"READY", "BLOCKED"})

    def test_blocked_recipe_plan_exposes_machine_readable_binding_reasons(self):
        response = self.client.get("/recipes/champion-challenger/plan")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "BLOCKED")
        self.assertTrue(
            any(item["code"] == "WORKFLOW_BINDING_BLOCKED" for item in payload["blockers"])
        )
        self.assertFalse(any(item["code"] == "CAPABILITY_RESOLUTION_BLOCKED" for item in payload["blockers"]))

    def test_optional_unresolved_capability_is_visible_but_not_a_plan_blocker(self):
        from ai_lego import resolve_spec_root
        from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog

        live = CapabilityCatalog.from_spec_root(resolve_spec_root())
        catalog = CapabilityCatalog(label="test:without-literature", contracts={ref: entry for ref, entry in live.contracts.items() if ref != "literature_search"})
        original_compile = api_main.compile_recipe_to_workflow_ir

        def optional_fixture_compile(spec_root, recipe_id, risk_tier):
            workflow_ir = original_compile(spec_root, recipe_id, risk_tier)
            workflow_ir["nodes"][0]["necessity"] = "RECOMMENDED"
            return workflow_ir

        with patch.object(api_main, "compile_recipe_to_workflow_ir", side_effect=optional_fixture_compile), patch.object(
            api_main.CapabilityCatalog, "from_spec_root", classmethod(lambda cls, spec_root: catalog)
        ):
            response = self.client.get("/recipes/edd-literature-search-v1/plan")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "READY")
        self.assertEqual(payload["plan_executability"]["not_invocable"][0]["ref"], "literature_search")
        self.assertFalse(any(item["code"] == "CAPABILITY_RESOLUTION_BLOCKED" for item in payload["blockers"]))

    def test_recipe_form_describes_source_fields_from_bindings(self):
        response = self.client.get("/recipes/research-qualitative-v1/form")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["schema_source"], "compiled_workflow_bindings")
        paths = {field["path"] for field in payload["source_fields"]}
        self.assertEqual(paths, {"question", "transcript", "coder_one.locked_code", "coder_one.ai_review", "coder_one.at", "coder_two.locked_code", "coder_two.ai_review", "coder_two.at"})
        self.assertTrue(all(field["required"] for field in payload["source_fields"]))

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
    def test_business_planning_feasibility_recipe_runs_the_bounded_ten_step_chain(self):
        self._login()
        response = self.client.post(
            "/recipes/business-planning-feasibility-v1/run",
            json={"source": business_planning_feasibility_source(), "run_id": "api-business-planning-feasibility-test"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(len(payload["workflow"]["steps"]), 10)
        self.assertEqual(payload["workflow"]["steps"][1]["input_paths"], ["source.tows", "outputs.SWOT_analysis", "source.tows.record_id", "source.tows.pairings", "source.tows.provenance"])
        self.assertEqual(payload["workflow"]["context"]["outputs"]["total_cost_of_ownership"]["total_tco"], 0.0)
        self.assertEqual(payload["workflow"]["context"]["outputs"]["unit_economics"]["scalable"], True)

    def test_art_project_ideation_recipe_runs_as_a_non_diagnostic_three_step_chain(self):
        self._login()
        response = self.client.post(
            "/recipes/art-therapy-project-ideation-v1/run",
            json={"source": art_project_ideation_source(), "run_id": "api-art-project-ideation-test"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(
            [step["ref"] for step in payload["workflow"]["steps"]],
            ["framing.problem_statement", "divergent.random_stimulus", "association.mind_map"],
        )
        self.assertEqual(
            payload["workflow"]["context"]["outputs"]["creative_stimulus"]["entries"][0]["feasibility_status"],
            "NOT_YET_SCREENED",
        )

    def test_research_qualitative_recipe_runs_as_a_fully_bound_mvp_chain(self):
        self._login()
        locked_code, ai_review = fixture_review()
        source = {
            "question": "How do remote workers describe after-hours boundaries?",
            "transcript": {
                "status": "normalized",
                "text": "A reviewed transcript input.",
                "provenance": make_provenance("SOURCE_FACT", "SOURCE_QUOTATION"),
            },
            "coder_one": {"locked_code": locked_code, "ai_review": ai_review, "at": "2026-09-14T00:00:00Z"},
            "coder_two": {"locked_code": locked_code, "ai_review": ai_review, "at": "2026-09-14T00:00:00Z"},
        }
        response = self.client.post("/recipes/research-qualitative-v1/run", json={"source": source, "run_id": "api-research-qualitative-test"})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(
            [step["ref"] for step in payload["workflow"]["steps"]],
            ["transcribe", "research.qualitative_coding", "research.qualitative_coding", "literature_search", "run_statistics", "evidence.triangulation", "artifact.generate_research_paper"],
        )
        self.assertEqual(payload["workflow"]["context"]["outputs"]["Transcription"]["mode"], "PRE_TRANSCRIBED_INPUT")
        self.assertEqual([gate["gate_id"] for gate in payload["workflow_gates"]], ["workflow_execution_integrity"])
        self.assertEqual(payload["workflow_gates"][0]["status"], "PASS")

    def test_life_recipe_runs_through_shared_executor_and_gates(self):
        self._login()
        source = fixture_source()
        source["private_note"] = "DO_NOT_ECHO_RAW_SOURCE"
        response = self.client.post("/recipes/life-decision-v1/run", json={"source": source, "run_id": "api-life-test"})
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(len(payload["workflow"]["steps"]), 3)
        self.assertTrue(all(gate["status"] == "PASS" for gates in payload["gates"].values() for gate in gates))
        self.assertTrue(payload["journal_ref"].startswith("workflow-journal://"))
        self.assertNotIn(str(api_main.PRODUCT_ROOT), json.dumps(payload))
        self.assertNotIn("DO_NOT_ECHO_RAW_SOURCE", json.dumps(payload))
        self.assertNotIn("source", payload["workflow"]["context"])
        journal = json.loads(api_main.workflow_journal_path(self.tenant["tenant_id"], payload["run_id"]).read_text(encoding="utf-8"))
        self.assertNotIn("source", journal["context"])

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

    def test_recipe_run_rejects_missing_source_fields_before_creating_a_journal(self):
        self._login()
        run_id = "api-missing-source-" + uuid.uuid4().hex[:12]
        response = self.client.post(
            "/recipes/life-decision-v1/run",
            json={"source": {}, "run_id": run_id},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["code"], "WORKFLOW_SOURCE_FIELDS_MISSING")
        self.assertIn("source.problem.problem_id", response.json()["detail"]["paths"])
        self.assertFalse(any(Path(api_main.PRODUCT_ROOT).glob(f".runtime/workflows/*/{run_id}.journal.json")))

    def test_confidential_source_requires_encrypted_journal_provider(self):
        self._login()
        response = self.client.post(
            "/recipes/life-decision-v1/run",
            json={"source": fixture_source(), "data_classification": "CONFIDENTIAL", "run_id": "api-confidential-test"},
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("WORKFLOW_JOURNAL_PROTECTION_REQUIRED", response.text)

    def test_local_dev_provider_writes_encrypted_cas_checkpoint(self):
        self._login()
        with tempfile.TemporaryDirectory() as directory, patch.object(api_main, "PRODUCT_ROOT", Path(directory)), patch.dict(
            os.environ,
            {"COGNITIVE_OS_JOURNAL_KEY_MODE": "local-dev", "COGNITIVE_OS_JOURNAL_KEY_B64": b64(b"k" * 32)},
            clear=False,
        ):
            response = self.client.post(
                "/recipes/life-decision-v1/run",
                json={"source": fixture_source(), "data_classification": "CONFIDENTIAL", "run_id": "api-encrypted-test"},
            )
            self.assertEqual(response.status_code, 200, response.text)
            result_payload = response.json()
            self.assertTrue(result_payload["journal_ref"].startswith("workflow-journal://"))
            self.assertNotIn(str(api_main.PRODUCT_ROOT), json.dumps(result_payload))
            journal = json.loads(api_main.workflow_journal_path(self.tenant["tenant_id"], result_payload["run_id"]).read_text(encoding="utf-8"))
            self.assertTrue(journal["context"]["protected"])
            self.assertEqual(journal["context"]["storage"], "TENANT_SCOPED_CAS")
            self.assertNotIn("source", journal["context"])
            self.assertNotIn("Should I study?", json.dumps(journal))

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

    def test_business_foundation_recipe_consumes_swot_output_in_tows(self):
        self._login()
        response = self.client.post(
            "/recipes/business-foundation-v1/run",
            json={"source": business_foundation_source(), "run_id": "api-business-foundation-test"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(
            [step["ref"] for step in payload["workflow"]["steps"]],
            ["strategy.swot", "strategy.tows", "strategy.porter_five_forces", "strategy.business_model_canvas"],
        )
        self.assertEqual(
            payload["workflow"]["steps"][1]["input_paths"],
            ["outputs.SWOT_analysis", "source.tows", "source.tows.record_id", "source.tows.pairings", "source.tows.provenance"],
        )
        self.assertEqual(payload["workflow"]["context"]["outputs"]["TOWS_strategy_options"]["swot_analysis_ref"], "SWOT-API-001")

    def test_business_feasibility_recipe_runs_real_calculation_methods(self):
        self._login()
        response = self.client.post(
            "/recipes/business-feasibility-review-v1/run",
            json={"source": business_feasibility_source(), "run_id": "api-business-feasibility-test"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(
            [step["ref"] for step in payload["workflow"]["steps"]],
            ["feasibility.break_even", "feasibility.npv"],
        )
        self.assertEqual(payload["workflow"]["context"]["outputs"]["break_even_analysis"]["break_even_volume_units"], 150.0)
        self.assertEqual(payload["workflow"]["context"]["outputs"]["net_present_value_analysis"]["npv"], 5272.72727273)

    def test_edd_offline_literature_capability_uses_registered_adapter(self):
        self._login()
        response = self.client.post(
            "/recipes/edd-literature-search-v1/run",
            json={"source": {"research_question": "How do educators describe reflective practice?"}, "run_id": "api-edd-literature-test"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(payload["workflow"]["steps"][0]["node_kind"], "capability")
        self.assertEqual(payload["workflow"]["steps"][0]["ref"], "literature_search")
        self.assertEqual(payload["workflow"]["context"]["outputs"]["offline_literature_search"]["literature"]["retrieval"]["status_code"], "OFFLINE_SOURCE_STALE")

    def test_api_skips_unresolved_recommended_capability_without_registering_an_uncontracted_adapter(self):
        from ai_lego import resolve_spec_root
        from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog

        self._login()
        live = CapabilityCatalog.from_spec_root(resolve_spec_root())
        catalog = CapabilityCatalog(label="test:without-literature", contracts={ref: entry for ref, entry in live.contracts.items() if ref != "literature_search"})
        original_compile = api_main.compile_recipe_to_workflow_ir

        def optional_fixture_compile(spec_root, recipe_id, risk_tier):
            workflow_ir = original_compile(spec_root, recipe_id, risk_tier)
            workflow_ir["nodes"][0]["necessity"] = "RECOMMENDED"
            return workflow_ir

        with patch.object(api_main, "compile_recipe_to_workflow_ir", side_effect=optional_fixture_compile), patch.object(
            api_main.CapabilityCatalog, "from_spec_root", classmethod(lambda cls, spec_root: catalog)
        ):
            response = self.client.post(
                "/recipes/edd-literature-search-v1/run",
                json={"source": {"research_question": "How do educators describe reflective practice?"}, "run_id": "api-optional-capability-test"},
            )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(payload["workflow"]["steps"][0]["status"], "NOT_INVOKED")
        self.assertEqual(payload["workflow"]["steps"][0]["ref"], "literature_search")

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


class JournalConfigurationTests(unittest.TestCase):
    def test_local_dev_configuration_builds_a_cas_protector_only_with_explicit_key(self):
        with patch.dict(os.environ, {"COGNITIVE_OS_JOURNAL_KEY_MODE": "local-dev", "COGNITIVE_OS_JOURNAL_KEY_B64": b64(b"k" * 32)}, clear=False):
            protector = api_main.build_api_journal_protector("tenant-a", "run-1")
        self.assertIsNotNone(protector)

    def test_default_configuration_does_not_create_a_protector(self):
        with patch.dict(os.environ, {"COGNITIVE_OS_JOURNAL_KEY_MODE": "disabled"}, clear=False):
            self.assertIsNone(api_main.build_api_journal_protector("tenant-a", "run-1"))

    def test_external_configuration_uses_injected_resolver_without_local_fallback(self):
        calls = []
        with patch.dict(os.environ, {"COGNITIVE_OS_JOURNAL_KEY_MODE": "external"}, clear=False), patch.object(
            api_main, "JOURNAL_KEY_RESOLVER", lambda tenant, purpose: (calls.append((tenant, purpose)) or b"k" * 32)
        ):
            protector = api_main.build_api_journal_protector("tenant-a", "run-1")
        self.assertIsNotNone(protector)
        self.assertEqual(calls, [("tenant-a", "workflow-journal")])

    def test_external_configuration_fails_closed_when_provider_is_not_injected(self):
        with patch.dict(os.environ, {"COGNITIVE_OS_JOURNAL_KEY_MODE": "external"}, clear=False), patch.object(api_main, "JOURNAL_KEY_RESOLVER", None):
            with self.assertRaisesRegex(InvariantViolation, "WORKFLOW_JOURNAL_EXTERNAL_KEY_PROVIDER_NOT_CONFIGURED"):
                api_main.build_api_journal_protector("tenant-a", "run-1")


if __name__ == "__main__":
    unittest.main()
