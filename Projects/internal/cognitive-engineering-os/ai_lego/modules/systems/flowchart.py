"""``systems.flowchart`` -- 流程圖: a recurring process drawn as nodes and edges to see where it gets stuck.

GROUNDED ORIGINAL DESIGN (operator 54-item list; general method, natural family). Invariants (graph, re-derived
by the gate): unique node ids; exactly one START and >= 1 END; every edge resolves both ends; no self-loops
and no duplicate (from, to, condition) edges; START has no incoming and END no outgoing edge; EVERY node is
reachable from START and EVERY node can reach an END (BFS, not just local degree -- so a detached cycle or a
dangling island is refused); only a DECISION node's exits carry a ``condition``, a DECISION has >= 2 exits,
each conditioned, with distinct normalized conditions. Cycles between distinct nodes are ALLOWED by design:
"the loop that eats the evening" is exactly what the client is drawing.
"""

from __future__ import annotations

from collections import deque
from typing import Any

from ai_lego.core.domain.record_kit import all_gates_pass, base_record, entries_problem, first_duplicate, integrity_gate, is_nonempty_str, is_one_of, normalize, provenance_required_gate, require, require_header

METHOD_ID = "systems.flowchart"
RECORD_ID_PREFIX = "FLOW-"
KINDS = frozenset({"START", "END", "PROCESS", "DECISION"})
_N_REQUIRED = frozenset({"id", "kind", "label"})
_N_CHECKS = {"id": is_nonempty_str, "kind": lambda v: is_one_of(v, KINDS), "label": is_nonempty_str}
_E_REQUIRED = frozenset({"from_ref", "to_ref"})
_E_ALLOWED = _E_REQUIRED | frozenset({"condition"})
_E_CHECKS = {"from_ref": is_nonempty_str, "to_ref": is_nonempty_str, "condition": is_nonempty_str}

__all__ = ["METHOD_ID", "RECORD_ID_PREFIX", "KINDS", "generate_flowchart", "evaluate_flowchart_gates", "all_gates_pass"]


def _reachable(start: str, adjacency: dict[str, list[str]]) -> set[str]:
    seen, queue = {start}, deque([start])
    while queue:
        for nxt in adjacency[queue.popleft()]:
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen


def _core_problem(title: Any, nodes: Any, edges: Any) -> str | None:
    if not is_nonempty_str(title):
        return "title missing or empty"
    problem = entries_problem(nodes, _N_REQUIRED, _N_REQUIRED, _N_CHECKS, min_items=2)
    if problem is not None:
        return f"nodes {problem}"
    if first_duplicate(n["id"] for n in nodes) is not None:
        return "node ids must be unique"
    kinds = {n["id"]: n["kind"] for n in nodes}
    starts = [i for i, k in kinds.items() if k == "START"]
    if len(starts) != 1:
        return f"exactly one START node required, got {len(starts)}"
    ends = {i for i, k in kinds.items() if k == "END"}
    if not ends:
        return "at least one END node required"
    problem = entries_problem(edges, _E_REQUIRED, _E_ALLOWED, _E_CHECKS)
    if problem is not None:
        return f"edges {problem}"
    forward: dict[str, list[str]] = {i: [] for i in kinds}
    backward: dict[str, list[str]] = {i: [] for i in kinds}
    exits: dict[str, list[dict[str, Any]]] = {i: [] for i in kinds}
    seen_edges: set[tuple[str, str, str | None]] = set()
    for e in edges:
        src, dst = e["from_ref"], e["to_ref"]
        if src not in kinds or dst not in kinds:
            return f"edge {src!r}->{dst!r} references an undeclared node"
        if src == dst:
            return f"edge {src!r}->{dst!r} is a self-loop"
        key = (src, dst, normalize(e["condition"]) if "condition" in e else None)
        if key in seen_edges:
            return f"duplicate edge {src!r}->{dst!r}"
        seen_edges.add(key)
        if "condition" in e and kinds[src] != "DECISION":
            return f"edge {src!r}->{dst!r} carries a condition but {src!r} is not a DECISION"
        forward[src].append(dst)
        backward[dst].append(src)
        exits[src].append(e)
    for node_id, kind in kinds.items():
        if kind == "START" and backward[node_id]:
            return f"START {node_id!r} must have no incoming edge"
        if kind == "END" and exits[node_id]:
            return f"END {node_id!r} must have no outgoing edge"
        if kind == "DECISION":
            outs = exits[node_id]
            if len(outs) < 2 or any("condition" not in e for e in outs):
                return f"DECISION {node_id!r} needs >= 2 outgoing edges, each with a condition"
            if first_duplicate(normalize(e["condition"]) for e in outs) is not None:
                return f"DECISION {node_id!r} has two exits with the same condition"
    unreachable = sorted(set(kinds) - _reachable(starts[0], forward))
    if unreachable:
        return f"node(s) {unreachable} are unreachable from START"
    reaches_end: set[str] = set()
    for end in ends:
        reaches_end |= _reachable(end, backward)
    dead_ends = sorted(set(kinds) - reaches_end)
    if dead_ends:
        return f"node(s) {dead_ends} cannot reach any END"
    return None


def generate_flowchart(record_id: str, title: str, nodes: list[dict[str, Any]], edges: list[dict[str, Any]], provenance: dict[str, Any], *, version: str = "1.0.0", generated_by_method: str = METHOD_ID) -> dict[str, Any]:
    require_header("FLOW", record_id, RECORD_ID_PREFIX, version, provenance)
    problem = _core_problem(title, nodes, edges)
    require(problem is None, "FLOW_INVALID_GRAPH", problem or "")
    return base_record(record_id, version, generated_by_method, provenance, title=title, nodes=nodes, edges=edges)


def evaluate_flowchart_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        provenance_required_gate(record, validator, timestamp),
        integrity_gate("flowchart_integrity", record, RECORD_ID_PREFIX, lambda r: _core_problem(r.get("title"), r.get("nodes"), r.get("edges")), lambda r: {"node_count": len(r["nodes"]), "edge_count": len(r["edges"]), "decision_count": sum(n["kind"] == "DECISION" for n in r["nodes"])}, validator, timestamp),
    ]
