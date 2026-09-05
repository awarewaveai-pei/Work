"""Stress-test cliff-finding arithmetic -- deterministic compute, backing ``devops_sre.stress_test``.

Atlas's own formula (F19 tool table, L854: "超過預期負載→觀察
cliff/recovery") asks a SEARCH question over an escalating ladder of
measurements: which is the FIRST step, by order, whose own latency or
error rate breaches a caller-supplied breaking-point definition? Same
Trusted Compute discipline every prior genuine-compute module in this
package already established -- the function here is pure, order-
preserving search, hand-verified against known cases (see this module's
own unit tests) before ``ai_lego/modules/devops_sre/stress_test.py``
calls it.

Deliberately does NOT judge `recovery.recovered` here -- that is a
single boolean comparison against the same thresholds, kept in the
calling module alongside its own shared predicates rather than split
across two modules for one two-line check.
"""

from __future__ import annotations

import math
from typing import Any


def find_breaking_point(load_steps: list[dict[str, Any]], latency_p95_ms_max: float, error_rate_max: float) -> dict[str, Any] | None:
    """Atlas's own 'observe cliff' formula step: the FIRST entry in ``load_steps`` (by ORDER, not by
    re-sorting -- the caller's own escalating sequence IS the search order) whose own ``latency_p95_ms``
    exceeds ``latency_p95_ms_max`` OR whose own ``error_rate`` exceeds ``error_rate_max``. Returns
    ``{"step_index": i, "load_rps": load_steps[i]["load_rps"]}`` for the first breach, or ``None`` if no step
    breaches either threshold -- an honest "no cliff found within the tested range" result, not a fallback
    guess.

    Every step in ``load_steps`` is assumed already validated (well-shaped, finite, in-range) by the caller's
    own shared predicates -- this function trusts ``latency_p95_ms``/``error_rate`` are present and numeric,
    the same division-of-responsibility every prior genuine-compute module in this package draws between its
    own arithmetic and its caller's own shape validation.
    """
    if not isinstance(load_steps, list) or len(load_steps) < 2:
        raise ValueError(f"STRESSTEST_ANALYSIS_INVALID_LADDER: load_steps must be a list of at least 2 measurements, got {load_steps!r}")
    if not (isinstance(latency_p95_ms_max, (int, float)) and not isinstance(latency_p95_ms_max, bool) and math.isfinite(latency_p95_ms_max) and latency_p95_ms_max > 0):
        raise ValueError(f"STRESSTEST_ANALYSIS_INVALID_THRESHOLD: latency_p95_ms_max must be a finite number > 0, got {latency_p95_ms_max!r}")
    if not (isinstance(error_rate_max, (int, float)) and not isinstance(error_rate_max, bool) and math.isfinite(error_rate_max) and 0 <= error_rate_max <= 1):
        raise ValueError(f"STRESSTEST_ANALYSIS_INVALID_THRESHOLD: error_rate_max must be a finite fraction in [0, 1], got {error_rate_max!r}")

    for index, step in enumerate(load_steps):
        if step["latency_p95_ms"] > latency_p95_ms_max or step["error_rate"] > error_rate_max:
            return {"step_index": index, "load_rps": step["load_rps"]}
    return None
