"""LEARN's AI turns (contract card 「AI 能做什麼」): put the earlier judgment, the prediction, what the AI said and the
outcome side by side and name two things the person did well and one to practise; and, outside any case, be a mirror for
the daily calibration card. It never scores or ranks, never rewrites an earlier record, never decides for the person
whether to revise, and on the daily card never advises and never writes the counterexample."""

from __future__ import annotations

import json
from typing import Any, Callable, Mapping

from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction

COMPARE = (
    "Put the person's earlier judgment, their prediction, what the AI said back then and whether they took it, and what "
    "happened afterwards side by side, from the records only. Never give a score, a grade or a ranking, never say who "
    "was right, never rewrite what was written earlier to make it look right, and never say whether the person should "
    "revise: that is theirs. A good outcome does not make the judgment good and a bad outcome does not make it bad; if "
    "the person wrote what was luck apart from what was process, keep them apart.\n"
    "- side_by_side: plain sentences, earlier then later, quoting their own words.\n"
    "- done_well: exactly two things this person did well in how they thought this time, each tied to something they "
    "wrote or did on their own.\n"
    "- practice: one thing they could practise next time, as an invitation, not a fault."
)
COMPARE_SCHEMA = {"type": "object", "properties": {"side_by_side": {"type": "string"}, "done_well": {"type": "array", "items": {"type": "string"}, "maxItems": 2}, "practice": {"type": "string"}}, "required": ["side_by_side"]}

MIRROR = (
    "The person wrote one daily calibration card: one belief, emotion or decision. Give it back in their own words and "
    "calm order, adding nothing they did not write. You are a mirror: do not advise, do not suggest a counterexample or "
    "write one, do not say what could change it, do not interpret, diagnose or evaluate.\n"
    "- summary: what they wrote, given back."
)
MIRROR_SCHEMA = {"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"]}

Read = Callable[[str], list[dict[str, Any]]]


def _text(content: Mapping[str, Any], *keys: str) -> dict[str, Any]:
    return {key: content[key] for key in keys if content.get(key) not in (None, "", [])}


def _compare_input(context: Mapping[str, Any], read: Read) -> str:
    judgments = read("decide.judgment")
    tasks = read("act.task")
    if not judgments and not tasks:
        raise InvariantViolation("LEARN_NOTHING_TO_COMPARE: there is no judgment or task in this case yet")
    answered = {doc["content"].get("check"): doc["content"] for doc in read("decide.review")}
    ai_said = [{"from": "判斷檢查", "author": doc["author"], "said": _text(doc["content"], "clarity", "reversibility", "revisitable", "out_of_scope", "gaps", "contradictions"),
                "your_answer": _text(answered.get(doc["doc_id"], {}), "irreversible", "hold", "note")} for doc in read("decide.check")]
    reviews = {doc["content"].get("mirror"): doc["content"].get("decision") for doc in read("sense.review")}
    ai_said += [{"from": "外化的鏡子", "author": doc["author"], "said": _text(doc["content"], "summary", "gaps", "question"), "your_answer": reviews.get(doc["doc_id"], "")} for doc in read("sense.mirror")]
    ai_said += [{"from": "思考卡", "author": doc["author"], "said": _text(doc["content"], "claim"), "your_answer": _text(doc["content"], "reaction", "picked")}
                for doc in read("think.card") if doc["author"] in ("ai", "joint")]
    payload = {
        "earlier_judgment": ({"version": judgments[-1]["version"], **_text(judgments[-1]["content"], "conclusion", "confidence", "change_condition", "intensity_now", "next_step")} if judgments else None),
        "predictions": [_text(task["content"], "title", "prediction", "due", "status") for task in tasks],
        "afterwards": [{"on": note["created_at"][:10], **_text(note["content"], "happened", "thoughts", "adjustment", "blocker", "numbers")} for note in read("act.note")],
        "the_persons_review": [_text(doc["content"], "outcome", "prediction_result", "prediction_note", "missed", "process", "luck") for doc in read("learn.calibration")],
        "what_the_ai_said": ai_said,
    }
    return "The case records:\n" + json.dumps(payload, ensure_ascii=False)


def _compare_shape(answer: dict[str, Any]) -> dict[str, Any]:
    done = [item for item in answer.get("done_well") or [] if isinstance(item, str) and item.strip()][:2] if isinstance(answer.get("done_well"), list) else []
    return {key: value for key, value in {"side_by_side": answer.get("side_by_side"), "done_well": done, "practice": answer.get("practice")}.items() if value not in ([], None, "")}


def _mirror_input(context: Mapping[str, Any], read: Read) -> str:
    cards = read("learn.daily")
    card = next((doc for doc in cards if doc["doc_id"] == context.get("card")), cards[-1] if cards else None)
    if card is None:
        raise InvariantViolation("LEARN_NO_DAILY_CARD: write the daily card before asking for the mirror")
    return "The person's daily card:\n" + json.dumps(_text(card["content"], "about", "text"), ensure_ascii=False)


def _mirror_shape(answer: dict[str, Any]) -> dict[str, Any]:
    return {"summary": answer["summary"]} if isinstance(answer.get("summary"), str) and answer["summary"].strip() else {}


ACTIONS = [
    AiAction(block="LEARN", name="compare", needs="organize", instructions=COMPARE, output_kind="learn.compare", output_schema=COMPARE_SCHEMA,
             reads=("decide.judgment", "decide.check", "decide.review", "act.task", "act.note", "learn.calibration", "sense.mirror", "sense.review", "think.card"),
             build_input=_compare_input, shape=_compare_shape, max_tokens=1600),
    AiAction(block="LEARN", name="mirror", needs="organize", instructions=MIRROR, output_kind="learn.daily_mirror", output_schema=MIRROR_SCHEMA,
             reads=("learn.daily",), build_input=_mirror_input, shape=_mirror_shape, outside_case=True, max_tokens=700),
]
