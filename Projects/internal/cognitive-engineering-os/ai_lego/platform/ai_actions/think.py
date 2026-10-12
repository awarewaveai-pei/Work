"""THINK's AI turns (contract card 「AI 能做什麼」). Nine actions, one per role-and-mode the card names; every one asks for the
round first, and every one but ``direct_advice`` refuses a round with no version of the person's own (先想再看). It reads
only the round, the cards of the round and your reactions to them, the MAP's map (else SENSE's cards): never another case, never a judgment.

What the AI saves is its own kind: ``think.reply`` (sections, one question) or ``think.batch`` (cards). A reply is always
「它自己說的」. A card is 「有來源」 only when it names (``rests_on``) a claim from VERIFY's ledger that counted origins support:
``shape`` decides from the ledger it was shown, whatever the model says (有查證時，這一步也讀 VERIFY 的主張帳本)."""

from __future__ import annotations

import json
import unicodedata
from contextvars import ContextVar
from typing import Any, Callable, Mapping

from ai_lego.core.domain.evidence_words import CHECKABLE, CLAIM_STATES
from ai_lego.core.domain.kinds.think import ACTION_FACETS, COUNTER_ANGLES, DIVERGE_METHODS, OWN_TYPES, SOURCED
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_gate import MIN_MAX_TOKENS, AiAction
from ai_lego.platform.evidence import not_usable_because

Read = Callable[[str], list[dict[str, Any]]]
READS = ("think.round", "think.card", "think.reaction", "map.map", "sense.card", "verify.claim")
CARD_TEXT = ("claim", "mechanism", "benefit", "risk", "assumption", "premise", "fails_when")
CARD_CHARS = 160    # 15 cards x 7 fields x 160 characters stays under the 64KB a json field holds

# shape() gets only the model's answer, but the saved document must name its round: build_input, in the same call and thread,
# leaves it here. ask_ai always runs build_input first, so a turn that reaches shape has set it.
_ROUND: ContextVar[str | None] = ContextVar("think_round", default=None)
# the checked claims this turn was shown, numbered from 1 (shape reads which ones a card may rest on); set with _ROUND
_CLAIMS: ContextVar[list[dict[str, Any]]] = ContextVar("think_claims", default=[])
# what the person wrote that this turn was shown (the problem, their own version, criteria, reflection, their cards and reasons): the one question must not be these words again
_SAID: ContextVar[list[str]] = ContextVar("think_said", default=[])


def _strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    return [text for item in value for text in _strings(item)] if isinstance(value, list) else []


def own_text(item: str) -> str:
    """What the person wrote after the type label (「觀察：」 is the label, not their words)."""
    for label in OWN_TYPES:
        if item.startswith(f"{label}："):
            return item[len(label) + 1:].strip()
    return item


def own_texts(content: Mapping[str, Any]) -> list[str]:
    """The items of the person's own version with something written after the type label (「觀察：」 alone is nothing)."""
    found = []
    for item in content.get("own") or []:
        text = item.strip()
        for label in OWN_TYPES:
            if text.startswith(f"{label}："):
                text = text[len(label) + 1:].strip()
                break
        if text:
            found.append(item.strip())
    return found


def _round(context: Mapping[str, Any], read: Read, *, need_own: bool) -> dict[str, Any]:
    round_id = context.get("round")
    found = next((doc for doc in read("think.round") if doc["doc_id"] == round_id), None) if isinstance(round_id, str) else None
    if found is None:
        raise InvariantViolation("THINK_ROUND_REQUIRED: 先寫下這一輪的問題，再請 AI 幫忙。")
    if need_own and not own_texts(found["content"]):
        raise InvariantViolation("THINK_OWN_VERSION_REQUIRED: 先寫下你自己的版本（至少一項），AI 才會回。")
    _ROUND.set(found["doc_id"])
    return found


def _map(read: Read) -> dict[str, Any] | None:
    maps = read("map.map")
    if not maps:
        return None
    content = maps[-1]["content"]
    layers = content.get("layers") if isinstance(content.get("layers"), dict) else {}
    compact: dict[str, Any] = {}
    for name, items in layers.items():
        if not isinstance(items, list):
            continue
        texts = []
        for item in items[:10]:
            text = item.get("text") if isinstance(item, dict) else item
            if isinstance(text, str) and text.strip():
                texts.append(text.strip()[:200] + (" [the person's own words; no outside source]" if isinstance(item, dict) and item.get("self_said") else ""))
        if texts:
            compact[name] = texts
    raw_claims = content.get("claims") if isinstance(content.get("claims"), list) else []
    claims = [{"text": item["text"][:200], "kind": item.get("kind")} for item in raw_claims[:10] if isinstance(item, dict) and isinstance(item.get("text"), str)]
    shown = {"layers": compact, **({"claims": claims} if claims else {}), **({"core_conflict (the person's own)": content["core_conflict"][:500]} if content.get("core_conflict") else {}),
             **({"person_marked_unwinnable": True} if content.get("unwinnable") else {})}
    return shown if compact or claims else None


def _cards(read: Read, round_id: str, *, picked_only: bool) -> list[dict[str, Any]]:
    """The person's side of the round's cards: the ones they wrote, or the ones they picked (a pick is their reaction's), with their reaction and reason."""
    reactions = {doc["content"]["card"]: doc["content"] for doc in read("think.reaction")}
    rows = []
    for doc in read("think.card"):
        content, reaction = doc["content"], reactions.get(doc["doc_id"], {})
        if content.get("round") != round_id or not (reaction.get("picked") if picked_only else doc["author"] == "user"):
            continue
        by = {"user": "the person", "joint": "an AI card the person rewrote"}.get(doc["author"], "an AI card the person kept as it was")
        rows.append({"by": by, **{key: content[key] for key in CARD_TEXT[:5] if content.get(key)}, **{key: reaction[key] for key in ("reaction", "reason") if reaction.get(key)}})
    return rows[:15]


def _message(context: Mapping[str, Any], read: Read, *, need_own: bool = True, cards: str = "own", target: bool = False, extra: Mapping[str, Any] | None = None) -> str:
    doc = _round(context, read, need_own=need_own)
    content = doc["content"]
    own = own_texts(content)
    payload: dict[str, Any] = {"problem": content["problem"], "own_version": own}
    index = context.get("target")
    if target and isinstance(index, int) and not isinstance(index, bool) and 0 <= index < len(own):   # 反方 aims at the item the person marked as their strongest
        payload["strongest_argument"] = own[index]
    if content.get("criteria"):
        payload["criteria_so_far"] = content["criteria"]
    shown = _map(read)
    if shown:
        payload["map"] = shown
    else:
        sense = [{"category": item["content"].get("category"), "text": str(item["content"].get("text", ""))[:200]} for item in read("sense.card")[:20]]
        if sense:
            payload["sense_cards"] = sense
    checked = [claim for claim in read.evidence.claims() if claim["sentence"] == CHECKABLE and claim["state"] in CLAIM_STATES]
    _CLAIMS.set(checked)
    if checked:   # a verdict on an older version is no verdict; why a claim cannot stand as a fact is said as it is, never left to the model
        payload["checked_claims"] = [_claim_row(n, claim) for n, claim in enumerate(checked, start=1)]
    rows = _cards(read, doc["doc_id"], picked_only=cards == "picked")
    if rows:
        payload["cards_the_person_wrote" if cards == "own" else "cards_the_person_picked"] = rows
    if cards == "picked" and content.get("reflection"):
        payload["their_reflection"] = content["reflection"]
    payload.update(extra or {})
    _SAID.set([content["problem"], *[own_text(item) for item in own], *_strings(payload.get("criteria_so_far")), *_strings(payload.get("their_reflection")),
               *[words for row in rows for name, value in row.items() if name != "by" for words in _strings(value)]])
    return "This round, in the person's own words:\n" + json.dumps(payload, ensure_ascii=False)


def _text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _cut(value: Any, limit: int, ends: str, dot: bool = False) -> str:
    """The text up to its first end mark that is outside quotes and brackets; a quote or bracket that never closes does not
    hide the marks, so the first mark anywhere ends it. No mark: the text as it is."""
    text, depth, first = _text(value, limit), 0, None
    for index, char in enumerate(text):
        depth += (char in "「『（(“") - (char in "」』）)”")
        mark = char in ends or (dot and char == "." and (index + 1 == len(text) or text[index + 1].isspace()))   # "3.5" is not the end of a sentence
        if mark and depth <= 0:
            return text[:index + 1]
        if mark and first is None:
            first = index
    return text[:first + 1] if first is not None and depth > 0 else text


def _one_question(value: Any, limit: int) -> str:
    """一次只問一題: what follows the first question would be a second one."""
    return _cut(value, limit, "？?")


def _flat(text: str) -> str:
    folded = unicodedata.normalize("NFKC", text).casefold()
    return "".join(char for char in folded if not unicodedata.category(char).startswith(("P", "Z", "S")))


def echoes(question: str, said: list[str]) -> bool:
    """The question is the person's own words again: what they wrote (or a part of it), or what they wrote with a few words
    around it. Width, case, spaces and punctuation do not make it another question."""
    asked = _flat(question)
    for text in map(_flat, said):
        if len(asked) >= 4 and len(text) >= 4 and (asked in text or (text in asked and len(asked) - len(text) <= 6)):
            return True
    return False


def _asked(value: Any, limit: int) -> tuple[str, bool]:
    """(the one question, whether it was cut for repeating the person's own words): a question that only gives the person's
    words back asks nothing new, so it is not kept."""
    question = _one_question(value, limit)
    return ("", True) if question and echoes(question, _SAID.get()) else (question, False)


def _one_sentence(value: Any, limit: int) -> str:
    """A hand-back is one plain sentence saying why (交還控制), not a second place to put questions or advice."""
    return _cut(value, limit, "。！？!?", dot=True)


def _invalid(why: str) -> InvariantViolation:
    return InvariantViolation(f"AI_ANSWER_INVALID: {why}")


def _round_id() -> str:
    found = _ROUND.get()
    if found is None:
        raise _invalid("the answer has no round to belong to")
    _ROUND.set(None)
    return found


COMMON = (
    "The person wrote their own version first; it is the centre of this round and yours is only help. Never decide for them, never "
    "state their conclusion, never rank or pick among their options, never use anything personal they wrote to persuade them. "
    "Your only sources are the checked_claims the message lists, if any (the person checked them); everything else you say is your own, "
    "so never cite a study, a statistic, a law or an expert. A card resting on a checked claim gives its number as rests_on (leave rests_on out otherwise); never "
    "present a claim the person did not trust as fact. "
    "Never ask more than one question, and never ask the person's own question or any sentence they wrote again: a question says something new."
)
# a role that gives advice stops when it cannot responsibly advise; a role that only reflects or points out has no advice to hold back
HANDBACK = (
    "If you lack the information, the question is outside what you can responsibly help with, or the risk is high (health, law, money, "
    "safety), do not advise: set handback to one plain sentence saying why, and ask one question instead."
)
REFLECT = (
    "You give no advice, so there is nothing to hand back: always give your reflection, whatever the matter is (law, health, money and safety included). "
    "If the matter needs a professional, say that in caution, one plain sentence beside the reflection and never instead of it."
)
REFLECTS = ("mirror", "audit", "look_back")   # they add a caution; they never hand control back

SECTION_TITLES = {
    "mirror": ("事實", "情緒", "推論", "沒說出的假設", "空白"),
    "audit": ("已知", "推論", "猜測", "價值偏好", "缺口", "事實", "法律", "價值", "文化宗教"),
    "criteria": ("判準", "權衡", "可逆的小試驗", "停止條件", "檢查你的選擇"),
    "look_back": ("思考強項", "下次練習點", "過早閉合", "信心偏差"),
}
SECTION_LIMITS = {"思考強項": 2, "下次練習點": 1, "過早閉合": 2, "信心偏差": 2, "檢查你的選擇": 3, "判準": 6}


def _sections(raw: Any, titles: tuple[str, ...]) -> list[dict[str, Any]]:
    """Only the card's own section titles, in the card's order, each with a bounded list of plain texts."""
    found: dict[str, list[str]] = {}
    for section in raw if isinstance(raw, list) else []:
        if isinstance(section, dict) and section.get("title") in titles and section["title"] not in found and isinstance(section.get("items"), list):
            items = [_text(item, 300) for item in section["items"]]
            found[section["title"]] = [item for item in items if item][:SECTION_LIMITS.get(section["title"], 8)]
    return [{"title": title, "items": found[title]} for title in titles if found.get(title)]


def _reply_shape(action: str) -> Callable[[dict[str, Any]], dict[str, Any]]:
    role = ACTION_FACETS[action][0]
    titles = SECTION_TITLES.get(action, ())

    def shape(answer: dict[str, Any]) -> dict[str, Any]:
        round_id = _round_id()
        sections, (question, echoed) = _sections(answer.get("sections"), titles), _asked(answer.get("question"), 300)
        handback = "" if action in REFLECTS else _one_sentence(answer.get("handback"), 200)
        _CLAIMS.set([])   # a reply rests on no claim; what this turn was shown ends with it
        shaped = {"round": round_id, "action": action, "role": role, "sections": sections, "question": question, "handback": handback, "sourced": SOURCED[1]}
        if action in REFLECTS:
            shaped["caution"] = _one_sentence(answer.get("caution"), 300)
        if action == "criteria":
            shaped.update(premise=_text(answer.get("premise"), 1000), fails_when=_text(answer.get("fails_when"), 1000))
        if handback:
            shaped.update(sections=[], premise="", fails_when="")   # 交還控制: no advice, one question instead
            if not question:
                raise _invalid("a hand-back comes with the one question that replaces the advice" + (" (the question repeated the person's own words)" if echoed else ""))
        elif not titles:
            if not question:
                raise _invalid("this role only asks: one question" + (" (the question repeated the person's own words)" if echoed else ""))
        elif not sections:
            raise _invalid("the answer has none of this role's sections")
        elif action == "criteria" and not (shaped["premise"] and shaped["fails_when"]):
            raise _invalid("advice comes with its premise and how it may fail")
        return {key: value for key, value in shaped.items() if value not in ([], None, "")}
    return shape


def _card_list(raw: Any, *, methods: tuple[str, ...], required: tuple[str, ...]) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """The cards kept, each with the model's own item it came from (so a card's rests_on is read from that item only)."""
    cards: list[tuple[dict[str, Any], dict[str, Any]]] = []
    seen: set[str] = set()
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        card = {field: _text(item.get(field), CARD_CHARS) for field in CARD_TEXT}
        card["method"] = item.get("method") if item.get("method") in methods else ""
        if any(not card[field] for field in required) or card["claim"] in seen:
            continue
        seen.add(card["claim"])
        cards.append(({key: value for key, value in card.items() if value}, item))
    return cards


# action -> (the methods a card names, the cards a turn gives at least / at most, the different methods it uses at least, the fields every card has)
BATCHES = {
    "diverge": (DIVERGE_METHODS, 8, 15, 4, ("claim", "mechanism", "benefit", "risk", "assumption", "method")),
    "counter": (COUNTER_ANGLES, 1, 5, 1, ("claim", "mechanism", "benefit", "risk", "assumption", "method")),
    "direct_advice": ((), 1, 3, 0, ("claim", "mechanism", "benefit", "risk", "assumption", "premise", "fails_when")),
}


_NOT_USABLE_NOTE = {
    "no_verdict": "the person has not judged this claim yet: do not state it as fact",
    "earlier": "the person judged an older wording of this claim: do not state it as fact",
    "not_trusted": "the person does not trust this claim: never state it as fact",
    "no_support": "no counted independent origin supports this claim: do not state it as fact",
}


def _claim_row(n: int, claim: Mapping[str, Any]) -> dict[str, Any]:
    row: dict[str, Any] = {"n": n, "text": claim["text"][:200], "state": claim["state"], "origins_for": len(claim["support"]), "origins_against": len(claim["oppose"])}
    if claim["verdict"] and not claim["verdict"]["earlier"]:
        row["the_persons_verdict"] = claim["verdict"]["verdict"]
    why = not_usable_because(claim)
    if why:
        row["note"] = _NOT_USABLE_NOTE[why]
    return row


def _batch_shape(action: str) -> Callable[[dict[str, Any]], dict[str, Any]]:
    methods, least, most, least_methods, required = BATCHES[action]
    role = ACTION_FACETS[action][0]

    def shape(answer: dict[str, Any]) -> dict[str, Any]:
        round_id = _round_id()
        (question, echoed), handback = _asked(answer.get("question"), 300), _one_sentence(answer.get("handback"), 200)
        cards = [] if handback else [_sourced(card, raw) for card, raw in _card_list(answer.get("cards"), methods=methods, required=required)[:most]]
        _CLAIMS.set([])   # what this turn was shown ends with it
        if handback and not question:
            raise _invalid("a hand-back comes with the one question that replaces the advice" + (" (the question repeated the person's own words)" if echoed else ""))
        if not handback and (len(cards) < least or len({card.get("method") for card in cards}) < least_methods):
            raise _invalid(f"{action} needs at least {least} cards using at least {least_methods} different methods; got {len(cards)}")
        every = cards and all(card.get("sourced") == SOURCED[0] for card in cards)
        shaped = {"round": round_id, "action": action, "role": role, "cards": cards, "question": question, "handback": handback, "sourced": SOURCED[0] if every else SOURCED[1]}
        return {key: value for key, value in shaped.items() if value not in ([], None, "")}
    return shape


def _sourced(card: dict[str, Any], raw: Mapping[str, Any]) -> dict[str, Any]:
    """有來源 only for a card resting on a claim of this turn's ledger that may stand as a fact (evidence.usable_as_fact);
    else 它自己說的."""
    shown = _CLAIMS.get()
    n = raw.get("rests_on")
    claim = shown[n - 1] if isinstance(n, int) and not isinstance(n, bool) and 1 <= n <= len(shown) else None
    if claim and claim["usable"]:
        return {**card, "sourced": SOURCED[0], "rests_on": claim["claim_id"]}
    return {**card, "sourced": SOURCED[1]}


def _reply_schema(titles: tuple[str, ...], *, advice: bool = False, reflect: bool = False) -> dict[str, Any]:
    properties: dict[str, Any] = {"question": {"type": "string"}, **({"caution": {"type": "string"}} if reflect else {"handback": {"type": "string"}})}
    if titles:
        properties["sections"] = {"type": "array", "items": {"type": "object", "properties": {"title": {"type": "string", "enum": list(titles)}, "items": {"type": "array", "items": {"type": "string"}}}, "required": ["title", "items"]}}
    if advice:
        properties.update({"premise": {"type": "string"}, "fails_when": {"type": "string"}})
    return {"type": "object", "properties": properties}


def _batch_schema(methods: tuple[str, ...], *, advice: bool = False) -> dict[str, Any]:
    card: dict[str, Any] = {name: {"type": "string"} for name in ("claim", "mechanism", "benefit", "risk", "assumption")}
    optional = {"rests_on": {"type": "integer"}}   # the number of a checked claim the card rests on; left out when it rests on none
    if methods:
        card["method"] = {"type": "string", "enum": list(methods)}
    if advice:
        card.update(premise={"type": "string"}, fails_when={"type": "string"})
    return {"type": "object", "properties": {"cards": {"type": "array", "items": {"type": "object", "properties": {**card, **optional}, "required": list(card)}}, "question": {"type": "string"}, "handback": {"type": "string"}}}


FOCUS = {
    "checkable": "Turn the person's hunches into statements that can be checked: sort what they wrote into the sections 已知 / 推論 / 猜測 / 價值偏好 / 缺口.",
    "separate": "Separate what they wrote into the sections 事實 / 法律 / 價值 / 文化宗教. Say nothing about what any law says: for a legal point name only which place, which time and which source it needs, and that a lawyer or the source must confirm.",
}


def _audit_input(context: Mapping[str, Any], read: Read) -> str:
    focus = context.get("focus") if context.get("focus") in FOCUS else "checkable"
    return _message(context, read, extra={"focus": FOCUS[focus]})


ROLE_TEXT = {
    "mirror": "You are the Mirror: give back what the person wrote without evaluating it. The person confirms, rewrites or rejects it.",
    "diverge": "You are the Divergent Partner: widen the field. The person picks which directions have value and says why.",
    "counter": "You are the Red Team: give the strongest counter. The person answers: revise, maintain, or pause their conclusion.",
    "audit": "You are the Evidence Auditor: tell what is known from what is inferred, guessed, valued or missing. The person decides which unknowns are worth checking.",
    "socratic": "You are the Socratic Guide: ask. The person defines the problem themselves.",
    "ask_conclusion": "You are the Decision Coach and you only ask. The person has asked to reach their own conclusion now.",
    "criteria": "You are the Decision Coach: help build the criteria and check the choice. The person chooses and carries it.",
    "look_back": "You are the Meta-Learning Coach: look at how the person thought. The person writes down which habit to keep or change.",
    "direct_advice": "You are the Decision Coach. The person explicitly asked for direct advice; the decision stays theirs.",
}
TASKS = {
    "mirror": (
        "Sections, with exactly these titles, in this order, leaving out an empty one: 事實 (what they state as having happened), 情緒 (feelings they name or show), "
        "推論 (what they conclude from the facts), 沒說出的假設 (what their words rest on but do not say), 空白 (what their version leaves empty). Keep their words; add nothing they "
        "did not write; no praise, no criticism, no explaining their motives. question: at most one."),
    "diverge": (
        "Give 8 to 15 genuinely different directions: different mechanisms, never rewordings of one idea. Each is a card: claim (the direction, one sentence), mechanism (how it would "
        "work), benefit (what it could give), risk (what could go wrong), assumption (the first thing to verify), method (exactly one of 替代假設 / 反向思考 / 視角切換 / 限制重設 / "
        "類比遷移 / 第二序後果: the move that produced it). Use at least four different methods across the cards. Do not say which direction is best and do not order them."),
    "counter": (
        "Aim at the person's strongest argument (strongest_argument if given, else the one they sound most sure of). Give 1 to 5 cards, each the strongest form of a counterexample, "
        "an opposing incentive, a second-order consequence, a failure mode or a boundary condition. Card fields: claim (the counter), mechanism (why it could hold), benefit (what the "
        "person gains by taking it seriously), risk (what happens if it is ignored), assumption (what would have to be true for it to hold), method (one of 反例 / 相反誘因 / "
        "第二序後果 / 失敗模式 / 邊界條件 / 最強反論). Do not say who is right and never tell them to change their mind."),
    "audit": "Use only the sections named by the focus below, with exactly those titles. List unknowns that matter under 缺口 without saying which is most worth checking; the person decides.",
    "socratic": "Ask the one question that would most change how the person defines the problem. Only the question: no preface, no answer, no advice, no list.",
    "ask_conclusion": "Ask the one question that makes them state, in their own words, what they conclude and what would change it. Do not suggest a conclusion.",
    "criteria": (
        "Help them build criteria for choosing among what is on the table (the cards they picked, if any). Sections, exactly these titles: 判準 (3 to 6 candidate criteria, each as a "
        "question they can ask of any option), 權衡 (what pulls against what), 可逆的小試驗 (cheap ways to test, each one reversible), 停止條件 (signs to stop or hand back), 檢查你的選擇 "
        "(only if they picked cards: at most three observations on whether their choice is clear, reversible and can be revisited). premise: when this help applies; fails_when: how it "
        "may fail. Do not apply the criteria to the options, do not rank, do not choose."),
    "look_back": (
        "Look at how they thought in this round: their own version, what they marked on cards and why, what they picked and why, their reflection. Sections, exactly these titles: "
        "思考強項 (two, each citing what they did), 下次練習點 (one), and only if clearly visible in their own words 過早閉合 and 信心偏差. Not a score, not a diagnosis, never a "
        "comparison with other people."),
    "direct_advice": (
        "Give 1 to 3 pieces of advice, each a card: claim (the advice), mechanism (why it should work), benefit, risk, assumption (what must be true), premise (the conditions under which "
        "it applies), fails_when (how it may fail). Never present it as the answer."),
}


def _action(name: str, needs: str, build_input: Callable[[Mapping[str, Any], Read], str], max_tokens: int = MIN_MAX_TOKENS) -> AiAction:
    if name in BATCHES:
        kind, schema, shape = "think.batch", _batch_schema(BATCHES[name][0], advice=name == "direct_advice"), _batch_shape(name)
    else:
        kind, schema, shape = "think.reply", _reply_schema(SECTION_TITLES.get(name, ()), advice=name == "criteria", reflect=name in REFLECTS), _reply_shape(name)
    return AiAction(block="THINK", name=name, needs=needs, instructions=f"{ROLE_TEXT[name]}\n{COMMON} {REFLECT if name in REFLECTS else HANDBACK}\n{TASKS[name]}", output_kind=kind, output_schema=schema,
                    reads=READS, build_input=build_input, shape=shape, max_tokens=max_tokens)


ACTIONS = [
    _action("mirror", "organize", lambda context, read: _message(context, read)),
    _action("diverge", "propose_options", lambda context, read: _message(context, read), 6000),   # a batch of cards
    _action("counter", "counter", lambda context, read: _message(context, read, target=True), 6000),
    _action("audit", "organize", _audit_input),
    _action("socratic", "ask", lambda context, read: _message(context, read)),
    _action("ask_conclusion", "ask", lambda context, read: _message(context, read)),
    _action("criteria", "propose_options", lambda context, read: _message(context, read, cards="picked")),
    _action("look_back", "organize", lambda context, read: _message(context, read, cards="picked")),
    # 除非你明確選「直接給建議」: the one turn that does not wait for the person's own version -- the problem is still theirs
    _action("direct_advice", "direct_advice", lambda context, read: _message(context, read, need_own=False), 6000),
]
