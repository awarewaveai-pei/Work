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

# 設定 the person can read about, each explained once, in plain words, in the system's own sentences (no AI writes them: GOVERN.explain
# was an AI turn until 2026-10-12, docs/platform/AI_TO_CODE_AUDIT.md §1). The page reads them from GET /blocks/govern/spec.
# None of them may carry a crisis word (test_block_govern).
SETTINGS = {
    "where": ("你在哪裡", "你可以寫下你在哪個地方，也可以不寫。寫了，出現危急的時候，系統會給你那個地方的求助電話；不寫，就給世界各地都能用的。沒有案子的時候，只有這一項會被讀到，而且只用來給求助資源。"),
    "guardrails": ("護欄", "案子碰到健康、法律、金錢、人身安全或要公開散布的事，系統會加護欄，也就是多一層提醒。護欄有幾種：要求來源（AI 說到事實要附出處）、建議找專業的人、碰到不能反悔的事先等一下或請人看看。你在護欄頁看得到加了哪些、是哪一塊發現的；內容不會被護欄記下來。"),
    "export": ("匯出", "你可以把一個案子，或你所有的資料，下載成檔案。檔案有兩種：程式讀得懂的 JSON，和人讀得懂的 Markdown。每一筆都寫著是誰寫的（你、AI、共同或系統）和哪一塊寫的。匯出只是把資料搬出來，不經過 AI。"),
    "erase": ("刪除", "你可以刪掉一個案子，或刪掉整個帳號。刪帳號會先刪掉你所有的案子和個人紀錄，再刪掉帳號本身。刪掉就回不來。系統只留一筆「已抹除」的標記，裡面沒有你寫的任何內容。"),
    "versions": ("版本紀錄", "每次 AI 回答，系統都記下用了哪個模型，和給它的指令是哪一版（用一串指紋代表）。你可以在案子的護欄與版本頁查到。規則改了，版本就會變。"),
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
