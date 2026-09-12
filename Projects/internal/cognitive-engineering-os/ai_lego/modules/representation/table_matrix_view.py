"""``representation.table_matrix_view`` -- F24 Representation/Cognitive Preference/Collaboration family.
Atlas's own table row (L965, verbatim): "Table / Matrix View | 列欄比較資訊 | entities×criteria->filter/sort/
score | 高效率比較" (row/column comparison of information; entities x criteria -> filter/sort/score pipeline;
efficient comparison).

Real invariants, enforced at TWO independent layers, same belt-and-suspenders discipline every prior slice
in this corpus establishes:

1. **No content duplication (the shared F24 View law)** -- Atlas §9 Representation Contract (L1053). The
   schema holds ONLY id REFERENCES (`entities[]`/`criteria[]`) plus presentation state (`filters[]`/
   `sort_spec`/`score_config`) -- never the entities' or criteria's own content/values.
2. **Reference shape + referential integrity** (``TBLVIEW_NOT_A_REFERENCE`` /
   ``TBLVIEW_DANGLING_REFERENCE``) -- every id (`entities[]`, `criteria[]`, and every `filters[]`/
   `sort_spec`/`score_config.weights`/`scores[]` cross-reference) is reference-shaped (no whitespace) AND
   resolves to a declared `entities[]`/`criteria[]` entry.
3. **Computed-artifact labeling** (``TBLVIEW_SCORE_NOT_MARKED_COMPUTED``) -- Atlas's own benefit column
   ("高效率比較") names filter/sort/SCORE as View-level operations, not new facts about the entities. Every
   `scores[]` entry MUST carry `computed: true` (a literal boolean) -- silently treating a score as
   canonical, asserted data is refused, never defaulted.

Every ``scores[]`` entry is validated in three deliberately separate stages -- shape (``TBLVIEW_INVALID_
SCORE_ENTRY``), then reference resolution (``TBLVIEW_DANGLING_REFERENCE``), then the computed-flag check
above -- so a dangling `entity_id`/`criterion_id` or a malformed entry is never mislabeled as a missing
`computed: true` (a critic-found F15-class error-code conflation in this exact function, fixed 2026-09-12;
the two independent gates below already kept these concerns separate and were never affected).

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "table.?matrix.?view", "TBLVIEW",
and "representation\\." before writing any of this method's own files: zero pre-existing implementation
overlap. `specs/cognitive/representation.schema.yaml` (the pre-existing ABSTRACT View/state contract) and
`method-inventory.yaml`'s "Table / Matrix View" row (L1528-1532, `has_contract: false`) are the only
related hits -- both read in full, neither a collision.
"""

from __future__ import annotations

import copy
import re
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "representation.table_matrix_view"
RECORD_ID_PREFIX = "TBLVIEW-"
FILTER_VALUE_MAX_LENGTH = 100
_REFERENCE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:/-]*$")
_FILTER_REQUIRED_KEYS = frozenset({"criterion_id", "operator", "value"})
_SORT_SPEC_REQUIRED_KEYS = frozenset({"criterion_id", "direction"})
_SCORE_REQUIRED_KEYS = frozenset({"entity_id", "criterion_id", "score", "computed"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_reference_shaped(value: Any) -> bool:
    """Same grammar and reasoning as ``representation.text_outline_view``'s own ``_is_reference_shaped``:
    a bare id/URI-shaped string, no whitespace -- a cheap proxy that this is a POINTER, not copied content."""
    return isinstance(value, str) and bool(_REFERENCE_PATTERN.match(value))


def _is_real_number(value: Any) -> bool:
    """``bool`` excluded -- Python's ``bool`` is an ``int`` subclass, the same documented trap this corpus's
    ``epistemic.bayesian_updating``/``foresight.cross_impact_analysis`` already guard against."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_valid_filter_value(value: Any) -> bool:
    if isinstance(value, bool):
        return True
    if isinstance(value, str):
        return len(value) <= FILTER_VALUE_MAX_LENGTH
    if isinstance(value, (int, float)):
        return True
    return False


def _reference_list_problem(values: Any, field_name: str) -> str | None:
    """Shared shape check for ``entities``/``criteria``: a non-empty list of unique, reference-shaped
    strings. Consulted by both the builder and the reference_shape gate -- single shared predicate."""
    if not isinstance(values, list) or not values:
        return f"{field_name} must be a non-empty list, got {values!r}"
    if not all(_is_reference_shaped(v) for v in values):
        return f"{field_name} entries must all be reference-shaped strings (no whitespace), got {values!r}"
    if len(values) != len(set(values)):
        return f"{field_name} must not contain duplicate ids: {values!r}"
    return None


def _filter_problem(value: Any, criterion_ids: frozenset[str]) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    keys = set(value.keys())
    if keys != _FILTER_REQUIRED_KEYS:
        return f"filter must have exactly keys {sorted(_FILTER_REQUIRED_KEYS)}, got {sorted(keys)}"
    if value.get("criterion_id") not in criterion_ids:
        return f"criterion_id {value.get('criterion_id')!r} does not resolve to a declared criteria[] entry"
    if not _is_nonempty_str(value.get("operator")) or len(value["operator"]) > 32:
        return f"operator must be a non-empty string of at most 32 characters, got {value.get('operator')!r}"
    if not _is_valid_filter_value(value.get("value")):
        return f"value must be a string (<= {FILTER_VALUE_MAX_LENGTH} chars), a number, or a boolean, got {value.get('value')!r}"
    return None


def _sort_spec_problem(value: Any, criterion_ids: frozenset[str]) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    keys = set(value.keys())
    if keys != _SORT_SPEC_REQUIRED_KEYS:
        return f"sort_spec must have exactly keys {sorted(_SORT_SPEC_REQUIRED_KEYS)}, got {sorted(keys)}"
    if value.get("criterion_id") not in criterion_ids:
        return f"criterion_id {value.get('criterion_id')!r} does not resolve to a declared criteria[] entry"
    if value.get("direction") not in {"asc", "desc"}:
        return f"direction must be 'asc' or 'desc', got {value.get('direction')!r}"
    return None


def _score_config_problem(value: Any, criterion_ids: frozenset[str]) -> str | None:
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - {"method", "weights"}
    if unknown:
        return f"unknown key(s) {sorted(unknown)}"
    if "method" in value and (not _is_nonempty_str(value["method"]) or len(value["method"]) > 64):
        return f"method must be a non-empty string of at most 64 characters, got {value.get('method')!r}"
    if "weights" in value:
        weights = value["weights"]
        if not isinstance(weights, dict):
            return f"weights must be a dict, got {weights!r}"
        for key, weight in weights.items():
            if key not in criterion_ids:
                return f"weights key {key!r} does not resolve to a declared criteria[] entry"
            if not _is_real_number(weight):
                return f"weights[{key!r}] must be a real number, got {weight!r}"
    return None


def _score_shape_problem(value: Any) -> str | None:
    """Shape-only half of a scores[] entry (keys + score type) -- deliberately split from the reference and
    computed-flag halves below so each failure class gets its own accurate error code, instead of the single
    conflated TBLVIEW_SCORE_NOT_MARKED_COMPUTED this corpus's critic found mislabeling dangling-reference and
    shape failures alike (F15-class error-code conflation, 2026-09-12). Mirrors this module's own
    ``_filter_problem``/``_sort_spec_problem``/``_score_config_problem`` convention, which already keep shape
    problems separate from unrelated checks."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    keys = set(value.keys())
    if keys != _SCORE_REQUIRED_KEYS:
        return f"score entry must have exactly keys {sorted(_SCORE_REQUIRED_KEYS)}, got {sorted(keys)}"
    if not _is_real_number(value.get("score")):
        return f"score must be a real number, got {value.get('score')!r}"
    return None


def _score_reference_problem(value: dict[str, Any], entity_ids: frozenset[str], criterion_ids: frozenset[str]) -> str | None:
    """Referential-integrity half of a scores[] entry -- only called after ``_score_shape_problem`` has
    already returned ``None``, so ``value`` is known well-shaped."""
    if value.get("entity_id") not in entity_ids:
        return f"entity_id {value.get('entity_id')!r} does not resolve to a declared entities[] entry"
    if value.get("criterion_id") not in criterion_ids:
        return f"criterion_id {value.get('criterion_id')!r} does not resolve to a declared criteria[] entry"
    return None


def _score_computed_problem(value: dict[str, Any]) -> str | None:
    """Computed-artifact-labeling half of a scores[] entry -- only called after the shape and reference
    halves above have already returned ``None``, so ``value`` is known well-shaped and referentially sound."""
    if value.get("computed") is not True:
        return f"computed must be literal True -- a score is always a view-level computed presentation artifact, never asserted canonical data (got {value.get('computed')!r})"
    return None


def generate_table_matrix_view(
    record_id: str,
    source_knowledge_object_id: str,
    entities: list[str],
    criteria: list[str],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    filters: list[dict[str, Any]] | None = None,
    sort_spec: dict[str, Any] | None = None,
    score_config: dict[str, Any] | None = None,
    scores: list[dict[str, Any]] | None = None,
    layout: dict[str, Any] | None = None,
    visible_fields: list[str] | None = None,
    presentation_preferences: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/table-matrix-view-record.schema.yaml``.

    Enforces the method contract's own real invariants fail-closed, in order: id/version/provenance shape,
    `source_knowledge_object_id` reference-shape, `entities[]`/`criteria[]` shape (reference-shaped, unique,
    non-empty), then EVERY `filters[]`/`sort_spec`/`score_config`/`scores[]` entry against the now-known
    entity/criterion id sets -- BEFORE returning. Deep-copies every nested mutable field at the return
    statement.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"TBLVIEW_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"TBLVIEW_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("TBLVIEW_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not _is_reference_shaped(source_knowledge_object_id):
        raise InvariantViolation(f"TBLVIEW_NOT_A_REFERENCE: source_knowledge_object_id must be a reference-shaped string (no whitespace), got {source_knowledge_object_id!r}")

    entities_problem = _reference_list_problem(entities, "entities")
    if entities_problem is not None:
        raise InvariantViolation(f"TBLVIEW_INVALID_ENTITIES: {entities_problem}")
    criteria_problem = _reference_list_problem(criteria, "criteria")
    if criteria_problem is not None:
        raise InvariantViolation(f"TBLVIEW_INVALID_CRITERIA: {criteria_problem}")

    entity_ids = frozenset(entities)
    criterion_ids = frozenset(criteria)

    rebuilt_filters: list[dict[str, Any]] = []
    for i, entry in enumerate(filters or []):
        problem = _filter_problem(entry, criterion_ids)
        if problem is not None:
            raise InvariantViolation(f"TBLVIEW_DANGLING_REFERENCE: filters[{i}]: {problem}")
        rebuilt_filters.append(dict(entry))

    rebuilt_sort_spec = None
    if sort_spec is not None:
        problem = _sort_spec_problem(sort_spec, criterion_ids)
        if problem is not None:
            raise InvariantViolation(f"TBLVIEW_DANGLING_REFERENCE: sort_spec: {problem}")
        rebuilt_sort_spec = dict(sort_spec)

    rebuilt_score_config = None
    if score_config is not None:
        problem = _score_config_problem(score_config, criterion_ids)
        if problem is not None:
            raise InvariantViolation(f"TBLVIEW_DANGLING_REFERENCE: score_config: {problem}")
        rebuilt_score_config = copy.deepcopy(score_config)

    rebuilt_scores: list[dict[str, Any]] = []
    for i, entry in enumerate(scores or []):
        shape_problem = _score_shape_problem(entry)
        if shape_problem is not None:
            raise InvariantViolation(f"TBLVIEW_INVALID_SCORE_ENTRY: scores[{i}]: {shape_problem}")
        reference_problem = _score_reference_problem(entry, entity_ids, criterion_ids)
        if reference_problem is not None:
            raise InvariantViolation(f"TBLVIEW_DANGLING_REFERENCE: scores[{i}]: {reference_problem}")
        computed_problem = _score_computed_problem(entry)
        if computed_problem is not None:
            raise InvariantViolation(f"TBLVIEW_SCORE_NOT_MARKED_COMPUTED: scores[{i}]: {computed_problem}")
        rebuilt_scores.append(dict(entry))

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "source_knowledge_object_id": source_knowledge_object_id,
        "entities": list(entities),
        "criteria": list(criteria),
        "provenance": copy.deepcopy(provenance),
    }
    if filters is not None:
        record["filters"] = rebuilt_filters
    if rebuilt_sort_spec is not None:
        record["sort_spec"] = rebuilt_sort_spec
    if rebuilt_score_config is not None:
        record["score_config"] = rebuilt_score_config
    if scores is not None:
        record["scores"] = rebuilt_scores
    if layout is not None:
        record["layout"] = copy.deepcopy(layout)
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
    """Re-derives Atlas §9's own 'no content duplication' law AND referential integrity directly from raw
    fields -- does NOT call ``generate_table_matrix_view`` or trust the builder already ran. Fails closed on
    malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("reference_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    problems: list[str] = []

    if not _is_reference_shaped(record.get("source_knowledge_object_id")):
        problems.append(f"source_knowledge_object_id is not reference-shaped: {record.get('source_knowledge_object_id')!r}")

    entities = record.get("entities")
    entities_problem = _reference_list_problem(entities, "entities")
    if entities_problem is not None:
        problems.append(entities_problem)
    entity_ids = frozenset(entities) if isinstance(entities, list) else frozenset()

    criteria = record.get("criteria")
    criteria_problem = _reference_list_problem(criteria, "criteria")
    if criteria_problem is not None:
        problems.append(criteria_problem)
    criterion_ids = frozenset(criteria) if isinstance(criteria, list) else frozenset()

    for i, entry in enumerate(record.get("filters") or []):
        problem = _filter_problem(entry, criterion_ids)
        if problem is not None:
            problems.append(f"filters[{i}]: {problem}")

    sort_spec = record.get("sort_spec")
    if sort_spec is not None:
        problem = _sort_spec_problem(sort_spec, criterion_ids)
        if problem is not None:
            problems.append(f"sort_spec: {problem}")

    score_config = record.get("score_config")
    if score_config is not None:
        problem = _score_config_problem(score_config, criterion_ids)
        if problem is not None:
            problems.append(f"score_config: {problem}")

    for i, entry in enumerate(record.get("scores") or []):
        if not isinstance(entry, dict):
            problems.append(f"scores[{i}]: not a dict: {entry!r}")
            continue
        if entry.get("entity_id") not in entity_ids:
            problems.append(f"scores[{i}]: entity_id {entry.get('entity_id')!r} does not resolve to entities[]")
        if entry.get("criterion_id") not in criterion_ids:
            problems.append(f"scores[{i}]: criterion_id {entry.get('criterion_id')!r} does not resolve to criteria[]")

    passed = not problems
    return _result("reference_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_score_computed_flag_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the computed-artifact labeling invariant directly from raw fields -- every scores[] entry
    must carry `computed: true` as a literal boolean. Does NOT trust the builder already enforced it."""
    if not isinstance(record, dict):
        return _result("score_computed_flag", False, [{"reason": "record is not a dict"}], validator, timestamp)
    scores = record.get("scores")
    if scores is None:
        return _result("score_computed_flag", True, [{"reason": "no scores[] present -- vacuously satisfied"}], validator, timestamp)
    if not isinstance(scores, list):
        return _result("score_computed_flag", False, [{"reason": "scores must be a list"}], validator, timestamp)
    problems = [f"scores[{i}]: computed must be literal True, got {entry.get('computed')!r}" for i, entry in enumerate(scores) if not isinstance(entry, dict) or entry.get("computed") is not True]
    passed = not problems
    return _result("score_computed_flag", passed, [{"score_count": len(scores), "problems": problems}], validator, timestamp)


def evaluate_table_matrix_view_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_reference_integrity_gate(record, validator, timestamp),
        evaluate_score_computed_flag_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
