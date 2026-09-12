"""``jurisdiction.cultural_context_review`` -- F23 Global Jurisdiction/Compliance/Localization
family (Atlas L941, §12.44 L3163-3179).

Atlas's own table row (L941, verbatim): "Cultural Context Review | 用 local evidence 評估文化因素
| trust/authority/risk/privacy/education expectations 等 | 降文化誤判" (assess cultural factors
using local evidence; lower cultural misjudgment). Dedicated §12.44 (L3163-3179) names 8 factors
checked USING LOCAL EVIDENCE, verbatim order (L3168-3175): Trust, Authority, Communication style,
Privacy perception, Risk preference, Technology acceptance, Education expectation, Historical
context. §12.44's own 關鍵規則 (key rule, L3177-3178, verbatim): "文化模型是 hypothesis/context，
不是刻板印象；高風險決策要有 Local Data / Interview / Survey / Expert Review" (a cultural model is
a hypothesis/context, NOT a stereotype; high-risk decisions require Local Data/Interview/Survey/
Expert Review as backing evidence).

Real invariants, enforced at TWO independent layers, same belt-and-suspenders discipline every
prior slice in this corpus establishes:

1. **Factor completeness** (``CULTCTX_INVALID_FACTORS``) -- ``factors`` must declare EXACTLY the
   8 §12.44 factors (no missing, no extra), each with a valid ``risk_level``, a non-empty
   ``note``, and a well-shaped ``evidence`` list.
2. **Evidence for HIGH risk, THE anti-stereotype invariant this method exists to enforce**
   (``CULTCTX_MISSING_EVIDENCE_FOR_HIGH_RISK``, bundled into the same per-factor shape check as
   #1 AND independently re-checked by its own gate) -- any factor entry with ``risk_level: HIGH``
   must carry at least 1 ``evidence`` item drawn from the closed set {LOCAL_DATA, INTERVIEW,
   SURVEY, EXPERT_REVIEW}. A HIGH-risk cultural judgment with zero evidence backing IS exactly
   the "刻板印象" (stereotype) §12.44's own 關鍵規則 forbids -- this is that rule made structural,
   not left as guidance text a caller can silently skip.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"cultural.context"/"cultural_context"/"CULTCTX" before writing any of this method's own files:
zero pre-existing implementation or schema title overlap (only method-inventory.yaml's own
`pending` placeholder row at L1488-1492 existed; a coincidental unrelated hit on the phrase
"cultural context" inside ``insight.survey``'s own docstring cites a different Atlas section,
§12.18, and is a different method).
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "jurisdiction.cultural_context_review"
RECORD_ID_PREFIX = "CULTCTX-"

# Verbatim order, Atlas §12.44 L3168-3175.
FACTORS: tuple[str, ...] = (
    "trust",
    "authority",
    "communication_style",
    "privacy_perception",
    "risk_preference",
    "technology_acceptance",
    "education_expectation",
    "historical_context",
)
_FACTOR_SET = frozenset(FACTORS)
_RISK_LEVELS = frozenset({"LOW", "MEDIUM", "HIGH"})
_FACTOR_ENTRY_KEYS = frozenset({"risk_level", "note", "evidence"})
# §12.44's own 關鍵規則 vocabulary, transcribed verbatim (Local Data/Interview/Survey/Expert Review).
EVIDENCE_TYPES = frozenset({"LOCAL_DATA", "INTERVIEW", "SURVEY", "EXPERT_REVIEW"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _evidence_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped evidence list" -- a list of unique strings
    drawn from the closed §12.44 evidence-source set. Does NOT check the HIGH-risk-requires-
    non-empty rule (that needs the sibling ``risk_level``, checked once in
    ``_factor_entry_problem``)."""
    if not isinstance(value, list):
        return f"evidence must be a list, got {value!r}"
    for i, item in enumerate(value):
        if item not in EVIDENCE_TYPES:
            return f"evidence[{i}] must be one of {sorted(EVIDENCE_TYPES)}, got {item!r}"
    if len(value) != len(set(value)):
        return f"evidence must not contain duplicate entries, got {value!r}"
    return None


def _factor_entry_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped factor entry" -- shape, risk_level enum,
    non-empty note, well-shaped evidence, AND §12.44's own 關鍵規則: a HIGH risk_level requires at
    least 1 evidence item. Both ``factor_entry()`` (construction layer) and both gates
    (independent re-derivation layer) consult it, same single-shared-predicate discipline
    ``foresight.cross_impact_analysis``'s own ``_pair_problem`` establishes (which likewise
    bundles a cross-field rule -- there, no-self-pair -- into the single entry-shape check)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _FACTOR_ENTRY_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _FACTOR_ENTRY_KEYS <= value.keys():
        return f"missing key(s) {sorted(_FACTOR_ENTRY_KEYS - value.keys(), key=repr)}"
    if value.get("risk_level") not in _RISK_LEVELS:
        return f"risk_level must be one of {sorted(_RISK_LEVELS)}, got {value.get('risk_level')!r}"
    if not _is_nonempty_str(value.get("note")):
        return f"note must be a non-empty string, got {value.get('note')!r}"
    evidence_problem = _evidence_problem(value.get("evidence"))
    if evidence_problem is not None:
        return evidence_problem
    if value.get("risk_level") == "HIGH" and len(value.get("evidence")) == 0:
        return (
            "CULTCTX_MISSING_EVIDENCE_FOR_HIGH_RISK: risk_level is HIGH but evidence is empty -- "
            f"§12.44's own 關鍵規則 requires at least 1 item from {sorted(EVIDENCE_TYPES)} to back a "
            "HIGH-risk cultural judgment; a HIGH-risk claim with no evidence is exactly the 刻板印象 (stereotype) the rule forbids"
        )
    return None


def factor_entry(risk_level: str, note: str, evidence: list[str]) -> dict[str, Any]:
    """One item of ``typed-objects/cultural-context-review-record.schema.yaml#/factor_entry``."""
    record = {"risk_level": risk_level, "note": note, "evidence": list(evidence) if isinstance(evidence, list) else evidence}
    problem = _factor_entry_problem(record)
    if problem is not None:
        raise InvariantViolation(f"CULTCTX_INVALID_FACTOR: {problem}")
    return record


def _factors_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped factors map" -- EXACTLY the 8 §12.44 keys,
    each a well-shaped entry. Shared by the builder and both gates, so the gates can never be
    laxer than construction."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _FACTOR_SET
    if unknown:
        return f"unknown factor(s) {sorted(unknown, key=repr)} -- only the 8 §12.44 factors are permitted"
    missing = _FACTOR_SET - set(value.keys())
    if missing:
        return f"missing factor(s) {sorted(missing, key=repr)} -- all 8 §12.44 factors must be declared"
    for name in FACTORS:
        problem = _factor_entry_problem(value.get(name))
        if problem is not None:
            return f"factors[{name!r}]: {problem}"
    return None


def generate_cultural_context_review(
    record_id: str,
    target: str,
    factors: dict[str, dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/cultural-context-review-record.schema.yaml``.

    Rebuilds every ``factors[]`` entry via ``factor_entry()`` (never trusting the caller's raw
    dicts), then enforces the method contract's own real invariants fail-closed, in order: id/
    version/provenance shape, non-empty target, exactly the 8 §12.44 factors declared and
    well-shaped -- and, the invariant this method exists to enforce, every HIGH-``risk_level``
    factor carries at least 1 evidence item from the closed §12.44 set, BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CULTCTX_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CULTCTX_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("CULTCTX_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(target):
        raise InvariantViolation(f"CULTCTX_INVALID_TARGET: target must be a non-empty string, got {target!r}")

    problem = _factors_problem(factors)
    if problem is not None:
        raise InvariantViolation(f"CULTCTX_INVALID_FACTORS: {problem}")

    rebuilt_factors = {name: factor_entry(factors[name]["risk_level"], factors[name]["note"], factors[name]["evidence"]) for name in FACTORS}

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "target": target,
        "factors": rebuilt_factors,
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


def evaluate_factor_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives factor completeness (and, transitively via ``_factor_entry_problem``, the
    evidence-for-HIGH-risk rule) directly from raw fields using the SAME ``_factors_problem``
    predicate the builder uses -- without this the gate could pass a hand-tampered record
    missing a factor the builder would have refused."""
    if not isinstance(record, dict):
        return _result("factor_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problem = _factors_problem(record.get("factors"))
    return _result("factor_completeness", problem is None, [{"problem": problem}], validator, timestamp)


def evaluate_evidence_required_for_high_risk_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives §12.44's own 關鍵規則 directly from raw fields, independently of overall factor
    completeness -- scans EVERY well-shaped-enough (dict, valid risk_level, well-shaped evidence)
    factor entry present in the record for a HIGH risk_level with empty evidence, even if other
    factors are missing/malformed or the record was hand-tampered to bypass the builder entirely.
    Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("evidence_required_for_high_risk", False, [{"reason": "record is not a dict"}], validator, timestamp)
    factors = record.get("factors")
    if not isinstance(factors, dict):
        return _result("evidence_required_for_high_risk", False, [{"reason": "factors must be a dict"}], validator, timestamp)

    violations: list[str] = []
    for name, entry in factors.items():
        if not isinstance(entry, dict):
            continue
        if entry.get("risk_level") != "HIGH":
            continue
        evidence = entry.get("evidence")
        if _evidence_problem(evidence) is not None or len(evidence) == 0:
            violations.append(f"{name!r}: HIGH risk_level with no valid evidence")
    passed = not violations
    return _result("evidence_required_for_high_risk", passed, [{"violations": violations}], validator, timestamp)


def evaluate_cultural_context_review_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_factor_completeness_gate(record, validator, timestamp),
        evaluate_evidence_required_for_high_risk_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
