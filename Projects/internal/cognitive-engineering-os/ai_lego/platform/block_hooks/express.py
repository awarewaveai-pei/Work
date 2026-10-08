"""EXPRESS save guards and the selected-record outline."""

from __future__ import annotations

from typing import Any, Iterable, Mapping

from ai_lego.core.domain import doc_kinds
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform.evidence import checked_claims


SELECTABLE_BLOCKS = frozenset({"SENSE", "GATHER", "MAP", "THINK", "VERIFY", "COMPUTE", "DECIDE", "ACT", "LEARN"})
REF_KEYS = frozenset({"project_id", "kind", "doc_id"})


def require_current_draft_version(current_version: int, requested_version: int) -> None:
    if current_version != requested_version:
        raise InvariantViolation(f"EXPRESS_SENT_VERSION_NOT_CURRENT: draft is now version {current_version}; read it again before sending")


def _items(content: Mapping[str, Any]) -> list[dict[str, str]]:
    items = content.get("items")
    if not isinstance(items, list) or not items:
        raise InvariantViolation("EXPRESS_SELECTION_ITEMS_REQUIRED: choose at least one record")
    found: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for index, item in enumerate(items):
        if not isinstance(item, Mapping) or set(item) != REF_KEYS:
            raise InvariantViolation(f"EXPRESS_SELECTION_REF_INVALID: item {index} must have project_id, kind and doc_id")
        if any(not isinstance(item.get(key), str) or not item[key] for key in REF_KEYS):
            raise InvariantViolation(f"EXPRESS_SELECTION_REF_INVALID: item {index} has an empty reference")
        ref = {key: item[key] for key in REF_KEYS}
        key = (ref["kind"], ref["doc_id"])
        if key in seen:
            raise InvariantViolation(f"EXPRESS_SELECTION_DUPLICATE: {key[0]} {key[1]}")
        seen.add(key)
        found.append(ref)
    return found


def _selected_refs(content: Mapping[str, Any], owner: record_log.Owner) -> set[tuple[str, str]]:
    if owner.kind != "case":
        raise InvariantViolation("EXPRESS_SELECTION_OWNER_INVALID: selection belongs to a case")
    refs = _items(content)
    allowed: set[tuple[str, str]] = set()
    for ref in refs:
        if ref["project_id"] != owner.id:
            raise InvariantViolation("EXPRESS_SELECTION_PROJECT_MISMATCH: selected record names another case")
        try:
            spec = doc_kinds.require(ref["kind"])
        except InvariantViolation as error:
            raise InvariantViolation(f"EXPRESS_SELECTION_KIND_INVALID: {ref['kind']!r}") from error
        if spec.owner != "case" or spec.block not in SELECTABLE_BLOCKS:
            raise InvariantViolation(f"EXPRESS_SELECTION_KIND_INVALID: {ref['kind']!r} is not a selectable case record")
        allowed.add((ref["kind"], ref["doc_id"]))
    return allowed


def selection_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], _doc_id: str | None) -> None:
    refs = _items(content)
    allowed = _selected_refs(content, owner)
    for ref in refs:
        current = docs.current(tenant_id, owner, ref["kind"])
        if not any(doc["doc_id"] == ref["doc_id"] for doc in current):
            raise InvariantViolation(f"EXPRESS_SELECTION_RECORD_NOT_FOUND: {ref['kind']} {ref['doc_id']} is not in this case")
    if len(allowed) != len(refs):  # defensive: _items already catches it, but keeps the invariant explicit at the boundary
        raise InvariantViolation("EXPRESS_SELECTION_DUPLICATE: selected records must be distinct")


def _draft_refs(content: Mapping[str, Any]) -> Iterable[Mapping[str, Any]]:
    sentences = content.get("sentences")
    if not isinstance(sentences, list) or not sentences:
        raise InvariantViolation("EXPRESS_DRAFT_SENTENCES_REQUIRED: a draft needs sentences")
    for index, sentence in enumerate(sentences):
        if not isinstance(sentence, Mapping):
            raise InvariantViolation(f"EXPRESS_DRAFT_SENTENCE_INVALID: sentence {index} is not an object")
        text = sentence.get("text")
        refs = sentence.get("refs")
        if not isinstance(text, str) or not text.strip() or not isinstance(refs, list) or not refs:
            raise InvariantViolation(f"EXPRESS_DRAFT_SENTENCE_INVALID: sentence {index} needs text and refs")
        if sentence.get("author") not in ("ai", "user") or not isinstance(sentence.get("unchecked"), bool):
            raise InvariantViolation(f"EXPRESS_DRAFT_SENTENCE_INVALID: sentence {index} has an invalid author or unchecked flag")
        for ref in refs:
            if not isinstance(ref, Mapping) or set(ref) != {"kind", "doc_id"} or any(not isinstance(ref.get(key), str) or not ref[key] for key in ("kind", "doc_id")):
                raise InvariantViolation(f"EXPRESS_DRAFT_REF_INVALID: sentence {index} has an invalid record reference")
            yield ref


def draft_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], _doc_id: str | None) -> None:
    selections = docs.current(tenant_id, owner, "express.selection")
    if not selections:
        raise InvariantViolation("EXPRESS_SELECTION_REQUIRED: choose records before saving a draft")
    if _doc_id is not None:
        try:
            earlier = docs.versions(tenant_id, owner, "express.draft", _doc_id)
        except InvariantViolation as error:
            raise InvariantViolation("EXPRESS_DRAFT_NOT_FOUND: choose a saved draft") from error
        ai_texts = {
            sentence.get("text")
            for version in earlier
            for sentence in version["content"].get("sentences", [])
            if isinstance(sentence, Mapping) and sentence.get("author") == "ai"
        }
        for sentence in content.get("sentences", []):
            if isinstance(sentence, dict) and sentence.get("text") in ai_texts:
                sentence["author"] = "ai"
    selected = _selected_refs(selections[-1]["content"], owner)
    for ref in _draft_refs(content):
        if (ref["kind"], ref["doc_id"]) not in selected:
            raise InvariantViolation(f"EXPRESS_DRAFT_REF_OUTSIDE_SELECTION: {ref['kind']} {ref['doc_id']}")
    claim_status = {line["claim_id"]: line for line in checked_claims(docs, tenant_id, owner)}
    for index, sentence in enumerate(content["sentences"]):
        if any(ref["kind"] == "verify.claim" and
               (ref["doc_id"] not in claim_status or not claim_status[ref["doc_id"]]["usable"] or claim_status[ref["doc_id"]]["few"])
               for ref in sentence["refs"]) and sentence["unchecked"] is not True:
            raise InvariantViolation(f"EXPRESS_DRAFT_UNCHECKED_REQUIRED: sentence {index} cites a claim not ready as fact")


def sent_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], _doc_id: str | None) -> None:
    draft_id, version = content.get("draft"), content.get("version")
    if not isinstance(draft_id, str) or not draft_id or not isinstance(version, int) or isinstance(version, bool):
        raise InvariantViolation("EXPRESS_SENT_DRAFT_INVALID: choose a saved draft and version")
    try:
        versions = docs.versions(tenant_id, owner, "express.draft", draft_id)
    except InvariantViolation as error:
        raise InvariantViolation("EXPRESS_SENT_DRAFT_NOT_FOUND: choose a draft in this case") from error
    require_current_draft_version(versions[-1]["version"], version)


def _record_view(doc: Mapping[str, Any]) -> dict[str, Any]:
    spec = doc_kinds.require(doc["kind"])
    content = dict(doc["content"])
    if spec.others_words:
        content.pop(spec.others_words, None)
    return {"kind": doc["kind"], "title": spec.title, "version": doc["version"], "content": content}


def outline_for_selection(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, selection: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Build an outline from exactly the selected current documents."""
    selections = docs.current(tenant_id, owner, "express.selection")
    selected = selection or (selections[-1]["content"] if selections else None)
    if selected is None:
        raise InvariantViolation("EXPRESS_SELECTION_REQUIRED: choose records before building an outline")
    refs = _items(selected)
    nodes = []
    for ref in refs:
        current = next((doc for doc in docs.current(tenant_id, owner, ref["kind"]) if doc["doc_id"] == ref["doc_id"]), None)
        if current is None:
            raise InvariantViolation(f"EXPRESS_SELECTION_RECORD_NOT_FOUND: {ref['kind']} {ref['doc_id']} is not in this case")
        nodes.append({"refs": [{"kind": ref["kind"], "doc_id": ref["doc_id"]}], "record": _record_view(current)})
    return {"format": selected.get("format"), "reader": selected.get("reader"), "nodes": nodes}


BEFORE_SAVE = {"express.selection": selection_checked, "express.draft": draft_checked, "express.sent": sent_checked}
AFTER_SAVE: dict[str, Any] = {}
