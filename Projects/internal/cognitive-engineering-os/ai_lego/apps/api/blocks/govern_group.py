"""GOVERN's consents over HTTP (docs/platform/STEP34_SHARED_RULES.md §6, card 13): the person decides, item by item, which
documents of their own cases another may read. Nothing is shared by default. Read through platform/visibility.py
``shared_with`` only. Every save goes through the person's save path (blocks/docs.py ``_save``): GOVERN's check on a
consent is its BEFORE_SAVE hook (platform/block_hooks/govern_group.py), run inside the save's lock.

    GET  /me/consents                                   the person's consents (current version of each)
    POST /me/consents  {purpose, target, items, follow_versions, doc_id?, base_version?}   a new consent, or its next version
    POST /me/consents/{doc_id}/withdraw                 a new version, withdrawn: shares nothing from the next read on

Appeals (§9, card 30), read only through platform/visibility.py ``appeals_for`` (the writer masked unless named):
    POST   /me/appeals  {group_id, about_identity_id, text, named=false}   a participant's, about a facilitator of that group
    GET    /me/appeals                     mine          GET /me/appeals/export   mine, as a file
    DELETE /me/appeals/{doc_id}            mine, also after leaving the group
    GET    /govern/appeals[/{doc_id}]      what appeals_for gives a handler or supervisor; anyone else gets [] / the 404
"""

from __future__ import annotations

from typing import Any

import json

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import DocBody, _call, _save, _saved
from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import visibility
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.visibility import Viewer

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


# -- Appeals --------------------------------------------------------------------------------------------------------

APPEAL_NOT_FOUND = "APPEAL_NOT_FOUND"   # one answer for missing, not yours and not readable: an appeal's existence is not disclosed


class AppealBody(BaseModel):
    group_id: str
    about_identity_id: str
    text: str
    named: bool = False


def _appeals(session: dict[str, Any], repo: ProjectSourceRepository, store: IdentityStore) -> list[dict[str, Any]]:
    return visibility.appeals_for(CaseDocs(repo), store, Viewer(session["tenant_id"], session["identity_id"]))


@router.post("/me/appeals")
def make_appeal(body: AppealBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """Only a current participant of the group, about a current facilitator of it; otherwise the group's own 404 (G2)."""
    tenant_id = session["tenant_id"]
    mine = repo.get_group_for(tenant_id, body.group_id, session["identity_id"])
    about = repo.get_group_for(tenant_id, body.group_id, body.about_identity_id)
    if mine is None or mine["my_role"] != "participant" or about is None or about["my_role"] != "facilitator":
        raise HTTPException(status_code=404, detail=f"GROUP_NOT_FOUND: {body.group_id!r}")
    owner = record_log.platform(tenant_id)
    content = {"group_id": body.group_id, "about_identity_id": body.about_identity_id, "text": body.text, "named": body.named}
    [saved] = _call(CaseDocs(repo).save_many, tenant_id, owner, [{"kind": visibility.APPEAL, "content": content}], api._me(session, "GOVERN"))
    return _saved(repo, session, owner, saved)   # the save path's crisis notice, to the writer


@router.get("/me/appeals")
def my_appeals(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
               store: IdentityStore = Depends(api.get_store)) -> list[dict[str, Any]]:
    return [item for item in _appeals(session, repo, store) if item.get("mine")]


@router.get("/me/appeals/export")
def export_my_appeals(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                      store: IdentityStore = Depends(api.get_store)) -> Response:
    mine = [item for item in _appeals(session, repo, store) if item.get("mine")]
    return Response(json.dumps({"appeals": mine}, ensure_ascii=False, default=str, indent=2), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="my-appeals.json"'})


@router.delete("/me/appeals/{doc_id}")
def delete_my_appeal(doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                     store: IdentityStore = Depends(api.get_store)) -> dict[str, str]:
    if not any(item["doc_id"] == doc_id and item.get("mine") for item in _appeals(session, repo, store)):
        raise HTTPException(status_code=404, detail=APPEAL_NOT_FOUND)
    try:   # CaseDocs refuses anyone but its sole writer again, under the lock (DOC_NOT_YOURS)
        CaseDocs(repo).delete(session["tenant_id"], record_log.platform(session["tenant_id"]), visibility.APPEAL, doc_id, api._me(session, "GOVERN"))
    except InvariantViolation as error:
        raise HTTPException(status_code=404, detail=APPEAL_NOT_FOUND) from error
    return {"status": "deleted", "doc_id": doc_id}


@router.get("/govern/appeals")
def appeals_to_handle(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                      store: IdentityStore = Depends(api.get_store)) -> list[dict[str, Any]]:
    return [item for item in _appeals(session, repo, store) if not item.get("mine")]


@router.get("/govern/appeals/{doc_id}")
def appeal_to_handle(doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                     store: IdentityStore = Depends(api.get_store)) -> dict[str, Any]:
    found = next((item for item in _appeals(session, repo, store) if item["doc_id"] == doc_id and not item.get("mine")), None)
    if found is None:
        raise HTTPException(status_code=404, detail=APPEAL_NOT_FOUND)
    return found

