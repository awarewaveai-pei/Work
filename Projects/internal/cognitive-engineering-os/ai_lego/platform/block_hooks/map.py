"""MAP (系統做什麼): after the person saves a version of the map --
a gap they wrote -> propose GATHER; a claim of a kind that can be checked -> propose VERIFY; a 拆法 used for the first time in
this case -> propose TEACH. Only what is new since the previous version is proposed, so a declined proposal does not come
back with every save. High-risk and crisis words are read by GOVERN's hook and the save route (every text, however deep)."""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.kinds.map import CHECKABLE
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform import evidence
from ai_lego.platform.block_hooks import propose


# A proposal is never deleted, so its words never quote the person (完整刪除): fixed sentences only.
WHY_GATHER = "你的地圖寫了還缺的資料。要不要找來源補上？"
WHY_VERIFY = "你的地圖裡有要查的主張。要不要查是誰說的、別的地方怎麼報？"
WHY_TEACH = "這個案子第一次用這個拆法。要不要先上這個方法的課？不想上可以跳過。"

def analysed_methods(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> set[str]:
    """The tools already run in this case the older way (an analysis on the project page that finished)."""
    return docs.tools_run(tenant_id, owner)


def versions_of(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> list[dict[str, Any]]:
    """Every saved version of this case's map, oldest first."""
    return [version for doc in docs.current(tenant_id, owner, "map.map") for version in docs.versions(tenant_id, owner, "map.map", doc["doc_id"])]


def methods_used(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> set[str]:
    return analysed_methods(docs, tenant_id, owner) | {version["content"]["method_id"] for version in versions_of(docs, tenant_id, owner) if version["content"].get("method_id")}


def _map_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    history = docs.versions(tenant_id, owner, "map.map", doc["doc_id"])
    earlier = [version["content"] for version in history if version["version"] < doc["version"]]
    before = earlier[-1] if earlier else {}
    notices: list[dict[str, Any]] = []

    new_gaps = [gap for gap in content.get("gaps") or [] if gap not in (before.get("gaps") or [])]
    if new_gaps:
        notices += propose(docs, tenant_id, owner, "MAP", "GATHER", WHY_GATHER, source=doc["doc_id"])

    def checkable(source: dict[str, Any]) -> list[str]:
        return [claim["text"] for claim in source.get("claims") or [] if isinstance(claim, dict) and claim.get("kind") in CHECKABLE and claim.get("text")]
    new_claims = [text for text in checkable(content) if text not in checkable(before)]
    if new_claims:
        notices += propose(docs, tenant_id, owner, "MAP", "VERIFY", WHY_VERIFY, source=doc["doc_id"])

    method_id = content.get("method_id")
    if method_id and method_id not in analysed_methods(docs, tenant_id, owner) | {item.get("method_id") for item in earlier}:
        notices += propose(docs, tenant_id, owner, "MAP", "TEACH", WHY_TEACH, source=doc["doc_id"], topic=method_id)

    return notices


def _map_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    """``method_id`` names a MAP tool of the catalog or nothing: it becomes a proposal's topic, which is never deleted, so
    free text there would keep the person's words for good (block_hooks/__init__.py)."""
    from ai_lego.platform.ai_actions.map import map_tools

    method_id = content.get("method_id")
    if method_id not in (None, "") and method_id not in map_tools():
        raise InvariantViolation(f"MAP_METHOD_UNKNOWN: {str(method_id)[:40]!r} is not a MAP tool")
    # a fact's count of independent sources comes only from GATHER's cards: none linked = 0; linked = this case's cards,
    # never more than the system counts
    facts = (content.get("layers") or {}).get("facts") if isinstance(content.get("layers"), dict) else None
    for item in facts or []:
        if isinstance(item, dict) and not item.get("cards") and item.get("sources") not in (None, 0):
            raise InvariantViolation("MAP_FACT_SOURCES_WRONG: a fact's count of independent sources is the system's, not more")
    linked = [item for item in facts or [] if isinstance(item, dict) and item.get("cards")]
    if linked:
        found = evidence.origins(docs, tenant_id, owner, with_reviews=False)
        known = {card["card"] for origin in found for card in origin["cards"]}
        for item in linked:
            cards = item["cards"]
            if not isinstance(cards, list) or any(not isinstance(card, str) or card not in known for card in cards):
                raise InvariantViolation("MAP_FACT_CARD_UNKNOWN: a fact names a source card this case does not have")
            sources = item.get("sources")
            if not isinstance(sources, int) or isinstance(sources, bool) or sources > evidence.origins_behind(found, cards) or item.get("self_said") is True:
                raise InvariantViolation("MAP_FACT_SOURCES_WRONG: a fact's count of independent sources is the system's, not more")


BEFORE_SAVE = {"map.map": _map_checked}
AFTER_SAVE = {"map.map": _map_saved}
