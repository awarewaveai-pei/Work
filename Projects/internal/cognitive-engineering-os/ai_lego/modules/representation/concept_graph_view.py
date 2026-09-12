"""``representation.concept_graph_view`` -- F24 representation/cognitive-preference/collaboration family
(Atlas L959-973), 1 of 4 concurrent agents opening F24 in this same parallel batch, this agent covering
Concept Graph View + Timeline View.

Atlas cites this method ONCE: the F24 tool table row (L967, verbatim: "Concept Graph View | typed nodes/edges
| render relations/provenance | 可視化知識與矛盾"). Grep-confirmed the only real hit case-insensitively across
the whole Atlas file -- no dedicated section, same thin-citation class ``delivery.risk_register``/
``experiment.mvp`` already establish.

**Structural law shared by every F24 View method (Atlas §9 Representation Contract, L1053, verbatim): "View
只保存 layout / filters / visible_fields / presentation_preferences，不得複製 Knowledge 本體"** -- a View record
stores ONLY presentation state plus a reference to its source Knowledge Object, never a copy of the Knowledge
content itself. Enforced here structurally: ``edges[]`` entries are a closed key set of reference ids plus
narrow presentation state (``layout_position``, ``visible``); the ground-truth ``source_relations[]`` a
rendered edge must stay faithful to is passed to the builder/gate as a SEPARATE parameter (modeling what
would, in production, be a live query against the Knowledge Object store), never persisted onto the returned
record.

**Real invariant, THE one this method exists to enforce, enforced at TWO independent layers, same "derived,
not asserted" / referential-integrity discipline this corpus's ``foresight.cross_impact_analysis`` already
establishes** (``CGRAPH_RELATION_TYPE_MISMATCH`` / ``CGRAPH_PROVENANCE_REF_MISMATCH``): every edge's
``relation_type`` and ``provenance_ref`` must exactly equal its referenced ``source_relations[]`` entry's own
values -- an edge asserting a DIFFERENT relation_type (or provenance_ref) than the source data actually has is
refused. This operationalizes Atlas's own benefit "可視化知識與矛盾" (visualize knowledge AND contradictions
faithfully, not invent new ones through the rendering layer).

Second invariant (``CGRAPH_DANGLING_RELATION_REF``): every edge's ``relation_id`` must resolve to a declared
``source_relations[]`` entry.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and ``Projects/internal/cognitive-engineering-os``
case-insensitively for "concept graph"/"concept-graph"/"CGRAPH-"/"representation\\." before writing any of this
method's own files: zero pre-existing implementation or schema title overlap (only the pre-existing generic
``specs/cognitive/representation.schema.yaml``, a different, broader dimension-H View contract this method's
record does not redefine).
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "representation.concept_graph_view"
RECORD_ID_PREFIX = "CGRAPH-"
_EDGE_KEYS = frozenset({"edge_id", "relation_id", "relation_type", "provenance_ref", "layout_position", "visible"})
_SOURCE_RELATION_KEYS = frozenset({"relation_id", "relation_type", "provenance_ref"})
_LAYOUT_KEYS = frozenset({"x", "y"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _layout_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _LAYOUT_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _LAYOUT_KEYS <= value.keys():
        return f"missing key(s) {sorted(_LAYOUT_KEYS - value.keys(), key=repr)}"
    if not _is_number(value.get("x")):
        return f"x must be a number, got {value.get('x')!r}"
    if not _is_number(value.get("y")):
        return f"y must be a number, got {value.get('y')!r}"
    return None


def _edge_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped edges[] entry" -- shape only, NOT rendering fidelity
    (whether relation_type/provenance_ref actually match the referenced source relation), which needs the
    sibling source_relations[] array and is checked once in ``generate_concept_graph_view``/the gate (same
    division of labor ``foresight.cross_impact_analysis``'s ``impact_pair()``/``generate_cross_impact_analysis``
    split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _EDGE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)} -- Atlas L1053 permits only presentation state plus reference ids on a View edge"
    if not _EDGE_KEYS <= value.keys():
        return f"missing key(s) {sorted(_EDGE_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("edge_id")):
        return f"edge_id must be a non-empty string, got {value.get('edge_id')!r}"
    if not _is_nonempty_str(value.get("relation_id")):
        return f"relation_id must be a non-empty string, got {value.get('relation_id')!r}"
    if not _is_nonempty_str(value.get("relation_type")):
        return f"relation_type must be a non-empty string, got {value.get('relation_type')!r}"
    if not _is_nonempty_str(value.get("provenance_ref")):
        return f"provenance_ref must be a non-empty string, got {value.get('provenance_ref')!r}"
    layout_problem = _layout_problem(value.get("layout_position"))
    if layout_problem is not None:
        return f"layout_position: {layout_problem}"
    if not isinstance(value.get("visible"), bool):
        return f"visible must be a bool, got {value.get('visible')!r}"
    return None


def edge(edge_id: str, relation_id: str, relation_type: str, provenance_ref: str, layout_position: dict[str, Any], visible: bool) -> dict[str, Any]:
    """One item of ``typed-objects/concept-graph-view-record.schema.yaml#/properties/edges``. Does NOT itself
    check rendering fidelity against a declared ``source_relations[]`` list -- that cross-array check happens
    once, in ``generate_concept_graph_view``, after every edge has been rebuilt."""
    record = {
        "edge_id": edge_id,
        "relation_id": relation_id,
        "relation_type": relation_type,
        "provenance_ref": provenance_ref,
        "layout_position": dict(layout_position) if isinstance(layout_position, dict) else layout_position,
        "visible": visible,
    }
    problem = _edge_problem(record)
    if problem is not None:
        raise InvariantViolation(f"CGRAPH_INVALID_EDGE: {problem}")
    return record


def _source_relation_problem(value: Any) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _SOURCE_RELATION_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _SOURCE_RELATION_KEYS <= value.keys():
        return f"missing key(s) {sorted(_SOURCE_RELATION_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("relation_id")):
        return f"relation_id must be a non-empty string, got {value.get('relation_id')!r}"
    if not _is_nonempty_str(value.get("relation_type")):
        return f"relation_type must be a non-empty string, got {value.get('relation_type')!r}"
    if not _is_nonempty_str(value.get("provenance_ref")):
        return f"provenance_ref must be a non-empty string, got {value.get('provenance_ref')!r}"
    return None


def generate_concept_graph_view(
    record_id: str,
    knowledge_ref: str,
    source_relations: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/concept-graph-view-record.schema.yaml``.

    ``source_relations`` is the ground truth (what would, in production, be a live query against the
    Knowledge Object store) every edge must stay faithful to -- it is NEVER persisted onto the returned
    record (Atlas L1053's no-duplication law).

    Rebuilds every ``edges[]`` entry via ``edge()`` (never trusting the caller's raw dicts), then enforces the
    method contract's own real invariants fail-closed, in order: id/version/provenance shape,
    knowledge_ref non-empty, source_relations well-shaped with unique relation_id, every edge well-shaped and
    unique edge_id, every edge's relation_id resolves to a real source relation, and -- the invariant Atlas's
    own "render relations/provenance" pipeline stage exists to enforce -- every edge's relation_type AND
    provenance_ref exactly match the referenced source relation's own values -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CGRAPH_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CGRAPH_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("CGRAPH_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(knowledge_ref):
        raise InvariantViolation(f"CGRAPH_INVALID_KNOWLEDGE_REF: knowledge_ref must be a non-empty string, got {knowledge_ref!r}")

    if not isinstance(source_relations, list):
        raise InvariantViolation(f"CGRAPH_INVALID_SOURCE_RELATIONS: source_relations must be a list, got {type(source_relations).__name__}")
    source_by_id: dict[str, dict[str, Any]] = {}
    for i, r in enumerate(source_relations):
        problem = _source_relation_problem(r)
        if problem is not None:
            raise InvariantViolation(f"CGRAPH_INVALID_SOURCE_RELATIONS: source_relations[{i}]: {problem}")
        rid = r["relation_id"]
        if rid in source_by_id:
            raise InvariantViolation(f"CGRAPH_DUPLICATE_SOURCE_RELATION: relation_id {rid!r} declared more than once in source_relations")
        source_by_id[rid] = r

    if not isinstance(edges, list):
        raise InvariantViolation(f"CGRAPH_INVALID_EDGES: edges must be a list, got {type(edges).__name__}")
    rebuilt_edges: list[dict[str, Any]] = []
    for i, e in enumerate(edges):
        if not isinstance(e, dict):
            raise InvariantViolation(f"CGRAPH_INVALID_EDGES: edges[{i}] must be a dict, got {e!r}")
        try:
            rebuilt_edges.append(edge(e.get("edge_id"), e.get("relation_id"), e.get("relation_type"), e.get("provenance_ref"), e.get("layout_position"), e.get("visible")))
        except InvariantViolation as error:
            raise InvariantViolation(f"CGRAPH_INVALID_EDGES: edges[{i}]: {error}") from error
    edge_ids = [e["edge_id"] for e in rebuilt_edges]
    if len(edge_ids) != len(set(edge_ids)):
        duplicate = sorted({eid for eid in edge_ids if edge_ids.count(eid) > 1})
        raise InvariantViolation(f"CGRAPH_DUPLICATE_EDGE_ID: edge_id(s) {duplicate} declared more than once")

    dangling = sorted({e["relation_id"] for e in rebuilt_edges} - set(source_by_id))
    if dangling:
        raise InvariantViolation(f"CGRAPH_DANGLING_RELATION_REF: edges[] reference relation_id(s) {dangling} not present in source_relations[]")

    type_mismatches: list[str] = []
    provenance_mismatches: list[str] = []
    for e in rebuilt_edges:
        source = source_by_id[e["relation_id"]]
        if e["relation_type"] != source["relation_type"]:
            type_mismatches.append(f"{e['edge_id']} (relation {e['relation_id']}): rendered {e['relation_type']!r} != source {source['relation_type']!r}")
        if e["provenance_ref"] != source["provenance_ref"]:
            provenance_mismatches.append(f"{e['edge_id']} (relation {e['relation_id']}): rendered {e['provenance_ref']!r} != source {source['provenance_ref']!r}")
    if type_mismatches:
        raise InvariantViolation(
            f"CGRAPH_RELATION_TYPE_MISMATCH: edge(s) render a relation_type the source data does not have: {type_mismatches}. "
            "Atlas L967's own 'render relations/provenance' pipeline stage requires every rendered edge to stay faithful to its source relation"
        )
    if provenance_mismatches:
        raise InvariantViolation(f"CGRAPH_PROVENANCE_REF_MISMATCH: edge(s) render a provenance_ref the source data does not have: {provenance_mismatches}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "knowledge_ref": knowledge_ref,
        "edges": rebuilt_edges,
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


def evaluate_no_content_duplication_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives, directly from raw fields using the SAME ``_edge_problem`` predicate the builder uses, that
    every edges[] entry is shaped as the closed reference-plus-presentation-state key set Atlas L1053 permits
    -- without this the gate could pass a hand-tampered record with an edge carrying an extra field (e.g. a
    smuggled `description` or `evidence` key) capable of holding a copy of the relation's own content. Fails
    closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("no_content_duplication", False, [{"reason": "record is not a dict"}], validator, timestamp)
    edges = record.get("edges")
    if not isinstance(edges, list):
        return _result("no_content_duplication", False, [{"reason": "edges must be a list"}], validator, timestamp)
    problems = [f"edges[{i}]: {problem}" for i, problem in ((i, _edge_problem(e)) for i, e in enumerate(edges)) if problem]
    passed = not problems
    return _result("no_content_duplication", passed, [{"problems": problems}], validator, timestamp)


def evaluate_rendering_fidelity_gate(record: dict[str, Any], source_relations: list[dict[str, Any]], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L967's own 'render relations/provenance' requirement directly from raw fields --
    every edge's relation_type AND provenance_ref must exactly match its referenced source relation, given a
    FRESH ``source_relations`` ground truth (never trusting that the builder's own check already ran, and
    never trusting a copy embedded on the record itself -- there is none, by design). Fails closed on
    malformed entries rather than crashing; does NOT assume referential integrity already passed."""
    if not isinstance(record, dict):
        return _result("rendering_fidelity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    edges = record.get("edges")
    if not isinstance(edges, list) or not isinstance(source_relations, list):
        return _result("rendering_fidelity", False, [{"reason": "edges and source_relations must both be lists"}], validator, timestamp)

    well_shaped_relations = [r for r in source_relations if _source_relation_problem(r) is None]
    source_by_id = {r["relation_id"]: r for r in well_shaped_relations}
    well_shaped_edges = [e for e in edges if _edge_problem(e) is None]

    problems: list[str] = []
    if len(well_shaped_edges) != len(edges):
        problems.append("one or more edges[] entries are malformed")
    if len(well_shaped_relations) != len(source_relations) or len(source_by_id) != len(well_shaped_relations):
        problems.append("one or more source_relations[] entries are malformed or duplicated")

    dangling = sorted({e["relation_id"] for e in well_shaped_edges} - set(source_by_id))
    if dangling:
        problems.append(f"dangling relation_id ref(s): {dangling}")

    for e in well_shaped_edges:
        source = source_by_id.get(e["relation_id"])
        if source is None:
            continue
        if e["relation_type"] != source["relation_type"]:
            problems.append(f"{e['edge_id']}: relation_type {e['relation_type']!r} != source {source['relation_type']!r}")
        if e["provenance_ref"] != source["provenance_ref"]:
            problems.append(f"{e['edge_id']}: provenance_ref {e['provenance_ref']!r} != source {source['provenance_ref']!r}")

    passed = not problems
    return _result("rendering_fidelity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_concept_graph_view_gates(record: dict[str, Any], source_relations: list[dict[str, Any]], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_no_content_duplication_gate(record, validator, timestamp),
        evaluate_rendering_fidelity_gate(record, source_relations, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
