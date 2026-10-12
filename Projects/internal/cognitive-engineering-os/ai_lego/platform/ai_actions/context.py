"""規範與脈絡's AI turn (contract card 「AI 能做什麼」): point out the facets that may matter and are not looked at yet.
It points; the person ticks or marks 無關. It reads the intake's purpose and question, the map (a fact from outside with
fewer than two independent sources is left out, as in MAP), and which facets the person already decided (names only -- never
their notes or stance). The places go to the model only through the gate (given unless the contract withholds them), so no country is assumed."""

from __future__ import annotations

import json
from typing import Any, Callable, Mapping

from ai_lego.core.domain.kinds.context import FACETS, FACET_NAMES
from ai_lego.core.domain.kinds.map import LAYERS, is_thin
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction

Read = Callable[[str], list[dict[str, Any]]]
LAYER_NAME = {key: name for key, name, *_ in LAYERS}

POINT = (
    "A person is looking at one matter. From the facets listed (each with its one-line meaning), point out up to 5 that may "
    "matter for THIS matter and that the person has not looked at yet. For each give facet = the name exactly as listed, and "
    "why = one sentence that quotes the person's own words from their question or their map. Only point; do not say what is "
    "normal, allowed or true in any place, do not say what a law provides, do not say what a culture or a religion means, do "
    "not speak for any party, government or side of a conflict and do not treat a dispute as settled or as absent, and do "
    "not assume any country. If none may matter, answer with an empty list."
)
POINT_SCHEMA = {
    "type": "object",
    "properties": {"facets": {"type": "array", "maxItems": 5, "items": {"type": "object", "properties": {"facet": {"type": "string", "enum": list(FACET_NAMES)}, "why": {"type": "string"}}, "required": ["facet", "why"]}}},
    "required": ["facets"],
}


def _point_input(context: Mapping[str, Any], read: Read) -> str:
    intake = read("assembler.intake")   # card 讀什麼: 開案時寫的發生地、你在哪裡、當事人各在哪裡（the gate adds them）、目的
    asked = {key: intake[-1]["content"].get(key) for key in ("purpose",) if intake and intake[-1]["content"].get(key)}
    current = read("map.map")
    content = current[-1]["content"] if current else {}
    layers = content.get("layers") if isinstance(content.get("layers"), dict) else {}
    lines = [{"layer": LAYER_NAME[key], "text": item["text"]} for key in LAYER_NAME for item in layers.get(key) or []
             if isinstance(item, dict) and isinstance(item.get("text"), str) and not (key == "facts" and is_thin(item))]
    notes = read("context.notes")
    decided = {facet.get("facet") for facet in (notes[-1]["content"].get("facets") or []) if isinstance(facet, dict)} if notes else set()
    undecided = [{"facet": name, "meaning": meaning} for name, meaning in FACETS if name not in decided]
    if not undecided:
        raise InvariantViolation("AI_NOTHING_TO_POINT: every facet has been looked at")
    if not asked and not lines:
        raise InvariantViolation("AI_NOTHING_TO_READ: pick the purpose at 開案, or write a line in the map, first")
    return ("The matter:\n" + json.dumps({**asked, "map": lines, **({"core_conflict": content["core_conflict"]} if content.get("core_conflict") else {})}, ensure_ascii=False)
            + "\n\nFacets not looked at yet:\n" + json.dumps(undecided, ensure_ascii=False))


def _point_shape(answer: dict[str, Any]) -> dict[str, Any]:
    seen, kept = set(), []
    for item in answer.get("facets") if isinstance(answer.get("facets"), list) else []:
        if isinstance(item, dict) and item.get("facet") in FACET_NAMES and item["facet"] not in seen and isinstance(item.get("why"), str) and item["why"].strip():
            seen.add(item["facet"])
            kept.append({"facet": item["facet"], "why": item["why"].strip()[:300]})
    return {"facets": kept[:5]}


ACTIONS = [
    AiAction(block="CONTEXT", name="point_facets", needs="point_gaps", instructions=POINT, output_kind="context.pointers", output_schema=POINT_SCHEMA,
             reads=("assembler.intake", "map.map", "context.notes"), build_input=_point_input, shape=_point_shape,
             places=("happened_in", "you_are_in", "others_in")),
]
