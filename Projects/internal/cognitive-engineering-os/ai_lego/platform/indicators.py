"""The ten process indicators (docs/platform/STEP34_SHARED_RULES.md §14; card 70; the COLLAB card's 「公共決策怎麼量」): for
one case or one group, which of ten things are present, with pointers to the records that show them. They measure how a
judgment was made, never what anyone believes: nothing here reads what a record says, only that it exists, which record
it points at and whether a field holds words. A presence fact, not a grade -- the only numbers are the two counts of
``claims_with_source_share``, and no result is added up, compared or put in an order.

Each function takes ``records`` and nothing else (no identity, so no one is set against anyone): kind -> the current
documents of that kind, each with ``owner`` (``stamped``), read by the caller through its own allowed path -- a case after
its owner check, a group through platform/visibility.py ``visible`` (so a round a member has not unlocked is not in it).
A function returns ``{"present": bool, "evidence": [{"kind", "doc_id", "owner"}]}``; an evidence pointer names a record
that exists in ``records``.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Sequence

from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.evidence_words import CHECKABLE, SENTENCE_KINDS
from ai_lego.core.domain.kinds.assembler import PACKAGES
from ai_lego.core.domain.kinds.collab import VERDICTS as RESTATEMENT_VERDICTS
from ai_lego.core.domain.kinds.decide import wont_change
from ai_lego.core.domain.kinds.think import OWN_TYPES

CASE, GROUP = "case", "group"
# Read-only views the caller builds from several records (not stored kinds): the claim ledger (evidence.checked_claims,
# a line per verify.claim) and every assembler.proposal.<block> together.
LEDGER, PROPOSALS = "claim_ledger", "assembler.proposals"
DERIVED = (LEDGER, PROPOSALS)
VALUE_SENTENCE = SENTENCE_KINDS[2]   # 價值判斷

Records = Mapping[str, Sequence[Mapping[str, Any]]]
Result = dict[str, Any]


def owner_label(scope: str, owner_id: str) -> str:
    return f"{scope}:{owner_id}"


def stamped(owner: str, docs: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """The documents of one owner as the indicators take them: each tells its owner, so a pointer says where to read it."""
    return [{**doc, "owner": owner} for doc in docs]


def stamped_ledger(owner: str, lines: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """The claim ledger's lines, each pointing at its ``verify.claim``."""
    return [{**line, "kind": "verify.claim", "doc_id": line["claim_id"], "owner": owner} for line in lines]


def _kind(records: Records, kind: str) -> list[Mapping[str, Any]]:
    found = records.get(kind)
    return [] if found is None else list(found)


def _written(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _items(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _own_written(content: Mapping[str, Any], label: str) -> bool:
    """THINK keeps a person's own item as 「<label>：<what they wrote>」: this label, with something after it."""
    return any(isinstance(item, str) and item.startswith(f"{label}：") and _written(item[len(label) + 1:]) for item in _items(content.get("own")))


def _present(found: Iterable[Mapping[str, Any]]) -> Result:
    pointers: list[dict[str, str]] = []
    for doc in found:
        pointer = {"kind": doc["kind"], "doc_id": doc["doc_id"], "owner": doc["owner"]}
        if pointer not in pointers:
            pointers.append(pointer)
    return {"present": bool(pointers), "evidence": pointers}


def dissent_kept(records: Records) -> Result:
    """Reads ``collab.dissent`` (the system writes one for every version of a stance that said 異議, in the same save, and
    never deletes it) and ``collab.stance`` (only to know which of them the reader may read: a stance is blind by option).
    Present when a kept dissent names a stance the reader may read. A dissent is made when an objection is saved and
    cannot be removed by a later vote or a later change of mind, so one that resolves is an objection that was kept."""
    readable = {doc["doc_id"] for doc in _kind(records, "collab.stance")}
    return _present(doc for doc in _kind(records, "collab.dissent") if doc["content"].get("stance_id") in readable)


def reopen_condition_written(records: Records) -> Result:
    """Reads ``collab.closing``. Present when a closing's ``reopen_if`` holds words: the group wrote, at the moment it
    ended the discussion, under what condition it opens again (all four fields of a closing are required)."""
    return _present(doc for doc in _kind(records, "collab.closing") if _written(doc["content"].get("reopen_if")))


# (the decision, the review of it): a group's closing and review; a case's judgment and calibration.
DECISION_THEN_REVIEW = (("collab.closing", "collab.review"), ("decide.judgment", "learn.calibration"))


def review_held_after_decision(records: Records) -> Result:
    """Reads ``collab.closing`` and ``collab.review`` (a group), or ``decide.judgment`` and ``learn.calibration`` (a
    case). Present when a review was first written later than a decision was: both are the person's or the group's own
    records with the time they were first saved, so a review that exists after the decision is one that was held."""
    found: list[Mapping[str, Any]] = []
    for decision_kind, review_kind in DECISION_THEN_REVIEW:
        reviews = sorted(_kind(records, review_kind), key=lambda doc: doc["created_at"])
        for decision in sorted(_kind(records, decision_kind), key=lambda doc: doc["created_at"]):
            after = next((review for review in reviews if review["created_at"] > decision["created_at"]), None)
            if after is not None:
                found += [decision, after]
                break
    return _present(found)


def positions_restated_correctly(records: Records) -> Result:
    """Reads ``collab.restatement`` (the AI's restatement of one member's position; a reader has it only once its subject
    confirmed it, or when it is their own) and ``collab.confirm`` (the subject's answer to it). Present when a restatement
    has an answer, written by the person it is about, that says 說得對: the only judge of whether a position was put right
    is the person who holds it."""
    restated = {doc["doc_id"]: doc for doc in _kind(records, "collab.restatement")}
    found: list[Mapping[str, Any]] = []
    for answer in _kind(records, "collab.confirm"):
        about = restated.get(answer["content"].get("restatement"))
        if about is not None and answer.get("written_by") is not None and answer["written_by"] == about.get("written_by") \
                and answer["content"].get("verdict") == RESTATEMENT_VERDICTS[0]:
            found += [about, answer]
    return _present(found)


def claims_with_source_share(records: Records) -> Result:
    """Reads the claim ledger (``evidence.checked_claims``: a line for each ``verify.claim``, its sources already counted
    by the one counting rule). ``claims``: the lines; ``with_source``: those with at least one counted source speaking to
    them, for or against. The two counts are facts and are not divided. Present when at least one claim has a source; the
    evidence is those claims. A source against a claim counts like one for it, and whether the person trusts the claim is not read."""
    ledger = _kind(records, LEDGER)
    sourced = [line for line in ledger if line.get("support") or line.get("oppose")]
    return {**_present(sourced), "with_source": len(sourced), "claims": len(ledger)}


def facts_law_values_separate(records: Records) -> Result:
    """Reads the claim ledger. Present when it holds all three: a claim of fact (a checkable sentence not marked as law), a
    claim of law (marked 法律) and a claim of value (a 價值判斷 sentence). The person marks each claim's kind when they
    confirm it, so all three in one ledger is the three kept apart; the evidence is those claims."""
    ledger = _kind(records, LEDGER)
    facts = [line for line in ledger if line.get("sentence") == CHECKABLE and not line.get("law")]
    law = [line for line in ledger if line.get("law")]
    values = [line for line in ledger if line.get("sentence") == VALUE_SENTENCE]
    return _present(facts + law + values if facts and law and values else [])


def assumptions_stated(records: Records) -> Result:
    """Reads ``decide.judgment`` (the judgment card's 假設 field), ``map.map`` (its 假設 list, items the person wrote or
    edited) and ``think.round`` (the person's own items labelled 假設或替代解釋). Present when the person wrote an assumption
    of their own in any of them; an assumption only the AI proposed does not count."""
    found = [doc for doc in _kind(records, "decide.judgment") if _written(doc["content"].get("assumptions"))]
    found += [doc for doc in _kind(records, "map.map") if any(isinstance(item, Mapping) and item.get("by") in ("user", "joint") and _written(item.get("text"))
                                                              for item in _items(doc["content"].get("assumptions")))]
    found += [doc for doc in _kind(records, "think.round") if _own_written(doc["content"], OWN_TYPES[1])]
    return _present(found)


def evidence_conditions_stated(records: Records) -> Result:
    """Reads ``decide.judgment`` (「什麼證據或事件會改變結論」) and ``think.round`` (the person's own items labelled 會改變判斷的
    證據條件). Present when the person wrote a condition; an answer that says nothing would change it (「沒有」, which the
    card accepts and marks) is not a condition."""
    found = [doc for doc in _kind(records, "decide.judgment")
             if _written(doc["content"].get("change_condition")) and not wont_change(doc["content"]["change_condition"])]
    found += [doc for doc in _kind(records, "think.round") if _own_written(doc["content"], OWN_TYPES[3])]
    return _present(found)


# (the person's answer, the field of it that points at the AI's record, that AI kind, the field holding the person's own reason)
AI_ANSWERS = (
    ("verify.stance", "reading", "verify.reading", "reason"),   # a source read differently from the AI's reading says why (kinds/verify.py)
    ("think.reaction", "card", "think.card", "reason"),          # a reaction to a card the AI laid out
)


def ai_trust_calibrated(records: Records) -> Result:
    """Reads ``verify.stance`` with ``verify.reading``, and ``think.reaction`` with ``think.card``. Present when the person
    answered a record the AI wrote (or drafted) and wrote their own reason with the answer. The answer is the person's own
    record pointing at the AI's, so a reason beside it is trust accepted or withdrawn on purpose; whether they agreed with
    the AI is not read."""
    found: list[Mapping[str, Any]] = []
    for answer_kind, pointer, ai_kind, reason in AI_ANSWERS:
        by_ai = {doc["doc_id"]: doc for doc in _kind(records, ai_kind) if doc.get("author") in ("ai", "joint")}
        for answer in _kind(records, answer_kind):
            target = by_ai.get(answer["content"].get(pointer))
            if target is not None and _written(answer["content"].get(reason)):
                found += [answer, target]
    return _present(found)


def modules_chosen_adjusted_or_off_with_reason(records: Records) -> Result:
    """Reads ``assembler.intake`` (the purpose the person chose and the blocks they left), ``assembler.answer`` (their answer
    to a block's proposal) and the proposals (``assembler.proposal.<block>``, each with the proposing block's own reason).
    Present when the person's blocks differ from their purpose's recommended package (reordered, added or switched off) or
    when they answered a proposal to add a block. The reason on record is the purpose the intake requires and the
    proposal's own 「為什麼」; no record holds the person's own words for it (the intake page and the answer have no such field)."""
    found: list[Mapping[str, Any]] = []
    for intake in _kind(records, "assembler.intake"):
        content = intake["content"]
        recommended, chosen = PACKAGES.get(content.get("package")), content.get("blocks")
        if recommended is not None and isinstance(chosen, list) and _written(content.get("purpose")) and tuple(chosen) != tuple(recommended):
            found.append(intake)
    proposals = {doc["doc_id"]: doc for doc in _kind(records, PROPOSALS)}
    for answer in _kind(records, "assembler.answer"):
        proposal = proposals.get(answer["content"].get("proposal"))
        if proposal is not None:
            found += [proposal, answer]
    return _present(found)


INDICATORS = {
    "dissent_kept": dissent_kept,
    "reopen_condition_written": reopen_condition_written,
    "review_held_after_decision": review_held_after_decision,
    "positions_restated_correctly": positions_restated_correctly,
    "claims_with_source_share": claims_with_source_share,
    "facts_law_values_separate": facts_law_values_separate,
    "assumptions_stated": assumptions_stated,
    "evidence_conditions_stated": evidence_conditions_stated,
    "ai_trust_calibrated": ai_trust_calibrated,
    "modules_chosen_adjusted_or_off_with_reason": modules_chosen_adjusted_or_off_with_reason,
}
# The kinds each reads: what a caller loads, nothing more.
READS = {
    "dissent_kept": ("collab.dissent", "collab.stance"),
    "reopen_condition_written": ("collab.closing",),
    "review_held_after_decision": ("collab.closing", "collab.review", "decide.judgment", "learn.calibration"),
    "positions_restated_correctly": ("collab.restatement", "collab.confirm"),
    "claims_with_source_share": (LEDGER,),
    "facts_law_values_separate": (LEDGER,),
    "assumptions_stated": ("decide.judgment", "map.map", "think.round"),
    "evidence_conditions_stated": ("decide.judgment", "think.round"),
    "ai_trust_calibrated": ("verify.stance", "verify.reading", "think.reaction", "think.card"),
    "modules_chosen_adjusted_or_off_with_reason": ("assembler.intake", "assembler.answer", PROPOSALS),
}
# What each page shows. A group's list is its own procedure (COLLAB's records through R1); the rest is about a case, whose
# records are its owner's alone -- one person's list is never built from another person's case.
SCOPES = {
    GROUP: ("dissent_kept", "reopen_condition_written", "review_held_after_decision", "positions_restated_correctly"),
    CASE: ("review_held_after_decision", "claims_with_source_share", "facts_law_values_separate", "assumptions_stated",
           "evidence_conditions_stated", "ai_trust_calibrated", "modules_chosen_adjusted_or_off_with_reason"),
}
# The page text of each: a sentence about the case or the group, present then absent. No word grades it.
WORDS = {
    "dissent_kept": ("異議有保留下來", "還沒有異議留在紀錄裡"),
    "reopen_condition_written": ("結束的時候寫了什麼條件下重開", "還沒寫什麼條件下重開"),
    "review_held_after_decision": ("決定之後有回頭檢討", "決定之後還沒有回頭檢討"),
    "positions_restated_correctly": ("有人的立場被轉述，本人說轉述得對", "還沒有本人說轉述得對的轉述"),
    "claims_with_source_share": ("{claims} 個主張裡，{with_source} 個有來源", "{claims} 個主張裡，還沒有一個有來源"),
    "facts_law_values_separate": ("事實、法律、價值分開寫了", "事實、法律、價值還沒有分開寫"),
    "assumptions_stated": ("寫了自己的假設", "還沒寫自己的假設"),
    "evidence_conditions_stated": ("寫了什麼證據出現就會改變判斷", "還沒寫什麼證據出現就會改變判斷"),
    "ai_trust_calibrated": ("回應 AI 的時候寫了理由", "回應 AI 的時候還沒寫理由"),
    "modules_chosen_adjusted_or_off_with_reason": ("積木調整過，或回答過積木的提議", "積木還沒調整過，也還沒回答過提議"),
}
NO_CLAIMS = "還沒有寫下主張"


def reads(scope: str) -> list[str]:
    """The kinds to load for one scope, in order, each once: the stored kinds that scope's owner keeps, and the views."""
    known = doc_kinds.kinds()
    found: list[str] = []
    for name in SCOPES[scope]:
        for kind in READS[name]:
            mine = (scope == CASE and kind in DERIVED) or (kind in known and known[kind].owner == scope)
            if mine and kind not in found:
                found.append(kind)
    return found


def sentence(name: str, result: Mapping[str, Any]) -> str:
    if name == "claims_with_source_share" and result["claims"] == 0:
        return NO_CLAIMS
    return WORDS[name][0 if result["present"] else 1].format_map(result)


def describe(scope: str, records: Records) -> dict[str, Any]:
    """Every indicator of the scope, in the card's order, each as ``{id, sentence, present, evidence}`` (+ the two counts)."""
    out = []
    for name in SCOPES[scope]:
        result = INDICATORS[name](records)
        out.append({"id": name, "sentence": sentence(name, result), **result})
    return {"scope": scope, "indicators": out}
