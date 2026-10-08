"""GOVERN's consents over HTTP (docs/platform/STEP34_SHARED_RULES.md §6, card 13): the person decides, item by item, which
documents of their own cases another may read. Nothing is shared by default. Read through platform/visibility.py
``shared_with`` only.

    GET  /me/consents                                   the person's consents (current version of each)
    POST /me/consents  {purpose, target, items, follow_versions, doc_id?, base_version?}   a new consent, or its next version
    POST /me/consents/{doc_id}/withdraw                 a new version, withdrawn: shares nothing from the next read on
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.kinds.govern_group import MAX_ITEMS
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation

router = APIRouter()
KIND = "govern.consent"


def _mine(session: dict[str, Any]) -> record_log.Owner:
    return record_log.person(session["identity_id"])


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except InvariantViolation as error:
        text = str(error)
        status = 404 if "NOT_FOUND" in text else 409 if "STALE" in text else 400
        raise HTTPException(status_code=status, detail=text) from error


class ConsentBody(BaseModel):
    purpose: str
    target: str
    items: list[dict[str, Any]] = []
    follow_versions: bool = True
    doc_id: str | None = None
    base_version: int | None = None


def _check(docs: CaseDocs, repo: ProjectSourceRepository, session: dict[str, Any], content: dict[str, Any]) -> None:
    """Every item names a document of a case the person opened (as main._project_or_404 decides: the case exists and its
    opener is them -- someone else's case and no case answer alike), of a case's kind, live; a pinned item names a
    version it has. A group consent names a group the person is in. Run inside the save (CaseDocs.save_many's check)."""
    tenant_id, me = session["tenant_id"], session["identity_id"]
    items = content["items"]
    if len(items) > MAX_ITEMS:
        raise InvariantViolation(f"CONSENT_ITEMS_INVALID: at most {MAX_ITEMS} documents in one consent")
    if content["purpose"] == "group" and repo.get_group_for(tenant_id, content["target"], me) is None:
        raise InvariantViolation("CONSENT_TARGET_NOT_FOUND: a consent for a group names a group you are in")
    for item in items:
        if not isinstance(item, dict) or set(item) - {"project_id", "kind", "doc_id", "version"} or not all(isinstance(item.get(key), str) for key in ("project_id", "kind", "doc_id")):
            raise InvariantViolation("CONSENT_ITEMS_INVALID: each item is {project_id, kind, doc_id, version?}")
        project = repo.get_project(tenant_id, item["project_id"])
        spec = doc_kinds.kinds().get(item["kind"])
        if project is None or project["created_by_identity_id"] != me or spec is None or spec.owner != "case":
            raise InvariantViolation(f"CONSENT_ITEM_NOT_FOUND: {item['doc_id']!r}")
        case = record_log.case(item["project_id"])
        if content["follow_versions"]:
            if not any(doc["doc_id"] == item["doc_id"] for doc in docs.current(tenant_id, case, item["kind"])):
                raise InvariantViolation(f"CONSENT_ITEM_NOT_FOUND: {item['doc_id']!r}")
        elif not any(doc["version"] == item.get("version") for doc in docs.versions(tenant_id, case, item["kind"], item["doc_id"])):
            raise InvariantViolation(f"CONSENT_ITEM_NOT_FOUND: {item['doc_id']!r} has no version {item.get('version')!r}")


@router.get("/me/consents")
def my_consents(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    return CaseDocs(repo).current(session["tenant_id"], _mine(session), KIND)


@router.post("/me/consents")
def save_consent(body: ConsentBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """The person themselves writes it (the session's own person record); a re-made consent after a withdrawal is its
    next version, not withdrawn."""
    docs = CaseDocs(repo)
    content = {"purpose": body.purpose, "target": body.target, "items": body.items, "follow_versions": body.follow_versions, "withdrawn": False}
    item = {"kind": KIND, "content": content, "doc_id": body.doc_id, "base_version": body.base_version if body.doc_id else None}
    [saved] = _call(docs.save_many, session["tenant_id"], _mine(session), [item], api._me(session, "GOVERN"), check=lambda: _check(docs, repo, session, content))
    return saved


@router.post("/me/consents/{doc_id}/withdraw")
def withdraw_consent(doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    docs = CaseDocs(repo)
    current = next((doc for doc in docs.current(session["tenant_id"], _mine(session), KIND) if doc["doc_id"] == doc_id), None)
    if current is None:
        raise HTTPException(status_code=404, detail=f"CONSENT_NOT_FOUND: {doc_id!r}")
    return _call(docs.save, session["tenant_id"], _mine(session), KIND, {**current["content"], "withdrawn": True}, api._me(session, "GOVERN"),
                 doc_id=doc_id, base_version=current["version"])
