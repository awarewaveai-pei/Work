"""``decision.weighted_decision_matrix`` -- Method Atlas slice, 7th member of the `decision` family (F16),
after `decision.ahp`, `decision.mcda`, `decision.impact_effort`, `decision.ice`, `decision.rice`,
`decision.moscow`.

Atlas gives this method TWO independent, agreeing citations: a dedicated section, §12.33 (L2969-2986,
"Options x Criteria x Weights -> Scores -> Sensitivity -> Decision", 6 nodes), and the F16 tool-table row
(L766: "criteria→weights→scores→sensitivity｜透明化 trade-off"). Both chapters differ from
`decision.mcda`'s own two citations (Atlas §11.32 L1942-1969, F16 row L768) in one load-bearing way:
NEITHER WDM citation names a Normalize stage, while BOTH MCDA citations do (§11.32's own mermaid node
`C[Weights] --> D[Normalize]`, L1956; F16 L768's own "criteria→normalize→weights→score→sensitivity").
This is the CENTRAL due-diligence finding of this slice (task-mandated, same rigor
`architecture.trade_off_matrix.contract.yaml`'s own verification section applied to a DIFFERENT F18 row
and reached the OPPOSITE conclusion for): read in full before this module was written --
`ai_lego/modules/decision/mcda.py`, `methods/contracts/decision.mcda.contract.yaml`, and
`methods/contracts/architecture.trade_off_matrix.contract.yaml` (the precedent for a genuine MCDA
duplicate, contract-only, no new module). WDM is NOT that: it is the textbook "Weighted Sum Model" /
Pugh-matrix-style direct scoring technique -- every criterion is rated on ONE common, caller-declared
bounded scale (e.g. 1-5) chosen ahead of time, so no per-criterion min-max rescaling is needed or
performed, unlike MCDA's own heterogeneous-raw-unit normalization. This also means `criteria` here carry
NO `direction` field (maximize/minimize) -- direction is the caller's own scoring discipline (always rate
higher-value-on-the-common-scale as better), not a schema field.

Reuses, not reinvented: the Score stage reuses ``ai_lego.compute.ahp.weights.rank_options`` UNCHANGED --
the SAME function ``decision.ahp`` and ``decision.mcda`` already reuse, now exercised by a THIRD family
member (nothing AHP-specific in its own implementation: a plain criterion-weight dict plus a plain
per-option-per-criterion score list -> sorted ranking). Weight validation reuses
``ai_lego.compute.mcda.scoring.validate_weights_sum_to_one`` UNCHANGED -- its own logic (criterion-id
lookup, non-negative check, sum-to-1 check) has nothing MCDA-specific in it either, the first reuse of
this particular function outside the module it was written for. The ONE genuinely new compute primitive
is ``ai_lego/compute/weighted_decision_matrix/scoring.py::validate_scores_within_common_scale`` -- the
structural reason Normalize can be safely skipped.

``forbidden_transition: ["Automatic Authority"]`` in this method's own contract is INFERRED, not
table-cited (Atlas §22.3's gate table, L4142-4155, grep-confirmed has no Weighted Decision Matrix row --
only MCDA, L4154). The inference is grounded in Atlas §12.33's own L2985 limitation text: "高風險決策要補
hard constraints、scenario 與 stakeholder weights" (high-risk decisions need to ADD hard
constraints/scenario/stakeholder weights before this analysis is sufficient) -- the same inference class
``decision.impact_effort.contract.yaml``'s own L1906-grounded rule already applies ("它只適合初篩；高風險方案不能只靠這張圖決策"),
not a verbatim "decision aid, not authority" citation like ``decision.rice``'s own L2965 quote.
``FORBIDDEN_AUTHORITY_KEYS`` and ``assert_no_automatic_authority_claim`` below are independently
re-derived (not imported) -- same discipline every sibling module in this family with a populated
``forbidden_transition`` (mcda.py, rice.py, impact_effort.py) already establishes: this is method-specific
business logic, not generic compute.

TWO real, independently-enforced invariants (construction AND gate, same "raise before construction" /
"re-derive, don't trust" two-layer discipline every prior module in this package uses):

1. **Score-matrix integrity** (`WDM_INCOMPLETE_SCORE_MATRIX`, `WDM_SCORE_OUT_OF_SCALE`): ``scores[]`` must
   contain EXACTLY one entry per ``(option_id, criterion_id)`` pair -- every option scored on every
   criterion, no duplicates, no missing cells -- and every entry's own ``value`` must fall within the
   declared common ``[scale_min, scale_max]``. A missing cell would silently under-weight that option for
   that criterion in the direct weighted sum (there is no Normalize stage here to make the gap visible the
   way a missing raw_scores entry would at least skew decision.mcda's own per-criterion min/max) -- a real,
   catchable defect this method's own simpler shape makes worth gating, not inherited from MCDA (which has
   no equivalent completeness check of its own; see `mcda.py` -- not touched by this module).
2. **No automatic authority** (`WDM_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN`): same two-layer belt-and-suspenders
   `decision.mcda`/`decision.rice`/`decision.impact_effort` already establish for their own populated
   `forbidden_transition`.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.compute.ahp.weights import rank_options
from ai_lego.compute.mcda.scoring import validate_weights_sum_to_one
from ai_lego.compute.weighted_decision_matrix.scoring import validate_scores_within_common_scale
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "decision.weighted_decision_matrix"
RECORD_ID_PREFIX = "WDM-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.weighted_decision_matrix.scoring.validate_scores_within_common_scale"
# Same representative-blocklist-plus-structural-second-layer design challenge.red_team.py's own
# FORBIDDEN_AUTHORITY_KEYS established, independently re-derived here (not imported) -- see module
# docstring for why this method's own forbidden_transition is inferred, not table-cited, and why that
# does not change the enforcement discipline.
FORBIDDEN_AUTHORITY_KEYS = frozenset({"approved", "decision", "final_decision", "automatic_decision", "authorized", "outcome"})

_KNOWN_OPTION_KEYS = frozenset({"id", "label"})
_KNOWN_CRITERION_KEYS = frozenset({"id", "label"})
_KNOWN_SCORE_KEYS = frozenset({"option_id", "criterion_id", "value"})
_KNOWN_WEIGHT_KEYS = frozenset({"criterion_id", "weight"})
_KNOWN_RANKING_KEYS = frozenset({"option_id", "weighted_score"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_finite_number(value: Any) -> bool:
    """Same bool/NaN/inf exclusion discipline every prior module in this package applies (e.g.
    root_cause.fault_tree's own ``_is_valid_probability``) -- kept as a small, local, independently
    re-derived copy of ``ai_lego.compute.weighted_decision_matrix.scoring``'s own private helper of the
    same name, not a cross-module import of a leading-underscore name (this package's own convention:
    modules import PUBLIC compute functions only -- normalize_scores, rank_options,
    validate_weights_sum_to_one -- never a compute module's private helpers)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- NEVER Python's own recursive ``repr()``, same
    discipline ``root_cause.fault_tree``'s own ``_shallow_describe`` uses (a bare recursive repr over
    caller-supplied input of unknown size is itself a small denial-of-service surface in an error path)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _option_is_valid(item: Any) -> bool:
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_OPTION_KEYS:
        return False
    return _is_nonempty_str(item.get("id")) and _is_nonempty_str(item.get("label"))


def _criterion_is_valid(item: Any) -> bool:
    """NO direction field -- see module docstring for why this is the real, disclosed difference from
    decision.mcda's own criteria[] shape, not an oversight."""
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_CRITERION_KEYS:
        return False
    return _is_nonempty_str(item.get("id")) and _is_nonempty_str(item.get("label"))


def _score_entry_shape_is_valid(entry: Any) -> bool:
    """Shape only (keys, id types, value is a finite number). Range-against-scale and matrix completeness
    are checked separately (invariant #1) -- three independent predicates, same "each failure names its
    own specific bug class" discipline root_cause.fault_tree's own three-way gate/shape/reference split
    already establishes."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_SCORE_KEYS:
        return False
    return _is_nonempty_str(entry.get("option_id")) and _is_nonempty_str(entry.get("criterion_id")) and _is_finite_number(entry.get("value"))


def _weight_entry_shape_is_valid(entry: Any) -> bool:
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_WEIGHT_KEYS:
        return False
    return _is_nonempty_str(entry.get("criterion_id")) and _is_finite_number(entry.get("weight"))


def _score_matrix_violations(scores: list[dict[str, Any]], option_ids: list[str], criterion_ids: list[str]) -> list[str]:
    """Invariant #1, completeness half: returns every way ``scores`` fails to contain EXACTLY one entry per
    ``(option_id, criterion_id)`` pair drawn from the record's own ``options``/``criteria`` -- unknown ids,
    duplicates, and missing cells are each reported by name. Empty list means the matrix is complete.
    Precondition: every entry already passed ``_score_entry_shape_is_valid``."""
    known_options, known_criteria = set(option_ids), set(criterion_ids)
    violations: list[str] = []
    unknown_option = {e["option_id"] for e in scores} - known_options
    if unknown_option:
        violations.append(f"score(s) reference unknown option_id(s) {sorted(unknown_option)}")
    unknown_criterion = {e["criterion_id"] for e in scores} - known_criteria
    if unknown_criterion:
        violations.append(f"score(s) reference unknown criterion_id(s) {sorted(unknown_criterion)}")
    pairs = [(e["option_id"], e["criterion_id"]) for e in scores]
    duplicates = sorted({p for p in pairs if pairs.count(p) > 1})
    if duplicates:
        violations.append(f"duplicate (option_id, criterion_id) pair(s) {duplicates}")
    if not unknown_option and not unknown_criterion:
        expected_pairs = {(o, c) for o in option_ids for c in criterion_ids}
        missing = sorted(expected_pairs - set(pairs))
        if missing:
            violations.append(f"missing (option_id, criterion_id) pair(s) {missing}")
    return violations


def assert_no_automatic_authority_claim(record: dict[str, Any]) -> None:
    """Enforces this method's own INFERRED forbidden_transition (see module docstring) structurally BEFORE
    the record is returned/persisted -- same 'raise before construction' discipline every forbidden-
    transition guard in this package already applies. Guards ``isinstance(record, dict)`` itself -- a
    non-dict record must fail closed via InvariantViolation, not crash with AttributeError from
    ``record.keys()`` (same guard decision.mcda's own equivalent already applies)."""
    if not isinstance(record, dict):
        raise InvariantViolation(f"WDM_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: record must be a dict, got {type(record).__name__}")
    violations = FORBIDDEN_AUTHORITY_KEYS & record.keys()
    if violations:
        raise InvariantViolation(
            f"WDM_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: top-level key(s) {sorted(violations)} assert automatic/final authority "
            "(Atlas §12.33 L2985: high-risk decisions require adding hard constraints/scenario/stakeholder weights first -- inferred, not table-cited; see method contract)"
        )


def generate_weighted_decision_matrix_analysis(
    analysis_id: str,
    options: list[dict[str, Any]],
    criteria: list[dict[str, Any]],
    scores: list[dict[str, Any]],
    weights: list[dict[str, Any]],
    scale_min: float,
    scale_max: float,
    sensitivity_notes: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/weighted-decision-matrix-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed, in this order: id/version/options/criteria shape and
    id-uniqueness, scale bounds, score-matrix shape, score-matrix completeness (invariant #1a), scale-range
    (invariant #1b, via ``validate_scores_within_common_scale``), weights shape and sum-to-one (via
    ``validate_weights_sum_to_one``), sensitivity_notes. ``ranking`` is ALWAYS computed (via
    ``rank_options``), never accepted as caller input."""
    if not _is_nonempty_str(analysis_id) or not analysis_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"WDM_INVALID_RECORD_ID: analysis_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {analysis_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"WDM_INVALID_VERSION: version must be a string, got {version!r}")

    if not isinstance(options, list) or len(options) < 2 or not all(_option_is_valid(o) for o in options):
        raise InvariantViolation(f"WDM_INVALID_OPTIONS: options must be a list of >= 2 entries with EXACTLY id/label (non-empty strings), got {_shallow_describe(options)}")
    option_ids = [o["id"] for o in options]
    if len(set(option_ids)) != len(option_ids):
        raise InvariantViolation(f"WDM_DUPLICATE_OPTION_ID: id(s) {sorted({i for i in option_ids if option_ids.count(i) > 1})} used more than once across options")

    if not isinstance(criteria, list) or not criteria or not all(_criterion_is_valid(c) for c in criteria):
        raise InvariantViolation(f"WDM_INVALID_CRITERIA: criteria must be a non-empty list of entries with EXACTLY id/label (non-empty strings, no direction), got {_shallow_describe(criteria)}")
    criteria_ids = [c["id"] for c in criteria]
    if len(set(criteria_ids)) != len(criteria_ids):
        raise InvariantViolation(f"WDM_DUPLICATE_CRITERION_ID: id(s) {sorted({i for i in criteria_ids if criteria_ids.count(i) > 1})} used more than once across criteria")

    if not isinstance(scores, list) or not scores or not all(_score_entry_shape_is_valid(s) for s in scores):
        raise InvariantViolation(f"WDM_INVALID_SCORES: scores must be a non-empty list of entries with EXACTLY option_id/criterion_id/value (ids non-empty strings, value a finite number), got {_shallow_describe(scores)}")

    matrix_violations = _score_matrix_violations(scores, option_ids, criteria_ids)
    if matrix_violations:
        raise InvariantViolation(f"WDM_INCOMPLETE_SCORE_MATRIX: {'; '.join(matrix_violations)}")

    validate_scores_within_common_scale(scores, scale_min, scale_max)  # raises WDM_INVALID_SCALE_BOUNDS / WDM_SCORE_OUT_OF_SCALE

    if not isinstance(weights, list) or not weights or not all(_weight_entry_shape_is_valid(w) for w in weights):
        raise InvariantViolation(f"WDM_INVALID_WEIGHTS: weights must be a non-empty list of entries with EXACTLY criterion_id/weight (criterion_id non-empty string, weight a finite number), got {_shallow_describe(weights)}")
    validate_weights_sum_to_one(weights, criteria_ids)  # raises MCDA_UNKNOWN_CRITERION_IN_WEIGHTS / MCDA_NEGATIVE_WEIGHT / MCDA_WEIGHTS_DO_NOT_SUM_TO_ONE

    if not sensitivity_notes or not isinstance(sensitivity_notes, str) or not sensitivity_notes.strip():
        raise InvariantViolation("WDM_SENSITIVITY_NOTES_EMPTY: Atlas §12.33's own pipeline names Sensitivity as a required stage -- disclosure cannot be blank")

    weight_by_criterion = {w["criterion_id"]: w["weight"] for w in weights}
    option_scores_for_ranking = [{"option_id": s["option_id"], "criterion_id": s["criterion_id"], "score": s["value"]} for s in scores]
    ranking = rank_options(weight_by_criterion, option_scores_for_ranking)

    record: dict[str, Any] = {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "options": [dict(o) for o in options],
        "criteria": [dict(c) for c in criteria],
        "scale_min": scale_min,
        "scale_max": scale_max,
        "scores": [dict(s) for s in scores],
        "weights": [dict(w) for w in weights],
        "ranking": ranking,
        "sensitivity_notes": sensitivity_notes,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": provenance,
    }
    assert_no_automatic_authority_claim(record)
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(analysis, dict):
        return _result("provenance_required", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(analysis.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- the same reuse
    ``root_cause.pareto``/``decision.ahp``/``decision.mcda``/``decision.ice`` already established. Guards
    ``isinstance(analysis, dict)`` itself before delegating (defense-in-depth; the shared gate now also
    guards this at its own root, per its own 2026-09-08 fix)."""
    if not isinstance(analysis, dict):
        return _result("genuine_compute", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(analysis)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_sensitivity_disclosed_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Atlas §12.33's own required Sensitivity stage: checks PRESENCE of a non-empty sensitivity disclosure
    only -- not any particular methodology or correctness (see method contract's own OQ-WDM-1)."""
    if not isinstance(analysis, dict):
        return _result("sensitivity_disclosed", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    notes = analysis.get("sensitivity_notes")
    passed = isinstance(notes, str) and bool(notes.strip())
    return _result("sensitivity_disclosed", passed, [{"sensitivity_notes_present": passed}], validator, timestamp)


def evaluate_no_automatic_authority_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks this method's own forbidden_transition structurally on any record handed to it -- not just
    trusting that ``generate_weighted_decision_matrix_analysis``'s own construction-time check already ran
    (a hand-crafted/tampered record must still be caught, same discipline every sibling gate applies)."""
    try:
        assert_no_automatic_authority_claim(analysis)
        return _result("no_automatic_authority_claim", True, [{"checked_keys": sorted(FORBIDDEN_AUTHORITY_KEYS)}], validator, timestamp)
    except InvariantViolation as error:
        return _result("no_automatic_authority_claim", False, [{"error": str(error)}], validator, timestamp)


def evaluate_score_matrix_integrity_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1, gate side: re-derives EVERY structural precondition from the record's own raw fields --
    does not trust any stored consistency, including the ranking's own claimed order/values. Bundles shape,
    completeness, scale-range, weight-validity and ranking-correctness under one gate_id, same shape
    ``evaluate_ice_integrity_gate``/``evaluate_fault_tree_integrity_gate`` already use for their own
    families (several distinct structural reasons, one gate_id, each with its own distinguishable evidence
    ``reason``). Checks are ORDERED so the most specific root cause is reported first. FAILS CLOSED on
    malformed input rather than crashing."""
    if not isinstance(analysis, dict):
        return _result("score_matrix_integrity", False, [{"reason": "analysis is not a dict"}], validator, timestamp)

    options = analysis.get("options")
    if not isinstance(options, list) or len(options) < 2 or not all(_option_is_valid(o) for o in options):
        return _result("score_matrix_integrity", False, [{"reason": "options invalid (fewer than 2, malformed, or an entry with unknown/missing keys)"}], validator, timestamp)
    option_ids = [o["id"] for o in options]
    if len(set(option_ids)) != len(option_ids):
        return _result("score_matrix_integrity", False, [{"reason": "duplicate option id"}], validator, timestamp)

    criteria = analysis.get("criteria")
    if not isinstance(criteria, list) or not criteria or not all(_criterion_is_valid(c) for c in criteria):
        return _result("score_matrix_integrity", False, [{"reason": "criteria invalid (empty, malformed, or an entry with unknown/missing keys, e.g. a stray direction field)"}], validator, timestamp)
    criteria_ids = [c["id"] for c in criteria]
    if len(set(criteria_ids)) != len(criteria_ids):
        return _result("score_matrix_integrity", False, [{"reason": "duplicate criterion id"}], validator, timestamp)

    scale_min, scale_max = analysis.get("scale_min"), analysis.get("scale_max")
    if not _is_finite_number(scale_min) or not _is_finite_number(scale_max) or scale_max <= scale_min:
        return _result("score_matrix_integrity", False, [{"reason": "scale_min/scale_max missing, non-numeric, or scale_max not strictly greater than scale_min"}], validator, timestamp)

    scores = analysis.get("scores")
    if not isinstance(scores, list) or not scores or not all(_score_entry_shape_is_valid(s) for s in scores):
        return _result("score_matrix_integrity", False, [{"reason": "scores invalid (empty, malformed, or an entry with unknown/missing keys)"}], validator, timestamp)

    matrix_violations = _score_matrix_violations(scores, option_ids, criteria_ids)
    if matrix_violations:
        return _result("score_matrix_integrity", False, [{"reason": "score matrix incomplete or malformed", "details": matrix_violations}], validator, timestamp)

    try:
        validate_scores_within_common_scale(scores, scale_min, scale_max)
    except InvariantViolation as error:
        return _result("score_matrix_integrity", False, [{"reason": "score out of declared scale", "error": str(error)}], validator, timestamp)

    weights = analysis.get("weights")
    if not isinstance(weights, list) or not weights or not all(_weight_entry_shape_is_valid(w) for w in weights):
        return _result("score_matrix_integrity", False, [{"reason": "weights invalid (empty, malformed, or an entry with unknown/missing keys)"}], validator, timestamp)
    try:
        validate_weights_sum_to_one(weights, criteria_ids)
    except InvariantViolation as error:
        return _result("score_matrix_integrity", False, [{"reason": "weights invalid", "error": str(error)}], validator, timestamp)

    ranking = analysis.get("ranking")
    if not isinstance(ranking, list) or len(ranking) != len(options) or not all(isinstance(r, dict) and set(r.keys()) == _KNOWN_RANKING_KEYS for r in ranking):
        return _result("score_matrix_integrity", False, [{"reason": "ranking malformed or wrong length"}], validator, timestamp)
    weight_by_criterion = {w["criterion_id"]: w["weight"] for w in weights}
    option_scores_for_ranking = [{"option_id": s["option_id"], "criterion_id": s["criterion_id"], "score": s["value"]} for s in scores]
    recomputed_ranking = rank_options(weight_by_criterion, option_scores_for_ranking)
    if ranking != recomputed_ranking:
        return _result("score_matrix_integrity", False, [{"reason": "stored ranking does not match a fresh recomputation from this record's own scores/weights"}], validator, timestamp)

    return _result("score_matrix_integrity", True, [{"option_count": len(options), "criterion_count": len(criteria), "score_count": len(scores)}], validator, timestamp)


def evaluate_weighted_decision_matrix_gates(analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(analysis, validator, timestamp),
        evaluate_genuine_compute_gate(analysis, validator, timestamp),
        evaluate_sensitivity_disclosed_gate(analysis, validator, timestamp),
        evaluate_no_automatic_authority_gate(analysis, validator, timestamp),
        evaluate_score_matrix_integrity_gate(analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
