"""THINK around a save.
- High-risk words in a round, a card or a reason are GOVERN's own hook (block_hooks/govern.py).
- BEFORE_SAVE, what a person's save may not do:
  * ``think.round``: change the own version once the AI has answered the round (先想再看 is a rule of the record, not of one page);
  * ``think.card``: belong to a round that is not this case's, or write or change what the system sets when an AI batch is laid
    out (round, role, method, sourced, batch) -- a card you moved or relabelled could not be told from the AI's;
  * ``think.reaction``: your answer to a card points at a card of this case, one answer per card, and at most three picked
    cards in a round (你自己選三張卡，帶到下一步);
  * ``think.response``: your answer to a reply names a reply of this case and the version of it that you answered."""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.kinds.think import MAX_PICKED
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation

SET_BY_THE_SYSTEM = ("role", "method", "sourced", "batch", "batch_index")   # what laying out a batch fills in; your own card has none of it


def _blank(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _live(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, kind: str, doc_id: Any) -> dict[str, Any] | None:
    return next((doc for doc in docs.current(tenant_id, owner, kind) if doc["doc_id"] == doc_id), None) if isinstance(doc_id, str) else None


def _round_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    held = _live(docs, tenant_id, owner, "think.round", doc_id)
    if held is None or (content.get("own") or []) == (held["content"].get("own") or []):
        return
    if any(doc["content"].get("round") == doc_id for kind in ("think.reply", "think.batch") for doc in docs.current(tenant_id, owner, kind)):
        raise InvariantViolation("THINK_OWN_VERSION_FIXED: the AI has answered this round, so your own version stays as you wrote it; add what you think now as cards")


def _card_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    held = _live(docs, tenant_id, owner, "think.card", doc_id)
    if doc_id is None:
        if not _blank(content.get("round")) and _live(docs, tenant_id, owner, "think.round", content.get("round")) is None:   # no round at all is the kind's own 「required」
            raise InvariantViolation(f"THINK_ROUND_NOT_FOUND: no round {content.get('round')!r} in this case")
        fixed = [field for field in SET_BY_THE_SYSTEM if not _blank(content.get(field))]
    elif held is not None:
        fixed = [field for field in ("round", *SET_BY_THE_SYSTEM) if (None if _blank(content.get(field)) else content[field]) != held["content"].get(field)]
    else:
        return
    if fixed:
        raise InvariantViolation(f"THINK_CARD_FIELD_FIXED: {', '.join(fixed)} is set when the card is made and is not written or changed by you")


def _reaction_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    cards = {doc["doc_id"]: doc["content"] for doc in docs.current(tenant_id, owner, "think.card")}
    card = cards.get(content["card"]) if isinstance(content.get("card"), str) else None
    if card is None:
        raise InvariantViolation(f"THINK_CARD_NOT_FOUND: no card {content.get('card')!r} in this case")
    others = [doc for doc in docs.current(tenant_id, owner, "think.reaction") if doc["doc_id"] != doc_id]
    if any(doc["content"].get("card") == content["card"] for doc in others):
        raise InvariantViolation("THINK_REACTION_ALREADY_GIVEN: this card has your reaction; change that one")
    held = _live(docs, tenant_id, owner, "think.reaction", doc_id)
    if held is not None and held["content"].get("card") != content["card"]:
        raise InvariantViolation("THINK_REACTION_CARD_FIXED: a reaction stays with the card it was written for")
    if content.get("picked") and sum(1 for doc in others if doc["content"].get("picked") and cards.get(doc["content"].get("card"), {}).get("round") == card["round"]) >= MAX_PICKED:
        raise InvariantViolation(f"THINK_PICK_LIMIT: {MAX_PICKED} cards are picked in this round already; take one back first")


def _response_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    reply = _live(docs, tenant_id, owner, "think.reply", content.get("reply"))
    if reply is None:
        raise InvariantViolation(f"THINK_REPLY_NOT_FOUND: no reply {content.get('reply')!r} in this case")
    if content.get("version") is not None and content["version"] != reply["version"]:
        raise InvariantViolation(f"THINK_REPLY_STALE: the reply is at version {reply['version']}, not {content['version']!r}")


BEFORE_SAVE = {"think.round": _round_checked, "think.card": _card_checked, "think.reaction": _reaction_checked, "think.response": _response_checked}
