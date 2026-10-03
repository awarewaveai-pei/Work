"""SENSE (系統做什麼): a card that carries someone else's claim (「聽說」「他說」「網路上寫」) -> SENSE proposes VERIFY."""

from __future__ import annotations

import re
from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.block_hooks import propose

HEARSAY = re.compile(r"聽說|據說|他說|她說|他們說|有人說|網路上|網上|新聞說|新聞報|群組裡|轉傳|流傳")


WHY_VERIFY = "你的卡片裡有別人的說法（聽說、他說、網路上寫的）。要不要查一下是誰說的、別的地方怎麼報？"


def _card_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    found = HEARSAY.search(content.get("text", "")) or content.get("category") == "別人的聲音"
    if not found:
        return []
    return propose(docs, tenant_id, owner, "SENSE", "VERIFY", WHY_VERIFY, source=doc["doc_id"])


AFTER_SAVE = {"sense.card": _card_saved}
