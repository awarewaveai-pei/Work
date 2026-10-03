"""The AI gate: the one way a block asks the AI for something inside the platform (架構頁的第三個關卡; 協作合約).

Before the model is called, in this order:
1. the action's permission: always-allowed (organize, ask, point_gaps) or granted in the case's 協作合約 -- a case-less
   call (每天校準…) uses the permission its block's card fixes (``AiAction.outside_case``);
2. the message is built whole: the action's input, the contract's own terms (scope, the parts the person keeps,
   basis, the hand-back condition) and the places -- unless the contract withholds them (``hide_places``);
3. a crisis signal anywhere in that message stops the AI (the exact text is checked, so what is checked and what is
   sent cannot drift apart): no model call, a ``govern.stop`` record, help for where they are;
4. the case's 護欄 are added to the instructions (要求來源, 建議找專業的人).
Then the call is metered (main._MeteredProvider, the API's one paid-call path; the object is asked for through
ai_gateway.structured like every other object answer) and the answer -- validated by the
action's output kind -- is saved as an AI-authored document. The AI never writes anywhere else.

A block declares its actions in its own module: ``ACTIONS = [AiAction(...)]`` in ai_lego/platform/ai_actions/<block>.py.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import pkgutil
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable, Mapping

from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.kinds.collab_contract import ALWAYS, GRANTABLE, allowed, places_hidden
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform import safety
from ai_lego.platform.ai_gateway.structured import ask_object, parse_object

# Every model call inside the platform starts with these (完整性核心 and the AI rules shared by every card).
PREAMBLE = (
    "You help one person think inside a judgment-sovereignty platform. Rules that override everything after them:\n"
    "- Never write the person's conclusion, never choose for them, never rank people or beliefs, never score anyone.\n"
    "- Never diagnose, never interpret their motives, never say what they should feel; mark what can be explored.\n"
    "- Keep what has a source apart from what you say yourself; your own memory is not a source.\n"
    "- Do not present any political, cultural, religious, legal or moral position as the neutral or mature one.\n"
    "- Never state what a law says from common knowledge; say a lawyer or the source must confirm it.\n"
    "- Ask at most one question at a time.\n"
    "- Write in the language the person writes in (Traditional Chinese by default).\n"
)


@dataclass(frozen=True)
class AiAction:
    block: str
    name: str                       # unique within the block
    needs: str                      # a permission: one of ALWAYS or GRANTABLE
    instructions: str               # what this action asks of the model, after PREAMBLE
    output_kind: str                # the doc kind the answer is saved as (author ai)
    output_schema: Mapping[str, Any]
    reads: tuple[str, ...]          # the doc kinds it may read (the card's 「讀什麼」); any other read is refused
    build_input: Callable[[Mapping[str, Any], Callable[[str], list[dict[str, Any]]]], str]   # (context, read) -> the user message
    shape: Callable[[dict[str, Any]], dict[str, Any]] = lambda answer: answer   # holds the answer to the card (e.g. fixed questions) before it is validated
    outside_case: bool = False      # may run with no case (permission fixed by the card: only ALWAYS actions)
    places: tuple[str, ...] = ("happened_in", "you_are_in")   # 系統把發生地和你在哪裡交給 AI; a card that reads more (規範與脈絡: 當事人各在哪裡) names it
    max_tokens: int = 2000

    def __post_init__(self) -> None:
        if self.needs not in ALWAYS and self.needs not in GRANTABLE:
            raise InvariantViolation(f"AI_ACTION_INVALID: {self.block}.{self.name} needs {self.needs!r}")
        if self.outside_case and self.needs not in ALWAYS:
            raise InvariantViolation(f"AI_ACTION_INVALID: {self.block}.{self.name} runs outside a case, so it can only need {ALWAYS}")


@lru_cache(maxsize=1)
def actions() -> dict[tuple[str, str], AiAction]:
    from ai_lego.platform import ai_actions as package

    found: dict[tuple[str, str], AiAction] = {}
    for info in sorted(pkgutil.iter_modules(package.__path__), key=lambda module: module.name):
        for action in getattr(importlib.import_module(f"{package.__name__}.{info.name}"), "ACTIONS", ()):
            key = (action.block, action.name)
            if key in found:
                raise InvariantViolation(f"AI_ACTION_DUPLICATE: {key}")
            if doc_kinds.require(action.output_kind).block != action.block or "ai" not in doc_kinds.require(action.output_kind).authors:
                raise InvariantViolation(f"AI_ACTION_INVALID: {key} saves into {action.output_kind}, which its block's AI may not write")
            found[key] = action
    return found


class AiRefused(InvariantViolation):
    """The gate refused before any model call: AI_PERMISSION_DENIED (the contract does not grant it)."""


def _latest(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, kind: str) -> dict[str, Any] | None:
    """The one live document of a singleton kind (協作合約、開案資料): never a guess between two."""
    if not doc_kinds.require(kind).singleton:
        raise InvariantViolation(f"DOC_KIND_NOT_SINGLETON: {kind}")
    current = docs.current(tenant_id, owner, kind)
    if len(current) > 1:
        raise InvariantViolation(f"DOC_SINGLETON_BROKEN: {kind} has {len(current)} live documents")
    return current[0]["content"] if current else None


def ask_ai(action: AiAction, *, tenant_id: str, identity_id: str, project_id: str | None, context: Mapping[str, Any],
        docs: CaseDocs, provider: Any, doc_id: str | None = None, base_version: int | None = None) -> dict[str, Any]:
    """One AI turn for ``action``. Returns {"saved": doc} or {"stopped": "crisis", "resources": [...], "notice": ...}.
    ``provider`` is already metered by the caller (main._MeteredProvider)."""
    if project_id is None and not action.outside_case:
        raise AiRefused(f"AI_PERMISSION_DENIED: {action.block}.{action.name} runs only inside a case")
    owner = record_log.case(project_id) if project_id else record_log.person(identity_id)
    terms = _latest(docs, tenant_id, owner, "collab_contract.terms") if project_id else None
    permitted = allowed(terms)
    if action.needs not in permitted:
        raise AiRefused(f"AI_PERMISSION_DENIED: {action.needs} -- 協作合約沒有准「{GRANTABLE.get(action.needs, action.needs)}」")

    intake = _latest(docs, tenant_id, owner, "assembler.intake") if project_id else None
    where = (intake or {}).get("you_are_in")
    if where is None:
        location = docs.current(tenant_id, record_log.person(identity_id), "govern.location")
        where = location[-1]["content"]["where"] if location else None
    def read(kind: str) -> list[dict[str, Any]]:
        if kind not in action.reads:
            raise InvariantViolation(f"AI_READ_REFUSED: {action.block}.{action.name} does not read {kind}")
        return docs.current(tenant_id, owner, kind)

    user = action.build_input(context, read)
    agreed = {key: terms[key] for key in ("scope", "human_parts", "basis", "handback") if terms and terms.get(key)}
    if agreed:
        user += "\n\n協作合約 (the person's own terms): " + json.dumps(agreed, ensure_ascii=False)
    told = action.places if project_id and intake and not places_hidden(terms) else ()
    places = {key: intake[key] for key in told if intake.get(key)}
    if places:
        user += "\n\nWhere: " + json.dumps(places, ensure_ascii=False)
    if safety.crisis_signal(user):
        if project_id:
            docs.save(tenant_id, owner, "govern.stop", {"reason": "crisis", "block": action.block}, record_log.system("GOVERN"))
        return {"stopped": "crisis", "notice": safety.NOT_THERAPY, "resources": safety.resources(where)}

    instructions = [PREAMBLE, action.instructions]
    guardrails = {doc["content"]["guardrail"] for doc in docs.current(tenant_id, owner, "govern.guardrail")} if project_id else set()
    if "require_sources" in guardrails:
        instructions.append("This case has a guardrail: every factual statement names its source (which page or document); with no source, say there is none.")
    if "professional" in guardrails:
        instructions.append("This case has a guardrail: remind the person this can be taken to a professional, and say which parts a professional answers for and which are theirs.")
    if agreed:
        instructions.append("The message ends with the person's 協作合約: stay inside its scope, leave the parts they keep for themselves to them, "
                            "and when its hand-back condition is met, stop and say so instead of going on.")
    if project_id and not places:
        instructions.append("You were not told where this happens or where the person is: for anything that depends on the place, say you do not know.")
    system = "\n".join(instructions)
    completion = ask_object(provider, system, user, max_tokens=action.max_tokens, schema=action.output_schema)
    docs.save(tenant_id, owner, "govern.ai_call" if project_id else "govern.ai_call_personal",
              {"block": action.block, "action": action.name, "model": str(getattr(completion, "model", "") or "unknown")[:120],
               "instructions_sha256": hashlib.sha256(system.encode("utf-8")).hexdigest()}, record_log.system("GOVERN"))
    try:
        answer = parse_object(completion)
    except InvariantViolation as error:
        raise InvariantViolation("AI_ANSWER_NOT_JSON: the model did not answer with the object asked for") from error
    fields = doc_kinds.require(action.output_kind).fields
    answer = action.shape({key: value for key, value in answer.items() if key in fields})   # extra keys the model added are dropped
    try:
        doc_kinds.validate(action.output_kind, answer, "ai")
    except InvariantViolation as error:   # the model's answer broke the card's shape: the model's failure, not the request's
        raise InvariantViolation(f"AI_ANSWER_INVALID: {error}") from error
    saved = docs.save(tenant_id, owner, action.output_kind, answer, record_log.ai(action.block), doc_id=doc_id, base_version=base_version)
    return {"saved": saved, "model": getattr(completion, "model", None)}
