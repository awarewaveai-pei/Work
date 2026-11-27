"""The one language table: one row per language. Adding a language = adding a row.
A line's `lang` is a row's code, or "" when it is not known (lib/live/session.py).
Standard library only: lib/transcribe.py loads this file by path (another project loads transcribe.py on its own)."""
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


# 「翻譯成」 also offers 不翻譯; it is not a language, so it has no row.
NONE = "none"
# Defaults when nothing says otherwise: the user reads Chinese, the others speak English (today's behaviour).
MINE, THEIRS = "zh-TW", "en-US"


def listen_codes() -> tuple:
    return tuple(l.code for l in LANGS)


def target_codes() -> tuple:
    return tuple(l.code for l in LANGS if l.code != "auto") + (NONE,)


def mine(target: str) -> str:
    """The user's own language: what they translate into, else the default."""
    return target if find(target) and target != "auto" else MINE


def theirs(listen: str) -> str:
    """The others' language: what is being listened to, else the default (auto)."""
    return listen if find(listen) and listen != "auto" else THEIRS


def line_lang(listen: str, text: str, detected: Optional[str] = None) -> str:
    """A line's language: the chosen one; on auto, what the recogniser detected (None = it does not
    say, as Gemini), else the writing system. Latin text cannot tell English from other Latin
    languages, so it stays "" (not known)."""
    if listen != "auto":
        return listen
    if detected is not None:
        return detected
    script = script_of(text)
    if not script or script == LATIN:
        return ""
    return next((l.code for l in LANGS if l.script == script), "")


def taiwan(text: str, code: str) -> str:
    """The one Simplified-to-Traditional rule: only text in a language whose row says so (Chinese).
    Japanese 会 学 来 stay as they are."""
    lang = find(code)
    if lang is None or not lang.to_taiwan:
        return text
    from .zh import to_taiwan
    return to_taiwan(text)


def translates(line: str, target: str) -> bool:
    """The one translation rule: nothing when 不翻譯, or when the line is already in the target language."""
    return target != NONE and line != target
