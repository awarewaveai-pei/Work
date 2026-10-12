"""GOVERN's recognition of high risk while a block works (card 「系統做什麼」: 看得到你內容的積木在過程中認出來，叫 GOVERN
加護欄). One hook for every document of a block that sees the person's words, so no block has to remember it:

* in a case: the categories it touches get the case's guardrails (一個類別一組，不重複); the guardrail records only the
  category and the block that found it -- the words themselves go no further than this function;
* with no case (每天校準的卡…): nothing is added; the person is told to open a case (系統建議你開一個案子，護欄在案子裡加).

Only what the person wrote counts (author user or joint): the AI's own sentences and the system's records never start a guardrail.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.platform.block_hooks.assembler import add_guardrails, found_in

# The blocks whose documents carry the person's words (GOVERN 卡: SENSE、GATHER、MAP … 規範與脈絡、組裝器). GOVERN itself and 協作合約 do not.
WATCHED_BLOCKS = ("SENSE", "GATHER", "MAP", "THINK", "VERIFY", "COMPUTE", "DECIDE", "ACT", "LEARN", "TEACH", "EXPRESS", "FACILITATE", "COLLAB", "CONTEXT", "ASSEMBLER")


# Which fields are not the person's account (places, a contact, what the system listed) and which values are the system's
# own labels is said by each kind's fields (doc_kinds.Field ``scan`` / ``labels``), not listed here: the block that owns a
# kind owns that knowledge.
OPEN_A_CASE = "這張卡寫到比較高風險的事。要不要開一個案子，在案子裡處理？卡上的內容不會自動帶過去，要的話你自己貼進開案資料。"


def strings(value: Any, skip: tuple[str, ...] = (), keys: bool = False) -> list[str]:
    """Every text inside a document's content, however deep (a map's layers are nested); ``skip``: keys whose values are
    left out; ``keys``: the keys too (the crisis check reads every word the person typed, a json key included)."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [text for key, item in value.items() if key not in skip for text in ([key] if keys and isinstance(key, str) else []) + strings(item, skip, keys)]
    if isinstance(value, list):
        return [text for item in value for text in strings(item, skip, keys)]
    return []


def written_by_field(doc: dict[str, Any]) -> dict[str, list[str]]:
    """The person's own words in a document, field by field: its text, list and json fields that are read for risk -- not
    the choices the system offers, and not a value that is one of the field's labels."""
    fields = doc_kinds.require(doc["kind"]).fields
    return {name: [text for text in strings(doc["content"].get(name), spec.unread_keys) if text not in spec.labels]
            for name, spec in fields.items() if spec.type in ("text", "list", "json") and spec.scan}


def written(doc: dict[str, Any]) -> list[str]:
    """written_by_field's words, together."""
    return [text for texts in written_by_field(doc).values() for text in texts]


def _recognise(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    if doc["author"] not in ("user", "joint"):
        return []
    found = found_in(written_by_field(doc))
    categories = list(found)
    if not categories:
        return []
    if owner.kind == "case":
        return add_guardrails(docs, tenant_id, owner, found, doc["block"])
    if "急性心理危機" in categories:   # the save already brings crisis help; 「開一個案子」 beside it would be the wrong next step
        return []
    return [{"type": "suggest_case", "categories": categories, "notice": OPEN_A_CASE}]


_recognise.recognises_high_risk = True   # type: ignore[attr-defined]  # integrity.py looks for it

AFTER_SAVE = {
    name: _recognise for name, spec in doc_kinds.kinds().items()
    if spec.block in WATCHED_BLOCKS and spec.authors & {"user", "joint"} and any(field.type in ("text", "list", "json") for field in spec.fields.values())
}
