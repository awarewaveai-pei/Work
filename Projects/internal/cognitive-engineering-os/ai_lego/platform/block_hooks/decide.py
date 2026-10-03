"""DECIDE (系統做什麼): a judgment that weighs cost, income or probability -> DECIDE proposes COMPUTE; someone listed as
affected who also decides -> DECIDE proposes COLLAB (marked as a guardrail when the case has one). High-risk words are
GOVERN's own hook (block_hooks/govern.py). Every proposal's ``why`` is a constant (never the
person's words: a proposal is never deleted)."""

from __future__ import annotations

import re
from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.block_hooks import propose

COMPARING = re.compile(r"成本|收入|機率|報酬|獲利|利潤|預算|費用|損益|回收")
# A proposal is never deleted, so its words are fixed text: nothing the person wrote (not even a name) goes into one.
COMPUTE_WHY = "判斷裡有要比成本、收入或機率的地方。要不要加計算與模擬，算給你看？"
COLLAB_WHY = "「誰會受影響」裡有人也有決定權。要不要加共同程序，一起決定？"
COLLAB_GUARDRAIL_WHY = "「誰會受影響」裡有人也有決定權。要不要加共同程序，一起決定？這個案子有護欄，這是護欄的群組程序。"
WORDS = ("conclusion", "problem_definition", "assumptions", "norm_context", "alternative", "criteria", "uncertainty", "next_step", "deciders", "options")


def _words(content: dict[str, Any]) -> list[str]:
    found: list[str] = []
    for key in WORDS:
        value = content.get(key)
        found += value if isinstance(value, list) else [value]
    return [item for item in found if isinstance(item, str)]


def also_decides(content: dict[str, Any]) -> list[str]:
    """People listed as affected whose name appears in the cell that says who decides (誰有決定權，你在這一格寫)."""
    deciders = content.get("deciders") or ""
    return [name for name in content.get("affected") or [] if isinstance(name, str) and name.strip() and name.strip() in deciders]


def _judgment_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    notices: list[dict[str, Any]] = []   # once per block per case, declined ones not again: propose() keeps that
    if COMPARING.search(" ".join(_words(content))):
        notices += propose(docs, tenant_id, owner, "DECIDE", "COMPUTE", COMPUTE_WHY, source=doc["doc_id"])
    if also_decides(content):
        if docs.current(tenant_id, owner, "govern.guardrail"):
            notices += propose(docs, tenant_id, owner, "DECIDE", "COLLAB", COLLAB_GUARDRAIL_WHY, True, source=doc["doc_id"])
        else:
            notices += propose(docs, tenant_id, owner, "DECIDE", "COLLAB", COLLAB_WHY, source=doc["doc_id"])
    return notices


AFTER_SAVE = {"decide.judgment": _judgment_saved}
