"""``decision.eisenhower_matrix`` -- decision family, added 2026-09-18 per direct operator request
after comparing this system's method catalog against MindManager's template gallery. NOT an
Atlas-cited method (grep-confirmed zero "Eisenhower" hits in
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md) -- see
``ai_lego/compute/eisenhower_matrix/classification.py`` for the external (non-Atlas) grounding
this method rests on instead.

Due-diligence comparison against ``decision.impact_effort`` (read in full first): structurally
the same shape (2 numeric axes, 2 thresholds, 4-way quadrant split, both read in full before
writing this module), but a DIFFERENT method, not an alias -- different axes (urgency/importance,
not impact/effort), different quadrant semantics (action verbs -- do it now / plan it / hand it
off / drop it -- not an effort-triage framing), and a different, non-overlapping real-world
citation. Same two real, independently-enforced invariants impact_effort's own contract
establishes for this exact shape:

1. **Quadrant genuine-compute** (``EISENHOWER_QUADRANT_MISMATCH``, surfaced via
   ``evaluate_quadrant_integrity_gate``): every task's own ``quadrant`` is COMPUTED at
   construction (no constructor parameter for it) and independently re-derived at the gate from
   the record's own raw urgency/importance/thresholds.
2. **Scale consistency** (``EISENHOWER_VALUE_OUT_OF_SCALE`` / ``EISENHOWER_THRESHOLD_OUT_OF_SCALE``):
   urgency and importance are each validated against their own declared {min, max} range; one
   declared ``urgency_scale`` / ``importance_scale`` per record, never a per-task override.

A third guard, ``assert_no_automatic_authority_claim``, is carried over from impact_effort's own
inferred (not table-cited there either) caution: a first-pass triage tool should not itself carry
a top-level claim of final/automatic authority over which tasks get done.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.eisenhower_matrix.classification import (
    VALID_QUADRANTS,
    classify_quadrant,
    classify_tasks,
    validate_scale,
    validate_threshold_in_scale,
    validate_value_in_scale,
)
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.gates import evaluate_statistical_gate

METHOD_ID = "decision.eisenhower_matrix"
RECORD_ID_PREFIX = "EISENHOWER-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.eisenhower_matrix.classification.classify_quadrant"
FORBIDDEN_AUTHORITY_KEYS = frozenset({"approved", "decision", "final_decision", "automatic_decision", "authorized", "outcome"})

_KNOWN_TASK_INPUT_KEYS = frozenset({"id", "label", "urgency", "importance"})


def assert_no_automatic_authority_claim(record: dict[str, Any]) -> None:
    if not isinstance(record, dict):
        raise InvariantViolation(f"EISENHOWER_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: record must be a dict, got {type(record).__name__}")
    violations = FORBIDDEN_AUTHORITY_KEYS & record.keys()
    if violations:
        raise InvariantViolation(
            f"EISENHOWER_AUTOMATIC_AUTHORITY_CLAIM_FORBIDDEN: top-level key(s) {sorted(violations)} assert automatic/final authority "
            "-- a first-pass triage tool must not itself decide what gets done"
        )


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _task_input_is_valid(task: Any) -> bool:
    if not isinstance(task, dict) or set(task.keys()) != _KNOWN_TASK_INPUT_KEYS:
        return False
    if not _is_nonempty_str(task["id"]) or not _is_nonempty_str(task["label"]):
        return False
    urgency, importance = task["urgency"], task["importance"]
    if isinstance(urgency, bool) or isinstance(importance, bool):
        return False
    return isinstance(urgency, (int, float)) and isinstance(importance, (int, float))


def generate_eisenhower_matrix_classification(
    record_id: str,
    subject: str,
    tasks: list[dict[str, Any]],
    urgency_scale: dict[str, Any],
    importance_scale: dict[str, Any],
    urgency_threshold: float,
    importance_threshold: float,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Enforces preconditions fail-closed, in this order: id/subject/version shape, task shape,
    task-id-uniqueness, then scale/threshold/value-range validation and quadrant computation
    (delegated to classify_tasks). ``quadrant`` is COMPUTED -- there is no parameter for it."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"EISENHOWER_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(subject):
        raise InvariantViolation(f"EISENHOWER_EMPTY_RECORD_FIELD: subject must be a non-empty string, got {subject!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"EISENHOWER_INVALID_VERSION: version must be a string, got {version!r}")
    if not isinstance(tasks, list) or not tasks or not all(_task_input_is_valid(t) for t in tasks):
        raise InvariantViolation(
            f"EISENHOWER_INVALID_TASKS: tasks must be a non-empty list of well-shaped entries "
            f"(id/label non-empty strings, urgency/importance real numbers, no extra/missing keys), got {_shallow_describe(tasks)}"
        )
    ids = [t["id"] for t in tasks]
    if len(set(ids)) != len(ids):
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        raise InvariantViolation(f"EISENHOWER_DUPLICATE_TASK_ID: id(s) {duplicates} used more than once -- every task id must be unique in the record")

    classified_tasks = classify_tasks(tasks, urgency_scale, importance_scale, urgency_threshold, importance_threshold)

    # This record's quadrant is ALWAYS a deterministic recomputation (evaluate_genuine_compute_gate
    # demands epistemic_type == "CALCULATED_RESULT", ai_lego/modules/research/gates.py:94) --
    # never a caller choice, regardless of what epistemic_type the caller's own provenance carries.
    # Normalizing it here (authorship_state passes through unchanged -- that dimension IS a real
    # caller/API-layer choice) fixes a real, verified bug in the sibling decision.impact_effort,
    # which embeds the caller-supplied provenance verbatim: main.py's own /methods/{id}/invoke
    # defaults an un-supplied provenance to epistemic_type=AI_INFERENCE (main.py:784), which
    # genuine_compute then FAILS every single time -- reproduced directly via dispatch.invoke_builder
    # with that exact default, 2026-09-18. Not fixed in impact_effort itself here (would touch
    # already-shipped, tested code outside this task's scope) -- flagged to the operator separately.
    if not isinstance(provenance, dict):
        raise InvariantViolation(f"EISENHOWER_INVALID_PROVENANCE: provenance must be an object, got {_shallow_describe(provenance)}")
    normalized_provenance = {**provenance, "epistemic_type": "CALCULATED_RESULT"}
    if not provenance_is_valid(normalized_provenance):
        raise InvariantViolation(f"EISENHOWER_INVALID_PROVENANCE: provenance failed schema validation after normalizing epistemic_type, got {_shallow_describe(provenance)}")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject": subject,
        "urgency_scale": dict(urgency_scale),
        "importance_scale": dict(importance_scale),
        "urgency_threshold": urgency_threshold,
        "importance_threshold": importance_threshold,
        "tasks": classified_tasks,
        "engine": "local_python_deterministic_compute",
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
        "provenance": normalized_provenance,
    }
    assert_no_automatic_authority_claim(record)
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_genuine_compute_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    if not isinstance(record, dict):
        return _result("genuine_compute", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed, evidence = evaluate_statistical_gate(record)
    return _result("genuine_compute", passed, evidence, validator, timestamp)


def evaluate_quadrant_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives every structural/value precondition from the record's own raw fields -- does
    not trust any stored value, including whether each task's own ``quadrant`` actually matches
    what ``classify_quadrant`` recomputes fresh."""
    if not isinstance(record, dict):
        return _result("quadrant_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("quadrant_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject")):
        return _result("quadrant_integrity", False, [{"reason": "subject missing or empty"}], validator, timestamp)

    urgency_scale, importance_scale = record.get("urgency_scale"), record.get("importance_scale")
    urgency_threshold, importance_threshold = record.get("urgency_threshold"), record.get("importance_threshold")
    try:
        validate_scale(urgency_scale, "urgency")
        validate_scale(importance_scale, "importance")
        validate_threshold_in_scale(urgency_threshold, urgency_scale, "urgency")
        validate_threshold_in_scale(importance_threshold, importance_scale, "importance")
    except InvariantViolation as error:
        return _result("quadrant_integrity", False, [{"reason": str(error)}], validator, timestamp)

    tasks = record.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        return _result("quadrant_integrity", False, [{"reason": "tasks missing, empty, or not a list"}], validator, timestamp)

    required_task_keys = {"id", "label", "urgency", "importance", "quadrant"}
    mismatches: list[str] = []
    for entry in tasks:
        if not isinstance(entry, dict) or not required_task_keys <= entry.keys():
            mismatches.append(f"task entry malformed or missing a required key: {_shallow_describe(entry)}")
            continue
        try:
            validate_value_in_scale(entry["urgency"], urgency_scale, "urgency", entry.get("id", "?"))
            validate_value_in_scale(entry["importance"], importance_scale, "importance", entry.get("id", "?"))
        except InvariantViolation as error:
            mismatches.append(str(error))
            continue
        if entry["quadrant"] not in VALID_QUADRANTS:
            mismatches.append(f"task {entry['id']!r}: stored quadrant={entry['quadrant']!r} is not one of the 4 canonical quadrants {sorted(VALID_QUADRANTS)}")
            continue
        recomputed = classify_quadrant(entry["urgency"], entry["importance"], urgency_threshold, importance_threshold)
        if entry["quadrant"] != recomputed:
            mismatches.append(f"task {entry['id']!r}: stored quadrant={entry['quadrant']!r} does not match recomputed={recomputed!r}")

    ids = [e["id"] for e in tasks if isinstance(e, dict) and "id" in e]
    if len(set(ids)) != len(ids):
        mismatches.append("duplicate task id across tasks[]")

    if mismatches:
        return _result("quadrant_integrity", False, [{"reason": "quadrant/scale mismatch", "details": mismatches}], validator, timestamp)

    quadrant_counts = {q: sum(1 for e in tasks if e.get("quadrant") == q) for q in VALID_QUADRANTS}
    return _result("quadrant_integrity", True, [{"task_count": len(tasks), "quadrant_counts": quadrant_counts}], validator, timestamp)


def evaluate_no_automatic_authority_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    try:
        assert_no_automatic_authority_claim(record)
        return _result("no_automatic_authority_claim", True, [{"checked_keys": sorted(FORBIDDEN_AUTHORITY_KEYS)}], validator, timestamp)
    except InvariantViolation as error:
        return _result("no_automatic_authority_claim", False, [{"error": str(error)}], validator, timestamp)


def evaluate_eisenhower_matrix_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_genuine_compute_gate(record, validator, timestamp),
        evaluate_quadrant_integrity_gate(record, validator, timestamp),
        evaluate_no_automatic_authority_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
