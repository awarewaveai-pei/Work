"""GOVERN's basic safety (build step 1): crisis signals and where to get help.

Every block that sees the person's words calls ``crisis_signal`` before the AI answers (the AI gate does it for every
AI call); on a signal the AI stops and the person gets ``resources`` for where they are. This is not a diagnosis and
not a therapy service -- it only decides that the AI should step back.

A word list over-triggers on purpose: a false stop costs one screen (the person can continue on their own); a missed
crisis costs more. What it must not do is fire on the same characters inside another word (被打斷, 跳樓大拍賣, "skill
here" holds "kill her"), and it must not miss a signal because of how it was typed (curly apostrophe, full-width
letters, spaces between Chinese characters, simplified characters). The lines of help per place are content files in
platform/resources/ (card 32: versioned, each with its source); this module reads them.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from typing import Any

# 被打 followed by one of these is a different word: 被打斷 (interrupted), 被打擊, 被打敗, 被打動, 被打擾, 被打開, 被打電話 ...
BEATEN = "被打(?![斷断擊击敗败動动擾扰開开發发算包折成入亂乱破回量扮造聽听]|電話|电话)"

SELF_HARM = (
    "自殺", "自杀", "想死(?![你妳])", "不想活", "不想再活", "活不下去", "輕生", "轻生", "結束生命", "结束生命", "結束自己", "结束自己", "了結自己", "了结自己",
    "割腕", "跳樓(?!大拍賣|價|拍賣|特賣)", "跳楼(?!大拍卖|价|拍卖|特卖)", "燒炭", "烧炭", "傷害自己", "伤害自己", "自殘", "自残", "自傷", "自伤",
    "上吊", "尋短", "寻短", "想不開", "想不开", "死了算了", "活著沒有?意義", "活着没有?意义", "想消失", "吞藥", "吞药",
    r"\bsuicid(?:e|al)\b", r"\bkill(?:ing)? myself\b", r"\bend(?:ing)? my (?:own )?life\b", r"\bend it all\b", r"\bself[- ]?harm", r"\b(?:hurt|cut|hang)(?:ing)? myself\b(?! some slack| off\b)",
    r"\boverdos(?:e|ing)\b", r"\b(?:do not|don't|dont) want to (?:live|be alive)\b", r"\bwant(?:s|ed|ing)? to die\b", r"\bbetter off dead\b",
    r"\bno reason to live\b", r"\bnot worth living\b", r"\bwish i (?:was|were) dead\b",
)
VIOLENCE = (
    "殺了他", "杀了他", "殺了她", "杀了她", "殺死他", "杀死他", "殺死她", "杀死她", "想殺人", "想杀人", "打死他", "打死她", BEATEN,
    "打我(?!電話|电话|手機|手机|主意|的電話|的电话)", "毆打", "殴打", "家暴", "威脅要殺", "威胁要杀", "性侵", "強暴", "强暴",
    r"\bkill (?:him|her|them)\b", r"\bgoing to kill\b", r"\babuse[sd]? me\b",
    r"\b(?:he|she|they|dad|mom|mum|father|mother|brother|sister|husband|wife|partner|boyfriend|girlfriend|boss) (?:often |always |keeps |kept |just )?"
    r"(?:(?:beat(?:s|ing)?|punch(?:es|ed|ing)?|slap(?:s|ped|ping)?|chok(?:es|ed|ing)) me\b(?! at\b| to\b)|(?:hit(?:s|ting)?|kick(?:s|ed|ing)?) me\b(?! up\b| out\b))",
    r"\brap(?:e|ed|ing)\b", r"\bsexual(?:ly)? assault(?:ed)?\b", r"\bdomestic (?:violence|abuse)\b",
)
SIGNALS = SELF_HARM + VIOLENCE
_PATTERN = re.compile("|".join(f"(?:{signal})" for signal in SIGNALS), re.IGNORECASE)

# How a text is read before matching: curly quotes and dash variants first (NFKC would turn U+00B4 into a space), then
# NFKC (full-width letters, compatibility forms), no zero-width characters, one space between words, none between
# two Chinese characters.
_QUOTES_AND_DASHES = {**dict.fromkeys(map(ord, "‘’‛ʼ´`"), "'"), **dict.fromkeys(map(ord, "‐‑‒–—−﹣－"), "-")}
_INVISIBLE = dict.fromkeys(map(ord, "​‌‍⁠﻿"), None)
_CJK_GAP = re.compile(r"(?<=[㐀-鿿])\s+(?=[㐀-鿿])")


# A line break inside text the AI gate sends is JSON-escaped (json.dumps writes it as the two characters \ and n), so a
# signal typed across two lines (「不想\n活」) would not match: the escapes of whitespace and control characters count as a space.
_JSON_ESCAPED_SPACE = re.compile(r"\\(?:[nrtbf]|u00[01][0-9a-fA-F])")


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", _JSON_ESCAPED_SPACE.sub(" ", text).translate(_QUOTES_AND_DASHES)).translate(_INVISIBLE)
    return _CJK_GAP.sub("", re.sub(r"\s+", " ", text))


def digest(value: Any) -> str:
    """A short, stable fingerprint of a rule's data: the version of a word list is what the list says."""
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:12]


from ai_lego.platform import resources as _resources   # after digest and normalise: the loader uses both


def _lines(place: str) -> tuple[dict[str, str], ...]:
    return tuple({"name": entry["name"], "contact": entry["how_to_reach"]} for entry in _resources.places()[place]["entries"])


TAIWAN_PLACES = tuple(_resources.places()["台灣"]["matches"])   # GATHER's 發生地的語言 names it (govern.taiwan_places)
TAIWAN_RESOURCES = _lines("台灣")
INTERNATIONAL_RESOURCES = _lines(_resources.INTERNATIONAL)
NOT_THERAPY = "這個平台幫你看見自己怎麼判斷，不是治療或諮商服務。遇到危機時，請找下面的專線或你身邊信任的人。"


def crisis_signal(*texts: Any) -> bool:
    """True when any of the person's texts carries a self-harm, violence or acute-crisis signal."""
    return any(isinstance(text, str) and _PATTERN.search(normalise(text)) for text in texts)


def covers(where: str | None) -> bool:
    """True when this place has its own lines (a file in platform/resources/); anywhere else gets the international list."""
    return _resources.place_of(where) is not None


def resources(where: str | None) -> list[dict[str, str]]:
    """Help for where the person is; unknown or not given = the international list (contract: 沒填時，給國際通用的)."""
    return [{"name": entry["name"], "contact": entry["how_to_reach"]} for entry in _resources.for_place(where)["resources"]]


def help_for(where: str | None) -> dict[str, Any]:
    """Every crisis notice's words: the notice, the lines for where the person is, and -- where we have no lines yet --
    the sentence that says so (「這裡的資源我們還沒有，先給國際通用的」)."""
    return {"notice": NOT_THERAPY, "resources": resources(where), "fallback": _resources.for_place(where)["fallback"]}


def fingerprint() -> str:
    """The version of everything this module decides with: signals, places, lines of help, the notice."""
    return digest({"signals": SIGNALS, "places": TAIWAN_PLACES, "taiwan": TAIWAN_RESOURCES, "international": INTERNATIONAL_RESOURCES, "notice": NOT_THERAPY,
                   "resources": _resources.version()})
