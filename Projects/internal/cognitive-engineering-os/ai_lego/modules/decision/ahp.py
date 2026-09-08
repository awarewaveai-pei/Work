"""``decision.ahp`` -- seventh Method Atlas slice, first from the ``decision`` family (F16), and the first
standalone decision method this session built (not chained off a ``CauseHypothesisSet``).

Second genuine-compute method after ``root_cause.pareto`` (Master Plan
§39: an LLM must never "mentally calculate" a value and label it
CALCULATED_RESULT), but mathematically richer: pairwise-comparison matrix
construction, geometric-mean weight derivation, and Saaty's own published
consistency-ratio check (``ai_lego/compute/ahp/weights.py``, hand-verified
against a known perfectly-consistent case before being wired in here).

``evaluate_genuine_compute_gate`` reuses ``modules.research.gates.evaluate_statistical_gate``
UNCHANGED for the SECOND time this session (``root_cause.pareto`` was the
first) -- the third method family in a row to lean on a gate written for
an entirely different original purpose (Cohen's Kappa), because it only
ever inspected the three generic genuine-compute fields every
CALCULATED_RESULT record in this codebase now carries.

Naming note: this package's path (``ai_lego.modules.decision``) is a
different thing from the ``Decision`` Shared Kernel Domain Object
``docs/architecture/REPOSITORY_ARCHITECTURE.md`` rules belongs only at
``/core/domain/decision`` (no engine vertical needed) -- this module is the
Atlas Method Family for F16 Prioritization/Decision cognitive TECHNIQUES
(AHP, and future siblings like MCDA), not an engine for the Decision
object itself. See that document's 2026-09-04 disambiguation note appended
after its bounded-context table.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.ahp.weights import build_pairwise_matrix, consistency_ratio as compute_consistency_ratio, geometric_mean_weights, rank_options
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "decision.ahp"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.ahp.weights.geometric_mean_weights"
CONSISTENCY_RATIO_THRESHOLD = 0.10


def generate_ahp_analysis(
    analysis_id: str,
    goal: str,
    criteria: list[dict[str, Any]],
    pairwise_comparisons: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    options: list[dict[str, Any]] | None = None,
    option_scores: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/ahp-analysis.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed via
    ``ai_lego.compute.ahp.weights.build_pairwise_matrix`` (exactly
    ``n*(n-1)/2`` comparisons, each on the Saaty 1/9-9 scale). Weights and
    the consistency ratio are computed, never asserted. ``ranking`` is
    computed only when ``options``/``option_scores`` are supplied -- Atlas's
    own pipeline treats Option scoring as downstream of, not required for,
    a complete weight-derivation run.
    """
    criterion_ids = [c["id"] for c in criteria]
    matrix = build_pairwise_matrix(criterion_ids, pairwise_comparisons)
    weights = geometric_mean_weights(matrix)
    _lambda_max, _ci, cr = compute_consistency_ratio(matrix, weights)

    criteria_weights = [{"criterion_id": criterion_id, "weight": weight} for criterion_id, weight in zip(criterion_ids, weights)]

    ranking: list[dict[str, Any]] = []
    if option_scores:
        weight_by_criterion = {entry["criterion_id"]: entry["weight"] for entry in criteria_weights}
        ranking = rank_options(weight_by_criterion, option_scores)

    return {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "goal": goal,
        "criteria": list(criteria),
        "pairwise_comparisons": list(pairwise_comparisons),
        "criteria_weights": criteria_weights,
        "consistency_ratio": round(cr, 8),
        "consistent": cr <= CONSISTENCY_RATIO_THRESHOLD,
        "options": list(options or []),
        "option_scores": list(option_scores or []),
        "ranking": ranking,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(analysis, dict):
        return _result("provenance_required", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(analysis.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": analysis.get("provenance")}], validator, timestamp)


def evaluate_genuine_compute_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- the same reuse
    ``modules.root_cause.pareto`` already proved, now exercised by a second, unrelated method family. Guards
    ``isinstance(analysis, dict)`` itself before delegating -- a non-dict analysis must fail closed, not crash
    with AttributeError (``dict.get`` called on a non-dict), the same fix ``decision.mcda``'s own identically-
    shaped gate now also applies."""
    if not isinstance(analysis, dict):
        return _result("genuine_compute", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(analysis)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_consistency_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Atlas L1938: '權重仍然是 judgment，不是客觀真理' (weights are still judgment, not objective truth) -- Saaty's
    own Consistency Ratio pipeline stage exists precisely to catch judgments too self-contradictory to trust.
    FAILs when consistency_ratio exceeds Saaty's published 0.10 threshold, with the real CR value as evidence."""
    if not isinstance(analysis, dict):
        return _result("consistency_required", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    cr = analysis.get("consistency_ratio")
    consistent = analysis.get("consistent")
    checks = {
        "consistency_ratio_present": isinstance(cr, (int, float)),
        "consistent_flag_matches_threshold": consistent == (isinstance(cr, (int, float)) and cr <= CONSISTENCY_RATIO_THRESHOLD),
        "consistency_ratio_within_saaty_threshold": isinstance(cr, (int, float)) and cr <= CONSISTENCY_RATIO_THRESHOLD,
    }
    return _result("consistency_required", all(checks.values()), [{"consistency_ratio": cr, "threshold": CONSISTENCY_RATIO_THRESHOLD, **checks}], validator, timestamp)


def evaluate_ahp_gates(analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(analysis, validator, timestamp),
        evaluate_genuine_compute_gate(analysis, validator, timestamp),
        evaluate_consistency_gate(analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
