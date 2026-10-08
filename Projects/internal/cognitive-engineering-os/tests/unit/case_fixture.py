"""A real case in a test's own repository file. A case's records are written only while the case exists (CASE_ERASED,
ProjectSourceRepository.require_case), so a unit test that writes case records makes the case first, as every route does."""

from __future__ import annotations

from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.object.json_artifact_store import JsonArtifactStore
from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform.erasure import Erasure


def a_case(repo: ProjectSourceRepository, tenant_id: str, case_id: str) -> record_log.Owner:
    repo.create_project({"project_id": case_id, "tenant_id": tenant_id, "workspace_id": "w", "name": case_id, "purpose": "test",
                         "data_classification": "Confidential", "status": "active", "version": 1, "created_by_identity_id": "me",
                         "created_at": "2026-10-04T00:00:00Z"})
    return record_log.case(case_id)


def _no_runs(*_: Any) -> Any:
    raise AssertionError("this erasure names no recipe runs")


def erase(repo: ProjectSourceRepository, tenant_id: str, case_id: str, identity_id: str, source_cas: TenantScopedCas) -> dict[str, Any]:
    """Erase a case the way DELETE /projects/{id} does (ai_lego/platform/erasure.py: decide, then clean up), for a test that
    has no recipe runs; its AI artifacts (if any) live beside ``source_cas``."""
    artifacts = JsonArtifactStore(TenantScopedCas(source_cas.root.parent / "erase-artifact-cas"))
    return Erasure(repo, source_cas, artifacts, _no_runs).erase_case(tenant_id, case_id, identity_id, [])
