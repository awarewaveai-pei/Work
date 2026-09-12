"""``jurisdiction.data_residency_assessment`` -- F23 jurisdiction/compliance/localization family (Atlas L943).

Atlas's own table row (L943, verbatim): "Data Residency Assessment | 決定
資料能放哪裡 | data classes->subjects->laws/contracts->regions->routing |
支援主權與跨境資料" (decide where data can be placed, via data classes ->
subjects -> laws/contracts -> regions -> routing, in support of sovereignty
and cross-border data).

Real invariants, enforced at TWO independent layers, same belt-and-
suspenders discipline every prior slice in this corpus establishes:

1. **Referential integrity** (``DRA_DANGLING_DATA_CLASS_REF``) -- every
   ``routing_decisions[].data_class_id`` must resolve to a declared
   ``data_classes[]`` entry.
2. **Routing completeness, THE real invariant this method exists to
   enforce** (``DRA_UNROUTED_DATA_CLASS``) -- Atlas's own pipeline says
   "regions->routing"; a data class silently left with zero routing
   decisions is exactly the "支援主權與跨境資料" (support sovereignty and
   cross-border data) failure this method's own benefit column names --
   the data category's placement stays undetermined. Every declared data
   class must have at least one routing decision naming an allowed region.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "data
residency"/"data_residency" before writing any of this method's own files:
found `specs/jurisdiction/pack.schema.yaml`'s pack-level `data_residency`
storage-restriction-class enum (a DIFFERENT layer/granularity, disclosed in
the contract yaml's open_questions) -- zero pre-existing implementation or
typed-object title overlap.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "jurisdiction.data_residency_assessment"
RECORD_ID_PREFIX = "DRA-"
_DATA_CLASS_KEYS = frozenset({"data_class_id", "description", "subjects", "applicable_laws"})
_ROUTING_KEYS = frozenset({"data_class_id", "region", "rationale"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and len(value) >= 1 and all(_is_nonempty_str(v) for v in value)


def _data_class_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped data_classes[] entry". Both ``data_class()``
    (construction layer) and the gate (independent re-derivation layer) consult it, same
    single-shared-predicate discipline ``foresight.cross_impact_analysis``'s own ``_event_problem``
    establishes."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _DATA_CLASS_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _DATA_CLASS_KEYS <= value.keys():
        return f"missing key(s) {sorted(_DATA_CLASS_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("data_class_id")):
        return f"data_class_id must be a non-empty string, got {value.get('data_class_id')!r}"
    if not _is_nonempty_str(value.get("description")):
        return f"description must be a non-empty string, got {value.get('description')!r}"
    if not _is_nonempty_str_list(value.get("subjects")):
        return f"subjects must be a non-empty list of non-empty strings, got {value.get('subjects')!r}"
    if not _is_nonempty_str_list(value.get("applicable_laws")):
        return f"applicable_laws must be a non-empty list of non-empty strings, got {value.get('applicable_laws')!r}"
    return None


def data_class(data_class_id: str, description: str, subjects: list[str], applicable_laws: list[str]) -> dict[str, Any]:
    """One item of ``typed-objects/data-residency-assessment-record.schema.yaml#/properties/data_classes``."""
    record = {"data_class_id": data_class_id, "description": description, "subjects": list(subjects) if isinstance(subjects, list) else subjects, "applicable_laws": list(applicable_laws) if isinstance(applicable_laws, list) else applicable_laws}
    problem = _data_class_problem(record)
    if problem is not None:
        raise InvariantViolation(f"DRA_INVALID_DATA_CLASS: {problem}")
    return record


def _routing_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped routing_decisions[] entry" -- shape only, NOT
    referential integrity against ``data_classes[]`` or routing completeness, which need the sibling
    array and are checked once in ``generate_data_residency_assessment``/the gate (same division of
    labor ``foresight.cross_impact_analysis``'s ``impact_pair()``/``generate_cross_impact_analysis``
    split establishes)."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _ROUTING_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _ROUTING_KEYS <= value.keys():
        return f"missing key(s) {sorted(_ROUTING_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("data_class_id")):
        return f"data_class_id must be a non-empty string, got {value.get('data_class_id')!r}"
    if not _is_nonempty_str(value.get("region")):
        return f"region must be a non-empty string, got {value.get('region')!r}"
    if not _is_nonempty_str(value.get("rationale")):
        return f"rationale must be a non-empty string, got {value.get('rationale')!r}"
    return None


def routing_decision(data_class_id: str, region: str, rationale: str) -> dict[str, Any]:
    """One item of ``typed-objects/data-residency-assessment-record.schema.yaml#/properties/routing_decisions``.
    Does NOT itself check referential integrity against a declared ``data_classes[]`` list or routing
    completeness -- those cross-field checks happen once, in ``generate_data_residency_assessment``,
    after every entry has been rebuilt."""
    record = {"data_class_id": data_class_id, "region": region, "rationale": rationale}
    problem = _routing_problem(record)
    if problem is not None:
        raise InvariantViolation(f"DRA_INVALID_ROUTING_DECISION: {problem}")
    return record


def generate_data_residency_assessment(
    record_id: str,
    data_classes: list[dict[str, Any]],
    routing_decisions: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/data-residency-assessment-record.schema.yaml``.

    Rebuilds every ``data_classes[]``/``routing_decisions[]`` entry via ``data_class()``/
    ``routing_decision()`` (never trusting the caller's raw dicts), then enforces the method
    contract's own real invariants fail-closed, in order: id/version/provenance shape, >=1 distinct
    data class declared, every routing decision resolves to a real data class -- and, the invariant
    Atlas's own "regions->routing" pipeline stage exists to enforce, every declared data class has AT
    LEAST ONE routing decision -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DRA_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DRA_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("DRA_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not isinstance(data_classes, list):
        raise InvariantViolation(f"DRA_INVALID_DATA_CLASSES: data_classes must be a list, got {type(data_classes).__name__}")
    rebuilt_classes: list[dict[str, Any]] = []
    for i, dc in enumerate(data_classes):
        if not isinstance(dc, dict):
            raise InvariantViolation(f"DRA_INVALID_DATA_CLASSES: data_classes[{i}] must be a dict, got {dc!r}")
        rebuilt_classes.append(data_class(dc.get("data_class_id"), dc.get("description"), dc.get("subjects"), dc.get("applicable_laws")))
    class_ids = [c["data_class_id"] for c in rebuilt_classes]
    if len(class_ids) != len(set(class_ids)):
        duplicate = sorted({c for c in class_ids if class_ids.count(c) > 1})
        raise InvariantViolation(f"DRA_DUPLICATE_DATA_CLASS_ID: data_class_id(s) {duplicate} declared more than once")
    if len(rebuilt_classes) < 1:
        raise InvariantViolation("DRA_TOO_FEW_DATA_CLASSES: at least 1 data class is required")

    if not isinstance(routing_decisions, list):
        raise InvariantViolation(f"DRA_INVALID_ROUTING_DECISIONS: routing_decisions must be a list, got {type(routing_decisions).__name__}")
    rebuilt_routing: list[dict[str, Any]] = []
    for i, r in enumerate(routing_decisions):
        if not isinstance(r, dict):
            raise InvariantViolation(f"DRA_INVALID_ROUTING_DECISIONS: routing_decisions[{i}] must be a dict, got {r!r}")
        try:
            rebuilt_routing.append(routing_decision(r.get("data_class_id"), r.get("region"), r.get("rationale")))
        except InvariantViolation as error:
            raise InvariantViolation(f"DRA_INVALID_ROUTING_DECISIONS: routing_decisions[{i}]: {error}") from error

    class_id_set = set(class_ids)
    dangling = sorted({r["data_class_id"] for r in rebuilt_routing} - class_id_set)
    if dangling:
        raise InvariantViolation(f"DRA_DANGLING_DATA_CLASS_REF: routing_decisions[] reference data_class_id(s) {dangling} not present in data_classes[]")

    routed_ids = {r["data_class_id"] for r in rebuilt_routing}
    unrouted = sorted(class_id_set - routed_ids)
    if unrouted:
        raise InvariantViolation(
            f"DRA_UNROUTED_DATA_CLASS: data class(es) {unrouted} have zero routing decisions -- "
            "Atlas L943's own 'regions->routing' pipeline stage requires every declared data class to be routed"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "data_classes": rebuilt_classes,
        "routing_decisions": rebuilt_routing,
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


def evaluate_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives data_classes/routing_decisions shape, data-class-count minimum, and referential
    integrity directly from raw fields using the SAME ``_data_class_problem``/``_routing_problem``
    predicates the builder uses -- without this the gate could pass records the builder refuses.
    Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    data_classes = record.get("data_classes")
    class_id_set: set[Any] = set()
    if isinstance(data_classes, list):
        malformed_classes = [f"data_classes[{i}]: {problem}" for i, problem in ((i, _data_class_problem(c)) for i, c in enumerate(data_classes)) if problem]
        problems.extend(malformed_classes)
        well_shaped_classes = [c for c in data_classes if _data_class_problem(c) is None]
        class_ids = [c["data_class_id"] for c in well_shaped_classes]
        class_id_set = set(class_ids)
        if not malformed_classes and len(class_id_set) < 1:
            problems.append("fewer than 1 distinct data class")
        if len(class_ids) != len(class_id_set):
            problems.append(f"duplicate data_class_id in data_classes[]: {class_ids!r}")
    else:
        problems.append("data_classes must be a list")

    routing_decisions = record.get("routing_decisions")
    if isinstance(routing_decisions, list):
        malformed = [f"routing_decisions[{i}]: {problem}" for i, problem in ((i, _routing_problem(r)) for i, r in enumerate(routing_decisions)) if problem]
        problems.extend(malformed)
        well_shaped_routing = [r for r in routing_decisions if _routing_problem(r) is None]
        dangling = sorted({r["data_class_id"] for r in well_shaped_routing} - class_id_set, key=repr)
        if dangling:
            problems.append(f"dangling data_class_id ref(s) in routing_decisions[]: {dangling}")
    else:
        problems.append("routing_decisions must be a list")

    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_routing_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L943's own 'regions->routing' requirement directly from raw fields -- every
    declared data class has at least one routing decision. Fails closed on malformed entries rather
    than crashing, and does NOT assume referential integrity already passed (recomputes against
    well-shaped data classes/routing decisions only)."""
    if not isinstance(record, dict):
        return _result("routing_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    data_classes = record.get("data_classes")
    routing_decisions = record.get("routing_decisions")
    if not isinstance(data_classes, list) or not isinstance(routing_decisions, list):
        return _result("routing_completeness", False, [{"reason": "data_classes and routing_decisions must both be lists"}], validator, timestamp)

    well_shaped_classes = [c for c in data_classes if _data_class_problem(c) is None]
    class_ids = [c["data_class_id"] for c in well_shaped_classes]
    if len(set(class_ids)) < 1 or len(class_ids) != len(set(class_ids)):
        return _result("routing_completeness", False, [{"reason": "data_classes[] must be >= 1 distinct well-shaped entries to evaluate routing completeness"}], validator, timestamp)

    well_shaped_routing = [r for r in routing_decisions if _routing_problem(r) is None]
    class_id_set = set(class_ids)
    referentially_valid_routing = [r for r in well_shaped_routing if r["data_class_id"] in class_id_set]

    problems: list[str] = []
    if len(well_shaped_routing) != len(routing_decisions):
        problems.append("one or more routing_decisions[] entries are malformed")
    routed_ids = {r["data_class_id"] for r in referentially_valid_routing}
    unrouted = sorted(class_id_set - routed_ids)
    if unrouted:
        problems.append(f"unrouted data class(es): {unrouted}")
    passed = not problems
    return _result("routing_completeness", passed, [{"data_class_count": len(class_id_set), "routed_count": len(routed_ids), "problems": problems}], validator, timestamp)


def evaluate_data_residency_assessment_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
        evaluate_routing_completeness_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
