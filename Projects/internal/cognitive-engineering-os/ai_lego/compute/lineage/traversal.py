"""Data lineage graph traversal -- deterministic compute, backing ``database_data.data_lineage``.

Atlas §11.48's own benefit bullet (L2327, "一個數字可以回到原始來源" -- a
number can trace back to its original source) is the whole point of a
lineage record: not "does this node claim an upstream", but "does
FOLLOWING that upstream chain actually terminate at a real SOURCE node".
Same Trusted Compute discipline every prior graph-shaped module in this
package already established (``compute/graph/dag.py``'s own three-color
DFS for ``causal.dag``, which explicitly guarantees node/edge order
never affects the verdict) -- the traversal is computed here, by code,
not asserted by a caller.

Implemented as ITERATIVE FORWARD REACHABILITY from the SOURCE set
(flood-fill), not a backward per-node DFS -- a critic review of this
slice's first draft found the original backward-DFS implementation was
genuinely unsound: its memoization could permanently record a `False`
that was only ever provisional (derived while a cycle was being cut),
producing an ANSWER THAT DEPENDED ON THE INPUT LIST'S OWN ORDER for the
exact same graph, and its recursion depth scaled with chain length,
raising `RecursionError` on reverse-ordered chains of a few hundred
nodes -- both contradicting the "deterministic compute" claim this
module's own schema consumer (`engine: const
local_python_deterministic_compute`) makes. Forward reachability from a
fixed root set has neither problem: it is order-independent by
construction (a purely set-theoretic reachability property of the
graph) and needs no recursion (a plain work-list loop).

ASSUMES every node's own ``id`` is unique within ``nodes`` -- this
function does NOT itself detect duplicate ids (a collision silently
collapses to one entry). Duplicate-id detection is a SEPARATE, shared
concern (``_duplicate_node_ids`` in
``ai_lego/modules/database_data/data_lineage.py``), checked by BOTH the
builder and the gate BEFORE this function is ever called -- the same
"compute layer assumes well-formed input, method layer validates it"
separation every prior compute module in this package already follows.
"""

from __future__ import annotations


def traces_to_source(nodes: list[dict]) -> dict[str, bool]:
    """For every node (by its own ``id``), determine whether it is forward-reachable from some node whose
    ``stage`` is ``SOURCE``, following ``upstream_refs`` edges in the SOURCE-to-descendant direction. Returns
    ``{node_id: bool}`` for every node in ``nodes``.

    A node is NOT considered traced if: no SOURCE node exists at all; it has no path from any SOURCE (an
    orphan, or reachable only via a dangling upstream_ref that names no real node); or every path to it would
    have to pass through a cycle that itself never connects back to a real SOURCE. A node reachable from
    MULTIPLE sources, or via multiple paths, is traced as soon as ANY ONE path resolves -- a real merge/join
    (e.g. a Dataset combining two Sources) is legitimately traced, not penalized for having more than one
    upstream.
    """
    node_ids = [node["id"] for node in nodes]
    downstream: dict[str, list[str]] = {node_id: [] for node_id in node_ids}
    for node in nodes:
        for ref in node.get("upstream_refs") or []:
            if ref in downstream:
                downstream[ref].append(node["id"])

    traced: dict[str, bool] = {node_id: False for node_id in node_ids}
    frontier = [node["id"] for node in nodes if node.get("stage") == "SOURCE"]
    for source_id in frontier:
        traced[source_id] = True

    while frontier:
        current = frontier.pop()
        for child_id in downstream.get(current, []):
            if not traced[child_id]:
                traced[child_id] = True
                frontier.append(child_id)

    return traced
