"""Dispatch adapter for ``architecture.trade_off_matrix``.

Atlas F18's Trade-off Matrix is field-for-field the same method as
``decision.mcda``. The contract reuses MCDA's typed output and invariants;
this module supplies only the method-owned dispatch surface, with no second
scoring algorithm.
"""

from __future__ import annotations

from typing import Any

from ai_lego.modules.decision.mcda import evaluate_mcda_gates, generate_mcda_analysis

METHOD_ID = "architecture.trade_off_matrix"
RECORD_ID_PREFIX = "MCDA-"
# Value MUST match typed-objects/mcda-analysis.schema.yaml's own `id` pattern (`^MCDA-`) -- this module wraps
# generate_mcda_analysis() directly (see module docstring: "field-for-field the same method as
# decision.mcda"), so a record built here really is an MCDA record under the hood, not a distinct
# architecture-trade-off-matrix-* shape. An earlier draft of this line used "TRADEOFFMATRIX-" (a mechanical
# transliteration of the method name that ignored the reused schema; critic-caught 2026-09-18, see the
# same-day WORKLOG entry for the other modules this exact mistake was found in). Not load-bearing for API
# auto-injection (identity param is the domain-specific analysis_id, not `record_id`) -- exists only for the
# dashboard's opt-in id-suggest button. See atam.py's own RECORD_ID_PREFIX comment for the full rationale
# (2026-09-18).


def generate_trade_off_matrix(
    analysis_id: str,
    options: list[dict[str, Any]],
    criteria: list[dict[str, Any]],
    raw_scores: list[dict[str, Any]],
    weights: list[dict[str, Any]],
    sensitivity_notes: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Run the canonical MCDA implementation with this method's identity."""
    return generate_mcda_analysis(
        analysis_id, options, criteria, raw_scores, weights, sensitivity_notes,
        provenance, version=version, generated_by_method=generated_by_method,
    )


def evaluate_trade_off_matrix_gates(
    analysis: dict[str, Any], validator: str, timestamp: str,
) -> list[dict[str, Any]]:
    """Run the canonical MCDA gate set; no gate logic is duplicated here."""
    return evaluate_mcda_gates(analysis, validator, timestamp)
