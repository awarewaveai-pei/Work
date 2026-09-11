"""``strategy.blue_ocean`` -- 14th and LAST F08 `context/strategy` family member (after
``strategy.swot``, ``strategy.pestel``, ``strategy.steepv``, ``strategy.three_c``,
``strategy.tows``, ``strategy.porter_five_forces``, ``strategy.ansoff``, ``strategy.value_chain``,
``strategy.stp``, ``strategy.vrio``, plus 3 concurrent siblings in this same batch --
``strategy.bcg_matrix``/``strategy.business_model_canvas``/``strategy.value_proposition_canvas``),
zero shared files with any of them.

Atlas F08 table row (L526: "Blue Ocean｜創造新價值曲線｜Strategy Canvas→ERRC｜擺脫直接競爭｜BMC")
is this method's ONLY citation -- confirmed by grepping the whole Atlas file case-insensitively for
"Blue Ocean"/"ERRC"/"藍海"/"Strategy Canvas"/"價值曲線": exactly 1 hit total, this row itself. No
dedicated §12.x section, no §4 composition formula, no §14.1 transition example names this method.

Same shape class as ``strategy.three_c``/``strategy.value_chain``: a flat array of items each
carrying a closed-enum classification plus a required disclosed record-level synthesis. Grounded
additionally in the real, well-known Kim & Mauborgne Blue Ocean Strategy framework (Strategy Canvas
+ Eliminate-Reduce-Raise-Create grid) for the 4-value ``errc_action`` enum, same "name the real
external methodology" discipline ``strategy.vrio``'s own Barney 1991 citation already establishes.

Four real invariants, all enforced at construction (raise BEFORE any record is built) AND
independently re-derived by a gate from raw fields (catching a hand-tampered record that bypassed
the builder entirely) -- same two-layer discipline every sibling module in this package already
establishes:

1. **Factor count** (``BLUEOCEAN_INSUFFICIENT_FACTORS``): ``competing_factors`` must include at
   least 2 entries. Atlas's own "Strategy Canvas" (L526) plots a value curve across multiple
   competing factors -- a curve plotted through a single point is not a curve.
2. **ERRC action validity** (``BLUEOCEAN_INVALID_ERRC_ACTION``): each factor's ``errc_action`` must
   be one of the 4 closed values ELIMINATE/REDUCE/RAISE/CREATE. Atlas's own "→ERRC" (L526) names
   this exact 4-letter grid as the method's defining second stage.
3. **CREATE-vs-existing-factor asymmetry** (``BLUEOCEAN_MISSING_INDUSTRY_STANDARD_LEVEL`` /
   ``BLUEOCEAN_UNEXPECTED_INDUSTRY_STANDARD_LEVEL_FOR_CREATE``): ELIMINATE/REDUCE/RAISE apply to a
   competing factor the industry ALREADY competes on -- ``industry_standard_level`` is REQUIRED.
   CREATE introduces a factor the industry has NEVER offered -- by definition there is no industry
   standard, so ``industry_standard_level`` MUST be entirely absent, not merely null.
4. **New-value-curve disclosure** (``BLUEOCEAN_EMPTY_NEW_VALUE_CURVE_SUMMARY``):
   ``new_value_curve_summary`` must be a non-empty string. Atlas's own citation for this method IS
   "創造新價值曲線" (create a new value curve, L526) -- its own name is its purpose, so a record that
   never states the resulting curve has not delivered on it. DISCLOSURE-ONLY, same restraint
   ``strategy.three_c``'s own ``fit_summary`` / ``strategy.value_chain``'s own ``leverage_points``
   apply: no algorithm here computes a "new value curve" from qualitative ERRC judgments, it is
   REPORTED content the caller supplies.

Each factor also requires a non-empty ``rationale`` -- a disclosed strategist judgment for why this
errc_action fits, same disclosed-judgment-audit-trail convention ``strategy.vrio``'s own per-question
``reasoning`` field already establishes; ``errc_action`` itself is a caller-disclosed judgment (not
GENUINE_COMPUTE) -- no citation, Atlas or external, supports mechanically deriving which of the 4
actions fits a given factor.

Grepped the whole ``ai_lego`` tree case-insensitively for "blue_ocean"/"ERRC" before writing any of
this method's own files: zero pre-existing implementation (one unrelated forward-reference mention in
``ai_lego/modules/strategy/__init__.py``'s own "Remaining 4" family roadmap comment).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.blue_ocean"
RECORD_ID_PREFIX = "BLUEOCEAN-"
VALID_ERRC_ACTIONS = frozenset({"ELIMINATE", "REDUCE", "RAISE", "CREATE"})
VALID_INDUSTRY_STANDARD_LEVELS = frozenset({"LOW", "MEDIUM", "HIGH"})
EXISTING_FACTOR_ACTIONS = frozenset({"ELIMINATE", "REDUCE", "RAISE"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def blue_ocean_factor(
    factor_id: str,
    factor_name: str,
    errc_action: str,
    rationale: str,
    provenance: dict[str, Any],
    *,
    industry_standard_level: str | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/blue-ocean-analysis.schema.yaml#/properties/competing_factors``.

    ``errc_action`` is validated against Atlas's own closed four-value grid (F08 L526 "→ERRC") at
    construction time -- same "the enum IS the citation" discipline ``strategy.three_c``'s own
    ``dimension`` check applies. ELIMINATE/REDUCE/RAISE apply to an EXISTING competing factor and
    REQUIRE a disclosed ``industry_standard_level``; CREATE introduces a factor the industry has
    never offered and FORBIDS one (there is no industry standard to record) -- see the module
    docstring's Invariant #3. ``rationale`` must be a non-empty disclosed judgment."""
    if errc_action not in VALID_ERRC_ACTIONS:
        raise InvariantViolation(f"BLUEOCEAN_INVALID_ERRC_ACTION: {errc_action!r} is not one of {sorted(VALID_ERRC_ACTIONS)} (Atlas F08 L526 '→ERRC' grid)")
    if not _is_nonempty_str(factor_name):
        raise InvariantViolation(f"BLUEOCEAN_EMPTY_FACTOR_NAME: factor_name must be a non-empty string, got {factor_name!r}")
    if not _is_nonempty_str(rationale):
        raise InvariantViolation(f"BLUEOCEAN_EMPTY_RATIONALE: rationale must be a non-empty string, got {rationale!r}")

    if errc_action in EXISTING_FACTOR_ACTIONS:
        if industry_standard_level is None:
            raise InvariantViolation(
                f"BLUEOCEAN_MISSING_INDUSTRY_STANDARD_LEVEL: errc_action={errc_action!r} applies to an EXISTING competing "
                "factor -- industry_standard_level is required (Atlas F08 L526; ELIMINATE/REDUCE/RAISE all interrogate a "
                "factor's current industry level)"
            )
        if industry_standard_level not in VALID_INDUSTRY_STANDARD_LEVELS:
            raise InvariantViolation(
                f"BLUEOCEAN_INVALID_INDUSTRY_STANDARD_LEVEL: {industry_standard_level!r} is not one of {sorted(VALID_INDUSTRY_STANDARD_LEVELS)}"
            )
    else:  # CREATE
        if industry_standard_level is not None:
            raise InvariantViolation(
                f"BLUEOCEAN_UNEXPECTED_INDUSTRY_STANDARD_LEVEL_FOR_CREATE: errc_action=CREATE introduces a factor the "
                f"industry has never offered -- there is no industry standard to record, got industry_standard_level={industry_standard_level!r}"
            )

    entry: dict[str, Any] = {"id": factor_id, "factor_name": factor_name, "errc_action": errc_action, "rationale": rationale, "provenance": provenance}
    if industry_standard_level is not None:
        entry["industry_standard_level"] = industry_standard_level
    return entry


def _factor_count_sufficient(competing_factors: list[Any]) -> bool:
    """Shared by the builder and the gate so neither can drift from the other -- same discipline
    every sibling module in this package establishes."""
    return len(competing_factors) >= 2


def _invalid_errc_action_ids(competing_factors: list[Any]) -> list[str]:
    """Re-derives Invariant #2 from raw fields: which factor ids carry an out-of-enum errc_action."""
    return [f.get("id") for f in competing_factors if isinstance(f, dict) and f.get("errc_action") not in VALID_ERRC_ACTIONS]


def _industry_standard_level_violation_ids(competing_factors: list[Any]) -> list[str]:
    """Re-derives Invariant #3 from raw fields: which factor ids violate the CREATE-vs-existing-factor
    asymmetry (missing when required, or present when forbidden). Shared by the builder and the gate
    so neither can drift from the other."""
    violations = []
    for f in competing_factors:
        if not isinstance(f, dict):
            continue
        action = f.get("errc_action")
        has_level = "industry_standard_level" in f and f.get("industry_standard_level") is not None
        if action in EXISTING_FACTOR_ACTIONS and not has_level:
            violations.append(f.get("id"))
        elif action == "CREATE" and has_level:
            violations.append(f.get("id"))
    return violations


def generate_blue_ocean_analysis(
    analysis_id: str,
    competing_factors: list[dict[str, Any]],
    new_value_curve_summary: str,
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/blue-ocean-analysis.schema.yaml``. Enforces all 4 real invariants
    fail-closed -- never a record that itself proves it was built illegally, same family-wide
    "raise-before-construction" discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(analysis_id) or not analysis_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"BLUEOCEAN_INVALID_ID: analysis_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {analysis_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"BLUEOCEAN_INVALID_VERSION: version must be a string, got {version!r}")
    if not _factor_count_sufficient(competing_factors):
        raise InvariantViolation(
            f"BLUEOCEAN_INSUFFICIENT_FACTORS: competing_factors has {len(competing_factors)} entries, needs >=2 -- a value "
            "curve plotted through a single point is not a curve (Atlas F08 L526 'Strategy Canvas')"
        )

    invalid_actions = _invalid_errc_action_ids(competing_factors)
    if invalid_actions:
        raise InvariantViolation(f"BLUEOCEAN_INVALID_ERRC_ACTION: factors {invalid_actions} carry an errc_action outside {sorted(VALID_ERRC_ACTIONS)}")

    level_violations = _industry_standard_level_violation_ids(competing_factors)
    if level_violations:
        raise InvariantViolation(
            f"BLUEOCEAN_INDUSTRY_STANDARD_LEVEL_MISMATCH: factors {level_violations} violate the CREATE-vs-existing-factor "
            "asymmetry (ELIMINATE/REDUCE/RAISE require industry_standard_level; CREATE forbids it)"
        )

    if not _is_nonempty_str(new_value_curve_summary):
        raise InvariantViolation(
            "BLUEOCEAN_EMPTY_NEW_VALUE_CURVE_SUMMARY: new_value_curve_summary must be a non-empty string -- a Blue Ocean "
            "analysis that never states its new curve has not delivered the method's own purpose (Atlas L526 '創造新價值曲線')"
        )

    return {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "competing_factors": list(competing_factors),
        "new_value_curve_summary": new_value_curve_summary,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every factor carries a schema-valid
    provenance_record. Fails closed on non-dict input."""
    if not isinstance(analysis, dict):
        return _result("provenance_required", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    factors = analysis.get("competing_factors", [])
    invalid = [f.get("id") for f in factors if isinstance(f, dict) and not provenance_is_valid(f.get("provenance"))]
    passed = bool(factors) and not invalid
    return _result("provenance_required", passed, [{"factors_checked": len(factors), "invalid_provenance_ids": invalid}], validator, timestamp)


def evaluate_factor_count_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #1 from the record's OWN raw ``competing_factors`` -- does not trust any
    stored value and does NOT call ``generate_blue_ocean_analysis``, so a hand-tampered record that
    bypassed the builder entirely is caught here exactly as a builder-refused one would have been.
    Fails closed on malformed input."""
    if not isinstance(analysis, dict):
        return _result("factor_count", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    factors = analysis.get("competing_factors", [])
    passed = isinstance(factors, list) and _factor_count_sufficient(factors)
    return _result("factor_count", passed, [{"factors_checked": len(factors) if isinstance(factors, list) else 0}], validator, timestamp)


def evaluate_errc_action_valid_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #2 from the record's OWN raw ``competing_factors``, independent of the
    builder. Fails closed on malformed input."""
    if not isinstance(analysis, dict):
        return _result("errc_action_valid", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    factors = analysis.get("competing_factors", [])
    invalid = _invalid_errc_action_ids(factors)
    passed = bool(factors) and not invalid
    return _result("errc_action_valid", passed, [{"factors_checked": len(factors), "invalid_errc_action_ids": invalid}], validator, timestamp)


def evaluate_industry_standard_level_consistency_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #3 from the record's OWN raw ``competing_factors``, independent of the
    builder. Fails closed on malformed input."""
    if not isinstance(analysis, dict):
        return _result("industry_standard_level_consistency", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    factors = analysis.get("competing_factors", [])
    violations = _industry_standard_level_violation_ids(factors)
    passed = bool(factors) and not violations
    return _result("industry_standard_level_consistency", passed, [{"factors_checked": len(factors), "violation_ids": violations}], validator, timestamp)


def evaluate_new_value_curve_summary_disclosed_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #4 from the record's OWN raw ``new_value_curve_summary``, independent of
    the builder. Fails closed on malformed input."""
    if not isinstance(analysis, dict):
        return _result("new_value_curve_summary_disclosed", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    summary = analysis.get("new_value_curve_summary")
    passed = _is_nonempty_str(summary)
    return _result("new_value_curve_summary_disclosed", passed, [{"new_value_curve_summary_present": passed}], validator, timestamp)


def evaluate_blue_ocean_gates(analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """The contract's own ``quality.provenance_required`` plus all 4 real invariants, in catalog
    order. No ``evidence_labeling_required`` gate -- the contract sets that flag to ``false`` (see
    strategy.blue_ocean.contract.yaml's own ``quality``/``compilation_decisions``), same "only emit
    gates for what is actually declared true" discipline ``causal.rct``'s own ``evaluate_rct_gates``
    already establishes."""
    return [
        evaluate_provenance_required_gate(analysis, validator, timestamp),
        evaluate_factor_count_gate(analysis, validator, timestamp),
        evaluate_errc_action_valid_gate(analysis, validator, timestamp),
        evaluate_industry_standard_level_consistency_gate(analysis, validator, timestamp),
        evaluate_new_value_curve_summary_disclosed_gate(analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
