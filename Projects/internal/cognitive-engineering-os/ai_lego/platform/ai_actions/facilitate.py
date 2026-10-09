"""FACILITATE's AI partner (docs/platform/STEP34_SHARED_RULES.md §11; card 62; contract 「AI 能做什麼 / 不准做什麼」).

``play_participant``: the AI is a practice participant so the leader can rehearse one step of a reviewed script against a
practice case. It reads no record at all: the script and the case are files, what the leader just said is the request.
``point_at_deviations``: while the leader writes the log, it points at lines of the leader's OWN log that may touch one of
the four don'ts, quoting the line by its number (the system copies the line, so it is the leader's words, never the model's)
and naming the don't. Its wording is 這裡可能偏離, never a verdict; every answer ends with the same fixed sentence: whether to
change the way of leading is for the leader and the supervisor, the AI only points.

Neither reads a participant's record (``reads`` holds the leader's own ``facilitate.log`` and nothing else: the gate in
tests/unit/test_facilitate_ai.py scans this file), neither scores or ranks anyone, neither leads participants, neither
writes a log. A crisis signal in what the leader sends stops the turn before the model (the gate; GOVERN's help follows).
"""

from __future__ import annotations

import json
from contextvars import ContextVar
from typing import Any, Callable, Mapping

from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction
from ai_lego.platform.lessons import load_practice_cases, scan_ai_text
from ai_lego.platform.scripts import FACIL_DONTS, load_scripts, usable_for_leading

HANDBACK = "要不要改帶法，由你和督導決定。AI 只指出來。"
FRAMING = "這裡可能偏離"
MAX_POINTERS = 12
MAX_SAY = 2000
MAX_EARLIER = 6
# Words that decide for the leader that something is wrong, or praise it: a pointer says "may", the leader and the supervisor judge.
_VERDICT = ("做錯", "錯了", "違規", "違反了", "失職", "稱職", "不合格", "做得很好", "做得好", "做得不好", "表現很", "表現不")

Read = Callable[..., list[dict[str, Any]]]

PARTICIPANT = (
    "You play one ordinary participant in a practice session so a facilitator can rehearse. You are given one step of the "
    "facilitator's script, a practice case (a public text, nobody's private life) and what the facilitator just said. Answer "
    "it as a participant would, in one to four short sentences. Be a real person: sometimes unsure, sometimes disagreeing, "
    "sometimes asking what the leader thinks, sometimes preferring not to share. Never invent facts about real people, never "
    "describe self-harm, violence or private suffering, never ask the facilitator for anything personal. You are not the "
    "leader: do not lead, instruct, summarise or conclude for the group. Never evaluate, praise, score or rank the facilitator."
)
PARTICIPANT_SCHEMA = {"type": "object", "properties": {"reply": {"type": "string"}}, "required": ["reply"]}

POINTER = (
    "A facilitator is writing the log of a session they led. You get the script they followed, the four things a facilitator "
    "never does, and the numbered lines of their log. Point at the lines that MAY touch one of the four. For each give: n (the "
    "number of the line, exactly as given), dont (one of the four, copied exactly), why (one short sentence: what the line says "
    "and which part of the script or of the four it may touch). Say 'may'; never say that something is wrong, never decide, "
    "never praise, never score or rank the facilitator or anyone. A line that departs from the script with a reason written is "
    "not a fault: point at it only if it may touch one of the four. If no line may touch one of them, return an empty list. "
    "Never ask for private details."
)
POINTER_SCHEMA = {
    "type": "object",
    "properties": {"pointers": {"type": "array", "items": {"type": "object", "properties": {"n": {"type": "integer"}, "dont": {"type": "string"}, "why": {"type": "string"}},
                                                           "required": ["n", "dont", "why"]}}},
    "required": ["pointers"],
}

# The numbered lines of the log being read, set by build_input and used by shape in the same turn: the gate hands shape only
# the model's answer, and a pointer's line must be copied from the log by the system, not typed by the model.
_LINES: ContextVar[list[str] | None] = ContextVar("facilitate_log_lines", default=None)


def log_lines(content: Mapping[str, Any]) -> list[str]:
    """The lines of a log a pointer may name: what followed, one per line, then each deviation as written."""
    followed, deviated = content.get("followed"), content.get("deviated")
    lines = [part.strip() for part in (followed if isinstance(followed, str) else "").splitlines() if part.strip()]
    return lines + [f"沒照稿：{item['what']}（理由：{item['why']}）" for item in (deviated if isinstance(deviated, list) else [])]


def _refuse(code: str, text: str) -> InvariantViolation:
    return InvariantViolation(f"{code}: {text}")


def _safe(value: Any) -> str | None:
    """The model's sentence if it scores, ranks, asks for private disclosure or decides a verdict: refused as the model's failure."""
    if not isinstance(value, str) or not value.strip():
        return None
    clean = value.strip()
    try:
        scan_ai_text(clean)
    except InvariantViolation as error:
        raise _refuse("AI_ANSWER_INVALID", str(error)) from error
    if any(word in clean for word in _VERDICT):
        raise _refuse("AI_ANSWER_INVALID", "a pointer says may, it does not decide or praise")
    return clean


# -- play_participant ---------------------------------------------------------------------------------------------------

def _practice(context: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, Any], int, str, list[dict[str, str]]]:
    script = next((item for item in usable_for_leading() if item["id"] == context.get("script")), None)
    if script is None:
        raise _refuse("FACILITATE_SCRIPT_NOT_REVIEWED", "practise with a script that is reviewed and has a stop signal")
    case = next((item for item in load_practice_cases().items if item["id"] == context.get("practice_case")), None)
    if case is None:
        raise _refuse("TEACH_PRACTICE_CASE_UNKNOWN", f"{context.get('practice_case')!r}")
    step = context.get("step")
    if isinstance(step, bool) or not isinstance(step, int) or not 1 <= step <= len(script["steps"]):
        raise _refuse("FACILITATE_STEP_UNKNOWN", "name a step of the script")
    say = context.get("say")
    if not isinstance(say, str) or not say.strip() or len(say) > MAX_SAY:
        raise _refuse("FACILITATE_SAY_REQUIRED", "write what you say to the participant")
    earlier = [] if context.get("earlier") is None else context["earlier"]
    if (not isinstance(earlier, list) or len(earlier) > MAX_EARLIER
            or any(not isinstance(turn, dict) or set(turn) != {"leader", "participant"} or not all(isinstance(text, str) and len(text) <= MAX_SAY for text in turn.values()) for turn in earlier)):
        raise _refuse("AI_CONTEXT_INVALID", "earlier is a short list of {leader, participant}")
    return script, case, step, say.strip(), earlier


def _practice_input(context: Mapping[str, Any], read: Read) -> str:
    script, case, step, say, earlier = _practice(context)
    given = script["steps"][step - 1]
    payload = {"script_step": {"what": given["what"], "minutes": given["minutes"]}, "practice_case": {"title": case["title"], "text": case["text"]},
               "earlier": earlier, "the_facilitator_just_said": say}
    return "The practice session:\n" + json.dumps(payload, ensure_ascii=False)


def _practice_fill(context: Mapping[str, Any], read: Read) -> dict[str, Any]:
    script, _case, step, _say, _earlier = _practice(context)
    return {"script": script["id"], "step": step}


def _reply_shape(answer: dict[str, Any]) -> dict[str, Any]:
    reply = _safe(answer.get("reply"))
    if not reply:
        raise _refuse("AI_ANSWER_INVALID", "the participant said nothing")
    return {"reply": reply}


# -- point_at_deviations ------------------------------------------------------------------------------------------------

def _log(context: Mapping[str, Any], read: Read) -> dict[str, Any]:
    """The leader's own log the turn is about: the one named, else the latest."""
    logs = read("facilitate.log")
    wanted = context.get("log")
    log = next((item for item in logs if item["doc_id"] == wanted), None) if wanted else (logs[-1] if logs else None)
    if log is None:
        raise _refuse("FACILITATE_AI_LOG_REQUIRED", "save the log first, then ask")
    return log


def _pointers_input(context: Mapping[str, Any], read: Read) -> str:
    log = _log(context, read)
    content = log["content"]
    script = next((item for item in load_scripts().items if item["id"] == content["script"]), None)
    if script is None or script["version"] != content["script_version"]:
        raise _refuse("FACILITATE_SCRIPT_CHANGED", "the script this log followed is not at that version any more")
    lines = log_lines(content)
    _LINES.set(lines)
    payload = {"four_donts": list(FACIL_DONTS), "script": {"steps": [{"what": step["what"], "minutes": step["minutes"], "dont": step["dont"]} for step in script["steps"]]},
               "log_lines": [{"n": number, "text": text} for number, text in enumerate(lines, 1)]}
    return "The facilitator's log:\n" + json.dumps(payload, ensure_ascii=False)


def _pointers_fill(context: Mapping[str, Any], read: Read) -> dict[str, Any]:
    log = _log(context, read)
    return {"log": log["doc_id"], "log_version": log["version"], "handback": HANDBACK}


def _pointers_shape(answer: dict[str, Any]) -> dict[str, Any]:
    lines = _LINES.get()
    _LINES.set(None)
    items = answer.get("pointers")
    if lines is None or not isinstance(items, list):
        raise _refuse("AI_ANSWER_INVALID", "the model did not point at lines of the log")
    shaped, seen = [], set()
    for item in items:
        number, dont = (item.get("n"), item.get("dont")) if isinstance(item, dict) else (None, None)
        why = _safe(item.get("why")) if isinstance(item, dict) else None
        if isinstance(number, bool) or not isinstance(number, int) or not 1 <= number <= len(lines) or dont not in FACIL_DONTS or not why:
            raise _refuse("AI_ANSWER_INVALID", "a pointer names a line of the log, one of the four, and why it may touch it")
        if (number, dont) not in seen:
            seen.add((number, dont))
            shaped.append({"n": number, "line": lines[number - 1], "dont": dont, "text": f"{FRAMING}「{dont}」：{why}"})
    return {"pointers": shaped[:MAX_POINTERS]}


ACTIONS = [
    AiAction(block="FACILITATE", name="play_participant", needs="organize", instructions=PARTICIPANT, output_kind="facilitate.practice_reply",
             output_schema=PARTICIPANT_SCHEMA, reads=(), build_input=_practice_input, shape=_reply_shape, fill=_practice_fill, outside_case=True, max_tokens=700),
    AiAction(block="FACILITATE", name="point_at_deviations", needs="point_gaps", instructions=POINTER, output_kind="facilitate.pointers",
             output_schema=POINTER_SCHEMA, reads=("facilitate.log",), build_input=_pointers_input, shape=_pointers_shape, fill=_pointers_fill, outside_case=True, max_tokens=1100),
]
