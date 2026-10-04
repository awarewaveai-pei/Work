"""GATHER around sources and saves (contract card 「系統做什麼」「人怎麼控制」).

- AFTER_SOURCES: one source card per active stored page without one (a new version of its card when the page came back
  with a new hash), one per page the collector set aside with no text, then the grouping into origins and each card's
  「原始的還是轉貼的」, then what each channel of the run did. Idempotent: a second run over the same arrival adds nothing.
- BEFORE_SAVE (the person's saves): one mark per origin, on exactly that group's pages; one change per card and cell;
  a split takes part of one group; a take-back is for a page set aside, once.
- ``channel_state`` / ``distribution``: 管道不足, the place's language, where the pages came from -- read by the page
  (apps/api/blocks/gather.py) and by the AI's hand-back (ai_actions/gather.py).
Every cell says only what a list or the page itself states, or what collect learnt from a registry or the web archive:
the platform reaches nothing outside itself (specs/wire/lookup.v1.json; STEP2_SHARED_RULES §2)."""

from __future__ import annotations

import re
import unicodedata
import urllib.parse
import zlib
from collections import Counter
from typing import Any, Callable, Iterable, Mapping

from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.evidence_words import FOUND, FOUND_BY, MIN_ORIGINS, NOT_FOUND, UNCHECKABLE, cell
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform import evidence, safety
from ai_lego.platform.net import collect_lookups
from ai_lego.platform.rulesets import require

SYSTEM = record_log.system("GATHER")
SEARCHED, PASTED = FOUND_BY
CARD_RULES = ("gather.source_lists", "gather.outlets", "gather.grouping")
MIN_ENGINES = MIN_LANGUAGES = 2   # 系統至少用兩家搜尋引擎、兩種語言找
CHANNEL_STATES = ("ok", "unreachable", "no_key")
PROVIDER_NAMES = {"serper": "Serper（Google 的結果）", "brave": "Brave"}
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")
_COPYRIGHT = re.compile(r"(?:©|\(c\)|Copyright|版權所有)\s*(?:©)?\s*(?:\d{4}(?:\s*[-–~]\s*\d{4})?)?\s*([^\n|｜。，,]{2,80})", re.I)
_TITLE_SEPARATORS = re.compile(r"\s[-|–—]\s|｜|－")
_EN_WORDS = frozenset("the and of to in is that for it with as was on are by this be from or at".split())


# ---- reading what is stored ----

def _store(docs: CaseDocs) -> tuple[Any, Any]:
    """The case's stored pages (the repository CaseDocs writes to) and their content store (the API's, its test override
    included). A hook is handed only CaseDocs (block_hooks.after_sources); see the step-2 report for the change asked of S."""
    from ai_lego.apps.api import main as api

    return docs._repo, api.app.dependency_overrides.get(api.get_source_cas, api.get_source_cas)()   # noqa: SLF001


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
                restricted = (place, body, f"{suffix} 只發給{place}的{body}")
    return found, restricted


def _site_name(title: str) -> str:
    """The site's own name, when the title carries one after a separator (「文章 | BBC News」)."""
    parts = [part.strip() for part in _TITLE_SEPARATORS.split(title or "") if part.strip()]
    return parts[-1] if len(parts) > 1 else ""


def _named(text: str, name: str) -> bool:
    if not text:
        return False
    return bool(re.search(rf"(?<![A-Za-z]){re.escape(name)}(?![A-Za-z])", text, re.I)) if name.isascii() else name in text


def _name_tokens(host: str, site: str) -> list[str]:
    """Where a site's own name can be: the host's labels up to the first label of the name the registry holds
    (collect's ``site``: bbc.fakehost.xyz -> bbc, fakehost); every label when collect did not answer."""
    labels = host.split(".") if host else []
    if site and (host == site or host.endswith(f".{site}")):
        labels = labels[: len(labels) - len(site.split(".")) + 1]
    return [token for label in labels for token in re.split(r"[^a-z0-9]+", label) if token]


def _outlet(host: str, site: str, title: str) -> tuple[dict[str, Any] | None, bool, bool]:
    """(the outlet, whether the site IS it, whether the site's name reads like a news outlet)."""
    rules = require("gather.outlets").items
    for outlet in rules["outlets"]:
        if host and any(host == domain or host.endswith(f".{domain}") for domain in outlet["domains"]):
            return outlet, True, True
    site = _site_name(title)
    tokens = _name_tokens(host, site)
    for outlet in rules["outlets"]:
        for name in outlet["names"]:
            squeezed = re.sub(r"[^a-z0-9]", "", name.lower())
            in_host = name.isascii() and len(squeezed) >= rules["min_host_name"] and any(token.startswith(squeezed) for token in tokens)
            if _named(site, name) or in_host:
                return outlet, False, True
    return None, False, any(_named(site, word) for word in rules["media_words"])


def _language(text: str | None) -> dict[str, str]:
    names = require("gather.place_languages").items["names"]
    if text is None:
        return cell(UNCHECKABLE, why="抓不到內文")
    sample = text[:20000]
    han = len(re.findall(r"[㐀-䶿一-鿿]", sample))
    kana = len(re.findall(r"[぀-ヿ]", sample))
    hangul = len(re.findall(r"[가-힯]", sample))
    latin = len(re.findall(r"[A-Za-z]", sample))
    cjk = han + kana + hangul
    if not cjk and not latin:
        return cell(NOT_FOUND, why="網頁沒有看得出語言的文字")
    if cjk * 3 >= latin:
        code = "ja" if kana >= max(10, cjk // 10) else "ko" if hangul * 2 >= cjk else "zh"
        return cell(FOUND, names[code])
    words = re.findall(r"[a-z]+", sample.lower())[:3000]
    if sum(word in _EN_WORDS for word in words) * 100 >= 8 * len(words):
        return cell(FOUND, names["en"])
    return cell(UNCHECKABLE, why="拉丁字母寫的，但看不出是英文；系統只分得出中文、英文、日文、韓文")


def _operator(text: str | None, outlet: dict[str, Any] | None, is_outlet: bool) -> dict[str, str]:
    if outlet and is_outlet:
        return cell(FOUND, outlet["name"], why=f"網域在已知媒體名單上（v{require('gather.outlets').version}）")
    if text is None:
        return cell(UNCHECKABLE, why="抓不到內文，看不到網頁寫誰經營")
    lines = [match.group(0).strip() for match in _COPYRIGHT.finditer(text)]
    if lines:
        return cell(FOUND, lines[-1][:120], why="網頁上自己寫的")
    return cell(NOT_FOUND, why="這一頁沒寫是誰經營的；系統沒有讀網站的「關於我們」頁")


def _outlet_cell(host: str, title: str, outlet: dict[str, Any] | None, is_outlet: bool, newsy: bool) -> dict[str, str]:
    if outlet and is_outlet:
        return cell(FOUND, f"是{outlet['name']}的網域")
    if outlet:
        return cell(FOUND, f"名字像{outlet['name']}，但不是{outlet['name']}的網域")
    if not host and not _site_name(title):
        return cell(UNCHECKABLE, why="你貼的是檔案，沒有網域可以對")
    if newsy:
        return cell(UNCHECKABLE, why="名字像媒體，但不在已知媒體名單上；系統沒辦法查它存不存在")
    return cell(NOT_FOUND, why="名字不像媒體")


def _first_seen(published: Any, archived: dict[str, str] | None) -> dict[str, str]:
    """最早何時出現: the earlier of the date the page states and the archive's first capture (collect's
    ``first_archived``; ``None`` = a pasted file with no address to ask about)."""
    stated = _date(published)
    if archived is None:
        return cell(FOUND, stated, why="網頁自己寫的日期") if stated else cell(UNCHECKABLE, why="你貼的檔案沒寫日期，也沒有網址可以查網頁封存館")
    if archived["state"] == FOUND and not _date(archived["value"]):   # compared as a date below, so it must be one
        archived = cell(UNCHECKABLE, why=collect_lookups.MALFORMED)
    if archived["state"] == FOUND and (not stated or archived["value"][:10] < stated):
        return cell(FOUND, archived["value"][:10], why=archived.get("why") or "網頁封存館最早存到的日期")
    if stated:
        return cell(FOUND, stated, why="網頁自己寫的日期" + (f"；網頁封存館：{archived['why']}" if archived["state"] == UNCHECKABLE else ""))
    return cell(archived["state"], why=f"網頁沒寫日期；{archived['why']}")


def _stamps() -> dict[str, dict[str, str]]:
    return {name: {key: value for key, value in require(name).stamp().items() if key != "name"} for name in CARD_RULES}


def _cells(url: str, title: str, text: str | None, published: Any, looked: Mapping[str, Any] | None) -> tuple[dict[str, dict[str, str]], list[dict[str, str]]]:
    """``looked``: collect's answer for ``url`` (collect_lookups.describe), ``None`` for a pasted file with no address."""
    host = _host(url)
    lists, restricted = _lists(host)
    outlet, is_outlet, newsy = _outlet(host, (looked or {}).get("site") or "", title)
    no_site = cell(UNCHECKABLE, why="你貼的是檔案，沒有網域可以查")
    looked_up = {"registered": looked["registered"], "country": looked["country"]} if looked else {"registered": no_site, "country": no_site}
    if restricted:
        country = cell(FOUND, restricted[0], why=restricted[2])
    elif outlet and is_outlet and outlet.get("country"):
        country = cell(FOUND, outlet["country"], why="已知媒體名單")
    else:
        country = looked_up["country"]
    affiliation = cell(FOUND, restricted[1], why=restricted[2]) if restricted else cell(NOT_FOUND, why="名單上沒有寫它隸屬誰")
    return {
        "operator": _operator(text, outlet, is_outlet),
        "registered": looked_up["registered"],
        "country": country,
        "language": _language(text),
        "original": cell(NOT_FOUND, why="還在分組"),   # replaced from the grouping before the card is saved
        "first_seen": _first_seen(published, looked["first_archived"] if looked else None),
        "stance": cell(UNCHECKABLE, why="系統沒有讀網站的「關於我們」頁，不知道它自己宣稱的立場；你可以自己補上"),
        "affiliation": affiliation,
        "party_relation": cell(UNCHECKABLE, why="系統不知道它跟這件事的當事方有什麼關係；你可以自己寫"),
        "outlet_exists": _outlet_cell(host, title, outlet, is_outlet, newsy),
    }, lists


def _found_by(row: Mapping[str, Any], author: str | None) -> dict[str, str]:
    relevance = row.get("relevance") if isinstance(row.get("relevance"), Mapping) else {}
    if relevance.get("pasted") is True or author == "user":
        return {"by": PASTED}
    keys = (("provider", "searchProvider", 40), ("lang", "searchLang", 10), ("query", "searchQuery", 300), ("angle", "searchAngle", 20))
    return {"by": SEARCHED, **{key: relevance[name][:limit] for key, name, limit in keys if isinstance(relevance.get(name), str) and relevance[name]}}


def _source_card(row: Mapping[str, Any], text: str | None, author: str | None, answers: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    url = row.get("canonical_url") or ""
    cells, lists = _cells(url, row.get("title") or "", text, row.get("published_at"), answers.get(url) if url else None)
    relevance = row.get("relevance") if isinstance(row.get("relevance"), Mapping) else {}
    aside = relevance.get("aside") if isinstance(relevance.get("aside"), str) else ""
    return {"source_id": row["source_id"], "url": url[:2048], "title": (row.get("title") or "")[:300], "found_by": _found_by(row, author),
            "cells": cells, "lists": lists, "snapshot": {"sha256": row["content_sha256"], "fetched_at": row.get("fetched_at") or row["created_at"]},
            "aside": aside[:300], "rules": _stamps()}


def _aside_card(entry: Mapping[str, Any], answers: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """A page the collector could not get text from (放一旁): a card all the same, with what its address tells."""
    url, title = entry["url"][:2048], str(entry.get("title") or "")[:300]
    cells, lists = _cells(url, title, None, None, answers.get(entry["url"]))
    reason = entry.get("reason") if isinstance(entry.get("reason"), str) and entry["reason"].strip() else "抓不到內文"
    return {"source_id": "", "url": url, "title": title, "found_by": {"by": SEARCHED}, "cells": cells, "lists": lists, "aside": reason[:300], "rules": _stamps()}


# ---- grouping (同一出處的分組) ----

def _link_host(link: str) -> str:
    return _host(link if "://" in link else f"https://{link}")


class _Item:
    """One card as the grouping sees it: its text in pieces, its main image, its site and the sites it links to."""

    def __init__(self, key: str, content: Mapping[str, Any], text: str | None, relevance: Mapping[str, Any], rules: Mapping[str, Any]) -> None:
        self.key, self.content, self._rules = key, content, rules
        folded = unicodedata.normalize("NFKC", (text or "")[: rules["compare_chars"] * 2]).casefold()
        self.letters = "".join(ch for ch in folded if not ch.isspace() and not unicodedata.category(ch).startswith("P"))[: rules["compare_chars"]]
        self._pieces: dict[bool, frozenset[int]] = {}
        image = relevance.get("imageUrl")
        self.image = image if isinstance(image, str) and image.startswith(("http://", "https://")) else None
        self.host = _host(content.get("url") or "")
        links = relevance.get("outlinks")
        self.outlinks = {_link_host(link) for link in links if isinstance(link, str) and link} - {self.host, ""} if isinstance(links, list) else set()
        first = (content.get("cells") or {}).get("first_seen") or {}
        self.first_seen = _date(first.get("value")) if first.get("state") == FOUND else None

    def pieces(self, sampled: bool) -> frozenset[int]:
        if sampled not in self._pieces:
            size, every = self._rules["shingle"], self._rules["keep_one_in"] if sampled else 1
            hashed = (zlib.crc32(self.letters[i:i + size].encode("utf-8")) for i in range(max(0, len(self.letters) - size + 1)))
            self._pieces[sampled] = frozenset(value for value in hashed if value % every == 0)
        return self._pieces[sampled]


def _likeness(a: _Item, b: _Item, rules: Mapping[str, Any]) -> float:
    """Share of text pieces two pages have in common (Jaccard); 0 when it cannot reach 「可能同出處」 by length alone."""
    short, long = sorted((len(a.letters), len(b.letters)))
    if not short or short / long < rules["maybe_same"]:
        return 0.0
    sampled = short > rules["sample_above"]
    x, y = a.pieces(sampled), b.pieces(sampled)
    both = len(x & y)
    return both / (len(x) + len(y) - both) if x and y else 0.0


def _groups(items: list[_Item], rules: Mapping[str, Any]) -> list[tuple[list[_Item], str]]:
    """Every item in exactly one group: (items, how). Two pages join on near-identical text (同一篇), text between the
    thresholds (可能同出處), the same main image (同一張圖), or links that only point at each other (只互相引用); a
    group joined for different reasons says the least certain one."""
    parent = list(range(len(items)))

    def root(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    edges: list[tuple[int, int, str]] = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            likeness = _likeness(items[i], items[j], rules)
            if likeness >= rules["same_text"]:
                edges.append((i, j, "同一篇"))
            elif likeness >= rules["maybe_same"]:
                edges.append((i, j, "可能同出處"))
            if items[i].image and items[i].image == items[j].image:
                edges.append((i, j, "同一張圖"))
    edges += _only_each_other(items)
    for i, j, _ in edges:
        parent[root(i)] = root(j)
    order = rules["order"]
    members: dict[int, list[int]] = {}
    for index in range(len(items)):
        members.setdefault(root(index), []).append(index)
    how: dict[int, str] = {}
    for i, _, kind in edges:
        top = root(i)
        how[top] = max(how.get(top, kind), kind, key=order.index)
    return [([items[index] for index in indexes], how.get(top, "單獨")) for top, indexes in sorted(members.items(), key=lambda pair: pair[1][0])]


def _only_each_other(items: list[_Item]) -> list[tuple[int, int, str]]:
    """Sites whose outgoing links all point at each other and nowhere else (假網站互相引用). Pages linking anywhere
    outside are dropped until none is left (a page outside that cites the circle cannot hide it); what remains,
    joined by its links, is one circle per connected set of two or more sites."""
    kept = {index for index, item in enumerate(items) if item.host and item.outlinks}
    while True:
        hosts = {items[index].host for index in kept}
        out = {index for index in kept if not items[index].outlinks <= hosts}
        if not out:
            break
        kept -= out
    by_host: dict[str, list[int]] = {}
    for index in kept:
        by_host.setdefault(items[index].host, []).append(index)
    circle = {index: frozenset({index}) for index in kept}
    for index in kept:
        for host in items[index].outlinks:
            for other in by_host[host]:
                joined = circle[index] | circle[other]
                for member in joined:
                    circle[member] = joined
    edges = []
    for group in set(circle.values()):
        if len({items[member].host for member in group}) >= 2:
            ordered = sorted(group)
            edges += [(ordered[0], member, "只互相引用") for member in ordered[1:]]
    return edges


def _original(group: list[_Item], how: str, item: _Item) -> dict[str, str]:
    """原始的還是轉貼的, read off the grouping."""
    if len(group) == 1:
        return cell(NOT_FOUND, why="沒有找到別的網頁有同一篇，看不出是不是轉貼")
    if how == "可能同出處":
        return cell(NOT_FOUND, why="跟同組的網頁很像，但拿不準是不是改寫，由你決定")
    if how == "只互相引用":
        return cell(FOUND, "只互相引用，沒有別的依據")
    dates = [member.first_seen for member in group]
    if None in dates:
        return cell(UNCHECKABLE, why="同組有網頁查不到最早出現的時間，排不出先後")
    earliest = min(dates)
    if item.first_seen != earliest:
        return cell(FOUND, "轉貼的", why=f"{how}在 {earliest} 已經出現")
    if dates.count(earliest) > 1:
        return cell(NOT_FOUND, why=f"同組有網頁同一天（{earliest}）出現，排不出誰先")
    return cell(FOUND, "原始的", why="這一組裡最早出現的")


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
    repo, cas = _store(docs)
    rows = {row["source_id"]: row for row in repo.list_sources(tenant_id, owner.id)}
    read = repo.active_source_reader(cas, tenant_id, owner.id)
    texts: dict[str, str | None] = {}

    def text(source_id: str | None) -> str | None:
        if not source_id:
            return None
        if source_id not in texts:
            found = read(source_id)
            texts[source_id] = found[1] if found else None
        return texts[source_id]

    def author(source_id: str) -> str | None:
        events = repo.list_events(tenant_id, f"source:{source_id}")
        return events[0]["author"] if events else None

    cards = docs.current(tenant_id, owner, "gather.source")
    carded = {doc["content"]["source_id"]: doc for doc in cards if doc["content"].get("source_id")}
    aside_cards = {doc["content"].get("url"): doc for doc in cards if not doc["content"].get("source_id") and doc["content"].get("url")}
    active = sorted((row for row in rows.values() if row["status"] == "active"), key=lambda row: (row["created_at"], row["source_id"]))
    known = {row.get("canonical_url") for row in active if row.get("canonical_url")}
    new_rows = [(_ancestor_card(row, rows, carded) or aside_cards.get(row.get("canonical_url")), row) for row in active if row["source_id"] not in carded]
    new_aside = []
    for entry in arrived.get("aside") or []:
        url = entry.get("url") if isinstance(entry, Mapping) else None
        if isinstance(url, str) and url.startswith(("http://", "https://")) and url not in aside_cards and url not in known:
            known.add(url)
            new_aside.append(entry)
    # one question to collect for every address of this run (it batches and never raises: R7, R8)
    answers = collect_lookups.describe(owner.id, [row.get("canonical_url") for _, row in new_rows] + [entry["url"] for entry in new_aside])
    planned: list[tuple[dict[str, Any] | None, dict[str, Any]]] = [   # (the card this is a new version of, the content)
        (prior, _source_card(row, text(row["source_id"]), author(row["source_id"]), answers)) for prior, row in new_rows]
    planned += [(None, _aside_card(entry, answers)) for entry in new_aside]

    rules = require("gather.grouping").items
    replaced = {prior["doc_id"]: content for prior, content in planned if prior is not None}

    def item(key: str, content: Mapping[str, Any]) -> _Item:
        return _Item(key, content, text(content.get("source_id")), (rows.get(content.get("source_id")) or {}).get("relevance") or {}, rules)

    items = [item(doc["doc_id"], replaced.get(doc["doc_id"], doc["content"])) for doc in cards]
    items += [item(f"new:{index}", content) for index, (prior, content) in enumerate(planned) if prior is None]
    groups = _groups(items, rules)
    original = {one.key: _original(group, how, one) for group, how in groups for one in group}

    # the lookups above can take seconds: a case erased meanwhile gets nothing written back (the rest of the window is S's: report)
    if repo.get_project(tenant_id, owner.id) is None:
        return
    ids: dict[str, str] = {}
    by_id = {doc["doc_id"]: doc for doc in cards}
    for one in items:
        content = {**one.content, "cells": {**one.content["cells"], "original": original[one.key]}}
        held = by_id.get(one.key)
        if held is None:
            ids[one.key] = docs.save(tenant_id, owner, "gather.source", content, SYSTEM)["doc_id"]
            continue
        ids[one.key] = held["doc_id"]
        if _normal("gather.source", content) != held["content"]:
            docs.save(tenant_id, owner, "gather.source", content, SYSTEM, doc_id=held["doc_id"], base_version=held["version"])

    if items:
        content = {"groups": [{"cards": [ids[one.key] for one in group], "how": how} for group, how in groups], "rules_version": require("gather.grouping").version}
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
    """Which engines and languages were used, what could not be reached, and why the channels fall short (管道不足) or
    the system must ask (事情發生地的語言一筆都找不到). ``cards``: as evidence.origins gives them."""
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
                says = f"平台還沒有{name}的金鑰" if channel["state"] == "no_key" else f"這裡連不上{name}"
                blocked[(channel["provider"], channel["state"])] = {**channel, "says": says}
    engines = sorted({provider for provider, _ in used})
    languages = sorted({lang for _, lang in used})
    looked = bool(used or blocked)
    short = []
    if looked and len(engines) < MIN_ENGINES:
        short.append(f"只用了 {len(engines)} 家搜尋引擎" + (f"（{'、'.join(PROVIDER_NAMES.get(e, e) for e in engines)}）" if engines else ""))
    if looked and len(languages) < MIN_LANGUAGES:
        short.append(f"只用了 {len(languages)} 種語言" + (f"（{'、'.join(names.get(lang, lang) for lang in languages)}）" if languages else ""))
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
            "blocked": list(blocked.values()), "short": short, "ask": ask, "looked": looked}


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
