"""FACILITATE 帶領 over HTTP (docs/platform/STEP34_SHARED_RULES.md §5, §9, §11; cards 60-61). A leader's log and a supervisor's
feedback are saved through the generic ``/me/docs/{kind}`` routes (checks: platform/block_hooks/facilitate.py); the AI
partner through ``/me/ai/FACILITATE/{action}``. What is here is everything that reads or links more than one person, each
through platform/visibility.py -- nothing below reads another person's record itself.

    GET    /blocks/facilitate/scripts                          the scripts, the fixed don't-list, which may lead
    GET    /facilitate/me                                      am I an eligible facilitator / supervisor (derived, now)
    GET    /facilitate/supervisors                             my own links as a leader (any state) and whether each stands
    POST   /facilitate/supervisors        {email}              I found a supervisor (assigned_by self)
    DELETE /facilitate/supervisors/{doc_id}                    take back a link I wrote
    GET    /facilitate/supervisees                             the leaders I supervise now
    GET    /facilitate/supervisees/{identity_id}/logs          their logs -- and nothing else of theirs
    GET    /facilitate/supervisees/{identity_id}/appeals       the appeals about them, masked (GOVERN's masking)
    GET    /facilitate/feedback                                what supervisors wrote about me
    GET    /groups/{id}/facilitate/consented                   a facilitator: what members consented to show, by who
    POST   /groups/{id}/facilitate/stop   {participant?}       a participant wants to stop: the escalation's help for where they are
    GET    /groups/{id}/facilitate/assignments                 the unit's links: the convener's all, a leader's own
    POST   /groups/{id}/facilitate/assignments {supervisee, email}   the convener assigns a supervisor to a leader of the group
    DELETE /groups/{id}/facilitate/assignments/{doc_id}        the convener takes it back

A person who is not the group's member, a supervisee who is not yours and one that does not exist all get the same 404.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.apps.api.blocks.groups import member_group, not_found
from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import safety, visibility
from ai_lego.platform.catalog.display_catalog import load_catalog
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.scripts import FACIL_DONTS, load_scripts, usable_for_leading
from ai_lego.platform.visibility import Viewer

router = APIRouter()
BLOCK = "FACILITATE"
LINK = visibility.SUPERVISION_LINK
LEFT = "已離開的人"


def _viewer(session: dict[str, Any]) -> Viewer:
    return Viewer(session["tenant_id"], session["identity_id"])


def _platform(session: dict[str, Any]) -> record_log.Owner:
    """Where the links live (the tenant's, like an appeal): written only after the checks of the route that calls this."""
    return record_log.platform(session["tenant_id"])


def _name(store: IdentityStore, identity_id: str) -> str:
    found = store.get_identity(identity_id)
    return LEFT if found is None or found["status"] != "active" else found["display_name"]


def _missing() -> HTTPException:
    return HTTPException(status_code=404, detail="FACILITATE_SUPERVISEE_NOT_FOUND: nobody you supervise has that id")


def _no_supervisor() -> HTTPException:
    """The one answer for every refusal to name a supervisor (no such person, not trained, never led, or the asker may not name one)."""
    return HTTPException(status_code=404, detail="FACILITATE_SUPERVISOR_NOT_FOUND: nobody with that address can supervise yet")


def _supervisor_by_email(store: IdentityStore, docs: CaseDocs, session: dict[str, Any], email: str, supervisee_id: str) -> str:
    """Whom an email names, if they are an eligible supervisor now and not the leader themself; else the one 404: it does
    not tell who has an account."""
    found = store.identity_by_email(session["tenant_id"], email.strip().lower())
    if found is None or found["identity_id"] == supervisee_id or not visibility.is_eligible_supervisor(docs, Viewer(session["tenant_id"], found["identity_id"])):
        raise _no_supervisor()
    return found["identity_id"]


def _link(repo: ProjectSourceRepository, session: dict[str, Any], content: dict[str, Any]) -> dict[str, Any]:
    """Write one link, or return the same live one already there. Nothing locks the platform's records: what a link grants is
    decided again on every read (visibility.py), so a race writes a link that stands only while its parts do."""
    docs = CaseDocs(repo)
    existing = visibility.existing_link(docs, session["tenant_id"], content)
    if existing is not None:
        return {"doc_id": existing, "already": True}
    try:
        [saved] = docs.save_many(session["tenant_id"], _platform(session), [{"kind": LINK, "content": content}], api._me(session, BLOCK))
    except InvariantViolation as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"doc_id": saved["doc_id"], "already": False}


def _delete_link(repo: ProjectSourceRepository, session: dict[str, Any], doc_id: str, assigned_by: str, group_id: str = "") -> dict[str, str]:
    """Only the person who wrote it takes a link back, and only through its own door: a leader's own (self) or the unit's of
    this group. Not there, not theirs, another kind's or another group's: one 404."""
    docs = CaseDocs(repo)
    gone = HTTPException(status_code=404, detail="FACILITATE_LINK_NOT_FOUND: no link of yours has that id")
    if not visibility.writes_link(docs, _viewer(session), doc_id, assigned_by, group_id):
        raise gone
    try:   # CaseDocs re-checks the sole writer under the lock (DOC_NOT_YOURS)
        docs.delete(session["tenant_id"], _platform(session), LINK, doc_id, api._me(session, BLOCK))
    except InvariantViolation as error:
        raise gone from error
    return {"status": "deleted", "doc_id": doc_id}


# -- content ----------------------------------------------------------------------------------------------------------

@router.get("/blocks/facilitate/scripts")
def script_list(session: dict[str, Any] = Depends(api.require_session)) -> dict[str, Any]:
    """Every script (a draft is shown as one), the card's four fixed don'ts, and for each whether it may lead and why not."""
    ruleset, usable, methods = load_scripts(), {item["id"] for item in usable_for_leading()}, load_catalog().methods
    shown = []
    for item in ruleset.items:
        why_not = "" if item["id"] in usable else "草稿" if item["state"] == "draft" else "沒有停止訊號"
        shown.append({**item, "subject_name": methods.get(item["subject"], {}).get("name_zh", item["subject"]), "usable": not why_not, "why_not": why_not})
    return {"donts": list(FACIL_DONTS), "scripts": shown, "version": ruleset.stamp()["version"]}


@router.get("/facilitate/me")
def my_standing(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, bool]:
    docs, viewer = CaseDocs(repo), _viewer(session)
    return {"facilitator": visibility.is_eligible_facilitator(docs, viewer), "supervisor": visibility.is_eligible_supervisor(docs, viewer)}


# -- a leader's supervisors ---------------------------------------------------------------------------------------------

@router.get("/facilitate/supervisors")
def my_supervisors(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                   store: IdentityStore = Depends(api.get_store)) -> list[dict[str, Any]]:
    return [{**item, "supervisor_name": _name(store, item["supervisor"])} for item in visibility.supervisors_of(CaseDocs(repo), _viewer(session))]


class SupervisorBody(BaseModel):
    email: str


@router.post("/facilitate/supervisors")
def find_supervisor(body: SupervisorBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                    store: IdentityStore = Depends(api.get_store)) -> dict[str, Any]:
    docs, me_id = CaseDocs(repo), session["identity_id"]
    if not visibility.leads_a_group(docs, repo, _viewer(session)):   # only a leader names a supervisor: anyone else gets the answer of an address that fits nobody
        raise _no_supervisor()
    supervisor = _supervisor_by_email(store, docs, session, body.email, me_id)
    return _link(repo, session, {"supervisee": me_id, "supervisor": supervisor, "assigned_by": "self"})


@router.delete("/facilitate/supervisors/{doc_id}")
def drop_supervisor(doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, str]:
    return _delete_link(repo, session, doc_id, "self")


# -- a supervisor's side --------------------------------------------------------------------------------------------------

@router.get("/facilitate/supervisees")
def my_supervisees(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                   store: IdentityStore = Depends(api.get_store)) -> list[dict[str, Any]]:
    return [{**item, "name": _name(store, item["supervisee"])} for item in visibility.supervisees(CaseDocs(repo), _viewer(session))]


@router.get("/facilitate/supervisees/{identity_id}/logs")
def supervisee_logs(identity_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    logs = visibility.supervisee_logs(CaseDocs(repo), _viewer(session), identity_id)
    if logs is None:
        raise _missing()
    return [{"doc_id": log["doc_id"], "version": log["version"], "content": log["content"], "at": log["at"]} for log in logs]


@router.get("/facilitate/supervisees/{identity_id}/appeals")
def supervisee_appeals(identity_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                       store: IdentityStore = Depends(api.get_store)) -> list[dict[str, Any]]:
    docs, viewer = CaseDocs(repo), _viewer(session)
    if not visibility.supervises(docs, viewer, identity_id):
        raise _missing()
    return [item for item in visibility.appeals_for(docs, store, viewer) if not item.get("mine") and item["about_identity_id"] == identity_id]


@router.get("/facilitate/feedback")
def my_feedback(session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                store: IdentityStore = Depends(api.get_store)) -> list[dict[str, Any]]:
    return [{**item, "supervisor_name": _name(store, item["supervisor"])} for item in visibility.feedback_for(CaseDocs(repo), _viewer(session))]


# -- inside one group ----------------------------------------------------------------------------------------------------

def _leader_group(repo: ProjectSourceRepository, session: dict[str, Any], group_id: str) -> dict[str, Any]:
    """A member of the group who leads it now: a facilitator of it who is still an eligible one (visibility.is_leader_of)."""
    group = member_group(repo, session, group_id)
    if not visibility.is_leader_of(CaseDocs(repo), _viewer(session), group_id):
        raise HTTPException(status_code=403, detail="FACILITATE_LEADER_ONLY: only a facilitator of this group who has finished the leader course leads it")
    return group


@router.get("/groups/{group_id}/facilitate/consented")
def consented(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """What this group's participants consented to show their facilitator, grouped by who (visibility.shared_with: only the
    items a live consent names, only while the facilitator is an eligible one) -- and who named this facilitator as the one
    who led a case of theirs. A participant who shared nothing is listed with nothing."""
    _leader_group(repo, session, group_id)
    docs, viewer, tenant_id = CaseDocs(repo), _viewer(session), session["tenant_id"]
    people = {member["identity_id"]: member["display_name"] for member in repo.group_members(tenant_id, group_id) if member["role"] == "participant"}
    shared = [item for item in visibility.shared_with(docs, repo, viewer, "facilitator", viewer.identity_id) if item["owner_identity_id"] in people]
    led = {item["owner_identity_id"] for item in visibility.led_cases(docs, repo, viewer)}
    return {"participants": [{"identity_id": who, "name": name, "led": who in led,
                              "shared": [{"project_id": item["project_id"], "kind": item["kind"], "title": doc_kinds.require(item["kind"]).title, "doc_id": item["doc_id"],
                                          "version": item["version"], "content": item["content"], "author": item["author"], "at": item["at"]}
                                         for item in shared if item["owner_identity_id"] == who]}
                             for who, name in people.items()]}


class StopBody(BaseModel):
    participant: str | None = None


@router.post("/groups/{group_id}/facilitate/stop")
def stop(group_id: str, body: StopBody | None = None, session: dict[str, Any] = Depends(api.require_session),
         repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """A participant said they want to stop. The help for where that participant is (GOVERN's lines, read from their own
    records here and never returned) -- or, with no one named, the general lines. The route answers help only."""
    _leader_group(repo, session, group_id)
    participant = (body or StopBody()).participant
    if participant is None:
        return safety.help_for(None)
    found = visibility.help_for_member(CaseDocs(repo), repo, _viewer(session), group_id, participant)
    if found is None:
        raise not_found(group_id)
    return found


@router.get("/groups/{group_id}/facilitate/assignments")
def assignments(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
                store: IdentityStore = Depends(api.get_store)) -> list[dict[str, Any]]:
    member_group(repo, session, group_id)
    return [{**item, "supervisee_name": _name(store, item["supervisee"]), "supervisor_name": _name(store, item["supervisor"])}
            for item in visibility.unit_assignments(CaseDocs(repo), _viewer(session), group_id)]


class AssignBody(BaseModel):
    supervisee: str
    email: str


@router.post("/groups/{group_id}/facilitate/assignments")
def assign(group_id: str, body: AssignBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository),
           store: IdentityStore = Depends(api.get_store)) -> dict[str, Any]:
    group = member_group(repo, session, group_id)
    if group["my_role"] != "convener" or group["my_review_state"] != "confirmed":
        raise HTTPException(status_code=403, detail="GROUP_CONVENER_ONLY: only a convener assigns a supervisor")
    leader = repo.get_group_for(session["tenant_id"], group_id, body.supervisee)
    if leader is None or leader["my_role"] != "facilitator":
        raise HTTPException(status_code=404, detail=f"GROUP_MEMBER_NOT_FOUND: {body.supervisee!r} does not lead this group")
    supervisor = _supervisor_by_email(store, CaseDocs(repo), session, body.email, body.supervisee)
    return _link(repo, session, {"supervisee": body.supervisee, "supervisor": supervisor, "assigned_by": "unit", "group_id": group_id})


@router.delete("/groups/{group_id}/facilitate/assignments/{doc_id}")
def unassign(group_id: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, str]:
    member_group(repo, session, group_id)
    return _delete_link(repo, session, doc_id, "unit", group_id)
