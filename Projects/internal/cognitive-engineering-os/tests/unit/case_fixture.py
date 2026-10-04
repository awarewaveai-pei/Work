"""A real case in a test's own repository file. A case's records are written only while the case exists (CASE_ERASED,
ProjectSourceRepository.require_case), so a unit test that writes case records makes the case first, as every route does."""

from __future__ import annotations

from ai_lego.data.events import record_log
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository


def a_case(repo: ProjectSourceRepository, tenant_id: str, case_id: str) -> record_log.Owner:
    repo.create_project({"project_id": case_id, "tenant_id": tenant_id, "workspace_id": "w", "name": case_id, "purpose": "test",
                         "data_classification": "Confidential", "status": "active", "version": 1, "created_by_identity_id": "me",
                         "created_at": "2026-10-04T00:00:00Z"})
    return record_log.case(case_id)
