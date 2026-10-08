"""The only ways to read another person's record (docs/platform/STEP34_SHARED_RULES.md §3), so a leak has one place to
be found. R1 ``visible``: a group's records. R2 ``shared_with``: documents of another person's case, through their live
consent. R3, a person's own case and person records, stays with the routes that check the owner. ``appeals_for`` (§9):
the platform's appeals, with who wrote them masked.

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
from ai_lego.platform.identity.store import IdentityStore


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


def is_eligible_facilitator(viewer: Viewer) -> bool:
    """Derived from a teach.completion of the facilitator course (§5) -- built by card 60. Until then it refuses to
    answer, so nothing passes on a guess."""
    raise NotImplementedError("is_eligible_facilitator: derived from teach.completion records, built by card 60")


def is_eligible_supervisor(viewer: Viewer) -> bool:
    """Facilitator + at least one facilitate.log (§5) -- built by card 60; refuses to answer until then."""
    raise NotImplementedError("is_eligible_supervisor: derived from facilitate.log records, built by card 60")


def visible(docs: CaseDocs, viewer: Viewer, group_id: str, kind: str, *, doc_id: str | None = None) -> list[dict[str, Any]]:
    """R1: what of a group's records of ``kind`` this viewer reads now (``doc_id``: that one document, or nothing).

    - What the viewer wrote (the first version is theirs) is always theirs to read -- also after leaving (G3).
    - Others' records only for a current member who is not held for review (§4 pending_review), as the kind's
      ``visibility`` allows: members | author_only (none) | convener_and_author (the convener) | self_and_govern (none
      here: GOVERN reads the place on its own path).
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
    elif spec.blind:   # the rounds come from all the viewer's own records, whatever one document was asked for
        rounds = {item["content"][spec.blind] for item in mine}
        shown = [item for item in items if item["written_by"] == viewer.identity_id or item["content"].get(spec.blind) in rounds]
    else:
        shown = items
    return [item for item in shown if doc_id is None or item["doc_id"] == doc_id]


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
        if grantee_id != viewer.identity_id:
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
                found = _named_document(docs, repo, tenant_id, owner_id, item, bool(terms.get("follow_versions")))
                if found is not None:
                    shown.append({"owner_identity_id": owner_id, "consent_id": consent["doc_id"], "project_id": item["project_id"], **found})
    return shown


def _named_document(docs: CaseDocs, repo: ProjectSourceRepository, tenant_id: str, owner_id: str, item: dict[str, Any], follow: bool) -> dict[str, Any] | None:
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


def _supervisees(docs: CaseDocs, viewer: Viewer) -> set[str]:
    """Whom this viewer supervises (``facilitate.supervision``, §9) -- card 61 makes it real. Until then nobody, so a
    supervisor reads no appeal yet: never wider than built."""
    return set()


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
