"""COLLAB 共同程序 (docs/platform/STEP34_SHARED_RULES.md §7; card docs/platform/step34-cards/COLLAB.card.txt): what a few
people write when they decide together. Every kind is the group's (``owner="group"``): written only while the group is open
by a current member (G1, G3), read by another member only through platform/visibility.py.

Write before see (``blind``): a position, the sentence after reading, the interface answers -- each of round v -- and a
stance on one option are shown to another member only once they wrote their own of the same round (option). The
platform offers a procedure; nothing here says a decision was fair or that the group agrees, and nothing counts votes.

A copy is a pointer: a dissent, a restatement and a renegotiation notice name the records they come from (ids), and the
words and labels shown are read from those records each time."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.core.domain.kinds.context import INTERFACE_QUESTIONS

STANCES = ("同意", "異議")
CHANGE = ("no change", "changed")             # §7's values; the page says 沒變 / 有變
VERDICTS = ("說得對", "說錯了")                 # the subject's answer to the AI's restatement of them
ANONYMOUS = "匿名"
MAX_ROUND = 1000


def _round() -> Field:
    return Field("int", MAX_ROUND, required=True)


def _id(required: bool = True) -> Field:
    """A pointer to another record or a member (an id): not the person's words, not read for risk."""
    return Field("text", 64, required=required, scan=False)


def _members() -> Field:
    """An AI record's {成員N: member id}: which member each label in its words is. A reader is shown names, never this."""
    return Field("json", 30000, required=True, scan=False, shape="object")   # ~50 bytes a member


KINDS = [
    DocKind("collab.question", "COLLAB", "這次要決定的問題", {
        "text": Field("text", 2000, required=True),
        "round": _round(),
    }, owner="group", deletable=False, visibility="members", shared_wording=True),   # any member writes a new wording; every version stays
    DocKind("collab.place", "COLLAB", "我在哪裡", {
        "where": Field("text", 200, required=True, scan=False),
    }, owner="group", visibility="self_and_govern"),
    DocKind("collab.label", "COLLAB", "我的異議怎麼署名", {
        "label": Field("text", 40, required=True, scan=False),      # a name to be shown, or 匿名
    }, owner="group", visibility="members"),
    DocKind("collab.position", "COLLAB", "我的立場", {
        "round": _round(),
        "text": Field("text", 4000, required=True, human_only=True),
        "confidence": Field("text", 200, human_only=True),
    }, owner="group", blind="round", visibility="members"),
    DocKind("collab.change", "COLLAB", "讀完別人的立場之後", {
        "round": _round(),
        "after_reading": Field("choice", choices=CHANGE, required=True, human_only=True),
        "what": Field("text", 500, human_only=True),
    }, owner="group", blind="round", visibility="members"),
    DocKind("collab.interface_answers", "COLLAB", "介面問題的回答", {
        "round": _round(),
        "answers": Field("json", 20000, required=True, human_only=True, shape="array", labels=INTERFACE_QUESTIONS),   # [{q, text}]
    }, owner="group", blind="round", visibility="members"),
    DocKind("collab.option", "COLLAB", "方案", {
        "round": _round(),
        "text": Field("text", 2000, required=True),
        "evidence_refs": Field("json", 8000, shape="array"),        # [{project_id, kind, doc_id}]: pointers, read through consent
        "risks": Field("text", 2000),
        "values_tradeoff": Field("text", 2000),
    }, owner="group", visibility="members"),
    DocKind("collab.stance", "COLLAB", "同意或異議", {
        "option": _id(),
        "stance": Field("choice", choices=STANCES, required=True, human_only=True),
        "reason": Field("text", 2000, required=True, human_only=True),
    }, owner="group", blind="option", deletable=False, visibility="members"),   # every version stays: an objection is never overwritten
    DocKind("collab.dissent", "COLLAB", "保留的異議", {
        "option": _id(),
        "stance_id": _id(),                                         # the stance whose objection this keeps
        "stance_version": Field("int", 100000, required=True),      # the version that said 異議
    }, owner="group", authors=frozenset({"system"}), deletable=False, after_close=True, visibility="members"),
    DocKind("collab.authority", "COLLAB", "授權", {
        "to": _id(),                                                # the member it is given to
        "scope": Field("text", 1000, required=True),
        "revoked_by": Field("list", 1, scan=False),                 # [the grantor's own id] once they take their share back
    }, owner="group", deletable=False, visibility="members"),       # one record = one grantor's share (its writer)
    DocKind("collab.renegotiate", "COLLAB", "範圍要重新談", {
        "authority": _id(),                                         # the share that was taken back
    }, owner="group", authors=frozenset({"system"}), deletable=False, after_close=True, visibility="members"),
    DocKind("collab.closing", "COLLAB", "結束討論", {
        "why_end": Field("text", 2000, required=True),
        "reopen_if": Field("text", 2000, required=True),
        "review_on": Field("date", required=True),
        "owner": Field("text", 200, required=True),
    }, owner="group", deletable=False, visibility="members"),
    DocKind("collab.reopen", "COLLAB", "要求重開", {
        "reason": Field("text", 2000, required=True),
    }, owner="group", deletable=False, after_close=True, visibility="members"),   # never refused, also once the group is closed
    DocKind("collab.restatement", "COLLAB", "AI 轉述的立場", {
        "about": _id(),                                             # the member restated (the record's writer identity too)
        "position": _id(),                                          # the collab.position it restates
        "text": Field("text", 2000, required=True),
        "members": _members(),
    }, owner="group", authors=frozenset({"ai"}), visibility="subject_confirmed"),
    DocKind("collab.confirm", "COLLAB", "轉述對不對", {
        "restatement": _id(),
        "verdict": Field("choice", choices=VERDICTS, required=True, human_only=True),
    }, owner="group", visibility="members"),
    DocKind("collab.differences", "COLLAB", "AI 整理的分歧", {
        "round": _round(),
        "differences": Field("list", 10, required=True),
        "members": _members(),
    }, owner="group", authors=frozenset({"ai"}), visibility="author_only"),   # for the one who asked: written with their identity
    DocKind("collab.proposal", "COLLAB", "提案", {
        "express_draft": _id(required=False),
        "text": Field("text", 4000, required=True),
    }, owner="group", visibility="members"),
    DocKind("collab.consequence", "COLLAB", "決定之後的後果", {
        "decision": Field("text", 2000, required=True),
        "observed": Field("text", 4000, required=True),
    }, owner="group", after_close=True, visibility="members"),
    DocKind("collab.review", "COLLAB", "決定之後的回顧", {
        "text": Field("text", 4000, required=True),
    }, owner="group", after_close=True, visibility="members"),
    # The group's joint judgment and actions go to DECIDE and ACT (card 「產出給誰」): a pointer in the convener's own case
    # to the group's closing -- never a copy of its words.
    DocKind("collab.handoff", "COLLAB", "從群組帶過來", {
        "group_id": _id(),
        "closing": _id(),
        "to": Field("choice", choices=("DECIDE", "ACT"), required=True),
    }, deletable=False),
]

USER_KINDS = tuple(spec.kind for spec in KINDS if spec.owner == "group" and spec.authors == frozenset({"user"}))
