"""GOVERN's records (contract card 「寫什麼」): 護欄 on a case, the stops the AI made, and the account's 「你在哪裡」.
GOVERN only receives a category -- never the content that set it off."""

from __future__ import annotations

from ai_lego.core.domain.blocks import ALL_CODES
from ai_lego.core.domain.doc_kinds import DocKind, Field

HIGH_RISK = ("健康", "法律", "金錢", "人身安全", "急性心理危機", "要公開散布")
GUARDRAILS = {
    "require_sources": "要求來源",
    "professional": "建議找專業的人",
    "wait_or_review": "先等一下或請人覆核",
    "group_procedure": "群組程序（提議，你同意才加）",
}

KINDS = [
    DocKind("govern.guardrail", "GOVERN", "護欄", {
        "guardrail": Field("choice", choices=tuple(GUARDRAILS), required=True),
        "category": Field("choice", choices=HIGH_RISK, required=True),
        "found_by": Field("choice", choices=ALL_CODES, required=True),
    }, authors=frozenset({"system"}), deletable=False),
    DocKind("govern.stop", "GOVERN", "AI 停下來的紀錄", {
        "reason": Field("choice", choices=("crisis", "stop_signal", "person_stopped"), required=True),
        "block": Field("choice", choices=ALL_CODES, required=True),
    }, authors=frozenset({"system"}), deletable=False),
    DocKind("govern.location", "GOVERN", "你在哪裡", {
        "where": Field("text", 200, required=True),
    }, owner="person"),
    # 版本紀錄: every AI call names its model and the exact instructions (by hash) -- 你可以查這個案子用了哪個模型、哪一版規則
    *[DocKind(kind, "GOVERN", "AI 這次用的模型和指令", {
        "block": Field("choice", choices=ALL_CODES, required=True),
        "action": Field("text", 80, required=True),
        "model": Field("text", 120, required=True),
        "instructions_sha256": Field("text", 64, required=True),
    }, owner=owner, authors=frozenset({"system"}), deletable=False) for kind, owner in (("govern.ai_call", "case"), ("govern.ai_call_personal", "person"))],
]
