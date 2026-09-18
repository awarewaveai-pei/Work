"""Eisenhower Matrix quadrant classification -- deterministic compute, backing
``decision.eisenhower_matrix``. Same Trusted Compute discipline as
``compute/impact_effort/classification.py``: the quadrant assignment is decided here, by a real
threshold comparison, never asserted by an LLM.

Not an Atlas-cited method (grep-confirmed: "Eisenhower" has zero hits anywhere in
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md) -- added 2026-09-18 per direct operator
request, not a pre-existing Atlas entry being implemented. External grounding instead: the
urgent/important distinction is widely attributed to a line credited to President Dwight D.
Eisenhower and popularized as the "Eisenhower Matrix" / "Eisenhower Box" by Stephen Covey's
"The 7 Habits of Highly Effective People" (1989). No URL cited here -- one would need real
verification (WebSearch), not a guess, and is out of scope for this addition.

Structurally the same shape as impact_effort's own classify_quadrant (2 numeric axes, 2
thresholds, 4-way split) -- impact_effort's own contract already flagged this exact
generalization as an open question (OQ-IMPACTEFFORT-3) once a second quadrant method existed, but
deferred extraction until then. Deliberately NOT extracted into a shared module now: this
addition should not carry the risk of refactoring impact_effort's own working, tested
implementation as a side effect (smallest-blast-radius preference) -- same "reuse discovered
after the fact" precedent impact_effort's own contract already established, now with a second,
still-open instance disclosed in this method's own contract.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.errors import InvariantViolation

QUADRANT_DO_FIRST = "do_first"
QUADRANT_SCHEDULE = "schedule"
QUADRANT_DELEGATE = "delegate"
QUADRANT_ELIMINATE = "eliminate"
VALID_QUADRANTS = frozenset({QUADRANT_DO_FIRST, QUADRANT_SCHEDULE, QUADRANT_DELEGATE, QUADRANT_ELIMINATE})


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_scale(scale: Any, axis_name: str) -> None:
    if not isinstance(scale, dict) or set(scale.keys()) != {"min", "max"}:
        raise InvariantViolation(f"EISENHOWER_INVALID_SCALE: {axis_name}_scale must be a dict with exactly 'min'/'max' keys, got {scale!r}")
    lo, hi = scale["min"], scale["max"]
    if not _is_finite_number(lo) or not _is_finite_number(hi):
        raise InvariantViolation(f"EISENHOWER_INVALID_SCALE: {axis_name}_scale min/max must both be finite numbers, got min={lo!r} max={hi!r}")
    if not lo < hi:
        raise InvariantViolation(f"EISENHOWER_INVALID_SCALE: {axis_name}_scale min ({lo!r}) must be strictly less than max ({hi!r})")


def validate_threshold_in_scale(threshold: Any, scale: Any, axis_name: str) -> None:
    if not _is_finite_number(threshold):
        raise InvariantViolation(f"EISENHOWER_INVALID_THRESHOLD: {axis_name}_threshold must be a finite number, got {threshold!r}")
    lo, hi = scale["min"], scale["max"]
    if not (lo <= threshold <= hi):
        raise InvariantViolation(f"EISENHOWER_THRESHOLD_OUT_OF_SCALE: {axis_name}_threshold={threshold!r} is outside its own declared {axis_name}_scale [{lo!r}, {hi!r}]")


def validate_value_in_scale(value: Any, scale: Any, axis_name: str, task_id: Any) -> None:
    if not _is_finite_number(value):
        raise InvariantViolation(f"EISENHOWER_INVALID_VALUE: task {task_id!r} {axis_name}={value!r} must be a finite number")
    lo, hi = scale["min"], scale["max"]
    if not (lo <= value <= hi):
        raise InvariantViolation(f"EISENHOWER_VALUE_OUT_OF_SCALE: task {task_id!r} {axis_name}={value!r} is outside the declared {axis_name}_scale [{lo!r}, {hi!r}]")


def classify_quadrant(urgency: float, importance: float, urgency_threshold: float, importance_threshold: float) -> str:
    """Pure, stateless. Boundary convention (disclosed, not externally cited): ``>= threshold`` is
    High, ``< threshold`` is Low, applied independently to both axes -- same convention
    impact_effort's own classify_quadrant uses (OQ-IMPACTEFFORT-1).

        High Urgency + High Importance -> do_first   (do it now)
        Low  Urgency + High Importance -> schedule    (plan time for it)
        High Urgency + Low  Importance -> delegate    (hand it to someone else)
        Low  Urgency + Low  Importance -> eliminate   (drop it)

    Called twice per task in a record's own lifecycle: once at construction (to compute the
    stored label) and once, independently, inside the integrity gate (to re-derive and compare
    against whatever label is actually stored) -- the gate never trusts that the constructor ran,
    or ran correctly, on a hand-tampered record. Does not itself validate urgency/importance/
    threshold are in range -- callers run validate_value_in_scale/validate_threshold_in_scale
    first (classify_tasks below does both in the right order)."""
    high_urgency = urgency >= urgency_threshold
    high_importance = importance >= importance_threshold
    if high_urgency and high_importance:
        return QUADRANT_DO_FIRST
    if not high_urgency and high_importance:
        return QUADRANT_SCHEDULE
    if high_urgency and not high_importance:
        return QUADRANT_DELEGATE
    return QUADRANT_ELIMINATE


def classify_tasks(
    tasks: list[dict[str, Any]],
    urgency_scale: Any,
    importance_scale: Any,
    urgency_threshold: Any,
    importance_threshold: Any,
) -> list[dict[str, Any]]:
    """Validates the record's own scale/threshold declarations, then every task's urgency/
    importance against them (fail-closed, rejects out-of-range/mixed-scale input rather than
    silently normalizing), then classifies each via classify_quadrant. Returns a NEW list of
    {id, label, urgency, importance, quadrant} dicts -- never mutates ``tasks``. Assumes each
    entry's shape was already checked by the caller."""
    validate_scale(urgency_scale, "urgency")
    validate_scale(importance_scale, "importance")
    validate_threshold_in_scale(urgency_threshold, urgency_scale, "urgency")
    validate_threshold_in_scale(importance_threshold, importance_scale, "importance")

    classified: list[dict[str, Any]] = []
    for entry in tasks:
        task_id = entry.get("id", "?")
        urgency, importance = entry["urgency"], entry["importance"]
        validate_value_in_scale(urgency, urgency_scale, "urgency", task_id)
        validate_value_in_scale(importance, importance_scale, "importance", task_id)
        quadrant = classify_quadrant(urgency, importance, urgency_threshold, importance_threshold)
        classified.append({"id": entry["id"], "label": entry["label"], "urgency": urgency, "importance": importance, "quadrant": quadrant})
    return classified
