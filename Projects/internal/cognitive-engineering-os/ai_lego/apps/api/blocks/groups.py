"""Groups (docs/platform/STEP34_SHARED_RULES.md §2): what holds a few people who write together. What they write is each
block's own (COLLAB onward), saved through CaseDocs with ``record_log.group(id)`` and read through platform/visibility.py.

    POST   /groups                     {name, purpose, workspace_id?}   a new group; whoever makes it is its convener
    GET    /groups                                                       the groups the person is in now
    GET    /groups/{id}                                                  the group and its current members
    POST   /groups/{id}/leave                                            G3: what they wrote stays; G5: not the last convener
    POST   /groups/{id}/members/{identity_id}/convener                   a convener makes another member a convener (G5)
    POST   /groups/{id}/close                                            convener only: nothing new is written after
    DELETE /groups/{id}                                                  convener only: G4, every record of the group goes

Every route resolves membership first. A group that is not there, one that was erased and one the person is not (or no
longer) in all answer the same 404 with the same body (G2): a group's existence is never disclosed to someone outside it.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation, group_gone
from ai_lego.platform.identity.store import IdentityStore

router = APIRouter()


def not_found(group_id: str) -> HTTPException:
    """The one answer for a group someone cannot reach, whatever the reason (G2)."""
    return HTTPException(status_code=404, detail=f"GROUP_NOT_FOUND: {group_id!r}")


def _status(text: str) -> int:
    if text.startswith("GROUP_CONVENER_ONLY"):
        return 403
    if text.startswith("GROUP_MEMBER_NOT_FOUND"):
        return 404
    if text.startswith(("GROUP_CLOSED", "GROUP_LAST_CONVENER", "GROUP_ALREADY_MEMBER", "IDENTITY_ERASED")):
        return 409
    return 400


def call(group_id: str, fn, *args, **kwargs):
    """A repository call for one group: gone or not a member = ``not_found``; anything else keeps its code."""
    try:
        return fn(*args, **kwargs)
    except InvariantViolation as error:
        if group_gone(error):
            raise not_found(group_id) from None
        raise HTTPException(status_code=_status(str(error)), detail=str(error)) from error


def member_group(repo: ProjectSourceRepository, session: dict[str, Any], group_id: str) -> dict[str, Any]:
    """The group, for a current member of it; ``not_found`` otherwise. Every group route starts here."""
    group = repo.get_group_for(session["tenant_id"], group_id, session["identity_id"])
    if group is None:
        raise not_found(group_id)
    return group


class CreateGroupBody(BaseModel):
    name: str
    purpose: str
    workspace_id: str | None = None


@router.post("/groups")
def create_group(body: CreateGroupBody, session: dict[str, Any] = Depends(api.require_session), store: IdentityStore = Depends(api.get_store),
                 repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    tenant_id = session["tenant_id"]
    workspace_id = body.workspace_id
    if workspace_id is None:   # as a case does: the tenant's one workspace, else it must be named
        workspaces = store.list_workspaces(tenant_id)
        if len(workspaces) != 1:
            raise HTTPException(status_code=400, detail="GROUP_WORKSPACE_REQUIRED: name the workspace the group belongs to")
        workspace_id = workspaces[0]["workspace_id"]
    elif store.get_workspace(tenant_id, workspace_id) is None:
        raise HTTPException(status_code=404, detail=f"WORKSPACE_NOT_FOUND: {workspace_id!r}")
    try:
        return repo.create_group(tenant_id, workspace_id, body.purpose, body.name, session["identity_id"])
    except InvariantViolation as error:
        raise HTTPException(status_code=_status(str(error)), detail=str(error)) from error


@router.get("/groups")
def list_groups(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    return repo.list_groups_for(session["tenant_id"], session["identity_id"])


@router.get("/groups/{group_id}")
def get_group(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    group = member_group(repo, session, group_id)
    return {**group, "members": repo.group_members(session["tenant_id"], group_id)}


@router.post("/groups/{group_id}/leave")
def leave_group(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    member_group(repo, session, group_id)
    call(group_id, repo.leave_group, session["tenant_id"], group_id, session["identity_id"])
    return {"group_id": group_id, "left": True}


@router.post("/groups/{group_id}/members/{identity_id}/convener")
def hand_over(group_id: str, identity_id: str, session: dict[str, Any] = Depends(api.require_session),
              repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    member_group(repo, session, group_id)
    call(group_id, repo.hand_over, session["tenant_id"], group_id, session["identity_id"], identity_id)
    return {"group_id": group_id, "members": repo.group_members(session["tenant_id"], group_id)}


@router.post("/groups/{group_id}/close")
def close_group(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    member_group(repo, session, group_id)
    return call(group_id, repo.close_group, session["tenant_id"], group_id, session["identity_id"])


@router.delete("/groups/{group_id}")
def erase_group(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    member_group(repo, session, group_id)
    return {"group_id": group_id, "erased": call(group_id, repo.erase_group, session["tenant_id"], group_id, session["identity_id"])}
