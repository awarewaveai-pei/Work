"""Whether a page's subject is there for this person, without reading it: the web's middleware asks this on every page
load (apps/cognitive-web/lib/known-address.ts) so an unknown address answers HTTP 404 before the page streams -- it used
to GET the page's own read route, which reads the whole case or analysis a second time.

Each route answers 204 = there, or exactly the 404 its read route answers, from the same guard -- and depends on exactly
what that read route depends on (a session where it needs one, the method catalog only for a method), so it never tells
anyone more, and never fails where the read route would not (Codex aee2c44a F1/F2: one shared route made every kind
need a session and a loadable catalog).

    GET /exists/project/{id}           as GET /projects/{id}           main._project_or_404 (the case's owner)
    GET /exists/interpretation/{id}    as GET /interpretations/{id}    main._asked_interpretation_or_404 (any state)
    GET /exists/group/{id}             as GET /groups/{id}             groups.member_group (a current member)
    GET /exists/method/{id}            as GET /methods/{id}/form       MethodCatalog.is_resolvable (no session, like the form)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.groups import member_group
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog

router = APIRouter()
THERE = 204


@router.get("/exists/project/{project_id}", status_code=THERE)
def project_exists(project_id: str, session: dict[str, Any] = Depends(api.require_session),
                   repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> Response:
    api._project_or_404(repo, session, project_id)
    return Response(status_code=THERE)


@router.get("/exists/interpretation/{interpretation_id}", status_code=THERE)
def interpretation_exists(interpretation_id: str, session: dict[str, Any] = Depends(api.require_session),
                          repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> Response:
    api._asked_interpretation_or_404(repo, session, interpretation_id)
    return Response(status_code=THERE)


@router.get("/exists/group/{group_id}", status_code=THERE)
def group_exists(group_id: str, session: dict[str, Any] = Depends(api.require_session),
                 repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> Response:
    member_group(repo, session, group_id)
    return Response(status_code=THERE)


@router.get("/exists/method/{method_id}", status_code=THERE)
def method_exists(method_id: str, catalog: MethodCatalog = Depends(api.get_catalog)) -> Response:
    if not catalog.is_resolvable(method_id):   # the same check and body as GET /methods/{id}/form (main.method_form)
        raise HTTPException(status_code=404, detail=f"METHOD_RESOLUTION_BLOCKED: no ACTIVE contract for {method_id!r}")
    return Response(status_code=THERE)
