"""``strategy.value_chain`` -- 7th F08 `context/strategy` family member (after ``strategy.swot``,
``strategy.pestel``, ``strategy.steepv``, ``strategy.three_c``, ``strategy.tows``,
``strategy.porter_five_forces``), built alongside 3 concurrent siblings (``strategy.vrio``/
``strategy.stp``/``strategy.ansoff``) in the same batch, zero shared files with any of them.

Atlas F08 table row (L522: "Value Chain｜拆價值活動｜primary/support→cost/value drivers｜找高槓桿點
｜Benchmarking") is this method's ONLY citation -- confirmed by grepping the whole Atlas file
case-insensitively for "Value Chain"/"價值鏈"/"primary activities"/"support activities": exactly 2
hits total, this method's own row (L522) and VRIO's own row (L521, whose OWN "最佳搭配" column names
"Value Chain" as VRIO's next step -- that is VRIO's own field, not read or reused here). No dedicated
§12.x section, no worked example, no §14.1 transition example names this method.

DESIGN DECISION (disclosed, not silently picked -- see the contract's own ``compilation_decisions``):
Atlas's own citation literally names only the 2-category primary/support split -- it does NOT name any
of Porter's real 9 sub-activities (inbound logistics/operations/outbound logistics/marketing & sales/
service; firm infrastructure/HR/technology development/procurement) by name. Same restraint
``causal.process_tracing``'s own Van Evera citation establishes (name the real external methodology for
grounding, but restrict the actual typed fields to exactly what Atlas's own row literally names --
there Atlas named 2 of Van Evera's real 4 test types; here Atlas names 0 of Porter's real 9
sub-activities, only the 2-category split itself). ``category`` is therefore a closed 2-value enum
(PRIMARY/SUPPORT, directly Atlas-cited); ``activity_name`` stays free-text, NOT a closed 9-value enum.

Three real invariants, all enforced at construction (raise BEFORE any record is built) AND
independently re-derived by a gate from raw fields (catching a hand-tampered record that bypassed the
builder entirely) -- same two-layer discipline every sibling module in this package already
establishes:

1. **Category coverage** (``VALUECHAIN_MISSING_CATEGORY_COVERAGE``): ``activities`` must include at
   least one PRIMARY and one SUPPORT entry. Atlas's own "primary/support" (L522) is the method's
   defining split -- a value chain missing a whole category has not actually decomposed the chain,
   same "the method's own name IS the claim" discipline ``strategy.three_c``'s own dimension-coverage
   invariant establishes for an analogous (there 3-way, here 2-way) closed split.
2. **Driver disclosure** (``VALUECHAIN_MISSING_DRIVER``): each activity must disclose a non-empty
   ``cost_driver`` and/or ``value_driver``. Atlas's own citation names "cost/value drivers" as the
   whole analytical output of this method (L522) -- an activity entry that names neither has not
   actually been analyzed. At least one, not both, required: Atlas's own "cost/value" is a
   slash-joined either/or, same notation style as "primary/support" itself.
3. **Leverage-points disclosure** (``VALUECHAIN_EMPTY_LEVERAGE_POINTS``): ``leverage_points`` must be
   a non-empty string. Atlas's own citation for this method IS "→找高槓桿點" (L522) -- finding
   high-leverage points across the decomposed activities is the method's entire stated purpose, so a
   record that never states which points are high-leverage has not delivered on it. DISCLOSURE-ONLY,
   same restraint ``strategy.three_c``'s own ``fit_summary`` applies: no algorithm here computes
   "leverage" from qualitative cost/value driver statements, it is REPORTED content the caller
   supplies.

Grepped the whole ``ai_lego`` tree case-insensitively for "value_chain"/"ValueChain" before writing any
of this method's own files: zero pre-existing implementation.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "strategy.value_chain"
RECORD_ID_PREFIX = "VALUECHAIN-"
VALID_CATEGORIES = frozenset({"PRIMARY", "SUPPORT"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def value_chain_activity(
    activity_id: str,
    category: str,
    activity_name: str,
    provenance: dict[str, Any],
    *,
    cost_driver: str | None = None,
    value_driver: str | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/value-chain-analysis.schema.yaml#/properties/activities``.

    ``category`` is validated against Atlas's own closed two-value split (F08 L522) at construction
    time -- same "the enum IS the citation" discipline ``strategy.three_c``'s own ``dimension`` check
    applies. At least one of ``cost_driver``/``value_driver`` must be a non-empty string (Atlas's own
    "cost/value drivers", L522) -- see the module docstring's invariant #2. Only the disclosed
    driver(s) are stored -- an undisclosed driver is omitted from the returned dict entirely, not
    stored as ``None``, matching the schema's own optional-key (not nullable) shape."""
    if category not in VALID_CATEGORIES:
        raise InvariantViolation(f"VALUECHAIN_INVALID_CATEGORY: {category!r} is not one of {sorted(VALID_CATEGORIES)} (Atlas F08 L522 primary/support split)")
    if not _is_nonempty_str(activity_name):
        raise InvariantViolation(f"VALUECHAIN_EMPTY_ACTIVITY_NAME: activity_name must be a non-empty string, got {activity_name!r}")
    has_cost = _is_nonempty_str(cost_driver)
    has_value = _is_nonempty_str(value_driver)
    if not has_cost and not has_value:
        raise InvariantViolation(
            "VALUECHAIN_MISSING_DRIVER: at least one of cost_driver/value_driver must be a non-empty string -- "
            "Atlas's own citation names 'cost/value drivers' as this method's whole analytical output (F08 L522)"
        )
    entry: dict[str, Any] = {"id": activity_id, "category": category, "activity_name": activity_name, "provenance": provenance}
    if has_cost:
        entry["cost_driver"] = cost_driver
    if has_value:
        entry["value_driver"] = value_driver
    return entry


def _category_coverage(activities: list[Any]) -> tuple[bool, list[str]]:
    """Returns ``(is_covered, missing_categories)``. Shared by the builder and the gate so neither can
    drift from the other -- same discipline every sibling module in this package establishes."""
    present = {a.get("category") for a in activities if isinstance(a, dict)}
    missing = sorted(VALID_CATEGORIES - present)
    return (not missing, missing)


def _driver_missing_ids(activities: list[Any]) -> list[str]:
    """Re-derives Invariant #2 from raw fields: which activity ids disclose neither driver. Shared by
    the builder and the gate so neither can drift from the other."""
    missing_ids = []
    for activity in activities:
        if not isinstance(activity, dict):
            continue
        if not _is_nonempty_str(activity.get("cost_driver")) and not _is_nonempty_str(activity.get("value_driver")):
            missing_ids.append(activity.get("id"))
    return missing_ids


def generate_value_chain_analysis(
    analysis_id: str,
    activities: list[dict[str, Any]],
    leverage_points: str,
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/value-chain-analysis.schema.yaml``. Enforces all 3 real invariants
    fail-closed -- never a record that itself proves it was built illegally, same family-wide
    "raise-before-construction" discipline every sibling module in this package already establishes."""
    if not _is_nonempty_str(analysis_id) or not analysis_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"VALUECHAIN_INVALID_ID: analysis_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {analysis_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"VALUECHAIN_INVALID_VERSION: version must be a string, got {version!r}")
    if not activities:
        raise InvariantViolation("VALUECHAIN_EMPTY_ACTIVITIES_SET: value-chain-analysis.schema.yaml requires activities minItems:2")

    covered, missing = _category_coverage(activities)
    if not covered:
        raise InvariantViolation(
            f"VALUECHAIN_MISSING_CATEGORY_COVERAGE: activities has zero entries for {missing} -- a value chain analysis missing a "
            "whole category has not decomposed primary/support (Atlas F08 L522)"
        )
    driver_missing = _driver_missing_ids(activities)
    if driver_missing:
        raise InvariantViolation(
            f"VALUECHAIN_MISSING_DRIVER: activities {driver_missing} disclose neither cost_driver nor value_driver -- "
            "Atlas's own citation names 'cost/value drivers' as this method's whole analytical output (F08 L522)"
        )
    if not _is_nonempty_str(leverage_points):
        raise InvariantViolation(
            "VALUECHAIN_EMPTY_LEVERAGE_POINTS: leverage_points must be a non-empty string -- a value chain analysis that never "
            "states its high-leverage conclusion has not delivered the method's own purpose (Atlas F08 L522 '→找高槓桿點')"
        )

    return {
        "id": analysis_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "activities": list(activities),
        "leverage_points": leverage_points,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every activity carries a schema-valid
    provenance_record. Fails closed on non-dict input."""
    if not isinstance(analysis, dict):
        return _result("provenance_required", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    activities = analysis.get("activities", [])
    invalid = [a.get("id") for a in activities if isinstance(a, dict) and not provenance_is_valid(a.get("provenance"))]
    passed = bool(activities) and not invalid
    return _result("provenance_required", passed, [{"activities_checked": len(activities), "invalid_provenance_ids": invalid}], validator, timestamp)


def evaluate_category_coverage_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #1 from the record's OWN raw ``activities`` -- does not trust any stored
    value and does NOT call ``generate_value_chain_analysis``, so a hand-tampered record that bypassed
    the builder entirely is caught here exactly as a builder-refused one would have been. Fails closed
    on malformed input."""
    if not isinstance(analysis, dict):
        return _result("category_coverage", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    activities = analysis.get("activities", [])
    covered, missing = _category_coverage(activities)
    passed = bool(activities) and covered
    return _result("category_coverage", passed, [{"activities_checked": len(activities), "missing_categories": missing}], validator, timestamp)


def evaluate_driver_disclosed_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #2 from the record's OWN raw ``activities``, independent of the builder.
    Fails closed on malformed input."""
    if not isinstance(analysis, dict):
        return _result("driver_disclosed", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    activities = analysis.get("activities", [])
    missing_ids = _driver_missing_ids(activities)
    passed = bool(activities) and not missing_ids
    return _result("driver_disclosed", passed, [{"activities_checked": len(activities), "missing_driver_ids": missing_ids}], validator, timestamp)


def evaluate_leverage_points_disclosed_gate(analysis: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Invariant #3 from the record's OWN raw ``leverage_points``, independent of the
    builder. Fails closed on malformed input."""
    if not isinstance(analysis, dict):
        return _result("leverage_points_disclosed", False, [{"reason": "analysis is not a dict"}], validator, timestamp)
    leverage_points = analysis.get("leverage_points")
    passed = _is_nonempty_str(leverage_points)
    return _result("leverage_points_disclosed", passed, [{"leverage_points_present": passed}], validator, timestamp)


def evaluate_value_chain_gates(analysis: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """The contract's own ``quality.provenance_required`` plus all 3 real invariants, in catalog order.
    No ``evidence_labeling_required`` gate -- the contract sets that flag to ``false`` (see
    strategy.value_chain.contract.yaml's own ``quality``/``compilation_decisions``), same "only emit
    gates for what is actually declared true" discipline ``causal.rct``'s own ``evaluate_rct_gates``
    already establishes."""
    return [
        evaluate_provenance_required_gate(analysis, validator, timestamp),
        evaluate_category_coverage_gate(analysis, validator, timestamp),
        evaluate_driver_disclosed_gate(analysis, validator, timestamp),
        evaluate_leverage_points_disclosed_gate(analysis, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
