"""``delivery.gantt_chart`` -- 甘特圖: dated tasks with finish-to-start dependencies.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general PM method, natural family). Invariants (re-derived by
the gate): >= 1 task with unique ids; ISO ``start`` <= ``end`` per task (dates are INCLUSIVE working days, so a
one-day task has start == end); every ``depends_on`` id resolves to another task (no self-dependency, no
duplicate, no cycle); finish-to-start with inclusive days: a task starts strictly AFTER each dependency's end
date -- a schedule that violates this is drawn, not planned. Project span (inclusive day count) is derived on read.
"""

from __future__ import annotations

import datetime
from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_iso_date, is_nonempty_str, provenance_required_gate, require, require_header

METHOD_ID = "delivery.gantt_chart"
RECORD_ID_PREFIX = "GANTT-"
_T_REQUIRED = frozenset({"id", "name", "start", "end", "depends_on"})
_T_CHECKS = {"id": is_nonempty_str, "name": is_nonempty_str, "start": is_iso_date, "end": is_iso_date, "depends_on": lambda v: isinstance(v, list) and all(is_nonempty_str(d) for d in v)}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_gantt_chart", "evaluate_gantt_chart_gates", "project_span", "all_gates_pass"]


def _d(value: str) -> datetime.date:
    return datetime.date.fromisoformat(value.strip())


def _core_problem(project: Any, tasks: Any) -> str | None:
    if not is_nonempty_str(project):
        return "project missing or empty"
    problem = entries_problem(tasks, _T_REQUIRED, _T_REQUIRED, _T_CHECKS)
    if problem is not None:
        return f"tasks {problem}"
    if first_duplicate(t["id"] for t in tasks) is not None:
        return "task ids must be unique"
    by_id = {t["id"]: t for t in tasks}
    for t in tasks:
        if _d(t["start"]) > _d(t["end"]):
            return f"task {t['id']!r} starts after it ends"
        if first_duplicate(t["depends_on"]) is not None:
            return f"task {t['id']!r} lists a dependency twice"
        for dep in t["depends_on"]:
            if dep == t["id"]:
                return f"task {t['id']!r} depends on itself"
            if dep not in by_id:
                return f"task {t['id']!r} depends on undeclared {dep!r}"
            if _d(t["start"]) <= _d(by_id[dep]["end"]):
                return f"task {t['id']!r} must start AFTER dependency {dep!r} ends (inclusive days, finish-to-start)"
    # No separate cycle check: strict finish-to-start (start > dep.end) makes a dependency cycle impossible
    # (A > B.end and B > A.end cannot both hold), so the date rule already closes that class.
    return None


def generate_gantt_chart(record_id: str, project: str, tasks: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("GANTT", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(project, tasks)
    require(problem is None, "GANTT_INVALID_SCHEDULE", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, project=project, tasks=tasks)


def project_span(record: dict[str, Any]) -> dict[str, Any]:
    starts = [_d(t["start"]) for t in record["tasks"]]
    ends = [_d(t["end"]) for t in record["tasks"]]
    return {"start": min(starts).isoformat(), "end": max(ends).isoformat(), "days": (max(ends) - min(starts)).days + 1}


def evaluate_gantt_chart_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("gantt_chart_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("project"), r.get("tasks")), lambda r: {"task_count": len(r["tasks"]), **project_span(r)}, validator, timestamp),
    ]
