"""GATHER's AI turns (contract card 「AI 能做什麼」).

With 「AI 可以找外部資料」 granted (search_external): suggest queries and translate them (the platform's search runs them,
never the AI); say what each source says, always as 「這個來源說……」; point out two sources that contradict, side by
side, and whose account may be missing. Without it (always allowed): organise what the person pasted, point what is
missing, ask one question.

Reads (讀什麼): the question, the place (the gate adds it), what the person pasted or wrote, MAP's 「還缺什麼資料」, the
source cards, the channels -- never 情緒卡 (sense.*) or 判斷卡 (decide.*): the system does not know which side the person
is on, so it cannot pick sources they want to hear. The AI writes only its own kinds; every card and quote it names is
checked against the case's cards (ai_gate ``cites``). Under two independent origins, with 管道不足, or with nothing in the
place's language, the summary and the comparison hand back first (交還控制) unless the person says go on."""

from __future__ import annotations

import json
from typing import Any, Callable, Mapping

from ai_lego.core.domain.evidence_words import OWN_WORDS
from ai_lego.core.domain.kinds.gather import ANGLES
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction
from ai_lego.platform.block_hooks.gather import PASTED, handback_reasons

Read = Callable[..., list[dict[str, Any]]]
SAYS = "這個來源說"
ANGLE_KEYS = tuple(key for key, _ in ANGLES)
LANGS = ("zh", "en")   # the languages the platform's search runs in (rulesets gather.place_languages "searched")


def _asks(read: Read) -> list[str]:
    return [doc["content"]["text"] for doc in read("gather.ask") if not doc["content"].get("url")][-5:]


def _map_gaps(read: Read) -> list[str]:
    current = read("map.map")
    return [gap for gap in (current[-1]["content"].get("gaps") or []) if isinstance(gap, str)] if current else []


def _handback(context: Mapping[str, Any], read: Read) -> str | None:
    if context.get("go_on") is True:
        return None
    intake = read("assembler.intake")
    reasons = handback_reasons(read.evidence.origins(), read("gather.channels"), (intake[-1]["content"].get("happened_in") or []) if intake else [])
    return "；".join(reasons) + "。系統先停在這裡，由你決定要不要繼續。" if reasons else None


QUERIES = (
    "Suggest search queries for what the person wants to look up; the platform's own search runs them. Give each query "
    "in Chinese (zh) and again in English (en), the translation faithful and adding nothing. Give each the angle it "
    "looks from, one of: " + "; ".join(f"{key} = {name}" for key, name in ANGLES) + ". Look first for the most original "
    "material (laws, official notices, original video and photos), then precedents, then people who were there. Do not "
    "answer the question, do not state any fact, do not say what the sources will show. note: one sentence on what the "
    "queries still leave out."
)
QUERIES_SCHEMA = {
    "type": "object",
    "properties": {
        "queries": {"type": "array", "maxItems": 12, "items": {"type": "object", "properties": {"text": {"type": "string"}, "lang": {"type": "string", "enum": list(LANGS)},
                                                                                               "angle": {"type": "string", "enum": list(ANGLE_KEYS)}}, "required": ["text", "lang", "angle"]}},
        "note": {"type": "string"},
    },
    "required": ["queries"],
}

SUMMARY = (
    f"For each source given, say what it says in one or two sentences that begin with 「{SAYS}」. Never state it as a fact, "
    "never say whether it is true, never judge, rank or score the source, never add what the source does not say. Each "
    "item: the source's card id (`card`), the words you rely on copied exactly (`quote`), the source in `citations`, and "
    "`says`. gaps: up to 3 things none of the sources speaks to (name what is missing, never fill it in). question: at "
    "most one question for the person."
)
ORGANIZE = (
    f"Organise what the person pasted (the sources given) and what they wrote in their own words. For each pasted source "
    f"one item that begins with 「{SAYS}」, with its card id (`card`), the exact words (`quote`) and `citations`. The "
    f"person's own words are marked 「{OWN_WORDS}」: they are not a source -- never cite them and never treat them as one. "
    "Do not bring in anything from outside. gaps: up to 3 things still missing (whose account, the original document, a "
    "date). question: at most one question that helps them see what to look for next."
)
SAYS_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {"type": "array", "maxItems": 12, "items": {"type": "object", "properties": {"card": {"type": "string"}, "says": {"type": "string"}, "quote": {"type": "string"},
                                                                                             "citations": {"type": "array", "items": {"type": "string"}}}, "required": ["card", "says", "quote", "citations"]}},
        "gaps": {"type": "array", "maxItems": 3, "items": {"type": "string"}},
        "question": {"type": "string"},
    },
    "required": ["items"],
}

COMPARE = (
    "Point out pairs of sources that say opposite things about the same point. For each pair: `about` (the point, in "
    "neutral words) and the two sides `a` and `b`, each with its card id (`card`), the exact words (`quote`) and "
    "`citations`. The two stand side by side: never say which is right, never weigh them. missing: whose account may be "
    "missing here (a party, a place, people who were there, an official record), each with why you think so; never "
    "write what that side would say. If no two sources contradict, give no pairs."
)
_SIDE = {"type": "object", "properties": {"card": {"type": "string"}, "quote": {"type": "string"}, "citations": {"type": "array", "items": {"type": "string"}}}, "required": ["card", "quote", "citations"]}
COMPARE_SCHEMA = {
    "type": "object",
    "properties": {
        "conflicts": {"type": "array", "maxItems": 6, "items": {"type": "object", "properties": {"about": {"type": "string"}, "a": _SIDE, "b": _SIDE}, "required": ["about", "a", "b"]}},
        "missing": {"type": "array", "maxItems": 5, "items": {"type": "object", "properties": {"side": {"type": "string"}, "why": {"type": "string"}}, "required": ["side", "why"]}},
    },
    "required": ["conflicts", "missing"],
}


def _queries_input(context: Mapping[str, Any], read: Read) -> str:
    payload = {"what_to_look_up": _asks(read), "map_still_missing": _map_gaps(read)}
    return "What the person wants to look up:\n" + json.dumps(payload, ensure_ascii=False)


def _queries_shape(answer: dict[str, Any]) -> dict[str, Any]:
    """Only queries the platform can run: a language it searches in, an angle it knows, at most 200 characters, once."""
    kept, seen = [], set()
    for query in answer.get("queries") if isinstance(answer.get("queries"), list) else []:
        if isinstance(query, dict) and isinstance(query.get("text"), str) and query["text"].strip() and query.get("lang") in LANGS and query.get("angle") in ANGLE_KEYS:
            key = (query["text"].strip()[:200], query["lang"])
            if key not in seen:
                seen.add(key)
                kept.append({"text": key[0], "lang": query["lang"], "angle": query["angle"]})
    note = answer.get("note") if isinstance(answer.get("note"), str) else ""
    return {"queries": kept[:12], **({"note": note[:600]} if note.strip() else {})}


def _says_shape(answer: dict[str, Any]) -> dict[str, Any]:
    """Every summary is written as what the source says (它一律寫成「這個來源說……」), whatever the model began with."""
    items = []
    for item in answer.get("items") if isinstance(answer.get("items"), list) else []:
        if isinstance(item, dict):
            says = item.get("says") if isinstance(item.get("says"), str) else ""
            # citations always present: a summary that names no source is refused by the gate, never saved bare
            items.append({**{key: item[key] for key in ("card", "quote") if key in item}, "citations": item.get("citations", []),
                          "says": says if says.startswith(SAYS) else f"{SAYS}：{says}"})
    gaps = [gap for gap in answer.get("gaps") or [] if isinstance(gap, str) and gap.strip()][:3] if isinstance(answer.get("gaps"), list) else []
    question = answer.get("question") if isinstance(answer.get("question"), str) else ""
    return {key: value for key, value in {"items": items, "gaps": gaps, "question": question[:300]}.items() if value}


def _compare_shape(answer: dict[str, Any]) -> dict[str, Any]:
    """Two sides and the point, nothing that picks one; whose account is missing, never what it would say."""
    def side(value: Any) -> dict[str, Any]:   # citations always present, so a side that cites nothing is refused, not saved
        value = value if isinstance(value, dict) else {}
        return {**{key: value[key] for key in ("card", "quote") if key in value}, "citations": value.get("citations", [])}

    conflicts = [{"about": str(item.get("about") or "")[:300], "a": side(item.get("a")), "b": side(item.get("b"))}
                 for item in answer.get("conflicts") or [] if isinstance(item, dict)] if isinstance(answer.get("conflicts"), list) else []
    missing = [{"side": str(item.get("side") or "")[:200], "why": str(item.get("why") or "")[:300]}
               for item in answer.get("missing") or [] if isinstance(item, dict) and item.get("side")] if isinstance(answer.get("missing"), list) else []
    return {"conflicts": conflicts, "missing": missing}


def _sources_input(context: Mapping[str, Any], read: Read) -> str:
    return "What the person wants to look up:\n" + json.dumps(_asks(read), ensure_ascii=False)


def _organize_input(context: Mapping[str, Any], read: Read) -> str:
    """Without 找外部資料 the AI sees only what the person pasted (the page picks those cards) and their own words."""
    pasted = {doc["doc_id"] for doc in read("gather.source") if (doc["content"].get("found_by") or {}).get("by") == PASTED}
    picked = context.get("cards")
    if not isinstance(picked, list) or not set(picked) <= pasted:
        raise InvariantViolation("GATHER_ORGANIZE_PASTED_ONLY: without 找外部資料 the AI organises only what you pasted; pick only those cards")
    payload = {"what_to_look_up": _asks(read), OWN_WORDS: [doc["content"]["text"] for doc in read("gather.own")], "map_still_missing": _map_gaps(read)}
    return "The person's question and own words:\n" + json.dumps(payload, ensure_ascii=False)


ACTIONS = [
    AiAction(block="GATHER", name="queries", needs="search_external", instructions=QUERIES, output_kind="gather.ai_queries", output_schema=QUERIES_SCHEMA,
             reads=("gather.ask", "map.map"), build_input=_queries_input, shape=_queries_shape, max_tokens=1500),
    AiAction(block="GATHER", name="summarise", needs="search_external", instructions=SUMMARY, output_kind="gather.ai_says", output_schema=SAYS_SCHEMA,
             reads=("gather.ask", "gather.source", "gather.channels", "assembler.intake"), build_input=_sources_input, shape=_says_shape,
             max_tokens=2500, cites=True, handback=_handback),
    AiAction(block="GATHER", name="compare", needs="search_external", instructions=COMPARE, output_kind="gather.ai_compare", output_schema=COMPARE_SCHEMA,
             reads=("gather.ask", "gather.source", "gather.channels", "assembler.intake"), build_input=_sources_input, shape=_compare_shape,
             max_tokens=2500, cites=True, handback=_handback),
    AiAction(block="GATHER", name="organize", needs="organize", instructions=ORGANIZE, output_kind="gather.ai_says", output_schema=SAYS_SCHEMA,
             reads=("gather.ask", "gather.own", "gather.source", "map.map"), build_input=_organize_input, shape=_says_shape, max_tokens=2000, cites=True),
]
