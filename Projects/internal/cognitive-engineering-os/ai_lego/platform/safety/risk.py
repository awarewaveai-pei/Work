"""Which of GOVERN's high-risk categories a text touches (高風險：健康、法律、金錢、人身安全、急性心理危機、要公開散布).
The assembler runs it on the intake's risk and question (組裝器從你開案時寫的風險認出來); a block that sees content runs it
on what it reads. It returns categories only -- GOVERN never receives the text (GOVERN 只收到是哪一類，不看內容).

A word list, like the crisis check: it over-triggers on purpose (a guardrail costs a reminder; a missed one costs more)."""

from __future__ import annotations

import re

from ai_lego.core.domain.kinds.govern import HIGH_RISK
from ai_lego.platform.safety import crisis_signal

_WORDS = {
    "健康": "健康|生病|疾病|症狀|診斷|醫生|醫院|吃藥|藥物|手術|懷孕|治療|health|medical|diagnos|medication|surgery|pregnan",
    "法律": "法律|法院|律師|提告|告他|訴訟|合約|契約|違法|判決|警察|罰|lawyer|lawsuit|court|contract|legal|illegal|police",
    "金錢": "錢|投資|借款|貸款|負債|債務|股票|基金|房貸|薪水|存款|虛擬貨幣|加密貨幣|保險|money|invest|loan|debt|stock|crypto|mortgage",
    "人身安全": "人身安全|威脅|跟蹤|暴力|被打|恐嚇|危險|家暴|safety|threat|stalk|violence|danger",
    "要公開散布": "公開|發文|貼文|轉傳|分享出去|爆料|媒體|記者|publish|post publicly|go public|press",
}
_PATTERNS = {category: re.compile(words, re.IGNORECASE) for category, words in _WORDS.items()}
assert set(_WORDS) | {"急性心理危機"} == set(HIGH_RISK)


def high_risk_categories(*texts: object) -> list[str]:
    """The categories, in HIGH_RISK's order."""
    words = [text for text in texts if isinstance(text, str)]
    found = {category for category, pattern in _PATTERNS.items() if any(pattern.search(text) for text in words)}
    if crisis_signal(*words):
        found.add("急性心理危機")
    return [category for category in HIGH_RISK if category in found]
