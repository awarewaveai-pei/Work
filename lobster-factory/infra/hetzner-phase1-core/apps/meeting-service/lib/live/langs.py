"""The one language table: one row per language. Adding a language = adding a row.
A line's `lang` is a row's code, or "" when it is not known (lib/live/session.py)."""
import re
from dataclasses import dataclass
from typing import Optional

HAN, KANA, HANGUL, LATIN = "han", "kana", "hangul", "latin"


@dataclass(frozen=True)
class Lang:
    code: str        # BCP-47; "auto" = let the recogniser decide
    label: str       # the button
    prompt: str      # the name a model is told
    whisper: str     # faster-whisper's code; "" = detect
    script: str      # the writing system it is recognised by; "" = any
    to_taiwan: bool  # its text goes through zh.to_taiwan (only Chinese: Japanese kanji such as 会 学 would be broken)


LANGS = (
    Lang("auto", "自動", "", "", "", False),
    Lang("zh-TW", "中文", "Traditional Chinese as used in Taiwan", "zh", HAN, True),
    Lang("en-US", "英文", "English", "en", LATIN, False),
    Lang("ja-JP", "日文", "Japanese", "ja", KANA, False),
    Lang("ko-KR", "韓文", "Korean", "ko", HANGUL, False),
)

_SCRIPTS = (
    (KANA, re.compile(r"[぀-ヿㇰ-ㇿ]")),
    (HANGUL, re.compile(r"[ᄀ-ᇿ㄰-㆏가-힯]")),
    (HAN, re.compile(r"[㐀-䶿一-鿿豈-﫿]")),
    (LATIN, re.compile(r"[A-Za-zÀ-ɏ]")),
)


def find(code: str) -> Optional[Lang]:
    return next((l for l in LANGS if l.code == code), None)


def from_whisper(code: str) -> Optional[Lang]:
    """The row for a language faster-whisper detected ("ja" -> ja-JP)."""
    return next((l for l in LANGS if code and l.whisper == code), None)


def script_of(text: str) -> str:
    """The writing system of `text`, "" when it has no letters. Kana before Han (Japanese mixes both)
    and Hangul before Latin; Latin only when nothing else is there."""
    return next((name for name, pattern in _SCRIPTS if pattern.search(text or "")), "")
