"""``strategy.steepv`` -- 2nd F08 "context & strategy" family member (methods/contracts/strategy.steepv.contract.yaml),
``strategy.swot`` (this session's third overall slice) is the first.

Atlas's ONLY citation for this method: F08 tool table row
(AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:516 -- "STEEPV｜加入 Values 的長期環境掃描｜
S/T/E/E/P/V｜適合長期社會變遷｜Scenario"). Grep-confirmed zero other mentions of "STEEPV" anywhere in the
Atlas file -- no dedicated section exists, unlike its neighbor PESTEL's own rich §11.9 (9 named per-factor
sub-fields). This method's own row is even thinner than PESTEL's (PESTEL's row adds
"facts→trends→implications→uncertainty"; STEEPV's is the bare 6-letter acronym alone).

**Due diligence (VERIFIED before writing):** grepped the whole ``ai_lego`` tree case-insensitively for
"steepv" -- zero pre-existing implementation.

**Shape, taken literally from the citation:** like ``strategy.swot`` (a classification method), STEEPV sorts
real-world factors into one of a closed set of named categories -- 6, not SWOT's 4: SOCIAL, TECHNOLOGICAL,
ECONOMIC, ENVIRONMENTAL, POLITICAL, VALUES (transcribed verbatim from L516's own S/T/E/E/P/V formula, in that
order). Unlike SWOT's four categories (symmetric -- no single one is required to appear), STEEPV's own purpose
text names Values as the method's defining ADDITION over PESTEL's shared 5 letters -- so, unlike SWOT, this
method enforces "at least 1 VALUES-dimension factor" as a real invariant, not an optional nicety. Enforced at
THREE layers, same never-trust-a-single-layer discipline every sibling module in this suite already
establishes: (1) construction-time raise, (2) the typed-object schema's own ``contains``/``minContains``
structural constraint (steepv-analysis.schema.yaml), (3) an independent gate that re-derives from raw fields,
never trusting a stored value or that the builder was even used.

No forbidden_transition guard exists here (unlike ``strategy.swot``'s own AutomaticProductionDeployment guard,
Atlas L3550-3552) -- grep-confirmed no equivalent §14.1-style illegal-transition example or §22.3 gate row
names this method. Disclosed as an absence, not silently omitted.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.steepv"
VALID_DIMENSIONS = frozenset({"SOCIAL", "TECHNOLOGICAL", "ECONOMIC", "ENVIRONMENTAL", "POLITICAL", "VALUES"})
VALUES_DIMENSION = "VALUES"
RECORD_ID_PREFIX = "STEEPV-"


def steepv_factor(
    factor_id: str,
    dimension: str,
    statement: str,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/steepv-analysis.schema.yaml#/properties/factors``.

    ``dimension`` is validated against Atlas's own closed six-value split (L516) at construction time -- same
    "the method's own citation names these exactly, by name" reasoning ``strategy.swot.swot_factor``'s
    ``category`` check already establishes for SWOT's four."""
    if dimension not in VALID_DIMENSIONS:
        raise InvariantViolation(f"STEEPV_INVALID_DIMENSION: {dimension!r} is not one of {sorted(VALID_DIMENSIONS)} (Atlas L516 S/T/E/E/P/V formula)")
    record: dict[str, Any] = {"id": factor_id, "dimension": dimension, "statement": statement, "provenance": provenance}
    if supporting_evidence_refs:
        record["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return record


def is_values_dimension(dimension: str) -> bool:
    """Derived, not stored (see steepv-analysis.schema.yaml compilation_decisions) -- mirrors
    ``strategy.swot.is_internal``'s role: a one-line lookup against the method's own closed vocabulary."""
    return dimension == VALUES_DIMENSION


def _has_values_dimension(factors: Any) -> bool:
    """Shared by the builder and the gate so neither can drift from the other -- re-derives from raw factor
    dicts, does not assume ``steepv_factor`` was used to build them."""
    if not isinstance(factors, list):
        return False
    return any(isinstance(f, dict) and f.get("dimension") == VALUES_DIMENSION for f in factors)


def generate_steepv_analysis(
    analysis_id: str,
    factors: list[dict[str, Any]],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/steepv-analysis.schema.yaml``.

    Enforces both real invariants fail-closed -- never a record that itself proves it was built illegally, same
    family-wide "raise-before-construction" discipline every sibling module in this suite already establishes.
    """
    if not factors:
        raise InvariantViolation("STEEPV_EMPTY_FACTOR_SET: steepv-analysis.schema.yaml requires factors minItems:1")
    if not _has_values_dimension(factors):
        raise InvariantViolation(
            "STEEPV_MISSING_VALUES_DIMENSION: factors must include at least 1 entry with dimension == VALUES "
            "(Atlas L516's own defining differentiator over PESTEL -- 'STEEPV｜加入 Values 的長期環境掃描' -- a "
            "STEEPV analysis with zero VALUES factors is not a STEEPV analysis, just PESTEL with an unused enum value)"
        )
    return {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "factors": list(factors),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(steepv_analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every factor carries a schema-valid provenance_record.
    Fails closed on malformed input, same discipline every sibling gate in this suite already establishes."""
    if not isinstance(steepv_analysis, dict):
        return _result("provenance_required", False, [{"reason": "steepv_analysis is not a dict"}], validator, timestamp)
    factors = steepv_analysis.get("factors", [])
    invalid = [f.get("id") for f in factors if isinstance(f, dict) and not provenance_is_valid(f.get("provenance"))]
    passed = bool(factors) and not invalid
    return _result("provenance_required", passed, [{"factors_checked": len(factors), "invalid_provenance_ids": invalid}], validator, timestamp)


def evaluate_values_dimension_disclosed_gate(steepv_analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Independent re-derivation of this method's own defining invariant (Atlas L516) -- re-checks the SAME
    real conditions ``generate_steepv_analysis`` enforces (non-empty factors, every dimension a member of the
    closed six-value vocabulary, at least 1 VALUES entry) directly from raw fields. Does NOT call
    ``generate_steepv_analysis`` or trust that ``steepv_factor`` was used to build any factor, so a
    hand-tampered analysis that bypassed the builder entirely is caught here exactly as a builder-refused one
    would have been -- same discipline ``causal.counterfactual_reasoning``'s own integrity gate establishes."""
    if not isinstance(steepv_analysis, dict):
        return _result("values_dimension_disclosed", False, [{"reason": "steepv_analysis is not a dict"}], validator, timestamp)
    factors = steepv_analysis.get("factors")
    if not isinstance(factors, list) or not factors:
        return _result("values_dimension_disclosed", False, [{"reason": "factors missing, not a list, or empty"}], validator, timestamp)
    invalid_dimensions = [f.get("id") for f in factors if isinstance(f, dict) and f.get("dimension") not in VALID_DIMENSIONS]
    if invalid_dimensions:
        return _result("values_dimension_disclosed", False, [{"reason": "factor(s) with dimension outside the closed 6-value vocabulary", "ids": invalid_dimensions}], validator, timestamp)
    has_values = _has_values_dimension(factors)
    if not has_values:
        return _result("values_dimension_disclosed", False, [{"reason": "no factor carries dimension == VALUES", "factors_checked": len(factors)}], validator, timestamp)
    return _result("values_dimension_disclosed", True, [{"factors_checked": len(factors), "values_factor_count": sum(1 for f in factors if f.get("dimension") == VALUES_DIMENSION)}], validator, timestamp)


def evaluate_steepv_gates(steepv_analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of this method's real gates, in catalog order. Nothing beyond them is invented."""
    return [
        evaluate_provenance_required_gate(steepv_analysis, validator, timestamp),
        evaluate_values_dimension_disclosed_gate(steepv_analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
