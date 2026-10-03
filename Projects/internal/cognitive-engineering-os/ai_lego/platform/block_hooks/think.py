"""THINK around a save.
- AFTER_SAVE (交還控制): what the person writes in a round, on a card or as a reason names one of GOVERN's high-risk categories ->
  THINK asks GOVERN to add the case's guardrails (要求來源、建議找專業的人、先等一下或請人覆核). GOVERN gets the category, never the text.
- BEFORE_SAVE (``think.reaction``): your answer to a card points at a card of this case, one answer per card, and at most
  three picked cards in a round (你自己選三張卡，帶到下一步)."""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.kinds.think import MAX_PICKED
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform.block_hooks.assembler import add_guardrails
from ai_lego.platform.safety.risk import high_risk_categories

CARD_FIELDS = ("claim", "mechanism", "benefit", "risk", "assumption")


def _round_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    return add_guardrails(docs, tenant_id, owner, high_risk_categories(content.get("problem"), *(content.get("own") or []), *(content.get("criteria") or []), content.get("reflection")), "THINK")


def _card_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    return add_guardrails(docs, tenant_id, owner, high_risk_categories(*(doc["content"].get(field) for field in CARD_FIELDS)), "THINK")


def _reaction_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    return add_guardrails(docs, tenant_id, owner, high_risk_categories(doc["content"].get("reason")), "THINK")


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


AFTER_SAVE = {"think.round": _round_saved, "think.card": _card_saved, "think.reaction": _reaction_saved}
BEFORE_SAVE = {"think.reaction": _reaction_checked}
