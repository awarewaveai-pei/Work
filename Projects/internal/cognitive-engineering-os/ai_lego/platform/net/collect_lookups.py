"""Asking collect (lookups v1, specs/wire/lookup.v1.json): the platform's only way to learn anything from outside -- a
site's registry record, a page's first archive capture, the fact-check databases. The platform fetches nothing itself
(operator 2026-09-17; why, 2026-10-04: each block is built separately and then chained, collect is the searcher).

Traps for future readers:
- Never raises. Collect down, no token, an answer not in the spec's shape: every cell is 無法檢查 with why (R7, R8),
  so a hook carries on and the card says what happened instead of guessing.
- Lists and thresholds are collect's (R5). Nothing here decides what matches or which registry to ask.
"""

from __future__ import annotations

import logging
from typing import Any, Mapping, Protocol

from ai_lego.core.domain.evidence_words import FOUND, NOT_FOUND, UNCHECKABLE, cell
from ai_lego.errors import InvariantViolation
from ai_lego.platform.net.collection_service import LOOKUP_ERRORS, collection_service_from_env

_log = logging.getLogger(__name__)

DOWN = "蒐集器這次沒有回應"
MALFORMED = "蒐集器的回答格式不對"
DESCRIBE_CELLS = ("registered", "country", "first_archived")
DBS = ("claimreview", "cofacts")
MAX_DESCRIBE = 25
MAX_VALUE, MAX_WHY = 200, 300   # collect's words in a cell; ten cells stay far under gather.source's cells cap
MAX_TEXT = 4000
TIMEOUT_SECONDS = 45.0
_HIT_KEYS = {
    "claimreview": ("claim", "url", "publisher", "publisher_url", "judged_as", "date", "claimant"),
    "cofacts": ("article_id", "url", "date"),
}
_REPLY_KEYS = ("judged_as", "text", "reference", "date")


class LookupClient(Protocol):
    def lookup(self, project_id: str, kind: str, items: list[dict[str, Any]], timeout: float) -> dict[str, Any]: ...


_FROM_ENV = object()


def _ask(client: Any, project_id: str, kind: str, items: list[dict[str, Any]]) -> tuple[list[Any] | None, str]:
    """(the answer's items, "") when collect answered in shape (one per item), else (None, DOWN or MALFORMED) -- logged,
    never raised."""
    if client is _FROM_ENV:
        client = collection_service_from_env()
    if client is None:
        _log.warning("collect lookup %s skipped: COLLECT_RESEARCH_RUNS_TOKEN is not set", kind)
        return None, DOWN
    try:
        answer = client.lookup(project_id, kind, items, TIMEOUT_SECONDS)
    except InvariantViolation as error:
        _log.warning("collect lookup %s failed: %s", kind, error)
        answered = str(error).startswith(f"{LOOKUP_ERRORS}_MALFORMED_RESPONSE")   # a body that is not JSON or too large (R7)
        return None, MALFORMED if answered else DOWN
    listed = answer.get("items") if isinstance(answer, Mapping) and answer.get("kind") == kind else None
    if not isinstance(listed, list) or len(listed) != len(items):
        _log.warning("collect lookup %s answered out of shape", kind)
        return None, MALFORMED
    return listed, ""


def _cell(value: Any) -> dict[str, str]:
    try:
        if not isinstance(value, Mapping) or set(value) - {"state", "value", "why"}:
            raise InvariantViolation("shape")
        given, why = value.get("value"), value.get("why")
        return cell(value.get("state"), given.strip()[:MAX_VALUE] if isinstance(given, str) else given, why.strip()[:MAX_WHY] if isinstance(why, str) else why)
    except InvariantViolation:
        return cell(UNCHECKABLE, why=MALFORMED)


def _unchecked(url: str, why: str) -> dict[str, Any]:
    return {"url": url, "site": "", **{key: cell(UNCHECKABLE, why=why) for key in DESCRIBE_CELLS}}


def describe(project_id: str, urls: list[str], *, client: Any = _FROM_ENV) -> dict[str, dict[str, Any]]:
    """``{url: {"url", "site", "registered", "country", "first_archived"}}`` for every distinct URL, asked in batches
    of MAX_DESCRIBE. A batch collect did not answer is 無法檢查 「蒐集器這次沒有回應」."""
    distinct = list(dict.fromkeys(url for url in urls if isinstance(url, str) and url))
    out: dict[str, dict[str, Any]] = {}
    down = False
    for start in range(0, len(distinct), MAX_DESCRIBE):
        batch = distinct[start:start + MAX_DESCRIBE]
        listed, why = (None, DOWN) if down else _ask(client, project_id, "describe", [{"url": url} for url in batch])
        down = why == DOWN   # collect did not answer: the rest of this run is not asked again (each ask may wait the full timeout)
        for index, url in enumerate(batch):
            item = listed[index] if listed is not None else None
            if listed is None:
                out[url] = _unchecked(url, why)
            elif not isinstance(item, Mapping) or item.get("url") != url or not isinstance(item.get("site"), str):
                out[url] = _unchecked(url, MALFORMED)
            else:
                out[url] = {"url": url, "site": item["site"].strip().lower()[:253], **{key: _cell(item.get(key)) for key in DESCRIBE_CELLS}}
    return out


def _text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _hits(db: str, hits: Any) -> list[dict[str, Any]] | None:
    if not isinstance(hits, list):
        return None
    out = []
    for hit in hits:
        if not isinstance(hit, Mapping) or not _text(hit.get("url"), 2000).startswith(("http://", "https://")):
            return None
        kept: dict[str, Any] = {key: _text(hit.get(key), 1200) for key in _HIT_KEYS[db]}
        if db == "cofacts":
            replies = hit.get("replies")
            if not isinstance(replies, list) or not all(isinstance(reply, Mapping) for reply in replies):
                return None
            kept["replies"] = [{key: _text(reply.get(key), 1200) for key in _REPLY_KEYS} for reply in replies]
        out.append(kept)
    return out


def _db_state(entry: Mapping[str, Any]) -> dict[str, str] | None:
    """A database's own state: 查到 alone, or 查不到 / 無法檢查 with why (a database answer has no value)."""
    state, why = entry.get("state"), entry.get("why")
    if state == FOUND:
        return {"state": FOUND}
    if state in (NOT_FOUND, UNCHECKABLE) and isinstance(why, str) and why.strip():
        return {"state": state, "why": why.strip()[:300]}
    return None


def _unchecked_db(db: str, why: str) -> dict[str, Any]:
    return {"db": db, **cell(UNCHECKABLE, why=why), "attribution": "", "hits": []}


def factcheck(project_id: str, text: str, *, client: Any = _FROM_ENV) -> list[dict[str, Any]]:
    """One entry per database in DBS order: ``{"db", "state", "why"?, "attribution", "hits"}``. 查到 always has at
    least one hit; anything else collect said is kept with its why."""
    listed, why = _ask(client, project_id, "factcheck", [{"text": text[:MAX_TEXT]}])
    item = listed[0] if listed else None
    if listed is None:
        return [_unchecked_db(db, why) for db in DBS]
    answered = item.get("dbs") if isinstance(item, Mapping) and item.get("text") == text[:MAX_TEXT] else None
    by_db = {entry.get("db"): entry for entry in answered if isinstance(entry, Mapping)} if isinstance(answered, list) else {}
    out = []
    for db in DBS:
        entry = by_db.get(db)
        hits = _hits(db, entry.get("hits")) if isinstance(entry, Mapping) else None
        state = _db_state(entry) if isinstance(entry, Mapping) else None
        if hits is None or state is None or (state["state"] == FOUND) != bool(hits):
            out.append(_unchecked_db(db, MALFORMED))
            continue
        out.append({"db": db, **state, "attribution": _text(entry.get("attribution"), 300), "hits": hits})
    return out
