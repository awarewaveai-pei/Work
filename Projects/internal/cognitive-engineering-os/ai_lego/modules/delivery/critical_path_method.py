"""``delivery.critical_path_method`` -- F22 PM/Delivery/Governance family (Atlas L919 table row, dedicated
section 12.41 L3103-3109).

Atlas's own table row (L919, verbatim): "Critical Path Method | 找決定最短工期的任務鏈 |
tasks→duration→dependency→forward/backward pass | 找真正不可延誤工作" (find the task chain that determines
the shortest possible project duration, via tasks->duration->dependency->forward/backward pass, benefit:
know which task truly cannot slip). Dedicated section 12.41 (L3103-3109) restates the same pipeline and
explicitly scopes OUT resource leveling/capacity modeling ("限制：資源限制另需 resource leveling / capacity
model") -- this method computes the UNCONSTRAINED-resource critical path only.

Real invariant, the strongest and most computationally real in this method's sibling batch: a declared
``critical_path`` must actually BE the longest chain through the task dependency DAG -- verified via a
genuine forward pass (earliest_start/earliest_finish per task, respecting duration and depends_on edges)
and backward pass (latest_start/latest_finish worked back from the project's own computed makespan), with
EVERY task on the declared critical path having zero slack (latest_start == earliest_start) AND the
declared path being a genuine connected dependency chain whose total duration equals the makespan. A
"critical path" that is not actually the longest chain, or where a claimed critical-path task has nonzero
slack, is a false-confidence CPM -- worse than not doing CPM at all (Atlas's own benefit column: "找真正
不可延誤工作", know which task TRULY cannot slip).

The forward/backward pass and cycle detection are Trusted Compute
(``ai_lego.compute.critical_path.forward_backward_pass``), never re-implemented or asserted here or by a
caller -- same discipline ``causal.dag`` already establishes for ``ai_lego.compute.graph.dag``. The
builder accepts ONLY raw ``task_id``/``duration``/``depends_on`` input; every computed field
(earliest_start, ..., slack, critical_path, project_duration) is this method's sole output -- a caller
can never assert which tasks are "critical".

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "critical.path"/"critical_path"/
"cpm" before writing any of this method's own files: pre-existing hits are all either Atlas/registry
cross-references (not implementations) or unrelated "critical path" USAGE in
``decomposition.wbs``/``devops_sre.capacity_model`` prose -- zero pre-existing `delivery.*`
implementation or schema-title overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.compute.critical_path.forward_backward_pass import compute_critical_path
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "delivery.critical_path_method"
RECORD_ID_PREFIX = "CPM-"
COMPUTATION_PROVENANCE_REF = "ai_lego.compute.critical_path.forward_backward_pass.compute_critical_path"
_RAW_TASK_KEYS = frozenset({"task_id", "duration", "depends_on"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonneg_int(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    return isinstance(value, int) and value >= 0


def _raw_task_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped RAW tasks[] entry" -- task_id/duration/depends_on
    ONLY. The computed fields (earliest_start, ..., slack) are NEVER accepted as input -- they exist
    solely as ``compute_critical_path``'s own output. Consulted by both the builder (on its 3-key raw
    input) and the ``cpm_integrity`` gate (on a raw-field PROJECTION of a possibly-tampered stored
    record, see ``evaluate_cpm_integrity_gate``)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _RAW_TASK_KEYS
    if unknown:
        return (
            f"unknown key(s) {sorted(unknown, key=repr)} -- computed fields (earliest_start etc.) are "
            "never accepted as input, only produced by compute_critical_path"
        )
    if not {"task_id", "duration"} <= value.keys():
        return f"missing key(s) {sorted({'task_id', 'duration'} - value.keys())}"
    if not _is_nonempty_str(value.get("task_id")):
        return f"task_id must be a non-empty string, got {value.get('task_id')!r}"
    if not _is_nonneg_int(value.get("duration")):
        return f"duration must be a non-negative int (bool excluded), got {value.get('duration')!r}"
    depends_on = value.get("depends_on", [])
    if not isinstance(depends_on, list) or not all(_is_nonempty_str(d) for d in depends_on):
        return f"depends_on must be a list of non-empty strings, got {depends_on!r}"
    return None


def raw_task(task_id: str, duration: int, depends_on: list[str] | None = None) -> dict[str, Any]:
    """One RAW input task -- builder input only, distinct from the computed ``tasks[]`` entry the record
    ultimately carries (see module description: computed fields are output-only)."""
    record = {"task_id": task_id, "duration": duration, "depends_on": list(depends_on or [])}
    problem = _raw_task_problem(record)
    if problem is not None:
        raise InvariantViolation(f"CPM_INVALID_TASK: {problem}")
    return record


def generate_critical_path_analysis(
    record_id: str,
    tasks: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/critical-path-analysis-record.schema.yaml``.

    Rebuilds every raw ``tasks[]`` entry via ``raw_task()`` (never trusting the caller's raw dicts, and
    refusing any caller-supplied computed field as a smuggled unknown key), checks for duplicate
    task_ids, then runs the real forward/backward pass (``compute_critical_path``, which itself checks
    referential integrity and acyclicity and raises ``CPM_DANGLING_DEPENDENCY``/``CPM_CYCLE_DETECTED`` --
    propagated here, not re-implemented) to derive earliest/latest start/finish, slack, the makespan
    (``project_duration``), and one genuine longest (zero-slack, contiguous) chain (``critical_path``) --
    BEFORE returning. The caller never supplies ``critical_path`` or any per-task computed field; they
    exist ONLY as this function's own output.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CPM_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CPM_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("CPM_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not isinstance(tasks, list) or not tasks:
        raise InvariantViolation(f"CPM_TOO_FEW_TASKS: at least 1 task is required, got {tasks!r}")

    rebuilt_tasks: list[dict[str, Any]] = []
    for i, t in enumerate(tasks):
        if not isinstance(t, dict):
            raise InvariantViolation(f"CPM_INVALID_TASKS: tasks[{i}] must be a dict, got {t!r}")
        try:
            rebuilt_tasks.append(raw_task(t.get("task_id"), t.get("duration"), t.get("depends_on")))
        except InvariantViolation as error:
            raise InvariantViolation(f"CPM_INVALID_TASKS: tasks[{i}]: {error}") from error

    task_ids = [t["task_id"] for t in rebuilt_tasks]
    if len(task_ids) != len(set(task_ids)):
        duplicate = sorted({t for t in task_ids if task_ids.count(t) > 1})
        raise InvariantViolation(f"CPM_DUPLICATE_TASK_ID: task_id(s) {duplicate} declared more than once")

    computation = compute_critical_path(rebuilt_tasks)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "tasks": computation["tasks"],
        "critical_path": computation["critical_path"],
        "project_duration": computation["project_duration"],
        "computation_provenance_ref": COMPUTATION_PROVENANCE_REF,
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


def evaluate_cpm_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """THE real invariant, re-derived independently. Projects each stored ``tasks[]`` entry down to its
    RAW task_id/duration/depends_on fields ONLY (never trusting the stored earliest_start/.../slack or
    the declared critical_path/project_duration), recomputes the entire forward/backward pass via the
    SAME Trusted Compute function the builder uses, then compares: every stored computed field must match
    the recomputation exactly, AND the declared critical_path must be a genuine chain of zero-(recomputed)
    -slack tasks whose total duration equals the recomputed project_duration. Catches BOTH a
    hand-tampered computed field and a hand-tampered critical_path containing a genuinely non-critical
    (nonzero-slack) task or a broken (non-adjacent) chain."""
    if not isinstance(record, dict):
        return _result("cpm_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    tasks = record.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        return _result("cpm_integrity", False, [{"reason": "tasks must be a non-empty list"}], validator, timestamp)

    raw_tasks: list[dict[str, Any]] = []
    malformed: list[str] = []
    for i, t in enumerate(tasks):
        if not isinstance(t, dict):
            malformed.append(f"tasks[{i}] is not a dict")
            continue
        projected = {k: t.get(k) for k in ("task_id", "duration", "depends_on") if k in t}
        problem = _raw_task_problem(projected)
        if problem:
            malformed.append(f"tasks[{i}]: {problem}")
            continue
        raw_tasks.append(projected)
    if malformed:
        return _result("cpm_integrity", False, [{"malformed": malformed}], validator, timestamp)

    task_ids = [t["task_id"] for t in raw_tasks]
    if len(task_ids) != len(set(task_ids)):
        return _result("cpm_integrity", False, [{"reason": "duplicate task_id in tasks[]"}], validator, timestamp)

    try:
        recomputed = compute_critical_path(raw_tasks)
    except InvariantViolation as error:
        return _result("cpm_integrity", False, [{"reason": f"recomputation refused: {error}"}], validator, timestamp)

    recomputed_by_id = {t["task_id"]: t for t in recomputed["tasks"]}
    problems: list[str] = []

    for t in tasks:
        tid = t.get("task_id")
        recomputed_task = recomputed_by_id[tid]
        for field in ("earliest_start", "earliest_finish", "latest_start", "latest_finish", "slack"):
            if t.get(field) != recomputed_task[field]:
                problems.append(f"{tid}.{field}: stored {t.get(field)!r} != recomputed {recomputed_task[field]!r}")

    if record.get("project_duration") != recomputed["project_duration"]:
        problems.append(f"project_duration: stored {record.get('project_duration')!r} != recomputed {recomputed['project_duration']!r}")

    declared_path = record.get("critical_path")
    if not isinstance(declared_path, list) or not declared_path:
        problems.append("critical_path must be a non-empty list")
    else:
        for tid in declared_path:
            recomputed_task = recomputed_by_id.get(tid)
            if recomputed_task is None:
                problems.append(f"critical_path references undeclared task_id {tid!r}")
            elif recomputed_task["slack"] != 0:
                problems.append(f"critical_path task {tid!r} has nonzero recomputed slack {recomputed_task['slack']} -- not actually critical")
        for i in range(1, len(declared_path)):
            prev, cur = declared_path[i - 1], declared_path[i]
            cur_task = recomputed_by_id.get(cur)
            if cur_task is not None and prev not in cur_task["depends_on"]:
                problems.append(f"critical_path edge {prev!r}->{cur!r} is not a declared dependency -- not a genuine chain")
        if all(tid in recomputed_by_id and recomputed_by_id[tid]["slack"] == 0 for tid in declared_path):
            path_duration = sum(recomputed_by_id[tid]["duration"] for tid in declared_path)
            if path_duration != recomputed["project_duration"]:
                problems.append(f"critical_path total duration {path_duration} != recomputed project_duration {recomputed['project_duration']} -- not actually the longest chain")

    passed = not problems
    return _result("cpm_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_critical_path_method_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_cpm_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
