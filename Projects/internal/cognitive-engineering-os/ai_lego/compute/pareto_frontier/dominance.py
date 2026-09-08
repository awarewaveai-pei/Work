"""Pareto dominance (multi-objective optimization) -- deterministic compute, backing ``decision.pareto_frontier``.

Same Trusted Compute discipline every prior genuine-compute module in this package establishes
(``compute/mcda/scoring.py``, ``compute/rice/scoring.py``, ``compute/impact_effort/classification.py``): the
domination check is DECIDED here, by a real deterministic pairwise algorithm, never asserted by an LLM.

NAMING-COLLISION DUE-DILIGENCE (read ``ai_lego/modules/root_cause/pareto.py`` and
``methods/contracts/root_cause.pareto.contract.yaml`` in full before writing this module): ``root_cause.pareto``
(F05, existing, untouched by this slice) is the CLASSIC "Pareto principle" / 80-20 rule -- a SINGLE-dimension
cumulative-percentage ranking (``compute/pareto/ranking.py::pareto_ranking``, confirmed by direct read: operates
on one ``metric_value`` per dataset record, has no concept of "objectives" (plural) or "domination" anywhere in
its ~68 lines). This module implements a COMPLETELY DIFFERENT, textbook operations-research concept that happens
to share the same economist's name (Vilfredo Pareto) for a real historical reason, not a naming accident:
multi-objective Pareto dominance -- given options scored on 2+ objectives, option A dominates option B iff A is
at least as good as B on EVERY objective AND strictly better on at least one; the non-dominated remainder is
"the Pareto frontier". Zero code or schema is shared between the two; this module lives in its own
``compute/pareto_frontier/`` package specifically so its own ``computation_provenance_ref`` can never be
confused with ``compute/pareto/ranking.py``'s.

Direction-aware comparison (``VALID_DIRECTIONS = {maximize, minimize}``) is the SAME pattern
``compute/mcda/scoring.py::normalize_scores`` already uses for its own per-criterion direction -- independently
re-derived here (not imported), same discipline every cross-family business-logic constant in this codebase
follows (see ``modules/decision/rice.py``'s own comment on why ``FORBIDDEN_AUTHORITY_KEYS`` is re-derived, not
shared, across method modules). Legitimate shared reasoning, not evidence of duplication with MCDA: MCDA
NORMALIZES a direction into a [0,1] score it then WEIGHTS AND SUMS into one number; this module never produces
a score at all -- it only asks a strictly-better-or-not-worse pairwise question per objective, then discards no
option's own raw values (the whole point, per Atlas F16 L772's own benefit column: "不過早壓成單一總分", don't
collapse to a single score too early).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.errors import InvariantViolation

VALID_DIRECTIONS = frozenset({"maximize", "minimize"})
STATUS_ON_FRONTIER = "on_frontier"
STATUS_DOMINATED = "dominated"
VALID_STATUSES = frozenset({STATUS_ON_FRONTIER, STATUS_DOMINATED})


def _is_finite_number(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline every sibling genuine-compute module in this package uses
    (``root_cause.fault_tree``'s own ``_is_valid_probability``, ``decision.impact_effort``'s own
    ``_is_finite_number``): ``True``/``False`` must not silently pass an ``isinstance(value, (int, float))``
    check as if it were 1/0, and NaN/Infinity are not valid RFC 8259 JSON and would make every dominance
    comparison below meaningless."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def dominates(a_values: dict[str, float], b_values: dict[str, float], objectives: list[dict[str, Any]]) -> bool:
    """The real domination-check algorithm: True iff option A Pareto-dominates option B -- A is at least as
    good as B on EVERY objective (direction-aware: higher is better when ``maximize``, lower is better when
    ``minimize``) AND strictly better on at least one. ``a_values``/``b_values``: ``{objective_id: value}``,
    already covering every objective in ``objectives`` (caller's responsibility -- see ``compute_frontier``,
    the only real caller, which builds these maps after validating completeness).

    Pure and stateless -- called fresh for every ordered pair, twice per unordered pair (dominance is not
    symmetric), by ``compute_frontier`` below AND independently again by
    ``modules/decision/pareto_frontier.py::evaluate_frontier_integrity_gate`` (via ``compute_frontier``) --
    never a value either layer trusts as previously computed."""
    at_least_as_good_everywhere = True
    strictly_better_somewhere = False
    for objective in objectives:
        objective_id = objective["id"]
        a_value, b_value = a_values[objective_id], b_values[objective_id]
        if objective["direction"] == "maximize":
            better, worse = a_value > b_value, a_value < b_value
        else:
            better, worse = a_value < b_value, a_value > b_value
        if worse:
            at_least_as_good_everywhere = False
        if better:
            strictly_better_somewhere = True
    return at_least_as_good_everywhere and strictly_better_somewhere


def compute_frontier(
    options: list[dict[str, Any]],
    objectives: list[dict[str, Any]],
    option_values: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Validates the record's own structural preconditions (both real invariants this method exists to
    enforce), then computes ``frontier_classification`` fresh via O(n^2 * m) pairwise comparison (n=options,
    m=objectives) -- genuinely quadratic in option count, disclosed rather than silently assumed cheap (same
    "real algorithm, honest about its own scope" discipline ``root_cause.fault_tree``'s own
    ``_cycle_violations`` docstring establishes for its own worse-than-this exponential case; Method Atlas
    decision-support option sets are small by construction, so this is a non-issue at the intended scale).

    Precondition split with the caller (``modules/decision/pareto_frontier.py``): this function assumes
    ``options``/``objectives``/``option_values`` entries are already SHAPE-valid dicts with the right keys
    present (id/label/direction as non-empty strings, option_id/objective_id/value present) -- the module's
    own ``_objective_shape_is_valid``/``_option_shape_is_valid``/``_value_entry_shape_is_valid`` check that
    BEFORE calling this function, same split ``compute/impact_effort/classification.py::classify_ideas``'s own
    docstring establishes relative to ``modules/decision/impact_effort.py``'s shape checks. This function owns
    the real DOMAIN invariants instead: objective/option count floors, direction enum validity, value
    finiteness, and option_values referential completeness -- called from BOTH construction (an honest run
    computes ``frontier_classification`` this way, with no constructor parameter for it) and the integrity
    gate (which re-invokes this exact function against a record's own raw stored fields and compares the
    result to whatever ``frontier_classification`` the record claims, never trusting that stored value)."""
    if len(objectives) < 2:
        raise InvariantViolation(
            f"PARETOFRONTIER_TOO_FEW_OBJECTIVES: at least 2 objectives are required -- a single-objective "
            f"'frontier' is meaningless (that is sorting, the same operation root_cause.pareto's own "
            f"cumulative-percentage ranking already performs on ONE dimension, not multi-objective dominance), "
            f"got {len(objectives)}"
        )
    bad_directions = sorted({objective.get("direction") for objective in objectives} - VALID_DIRECTIONS)
    if bad_directions:
        raise InvariantViolation(f"PARETOFRONTIER_INVALID_DIRECTION: direction(s) {bad_directions} not in {sorted(VALID_DIRECTIONS)}")
    if len(options) < 2:
        raise InvariantViolation(
            f"PARETOFRONTIER_TOO_FEW_OPTIONS: at least 2 options are required to compare -- a 1-option "
            f"'frontier' is trivially non-dominated with no information content, got {len(options)}"
        )

    objective_ids = {objective["id"] for objective in objectives}
    option_ids = {option["id"] for option in options}

    values_by_option: dict[str, dict[str, float]] = {option_id: {} for option_id in option_ids}
    seen_pairs: set[tuple[str, str]] = set()
    for entry in option_values:
        option_id, objective_id, value = entry["option_id"], entry["objective_id"], entry["value"]
        if option_id not in option_ids:
            raise InvariantViolation(f"PARETOFRONTIER_UNKNOWN_OPTION_IN_VALUES: option_values references option_id {option_id!r} which is not a real options[].id")
        if objective_id not in objective_ids:
            raise InvariantViolation(f"PARETOFRONTIER_UNKNOWN_OBJECTIVE_IN_VALUES: option_values references objective_id {objective_id!r} which is not a real objectives[].id")
        if not _is_finite_number(value):
            raise InvariantViolation(f"PARETOFRONTIER_INVALID_VALUE: option_values entry for option {option_id!r}/objective {objective_id!r} must be a finite number, got {value!r}")
        pair = (option_id, objective_id)
        if pair in seen_pairs:
            raise InvariantViolation(f"PARETOFRONTIER_DUPLICATE_VALUE_ENTRY: option {option_id!r}/objective {objective_id!r} appears more than once in option_values")
        seen_pairs.add(pair)
        values_by_option[option_id][objective_id] = value

    expected_pair_count = len(option_ids) * len(objective_ids)
    if len(seen_pairs) != expected_pair_count:
        missing = sorted({(option_id, objective_id) for option_id in option_ids for objective_id in objective_ids} - seen_pairs)
        raise InvariantViolation(
            f"PARETOFRONTIER_INCOMPLETE_VALUES: option_values must cover every (option_id, objective_id) pair exactly once "
            f"({expected_pair_count} expected, {len(seen_pairs)} given) -- missing {missing}"
        )

    classification: list[dict[str, Any]] = []
    for option in options:
        option_id = option["id"]
        dominators = sorted(
            other["id"]
            for other in options
            if other["id"] != option_id and dominates(values_by_option[other["id"]], values_by_option[option_id], objectives)
        )
        status = STATUS_DOMINATED if dominators else STATUS_ON_FRONTIER
        classification.append({"option_id": option_id, "status": status, "dominated_by": dominators})
    return classification
