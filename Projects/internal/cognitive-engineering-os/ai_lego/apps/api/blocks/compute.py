"""COMPUTE's routes, besides the generic ones (/docs for the request and 採不採用 -- saving a request runs it -- and /ai):

    GET /blocks/compute/spec                 the algorithms (ruleset compute.algorithms, its version and keeper), the words
    GET /projects/{project_id}/compute/runs  every run (evidence.calc_results) with where each number comes from and the
                                             sentence that keeps the result no surer than its weakest number
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.docs import case_owner
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform.block_hooks.compute import case_runs, spec

router = APIRouter()


@router.get("/blocks/compute/spec")
def compute_spec(session: dict[str, Any] = Depends(api.require_session)) -> dict[str, Any]:
    return spec()


@router.get("/projects/{project_id}/compute/runs")
def compute_runs(project_id: str, session: dict[str, Any] = Depends(api.require_session),
                 repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    owner = case_owner(project_id, session, repo)
    return case_runs(CaseDocs(repo), session["tenant_id"], owner)
