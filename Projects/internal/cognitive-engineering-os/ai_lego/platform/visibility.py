"""The only ways to read another person's record (docs/platform/STEP34_SHARED_RULES.md §3), so a leak has one place to
be found. R1 ``visible``: a group's records. R2 (consent, card 13) comes here too. R3, a person's own case and person
records, stays with the routes that check the owner.

CaseDocs refuses to read a group's records any other way (``current`` / ``versions`` with a group owner); its
``current_in_group`` / ``versions_in_group`` are called from this module only (tests/unit/test_visibility.py).
Nothing here logs or caches: a read is decided against the records and the membership as they are now.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_lego.core.domain import doc_kinds
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation


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


def is_appeal_handler(viewer: Viewer) -> bool:
    """Stub until card 13 reads identity_roles: nobody handles appeals yet."""
    return False


def is_eligible_facilitator(viewer: Viewer) -> bool:
    """Stub until card 60 derives it from a teach.completion record: nobody is eligible yet."""
    return False


def is_eligible_supervisor(viewer: Viewer) -> bool:
    """Stub until card 60 derives it (facilitator + a facilitate.log): nobody is eligible yet."""
    return False


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
    if not visible(docs, viewer, group_id, kind, doc_id=doc_id):
        raise InvariantViolation(f"DOC_NOT_FOUND: {doc_id!r}")
    return docs.versions_in_group(viewer.tenant_id, group_id, kind, doc_id)
