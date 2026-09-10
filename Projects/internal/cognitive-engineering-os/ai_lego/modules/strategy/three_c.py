"""``strategy.three_c`` -- 2nd F08 `context/strategy` family member (after ``strategy.swot``,
methods/contracts/strategy.three_c.contract.yaml).

Atlas F08 table row (L517: "3C｜Customer/Competitor/Company｜三面向分析→找
fit｜快速商業定位｜SWOT/TOWS") + §12.12 (L2679-2686, same content restated) are
this method's ONLY citations -- thinner than SWOT's own §11.7 (no per-item
geography/time/source given, no usage-step protocol). Structurally the same
shape class as ``strategy.swot``: a fixed-category classification method
(here, 3 dimensions instead of 4) whose defining act is producing content
tagged against a closed enum, then a single disclosed synthesis across them.

Two real invariants, both enforced at construction (raise BEFORE any record
is built) AND independently re-derived by a gate from raw fields (catching a
hand-tampered record that bypassed the builder entirely) -- same two-layer
discipline every sibling module in this package already establishes:

1. **Dimension coverage** (``THREEC_MISSING_DIMENSION_COVERAGE``): ``findings``
   must include at least one entry for EACH of CUSTOMER/COMPETITOR/COMPANY.
   Atlas's own "三面向" (three dimensions) is the method's defining split --
   a record missing a whole dimension has not actually done a 3C analysis,
   the same "the method's own name IS the claim" discipline
   ``causal.rct``'s treatment/control-distinctness invariant establishes for
   a different structural guarantee.
2. **Fit disclosure** (``THREEC_EMPTY_FIT_SUMMARY``): ``fit_summary`` must be
   a non-empty string. Atlas's own citation for 3C IS "→找 fit" (L517) --
   finding fit across the three dimensions is the method's entire stated
   purpose, so a record that never states the fit conclusion has not
   delivered on it. DISCLOSURE-ONLY, same restraint ``causal.rct``'s own
   ``analysis_summary`` applies: no algorithm here computes "business fit"
   from qualitative findings, it is REPORTED content the caller supplies,
   with provenance carried on each finding, not on ``fit_summary`` itself
   (see the typed-object schema's own compilation_decisions).

Grepped the whole ``ai_lego`` tree and ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS``
case-insensitively for "three_c"/"3C analysis" before writing any of this
method's own files: zero pre-existing implementation (a handful of unrelated
"three_c*"/"*_three_c*" substring false-positive hits -- e.g.
``test_three_cycle_is_detected``, ``two_options_three_criteria_...`` -- all
triaged and confirmed non-matching).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.three_c"
RECORD_ID_PREFIX = "3C-"
VALID_DIMENSIONS = frozenset({"CUSTOMER", "COMPETITOR", "COMPANY"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def three_c_finding(finding_id: str, dimension: str, statement: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """One item of ``typed-objects/three-c-analysis.schema.yaml#/properties/findings``.

    ``dimension`` is validated against Atlas's own closed three-value split (F08 L517 / §12.12) at construction
    time -- both Atlas citations name Customer/Competitor/Company, by name, as the method's own defining split,
    same "the enum IS the citation" discipline ``strategy.swot``'s own ``swot_factor`` category check applies."""
    if dimension not in VALID_DIMENSIONS:
        raise InvariantViolation(f"THREEC_INVALID_DIMENSION: {dimension!r} is not one of {sorted(VALID_DIMENSIONS)} (Atlas F08 L517 / §12.12 three-dimension split)")
    if not _is_nonempty_str(statement):
        raise InvariantViolation(f"THREEC_EMPTY_STATEMENT: statement must be a non-empty string, got {statement!r}")
    return {"id": finding_id, "dimension": dimension, "statement": statement, "provenance": provenance}


def _dimension_coverage(findings: list[Any]) -> tuple[bool, list[str]]:
    """Returns ``(is_covered, missing_dimensions)``. Shared by the builder and the gate so neither can drift from
    the other -- same discipline every sibling module in this package establishes."""
    present = {f.get("dimension") for f in findings if isinstance(f, dict)}
    missing = sorted(VALID_DIMENSIONS - present)
    return (not missing, missing)


def generate_three_c_analysis(
    analysis_id: str,
    findings: list[dict[str, Any]],
    fit_summary: str,
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/three-c-analysis.schema.yaml``. Enforces both real invariants fail-closed --
    never a record that itself proves it was built illegally, same family-wide "raise-before-construction"
    discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(analysis_id) or not analysis_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"THREEC_INVALID_ID: analysis_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {analysis_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"THREEC_INVALID_VERSION: version must be a string, got {version!r}")
    if not findings:
        raise InvariantViolation("THREEC_EMPTY_FINDINGS_SET: three-c-analysis.schema.yaml requires findings minItems:3")

    covered, missing = _dimension_coverage(findings)
    if not covered:
        raise InvariantViolation(
            f"THREEC_MISSING_DIMENSION_COVERAGE: findings has zero entries for {missing} -- a 3C analysis missing a "
            "whole dimension has not covered all three C's (Atlas F08 L517 / §12.12 三面向)"
        )
    if not _is_nonempty_str(fit_summary):
        raise InvariantViolation(
            "THREEC_EMPTY_FIT_SUMMARY: fit_summary must be a non-empty string -- a 3C analysis that never states its "
            "fit conclusion has not delivered the method's own purpose (Atlas L517 '→找 fit')"
        )

    return {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "findings": list(findings),
        "fit_summary": fit_summary,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every finding carries a schema-valid provenance_record.
    Fails closed on non-dict input."""
    if not isinstance(analysis, dict):
        return _result("provenance_required", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    findings = analysis.get("findings", [])
    invalid = [f.get("id") for f in findings if isinstance(f, dict) and not provenance_is_valid(f.get("provenance"))]
    passed = bool(findings) and not invalid
    return _result("provenance_required", passed, [{"findings_checked": len(findings), "invalid_provenance_ids": invalid}], validator, timestamp)


def evaluate_dimension_coverage_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #1 from the record's OWN raw ``findings`` -- does not trust any stored value and does
    NOT call ``generate_three_c_analysis``, so a hand-tampered record that bypassed the builder entirely is caught
    here exactly as a builder-refused one would have been. Fails closed on malformed input."""
    if not isinstance(analysis, dict):
        return _result("dimension_coverage", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    findings = analysis.get("findings", [])
    covered, missing = _dimension_coverage(findings)
    passed = bool(findings) and covered
    return _result("dimension_coverage", passed, [{"findings_checked": len(findings), "missing_dimensions": missing}], validator, timestamp)


def evaluate_fit_summary_disclosed_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #2 from the record's OWN raw ``fit_summary``, independent of the builder. Fails closed
    on malformed input."""
    if not isinstance(analysis, dict):
        return _result("fit_summary_disclosed", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    fit_summary = analysis.get("fit_summary")
    passed = _is_nonempty_str(fit_summary)
    return _result("fit_summary_disclosed", passed, [{"fit_summary_present": passed}], validator, timestamp)


def evaluate_three_c_gates(analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """The contract's own ``quality.provenance_required`` plus both real invariants, in catalog order. No
    ``evidence_labeling_required`` gate -- the contract sets that flag to ``false`` (see
    strategy.three_c.contract.yaml's own ``quality``/``compilation_decisions``), same "only emit gates for what is
    actually declared true" discipline ``causal.rct``'s own ``evaluate_rct_gates`` already establishes."""
    return [
        evaluate_provenance_required_gate(analysis, validator, timestamp),
        evaluate_dimension_coverage_gate(analysis, validator, timestamp),
        evaluate_fit_summary_disclosed_gate(analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
