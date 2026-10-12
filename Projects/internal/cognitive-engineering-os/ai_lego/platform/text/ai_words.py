"""What a person reads of an AI answer, set right at the one place every action's answer passes (ai_gate, after the action's
``shape``). Two invariants:

- Chinese text carries full-width punctuation: a half-width ``, : ; ? ! ( )`` between Chinese characters becomes the
  full-width one (2026-10-12 walk: 「條件,並說」「事件卡:」). Never inside someone's quoted words (「…」 『…』 “…” "…"), a URL,
  a number, or a field the action marks verbatim (a source's ``quote``, a message's own sentence).
- A field key is never shown to the person (2026-10-12: 「中」（intensity_now）, 「uncertainty 欄位」). A key we have a Chinese
  label for is replaced by it; any other key the AI was shown (a field of any document kind, or a key of the message the gate
  built) is code, and the answer is refused (AI_ANSWER_INVALID), not shown. A key is told by how it stands: snake_case, or a
  plain word named as a cell (「text 欄位」). A snake_case word that is no key of ours (a file name, an id the system asked
  for) and an English word in prose are not touched.
"""

from __future__ import annotations

import re
from collections.abc import Collection, Mapping
from functools import lru_cache
from typing import Any

from ai_lego.errors import InvariantViolation

CJK_LETTER = "㐀-䶿぀-ヿ一-鿿豈-﫿"
_CLOSERS = "」』）】》〉”"
_ASCII_TO_FULL = {",": "，", ":": "：", ";": "；", "?": "？", "!": "！"}

_PROTECTED = re.compile(r"「[^」]*」|『[^』]*』|“[^”]*”|\"[^\"\n]*\"|https?://[^\s」』）)]+")
_PAIR = re.compile(r"\(([^()]*)\)")
_HAS_CJK = re.compile(f"[{CJK_LETTER}]")
_SNAKE = re.compile(r"(?<![A-Za-z0-9_/.:#-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![A-Za-z0-9_/-])")
_URL = re.compile(r"https?://\S+")
_JSON_KEY = re.compile(r'"([A-Za-z][A-Za-z0-9_]*)":')
_AS_A_CELL = r"(?![A-Za-z0-9_])(?=\s*(?:欄位|欄|格子))"   # a plain word followed by 欄位: it is being used as the name of a cell

# The keys the AI is shown with their Chinese names (what the person sees on the page). A snake_case key is replaced when it is
# here, else (it is a key we showed) the answer is refused. A plain word key (no underscore) is replaced when it is here and
# used as a key (「uncertainty 欄位」, 「（uncertainty）」, or the whole string); prose that happens to hold the word is left alone.
FIELD_LABELS = {
    "judgment_card": "判斷卡", "norm_notes": "規範與脈絡的筆記", "relevant_facets": "你標有關的面向", "cell_labels": "格子的名字",
    "conclusion": "暫定結論", "problem_definition": "問題怎麼被定義", "facts": "事實", "assumptions": "假設和它的依據", "norm_context": "涉及的規範脈絡",
    "alternative": "替代假設或反例", "options": "選項", "criteria": "判準和權衡", "uncertainty": "仍然不確定的地方", "change_condition": "什麼會改變這個結論",
    "next_step": "下一步", "deciders": "誰有決定權", "affected": "誰會受影響", "revision_reason": "這一版為什麼改", "confidence": "信心",
    "stop_answers": "什麼時候停止分析", "pre_checks": "下判斷前的四個檢查", "intensity_now": "下判斷前的情緒強度", "influences_asked": "系統問的影響",
    "influences_added": "你自己補的影響", "influences_listed": "系統列的影響",
    "jurisdictions": "適用哪裡的法律", "rights_duties": "權利與義務", "norm_origin": "規範的來源", "stance_kind": "立場", "stance": "立場和理由", "interface": "公共議題的問題",
    "human_parts": "你自己留著的部分", "own_version": "你自己的版本", "checked_claims": "查證過的主張", "strongest_argument": "你最有把握的論點", "criteria_so_far": "目前的判準",
    "cards_the_person_wrote": "你寫的卡", "cards_the_person_picked": "你選的卡", "their_reflection": "你的反思", "sense_cards": "外化卡",
}
_BARE = {key: label for key, label in FIELD_LABELS.items() if "_" not in key}


@lru_cache(maxsize=1)
def _document_field_names() -> frozenset[str]:
    from ai_lego.core.domain import doc_kinds

    return frozenset(name for kind in doc_kinds.kinds().values() for name in kind.fields) | frozenset(_BARE)


@lru_cache(maxsize=64)
def _named_as_a_cell(names: frozenset[str]) -> re.Pattern[str]:
    return re.compile(r"(?<![A-Za-z0-9_])(?:" + "|".join(re.escape(name) for name in sorted(names, key=len, reverse=True)) + r")" + _AS_A_CELL)


def keys_shown(message: str) -> frozenset[str]:
    """The keys of the JSON the AI was given: the gate calls this on the message it built, before any source's or someone
    else's fenced words are added to it."""
    return frozenset(_JSON_KEY.findall(message))


def _invalid(why: str) -> InvariantViolation:
    return InvariantViolation(f"AI_ANSWER_INVALID: {why}")


def _plain_punctuation(segment: str, before: str, after: str) -> str:
    """One stretch of text outside any protected span; ``before`` / ``after``: the character next to it, if any."""

    def pair(found: re.Match[str]) -> str:
        start = found.start()
        prior = segment[start - 1] if start else before
        if _HAS_CJK.search(found.group(1)) and not (prior and re.match(r"[A-Za-z0-9_]", prior)):
            return f"（{found.group(1)}）"
        return found.group()

    segment = _PAIR.sub(pair, segment)
    out = []
    for index, char in enumerate(segment):
        prior = segment[index - 1] if index else before
        nxt = segment[index + 1] if index + 1 < len(segment) else after
        if char in _ASCII_TO_FULL and prior and (re.match(f"[{CJK_LETTER}]", prior) or prior in _CLOSERS) and not (char == ":" and nxt == "/"):
            out.append(_ASCII_TO_FULL[char])
        else:
            out.append(char)
    return "".join(out)


def fullwidth_punctuation(text: str) -> str:
    """``, : ; ? ! ( )`` after a Chinese character (or around Chinese words, for brackets) become full-width; quoted words,
    URLs, numbers and Latin-only text are left as they are."""
    if not _HAS_CJK.search(text):
        return text
    out, last, before = [], 0, ""
    for found in _PROTECTED.finditer(text):
        out.append(_plain_punctuation(text[last:found.start()], before, found.group()[0]))
        out.append(found.group())
        last, before = found.end(), found.group()[-1]
    out.append(_plain_punctuation(text[last:], before, ""))
    return "".join(out)


def without_field_keys(text: str, shown: Collection[str] = ()) -> str:
    """``text`` with every field key replaced by its Chinese label; a key with no label (``shown`` = the keys of the message the
    AI was given, and every document field of ours) is code, and the answer is refused."""
    bare = _BARE.get(text.strip(" 。.，,、"))
    if bare is not None:
        return bare   # the whole string is a key ("uncertainty" as an item of a list of cells)
    parts, last = [], 0
    for url in list(_URL.finditer(text)) + [None]:
        stretch = text[last:url.start() if url else len(text)]
        parts.append(_replace_keys(stretch, shown))
        if url:
            parts.append(url.group())
            last = url.end()
    return "".join(parts)


def _replace_keys(stretch: str, shown: Collection[str]) -> str:
    def snake(found: re.Match[str]) -> str:
        label = FIELD_LABELS.get(found.group())
        if label is None and (found.group() in shown or found.group() in _document_field_names()):
            raise _invalid(f"the answer shows the person a field name ({found.group()}); say it in the person's words")
        return found.group() if label is None else label

    def cell(found: re.Match[str]) -> str:
        label = FIELD_LABELS.get(found.group())
        if label is None:
            raise _invalid(f"the answer names a cell of the card by its field name ({found.group()}); say it in the person's words")
        return label

    stretch = _SNAKE.sub(snake, stretch)
    stretch = _named_as_a_cell(_document_field_names()).sub(cell, stretch)
    extra = frozenset(name for name in shown if "_" not in name) - _document_field_names()
    if extra:
        stretch = _named_as_a_cell(extra).sub(cell, stretch)
    for key, label in _BARE.items():   # a labelled plain word is also a key alone inside Chinese brackets or quotes
        stretch = re.sub(rf"(?<=[（「『“]){key}(?=[）」』”])", label, stretch)
        stretch = re.sub(rf"(?<=[{CJK_LETTER}])\({key}\)", f"（{label}）", stretch)
    return stretch


def polish(value: Any, *, verbatim: Collection[str] = ("quote",), shown: Collection[str] = (), key: str = "") -> Any:
    """The answer with every string the person reads set right (see the module docstring); ``verbatim``: the keys whose
    strings are someone else's words and stay as they are; ``shown``: see ``without_field_keys``."""
    if isinstance(value, str):
        return value if key in verbatim else fullwidth_punctuation(without_field_keys(value, shown))
    if isinstance(value, Mapping):
        return {name: polish(item, verbatim=verbatim, shown=shown, key=name) for name, item in value.items()}
    if isinstance(value, list):
        return [polish(item, verbatim=verbatim, shown=shown, key=key) for item in value]
    return value
