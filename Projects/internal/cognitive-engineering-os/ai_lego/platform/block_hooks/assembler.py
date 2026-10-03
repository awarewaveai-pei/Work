"""組裝器 (系統做什麼): the intake's risk names a GOVERN high-risk category -> GOVERN adds the case's guardrails
(要求來源、建議找專業的人、先等一下或請人覆核; 群組程序 stays a DECIDE proposal). GOVERN gets the category, never the text.
And the case's route: which blocks, in what order, why each is there (畫面上顯示：現在在哪一塊、為什麼在這一塊、下一塊做什麼)."""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain import doc_kinds
from ai_lego.core.domain.blocks import BLOCKS
from ai_lego.core.domain.kinds.assembler import OPEN_BLOCKS, PACKAGES
from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform.safety.risk import high_risk_categories

AUTOMATIC = ("require_sources", "professional", "wait_or_review")
PROPOSAL = "assembler.proposal."


def proposals(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> list[dict[str, Any]]:
    return [doc for kind in sorted(doc_kinds.kinds()) if kind.startswith(PROPOSAL) for doc in docs.current(tenant_id, owner, kind)]


def case_route(docs: CaseDocs, tenant_id: str, owner: record_log.Owner) -> dict[str, Any]:
    """The intake's blocks in the order the person left them (skipped ones are gone), then every block a proposal added
    that the person accepted (你同意才加), in the order they accepted. An intake saved without a block list falls back
    to its package's order; no intake = no route yet. Reads the intake, the proposals and the answers, and of the other
    blocks only which ones have something written (組裝器不讀各塊的其他內容)."""
    intake = next(iter(docs.current(tenant_id, owner, "assembler.intake")), None)
    content = intake["content"] if intake else {}
    package, chosen = content.get("package"), content.get("blocks")
    route: list[dict[str, Any]] = [{"code": code, "why": {"from": "package", "package": package}}
                                   for code in (chosen if chosen is not None else PACKAGES.get(package, ()))] if intake else []
    by_id = {doc["doc_id"]: doc for doc in proposals(docs, tenant_id, owner)}
    for answer in docs.current(tenant_id, owner, "assembler.answer"):
        proposal = by_id.get(answer["content"]["proposal"])
        if answer["content"]["answer"] != "accepted" or proposal is None or proposal["content"]["propose"] not in OPEN_BLOCKS \
                or any(item["code"] == proposal["content"]["propose"] for item in route):
            continue
        route.append({"code": proposal["content"]["propose"], "why": {"from": "proposal", "by": proposal["block"], "text": proposal["content"]["why"]}})
    used = docs.blocks_used(tenant_id, owner)
    for item in route:
        item.update(open=item["code"] in OPEN_BLOCKS, done=item["code"] in used)
    return {"purpose": content.get("purpose"), "package": package, "blocks": route, "done": [code for code in BLOCKS if code in used]}


def add_guardrails(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, categories: list[str], found_by: str) -> list[dict[str, Any]]:
    """One guardrail of each automatic kind per category not guarded yet; returns a notice per new category."""
    if owner.kind != "case" or not categories:
        return []
    held = {(doc["content"]["guardrail"], doc["content"]["category"]) for doc in docs.current(tenant_id, owner, "govern.guardrail")}
    notices = []
    for category in categories:
        added = [kind for kind in AUTOMATIC if (kind, category) not in held]
        for kind in added:
            docs.save(tenant_id, owner, "govern.guardrail", {"guardrail": kind, "category": category, "found_by": found_by}, record_log.system("GOVERN"))
        if added:
            notices.append({"type": "guardrail", "category": category, "found_by": found_by})
    return notices


def _answer_checked(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, content: dict[str, Any], doc_id: str | None) -> None:
    """你同意才加: an answer names a proposal of this case that has no other answer, and 加 only a block that is built
    (提議的那一塊如果還沒蓋好…不能加). Changing your own answer later is a new version of the same answer."""
    proposal = next((doc for doc in proposals(docs, tenant_id, owner) if doc["doc_id"] == content.get("proposal")), None)
    if proposal is None:
        raise InvariantViolation(f"ANSWER_PROPOSAL_NOT_FOUND: no proposal {content.get('proposal')!r} in this case")
    if any(answer["content"]["proposal"] == proposal["doc_id"] and answer["doc_id"] != doc_id for answer in docs.current(tenant_id, owner, "assembler.answer")):
        raise InvariantViolation("ANSWER_ALREADY_GIVEN: this proposal has an answer; change that one")
    if content.get("answer") == "accepted" and proposal["content"]["propose"] not in OPEN_BLOCKS:
        raise InvariantViolation(f"ANSWER_BLOCK_NOT_OPEN: {proposal['content']['propose']} is not built yet, so it cannot be added")


def _intake_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, doc: dict[str, Any]) -> list[dict[str, Any]]:
    content = doc["content"]
    return add_guardrails(docs, tenant_id, owner, high_risk_categories(content.get("risk"), content.get("question")), "ASSEMBLER")


AFTER_SAVE = {"assembler.intake": _intake_saved}
BEFORE_SAVE = {"assembler.answer": _answer_checked}
