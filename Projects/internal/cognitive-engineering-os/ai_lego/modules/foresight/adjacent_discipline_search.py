"""``foresight.adjacent_discipline_search`` -- F13 unknown-unknowns/foresight family (Atlas L668-685, this
method's own row L677): "Adjacent Discipline Search | 從鄰近學科找 missing variables | current disciplines→adjacent
fields→models | 降低單一專業盲點" (search adjacent disciplines for missing variables; current disciplines ->
adjacent fields -> models; reduces the single-discipline blind spot). No dedicated §11/§12 section exists for
this row -- the table row itself is the sole citation (verified by reading the Atlas file directly).

Real invariant, made structural (both halves of Atlas's own literal purpose "降低單一專業盲點"):
  (a) ``adjacent_fields[]`` must be DISJOINT from ``current_disciplines[]`` (case/whitespace-insensitive
      normalized comparison) -- a field already in the team's current set is, by definition, not adjacent;
      listing it defeats the method's whole stated purpose of reducing the single-discipline blind spot.
  (b) every ``imported_models[].field_ref`` must resolve to a declared ``adjacent_fields[]`` entry (referential
      integrity, both directions checked the way ``epistemic.evidence_matrix``'s own claim/evidence links are) --
      an imported model attributed to a field never actually searched is a fabricated provenance chain.
  (c) at least one adjacent field is required -- a record with zero adjacent fields searched nothing.
Enforced at TWO independent layers (construction-time raise + independent gate re-derivation), the same
shared-predicate discipline ``epistemic.evidence_matrix``'s own ``_link_problem`` establishes: this module's
disjointness and referential-integrity checks are both re-derived directly from raw fields by the gates, not
merely trusted from the builder's own construction-time pass.

Grepped the full spec root case-insensitively for "adjacent discipline"/"adjacent field"/"missing variables"
before writing: only the F13 table row itself references this method by name; ``epistemic.assumption_registry``
and several other contracts use "adjacent" only as an unrelated English word (e.g. "adjacent nodes"), not as
this method's own concept -- no pre-existing implementation or duplicate schema found.
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "foresight.adjacent_discipline_search"
RECORD_ID_PREFIX = "ADJDISC-"
_MODEL_KEYS = frozenset({"id", "field_ref", "model_description"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize(value: str) -> str:
    """Case/whitespace-insensitive comparison key -- same helper role/shape every ``_normalize`` in this corpus
    already establishes (e.g. ``framing.problem_statement``, ``foresight.cross_industry_transfer``)."""
    return " ".join(value.strip().casefold().split())


def _is_nonempty_str_list(value: Any) -> bool:
    return isinstance(value, list) and len(value) >= 1 and all(_is_nonempty_str(v) for v in value)


def _model_problem(value: Any) -> str | None:
    """The single definition of "is this imported model well-shaped" -- both ``imported_model()`` (construction
    layer) and ``evaluate_referential_integrity_gate`` (independent re-derivation layer) consult it, so the two
    layers cannot drift apart (the ``epistemic.evidence_matrix``/``_link_problem`` shape). Does NOT check that
    ``field_ref`` actually resolves to a declared adjacent field -- that cross-field check happens once, against
    the full ``adjacent_fields[]`` list, same division of labor ``link()``'s own shape check vs.
    ``generate_evidence_matrix``'s own dangling-ref check already establish. Returns None when valid."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _MODEL_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _MODEL_KEYS <= value.keys():
        return f"missing key(s) {sorted(_MODEL_KEYS - value.keys(), key=repr)}"
    if not _is_nonempty_str(value.get("id")):
        return f"id must be a non-empty string, got {value.get('id')!r}"
    if not _is_nonempty_str(value.get("field_ref")):
        return f"field_ref must be a non-empty string, got {value.get('field_ref')!r}"
    if not _is_nonempty_str(value.get("model_description")):
        return f"model_description must be a non-empty string, got {value.get('model_description')!r}"
    return None


def imported_model(model_id: str, field_ref: str, model_description: str) -> dict[str, Any]:
    """One item of ``typed-objects/adjacent-discipline-search.schema.yaml#/properties/imported_models``. Does
    not itself check that ``field_ref`` resolves to a declared adjacent field -- that cross-field check happens
    once, in ``generate_adjacent_discipline_search``, after every model has been rebuilt."""
    record = {"id": model_id, "field_ref": field_ref, "model_description": model_description}
    problem = _model_problem(record)
    if problem is not None:
        raise InvariantViolation(f"ADJDISC_INVALID_MODEL: {problem}")
    return record


def generate_adjacent_discipline_search(
    record_id: str,
    current_disciplines: list[str],
    adjacent_fields: list[str],
    imported_models: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/adjacent-discipline-search.schema.yaml``.

    Rebuilds every ``imported_models[]`` item via ``imported_model()`` (never trusting the caller's raw dicts),
    deep-copies ``current_disciplines``/``adjacent_fields`` (fresh lists, not aliased to the caller's own), then
    enforces the method's real invariant fail-closed, in order: >=1 current discipline and >=1 adjacent field
    declared, ``adjacent_fields`` disjoint from ``current_disciplines`` (normalized), every
    ``imported_models[].field_ref`` resolves to a declared adjacent field -- BEFORE returning.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ADJDISC_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ADJDISC_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("ADJDISC_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    if not _is_nonempty_str_list(current_disciplines):
        raise InvariantViolation("ADJDISC_NO_CURRENT_DISCIPLINES: at least 1 current discipline is required -- Atlas L677's own literal 'current disciplines' first stage")
    if not _is_nonempty_str_list(adjacent_fields):
        raise InvariantViolation("ADJDISC_NO_ADJACENT_FIELDS: at least 1 adjacent field is required -- a record with zero adjacent fields searched nothing")

    current_normalized = {_normalize(d) for d in current_disciplines}
    adjacent_normalized = {_normalize(f) for f in adjacent_fields}
    overlap = sorted(current_normalized & adjacent_normalized)
    if overlap:
        raise InvariantViolation(
            f"ADJDISC_NOT_ADJACENT: adjacent_fields {overlap} already appear in current_disciplines (normalized) -- "
            "a field already in the team's current set is not adjacent, and listing it defeats Atlas L677's own '降低單一專業盲點' purpose"
        )

    if not isinstance(imported_models, list):
        raise InvariantViolation(f"ADJDISC_INVALID_MODELS: imported_models must be a list, got {type(imported_models).__name__}")
    rebuilt_models: list[dict[str, Any]] = []
    for i, m in enumerate(imported_models):
        if not isinstance(m, dict) or not _MODEL_KEYS <= m.keys():
            raise InvariantViolation(f"ADJDISC_INVALID_MODEL: imported_models[{i}] must be a {{{sorted(_MODEL_KEYS)}}} object, got {m!r}")
        rebuilt_models.append(imported_model(m["id"], m["field_ref"], m["model_description"]))

    dangling_field_refs = sorted({_normalize(m["field_ref"]) for m in rebuilt_models} - adjacent_normalized)
    if dangling_field_refs:
        raise InvariantViolation(f"ADJDISC_DANGLING_FIELD_REF: imported_models[] reference field_ref(s) {dangling_field_refs} not present in adjacent_fields[]")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "current_disciplines": copy.deepcopy(list(current_disciplines)),
        "adjacent_fields": copy.deepcopy(list(adjacent_fields)),
        "imported_models": rebuilt_models,
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


def evaluate_disjointness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant (a) directly from raw fields -- Atlas L677's own '降低單一專業盲點' purpose,
    mechanized. Fails closed on malformed entries rather than crashing. ``key=repr`` for the sorted overlap
    output: these sets legitimately mix non-string garbage with real strings on a hand-tampered record, and a
    bare ``sorted()`` raises ``TypeError`` on that mix -- a gate must fail closed on garbage, never crash."""
    if not isinstance(record, dict):
        return _result("disjointness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    current_disciplines = record.get("current_disciplines")
    adjacent_fields = record.get("adjacent_fields")
    if not isinstance(current_disciplines, list) or not current_disciplines:
        return _result("disjointness", False, [{"reason": "current_disciplines must be a non-empty list"}], validator, timestamp)
    if not isinstance(adjacent_fields, list) or not adjacent_fields:
        return _result("disjointness", False, [{"reason": "adjacent_fields must be a non-empty list"}], validator, timestamp)
    current_normalized = {_normalize(d) if isinstance(d, str) else repr(d) for d in current_disciplines}
    adjacent_normalized = {_normalize(f) if isinstance(f, str) else repr(f) for f in adjacent_fields}
    overlap = sorted(current_normalized & adjacent_normalized, key=repr)
    passed = not overlap
    return _result("disjointness", passed, [{"overlap": overlap}], validator, timestamp)


def evaluate_referential_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives invariant (b) directly from raw fields, re-checking each ``imported_models[]`` item's own
    shape via the SAME ``_model_problem`` predicate the builder uses (not just cross-field content) -- not just
    trusting that ``generate_adjacent_discipline_search``'s own construction-time check already ran. Fails
    closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("referential_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    adjacent_fields = record.get("adjacent_fields")
    imported_models = record.get("imported_models")
    problems: list[str] = []
    adjacent_normalized: set[str] = set()
    if isinstance(adjacent_fields, list):
        adjacent_normalized = {_normalize(f) if isinstance(f, str) else repr(f) for f in adjacent_fields}
    else:
        problems.append("adjacent_fields must be a list")
    if isinstance(imported_models, list):
        malformed = [f"imported_models[{i}]: {problem}" for i, problem in ((i, _model_problem(m)) for i, m in enumerate(imported_models)) if problem]
        problems.extend(malformed)
        well_shaped = [m for m in imported_models if _model_problem(m) is None]
        dangling = sorted({_normalize(m["field_ref"]) for m in well_shaped} - adjacent_normalized, key=repr)
        if dangling:
            problems.append(f"dangling field_ref(s): {dangling}")
    else:
        problems.append("imported_models must be a list")
    passed = not problems
    return _result("referential_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_adjacent_discipline_search_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_disjointness_gate(record, validator, timestamp),
        evaluate_referential_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
