"""COLLAB around a member's save of a group record (docs/platform/STEP34_SHARED_RULES.md §7, card 20).

``check_save`` runs as the save's batch check (CaseDocs.save_many under the group lock held exclusive, from
apps/api/blocks/collab.py ``_save_group``): what it reads cannot change before the write commits. It reads only through
platform/visibility.py, as the writer. ``derived`` names the system's records the save brings (written in its transaction): a dissent
from each objection, a renegotiation notice from a share of authority taken back. Both name the record they come from
(a copy is a pointer) and carry the member's identity, so they go with that member's account erasure.

These take the writer's identity, which the generic BEFORE_SAVE / AFTER_SAVE registry does not pass: they are called by the
one route that saves a group's records, and nothing else saves COLLAB's group kinds for a person."""

from __future__ import annotations

from typing import Any, Callable

from ai_lego.core.domain.kinds.collab import INTERFACE_QUESTIONS
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform import visibility
from ai_lego.platform.visibility import Viewer

SHARED_WORDING = ("collab.question",)   # any member writes a new version of these (every wording stays); others: their writer only
ONE_PER_MEMBER = ("collab.place", "collab.label")
ONE_PER_ROUND = ("collab.position", "collab.change", "collab.interface_answers")
OWN_LIST = (*ONE_PER_MEMBER, *ONE_PER_ROUND, "collab.stance", "collab.authority")   # kinds whose rules look at the writer's other records
EVIDENCE_KEYS = {"project_id", "kind", "doc_id"}


def _own(docs: CaseDocs, me: Viewer, group_id: str, kind: str) -> list[dict[str, Any]]:
    return [item for item in visibility.visible(docs, me, group_id, kind) if item["written_by"] == me.identity_id]


def _already() -> InvariantViolation:
    return InvariantViolation("COLLAB_ALREADY_WRITTEN: you already wrote this one; save a new version of it instead")


def _answers(content: dict[str, Any]) -> None:
    answers, asked = content.get("answers"), set(INTERFACE_QUESTIONS)
    if not isinstance(answers, list) or len(answers) != len(asked):   # all of them: a part would open the round's blind answers
        raise InvariantViolation("COLLAB_ANSWERS_INVALID: answers is a list of {q, text}, one for each interface question")
    seen = set()
    for answer in answers:
        if (not isinstance(answer, dict) or set(answer) != {"q", "text"} or answer["q"] not in asked or answer["q"] in seen
                or not isinstance(answer["text"], str) or not answer["text"].strip() or len(answer["text"]) > 2000):
            raise InvariantViolation("COLLAB_ANSWERS_INVALID: answers is a list of {q, text} for the interface questions")
        seen.add(answer["q"])


def check_save(docs: CaseDocs, tenant_id: str, group_id: str, identity_id: str, kind: str, content: dict[str, Any], doc_id: str | None) -> None:
    """Refuses what a kind's own fields cannot see. Raises InvariantViolation."""
    me = Viewer(tenant_id, identity_id)
    if doc_id is not None and kind not in SHARED_WORDING:   # the convener is not a judge: nobody versions another's record
        found = visibility.visible(docs, me, group_id, kind, doc_id=doc_id)
        if not found:
            raise InvariantViolation(f"DOC_NOT_FOUND: {doc_id!r}")
        if found[0]["written_by"] != identity_id:
            raise InvariantViolation("COLLAB_NOT_YOURS: in a group, only the person who wrote a record writes its next version")
    others_of_mine = [item for item in _own(docs, me, group_id, kind) if item["doc_id"] != doc_id] if kind in OWN_LIST else []
    if kind in ONE_PER_MEMBER and others_of_mine:
        raise _already()
    if kind in ONE_PER_ROUND and any(item["content"]["round"] == content.get("round") for item in others_of_mine):
        raise _already()
    RULES.get(kind, lambda *args: None)(docs, me, group_id, content, doc_id, others_of_mine)


def _change(docs: CaseDocs, me: Viewer, group_id: str, content: dict[str, Any], doc_id: str | None, mine: list) -> None:
    if not any(item["content"]["round"] == content.get("round") for item in _own(docs, me, group_id, "collab.position")):
        raise InvariantViolation("COLLAB_READ_FIRST: write your own position for this round first; then you read the others' and say what changed")


def _interface(docs: CaseDocs, me: Viewer, group_id: str, content: dict[str, Any], doc_id: str | None, mine: list) -> None:
    _answers(content)


def _option(docs: CaseDocs, me: Viewer, group_id: str, content: dict[str, Any], doc_id: str | None, mine: list) -> None:
    refs = content.get("evidence_refs")
    refs = [] if refs is None else refs   # only absent is none: a falsy wrong type is refused below
    if not isinstance(refs, list) or any(not isinstance(ref, dict) or set(ref) != EVIDENCE_KEYS or not all(isinstance(value, str) for value in ref.values()) for ref in refs):
        raise InvariantViolation("COLLAB_EVIDENCE_INVALID: each piece of evidence names {project_id, kind, doc_id}")


def _stance(docs: CaseDocs, me: Viewer, group_id: str, content: dict[str, Any], doc_id: str | None, mine: list) -> None:
    option = content.get("option")
    if not visibility.visible(docs, me, group_id, "collab.option", doc_id=option):
        raise InvariantViolation(f"COLLAB_OPTION_NOT_FOUND: {option!r}")
    if any(item["content"]["option"] == option for item in mine):   # one live stance per (member, option)
        raise _already()


def _authority(docs: CaseDocs, me: Viewer, group_id: str, content: dict[str, Any], doc_id: str | None, mine: list) -> None:
    revoked = content.get("revoked_by")
    revoked = [] if revoked is None else revoked
    if any(who != me.identity_id for who in revoked):
        raise InvariantViolation("COLLAB_REVOKE_OWN_ONLY: each person takes back only their own share")
    if docs.reads.membership(me.tenant_id, group_id, str(content.get("to"))) is None:
        raise InvariantViolation("COLLAB_AUTHORITY_TO_NOT_MEMBER: authority is given to someone in the group")
    if doc_id is None and any(not item["content"].get("revoked_by") for item in mine):   # one live share each: taking it back takes it all
        raise _already()
    if doc_id is not None:
        [before] = visibility.visible(docs, me, group_id, "collab.authority", doc_id=doc_id)
        if before["content"].get("revoked_by") and not revoked:
            raise InvariantViolation("COLLAB_REVOKED_STAYS: a share taken back stays taken back; give a new one instead")
        if before["content"]["to"] != content.get("to"):
            raise InvariantViolation("COLLAB_AUTHORITY_TO_FIXED: a share names one person; give a new one to someone else")


def _closing(docs: CaseDocs, me: Viewer, group_id: str, content: dict[str, Any], doc_id: str | None, mine: list) -> None:
    if not visibility.is_convener(docs, me, group_id):
        raise InvariantViolation("GROUP_CONVENER_ONLY: only a convener writes how the discussion ends")


def _confirm(docs: CaseDocs, me: Viewer, group_id: str, content: dict[str, Any], doc_id: str | None, mine: list) -> None:
    """Only the member a restatement is about answers it (its writer identity is theirs); one answer each, versioned."""
    restatement = content.get("restatement")
    found = visibility.visible(docs, me, group_id, "collab.restatement", doc_id=restatement)
    if not found:
        raise InvariantViolation(f"COLLAB_RESTATEMENT_NOT_FOUND: {restatement!r}")
    if found[0]["written_by"] != me.identity_id:
        raise InvariantViolation("COLLAB_CONFIRM_SUBJECT_ONLY: only the person it is about says whether a restatement is right")
    if any(item["content"]["restatement"] == restatement for item in _own(docs, me, group_id, "collab.confirm") if item["doc_id"] != doc_id):
        raise _already()


RULES: dict[str, Callable[..., None]] = {
    "collab.confirm": _confirm,
    "collab.change": _change, "collab.interface_answers": _interface, "collab.option": _option, "collab.stance": _stance,
    "collab.authority": _authority, "collab.closing": _closing,
}


def derived(docs: CaseDocs, tenant_id: str, group_id: str, identity_id: str, doc: dict[str, Any]) -> list[tuple[str, dict[str, Any], record_log.Writer]]:
    """The system's records a member's save brings, written in the save's own transaction (CaseDocs.save_many ``derive``:
    an objection never commits without its dissent). Each is the system's on that member's behalf, so their account
    erasure takes it: an objection is kept as a dissent -- one per version that said 異議, never deleted; a share taken
    back leaves 「範圍要重新談」, once."""
    writer = record_log.Writer("system", "COLLAB", identity_id)
    if doc["kind"] == "collab.stance" and doc["content"]["stance"] == "異議":
        return [("collab.dissent", {"option": doc["content"]["option"], "stance_id": doc["doc_id"], "stance_version": doc["version"]}, writer)]
    if doc["kind"] == "collab.authority" and doc["content"].get("revoked_by"):
        me = Viewer(tenant_id, identity_id)
        if not any(item["content"]["authority"] == doc["doc_id"] for item in visibility.visible(docs, me, group_id, "collab.renegotiate")):
            return [("collab.renegotiate", {"authority": doc["doc_id"]}, writer)]
    return []


def notices(doc: dict[str, Any]) -> list[dict[str, Any]]:
    if doc["kind"] == "collab.stance" and doc["content"]["stance"] == "異議":
        return [{"type": "dissent_kept", "notice": "你的異議和理由會一直留著，不會被多數蓋掉。"}]
    if doc["kind"] == "collab.authority" and doc["content"].get("revoked_by"):
        return [{"type": "renegotiate", "notice": RENEGOTIATE}]
    return []


RENEGOTIATE = "範圍要重新談"
