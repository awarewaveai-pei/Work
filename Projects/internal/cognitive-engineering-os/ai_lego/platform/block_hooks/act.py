"""ACT (系統做什麼): a task that names a GOVERN high-risk category -> GOVERN adds the case's guardrails. The decision to
wait or ask for a review stays the person's (the card's `hold`); GOVERN gets the category, never the text."""

from __future__ import annotations

from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.block_hooks.assembler import add_guardrails
from ai_lego.platform.safety.risk import high_risk_categories

WORDS = ("title", "prediction", "risk", "stop_condition", "escalate_condition")


def _task_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    return add_guardrails(docs, tenant_id, owner, high_risk_categories(*(doc["content"].get(key) for key in WORDS)), "ACT")


def _note_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    return add_guardrails(docs, tenant_id, owner, high_risk_categories(*(doc["content"].get(key) for key in ("happened", "thoughts", "adjustment", "blocker"))), "ACT")


AFTER_SAVE = {"act.task": _task_saved, "act.note": _note_saved}
