"""``systems.behavior_over_time`` -- F09 systems-thinking family (Atlas L541-559).

Atlas's own table row (L551, verbatim): "Behavior-over-Time | 畫變數隨時間
變化 | 歷史/預期曲線->轉折->延遲 | 迫使分析時間維度" (plot how a variable
changes over time; historical/expected curve -> turning point -> delay;
forces the analysis onto the time dimension).

Real invariant (ordering + minimum), enforced at TWO independent layers,
same belt-and-suspenders discipline every prior slice in this corpus
establishes: `points[]` must contain at least 2 entries (a single point
cannot show "change over time", Atlas's own literal purpose) and must be
STRICTLY increasing in `time` -- a duplicate or out-of-order timestamp is a
real authoring mistake this method exists to catch, not silently accepted.
`value` must additionally be a real, finite number (Python `bool` is an
`int` subclass and is explicitly excluded; the finiteness idiom below
mirrors the one this corpus's other builders already established, e.g.
``ai_lego/modules/stakeholders/game_theory.py``'s own
``_is_number_excluding_bool``: `int` is unconditionally finite in Python
(arbitrary precision, never inf/nan) and is NOT passed through
``math.isfinite`` -- a huge `int` (e.g. `10**400`) would make
``math.isfinite`` itself raise `OverflowError` on the implicit float
conversion, an unhandled crash this module must not reproduce).

Grepped `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS` and
`Projects/internal/cognitive-engineering-os` case-insensitively for
"iceberg"/"behavior over time"/"behavior-over-time" and every schema title,
before writing any of this method's own files: zero pre-existing
implementation or schema title overlap.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "systems.behavior_over_time"
RECORD_ID_PREFIX = "BOT-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number_excluding_bool(value: Any) -> bool:
    """A real, finite number. Python's ``bool`` is an ``int`` subclass -- explicitly excluded, same trap every
    numeric-input-checking module in this corpus guards against. ``int`` is unconditionally finite and is NOT
    passed through ``math.isfinite`` (a huge ``int`` makes that call itself raise ``OverflowError``); only
    ``float`` needs the NaN/+-inf check."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _is_valid_time_label(value: Any) -> bool:
    """A timestamp label: a non-empty string, or a finite number (Atlas L551 allows both a historical/date-or-
    phase label and an abstract relative-time number). ``bool`` excluded for the same reason as above."""
    if isinstance(value, bool):
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (int, float)):
        return _is_finite_number_excluding_bool(value)
    return False


def point(time: Any, value: Any) -> dict[str, Any]:
    """One item of ``typed-objects/behavior-over-time-chart.schema.yaml#/properties/points``."""
    if not _is_valid_time_label(time):
        raise InvariantViolation(f"BOT_INVALID_TIME: time must be a non-empty string or a finite number, got {time!r}")
    if not _is_finite_number_excluding_bool(value):
        raise InvariantViolation(f"BOT_INVALID_VALUE: value must be a finite number, got {value!r}")
    return {"time": time, "value": value}


def generate_behavior_over_time_chart(
    record_id: str,
    variable_name: str,
    points: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/behavior-over-time-chart.schema.yaml``.

    Enforces the method contract's own precondition (at least 2
    chronologically-ordered points) and Atlas L551's own literal purpose
    ("畫變數隨時間變化") fail-closed -- rebuilds every point via ``point()``
    (never trusting the caller's raw dicts), then re-checks strict time
    ordering across the rebuilt series, before returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BOT_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BOT_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not _is_nonempty_str(variable_name):
        raise InvariantViolation("BOT_INVALID_VARIABLE_NAME: variable_name must be a non-empty string")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("BOT_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not isinstance(points, list) or len(points) < 2:
        raise InvariantViolation(
            "BOT_TOO_FEW_POINTS: at least 2 points are required to show change over time "
            "(Atlas L551's own '畫變數隨時間變化')"
        )

    rebuilt: list[dict[str, Any]] = []
    for i, p in enumerate(points):
        if not isinstance(p, dict) or "time" not in p or "value" not in p:
            raise InvariantViolation(f"BOT_INVALID_POINT: points[{i}] must be a {{time, value}} object, got {p!r}")
        rebuilt.append(point(p["time"], p["value"]))

    for i in range(1, len(rebuilt)):
        prev_time = rebuilt[i - 1]["time"]
        curr_time = rebuilt[i]["time"]
        try:
            in_order = curr_time > prev_time
        except TypeError as error:
            raise InvariantViolation(
                f"BOT_TIME_NOT_ORDERABLE: points[{i - 1}].time ({prev_time!r}) and points[{i}].time "
                f"({curr_time!r}) are not mutually comparable: {error}"
            ) from error
        if not in_order:
            raise InvariantViolation(
                f"BOT_POINTS_NOT_STRICTLY_INCREASING: points[{i}].time ({curr_time!r}) does not come strictly "
                f"after points[{i - 1}].time ({prev_time!r}) -- duplicate or out-of-order timestamps are refused"
            )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "variable_name": variable_name,
        "points": rebuilt,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_chronological_order_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L551's own literal purpose ("畫變數隨時間變化") directly from the raw record -- not just
    trusting that ``generate_behavior_over_time_chart``'s own construction-time check already ran (a hand-
    crafted/tampered record must still be caught, same discipline every prior slice's gate-re-derivation
    already established). Fails closed on a malformed point rather than crashing."""
    if not isinstance(record, dict):
        return _result("chronological_order", False, [{"reason": "record is not a dict"}], validator, timestamp)
    points = record.get("points")
    if not isinstance(points, list) or len(points) < 2:
        return _result("chronological_order", False, [{"problems": ["points must be a list with at least 2 entries"]}], validator, timestamp)

    problems: list[str] = []
    for i, p in enumerate(points):
        if not isinstance(p, dict) or not _is_finite_number_excluding_bool(p.get("value")):
            problems.append(f"points[{i}].value is not a finite number")
    for i in range(1, len(points)):
        prev = points[i - 1]
        curr = points[i]
        prev_time = prev.get("time") if isinstance(prev, dict) else None
        curr_time = curr.get("time") if isinstance(curr, dict) else None
        try:
            in_order = curr_time > prev_time
        except TypeError:
            problems.append(f"points[{i - 1}].time and points[{i}].time are not mutually comparable")
            continue
        if not in_order:
            problems.append(f"points[{i}].time does not strictly follow points[{i - 1}].time")
    passed = not problems
    return _result("chronological_order", passed, [{"points_checked": len(points), "problems": problems}], validator, timestamp)


def evaluate_behavior_over_time_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_chronological_order_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
