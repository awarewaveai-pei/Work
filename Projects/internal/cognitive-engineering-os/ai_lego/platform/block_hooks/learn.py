"""LEARN (系統做什麼 / 產出給誰): the blocks the person picks to add next round go to the assembler as LEARN's proposals
(你同意才加); a high-risk word -> GOVERN adds the guardrails; a high-risk word on a daily card (outside any case) ->
the person is advised to open a case. The card's words are not copied into a case (別的積木讀不到你的個人歷程)."""

from __future__ import annotations

from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.block_hooks import propose
from ai_lego.platform.block_hooks.assembler import add_guardrails
from ai_lego.platform.safety.risk import high_risk_categories

WORDS = ("outcome", "prediction_note", "missed", "step_done", "direction", "process", "luck", "other_method", "updated_conditions", "delegate_note")


def _calibration_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    notices = add_guardrails(docs, tenant_id, owner, high_risk_categories(*(content.get(key) for key in WORDS)), "LEARN")
    earlier = docs.versions(tenant_id, owner, doc["kind"], doc["doc_id"])
    before = set(earlier[-2]["content"].get("next_blocks") or []) if len(earlier) > 1 else set()
    already = {item["content"]["propose"] for item in docs.current(tenant_id, owner, "assembler.proposal.learn")}
    for block in content.get("next_blocks") or []:
        if block not in before and block not in already:
            notices += propose(docs, tenant_id, owner, "LEARN", block, "回顧時你選了這一塊，想看它會不會改變結果。")
    return notices


def _daily_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    categories = high_risk_categories(*(doc["content"].get(key) for key in ("text", "counterexample", "change_condition")))
    if not categories:
        return []
    return [{"type": "open_case", "categories": categories, "notice": "這張卡寫到比較高風險的事。要不要開一個案子，在案子裡處理？卡上的內容不會自動帶過去，要的話你自己貼進開案資料。"}]


AFTER_SAVE = {"learn.calibration": _calibration_saved, "learn.daily": _daily_saved}
