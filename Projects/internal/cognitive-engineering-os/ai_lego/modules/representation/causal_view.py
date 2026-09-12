"""``representation.causal_view`` -- F24 representation/cognitive-preference/collaboration family
(Atlas L969).

Atlas's own table row (L969, verbatim): "Causal View | 專門呈現因果/feedback |
DAG/CLD＋assumptions | 避免一般圖誤當因果" (a rendering method dedicated to
causal/feedback structures, rendering a DAG/CLD plus assumptions; benefit:
avoid mistaking an ordinary diagram for causation).

Per the shared Atlas §9 Representation Contract (L1040-1053) every View in
this family obeys ONE structural law: a View stores ONLY layout/filters/
visible_fields/presentation_preferences plus a reference to its source
Knowledge Object -- it never duplicates the underlying Knowledge itself. This
method is therefore a RENDERING layer over an existing `causal.dag` /
`systems.causal_loop_diagram` record (referenced by id via `knowledge_ref`);
it does not itself compute causal claims.

Real invariants, enforced at TWO independent layers, same belt-and-suspenders
discipline every prior slice in this corpus establishes:

1. **Per-edge assumption required, THE real invariant this method exists to
   enforce** (``CVIEW_MISSING_ASSUMPTION``) -- Atlas's own benefit column is
   literally "避免一般圖誤當因果" (avoid mistaking an ordinary diagram for
   causation): an edge rendered with no declared assumption IS that failure,
   made structural. Every ``rendered_edges[]`` entry must carry a non-empty
   ``assumption``.
2. **No duplicate edge_id** (``CVIEW_DUPLICATE_EDGE_ID``) -- an edge cannot
   be annotated twice under the same id within one View.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"causal view"/"causal_view"/"CVIEW-" before writing any of this method's own
files: zero pre-existing implementation or schema-title overlap. Confirmed
distinct from the pre-existing ``causal.dag`` (``ai_lego/modules/causal/
dag.py``, ``CDA-`` prefix) and ``systems.causal_loop_diagram`` (``CLD-``
prefix) modules -- those COMPUTE causal claims; this method only RENDERS
them via a bare id reference, never duplicating their node/edge bodies.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "representation.causal_view"
RECORD_ID_PREFIX = "CVIEW-"
_EDGE_KEYS = frozenset({"edge_id", "assumption"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _edge_shape_problem(value: Any) -> str | None:
    """Shape-only: dict type, no unknown keys, edge_id is a non-empty string. Deliberately excludes
    assumption emptiness -- that is Atlas L969's own named invariant and raises its own distinct error
    code via ``_assumption_problem`` below, not a generic shape defect."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _EDGE_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _is_nonempty_str(value.get("edge_id")):
        return f"edge_id must be a non-empty string, got {value.get('edge_id')!r}"
    return None


def _assumption_problem(value: dict[str, Any]) -> str | None:
    """THE real invariant this method exists to enforce -- Atlas L969's own '避免一般圖誤當因果' benefit.
    A missing key, a ``None``, and an empty/whitespace-only string are all "no declared assumption" and
    are treated identically -- ``.get()`` already collapses "key absent" to ``None`` for this check."""
    assumption = value.get("assumption")
    if not _is_nonempty_str(assumption):
        return (
            f"assumption must be a non-empty string, got {assumption!r} -- Atlas L969's own benefit "
            "'避免一般圖誤當因果' forbids rendering a causal edge with no declared assumption"
        )
    return None


def _edge_problem(value: Any) -> str | None:
    """The single combined definition of "is this a well-shaped, assumption-valid rendered_edges[]
    entry" -- used by the gate's fail-closed pre-filter (well-shaped list for duplicate-id detection).
    ``rendered_edge()`` below calls the two halves separately so shape defects and missing-assumption
    defects raise distinct, precise error codes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    shape_problem = _edge_shape_problem(value)
    if shape_problem is not None:
        return shape_problem
    return _assumption_problem(value)


def rendered_edge(edge_id: str, assumption: str) -> dict[str, Any]:
    """One item of ``typed-objects/causal-view-record.schema.yaml#/properties/rendered_edges``."""
    record = {"edge_id": edge_id, "assumption": assumption}
    shape_problem = _edge_shape_problem(record)
    if shape_problem is not None:
        raise InvariantViolation(f"CVIEW_INVALID_EDGE: {shape_problem}")
    assumption_problem = _assumption_problem(record)
    if assumption_problem is not None:
        raise InvariantViolation(f"CVIEW_MISSING_ASSUMPTION: {assumption_problem}")
    return record


def generate_causal_view(
    record_id: str,
    knowledge_ref: str,
    rendered_edges: list[dict[str, Any]],
    state: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/causal-view-record.schema.yaml``.

    Rebuilds every ``rendered_edges[]`` entry via ``rendered_edge()`` (never trusting the caller's raw
    dicts), then enforces the method contract's own real invariants fail-closed, in order: id/version/
    provenance shape, knowledge_ref non-empty, every edge well-shaped with a non-empty assumption -- the
    invariant Atlas's own "避免一般圖誤當因果" benefit exists to enforce -- and no duplicate edge_id --
    BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"CVIEW_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"CVIEW_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("CVIEW_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_nonempty_str(knowledge_ref):
        raise InvariantViolation(f"CVIEW_INVALID_KNOWLEDGE_REF: knowledge_ref must be a non-empty string, got {knowledge_ref!r}")

    if not isinstance(rendered_edges, list):
        raise InvariantViolation(f"CVIEW_INVALID_RENDERED_EDGES: rendered_edges must be a list, got {type(rendered_edges).__name__}")
    rebuilt_edges: list[dict[str, Any]] = []
    for i, e in enumerate(rendered_edges):
        if not isinstance(e, dict):
            raise InvariantViolation(f"CVIEW_INVALID_RENDERED_EDGES: rendered_edges[{i}] must be a dict, got {e!r}")
        try:
            rebuilt_edges.append(rendered_edge(e.get("edge_id"), e.get("assumption")))
        except InvariantViolation as error:
            raise InvariantViolation(f"rendered_edges[{i}]: {error}") from error

    edge_ids = [e["edge_id"] for e in rebuilt_edges]
    if len(edge_ids) != len(set(edge_ids)):
        duplicate = sorted({e for e in edge_ids if edge_ids.count(e) > 1})
        raise InvariantViolation(f"CVIEW_DUPLICATE_EDGE_ID: edge_id(s) {duplicate} annotated more than once")

    if not isinstance(state, dict):
        raise InvariantViolation(f"CVIEW_INVALID_STATE: state must be a dict, got {type(state).__name__}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "knowledge_ref": knowledge_ref,
        "rendered_edges": rebuilt_edges,
        "state": copy.deepcopy(state),
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


def evaluate_edge_assumption_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L969's own '避免一般圖誤當因果' requirement directly from raw fields using the
    SAME ``_edge_problem`` predicate the builder uses -- without this the gate could pass records the
    builder refuses. Fails closed on malformed entries rather than crashing, and does NOT trust that the
    builder's own check already ran (catches hand-tampered records that bypass the builder)."""
    if not isinstance(record, dict):
        return _result("edge_assumption_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    rendered_edges = record.get("rendered_edges")
    if not isinstance(rendered_edges, list):
        return _result("edge_assumption_required", False, [{"reason": "rendered_edges must be a list"}], validator, timestamp)

    problems: list[str] = []
    for i, e in enumerate(rendered_edges):
        problem = _edge_problem(e)
        if problem is not None:
            problems.append(f"rendered_edges[{i}]: {problem}")
    well_shaped_ids = [e["edge_id"] for e in rendered_edges if _edge_problem(e) is None]
    if len(well_shaped_ids) != len(set(well_shaped_ids)):
        duplicate = sorted({e for e in well_shaped_ids if well_shaped_ids.count(e) > 1})
        problems.append(f"duplicate edge_id(s): {duplicate}")

    passed = not problems
    return _result("edge_assumption_required", passed, [{"problems": problems}], validator, timestamp)


def evaluate_causal_view_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_edge_assumption_required_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
