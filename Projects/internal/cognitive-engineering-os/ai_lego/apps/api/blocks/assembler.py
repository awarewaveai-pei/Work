"""組裝器 routes: the proposals the blocks made that the person has not answered yet (提議 -> 你同意才加), and the case's
route (畫面上顯示：現在在哪一塊、為什麼在這一塊、下一塊做什麼).

    GET /projects/{project_id}/proposals   every unanswered proposal of the case, oldest first, with whether the
                                           proposed block is open yet (a block not built yet is shown, never addable)
    GET /projects/{project_id}/route       the case's blocks in order with why each is there, which are open, and
                                           which of the 14 slots have something written (做過)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import case_owner
from ai_lego.core.domain.kinds.assembler import OPEN_BLOCKS
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform.block_hooks.assembler import case_route, proposals

router = APIRouter()


@router.get("/projects/{project_id}/proposals")
def open_proposals(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    docs = CaseDocs(repo)
    answered = {doc["content"]["proposal"] for doc in docs.current(session["tenant_id"], owner, "assembler.answer")}
    found = [
        {"type": "proposal", "doc_id": doc["doc_id"], "kind": doc["kind"], "by": doc["block"], "propose": doc["content"]["propose"], "why": doc["content"]["why"],
         "guardrail": bool(doc["content"].get("guardrail")), "open": doc["content"]["propose"] in OPEN_BLOCKS, "at": doc["created_at"]}
        for doc in proposals(docs, session["tenant_id"], owner) if doc["doc_id"] not in answered
    ]
    return sorted(found, key=lambda item: item["at"])


@router.get("/projects/{project_id}/route")
def route(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    return case_route(CaseDocs(repo), session["tenant_id"], case_owner(project_id, session, repo))
