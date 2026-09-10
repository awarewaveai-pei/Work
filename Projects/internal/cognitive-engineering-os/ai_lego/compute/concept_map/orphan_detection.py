"""Concept Map orphan-node detection -- deterministic compute, backing ``association.concept_map``.

Atlas F04 table row (L412, "Concept Map"｜"適合 Knowledge Graph 與推理") plus §11.2's own benefit list
(L1200-1202: "可直接映射 Knowledge Graph...有利搜尋、重用、矛盾偵測與 provenance") -- a node no edge ever
references contributes zero relations to that graph and is not actually "mapped" to anything, directly
weakening the cited benefit. Not a literal Atlas field name (same disclosed-as-un-cited-but-benefit-grounded
class ``framing.boundary_critique``'s own ``empty_categories`` GENUINE_COMPUTE field already establishes for
a benefit column that doesn't spell out the exact field either). Same Trusted Compute discipline
``compute/five_w1h/gap_detection.py`` already establishes for a categorical (non-arithmetic) set derivation:
which nodes are orphans is DECIDED here, by a real re-derivation from ``edges``, never trusted from a
caller-supplied list (Atlas §29 rule 6: "數學與統計必須由 Trusted Compute 執行" -- the same discipline
applied to a set derivation rather than arithmetic).

Called twice for every record's own lifecycle: once at construction
(``ai_lego.modules.association.concept_map.generate_concept_map_record`` computes the stored
``orphan_node_ids`` field) and once, independently, inside the integrity gate (to re-derive and compare
against whatever is actually stored) -- the gate never trusts that the constructor ran, or ran correctly,
on a hand-tampered record.
"""

from __future__ import annotations

from typing import Any


def derive_orphan_node_ids(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[str]:
    """Given already-shape-validated ``nodes[]``/``edges[]`` (see
    ``ai_lego.modules.association.concept_map``'s own ``_nodes_are_valid``/``_edges_are_valid``), returns the
    node ids that appear in NEITHER any edge's ``from_node_id`` NOR ``to_node_id``, in the SAME order they
    appear in ``nodes``. Pure and stateless -- does not itself validate shape (callers run shape validation
    first, same split ``impact_effort/classification.py``'s own ``classify_ideas`` already establishes between
    validation and derivation). Never mutates its inputs.
    """
    referenced = {edge["from_node_id"] for edge in edges} | {edge["to_node_id"] for edge in edges}
    return [node["id"] for node in nodes if node["id"] not in referenced]
