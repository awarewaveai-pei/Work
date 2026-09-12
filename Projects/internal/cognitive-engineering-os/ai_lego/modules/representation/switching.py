"""``representation.switching`` -- F24 representation/cognitive-preference/collaboration family (Atlas
L963, §11.55 L2468-2489).

Atlas's own table row (L963, verbatim): "Representation Switching | 同一
underlying model 切換 View | 共用 object IDs/provenance→render different
views | 零重工＋適配不同腦袋" (switch the View of the same underlying model,
sharing object IDs/provenance across the rendered views, giving zero rework
and fit for different minds). Dedicated §11.55 (L2468-2489) names 8 views
(Text/Table/Mind Map/Concept Graph/Timeline/Causal Diagram/Canvas/Audio) and
two explicit benefits: "Provenance 保持一致" (provenance stays consistent) and
"不會因 UI 變化複製出多份互相衝突內容" (a UI change never forks the content
into multiple conflicting copies).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **View shape / minimum count** (``REPSWITCH_INVALID_VIEW`` /
   ``REPSWITCH_TOO_FEW_VIEWS``) -- every ``views[]`` entry is well-shaped
   (category/knowledge_object_id/provenance) and at least 2 are named (a
   switch needs something to switch between).
2. **Knowledge-object consistency** (``REPSWITCH_KNOWLEDGE_OBJECT_
   MISMATCH``) -- every ``views[].knowledge_object_id`` must be identical.
3. **Provenance consistency, THE real invariant this method exists to
   enforce** (``REPSWITCH_PROVENANCE_MISMATCH``) -- every
   ``views[].provenance`` must be identical (deep-equal). A switch record
   naming two different knowledge_object_ids, or whose per-view provenance
   diverges, IS exactly the "複製出多份互相衝突內容" failure Atlas §11.55's
   own benefit column names -- made structural here.

``views[].category`` REUSES ``specs/cognitive/representation.schema.yaml``'s
own 11-value ``representation_category`` enum verbatim (text, outline,
table, matrix, mindmap, conceptmap, timeline, causal, graph, canvas, audio)
rather than inventing a second, parallel enum for the same LEGO dimension H
concept.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for
"representation switching"/"representation_switching"/
"RepresentationSwitchEvent" before writing any of this method's own files:
zero pre-existing implementation or schema-title overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "representation.switching"
RECORD_ID_PREFIX = "REPSWITCH-"

# Verbatim reuse of specs/cognitive/representation.schema.yaml#/definitions/representation_category
# (Atlas §17 L3916-3927) -- see module docstring for why this is not a new, parallel enum.
VIEW_CATEGORIES = frozenset({"text", "outline", "table", "matrix", "mindmap", "conceptmap", "timeline", "causal", "graph", "canvas", "audio"})
_VIEW_KEYS = frozenset({"category", "knowledge_object_id", "provenance"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _view_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped views[] entry" -- shape only, NOT the cross-view
    knowledge_object_id/provenance consistency checks, which need the sibling entries and are checked once in
    ``generate_representation_switch_event``/the gate (same division of labor ``foresight.
    cross_impact_analysis``'s ``event()``/``generate_cross_impact_analysis`` split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _VIEW_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _VIEW_KEYS <= value.keys():
        return f"missing key(s) {sorted(_VIEW_KEYS - value.keys(), key=repr)}"
    if value.get("category") not in VIEW_CATEGORIES:
        return f"category must be one of {sorted(VIEW_CATEGORIES)}, got {value.get('category')!r}"
    if not _is_nonempty_str(value.get("knowledge_object_id")):
        return f"knowledge_object_id must be a non-empty string, got {value.get('knowledge_object_id')!r}"
    if not provenance_is_valid(value.get("provenance")):
        return f"provenance must be a valid provenance_record, got {value.get('provenance')!r}"
    return None


def switched_view(category: str, knowledge_object_id: str, provenance: dict[str, Any]) -> dict[str, Any]:
    """One item of ``typed-objects/representation-switch-event.schema.yaml#/properties/views``. Does NOT itself
    check cross-view consistency against sibling entries -- that cross-field check happens once, in
    ``generate_representation_switch_event``, after every view has been rebuilt. ``copy.deepcopy``s
    ``provenance`` so the returned entry never aliases the caller's own dict."""
    record = {"category": category, "knowledge_object_id": knowledge_object_id, "provenance": copy.deepcopy(provenance)}
    problem = _view_problem(record)
    if problem is not None:
        raise InvariantViolation(f"REPSWITCH_INVALID_VIEW: {problem}")
    return record


def generate_representation_switch_event(
    record_id: str,
    views: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/representation-switch-event.schema.yaml``.

    Rebuilds every ``views[]`` entry via ``switched_view()`` (never trusting the caller's raw dicts, and never
    aliasing the caller's per-view provenance dict), then enforces the method contract's own real invariants
    fail-closed, in order: id/version/provenance shape, at least 2 views declared, and -- the invariant
    Atlas §11.55's own "Provenance 保持一致" / "不會...複製出多份互相衝突內容" benefits exist to guarantee --
    every views[] entry shares the SAME knowledge_object_id AND the SAME provenance, BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"REPSWITCH_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"REPSWITCH_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("REPSWITCH_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(views, list):
        raise InvariantViolation(f"REPSWITCH_INVALID_VIEWS: views must be a list, got {type(views).__name__}")
    rebuilt_views: list[dict[str, Any]] = []
    for i, v in enumerate(views):
        if not isinstance(v, dict):
            raise InvariantViolation(f"REPSWITCH_INVALID_VIEWS: views[{i}] must be a dict, got {v!r}")
        try:
            rebuilt_views.append(switched_view(v.get("category"), v.get("knowledge_object_id"), v.get("provenance")))
        except InvariantViolation as error:
            raise InvariantViolation(f"REPSWITCH_INVALID_VIEWS: views[{i}]: {error}") from error

    if len(rebuilt_views) < 2:
        raise InvariantViolation(f"REPSWITCH_TOO_FEW_VIEWS: at least 2 views are required, got {len(rebuilt_views)} -- a representation switch needs something to switch between")

    knowledge_object_ids = {v["knowledge_object_id"] for v in rebuilt_views}
    if len(knowledge_object_ids) > 1:
        raise InvariantViolation(f"REPSWITCH_KNOWLEDGE_OBJECT_MISMATCH: views[] must all reference the same knowledge_object_id, found {sorted(knowledge_object_ids)}")

    first_provenance = rebuilt_views[0]["provenance"]
    if any(v["provenance"] != first_provenance for v in rebuilt_views[1:]):
        raise InvariantViolation(
            "REPSWITCH_PROVENANCE_MISMATCH: views[] must all carry identical provenance -- Atlas §11.55's own "
            "'Provenance 保持一致' benefit requires a view switch to never fork provenance across renderings"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "views": rebuilt_views,
        "provenance": copy.deepcopy(provenance),
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid record-level provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_view_shape_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives per-view shape and the minimum-2-views bound directly from raw fields using the SAME
    ``_view_problem`` predicate the builder uses -- without this the gate could pass a hand-tampered record
    with a malformed or too-short views[]. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("view_shape", False, [{"reason": "record is not a dict"}], validator, timestamp)
    views = record.get("views")
    problems: list[str] = []
    if isinstance(views, list):
        malformed = [f"views[{i}]: {problem}" for i, problem in ((i, _view_problem(v)) for i, v in enumerate(views)) if problem]
        problems.extend(malformed)
        well_shaped = [v for v in views if _view_problem(v) is None]
        if not malformed and len(well_shaped) < 2:
            problems.append(f"fewer than 2 well-shaped views: {len(well_shaped)}")
    else:
        problems.append("views must be a list")
    passed = not problems
    return _result("view_shape", passed, [{"problems": problems}], validator, timestamp)


def evaluate_cross_view_consistency_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas §11.55's own cross-view consistency requirement directly from raw fields -- every
    well-shaped views[] entry must share the SAME knowledge_object_id AND the SAME (deep-equal) provenance.
    Fails closed on malformed entries rather than crashing, and does NOT trust that the builder's own check
    already ran (a hand-tampered record bypasses the builder entirely)."""
    if not isinstance(record, dict):
        return _result("cross_view_consistency", False, [{"reason": "record is not a dict"}], validator, timestamp)
    views = record.get("views")
    if not isinstance(views, list):
        return _result("cross_view_consistency", False, [{"reason": "views must be a list"}], validator, timestamp)
    well_shaped = [v for v in views if _view_problem(v) is None]
    if len(well_shaped) != len(views) or len(well_shaped) < 2:
        return _result("cross_view_consistency", False, [{"reason": "views[] must be >= 2 well-shaped entries to evaluate cross-view consistency"}], validator, timestamp)

    problems: list[str] = []
    knowledge_object_ids = {v["knowledge_object_id"] for v in well_shaped}
    if len(knowledge_object_ids) > 1:
        problems.append(f"knowledge_object_id mismatch: {sorted(knowledge_object_ids)}")
    first_provenance = well_shaped[0]["provenance"]
    if any(v["provenance"] != first_provenance for v in well_shaped[1:]):
        problems.append("provenance mismatch across views[]")
    passed = not problems
    return _result("cross_view_consistency", passed, [{"problems": problems}], validator, timestamp)


def evaluate_representation_switch_event_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_view_shape_gate(record, validator, timestamp),
        evaluate_cross_view_consistency_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
