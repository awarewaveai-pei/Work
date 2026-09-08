"""Impact-Effort quadrant classification -- deterministic compute, backing ``decision.impact_effort``.

Same Trusted Compute discipline every prior genuine-compute module in this package establishes
(``compute/mcda/scoring.py``, ``compute/ahp/weights.py``): the quadrant assignment is DECIDED here, by a
real deterministic threshold comparison, never asserted by an LLM (Atlas §29 rule 6: "數學與統計必須由
Trusted Compute 執行").

Atlas §11.30's own quadrant chart (L1894-1903) gives 2 fixed, named axes (impact, effort) and 4 named
quadrants -- a categorical CLASSIFICATION, not a continuous weighted score (contrast
``compute/mcda/scoring.py``'s own N-arbitrary-criteria weighted sum). ``classify_quadrant`` is the one new
compute primitive; scale/range validation (``validate_scale``, ``validate_threshold_in_scale``,
``validate_value_in_scale``) is the second half of this module's own Trusted Compute surface -- both
independently re-derivable, never trusting caller self-attestation, same discipline
``mcda/scoring.py``'s own ``validate_weights_sum_to_one`` and ``root_cause.fault_tree``'s own
``_is_valid_probability`` already establish.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.errors import InvariantViolation

QUADRANT_MAJOR_PROJECTS = "major_projects"
QUADRANT_QUICK_WINS = "quick_wins"
QUADRANT_FILL_INS = "fill_ins"
QUADRANT_AVOID_RECONSIDER = "avoid_reconsider"
VALID_QUADRANTS = frozenset({QUADRANT_MAJOR_PROJECTS, QUADRANT_QUICK_WINS, QUADRANT_FILL_INS, QUADRANT_AVOID_RECONSIDER})


def _is_finite_number(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline ``root_cause.fault_tree``'s own ``_is_valid_probability`` uses:
    ``True``/``False`` must not silently pass an ``isinstance(value, (int, float))`` check as if it were 1/0,
    and NaN/Infinity are not valid RFC 8259 JSON and would make every downstream threshold comparison
    meaningless."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_scale(scale: Any, axis_name: str) -> None:
    """A declared axis scale is a real, finite, non-degenerate range: ``min``/``max`` are both finite numbers
    and ``min < max``. Called independently for ``impact_scale`` and ``effort_scale`` -- each axis gets its
    OWN validated range, never a single range shared across both (see method contract's own
    compilation_decisions for why: a shared range would force impact and effort onto one identical numeric
    scale Atlas never specifies)."""
    if not isinstance(scale, dict) or set(scale.keys()) != {"min", "max"}:
        raise InvariantViolation(f"IMPACTEFFORT_INVALID_SCALE: {axis_name}_scale must be a dict with exactly 'min'/'max' keys, got {scale!r}")
    lo, hi = scale["min"], scale["max"]
    if not _is_finite_number(lo) or not _is_finite_number(hi):
        raise InvariantViolation(f"IMPACTEFFORT_INVALID_SCALE: {axis_name}_scale min/max must both be finite numbers, got min={lo!r} max={hi!r}")
    if not lo < hi:
        raise InvariantViolation(f"IMPACTEFFORT_INVALID_SCALE: {axis_name}_scale min ({lo!r}) must be strictly less than max ({hi!r})")


def validate_threshold_in_scale(threshold: Any, scale: Any, axis_name: str) -> None:
    """The declared high/low split point must fall within its own axis's own declared range -- a threshold
    outside [min, max] could never classify anything as both High and Low on that axis, making the split
    meaningless. Precondition: ``scale`` has already passed ``validate_scale``."""
    if not _is_finite_number(threshold):
        raise InvariantViolation(f"IMPACTEFFORT_INVALID_THRESHOLD: {axis_name}_threshold must be a finite number, got {threshold!r}")
    lo, hi = scale["min"], scale["max"]
    if not (lo <= threshold <= hi):
        raise InvariantViolation(f"IMPACTEFFORT_THRESHOLD_OUT_OF_SCALE: {axis_name}_threshold={threshold!r} is outside its own declared {axis_name}_scale [{lo!r}, {hi!r}]")


def validate_value_in_scale(value: Any, scale: Any, axis_name: str, idea_id: Any) -> None:
    """Every idea's own raw impact/effort value must fall within its axis's declared range -- the structural
    mechanism that makes 'impact scored 1-10 vs effort scored 1-5' impossible within one record: both draw
    from ONE declared ``impact_scale`` / ONE declared ``effort_scale``, checked here, never a per-idea
    override. Rejects out-of-range input rather than silently normalizing it (disclosed compilation
    decision -- see method contract)."""
    if not _is_finite_number(value):
        raise InvariantViolation(f"IMPACTEFFORT_INVALID_VALUE: idea {idea_id!r} {axis_name}={value!r} must be a finite number")
    lo, hi = scale["min"], scale["max"]
    if not (lo <= value <= hi):
        raise InvariantViolation(f"IMPACTEFFORT_VALUE_OUT_OF_SCALE: idea {idea_id!r} {axis_name}={value!r} is outside the declared {axis_name}_scale [{lo!r}, {hi!r}]")


def classify_quadrant(impact: float, effort: float, impact_threshold: float, effort_threshold: float) -> str:
    """Atlas §11.30's own quadrant chart (L1894-1903), pure and stateless: given one idea's impact/effort and
    the record's own declared thresholds, returns exactly one of the 4 canonical quadrant labels. Boundary
    convention (disclosed, not Atlas-cited -- see method contract OQ-IMPACTEFFORT-1): ``>= threshold`` is
    High, ``< threshold`` is Low, applied independently to both axes.

        High Impact + High Effort -> major_projects    (mermaid quadrant-1, L1899 "Major Projects")
        High Impact + Low  Effort -> quick_wins         (mermaid quadrant-2, L1900 "Quick Wins")
        Low  Impact + Low  Effort -> fill_ins           (mermaid quadrant-3, L1901 "Fill-ins")
        Low  Impact + High Effort -> avoid_reconsider   (mermaid quadrant-4, L1902 "Avoid / Reconsider")

    Called twice for every idea in a record's own lifecycle: once at construction (to compute the stored
    label) and once, independently, inside the integrity gate (to re-derive and compare against whatever
    label is actually stored) -- the gate never trusts that the constructor ran, or ran correctly, on a
    hand-tampered record. Does not itself validate impact/effort/threshold are in range -- callers run
    ``validate_value_in_scale``/``validate_threshold_in_scale`` first (``classify_ideas`` below does both in
    the right order)."""
    high_impact = impact >= impact_threshold
    high_effort = effort >= effort_threshold
    if high_impact and high_effort:
        return QUADRANT_MAJOR_PROJECTS
    if high_impact and not high_effort:
        return QUADRANT_QUICK_WINS
    if not high_impact and not high_effort:
        return QUADRANT_FILL_INS
    return QUADRANT_AVOID_RECONSIDER


def classify_ideas(
    ideas: list[dict[str, Any]],
    impact_scale: Any,
    effort_scale: Any,
    impact_threshold: Any,
    effort_threshold: Any,
) -> list[dict[str, Any]]:
    """Validates the record's own scale/threshold declarations, then every idea's impact/effort against them
    (fail-closed, rejects out-of-range/mixed-scale input rather than silently normalizing), then classifies
    each via ``classify_quadrant``. Returns a NEW list of ``{id, label, impact, effort, quadrant}`` dicts --
    never mutates ``ideas``. Assumes each entry's SHAPE (id/label are non-empty strings, impact/effort keys
    present) was already checked by the caller -- same split ``mcda/scoring.py``'s own ``normalize_scores``
    already establishes relative to ``modules/decision/mcda.py``'s own shape checks."""
    validate_scale(impact_scale, "impact")
    validate_scale(effort_scale, "effort")
    validate_threshold_in_scale(impact_threshold, impact_scale, "impact")
    validate_threshold_in_scale(effort_threshold, effort_scale, "effort")

    classified: list[dict[str, Any]] = []
    for entry in ideas:
        idea_id = entry.get("id", "?")
        impact, effort = entry["impact"], entry["effort"]
        validate_value_in_scale(impact, impact_scale, "impact", idea_id)
        validate_value_in_scale(effort, effort_scale, "effort", idea_id)
        quadrant = classify_quadrant(impact, effort, impact_threshold, effort_threshold)
        classified.append({"id": entry["id"], "label": entry["label"], "impact": impact, "effort": effort, "quadrant": quadrant})
    return classified
