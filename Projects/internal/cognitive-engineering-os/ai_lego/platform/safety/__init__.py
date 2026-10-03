"""GOVERN's basic safety (build step 1): crisis signals and where to get help.

Every block that sees the person's words calls ``crisis_signal`` before the AI answers (the AI gate does it for every
AI call); on a signal the AI stops and the person gets ``resources`` for where they are. This is not a diagnosis and
not a therapy service -- it only decides that the AI should step back.

A word list over-triggers on purpose: a false stop costs one screen (the person can continue on their own); a missed
crisis costs more. Build step 3 (在地化) adds other places' resources and languages.
"""

from __future__ import annotations

import re
from typing import Any

_SIGNALS = (
    # self-harm
    "自殺", "想死", "不想活", "活不下去", "輕生", "結束生命", "結束自己", "了結自己", "割腕", "跳樓", "燒炭", "傷害自己", "自殘", "自傷",
    "suicide", "suicidal", "kill myself", "end my life", "self-harm", "self harm", "hurt myself", "don't want to live", "want to die",
    # violence against or from others
    "殺了他", "殺了她", "殺死他", "殺死她", "想殺人", "打死他", "打死她", "被打", "家暴", "威脅要殺", "性侵",
    "kill him", "kill her", "going to kill", "abuse me", "beats me", "raped",
)
_PATTERN = re.compile("|".join(re.escape(signal) for signal in _SIGNALS), re.IGNORECASE)

_TAIWAN = ("台灣", "臺灣", "taiwan")
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


def crisis_signal(*texts: Any) -> bool:
    """True when any of the person's texts carries a self-harm, violence or acute-crisis signal."""
    return any(isinstance(text, str) and _PATTERN.search(text) for text in texts)


def resources(where: str | None) -> list[dict[str, str]]:
    """Help for where the person is; unknown or not given = the international list (contract: 沒填時，給國際通用的)."""
    place = (where or "").strip().lower()
    local = list(TAIWAN_RESOURCES) if place and any(name in place for name in _TAIWAN) else []
    return local + list(INTERNATIONAL_RESOURCES)


NOT_THERAPY = "這個平台幫你看見自己怎麼判斷，不是治療或諮商服務。遇到危機時，請找下面的專線或你身邊信任的人。"
