"""VERIFY around a save and around arriving sources.

BEFORE_SAVE, what a person's save may not do (every path: the generic /docs routes and VERIFY's own):
- ``verify.message``: change once pasted (當時的樣子), or carry a stamp that is not the sha256 of its text;
- ``verify.first``: come twice for one message, or change -- the first reaction is what you thought before looking;
- ``verify.claim`` / ``verify.stance`` / ``verify.verdict`` / ``verify.seen``: touch a message whose first reaction is not
  written (寫完，你才看系統查到什麼); a claim names a real source (its message, its MAP claim, the AI proposal it
  confirms) and a changed claim (its words, its kind, its law details, its other reading) says why; one live stance per (claim, card) and one live verdict per claim (edit the
  first), each for the claim's current version and the card's current page; a stance that differs from the AI reading it
  confirms says why; a quote is the card's own words -- the AI reading's quote (the gate checked it) or one VERIFY's
  stance route checked against the stored page (``vouched``).
AFTER_SAVE: your first reaction writes what the platform cannot check about how the message spread (verify.spread).
AFTER_SOURCES: a 「去查」 run that ended writes verify.search for its claim, and one that will never call back (past its
deadline) is settled as 無法檢查 on any arrival or ledger read; more cards than one AI turn reads -> propose GATHER.
"""

from __future__ import annotations

import contextlib
import hashlib
from contextvars import ContextVar
from typing import Any, Iterator, Mapping

from ai_lego.core.domain.evidence_words import FOUND, NOT_FOUND, UNCHECKABLE, cell, normalise_quote
from ai_lego.core.domain.kinds.map import CHECKABLE as MAP_CHECKABLE
from ai_lego.core.domain.kinds.verify import SPREAD
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform.block_hooks import propose

WHY_GATHER = "這個案子找回來的來源，比 AI 一次能讀的還多。要不要加「蒐集來源」，自己一張一張篩？"
DEAD_RUN = "這次查詢沒有跑完"
NO_CHANNELS = "找資料的服務沒有回報搜尋管道"
NO_REPORT = "找資料的服務沒有回報找到幾頁"
FIRST_REQUIRED = "VERIFY_FIRST_REACTION_REQUIRED: write your first reaction and confidence for this message first; nothing about it is shown or asked of the AI before that"

# A quote VERIFY's stance route checked against the stored page, for the save it is making (same call, same thread).
_VOUCHED: ContextVar[frozenset[tuple[str, str]]] = ContextVar("verify_vouched_quotes", default=frozenset())


@contextlib.contextmanager
def vouched(card: str, quote: str) -> Iterator[None]:
    token = _VOUCHED.set(_VOUCHED.get() | {(card, normalise_quote(quote))})
    try:
        yield
    finally:
        _VOUCHED.reset(token)


def _live(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, kind: str, doc_id: Any) -> dict[str, Any] | None:
    return next((doc for doc in docs.current(tenant_id, owner, kind) if doc["doc_id"] == doc_id), None) if isinstance(doc_id, str) else None


def first_written(firsts: list[dict[str, Any]], message_id: Any) -> bool:
    return any(doc["content"].get("message") == message_id for doc in firsts)


def require_first(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, message_id: Any) -> None:
    """The message exists in this case and its first reaction is written."""
    if _live(docs, tenant_id, owner, "verify.message", message_id) is None:
        raise InvariantViolation(f"VERIFY_MESSAGE_NOT_FOUND: no message {str(message_id)[:64]!r} in this case")
    if not first_written(docs.current(tenant_id, owner, "verify.first"), message_id):
        raise InvariantViolation(FIRST_REQUIRED)


def message_sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _message_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    if doc_id is not None:
        raise InvariantViolation("VERIFY_MESSAGE_FIXED: a message is kept as it was when you pasted it; paste the other version as a new message")
    if not isinstance(content.get("text"), str) or content.get("sha256") != message_sha(content["text"]):
        raise InvariantViolation("VERIFY_MESSAGE_STAMP_INVALID: sha256 is the stamp of the message's exact text")
    if content.get("form") == "連結" and not (isinstance(content.get("url"), str) and content["url"].startswith(("https://", "http://"))):
        raise InvariantViolation("VERIFY_MESSAGE_LINK_REQUIRED: a pasted link needs its address (http:// or https://)")


def _first_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    if doc_id is not None:
        raise InvariantViolation("VERIFY_FIRST_REACTION_FIXED: your first reaction stays as you first wrote it; write what you think now in your verdict")
    if _live(docs, tenant_id, owner, "verify.message", content.get("message")) is None:
        raise InvariantViolation(f"VERIFY_MESSAGE_NOT_FOUND: no message {str(content.get('message'))[:64]!r} in this case")
    if first_written(docs.current(tenant_id, owner, "verify.first"), content.get("message")):
        raise InvariantViolation("VERIFY_FIRST_REACTION_ALREADY_GIVEN: this message has your first reaction")


def _map_claims(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> dict[str, dict[str, Any]]:
    maps = docs.current(tenant_id, owner, "map.map")
    claims = maps[-1]["content"].get("claims") if maps else None
    return {item["id"]: item for item in claims or [] if isinstance(item, Mapping) and isinstance(item.get("id"), str) and item.get("kind") in MAP_CHECKABLE}


def _proposal_ok(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, proposal: Any, message: Any) -> bool:
    split_id, _, index = proposal.partition("#") if isinstance(proposal, str) else ("", "", "")
    split = _live(docs, tenant_id, owner, "verify.split", split_id)
    return split is not None and index.isdigit() and int(index) < len(split["content"].get("claims") or []) and split["content"].get("message") == message


def _claim_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    held = _live(docs, tenant_id, owner, "verify.claim", doc_id)
    if held is not None:
        fixed = [key for key in ("from", "message", "map_claim", "proposal") if (content.get(key) or None) != (held["content"].get(key) or None)]
        if fixed:
            raise InvariantViolation(f"VERIFY_CLAIM_FIXED: {', '.join(fixed)} stays as when the claim was made")
        changed = any(content.get(key) != held["content"].get(key) for key in ("text", "sentence", "law", "jurisdiction", "limitation", "law_source", "alternative"))
        if changed and not (isinstance(content.get("reason"), str) and content["reason"].strip() and content["reason"] != held["content"].get("reason")):
            raise InvariantViolation("VERIFY_CLAIM_REASON_REQUIRED: say why you changed the claim")
        return
    source = content.get("from")
    if source == "訊息" and not content.get("message"):
        raise InvariantViolation("VERIFY_CLAIM_FROM_INVALID: a claim from a message names the message")
    if source == "MAP" and content.get("map_claim") not in _map_claims(docs, tenant_id, owner):
        raise InvariantViolation("VERIFY_CLAIM_FROM_INVALID: a claim from MAP names a fact or law claim of this case's map")
    if content.get("message"):
        require_first(docs, tenant_id, owner, content["message"])
    if content.get("proposal") and not _proposal_ok(docs, tenant_id, owner, content["proposal"], content.get("message")):
        raise InvariantViolation("VERIFY_CLAIM_FROM_INVALID: proposal names a line of an AI split of the same message")


def _claim_now(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, claim_id: Any, version: Any) -> dict[str, Any]:
    claim = _live(docs, tenant_id, owner, "verify.claim", claim_id)
    if claim is None:
        raise InvariantViolation(f"VERIFY_CLAIM_NOT_FOUND: no claim {str(claim_id)[:64]!r} in this case")
    if claim["content"].get("message"):
        require_first(docs, tenant_id, owner, claim["content"]["message"])
    if version != claim["version"]:
        raise InvariantViolation(f"VERIFY_CLAIM_VERSION_STALE: the claim is at version {claim['version']}; read it again")
    return claim


def card_sha(card: Mapping[str, Any]) -> str | None:
    snapshot = card["content"].get("snapshot")
    return snapshot.get("sha256") if isinstance(snapshot, Mapping) else None


def reading_entry(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, reading_id: Any, claim: Any, card: Any) -> dict[str, Any] | None:
    reading = _live(docs, tenant_id, owner, "verify.reading", reading_id)
    entries = reading["content"].get("readings") if reading else None
    return next((entry for entry in entries or [] if isinstance(entry, Mapping) and entry.get("claim") == claim and entry.get("card") == card), None)


def _stance_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    held = _live(docs, tenant_id, owner, "verify.stance", doc_id)
    if held is not None and (held["content"].get("claim"), held["content"].get("card")) != (content.get("claim"), content.get("card")):
        raise InvariantViolation("VERIFY_STANCE_FIXED: a stance stays with the claim and the card it was written for")
    _claim_now(docs, tenant_id, owner, content.get("claim"), content.get("claim_version"))
    card = _live(docs, tenant_id, owner, "gather.source", content.get("card"))
    if card is None:
        raise InvariantViolation(f"VERIFY_CARD_NOT_FOUND: no source card {str(content.get('card'))[:64]!r} in this case")
    if content.get("snapshot") != card_sha(card):
        raise InvariantViolation("VERIFY_SNAPSHOT_STALE: the page changed since this was read; read the card's current page")
    if any(doc["doc_id"] != doc_id and (doc["content"].get("claim"), doc["content"].get("card")) == (content["claim"], content["card"]) for doc in docs.current(tenant_id, owner, "verify.stance")):
        raise InvariantViolation("VERIFY_STANCE_ALREADY_GIVEN: this card already has your reading for this claim; change that one")
    entry = None
    if content.get("reading"):
        entry = reading_entry(docs, tenant_id, owner, content["reading"], content["claim"], content["card"])
        if entry is None or (entry.get("claim_version"), entry.get("snapshot")) != (content["claim_version"], content["snapshot"]):
            raise InvariantViolation("VERIFY_READING_NOT_FOUND: the AI reading named holds no reading of this claim version on this page")
        if entry.get("reads_as") != content.get("stance") and not (isinstance(content.get("reason"), str) and content["reason"].strip()):
            raise InvariantViolation("VERIFY_STANCE_REASON_REQUIRED: you read it differently from the AI; say why")
    quote = content.get("quote")
    if isinstance(quote, str) and quote.strip():
        from_reading = entry is not None and isinstance(entry.get("quote"), str) and normalise_quote(entry["quote"]) == normalise_quote(quote)
        if not from_reading and (content["card"], normalise_quote(quote)) not in _VOUCHED.get():
            raise InvariantViolation("VERIFY_QUOTE_UNCHECKED: a quote you type is checked against the stored page; save it from the VERIFY page")


def _verdict_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    held = _live(docs, tenant_id, owner, "verify.verdict", doc_id)
    if held is not None and held["content"].get("claim") != content.get("claim"):
        raise InvariantViolation("VERIFY_VERDICT_FIXED: a verdict stays with its claim")
    _claim_now(docs, tenant_id, owner, content.get("claim"), content.get("claim_version"))
    if any(doc["doc_id"] != doc_id and doc["content"].get("claim") == content["claim"] for doc in docs.current(tenant_id, owner, "verify.verdict")):
        raise InvariantViolation("VERIFY_VERDICT_ALREADY_GIVEN: this claim has your verdict; change that one")


def _seen_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    require_first(docs, tenant_id, owner, content.get("message"))


def _first_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    message = doc["content"]["message"]
    if not any(item["content"].get("message") == message for item in docs.current(tenant_id, owner, "verify.spread")):
        docs.save(tenant_id, owner, "verify.spread", {"message": message, "cells": {key: cell(UNCHECKABLE, why=why) for key, _, why in SPREAD}}, record_log.system("VERIFY"))
    return []


def search_result(run: Mapping[str, Any], channels: list[Any]) -> tuple[str, str]:
    """What a finished 「去查」 run says for its claim: 查到 (pages came back), 查不到 (every engine answered, none had a
    page), 無法檢查 (it could not look, or did not say where it looked -- zero pages is then not 「找過，沒有」)."""
    if run.get("status") != "completed":
        return UNCHECKABLE, DEAD_RUN
    tried = [item for item in channels if isinstance(item, Mapping)]
    if tried and not any(item.get("state") == "ok" for item in tried):
        return UNCHECKABLE, "這次的搜尋管道都連不上：" + "、".join(sorted({f"{item.get('provider')}（{item.get('lang')}）" for item in tried}))[:200]
    report = run.get("report")
    if not isinstance(report, Mapping):
        return UNCHECKABLE, NO_REPORT
    pages = int(report.get("written") or 0) + int(report.get("unchanged") or 0)
    if pages:
        return FOUND, f"找回 {pages} 頁"
    if not tried:
        return UNCHECKABLE, NO_CHANNELS
    return NOT_FOUND, "找過，沒有找到相關的網頁"


def _run_of(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, run_id: str) -> dict[str, Any] | None:
    return docs._repo.get_collection_run(tenant_id, owner.id, run_id)   # noqa: SLF001 -- CaseDocs has no public reader for runs (report)


def _searched(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> set[tuple[Any, Any, Any]]:
    return {(doc["content"].get("claim"), doc["content"].get("claim_version"), doc["content"].get("run")) for doc in docs.current(tenant_id, owner, "verify.search")}


def _write_search(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, lookup: Mapping[str, Any], state: str, why: str) -> None:
    content = lookup["content"]
    docs.save(tenant_id, owner, "verify.search", {"claim": content["claim"], "claim_version": content["claim_version"], "state": state, "why": why, "run": content["run"]},
              record_log.system("VERIFY"))


def settle_dead_runs(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> None:
    """A 「去查」 run that ended without its end reaching the case (past its deadline a run reads as failed and nobody can
    finish it) gets 無法檢查 「這次查詢沒有跑完」 for its claim, instead of staying 還沒查. Idempotent."""
    written = _searched(docs, tenant_id, owner)
    for lookup in docs.current(tenant_id, owner, "verify.lookup"):
        content = lookup["content"]
        if (content["claim"], content["claim_version"], content["run"]) in written:
            continue
        run = _run_of(docs, tenant_id, owner, content["run"])
        if run is None or run["status"] == "failed":
            _write_search(docs, tenant_id, owner, lookup, UNCHECKABLE, DEAD_RUN)


def usable_cards(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> int:
    """Stored pages an AI reading turn could be given (one per stored page, not set aside or taken back)."""
    taken_back = {doc["content"]["card"] for doc in docs.current(tenant_id, owner, "gather.takeback")}
    return len({doc["content"]["source_id"] for doc in docs.current(tenant_id, owner, "gather.source")
                if doc["content"].get("source_id") and (not doc["content"].get("aside") or doc["doc_id"] in taken_back)})


def _after_sources(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, arrived: dict[str, Any]) -> None:
    from ai_lego.platform.ai_gate import MAX_SOURCES_PER_TURN

    settle_dead_runs(docs, tenant_id, owner)
    run_id = arrived.get("run")
    lookups = [doc for doc in docs.current(tenant_id, owner, "verify.lookup") if run_id and doc["content"].get("run") == run_id]
    if not lookups:
        return
    run = _run_of(docs, tenant_id, owner, run_id)
    if run is None or run["status"] in ("requested", "running"):
        return   # a batch arrived; the run's end says what was found
    written = _searched(docs, tenant_id, owner)
    state, why = search_result(run, list(arrived.get("channels") or []))
    for lookup in lookups:
        content = lookup["content"]
        if (content["claim"], content["claim_version"], run_id) not in written:
            _write_search(docs, tenant_id, owner, lookup, state, why)
    if usable_cards(docs, tenant_id, owner) > MAX_SOURCES_PER_TURN:
        propose(docs, tenant_id, owner, "VERIFY", "GATHER", WHY_GATHER, source=lookups[0]["doc_id"])


BEFORE_SAVE = {"verify.message": _message_checked, "verify.first": _first_checked, "verify.claim": _claim_checked, "verify.stance": _stance_checked,
               "verify.verdict": _verdict_checked, "verify.seen": _seen_checked}
AFTER_SAVE = {"verify.first": _first_saved}
AFTER_SOURCES = {"VERIFY": _after_sources}
