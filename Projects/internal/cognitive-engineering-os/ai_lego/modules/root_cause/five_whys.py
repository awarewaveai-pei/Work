"""``root_cause.five_whys`` -- fourth Method Atlas slice, closes the gap ``root_cause.fishbone`` left open.

``methods/contracts/root_cause.fishbone.contract.yaml``'s own OQ-FISHBONE-1
named this as one of exactly 4 methods that can legally validate a
``CauseHypothesisSet`` before promotion to ``RootCauseFact`` -- and
``typed-objects/root-cause-fact.schema.yaml``'s ``legal_promotion_path``
enum already named ``"root_cause.five_whys"`` as a legal value before this
contract existed to back it. The second runtime slice
(``root_cause.fishbone``, 2026-09-04) could only PROVE the forbidden
transition is blocked -- it never had a real validation method to run. This
module is that method, so ``run_five_whys_slice.py`` can complete the chain
for real: fishbone's own ``record_validation_applied`` /
``attempt_promote_to_root_cause_fact`` are reused UNCHANGED.

Atlas §11.5's three named failure modes are operationalized twice, not
once: ``specs/cognitive/typed-objects/five-whys-validation.schema.yaml``
enforces them as hard ``const: false`` schema gates, and this module raises
BEFORE even attempting to construct a record that would fail them --
belt-and-suspenders, same discipline the fishbone forbidden-transition guard
established.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "root_cause.five_whys"
STOP_CONDITIONS = frozenset(
    {"CONTROLLABLE_BY_ORGANIZATION", "CLEAR_EVIDENCE_TO_VERIFY", "FOUND_SYSTEM_PROCESS_MECHANISM", "FURTHER_QUESTIONING_BECOMES_ABSTRACT"}
)


def why_chain_step(step: int, question: str, answer: str, provenance: dict[str, Any], *, supporting_evidence_refs: list[str] | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/five-whys-validation.schema.yaml#/properties/why_chain``."""
    record: dict[str, Any] = {"step": step, "question": question, "answer": answer, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def _compute_declared_without_data(why_chain: list[dict[str, Any]]) -> bool:
    """Atlas L1293's failure mode ('沒有數據仍自信宣告原因' -- confidently declaring a cause with no data) is the ONE
    of the three failure modes this module can check structurally: true only if NOT A SINGLE step in the chain
    carries any supporting_evidence_refs. This is a real computation, not a caller self-attestation -- a caller
    cannot lie their way past it the way they could a free boolean."""
    return not any(step.get("supporting_evidence_refs") for step in why_chain)


def generate_five_whys_validation(
    validation_id: str,
    cause_hypothesis_set: dict[str, Any],
    target_hypothesis_id: str,
    why_chain: list[dict[str, Any]],
    stop_conditions_met: list[str],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    single_path_oversimplifies_multi_causal_problem: bool = False,
    human_carelessness_treated_as_final_cause: bool = False,
) -> dict[str, Any]:
    """Instance of ``typed-objects/five-whys-validation.schema.yaml``.

    Enforces the method contract's own precondition
    (``target_hypothesis_id`` must be a real member of
    ``cause_hypothesis_set.hypotheses[].id``) fail-closed, then the three
    Atlas failure modes -- ``declared_without_data`` is COMPUTED from the
    chain's own evidence refs (see ``_compute_declared_without_data``); the
    other two are the caller's own self-attestation (Atlas gives no
    mechanical test for either, same honesty limit
    ``swot-analysis.schema.yaml``'s OQ-SWOTANALYSIS-2 already disclosed for
    its own un-checkable misuses). Any of the three being true raises HERE,
    before construction -- the schema's own ``const: false`` gates are the
    second, independent layer, not the only one.
    """
    statements = {h["id"]: h.get("statement") for h in cause_hypothesis_set.get("hypotheses", [])}
    hypothesis_ids = set(statements)
    if target_hypothesis_id not in hypothesis_ids:
        raise InvariantViolation(
            f"FIVEWHYS_PRECONDITION_FAILED: target_hypothesis_id {target_hypothesis_id!r} is not a member of "
            f"{cause_hypothesis_set.get('id')}'s hypotheses (methods/contracts/root_cause.five_whys.contract.yaml preconditions)"
        )
    if not why_chain:
        raise InvariantViolation("FIVEWHYS_EMPTY_CHAIN: five-whys-validation.schema.yaml requires why_chain minItems:1")
    if not stop_conditions_met:
        raise InvariantViolation("FIVEWHYS_NO_STOP_CONDITION: at least one Atlas L1282-1287 stop condition must be recorded")
    unknown_conditions = [c for c in stop_conditions_met if c not in STOP_CONDITIONS]
    if unknown_conditions:
        raise InvariantViolation(f"FIVEWHYS_UNKNOWN_STOP_CONDITION: {unknown_conditions} not in {sorted(STOP_CONDITIONS)}")

    failure_mode_self_check = {
        "single_path_oversimplifies_multi_causal_problem": single_path_oversimplifies_multi_causal_problem,
        "human_carelessness_treated_as_final_cause": human_carelessness_treated_as_final_cause,
        "declared_without_data": _compute_declared_without_data(why_chain),
    }
    triggered = [name for name, value in failure_mode_self_check.items() if value]
    if triggered:
        raise InvariantViolation(
            f"FIVEWHYS_FAILURE_MODE_TRIGGERED: {', '.join(triggered)} (Atlas §11.5 L1289-1293 named failure modes) -- "
            "refusing to construct a FiveWhysValidation record that would fail its own schema's const:false gates"
        )

    record = {
        "id": validation_id,
        "version": version,
        "cause_hypothesis_set_ref": cause_hypothesis_set["id"],
        "target_hypothesis_id": target_hypothesis_id,
        "generated_by_method": generated_by_method,
        "why_chain": list(why_chain),
        "stop_conditions_met": list(stop_conditions_met),
        "failure_mode_self_check": failure_mode_self_check,
        "provenance": provenance,
    }
    if isinstance(statements[target_hypothesis_id], str):
        record["target_hypothesis_statement"] = statements[target_hypothesis_id]   # names the cause (its result page sees only it)
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(validation: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every why_chain step carries a schema-valid provenance_record."""
    steps = validation.get("why_chain", [])
    invalid = [s["step"] for s in steps if not provenance_is_valid(s.get("provenance"))]
    passed = bool(steps) and not invalid
    return _result("provenance_required", passed, [{"steps_checked": len(steps), "invalid_provenance_steps": invalid}], validator, timestamp)


def evaluate_evidence_labeling_required_gate(validation: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- an EVIDENCE-labeled step must actually cite evidence,
    same real structural check root_cause.fishbone's and strategy.swot's identical gates use."""
    steps = validation.get("why_chain", [])
    problems: list[dict[str, Any]] = []
    for s in steps:
        epistemic_type = (s.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"step": s.get("step"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not s.get("supporting_evidence_refs"):
            problems.append({"step": s["step"], "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(steps) and not problems
    return _result("evidence_labeling_required", passed, [{"steps_checked": len(steps), "problems": problems}], validator, timestamp)


def evaluate_five_whys_gates(validation: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(validation, validator, timestamp),
        evaluate_evidence_labeling_required_gate(validation, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
