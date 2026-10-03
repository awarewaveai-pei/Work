"""協作合約: what the AI may do in this case (the five fields on the contract card). The AI gate reads the latest
version before every AI call (架構頁的第三個關卡); each change is a new version (每次修改都留一版)."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field

# 你沒准的時候，AI 只提問、整理、指出還缺什麼 -- always allowed.
ALWAYS = ("organize", "ask", "point_gaps")
# What the person can grant (「AI 的角色與權限：可否找資料、提出選項、排序、模擬反方、給直接建議？」). The places are the
# other way round: given unless withheld (規範與脈絡: 每次呼叫 AI 時，系統把發生地和你在哪裡交給 AI；你在協作合約裡可以不給)
# -- ``hide_places`` below.
GRANTABLE = {
    "search_external": "找外部資料（只引用有來源卡的）",
    "propose_options": "提出選項",
    "rank": "排序（只是參考）",
    "counter": "當反方",
    "direct_advice": "給直接建議",
}

KINDS = [
    DocKind("collab_contract.terms", "COLLAB_CONTRACT", "協作合約", {
        "scope": Field("choice", choices=("釐清", "探索", "比較", "做決定")),       # 這次做什麼、決定到哪裡
        "human_parts": Field("text", 2000),                                          # 人不可委託的部分
        "permissions": Field("choices", len(GRANTABLE), choices=tuple(GRANTABLE)),   # AI 的角色與權限
        "basis": Field("text", 2000),                                                # 依據與脈絡
        "handback": Field("text", 2000),                                             # 交還控制的條件
        "hide_places": Field("bool"),                                                # 不讓 AI 知道發生地和你在哪裡
    }, deletable=False, singleton=True),
]


def places_hidden(terms: dict | None) -> bool:
    return bool((terms or {}).get("hide_places"))


def allowed(terms: dict | None) -> frozenset[str]:
    """Every action the AI may take under these terms (no terms = only the always-allowed ones)."""
    return frozenset(ALWAYS) | frozenset((terms or {}).get("permissions") or ())
