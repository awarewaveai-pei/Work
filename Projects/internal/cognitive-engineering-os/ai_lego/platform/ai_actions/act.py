"""ACT's AI turn (contract card 「AI 能做什麼」): split the judgment's one sentence into smaller steps the person can
undo (they pick; needs the contract's 「提出選項」). It never promises for the person, never sets a target number, never
does the step. Pointing at what cannot be undone and the trend of the recorded numbers are plain code, not AI
(apps/cognitive-web/lib/act.ts flagLines, trendLines; docs/platform/AI_TO_CODE_AUDIT.md §1)."""

from __future__ import annotations

import json
from typing import Any, Callable, Mapping

from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction

SPLIT = (
    "The person wrote one sentence as their next step. Offer 2 to 4 smaller steps they could take instead of that one "
    "big step. Each small step must be something the person does themselves, and each should be undoable; if a step "
    "cannot be undone, say so and set reversible to false. The person picks; do not recommend one. Do not set a "
    "deadline, a target number or a promise for them.\n"
    "- step: one short sentence.\n- why_small: why this is smaller or safer than the whole step.\n"
    "- reversible: true or false.\n- undo: how it would be undone; leave empty when it cannot be."
)
SPLIT_SCHEMA = {"type": "object", "properties": {"options": {"type": "array", "maxItems": 4, "items": {"type": "object", "properties": {
    "step": {"type": "string"}, "why_small": {"type": "string"}, "reversible": {"type": "boolean"}, "undo": {"type": "string"}}, "required": ["step", "reversible"]}}}, "required": ["options"]}

Read = Callable[[str], list[dict[str, Any]]]


def _split_input(context: Mapping[str, Any], read: Read) -> str:
    saved = read("decide.judgment")
    step = (saved[-1]["content"].get("next_step") if saved else "") or ""
    if not step.strip():
        raise InvariantViolation("ACT_NO_NEXT_STEP: the judgment card has no next step to split")
    return "The person's next step:\n" + json.dumps({"next_step": step, "already_written_tasks": [task["content"]["title"] for task in read("act.task")]}, ensure_ascii=False)


def _split_shape(answer: dict[str, Any]) -> dict[str, Any]:
    options = []
    for item in answer.get("options") if isinstance(answer.get("options"), list) else []:
        if isinstance(item, dict) and isinstance(item.get("step"), str) and item["step"].strip() and isinstance(item.get("reversible"), bool):
            options.append({"step": item["step"][:300], "why_small": str(item.get("why_small") or "")[:300], "reversible": item["reversible"],
                            "undo": str(item.get("undo") or "")[:300] if item["reversible"] else ""})
    return {"options": options[:4]} if options else {}


ACTIONS = [
    AiAction(block="ACT", name="split", needs="propose_options", instructions=SPLIT, output_kind="act.split", output_schema=SPLIT_SCHEMA,
             reads=("decide.judgment", "act.task"), build_input=_split_input, shape=_split_shape),
]
