"""Which of GOVERN's high-risk categories a text touches (高風險：健康、法律、金錢、人身安全、急性心理危機、要公開散布).
The assembler runs it on the intake's risk and question (組裝器從你開案時寫的風險認出來); a block that sees content runs it
on what it reads. It returns categories only -- GOVERN never receives the text (GOVERN 只收到是哪一類，不看內容).

A word list, like the crisis check: a guardrail costs a reminder, a missed one costs more, so it leans to firing. It
still does not fire on a common word used in its everyday sense: 健康的關係, 非暴力溝通, 社群媒體, 保險起見, "investigate",
"pressure", a SWOT's "threats". Each category lists the compounds that carry the risk, not the bare common word."""

from __future__ import annotations

import re

from ai_lego.core.domain.kinds.govern import HIGH_RISK
from ai_lego.platform.safety import BEATEN, crisis_signal, digest, normalise

WORDS = {
    "健康": (
        "健康(?:問題|狀況|檢查|出問題|惡化|警訊|亮紅燈|不好|受損|風險)", "(?:身體|身心|心理|精神|情緒|影響|損害)健康", "身體(?:不舒服|出狀況|有問題|不好)",
        "生病|疾病|症狀|診斷|醫生|醫師|醫院|診所|看診|門診|急診|吃藥|服藥|藥物|手術|懷孕|復健|癌|慢性病|(?<!藝術)治療",
        r"\b(?:health(?:care)?|medical|medication|surgery|diagnos(?:is|ed|e)|symptoms?|pregnan(?:t|cy)|illness|disease|doctor|hospital)\b",
    ),
    "法律": (
        "法律|法院|法官|律師|律师|提告|告他|告她|被告|訴訟|诉讼|合約|合同|契約|違約|違法|违法|判決|判决|報警|警察|傳票|罰款|罰單|罰金|裁罰|侵權|誹謗",
        r"\b(?:lawyers?|attorneys?|lawsuits?|sued|suing|courts?|legal|illegal|police|contracts?|subpoena|litigation)\b",
    ),
    "金錢": (
        "錢(?!包|幣|币|老師|老师|先生|小姐|同學|同学)", "钱(?!包|币|老师|先生|小姐|同学)",
        "投資|投资|借款|貸款|贷款|負債|负债|債務|债务|股票|基金(?!會|会)|房貸|房贷|薪水|薪資|薪资|存款|虛擬貨幣|虚拟货币|加密貨幣|加密货币|保險(?!起見|起见)|保险(?!起见)|破產|破产|欠款|積蓄|积蓄|退休金",
        r"\b(?:money|invest(?:ing|ment|ments|ed|or|ors)?|loans?|debts?|stock market|crypto(?:currency)?|mortgage|salary|insurance|savings|bankrupt(?:cy)?)\b",
    ),
    "人身安全": (
        "人身安全|人身危險|生命危險|(?:被|受到|遭到|遭)威脅|威脅(?:我|他|她|要|說)|恐嚇|恐吓|跟蹤|跟踪|(?<!非)暴力|" + BEATEN + "|家暴|(?:很|有)危險|危險(?:的人|人物|情況|處境|地區|行為|關係)|不安全(?!感)|安全堪虞",
        r"\b(?:threaten(?:s|ed|ing)?|death threats?|stalk(?:ed|ing|er)|violen(?:ce|t)|in danger|dangerous|unsafe|personal safety)\b",
    ),
    "要公開散布": (
        "公開(?:發表|發布|發佈|道歉|聲明|信|說|講|指控|揭露|貼|散布|散佈|出去|承認)|發文|貼文|轉傳|分享出去|爆料|(?<![群交多])媒體|記者|發布|發佈|散布|散佈",
        r"\b(?:publish(?:ed|ing)?|post(?:ing)? (?:it )?publicly|go(?:ing)? public|press release|journalists?|reporters?|the press|leak(?:ed|ing)?|whistle-?blow\w*)\b",
    ),
}
_PATTERNS = {category: re.compile("|".join(f"(?:{fragment})" for fragment in fragments), re.IGNORECASE) for category, fragments in WORDS.items()}
assert set(WORDS) | {"急性心理危機"} == set(HIGH_RISK)


def high_risk_categories(*texts: object) -> list[str]:
    """The categories, in HIGH_RISK's order."""
    words = [normalise(text) for text in texts if isinstance(text, str)]
    found = {category for category, pattern in _PATTERNS.items() if any(pattern.search(text) for text in words)}
    if crisis_signal(*words):
        found.add("急性心理危機")
    return [category for category in HIGH_RISK if category in found]


def fingerprint() -> str:
    """The version of the word lists a guardrail is decided with."""
    return digest(WORDS)
