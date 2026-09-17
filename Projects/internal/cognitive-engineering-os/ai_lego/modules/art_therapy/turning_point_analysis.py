"""``art_therapy.turning_point_analysis`` -- 轉折點分析: key life events and the emotion/belief shift each caused.

GROUNDED ORIGINAL DESIGN (operator 54-item list). Invariants: >= 1 event with unique ids; ``when`` is an ISO
date and events are in chronological (non-decreasing) order -- a timeline out of order is not a timeline;
each event names a ``belief_shift`` in the client's own words.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_iso_date, is_nonempty_str, parse_date, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.turning_point_analysis"
RECORD_ID_PREFIX = "TURNPT-"
_E_REQUIRED = frozenset({"id", "when", "event", "emotion_before", "emotion_after", "belief_shift"})
_E_ALLOWED = _E_REQUIRED
_E_CHECKS = {"id": is_nonempty_str, "when": is_iso_date, "event": is_nonempty_str, "emotion_before": is_nonempty_str, "emotion_after": is_nonempty_str, "belief_shift": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_turning_point_analysis", "evaluate_turning_point_analysis_gates", "all_gates_pass"]


def _core_problem(subject: Any, events: Any) -> str | None:
    if not is_nonempty_str(subject):
        return "subject missing or empty"
    problem = entries_problem(events, _E_REQUIRED, _E_ALLOWED, _E_CHECKS)
    if problem is not None:
        return f"events {problem}"
    dup = first_duplicate(e["id"] for e in events)
    if dup is not None:
        return f"duplicate event id {dup!r}"
    dates = [parse_date(e["when"]) for e in events]  # compare DATES, never the raw strings
    if dates != sorted(dates):
        return "events are not in chronological order (when must be non-decreasing)"
    return None


def generate_turning_point_analysis(record_id: str, subject: str, events: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("TURNPT", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(subject, events)
    require(problem is None, "TURNPT_INVALID_EVENTS", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, subject=subject, events=events)


def evaluate_turning_point_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("turning_point_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("subject"), r.get("events")), lambda r: {"event_count": len(r["events"]), "span": [r["events"][0]["when"], r["events"][-1]["when"]]}, validator, timestamp),
    ]
