"""``/projects``/``/projects/{id}/sources`` -- first HTTP surface for Master Plan Phase 1's Project/Source
Import planes (2026-09-17). Real FastAPI TestClient, real PostgreSQL for both stores (tests/pg.py), real CAS on disk.
"""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from ai_lego.apps.api import main as api_main
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform import block_hooks
from tests.unit.test_api_main import ApiTestCase
from urllib.parse import urljoin


class ProjectSourceApiTestCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self._proj_tmpdir = tempfile.TemporaryDirectory()
        self._repo = ProjectSourceRepository(self.databases)
        self._source_cas = TenantScopedCas(Path(self._proj_tmpdir.name) / "source-cas")
        api_main.app.dependency_overrides[api_main.get_project_source_repository] = lambda: self._repo
        api_main.app.dependency_overrides[api_main.get_source_cas] = lambda: self._source_cas

    def tearDown(self):
        block_hooks.wait_idle()   # a paste or an ingest starts the arrival hooks in the background; they hold the store open
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
        for path in ("/projects", "/projects/x", "/projects/x/history", "/projects/x/analyses"):
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
        INSERT on a double-submit/client-retry raised an uncaught IntegrityError (now psycopg's UniqueViolation) -> Starlette 500."""
        self._login()
        self._create_project(name="Same Name")
        response = self.client.post("/projects", json={"name": "Same Name", "purpose": "different purpose", "data_classification": "Confidential"})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("PROJECT_NAME_ALREADY_EXISTS_IN_WORKSPACE", response.json()["detail"])

    def test_rename_project_then_a_duplicate_name_is_a_clean_409(self):
        # N-83: projects were auto-named tool+time at creation with no way to fix a bad name afterwards.
        self._login()
        project = self._create_project(name="Old Name")
        other = self._create_project(name="Other Name")
        renamed = self.client.patch(f"/projects/{project['project_id']}", json={"name": "New Name"})
        self.assertEqual(renamed.status_code, 200, renamed.text)
        self.assertEqual(renamed.json()["name"], "New Name")
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}").json()["name"], "New Name")
        clash = self.client.patch(f"/projects/{project['project_id']}", json={"name": "Other Name"})
        self.assertEqual(clash.status_code, 409, clash.text)
        self.assertIn("PROJECT_NAME_ALREADY_EXISTS_IN_WORKSPACE", clash.json()["detail"])
        self.assertEqual(self.client.get(f"/projects/{other['project_id']}").json()["name"], "Other Name")   # untouched
        self.assertEqual(self.client.patch(f"/projects/{uuid.uuid4()}", json={"name": "x"}).status_code, 404)
        self.assertEqual(self.client.patch(f"/projects/{project['project_id']}", json={"name": "  "}).status_code, 400)

    def test_erased_projects_list_the_tombstone_after_the_row_is_gone(self):
        # N-66: list_projects only ever returned live rows; a deleted project had nowhere to show it happened.
        self._login()
        project = self._create_project()
        self.assertEqual(self.client.get("/projects/erased").json(), [])
        erased = self.client.delete(f"/projects/{project['project_id']}")
        self.assertEqual(erased.status_code, 200, erased.text)
        self.assertEqual([p["project_id"] for p in self.client.get("/projects").json()], [])
        tombstones = self.client.get("/projects/erased").json()
        self.assertEqual(len(tombstones), 1)
        self.assertEqual(tombstones[0]["project_id"], project["project_id"])
        self.assertEqual(tombstones[0]["erased_by_identity_id"], self.identity["identity_id"])
        self.assertIn("sources", tombstones[0])
        self._login_as_a_different_tenant()
        self.assertEqual(self.client.get("/projects/erased").json(), [], "a second tenant must not see the first tenant's tombstone")

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
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}/analyses").status_code, 404)
        self.assertEqual(self.client.get("/projects").json(), [], "a second tenant must not see the first tenant's project in its own list")

    def test_entitlement_denied_tenant_cannot_create_a_project(self):
        self._login()
        from ai_lego.platform.identity.store import IdentityStore

        class DenyingStore(IdentityStore):
            def get_tenant(self, tenant_id):
                tenant = super().get_tenant(tenant_id)
                return {**tenant, "status": "suspended"} if tenant else None

        api_main.app.dependency_overrides[api_main.get_store] = lambda: DenyingStore(self.databases)
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

    def test_create_source_without_citation_metadata_defaults_to_null_backward_compatibly(self):
        self._login()
        project = self._create_project()
        source = self._create_source(project["project_id"])
        self.assertIsNone(source["doi"])
        self.assertIsNone(source["authors"])
        self.assertIsNone(source["venue"])
        self.assertIsNone(source["published_at"])

    def test_create_source_with_a_doi_is_classed_academic(self):
        # RESEARCH_LINES_MASTER_PLAN WC-P2-07b, P-K11: source_class is decided at write time.
        self._login()
        project = self._create_project()
        source = self._create_source(project["project_id"], doi="10.1000/xyz123")
        self.assertEqual(source["source_class"], "academic")

    def test_create_source_without_a_doi_has_no_source_class(self):
        self._login()
        project = self._create_project()
        source = self._create_source(project["project_id"])
        self.assertIsNone(source["source_class"])

    def test_create_source_with_citation_metadata(self):
        self._login()
        project = self._create_project()
        source = self._create_source(
            project["project_id"],
            doi="10.1000/xyz123",
            authors=["Ada Lovelace", "Alan Turing"],
            venue="Journal of Reflective Practice",
            published_at="2020-05",
        )
        self.assertEqual(source["doi"], "10.1000/xyz123")
        self.assertEqual(source["authors"], ["Ada Lovelace", "Alan Turing"])
        self.assertEqual(source["venue"], "Journal of Reflective Practice")
        self.assertEqual(source["published_at"], "2020-05")
        fetched = self.client.get(f"/projects/{project['project_id']}/sources/{source['source_id']}").json()
        self.assertEqual(fetched["doi"], "10.1000/xyz123")
        self.assertEqual(fetched["authors"], ["Ada Lovelace", "Alan Turing"])

    def test_oversized_doi_is_refused(self):
        self._login()
        project = self._create_project()
        response = self.client.post(f"/projects/{project['project_id']}/sources", json={"title": "t", "media_type": "text/plain", "data_classification": "Confidential", "content": "x", "doi": "x" * 201})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("SOURCE_DOI_INVALID", response.json()["detail"])

    def test_invalid_doi_is_refused_before_any_cas_write(self):
        """Follow-up to Task 2a's disclosed gap (WORKLOG 2026-09-18 'Cognitive OS Source 物件補齊引用中繼
        資料欄位'): doi/authors/venue/published_at validation ran AFTER source_cas.put(), so a rejected doi
        left a permanent orphaned blob nothing referenced. cas_path_for() now computes the destination
        without writing, and source_record() validates against it before source_cas.put() is ever called."""
        self._login()
        project = self._create_project()
        response = self.client.post(f"/projects/{project['project_id']}/sources", json={"title": "t", "media_type": "text/plain", "data_classification": "Confidential", "content": "orphan-would-be-this-content", "doi": "x" * 201})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("SOURCE_DOI_INVALID", response.json()["detail"])
        self.assertEqual(self._source_cas.list_objects(self.tenant["tenant_id"]), [])

    def test_authors_containing_a_blank_string_is_refused(self):
        self._login()
        project = self._create_project()
        response = self.client.post(f"/projects/{project['project_id']}/sources", json={"title": "t", "media_type": "text/plain", "data_classification": "Confidential", "content": "x", "authors": [""]})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("SOURCE_AUTHORS_INVALID", response.json()["detail"])

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


class SourcesBriefApiTests(ProjectSourceApiTestCase):
    """``GET /projects/{id}/sources/brief`` -- composes a Project's Sources into one text blob for the
    dashboard's "帶入 Project 來源當背景資料" button (2026-09-18)."""

    def _create_source(self, project_id: str, **overrides) -> dict:
        body = {"title": "Interview notes", "media_type": "text/plain", "data_classification": "Confidential", "content": "participant said: I felt overwhelmed."}
        body.update(overrides)
        response = self.client.post(f"/projects/{project_id}/sources", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_brief_requires_a_session(self):
        self.assertEqual(self.client.get("/projects/x/sources/brief").status_code, 401)

    def test_brief_for_unknown_project_is_404(self):
        self._login()
        response = self.client.get(f"/projects/{uuid.uuid4()}/sources/brief")
        self.assertEqual(response.status_code, 404, response.text)
        self.assertIn("PROJECT_NOT_FOUND", response.json()["detail"])

    def test_brief_with_no_sources_is_empty_not_an_error(self):
        self._login()
        project = self._create_project()
        response = self.client.get(f"/projects/{project['project_id']}/sources/brief")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json(),
            {"project_id": project["project_id"], "brief": "", "sources_total": 0, "sources_included": 0, "truncated": False},
        )

    def test_brief_composes_multiple_sources_titles_and_content(self):
        """No ordering assertion: create_source's created_at is second-resolution (source_record.py via
        the handler's ``.replace(microsecond=0)``), so two sources created back-to-back in a fast test can
        tie on created_at -- list_sources then tie-breaks on source_id (a random UUID), not insertion order.
        That is a pre-existing repo.list_sources characteristic this endpoint deliberately reuses as-is
        (task scope: reuse the query, don't duplicate it), not something this test should assume away."""
        self._login()
        project = self._create_project()
        self._create_source(project["project_id"], title="First Paper", content="alpha content")
        self._create_source(project["project_id"], title="Second Paper", content="beta content")
        body = self.client.get(f"/projects/{project['project_id']}/sources/brief").json()
        self.assertEqual(body["sources_total"], 2)
        self.assertEqual(body["sources_included"], 2)
        self.assertFalse(body["truncated"])
        self.assertIn("First Paper", body["brief"])
        self.assertIn("Second Paper", body["brief"])
        self.assertIn("alpha content", body["brief"])
        self.assertIn("beta content", body["brief"])

    def test_brief_includes_citation_metadata(self):
        self._login()
        project = self._create_project()
        self._create_source(
            project["project_id"],
            title="Cited Paper",
            content="body text",
            doi="10.1000/xyz",
            authors=["Ada Lovelace"],
            venue="Journal X",
            published_at="2020-05",
        )
        body = self.client.get(f"/projects/{project['project_id']}/sources/brief").json()
        self.assertIn("Cited Paper", body["brief"])
        self.assertIn("Ada Lovelace", body["brief"])
        self.assertIn("Journal X", body["brief"])
        self.assertIn("2020-05", body["brief"])
        self.assertIn("10.1000/xyz", body["brief"])

    def test_brief_truncates_when_sources_exceed_the_cap_without_cutting_a_source_mid_way(self):
        """Whole-source granularity (main.py's own disclosed design choice): a source that would push the
        composed brief past MAX_SOURCE_BRIEF_CHARS is excluded whole, never included as a severed partial.
        Assertions are order-agnostic (see test_brief_composes_multiple_sources_titles_and_content for why
        list_sources's tie-break order isn't creation order in a fast test) -- they check that exactly
        ``sources_included`` COMPLETE blocks made it in, not which named sources those were."""
        self._login()
        project = self._create_project()
        chunk = "A" * (api_main.MAX_SOURCE_BRIEF_CHARS // 2)
        for label in ("Large One", "Large Two", "Large Three"):
            self._create_source(project["project_id"], title=label, content=chunk)
        response = self.client.get(f"/projects/{project['project_id']}/sources/brief")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["sources_total"], 3)
        self.assertTrue(body["truncated"])
        self.assertLess(body["sources_included"], 3)
        self.assertLessEqual(len(body["brief"]), api_main.MAX_SOURCE_BRIEF_CHARS)
        self.assertEqual(body["brief"].count("## Large "), body["sources_included"])
        self.assertEqual(body["brief"].count(chunk), body["sources_included"])

    def test_brief_is_invisible_to_a_real_second_tenant(self):
        self._login()
        project = self._create_project()
        self._create_source(project["project_id"])
        self._login_as_a_different_tenant()
        self.assertEqual(self.client.get(f"/projects/{project['project_id']}/sources/brief").status_code, 404)


class HandoffApiTests(ProjectSourceApiTestCase):
    """/auth/handoff/mint + /auth/handoff (operator report 2026-09-18): next-admin's service tenant
    creates a Project the operator's own dashboard login can never see (different tenant, and
    GET /projects / _project_or_404 are both tenant-scoped) -- these two routes are the fix. Real
    end-to-end proof lives in test_redeeming_the_code_actually_grants_a_working_session below: a
    SECOND, cookie-less TestClient (standing in for the operator's browser, which has never talked to
    this tenant) ends up able to list the minting session's own projects after nothing but following
    the redirect -- the exact capability the direct ?project=<id> link never had."""

    def test_mint_requires_a_session(self):
        self.assertEqual(self.client.post("/auth/handoff/mint", json={"project_id": "x"}).status_code, 401)

    def test_mint_requires_a_real_project_for_the_callers_tenant(self):
        self._login()
        response = self.client.post("/auth/handoff/mint", json={"project_id": str(uuid.uuid4())})
        self.assertEqual(response.status_code, 404)
        self.assertIn("PROJECT_NOT_FOUND", response.json()["detail"])

    def test_mint_rejects_a_non_uuid_project_id_before_ever_querying_the_repository(self):
        """Defense in depth (critic suggestion, 2026-09-18): redeem_handoff's redirect target is built
        from this value -- reject anything that could not possibly be a real project_id (every stored
        one is server-generated via project_record()'s own require_uuid) at the earliest point."""
        self._login()
        response = self.client.post("/auth/handoff/mint", json={"project_id": "../../evil"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("HANDOFF_PROJECT_ID_INVALID", response.json()["detail"])

    def test_mint_for_another_tenants_project_is_refused(self):
        """Real second tenant owns the project; the FIRST tenant's own session tries to mint a
        handoff for it -- must 404 exactly like a direct GET of that project would (_project_or_404
        gates both the same way), not silently mint a code for someone else's data."""
        self._login()
        store = api_main.app.dependency_overrides[api_main.get_store]()
        other_tenant = store.create_tenant(tenant_id=str(uuid.uuid4()), legal_name="Other", home_jurisdiction="jurisdiction-pack.tw.v1", data_residency_region="local-dev", encryption_root_key_ref="k")
        store.create_workspace(str(uuid.uuid4()), other_tenant["tenant_id"], "Default")
        store.create_identity(str(uuid.uuid4()), other_tenant["tenant_id"], "other@example.com", "Other", "correct-horse-battery")

        other_client = TestClient(api_main.app, base_url="https://testserver")
        login = other_client.post("/auth/login", json={"tenant_id": other_tenant["tenant_id"], "email": "other@example.com", "password": "correct-horse-battery"})
        self.assertEqual(login.status_code, 200, login.text)
        other_project = other_client.post("/projects", json={"name": "n", "purpose": "p", "data_classification": "Confidential"}).json()

        response = self.client.post("/auth/handoff/mint", json={"project_id": other_project["project_id"]})
        self.assertEqual(response.status_code, 404)

    def test_redeem_invalid_code_is_400(self):
        response = self.client.get("/auth/handoff", params={"code": "not-a-real-code"}, follow_redirects=False)
        self.assertEqual(response.status_code, 400)

    def test_redeem_is_single_use_at_the_api_level(self):
        self._login()
        project = self._create_project()
        code = self.client.post("/auth/handoff/mint", json={"project_id": project["project_id"]}).json()["code"]
        anon = TestClient(api_main.app, base_url="https://testserver")
        first = anon.get("/auth/handoff", params={"code": code}, follow_redirects=False)
        self.assertEqual(first.status_code, 302)
        second = anon.get("/auth/handoff", params={"code": code}, follow_redirects=False)
        self.assertEqual(second.status_code, 400)

    def test_redeeming_the_code_actually_grants_a_working_session(self):
        """End-to-end: mint as the logged-in session, redeem from a brand-new client that has never
        authenticated, then use THAT client's resulting cookie to list /projects and find the exact
        project the handoff was minted for -- the real-world proof that the operator's browser, which
        never held service-tenant credentials, ends up able to see what the service tenant created."""
        self._login()
        project = self._create_project()
        code = self.client.post("/auth/handoff/mint", json={"project_id": project["project_id"]}).json()["code"]

        anon = TestClient(api_main.app, base_url="https://testserver")
        redirect = anon.get("/auth/handoff", params={"code": code}, follow_redirects=False)
        self.assertEqual(redirect.status_code, 302)
        self.assertEqual(redirect.headers["location"], f"../?project={project['project_id']}")
        # the invariant behind the relative path: it lands on the dashboard's project view at every mount point
        for handoff_url, dashboard in (("https://h/auth/handoff", "https://h/"), ("https://h/expert/auth/handoff", "https://h/expert/"), ("https://h/api/auth/handoff", "https://h/api/")):
            self.assertEqual(urljoin(handoff_url, redirect.headers["location"]), f"{dashboard}?project={project['project_id']}")
        self.assertIn("cognitive_os_session", redirect.cookies)

        listed = anon.get("/projects")
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertIn(project["project_id"], [p["project_id"] for p in listed.json()])


if __name__ == "__main__":
    import unittest

    unittest.main()
