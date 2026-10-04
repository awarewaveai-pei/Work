"""``/workflows/custom`` -- tenant-authored method chains (dashboard "組成工作流", 2026-09-18).
Real FastAPI TestClient, real temp-file SQLite, real MethodCatalog (get_catalog is NOT overridden,
so method_id resolvability checks run against the actual 280 ACTIVE contracts)."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from ai_lego.apps.api import main as api_main
from ai_lego.data.repositories.custom_workflow_repository import CustomWorkflowRepository
from tests.unit.test_api_main import ApiTestCase

REAL_METHOD_ID_A = "root_cause.fishbone"
REAL_METHOD_ID_B = "strategy.swot"


class CustomWorkflowApiTestCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self._workflow_tmpdir = tempfile.TemporaryDirectory()
        self._repo = CustomWorkflowRepository(self.databases)
        api_main.app.dependency_overrides[api_main.get_custom_workflow_repository] = lambda: self._repo

    def tearDown(self):
        self._workflow_tmpdir.cleanup()
        super().tearDown()

    def _create(self, **overrides) -> dict:
        body = {"title": "My Root Cause Kit", "method_ids": [REAL_METHOD_ID_A, REAL_METHOD_ID_B]}
        body.update(overrides)
        response = self.client.post("/workflows/custom", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _login_as_a_different_tenant(self) -> None:
        store = api_main.app.dependency_overrides[api_main.get_store]()
        other_tenant = store.create_tenant(tenant_id=str(uuid.uuid4()), legal_name="Other Tenant", home_jurisdiction="jurisdiction-pack.tw.v1", data_residency_region="local-dev", encryption_root_key_ref="other-kek")
        store.create_identity(str(uuid.uuid4()), other_tenant["tenant_id"], "other@example.com", "Other", "correct-horse-battery")
        response = self.client.post("/auth/login", json={"tenant_id": other_tenant["tenant_id"], "email": "other@example.com", "password": "correct-horse-battery"})
        self.assertEqual(response.status_code, 200, response.text)


class CustomWorkflowApiTests(CustomWorkflowApiTestCase):
    def test_routes_require_a_session(self):
        self.assertEqual(self.client.post("/workflows/custom", json={}).status_code, 401)
        self.assertEqual(self.client.get("/workflows/custom").status_code, 401)
        self.assertEqual(self.client.get("/workflows/custom/x").status_code, 401)
        self.assertEqual(self.client.put("/workflows/custom/x", json={}).status_code, 401)
        self.assertEqual(self.client.delete("/workflows/custom/x").status_code, 401)

    def test_create_with_real_method_ids_round_trips(self):
        self._login()
        workflow = self._create()
        self.assertEqual(workflow["title"], "My Root Cause Kit")
        self.assertEqual(workflow["method_ids"], [REAL_METHOD_ID_A, REAL_METHOD_ID_B])
        self.assertEqual(workflow["tenant_id"], self.tenant["tenant_id"])
        self.assertEqual(workflow["created_by_identity_id"], self.identity["identity_id"])
        self.assertTrue(workflow["workflow_id"])
        self.assertEqual(workflow["created_at"], workflow["updated_at"])

    def test_create_rejects_an_unresolvable_method_id(self):
        self._login()
        response = self.client.post("/workflows/custom", json={"title": "Bad", "method_ids": ["not.a.real.method"]})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("CUSTOM_WORKFLOW_METHOD_ID_UNRESOLVABLE", response.text)
        self.assertIn("not.a.real.method", response.text)

    def test_create_rejects_an_empty_method_id_list(self):
        self._login()
        response = self.client.post("/workflows/custom", json={"title": "Empty", "method_ids": []})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("CUSTOM_WORKFLOW_METHOD_IDS_INVALID", response.text)

    def test_list_shows_created_workflow(self):
        self._login()
        created = self._create()
        listed = self.client.get("/workflows/custom").json()
        self.assertEqual([w["workflow_id"] for w in listed], [created["workflow_id"]])

    def test_get_returns_the_same_workflow(self):
        self._login()
        created = self._create()
        fetched = self.client.get("/workflows/custom/" + created["workflow_id"]).json()
        self.assertEqual(fetched, created)

    def test_get_missing_workflow_is_404(self):
        self._login()
        self.assertEqual(self.client.get("/workflows/custom/" + str(uuid.uuid4())).status_code, 404)

    def test_a_second_tenant_cannot_see_the_first_tenants_workflow(self):
        self._login()
        created = self._create()
        self._login_as_a_different_tenant()
        self.assertEqual(self.client.get("/workflows/custom/" + created["workflow_id"]).status_code, 404)
        self.assertEqual(self.client.get("/workflows/custom").json(), [])

    def test_update_changes_title_and_method_ids_and_bumps_updated_at(self):
        self._login()
        created = self._create()
        response = self.client.put("/workflows/custom/" + created["workflow_id"], json={"title": "Renamed", "method_ids": [REAL_METHOD_ID_B]})
        self.assertEqual(response.status_code, 200, response.text)
        updated = response.json()
        self.assertEqual(updated["title"], "Renamed")
        self.assertEqual(updated["method_ids"], [REAL_METHOD_ID_B])
        self.assertEqual(updated["created_at"], created["created_at"])

    def test_update_missing_workflow_is_404(self):
        self._login()
        response = self.client.put("/workflows/custom/" + str(uuid.uuid4()), json={"title": "X", "method_ids": [REAL_METHOD_ID_A]})
        self.assertEqual(response.status_code, 404)

    def test_update_rejects_an_unresolvable_method_id(self):
        self._login()
        created = self._create()
        response = self.client.put("/workflows/custom/" + created["workflow_id"], json={"title": "X", "method_ids": ["nope.nope"]})
        self.assertEqual(response.status_code, 400, response.text)

    def test_delete_then_get_is_404(self):
        self._login()
        created = self._create()
        response = self.client.delete("/workflows/custom/" + created["workflow_id"])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertEqual(self.client.get("/workflows/custom/" + created["workflow_id"]).status_code, 404)

    def test_delete_missing_workflow_is_404(self):
        self._login()
        self.assertEqual(self.client.delete("/workflows/custom/" + str(uuid.uuid4())).status_code, 404)
