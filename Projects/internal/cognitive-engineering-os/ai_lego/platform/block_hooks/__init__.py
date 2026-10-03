"""What a block does after the person saves one of its documents -- today: propose another block (各塊自己發現該加
哪一塊; the assembler only shows the proposal, the person decides). One module per block: ``AFTER_SAVE = {kind: fn}``,
``fn(docs, tenant_id, owner, doc) -> list[notice]``. Found by import, so a block never edits a shared list."""

from __future__ import annotations

import importlib
import pkgutil
from functools import lru_cache
from typing import Any, Callable

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs

Hook = Callable[[CaseDocs, str, record_log.Owner, dict[str, Any]], list[dict[str, Any]]]


@lru_cache(maxsize=1)
def hooks() -> dict[str, list[Hook]]:
    found: dict[str, list[Hook]] = {}
    for info in sorted(pkgutil.iter_modules(__path__), key=lambda module: module.name):
        for kind, fn in getattr(importlib.import_module(f"{__name__}.{info.name}"), "AFTER_SAVE", {}).items():
            found.setdefault(kind, []).append(fn)
    return found


def after_save(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    return [notice for fn in hooks().get(doc["kind"], ()) for notice in fn(docs, tenant_id, owner, doc)]


def propose(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, by_block: str, block: str, why: str, guardrail: bool = False) -> list[dict[str, Any]]:
    """Record ``by_block``'s proposal to add ``block`` unless an unanswered one already stands; return it as a notice.
    A proposal for a block not built yet is still recorded and says so (組裝器: 畫面寫「這一塊還沒開放」，不能加)."""
    from ai_lego.core.domain.kinds.assembler import OPEN_BLOCKS

    if owner.kind != "case":
        return []
    kind = f"assembler.proposal.{by_block.lower()}"
    answered = {doc["content"]["proposal"] for doc in docs.current(tenant_id, owner, "assembler.answer")}
    if any(item["content"].get("propose") == block and item["doc_id"] not in answered for item in docs.current(tenant_id, owner, kind)):
        return []
    saved = docs.save(tenant_id, owner, kind, {"propose": block, "why": why[:500], "guardrail": guardrail}, record_log.system(by_block))
    return [{"type": "proposal", "doc_id": saved["doc_id"], "kind": kind, "by": by_block, "propose": block, "why": saved["content"]["why"], "open": block in OPEN_BLOCKS}]
