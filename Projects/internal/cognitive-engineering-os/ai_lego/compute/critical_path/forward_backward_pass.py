"""Critical Path Method (CPM) forward/backward-pass computation -- deterministic compute, backing
``delivery.critical_path_method``.

Whether a task is genuinely ON the critical path (zero slack) is DECIDED here, by a real forward-pass/
backward-pass algorithm over the task dependency DAG, never asserted by a caller or an LLM -- same
Trusted Compute discipline ``compute/graph/dag.py`` and ``compute/pareto/ranking.py`` already establish.

Grepped ``ai_lego/modules`` and ``ai_lego/compute`` for an existing topological-sort/cycle-detection
utility before writing this: ``compute/graph/dag.py`` (backing ``causal.dag``) answers only "is this
graph acyclic" via three-color DFS -- it does not produce a processing ORDER, which a forward/backward
pass genuinely needs. Kahn's algorithm is implemented here instead: it produces cycle detection AND a
valid topological order from the SAME single pass, avoiding a second full graph traversal that reusing
``compute/graph/dag.py`` and then separately topologically sorting would otherwise require. Ties (equal
in-degree-zero candidates) are broken by lexicographically smallest task_id throughout, for a
deterministic, reproducible result.
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation


def _build_graph(tasks: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, list[str]], dict[str, list[str]]]:
    """Returns (task_by_id, predecessors, successors). Raises CPM_DANGLING_DEPENDENCY if a depends_on
    entry references an undeclared task_id."""
    task_by_id = {t["task_id"]: t for t in tasks}
    all_ids = set(task_by_id)
    predecessors: dict[str, list[str]] = {tid: list(t["depends_on"]) for tid, t in task_by_id.items()}
    dangling = sorted({dep for preds in predecessors.values() for dep in preds} - all_ids)
    if dangling:
        raise InvariantViolation(f"CPM_DANGLING_DEPENDENCY: depends_on references undeclared task_id(s) {dangling}")
    successors: dict[str, list[str]] = {tid: [] for tid in all_ids}
    for tid, preds in predecessors.items():
        for dep in preds:
            successors[dep].append(tid)
    return task_by_id, predecessors, successors


def topological_order(tasks: list[dict[str, Any]]) -> list[str]:
    """Kahn's algorithm. Raises CPM_CYCLE_DETECTED if the dependency graph is not a DAG (fewer task_ids
    processed than declared -- the classical Kahn's-algorithm cycle signature: a cycle's members never
    reach in-degree zero)."""
    task_by_id, predecessors, successors = _build_graph(tasks)
    in_degree = {tid: len(preds) for tid, preds in predecessors.items()}
    queue = sorted(tid for tid, degree in in_degree.items() if degree == 0)
    order: list[str] = []
    while queue:
        current = queue.pop(0)
        order.append(current)
        newly_ready = []
        for succ in successors[current]:
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                newly_ready.append(succ)
        queue = sorted(queue + newly_ready)
    if len(order) != len(task_by_id):
        remaining = sorted(set(task_by_id) - set(order))
        raise InvariantViolation(
            f"CPM_CYCLE_DETECTED: the dependency graph is not a DAG -- task(s) {remaining} are part of a "
            "cycle (Kahn's algorithm could not bring them to in-degree zero)"
        )
    return order


def _reconstruct_critical_path(computed_tasks: dict[str, dict[str, Any]], project_duration: int, predecessors: dict[str, list[str]]) -> list[str]:
    """Walks backward from the lexicographically-smallest zero-slack task achieving the project makespan,
    at each step choosing the lexicographically-smallest predecessor whose earliest_finish exactly meets
    the current task's earliest_start AND is itself zero-slack -- the classical CPM 'tight edge' walk.
    Deterministic tie-break, see module docstring."""
    sinks = sorted(tid for tid, t in computed_tasks.items() if t["earliest_finish"] == project_duration and t["slack"] == 0)
    if not sinks:
        raise InvariantViolation("CPM_NO_CRITICAL_SINK: no task achieves the project makespan with zero slack -- internal computation defect")
    current = sinks[0]
    path = [current]
    while predecessors[current]:
        candidates = sorted(
            dep
            for dep in predecessors[current]
            if computed_tasks[dep]["earliest_finish"] == computed_tasks[current]["earliest_start"] and computed_tasks[dep]["slack"] == 0
        )
        if not candidates:
            raise InvariantViolation(
                f"CPM_BROKEN_CRITICAL_CHAIN: no zero-slack predecessor of {current!r} whose earliest_finish "
                "meets its earliest_start -- internal computation defect"
            )
        current = candidates[0]
        path.append(current)
    path.reverse()
    return path


def compute_critical_path(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    """Runs the real forward pass (earliest_start/earliest_finish) then backward pass (latest_start/
    latest_finish) over the task dependency DAG, in topological / reverse-topological order, then derives
    per-task slack and reconstructs one genuine longest (zero-slack) chain from a source task to the sink
    task that achieves the project makespan.

    ``tasks`` items: ``{"task_id": str, "duration": int (>=0), "depends_on": list[str]}`` ONLY -- no
    computed field is ever read from the input, they are this function's sole output. Returns
    ``{"tasks": [...], "critical_path": [...], "project_duration": int}``.
    """
    task_by_id, predecessors, successors = _build_graph(tasks)
    order = topological_order(tasks)

    earliest_start: dict[str, int] = {}
    earliest_finish: dict[str, int] = {}
    for tid in order:
        preds = predecessors[tid]
        earliest_start[tid] = max((earliest_finish[p] for p in preds), default=0)
        earliest_finish[tid] = earliest_start[tid] + task_by_id[tid]["duration"]

    project_duration = max(earliest_finish.values(), default=0)

    latest_finish: dict[str, int] = {}
    latest_start: dict[str, int] = {}
    for tid in reversed(order):
        succs = successors[tid]
        latest_finish[tid] = min((latest_start[s] for s in succs), default=project_duration)
        latest_start[tid] = latest_finish[tid] - task_by_id[tid]["duration"]

    computed_tasks = {
        tid: {
            "task_id": tid,
            "duration": task_by_id[tid]["duration"],
            "depends_on": list(predecessors[tid]),
            "earliest_start": earliest_start[tid],
            "earliest_finish": earliest_finish[tid],
            "latest_start": latest_start[tid],
            "latest_finish": latest_finish[tid],
            "slack": latest_start[tid] - earliest_start[tid],
        }
        for tid in order
    }

    critical_path = _reconstruct_critical_path(computed_tasks, project_duration, predecessors)

    return {
        "tasks": [computed_tasks[tid] for tid in order],
        "critical_path": critical_path,
        "project_duration": project_duration,
    }
