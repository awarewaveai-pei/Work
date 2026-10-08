"""TEACH guards lesson versions and writes course completion notices."""

from __future__ import annotations

import datetime
from typing import Any

from ai_lego.data.events import record_log
from ai_lego.data.repositories.case_docs import CaseDocs
from ai_lego.errors import InvariantViolation
from ai_lego.platform.lessons import courses, load_lessons, load_practice_cases


def _lesson(lesson_id: Any, lesson_version: Any) -> dict[str, Any]:
    if not isinstance(lesson_id, str) or not lesson_id:
        raise InvariantViolation("TEACH_LESSON_REQUIRED: name a lesson")
    found = next((item for item in load_lessons().items if item["id"] == lesson_id), None)
    if found is None or found["version"] != lesson_version:
        raise InvariantViolation(f"TEACH_LESSON_VERSION_UNKNOWN: {lesson_id!r} v{lesson_version!r}")
    return found


def _practice_case(case_id: Any) -> dict[str, Any]:
    if not isinstance(case_id, str) or not case_id:
        raise InvariantViolation("TEACH_PRACTICE_CASE_REQUIRED: name a practice case")
    found = next((item for item in load_practice_cases().items if item["id"] == case_id), None)
    if found is None:
        raise InvariantViolation(f"TEACH_PRACTICE_CASE_UNKNOWN: {case_id!r}")
    return found


def _run_checked(_docs: CaseDocs, _tenant_id: str, _owner: record_log.Owner, content: dict[str, Any], _doc_id: str | None) -> None:
    """A run names current file content; a copied lesson version is never silently accepted."""
    _lesson(content.get("lesson"), content.get("lesson_version"))
    _practice_case(content.get("practice_case"))


def _course_lessons() -> dict[str, dict[str, dict[str, Any]]]:
    by_course: dict[str, dict[str, dict[str, Any]]] = {}
    for lesson in load_lessons().items:
        course = lesson.get("course")
        if course:
            by_course.setdefault(course["package"], {})[lesson["id"]] = lesson
    return by_course


def _completion_for(
    docs: CaseDocs, tenant_id: str, owner: record_log.Owner, course: str, required: list[str], lessons: dict[str, dict[str, Any]]
) -> dict[str, Any] | None:
    preferences = docs.current(tenant_id, owner, "teach.completion_preference")
    if preferences and preferences[-1]["content"].get("keep") is False:
        return None
    runs = docs.current(tenant_id, owner, "teach.run")
    used: dict[str, int] = {}
    for doc in runs:
        lesson_id = doc["content"].get("lesson")
        version = doc["content"].get("lesson_version")
        if isinstance(lesson_id, str) and isinstance(version, int) and version >= used.get(lesson_id, 0):
            used[lesson_id] = version
    if any(used.get(lesson_id) != lessons[lesson_id]["version"] for lesson_id in required):
        return None
    if any(doc["content"].get("course") == course for doc in docs.current(tenant_id, owner, "teach.completion")):
        return None
    versions = {lesson_id: lessons[lesson_id]["version"] for lesson_id in required}
    return docs.save(tenant_id, owner, "teach.completion", {
        "course": course,
        "lesson_versions": versions,
        "at": datetime.date.today().isoformat(),
    }, record_log.system("TEACH"))


def _run_saved(docs: CaseDocs, tenant_id: str, owner: record_log.Owner, _doc: dict[str, Any]) -> list[dict[str, Any]]:
    if owner.kind != "person":
        return []
    by_course = _course_lessons()
    notices: list[dict[str, Any]] = []
    for course, lessons in by_course.items():
        required = courses().get(course, [])
        completion = _completion_for(docs, tenant_id, owner, course, required, lessons)
        if completion is not None:
            notices.append({"type": "teach_completion", "notice": f"你上完了『{course}』的課"})
    return notices


BEFORE_SAVE = {"teach.run": _run_checked}
AFTER_SAVE = {"teach.run": _run_saved}
