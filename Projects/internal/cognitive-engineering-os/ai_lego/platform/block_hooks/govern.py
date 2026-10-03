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
from ai_lego.platform.block_hooks.assembler import add_guardrails
from ai_lego.platform.safety.risk import high_risk_categories

# The blocks whose documents carry the person's words (GOVERN 卡: SENSE、GATHER、MAP … 規範與脈絡、組裝器). GOVERN itself and 協作合約 do not.
WATCHED_BLOCKS = ("SENSE", "GATHER", "MAP", "THINK", "VERIFY", "COMPUTE", "DECIDE", "ACT", "LEARN", "TEACH", "EXPRESS", "FACILITATE", "COLLAB", "CONTEXT", "ASSEMBLER")


# Fields that hold words but not the person's account of what happened: places and a contact (GOVERN reads 你在哪裡 only to
# give help, never to judge risk) and what the system listed as influences (saved by the person, written by the system).
NOT_SCANNED = {
    "assembler.intake": frozenset({"happened_in", "you_are_in", "others_in", "field_contact"}),
    "decide.judgment": frozenset({"influences_listed"}),
}


def strings(value: Any) -> list[str]:
    """Every text inside a document's content, however deep (a map's layers are nested)."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [text for item in value.values() for text in strings(item)]
    if isinstance(value, list):
        return [text for item in value for text in strings(item)]
    return []


def written(doc: dict[str, Any]) -> list[str]:
    """The person's own words in a document: its text, list and json fields -- not the choices the system offers."""
    fields = doc_kinds.require(doc["kind"]).fields
    skipped = NOT_SCANNED.get(doc["kind"], frozenset())
    return [text for name, spec in fields.items() if spec.type in ("text", "list", "json") and name not in skipped for text in strings(doc["content"].get(name))]


def _recognise(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    if doc["author"] not in ("user", "joint"):
        return []
    categories = high_risk_categories(*written(doc))
    if not categories:
        return []
    if owner.kind == "case":
        return add_guardrails(docs, tenant_id, owner, categories, doc["block"])
    return [{"type": "suggest_case", "categories": categories}]


_recognise.recognises_high_risk = True   # type: ignore[attr-defined]  # integrity.py looks for it

AFTER_SAVE = {
    name: _recognise for name, spec in doc_kinds.kinds().items()
    if spec.block in WATCHED_BLOCKS and spec.authors & {"user", "joint"} and any(field.type in ("text", "list", "json") for field in spec.fields.values())
}
