"""``representation.mind_map_view`` -- F24 Representation/Cognitive Preference/Collaboration family.
Atlas's own table row (L966, verbatim): "Mind Map View | 樹狀自由聯想呈現 | render idea/topic hierarchy | 降
工作記憶負荷" (tree-shaped free-association rendering; render an idea/topic hierarchy; reduce working-memory
load).

**CRITICAL DISAMBIGUATION from ``association.mind_map`` (F04, ``MINDMAP-`` prefix, Atlas §11.1
L1124-1172).** That method GENERATES a brand-new brainstorm tree -- `central_topic` -> `main_branches[]`
(each with a `label`) -> `sub_branches[]` -> `keywords[]` -- typed CONTENT a caller supplies and the method
validates/shapes. Its own contract/module already anticipated and ruled out THIS exact F24 row (grep-
confirmed, `association.mind_map.contract.yaml`'s own `verification.method`: "Ruled OUT as unrelated: 'Mind
Map View' (F24 Representation table L966...) -- a RENDERING VIEW of an arbitrary Knowledge Object..., not
this method's own typed-object shape").

THIS method does the opposite: it RENDERS an arbitrary, ALREADY-EXISTING Knowledge Object's own nodes at
radial `(x, y)` layout positions. It is structurally incapable of generating new label/topic/keyword
content -- there is no such field anywhere in this module's own record shape, only `node_id` REFERENCES
into the source Knowledge Object plus numeric coordinates. Record prefix `MMVIEW-`, deliberately distinct
from `MINDMAP-` (grep-confirmed unused before choosing it). The two record schemas are TYPE-INCOMPATIBLE:
different `id` patterns, different required fields, no shared instance could validate against both.

Real invariants, enforced at TWO independent layers, same belt-and-suspenders discipline every prior slice
in this corpus establishes:

1. **No content duplication + reference shape** (``MMVIEW_NOT_A_REFERENCE``) -- the shared F24 View law
   (Atlas §9 L1053). Every `node_positions[].node_id` and `layout.center_node_id` is a bare id/URI-shaped
   REFERENCE (no whitespace), never a rendered node's own label/content.
2. **Node-id uniqueness** (``MMVIEW_DUPLICATE_NODE_ID``) -- no node is rendered twice.
3. **Center referential integrity** (``MMVIEW_DANGLING_CENTER_REF``) -- `layout.center_node_id`, when
   present, must resolve to a declared `node_positions[]` entry -- a radial layout cannot declare a center
   that is not itself rendered.
4. **Position validity** (``MMVIEW_INVALID_NODE_POSITION_ENTRY``) -- every `x`/`y`/`distance_from_center`
   is a finite real number (`bool` excluded, the same documented trap `foresight.cross_impact_analysis`'s
   own `_is_valid_shift` guards against).

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "mind.?map.?view", "MMVIEW", and
"node_positions" before writing any of this method's own files: zero pre-existing implementation overlap
beyond the already-disambiguated `association.mind_map`/`MINDMAP-` family (read in full, cited above).
"""

from __future__ import annotations

import copy
import math
import re
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "representation.mind_map_view"
RECORD_ID_PREFIX = "MMVIEW-"
_REFERENCE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:/-]*$")
_POSITION_REQUIRED_KEYS = frozenset({"node_id", "x", "y"})
_POSITION_ALLOWED_KEYS = _POSITION_REQUIRED_KEYS | frozenset({"distance_from_center"})
_LAYOUT_ALLOWED_KEYS = frozenset({"center_node_id", "orientation"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_reference_shaped(value: Any) -> bool:
    """Same grammar and reasoning as the sibling F24 View methods' own ``_is_reference_shaped``: a bare
    id/URI-shaped string, no whitespace -- a cheap proxy that this is a POINTER, not copied content."""
    return isinstance(value, str) and bool(_REFERENCE_PATTERN.match(value))


def _is_finite_number(value: Any) -> bool:
    """``bool`` excluded -- Python's ``bool`` is an ``int`` subclass, the same documented trap
    ``foresight.cross_impact_analysis``'s own ``_is_valid_shift`` guards against."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return False


def _position_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped node_positions[] entry". Consulted by both
    ``node_position()`` (construction layer) and both gates (independent re-derivation layer), same
    single-shared-predicate discipline every sibling module in this suite establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    keys = set(value.keys())
    if not _POSITION_REQUIRED_KEYS.issubset(keys):
        return f"missing key(s) {sorted(_POSITION_REQUIRED_KEYS - keys, key=repr)}"
    if not keys.issubset(_POSITION_ALLOWED_KEYS):
        return f"unknown key(s) {sorted(keys - _POSITION_ALLOWED_KEYS, key=repr)}"
    if not _is_reference_shaped(value.get("node_id")):
        return f"node_id must be a reference-shaped string (no whitespace), got {value.get('node_id')!r}"
    if not _is_finite_number(value.get("x")):
        return f"x must be a finite real number, got {value.get('x')!r}"
    if not _is_finite_number(value.get("y")):
        return f"y must be a finite real number, got {value.get('y')!r}"
    if "distance_from_center" in value:
        d = value["distance_from_center"]
        if not _is_finite_number(d) or d < 0:
            return f"distance_from_center must be a finite non-negative real number, got {d!r}"
    return None


def _layout_problem(value: Any, node_ids: frozenset[str]) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _LAYOUT_ALLOWED_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown)}"
    if "center_node_id" in value:
        center = value["center_node_id"]
        if not _is_reference_shaped(center):
            return f"center_node_id must be a reference-shaped string (no whitespace), got {center!r}"
        if center not in node_ids:
            return f"center_node_id {center!r} does not resolve to a declared node_positions[] entry"
    if "orientation" in value and (not _is_nonempty_str(value["orientation"]) or len(value["orientation"]) > 32):
        return f"orientation must be a non-empty string of at most 32 characters, got {value.get('orientation')!r}"
    return None


def node_position(node_id: str, x: float, y: float, *, distance_from_center: float | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/mind-map-view-record.schema.yaml#/properties/node_positions``."""
    record: dict[str, Any] = {"node_id": node_id, "x": x, "y": y}
    if distance_from_center is not None:
        record["distance_from_center"] = distance_from_center
    problem = _position_problem(record)
    if problem is not None:
        raise InvariantViolation(f"MMVIEW_INVALID_NODE_POSITION_ENTRY: {problem}")
    return record


def generate_mind_map_view(
    record_id: str,
    source_knowledge_object_id: str,
    node_positions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    layout: dict[str, Any] | None = None,
    visible_fields: list[str] | None = None,
    presentation_preferences: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/mind-map-view-record.schema.yaml``.

    Rebuilds every ``node_positions[]`` entry via its own shape check (never trusting the caller's raw
    dicts), then enforces the method contract's own real invariants fail-closed, in order: id/version/
    provenance shape, `source_knowledge_object_id` reference-shape, every position entry's own shape,
    whole-record node_id uniqueness, then `layout.center_node_id` referential integrity -- BEFORE
    returning. Deep-copies every nested mutable field at the return statement.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"MMVIEW_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"MMVIEW_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("MMVIEW_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_reference_shaped(source_knowledge_object_id):
        raise InvariantViolation(f"MMVIEW_NOT_A_REFERENCE: source_knowledge_object_id must be a reference-shaped string (no whitespace), got {source_knowledge_object_id!r}")

    if not isinstance(node_positions, list) or not node_positions:
        raise InvariantViolation(f"MMVIEW_INVALID_NODE_POSITIONS: node_positions must be a non-empty list, got {type(node_positions).__name__}")
    rebuilt_positions: list[dict[str, Any]] = []
    for i, entry in enumerate(node_positions):
        problem = _position_problem(entry)
        if problem is not None:
            raise InvariantViolation(f"MMVIEW_INVALID_NODE_POSITION_ENTRY: node_positions[{i}]: {problem}")
        rebuilt_positions.append(dict(entry))

    node_ids = [p["node_id"] for p in rebuilt_positions]
    if len(node_ids) != len(set(node_ids)):
        duplicate = sorted({n for n in node_ids if node_ids.count(n) > 1})
        raise InvariantViolation(f"MMVIEW_DUPLICATE_NODE_ID: node_id(s) {duplicate} rendered more than once")
    node_id_set = frozenset(node_ids)

    rebuilt_layout = None
    if layout is not None:
        problem = _layout_problem(layout, node_id_set)
        if problem is not None:
            raise InvariantViolation(f"MMVIEW_DANGLING_CENTER_REF: layout: {problem}")
        rebuilt_layout = dict(layout)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "source_knowledge_object_id": source_knowledge_object_id,
        "node_positions": rebuilt_positions,
        "provenance": copy.deepcopy(provenance),
    }
    if rebuilt_layout is not None:
        record["layout"] = rebuilt_layout
    if visible_fields is not None:
        record["visible_fields"] = list(visible_fields)
    if presentation_preferences is not None:
        record["presentation_preferences"] = copy.deepcopy(presentation_preferences)
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_reference_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §9's own 'no content duplication' law, node-id uniqueness, and the center-node
    referential-integrity rule directly from raw fields -- does NOT call ``generate_mind_map_view`` or trust
    the builder already ran. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("reference_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    if not _is_reference_shaped(record.get("source_knowledge_object_id")):
        problems.append(f"source_knowledge_object_id is not reference-shaped: {record.get('source_knowledge_object_id')!r}")

    positions = record.get("node_positions")
    node_id_set: frozenset[str] = frozenset()
    if not isinstance(positions, list) or not positions:
        problems.append("node_positions must be a non-empty list")
    else:
        malformed = [f"node_positions[{i}]: {problem}" for i, problem in ((i, _position_problem(p)) for i, p in enumerate(positions)) if problem]
        problems.extend(malformed)
        well_shaped = [p for p in positions if _position_problem(p) is None]
        node_ids = [p["node_id"] for p in well_shaped]
        if not malformed and len(node_ids) != len(set(node_ids)):
            duplicate = sorted({n for n in node_ids if node_ids.count(n) > 1})
            problems.append(f"duplicate node_id(s) in node_positions[]: {duplicate}")
        node_id_set = frozenset(node_ids)

    layout = record.get("layout")
    if layout is not None:
        layout_problem = _layout_problem(layout, node_id_set)
        if layout_problem is not None:
            problems.append(f"layout: {layout_problem}")

    passed = not problems
    return _result("reference_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_position_validity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the position-validity invariant directly from raw fields -- every x/y/distance_from_center
    is a finite real number. Does NOT trust the builder already enforced it."""
    if not isinstance(record, dict):
        return _result("position_validity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    positions = record.get("node_positions")
    if not isinstance(positions, list):
        return _result("position_validity", False, [{"reason": "node_positions must be a list"}], validator, timestamp)
    problems: list[str] = []
    for i, entry in enumerate(positions):
        if not isinstance(entry, dict):
            problems.append(f"node_positions[{i}] is not a dict: {entry!r}")
            continue
        if not _is_finite_number(entry.get("x")):
            problems.append(f"node_positions[{i}].x is not a finite real number: {entry.get('x')!r}")
        if not _is_finite_number(entry.get("y")):
            problems.append(f"node_positions[{i}].y is not a finite real number: {entry.get('y')!r}")
        if "distance_from_center" in entry:
            d = entry["distance_from_center"]
            if not _is_finite_number(d) or d < 0:
                problems.append(f"node_positions[{i}].distance_from_center is not a finite non-negative real number: {d!r}")
    passed = not problems
    return _result("position_validity", passed, [{"position_count": len(positions), "problems": problems}], validator, timestamp)


def evaluate_mind_map_view_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_reference_integrity_gate(record, validator, timestamp),
        evaluate_position_validity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
