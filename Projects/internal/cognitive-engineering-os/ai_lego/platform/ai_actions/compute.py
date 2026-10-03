"""COMPUTE's AI turns (contract card 「AI 能做什麼」): suggest an algorithm (``propose_options``: STEP2_SHARED_RULES §11)
and explain a run in plain words, naming the assumption that moves it most (``organize``). The system runs every
calculation; the AI never writes a number, never calls a calculation or a simulation a prediction, and never hides an
assumption: ``rests_on`` is every input of the run, filled from the record, not by the model.

They read only COMPUTE's own records and GATHER's source cards (via ``read.evidence``: the counts, never a recount) --
nothing else the person keeps (讀什麼：GATHER 的來源卡、你給的數字；絕不讀跟這次計算無關的個人資料). ``explain`` hands
back (交還控制) while an outside number has under two independent origins, unless the person chose to go on."""

from __future__ import annotations

import json
import re
import unicodedata
from contextvars import ContextVar
from typing import Any, Callable, Mapping

from ai_lego.core.domain.evidence_words import MIN_ORIGINS
from ai_lego.core.domain.kinds.compute import AI_PARTS, NOT_PREDICTION
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction
from ai_lego.platform.block_hooks.compute import algorithms, input_origins, sourcing, weakest

Read = Callable[..., list[dict[str, Any]]]
READS = ("compute.run", "gather.source")

# A number the AI wrote: a digit (any script, after NFKC), a percent, or a Chinese numeral with a magnitude or a unit
# (五萬、三千、兩成、一倍、十元). 「一個」「兩邊」「千萬不要」 stay words.
NUMBER = re.compile(r"\d|%|百分之|[零〇一二兩三四五六七八九十][十百千萬億]|[零〇一二兩三四五六七八九十百千萬億]+[元塊成倍]")
# 「模擬不是預測」 and its plain variants may be said; anything else calling it a forecast or a certainty is refused.
NOT_A_FORECAST = ("不是預測", "不等於預測", "不是在預測", "不能當成預測", "並不是預測", "不一定會", "不等於一定會", "不保證")
FORECAST = re.compile(r"預測|一定會|保證|predict|forecast|guarantee", re.IGNORECASE)

# shape() gets only the model's answer: build_input, in the same call and thread, leaves the turn's record here
# (ask_ai always runs build_input first), the same way THINK's turns name their round.
_TURN: ContextVar[dict[str, Any] | None] = ContextVar("compute_turn", default=None)


def _guard_words(texts: list[str], known: list[str]) -> None:
    """Refuses an answer that writes a number or calls a result a prediction. ``known``: the person's own words and the
    system's names the answer may quote (an input named 「2027 年的房租」 is not a number the AI made up)."""
    for text in texts:
        plain = unicodedata.normalize("NFKC", text)
        for word in sorted((unicodedata.normalize("NFKC", item) for item in known if item), key=len, reverse=True):
            plain = plain.replace(word, " ")
        if NUMBER.search(plain):
            raise InvariantViolation("AI_ANSWER_HAS_NUMBER: AI 寫了數字（AI 不准自己編數字），這次沒有存。")
        for allowed in NOT_A_FORECAST:
            plain = plain.replace(allowed, " ")
        if FORECAST.search(plain):
            raise InvariantViolation("AI_ANSWER_CALLS_IT_PREDICTION: AI 把計算或模擬說成了預測或保證，這次沒有存。")


def _names() -> list[str]:
    return [word for algo in algorithms().values() for word in (algo["name"], algo["result"]["name"], *(spec["name"] for spec in algo["inputs"]))]


# -- suggest: which algorithm fits (提出選項) ----------------------------------------------------------------------------

SUGGEST = (
    "The person wrote what they want to calculate. Suggest up to three of the algorithms listed below that fit it, by "
    "their id, each with one plain sentence on why it fits and what it would leave out. Then up to five ideas, in words "
    "only, for their 樂觀／一般／悲觀 scenarios: what could make it go better or worse. Ask at most one question.\n"
    "- Never write a number, an amount, a percentage or a range: the person picks every number and where it comes from; "
    "the system computes.\n"
    "- This is a suggestion, not the one right method; when several fit, say what each would show.\n"
    "- A calculation or simulation is not a prediction: never say what will happen."
)
SUGGEST_SCHEMA = {
    "type": "object",
    "properties": {
        "algorithms": {"type": "array", "maxItems": 3, "items": {"type": "object", "properties": {"id": {"type": "string"}, "why": {"type": "string"}}, "required": ["id", "why"]}},
        "ideas": {"type": "array", "maxItems": 5, "items": {"type": "string"}},
        "question": {"type": "string"},
    },
    "required": ["algorithms"],
}


def _suggest_input(context: Mapping[str, Any], read: Read) -> str:
    question = context.get("question")
    if not isinstance(question, str) or not question.strip():
        raise InvariantViolation("COMPUTE_QUESTION_REQUIRED: 先寫下你要算什麼，AI 才建議算法。")
    question = question.strip()[:1000]
    _TURN.set({"known": [question, *_names()]})
    catalog = [{"id": algo["id"], "name": algo["name"], "label": algo["label"], "formula": algo["formula"], "inputs": [spec["name"] for spec in algo["inputs"]]}
               for algo in algorithms().values()]
    return ("What the person wants to calculate:\n" + json.dumps({"question": question}, ensure_ascii=False)
            + "\n\nThe algorithms the system can run:\n" + json.dumps(catalog, ensure_ascii=False))


def _suggest_shape(answer: dict[str, Any]) -> dict[str, Any]:
    turn, ids = _TURN.get() or {"known": []}, set(algorithms())
    _TURN.set(None)
    picked, seen = [], set()
    for item in answer.get("algorithms") if isinstance(answer.get("algorithms"), list) else []:
        if isinstance(item, dict) and item.get("id") in ids and item["id"] not in seen and isinstance(item.get("why"), str) and item["why"].strip():
            seen.add(item["id"])
            picked.append({"id": item["id"], "why": item["why"].strip()[:300]})
    ideas = [idea.strip() for idea in answer.get("ideas") or [] if isinstance(idea, str) and idea.strip()][:5] if isinstance(answer.get("ideas"), list) else []
    question = answer.get("question").strip()[:300] if isinstance(answer.get("question"), str) else ""
    _guard_words([item["why"] for item in picked] + ideas + [question], turn["known"])
    return {key: value for key, value in {"algorithms": picked[:3], "ideas": ideas, "question": question}.items() if value}


# -- explain: what a run shows, in plain words (整理) --------------------------------------------------------------------

EXPLAIN = (
    "The system ran the calculation below; you did not, and you never restate, round or invent any number. Explain in "
    "plain words what it shows, as a few short points. Label each point with exactly one of these kinds: "
    + "、".join(AI_PARTS) + " (資料支持 = what a number with outside sources says; 推論 = what follows from the formula; "
    "法律／程序條件 = a rule or procedure it depends on; 價值選擇 = what depends on what the person values; 創意假設 = a "
    "guess). Put in `influential` the one input, named exactly as given, whose change moves the result most.\n"
    "- Never write a number, an amount, a percentage or a ratio: refer to inputs and results by name; the page shows "
    "every number beside your words.\n"
    f"- A calculation or a simulation is not a prediction ({NOT_PREDICTION}): a pessimistic scenario that loses money "
    "does not mean the person will lose money. Never say what will happen and never call a result certain.\n"
    "- Say which numbers are the person's own (no outside source) and which have few independent origins; the result "
    "is no surer than its least-sourced number. Never present the result as objective truth or as a recommendation."
)
EXPLAIN_SCHEMA = {
    "type": "object",
    "properties": {
        "points": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"type": "object", "properties": {"part": {"type": "string", "enum": list(AI_PARTS)}, "text": {"type": "string"}}, "required": ["part", "text"]}},
        "influential": {"type": "string"},
    },
    "required": ["points", "influential"],
}


def _run(context: Mapping[str, Any], read: Read) -> dict[str, Any]:
    wanted = context.get("run")
    found = next((run for run in read.evidence.calcs() if run["run_id"] == wanted), None) if isinstance(wanted, str) else None
    if found is None:
        raise InvariantViolation("COMPUTE_RUN_NOT_FOUND: 找不到這次計算。")
    return found


def _explain_input(context: Mapping[str, Any], read: Read) -> str:
    run = _run(context, read)
    inputs = [item for item in run.get("inputs") or [] if isinstance(item, Mapping)]
    rows = sourcing(inputs, input_origins(read.evidence.origins(), inputs))
    names = [item["name"] for item in inputs]
    _TURN.set({"run": run["run_id"], "inputs": names, "known": [*names, run.get("question") or "", *_names()]})
    source = {row["input"]: row["words"] for row in rows}
    payload = {
        "question (the person's)": run.get("question"), "label": run.get("label"), "algorithm": (run.get("algorithm") or {}).get("name"),
        "formula": run.get("formula"), "inputs": [{"name": item["name"], "value": item.get("value"), "unit": item.get("unit"), "source": source.get(item["name"])} for item in inputs],
        "scenarios": run.get("scenarios"), "result": run.get("result"), "flip (the system's one-at-a-time sweep)": run.get("flip"),
        "how sure (the system's rule)": weakest(rows),
    }
    return "The calculation:\n" + json.dumps(payload, ensure_ascii=False)


def _explain_handback(context: Mapping[str, Any], read: Read) -> str | None:
    """交還控制：某個外部數字的獨立出處不到兩個時，AI 停下來。畫面顯示有幾個出處，由你決定。你自己給的數字不算。"""
    if context.get("go_on") is True:
        return None
    run = _run(context, read)
    thin = run.get("thin_inputs") or []
    if not thin:
        return None
    counts = input_origins(read.evidence.origins(), [item for item in run.get("inputs") or [] if isinstance(item, Mapping)])
    named = "、".join(f"「{name}」只有 {counts.get(name, 0)} 個" for name in thin)
    return f"{named}算數的獨立出處（要 {MIN_ORIGINS} 個）。AI 先停下來，由你決定：可以先去找出處，或按「仍然繼續」。"


def _explain_shape(answer: dict[str, Any]) -> dict[str, Any]:
    turn = _TURN.get()
    _TURN.set(None)
    if turn is None or "run" not in turn:
        raise InvariantViolation("AI_ANSWER_INVALID: the turn's run was not read before the answer")
    points = [{"part": item["part"], "text": item["text"].strip()} for item in answer.get("points") or []
              if isinstance(item, dict) and item.get("part") in AI_PARTS and isinstance(item.get("text"), str) and item["text"].strip()][:8] \
        if isinstance(answer.get("points"), list) else []
    influential = answer.get("influential").strip() if isinstance(answer.get("influential"), str) else ""
    if influential not in turn["inputs"]:
        raise InvariantViolation("AI_ANSWER_INVALID: the most influential assumption is not one of the run's inputs")
    _guard_words([item["text"] for item in points], turn["known"])
    return {"run": turn["run"], "points": points, "influential": influential, "rests_on": turn["inputs"]}


ACTIONS = [
    AiAction(block="COMPUTE", name="suggest", needs="propose_options", instructions=SUGGEST, output_kind="compute.suggestion", output_schema=SUGGEST_SCHEMA,
             reads=(), build_input=_suggest_input, shape=_suggest_shape, max_tokens=900),
    AiAction(block="COMPUTE", name="explain", needs="organize", instructions=EXPLAIN, output_kind="compute.explanation", output_schema=EXPLAIN_SCHEMA,
             reads=READS, build_input=_explain_input, shape=_explain_shape, handback=_explain_handback, max_tokens=1400),
]
