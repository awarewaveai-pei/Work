"""What a block does around the person's save of one of its documents. One module per block, found by import, so a
block never edits a shared list:
- ``BEFORE_SAVE = {kind: fn}``, ``fn(docs, tenant_id, owner, content, doc_id) -> None``: refuse a save the kind's own
  field rules cannot see (raises InvariantViolation); the docs routes call it before every person's save;
- ``AFTER_SAVE = {kind: fn}``, ``fn(docs, tenant_id, owner, doc) -> list[notice]``: today, propose another block (各塊自己
  發現該加哪一塊; the assembler only shows the proposal, the person decides).
A proposal's ``why`` is the proposing block's own fixed words, never the person's: proposals are kept (not deletable),
so a quote would outlive a deleted card (完整刪除). ``source`` names the record that set it off, by id only."""

from __future__ import annotations

import importlib
import pkgutil
from functools import lru_cache
from typing import Any, Callable

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs

Hook = Callable[[CaseDocs, str, record_log.Owner, dict[str, Any]], list[dict[str, Any]]]
Check = Callable[[CaseDocs, str, record_log.Owner, dict[str, Any], "str | None"], None]


@lru_cache(maxsize=2)
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
