"""``association.concept_map`` -- first member of the F04 "Associative Mapping & Combination" family
(methods/contracts/association.concept_map.contract.yaml). Opens a family with 0 real methods built before
this slice (grep-confirmed: no ``ai_lego/modules/association/`` directory existed).

Atlas's citations: F04 table row (L412: "Concept Map｜用有語義的邊連概念｜節點＋typed relations｜適合
Knowledge Graph 與推理｜Causal DAG"), dedicated §11.2 (L1176-1203: full worked mermaid example plus a 5-step
"使用方式"), the F04 Mind-Map-vs-Concept-Map mermaid contrast (L420-426: Concept Map's typed
``-->|causes|``/``-->|constrains|`` edges directly opposed to Mind Map's untyped free branches in the SAME
diagram), and §13.3's Research-grade Ideation Recipe (L3271: "... -> Divergence -> Concept Map -> Multi-Expert
Lens -> ..."). Grep-confirmed 8 total "Concept Map" hits in the whole Atlas file (the F04 table row, the F04
section header, the F04 mermaid node, §11.2's own header, its own 推薦搭配 line, its own dedicated section, the
§13.3 recipe entry, and the Phase-1 core-methods priority list L4276) -- all read, none add a citation beyond
what is transcribed above.

**Structural point, taken literally (not just as a docstring claim):** L420-426's own side-by-side contrast
IS the defining property -- Concept Map is a general typed-edge GRAPH (any node may link to any other node via
a typed relationship), not a tree radiating from one center like Mind Map. Two design choices make that
literal: (1) ``relationship_type`` is a required, non-empty field on every edge (§11.2 step 2: "每條 Edge 必須
指定 relationship type", unconditional); (2) every edge's ``from_node_id``/``to_node_id`` must resolve to a
node actually declared in the SAME record's own ``nodes[]`` -- a dangling reference is refused, same
referential-integrity class ``ai_lego/modules/causal/dag.py``'s own ``DAG_EDGE_REFERENCES_UNKNOWN_NODE``
(via ``ai_lego/compute/graph/dag.py``) already establishes for its own sibling graph-shaped method, reimplemented
here WITHOUT that method's acyclic constraint (Atlas draws no such restriction on Concept Map -- it is a
general graph, not a DAG).

**§11.2's own step 3/4 (sourced-vs-inferred edge coherence) -- judgment call, documented per this task's own
honesty discipline:** step 3 ("有來源的關係要連 Evidence") and step 4 ("推論關係必須標 Inference") read
together as a two-category partition of every edge's own epistemic status (sourced fact vs. inference), not
two independent yes/no toggles. A separate ``is_inference`` boolean field was considered and REJECTED: two
direct sibling precedents with an analogous edge/dimension shape -- ``ai_lego/modules/causal/dag.py``'s own
edges and ``ai_lego/modules/framing/five_w_one_h.py``'s own dimension entries -- already reuse the SHARED
``provenance.epistemic_type`` axis (``EVIDENCE`` vs. e.g. ``AI_INFERENCE``/``HYPOTHESIS``) as this exact
sourced-vs-inferred signal, checked ONLY via the gate-level ``evidence_labeling_required`` convention (an
``EVIDENCE``-labeled edge with no ``supporting_evidence_refs`` fails), never as a hard construction-time raise.
Introducing a redundant ``is_inference`` boolean would duplicate an axis the shared provenance vocabulary
already expresses and diverge from BOTH direct precedents with no citation-grounded reason to. This method
therefore reuses ``provenance.epistemic_type`` unchanged and matches ``causal.dag``'s own gate-only (not
construction-enforced) treatment of the evidence-labeling check.

**GENUINE_COMPUTE, un-cited-but-benefit-grounded (see ``ai_lego/compute/concept_map/orphan_detection.py``'s own
module docstring):** ``orphan_node_ids`` -- node ids no edge ever references -- is re-derived by both the
builder and an independent gate, never caller-supplied, same two-layer discipline
``framing.five_w_one_h``'s own ``information_gaps`` and ``framing.boundary_critique``'s own
``empty_categories`` already establish for a field that operationalizes a benefit column without being its
literal wording.

Two real invariants, each enforced BOTH at construction (raise BEFORE any record is built) AND independently
by a gate that re-derives from raw fields, same "shared predicate, reused by both layers" discipline every
sibling module in this suite already establishes:

1. **Shape + referential integrity** (``CONCEPTMAP_INVALID_NODES``/``CONCEPTMAP_EDGE_MISSING_RELATIONSHIP_TYPE``/
   ``CONCEPTMAP_EDGE_DANGLING_REF``): nodes is a list of >=2 well-shaped, uniquely-id'd ``{id, label}`` entries;
   edges is a non-empty list of well-shaped entries, each with a non-empty ``relationship_type`` and
   ``from_node_id``/``to_node_id`` that both resolve to a real node id declared in the SAME record.
2. **``orphan_node_ids`` integrity** (``CONCEPTMAP_ORPHAN_NODE_IDS_MISMATCH``): must equal the actual set of
   node ids referenced by zero edges, in ``nodes`` order -- re-derived by
   ``ai_lego.compute.concept_map.orphan_detection.derive_orphan_node_ids``, never trusted from a stored or
   caller-supplied value.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.concept_map.orphan_detection import derive_orphan_node_ids
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "association.concept_map"
RECORD_ID_PREFIX = "CONCEPTMAP-"

_NODE_KEYS = frozenset({"id", "label"})
_EDGE_REQUIRED_KEYS = frozenset({"from_node_id", "to_node_id", "relationship_type", "provenance"})
_EDGE_ALLOWED_KEYS = _EDGE_REQUIRED_KEYS | frozenset({"supporting_evidence_refs"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shaped(entry: Any, required_keys: frozenset[str], allowed_keys: frozenset[str]) -> bool:
    if not isinstance(entry, dict):
        return False
    keys = set(entry.keys())
    return required_keys <= keys and keys <= allowed_keys


def _nodes_are_valid(nodes: Any) -> tuple[bool, str | None]:
    """Returns ``(is_valid, failure_reason)``. Shared by the builder and the gate so neither can drift from the
    other -- same discipline every sibling module in this suite already establishes.

    Real invariant: a list of at least 2 well-shaped ``{id, label}`` entries (2 is the structural floor for any
    edge to connect two DISTINCT concepts, same reasoning ``causal-dag-analysis.schema.yaml``'s own
    ``nodes: minItems: 2`` already applies to its own sibling graph shape), non-empty ``id``/``label`` strings,
    unique ``id`` values.
    """
    if not isinstance(nodes, list) or len(nodes) < 2:
        return False, "TOO_FEW"
    seen_ids: set[str] = set()
    for node in nodes:
        if not _shaped(node, _NODE_KEYS, _NODE_KEYS):
            return False, "SHAPE"
        if not _is_nonempty_str(node.get("id")) or not _is_nonempty_str(node.get("label")):
            return False, "SHAPE"
        if node["id"] in seen_ids:
            return False, "DUPLICATE_ID"
        seen_ids.add(node["id"])
    return True, None


def _edges_are_valid(edges: Any, node_ids: frozenset[str]) -> tuple[bool, str | None]:
    """Same shared-predicate discipline as ``_nodes_are_valid``.

    Real invariant: a non-empty list of well-shaped entries, each with a non-empty ``relationship_type``
    (Atlas §11.2 step 2, unconditional) and ``from_node_id``/``to_node_id`` that BOTH resolve to a real id in
    ``node_ids`` -- a dangling reference is refused, never silently accepted.
    """
    if not isinstance(edges, list) or not edges:
        return False, "EMPTY"
    for edge in edges:
        if not _shaped(edge, _EDGE_REQUIRED_KEYS, _EDGE_ALLOWED_KEYS):
            return False, "SHAPE"
        if not _is_nonempty_str(edge.get("from_node_id")) or not _is_nonempty_str(edge.get("to_node_id")):
            return False, "SHAPE"
        if not _is_nonempty_str(edge.get("relationship_type")):
            return False, "MISSING_RELATIONSHIP_TYPE"
        if edge["from_node_id"] not in node_ids or edge["to_node_id"] not in node_ids:
            return False, "DANGLING_REF"
        refs = edge.get("supporting_evidence_refs")
        if refs is not None and (not isinstance(refs, list) or not refs or not all(isinstance(r, str) for r in refs)):
            return False, "SHAPE"
    return True, None


def concept_node(node_id: str, label: str) -> dict[str, Any]:
    """One item of ``typed-objects/concept-map-record.schema.yaml#/properties/nodes``. A thin convenience
    constructor -- does NOT itself enforce shape/uniqueness (``generate_concept_map_record`` validates whatever
    list it is handed regardless of how it was built, same "helper is not the invariant boundary" discipline
    ``framing.five_w_one_h``'s own ``dimension_entry`` docstring already establishes)."""
    return {"id": node_id, "label": label}


def concept_edge(
    from_node_id: str,
    to_node_id: str,
    relationship_type: str,
    provenance: dict[str, Any],
    *,
    supporting_evidence_refs: list[str] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/concept-map-record.schema.yaml#/properties/edges``. Same "helper is not the
    invariant boundary" discipline as ``concept_node`` above -- mutation tests build edges directly, bypassing
    this helper, to prove the builder itself enforces the invariants."""
    edge: dict[str, Any] = {"from_node_id": from_node_id, "to_node_id": to_node_id, "relationship_type": relationship_type, "provenance": provenance}
    if supporting_evidence_refs:
        edge["supporting_evidence_refs"] = list(supporting_evidence_refs)
    return edge


def generate_concept_map_record(
    record_id: str,
    context: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/concept-map-record.schema.yaml``.

    Enforces the method contract's own preconditions fail-closed, same family-wide "raise-before-construction"
    discipline every sibling module in this suite already establishes. ``orphan_node_ids`` is NOT an accepted
    parameter: it is ALWAYS computed here via ``derive_orphan_node_ids``, so there is no code path through
    which a caller could construct a record whose stored orphans disagree with its own nodes/edges.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CONCEPTMAP_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CONCEPTMAP_INVALID_VERSION: version must be a string, got {version!r}")
    if not _is_nonempty_str(context):
        raise InvariantViolation(f"CONCEPTMAP_EMPTY_CONTEXT: context must be a non-empty string, got {context!r}")

    nodes_ok, nodes_reason = _nodes_are_valid(nodes)
    if not nodes_ok:
        if nodes_reason == "DUPLICATE_ID":
            raise InvariantViolation(f"CONCEPTMAP_DUPLICATE_NODE_ID: node ids must be unique within one record, got {nodes!r}")
        raise InvariantViolation(f"CONCEPTMAP_INVALID_NODES: nodes must be a list of >=2 well-shaped {{id, label}} entries with unique ids, got {nodes!r}")

    node_ids = frozenset(n["id"] for n in nodes)
    edges_ok, edges_reason = _edges_are_valid(edges, node_ids)
    if not edges_ok:
        if edges_reason == "EMPTY":
            raise InvariantViolation("CONCEPTMAP_EMPTY_EDGES: a concept map is defined by its typed edges (Atlas L420-426's own contrast against Mind Map) -- at least 1 edge is required")
        if edges_reason == "MISSING_RELATIONSHIP_TYPE":
            raise InvariantViolation(f"CONCEPTMAP_EDGE_MISSING_RELATIONSHIP_TYPE: every edge must carry a non-empty relationship_type (Atlas §11.2 step 2), got {edges!r}")
        if edges_reason == "DANGLING_REF":
            raise InvariantViolation(f"CONCEPTMAP_EDGE_DANGLING_REF: every edge's from_node_id/to_node_id must resolve to a node declared in this record's own nodes, got {edges!r}")
        raise InvariantViolation(f"CONCEPTMAP_INVALID_EDGES: edges must be a non-empty list of well-shaped entries, got {edges!r}")

    orphan_node_ids = derive_orphan_node_ids(nodes, edges)

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "context": context,
        "nodes": [dict(n) for n in nodes],
        "edges": [dict(e) for e in edges],
        "orphan_node_ids": orphan_node_ids,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- every edge AND the overall record carry a schema-valid
    provenance_record (nodes carry no provenance field -- Atlas's own step 1 "建立 Concept Nodes" says nothing
    about node-level epistemic labeling, same omission ``causal-dag-analysis.schema.yaml``'s own nodes already
    establish for its closest sibling graph shape)."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    edges = record.get("edges")
    edges = edges if isinstance(edges, list) else []
    invalid = [f"{e.get('from_node_id')}->{e.get('to_node_id')}" for e in edges if isinstance(e, dict) and not provenance_is_valid(e.get("provenance"))]
    record_provenance_ok = provenance_is_valid(record.get("provenance"))
    passed = bool(edges) and not invalid and record_provenance_ok
    return _result(
        "provenance_required",
        passed,
        [{"edges_checked": len(edges), "invalid_provenance_edges": invalid, "record_provenance_valid": record_provenance_ok}],
        validator,
        timestamp,
    )


def evaluate_evidence_labeling_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.evidence_labeling_required: true`` -- Atlas §11.2 step 3 ("有來源的關係要連
    Evidence"): an edge whose ``provenance.epistemic_type`` is ``EVIDENCE`` (the sourced-claim half of the
    step-3/step-4 partition, see module docstring) must actually cite ``supporting_evidence_refs``. Same real
    structural check ``ai_lego/modules/causal/dag.py``'s own identically-named gate already uses for its own
    sibling edge shape -- gate-only, NOT construction-enforced, matching that precedent (see module docstring
    for why)."""
    edges = record.get("edges") if isinstance(record, dict) else None
    edges = edges if isinstance(edges, list) else []
    problems: list[dict[str, Any]] = []
    for e in edges:
        if not isinstance(e, dict):
            continue
        epistemic_type = (e.get("provenance") or {}).get("epistemic_type")
        edge_key = f"{e.get('from_node_id')}->{e.get('to_node_id')}"
        if epistemic_type is None:
            problems.append({"edge": edge_key, "reason": "no epistemic_type label"})
            continue
        if epistemic_type == "EVIDENCE" and not e.get("supporting_evidence_refs"):
            problems.append({"edge": edge_key, "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"})
    passed = bool(edges) and not problems
    return _result("evidence_labeling_required", passed, [{"edges_checked": len(edges), "problems": problems}], validator, timestamp)


def evaluate_concept_map_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives BOTH real invariants from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_concept_map_record``, so a hand-tampered record that bypassed the builder entirely
    is caught here exactly as a builder-refused one would have been. In particular, this is the ONLY place
    ``orphan_node_ids`` is checked against reality: re-derives it via ``derive_orphan_node_ids`` and compares to
    the stored value -- a record whose ``edges`` were edited without recomputing ``orphan_node_ids`` (or vice
    versa) fails here even though each field is, in isolation, individually well-shaped. FAILS CLOSED on
    malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("concept_map_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("concept_map_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("concept_map_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("context")):
        return _result("concept_map_integrity", False, [{"reason": "context missing or empty"}], validator, timestamp)

    nodes_ok, nodes_reason = _nodes_are_valid(record.get("nodes"))
    if not nodes_ok:
        return _result("concept_map_integrity", False, [{"reason": f"nodes invalid ({nodes_reason})"}], validator, timestamp)
    nodes = record["nodes"]
    node_ids = frozenset(n["id"] for n in nodes)

    edges_ok, edges_reason = _edges_are_valid(record.get("edges"), node_ids)
    if not edges_ok:
        return _result("concept_map_integrity", False, [{"reason": f"edges invalid ({edges_reason})"}], validator, timestamp)
    edges = record["edges"]

    recomputed_orphans = derive_orphan_node_ids(nodes, edges)
    stored_orphans = record.get("orphan_node_ids")
    if not isinstance(stored_orphans, list) or stored_orphans != recomputed_orphans:
        return _result(
            "concept_map_integrity",
            False,
            [{"reason": "CONCEPTMAP_ORPHAN_NODE_IDS_MISMATCH", "stored": stored_orphans, "recomputed": recomputed_orphans}],
            validator,
            timestamp,
        )

    return _result(
        "concept_map_integrity",
        True,
        [{"node_count": len(nodes), "edge_count": len(edges), "orphan_count": len(recomputed_orphans)}],
        validator,
        timestamp,
    )


def evaluate_concept_map_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """All three of the contract's real gates, in catalog order: the two declared ``quality`` properties, then
    the independent structural-integrity re-derivation (which also re-derives orphan_node_ids)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_evidence_labeling_required_gate(record, validator, timestamp),
        evaluate_concept_map_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
