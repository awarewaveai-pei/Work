"""EXPRESS routes beyond the generic document and AI routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import DocBody, _kind, _save, case_owner
from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform.block_hooks.express import outline_for_selection
from ai_lego.platform.rulesets.express import FORMATS


router = APIRouter()


def _versions(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, kind: str, doc_id: str) -> list[dict[str, Any]]:
    try:
        return docs.versions(tenant_id, owner, kind, doc_id)
    except InvariantViolation as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/projects/{project_id}/express/selection")
def get_selection(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    return CaseDocs(repo).current(session["tenant_id"], owner, "express.selection")


@router.post("/projects/{project_id}/express/selection")
def create_selection(project_id: str, body: DocBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    owner = case_owner(project_id, session, repo)
    return _save(repo, session, owner, _kind("express.selection", "case"), body)


@router.put("/projects/{project_id}/express/selection/{doc_id}")
def update_selection(project_id: str, doc_id: str, body: DocBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    owner = case_owner(project_id, session, repo)
    return _save(repo, session, owner, _kind("express.selection", "case"), body, doc_id)


@router.delete("/projects/{project_id}/express/selection/{doc_id}")
def delete_selection(project_id: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, str]:
    owner = case_owner(project_id, session, repo)
    spec = _kind("express.selection", "case")
    try:
        CaseDocs(repo).delete(session["tenant_id"], owner, spec.kind, doc_id, api._me(session, spec.block))
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"status": "deleted", "doc_id": doc_id}


@router.get("/projects/{project_id}/express/selection/{doc_id}/versions")
def selection_versions(project_id: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    return _versions(CaseDocs(repo), session["tenant_id"], owner, "express.selection", doc_id)


@router.get("/projects/{project_id}/express/outline")
def get_outline(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    owner = case_owner(project_id, session, repo)
    try:
        return outline_for_selection(CaseDocs(repo), session["tenant_id"], owner)
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/projects/{project_id}/express/drafts")
def list_drafts(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    return CaseDocs(repo).current(session["tenant_id"], owner, "express.draft")


@router.get("/projects/{project_id}/express/drafts/{doc_id}/versions")
def draft_versions(project_id: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    return _versions(CaseDocs(repo), session["tenant_id"], owner, "express.draft", doc_id)


@router.get("/projects/{project_id}/express/formats")
def formats(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    case_owner(project_id, session, repo)
    return FORMATS.stamp() | {"formats": FORMATS.items}
