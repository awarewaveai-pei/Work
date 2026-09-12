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
