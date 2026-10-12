"""ACT's AI turns (contract card 「AI 能做什麼」): split the judgment's one sentence into smaller steps the person can
undo (they pick; needs the contract's 「提出選項」), point at steps that cannot be undone, and give the trend of the
numbers the person recorded. It never promises for the person, never sets a target number, never does the step."""

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

FLAG = (
    "Look at the tasks the person wrote and point at what cannot be undone once done, or touches other people. You do "
    "not decide whether to do it and you do not advise against it.\n"
    "- irreversible: up to 6 lines, each 「task title：why it cannot be undone」. Leave empty if nothing is.\n"
    "- affects_others: up to 6 lines, each naming who else the task touches and how."
)
FLAG_SCHEMA = {"type": "object", "properties": {"irreversible": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
                                                "affects_others": {"type": "array", "items": {"type": "string"}, "maxItems": 6}}}

TREND = (
    "Summarise the trend of the numbers the person recorded in their observation notes, from the notes only. A number "
    "recorded once has no trend: name it in unclear. Do not set a target, do not say what the numbers should be, do "
    "not predict, do not judge whether the person did well.\n"
    "- summary: a few plain sentences: which number moved, from what to what, between which dates.\n"
    "- unclear: up to 3 numbers recorded only once."
)
TREND_SCHEMA = {"type": "object", "properties": {"summary": {"type": "string"}, "unclear": {"type": "array", "items": {"type": "string"}, "maxItems": 3}}, "required": ["summary"]}

Read = Callable[[str], list[dict[str, Any]]]


def _task_view(doc: Mapping[str, Any]) -> dict[str, Any]:
    keys = ("title", "prediction", "due", "risk", "stop_condition", "escalate_condition", "owner", "status", "irreversible")
    return {"task": doc["doc_id"], **{key: doc["content"][key] for key in keys if doc["content"].get(key) not in (None, "", [])}}


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


def _flag_input(context: Mapping[str, Any], read: Read) -> str:
    tasks = [_task_view(task) for task in read("act.task")]
    if not tasks:
        raise InvariantViolation("ACT_NO_TASK: write a task card before asking for a check")
    intake = read("assembler.intake")
    payload = {"tasks": tasks, **({"affected": intake[-1]["content"].get("affected")} if intake and intake[-1]["content"].get("affected") else {})}
    return "The person's tasks:\n" + json.dumps(payload, ensure_ascii=False)


def _flag_shape(answer: dict[str, Any]) -> dict[str, Any]:
    shaped = {key: [item for item in answer.get(key) or [] if isinstance(item, str) and item.strip()][:6] for key in ("irreversible", "affects_others") if isinstance(answer.get(key), list)}
    return {key: value for key, value in shaped.items() if value}


def _trend_input(context: Mapping[str, Any], read: Read) -> str:
    titles = {task["doc_id"]: task["content"]["title"] for task in read("act.task")}
    notes = [{"task": titles.get(note["content"].get("task"), "?"), "on": note["created_at"][:10], "numbers": note["content"].get("numbers")} for note in read("act.note") if note["content"].get("numbers")]
    if not notes:
        raise InvariantViolation("ACT_NO_NUMBERS: no observation note has a number yet")
    return "The person's observation notes with numbers (oldest first):\n" + json.dumps(notes, ensure_ascii=False)


def _trend_shape(answer: dict[str, Any]) -> dict[str, Any]:
    unclear = [item for item in answer.get("unclear") or [] if isinstance(item, str) and item.strip()][:3] if isinstance(answer.get("unclear"), list) else []
    return {key: value for key, value in {"summary": answer.get("summary"), "unclear": unclear}.items() if value not in ([], None, "")}


ACTIONS = [
    AiAction(block="ACT", name="split", needs="propose_options", instructions=SPLIT, output_kind="act.split", output_schema=SPLIT_SCHEMA,
             reads=("decide.judgment", "act.task"), build_input=_split_input, shape=_split_shape),
    AiAction(block="ACT", name="flag", needs="organize", instructions=FLAG, output_kind="act.flag", output_schema=FLAG_SCHEMA,
             reads=("act.task", "assembler.intake"), build_input=_flag_input, shape=_flag_shape),
    AiAction(block="ACT", name="trend", needs="organize", instructions=TREND, output_kind="act.trend", output_schema=TREND_SCHEMA,
             reads=("act.task", "act.note"), build_input=_trend_input, shape=_trend_shape),
]
