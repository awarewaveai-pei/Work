"""LEARN's reads across a case and across the person's cases (the card: 這一步讀這個案子的全部紀錄、你自己跨案子的歷程).

    GET  /projects/{project_id}/learn/moves          the thinking moves you made on your own in this case (成長九項; no score)
    POST /projects/{project_id}/learn/history        write this case's line into your own history (author: the platform)
    GET  /projects/{project_id}/learn/unused_blocks  the blocks this case has not used (問你哪一塊可能改變結果)
    GET  /me/learn/patterns                          habits that show up in more than one of your cases

The history line is the platform's, not the person's words: only this route writes it, so it carries what the records
show (the intensity you marked, whether you wrote 「沒有」, which moves, how many documents the AI wrote)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import case_owner
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.kinds.assembler import OPEN_BLOCKS
from ai_lego.core.domain.kinds.decide import wont_change
from ai_lego.core.domain.kinds.learn import PROPOSABLE, own_moves, pattern_hints
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository

router = APIRouter()


def case_records(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> dict[str, list[dict[str, Any]]]:
    """Every document of the case, by kind (current versions)."""
    found = {kind: docs.current(tenant_id, owner, kind) for kind, spec in doc_kinds.kinds().items() if spec.owner == "case"}
    return {kind: held for kind, held in found.items() if held}


def _history(docs: CaseDocs, tenant_id: str, identity_id: str) -> list[dict[str, Any]]:
    return docs.current(tenant_id, record_log.person(identity_id), "learn.history")


@router.get("/projects/{project_id}/learn/moves")
def moves(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    owner = case_owner(project_id, session, repo)
    docs = CaseDocs(repo)
    history = [entry["content"] for entry in _history(docs, session["tenant_id"], session["identity_id"])]
    return {"moves": own_moves(case_records(docs, session["tenant_id"], owner), history, project_id)}


@router.post("/projects/{project_id}/learn/history")
def write_history(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    owner = case_owner(project_id, session, repo)
    docs, tenant_id = CaseDocs(repo), session["tenant_id"]
    records = case_records(docs, tenant_id, owner)
    past = _history(docs, tenant_id, session["identity_id"])
    judgment = (records.get("decide.judgment") or [None])[-1]
    shown = own_moves(records, [entry["content"] for entry in past], project_id)
    everything = [doc for held in records.values() for doc in held]
    content = {
        "project": project_id,
        "judgment_version": judgment["version"] if judgment else None,
        "intensity": judgment["content"].get("intensity_now") if judgment else None,
        "wont_change": wont_change(judgment["content"].get("change_condition")) if judgment else None,
        "moves": [item["item"] for item in shown],
        "ai_docs": sum(1 for doc in everything if doc["author"] in ("ai", "joint")),
        "own_docs": sum(1 for doc in everything if doc["author"] == "user"),
    }
    content = {key: value for key, value in content.items() if value is not None}
    mine = next((entry for entry in past if entry["content"].get("project") == project_id), None)
    saved = docs.save(tenant_id, record_log.person(session["identity_id"]), "learn.history", content, record_log.system("LEARN"),
                      doc_id=mine["doc_id"] if mine else None, base_version=mine["version"] if mine else None)
    return {"entry": saved, "hints": pattern_hints([entry["content"] for entry in _history(docs, tenant_id, session["identity_id"])])}


@router.get("/projects/{project_id}/learn/unused_blocks")
def unused_blocks(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    owner = case_owner(project_id, session, repo)
    used = {doc_kinds.require(kind).block for kind in case_records(CaseDocs(repo), session["tenant_id"], owner)}
    if repo.list_sources(session["tenant_id"], project_id):
        used.add("GATHER")
    return {"unused": [{"code": block, "open": block in OPEN_BLOCKS} for block in PROPOSABLE if block not in used and block != "LEARN"]}


@router.get("/me/learn/patterns")
def patterns(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    entries = [entry["content"] for entry in _history(CaseDocs(repo), session["tenant_id"], session["identity_id"])]
    return {"hints": pattern_hints(entries), "cases": len(entries)}
