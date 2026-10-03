"""THINK around a save.
- High-risk words in a round, a card or a reason are GOVERN's own hook (block_hooks/govern.py).
- BEFORE_SAVE (``think.reaction``): your answer to a card points at a card of this case, one answer per card, and at most
  three picked cards in a round (你自己選三張卡，帶到下一步)."""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.kinds.think import MAX_PICKED
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation

def _reaction_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    cards = {doc["doc_id"]: doc["content"] for doc in docs.current(tenant_id, owner, "think.card")}
    card = cards.get(content["card"]) if isinstance(content.get("card"), str) else None
    if card is None:
        raise InvariantViolation(f"THINK_CARD_NOT_FOUND: no card {content.get('card')!r} in this case")
    others = [doc for doc in docs.current(tenant_id, owner, "think.reaction") if doc["doc_id"] != doc_id]
    if any(doc["content"].get("card") == content["card"] for doc in others):
        raise InvariantViolation("THINK_REACTION_ALREADY_GIVEN: this card has your reaction; change that one")
    held = next((doc for doc in docs.current(tenant_id, owner, "think.reaction") if doc["doc_id"] == doc_id), None)
    if held is not None and held["content"].get("card") != content["card"]:
        raise InvariantViolation("THINK_REACTION_CARD_FIXED: a reaction stays with the card it was written for")
    if content.get("picked") and sum(1 for doc in others if doc["content"].get("picked") and cards.get(doc["content"].get("card"), {}).get("round") == card["round"]) >= MAX_PICKED:
        raise InvariantViolation(f"THINK_PICK_LIMIT: {MAX_PICKED} cards are picked in this round already; take one back first")


BEFORE_SAVE = {"think.reaction": _reaction_checked}
