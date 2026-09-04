"""Directed-graph cycle detection -- deterministic compute, backing ``causal.dag``.

Same Trusted Compute discipline ``compute/statistics/reliability.py`` and
``compute/pareto/ranking.py`` already established: whether a graph is
genuinely acyclic is DECIDED here, by a real algorithm (three-color DFS),
never asserted by a caller or an LLM. ``causal-dag-analysis.schema.yaml``'s
``acyclic_verified`` field is ``const: true`` precisely because this
function is the only thing allowed to produce that value.
"""

from __future__ import annotations

from typing import Any

from ai_lego.errors import InvariantViolation

WHITE, GRAY, BLACK = 0, 1, 2


def _adjacency(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> dict[str, list[str]]:
    node_ids = {node["id"] for node in nodes}
    unknown_from = sorted({edge["from_node_id"] for edge in edges} - node_ids)
    unknown_to = sorted({edge["to_node_id"] for edge in edges} - node_ids)
    if unknown_from or unknown_to:
        raise InvariantViolation(f"DAG_EDGE_REFERENCES_UNKNOWN_NODE: from={unknown_from} to={unknown_to}")
    adjacency: dict[str, list[str]] = {node_id: [] for node_id in node_ids}
    for edge in edges:
        adjacency[edge["from_node_id"]].append(edge["to_node_id"])
    return adjacency


def find_cycle(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[str] | None:
    """Three-color DFS. Returns the node-id path of a cycle if one exists (starting and ending on the same node id,
    e.g. ``["N1", "N2", "N1"]``), else ``None``. Deterministic: node/edge order never affects the true/false verdict,
    only which cycle (if several exist) is reported."""
    adjacency = _adjacency(nodes, edges)
    color: dict[str, int] = {node_id: WHITE for node_id in adjacency}
    path: list[str] = []

    def visit(node_id: str) -> list[str] | None:
        color[node_id] = GRAY
        path.append(node_id)
        for neighbor in adjacency[node_id]:
            if color[neighbor] == GRAY:
                return path[path.index(neighbor) :] + [neighbor]
            if color[neighbor] == WHITE:
                found = visit(neighbor)
                if found is not None:
                    return found
        color[node_id] = BLACK
        path.pop()
        return None

    for node_id in adjacency:
        if color[node_id] == WHITE:
            cycle = visit(node_id)
            if cycle is not None:
                return cycle
    return None


def is_acyclic(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> bool:
    return find_cycle(nodes, edges) is None
