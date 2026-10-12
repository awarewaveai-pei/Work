"""GATHER around sources and saves (contract card 「系統做什麼」「人怎麼控制」).

- AFTER_SOURCES: one source card per active stored page without one (a new version of its card when the page came back
  with a new hash), one per page the collector set aside with no text, then the grouping into origins and each card's
  「原始的還是轉貼的」, then what each channel of the run did. Idempotent: a second run over the same arrival adds nothing.
- BEFORE_SAVE (the person's saves): one mark per origin, on exactly that group's pages; one change per card and cell;
  a split takes part of one group; a take-back is for a page set aside, once.
- ``channel_state`` / ``distribution``: which engines and languages were used, 管道不足 for the place's language, where
  the pages came from -- read by the page
  (apps/api/blocks/gather.py) and by the AI's hand-back (ai_actions/gather.py).
Every cell says only what a list or the page itself states, or what collect learnt from a registry or the web archive:
the platform reaches nothing outside itself (specs/wire/lookup.v1.json; STEP2_SHARED_RULES §2).

Read whole or say so (the invariant every cap below answers to): a conclusion that rests on something being ABSENT --
查不到 in a cell, a page 「只互相引用」 with no link outside its group -- is drawn only from input read whole. Each
reader that may be bounded says it is: a page collect read is its body (READ_BODY: header, footer and menus dropped by
next-admin lib/collect/collectors/http-html.ts extractText), a fact-check hit is the database's record (READ_RECORD), a
links list may be cut (core/domain/source.py outlinks_whole), a title may be cut at COLLECT_TITLE_CHARS. On such input
what rests on absence is 無法檢查, or the page stays out of what needs the whole; a 查到 quotes words that are there and
stands on any reading. Only the person's own file (READ_WHOLE) is read whole. tests/unit/test_block_gather.py
CapsTests lists every cap of the extractor and of this module, so a new one with no answer here fails by name.
Grouping keeps of each page only its pieces, never its text (_Print): memory grows with the cards, not their size."""

from __future__ import annotations

import functools
import itertools
import logging
import re
import sys
import unicodedata
import urllib.parse
import zlib
from collections import Counter
from typing import Any, Callable, Iterable, Iterator, Mapping

from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.evidence_words import FOUND, FOUND_BY, MIN_ORIGINS, NOT_FOUND, UNCHECKABLE, cell, channel_words
from ai_lego.core.domain.kinds.gather import MAX_CASE_CARDS
from ai_lego.core.domain.source import outlinks_whole
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform import evidence, safety
from ai_lego.platform.block_hooks.verify import is_hit
from ai_lego.platform.net import collect_lookups
from ai_lego.platform.rulesets import require

_log = logging.getLogger(__name__)

SYSTEM = record_log.system("GATHER")
SEARCHED, PASTED = FOUND_BY
CARD_RULES = ("gather.source_lists", "gather.outlets", "gather.grouping")
CHANNEL_STATES = ("ok", "unreachable", "no_key")
PROVIDER_NAMES = {"serper": "Serper（Google 的結果）", "brave": "Brave"}
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")
# (c) only on its own and before a year or a name: 「第5(c)項」「Article 5(c) applies」 are clauses, not a copyright line
_COPYRIGHT = re.compile(r"(?:©|(?<!\w)\([cC]\)(?=\s*\d{4}|\s+[^\W\d_a-z])|(?i:copyright)|版權所有)\s*(?:©)?\s*(?:\d{4}(?:\s*[-–~]\s*\d{4})?)?\s*([^\n|｜。，,]{2,80})")
_TITLE_SEPARATORS = re.compile(r"\s[-|–—]\s|｜|－")
STATED = "網頁自己寫的日期"   # first_seen from the page's own claim, not from the archive: 原始的還是轉貼的 never reads it
_START = r"(?:^|(?<=[\n。！？；;|｜•·])|(?<=[.!?]\s))[^\S\n]*"   # the start of the page, a line, a field or a sentence
_NAME = r"(?=\S)(?:(?![.!?](?:\s|$))[^\n|｜。，,；;：:]){2,80}"   # a name runs to the end of its line, field or sentence
_EN_WORDS = frozenset("the and of to in is that for it with as was on are by this be from or at".split())
_LATIN = "A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ"   # Latin letters with their accented forms (French, German, Vietnamese)
# What the stored text of a page is (the module docstring): the person's own file, whole; the body collect extracted
# from a page; the record a fact-check database gave (VERIFY hit_address), not the report page.
READ_WHOLE, READ_BODY, READ_RECORD = "whole", "body", "record"
NOT_ON_IT = {READ_BODY: "系統存的是找資料的服務抽出的網頁正文，頁首、頁尾和選單不在裡面，看不到網頁在那裡寫誰經營",
             READ_RECORD: "系統存的是查核資料庫給的紀錄，不是查核報告那一頁，看不到網頁寫誰經營"}
COLLECT_TITLE_CHARS = 300   # collect cuts every title here (sinks/cognitive.ts toSourceProjection, orchestrator.ts aside)
TITLE_CUT = f"標題不完整（超過 {COLLECT_TITLE_CHARS} 個字只存了前面，或搜尋結果只給了前面一段），網站的名字可能被切掉"
LINKS_CUT = "找資料的服務可能沒有記下這一頁連到的全部網站，看不出它是不是只跟某幾個網站互相引用"
NO_LETTER = {READ_BODY: "系統存的網頁正文裡沒有文字（頁首、頁尾和選單不在裡面），看不出網頁用什麼語言",
             READ_RECORD: "查核資料庫給的紀錄裡沒有文字，看不出網頁用什麼語言"}
_CHUNK = 20000   # letters counted at a time: the whole text is read, a bounded part of it held
_WORD = re.compile(r"[a-z]+")
_LONGEST_EN = max(map(len, _EN_WORDS))   # a word cut to one letter more than this is still no _EN_WORDS word


def _reading(url: str) -> str:
    """How much of the page its stored text is: no address = the person's own file, read whole."""
    if not url:
        return READ_WHOLE
    return READ_RECORD if is_hit(url) else READ_BODY


# ---- reading what is stored ----

def _store(docs: CaseDocs) -> tuple[Any, Any]:
    """The case's stored pages through CaseDocs' read-only facade (a hook never writes through it) and their content
    store (the API's, its test override included)."""
    from ai_lego.apps.api import main as api

    return docs.reads, api.app.dependency_overrides.get(api.get_source_cas, api.get_source_cas)()


def _host(url: str) -> str:
    return (urllib.parse.urlsplit(url).hostname or "").lower().removeprefix("www.") if url else ""


def _date(value: Any) -> str | None:
    return value[:10] if isinstance(value, str) and _DATE.match(value) else None


# ---- the cells (來源卡每張記) ----

RESTRICTED_TO = {"官方": "政府機關", "學術": "學校和研究機構"}   # what a restricted domain suffix is only given to


def _lists(host: str) -> tuple[list[dict[str, str]], tuple[str, str, str] | None]:
    """Which lists name the site, and for a domain only given to one kind of body in one place (.gov.tw): (place,
    body, why)."""
    found, restricted = [], None
    for item in require("gather.source_lists").items:
        suffix = next((suffix for suffix in item.get("suffixes", {}) if host == suffix[1:] or host.endswith(suffix)), None)
        if suffix or (host and any(host == domain or host.endswith(f".{domain}") for domain in item.get("domains", []))):
            found.append({key: item[key] for key in ("list", "category", "maintainer", "version")})
            if suffix and restricted is None:
                place, body = item["suffixes"][suffix], RESTRICTED_TO[item["category"]]
                restricted = (place, body, f"{suffix} 只發給{place}的{body}" if place else f"{suffix} 只發給{body}")
    return found, restricted


def _title_parts(title: str) -> list[str]:
    return [part.strip() for part in _TITLE_SEPARATORS.split(title or "") if part.strip()]


def _site_name(title: str) -> str:
    """The site's own name, when the title carries one after a separator (「文章 | BBC News」)."""
    parts = _title_parts(title)
    return parts[-1] if len(parts) > 1 else ""


def _named(text: str, name: str) -> bool:
    if not text:
        return False
    return bool(re.search(rf"(?<![A-Za-z]){re.escape(name)}(?![A-Za-z])", text, re.I)) if name.isascii() else name in text


def _script_letter(char: str) -> bool:
    return char.isalpha() and not char.isascii()


def _names_outlet(text: str, name: str, media_words: Iterable[str]) -> bool:
    """Whether a site name says an outlet's name. A Latin name is a whole word in it; a Chinese one has no space to end it,
    so it must touch no other letter of its script (「中央社 CNA」) or run straight into a media word (「中央社新聞網」):
    in 台北市中央社區大學, 彭博士診所, 新華社區發展協會 it is part of another name."""
    if name.isascii():
        return _named(text, name)
    for found in re.finditer(re.escape(name), text):
        after = text[found.end():]
        if not _script_letter(text[found.start() - 1: found.start()]) and not _script_letter(after[:1]):
            return True
        if any(after.casefold().startswith(word.casefold()) for word in media_words):
            return True
    return False


def _name_tokens(host: str, site: str) -> list[str]:
    """Where a site's own name can be: the host's labels up to the first label of the name the registry holds
    (collect's ``site``: bbc.fakehost.xyz -> bbc, fakehost); without it every label but the top-level one, which anyone
    can have (twitch.tv is not a TV station)."""
    labels = host.split(".") if host else []
    if site and (host == site or host.endswith(f".{site}")):
        labels = labels[: len(labels) - len(site.split(".")) + 1]
    elif len(labels) > 1:
        labels = labels[:-1]
    return [token for label in labels for token in re.split(r"[^a-z0-9]+", label) if token]


def _outlet(host: str, site: str, title: str) -> tuple[dict[str, Any] | None, bool, bool, str]:
    """(the outlet, whether the site IS it, whether the site's name reads like a news outlet, the name the title gives).
    ``site``: the name the registry holds (collect); a name under ``prefix_from`` letters must be a whole host piece. A
    site name is the title's last part, a first part that is the whole name (「中央社 | 新聞」), or the registry's name."""
    rules = require("gather.outlets").items
    for outlet in rules["outlets"]:
        if host and any(host == domain or host.endswith(f".{domain}") for domain in outlet["domains"]):
            return outlet, True, True, _site_name(title)
    parts = _title_parts(title)
    named, first = (parts[-1], parts[0]) if len(parts) > 1 else ("", "")
    registered = site.split(".")[0] if site else ""
    tokens = _name_tokens(host, site)
    for outlet in rules["outlets"]:
        for name in outlet["names"]:
            squeezed = re.sub(r"[^a-z0-9]", "", name.lower())
            in_host = name.isascii() and len(squeezed) >= rules["min_host_name"] and any(
                token == squeezed or (len(squeezed) >= rules["prefix_from"] and token.startswith(squeezed)) for token in tokens)
            in_name = first.casefold() == name.casefold() or _names_outlet(named, name, rules["media_words"]) or (
                not name.isascii() and _names_outlet(registered, name, rules["media_words"]))
            if in_name or in_host:
                return outlet, False, True, named
    newsy = any(_named(named, word) for word in rules["media_words"]) or any(token == word.lower() for token in tokens for word in rules["media_words"] if word.isascii())
    return None, False, newsy, named


def _english_words(text: str) -> tuple[int, int]:
    """(how many [a-z]+ words text.lower() has, how many are _EN_WORDS), counted _CHUNK letters at a time and exactly
    as on the whole text: a word that runs over a chunk's end is carried into the next (only its first _LONGEST_EN + 1
    letters: past that it is no _EN_WORDS word whatever follows) and counted once, where it ends."""
    words = english = 0
    carry = ""   # the start of a word still open at the end of the last chunk
    for start in range(0, len(text), _CHUNK):
        lowered = text[start:start + _CHUNK].lower()   # str.lower is letter by letter: chunks lower as the whole does
        found = _WORD.findall(lowered)
        if carry and found and lowered[0] in "abcdefghijklmnopqrstuvwxyz":
            found[0] = (carry + found[0])[:_LONGEST_EN + 1]
        elif carry:
            found.insert(0, carry)
        carry = ""
        if found and lowered[-1] in "abcdefghijklmnopqrstuvwxyz" and start + _CHUNK < len(text):
            carry = found.pop()[:_LONGEST_EN + 1]
        words += len(found)
        english += sum(word in _EN_WORDS for word in found)
    if carry:
        words += 1
        english += carry in _EN_WORDS
    return words, english


def _language(text: str | None, reading: str = READ_WHOLE) -> dict[str, str]:
    """``reading`` (READ_*): 查不到 「沒有文字」 only of a text read whole -- collect's body may have none while the
    footer it dropped has."""
    names = require("gather.place_languages").items["names"]
    if text is None:
        return cell(UNCHECKABLE, why="抓不到內文")
    han = kana = hangul = latin = other = 0
    for start in range(0, len(text), _CHUNK):   # the whole text, letter by letter: a chunk's end splits no count
        sample = text[start:start + _CHUNK]
        han += len(re.findall(r"[㐀-䶿一-鿿]", sample))
        kana += len(re.findall(r"[぀-ヿ]", sample))
        hangul += len(re.findall(r"[가-힯]", sample))
        latin += len(re.findall(rf"[{_LATIN}]", sample))
        other += len(re.findall(rf"[^\W\d_㐀-䶿一-鿿぀-ヿ가-힯{_LATIN}]", sample))   # every other letter (Arabic, Thai, Cyrillic…)
    cjk = han + kana + hangul
    if not cjk + latin + other:
        if reading != READ_WHOLE:
            return cell(UNCHECKABLE, why=NO_LETTER[reading])
        return cell(NOT_FOUND, why="系統讀到的內容裡沒有文字")
    if other * 2 > cjk + latin + other:
        return cell(UNCHECKABLE, why="系統只分得出中文、英文、日文、韓文")
    if cjk * 3 >= latin:
        code = "ja" if kana >= max(10, cjk // 10) else "ko" if hangul * 2 >= cjk else "zh"
        return cell(FOUND, names[code])
    words, english = _english_words(text)
    if english * 100 >= 8 * words:
        return cell(FOUND, names["en"])
    return cell(UNCHECKABLE, why="拉丁字母寫的，但看不出是英文；系統只分得出中文、英文、日文、韓文")


@functools.lru_cache(maxsize=4)
def _operator_phrases(labels: tuple[str, ...], run_by: str, by: tuple[str, ...], own: tuple[str, ...]) -> tuple[re.Pattern[str], ...]:
    """The ways a page says who runs it (gather.outlets ``operator``), each at the start of a line or a sentence: in the
    middle of one (「該刊發行人表示」「was published by the ministry」) it is about someone else."""
    def either(words: Iterable[str]) -> str:
        return "|".join(map(re.escape, words))

    own_part = rf"(?:(?:{either(own)})[^\S\n]*)?"
    return (re.compile(rf"{_START}(?P<phrase>{own_part}(?:{either(labels)})[^\S\n]*[:：][^\S\n]*(?P<name>{_NAME}))"),
            re.compile(rf"{_START}(?P<phrase>{own_part}由[^\S\n]*(?P<name>(?=\S)[^\n|｜。，,；;：:由]{{2,40}}?)[^\S\n]*{re.escape(run_by)})"),
            re.compile(rf"{_START}(?P<phrase>{own_part}(?:{either(by)})[^\S\n]+(?P<name>{_NAME}))", re.I))


def _says_who_runs(text: str, rules: Mapping[str, Any]) -> tuple[str, str] | None:
    """(the page's words, the name) where the page last says who runs it, looked for on the whole page."""
    patterns = _operator_phrases(tuple(rules["labels"]), rules["run_by"], tuple(rules["by"]), tuple(rules["own"]))
    found = max((match for pattern in patterns for match in pattern.finditer(text)), key=lambda match: match.start("phrase"), default=None)
    return (found["phrase"].strip(), found["name"].strip()) if found else None


def _operator(text: str | None, outlet: dict[str, Any] | None, is_outlet: bool, reading: str) -> dict[str, str]:
    """``reading`` (READ_*): 查不到 「這一頁沒寫」 only of a text read whole; collect's body has no footer to look in."""
    if outlet and is_outlet:
        return cell(FOUND, outlet["name"], why=f"網域在已知媒體名單上（v{require('gather.outlets').version}）")
    if text is None:
        return cell(UNCHECKABLE, why="抓不到內文，看不到網頁寫誰經營")
    rules = require("gather.outlets").items["operator"]
    said = _says_who_runs(text, rules)
    if said:
        return cell(FOUND, said[1][:120], why=f"網頁寫著「{said[0][:120]}」")
    # the last footer_chars only (higher up a © line is usually a photo credit); it goes in why, never as the value
    lines = [match.group(0).strip() for match in _COPYRIGHT.finditer(text[-rules["footer_chars"]:])]
    if reading != READ_WHOLE:
        return cell(UNCHECKABLE, why=NOT_ON_IT[reading] + (f"；內文裡只有版權字樣（{lines[-1][:120]}），版權所有人不一定是經營者" if lines else ""))
    if lines:
        return cell(NOT_FOUND, why=f"頁尾只有版權字樣（{lines[-1][:120]}），沒有寫誰經營；版權所有人不一定是經營者")
    return cell(NOT_FOUND, why="這一頁沒寫是誰經營的；系統沒有讀網站的「關於我們」頁")


def _outlet_cell(host: str, named: str, outlet: dict[str, Any] | None, is_outlet: bool, newsy: bool, title_cut: bool = False) -> dict[str, str]:
    """The known-outlets list is not every domain an outlet has: a name like one is said as 「不在已知網域名單上」, and
    查不到 only when there was a site name to look at -- not in a title collect cut (``title_cut``), whose end is gone."""
    if outlet and is_outlet:
        return cell(FOUND, f"是{outlet['name']}的網域")
    if outlet and not host:
        return cell(UNCHECKABLE, why=f"名字像{outlet['name']}；你貼的是檔案，沒有網域可以對")
    if outlet:
        return cell(FOUND, f"名字像{outlet['name']}，不在{outlet['name']}的已知網域名單上（v{require('gather.outlets').version}）")
    if not host and not named:
        return cell(UNCHECKABLE, why="你貼的是檔案，沒有網域可以對")
    if newsy:
        return cell(UNCHECKABLE, why="名字像媒體，但不在已知媒體名單上；系統沒辦法查它存不存在")
    if title_cut:
        return cell(UNCHECKABLE, why=TITLE_CUT)
    if not named:
        return cell(UNCHECKABLE, why="標題沒寫網站名字")
    return cell(NOT_FOUND, why="名字不像媒體")


def _first_seen(published: Any, archived: dict[str, str] | None, read: bool = True, address: bool = False) -> dict[str, str]:
    """最早何時出現: the earlier of the date the page states and the archive's first capture (collect's
    ``first_archived``; ``None`` = not asked). ``read``: whether the page itself was read -- a page set aside never was,
    so 「網頁沒寫日期」 is not known there and 查不到 is 無法檢查. ``address``: the card has a web address; only a card
    without one is the person's pasted file (Codex GATHER r5b: an unread page with no archive answer was called a file)."""
    stated = _date(published)
    if archived is None:
        if stated:
            return cell(FOUND, stated, why=STATED)
        if not address:
            return cell(UNCHECKABLE, why="你貼的檔案沒寫日期，也沒有網址可以查網頁封存館")
        return cell(UNCHECKABLE, why=("網頁沒寫日期" if read else "沒有抓到這一頁的內文，不知道網頁寫的日期") + "；這次沒有問到網頁封存館")
    if archived["state"] == FOUND and not _date(archived["value"]):   # compared as a date below, so it must be one
        archived = cell(UNCHECKABLE, why=collect_lookups.MALFORMED)
    if archived["state"] == FOUND and (not stated or archived["value"][:10] < stated):
        return cell(FOUND, archived["value"][:10], why=archived.get("why") or "網頁封存館最早存到的日期")
    if stated:
        return cell(FOUND, stated, why=STATED + (f"；網頁封存館：{archived['why']}" if archived["state"] == UNCHECKABLE else ""))
    if not read:
        return cell(UNCHECKABLE, why=f"沒有抓到這一頁的內文，不知道網頁寫的日期；{archived['why']}")
    return cell(archived["state"], why=f"網頁沒寫日期；{archived['why']}")


def _archived(looked: Mapping[str, Any] | None) -> str:
    """The web archive's first capture of the page: the only date 原始的還是轉貼的 is read from ("" = none or not asked)."""
    found = None if looked is None else looked.get("first_archived")
    if not isinstance(found, Mapping) or found.get("state") != FOUND:
        return ""
    date = _date(found.get("value"))
    return "" if date is None else date


def _stamps() -> dict[str, dict[str, str]]:
    return {name: {key: value for key, value in require(name).stamp().items() if key != "name"} for name in CARD_RULES}


def _cells(url: str, title: str, text: str | None, published: Any, looked: Mapping[str, Any] | None) -> tuple[dict[str, dict[str, str]], list[dict[str, str]]]:
    """``looked``: collect's answer for ``url`` (collect_lookups.describe), ``None`` for a pasted file with no address."""
    host = _host(url)
    lists, restricted = _lists(host)
    outlet, is_outlet, newsy, named = _outlet(host, (looked or {}).get("site") or "", title)
    no_site = cell(UNCHECKABLE, why="你貼的是檔案，沒有網域可以查")
    looked_up = {"registered": looked["registered"], "country": looked["country"]} if looked else {"registered": no_site, "country": no_site}
    if restricted and restricted[0]:
        country = cell(FOUND, restricted[0], why=restricted[2])
    elif outlet and is_outlet and outlet.get("country"):
        country = cell(FOUND, outlet["country"], why="已知媒體名單")
    else:
        country = looked_up["country"]
    if restricted:
        affiliation = cell(FOUND, restricted[1], why=restricted[2])
    else:   # the lists are of domains: a file has none to find on them
        affiliation = cell(NOT_FOUND, why="名單上沒有寫它隸屬誰") if host else cell(UNCHECKABLE, why="你貼的是檔案，沒有網域可以對")
    # cut by collect at COLLECT_TITLE_CHARS, or a search result's title (a page set aside) the engine cut with an ellipsis
    title_cut = bool(url) and (len(title) >= COLLECT_TITLE_CHARS or title.rstrip().endswith(("...", "…")))
    return {
        "operator": _operator(text, outlet, is_outlet, _reading(url)),
        "registered": looked_up["registered"],
        "country": country,
        "language": _language(text, _reading(url)),
        "original": cell(NOT_FOUND, why="還在分組"),   # replaced from the grouping before the card is saved
        "first_seen": _first_seen(published, looked["first_archived"] if looked else None, text is not None, bool(url)),
        "stance": cell(UNCHECKABLE, why="系統沒有讀網站的「關於我們」頁，不知道它自己宣稱的立場；你可以自己補上"),
        "affiliation": affiliation,
        "party_relation": cell(UNCHECKABLE, why="系統不知道它跟這件事的當事方有什麼關係；你可以自己寫"),
        "outlet_exists": _outlet_cell(host, named, outlet, is_outlet, newsy, title_cut),
    }, lists


def _found_by(row: Mapping[str, Any], author: str | None) -> dict[str, str]:
    relevance = row.get("relevance") if isinstance(row.get("relevance"), Mapping) else {}
    if relevance.get("pasted") is True or author == "user":
        return {"by": PASTED}
    keys = (("provider", "searchProvider", 40), ("lang", "searchLang", 10), ("query", "searchQuery", 300), ("angle", "searchAngle", 20))
    return {"by": SEARCHED, **{key: relevance[name][:limit] for key, name, limit in keys if isinstance(relevance.get(name), str) and relevance[name]}}


def _source_card(row: Mapping[str, Any], text: str | None, author: str | None, answers: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    url = row.get("canonical_url") or ""
    looked = answers.get(url) if url else None
    cells, lists = _cells(url, row.get("title") or "", text, row.get("published_at"), looked)
    relevance = row.get("relevance") if isinstance(row.get("relevance"), Mapping) else {}
    aside = relevance.get("aside") if isinstance(relevance.get("aside"), str) else ""
    return {"source_id": row["source_id"], "url": url[:2048], "title": (row.get("title") or "")[:300], "found_by": _found_by(row, author),
            "cells": cells, "lists": lists, "snapshot": {"sha256": row["content_sha256"], "fetched_at": row.get("fetched_at") or row["created_at"]},
            "archived": _archived(looked), "aside": aside[:300], "rules": _stamps()}


def _aside_card(entry: Mapping[str, Any], answers: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """A page the collector could not get text from (放一旁): a card all the same, with what its address tells."""
    url, title = entry["url"][:2048], str(entry.get("title") or "")[:300]
    looked = answers.get(entry["url"])
    cells, lists = _cells(url, title, None, None, looked)
    reason = entry.get("reason") if isinstance(entry.get("reason"), str) and entry["reason"].strip() else "抓不到內文"
    return {"source_id": "", "url": url, "title": title, "found_by": {"by": SEARCHED}, "cells": cells, "lists": lists, "archived": _archived(looked),
            "aside": reason[:300], "rules": _stamps()}


# ---- grouping (同一出處的分組) ----

def _link_host(link: str) -> str:
    return _host(link if "://" in link else f"https://{link}")


@functools.lru_cache(maxsize=1)
def _dropped() -> dict[int, None]:
    """Every space and punctuation mark (Unicode category P*), for str.translate: one C pass, no Python step per letter."""
    return {code: None for code in range(sys.maxunicode + 1) if chr(code).isspace() or unicodedata.category(chr(code)).startswith("P")}


def _letters(text: str) -> str:
    """The text as grouping compares it: NFKC, case folded, without spaces and punctuation."""
    return unicodedata.normalize("NFKC", text).casefold().translate(_dropped())


def _numbers(letters: str, size: int) -> Iterator[int]:
    """Every piece of ``size`` letters of the text as a number: the same letters give the same number wherever they sit."""
    data, width = letters.encode("utf-32-le"), 4 * size
    return (zlib.crc32(data[index:index + width]) for index in range(0, 4 * (len(letters) - size + 1), 4))


def _kept(letters: str, size: int, rate: int) -> set[int]:
    """The pieces whose number is a multiple of ``rate``."""
    return {number for number in _numbers(letters, size) if number % rate == 0}


def _pieces(letters: str, rules: Mapping[str, Any]) -> tuple[int, frozenset[int]]:
    """(rate, the pieces a page keeps): from the whole text, the pieces whose number is a multiple of the rate -- 1 up to
    ``sample_above`` letters, else ``keep_one_in``, doubled until at most ``max_pieces`` are left. One rule for every page,
    so a passage leaves the same pieces in every page that holds it, and a rate is a multiple of every lower one."""
    size, most = rules["shingle"], rules["max_pieces"]
    rate = 1 if len(letters) <= rules["sample_above"] else rules["keep_one_in"]
    while len(letters) - size + 1 > rate * most:
        rate *= 2
    kept = _kept(letters, size, rate)
    while len(kept) > most:
        rate *= 2
        kept = {number for number in kept if number % rate == 0}
    return rate, frozenset(kept)


def _distinct(letters: str, size: int, enough: int) -> int:
    """How many different pieces the text has, counted up to ``enough`` (all the containment rule needs to know)."""
    seen: set[int] = set()
    for number in _numbers(letters, size):
        seen.add(number)
        if len(seen) >= enough:
            break
    return len(seen)


class _Print:
    """What grouping keeps of one page's whole text, read once: how many letters, its rate and pieces (at most
    ``max_pieces``), how many different pieces (up to ``contained_min_pieces``). Never the text: a card costs the same
    whatever its page's size (F3: 800 pages of a million letters held whole were gigabytes)."""

    __slots__ = ("length", "rate", "pieces", "distinct")

    def __init__(self, text: str | None, rules: Mapping[str, Any]) -> None:
        letters = _letters("" if text is None else text)
        self.length = len(letters)
        self.rate, self.pieces = _pieces(letters, rules)
        self.distinct = _distinct(letters, rules["shingle"], rules["contained_min_pieces"])


class _Item:
    """One card as the grouping sees it: the pieces of its whole text (``fingerprint``), its main image, its site and the
    sites it links to, whether that list is whole, the web archive's first capture of it. ``reread`` reads the text again
    for the one pass _lookups makes over a longer page."""

    def __init__(self, key: str, content: Mapping[str, Any], fingerprint: _Print, reread: Callable[[], str | None], relevance: Mapping[str, Any]) -> None:
        self.key, self.content, self.reread = key, content, reread
        self.length, self.rate, self.pieces, self.distinct = fingerprint.length, fingerprint.rate, fingerprint.pieces, fingerprint.distinct
        self._at = {self.rate: self.pieces}
        image = relevance.get("imageUrl")
        self.image = image if isinstance(image, str) and image.startswith(("http://", "https://")) else None
        self.host = _host(content.get("url") or "")
        self.label = (self.host or str(content.get("title") or "") or "一份你貼的檔案")[:60]   # how another page's cell names it
        links = relevance.get("outlinks")
        self.outlinks = {_link_host(link) for link in links if isinstance(link, str) and link} - {self.host, ""} if isinstance(links, list) else set()
        self.links_whole = outlinks_whole(relevance)   # absent or maybe cut: never in an 只互相引用 group
        self.links_cut = bool(self.host) and not self.links_whole   # a site whose links are not known whole: said on the card
        first = (content.get("cells") or {}).get("first_seen") or {}
        self.first_seen = _date(first.get("value")) if first.get("state") == FOUND else None
        # a card made before grouping v4 holds no `archived`; its first_seen, when not the page's own date, is the archive's
        stated = str(first.get("why") or "").startswith(STATED)
        self.archived = _date(content.get("archived")) or (None if stated else self.first_seen)

    def at(self, rate: int) -> frozenset[int]:
        """The pieces this page keeps at a coarser rate (a multiple of its own): those any page would keep there."""
        if rate not in self._at:
            self._at[rate] = frozenset(number for number in self.pieces if number % rate == 0)
        return self._at[rate]


def _by_length(items: list[_Item], i: int, j: int) -> tuple[int, int]:
    return (i, j) if items[i].length <= items[j].length else (j, i)


def _looked_up(short: _Item, long: _Item, rules: Mapping[str, Any]) -> bool:
    """Whether the shorter page keeps too few pieces at the pair's rate to read a share from (a few pieces can be in a long
    page by chance): then its own pieces are looked up in the longer page's whole text."""
    return min(short.distinct, long.distinct) >= rules["contained_min_pieces"] and len(short.at(max(short.rate, long.rate))) < rules["min_compared"]


def _lookups(items: list[_Item], rules: Mapping[str, Any]) -> dict[int, frozenset[int]]:
    """For each page a shorter one is looked up in: which pieces of the pages looked up its whole text holds -- one pass
    over its text however many shorter pages ask (a pair reads only its shorter page's own pieces of it)."""
    shorter, longer = set(), set()
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            short, long = _by_length(items, i, j)
            if _looked_up(items[short], items[long], rules):
                shorter.add(short)
                longer.add(long)
    wanted = frozenset().union(*(items[index].pieces for index in shorter))
    # one longer page's text at a time, read again and let go: what is kept is a subset of `wanted`
    present = {}
    for long in sorted(longer):
        text = items[long].reread()
        present[long] = frozenset(number for number in _numbers(_letters("" if text is None else text), rules["shingle"]) if number in wanted)
    return present


def _likeness(short: _Item, long: _Item, rules: Mapping[str, Any], present: frozenset[int]) -> float:
    """How alike two pages are: the larger of the share of their pieces in common (Jaccard) and the share of the shorter
    page found in the longer one (an excerpt, a copy with more around it), the second only when both pages have at least
    ``contained_min_pieces`` different pieces (one phrase repeated is in every page that has it twice). Both are read at
    the coarser page's rate; ``present``: the longer page's pieces among the shorter one's own, when _looked_up."""
    x, y = short.at(max(short.rate, long.rate)), long.at(max(short.rate, long.rate))
    both = len(x & y)
    jaccard = both / (len(x) + len(y) - both) if x or y else 0.0
    if min(short.distinct, long.distinct) < rules["contained_min_pieces"]:
        return jaccard
    if _looked_up(short, long, rules):
        return max(jaccard, len(short.pieces & present) / len(short.pieces) if short.pieces else 0.0)
    return max(jaccard, both / len(x))


def _every_pair(members: Iterable[Any], joined: Callable[[Any, Any], bool]) -> bool:
    """One rule for a reason that joins two pages (同一篇) or two sites (只互相引用): a group is said to be joined by it
    only when every two of its members are."""
    return all(joined(a, b) for a, b in itertools.combinations(members, 2))


Join = tuple[_Item, _Item, str]


def _groups(items: list[_Item], rules: Mapping[str, Any]) -> list[tuple[list[_Item], str, list[Join]]]:
    """Every item in exactly one group: (items, how, what joins which). Two pages join on near-identical text (同一篇),
    text between the thresholds (可能同出處), the same main image (同一張圖), or sites that link each other and nowhere
    else (只互相引用). Joins chain, likeness does not: a group is 同一篇 only when every two of its pages are (whatever
    else joins them), a chain of 同一篇 alone is 可能同出處, and any other group joined for different reasons says the
    least certain one."""
    parent = list(range(len(items)))

    def root(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    present = _lookups(items, rules)
    edges: list[tuple[int, int, str]] = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            short, long = _by_length(items, i, j)
            likeness = _likeness(items[short], items[long], rules, present.get(long, frozenset()))
            if likeness >= rules["same_text"]:
                edges.append((i, j, "同一篇"))
            elif likeness >= rules["maybe_same"]:
                edges.append((i, j, "可能同出處"))
            if items[i].image and items[i].image == items[j].image:
                edges.append((i, j, "同一張圖"))
    edges += _only_each_other(items)
    for i, j, _ in edges:
        parent[root(i)] = root(j)
    members: dict[int, list[int]] = {}
    for index in range(len(items)):
        members.setdefault(root(index), []).append(index)
    joins: dict[int, list[tuple[int, int, str]]] = {}
    for edge in edges:
        joins.setdefault(root(edge[0]), []).append(edge)
    out = []
    for top, indexes in sorted(members.items(), key=lambda pair: pair[1][0]):
        found = joins.get(top, [])
        kinds = {kind for _, _, kind in found}
        same = {(i, j) for i, j, kind in found if kind == "同一篇"}
        if len(indexes) == 1:
            how = "單獨"
        elif _every_pair(indexes, lambda i, j: (i, j) in same):   # indexes ascend, as every edge's (i, j) does
            how = "同一篇"
        elif kinds == {"同一篇"}:
            how = "可能同出處"
        else:
            how = max(kinds, key=rules["order"].index)
        out.append(([items[index] for index in indexes], how, [(items[i], items[j], kind) for i, j, kind in found]))
    return out


def _only_each_other(items: list[_Item]) -> list[tuple[int, int, str]]:
    """Sites that link each other and nowhere else (假網站互相引用). Pages linking anywhere outside are dropped until none
    is left (a page outside that cites them cannot hide them). Sites joined by links both ways form one set per connected
    part; it is a circle when every two of its sites link each other (_every_pair, the rule 同一篇 has) and none links
    outside it -- a one-way link or a chain joins nothing. Every two pages of a circle are joined. A page whose list is
    not whole (outlinks_whole: absent, or maybe cut by collect) is left out like one linking outside: a link it lost may
    be one."""
    kept = {index for index, item in enumerate(items) if item.host and item.outlinks and item.links_whole}
    while True:
        hosts = {items[index].host for index in kept}
        out = {index for index in kept if not items[index].outlinks <= hosts}
        if not out:
            break
        kept -= out
    links: dict[str, set[str]] = {}
    for index in kept:
        links.setdefault(items[index].host, set()).update(items[index].outlinks)

    def both_ways(a: str, b: str) -> bool:
        return b in links[a] and a in links[b]

    part = {host: frozenset({host}) for host in links}
    for host in links:
        for other in links[host]:
            if both_ways(host, other) and part[host] is not part[other]:
                joined = part[host] | part[other]
                for member in joined:
                    part[member] = joined
    edges = []
    for sites in set(part.values()):
        if len(sites) >= 2 and _every_pair(sorted(sites), both_ways) and all(links[site] <= sites for site in sites):
            edges += [(i, j, "只互相引用") for i, j in itertools.combinations(sorted(index for index in kept if items[index].host in sites), 2)]
    return edges


JOINED = {"同一篇": "是同一篇", "可能同出處": "文字很像", "同一張圖": "用了同一張圖", "只互相引用": "在只互相引用的同一圈網站裡"}


def _some(labels: list[str]) -> str:
    unique = sorted(set(labels))   # the same words whatever order the pages came in
    return "、".join(unique[:3]) + (f" 等 {len(unique)} 頁" if len(unique) > 3 else "")


def _joined(item: _Item, joins: list[Join]) -> str:
    """Why a page is in a group joined for more than one reason (or by a chain of 同一篇): what joins it to which page,
    and what else joins the group -- true for every page in it, unlike any one reason said for all."""
    kinds = {kind for _, _, kind in joins}
    mine: dict[str, list[str]] = {}
    for a, b, kind in joins:
        if item is a or item is b:
            mine.setdefault(kind, []).append((b if item is a else a).label)
    said = [f"跟{_some(mine[kind])}{JOINED[kind]}" for kind in JOINED if kind in mine]
    rest = [JOINED[kind] for kind in JOINED if kind in kinds and kind not in mine]
    if rest:
        said.append("組裡還有別的網頁" + "、".join(rest))
    if kinds == {"同一篇"}:
        said.append("但組裡不是每兩頁都是同一篇")
    return "；".join(said) + "；看不出誰轉貼誰"


def _original(group: list[_Item], how: str, joins: list[Join], item: _Item) -> dict[str, str]:
    """原始的還是轉貼的, and what the grouping could not check for this page: a links list collect may have cut."""
    said = _origin_said(group, how, joins, item)
    if item.links_cut and said["state"] != FOUND:
        return {**said, "why": f"{said['why']}；{LINKS_CUT}"}
    return said


def _origin_said(group: list[_Item], how: str, joins: list[Join], item: _Item) -> dict[str, str]:
    """原始的還是轉貼的, read off the grouping: said only for 同一篇, and only from the dates the web archive saw for every
    page of it (a page can write any date it likes); anything less is no basis, so never 查到."""
    if len(group) == 1:
        return cell(NOT_FOUND, why="沒有找到別的網頁有同一篇，看不出是不是轉貼")
    kinds = {kind for _, _, kind in joins}
    if how != "同一篇":
        if kinds == {"只互相引用"}:
            return cell(NOT_FOUND, why="只互相引用，沒有別的依據，看不出誰轉貼誰")
        if kinds == {"可能同出處"}:
            return cell(NOT_FOUND, why="跟同組的網頁很像，但拿不準是不是改寫，由你決定")
        if kinds == {"同一張圖"}:   # a shared image (a default og:image, a blank.jpg) says nothing about who copied whom
            return cell(NOT_FOUND, why="只是用了同一張圖，看不出誰轉貼誰")
        return cell(NOT_FOUND, why=_joined(item, joins))
    if any(member.first_seen is None for member in group):
        return cell(UNCHECKABLE, why="同組有網頁查不到最早出現的時間，排不出先後")
    if item.archived is None:
        return cell(NOT_FOUND, why="只有網頁自己寫的日期，沒有封存館的紀錄，看不出誰先誰後")
    if any(member.archived is None for member in group):
        return cell(NOT_FOUND, why="同組有網頁只有網頁自己寫的日期，沒有封存館的紀錄，看不出誰先誰後")
    dates = [member.archived for member in group]
    earliest = min(dates)
    if item.archived != earliest:
        return cell(FOUND, "轉貼的", why=f"同一篇網頁封存館在 {earliest} 已經存到")
    if dates.count(earliest) > 1:
        return cell(NOT_FOUND, why=f"同組有網頁同一天（{earliest}）被網頁封存館存到，排不出誰先")
    return cell(FOUND, "原始的", why="這一組裡網頁封存館最早存到的")


# ---- the hook ----

def _ancestor_card(row: Mapping[str, Any], rows: Mapping[str, Mapping[str, Any]], carded: Mapping[str, dict[str, Any]]) -> dict[str, Any] | None:
    """The card of the page this row is a newer version of (same URL, new hash), however many versions back."""
    seen, previous = set(), row.get("supersedes_source_id")
    while isinstance(previous, str) and previous not in seen:
        if previous in carded:
            return carded[previous]
        seen.add(previous)
        previous = (rows.get(previous) or {}).get("supersedes_source_id")
    return None


def _clean_channels(channels: Any) -> list[dict[str, str]]:
    out = []
    for item in channels if isinstance(channels, list) else []:
        if isinstance(item, Mapping) and isinstance(item.get("provider"), str) and isinstance(item.get("lang"), str) and item.get("state") in CHANNEL_STATES:
            out.append({"provider": item["provider"][:40], "lang": item["lang"][:10], "state": item["state"], "why": str(item.get("why") or "")[:200]})
    return out


def _normal(kind: str, content: Mapping[str, Any]) -> dict[str, Any]:
    return doc_kinds.validate(kind, content, "system")


def _canonical(groups: Iterable[Mapping[str, Any]]) -> frozenset:
    return frozenset((frozenset(group["cards"]), group["how"]) for group in groups)


def _sources_arrived(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, arrived: dict[str, Any]) -> None:
    if owner.kind != "case":
        return
    reads, cas = _store(docs)
    rows = {row["source_id"]: row for row in reads.sources(tenant_id, owner.id)}
    read = reads.source_text(cas, tenant_id, owner.id)
    rules = require("gather.grouping").items

    def text(source_id: str | None) -> str | None:
        """Read from the store each time, never kept: one page's text is held at a time (F3)."""
        found = read(source_id) if source_id else None
        return found[1] if found else None

    prints: dict[str, _Print] = {}   # source_id -> its fingerprint, taken while the text is in hand for the card

    def new_card(row: Mapping[str, Any]) -> dict[str, Any]:
        body = text(row["source_id"])
        prints[row["source_id"]] = _Print(body, rules)
        return _source_card(row, body, author(row["source_id"]), answers)

    def author(source_id: str) -> str | None:
        events = reads.events(tenant_id, f"source:{source_id}")
        return events[0]["author"] if events else None

    cards = docs.current(tenant_id, owner, "gather.source")
    carded = {doc["content"]["source_id"]: doc for doc in cards if doc["content"].get("source_id")}
    aside_cards = {doc["content"].get("url"): doc for doc in cards if not doc["content"].get("source_id") and doc["content"].get("url")}
    active = sorted((row for row in rows.values() if row["status"] == "active"), key=lambda row: (row["created_at"], row["source_id"]))
    known = {row.get("canonical_url") for row in active if row.get("canonical_url")}
    url_max = doc_kinds.require("gather.source").fields["url"].max   # a card keeps this much of a URL: compare that
    room, skipped = MAX_CASE_CARDS - len(cards), 0   # a new version of a card takes no room; a new card does
    new_rows, new_aside = [], []
    for row in active:
        if row["source_id"] in carded:
            continue
        prior = _ancestor_card(row, rows, carded) or aside_cards.get(row.get("canonical_url"))
        if prior is None and room <= 0:
            skipped += 1
            continue
        if prior is None:
            room -= 1
        new_rows.append((prior, row))
    for entry in arrived.get("aside") or []:
        url = entry.get("url") if isinstance(entry, Mapping) else None
        if isinstance(url, str) and url.startswith(("http://", "https://")) and url[:url_max] not in aside_cards and url[:url_max] not in known:
            if room <= 0:
                skipped += 1
                continue
            room -= 1
            known.add(url[:url_max])
            new_aside.append(entry)
    if skipped:   # fail closed: a page with no card never counts; the page shows the limit (apps/api/blocks/gather.py)
        _log.warning("case %s holds %s source cards (the most): %s new pages got no card", owner.id, MAX_CASE_CARDS, skipped)
    # one question to collect for every address of this run (it batches and never raises: R7, R8)
    answers = collect_lookups.describe(owner.id, [row.get("canonical_url") for _, row in new_rows] + [entry["url"] for entry in new_aside])
    planned: list[tuple[dict[str, Any] | None, dict[str, Any]]] = [(prior, new_card(row)) for prior, row in new_rows]   # (the card this is a new version of, the content)
    planned += [(None, _aside_card(entry, answers)) for entry in new_aside]

    replaced = {prior["doc_id"]: content for prior, content in planned if prior is not None}

    def item(key: str, content: Mapping[str, Any]) -> _Item:
        source_id = content.get("source_id")
        fingerprint = prints.pop(source_id, None) if source_id else None
        return _Item(key, content, fingerprint or _Print(text(source_id), rules), lambda: text(source_id),
                     (rows.get(source_id) or {}).get("relevance") or {})

    items = [item(doc["doc_id"], replaced.get(doc["doc_id"], doc["content"])) for doc in cards]
    items += [item(f"new:{index}", content) for index, (prior, content) in enumerate(planned) if prior is None]
    groups = _groups(items, rules)
    original = {one.key: _original(group, how, joins, one) for group, how, joins in groups for one in group}

    # the lookups above can take seconds: a case erased meanwhile gets nothing written back (the rest of the window is S's: report)
    if reads.case(tenant_id, owner.id) is None:
        return
    ids: dict[str, str] = {}
    by_id = {doc["doc_id"]: doc for doc in cards}
    grouping = {key: value for key, value in require("gather.grouping").stamp().items() if key != "name"}
    for one in items:
        content = {**one.content, "cells": {**one.content["cells"], "original": original[one.key]}, "rules": {**(one.content.get("rules") or {}), "gather.grouping": grouping}}
        held = by_id.get(one.key)
        if held is None:
            ids[one.key] = docs.save(tenant_id, owner, "gather.source", content, SYSTEM)["doc_id"]
            continue
        ids[one.key] = held["doc_id"]
        if _normal("gather.source", content) != held["content"]:
            docs.save(tenant_id, owner, "gather.source", content, SYSTEM, doc_id=held["doc_id"], base_version=held["version"])

    if items:
        content = {"groups": [{"cards": [ids[one.key] for one in group], "how": how} for group, how, _ in groups], "rules_version": require("gather.grouping").version}
        current = docs.current(tenant_id, owner, "gather.origins")
        if not current:
            docs.save(tenant_id, owner, "gather.origins", content, SYSTEM)
        elif _canonical(current[-1]["content"].get("groups") or []) != _canonical(content["groups"]) or current[-1]["content"].get("rules_version") != content["rules_version"]:
            docs.save(tenant_id, owner, "gather.origins", content, SYSTEM, doc_id=current[-1]["doc_id"], base_version=current[-1]["version"])

    run, channels = arrived.get("run"), _clean_channels(arrived.get("channels"))
    if isinstance(run, str) and run and channels:
        held = next((doc for doc in docs.current(tenant_id, owner, "gather.channels") if doc["content"].get("run") == run), None)
        if held is None:
            docs.save(tenant_id, owner, "gather.channels", {"run": run, "channels": channels}, SYSTEM)
        elif held["content"]["channels"] != channels:
            docs.save(tenant_id, owner, "gather.channels", {"run": run, "channels": channels}, SYSTEM, doc_id=held["doc_id"], base_version=held["version"])


AFTER_SOURCES = {"GATHER": _sources_arrived}


# ---- what the person may not save (BEFORE_SAVE) ----

def _live(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, kind: str, doc_id: str | None) -> dict[str, Any] | None:
    return next((doc for doc in docs.current(tenant_id, owner, kind) if doc["doc_id"] == doc_id), None) if doc_id else None


def _card_ids(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> set[str]:
    return {doc["doc_id"] for doc in docs.current(tenant_id, owner, "gather.source")}


def _mark_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    held = _live(docs, tenant_id, owner, "gather.mark", doc_id)
    if held is not None:
        if held["content"].get("origin") != content.get("origin") or sorted(held["content"].get("cards") or []) != sorted(content.get("cards") or []):
            raise InvariantViolation("GATHER_MARK_ORIGIN_FIXED: a mark stays with the group it was made on; mark the new group with a new mark")
        return
    origin = next((item for item in evidence.origins(docs, tenant_id, owner, with_reviews=False) if item["origin_id"] == content.get("origin")), None)
    if origin is None:
        raise InvariantViolation(f"GATHER_ORIGIN_NOT_FOUND: no origin {content.get('origin')!r} in this case now")
    if origin["pending"]:
        raise InvariantViolation("GATHER_ORIGIN_PENDING: this page is still being grouped; mark it once it is")
    if sorted(content.get("cards") or []) != sorted(card["card"] for card in origin["cards"]):
        raise InvariantViolation("GATHER_MARK_CARDS_MISMATCH: a mark names every page of its group, as the group is now")
    if any(doc["content"].get("origin") == origin["origin_id"] for doc in docs.current(tenant_id, owner, "gather.mark")):
        raise InvariantViolation("GATHER_MARK_ALREADY_GIVEN: this origin has your mark; change that one")


def _override_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    held = _live(docs, tenant_id, owner, "gather.override", doc_id)
    if held is not None:
        if (held["content"].get("card"), held["content"].get("key")) != (content.get("card"), content.get("key")):
            raise InvariantViolation("GATHER_OVERRIDE_FIXED: a change stays with the card and the cell it was made for")
        return
    if content.get("card") not in _card_ids(docs, tenant_id, owner):
        raise InvariantViolation(f"GATHER_CARD_NOT_FOUND: no source card {content.get('card')!r} in this case")
    if any((doc["content"].get("card"), doc["content"].get("key")) == (content.get("card"), content.get("key")) for doc in docs.current(tenant_id, owner, "gather.override")):
        raise InvariantViolation("GATHER_OVERRIDE_ALREADY_GIVEN: this cell of this card has your change; change that one")


def _split_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    held = _live(docs, tenant_id, owner, "gather.split", doc_id)
    cards = content.get("cards") or []
    if held is not None:
        if sorted(held["content"].get("cards") or []) != sorted(cards):
            raise InvariantViolation("GATHER_SPLIT_FIXED: the pages of a split stay as split; delete it and split again")
        return
    if not set(cards) <= _card_ids(docs, tenant_id, owner):
        raise InvariantViolation("GATHER_CARD_NOT_FOUND: a page to split is not a source card of this case")
    origin = next((item for item in evidence.origins(docs, tenant_id, owner, with_reviews=False) if cards and cards[0] in {card["card"] for card in item["cards"]}), None)
    members = {card["card"] for card in origin["cards"]} if origin else set()
    if not cards or not set(cards) <= members or set(cards) == members:
        raise InvariantViolation("GATHER_SPLIT_INVALID: split takes some pages, not all, out of one group")
    held_cards = {doc["doc_id"]: doc["content"] for doc in docs.current(tenant_id, owner, "gather.source")}

    def same_text(card: str) -> set[str]:   # what evidence.origins keeps together whatever a split says
        content = held_cards[card]
        sha = (content.get("snapshot") or {}).get("sha256")
        return {key for key in (f"source:{content.get('source_id')}" if content.get("source_id") else "", f"sha:{sha}" if sha else "") if key}

    if set().union(*map(same_text, cards)) & set().union(set(), *map(same_text, set(held_cards) - set(cards))):
        raise InvariantViolation("GATHER_SPLIT_SAME_PAGE: a page that is the same stored text as a page left in the group stays with it")


def _takeback_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    held = _live(docs, tenant_id, owner, "gather.takeback", doc_id)
    if held is not None:
        if held["content"].get("card") != content.get("card"):
            raise InvariantViolation("GATHER_TAKEBACK_ALREADY_GIVEN: a take-back stays with its page")
        return
    card = next((doc for doc in docs.current(tenant_id, owner, "gather.source") if doc["doc_id"] == content.get("card")), None)
    if card is None:
        raise InvariantViolation(f"GATHER_CARD_NOT_FOUND: no source card {content.get('card')!r} in this case")
    if not card["content"].get("aside"):
        raise InvariantViolation("GATHER_NOT_ASIDE: this page is not set aside")
    if any(doc["content"].get("card") == content.get("card") for doc in docs.current(tenant_id, owner, "gather.takeback")):
        raise InvariantViolation("GATHER_TAKEBACK_ALREADY_GIVEN: this page is taken back already")


BEFORE_SAVE = {"gather.mark": _mark_checked, "gather.override": _override_checked, "gather.split": _split_checked, "gather.takeback": _takeback_checked}


# ---- channels, the place's language, distribution (the page and the AI's hand-back read these) ----

def _place_langs(place: str) -> list[str] | None:
    for entry in require("gather.place_languages").items["places"]:
        if entry.get("match") == "govern.taiwan_places" and safety.covers(place):
            return entry["langs"]
        if any(_named(place, name) for name in entry.get("names", [])):
            return entry["langs"]
    return None


def channel_state(cards: list[Mapping[str, Any]], channel_docs: list[Mapping[str, Any]], happened_in: list[str]) -> dict[str, Any]:
    """Which engines and languages were used (``used``: said plainly), what could not be reached, and why the channels
    fall short of the place (管道不足: its language unknown or not searched) or the system must ask (事情發生地的語言一筆都找不到).
    Fewer engines or languages than planned is said, never a stop (operator 2026-10-11: one engine is enough; an engine
    with no key or down is a ``blocked`` row). ``cards``: as evidence.origins gives them."""
    rules = require("gather.place_languages").items
    names, searched = rules["names"], set(rules["searched"])
    used = {(found["provider"], found["lang"]) for card in cards if (found := card.get("found_by") or {}).get("by") == SEARCHED and found.get("provider") and found.get("lang")}
    blocked: dict[tuple[str, str], dict[str, str]] = {}
    for doc in channel_docs:
        for channel in doc["content"].get("channels") or []:
            if channel["state"] == "ok":
                used.add((channel["provider"], channel["lang"]))
            else:
                name = PROVIDER_NAMES.get(channel["provider"], channel["provider"])
                says = f"{name}：{channel_words(channel['state'], channel.get('why'))}"
                blocked[(channel["provider"], channel["state"])] = {**channel, "says": says}
    engines = sorted({provider for provider, _ in used})
    languages = sorted({lang for _, lang in used})
    looked = bool(used or blocked)
    short = []
    used_said = (f"這次用了 {len(engines)} 家搜尋引擎（{'、'.join(PROVIDER_NAMES.get(e, e) for e in engines) or '沒有'}），"
                 f"{len(languages)} 種語言（{'、'.join(names.get(lang, lang) for lang in languages) or '沒有'}）") if looked else None
    code_of = {word: code for code, word in names.items()}
    found_langs = {code_of.get(((card.get("mine") or {}).get("language") or (card.get("cells") or {}).get("language") or {}).get("value"))
                   for card in cards if not card.get("aside")}   # the person's correction of a page's language first
    ask = []
    for place in happened_in:
        langs = _place_langs(place)
        words = "、".join(names.get(lang, lang) for lang in langs or [])
        if langs is None:
            short.append(f"系統不知道「{place}」用什麼語言，沒辦法確定有沒有用當地的語言找")
        elif not set(langs) & searched:
            short.append(f"「{place}」用{words}，平台只用中文和英文找")
        elif looked and not set(langs) & found_langs:
            ask.append(f"「{place}」的語言（{words}）一筆都沒找到")
    return {"engines": [{"key": e, "name": PROVIDER_NAMES.get(e, e)} for e in engines], "languages": [{"key": lang, "name": names.get(lang, lang)} for lang in languages],
            "blocked": list(blocked.values()), "short": short, "ask": ask, "looked": looked, "used": used_said}


def distribution(cards: list[Mapping[str, Any]]) -> dict[str, dict[str, int]]:
    """來源分佈 (pages not set aside): how many came through each engine, in each language, from each country."""
    pages = [card for card in cards if not card.get("aside")]

    def engine(card: Mapping[str, Any]) -> str:
        found = card.get("found_by") or {}
        return PASTED if found.get("by") == PASTED else PROVIDER_NAMES.get(found.get("provider"), found.get("provider") or "沒寫")

    def value(key: str) -> Callable[[Mapping[str, Any]], str]:
        def read(card: Mapping[str, Any]) -> str:
            found = (card.get("cells") or {}).get(key) or {}
            return found.get("value") if found.get("state") == FOUND else found.get("state", UNCHECKABLE)
        return read

    def count(of: Callable[[Mapping[str, Any]], str]) -> dict[str, int]:
        return dict(Counter(of(card) for card in pages).most_common())

    return {"engine": count(engine), "language": count(value("language")), "country": count(value("country"))}


def handback_reasons(found: list[Mapping[str, Any]], channel_docs: list[Mapping[str, Any]], happened_in: list[str]) -> list[str]:
    """交還控制: under two independent origins, 管道不足, or the place's language with nothing found."""
    counted = sum(1 for origin in found if origin["counts"])
    state = channel_state([card for origin in found for card in origin["cards"]], channel_docs, happened_in)
    reasons = [f"獨立出處只有 {counted} 個，不到 {MIN_ORIGINS} 個"] if counted < MIN_ORIGINS else []
    return reasons + [f"管道不足：{why}" for why in state["short"]] + state["ask"]
