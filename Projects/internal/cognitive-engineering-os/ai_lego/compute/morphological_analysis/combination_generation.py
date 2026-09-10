"""Morphological-analysis legal-combination generation -- deterministic compute, backing
``association.morphological_analysis``.

Atlas F04 table row (L414: "Morphological Analysis｜多維 options 組合｜dimensions→options→合法組合→評估")
and dedicated §11.11 (L1436-1460, 5-step "使用方式") give step 4 as "產生合法 combinations" -- the STRUCTURAL
POINT, per Atlas's own literal verb "產生" (GENERATE), is that legal combinations must be computed, never
merely declared. Same Trusted Compute discipline ``compute/five_w1h/gap_detection.py`` and
``compute/attack_tree/aggregate.py`` already establish for a non-arithmetic but still LLM-must-not-assert
derivation (Atlas §29 rule 6: "數學與統計必須由 Trusted Compute 執行" -- applied here to a combinatorial
enumeration rather than arithmetic or a set derivation).

Called twice for every record's own lifecycle: once at construction
(``ai_lego.modules.association.morphological_analysis.generate_morphological_analysis_record`` computes the
stored ``legal_combinations``/``legal_combination_count`` fields) and once, independently, inside the
integrity gate (to re-derive and compare against whatever is actually stored) -- the gate never trusts that
the constructor ran, or ran correctly, on a hand-tampered record.

SCOPE: this module performs ONLY the enumeration over an ALREADY SHAPE-VALID and ALREADY CAP-CHECKED
``dimensions``/``constraints`` pair -- it does not itself re-validate shape or re-check the combinatorial-
explosion cap (``MAX_RAW_COMBINATION_SPACE``). Both live in
``ai_lego.modules.association.morphological_analysis``, called BEFORE this function, same "validate/cap
first, then compute" split ``compute/attack_tree/aggregate.py``'s own SCOPE note already establishes for
that module's own MAX_TREE_DEPTH check.

Deterministic by construction: ``itertools.product`` iterates the given dimension list in the given order,
and each dimension's own ``options`` list in the given order -- the same input always yields the same
output list in the same order (no floating-point arithmetic or hashing-order dependency of the kind
``compute/attack_tree/aggregate.py``'s own docstring discusses for its own ``sum``-based aggregation; this
is pure discrete filtering over caller-ordered lists).
"""

from __future__ import annotations

import itertools
from typing import Any


def generate_legal_combinations(dimensions: list[dict[str, Any]], constraints: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Full cartesian product over ``dimensions[].options`` (one option chosen per dimension), MINUS every
    combination that violates at least one ``constraints[]`` entry. Each returned combination is a dict
    mapping ``dimension["name"] -> chosen option``, in the order ``itertools.product`` visits them.

    Preconditions (caller's own responsibility, not re-checked here): ``dimensions`` is a list of
    ``{"name": str, "options": list[str]}`` entries with unique names and unique, non-empty options per
    dimension; ``constraints`` is a list of ``{"dimension_a", "option_a", "dimension_b", "option_b"}``
    entries, each referencing real dimension/option pairs; the raw (unfiltered) cartesian product size is
    already confirmed within the caller's own combinatorial-explosion cap.
    """
    names = [dimension["name"] for dimension in dimensions]
    option_lists = [dimension["options"] for dimension in dimensions]
    legal: list[dict[str, str]] = []
    for combo in itertools.product(*option_lists):
        candidate = dict(zip(names, combo))
        if not _violates_any_constraint(candidate, constraints):
            legal.append(candidate)
    return legal


def _violates_any_constraint(candidate: dict[str, str], constraints: list[dict[str, Any]]) -> bool:
    """A candidate combination violates a constraint iff it simultaneously picks BOTH of that constraint's
    named (dimension, option) pairs -- symmetric by construction (the candidate dict already carries both
    dimensions' chosen options regardless of their position in the original ``dimensions`` list), so no
    separate reverse-direction check is needed."""
    return any(candidate.get(c["dimension_a"]) == c["option_a"] and candidate.get(c["dimension_b"]) == c["option_b"] for c in constraints)
