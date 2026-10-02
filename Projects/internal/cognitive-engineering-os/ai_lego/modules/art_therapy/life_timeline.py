"""``art_therapy.life_timeline`` -- 生命時間線／反向時間軸: past, present and future on one dated line, walked forward or back.

GROUNDED ORIGINAL DESIGN (operator 54-item list, Timeline / Reverse Timeline row). Invariants, re-derived by the gate:
``phase`` is computed from ``when`` against ``now`` and never accepted from the caller; >= 1 past and >= 1 future event
(a line that never leaves the past or never reaches the future is not a past-present-future line); the listed order
follows ``direction`` (forward = non-decreasing dates, backward = non-increasing); a future event names a
``first_step`` and a past/present one does not (a step toward something already lived means nothing).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_iso_date, is_nonempty_str, is_one_of, parse_date, provenance_required_gate, require, require_header

METHOD_ID = "art_therapy.life_timeline"
RECORD_ID_PREFIX = "LIFETL-"
DIRECTIONS = ("forward", "backward")
PHASES = ("past", "present", "future")
MAX_EVENTS = 40
_IN_REQUIRED = frozenset({"id", "when", "event", "feeling", "meaning"})
_IN_ALLOWED = _IN_REQUIRED | {"first_step"}
_STORED_REQUIRED = _IN_REQUIRED | {"phase"}
_STORED_ALLOWED = _IN_ALLOWED | {"phase"}
_CHECKS = {"id": is_nonempty_str, "when": is_iso_date, "event": is_nonempty_str, "feeling": is_nonempty_str, "meaning": is_nonempty_str, "first_step": is_nonempty_str, "phase": lambda v: is_one_of(v, PHASES)}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "generate_life_timeline", "evaluate_life_timeline_gates", "all_gates_pass"]


def phase_of(when: str, now: str) -> str:
    """Precondition: both are ISO dates. Same day as ``now`` is the present."""
    day, anchor = parse_date(when), parse_date(now)
    return "past" if day < anchor else "future" if day > anchor else "present"


def _line_problem(subject: Any, now: Any, present_self: Any, direction: Any, events: Any, *, stored: bool) -> str | None:
    if not is_nonempty_str(subject):
        return "subject missing or empty"
    if not is_iso_date(now):
        return f"now must be an ISO date YYYY-MM-DD, got {now!r}"
    if not is_nonempty_str(present_self):
        return "present_self missing or empty"
    if not is_one_of(direction, DIRECTIONS):
        return f"direction must be one of {DIRECTIONS}, got {direction!r}"
    required, allowed = (_STORED_REQUIRED, _STORED_ALLOWED) if stored else (_IN_REQUIRED, _IN_ALLOWED)
    problem = entries_problem(events, required, allowed, _CHECKS, min_items=2)
    if problem is not None:
        supplied_phase = not stored and isinstance(events, list) and any(isinstance(e, dict) and "phase" in e for e in events)
        return f"events {problem}" + (" (phase is computed from when/now, never supplied)" if supplied_phase else "")
    if len(events) > MAX_EVENTS:
        return f"at most {MAX_EVENTS} events, got {len(events)}"
    dup = first_duplicate(e["id"] for e in events)
    if dup is not None:
        return f"duplicate event id {dup!r}"
    phases = [phase_of(e["when"], now) for e in events]
    if stored:
        wrong = next((e["id"] for e, p in zip(events, phases) if e["phase"] != p), None)
        if wrong is not None:
            return f"event {wrong!r} phase does not match its date against now (phase is computed, never asserted)"
    if "past" not in phases or "future" not in phases:
        return "a life timeline needs at least one past event (before now) and one future event (after now)"
    dates = [parse_date(e["when"]) for e in events]   # compare DATES, never the raw strings
    if dates != sorted(dates, reverse=direction == "backward"):
        return "events are not in forward order (oldest first)" if direction == "forward" else "events are not in backward order (furthest future first, back toward the past)"
    for event, phase in zip(events, phases):
        if phase == "future" and "first_step" not in event:
            return f"future event {event['id']!r} needs a first_step that can start now"
        if phase != "future" and "first_step" in event:
            return f"{phase} event {event['id']!r} carries a first_step; only future events do"
    return None


def generate_life_timeline(record_id: str, subject: str, now: str, present_self: str, direction: str, events: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("LIFETL", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _line_problem(subject, now, present_self, direction, events, stored=False)
    require(problem is None, "LIFETL_INVALID_LINE", problem or "")
    stamped = [{**event, "phase": phase_of(event["when"], now)} for event in events]
    return base_record(record_id, version, generated_by_method, provenance, subject=subject, now=now, present_self=present_self, direction=direction, events=stamped)


def evaluate_life_timeline_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    def evidence(r: dict[str, Any]) -> dict[str, Any]:
        counts = {phase: sum(e["phase"] == phase for e in r["events"]) for phase in PHASES}
        return {"direction": r["direction"], "now": r["now"], "phase_counts": counts, "span": sorted([r["events"][0]["when"], r["events"][-1]["when"]])}

    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("life_timeline_integrity", record, RECORD_ID_PREFIX, lambda r: _line_problem(r.get("subject"), r.get("now"), r.get("present_self"), r.get("direction"), r.get("events"), stored=True), evidence, validator, timestamp),
    ]
