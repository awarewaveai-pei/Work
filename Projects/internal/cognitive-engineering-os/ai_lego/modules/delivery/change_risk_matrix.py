"""``delivery.change_risk_matrix`` -- F22 PM/Delivery/Governance Pack (Atlas L922).

Atlas's own table row (L922, verbatim): "Change Risk Matrix | 分級
production change | scope/reversibility/data/traffic/security→risk tier |
高風險自動增加控制" (classify a production change's risk, via scope,
reversibility, data sensitivity, traffic impact, and security impact,
into a risk tier; higher risk automatically increases controls).
Table-row-only citation, no dedicated §12.x section (grepped
exhaustively). NOT the same enum/domain as `specs/execution/
risk-tier.schema.yaml`'s R0-R4 AI-execution-autonomy tiers (ADR-004) --
that schema governs whether an AI agent may act automatically; this
method classifies a PRODUCTION CHANGE's own risk.

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Risk tier derivation, THE real invariant this method exists to
   enforce** (``CHANGE_RISK_TIER_INCONSISTENT``) -- ``risk_tier`` is never
   accepted as a parameter of ``generate_change_risk_matrix`` at all; it is
   DERIVED (worst-of-5: the single highest-severity factor dominates) from
   the 5 declared ``factors``, same derive-never-accept discipline this
   corpus's ``experiment.mvp`` already establishes for its own ``outcome``
   field.
2. **Control sufficiency** (``CHANGE_RISK_INSUFFICIENT_CONTROLS``) --
   ``required_controls`` must be a superset of the derived tier's minimum
   control baseline. The 3 baselines (``LOW_CONTROL_BASELINE`` /
   ``MEDIUM_CONTROL_BASELINE`` / ``HIGH_CONTROL_BASELINE``) are nested by
   CONSTRUCTION (each built via a Python set union over the previous one),
   so Atlas's own benefit "高風險自動增加控制" (higher risk automatically
   increases controls) holds structurally: no HIGH-tier record can ever
   declare fewer controls than MEDIUM requires, because MEDIUM's own
   baseline is a strict subset of HIGH's by definition, not by convention.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"change-risk"/"change_risk"/"risk_tier"/"risk_matrix" before writing any of
this method's own files: found and disambiguated `specs/execution/
risk-tier.schema.yaml` (a different domain); zero pre-existing
implementation or schema title overlap for this method's own record shape.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "delivery.change_risk_matrix"
RECORD_ID_PREFIX = "CRMATRIX-"

# Atlas L922's own 5 named factors, transcribed verbatim.
FACTOR_NAMES: tuple[str, ...] = ("scope", "reversibility", "data_sensitivity", "traffic_impact", "security_impact")
_LEVELS = frozenset({"LOW", "MEDIUM", "HIGH"})
_LEVEL_RANK = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
_RANK_TO_TIER = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}

# Nested by CONSTRUCTION -- each baseline is the previous one PLUS extra controls, never a hand-typed
# disjoint list. This is what makes "higher tiers require monotonically more controls" a structural fact
# rather than an assertion; see ControlBaselineMonotonicityTests in tests/unit/test_change_risk_matrix.py.
LOW_CONTROL_BASELINE: frozenset[str] = frozenset({"peer_review"})
MEDIUM_CONTROL_BASELINE: frozenset[str] = LOW_CONTROL_BASELINE | frozenset({"staging_validation", "rollback_plan"})
HIGH_CONTROL_BASELINE: frozenset[str] = MEDIUM_CONTROL_BASELINE | frozenset({"change_advisory_board_signoff", "canary_or_blue_green_deploy", "post_deploy_verification"})
MINIMUM_CONTROLS_BY_TIER: dict[str, frozenset[str]] = {"LOW": LOW_CONTROL_BASELINE, "MEDIUM": MEDIUM_CONTROL_BASELINE, "HIGH": HIGH_CONTROL_BASELINE}


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _factors_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped factors map" -- exactly the 5 Atlas L922 keys, each a
    LOW/MEDIUM/HIGH level. Shared by the builder and both gates, so the gates can never be laxer than
    construction."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - set(FACTOR_NAMES)
    if unknown:
        return f"unknown factor(s) {sorted(unknown, key=repr)} -- only Atlas L922's own 5 named factors are permitted"
    missing = set(FACTOR_NAMES) - set(value.keys())
    if missing:
        return f"missing factor(s) {sorted(missing, key=repr)} -- all 5 Atlas L922 factors must be declared"
    for name in FACTOR_NAMES:
        level = value.get(name)
        if level not in _LEVELS:
            return f"factors[{name!r}] must be one of {sorted(_LEVELS)}, got {level!r}"
    return None


def _derive_risk_tier(factors: dict[str, str]) -> str:
    """Atlas's own benefit "高風險自動增加控制" made structural: worst-of-5 -- the single highest-severity
    factor dominates the tier. Callers may NEVER pass ``risk_tier`` directly -- it is not a parameter of
    ``generate_change_risk_matrix`` at all, same derive-never-accept discipline this corpus's
    ``experiment.mvp`` already establishes for its own ``outcome`` field."""
    return _RANK_TO_TIER[max(_LEVEL_RANK[factors[name]] for name in FACTOR_NAMES)]


def _required_controls_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped required_controls list" -- shape only, NOT tier
    sufficiency, which needs the derived risk_tier and is checked once in
    ``generate_change_risk_matrix``/the control sufficiency gate."""
    if not isinstance(value, list):
        return f"not a list: {value!r}"
    if len(value) < 1:
        return "must declare at least 1 control"
    if not all(_is_nonempty_str(item) for item in value):
        return f"every control must be a non-empty string, got {value!r}"
    if len(value) != len(set(value)):
        return f"controls must be unique, got duplicates in {value!r}"
    return None


def generate_change_risk_matrix(
    record_id: str,
    change_description: str,
    factors: dict[str, str],
    required_controls: list[str],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/change-risk-matrix-record.schema.yaml``.

    Rebuilds ``factors``/``required_controls`` from raw input (never trusting the caller's dicts/lists), then
    enforces the method contract's own real invariants fail-closed, in order: id/version/provenance shape,
    non-empty change_description, all 5 Atlas L922 factors well-shaped -- and, the invariant this method
    exists to enforce, ``risk_tier`` is DERIVED here (never accepted as a parameter) from the 5 factors via
    the worst-of-5 rule, then ``required_controls`` is checked against that derived tier's minimum control
    baseline (Atlas's own "高風險自動增加控制"), so the returned record can never carry a narrative override
    of its own risk classification or an under-controlled high-risk change.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CHANGE_RISK_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CHANGE_RISK_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("CHANGE_RISK_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(change_description):
        raise InvariantViolation(f"CHANGE_RISK_INVALID_CHANGE_DESCRIPTION: change_description must be a non-empty string, got {change_description!r}")

    factors_problem = _factors_problem(factors)
    if factors_problem is not None:
        raise InvariantViolation(f"CHANGE_RISK_INVALID_FACTORS: {factors_problem}")
    rebuilt_factors = {name: factors[name] for name in FACTOR_NAMES}

    controls_problem = _required_controls_problem(required_controls)
    if controls_problem is not None:
        raise InvariantViolation(f"CHANGE_RISK_INVALID_CONTROLS: {controls_problem}")
    rebuilt_controls = list(required_controls)

    risk_tier = _derive_risk_tier(rebuilt_factors)
    baseline = MINIMUM_CONTROLS_BY_TIER[risk_tier]
    missing_controls = sorted(baseline - set(rebuilt_controls))
    if missing_controls:
        raise InvariantViolation(
            f"CHANGE_RISK_INSUFFICIENT_CONTROLS: risk_tier={risk_tier!r} (derived from factors {rebuilt_factors!r}) "
            f"requires at least {sorted(baseline)}, but required_controls {rebuilt_controls!r} is missing {missing_controls}"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "change_description": change_description,
        "factors": rebuilt_factors,
        "risk_tier": risk_tier,
        "required_controls": rebuilt_controls,
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_risk_tier_derivation_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L922's own worst-of-5 rule directly from raw ``factors`` -- recomputes risk_tier and
    compares against the record's own claimed risk_tier. Fails closed on malformed entries rather than
    crashing, and does NOT trust that the builder's own derivation already ran (a hand-tampered risk_tier
    bypasses the builder entirely)."""
    if not isinstance(record, dict):
        return _result("risk_tier_derivation", False, [{"reason": "record is not a dict"}], validator, timestamp)
    factors = record.get("factors")
    if _factors_problem(factors) is not None:
        return _result("risk_tier_derivation", False, [{"reason": "factors is missing or malformed"}], validator, timestamp)
    expected = _derive_risk_tier(factors)
    actual = record.get("risk_tier")
    passed = actual == expected
    return _result("risk_tier_derivation", passed, [{"expected": expected, "actual": actual}], validator, timestamp)


def evaluate_control_sufficiency_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L922's own "高風險自動增加控制" requirement directly from raw fields -- recomputes the
    minimum control baseline for the record's own claimed risk_tier and checks required_controls is a
    superset. Fails closed on malformed entries rather than crashing, and does NOT trust that the builder's
    own check already ran (a hand-tampered required_controls list bypasses the builder entirely)."""
    if not isinstance(record, dict):
        return _result("control_sufficiency", False, [{"reason": "record is not a dict"}], validator, timestamp)
    risk_tier = record.get("risk_tier")
    if risk_tier not in MINIMUM_CONTROLS_BY_TIER:
        return _result("control_sufficiency", False, [{"reason": f"risk_tier is missing or invalid: {risk_tier!r}"}], validator, timestamp)
    required_controls = record.get("required_controls")
    if _required_controls_problem(required_controls) is not None:
        return _result("control_sufficiency", False, [{"reason": "required_controls is missing or malformed"}], validator, timestamp)
    baseline = MINIMUM_CONTROLS_BY_TIER[risk_tier]
    missing = sorted(baseline - set(required_controls))
    passed = not missing
    return _result("control_sufficiency", passed, [{"risk_tier": risk_tier, "baseline": sorted(baseline), "missing": missing}], validator, timestamp)


def evaluate_change_risk_matrix_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_risk_tier_derivation_gate(record, validator, timestamp),
        evaluate_control_sufficiency_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
