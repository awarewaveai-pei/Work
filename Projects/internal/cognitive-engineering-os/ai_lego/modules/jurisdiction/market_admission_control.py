"""``jurisdiction.market_admission_control`` -- F23 global jurisdiction/compliance/localization family (Atlas
L942, §11.54 L2440-2465).

Atlas's own table row (L942, verbatim): "Market Admission Control | 新市場
go/no-go gate | pack→legal freshness→data→provider→security→localization→
sign-off | 市場級最小爆炸半徑" (a new-market go/no-go gate, via pack, legal
freshness, data, provider, security, localization, sign-off, giving a
market-level minimal blast radius). Dedicated §11.54 (L2440-2465) names the
full pipeline as 7 sequential stages plus a human sign-off before ENABLE,
with an explicit rule: "任一 critical unknown：FAIL CLOSED".

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Stage completeness** (``MADM_MISSING_STAGE`` / ``MADM_INVALID_STAGES``)
   -- ``stages[]`` must declare EXACTLY the 7 Atlas §11.54 stage names,
   each exactly once (jurisdiction_pack, legal_freshness, data_residency,
   ai_provider, security_privacy, localization_accessibility,
   sector_controls).
2. **Derived decision, THE real invariant this method exists to enforce**
   (``MADM_DECISION_INCONSISTENT``) -- ``admission_decision`` is NEVER a
   builder parameter (the caller cannot assert ``ENABLE`` directly); it is
   always mechanically computed as ENABLE iff every stage status is PASS
   AND ``human_signoff`` is a non-empty string, else FAIL_CLOSED. This is
   §11.54's own "任一 critical unknown：FAIL CLOSED" rule and its stated
   benefit ("把「全球支援」變成可驗證 admission process，而不是行銷宣稱")
   made structural.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"market_admission_control"/"MarketAdmissionRecord"/"market admission"
before writing any of this method's own files: zero pre-existing
implementation or schema title overlap. Pre-existing
``specs/jurisdiction/pack.schema.yaml`` ("Jurisdiction Pack / Applicable
Pack") is a distinct, Master-Plan-sourced registry object for a Pack's own
authored freshness/residency/override state -- not this method's per-
admission-request stage record.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "jurisdiction.market_admission_control"
RECORD_ID_PREFIX = "MADM-"

STAGE_NAMES = (
    "jurisdiction_pack",
    "legal_freshness",
    "data_residency",
    "ai_provider",
    "security_privacy",
    "localization_accessibility",
    "sector_controls",
)
_STAGE_NAME_SET = frozenset(STAGE_NAMES)
_STATUSES = frozenset({"PASS", "FAIL", "UNKNOWN"})
_STAGE_KEYS = frozenset({"stage", "status", "note"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _stage_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped stages[] entry" -- shape only, NOT the exactly-7-stages
    set completeness check, which needs the sibling entries and is checked once in
    ``generate_market_admission``/the gate (same division of labor ``foresight.cross_impact_analysis``'s
    ``event()``/``generate_cross_impact_analysis`` split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _STAGE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _STAGE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_STAGE_KEYS - value.keys(), key=repr)}"
    if value.get("stage") not in _STAGE_NAME_SET:
        return f"stage must be one of {sorted(_STAGE_NAME_SET)}, got {value.get('stage')!r}"
    if value.get("status") not in _STATUSES:
        return f"status must be one of {sorted(_STATUSES)}, got {value.get('status')!r}"
    if not _is_nonempty_str(value.get("note")):
        return f"note must be a non-empty string, got {value.get('note')!r}"
    return None


def stage_result(stage: str, status: str, note: str) -> dict[str, Any]:
    """One item of ``typed-objects/market-admission-record.schema.yaml#/properties/stages``."""
    record = {"stage": stage, "status": status, "note": note}
    problem = _stage_problem(record)
    if problem is not None:
        raise InvariantViolation(f"MADM_INVALID_STAGE: {problem}")
    return record


def _human_signoff_problem(value: Any) -> str | None:
    if value is None:
        return None
    if not _is_nonempty_str(value):
        return f"human_signoff must be null or a non-empty string, got {value!r}"
    return None


def _derive_admission_decision(stages: list[dict[str, Any]], human_signoff: Any) -> str:
    """THE real invariant. Atlas §11.54's own 'FAIL CLOSED' rule, made mechanical: ENABLE iff every stage is
    PASS AND human_signoff is a non-empty string. Never a caller-supplied value -- see module docstring."""
    all_pass = all(s.get("status") == "PASS" for s in stages)
    signed_off = _is_nonempty_str(human_signoff)
    return "ENABLE" if all_pass and signed_off else "FAIL_CLOSED"


def generate_market_admission(
    record_id: str,
    market_id: str,
    stages: list[dict[str, Any]],
    human_signoff: str | None,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/market-admission-record.schema.yaml``.

    Rebuilds every ``stages[]`` entry via ``stage_result()`` (never trusting the caller's raw dicts), then
    enforces the method contract's own real invariants fail-closed, in order: id/version/provenance shape,
    exactly the 7 Atlas §11.54 stage names each exactly once, a well-shaped ``human_signoff`` -- and, the
    invariant this method exists to enforce, DERIVES ``admission_decision`` from the rebuilt stages and
    sign-off (this function has NO parameter for the caller to assert it directly). No caller input can ever
    force ``ENABLE`` past a FAIL or UNKNOWN stage or a missing sign-off.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"MADM_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"MADM_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("MADM_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(market_id):
        raise InvariantViolation(f"MADM_INVALID_MARKET_ID: market_id must be a non-empty string, got {market_id!r}")

    if not isinstance(stages, list):
        raise InvariantViolation(f"MADM_INVALID_STAGES: stages must be a list, got {type(stages).__name__}")
    rebuilt_stages: list[dict[str, Any]] = []
    for i, s in enumerate(stages):
        if not isinstance(s, dict):
            raise InvariantViolation(f"MADM_INVALID_STAGES: stages[{i}] must be a dict, got {s!r}")
        try:
            rebuilt_stages.append(stage_result(s.get("stage"), s.get("status"), s.get("note")))
        except InvariantViolation as error:
            raise InvariantViolation(f"MADM_INVALID_STAGES: stages[{i}]: {error}") from error

    stage_names = [s["stage"] for s in rebuilt_stages]
    stage_name_set = set(stage_names)
    if len(stage_names) != len(stage_name_set):
        duplicate = sorted({s for s in stage_names if stage_names.count(s) > 1})
        raise InvariantViolation(f"MADM_DUPLICATE_STAGE: stage(s) {duplicate} declared more than once")
    missing = sorted(_STAGE_NAME_SET - stage_name_set)
    if missing:
        raise InvariantViolation(f"MADM_MISSING_STAGE: stage(s) {missing} are required by Atlas §11.54's own 7-stage pipeline but not present")
    extra = sorted(stage_name_set - _STAGE_NAME_SET)
    if extra:
        raise InvariantViolation(f"MADM_UNKNOWN_STAGE: stage(s) {extra} are not part of Atlas §11.54's 7-stage pipeline")

    signoff_problem = _human_signoff_problem(human_signoff)
    if signoff_problem is not None:
        raise InvariantViolation(f"MADM_INVALID_HUMAN_SIGNOFF: {signoff_problem}")

    admission_decision = _derive_admission_decision(rebuilt_stages, human_signoff)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "market_id": market_id,
        "stages": rebuilt_stages,
        "human_signoff": human_signoff,
        "admission_decision": admission_decision,
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


def evaluate_stage_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the exactly-7-stages invariant directly from raw fields using the SAME ``_stage_problem``
    predicate the builder uses -- without this the gate could pass a hand-tampered record missing a stage or
    carrying a duplicate. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("stage_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    stages = record.get("stages")
    problems: list[str] = []
    if isinstance(stages, list):
        malformed = [f"stages[{i}]: {problem}" for i, problem in ((i, _stage_problem(s)) for i, s in enumerate(stages)) if problem]
        problems.extend(malformed)
        well_shaped = [s for s in stages if _stage_problem(s) is None]
        stage_names = [s["stage"] for s in well_shaped]
        stage_name_set = set(stage_names)
        if not malformed:
            if len(stage_names) != len(stage_name_set):
                problems.append(f"duplicate stage in stages[]: {stage_names!r}")
            missing = sorted(_STAGE_NAME_SET - stage_name_set)
            if missing:
                problems.append(f"missing stage(s): {missing}")
            extra = sorted(stage_name_set - _STAGE_NAME_SET)
            if extra:
                problems.append(f"unknown stage(s): {extra}")
    else:
        problems.append("stages must be a list")
    passed = not problems
    return _result("stage_completeness", passed, [{"problems": problems}], validator, timestamp)


def evaluate_admission_decision_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §11.54's own 'FAIL CLOSED' rule directly from raw fields -- recomputes the expected
    admission_decision from stages/human_signoff and compares against the record's own claimed decision.
    Fails closed on malformed entries rather than crashing, and does NOT trust that the builder's own
    recomputation already ran (a hand-tampered decision bypasses the builder entirely)."""
    if not isinstance(record, dict):
        return _result("admission_decision_consistency", False, [{"reason": "record is not a dict"}], validator, timestamp)
    stages = record.get("stages")
    human_signoff = record.get("human_signoff")
    claimed = record.get("admission_decision")
    problems: list[str] = []

    if not isinstance(stages, list) or any(_stage_problem(s) is not None for s in stages):
        problems.append("stages is missing or contains malformed entries")
    elif {s["stage"] for s in stages} != _STAGE_NAME_SET or len(stages) != len(_STAGE_NAME_SET):
        problems.append("stages does not declare exactly the 7 required stage names")
    signoff_problem = _human_signoff_problem(human_signoff)
    if signoff_problem is not None:
        problems.append(signoff_problem)
    if claimed not in {"ENABLE", "FAIL_CLOSED"}:
        problems.append(f"admission_decision must be ENABLE or FAIL_CLOSED, got {claimed!r}")

    if not problems:
        expected = _derive_admission_decision(stages, human_signoff)
        if claimed != expected:
            problems.append(f"admission_decision={claimed!r} but recomputation gives {expected!r}")

    passed = not problems
    return _result("admission_decision_consistency", passed, [{"problems": problems}], validator, timestamp)


def evaluate_market_admission_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_stage_completeness_gate(record, validator, timestamp),
        evaluate_admission_decision_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
