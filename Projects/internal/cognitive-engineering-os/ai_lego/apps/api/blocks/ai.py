"""A block's AI turn over HTTP (ai_lego/platform/ai_gate.py does the checks and the saving).

    POST /projects/{project_id}/ai/{block}/{action}   {context, doc_id?, base_version?}
    POST /me/ai/{block}/{action}                      the same with no case (only actions the card allows outside one)

200 {"saved": doc} -- the AI's answer, saved as an AI-authored document;
200 {"stopped": "crisis", "notice", "resources"} -- a crisis signal: no model call;
403 AI_PERMISSION_DENIED -- the 協作合約 does not grant what the action needs.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.apps.api.main import _MeteredProvider
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiRefused, actions, ask_ai
from ai_lego.platform.identity.store import IdentityStore

router = APIRouter()


class AiBody(BaseModel):
    context: dict[str, Any] = {}
    doc_id: str | None = None
    base_version: int | None = None


def _turn(block: str, action_name: str, project_id: str | None, body: AiBody, session: dict[str, Any], repo: ProjectSourceRepository, store: IdentityStore, provider: Any) -> dict[str, Any]:
    action = actions().get((block, action_name))
    if action is None:
        raise HTTPException(status_code=404, detail=f"AI_ACTION_UNKNOWN: {block}.{action_name}")
    if project_id is not None:
        api._project_or_404(repo, session, project_id)
    metered = _MeteredProvider(api._require_ai(provider, store, session), store, session, f"block:{block}.{action_name}")
    try:
        return ask_ai(action, tenant_id=session["tenant_id"], identity_id=session["identity_id"], project_id=project_id, context=body.context,
                      docs=CaseDocs(repo), provider=metered, doc_id=body.doc_id, base_version=body.base_version)
    except AiRefused as refusal:
        raise HTTPException(status_code=403, detail=str(refusal)) from refusal
    except InvariantViolation as error:
        text = str(error)
        status = 429 if text.startswith("AI_BUDGET") or "budget" in text.lower() else 409 if "STALE" in text or "SINGLETON" in text else 502 if text.startswith(("AI_ANSWER", "AI_PROVIDER")) else 400
        raise HTTPException(status_code=status, detail=text) from error


@router.post("/projects/{project_id}/ai/{block}/{action_name}")
def case_ai_turn(project_id: str, block: str, action_name: str, body: AiBody, session: dict[str, Any] = Depends(api.require_session),
                 repo: ProjectSourceRepository = Depends(api.get_project_source_repository), store: IdentityStore = Depends(api.get_store),
                 provider: Any = Depends(api.get_ai_provider)) -> dict[str, Any]:
    return _turn(block, action_name, project_id, body, session, repo, store, provider)


@router.post("/me/ai/{block}/{action_name}")
def my_ai_turn(block: str, action_name: str, body: AiBody, session: dict[str, Any] = Depends(api.require_session),
               repo: ProjectSourceRepository = Depends(api.get_project_source_repository), store: IdentityStore = Depends(api.get_store),
               provider: Any = Depends(api.get_ai_provider)) -> dict[str, Any]:
    return _turn(block, action_name, None, body, session, repo, store, provider)
