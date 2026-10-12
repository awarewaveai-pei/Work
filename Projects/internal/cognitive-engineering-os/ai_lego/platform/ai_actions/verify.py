"""VERIFY's AI turns (contract card 「AI 能做什麼」): propose how a message splits into claims (``split``), name the
manipulation patterns with the message's own words (``techniques``), read what each source card says about each claim
(``read``: cites the case's cards only, never one only the person reads -- a fact-check hit or report), summarise the
ledger in plain words (``summary``: hands back under two independent origins), and say what is still worth checking
(``next``). The pasted message reaches split and techniques only through the gate's ``quoted``: after the crisis check,
fenced as someone else's words (a rumour that mentions 自殺 is not the person's crisis signal).

Every turn about a message waits for the person's first reaction to it (先寫第一反應，才看結果). The AI never rules a claim
true or false and never decides what to forward: no AI kind holds a verdict, the ledger is the system's
(``evidence.checked_claims``), a weak, uncheckable or 法律未確認 claim's line is fixed words, and no turn is given a
source's country or the person's verdict -- it cannot conclude from what it is not shown.
"""

from __future__ import annotations

import json
import re
from contextvars import ContextVar
from typing import Any, Callable, Mapping

from ai_lego.core.domain.evidence_words import CHECKABLE, MIN_ORIGINS, MIN_QUOTE, NOT_CHECKABLE, SENTENCE_KINDS, STANCES, normalise_quote, quote_in
from ai_lego.core.domain.kinds.verify import ASKS, LAW_UNCONFIRMED_LINE, claim_key, law_unconfirmed, weak_line
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import AiAction
from ai_lego.platform.block_hooks.verify import FIRST_REQUIRED, card_sha, first_written, person_reads
from ai_lego.platform.rulesets.verify import TECHNIQUES

Read = Callable[..., list[dict[str, Any]]]
MAX_CLAIMS = 12
FACTCHECK_NOT_FOR_AI = ("VERIFY_FACTCHECK_CARD_NOT_FOR_AI: a fact-check card (a hit, or a page found through the fact-check angle) is yours to read, "
                        "never the AI's; name the cards the AI reads (context.cards) without it")

# shape() gets only the model's answer, but the saved document is filled from the records (the message, a claim's
# version, a card's page): build_input, in the same call and thread, leaves them here (the THINK pattern).
_TURN: ContextVar[dict[str, Any] | None] = ContextVar("verify_turn", default=None)


def _invalid(why: str) -> InvariantViolation:
    return InvariantViolation(f"AI_ANSWER_INVALID: {why}")


def _turn() -> dict[str, Any]:
    found = _TURN.get()
    if found is None:
        raise _invalid("the answer has nothing to belong to")
    _TURN.set(None)
    return found


def _text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _message(context: Mapping[str, Any], read: Read) -> dict[str, Any]:
    message_id = context.get("message")
    found = next((doc for doc in read("verify.message") if doc["doc_id"] == message_id), None) if isinstance(message_id, str) else None
    if found is None:
        raise InvariantViolation(f"VERIFY_MESSAGE_NOT_FOUND: no message {str(message_id)[:64]!r} in this case")
    if not first_written(read("verify.first"), message_id):
        raise InvariantViolation(FIRST_REQUIRED)
    return found


def _the_message(context: Mapping[str, Any], read: Read) -> list[str]:
    """The message the turn is about, for the gate to quote (``AiAction.quoted``); build_input has already checked it."""
    return [context["message"]]


def _claims(context: Mapping[str, Any], read: Read, *, checkable_only: bool = False) -> list[dict[str, Any]]:
    """The claims this turn is about: ``context["claims"]`` (ids) or every claim (of ``context["message"]`` if named);
    a claim from a message needs that message's first reaction."""
    firsts = read("verify.first")
    claims = read("verify.claim")
    wanted = context.get("claims")
    if wanted is not None:
        if not isinstance(wanted, list) or any(not isinstance(item, str) for item in wanted):
            raise InvariantViolation("AI_CONTEXT_INVALID: claims is a list of claim ids")
        missing = sorted(set(wanted) - {doc["doc_id"] for doc in claims})
        if missing:
            raise InvariantViolation(f"VERIFY_CLAIM_NOT_FOUND: no claim {missing[:3]} in this case")
        claims = [doc for doc in claims if doc["doc_id"] in set(wanted)]
    elif isinstance(context.get("message"), str):
        claims = [doc for doc in claims if doc["content"].get("message") == context["message"]]
    if checkable_only:
        claims = [doc for doc in claims if doc["content"].get("sentence") == CHECKABLE]
    if any(doc["content"].get("message") and not first_written(firsts, doc["content"]["message"]) for doc in claims):
        raise InvariantViolation(FIRST_REQUIRED)
    if not claims:
        raise InvariantViolation("VERIFY_NO_CLAIMS: there is no confirmed claim to work on yet")
    return claims[:MAX_CLAIMS] if wanted is None else claims


# -- split -------------------------------------------------------------------------------------------------------------

SPLIT = (
    "Split the message into the claims it makes, at most 12. Each claim is one sentence, as close to the message's own words as you can, and "
    "is exactly one of four kinds: 可以查的事實 (something said to have happened or to exist, that a record could confirm or not), 對事實的解釋 "
    "(what a fact is taken to mean), 價值判斷 (good or bad, should or should not), 叫你去做的事 (forward, donate, vote or not, stay away from someone). "
    "Example: 「下週起每天只能領一萬元」 is 可以查的事實; 「快去領」 is 叫你去做的事. Set law to true for a sentence about what a law, rule or court says. "
    "Do not say whether any claim is true; the person confirms each claim, rewrites it or drops it. "
    "text is copied from the message -- a sentence of it, or a part of one -- with no bracket, remark, warning or word of your own: the platform adds its own "
    "caution to a 法律 claim, so do not. A claim whose words are not in the message is thrown away. If you must say something about a claim, put it in note, "
    "which the person never sees as part of the claim."
)
SPLIT_SCHEMA = {"type": "object", "properties": {"claims": {"type": "array", "maxItems": MAX_CLAIMS, "items": {"type": "object", "properties": {
    "text": {"type": "string"}, "sentence": {"type": "string", "enum": list(SENTENCE_KINDS)}, "law": {"type": "boolean"}, "note": {"type": "string"}}, "required": ["text", "sentence"]}}}, "required": ["claims"]}
_REMARK = re.compile(r"[（(【\[]([^）)】\]]*)[）)】\]]")


def _split_input(context: Mapping[str, Any], read: Read) -> str:
    message = _message(context, read)
    _TURN.set({"message": message["doc_id"], "text": message["content"]["text"]})
    return "Split the message given below between the QUOTED markers."


def _own_words(text: str, message: str) -> str:
    """A claim's text is the message's own words, or it is nothing (``""``: the claim is dropped). A bracketed group that is
    not in the message is the AI's own remark (「…（未註明出處，需由律師確認）」, 2026-10-12: it went into every web search of the
    claim): cut out first, so the claim survives without it. What is left must still be in the message, width, case, spaces and
    punctuation aside (claim_key) -- a prefix or suffix of the AI's own is not a bracket, but it is not the message's either.
    The note field is where a remark may go, and it is not kept."""
    folded = normalise_quote(message)
    kept = _REMARK.sub(lambda found: found.group() if normalise_quote(found.group(1)) in folded else "", text)
    kept = " ".join(kept.split())
    return kept if claim_key(kept) and claim_key(kept) in claim_key(message) else ""


def _split_shape(answer: dict[str, Any]) -> dict[str, Any]:
    turn = _turn()
    claims, seen = [], set()
    for item in answer.get("claims") if isinstance(answer.get("claims"), list) else []:
        text = _own_words(_text(item.get("text"), 2000), turn["text"]) if isinstance(item, dict) else ""
        if text and item.get("sentence") in SENTENCE_KINDS and text not in seen:
            seen.add(text)
            claims.append({"text": text, "sentence": item["sentence"], "law": item.get("law") is True})
    if not claims:
        raise _invalid("the split has no claim of the four kinds in the message's own words")
    return {"message": turn["message"], "claims": claims[:MAX_CLAIMS]}


# -- techniques --------------------------------------------------------------------------------------------------------

TECHNIQUES_TEXT = (
    "Look for manipulation patterns in the message. Name a pattern only from the list given, and only with the exact words of the message "
    "that show it: quote is copied from the message exactly, at least 6 characters; why is one plain sentence on how those words do it. "
    "A pattern is not proof that the message is false -- true things are manipulated too -- so never say whether it is true. "
    "asks: what the message wants the reader to do, only from 轉傳 / 捐款 / 不投票 / 敵視某一群人 / 不信任身邊的人, each with the exact words that ask it "
    "(quote: copied from the message exactly, at least 6 characters, so take the words around a short call such as 「快轉傳」). "
    "Without evidence, never say who is behind the message, from which country or which organisation. If you find nothing, return empty lists."
)
TECHNIQUES_SCHEMA = {"type": "object", "properties": {
    "techniques": {"type": "array", "items": {"type": "object", "properties": {"name": {"type": "string", "enum": [item["name"] for item in TECHNIQUES.items]},
                                                                             "quote": {"type": "string"}, "why": {"type": "string"}}, "required": ["name", "quote", "why"]}},
    "asks": {"type": "array", "items": {"type": "object", "properties": {"what": {"type": "string", "enum": list(ASKS)}, "quote": {"type": "string"}}, "required": ["what", "quote"]}},
}, "required": ["techniques", "asks"]}


def _techniques_input(context: Mapping[str, Any], read: Read) -> str:
    message = _message(context, read)
    _TURN.set({"message": message["doc_id"], "text": message["content"]["text"]})
    patterns = "\n".join(f"{item['name']}: {item['looks_like']}" for item in TECHNIQUES.items)
    return f"The patterns (list version {TECHNIQUES.version}):\n{patterns}\n\nThe message is given below between the QUOTED markers."


def _from_message(quote: Any, text: str, what: str) -> str | None:
    """The message's own words, or ``None`` for a quote too short to show anything (that item alone is dropped); words
    that are not in the message refuse the whole answer (nothing is saved)."""
    if not isinstance(quote, str) or len(normalise_quote(quote)) < MIN_QUOTE:
        return None
    if not quote_in(quote, text):
        raise _invalid(f"the quote for {what} is not in the message")
    return quote.strip()[:500]


def _techniques_shape(answer: dict[str, Any]) -> dict[str, Any]:
    """找到一個手法，附上原文的哪一段."""
    turn = _turn()
    names = {item["name"] for item in TECHNIQUES.items}
    techniques, asks = [], []
    for item in answer.get("techniques") if isinstance(answer.get("techniques"), list) else []:
        if not isinstance(item, dict) or item.get("name") not in names:
            continue
        quote = _from_message(item.get("quote"), turn["text"], item["name"])
        entry = {"name": item["name"], "quote": quote, "why": _text(item.get("why"), 300)}
        if quote and entry not in techniques:
            techniques.append(entry)
    for item in answer.get("asks") if isinstance(answer.get("asks"), list) else []:
        if not isinstance(item, dict) or item.get("what") not in ASKS:
            continue
        quote = _from_message(item.get("quote"), turn["text"], item["what"])
        entry = {"what": item["what"], "quote": quote}
        if quote and entry not in asks:
            asks.append(entry)
    return {"message": turn["message"], "techniques": techniques[:12], "asks": asks[:6], "rules": TECHNIQUES.stamp()}


# -- read: what each source card says about each claim -----------------------------------------------------------------

READ = (
    "For each claim and each source given, say what the source says about the claim. reads_as is one of 支持 (the source says the claim "
    "holds), 反對 (it says the claim does not hold), 無關 (it is about something else), 看不出 (it touches the claim but you cannot tell). "
    "claim: the claim id given; card: the card id given with that source; citations: [that source's id]; quote: the source's exact words "
    "that show it -- required for 支持 and 反對, left out for 無關. A fact-check source (a 查核組織 or Cofacts) says who judged a claim like this one and what "
    "they judged: read its verdict, not words of the claim repeated in its grounds, which never support it. Never judge a claim yourself, never use what you remember, and never decide from which country a source is."
)
READ_SCHEMA = {"type": "object", "properties": {"readings": {"type": "array", "items": {"type": "object", "properties": {
    "claim": {"type": "string"}, "card": {"type": "string"}, "reads_as": {"type": "string", "enum": list(STANCES)}, "quote": {"type": "string"},
    "citations": {"type": "array", "items": {"type": "string"}}}, "required": ["claim", "card", "reads_as", "citations"]}}}, "required": ["readings"]}


def _read_input(context: Mapping[str, Any], read: Read) -> str:
    """A card only the person reads (``person_reads``: a fact-check hit or report) is never given to this turn: it
    repeats the claim it reviewed, so a quote of it could pass as support, and a review of another claim could pass as
    opposition. The gate gives every usable card unless the turn names them (context.cards), so with one in the case the
    cards must be named, without it."""
    claims = _claims(context, read, checkable_only=context.get("claims") is None)
    cards = read("gather.source")
    persons = {doc["doc_id"] for doc in cards if person_reads(doc["content"])}
    named = context.get("cards")
    if persons and (named is None or (isinstance(named, list) and any(isinstance(card, str) and card in persons for card in named))):
        raise InvariantViolation(FACTCHECK_NOT_FOR_AI)
    shas = {doc["doc_id"]: card_sha(doc) for doc in cards}
    _TURN.set({"claims": {doc["doc_id"]: doc["version"] for doc in claims}, "shas": {card: sha for card, sha in shas.items() if sha}})
    rows = [{"claim": doc["doc_id"], "text": doc["content"]["text"], "kind": doc["content"]["sentence"]} for doc in claims]
    return "The claims:\n" + json.dumps(rows, ensure_ascii=False)


def _read_shape(answer: dict[str, Any]) -> dict[str, Any]:
    """claim_version and snapshot come from the records, never from the model; the gate then checks each quote and card."""
    turn = _turn()
    readings, seen = [], set()
    for item in answer.get("readings") if isinstance(answer.get("readings"), list) else []:
        if not isinstance(item, dict):
            continue
        if item.get("claim") not in turn["claims"] or item.get("card") not in turn["shas"] or item.get("reads_as") not in STANCES:
            raise _invalid("a reading names a claim or a card this turn was not given, or reads it as something else than the four")
        if item["reads_as"] in STANCES[:2] and not (isinstance(item.get("quote"), str) and item["quote"].strip()):
            raise _invalid("a reading that supports or opposes a claim quotes the source")   # an unquoted 支持 cannot be checked against the page
        if (item["claim"], item["card"]) in seen:
            kept = next(entry for entry in readings if (entry["claim"], entry["card"]) == (item["claim"], item["card"]))
            if (kept["reads_as"], kept.get("quote")) != (item["reads_as"], item["quote"].strip()[:1000] if isinstance(item.get("quote"), str) and item["quote"].strip() else None):
                raise _invalid("one card is read two ways for one claim")   # which one the model meant is unknown: never the first or the last
            continue
        seen.add((item["claim"], item["card"]))
        entry = {"claim": item["claim"], "claim_version": turn["claims"][item["claim"]], "card": item["card"], "snapshot": turn["shas"][item["card"]],
                 "reads_as": item["reads_as"], "citations": item.get("citations")}
        if isinstance(item.get("quote"), str) and item["quote"].strip():
            entry["quote"] = item["quote"].strip()[:1000]
        readings.append(entry)
    if not readings:
        raise _invalid("no reading")
    return {"readings": readings}


# -- summary of the ledger ---------------------------------------------------------------------------------------------

SUMMARY = (
    "Summarise the claim ledger for the person in plain words: lines, one per claim (claim: its id; line: one sentence), then overview, at most "
    "three sentences. Say only what the ledger holds: a claim's state and how many independent origins support or oppose it. Never say whether "
    "a claim is true or false, what to believe, or whether to forward anything; add nothing the ledger does not hold. A 法律 claim marked "
    "law_unconfirmed: say its jurisdiction, time limit or source is not written yet, so it is not a settled conclusion."
)
SUMMARY_SCHEMA = {"type": "object", "properties": {"lines": {"type": "array", "items": {"type": "object", "properties": {"claim": {"type": "string"}, "line": {"type": "string"}},
                                                                                      "required": ["claim", "line"]}}, "overview": {"type": "string"}}, "required": ["lines"]}


def _ledger(context: Mapping[str, Any], read: Read) -> list[dict[str, Any]]:
    mine = {doc["doc_id"]: doc for doc in _claims(context, read)}
    return [line for line in read.evidence.claims() if line["claim_id"] in mine]   # type: ignore[attr-defined]


def _summary_handback(context: Mapping[str, Any], read: Read) -> str | None:
    """交還控制：一個主張的獨立出處不到兩個時，AI 停下來 -- unless the person chose to go on (context["go_on"])."""
    if context.get("go_on") is True:
        return None
    few = [line for line in _ledger(context, read) if line["few"]]
    if not few:
        return None
    counts = "、".join(f"{len(set(line['support']) | set(line['oppose']))} 個" for line in few)
    return f"有 {len(few)} 個主張的獨立出處不到 {MIN_ORIGINS} 個（各是 {counts}）。AI 先停下來，由你決定要不要照樣請它摘要。"


def _summary_input(context: Mapping[str, Any], read: Read) -> str:
    ledger = _ledger(context, read)
    claims = {doc["doc_id"]: doc["content"] for doc in read("verify.claim")}
    fixed = {}
    rows = []
    for line in ledger:
        support, oppose = len(line["support"]), len(line["oppose"])
        unconfirmed = law_unconfirmed(claims.get(line["claim_id"], {}))
        said = [NOT_CHECKABLE if line["state"] == NOT_CHECKABLE else weak_line(support, oppose) if line["few"] else "", LAW_UNCONFIRMED_LINE if unconfirmed else ""]
        if any(said):
            fixed[line["claim_id"]] = "；".join(part for part in said if part)
        rows.append({"claim": line["claim_id"], "text": line["text"], "kind": line["sentence"], "state": line["state"], "support": support, "oppose": oppose,
                     **({"law_unconfirmed": True} if unconfirmed else {})})
    _TURN.set({"versions": {line["claim_id"]: line["version"] for line in ledger}, "fixed": fixed, "states": {line["claim_id"]: line["state"] for line in ledger}})
    return "The claim ledger (counts of independent origins, made by the system):\n" + json.dumps(rows, ensure_ascii=False)


def _summary_shape(answer: dict[str, Any]) -> dict[str, Any]:
    """A claim under two origins, one that cannot be checked, or a 法律 claim without its 法域、時效、來源 gets fixed words
    whatever the model wrote. A claim given two different lines gets the ledger's own words: which one it meant is unknown."""
    turn = _turn()
    given = [(item["claim"], _text(item.get("line"), 300)) for item in answer.get("lines") or [] if isinstance(item, dict) and isinstance(item.get("claim"), str)]
    said = {claim: line for claim, line in given if len({other for named, other in given if named == claim}) == 1}
    lines = [{"claim": claim, "claim_version": version, "line": turn["fixed"].get(claim) or said.get(claim) or f"帳本上是「{turn['states'][claim]}」"}
             for claim, version in turn["versions"].items()]
    shaped = {"lines": lines, "overview": _text(answer.get("overview"), 1000)}
    return {key: value for key, value in shaped.items() if value not in ("", [])}


# -- what is still worth checking --------------------------------------------------------------------------------------

NEXT = (
    "Point out what is still worth checking about these claims, as at most 5 short items, and at most one question. Follow a fact-checker's "
    "order: who said it first, how others report it, the earliest original. Name kinds of records or places to look (an official notice, the "
    "original document, a local fact-checker, someone who was there) -- never a conclusion, never whether to believe or forward it, and never "
    "a source you remember."
)
NEXT_SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "maxItems": 5, "items": {"type": "string"}}, "question": {"type": "string"}}, "required": ["items"]}


def _next_input(context: Mapping[str, Any], read: Read) -> str:
    claims = _claims(context, read)
    ledger = {line["claim_id"]: line for line in read.evidence.claims()}   # type: ignore[attr-defined]
    rows = [{"text": doc["content"]["text"], "kind": doc["content"]["sentence"], "state": ledger.get(doc["doc_id"], {}).get("state"),
             **({"law_unconfirmed": True} if law_unconfirmed(doc["content"]) else {})} for doc in claims]
    return "The claims and where they stand:\n" + json.dumps(rows, ensure_ascii=False)


def _next_shape(answer: dict[str, Any]) -> dict[str, Any]:
    items = [_text(item, 200) for item in answer.get("items") or [] if _text(item, 200)][:5]
    if not items:
        raise _invalid("nothing named to check")
    question = _text(answer.get("question"), 300)
    question = question[:question.find("？") + 1] if "？" in question else question
    return {"items": items, **({"question": question} if question else {})}


ACTIONS = [
    AiAction(block="VERIFY", name="split", needs="organize", instructions=SPLIT, output_kind="verify.split", output_schema=SPLIT_SCHEMA,
             reads=("verify.message", "verify.first"), build_input=_split_input, shape=_split_shape, max_tokens=6000, quoted=_the_message, verbatim=("text",)),
    AiAction(block="VERIFY", name="techniques", needs="organize", instructions=TECHNIQUES_TEXT, output_kind="verify.techniques", output_schema=TECHNIQUES_SCHEMA,
             reads=("verify.message", "verify.first"), build_input=_techniques_input, shape=_techniques_shape, max_tokens=6000, quoted=_the_message),
    # reading the case's source cards and citing them is what 「找外部資料（只引用有來源卡的）」 grants (as GATHER's summaries)
    AiAction(block="VERIFY", name="read", needs="search_external", instructions=READ, output_kind="verify.reading", output_schema=READ_SCHEMA,
             reads=("verify.claim", "verify.first", "gather.source"), build_input=_read_input, shape=_read_shape, max_tokens=6000, cites=True),
    AiAction(block="VERIFY", name="summary", needs="organize", instructions=SUMMARY, output_kind="verify.summary", output_schema=SUMMARY_SCHEMA,
             reads=("verify.claim", "verify.first"), build_input=_summary_input, shape=_summary_shape, handback=_summary_handback),
    AiAction(block="VERIFY", name="next", needs="point_gaps", instructions=NEXT, output_kind="verify.next", output_schema=NEXT_SCHEMA,
             reads=("verify.claim", "verify.first"), build_input=_next_input, shape=_next_shape),
]
