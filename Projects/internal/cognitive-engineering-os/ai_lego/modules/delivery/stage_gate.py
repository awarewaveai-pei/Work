"""``delivery.stage_gate`` -- F22 PM/Delivery/Governance family (Atlas L921 table row, dedicated section
11.52 L2394-2410: "階段關卡／階段審查制").

Atlas's own table row (L921, verbatim): "Stage-Gate | 分階段用證據決定是否繼續 | stage evidence→gate
criteria→Go/Hold/Kill/Rework | 防 sunk-cost". Section 11.52 restates the pipeline (Stage -> Evidence ->
Gate -> Go/Hold/Rework/Kill) and states the benefit verbatim: "防止高成本專案一路做到底才發現方向錯"
(prevent a costly project going all the way before discovering it's on the wrong track).

**Disambiguation**: this method's own output, ``StageGateRecord``, is NOT the same object as
``execution/gate.schema.yaml#/gate_result`` -- that is the GENERIC per-method internal quality-gate
outcome this very module's own ``evaluate_*_gate`` functions below emit. ``StageGateRecord`` is a
distinct project-management artifact (a sequence of per-stage Go/Hold/Rework/Kill reviews about a
real-world initiative). See the typed-object schema's own description for the full disambiguation.

Real invariants, enforced at TWO independent layers, same belt-and-suspenders discipline every prior
slice in this corpus establishes:

1. **Decision closed set** (``STAGEGATE_INVALID_REVIEW``) -- ``gate_decision`` must be one of GO/HOLD/
   REWORK/KILL, Atlas §11.52's own verbatim pipeline terminus.
2. **GO requires evidence, THE real invariant this method exists to enforce**
   (``STAGEGATE_GO_WITHOUT_EVIDENCE``) -- a stage review decided GO must carry a non-empty ``evidence``
   array. A GO with no evidence recreates, inside the very tool meant to prevent it, exactly the "一路做
   到底才發現方向錯" (go all the way before discovering the wrong direction) failure Atlas's own benefit
   column names.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "stage.gate"/"stage_gate"/
"stagegate" and "gate_result" before writing any of this method's own files: pre-existing hits are all
Atlas/registry cross-references plus the unrelated generic ``gate_result`` execution type (disambiguated
above, not confused with it) -- zero pre-existing `delivery.*` implementation or schema-title overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "delivery.stage_gate"
RECORD_ID_PREFIX = "STAGEGATE-"
VALID_DECISIONS = frozenset({"GO", "HOLD", "REWORK", "KILL"})
_REVIEW_KEYS = frozenset({"stage_name", "evidence", "gate_criteria", "gate_decision"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonempty_str_list(value: Any, *, allow_empty: bool = False) -> bool:
    if not isinstance(value, list):
        return False
    if not value:
        return allow_empty
    return all(_is_nonempty_str(item) for item in value)


def _review_shape_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped stage_reviews[] entry" -- shape/closed-set only,
    NOT the GO-requires-evidence rule (a distinct, separately-checked invariant, see
    ``_review_decision_problem``). Consulted by both the builder and the ``review_shape_integrity`` gate."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _REVIEW_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _REVIEW_KEYS <= value.keys():
        return f"missing key(s) {sorted(_REVIEW_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("stage_name")):
        return f"stage_name must be a non-empty string, got {value.get('stage_name')!r}"
    if not _is_nonempty_str_list(value.get("evidence"), allow_empty=True):
        return f"evidence must be a list of non-empty strings (may be empty), got {value.get('evidence')!r}"
    if not _is_nonempty_str_list(value.get("gate_criteria"), allow_empty=False):
        return f"gate_criteria must be a non-empty list of non-empty strings, got {value.get('gate_criteria')!r}"
    if value.get("gate_decision") not in VALID_DECISIONS:
        return f"gate_decision must be one of {sorted(VALID_DECISIONS)}, got {value.get('gate_decision')!r}"
    return None


def _review_decision_problem(value: Any) -> str | None:
    """Precondition: ``_review_shape_problem(value) is None``. THE real invariant this method exists to
    enforce -- a GO decision must carry non-empty evidence."""
    if value.get("gate_decision") == "GO" and not value.get("evidence"):
        return (
            "gate_decision is GO but evidence is empty -- Atlas §11.52's own 防 sunk-cost benefit requires "
            "a Go decision to be evidence-backed, not asserted"
        )
    return None


def stage_review(stage_name: str, evidence: list[str], gate_criteria: list[str], gate_decision: str) -> dict[str, Any]:
    """One item of ``typed-objects/stage-gate-record.schema.yaml#/properties/stage_reviews``."""
    record = {
        "stage_name": stage_name,
        "evidence": list(evidence) if isinstance(evidence, list) else evidence,
        "gate_criteria": list(gate_criteria) if isinstance(gate_criteria, list) else gate_criteria,
        "gate_decision": gate_decision,
    }
    shape_problem = _review_shape_problem(record)
    if shape_problem is not None:
        raise InvariantViolation(f"STAGEGATE_INVALID_REVIEW: {shape_problem}")
    decision_problem = _review_decision_problem(record)
    if decision_problem is not None:
        raise InvariantViolation(f"STAGEGATE_GO_WITHOUT_EVIDENCE: {decision_problem}")
    return record


def generate_stage_gate(
    record_id: str,
    stage_reviews: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/stage-gate-record.schema.yaml``.

    Rebuilds every ``stage_reviews[]`` entry via ``stage_review()`` (never trusting the caller's raw
    dicts), then enforces the method contract's own real invariants fail-closed, in order: id/version/
    provenance shape, at least 1 review, and -- per review -- the decision closed-set + GO-requires-
    evidence rules -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"STAGEGATE_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"STAGEGATE_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("STAGEGATE_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not isinstance(stage_reviews, list) or not stage_reviews:
        raise InvariantViolation(f"STAGEGATE_EMPTY_REVIEWS: at least 1 stage review is required, got {stage_reviews!r}")

    rebuilt_reviews: list[dict[str, Any]] = []
    for i, r in enumerate(stage_reviews):
        if not isinstance(r, dict):
            raise InvariantViolation(f"STAGEGATE_INVALID_REVIEWS: stage_reviews[{i}] must be a dict, got {r!r}")
        try:
            rebuilt_reviews.append(
                stage_review(r.get("stage_name"), r.get("evidence"), r.get("gate_criteria"), r.get("gate_decision"))
            )
        except InvariantViolation as error:
            raise InvariantViolation(f"STAGEGATE_INVALID_REVIEWS: stage_reviews[{i}]: {error}") from error

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "stage_reviews": rebuilt_reviews,
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


def evaluate_review_shape_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives review shape (decision closed-set, non-empty gate_criteria) directly from raw fields
    using the SAME ``_review_shape_problem`` predicate the builder uses -- without this the gate could
    pass records the builder refuses. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("review_shape_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    reviews = record.get("stage_reviews")
    if not isinstance(reviews, list) or not reviews:
        return _result("review_shape_integrity", False, [{"reason": "stage_reviews must be a non-empty list"}], validator, timestamp)
    problems = [f"stage_reviews[{i}]: {p}" for i, p in ((i, _review_shape_problem(r)) for i, r in enumerate(reviews)) if p]
    passed = not problems
    return _result("review_shape_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_go_decision_evidence_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """THE real invariant, re-derived independently from raw fields via the SAME ``_review_decision_problem``
    predicate the builder uses -- a GO decision with no evidence is caught even when hand-tampered
    directly onto a raw dict, bypassing the builder entirely. Does NOT assume shape integrity already
    passed (recomputes against well-shaped reviews only)."""
    if not isinstance(record, dict):
        return _result("go_decision_evidence", False, [{"reason": "record is not a dict"}], validator, timestamp)
    reviews = record.get("stage_reviews")
    if not isinstance(reviews, list) or not reviews:
        return _result("go_decision_evidence", False, [{"reason": "stage_reviews must be a non-empty list"}], validator, timestamp)
    well_shaped = [r for r in reviews if _review_shape_problem(r) is None]
    problems = [f"{r['stage_name']}: {problem}" for r in well_shaped for problem in [_review_decision_problem(r)] if problem]
    passed = bool(well_shaped) and not problems
    return _result("go_decision_evidence", passed, [{"reviews_checked": len(well_shaped), "problems": problems}], validator, timestamp)


def evaluate_stage_gate_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_review_shape_integrity_gate(record, validator, timestamp),
        evaluate_go_decision_evidence_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
