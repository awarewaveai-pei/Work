"""LEARN (系統做什麼 / 產出給誰): the blocks the person picks to add next round go to the assembler as LEARN's proposals
(你同意才加). High-risk words -- in a case and on a daily card outside one (系統建議你開一個案子) -- are GOVERN's own
hook (block_hooks/govern.py). The card's words are not copied into a case (別的積木讀不到你的個人歷程)."""

from __future__ import annotations

from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.block_hooks import propose

WORDS = ("outcome", "prediction_note", "missed", "step_done", "direction", "process", "luck", "other_method", "updated_conditions", "delegate_note")


def _calibration_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    notices: list[dict[str, Any]] = []
    earlier = [version for version in docs.versions(tenant_id, owner, doc["kind"], doc["doc_id"]) if version["version"] < doc["version"]]
    before = set(earlier[-1]["content"].get("next_blocks") or []) if earlier else set()
    for block in content.get("next_blocks") or []:
        if block not in before:   # standing, declined or already in the case: propose() keeps those out
            notices += propose(docs, tenant_id, owner, "LEARN", block, "回顧時你選了這一塊，想看它會不會改變結果。", source=doc["doc_id"])
    return notices


AFTER_SAVE = {"learn.calibration": _calibration_saved}
