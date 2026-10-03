"""組裝器 (系統做什麼): the intake's risk names a GOVERN high-risk category -> GOVERN adds the case's guardrails
(要求來源、建議找專業的人、先等一下或請人覆核; 群組程序 stays a DECIDE proposal). GOVERN gets the category, never the text."""

from __future__ import annotations

from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.safety.risk import high_risk_categories

AUTOMATIC = ("require_sources", "professional", "wait_or_review")


def add_guardrails(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, categories: list[str], found_by: str) -> list[dict[str, Any]]:
    """One guardrail of each automatic kind per category not guarded yet; returns a notice per new category."""
    if owner.kind != "case" or not categories:
        return []
    held = {(doc["content"]["guardrail"], doc["content"]["category"]) for doc in docs.current(tenant_id, owner, "govern.guardrail")}
    notices = []
    for category in categories:
        added = [kind for kind in AUTOMATIC if (kind, category) not in held]
        for kind in added:
            docs.save(tenant_id, owner, "govern.guardrail", {"guardrail": kind, "category": category, "found_by": found_by}, record_log.system("GOVERN"))
        if added:
            notices.append({"type": "guardrail", "category": category, "found_by": found_by})
    return notices


def _intake_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    return add_guardrails(docs, tenant_id, owner, high_risk_categories(content.get("risk"), content.get("question")), "ASSEMBLER")


AFTER_SAVE = {"assembler.intake": _intake_saved}
