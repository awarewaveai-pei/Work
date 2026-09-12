"""``experiment.technical_spike`` -- F15 experiment & validation family (Atlas L741).

Atlas's own table row (L741, verbatim): "Technical Spike | 限時研究技術未知 |
timebox->question->experiment/docs->decision note | 提升估算可信度" (time-boxed
research into a technical unknown; timebox->question->experiment/docs->decision
note; improves estimation credibility).

F15's shared core principle (Atlas L750-752, verbatim): 找到「最便宜且足以證偽
Critical Assumption 的測試」，而不是讓 AI 主觀打 8.7/10 (find the cheapest test
sufficient to falsify the Critical Assumption, not a subjective AI score).
Operationalized here for the Critical Assumption a Technical Spike falsifies
-- "we don't know if X is technically feasible / how long it takes" -- via a
structurally BOUNDED research window: a spike that never closes, or closes an
unbounded time after its own declared deadline, produces no comparable
estimate and falsifies nothing (an open-ended "spike" is unstructured
exploration wearing the name).

Real invariants, enforced at TWO independent layers, same belt-and-suspenders
discipline every prior slice in this corpus establishes:

1. **Timebox bound** (``SPIKE_TIMEBOX_NOT_BOUNDED``) -- ``deadline`` strictly
   after ``started_at``. A "timebox" with zero or negative duration bounds
   nothing.
2. **Timebox kept** (``SPIKE_TIMEBOX_EXCEEDED``) -- the ACTUAL ``closed_at``
   falls within ``[started_at, deadline]``. Declaring a timebox and then
   blowing past it is the same failure Atlas's own estimation-credibility
   benefit exists to prevent.
3. **Decision grounding, THE real invariant Atlas's own pipeline names
   last** (``SPIKE_DECISION_OUTSIDE_WINDOW``) -- ``decision_note.decided_at``
   must fall within the spike's own actual ``[started_at, closed_at]``
   window -- a decision recorded before the spike started or long after it
   closed is not the spike's own terminating act, it is a disconnected
   afterthought.
4. **Evidence before decision** (schema-level ``minItems: 1`` on
   ``findings[]``, enforced here too) -- Atlas's own pipeline requires an
   "experiment/docs" stage BEFORE the decision note; a decision note with
   zero findings skipped that stage entirely.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"technical spike"/"technical_spike"/"timebox" before writing any of this
method's own files: zero pre-existing implementation or schema title overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.core.support import parse_timestamp
from ai_lego.errors import InvariantViolation

METHOD_ID = "experiment.technical_spike"
RECORD_ID_PREFIX = "SPIKE-"

_FINDING_SOURCE_TYPES = frozenset({"EXPERIMENT", "DOCS"})
_FINDING_KEYS = frozenset({"source_type", "summary"})
_TIMEBOX_KEYS = frozenset({"started_at", "deadline", "closed_at"})
_DECISION_NOTE_KEYS = frozenset({"decision", "rationale", "decided_at"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _safe_parse_timestamp(value: Any):
    """Fail-closed wrapper around ``ai_lego.core.support.parse_timestamp``: construction call sites hand it
    already-shape-checked strings, but a GATE re-derives from raw, potentially hand-tampered fields with no
    such guarantee. Returns ``None`` (never a valid timestamp) on any parse failure or non-string input."""
    if not isinstance(value, str):
        return None
    try:
        return parse_timestamp(value)
    except (TypeError, ValueError):
        return None


def _finding_shape_is_valid(value: Any) -> bool:
    if not isinstance(value, dict) or set(value.keys()) != _FINDING_KEYS:
        return False
    if value.get("source_type") not in _FINDING_SOURCE_TYPES:
        return False
    return _is_nonempty_str(value.get("summary"))


def finding(source_type: str, summary: str) -> dict[str, Any]:
    """One item of ``typed-objects/technical-spike-record.schema.yaml#/properties/findings``."""
    record = {"source_type": source_type, "summary": summary}
    if not _finding_shape_is_valid(record):
        raise InvariantViolation(
            f"SPIKE_INVALID_FINDING: source_type must be one of {sorted(_FINDING_SOURCE_TYPES)} and summary a "
            f"non-empty string, got {record!r}"
        )
    return record


def _timebox_shape_is_valid(value: Any) -> bool:
    if not isinstance(value, dict) or set(value.keys()) != _TIMEBOX_KEYS:
        return False
    return all(_safe_parse_timestamp(value.get(k)) is not None for k in _TIMEBOX_KEYS)


def _timebox_bound_violations(timebox_value: dict[str, Any]) -> list[str]:
    """Invariant #1. Precondition: ``_timebox_shape_is_valid`` already True."""
    started_at = parse_timestamp(timebox_value["started_at"])
    deadline = parse_timestamp(timebox_value["deadline"])
    if not deadline > started_at:
        return [f"deadline {timebox_value['deadline']!r} is not strictly after started_at {timebox_value['started_at']!r}"]
    return []


def _timebox_closure_violations(timebox_value: dict[str, Any]) -> list[str]:
    """Invariant #2. Precondition: ``_timebox_shape_is_valid`` already True (does NOT require the bound
    invariant above to already hold -- evaluated independently so a hand-tampered record with BOTH defects
    reports both, same discipline ``foresight.cross_impact_analysis``'s matrix-completeness gate uses)."""
    started_at = parse_timestamp(timebox_value["started_at"])
    deadline = parse_timestamp(timebox_value["deadline"])
    closed_at = parse_timestamp(timebox_value["closed_at"])
    violations: list[str] = []
    if closed_at < started_at:
        violations.append(f"closed_at {timebox_value['closed_at']!r} is before started_at {timebox_value['started_at']!r}")
    if closed_at > deadline:
        violations.append(f"closed_at {timebox_value['closed_at']!r} is after the declared deadline {timebox_value['deadline']!r}")
    return violations


def _decision_note_shape_is_valid(value: Any) -> bool:
    if not isinstance(value, dict) or set(value.keys()) != _DECISION_NOTE_KEYS:
        return False
    if not _is_nonempty_str(value.get("decision")) or not _is_nonempty_str(value.get("rationale")):
        return False
    return _safe_parse_timestamp(value.get("decided_at")) is not None


def _decision_grounding_violations(timebox_value: dict[str, Any], decision_note_value: dict[str, Any]) -> list[str]:
    """Invariant #3. Precondition: ``_timebox_shape_is_valid(timebox_value)`` and
    ``_decision_note_shape_is_valid(decision_note_value)`` both already True."""
    started_at = parse_timestamp(timebox_value["started_at"])
    closed_at = parse_timestamp(timebox_value["closed_at"])
    decided_at = parse_timestamp(decision_note_value["decided_at"])
    if decided_at < started_at or decided_at > closed_at:
        return [
            f"decided_at {decision_note_value['decided_at']!r} falls outside the spike's own actual window "
            f"[{timebox_value['started_at']!r}, {timebox_value['closed_at']!r}]"
        ]
    return []


def generate_technical_spike_record(
    record_id: str,
    question: str,
    timebox: dict[str, Any],
    findings: list[dict[str, Any]],
    decision_note: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/technical-spike-record.schema.yaml``.

    Rebuilds ``findings[]`` via ``finding()`` (never trusting the caller's raw dicts), then enforces the
    method contract's own real invariants fail-closed, in order: id/version/provenance shape, non-empty
    question, timebox shape+bound+closure, at least 1 finding, decision note shape, and -- the invariant
    Atlas's own pipeline names last -- the decision falls within the spike's own actual window -- BEFORE
    returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SPIKE_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SPIKE_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("SPIKE_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(question):
        raise InvariantViolation(f"SPIKE_EMPTY_QUESTION: question must be a non-empty string, got {question!r}")

    if not _timebox_shape_is_valid(timebox):
        raise InvariantViolation(
            f"SPIKE_INVALID_TIMEBOX_SHAPE: timebox must be a dict with exactly {sorted(_TIMEBOX_KEYS)}, each a "
            f"parseable timestamp, got {timebox!r}"
        )
    bound_violations = _timebox_bound_violations(timebox)
    if bound_violations:
        raise InvariantViolation(f"SPIKE_TIMEBOX_NOT_BOUNDED: {'; '.join(bound_violations)}")
    closure_violations = _timebox_closure_violations(timebox)
    if closure_violations:
        raise InvariantViolation(f"SPIKE_TIMEBOX_EXCEEDED: {'; '.join(closure_violations)}")

    if not isinstance(findings, list) or not findings:
        raise InvariantViolation(f"SPIKE_TOO_FEW_FINDINGS: at least 1 finding (experiment or docs) is required, got {findings!r}")
    rebuilt_findings: list[dict[str, Any]] = []
    for i, f in enumerate(findings):
        if not isinstance(f, dict):
            raise InvariantViolation(f"SPIKE_INVALID_FINDING: findings[{i}] must be a dict, got {f!r}")
        try:
            rebuilt_findings.append(finding(f.get("source_type"), f.get("summary")))
        except InvariantViolation as error:
            raise InvariantViolation(f"SPIKE_INVALID_FINDING: findings[{i}]: {error}") from error

    if not _decision_note_shape_is_valid(decision_note):
        raise InvariantViolation(
            f"SPIKE_INVALID_DECISION_NOTE: decision_note must be a dict with exactly {sorted(_DECISION_NOTE_KEYS)}, "
            f"decision/rationale non-empty strings, decided_at a parseable timestamp, got {decision_note!r}"
        )
    grounding_violations = _decision_grounding_violations(timebox, decision_note)
    if grounding_violations:
        raise InvariantViolation(f"SPIKE_DECISION_OUTSIDE_WINDOW: {'; '.join(grounding_violations)}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "question": question,
        "timebox": dict(timebox),
        "findings": rebuilt_findings,
        "decision_note": dict(decision_note),
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


def evaluate_timebox_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariants #1+#2 directly from raw fields using the SAME ``_timebox_shape_is_valid``/
    ``_timebox_bound_violations``/``_timebox_closure_violations`` predicates the builder uses. Fails closed
    on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("timebox_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    timebox_value = record.get("timebox")
    if not _timebox_shape_is_valid(timebox_value):
        return _result("timebox_integrity", False, [{"reason": "timebox missing, malformed, or contains unparseable timestamps"}], validator, timestamp)
    problems = _timebox_bound_violations(timebox_value) + _timebox_closure_violations(timebox_value)
    return _result("timebox_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_decision_grounded_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariants #3+#4 directly from raw fields -- does NOT assume ``timebox_integrity`` already
    passed (only needs the timebox to be well-SHAPED to compute a window, independent of whether that window
    is itself bound/closure-valid). Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("decision_grounded", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []
    findings = record.get("findings")
    if not isinstance(findings, list) or not findings or not all(_finding_shape_is_valid(f) for f in findings):
        problems.append("findings[] must be a non-empty list of well-shaped entries (source_type in {EXPERIMENT, DOCS}, non-empty summary)")
    decision_note_value = record.get("decision_note")
    if not _decision_note_shape_is_valid(decision_note_value):
        problems.append("decision_note missing, malformed, or decided_at unparseable")
    timebox_value = record.get("timebox")
    if not _timebox_shape_is_valid(timebox_value):
        problems.append("timebox missing or malformed -- cannot evaluate decision grounding without it")
    elif _decision_note_shape_is_valid(decision_note_value):
        problems.extend(_decision_grounding_violations(timebox_value, decision_note_value))
    return _result("decision_grounded", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_technical_spike_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_timebox_integrity_gate(record, validator, timestamp),
        evaluate_decision_grounded_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
