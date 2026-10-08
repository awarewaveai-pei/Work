"""TEACH person records and the AI's practice feedback."""

from __future__ import annotations

from ai_lego.core.domain.doc_kinds import DocKind, Field
from ai_lego.core.domain.kinds.assembler import PACKAGES


ROLES = ("提出者", "反方", "證據稽核者", "決策者", "回顧者")
OPPOSITE_ROLES = {"提出者": "反方", "反方": "提出者", "證據稽核者": "決策者", "決策者": "證據稽核者", "回顧者": "提出者"}


def _person_text(maximum: int = 2000, *, required: bool = False) -> Field:
    return Field("text", maximum, required=required, human_only=True)


KINDS = [
    DocKind("teach.run", "TEACH", "練習紀錄", {
        "lesson": Field("text", 160, required=True, human_only=True),
        "lesson_version": Field("int", 100000, required=True, human_only=True),
        "practice_case": Field("text", 160, required=True, human_only=True),
        "role": Field("choice", choices=ROLES, required=True, human_only=True),
        "notes": _person_text(4000),
    }, owner="person"),
    DocKind("teach.aar", "TEACH", "行動後回顧", {
        "predicted": _person_text(required=True),
        "happened": _person_text(required=True),
        "missed_context": _person_text(),
        "change_next_time": _person_text(),
    }, owner="person"),
    DocKind("teach.practice_consent", "TEACH", "拿真實案子練習的同意", {
        "project_id": Field("text", 64, required=True, human_only=True),
    }, owner="person", from_case="project_id"),
    DocKind("teach.completion_preference", "TEACH", "完成紀錄保留偏好", {
        "keep": Field("bool", required=True, human_only=True),
    }, owner="person", singleton=True),
    DocKind("teach.completion", "TEACH", "課程完成紀錄", {
        "course": Field("choice", choices=tuple(PACKAGES), required=True),
        "lesson_versions": Field("json", 8000, required=True, shape="object"),
        "at": Field("date", required=True),
    }, owner="person", authors=frozenset({"system"}), deletable=True),
    DocKind("teach.opponent", "TEACH", "練習對手的回應", {
        "challenge": Field("text", 2400, required=True),
        "question": Field("text", 500),
    }, owner="person", authors=frozenset({"ai"})),
    DocKind("teach.feedback", "TEACH", "思考動作回饋", {
        "move_feedback": Field("json", 8000, required=True, shape="array"),
    }, owner="person", authors=frozenset({"ai"})),
]
