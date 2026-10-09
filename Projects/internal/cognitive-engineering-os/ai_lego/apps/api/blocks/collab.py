"""COLLAB 共同程序 over HTTP (docs/platform/STEP34_SHARED_RULES.md §7, card 20): a few people decide together and keep their
differences. The platform offers a procedure; nothing here says the decision was fair or that the group agrees.

    GET    /groups/{id}/collab/view/dissent        every objection kept, with its reason (an option you marked)
    GET    /groups/{id}/collab/view/authority      who represents whom now, recomputed from the shares still given
    GET    /groups/{id}/collab/view/shared         what members chose to share with the group (consent): {who, title, lines}, the words only
    GET    /groups/{id}/collab/view/agreement      「大家怎麼看」 (platform/collab_agreement.py), for the options you marked
    GET    /groups/{id}/collab/view/not-heard?round=  who has not written a position of that round (names only)
    POST   /groups/{id}/ai/{action}                {context}  an AI turn in the group (ai_gate's group path)
    POST   /groups/{id}/collab/handoff             {project_id, closing, to}  convener: a pointer in their own case
    GET    /projects/{project_id}/collab/handoffs  those pointers, each read through the group as it is now
    POST   /groups/{id}/collab/collab.authority/{doc_id}/revoke   take back your own share (the API names you)
    GET    /groups/{id}/collab/{kind}?mine=true    what of that kind you may read (platform/visibility.py); mine: only yours
    POST   /groups/{id}/collab/{kind}              {content}
    PUT    /groups/{id}/collab/{kind}/{doc_id}     {content, base_version}   only its writer (a question: any member)
    DELETE /groups/{id}/collab/{kind}/{doc_id}     only the person who wrote every version (also after leaving: G3)
    GET    /groups/{id}/collab/{kind}/{doc_id}/versions

Every route resolves membership first (groups.member_group): not a member = the missing group's 404 (G2). Another member's
record is read only through ``visibility.visible``, another member's case only through ``visibility.shared_with``. Answers
never carry another member's identity: each item says ``who`` (你, the label they chose -- 匿名 too -- or their name) and
``mine``. No answer counts votes or ranks anything.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai_lego.apps.api import main as api
from ai_lego.apps.api.main import _MeteredProvider
from ai_lego.apps.api.blocks.docs import DocBody, _save, _saved
from ai_lego.apps.api.blocks.groups import HELD_YOU, member_group, not_found
from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.kinds.collab import KINDS
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation, group_gone
from ai_lego.platform import visibility
from ai_lego.platform.ai_gate import AiRefused, actions, ask_ai
from ai_lego.platform.collab_agreement import agreement as agreement_rule
from ai_lego.platform.collab_shared import shared_words
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.rulesets.collab import AGREEMENT
from ai_lego.platform.block_hooks import before_save
from ai_lego.platform.block_hooks.collab import RENEGOTIATE, check_save, derived, notices
from ai_lego.platform.visibility import Viewer

router = APIRouter()
BLOCK = "COLLAB"
GROUP_KINDS = {spec.kind: spec for spec in KINDS if spec.owner == "group"}
LEFT = "已離開的成員"
WAITING = "轉述先給本人看。本人確認說得對之後，大家才看得到。"


def _status(text: str) -> int:
    if text.startswith(("COLLAB_NOT_YOURS", "COLLAB_REVOKE_OWN_ONLY", "COLLAB_CONFIRM_SUBJECT_ONLY", "GROUP_CONVENER_ONLY", "DOC_NOT_YOURS", "RECORD_")):
        return 403
    if "NOT_FOUND" in text:
        return 404
    if text.startswith(("COLLAB_ALREADY_WRITTEN", "COLLAB_REVOKED_STAYS", "COLLAB_READ_FIRST", "GROUP_CLOSED", "DOC_STALE", "DOC_NOT_DELETABLE")):
        return 409
    return 400


def _call(group_id: str, fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except InvariantViolation as error:
        if group_gone(error):
            raise not_found(group_id) from None
        raise HTTPException(status_code=_status(str(error)), detail=str(error)) from error


def _kind(kind: str) -> doc_kinds.DocKind:
    spec = GROUP_KINDS.get(kind)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"DOC_KIND_UNKNOWN: {kind!r} is not kept in a group")
    return spec


def _viewer(session: dict[str, Any]) -> Viewer:
    return Viewer(session["tenant_id"], session["identity_id"])


def _owner(group_id: str) -> record_log.Owner:
    """The group's owner, built only after ``member_group`` let the caller in (every caller below does that first)."""
    return record_log.group(group_id)


class Names:
    """How each member is shown to this viewer: 你; else the label they chose (collab.label, 匿名 included); else the name
    they gave the platform; someone no longer in the group, 已離開的成員."""

    def __init__(self, docs: CaseDocs, repo: ProjectSourceRepository, viewer: Viewer, group_id: str) -> None:
        self.viewer = viewer
        self.names = {member["identity_id"]: member["display_name"] for member in repo.group_members(viewer.tenant_id, group_id)}
        self.labels = {item["written_by"]: item["content"]["label"] for item in visibility.visible(docs, viewer, group_id, "collab.label")}

    def __call__(self, identity_id: str | None) -> str:
        if identity_id == self.viewer.identity_id:
            return "你"
        return self.labels.get(identity_id) or self.names.get(identity_id) or LEFT


def _shown(items: list[dict[str, Any]], names: Names) -> list[dict[str, Any]]:
    """The items as the viewer gets them: no identity of another member, ``who`` and ``mine`` instead."""
    return [{key: value for key, value in item.items() if key != "written_by"} | {"mine": item["written_by"] == names.viewer.identity_id,
            "who": "AI" if item["author"] == "ai" else names(item["written_by"])} for item in items]


def _save_group(repo: ProjectSourceRepository, session: dict[str, Any], group_id: str, spec: doc_kinds.DocKind, body: DocBody, doc_id: str | None = None) -> dict[str, Any]:
    """A member's save of a group record: COLLAB's checks (``check_save``) and any block's BEFORE_SAVE run as the batch's
    check under the group lock (exclusive), then the save path every person's write takes (docs._saved: the crisis
    notice, GOVERN's high-risk recognition), then the records the system derives from it."""
    member_group(repo, session, group_id)
    docs, tenant_id, identity_id, owner = CaseDocs(repo), session["tenant_id"], session["identity_id"], _owner(group_id)
    item = {"kind": spec.kind, "content": body.content, "doc_id": doc_id, "base_version": body.base_version if doc_id else None}

    def check() -> None:
        check_save(docs, tenant_id, group_id, identity_id, spec.kind, body.content, doc_id)
        before_save(docs, tenant_id, owner, spec.kind, body.content, doc_id)

    [saved] = _call(group_id, docs.save_many, tenant_id, owner, [item], api._me(session, BLOCK), check=check,
                    derive=lambda written: derived(docs, tenant_id, group_id, identity_id, written[0]))
    result = _saved(repo, session, owner, saved)
    result["notices"] += notices(saved)
    return {**result, "mine": True, "who": "你"}


# -- views: computed for the viewer from what they may read --------------------------------------------------------------

@router.get("/groups/{group_id}/collab/view/dissent")
def dissent(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    """Every objection kept: its reason is read from the stance version that said 異議 (a pointer, never a copy), so it is
    shown only to someone who may read that stance -- a member who marked the same option (write before see)."""
    member_group(repo, session, group_id)
    docs, viewer = CaseDocs(repo), _viewer(session)
    names = Names(docs, repo, viewer, group_id)
    kept = []
    for record in visibility.visible(docs, viewer, group_id, "collab.dissent"):
        pointer = record["content"]
        try:
            versions = visibility.versions(docs, viewer, group_id, "collab.stance", pointer["stance_id"])
        except InvariantViolation:
            continue   # not yours to read yet (mark the option first), or its writer erased their account
        said = next((version for version in versions if version["version"] == pointer["stance_version"]), None)
        if said is not None:
            kept.append({"doc_id": record["doc_id"], "option": pointer["option"], "reason": said["content"]["reason"], "who": names(record["written_by"]),
                         "mine": record["written_by"] == viewer.identity_id, "at": said["at"]})
    return kept


@router.get("/groups/{group_id}/collab/view/authority")
def authority(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """Who represents whom, recomputed now from each share still given (one record = one grantor's share): someone who
    took theirs back is no longer counted in it, and the others' shares stay. A share taken back leaves 「範圍要重新談」."""
    member_group(repo, session, group_id)
    docs, viewer = CaseDocs(repo), _viewer(session)
    names = Names(docs, repo, viewer, group_id)
    shares = visibility.visible(docs, viewer, group_id, "collab.authority")
    held: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for share in shares:
        if not share["content"].get("revoked_by"):
            held.setdefault((share["content"]["to"], share["content"]["scope"]), []).append(share)
    current = [{"to": names(to), "to_me": to == viewer.identity_id, "scope": scope,
                "grantors": [names(share["written_by"]) for share in grants], "my_share": next((share["doc_id"] for share in grants if share["written_by"] == viewer.identity_id), None)}
               for (to, scope), grants in held.items()]
    by_id = {share["doc_id"]: share for share in shares}
    renegotiate = [{"to": names(by_id[notice["content"]["authority"]]["content"]["to"]), "scope": by_id[notice["content"]["authority"]]["content"]["scope"],
                    "taken_back_by": names(notice["written_by"]), "notice": RENEGOTIATE, "at": notice["at"]}
                   for notice in visibility.visible(docs, viewer, group_id, "collab.renegotiate") if notice["content"]["authority"] in by_id]
    return {"current": current, "renegotiate": renegotiate}


@router.get("/groups/{group_id}/collab/view/shared")
def shared(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    """What other members' live consents name for this group, as the words a group may read (platform/collab_shared.py:
    ``{who, title, lines}`` -- no doc id, version, reader or reference into the sharer's case); nothing of a case they did
    not share, and no kind without a projection (visibility.shared_with decides consent at this read)."""
    member_group(repo, session, group_id)
    docs, viewer = CaseDocs(repo), _viewer(session)
    names = Names(docs, repo, viewer, group_id)
    closings = visibility.visible(docs, viewer, group_id, "collab.closing")
    decided_at = min((item["created_at"] for item in closings), default=None)
    out = []
    for item in visibility.shared_with(docs, repo, viewer, "group", group_id):
        words = shared_words(item["kind"], item["content"], after_decision=decided_at is not None and item["at"] > decided_at)
        if words is not None:
            out.append({"who": names(item["owner_identity_id"]), **words})
    return out


def _only(table: dict[str, Any], marked: set[str]) -> dict[str, Any]:
    return table if table["insufficient"] else {**table, "options": {option: row for option, row in table["options"].items() if option in marked}}


@router.get("/groups/{group_id}/collab/view/agreement")
def agreement_view(group_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """§8 for this viewer: the pure rule over the counted members' stances (the options of the latest round = now, the
    earlier ones = history), shown only for the options the viewer marked (write before see). No counts, no ranking."""
    group = member_group(repo, session, group_id)
    docs, viewer = CaseDocs(repo), _viewer(session)
    if group["my_review_state"] != "confirmed":
        held = {"insufficient": True, "why": HELD_YOU}
        return {**held, "held": [], "heaviest_left_out": False, "without_heaviest": held, "rule": AGREEMENT.stamp()}
    stances, members = visibility.for_agreement(docs, repo, viewer, group_id)
    round_of = {item["doc_id"]: item["content"]["round"] for item in visibility.visible(docs, viewer, group_id, "collab.option")}
    latest = max(round_of.values(), default=None)
    now = {member: {option: said for option, said in marks.items() if round_of.get(option) == latest} for member, marks in stances.items()}
    history = {member: {option: said["stance"] for option, said in marks.items() if round_of.get(option) != latest} for member, marks in stances.items()}
    answer = agreement_rule(now, history, members)
    marked = set(stances.get(viewer.identity_id, {}))
    names = Names(docs, repo, viewer, group_id)
    first = {key: value for key, value in answer.items() if key not in ("held", "heaviest_left_out", "without_heaviest")}
    return {**_only(first, marked), "held": [names(member) for member in answer["held"]], "heaviest_left_out": answer["heaviest_left_out"],
            "without_heaviest": _only(answer["without_heaviest"], marked), "rule": AGREEMENT.stamp()}


@router.get("/groups/{group_id}/collab/view/not-heard")
def not_heard(group_id: str, round: int, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """「指出還沒被聽到的人」: the members with no position of that round, by name, and nothing else about them. Computed,
    not asked of the model: no one's words are needed to say who has not spoken."""
    member_group(repo, session, group_id)
    docs, viewer = CaseDocs(repo), _viewer(session)
    heard = visibility.wrote_in_round(docs, viewer, group_id, "collab.position", round)
    if heard is None:
        return {"round": round, "not_heard": []}
    names = Names(docs, repo, viewer, group_id)
    return {"round": round, "not_heard": [names(member["identity_id"]) for member in repo.group_members(session["tenant_id"], group_id) if member["identity_id"] not in heard]}


class AiBody(BaseModel):
    context: dict[str, Any] = {}


@router.post("/groups/{group_id}/ai/{action_name}")
def group_ai_turn(group_id: str, action_name: str, body: AiBody, session: dict[str, Any] = Depends(api.require_session),
                  repo: ProjectSourceRepository = Depends(api.get_project_source_repository), store: IdentityStore = Depends(api.get_store),
                  provider: Any = Depends(api.get_ai_provider)) -> dict[str, Any]:
    """One AI turn in the group, for a current member. What it saved is answered as the caller may read it now: a
    restatement of someone else waits for that person (``waiting``) -- not even its requester reads it before."""
    member_group(repo, session, group_id)
    action = actions().get((BLOCK, action_name))
    if action is None or not action.in_group:
        raise HTTPException(status_code=404, detail=f"AI_ACTION_UNKNOWN: {BLOCK}.{action_name}")
    docs, viewer = CaseDocs(repo), _viewer(session)
    names = Names(docs, repo, viewer, group_id)
    metered = _MeteredProvider(api._require_ai(provider, store, session), store, session, f"block:{BLOCK}.{action_name}")
    try:
        result = ask_ai(action, tenant_id=session["tenant_id"], identity_id=session["identity_id"], project_id=None, group_id=group_id, context=body.context,
                        docs=docs, provider=metered, shown=names)
    except InvariantViolation as error:
        if group_gone(error):
            raise not_found(group_id) from None
        text = str(error)
        status = 403 if isinstance(error, AiRefused) else 429 if "budget" in text.lower() else 502 if text.startswith(("AI_ANSWER", "AI_PROVIDER")) else _status(text)
        raise HTTPException(status_code=status, detail=text) from error
    if "saved" in result:
        saved = result["saved"]
        seen = visibility.visible(docs, viewer, group_id, saved["kind"], doc_id=saved["doc_id"])
        result = {**result, "saved": _shown(seen, names)[0] if seen else {"doc_id": saved["doc_id"], "kind": saved["kind"], "waiting": True, "notice": WAITING}}
    return result


@router.post("/groups/{group_id}/collab/collab.authority/{doc_id}/revoke")
def revoke_share(group_id: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """The next version of the caller's own share, taken back by them (check_save refuses anyone else's share)."""
    member_group(repo, session, group_id)
    docs, viewer = CaseDocs(repo), _viewer(session)
    found = _call(group_id, visibility.visible, docs, viewer, group_id, "collab.authority", doc_id=doc_id)
    if not found:
        raise HTTPException(status_code=404, detail=f"DOC_NOT_FOUND: {doc_id!r}")
    share = found[0]
    content = {**share["content"], "revoked_by": [session["identity_id"]]}
    return _save_group(repo, session, group_id, GROUP_KINDS["collab.authority"], DocBody(content=content, base_version=share["version"]), doc_id)


class HandoffBody(BaseModel):
    project_id: str
    closing: str
    to: str


@router.post("/groups/{group_id}/collab/handoff")
def handoff(group_id: str, body: HandoffBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    """The group's joint judgment to DECIDE, its actions to ACT: a pointer to the closing in the convener's own case (the
    owner check every case route makes); the words stay the group's and are read through it each time."""
    member_group(repo, session, group_id)
    docs, viewer = CaseDocs(repo), _viewer(session)
    if not visibility.is_convener(docs, viewer, group_id):
        raise HTTPException(status_code=403, detail="GROUP_CONVENER_ONLY: only a convener takes the group's decision into their case")
    if not visibility.visible(docs, viewer, group_id, "collab.closing", doc_id=body.closing):
        raise HTTPException(status_code=404, detail=f"DOC_NOT_FOUND: {body.closing!r}")
    api._project_or_404(repo, session, body.project_id)
    content = {"group_id": group_id, "closing": body.closing, "to": body.to}
    return _save(repo, session, record_log.case(body.project_id), doc_kinds.require("collab.handoff"), DocBody(content=content))


@router.get("/projects/{project_id}/collab/handoffs")
def handoffs(project_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    """Each pointer with the closing as the person may read it now (nothing when they left the group or it was erased)."""
    api._project_or_404(repo, session, project_id)
    docs, viewer = CaseDocs(repo), _viewer(session)
    out = []
    for pointer in docs.current(session["tenant_id"], record_log.case(project_id), "collab.handoff"):
        found = []
        if repo.get_group_for(session["tenant_id"], pointer["content"]["group_id"], session["identity_id"]) is not None:
            found = visibility.visible(docs, viewer, pointer["content"]["group_id"], "collab.closing", doc_id=pointer["content"]["closing"])
        out.append({**pointer, "closing": found[0]["content"] if found else None})
    return out


# -- every kind -----------------------------------------------------------------------------------------------------------

@router.get("/groups/{group_id}/collab/{kind}")
def list_records(group_id: str, kind: str, mine: bool = False, session: dict[str, Any] = Depends(api.require_session),
                 repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    """``mine``: only what the caller wrote -- what a page asks before they wrote theirs of a round (write before see)."""
    member_group(repo, session, group_id)
    _kind(kind)
    docs, viewer = CaseDocs(repo), _viewer(session)
    items = _call(group_id, visibility.visible, docs, viewer, group_id, kind)
    return _shown([item for item in items if not mine or item["written_by"] == viewer.identity_id], Names(docs, repo, viewer, group_id))


@router.post("/groups/{group_id}/collab/{kind}")
def create_record(group_id: str, kind: str, body: DocBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    return _save_group(repo, session, group_id, _kind(kind), body)


@router.put("/groups/{group_id}/collab/{kind}/{doc_id}")
def update_record(group_id: str, kind: str, doc_id: str, body: DocBody, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, Any]:
    return _save_group(repo, session, group_id, _kind(kind), body, doc_id)


@router.delete("/groups/{group_id}/collab/{kind}/{doc_id}")
def delete_record(group_id: str, kind: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> dict[str, str]:
    """G3: one who left may still delete what they wrote; anyone else outside the group gets the missing group's 404."""
    spec, docs, viewer = _kind(kind), CaseDocs(repo), _viewer(session)
    if repo.get_group_for(session["tenant_id"], group_id, session["identity_id"]) is None and not [
            item for item in _call(group_id, visibility.visible, docs, viewer, group_id, kind, doc_id=doc_id) if item["written_by"] == viewer.identity_id]:
        raise not_found(group_id)
    _call(group_id, docs.delete, session["tenant_id"], _owner(group_id), spec.kind, doc_id, api._me(session, BLOCK))
    return {"status": "deleted", "doc_id": doc_id}


@router.get("/groups/{group_id}/collab/{kind}/{doc_id}/versions")
def record_versions(group_id: str, kind: str, doc_id: str, session: dict[str, Any] = Depends(api.require_session), repo: ProjectSourceRepository = Depends(api.get_project_source_repository)) -> list[dict[str, Any]]:
    member_group(repo, session, group_id)
    _kind(kind)
    docs, viewer = CaseDocs(repo), _viewer(session)
    found = _call(group_id, visibility.visible, docs, viewer, group_id, kind, doc_id=doc_id)
    versions = _call(group_id, visibility.versions, docs, viewer, group_id, kind, doc_id)
    return _shown([{**version, "written_by": found[0]["written_by"]} for version in versions], Names(docs, repo, viewer, group_id))
