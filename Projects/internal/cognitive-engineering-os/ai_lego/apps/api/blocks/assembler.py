"""組裝器 routes: the proposals the blocks made that the person has not answered yet (提議 -> 你同意才加).

    GET /projects/{project_id}/proposals   every unanswered proposal of the case, oldest first, with whether the
                                           proposed block is open yet (a block not built yet is shown, never addable)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import case_owner
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.kinds.assembler import OPEN_BLOCKS
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository

router = APIRouter()
PROPOSAL = "assembler.proposal."


@router.get("/projects/{project_id}/proposals")
def open_proposals(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    docs = CaseDocs(repo)
    answered = {doc["content"]["proposal"] for doc in docs.current(session["tenant_id"], owner, "assembler.answer")}
    found = [
        {"type": "proposal", "doc_id": doc["doc_id"], "kind": kind, "by": doc["block"], "propose": doc["content"]["propose"], "why": doc["content"]["why"],
         "guardrail": bool(doc["content"].get("guardrail")), "open": doc["content"]["propose"] in OPEN_BLOCKS, "at": doc["created_at"]}
        for kind in sorted(doc_kinds.kinds()) if kind.startswith(PROPOSAL)
        for doc in docs.current(session["tenant_id"], owner, kind) if doc["doc_id"] not in answered
    ]
    return sorted(found, key=lambda item: item["at"])
