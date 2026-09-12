"""``jurisdiction.compliance_gap_analysis`` -- F23 global jurisdiction/compliance/localization family (Atlas
L931-956), 1 of 4 concurrent agents opening F23 in this same parallel batch, this agent covering
Obligation-to-Control Mapping + Compliance Gap Analysis + Regulatory Horizon Scan.

Atlas cites this method ONCE: the F23 tool table row (L938, verbatim: "Compliance Gap Analysis | 比較現況與
要求 | required controls vs implemented->gaps->severity->plan | 快速知道能否上線"). Grep-confirmed the only
real hit case-insensitively across the whole Atlas file -- no dedicated section, same thin-citation class
``delivery.risk_register``/``experiment.mvp`` already establish.

**Real invariant, THE one this method exists to enforce, enforced at TWO independent layers, same "derived,
not asserted" discipline this corpus's ``experiment.mvp`` (outcome) / ``delivery.risk_register`` (exposure)
already establish** (``COMPLIANCEGAP_GAP_MISMATCH``): ``gaps[]`` is MECHANICALLY DERIVED as the set difference
``required_controls - implemented_controls``. The builder does not accept a bare ``gaps`` list of control ids
from the caller -- it takes ``gap_annotations`` (severity + plan per anticipated gap), computes the real
required/implemented set difference itself, and REFUSES if the caller's annotated control_id set does not
match that difference EXACTLY (missing an annotation for a real gap, or annotating a control_id that is not
actually a gap, are both refused). The independent gate re-derives the same set difference from a raw
(possibly hand-tampered) record and refuses a mismatch.

Second invariant (``COMPLIANCEGAP_INVALID_GAP``): every gap's ``severity``/``plan`` must be non-empty -- Atlas
L938's own pipeline names both as required stages; a gap with no severity or no plan is not actually
"快速知道能否上線" (quickly know go/no-go), just a bare list of missing control ids.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "compliance gap"/"compliance-gap"/"CGAP-"/"jurisdiction\\." before writing any of this
method's own files: zero pre-existing implementation or schema title overlap. Read
``ai_lego/modules/experiment/mvp.py`` and ``ai_lego/modules/delivery/risk_register.py`` in full for the exact
derive-never-accept convention this method's ``gaps[]`` field applies.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "jurisdiction.compliance_gap_analysis"
RECORD_ID_PREFIX = "CGAP-"
_SEVERITIES = frozenset({"low", "medium", "high", "critical"})
_GAP_KEYS = frozenset({"control_id", "severity", "plan"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _gap_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped gaps[] entry" -- shape/severity/plan only, NOT gap
    derivation (whether this control_id actually belongs in the gap set), which needs the sibling
    required_controls/implemented_controls arrays and is checked once in
    ``generate_compliance_gap_analysis``/the gate (same division of labor
    ``foresight.cross_impact_analysis``'s ``impact_pair()``/``generate_cross_impact_analysis`` split
    establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _GAP_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _GAP_KEYS <= value.keys():
        return f"missing key(s) {sorted(_GAP_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("control_id")):
        return f"control_id must be a non-empty string, got {value.get('control_id')!r}"
    if value.get("severity") not in _SEVERITIES:
        return f"severity must be one of {sorted(_SEVERITIES)}, got {value.get('severity')!r}"
    if not _is_nonempty_str(value.get("plan")):
        return f"plan must be a non-empty string, got {value.get('plan')!r} -- a gap with no plan is not actually '快速知道能否上線'"
    return None


def gap_annotation(control_id: str, severity: str, plan: str) -> dict[str, Any]:
    """One item of ``typed-objects/compliance-gap-analysis-record.schema.yaml#/properties/gaps``. Does NOT
    itself check gap derivation (that this control_id is actually in required_controls minus
    implemented_controls) -- that cross-array check happens once, in ``generate_compliance_gap_analysis``,
    after every annotation has been rebuilt."""
    record = {"control_id": control_id, "severity": severity, "plan": plan}
    problem = _gap_problem(record)
    if problem is not None:
        raise InvariantViolation(f"COMPLIANCEGAP_INVALID_GAP: {problem}")
    return record


def _is_nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and all(_is_nonempty_str(v) for v in value)


def generate_compliance_gap_analysis(
    record_id: str,
    required_controls: list[str],
    implemented_controls: list[str],
    gap_annotations: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/compliance-gap-analysis-record.schema.yaml``.

    Rebuilds every ``gap_annotations[]`` entry via ``gap_annotation()`` (never trusting the caller's raw
    dicts), then enforces the method contract's own real invariants fail-closed, in order: id/version/
    provenance shape, required_controls non-empty with unique entries, implemented_controls a list of unique
    strings, every annotation well-shaped, and -- the invariant Atlas's own "required controls vs
    implemented->gaps" pipeline stage exists to enforce -- the annotated control_id set matches
    ``required_controls - implemented_controls`` EXACTLY (a caller narrating a smaller or larger gap set than
    the real set difference is refused) -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"COMPLIANCEGAP_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"COMPLIANCEGAP_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("COMPLIANCEGAP_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not _is_nonempty_str_list(required_controls) or not required_controls:
        raise InvariantViolation(f"COMPLIANCEGAP_EMPTY_REQUIRED_CONTROLS: required_controls must be a non-empty list of non-empty strings, got {required_controls!r}")
    if len(required_controls) != len(set(required_controls)):
        duplicate = sorted({c for c in required_controls if required_controls.count(c) > 1})
        raise InvariantViolation(f"COMPLIANCEGAP_DUPLICATE_REQUIRED_CONTROL: control_id(s) {duplicate} declared more than once in required_controls")

    if not _is_nonempty_str_list(implemented_controls):
        raise InvariantViolation(f"COMPLIANCEGAP_INVALID_IMPLEMENTED_CONTROLS: implemented_controls must be a list of non-empty strings, got {implemented_controls!r}")
    if len(implemented_controls) != len(set(implemented_controls)):
        duplicate = sorted({c for c in implemented_controls if implemented_controls.count(c) > 1})
        raise InvariantViolation(f"COMPLIANCEGAP_DUPLICATE_IMPLEMENTED_CONTROL: control_id(s) {duplicate} declared more than once in implemented_controls")

    if not isinstance(gap_annotations, list):
        raise InvariantViolation(f"COMPLIANCEGAP_INVALID_GAP_ANNOTATIONS: gap_annotations must be a list, got {type(gap_annotations).__name__}")
    rebuilt_gaps: list[dict[str, Any]] = []
    for i, g in enumerate(gap_annotations):
        if not isinstance(g, dict):
            raise InvariantViolation(f"COMPLIANCEGAP_INVALID_GAP: gap_annotations[{i}] must be a dict, got {g!r}")
        try:
            rebuilt_gaps.append(gap_annotation(g.get("control_id"), g.get("severity"), g.get("plan")))
        except InvariantViolation as error:
            raise InvariantViolation(f"COMPLIANCEGAP_INVALID_GAP: gap_annotations[{i}]: {error}") from error
    annotated_ids = [g["control_id"] for g in rebuilt_gaps]
    if len(annotated_ids) != len(set(annotated_ids)):
        duplicate = sorted({cid for cid in annotated_ids if annotated_ids.count(cid) > 1})
        raise InvariantViolation(f"COMPLIANCEGAP_DUPLICATE_GAP_ANNOTATION: control_id(s) {duplicate} annotated more than once")

    expected_gap_ids = set(required_controls) - set(implemented_controls)
    annotated_id_set = set(annotated_ids)
    missing = sorted(expected_gap_ids - annotated_id_set)
    extra = sorted(annotated_id_set - expected_gap_ids)
    if missing or extra:
        raise InvariantViolation(
            f"COMPLIANCEGAP_GAP_MISMATCH: the asserted gap set does not equal required_controls - implemented_controls. "
            f"missing annotation(s) for real gap(s) {missing}; annotation(s) for non-gap control_id(s) {extra}. "
            "Atlas L938's own 'required controls vs implemented->gaps' pipeline stage requires gaps to be mechanically derived, never independently asserted"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "required_controls": list(required_controls),
        "implemented_controls": list(implemented_controls),
        "gaps": rebuilt_gaps,
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


def evaluate_gap_derivation_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives, directly from raw fields, that gaps[].control_id (as a set) equals required_controls minus
    implemented_controls -- without this the gate could pass a hand-tampered record whose gaps[] was rewritten
    after construction to narrate a different (smaller or larger) gap set than the real one. Fails closed on
    malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("gap_derivation", False, [{"reason": "record is not a dict"}], validator, timestamp)
    required = record.get("required_controls")
    implemented = record.get("implemented_controls")
    gaps = record.get("gaps")
    if not _is_nonempty_str_list(required) or not required or not _is_nonempty_str_list(implemented) or not isinstance(gaps, list):
        return _result("gap_derivation", False, [{"reason": "required_controls must be a non-empty string list, implemented_controls a string list, gaps a list"}], validator, timestamp)

    well_shaped_gaps = [g for g in gaps if isinstance(g, dict) and _is_nonempty_str(g.get("control_id"))]
    annotated_ids = {g["control_id"] for g in well_shaped_gaps}
    expected = set(required) - set(implemented)
    missing = sorted(expected - annotated_ids)
    extra = sorted(annotated_ids - expected)
    problems: list[str] = []
    if len(well_shaped_gaps) != len(gaps):
        problems.append("one or more gaps[] entries are malformed or missing control_id")
    if missing:
        problems.append(f"missing annotation(s) for real gap(s): {missing}")
    if extra:
        problems.append(f"annotation(s) for non-gap control_id(s): {extra}")
    passed = not problems
    return _result("gap_derivation", passed, [{"expected_gap_count": len(expected), "annotated_gap_count": len(annotated_ids), "problems": problems}], validator, timestamp)


def evaluate_gap_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives severity/plan non-emptiness AND control_id uniqueness directly from raw fields -- does NOT
    trust that the builder's own checks already ran. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("gap_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    gaps = record.get("gaps")
    if not isinstance(gaps, list):
        return _result("gap_completeness", False, [{"reason": "gaps must be a list"}], validator, timestamp)
    problems: list[str] = [f"gaps[{i}]: {problem}" for i, problem in ((i, _gap_problem(g)) for i, g in enumerate(gaps)) if problem]
    well_shaped = [g for g in gaps if _gap_problem(g) is None]
    ids = [g["control_id"] for g in well_shaped]
    if len(ids) != len(set(ids)):
        duplicate = sorted({cid for cid in ids if ids.count(cid) > 1})
        problems.append(f"duplicate control_id in gaps[]: {duplicate}")
    passed = not problems
    return _result("gap_completeness", passed, [{"problems": problems}], validator, timestamp)


def evaluate_compliance_gap_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_gap_derivation_gate(record, validator, timestamp),
        evaluate_gap_completeness_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
