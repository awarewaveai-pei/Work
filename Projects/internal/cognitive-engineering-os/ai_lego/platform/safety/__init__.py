"""GOVERN's basic safety (build step 1): crisis signals and where to get help.

Every block that sees the person's words calls ``crisis_signal`` before the AI answers (the AI gate does it for every
AI call); on a signal the AI stops and the person gets ``resources`` for where they are. This is not a diagnosis and
not a therapy service -- it only decides that the AI should step back.

A word list over-triggers on purpose: a false stop costs one screen (the person can continue on their own); a missed
crisis costs more. What it must not do is fire on the same characters inside another word (被打斷, 跳樓大拍賣, "skill
here" holds "kill her"), and it must not miss a signal because of how it was typed (curly apostrophe, full-width
letters, spaces between Chinese characters, simplified characters). Build step 3 (在地化) adds other places' resources.
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


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text.translate(_QUOTES_AND_DASHES)).translate(_INVISIBLE)
    return _CJK_GAP.sub("", re.sub(r"\s+", " ", text))


def digest(value: Any) -> str:
    """A short, stable fingerprint of a rule's data: the version of a word list is what the list says."""
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:12]


TAIWAN_PLACES = (
    "台灣", "臺灣", "台湾", "台北", "臺北", "新北", "桃園", "桃园", "台中", "臺中", "台南", "臺南", "高雄", "基隆", "新竹", "嘉義", "嘉义", "苗栗", "彰化", "南投",
    "雲林", "云林", "屏東", "屏东", "宜蘭", "宜兰", "花蓮", "花莲", "台東", "臺東", "台东", "澎湖", "金門", "金门", "連江", "馬祖", "马祖",
    "taiwan", "taipei", "kaohsiung", "taichung", "tainan", "taoyuan", "hsinchu", "keelung", "chiayi", "yilan", "hualien", "penghu", "kinmen",
)
TAIWAN_RESOURCES = (
    {"name": "安心專線（衛福部，24 小時）", "contact": "1925"},
    {"name": "生命線", "contact": "1995"},
    {"name": "張老師專線", "contact": "1980"},
    {"name": "保護專線（家暴、性侵、兒少保護）", "contact": "113"},
    {"name": "緊急：警察 110、救護 119", "contact": "110 / 119"},
)
INTERNATIONAL_RESOURCES = (
    {"name": "Find A Helpline：依國家找免費、保密的求助專線", "contact": "https://findahelpline.com"},
    {"name": "有立即危險時：打你所在地的緊急電話", "contact": "112 / 911 / 999（依所在地）"},
)
NOT_THERAPY = "這個平台幫你看見自己怎麼判斷，不是治療或諮商服務。遇到危機時，請找下面的專線或你身邊信任的人。"


def crisis_signal(*texts: Any) -> bool:
    """True when any of the person's texts carries a self-harm, violence or acute-crisis signal."""
    return any(isinstance(text, str) and _PATTERN.search(normalise(text)) for text in texts)


def covers(where: str | None) -> bool:
    """True when this place has its own lines (build step 1: Taiwan); anywhere else gets the international list."""
    place = normalise(where or "").lower()
    return bool(place) and any(name in place for name in TAIWAN_PLACES)


def resources(where: str | None) -> list[dict[str, str]]:
    """Help for where the person is; unknown or not given = the international list (contract: 沒填時，給國際通用的)."""
    return (list(TAIWAN_RESOURCES) if covers(where) else []) + list(INTERNATIONAL_RESOURCES)


def fingerprint() -> str:
    """The version of everything this module decides with: signals, places, lines of help, the notice."""
    return digest({"signals": SIGNALS, "places": TAIWAN_PLACES, "taiwan": TAIWAN_RESOURCES, "international": INTERNATIONAL_RESOURCES, "notice": NOT_THERAPY})
