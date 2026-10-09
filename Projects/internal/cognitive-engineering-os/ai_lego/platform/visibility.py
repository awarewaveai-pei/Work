"""The only ways to read another person's record (docs/platform/STEP34_SHARED_RULES.md §3), so a leak has one place to
be found. R1 ``visible``: a group's records. R2 ``shared_with``: documents of another person's case, through their live
consent. R3, a person's own case and person records, stays with the routes that check the owner. ``appeals_for`` (§9):
the platform's appeals, with who wrote them masked. R4 (FACILITATE, card 61): a supervisor reads the logs of the leaders
they supervise now, a leader reads the feedback written about them -- both through ``facilitate.supervision_link`` records
whose standing is decided again on every read, never cached; so is eligibility (``is_eligible_*``).

CaseDocs refuses to read a group's records any other way (``current`` / ``versions`` with a group owner); its
``current_in_group`` / ``versions_in_group`` are called from this module only (tests/unit/test_visibility.py).
Nothing here logs or caches: a read is decided against the records and the membership as they are now.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import safety
from ai_lego.platform.identity.store import IdentityStore
from ai_lego.platform.lessons import FACILITATOR_COURSE


# ``subject_confirmed`` (COLLAB's restatement, §7): an AI's words about one member's record are that member's first (the
# record's writer identity is theirs). Another member reads it once the member's latest answer to it (``collab.confirm``)
# says 說得對, and only if they may read the record it restates (write before see holds through it).
SUBJECT_CONFIRMED = {"collab.restatement": ("collab.confirm", "restatement", "verdict", "說得對", "position", "collab.position")}


@dataclass(frozen=True)
class Viewer:
    tenant_id: str
    identity_id: str


def _membership(docs: CaseDocs, viewer: Viewer, group_id: str) -> dict[str, Any] | None:
    return docs.reads.membership(viewer.tenant_id, group_id, viewer.identity_id)


def is_member(docs: CaseDocs, viewer: Viewer, group_id: str) -> bool:
    """A current member (not left, group not erased), held for review or not."""
    return _membership(docs, viewer, group_id) is not None


def is_convener(docs: CaseDocs, viewer: Viewer, group_id: str) -> bool:
    membership = _membership(docs, viewer, group_id)
    return membership is not None and membership["my_role"] == "convener"


def is_appeal_handler(store: IdentityStore, viewer: Viewer) -> bool:
    """The one granted role (§5): a live identity_roles row the operator wrote (apps/cli/grant_role.py)."""
    return store.has_role(viewer.tenant_id, viewer.identity_id, "appeal_handler")


FACILITATE_LOG = "facilitate.log"
SUPERVISION_LINK = "facilitate.supervision_link"


def is_eligible_facilitator(docs: CaseDocs, viewer: Viewer) -> bool:
    """§5, derived from the person's records on every call, never cached: a ``teach.completion`` of the facilitator course
    exists and a ``teach.run`` is still there for each lesson (and version) it names -- deleting a run takes it away.
    Only the fact leaves: no run's notes do."""
    owner = record_log.person(viewer.identity_id)
    for completion in docs.current(viewer.tenant_id, owner, "teach.completion"):
        named = completion["content"].get("lesson_versions") or {}
        if completion["content"].get("course") != FACILITATOR_COURSE or not named:
            continue
        done = {(run["content"].get("lesson"), run["content"].get("lesson_version")) for run in docs.current(viewer.tenant_id, owner, "teach.run")}
        if all((lesson, version) in done for lesson, version in named.items()):
            return True
    return False


def is_eligible_supervisor(docs: CaseDocs, viewer: Viewer) -> bool:
    """Facilitator + at least one ``facilitate.log`` of their own (§5): existence only, never what a log says."""
    return is_eligible_facilitator(docs, viewer) and bool(docs.current(viewer.tenant_id, record_log.person(viewer.identity_id), FACILITATE_LOG))


def visible(docs: CaseDocs, viewer: Viewer, group_id: str, kind: str, *, doc_id: str | None = None) -> list[dict[str, Any]]:
    """R1: what of a group's records of ``kind`` this viewer reads now (``doc_id``: that one document, or nothing).

    - What the viewer wrote (the first version is theirs) is always theirs to read -- also after leaving (G3).
    - Others' records only for a current member who is not held for review (§4 pending_review), as the kind's
      ``visibility`` allows: members | author_only (none) | convener_and_author (the convener) | self_and_govern (none
      here: GOVERN reads the place on its own path) | subject_confirmed (once its subject confirmed it: ``SUBJECT_CONFIRMED``).
    - Blind (write before see): of a kind with ``blind=<field>``, another's record with round value v only when the
      viewer has a live record of their own with the same v. The convener is not exempt."""
    spec = doc_kinds.require(kind)
    if spec.owner != "group":
        raise InvariantViolation(f"VISIBILITY_NOT_A_GROUP_KIND: {kind!r}")
    with docs.reading_group(viewer.tenant_id, group_id, viewer.identity_id):
        return _visible(docs, viewer, group_id, spec, doc_id)


def _visible(docs: CaseDocs, viewer: Viewer, group_id: str, spec: doc_kinds.DocKind, doc_id: str | None) -> list[dict[str, Any]]:
    kind = spec.kind
    items = docs.current_in_group(viewer.tenant_id, group_id, kind)
    mine = [item for item in items if item["written_by"] == viewer.identity_id]
    membership = _membership(docs, viewer, group_id)
    if membership is None or membership["my_review_state"] != "confirmed":
        shown = mine
    elif spec.visibility in ("author_only", "self_and_govern") or (spec.visibility == "convener_and_author" and membership["my_role"] != "convener"):
        shown = mine
    elif spec.visibility == "subject_confirmed":
        shown = [item for item in items if item["written_by"] == viewer.identity_id or _confirmed(docs, viewer, group_id, kind, item)]
    elif spec.blind:   # the rounds come from all the viewer's own records, whatever one document was asked for
        rounds = {item["content"][spec.blind] for item in mine}
        shown = [item for item in items if item["written_by"] == viewer.identity_id or item["content"].get(spec.blind) in rounds]
    else:
        shown = items
    return [item for item in shown if doc_id is None or item["doc_id"] == doc_id]


def _confirmed(docs: CaseDocs, viewer: Viewer, group_id: str, kind: str, item: dict[str, Any]) -> bool:
    confirm_kind, points_at, verdict, yes, restated_field, restated_kind = SUBJECT_CONFIRMED[kind]
    said = [answer for answer in docs.current_in_group(viewer.tenant_id, group_id, confirm_kind)
            if answer["written_by"] == item["written_by"] and answer["content"].get(points_at) == item["doc_id"]]
    return (bool(said) and said[-1]["content"].get(verdict) == yes
            and bool(visible(docs, viewer, group_id, restated_kind, doc_id=item["content"].get(restated_field))))


def for_agreement(docs: CaseDocs, repo: ProjectSourceRepository, viewer: Viewer, group_id: str) -> tuple[dict[str, dict[str, dict[str, str]]], list[dict[str, str]]]:
    """§8's input, for a current confirmed member only (else nothing): every current member's live ``collab.stance`` per
    option ({member: {option: {stance, reason}}}) and the members with their review state. Read for the pure rule
    (platform/collab_agreement.py), whose answer is all a route shows of it, and only for the options the viewer marked."""
    mine = repo.get_group_for(viewer.tenant_id, group_id, viewer.identity_id)
    if mine is None or mine["my_review_state"] != "confirmed":
        return {}, []
    members = [{"identity_id": member["identity_id"], "review_state": member["review_state"]} for member in repo.group_members(viewer.tenant_id, group_id)]
    current = {member["identity_id"] for member in members}
    stances: dict[str, dict[str, dict[str, str]]] = {}
    for item in docs.current_in_group(viewer.tenant_id, group_id, "collab.stance"):
        if item["written_by"] in current:
            stances.setdefault(item["written_by"], {})[item["content"]["option"]] = {"stance": item["content"]["stance"], "reason": item["content"]["reason"]}
    return stances, members


def wrote_in_round(docs: CaseDocs, viewer: Viewer, group_id: str, kind: str, value: Any) -> set[str] | None:
    """Who has a live record of a blind kind for one round -- that they wrote, never what (「指出還沒被聽到的人」). For a
    current confirmed member; None otherwise."""
    spec = doc_kinds.require(kind)
    membership = _membership(docs, viewer, group_id)
    if not spec.blind or spec.owner != "group" or membership is None or membership["my_review_state"] != "confirmed":
        return None
    return {item["written_by"] for item in docs.current_in_group(viewer.tenant_id, group_id, kind) if item["content"].get(spec.blind) == value}


def versions(docs: CaseDocs, viewer: Viewer, group_id: str, kind: str, doc_id: str) -> list[dict[str, Any]]:
    """Every version of one group document the viewer may read (``visible``); DOC_NOT_FOUND otherwise, as for none."""
    with docs.reading_group(viewer.tenant_id, group_id, viewer.identity_id):   # decided and fetched in one transaction (Codex F5)
        if not visible(docs, viewer, group_id, kind, doc_id=doc_id):
            raise InvariantViolation(f"DOC_NOT_FOUND: {doc_id!r}")
        return docs.versions_in_group(viewer.tenant_id, group_id, kind, doc_id)


def shared_with(docs: CaseDocs, repo: ProjectSourceRepository, viewer: Viewer, grantee_kind: str, grantee_id: str) -> list[dict[str, Any]]:
    """R2 (§6): documents of other people's cases that their live consents share with this viewer, decided now.

    ``grantee_kind`` "group": the viewer must be a current, confirmed member of group ``grantee_id``; the consents read
    are those of its other current members naming that group. "facilitator": ``grantee_id`` must be the viewer, and the
    consents read are those naming them, of people in a group where the viewer is a current facilitator. A consent
    that is withdrawn shares nothing. Each item is the document it names, in that person's own case while the case
    exists: its current version when the consent follows versions, else the version the item names. "research" is not
    a read path."""
    tenant_id = viewer.tenant_id
    if grantee_kind == "group":
        mine = repo.get_group_for(tenant_id, grantee_id, viewer.identity_id)
        if mine is None or mine["my_review_state"] != "confirmed":
            return []
        sharers = [member["identity_id"] for member in repo.group_members(tenant_id, grantee_id) if member["identity_id"] != viewer.identity_id]
    elif grantee_kind == "facilitator":
        if grantee_id != viewer.identity_id or not is_eligible_facilitator(docs, viewer):   # a leader who stopped being trained reads nothing more
            return []
        sharers = repo.facilitated_by(tenant_id, viewer.identity_id)
    else:
        raise InvariantViolation(f"VISIBILITY_GRANTEE_INVALID: {grantee_kind!r}")
    shown: list[dict[str, Any]] = []
    for owner_id in sharers:
        for consent in docs.current(tenant_id, record_log.person(owner_id), "govern.consent"):
            terms = consent["content"]
            if terms["purpose"] != grantee_kind or terms["target"] != grantee_id or terms.get("withdrawn"):
                continue
            for item in terms.get("items", []):
                found = named_document(docs, repo, tenant_id, owner_id, item, bool(terms.get("follow_versions")))
                if found is not None:
                    shown.append({"owner_identity_id": owner_id, "consent_id": consent["doc_id"], "project_id": item["project_id"], **found})
    return shown


def named_document(docs: CaseDocs, repo: ProjectSourceRepository, tenant_id: str, owner_id: str, item: dict[str, Any], follow: bool) -> dict[str, Any] | None:
    """The document one consent item names, from the sharer's own case only, or None (the case erased, not theirs, the
    document gone, the version not there)."""
    project = repo.get_project(tenant_id, item["project_id"])
    if project is None or project["created_by_identity_id"] != owner_id or doc_kinds.kinds().get(item["kind"]) is None or doc_kinds.require(item["kind"]).owner != "case":
        return None
    case = record_log.case(item["project_id"])
    if follow:
        return next((doc for doc in docs.current(tenant_id, case, item["kind"]) if doc["doc_id"] == item["doc_id"]), None)
    try:
        return next((doc for doc in docs.versions(tenant_id, case, item["kind"], item["doc_id"]) if doc["version"] == item.get("version")), None)
    except InvariantViolation:
        return None


APPEAL = "govern.appeal"
# What a reader other than its author gets of an anonymous appeal: no writer, no name, no email, no instant (a time of
# day can point at who was online); the words as written. A named one adds who wrote it.
MASKED_KEYS = ("doc_id", "group_id", "about_identity_id", "text", "named", "on")


def _authority_stands(docs: CaseDocs, tenant_id: str, link: dict[str, Any]) -> bool:
    """Who made the link may still make it. Self: the leader themself wrote it. Unit: its writer is a confirmed convener of
    the unit's group and the leader is a facilitator of it, both as they are now (leaving or an erased group ends it)."""
    content, writer = link["content"], link["written_by"]
    if content["supervisee"] == content["supervisor"]:
        return False
    if content["assigned_by"] == "self":
        return writer == content["supervisee"]
    group_id = content.get("group_id")
    if not group_id:
        return False
    by = docs.reads.membership(tenant_id, group_id, writer)
    leader = docs.reads.membership(tenant_id, group_id, content["supervisee"])
    return (by is not None and by["my_role"] == "convener" and by["my_review_state"] == "confirmed"
            and leader is not None and leader["my_role"] == "facilitator")


def _supervised_links(docs: CaseDocs, viewer: Viewer) -> list[dict[str, Any]]:
    """The links that make the viewer someone's supervisor now. Whether they are still an eligible supervisor is asked
    again on every call (§5; the link says who, never that they still qualify)."""
    named = [link for link in docs.current_on_platform(viewer.tenant_id, SUPERVISION_LINK) if link["content"]["supervisor"] == viewer.identity_id]
    if not named or not is_eligible_supervisor(docs, viewer):
        return []
    return [link for link in named if _authority_stands(docs, viewer.tenant_id, link)]


def _supervisees(docs: CaseDocs, viewer: Viewer) -> set[str]:
    """Whom this viewer supervises right now (§9): appeals about them are the viewer's to read, masked."""
    return {link["content"]["supervisee"] for link in _supervised_links(docs, viewer)}


def supervises(docs: CaseDocs, viewer: Viewer, supervisee_id: str) -> bool:
    return supervisee_id in _supervisees(docs, viewer)


def supervisees(docs: CaseDocs, viewer: Viewer) -> list[dict[str, str]]:
    """R4 (supervisor): the leaders the viewer supervises now and how each came (self, or the unit's group)."""
    return [{"supervisee": link["content"]["supervisee"], "assigned_by": link["content"]["assigned_by"], "group_id": link["content"].get("group_id", "")}
            for link in _supervised_links(docs, viewer)]


def supervisee_logs(docs: CaseDocs, viewer: Viewer, supervisee_id: str) -> list[dict[str, Any]] | None:
    """R4: the ``facilitate.log`` records of one leader the viewer supervises now -- nothing else of that person's. None for
    anyone else, a person who does not exist included: the caller answers all of them alike."""
    if not supervises(docs, viewer, supervisee_id):
        return None
    return docs.current(viewer.tenant_id, record_log.person(supervisee_id), FACILITATE_LOG)


def supervisors_of(docs: CaseDocs, viewer: Viewer) -> list[dict[str, Any]]:
    """The viewer's own links as the leader, standing or not: who, how it came, and whether it stands now (the supervisor
    is an eligible supervisor and whoever made it may). The leader sees this about their own supervision only."""
    found = []
    for link in docs.current_on_platform(viewer.tenant_id, SUPERVISION_LINK):
        content = link["content"]
        if content["supervisee"] == viewer.identity_id:
            stands = is_eligible_supervisor(docs, Viewer(viewer.tenant_id, content["supervisor"])) and _authority_stands(docs, viewer.tenant_id, link)
            found.append({"doc_id": link["doc_id"], "supervisor": content["supervisor"], "assigned_by": content["assigned_by"], "group_id": content.get("group_id", ""),
                          "stands": stands, "written_by_me": link["written_by"] == viewer.identity_id})
    return found


def unit_assignments(docs: CaseDocs, viewer: Viewer, group_id: str) -> list[dict[str, Any]]:
    """The links a group's unit made: to its convener (all of them, to take back) and to the leader each names (their own).
    Nobody else of the group reads them."""
    membership = _membership(docs, viewer, group_id)
    if membership is None or membership["my_review_state"] != "confirmed":
        return []
    convener = membership["my_role"] == "convener"
    return [{"doc_id": link["doc_id"], "supervisee": link["content"]["supervisee"], "supervisor": link["content"]["supervisor"], "written_by_me": link["written_by"] == viewer.identity_id,
             "stands": is_eligible_supervisor(docs, Viewer(viewer.tenant_id, link["content"]["supervisor"])) and _authority_stands(docs, viewer.tenant_id, link)}
            for link in docs.current_on_platform(viewer.tenant_id, SUPERVISION_LINK)
            if link["content"]["assigned_by"] == "unit" and link["content"].get("group_id") == group_id and (convener or link["content"]["supervisee"] == viewer.identity_id)]


def existing_link(docs: CaseDocs, tenant_id: str, content: dict[str, Any]) -> str | None:
    """The id of the live link with exactly these parts, if one is there (a second is not made). Ids only."""
    return next((link["doc_id"] for link in docs.current_on_platform(tenant_id, SUPERVISION_LINK)
                 if all(link["content"].get(key, "") == content.get(key, "") for key in ("supervisee", "supervisor", "assigned_by", "group_id"))), None)


def feedback_for(docs: CaseDocs, viewer: Viewer) -> list[dict[str, Any]]:
    """R4 (supervisee): the feedback written about the viewer -- only theirs, found through the links that name them as the
    supervisee; a supervisor's other records, and their feedback on anyone else, stay theirs."""
    supervisors = sorted({link["content"]["supervisor"] for link in docs.current_on_platform(viewer.tenant_id, SUPERVISION_LINK) if link["content"]["supervisee"] == viewer.identity_id})
    return [{"doc_id": item["doc_id"], "supervisor": supervisor, "feedback": item["content"]["feedback"], "at": item["at"]}
            for supervisor in supervisors for item in docs.current(viewer.tenant_id, record_log.person(supervisor), "facilitate.supervision")
            if item["content"]["supervisee"] == viewer.identity_id]


def led_cases(docs: CaseDocs, repo: ProjectSourceRepository, viewer: Viewer) -> list[dict[str, str]]:
    """The fact that a case names the viewer as its leader (``assembler.intake.led_by``) -- the case and its owner, never a
    word of the intake -- for people in a group where the viewer leads now (R2's rule), while the viewer is an eligible
    facilitator. What those people shared is read through ``shared_with``, not here."""
    if not is_eligible_facilitator(docs, viewer):
        return []
    people = set(repo.facilitated_by(viewer.tenant_id, viewer.identity_id))
    found = []
    for project in repo.list_projects(viewer.tenant_id):
        if project["created_by_identity_id"] not in people:
            continue
        intake = docs.current(viewer.tenant_id, record_log.case(project["project_id"]), "assembler.intake")
        if intake and (intake[-1]["content"].get("led_by") or {}).get("facilitator_identity_id") == viewer.identity_id:
            found.append({"project_id": project["project_id"], "owner_identity_id": project["created_by_identity_id"]})
    return found


def help_for_member(docs: CaseDocs, repo: ProjectSourceRepository, viewer: Viewer, group_id: str, member_id: str) -> dict[str, Any] | None:
    """GOVERN's help for where one member of a group is, asked by the group's facilitator when that member wants to stop
    (help is never held back for a leader's training). The place is read here from the member's own records and never
    leaves: only the lines of help do. None unless the viewer leads the group now and the member is in it."""
    leader, member = repo.get_group_for(viewer.tenant_id, group_id, viewer.identity_id), repo.get_group_for(viewer.tenant_id, group_id, member_id)
    if leader is None or leader["my_role"] != "facilitator" or leader["my_review_state"] != "confirmed" or member is None:
        return None
    placed = [item for item in docs.current_in_group(viewer.tenant_id, group_id, "collab.place") if item["written_by"] == member_id]
    where = placed[-1]["content"]["where"] if placed else None
    if where is None:
        saved = docs.current(viewer.tenant_id, record_log.person(member_id), "govern.location")
        where = saved[-1]["content"]["where"] if saved else None
    return safety.help_for(where)


def appeals_for(docs: CaseDocs, store: IdentityStore, viewer: Viewer) -> list[dict[str, Any]]:
    """§9: the appeals of the viewer's tenant this viewer reads now. The author: their own, whole. Else never the
    facilitator an appeal is about (whatever role they also hold); an ``appeal_handler``: every other one; a supervisor of
    the facilitator it is about: those -- masked unless ``named``. Anyone else: nothing, not even how many."""
    handler = is_appeal_handler(store, viewer)
    supervised = _supervisees(docs, viewer)
    shown: list[dict[str, Any]] = []
    for item in docs.current_on_platform(viewer.tenant_id, APPEAL):
        content, writer = item["content"], item["written_by"]
        if writer == viewer.identity_id:
            shown.append({**{key: content.get(key, False) for key in ("group_id", "about_identity_id", "text", "named")},
                          "doc_id": item["doc_id"], "at": item["at"], "author_identity_id": writer, "mine": True})
        elif content["about_identity_id"] != viewer.identity_id and (handler or content["about_identity_id"] in supervised):
            shown.append(_masked(store, item))
    return shown


def _masked(store: IdentityStore, item: dict[str, Any]) -> dict[str, Any]:
    content = item["content"]
    named = content.get("named") is True
    masked = {"doc_id": item["doc_id"], "group_id": content["group_id"], "about_identity_id": content["about_identity_id"], "text": content["text"],
              "named": named, "on": str(item["at"])[:10]}
    if named:
        author = store.get_identity(item["written_by"]) or {}
        masked |= {"author_identity_id": item["written_by"], "author_name": author.get("display_name", "")}
    return masked
