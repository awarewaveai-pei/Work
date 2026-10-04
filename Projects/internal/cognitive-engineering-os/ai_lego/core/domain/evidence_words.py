"""The words GATHER, VERIFY and COMPUTE share (docs/platform/STEP2_SHARED_RULES.md §2): one copy, read by the kinds
(core) and by ``ai_lego.platform.evidence`` (the counting rules). Never retype one of these strings elsewhere."""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Mapping

from ai_lego.errors import InvariantViolation

__all__ = [
    "FOUND", "NOT_FOUND", "UNCHECKABLE", "STATES", "OWN_WORDS", "SOMEONE_SAID", "MIN_ORIGINS", "CARD_CELLS", "CARD_CELL_KEYS",
    "FOUND_BY", "GROUP_HOW", "SPLIT_HOW", "SAME_TEXT_HOW", "PENDING_HOW", "MARKS", "NOT_USED", "APPLIES", "SENTENCE_KINDS",
    "CHECKABLE", "NOT_CHECKABLE", "STANCES", "CLAIM_STATES", "NOT_SEARCHED", "NOT_READ", "VERDICTS", "LABELS", "ADOPT",
    "MIN_QUOTE", "cell", "cell_errors", "normalise_quote", "quote_in", "grouping_errors",
]

# 每一格都寫三種之一，不留空白 (GATHER card): 查到 = found; 查不到 = looked, none; 無法檢查 = no way to look
FOUND, NOT_FOUND, UNCHECKABLE = "查到", "查不到", "無法檢查"
STATES = (FOUND, NOT_FOUND, UNCHECKABLE)
OWN_WORDS = "我自己說的，還沒有外部出處"
SOMEONE_SAID = "有人這樣說"
MIN_ORIGINS = 2   # 獨立出處不到兩個時，系統停下來 (GATHER, VERIFY, COMPUTE cards)

# A source card's cells (GATHER 「來源卡每張記」), in the order a page shows them.
CARD_CELLS = (
    ("operator", "誰辦的"),
    ("registered", "何時開始存在"),
    ("country", "國家或地區"),
    ("language", "語言"),
    ("original", "原始的還是轉貼的"),
    ("first_seen", "最早何時出現"),
    ("stance", "它自己宣稱的立場"),
    ("affiliation", "查得到的隸屬"),
    ("party_relation", "跟當事方的關係"),
    ("outlet_exists", "名字像媒體時，這家媒體是不是真的存在"),
)
CARD_CELL_KEYS = tuple(key for key, _ in CARD_CELLS)
FOUND_BY = ("系統找的", "我貼的")
GROUP_HOW = ("同一篇", "同一張圖", "只互相引用", "可能同出處", "單獨")   # what GATHER's grouping may say
SPLIT_HOW = "你分開的"
SAME_TEXT_HOW = "同一份內容"     # cards on one stored page or one snapshot: never two origins, whatever the grouping says
PENDING_HOW = "還在分組"         # a card the grouping has not seen yet: shown, never counted
MARKS = ("採用", "存疑", "不用")
NOT_USED = "不用"
APPLIES = ("適用", "不適用", "不確定")   # 別國的資料拿來用之前，先標它適不適用這裡

# VERIFY: the four kinds of sentence in a message; only the first is checked for true or false
SENTENCE_KINDS = ("可以查的事實", "對事實的解釋", "價值判斷", "叫你去做的事")
CHECKABLE = SENTENCE_KINDS[0]
NOT_CHECKABLE = "不是查得了的句子"
STANCES = ("支持", "反對", "無關", "看不出")
CLAIM_STATES = ("有獨立出處支持", "有獨立出處反對", "兩邊都有", "查不到", "無法檢查")
NOT_SEARCHED = "還沒查"             # before the system looked
NOT_READ = "找到來源，還沒讀完"     # found pages, but not every counted origin has been read for this claim
VERDICTS = ("採信", "存疑", "不採信")

# COMPUTE
LABELS = ("計算結果", "模擬結果")
ADOPT = ("採用", "不採用")

MIN_QUOTE = 6   # characters after normalising: a quote shorter than this proves nothing (「第」 is in every page)
_CJK = "⺀-〿぀-鿿가-힯豈-﫿"
_SPACE_IN_CJK = re.compile(rf"(?<=[{_CJK}])\s+(?=[{_CJK}])")


def cell(state: str, value: str | None = None, why: str | None = None) -> dict[str, str]:
    """One cell: 查到 carries a value; 查不到 and 無法檢查 carry why (「這裡連不上 X」, 「平台還沒有這個金鑰」) and no value --
    a value beside 查不到 would be shown as if something were found."""
    if state not in STATES:
        raise InvariantViolation(f"EVIDENCE_CELL_INVALID: state is one of {list(STATES)}")
    if state == FOUND and not (isinstance(value, str) and value.strip()):
        raise InvariantViolation("EVIDENCE_CELL_INVALID: 查到 needs what was found")
    if state != FOUND and not (isinstance(why, str) and why.strip()):
        raise InvariantViolation(f"EVIDENCE_CELL_INVALID: {state} needs why")
    if state != FOUND and value is not None:
        raise InvariantViolation(f"EVIDENCE_CELL_INVALID: {state} has no value")
    out = {"state": state}
    if value is not None:
        out["value"] = value
    if why is not None:
        out["why"] = why
    return out


def cell_errors(cells: Any) -> list[str]:
    """What is wrong with a card's ``cells``: every key of CARD_CELLS present (不留空白), nothing else, each a cell."""
    if not isinstance(cells, Mapping):
        return ["cells is an object"]
    errors = [f"missing {key}" for key in CARD_CELL_KEYS if key not in cells]
    errors += [f"unknown {key}" for key in cells if key not in CARD_CELL_KEYS]
    for key in CARD_CELL_KEYS:
        value = cells.get(key)
        if key in cells:
            try:
                if not isinstance(value, Mapping) or set(value) - {"state", "value", "why"}:
                    raise InvariantViolation("shape")
                cell(value.get("state"), value.get("value"), value.get("why"))
            except InvariantViolation:
                errors.append(f"{key} is not a cell")
    return errors


def normalise_quote(text: str) -> str:
    """One normaliser for 「引文對得上原文」: NFKC (full- and half-width punctuation alike), no line break or space between
    two CJK characters (OCR, PDF and screenshot text break sentences anywhere), other whitespace collapsed."""
    folded = unicodedata.normalize("NFKC", text)
    return " ".join(_SPACE_IN_CJK.sub("", folded).split())


def quote_in(quote: Any, text: str) -> bool:
    """A quote is the source's words: at least MIN_QUOTE characters and found in the text, both normalised."""
    if not isinstance(quote, str):
        return False
    wanted = normalise_quote(quote)
    return len(wanted) >= MIN_QUOTE and wanted in normalise_quote(text)


def grouping_errors(groups: Any) -> list[str]:
    """What is wrong with ``gather.origins.groups``: a list of {"cards": [card ids], "how": GROUP_HOW}, every card in one
    group only. GATHER checks before saving; a stored grouping that breaks this is read as no grouping (fail closed)."""
    if not isinstance(groups, list):
        return ["groups is a list"]
    errors, seen = [], set()
    for index, group in enumerate(groups):
        cards = group.get("cards") if isinstance(group, Mapping) else None
        if not isinstance(cards, list) or not cards or any(not isinstance(card, str) or not card for card in cards):
            errors.append(f"groups[{index}].cards is a non-empty list of card ids")
            continue
        if group.get("how") not in GROUP_HOW:
            errors.append(f"groups[{index}].how is one of {list(GROUP_HOW)}")
        repeated = seen & set(cards)
        if repeated:
            errors.append(f"groups[{index}] repeats cards already grouped")
        seen |= set(cards)
    return errors
