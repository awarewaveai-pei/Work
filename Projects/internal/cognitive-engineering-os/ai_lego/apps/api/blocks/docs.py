"""A block's documents over HTTP, for every kind (core/domain/doc_kinds.py): the person's own writes only -- an AI
version is written by the AI gate (ai_gate.py), never posted here.

    GET    /projects/{project_id}/docs/{kind}                       current version of each document
    POST   /projects/{project_id}/docs/{kind}            {content}  a new document
    PUT    /projects/{project_id}/docs/{kind}/{doc_id}   {content, base_version}
    DELETE /projects/{project_id}/docs/{kind}/{doc_id}
    GET    /projects/{project_id}/docs/{kind}/{doc_id}/versions
    the same under /me/docs/{kind}... for a kind the person owns across cases (每天的校準卡、你在哪裡)

A save answers the document plus ``notices``: a crisis signal in what the person wrote (help for where they are --
every block that sees content recognises it; GOVERN gives the resources) and the blocks the saving block proposes.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import safety
from ai_lego.platform.block_hooks import after_save, before_save
from ai_lego.platform.block_hooks.govern import strings

router = APIRouter()


class DocBody(BaseModel):
    content: dict[str, Any]
    base_version: int | None = None


def _kind(kind: str, owner_kind: str) -> doc_kinds.DocKind:
    try:
        spec = doc_kinds.require(kind)
    except InvariantViolation as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    if spec.owner != owner_kind:
        raise HTTPException(status_code=404, detail=f"DOC_KIND_UNKNOWN: {kind!r} is not kept {'in a case' if owner_kind == 'case' else 'for you'}")
    return spec


def _status(error: InvariantViolation) -> int:
    text = str(error)
    return 404 if "NOT_FOUND" in text else 409 if "STALE" in text or "SINGLETON" in text or "ALREADY" in text or "VERSION_NOT_CURRENT" in text else 403 if text.startswith("RECORD_") else 400


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except InvariantViolation as error:
        raise HTTPException(status_code=_status(error), detail=str(error)) from error


def _where(docs: CaseDocs, tenant_id: str, identity_id: str, owner: record_log.Owner) -> str | None:
    """Where the person is: the case's intake, else the account's 「你在哪裡」 (GOVERN reads only this, only for help)."""
    if owner.kind == "case":
        intake = docs.current(tenant_id, owner, "assembler.intake")
        if intake and intake[-1]["content"].get("you_are_in"):
            return intake[-1]["content"]["you_are_in"]
    location = docs.current(tenant_id, record_log.person(identity_id), "govern.location")
    return location[-1]["content"]["where"] if location else None


def _read_markers(content: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    clean = dict(content)
    found = "last_read_version" in clean
    clean.pop("last_read_version", None)
    sentences = clean.get("sentences")
    if isinstance(sentences, list):
        copied = []
        for sentence in sentences:
            if isinstance(sentence, dict):
                item = dict(sentence)
                found = found or "seen" in item
                item.pop("seen", None)
                copied.append(item)
            else:
                copied.append(sentence)
        clean["sentences"] = copied
    return clean, found


def _save(repo: ProjectSourceRepository, session: dict[str, Any], owner: record_log.Owner, spec: doc_kinds.DocKind, body: "DocBody", doc_id: str | None = None) -> dict[str, Any]:
    """Every person's save: the kind's own checks (block_hooks BEFORE_SAVE), the save, then notices. The checks run
    inside the save's write lock (CaseDocs.save_many): what they read -- a claim's current version, one live stance per
    card -- cannot change between the check and the write (Codex VERIFY r5 F2: a check outside it is a compare, not a set)."""
    if spec.kind == "express.sent":
        raise HTTPException(status_code=403, detail="EXPRESS_SENT_ROUTE_ONLY: use the send action after reading the current draft")
    content = dict(body.content)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    if spec.kind == "express.draft":
        content, has_read_marker = _read_markers(content)
        if doc_id is not None and has_read_marker:
            try:
                current = docs.versions(tenant_id, owner, spec.kind, doc_id)[-1]
            except InvariantViolation:
                current = None
            if current is not None and current["content"] == content:
                _call(docs.record_read, tenant_id, owner, spec.kind, doc_id, current["version"], api._me(session, spec.block))
                return _saved(repo, session, owner, current)
    item = {"kind": spec.kind, "content": content, "doc_id": doc_id, "base_version": body.base_version if doc_id else None}
    [saved] = _call(docs.save_many, tenant_id, owner, [item], api._me(session, spec.block), check=lambda: before_save(docs, tenant_id, owner, spec.kind, content, doc_id))
    return _saved(repo, session, owner, saved)


def _saved(repo: ProjectSourceRepository, session: dict[str, Any], owner: record_log.Owner, doc: dict[str, Any]) -> dict[str, Any]:
    docs = CaseDocs(repo)
    words = strings(doc["content"], keys=True)   # every word however deep, keys too: json fields (a map's layers) hold the person's words
    notices = [{"type": "crisis", "notice": safety.NOT_THERAPY, "resources": safety.resources(_where(docs, session["tenant_id"], session["identity_id"], owner))}] if safety.crisis_signal(*words) else []
    notices += _call(after_save, docs, session["tenant_id"], owner, doc)
    return {**doc, "notices": notices}


def case_owner(project_id: str, session: dict[str, Any], repo: ProjectSourceRepository) -> record_log.Owner:
    """The case, after the owner check every case route makes (main._project_or_404)."""
    api._project_or_404(repo, session, project_id)
    return record_log.case(project_id)


@router.get("/projects/{project_id}/docs/{kind}")
def list_case_docs(project_id: str, kind: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    _kind(kind, "case")
    return CaseDocs(repo).current(session["tenant_id"], owner, kind)


@router.post("/projects/{project_id}/docs/{kind}")
def create_case_doc(project_id: str, kind: str, body: DocBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    return _save(repo, session, case_owner(project_id, session, repo), _kind(kind, "case"), body)


@router.put("/projects/{project_id}/docs/{kind}/{doc_id}")
def update_case_doc(project_id: str, kind: str, doc_id: str, body: DocBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    return _save(repo, session, case_owner(project_id, session, repo), _kind(kind, "case"), body, doc_id)


@router.delete("/projects/{project_id}/docs/{kind}/{doc_id}")
def delete_case_doc(project_id: str, kind: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, str]:
    owner = case_owner(project_id, session, repo)
    spec = _kind(kind, "case")
    _call(CaseDocs(repo).delete, session["tenant_id"], owner, kind, doc_id, api._me(session, spec.block))
    return {"status": "deleted", "doc_id": doc_id}


@router.get("/projects/{project_id}/docs/{kind}/{doc_id}/versions")
def case_doc_versions(project_id: str, kind: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    _kind(kind, "case")
    return _call(CaseDocs(repo).versions, session["tenant_id"], owner, kind, doc_id)


@router.get("/me/docs/{kind}")
def list_my_docs(kind: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    _kind(kind, "person")
    return CaseDocs(repo).current(session["tenant_id"], record_log.person(session["identity_id"]), kind)


@router.post("/me/docs/{kind}")
def create_my_doc(kind: str, body: DocBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    return _save(repo, session, record_log.person(session["identity_id"]), _kind(kind, "person"), body)


@router.put("/me/docs/{kind}/{doc_id}")
def update_my_doc(kind: str, doc_id: str, body: DocBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    return _save(repo, session, record_log.person(session["identity_id"]), _kind(kind, "person"), body, doc_id)


@router.delete("/me/docs/{kind}/{doc_id}")
def delete_my_doc(kind: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, str]:
    spec = _kind(kind, "person")
    _call(CaseDocs(repo).delete, session["tenant_id"], record_log.person(session["identity_id"]), kind, doc_id, api._me(session, spec.block))
    return {"status": "deleted", "doc_id": doc_id}


@router.get("/me/docs/{kind}/{doc_id}/versions")
def my_doc_versions(kind: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    _kind(kind, "person")
    return _call(CaseDocs(repo).versions, session["tenant_id"], record_log.person(session["identity_id"]), kind, doc_id)
