"""``root_cause.fishbone`` -- second method slice, F05 root-cause family (methods/contracts/root_cause.fishbone.contract.yaml).

Deliberately a different shape from ``research.qualitative_coding``: no
open/axial/selective coder-agreement loop, no Kappa, no eval harness. This is
the chain Atlas §14.1 names
``ProblemStatement -> Fishbone -> CauseHypothesisSet -> Evidence Search ->
Causal DAG -> Validation -> RootCauseFact`` -- a single-step hypothesis
generation with a hard type boundary immediately after it.

The contract's ``quality`` block (``provenance_required: true``,
``evidence_labeling_required: true``) is the whole method-specific gate
surface here -- unlike ``research.qualitative_coding.contract.yaml``, this
contract has no separate ``method_specific_gates`` block, so
``evaluate_fishbone_gates`` checks exactly those two declared properties and
invents nothing beyond them.

The contract's own ``forbidden_transition`` (``CauseHypothesisSet ->
FinalCausalFact``) and ``cause-hypothesis-set.schema.yaml``'s
``promotion``/``forbidden_transition`` pair are enforced here as a real,
fail-closed guard: ``attempt_promote_to_root_cause_fact`` raises before a
``RootCauseFact`` record is ever constructed unless the set has actually been
through a validation method (Atlas §11.4 L1267: "Fishbone 只能產生
CauseHypothesisSet，不能直接產生 RootCauseFact") -- the same
"raise-before-any-downstream-write" discipline
``modules/research/gates.py`` and ``platform/ai_execution/capability_resolver.py``
already use, applied to a method that has no eval harness at all.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "root_cause.fishbone"
REQUIRED_PRECONDITION_STATUS = "validated"
FORBIDDEN_TRANSITION_MESSAGE = (
    "FORBIDDEN_TRANSITION_BLOCKED: CauseHypothesisSet -> RootCauseFact direct promotion refused for {chs_id} "
    "(Atlas §9 forbidden_transition CauseHypothesisSet->FinalCausalFact, §11.4 L1267 "
    "'Fishbone 只能產生CauseHypothesisSet，不能直接產生RootCauseFact'; "
    "root-cause-fact.schema.yaml legal_promotion_path.validation_methods_applied requires minItems:1) "
    "-- no validation method has been recorded against this set yet"
)


def build_problem_statement(
    problem_id: str,
    content: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    status: str = REQUIRED_PRECONDITION_STATUS,
    origin_method: str | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/problem-statement.schema.yaml``. ``content`` is the caller's own
    current_state/expected_state/gap/... dict (required keys checked by schema validation, not here)."""
    record: dict[str, Any] = {"id": problem_id, "version": version, "status": status, "content": content, "provenance": provenance}
    if origin_method is not None:
        record["origin_method"] = origin_method
    return record


def cause_hypothesis(hypothesis_id: str, statement: str, category: str, provenance: dict[str, Any], *, supporting_evidence_refs: list[str] | None = None) -> dict[str, Any]:
    """One item of ``cause-hypothesis-set.schema.yaml#/properties/hypotheses``."""
    record: dict[str, Any] = {"id": hypothesis_id, "statement": statement, "category": category, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def generate_cause_hypothesis_set(
    chs_id: str,
    problem_statement: dict[str, Any],
    hypotheses: list[dict[str, Any]],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    suggested_categories: list[str] | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/cause-hypothesis-set.schema.yaml``.

    Enforces the contract's own precondition (``problem_statement.status ==
    validated``, root_cause.fishbone.contract.yaml L51) fail-closed -- a
    CauseHypothesisSet can only be produced from a problem statement that has
    actually cleared review, mirroring ``method_resolver``'s
    registered-before-runnable discipline at the input-data layer instead of
    the method-catalog layer.
    """
    if problem_statement.get("status") != REQUIRED_PRECONDITION_STATUS:
        raise InvariantViolation(
            f"FISHBONE_PRECONDITION_FAILED: problem_statement.status must be "
            f"{REQUIRED_PRECONDITION_STATUS!r}, got {problem_statement.get('status')!r} "
            f"(root_cause.fishbone.contract.yaml preconditions)"
        )
    if not hypotheses:
        raise InvariantViolation("FISHBONE_EMPTY_HYPOTHESIS_SET: cause-hypothesis-set.schema.yaml requires hypotheses minItems:1")
    record: dict[str, Any] = {
        "id": chs_id,
        "version": version,
        "problem_statement_ref": problem_statement["id"],
        "generated_by_method": generated_by_method,
        "hypotheses": list(hypotheses),
        "promotion": {"validation_methods_applied": [], "ready_for_promotion": False},
    }
    summary = (problem_statement.get("content") or {}).get("current_state")
    if isinstance(summary, str) and summary.strip():
        record["problem_summary"] = summary   # the fish's head: the set names its own problem (its result page sees only it)
    if suggested_categories:
        record["suggested_categories"] = list(suggested_categories)
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(cause_hypothesis_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every hypothesis carries a schema-valid provenance_record."""
    hypotheses = cause_hypothesis_set.get("hypotheses", [])
    invalid = [h["id"] for h in hypotheses if not provenance_is_valid(h.get("provenance"))]
    passed = bool(hypotheses) and not invalid
    return _result("provenance_required", passed, [{"hypotheses_checked": len(hypotheses), "invalid_provenance_ids": invalid}], validator, timestamp)


def evaluate_evidence_labeling_required_gate(cause_hypothesis_set: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- Atlas §11.4 step 4 (L1256): every candidate cause
    must be labeled Evidence-backed / Hypothesis / Unknown, AND a hypothesis claiming the EVIDENCE label must
    actually cite evidence (an EVIDENCE-labeled hypothesis with no supporting_evidence_refs is a mislabeled,
    unbacked claim -- the real structural check, not a constant the producer always writes the same way)."""
    hypotheses = cause_hypothesis_set.get("hypotheses", [])
    problems: list[dict[str, Any]] = []
    for h in hypotheses:
        epistemic_type = (h.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"id": h.get("id"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not h.get("supporting_evidence_refs"):
            problems.append({"id": h["id"], "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(hypotheses) and not problems
    return _result("evidence_labeling_required", passed, [{"hypotheses_checked": len(hypotheses), "problems": problems}], validator, timestamp)


def evaluate_fishbone_gates(cause_hypothesis_set: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's declared ``quality`` properties, in catalog order. Nothing beyond them is invented."""
    return [
        evaluate_provenance_required_gate(cause_hypothesis_set, validator, timestamp),
        evaluate_evidence_labeling_required_gate(cause_hypothesis_set, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)


def record_validation_applied(cause_hypothesis_set: dict[str, Any], validation_methods_applied: list[str]) -> dict[str, Any]:
    """Records that one or more of Fishbone's own ``recommended_next`` methods (root_cause.pareto,
    root_cause.five_whys, causal.dag, validation.experiment) actually ran against this set -- the ONLY thing that can
    make ``ready_for_promotion`` true. Returns a new set (the ledger's own append-only discipline: nothing here
    mutates the caller's object in place)."""
    updated = copy.deepcopy(cause_hypothesis_set)
    methods = list(validation_methods_applied)
    updated["promotion"] = {"validation_methods_applied": methods, "ready_for_promotion": bool(methods)}
    return updated


def attempt_promote_to_root_cause_fact(
    rcf_id: str,
    cause_hypothesis_set: dict[str, Any],
    promoted_hypothesis_id: str,
    statement: str,
    evidence_and_causal_validation_pass: bool,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
) -> dict[str, Any]:
    """Instance of ``typed-objects/root-cause-fact.schema.yaml``. Raises BEFORE building the record -- never a
    RootCauseFact object that itself proves it was built illegally -- unless ``cause_hypothesis_set`` has genuinely
    been through ``record_validation_applied`` with a non-empty method list."""
    promotion = cause_hypothesis_set.get("promotion") or {}
    validation_methods_applied = promotion.get("validation_methods_applied") or []
    if not promotion.get("ready_for_promotion") or not validation_methods_applied:
        raise InvariantViolation(FORBIDDEN_TRANSITION_MESSAGE.format(chs_id=cause_hypothesis_set.get("id")))
    hypothesis_ids = {h["id"] for h in cause_hypothesis_set.get("hypotheses", [])}
    if promoted_hypothesis_id not in hypothesis_ids:
        raise InvariantViolation(f"UNKNOWN_HYPOTHESIS_ID: {promoted_hypothesis_id} is not in {cause_hypothesis_set.get('id')}'s hypotheses")
    return {
        "id": rcf_id,
        "version": version,
        "status": "active",
        "statement": statement,
        "source_cause_hypothesis_set_ref": cause_hypothesis_set["id"],
        "promoted_hypothesis_id": promoted_hypothesis_id,
        "legal_promotion_path": {
            "validation_methods_applied": list(validation_methods_applied),
            "evidence_and_causal_validation_pass": evidence_and_causal_validation_pass,
        },
        "provenance": provenance,
    }
