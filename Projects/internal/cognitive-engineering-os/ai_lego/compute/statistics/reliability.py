"""Inter-rater reliability -- Cohen's Kappa with a deterministic bootstrap interval.

This is the Trusted Compute step of the Research slice (EC §39: an LLM must
never "mentally calculate" a value and label it CALCULATED_RESULT). The
statistic is computed here, by code, and the result record says so.

Interpretation bands follow Landis & Koch (1977), the scale
``capabilities/contracts/run_statistics.capability.yaml`` names. The
acceptance threshold (``kappa_min``) is deliberately NOT applied: that contract
leaves it ``OPERATOR_SET_PENDING`` and this module does not invent one.
"""

from __future__ import annotations

import random
from collections import Counter
from typing import Any

from ai_lego.errors import InvariantViolation

LANDIS_KOCH_BANDS: tuple[tuple[float | None, float, str], ...] = (
    (None, 0.0, "poor"),
    (0.0, 0.20, "slight"),
    (0.20, 0.40, "fair"),
    (0.40, 0.60, "moderate"),
    (0.60, 0.80, "substantial"),
    (0.80, 1.0, "almost_perfect"),
)


def cohens_kappa(coder_a: list[str], coder_b: list[str]) -> float:
    if len(coder_a) != len(coder_b) or not coder_a:
        raise InvariantViolation("KAPPA_INPUT_INVALID: equally-sized, non-empty label sequences required")
    total = len(coder_a)
    observed = sum(left == right for left, right in zip(coder_a, coder_b)) / total
    count_a, count_b = Counter(coder_a), Counter(coder_b)
    expected = sum((count_a[label] / total) * (count_b[label] / total) for label in set(count_a) | set(count_b))
    if expected == 1:
        raise InvariantViolation("KAPPA_UNDEFINED: expected agreement is one")
    return (observed - expected) / (1 - expected)


def bootstrap_kappa_ci(coder_a: list[str], coder_b: list[str], samples: int = 2000, seed: int = 20260831) -> tuple[float, float]:
    """Percentile bootstrap 95% interval with a fixed seed (replayable, not a random number)."""
    rng = random.Random(seed)
    values: list[float] = []
    for _ in range(samples):
        indices = [rng.randrange(len(coder_a)) for _ in coder_a]
        try:
            values.append(cohens_kappa([coder_a[i] for i in indices], [coder_b[i] for i in indices]))
        except InvariantViolation:
            continue
    if len(values) < 100:
        raise InvariantViolation("KAPPA_BOOTSTRAP_INSUFFICIENT: fewer than 100 valid resamples")
    values.sort()
    return values[int(0.025 * len(values))], values[int(0.975 * len(values)) - 1]


def landis_koch_band(kappa: float) -> str:
    for lower, upper, label in LANDIS_KOCH_BANDS:
        if (lower is None or kappa >= lower) and (kappa < upper or (upper == 1.0 and kappa == 1.0)):
            return label
    return "poor"


def interrater_reliability_result(coder_a: list[str], coder_b: list[str], seed: int = 20260831) -> dict[str, Any]:
    """The StatisticsCalculated payload: a CALCULATED_RESULT produced by deterministic compute."""
    kappa = cohens_kappa(coder_a, coder_b)
    ci_low, ci_high = bootstrap_kappa_ci(coder_a, coder_b, seed=seed)
    return {
        "statistic": "cohens_kappa",
        "kappa": round(kappa, 8),
        "confidence_interval_95": [round(ci_low, 8), round(ci_high, 8)],
        "interpretation_landis_koch_1977": landis_koch_band(kappa),
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": "ai_lego.compute.statistics.reliability.cohens_kappa",
        "coding_unit_count": len(coder_a),
        "coding_labels": sorted(set(coder_a) | set(coder_b)),
        "provenance": {"epistemic_type": "CALCULATED_RESULT", "authorship_state": "AI_GENERATED", "locked": None},
        "operator_threshold_status": "OPERATOR_SET_PENDING",
    }
