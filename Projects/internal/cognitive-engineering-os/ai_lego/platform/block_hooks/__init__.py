"""What a block does around the person's save of one of its documents. One module per block, found by import, so a
block never edits a shared list:
- ``BEFORE_SAVE = {kind: fn}``, ``fn(docs, tenant_id, owner, content, doc_id) -> None``: refuse a save the kind's own
  field rules cannot see (raises InvariantViolation); the docs routes call it before every person's save;
- ``ON_DELETE = {kind: fn}``, ``fn(docs, tenant_id, owner, doc) -> list[item]``: what the person's delete of ``doc``
  also saves, in the delete's own transaction (items as ``CaseDocs.save_many``); the docs routes call it on every delete;
- ``AFTER_SAVE = {kind: fn}``, ``fn(docs, tenant_id, owner, doc) -> list[notice]``: today, propose another block (各塊自己
  發現該加哪一塊; the assembler only shows the proposal, the person decides);
- ``AFTER_SOURCES = {block: fn}``, ``fn(docs, tenant_id, owner, arrived) -> None``: sources reached the case (a batch
  was ingested, a collection run ended, the person pasted one); ``arrived`` = {"run": run id or None, "source_ids": [...]
  or None (= every active source without a card), "aside": [{url, title, reason}], "channels": [{provider, lang, state,
  why}], "pasted": bool}. The hooks run in one background pool, one case at a time, in ``AFTER_SOURCES_ORDER`` (GATHER's
  cards first): a hook may do slow work (registries, archives) directly and never starts a thread of its own; one that
  fails is logged and stops the later hooks for that arrival (VERIFY must not read a run GATHER could not card).
A proposal's ``why`` is the proposing block's own fixed words, never the person's: proposals are kept (not deletable),
so a quote would outlive a deleted card (完整刪除). ``source`` names the record that set it off, by id only."""

from __future__ import annotations

import importlib
import logging
import pkgutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from typing import Any, Callable

from ai_lego.data.events import record_log
from ai_lego.errors import InvariantViolation
from ai_lego.data.repositories.case_docs import CaseDocs

_log = logging.getLogger(__name__)

Hook = Callable[[CaseDocs, str, record_log.Owner, dict[str, Any]], list[dict[str, Any]]]
Check = Callable[[CaseDocs, str, record_log.Owner, dict[str, Any], "str | None"], None]


@lru_cache(maxsize=4)
def _registry(name: str) -> dict[str, list[Callable[..., Any]]]:
    found: dict[str, list[Callable[..., Any]]] = {}
    for info in sorted(pkgutil.iter_modules(__path__), key=lambda module: module.name):
        for kind, fn in getattr(importlib.import_module(f"{__name__}.{info.name}"), name, {}).items():
            found.setdefault(kind, []).append(fn)
    return found


def hooks() -> dict[str, list[Hook]]:
    return _registry("AFTER_SAVE")


def before_save(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, kind: str, content: dict[str, Any], doc_id: str | None = None) -> None:
    for fn in _registry("BEFORE_SAVE").get(kind, ()):
        fn(docs, tenant_id, owner, content, doc_id)


def on_delete(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, kind: str, doc_id: str) -> list[dict[str, Any]]:
    fns = _registry("ON_DELETE").get(kind, ())
    doc = next((item for item in docs.current(tenant_id, owner, kind) if item["doc_id"] == doc_id), None) if fns else None
    return [] if doc is None else [item for fn in fns for item in fn(docs, tenant_id, owner, doc)]


def after_save(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    return [notice for fn in hooks().get(doc["kind"], ()) for notice in fn(docs, tenant_id, owner, doc)]


def propose(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, by_block: str, block: str, why: str, guardrail: bool = False,
            source: str | None = None, topic: str | None = None) -> list[dict[str, Any]]:
    """Record ``by_block``'s proposal to add ``block`` unless the case already has that block (in the intake's list or
    accepted earlier), a proposal for it stands unanswered, or the person declined it in this case (不用 = not asked
    again; the slot still opens it). ``topic``: what the proposal is about when one block can be offered for different
    things (TEACH: the method id) -- then 「already has / standing / declined」 are per block and topic. A proposal for a
    block not built yet is still recorded and says so (組裝器: 畫面寫「這一塊還沒開放」，不能加). ``why``: fixed words (see
    the module note); ``source``: the triggering doc's id."""
    from ai_lego.core.domain.kinds.assembler import OPEN_BLOCKS
    from ai_lego.platform.block_hooks.assembler import case_route, proposals

    if owner.kind != "case":
        return []
    if topic is None and any(item["code"] == block for item in case_route(docs, tenant_id, owner)["blocks"]):
        return []
    kind = f"assembler.proposal.{by_block.lower()}"
    answers = {doc["content"]["proposal"]: doc["content"]["answer"] for doc in docs.current(tenant_id, owner, "assembler.answer")}
    # one standing proposal per block (and topic), whichever block found it first (MAP and SENSE both finding claims =
    # one VERIFY); one the person declined is not proposed again in this case
    if any(item["content"].get("propose") == block and item["content"].get("topic") == topic and answers.get(item["doc_id"]) in (None, "declined")
           for item in proposals(docs, tenant_id, owner)):
        return []
    content = {"propose": block, "why": why[:500], "guardrail": guardrail, **({"source": source} if source else {}), **({"topic": topic} if topic else {})}
    saved = docs.save(tenant_id, owner, kind, content, record_log.system(by_block))
    return [{"type": "proposal", "doc_id": saved["doc_id"], "kind": kind, "by": by_block, "propose": block, "why": saved["content"]["why"], "open": block in OPEN_BLOCKS}]


AFTER_SOURCES_ORDER = ("GATHER", "VERIFY")   # a block not listed runs after these, by name
_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="after-sources")
_IDLE_CONDITION = threading.Condition()
_PENDING_HOOKS = 0  # Test/CLI wait only; database session_lock decides whether a hook may run.


def _run_after_sources(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, arrived: dict[str, Any]) -> None:
    registry = _registry("AFTER_SOURCES")
    order = [block for block in AFTER_SOURCES_ORDER if block in registry] + sorted(set(registry) - set(AFTER_SOURCES_ORDER))
    # A case's hooks one run at a time across every API process and worker: a database session lock (docs.hooks_lock),
    # not an in-process one, because what it guards is database state (the cards a run writes). Its own name, so the
    # erase -- which takes the case lock -- never waits for a hook; a hook's late write gets CASE_ERASED instead.
    with docs.hooks_lock(tenant_id, owner):
        if owner.kind == "case" and docs.reads.case(tenant_id, owner.id) is None:
            return   # erased before this run's turn: nothing is written back
        for block in order:
            for fn in registry[block]:
                try:
                    fn(docs, tenant_id, owner, arrived)
                except InvariantViolation as error:
                    if str(error).startswith("CASE_ERASED"):
                        return   # erased while the hook ran: the repository refused the rest (完整刪除), nothing to report
                    _log.exception("after_sources hook of %s failed for %s; the later hooks did not run", block, owner.id)
                    return
                except Exception:   # noqa: BLE001 -- logged, not swallowed: the sources are stored; this follow-up stops here
                    _log.exception("after_sources hook of %s failed for %s; the later hooks did not run", block, owner.id)
                    return


def after_sources(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, arrived: dict[str, Any]) -> None:
    """Returns at once (the caller is the collector's callback or the person's paste, which already succeeded); the
    hooks run in the background pool. Hooks are idempotent, so the run's end may repeat what a batch already did."""
    global _PENDING_HOOKS
    with _IDLE_CONDITION:
        _PENDING_HOOKS += 1
    try:
        future = _POOL.submit(_run_after_sources, docs, tenant_id, owner, {"aside": [], "channels": [], **arrived})
    except BaseException:
        with _IDLE_CONDITION:
            _PENDING_HOOKS -= 1
            _IDLE_CONDITION.notify_all()
        raise

    def finished(_future: object) -> None:
        global _PENDING_HOOKS
        with _IDLE_CONDITION:
            _PENDING_HOOKS -= 1
            _IDLE_CONDITION.notify_all()

    future.add_done_callback(finished)


def wait_idle(timeout: float = 60.0) -> None:
    """Until every hook submitted so far has finished (tests; a CLI that must not exit early)."""
    deadline = time.monotonic() + timeout
    with _IDLE_CONDITION:
        while _PENDING_HOOKS:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            _IDLE_CONDITION.wait(remaining)
