"""``/projects``/``/projects/{id}/sources`` -- first HTTP surface for Master Plan Phase 1's Project/Source
Import planes (2026-09-17). Real FastAPI TestClient, real temp-file SQLite for both stores, real CAS on disk.
"""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from ai_lego.apps.api import main as api_main
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from tests.unit.test_api_main import ApiTestCase


class ProjectSourceApiTestCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self._proj_tmpdir = tempfile.TemporaryDirectory()
        self._repo = ProjectSourceRepository(Path(self._proj_tmpdir.name) / "projects.sqlite3")
        self._source_cas = TenantScopedCas(Path(self._proj_tmpdir.name) / "source-cas")
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: self._repo
        api_main.app.dependency_overrides[api_main.get_source_cas] = lambda: self._source_cas

    def tearDown(self):
        self._proj_tmpdir.cleanup()
        super().tearDown()

    def _create_project(self, **overrides) -> dict:
        body = {"name": "EdD study", "purpose": "Investigate reflective practice.", "data_classification": "Confidential"}
        body.update(overrides)
        response = self.client.post("/projects", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _login_as_a_different_tenant(self) -> None:
        """Real second tenant/workspace/identity, not a fabricated id -- so a "not found" assertion actually
        proves tenant scoping, not just a DB miss on a random UUID (critic coverage-gap finding 2026-09-17)."""
        store = api_main.app.dependency_overrides[api_main.get_store]()
        other_tenant = store.create_tenant(tenant_id=str(uuid.uuid4()), legal_name="Other Tenant", home_jurisdiction="jurisdiction-pack.tw.v1", data_residency_region="local-dev", encryption_root_key_ref="other-kek")
        store.create_workspace(str(uuid.uuid4()), other_tenant["tenant_id"], "Default")
        store.create_identity(str(uuid.uuid4()), other_tenant["tenant_id"], "other@example.com", "Other", "correct-horse-battery")
        response = self.client.post("/auth/login", json={"tenant_id": other_tenant["tenant_id"], "email": "other@example.com", "password": "correct-horse-battery"})
        self.assertEqual(response.status_code, 200, response.text)


class ProjectApiTests(ProjectSourceApiTestCase):
    def test_routes_require_a_session(self):
        self.assertEqual(self.client.post("/projects", json={}).status_code, 401)
        for path in ("/projects", "/projects/x", "/projects/x/history"):
            self.assertEqual(self.client.get(path).status_code, 401, path)

    def test_create_project_auto_resolves_the_tenants_sole_default_workspace(self):
        self._login()
        project = self._create_project()
        self.assertEqual(project["tenant_id"], self.tenant["tenant_id"])
        self.assertTrue(project["project_id"])
        self.assertEqual(project["status"], "active")
        self.assertEqual(project["version"], 1)
        self.assertEqual(project["created_by_identity_id"], self.identity["identity_id"])

    def test_create_project_with_explicit_workspace_id(self):
        self._login()
        store = api_main.app.dependency_overrides[api_main.get_store]()
        workspace = store.create_workspace(str(uuid.uuid4()), self.tenant["tenant_id"], "Second Workspace")
        project = self._create_project(workspace_id=workspace["workspace_id"])
        self.assertEqual(project["workspace_id"], workspace["workspace_id"])

    def test_create_project_requires_explicit_workspace_id_when_tenant_has_more_than_one(self):
        self._login()
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_workspace(str(uuid.uuid4()), self.tenant["tenant_id"], "Second Workspace")
        response = self.client.post("/projects", json={"name": "n", "purpose": "p", "data_classification": "Confidential"})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("PROJECT_WORKSPACE_ID_REQUIRED", response.json()["detail"])

    def test_explicit_workspace_id_from_another_tenant_is_refused(self):
        self._login()
        store = api_main.app.dependency_overrides[api_main.get_store]()
        other_tenant = store.create_tenant(tenant_id=str(uuid.uuid4()), legal_name="Other", home_jurisdiction="jurisdiction-pack.tw.v1", data_residency_region="local-dev", encryption_root_key_ref="k")
        other_workspace = store.create_workspace(str(uuid.uuid4()), other_tenant["tenant_id"], "Default")
        response = self.client.post("/projects", json={"name": "n", "purpose": "p", "data_classification": "Confidential", "workspace_id": other_workspace["workspace_id"]})
        self.assertEqual(response.status_code, 404, response.text)
        self.assertIn("WORKSPACE_NOT_FOUND", response.json()["detail"])

    def test_duplicate_project_name_in_the_same_workspace_is_a_clean_409_not_a_raw_500(self):
        """Critic finding 2026-09-17: platform_projects has UNIQUE(tenant_id, workspace_id, name); a bare
        INSERT on a double-submit/client-retry raised an uncaught sqlite3.IntegrityError -> Starlette 500."""
        self._login()
        self._create_project(name="Same Name")
        response = self.client.post("/projects", json={"name": "Same Name", "purpose": "different purpose", "data_classification": "Confidential"})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("PROJECT_NAME_ALREADY_EXISTS_IN_WORKSPACE", response.json()["detail"])

    def test_workspace_required_message_distinguishes_zero_from_many(self):
        self._login()
        store = api_main.app.dependency_overrides[api_main.get_store]()
        store.create_workspace(str(uuid.uuid4()), self.tenant["tenant_id"], "Second Workspace")
        many = self.client.post("/projects", json={"name": "n", "purpose": "p", "data_classification": "Confidential"})
        self.assertIn("has 2 workspaces", many.json()["detail"])

    def test_invalid_data_classification_is_400(self):
        self._login()
        response = self.client.post("/projects", json={"name": "n", "purpose": "p", "data_classification": "super-secret"})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("PROJECT_DATA_CLASSIFICATION_INVALID", response.json()["detail"])

    def test_get_and_list_projects_are_tenant_scoped(self):
        self._login()
        project = self._create_project()
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}").json()["project_id"], project["project_id"])
        self.assertEqual([p["project_id"] for p in self.client.get("/projects").json()], [project["project_id"]])
        self.assertEqual(self.client.get(f"/projects/{uuid.uuid4()}").status_code, 404)

    def test_project_history_records_the_creation_event(self):
        self._login()
        project = self._create_project()
        events = self.client.get(f"/projects/{project['project_id']}/history").json()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event_type"], "ProjectCreated")
        self.assertEqual(events[0]["payload"]["project_id"], project["project_id"])

    def test_project_history_for_unknown_project_is_404(self):
        self._login()
        self.assertEqual(self.client.get(f"/projects/{uuid.uuid4()}/history").status_code, 404)

    def test_project_and_its_history_are_invisible_to_a_real_second_tenant(self):
        self._login()
        project = self._create_project()
        self._login_as_a_different_tenant()
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}").status_code, 404)
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}/history").status_code, 404)
        self.assertEqual(self.client.get("/projects").json(), [], "a second tenant must not see the first tenant's project in its own list")

    def test_entitlement_denied_tenant_cannot_create_a_project(self):
        self._login()
        from ai_lego.platform.identity.store import IdentityStore

        class DenyingStore(IdentityStore):
            def get_tenant(self, tenant_id):
                tenant = super().get_tenant(tenant_id)
                return {**tenant, "status": "suspended"} if tenant else None

        api_main.app.dependency_overrides[api_main.get_store] = lambda: DenyingStore(self.db_path)
        response = self.client.post("/projects", json={"name": "n", "purpose": "p", "data_classification": "Confidential"})
        self.assertEqual(response.status_code, 403, response.text)
        self.assertIn("ENTITLEMENT_DENIED", response.json()["detail"])


class SourceApiTests(ProjectSourceApiTestCase):
    def _create_source(self, project_id: str, **overrides) -> dict:
        body = {"title": "Interview notes", "media_type": "text/plain", "data_classification": "Confidential", "content": "participant said: I felt overwhelmed."}
        body.update(overrides)
        response = self.client.post(f"/projects/{project_id}/sources", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_create_source_under_a_real_project_and_read_content_back(self):
        self._login()
        project = self._create_project()
        source = self._create_source(project["project_id"])
        self.assertEqual(source["project_id"], project["project_id"])
        self.assertEqual(source["size_bytes"], len("participant said: I felt overwhelmed.".encode("utf-8")))
        self.assertEqual(source["content_role"], "RETRIEVED_SOURCE_DATA")
        self.assertEqual(source["verification_status"], "UNVERIFIED")
        content = self.client.get(f"/projects/{project['project_id']}/sources/{source['source_id']}/content").json()
        self.assertEqual(content["content"], "participant said: I felt overwhelmed.")

    def test_source_under_a_nonexistent_project_is_404(self):
        self._login()
        response = self.client.post(f"/projects/{uuid.uuid4()}/sources", json={"title": "t", "media_type": "text/plain", "data_classification": "Confidential", "content": "x"})
        self.assertEqual(response.status_code, 404, response.text)
        self.assertIn("PROJECT_NOT_FOUND", response.json()["detail"])

    def test_source_classification_must_match_its_project(self):
        self._login()
        project = self._create_project(data_classification="Confidential")
        response = self.client.post(f"/projects/{project['project_id']}/sources", json={"title": "t", "media_type": "text/plain", "data_classification": "Public", "content": "x"})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("SOURCE_PROJECT_CLASSIFICATION_MISMATCH", response.json()["detail"])

    def test_classification_mismatch_is_refused_before_any_cas_write(self):
        """Critic finding 2026-09-17: the classification check ran only inside the repository, AFTER the CAS
        write already happened -- every mismatch (trivially triggerable) left a permanent orphaned object.
        Now checked in the handler before source_cas.put is ever called."""
        self._login()
        project = self._create_project(data_classification="Confidential")
        self.client.post(f"/projects/{project['project_id']}/sources", json={"title": "t", "media_type": "text/plain", "data_classification": "Public", "content": "orphan-would-be-this-content"})
        self.assertEqual(self._source_cas.list_objects(self.tenant["tenant_id"]), [])

    def test_oversized_source_content_is_refused(self):
        self._login()
        project = self._create_project()
        response = self.client.post(f"/projects/{project['project_id']}/sources", json={"title": "t", "media_type": "text/plain", "data_classification": "Confidential", "content": "x" * (api_main.MAX_SOURCE_CONTENT_BYTES + 1)})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("SOURCE_CONTENT_TOO_LARGE", response.json()["detail"])
        self.assertEqual(self._source_cas.list_objects(self.tenant["tenant_id"]), [])

    def test_source_content_at_exactly_the_size_cap_is_accepted(self):
        self._login()
        project = self._create_project()
        source = self._create_source(project["project_id"], content="x" * api_main.MAX_SOURCE_CONTENT_BYTES)
        self.assertEqual(source["size_bytes"], api_main.MAX_SOURCE_CONTENT_BYTES)

    def test_unsupported_media_type_is_refused_before_any_cas_write(self):
        self._login()
        project = self._create_project()
        response = self.client.post(f"/projects/{project['project_id']}/sources", json={"title": "t", "media_type": "application/pdf", "data_classification": "Confidential", "content": "x"})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("SOURCE_MEDIA_TYPE_UNSUPPORTED", response.json()["detail"])
        self.assertEqual(self._source_cas.list_objects(self.tenant["tenant_id"]), [])

    def test_list_and_get_source_are_project_and_tenant_scoped(self):
        self._login()
        project = self._create_project()
        source = self._create_source(project["project_id"])
        self.assertEqual([s["source_id"] for s in self.client.get(f"/projects/{project['project_id']}/sources").json()], [source["source_id"]])
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}/sources/{source['source_id']}").json()["source_id"], source["source_id"])
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}/sources/{uuid.uuid4()}").status_code, 404)

    def test_source_history_records_the_addition_event(self):
        self._login()
        project = self._create_project()
        source = self._create_source(project["project_id"])
        events = self.client.get(f"/projects/{project['project_id']}/sources/{source['source_id']}/history").json()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event_type"], "SourceAdded")
        self.assertEqual(events[0]["payload"]["content_sha256"], source["content_sha256"])

    def test_source_and_its_history_are_invisible_to_a_real_second_tenant(self):
        self._login()
        project = self._create_project()
        source = self._create_source(project["project_id"])
        self._login_as_a_different_tenant()
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}/sources/{source['source_id']}").status_code, 404)
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}/sources/{source['source_id']}/history").status_code, 404)
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}/sources/{source['source_id']}/content").status_code, 404)
        # the project itself is also invisible, so list_sources 404s at the project boundary first
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}/sources").status_code, 404)

    def test_source_content_is_tenant_isolated_in_cas(self):
        """Even with the project/source repository row visible only to its own tenant, the underlying CAS read
        must ALSO be tenant-scoped -- defense in depth, same invariant TenantScopedCas enforces everywhere else."""
        self._login()
        project = self._create_project()
        source = self._create_source(project["project_id"])
        cas_path = self._repo.get_source_content_reference(self.tenant["tenant_id"], project["project_id"], source["source_id"])
        with self.assertRaises(Exception):
            self._source_cas.read("some-other-tenant-id", cas_path)


if __name__ == "__main__":
    import unittest

    unittest.main()
