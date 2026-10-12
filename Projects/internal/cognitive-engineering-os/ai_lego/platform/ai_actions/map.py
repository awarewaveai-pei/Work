"""MAP's AI turns (contract card 「AI 能做什麼」): other readings of the same facts and which lines are claims and of what
kind. Each answer is a kind of its own; the person confirms, changes or drops it, so nothing the AI says lands in the
person's map by itself. Where a card may sit (kinds/map.py CATEGORY_LAYER) and which method may fit (the page's free
matching, mapMethods.ts suggestTools over ``map_tools``) are plain code, not AI turns (docs/platform/AI_TO_CODE_AUDIT.md §1).

Reads (讀什麼): the cards, the intake's purpose / question / who is affected, the map, and the context facets the
person ticked -- never the person's stance (絕不讀：你的立場) and never the places (the gate adds those unless the
contract withholds them). A fact from outside with fewer than two independent sources is held back from the AI unless
the person says so (交還控制)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Mapping

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.domain.blocks import FAMILY_BLOCK
from ai_lego.core.domain.kinds.map import CLAIM_KINDS, LAYER_KEYS, LAYERS, thin_facts
from ai_lego.platform.evidence import origins_behind
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.contract_catalog import is_active
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.ai_gate import AiAction

Read = Callable[[str], list[dict[str, Any]]]
LAYER_NAME = {key: name for key, name, *_ in LAYERS}


@lru_cache(maxsize=4)
def _tools(spec_root: str) -> dict[str, dict[str, str]]:
    root = Path(spec_root)
    names = yaml.safe_load((root / "methods" / "registry" / "method-display-metadata.yaml").read_text(encoding="utf-8")).get("entries") or {}
    families = yaml.safe_load((root / "methods" / "registry" / "method-family-display.yaml").read_text(encoding="utf-8")).get("families") or {}
    found = {}
    for method_id, entry in sorted(MethodCatalog.from_spec_root(root).contracts.items()):
        family = entry.get("family")
        if is_active(entry) and FAMILY_BLOCK.get(family) == "MAP":
            shown = names.get(method_id) or {}   # name_en and blurb_zh: the words the page's free matching (mapMethods.ts suggestTools) compares a person's sentence with
            found[method_id] = {"name": shown.get("name_zh") or method_id, "name_en": shown.get("name_en") or "", "blurb_zh": shown.get("blurb_zh") or "", "family": family,
                                "family_zh": (families.get(family) or {}).get("name_zh") or family, "version": str(entry.get("version") or "")}
    return found


def map_tools() -> dict[str, dict[str, str]]:
    """The tools a person can pick as a 拆法: every ACTIVE tool whose family belongs to MAP (core/domain/blocks.FAMILY_BLOCK)."""
    return _tools(str(resolve_spec_root()))


def _map(read: Read) -> dict[str, Any]:
    current = read("map.map")
    return current[-1]["content"] if current else {}


def _items(content: Mapping[str, Any], held_back: set[str]) -> list[dict[str, Any]]:
    """Every item of the map as {id, layer, text}; the facts the AI must stop on are left out."""
    layers = content.get("layers") if isinstance(content.get("layers"), dict) else {}
    return [{"id": item["id"], "layer": LAYER_NAME[key], "text": item["text"], "by": item.get("by", "user")}
            for key in LAYER_KEYS for item in layers.get(key) or []
            if isinstance(item, dict) and item.get("id") and isinstance(item.get("text"), str) and item["id"] not in held_back]


def _held_back(content: Mapping[str, Any], context: Mapping[str, Any], read: Read) -> set[str]:
    """Thin facts the person has not let the AI use; a fact linked to source cards is counted live (evidence)."""
    allowed = set(context.get("use_thin") or []) if isinstance(context.get("use_thin"), list) else set()
    found = read.evidence.origins()
    return set(thin_facts(content.get("layers"), lambda cards: origins_behind(found, cards))) - allowed


def _lens(read: Read) -> dict[str, Any]:
    """The context lens as MAP reads it: the facets the person ticked with their two answers, and the places whose law
    applies. Never the stance, the four checks or the public-issue answers (絕不讀：你的立場)."""
    current = read("context.notes")
    notes = current[-1]["content"] if current else {}
    facets = [{key: facet[key] for key in ("facet", "defines_normal", "is_cause") if facet.get(key)} for facet in notes.get("facets") or [] if isinstance(facet, dict) and facet.get("relevant") is True]
    return {key: value for key, value in (("relevant_facets", facets), ("law_applies_in", notes.get("jurisdictions"))) if value}


def _lens_text(read: Read) -> str:
    lens = _lens(read)
    return "\n\nThe world this matter sits in, as the person wrote it:\n" + json.dumps(lens, ensure_ascii=False) if lens else ""


# ---- alternatives: other readings of the same facts ----

ALTERNATIVES = (
    "Give other ways to read the same facts the person wrote. For each: about = the id of the fact or reading it is about; "
    "view = one other reading in one or two sentences, marked as a possibility and never as what really happened; check = "
    "what would show which reading is right. Do not add facts, do not say what anyone intended as if known, never say what "
    "a law provides or what a culture or a religion means or requires, and give at least one reading that differs from the "
    "person's own. At most 6."
)
ALTERNATIVES_SCHEMA = {
    "type": "object",
    "properties": {"items": {"type": "array", "maxItems": 6, "items": {"type": "object", "properties": {"about": {"type": "string"}, "view": {"type": "string"}, "check": {"type": "string"}}, "required": ["about", "view"]}}},
    "required": ["items"],
}


def _facts_and_readings(context: Mapping[str, Any], read: Read) -> str:
    content = _map(read)
    held = _held_back(content, context, read)
    items = [item for item in _items(content, held) if item["layer"] in (LAYER_NAME["facts"], LAYER_NAME["interpretations"])]
    if not items:
        raise InvariantViolation("AI_NOTHING_TO_READ: write at least one fact or reading first")
    return "The person's facts and readings:\n" + json.dumps(items, ensure_ascii=False) + _lens_text(read)


def _alternatives_shape(answer: dict[str, Any]) -> dict[str, Any]:
    kept = []
    for item in answer.get("items") if isinstance(answer.get("items"), list) else []:
        if isinstance(item, dict) and isinstance(item.get("about"), str) and isinstance(item.get("view"), str) and item["view"].strip():
            kept.append({"about": item["about"], "view": item["view"].strip()[:600], **({"check": item["check"].strip()[:400]} if isinstance(item.get("check"), str) and item["check"].strip() else {})})
    return {"items": kept[:6]}


# ---- claims: which lines are claims, and of what kind ----

CLAIMS = (
    "From the lines of the person's map, mark which are claims someone could argue about, and which kind each is:\n"
    + "\n".join(f"{kind}: {needs}" for kind, (needs, _) in CLAIM_KINDS.items()) + "\n"
    "Example: 「同業都這樣改」 is a fact claim; 「他能不能自己改合約」 is a legal question; 「我該不該忍」 is a value claim. "
    "Mark only. Never say what a law provides, never say what a culture or a religion means or requires, never decide who is "
    "right. Use ids from the list; at most one entry per id."
)
CLAIMS_SCHEMA = {
    "type": "object",
    "properties": {"proposals": {"type": "array", "items": {"type": "object", "properties": {"item": {"type": "string"}, "kind": {"type": "string", "enum": list(CLAIM_KINDS)}}, "required": ["item", "kind"]}}},
    "required": ["proposals"],
}


def _claims_input(context: Mapping[str, Any], read: Read) -> str:
    items = _items(_map(read), _held_back(_map(read), context, read))
    if not items:
        raise InvariantViolation("AI_NOTHING_TO_READ: write at least one line in the map first")
    return "The lines of the person's map:\n" + json.dumps(items, ensure_ascii=False) + _lens_text(read)


def _claims_shape(answer: dict[str, Any]) -> dict[str, Any]:
    seen, kept = set(), []
    for item in answer.get("proposals") if isinstance(answer.get("proposals"), list) else []:
        if isinstance(item, dict) and isinstance(item.get("item"), str) and item.get("kind") in CLAIM_KINDS and item["item"] not in seen:
            seen.add(item["item"])
            kept.append({"item": item["item"], "kind": item["kind"]})
    return {"proposals": kept}


ACTIONS = [
    AiAction(block="MAP", name="alternatives", needs="propose_options", instructions=ALTERNATIVES, output_kind="map.alternatives", output_schema=ALTERNATIVES_SCHEMA,
             reads=("map.map", "context.notes", "gather.source"), build_input=_facts_and_readings, shape=_alternatives_shape),
    AiAction(block="MAP", name="claims", needs="organize", instructions=CLAIMS, output_kind="map.claim_proposal", output_schema=CLAIMS_SCHEMA,
             reads=("map.map", "context.notes", "gather.source"), build_input=_claims_input, shape=_claims_shape),
]
