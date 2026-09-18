"""``decision.mcda`` -- tenth Method Atlas slice, second from the ``decision`` family (F16), the natural
extension of ``decision.ahp`` this session's own docs and TASKS.md already named as a candidate.

Third genuine-compute method this session builds squarely on new compute
(after ``root_cause.pareto`` and ``decision.ahp``), but reuses more than
it adds: only ``normalize_scores`` (``ai_lego/compute/mcda/scoring.py``)
is new. The Score stage reuses
``ai_lego.compute.ahp.weights.rank_options`` UNCHANGED -- a generic
weighted-sum ranker with nothing AHP-specific in its own implementation,
the first time this session reuses a SCORING function (not just a
validation gate) across method families.

``evaluate_genuine_compute_gate`` reuses ``modules.research.gates.evaluate_statistical_gate``
UNCHANGED for the THIRD time this session (``root_cause.pareto`` first,
``decision.ahp`` second) -- a fourth method family in a row leaning on a
gate written for an entirely different original purpose (Cohen's Kappa).

Atlas §22.3's own Method-specific Gate table (L4154) forbids this
method's output from claiming "Automatic Authority" -- enforced here the
same two-layer way ``challenge.red_team`` already established for its own
table-cited no-final-authority rule (L4152): ``assert_no_automatic_authority_claim``
raises before construction, and ``mcda-analysis.schema.yaml``'s own
``additionalProperties: false`` independently refuses a hand-crafted
bypass.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.ahp.weights import rank_options
from ai_lego.compute.mcda.scoring import normalize_scores, validate_weights_sum_to_one
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate, genuine_compute_provenance

METHOD_ID = "decision.mcda"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.mcda.scoring.normalize_scores"
# Keys that would assert automatic/final authority over the decision this analysis feeds -- Atlas §22.3 (L4154)
# forbids this method's output from ever carrying any of them. Same representative-blocklist-plus-structural-
# second-layer design challenge.red_team.py's own FORBIDDEN_AUTHORITY_KEYS already established, independently
# re-derived here (not imported from that module -- see mcda-analysis.schema.yaml's own compilation_decisions
# for why compute-layer functions are shared across families but method-specific business logic is not).
FORBIDDEN_AUTHORITY_KEYS = frozenset({"approved", "decision", "final_decision", "automatic_decision", "authorized", "outcome"})


def assert_no_automatic_authority_claim(record: dict[str, Any]) -> None:
    """Atlas §22.3 L4154's own rule ('MCDA | 禁止直接輸出: Automatic Authority'), checked structurally BEFORE the
    record is returned/persisted -- same 'raise before construction' discipline every forbidden-transition guard
    this session built already applies. Guards ``isinstance(record, dict)`` itself -- a non-dict record must
    fail closed via InvariantViolation, not crash with AttributeError from ``record.keys()`` (the same guard
    ``decision.impact_effort``'s own independently-derived equivalent already applies)."""
    if not isinstance(record, dict):
        raise InvariantViolation(f"MCDA_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: record must be a dict, got {type(record).__name__}")
    violations = FORBIDDEN_AUTHORITY_KEYS & record.keys()
    if violations:
        raise InvariantViolation(f"MCDA_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: top-level key(s) {sorted(violations)} assert automatic/final authority (Atlas §22.3 L4154: MCDA may not directly output Automatic Authority)")


def generate_mcda_analysis(
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
    """Instance of ``typed-objects/mcda-analysis.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed
    (criterion directions validated by ``normalize_scores``, weights
    validated by ``validate_weights_sum_to_one``). ``normalized_scores``
    and ``ranking`` are computed, never asserted.
    """
    if len(options) < 2:
        raise InvariantViolation(f"MCDA_TOO_FEW_OPTIONS: {len(options)} supplied, at least 2 required to rank")
    if not criteria:
        raise InvariantViolation("MCDA_NO_CRITERIA: at least 1 criterion required")
    if not sensitivity_notes or not sensitivity_notes.strip():
        raise InvariantViolation("MCDA_SENSITIVITY_NOTES_EMPTY: Atlas §22.3's own required-verification column names Sensitivity -- disclosure cannot be blank")

    criteria_ids = [c["id"] for c in criteria]
    validate_weights_sum_to_one(weights, criteria_ids)
    normalized = normalize_scores(raw_scores, criteria)

    weight_by_criterion = {entry["criterion_id"]: entry["weight"] for entry in weights}
    option_scores_for_ranking = [{"option_id": entry["option_id"], "criterion_id": entry["criterion_id"], "score": entry["normalized_value"]} for entry in normalized]
    ranking = rank_options(weight_by_criterion, option_scores_for_ranking)

    record: dict[str, Any] = {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "options": list(options),
        "criteria": list(criteria),
        "raw_scores": list(raw_scores),
        "weights": list(weights),
        "normalized_scores": normalized,
        "ranking": ranking,
        "sensitivity_notes": sensitivity_notes,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": genuine_compute_provenance(provenance),
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
    return _result("provenance_required", passed, [{"provenance": analysis.get("provenance")}], validator, timestamp)


def evaluate_genuine_compute_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Reuses ``modules.research.gates.evaluate_statistical_gate`` UNCHANGED -- the same reuse
    ``modules.root_cause.pareto`` and ``modules.decision.ahp`` already proved, now exercised by a fourth,
    unrelated method family. Guards ``isinstance(analysis, dict)`` itself before delegating -- ``decision
    .impact_effort``'s own identically-shaped gate already documented this gate as lacking it and crashing with
    AttributeError (``dict.get`` called on a non-dict) instead of failing closed; fixed here to match."""
    if not isinstance(analysis, dict):
        return _result("genuine_compute", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(analysis)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_sensitivity_disclosed_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Atlas §22.3 L4154's own required-verification column: 'Human Judgment + Sensitivity'. Checks PRESENCE of a
    non-empty sensitivity disclosure only -- not any particular methodology or correctness (see method contract's
    own compilation_decisions/OQ-MCDA-2 for why disclosure, not a computed formula)."""
    if not isinstance(analysis, dict):
        return _result("sensitivity_disclosed", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    notes = analysis.get("sensitivity_notes")
    passed = isinstance(notes, str) and bool(notes.strip())
    return _result("sensitivity_disclosed", passed, [{"sensitivity_notes_present": passed}], validator, timestamp)


def evaluate_no_automatic_authority_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks Atlas §22.3's rule structurally on any record handed to it -- not just trusting that
    generate_mcda_analysis's own construction-time check already ran (a hand-crafted/tampered record must still
    be caught, same discipline challenge.red_team's own gate-re-derivation already established)."""
    try:
        assert_no_automatic_authority_claim(analysis)
        return _result("no_automatic_authority_claim", True, [{"checked_keys": sorted(FORBIDDEN_AUTHORITY_KEYS)}], validator, timestamp)
    except InvariantViolation as error:
        return _result("no_automatic_authority_claim", False, [{"error": str(error)}], validator, timestamp)


def evaluate_mcda_gates(analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(analysis, validator, timestamp),
        evaluate_genuine_compute_gate(analysis, validator, timestamp),
        evaluate_sensitivity_disclosed_gate(analysis, validator, timestamp),
        evaluate_no_automatic_authority_gate(analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
