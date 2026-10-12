"""DECIDE's AI turn (contract card 「AI 能做什麼」): the AI checks what the person wrote -- clear, undoable, checkable
later, within its scope, no empty cells, no contradictions -- and may ask one question. It never fills in a conclusion,
never chooses, and gives no new answer for a version the person sealed with 「現在我要自己下結論」.
Reads only the judgment, the seals, the norm notes and the claim ledger (讀什麼). A fact's count is never sent as stored: it is
recomputed from what the fact points at (STEP2_SHARED_RULES §3, a copy is a pointer, never a fact)."""

from __future__ import annotations

import json
from typing import Any, Callable, Mapping

from ai_lego.core.domain import doc_kinds
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction, AiRefused
from ai_lego.platform.evidence import not_usable_because
from ai_lego.platform.text.ai_words import FIELD_LABELS

CHECK = (
    "Check what the person wrote on their judgment card. You do not write, complete or improve their conclusion, you "
    "do not choose for them and you do not say which option is better. You only point at places in what they wrote:\n"
    "- clarity: up to 6 places where the wording is unclear; quote the few words and say what is unclear.\n"
    "- reversibility: up to 6 things in the conclusion, the next step or the options that cannot be undone once done "
    "or are hard to undo, each as one line: what, and why it cannot be undone. Leave empty if nothing is.\n"
    "- revisitable: whether the person could later check this against what happens, and what would be hard to check "
    "(one or two sentences; leave empty if it can be checked).\n"
    "- out_of_scope: places where a statement goes beyond the place, the law, the facts or the sources the person gave. "
    "Never say what a law says.\n"
    "- gaps: which cells of the card are still empty, by the cell's name.\n"
    "- contradictions: statements on the card that contradict each other; quote both.\n"
    "- question: at most one question that helps the person say it more clearly. Never a leading question.\n"
    "Name a cell only by its Chinese label in cell_labels (what the person sees on the page), never by its key; never write a key such as uncertainty or intensity_now."
)

CHECK_SCHEMA = {
    "type": "object",
    "properties": {
        "clarity": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
        "reversibility": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
        "revisitable": {"type": "string"},
        "out_of_scope": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
        "gaps": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
        "contradictions": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
        "question": {"type": "string"},
    },
}
LISTS = {"clarity": 6, "reversibility": 6, "out_of_scope": 6, "gaps": 8, "contradictions": 6}
# What the check reads of the card: the person's own words; the system's influence list is not theirs to be checked.
SYSTEM_MADE = ("influences_listed",)
# What it reads of 規範與脈絡 (the facets marked relevant, the places, three of the four checks with the person's stance, the public-issue answers)
NORM_KEYS = ("jurisdictions", "rights_duties", "norm_origin", "stance_kind", "stance", "interface")


def sealed(read: Callable[[str], list[dict[str, Any]]]) -> bool:
    """The person pressed 「現在我要自己下結論」 for the version being written or for the one last saved."""
    saved = read("decide.judgment")
    latest = saved[-1]["version"] if saved else 0
    seals = {doc["content"].get("for_version") for doc in read("decide.seal")}
    return latest in seals or latest + 1 in seals


def _standing(fact: Mapping[str, Any], claims: list[dict[str, Any]]) -> tuple[str, dict[str, Any] | None]:
    """Where a card fact stands now, from its pointer -- the same answer as the page's current() (lib/decide.ts); both
    are checked against tests/fixtures/fact_standing.json."""
    if fact.get("claim"):
        claim = next((line for line in claims if line["claim_id"] == fact["claim"]), None)
        if claim is None:
            return "deleted", None
        if fact.get("claim_version") != claim["version"]:
            return "older", claim   # the card holds the old words; the ledger's counts are for the new ones
        return ("not_usable" if not_usable_because(claim) else "current"), claim
    return ("linked" if fact.get("cards") else "own"), None


_BASIS = {
    "own": "the person's own words; no outside source",
    "linked": "linked to source pages; how many independent origins is not given here",   # DECIDE does not read source cards: fail closed
    "deleted": "a checked claim that was deleted since; no outside source now",
    "older": "an older wording of a checked claim; no count now",
    "not_usable": "a checked claim that cannot stand as a fact now",
}


def _basis(fact: Mapping[str, Any], claims: list[dict[str, Any]]) -> str:
    standing, claim = _standing(fact, claims)
    if standing == "current" and claim is not None:
        return f"a checked claim: {len(claim['support'])} independent origins support it, {len(claim['oppose'])} oppose it"
    return _BASIS[standing]


def _facts_now(facts: Any, claims: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [{"text": fact["text"], "basis": _basis(fact, claims), **({"credibility": fact["credibility"]} if isinstance(fact.get("credibility"), str) else {})}
            for fact in facts if isinstance(fact, dict) and isinstance(fact.get("text"), str) and fact["text"].strip()] if isinstance(facts, list) else []


def _check_input(context: Mapping[str, Any], read: Callable[[str], list[dict[str, Any]]]) -> str:
    if sealed(read):
        raise AiRefused("AI_SEALED: 你按了「現在我要自己下結論」，這一版 AI 不再給新答案；存下一版之後才能再請它檢查")
    saved = read("decide.judgment")
    if not saved:
        raise InvariantViolation("DECIDE_NO_JUDGMENT: save the judgment card before asking for a check")
    card = {key: value for key, value in saved[-1]["content"].items() if key not in SYSTEM_MADE}
    if "facts" in card:
        card["facts"] = _facts_now(card["facts"], read.evidence.claims())   # never the stored count
    payload: dict[str, Any] = {"judgment_card": card, "cell_labels": {key: FIELD_LABELS[key] for key in doc_kinds.require("decide.judgment").fields if key in FIELD_LABELS and key not in SYSTEM_MADE}}
    notes = read("context.notes")
    if notes:
        held = notes[-1]["content"]
        found = {key: held[key] for key in NORM_KEYS if held.get(key)}
        mattering = [item["facet"] for item in held.get("facets") or [] if isinstance(item, dict) and item.get("relevant") and item.get("facet")]
        if mattering:
            found["relevant_facets"] = mattering
        if found:
            payload["norm_notes"] = found
            payload["cell_labels"].update({key: FIELD_LABELS[key] for key in (*found, "relevant_facets") if key in FIELD_LABELS})
    return "The person's judgment card:\n" + json.dumps(payload, ensure_ascii=False)


def _shape(answer: dict[str, Any]) -> dict[str, Any]:
    shaped = {key: [item for item in answer.get(key) or [] if isinstance(item, str) and item.strip()][:limit] for key, limit in LISTS.items() if isinstance(answer.get(key), list)}
    shaped.update({key: answer[key] for key in ("revisitable", "question") if isinstance(answer.get(key), str)})
    return {key: value for key, value in shaped.items() if value not in ([], None, "")}


ACTIONS = [
    AiAction(block="DECIDE", name="check", needs="organize", instructions=CHECK, output_kind="decide.check", output_schema=CHECK_SCHEMA,
             reads=("decide.judgment", "decide.seal", "context.notes", "verify.claim"), build_input=_check_input, shape=_shape),
]
