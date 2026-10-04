"""TEACH's AI practice partner: challenge a thinking move and give move-level feedback."""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Mapping

from ai_lego.errors import InvariantViolation
from ai_lego.core.domain.kinds.teach import OPPOSITE_ROLES
from ai_lego.platform.ai_gate import AiAction
from ai_lego.platform.lessons import load_lessons, load_practice_cases


_REAL_CASE_KEYS = ("real_case", "real_case_id", "project_id")
_PRIVATE_REQUEST = re.compile(r"(?:請|要|必須).{0,12}(?:說出|透露|揭露|分享).{0,12}(?:脆弱|創傷|自傷|私密|秘密)")

OPPONENT = (
    "Act as the practice opponent for the role the learner chose. Read only the selected lesson, its practice case, and "
    "the learner's selected teach.run notes. Challenge the thinking move, not the person. Do not decide for the learner, "
    "give a score, give a rank, or ask the learner to disclose vulnerable, private, traumatic or secret information. "
    "Return a short challenge and at most one ordinary practice question."
)
OPPONENT_SCHEMA = {
    "type": "object",
    "properties": {"challenge": {"type": "string"}, "question": {"type": "string"}},
    "required": ["challenge"],
}

FEEDBACK = (
    "Give feedback on the learner's thinking moves from the selected teach.run notes. Read only that lesson, practice "
    "case and run. Key every item to a named thinking move that appears in the notes. Describe what happened and one "
    "possible next practice. Never score, rank or grade the learner, never decide whether they are good at it, and never "
    "ask for vulnerable, private, traumatic or secret disclosure."
)
FEEDBACK_SCHEMA = {
    "type": "object",
    "properties": {
        "move_feedback": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"move": {"type": "string"}, "feedback": {"type": "string"}, "next_practice": {"type": "string"}},
                "required": ["move", "feedback"],
            },
        }
    },
    "required": ["move_feedback"],
}

Read = Callable[..., list[dict[str, Any]]]


def _lesson(lesson_id: Any, lesson_version: Any) -> dict[str, Any]:
    if not isinstance(lesson_id, str) or not lesson_id:
        raise InvariantViolation("TEACH_LESSON_REQUIRED: name a lesson")
    lesson = next((item for item in load_lessons().items if item["id"] == lesson_id), None)
    if lesson is None or lesson["version"] != lesson_version:
        raise InvariantViolation(f"TEACH_LESSON_VERSION_UNKNOWN: {lesson_id!r} v{lesson_version!r}")
    return lesson


def _practice_case(case_id: Any) -> dict[str, Any]:
    if not isinstance(case_id, str) or not case_id:
        raise InvariantViolation("TEACH_PRACTICE_CASE_REQUIRED: name a practice case")
    case = next((item for item in load_practice_cases().items if item["id"] == case_id), None)
    if case is None:
        raise InvariantViolation(f"TEACH_PRACTICE_CASE_UNKNOWN: {case_id!r}")
    return case


def _require_real_case_consent(context: Mapping[str, Any], read: Read) -> None:
    real_case = next((context.get(key) for key in _REAL_CASE_KEYS if context.get(key)), None)
    if real_case is None:
        return
    if not isinstance(real_case, str):
        raise InvariantViolation("TEACH_REAL_CASE_INVALID: real case id must be text")
    consented = {doc["content"].get("project_id") for doc in read("teach.practice_consent")}
    if real_case not in consented:
        raise InvariantViolation("TEACH_PRACTICE_CONSENT_REQUIRED: agree before using a real case for practice")


def _run(context: Mapping[str, Any], read: Read) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    _require_real_case_consent(context, read)
    runs = read("teach.run")
    wanted_id = context.get("run") or context.get("run_id")
    selected = next((doc for doc in runs if wanted_id and doc["doc_id"] == wanted_id), None) if wanted_id else None
    if selected is None:
        selected = runs[-1] if runs else None
    if selected is None:
        raise InvariantViolation("TEACH_RUN_REQUIRED: save a practice run before asking the practice partner")
    content = selected["content"]
    lesson_id = context.get("lesson", content.get("lesson"))
    lesson_version = context.get("lesson_version", content.get("lesson_version"))
    case_id = context.get("practice_case", content.get("practice_case"))
    if lesson_id != content.get("lesson") or lesson_version != content.get("lesson_version") or case_id != content.get("practice_case"):
        raise InvariantViolation("TEACH_RUN_CONTEXT_MISMATCH: context must name the selected run")
    return selected, _lesson(lesson_id, lesson_version), _practice_case(case_id)


def _input(context: Mapping[str, Any], read: Read, *, feedback: bool) -> str:
    run, lesson, case = _run(context, read)
    content = run["content"]
    payload = {
        "lesson": {key: lesson[key] for key in ("id", "version", "title", "text", "example", "teaches")},
        "practice_case": {key: case[key] for key in ("id", "version", "title", "text", "place", "source")},
        "run": {key: content[key] for key in ("lesson", "lesson_version", "practice_case", "role", "notes") if key in content},
        **({"opponent_role": OPPOSITE_ROLES[content["role"]]} if not feedback else {}),
    }
    return ("The learner's practice record:\n" if feedback else "The practice material and learner's role:\n") + json.dumps(payload, ensure_ascii=False)


def _opponent_input(context: Mapping[str, Any], read: Read) -> str:
    return _input(context, read, feedback=False)


def _feedback_input(context: Mapping[str, Any], read: Read) -> str:
    return _input(context, read, feedback=True)


def _safe(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    if _PRIVATE_REQUEST.search(value):
        raise InvariantViolation("TEACH_PRIVATE_DISCLOSURE_REFUSED: practice feedback cannot ask for private disclosure")
    return value.strip()


def _opponent_shape(answer: dict[str, Any]) -> dict[str, Any]:
    shaped = {key: _safe(answer.get(key)) for key in ("challenge", "question")}
    return {key: value for key, value in shaped.items() if value}


def _feedback_shape(answer: dict[str, Any]) -> dict[str, Any]:
    items = answer.get("move_feedback") if isinstance(answer.get("move_feedback"), list) else []
    shaped = []
    for item in items:
        if not isinstance(item, dict):
            continue
        move, feedback, next_practice = _safe(item.get("move")), _safe(item.get("feedback")), _safe(item.get("next_practice"))
        if move and feedback:
            shaped.append({"move": move, "feedback": feedback, **({"next_practice": next_practice} if next_practice else {})})
    return {"move_feedback": shaped}


ACTIONS = [
    AiAction(block="TEACH", name="opponent", needs="organize", instructions=OPPONENT, output_kind="teach.opponent",
             output_schema=OPPONENT_SCHEMA, reads=("teach.run", "teach.practice_consent"), build_input=_opponent_input,
             shape=_opponent_shape, outside_case=True, max_tokens=900),
    AiAction(block="TEACH", name="feedback_on_moves", needs="organize", instructions=FEEDBACK, output_kind="teach.feedback",
             output_schema=FEEDBACK_SCHEMA, reads=("teach.run", "teach.practice_consent"), build_input=_feedback_input,
             shape=_feedback_shape, outside_case=True, max_tokens=1100),
]
