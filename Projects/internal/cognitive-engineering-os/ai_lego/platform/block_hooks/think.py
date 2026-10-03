"""THINK (交還控制): what the person writes in a round or on a card names one of GOVERN's high-risk categories -> THINK asks
GOVERN to add the case's guardrails (要求來源、建議找專業的人、先等一下或請人覆核). GOVERN gets the category, never the text."""

from __future__ import annotations

from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.block_hooks.assembler import add_guardrails
from ai_lego.platform.safety.risk import high_risk_categories

CARD_FIELDS = ("claim", "mechanism", "benefit", "risk", "assumption", "reason")


def _round_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    return add_guardrails(docs, tenant_id, owner, high_risk_categories(content.get("problem"), *(content.get("own") or []), *(content.get("criteria") or []), content.get("reflection")), "THINK")


def _card_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    return add_guardrails(docs, tenant_id, owner, high_risk_categories(*(doc["content"].get(field) for field in CARD_FIELDS)), "THINK")


AFTER_SAVE = {"think.round": _round_saved, "think.card": _card_saved}
