"""GOVERN's consents over HTTP (docs/platform/STEP34_SHARED_RULES.md §6, card 13): the person decides, item by item, which
documents of their own cases another may read. Nothing is shared by default. Read through platform/visibility.py
``shared_with`` only. Every save goes through the person's save path (blocks/docs.py ``_save``): GOVERN's check on a
consent is its BEFORE_SAVE hook (platform/block_hooks/govern_group.py), run inside the save's lock.

    GET  /me/consents                                   the person's consents (current version of each)
    POST /me/consents  {purpose, target, items, follow_versions, doc_id?, base_version?}   a new consent, or its next version
    POST /me/consents/{doc_id}/withdraw                 a new version, withdrawn: shares nothing from the next read on
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import DocBody, _save
from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository

router = APIRouter()
KIND = "govern.consent"


def _mine(session: dict[str, Any]) -> record_log.Owner:
    return record_log.person(session["identity_id"])


class ConsentBody(BaseModel):
    purpose: str
    target: str
    items: list[dict[str, Any]] = []
    follow_versions: bool = True
    doc_id: str | None = None
    base_version: int | None = None


@router.get("/me/consents")
def my_consents(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    return CaseDocs(repo).current(session["tenant_id"], _mine(session), KIND)


@router.post("/me/consents")
def save_consent(body: ConsentBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """The person themselves writes it (the session's own person record); a consent made again after a withdrawal is its
    next version, not withdrawn."""
    content = {"purpose": body.purpose, "target": body.target, "items": body.items, "follow_versions": body.follow_versions, "withdrawn": False}
    return _save(repo, session, _mine(session), doc_kinds.require(KIND), DocBody(content=content, base_version=body.base_version), body.doc_id)


@router.post("/me/consents/{doc_id}/withdraw")
def withdraw_consent(doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    current = next((doc for doc in CaseDocs(repo).current(session["tenant_id"], _mine(session), KIND) if doc["doc_id"] == doc_id), None)
    if current is None:
        raise HTTPException(status_code=404, detail=f"CONSENT_NOT_FOUND: {doc_id!r}")
    body = DocBody(content={**current["content"], "withdrawn": True}, base_version=current["version"])
    return _save(repo, session, _mine(session), doc_kinds.require(KIND), body, doc_id)
