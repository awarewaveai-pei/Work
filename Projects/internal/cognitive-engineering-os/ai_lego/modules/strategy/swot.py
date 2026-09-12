"""``strategy.swot`` -- third Method Atlas slice, F08 context/strategy family (methods/contracts/strategy.swot.contract.yaml).

Third distinct shape: `root_cause.fishbone` was a single hypothesis-
generation step with a type-boundary guard; `strategy.swot` is a
classification method (Atlas L1327: split a situation into internal
Strength/Weakness vs. external Opportunity/Threat, per §4's own formula
``SWOT = CLASSIFY + COMPARE + CONTEXTUALIZE``) whose forbidden_transition
targets an entirely different hazard class: not "skip a validation step
before producing a sibling typed object" (Fishbone's shape) but "an
AI-derived strategic analysis triggers an irreversible external action with
no human decision in the loop" (Atlas L3550-3552:
``SWOT -> AutomaticProductionDeployment``, forbidden). See
``assert_forbidden_deployment_path_blocked`` below for why this guard is
structural absence backed by the platform's existing fail-closed method
resolution (ADR-023), not a bespoke local check -- there is no typed object
named ``AutomaticProductionDeployment`` to construct and refuse, unlike
Fishbone's real ``RootCauseFact``.

The contract's ``quality`` block (``provenance_required: true``,
``evidence_labeling_required: true``) is, again, the whole method-specific
gate surface -- same two gate ids as ``root_cause.fishbone``, evaluated
against a structurally different object (``factors``, not ``hypotheses``).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.swot"
RECORD_ID_PREFIX = "SWOT-"
VALID_CATEGORIES = frozenset({"STRENGTH", "WEAKNESS", "OPPORTUNITY", "THREAT"})
INTERNAL_CATEGORIES = frozenset({"STRENGTH", "WEAKNESS"})

# Illustrative id for Atlas's own forbidden-transition target name (L3551
# "AutomaticProductionDeployment") under this repo's <family>.<name> id
# grammar (ADR-005b). Not a real capability/method anyone has proposed --
# used only to make the platform's existing fail-closed refusal of it
# explicit and machine-checkable. See assert_forbidden_deployment_path_blocked.
AUTOMATIC_DEPLOYMENT_HAZARD_ID = "strategy.automatic_production_deployment"


def swot_factor(
    factor_id: str,
    category: str,
    statement: str,
    geography: str,
    time: str,
    source: str,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/swot-analysis.schema.yaml#/properties/factors``.

    ``category`` is validated against Atlas's own closed four-value split
    (L1327) at construction time -- unlike Fishbone's deliberately free-form
    `category`, SWOT's four categories ARE the method's own definition, so
    an out-of-set value here is a caller error, not a legitimate domain
    variation."""
    if category not in VALID_CATEGORIES:
        raise InvariantViolation(f"SWOT_INVALID_CATEGORY: {category!r} is not one of {sorted(VALID_CATEGORIES)} (Atlas L1327 internal/external split)")
    record: dict[str, Any] = {"id": factor_id, "category": category, "statement": statement, "geography": geography, "time": time, "source": source, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def is_internal(category: str) -> bool:
    """Derived, not stored (see swot-analysis.schema.yaml compilation_decisions) -- Strength/Weakness = internal, Opportunity/Threat = external."""
    return category in INTERNAL_CATEGORIES


def generate_swot_analysis(
    analysis_id: str,
    knowledge_set_ref: str,
    knowledge_set: list[dict[str, Any]],
    factors: list[dict[str, Any]],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/swot-analysis.schema.yaml``.

    Enforces the contract's own precondition (``evidence_available == true``,
    strategy.swot.contract.yaml L53 preconditions) fail-closed: a
    KnowledgeSet has no dedicated typed-object schema anywhere in this spec
    root (swot-analysis.schema.yaml's own OQ-SWOTANALYSIS-1), so it is
    represented here as the runtime-layer convention of a non-empty list of
    real ``evidence/evidence.schema.yaml`` records -- the precondition is
    "this list is non-empty", not a status field on a type that does not
    exist.
    """
    if not knowledge_set:
        raise InvariantViolation("SWOT_PRECONDITION_FAILED: evidence_available must be true (methods/contracts/strategy.swot.contract.yaml preconditions) -- knowledge_set is empty")
    if not factors:
        raise InvariantViolation("SWOT_EMPTY_FACTOR_SET: swot-analysis.schema.yaml requires factors minItems:1")
    return {
        "id": analysis_id,
        "version": version,
        "knowledge_set_ref": knowledge_set_ref,
        "generated_by_method": generated_by_method,
        "factors": list(factors),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(swot_analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every factor carries a schema-valid provenance_record."""
    factors = swot_analysis.get("factors", [])
    invalid = [f["id"] for f in factors if not provenance_is_valid(f.get("provenance"))]
    passed = bool(factors) and not invalid
    return _result("provenance_required", passed, [{"factors_checked": len(factors), "invalid_provenance_ids": invalid}], validator, timestamp)


def evaluate_evidence_labeling_required_gate(swot_analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- Atlas L1347's own named misuse ('沒有 Evidence 就寫
    「品牌強」「市場大」' -- writing "strong brand"/"large market" without evidence): a factor claiming the EVIDENCE
    label must actually cite evidence, the same real structural check ``root_cause.fishbone``'s identical gate uses."""
    factors = swot_analysis.get("factors", [])
    problems: list[dict[str, Any]] = []
    for f in factors:
        epistemic_type = (f.get("provenance") or {}).get("epistemic_type")
        if epistemic_type is None:
            problems.append({"id": f.get("id"), "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not f.get("supporting_evidence_refs"):
            problems.append({"id": f["id"], "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(factors) and not problems
    return _result("evidence_labeling_required", passed, [{"factors_checked": len(factors), "problems": problems}], validator, timestamp)


def evaluate_swot_gates(swot_analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's declared ``quality`` properties, in catalog order. Nothing beyond them is invented."""
    return [
        evaluate_provenance_required_gate(swot_analysis, validator, timestamp),
        evaluate_evidence_labeling_required_gate(swot_analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)


def assert_forbidden_deployment_path_blocked(catalog: Any) -> dict[str, Any]:
    """strategy.swot.contract.yaml's forbidden_transition (SWOTAnalysis -> AutomaticProductionDeployment, Atlas
    L3550-3552) is a different hazard shape from Fishbone's: there is no typed object named
    AutomaticProductionDeployment anywhere in this spec root to construct and refuse -- the hazard is an
    irreversible EXTERNAL action, not a data-layer type promotion. The real guard is the platform's own fail-closed
    method resolution (ADR-023): nothing shaped like an automatic-deployment action has an ACTIVE contract in
    ``methods/contracts/`` today, so ``MethodCatalog.resolve()`` already refuses it, for free, through the SAME
    mechanism every other method invocation goes through -- reuse, not a bespoke SWOT-specific guard.

    This function makes that reliance explicit and machine-checkable rather than an unstated assumption: it raises
    if the hazard id ever resolves as legal against the given catalog (proving the guard would catch a real
    regression, not silently trust the absence forever)."""
    resolution = catalog.resolve([AUTOMATIC_DEPLOYMENT_HAZARD_ID])
    if resolution["blocked"] is None:
        raise InvariantViolation(
            f"FORBIDDEN_TRANSITION_GUARD_DID_NOT_FIRE: {AUTOMATIC_DEPLOYMENT_HAZARD_ID} resolved as legal against "
            f"catalog {catalog.label} -- strategy.swot.contract.yaml forbidden_transition "
            "(SWOTAnalysis -> AutomaticProductionDeployment) requires this to stay blocked"
        )
    return resolution
