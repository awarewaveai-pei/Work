"""``representation.text_outline_view`` -- F24 Representation/Cognitive Preference/Collaboration family,
opens the family (0/10 -> this batch). Atlas's own table row (L964, verbatim): "Text / Outline View | 線性
文字與大綱 | summary->outline->details->evidence links | 適合深度閱讀" (linear text and outline; summary ->
outline -> details -> evidence links pipeline; suited to deep reading).

Real invariants, enforced at TWO independent layers, same belt-and-suspenders discipline every prior slice
in this corpus establishes:

1. **No content duplication (the shared F24 View law)** -- Atlas §9 Representation Contract (L1053: "View 只
   保存 layout/filters/visible_fields/presentation_preferences，不得複製 Knowledge 本體") and §15.1's mermaid
   (L3606-3619). Enforced STRUCTURALLY: this module's own schema has no `content`/`details` text-blob field
   anywhere -- only `source_knowledge_object_id` and `evidence_links[]`/`details_ref` REFERENCES.
2. **Reference shape** (``TXTVIEW_NOT_A_REFERENCE``) -- every reference field (`source_knowledge_object_id`,
   every outline node's `details_ref`, every `evidence_links[]` entry) must be a bare id/URI-shaped string
   (no whitespace) -- a cheap structural proxy that it is a POINTER, never pasted-in evidence/detail prose.
3. **Summary length bound** (``TXTVIEW_SUMMARY_TOO_LONG``) -- every `summary` (top-level and every outline
   node, recursively) must be non-empty and <= ``SUMMARY_MAX_LENGTH`` characters. This is the structural
   proxy chosen for "this is a genuine summary, not a full-text duplicate" -- a `details` blob field to
   compare length against was deliberately NOT added (storing one would itself BE the content duplication
   invariant #1 forbids); see the schema's own `compilation_decisions` for the full disclosure.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "text.?outline.?view", "TXTVIEW",
"outline_node", and "representation\\." before writing any of this method's own files: zero pre-existing
implementation overlap. `specs/cognitive/representation.schema.yaml` (the pre-existing ABSTRACT View/state
contract) and `method-inventory.yaml`'s "Text / Outline View" row (L1523-1527, `has_contract: false`) are
the only related hits -- both read in full, neither a collision; this module's schema is the CONCRETE typed
record this method's contract declares as its own output, not a redefinition of the abstract file.
"""

from __future__ import annotations

import copy
import re
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "representation.text_outline_view"
RECORD_ID_PREFIX = "TXTVIEW-"
SUMMARY_MAX_LENGTH = 240
_REFERENCE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:/-]*$")
_NODE_REQUIRED_KEYS = frozenset({"id", "summary"})
_NODE_ALLOWED_KEYS = _NODE_REQUIRED_KEYS | frozenset({"details_ref", "evidence_links", "children"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_reference_shaped(value: Any) -> bool:
    """A reference must be a non-empty string with NO whitespace, matching an id/URI-shaped grammar.
    Inline evidence/detail prose is overwhelmingly likely to contain a space; a bare id/URI is not -- see
    the schema's own compilation_decisions for why this cheap proxy was chosen over a full URI validator."""
    return isinstance(value, str) and bool(_REFERENCE_PATTERN.match(value))


def _is_valid_summary(value: Any) -> bool:
    return isinstance(value, str) and 1 <= len(value) <= SUMMARY_MAX_LENGTH


def _node_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped outline node" -- recursive over `children`. Both
    ``outline_node()`` (construction layer) and both gates (independent re-derivation layer) consult it,
    same single-shared-predicate discipline ``foresight.cross_impact_analysis``'s own ``_pair_problem``
    establishes. Checks SHAPE only (types/keys/lengths) -- callers needing only the reference-shape or
    summary-length half re-walk the tree themselves against the already-shape-valid node."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    keys = set(value.keys())
    if not _NODE_REQUIRED_KEYS.issubset(keys):
        return f"missing key(s) {sorted(_NODE_REQUIRED_KEYS - keys, key=repr)}"
    if not keys.issubset(_NODE_ALLOWED_KEYS):
        return f"unknown key(s) {sorted(keys - _NODE_ALLOWED_KEYS, key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_valid_summary(value.get("summary")):
        return f"summary must be a non-empty string of at most {SUMMARY_MAX_LENGTH} characters, got {value.get('summary')!r}"
    if "details_ref" in value and not _is_reference_shaped(value["details_ref"]):
        return f"details_ref must be a reference-shaped string (no whitespace), got {value['details_ref']!r}"
    if "evidence_links" in value:
        links = value["evidence_links"]
        if not isinstance(links, list) or not all(_is_reference_shaped(link) for link in links):
            return f"evidence_links must be a list of reference-shaped strings (no whitespace), got {links!r}"
    if "children" in value:
        children = value["children"]
        if not isinstance(children, list):
            return f"children must be a list, got {children!r}"
        for i, child in enumerate(children):
            problem = _node_problem(child)
            if problem is not None:
                return f"children[{i}]: {problem}"
    return None


def outline_node(
    node_id: str,
    summary: str,
    *,
    details_ref: str | None = None,
    evidence_links: list[str] | None = None,
    children: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """One item of ``typed-objects/text-outline-view-record.schema.yaml#/$defs/outline_node``."""
    record: dict[str, Any] = {"id": node_id, "summary": summary}
    if details_ref is not None:
        record["details_ref"] = details_ref
    if evidence_links is not None:
        record["evidence_links"] = list(evidence_links)
    if children is not None:
        record["children"] = [dict(c) for c in children]
    problem = _node_problem(record)
    if problem is not None:
        raise InvariantViolation(f"TXTVIEW_INVALID_OUTLINE_NODE: {problem}")
    return record


def _rebuild_node(entry: dict[str, Any]) -> dict[str, Any]:
    rebuilt = dict(entry)
    if "evidence_links" in entry:
        rebuilt["evidence_links"] = list(entry["evidence_links"])
    if "children" in entry:
        rebuilt["children"] = [_rebuild_node(c) for c in entry["children"]]
    return rebuilt


def generate_text_outline_view(
    record_id: str,
    source_knowledge_object_id: str,
    summary: str,
    outline: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    layout: dict[str, Any] | None = None,
    filters: dict[str, Any] | None = None,
    visible_fields: list[str] | None = None,
    presentation_preferences: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/text-outline-view-record.schema.yaml``.

    Rebuilds every ``outline[]`` entry via ``outline_node()``'s own shape check (never trusting the caller's
    raw dicts), then enforces the method contract's own real invariants fail-closed, in order: id/version/
    provenance shape, top-level `source_knowledge_object_id`/`summary` reference-shape and length, then
    every outline node -- recursively -- BEFORE returning. Deep-copies every nested mutable field
    (`provenance`, presentation-state objects) at the return statement.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"TXTVIEW_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"TXTVIEW_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("TXTVIEW_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_reference_shaped(source_knowledge_object_id):
        raise InvariantViolation(f"TXTVIEW_NOT_A_REFERENCE: source_knowledge_object_id must be a reference-shaped string (no whitespace), got {source_knowledge_object_id!r}")
    if not _is_valid_summary(summary):
        raise InvariantViolation(f"TXTVIEW_SUMMARY_TOO_LONG: top-level summary must be a non-empty string of at most {SUMMARY_MAX_LENGTH} characters, got {summary!r}")

    if not isinstance(outline, list) or not outline:
        raise InvariantViolation(f"TXTVIEW_INVALID_OUTLINE: outline must be a non-empty list, got {type(outline).__name__}")
    rebuilt_outline: list[dict[str, Any]] = []
    for i, node in enumerate(outline):
        problem = _node_problem(node)
        if problem is not None:
            raise InvariantViolation(f"TXTVIEW_INVALID_OUTLINE_NODE: outline[{i}]: {problem}")
        rebuilt_outline.append(_rebuild_node(node))

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "source_knowledge_object_id": source_knowledge_object_id,
        "summary": summary,
        "outline": rebuilt_outline,
        "provenance": copy.deepcopy(provenance),
    }
    if layout is not None:
        record["layout"] = copy.deepcopy(layout)
    if filters is not None:
        record["filters"] = copy.deepcopy(filters)
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


def _walk_nodes(nodes: Any):
    """Pre-order walk over a (possibly malformed) outline tree -- yields every dict-shaped node it finds,
    recursing into `children` only when it is itself a list, so a hand-tampered non-list `children` does not
    crash the gate."""
    if not isinstance(nodes, list):
        return
    for node in nodes:
        if not isinstance(node, dict):
            continue
        yield node
        yield from _walk_nodes(node.get("children"))


def evaluate_reference_shape_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §9's own 'no content duplication' law directly from raw fields -- every reference
    field (`source_knowledge_object_id`, every node's `details_ref`, every `evidence_links[]` entry) must be
    reference-shaped. Does NOT call ``generate_text_outline_view`` or trust that the builder's own check
    already ran; fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("reference_shape", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    if not _is_reference_shaped(record.get("source_knowledge_object_id")):
        problems.append(f"source_knowledge_object_id is not reference-shaped: {record.get('source_knowledge_object_id')!r}")

    for node in _walk_nodes(record.get("outline")):
        node_id = node.get("id")
        if "details_ref" in node and not _is_reference_shaped(node.get("details_ref")):
            problems.append(f"outline node {node_id!r}: details_ref is not reference-shaped: {node.get('details_ref')!r}")
        links = node.get("evidence_links")
        if links is not None:
            if not isinstance(links, list):
                problems.append(f"outline node {node_id!r}: evidence_links is not a list: {links!r}")
            else:
                for link in links:
                    if not _is_reference_shaped(link):
                        problems.append(f"outline node {node_id!r}: evidence_links entry is not reference-shaped: {link!r}")

    passed = not problems
    return _result("reference_shape", passed, [{"problems": problems}], validator, timestamp)


def evaluate_summary_length_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the summary-length structural invariant directly from raw fields, recursively over the
    whole outline tree -- does NOT trust the builder already enforced it."""
    if not isinstance(record, dict):
        return _result("summary_length", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    if not _is_valid_summary(record.get("summary")):
        problems.append(f"top-level summary invalid (empty or > {SUMMARY_MAX_LENGTH} chars): {record.get('summary')!r}")

    for node in _walk_nodes(record.get("outline")):
        if not _is_valid_summary(node.get("summary")):
            problems.append(f"outline node {node.get('id')!r}: summary invalid (empty or > {SUMMARY_MAX_LENGTH} chars): {node.get('summary')!r}")

    passed = not problems
    return _result("summary_length", passed, [{"max_length": SUMMARY_MAX_LENGTH, "problems": problems}], validator, timestamp)


def evaluate_text_outline_view_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_reference_shape_gate(record, validator, timestamp),
        evaluate_summary_length_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
