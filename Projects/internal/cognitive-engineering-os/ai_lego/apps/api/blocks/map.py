"""MAP's routes, besides the generic ones (/docs, /ai):

    GET /blocks/map/spec                       the six layers, the claim kinds, the 「解不了的局」 questions -- what the page shows
    GET /projects/{project_id}/map/methods     the tools a person can pick as a 拆法, each marked used / not used in this case
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import case_owner
from ai_lego.core.domain.kinds.map import spec
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform.ai_actions.map import map_tools
from ai_lego.platform.block_hooks.map import methods_used

router = APIRouter()


@router.get("/blocks/map/spec")
def map_spec(session: dict[str, Any] = Depends(api.require_session)) -> dict[str, Any]:
    return spec()


@router.get("/projects/{project_id}/map/methods")
def map_methods(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    used = methods_used(CaseDocs(repo), session["tenant_id"], owner)
    return [{"method_id": method_id, **tool, "used": method_id in used} for method_id, tool in map_tools().items()]
