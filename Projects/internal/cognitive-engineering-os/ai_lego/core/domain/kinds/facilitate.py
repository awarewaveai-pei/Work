"""FACILITATE 帶領 (docs/platform/STEP34_SHARED_RULES.md §5, §11; card 61): what a leader keeps and what makes someone their
supervisor. A log and the feedback on it belong to people, never to a participant's case. Nothing here scores a leader
(no score, rank or rating key), and who may read what is decided only in platform/visibility.py.

``facilitate.log`` is the leader's (person, user); ``facilitate.supervision`` is the supervisor's (person, user), read
by its subject through a route; ``facilitate.supervision_link`` is the platform's (owner = the tenant, like an appeal): it
joins two people, so neither owns it -- written by the leader (self) or the convener of the unit group (unit)."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field

ASSIGNED_BY = ("self", "unit")
MAX_DEVIATIONS = 30


def _id(required: bool = True) -> Field:
    """A pointer to a person, a group or a script (an id): not the person's words, not read for risk."""
    return Field("text", 160, required=required, human_only=True, scan=False)


def _ref() -> Field:
    """An id or a name the system set (a script, a log): not the person's words, not read for risk."""
    return Field("text", 160, required=True, scan=False)


KINDS = [
    DocKind("facilitate.log", "FACILITATE", "帶領紀錄", {
        "group_id": _id(),
        "script": _id(),                                        # which script (id) the session followed ...
        "script_version": Field("int", 100000, required=True, human_only=True),   # ... and which version of it
        "followed": Field("text", 4000, human_only=True),
        "deviated": Field("json", 24000, shape="array", human_only=True),   # [{what, why}], checked in block_hooks/facilitate.py
    }, owner="person"),
    DocKind("facilitate.supervision", "FACILITATE", "督導的回饋", {
        "supervisee": _id(),
        "feedback": Field("text", 4000, required=True, human_only=True),
    }, owner="person"),
    DocKind("facilitate.supervision_link", "FACILITATE", "督導連結", {
        "supervisee": _id(),
        "supervisor": _id(),
        "assigned_by": Field("choice", choices=ASSIGNED_BY, required=True, human_only=True),
        "group_id": _id(required=False),                        # the unit's group: required when assigned_by is "unit"
    }, owner="platform"),
    # What the AI practice partner and the deviation pointer answer (platform/ai_actions/facilitate.py): the leader's own
    # records, written by the AI only; neither is a log, a score or a verdict.
    DocKind("facilitate.practice_reply", "FACILITATE", "練習參與者的回應", {
        "script": _ref(),
        "step": Field("int", 1000, required=True),
        "reply": Field("text", 1200, required=True),
    }, owner="person", authors=frozenset({"ai"})),
    DocKind("facilitate.pointers", "FACILITATE", "AI 指出可能偏離的地方", {
        "log": _ref(),                                          # the log read (a pointer; the lines below are copied from that version by the system)
        "log_version": Field("int", 100000, required=True),
        "pointers": Field("json", 24000, shape="array"),        # [{n, line, dont, text}]; none = it pointed at nothing
        "handback": Field("text", 300, required=True),          # the fixed sentence: the way of leading is the leader's and the supervisor's
    }, owner="person", authors=frozenset({"ai"})),
]
