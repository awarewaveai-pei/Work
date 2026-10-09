"""Groups (docs/platform/STEP34_SHARED_RULES.md §2): what holds a few people who write together. What they write is each
block's own (COLLAB onward), saved through CaseDocs with ``record_log.group(id)`` and read through platform/visibility.py.

    POST   /groups                     {name, purpose, workspace_id?}   a new group; whoever makes it is its convener
    GET    /groups                                                       the groups the person is in now
    GET    /groups/{id}                                                  the group and its current members
    POST   /groups/{id}/leave                                            G3: what they wrote stays; G5: not the last convener
    POST   /groups/{id}/members/{identity_id}/convener                   a convener makes another member a convener (G5)
    POST   /groups/{id}/close                                            convener only: nothing new is written after
    DELETE /groups/{id}                                                  convener only: G4, every record of the group goes
    POST   /groups/{id}/invites        {role?}                           a one-time link's token, shown in this answer only
    GET    /groups/{id}/invites                                          convener: the open invitations, never a token
    DELETE /groups/{id}/invites/{invite_id}                              the inviter or a convener
    POST   /invites/accept             {token, email?, display_name?, password?}   signed in: join; a visitor: a new account
    POST   /groups/{id}/members/{identity_id}/confirm                    convener: a member held for review (§4) is let in

Every route resolves membership first. A group that is not there, one that was erased and one the person is not (or no
longer) in all answer the same 404 with the same body (G2): a group's existence is never disclosed to someone outside it.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Cookie, Depends, HTTPException
from psycopg.errors import UniqueViolation
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation, group_gone
from ai_lego.platform.identity.store import IdentityStore

router = APIRouter()


def not_found(group_id: str) -> HTTPException:
    """The one answer for a group someone cannot reach, whatever the reason (G2)."""
    return HTTPException(status_code=404, detail=f"GROUP_NOT_FOUND: {group_id!r}")


HELD_YOU = "你的加入還在等召集人確認。確認之前，你看不到別人寫的東西，你的意見也還不算進大家的看法。"
HELD_FOR_CONVENER = "這個帳號還在等你確認：同一個人在一天內邀請了很多人加入。確認之前，他看不到別人寫的東西。"


def _status(text: str) -> int:
    if text.startswith(("GROUP_CONVENER_ONLY", "GROUP_INVITE_NOT_ALLOWED", "GROUP_FACILITATOR_NOT_TRAINED")):
        return 403
    if text.startswith(("GROUP_MEMBER_NOT_FOUND", "GROUP_INVITE_NOT_FOUND")):
        return 404
    if text.startswith(("GROUP_INVITES_TOO_MANY", "GROUP_INVITES_PER_DAY")):
        return 429
    if text.startswith(("GROUP_CLOSED", "GROUP_LAST_CONVENER", "GROUP_ALREADY_MEMBER", "GROUP_MEMBER_HELD", "IDENTITY_ERASED")):
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
    members = repo.group_members(session["tenant_id"], group_id)
    if group["my_role"] == "convener":   # the held state, in words, to the convener and to the held person (§4)
        members = [{**member, "notice": HELD_FOR_CONVENER} if member["review_state"] == "pending_review" else member for member in members]
    held = {"held_notice": HELD_YOU} if group["my_review_state"] == "pending_review" else {}
    return {**group, **held, "members": members}


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


class InviteBody(BaseModel):
    role: str = "participant"


@router.post("/groups/{group_id}/invites")
def create_invite(group_id: str, body: InviteBody | None = None, session: dict[str, Any] = Depends(api.require_session), store: IdentityStore = Depends(api.get_store),
                  repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """The answer holds the token: the only time it exists outside the inviter's copy (only its sha256 is kept)."""
    member_group(repo, session, group_id)
    return call(group_id, store.create_invite, session["tenant_id"], group_id, session["identity_id"], (body or InviteBody()).role)


@router.get("/groups/{group_id}/invites")
def list_invites(group_id: str, session: dict[str, Any] = Depends(api.require_session), store: IdentityStore = Depends(api.get_store),
                 repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    member_group(repo, session, group_id)
    return call(group_id, store.list_invites, session["tenant_id"], group_id, session["identity_id"])


@router.delete("/groups/{group_id}/invites/{invite_id}")
def revoke_invite(group_id: str, invite_id: str, session: dict[str, Any] = Depends(api.require_session), store: IdentityStore = Depends(api.get_store),
                  repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    member_group(repo, session, group_id)
    call(group_id, store.revoke_invite, session["tenant_id"], group_id, invite_id, session["identity_id"])
    return {"invite_id": invite_id, "revoked": True}


class AcceptBody(BaseModel):
    token: str
    email: str | None = None
    display_name: str | None = None
    password: str | None = None


@router.post("/invites/accept")
def accept_invite(body: AcceptBody, cognitive_os_session: str | None = Cookie(default=None), store: IdentityStore = Depends(api.get_store)) -> dict[str, Any]:
    """Signed in: that person joins (same tenant only). Otherwise a visitor: a new account in the invitation's tenant.
    Every refusal of the invitation itself is one 404 with one body (IdentityStore.INVITE_REFUSED)."""
    session = store.resolve_session(cognitive_os_session) if cognitive_os_session else None
    visitor = None
    if session is None:
        if not (body.email and body.display_name and body.password):
            raise HTTPException(status_code=400, detail="INVITE_VISITOR_FIELDS_REQUIRED: email, display name and password make the new account")
        visitor = {"email": body.email.strip().lower(), "display_name": body.display_name.strip(), "password": body.password}
    try:
        return store.accept_invite(body.token, identity=session, visitor=visitor)
    except InvariantViolation as error:
        text = str(error)
        if text == IdentityStore.INVITE_REFUSED:
            raise HTTPException(status_code=404, detail=text) from None
        raise HTTPException(status_code=_status(text), detail=text) from None
    except UniqueViolation:
        raise HTTPException(status_code=409, detail="IDENTITY_EMAIL_TAKEN: this address already has an account here; sign in, then open the link again") from None


@router.post("/groups/{group_id}/members/{identity_id}/confirm")
def confirm_member(group_id: str, identity_id: str, session: dict[str, Any] = Depends(api.require_session), store: IdentityStore = Depends(api.get_store),
                   repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    member_group(repo, session, group_id)
    call(group_id, store.confirm_member, session["tenant_id"], group_id, session["identity_id"], identity_id)
    return {"group_id": group_id, "identity_id": identity_id, "review_state": "confirmed"}
