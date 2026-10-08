"""EXPRESS AI drafting: selected records only, with sentence-level traceability."""

from __future__ import annotations

import json
from contextvars import ContextVar
from typing import Any, Callable, Mapping

from ai_lego.core.domain import doc_kinds
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction
from ai_lego.platform.block_hooks.express import SELECTABLE_BLOCKS
from ai_lego.platform.rulesets.express import FORMAT_NAMES


Read = Callable[..., list[dict[str, Any]]]
HAND_BACK = "這裡有還沒查證的句子，要先處理還是照樣寫進去？"
_TURN: ContextVar[dict[str, Any] | None] = ContextVar("express_turn", default=None)


def _read_kinds() -> tuple[str, ...]:
    return tuple(sorted(kind for kind, spec in doc_kinds.kinds().items() if spec.owner == "case" and spec.block in SELECTABLE_BLOCKS))


SELECTABLE_KINDS = _read_kinds()
DRAFT_READS = ("express.selection", *SELECTABLE_KINDS)
ADJUST_READS = ("express.selection", "express.draft", *SELECTABLE_KINDS)


def _selection(context: Mapping[str, Any], read: Read) -> dict[str, Any]:
    selections = read("express.selection")
    wanted = context.get("selection")
    if wanted is not None and not isinstance(wanted, str):
        raise InvariantViolation("EXPRESS_SELECTION_REQUIRED: selection id must name a saved selection")
    found = next((doc for doc in selections if doc["doc_id"] == wanted), None) if wanted is not None else (selections[-1] if selections else None)
    if found is None:
        raise InvariantViolation("EXPRESS_SELECTION_REQUIRED: choose records before drafting")
    content = found["content"]
    if not isinstance(content.get("format"), str) or content["format"] not in FORMAT_NAMES:
        raise InvariantViolation("EXPRESS_FORMAT_REQUIRED: choose an output format first")
    reader = content.get("reader")
    if not isinstance(reader, str) or not reader.strip():
        raise InvariantViolation("EXPRESS_READER_REQUIRED: choose who will read this")
    if context.get("format") is not None and context["format"] != content["format"]:
        raise InvariantViolation("EXPRESS_FORMAT_MISMATCH: the action must use the selected format")
    if context.get("reader") is not None and context["reader"] != reader:
        raise InvariantViolation("EXPRESS_READER_MISMATCH: the action must use the selected reader")
    return {"doc": found, "content": content, "items": content["items"]}


def _selected_records(selection: dict[str, Any], read: Read) -> tuple[list[dict[str, Any]], set[tuple[str, str]], list[str]]:
    records: list[dict[str, Any]] = []
    refs: set[tuple[str, str]] = set()
    quoted: list[str] = []
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for item in selection["items"]:
        kind, doc_id = item["kind"], item["doc_id"]
        refs.add((kind, doc_id))
        by_kind.setdefault(kind, []).append(item)
    for kind, items in by_kind.items():
        current = {doc["doc_id"]: doc for doc in read(kind)}
        for item in items:
            doc = current.get(item["doc_id"])
            if doc is None:
                raise InvariantViolation(f"EXPRESS_SELECTION_RECORD_NOT_FOUND: {kind} {item['doc_id']}")
            body = {**doc, "content": dict(doc["content"])}
            spec = doc_kinds.require(kind)
            if spec.others_words:
                body["content"].pop(spec.others_words, None)
                quoted.append(doc["doc_id"])
            records.append(body)
    return records, refs, quoted


def _person_lines(selection: dict[str, Any], records: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for source in [selection["content"], *(record["content"] for record in records)]:
        for key in ("confidence_text", "uncertainty_text", "confidence", "uncertainty"):
            value = source.get(key)
            if isinstance(value, str) and value.strip() and value not in lines:
                lines.append(value)
            elif key == "confidence" and isinstance(value, (int, float)) and not isinstance(value, bool):
                text = f"信心：{value}"
                if text not in lines:
                    lines.append(text)
    return lines


def _claim_status(selection: dict[str, Any], read: Read) -> dict[str, dict[str, Any]]:
    wanted = {item["doc_id"] for item in selection["items"] if item["kind"] == "verify.claim"}
    if not wanted:
        return {}
    found = {line["claim_id"]: line for line in read.evidence.claims() if line["claim_id"] in wanted}  # type: ignore[attr-defined]
    return {claim_id: found.get(claim_id, {"claim_id": claim_id, "usable": False, "few": True, "state": "還沒查"}) for claim_id in wanted}


def _turn(selection: dict[str, Any], refs: set[tuple[str, str]], claims: dict[str, dict[str, Any]], lines: list[str], quoted: list[str]) -> None:
    _TURN.set({"selection": selection, "refs": refs, "claims": claims, "person_lines": lines, "quoted": quoted})


def _outline_input(context: Mapping[str, Any], read: Read, *, existing: bool) -> str:
    selected = _selection(context, read)
    records, refs, quoted = _selected_records(selected, read)
    claims = _claim_status(selected, read)
    lines = _person_lines(selected, records)
    _turn(selected, refs, claims, lines, quoted)
    if isinstance(context, dict):
        context["cards"] = [item["doc_id"] for item in selected["items"] if item["kind"] == "gather.source"]
    outline = [{"refs": [{"kind": record["kind"], "doc_id": record["doc_id"]}], "record": record} for record in records]
    payload: dict[str, Any] = {
        "format": selected["content"]["format"],
        "reader": selected["content"]["reader"],
        "key_points": selected["content"].get("key_points", ""),
        "outline": outline,
        "claim_status": list(claims.values()),
        "person_lines_to_keep_exactly": lines,
    }
    if existing:
        drafts = read("express.draft")
        wanted = context.get("draft") or context.get("draft_id")
        if wanted is not None and not isinstance(wanted, str):
            raise InvariantViolation("EXPRESS_DRAFT_REQUIRED: draft id must name a saved draft")
        draft = next((doc for doc in drafts if doc["doc_id"] == wanted), None) if wanted is not None else (drafts[-1] if drafts else None)
        if draft is None:
            raise InvariantViolation("EXPRESS_DRAFT_REQUIRED: save a draft before adjusting it")
        payload["draft_to_adjust"] = draft["content"]
    return "The selected records and their current claim status:\n" + json.dumps(payload, ensure_ascii=False)


def _draft_input(context: Mapping[str, Any], read: Read) -> str:
    return _outline_input(context, read, existing=False)


def _adjust_input(context: Mapping[str, Any], read: Read) -> str:
    return _outline_input(context, read, existing=True)


def _handback(_context: Mapping[str, Any], read: Read) -> str | None:
    selected = _selection(_context, read)
    if selected["content"].get("unchecked_ok") is True:
        return None
    claims = _claim_status(selected, read)
    if any(not line.get("usable") or line.get("few") for line in claims.values()):
        return HAND_BACK
    return None


SENTENCE_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "refs": {"type": "array", "items": {"type": "object", "properties": {"kind": {"type": "string"}, "doc_id": {"type": "string"}}, "required": ["kind", "doc_id"]}},
        "unchecked": {"type": "boolean"},
        "author": {"type": "string", "enum": ["ai"]},
    },
    "required": ["text", "refs", "unchecked", "author"],
}
DRAFT_SCHEMA = {"type": "object", "properties": {"format": {"type": "string"}, "reader": {"type": "string"}, "sentences": {"type": "array", "items": SENTENCE_SCHEMA}}, "required": ["format", "reader", "sentences"]}


def _shape(answer: dict[str, Any]) -> dict[str, Any]:
    turn = _TURN.get()
    if turn is None:
        raise InvariantViolation("AI_ANSWER_INVALID: the draft has no selected records")
    sentences = answer.get("sentences")
    if not isinstance(sentences, list) or not sentences:
        raise InvariantViolation("AI_ANSWER_INVALID: a draft needs sentences")
    shaped = []
    for index, item in enumerate(sentences):
        if not isinstance(item, Mapping) or not isinstance(item.get("text"), str) or not item["text"].strip():
            raise InvariantViolation(f"AI_ANSWER_INVALID: sentence {index} has no text")
        refs = item.get("refs")
        if not isinstance(refs, list) or not refs:
            raise InvariantViolation(f"AI_ANSWER_INVALID: sentence {index} needs at least one selected record ref")
        clean_refs = []
        seen = set()
        for ref in refs:
            if not isinstance(ref, Mapping) or set(ref) != {"kind", "doc_id"}:
                raise InvariantViolation(f"AI_ANSWER_INVALID: sentence {index} has an invalid ref")
            pair = (ref["kind"], ref["doc_id"])
            if pair not in turn["refs"]:
                raise InvariantViolation(f"AI_ANSWER_INVALID: sentence {index} refers outside the selection")
            if pair not in seen:
                seen.add(pair)
                clean_refs.append({"kind": pair[0], "doc_id": pair[1]})
        if item.get("author") == "user":
            raise InvariantViolation("AI_ANSWER_INVALID: an AI action cannot label its sentence as the person's words")
        if item.get("author") not in (None, "ai"):
            raise InvariantViolation(f"AI_ANSWER_INVALID: sentence {index} has an invalid author")
        unchecked = bool(item.get("unchecked"))
        for ref in clean_refs:
            kind, doc_id = ref["kind"], ref["doc_id"]
            line = turn["claims"].get(doc_id)
            if kind == "verify.claim" and (line is None or not line.get("usable") or line.get("few")):
                unchecked = True
        shaped.append({"text": item["text"].strip(), "refs": clean_refs, "unchecked": unchecked, "author": "ai"})
    for line in turn["person_lines"]:
        if not any(line in sentence["text"] for sentence in shaped):
            raise InvariantViolation("AI_ANSWER_INVALID: the person's confidence or uncertainty text was changed or omitted")
    return {"format": turn["selection"]["content"]["format"], "reader": turn["selection"]["content"]["reader"], "sentences": shaped}


def _quoted(context: Mapping[str, Any], _read: Read) -> list[str]:
    turn = _TURN.get()
    return list(turn["quoted"]) if turn else []


INSTRUCTIONS = (
    "Write a draft for the selected reader from the outline only. Every sentence must have one or more refs from the selected records. "
    "Do not add a claim, source, number or conclusion that is not in a selected record. Keep the person's confidence and uncertainty lines exactly. "
    "Set unchecked true when a sentence relies on an unchecked claim or fewer than two independent origins. "
    "Every sentence written by this action has author ai."
)

ACTIONS = [
    AiAction(block="EXPRESS", name="draft_from_outline", needs="organize", instructions=INSTRUCTIONS, output_kind="express.draft", output_schema=DRAFT_SCHEMA,
             reads=DRAFT_READS, build_input=_draft_input, shape=_shape, max_tokens=3000, cites=True, handback=_handback, quoted=_quoted),
    AiAction(block="EXPRESS", name="adjust_for_reader", needs="organize", instructions=INSTRUCTIONS + " Rewrite wording for the reader without adding a new claim or changing refs.",
             output_kind="express.draft", output_schema=DRAFT_SCHEMA, reads=ADJUST_READS, build_input=_adjust_input, shape=_shape, max_tokens=3000, cites=True, handback=_handback, quoted=_quoted),
]
