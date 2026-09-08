"""Weighted Decision Matrix -- deterministic compute, backing ``decision.weighted_decision_matrix``.

Same Trusted Compute discipline every prior genuine-compute module in this package establishes
(``compute/mcda/scoring.py``, ``compute/ahp/weights.py``, ``compute/ice/scoring.py``): the one new
primitive here is DECIDED by real code, never asserted.

Atlas §12.33 (L2969-2986) and the F16 tool-table row (L766) both give this method's own pipeline as
``Options x Criteria x Weights -> Scores -> Sensitivity -> Decision`` -- neither citation names a
Normalize stage, unlike ``decision.mcda``'s own two independent citations (Atlas §11.32 L1956, F16 row
L768), which both do. The real, textually-grounded difference this module encodes: Weighted Decision
Matrix scores every option on every criterion directly on ONE common, caller-declared bounded scale
(e.g. 1-5) chosen ahead of time -- so a per-criterion min-max rescaling is neither needed nor performed.
``validate_scores_within_common_scale`` is the one new compute primitive that enforces this structurally;
the Score stage itself reuses ``ai_lego.compute.ahp.weights.rank_options`` UNCHANGED (a third family now
reusing that function -- see ``ai_lego/modules/decision/weighted_decision_matrix.py`` module docstring),
and weight validation reuses ``ai_lego.compute.mcda.scoring.validate_weights_sum_to_one`` UNCHANGED (its
own logic has nothing MCDA-specific in it -- generic criterion-id/non-negative/sums-to-1 checks).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.errors import InvariantViolation


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_scores_within_common_scale(scores: list[dict[str, Any]], scale_min: float, scale_max: float) -> None:
    """Every ``scores[].value`` must fall within ``[scale_min, scale_max]`` -- the structural reason this
    method can skip ``decision.mcda``'s own per-criterion Normalize stage: all criteria are rated on ONE
    common, caller-declared scale by construction, not on heterogeneous per-criterion raw units (cost in
    USD vs. a 1-10 rating). ``scores``: ``[{option_id, criterion_id, value}, ...]``. Re-derivable from the
    record's own persisted fields, never trusted as a stored consistency claim -- same discipline
    ``ai_lego.compute.mcda.scoring.validate_weights_sum_to_one`` already applies to a different field."""
    if not _is_finite_number(scale_min) or not _is_finite_number(scale_max):
        raise InvariantViolation(f"WDM_INVALID_SCALE_BOUNDS: scale_min/scale_max must be finite numbers, got {scale_min!r}/{scale_max!r}")
    if scale_max <= scale_min:
        raise InvariantViolation(f"WDM_INVALID_SCALE_BOUNDS: scale_max ({scale_max!r}) must be strictly greater than scale_min ({scale_min!r})")
    out_of_range = [(entry.get("option_id"), entry.get("criterion_id"), entry.get("value")) for entry in scores if not (_is_finite_number(entry.get("value")) and scale_min <= entry["value"] <= scale_max)]
    if out_of_range:
        raise InvariantViolation(f"WDM_SCORE_OUT_OF_SCALE: {len(out_of_range)} score(s) fall outside the declared common scale [{scale_min}, {scale_max}]: {out_of_range}")
