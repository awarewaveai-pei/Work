"""GOVERN's records beyond govern.py (build step 1): what the AI said when asked to explain a setting (card 「AI 能做什麼」:
AI 解釋設定是什麼意思). The AI's words only; it is not a record of the person's choice and the person can delete it."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field

KINDS = [
    DocKind("govern.explanation", "GOVERN", "AI 解釋設定", {
        "explanation": Field("text", 1500, required=True),
    }, owner="person", authors=frozenset({"ai"})),
]
