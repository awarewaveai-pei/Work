"""EXPRESS routes beyond the generic document and AI routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import DocBody, _kind, _save, case_owner
from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform.block_hooks import before_save
from ai_lego.platform.block_hooks.express import outline_for_selection, require_current_draft_version
from ai_lego.platform.exports import render_markdown, render_pdf, render_text
from ai_lego.platform.rulesets.express import FORMATS


router = APIRouter()


class SendBody(BaseModel):
    version: int = Field(ge=1)
    to: str = Field(min_length=1, max_length=1000)
    acknowledge_unchecked: bool = False


def _draft(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, draft_id: str) -> dict[str, Any]:
    try:
        return docs.versions(tenant_id, owner, "express.draft", draft_id)[-1]
    except InvariantViolation as error:
        raise HTTPException(status_code=404, detail=f"EXPRESS_DRAFT_NOT_FOUND: {draft_id!r}") from error


def _disclosure_lines(content: dict[str, Any]) -> tuple[list[str], list[str]]:
    confidence: list[str] = []
    uncertainty: list[str] = []
    for key in ("confidence_text", "confidence"):
        value = content.get(key)
        if isinstance(value, str) and value.strip() and value not in confidence:
            confidence.append(value)
        elif key == "confidence" and isinstance(value, (int, float)) and not isinstance(value, bool):
            line = f"信心：{value}%"
            if line not in confidence:
                confidence.append(line)
    for key in ("uncertainty_text", "uncertainty", "open_uncertainties", "uncertainties"):
        value = content.get(key)
        values = value if isinstance(value, list) else [value]
        for item in values:
            if isinstance(item, str) and item.strip() and item not in uncertainty:
                uncertainty.append(item)
    return confidence, uncertainty


def _export_draft(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, draft: dict[str, Any]) -> dict[str, Any]:
    """Carry the person's disclosures from the draft's own source refs into every format."""
    confidence, uncertainty = _disclosure_lines(draft["content"])
    refs = {(ref["kind"], ref["doc_id"]) for sentence in draft["content"]["sentences"] for ref in sentence["refs"]}
    for kind, doc_id in sorted(refs):
        current = next((doc for doc in docs.current(tenant_id, owner, kind) if doc["doc_id"] == doc_id), None)
        if current is None:
            continue
        found_confidence, found_uncertainty = _disclosure_lines(current["content"])
        confidence.extend(line for line in found_confidence if line not in confidence)
        uncertainty.extend(line for line in found_uncertainty if line not in uncertainty)
    return {**draft, "confidence_lines": confidence, "uncertainty_lines": uncertainty}


def _export_response(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, draft: dict[str, Any], fmt: str, *, prepared: bool = False) -> Response:
    if fmt not in {"md", "txt", "text", "plain", "pdf"}:
        raise HTTPException(status_code=400, detail=f"EXPRESS_EXPORT_FORMAT_INVALID: {fmt!r}")
    export_draft = draft if prepared else _export_draft(docs, tenant_id, owner, draft)
    rendered = {"md": render_markdown, "txt": render_text, "text": render_text, "plain": render_text, "pdf": render_pdf}[fmt](export_draft)
    extension = "txt" if fmt in {"txt", "text", "plain"} else fmt
    media = "application/pdf" if fmt == "pdf" else "text/markdown; charset=utf-8" if fmt == "md" else "text/plain; charset=utf-8"
    return Response(content=rendered, media_type=media, headers={"Content-Disposition": f'attachment; filename="express-draft-v{draft["version"]}.{extension}"'})


def _has_unread_sentence(draft: dict[str, Any], read_version: int | None) -> bool:
    content = draft["content"]
    if read_version != draft["version"]:
        return True
    return any(sentence.get("seen") is not True for sentence in content["sentences"])


def _has_unchecked_sentence(draft: dict[str, Any]) -> bool:
    return any(sentence.get("unchecked") is True for sentence in draft["content"]["sentences"])


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


@router.get("/projects/{project_id}/express/drafts/{draft_id}")
def read_draft(project_id: str, draft_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    owner = case_owner(project_id, session, repo)
    docs = CaseDocs(repo)
    draft = _draft(docs, session["tenant_id"], owner, draft_id)
    try:
        docs.record_read(session["tenant_id"], owner, "express.draft", draft_id, draft["version"], api._me(session, "EXPRESS"))
    except InvariantViolation as error:
        if str(error).startswith("DOC_READ_STALE"):
            raise HTTPException(status_code=409, detail="稿子在讀取時有新版本，請重新讀一次。") from error
        raise HTTPException(status_code=404, detail=f"EXPRESS_DRAFT_NOT_FOUND: {draft_id!r}") from error
    return {**draft, "content": {**draft["content"], "last_read_version": draft["version"]}}


@router.get("/projects/{project_id}/express/drafts/{doc_id}/versions")
def draft_versions(project_id: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    return _versions(CaseDocs(repo), session["tenant_id"], owner, "express.draft", doc_id)


@router.post("/projects/{project_id}/express/drafts/{draft_id}/export")
def export_draft(project_id: str, draft_id: str, fmt: str = Query(default="md", alias="format"), session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> Response:
    owner = case_owner(project_id, session, repo)
    docs = CaseDocs(repo)
    return _export_response(docs, session["tenant_id"], owner, _draft(docs, session["tenant_id"], owner, draft_id), fmt)


@router.post("/projects/{project_id}/express/drafts/{draft_id}/send")
def send_draft(project_id: str, draft_id: str, body: SendBody, fmt: str = Query(default="md", alias="format"), session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> Response:
    owner = case_owner(project_id, session, repo)
    docs = CaseDocs(repo)
    _draft(docs, session["tenant_id"], owner, draft_id)  # Fast 404 before entering the atomic recheck.
    sent_kind = ".".join(("express", "sent"))
    if fmt not in {"md", "txt", "text", "plain", "pdf"}:
        raise HTTPException(status_code=400, detail=f"EXPRESS_EXPORT_FORMAT_INVALID: {fmt!r}")
    checked: dict[str, Any] = {}

    def check_current() -> None:
        try:
            current = docs.versions(session["tenant_id"], owner, "express.draft", draft_id)[-1]
        except InvariantViolation as error:
            raise InvariantViolation(f"EXPRESS_SEND_DRAFT_NOT_FOUND: {draft_id!r}") from error
        try:
            require_current_draft_version(current["version"], body.version)
        except InvariantViolation as error:
            raise InvariantViolation(f"EXPRESS_SEND_VERSION_STALE: current={current['version']}") from error
        read_version = docs.last_read_version(session["tenant_id"], owner, "express.draft", draft_id, session["identity_id"])
        if _has_unread_sentence(current, read_version):
            raise InvariantViolation("EXPRESS_SEND_READ_REQUIRED: 稿子有新內容或還沒讀過，請重新讀一次再送。")
        if _has_unchecked_sentence(current) and not body.acknowledge_unchecked:
            raise InvariantViolation("EXPRESS_SEND_ACK_REQUIRED: 稿子裡還有還沒查證的句子，確定要送？")
        checked["draft"] = _export_draft(docs, session["tenant_id"], owner, current)
        before_save(docs, session["tenant_id"], owner, sent_kind, {"draft": draft_id, "version": body.version, "to": body.to})

    try:
        docs.save_many(
            session["tenant_id"], owner,
            [{"kind": sent_kind, "content": {"draft": draft_id, "version": body.version, "to": body.to}}],
            api._me(session, "EXPRESS"), check=check_current,
        )
    except InvariantViolation as error:
        message = str(error)
        if message.startswith("EXPRESS_SEND_VERSION_STALE"):
            current_version = message.split("=", 1)[1]
            raise HTTPException(status_code=409, detail=f"版本不對。稿子現在是第 {current_version} 版，請重新讀一次再送。") from error
        if message.startswith("EXPRESS_SEND_READ_REQUIRED") or message.startswith("EXPRESS_SEND_ACK_REQUIRED"):
            raise HTTPException(status_code=409, detail=message.split(": ", 1)[1]) from error
        if message.startswith("EXPRESS_SEND_DRAFT_NOT_FOUND"):
            raise HTTPException(status_code=404, detail=message) from error
        raise
    response = _export_response(docs, session["tenant_id"], owner, checked["draft"], fmt, prepared=True)
    return response


@router.get("/projects/{project_id}/express/formats")
def formats(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    case_owner(project_id, session, repo)
    return FORMATS.stamp() | {"formats": FORMATS.items}
