"""``systems.iceberg_model`` -- F09 systems-thinking family (Atlas L541-559).

Atlas's own table row (L547, verbatim): "Iceberg Model | Event->Pattern->
Structure->Mental Model | 由事件往下挖深層結構 | 避免只修表面" (dig down from
the event to the deep structure; avoid only fixing the surface).

Real invariant (structural top-down completeness), enforced at TWO
independent layers, same belt-and-suspenders discipline every prior slice
in this corpus establishes: a deeper level may only be non-empty if every
shallower level already is. `structures[]` requires `patterns[]` non-empty;
`mental_models[]` requires `structures[]` non-empty. `patterns[]` requiring
`events[]` non-empty needs no separate check -- `events[]` is already
required non-empty by both the method contract's own precondition and this
module's own construction-time check below. A run that jumps straight to
"the deep structure is X" while never naming a pattern has not actually dug
down level by level; it has asserted a conclusion Atlas's own method never
licenses.

Grepped `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS` and
`Projects/internal/cognitive-engineering-os` case-insensitively for
"iceberg"/"behavior over time"/"behavior-over-time" and every schema title,
before writing any of this method's own files: zero pre-existing
implementation or schema title overlap.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "systems.iceberg_model"
RECORD_ID_PREFIX = "ICEBERG-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _validate_level(name: str, level: Any) -> list[str]:
    """Rebuilds ``level`` into a fresh list of non-empty strings, or raises. ``None`` is treated as "level not
    supplied" (the empty list), matching the schema's own ``default: []`` for every level but ``events``."""
    if level is None:
        return []
    if not isinstance(level, list):
        raise InvariantViolation(f"ICE_INVALID_LEVEL: {name} must be a list, got {type(level).__name__}")
    rebuilt: list[str] = []
    for i, item in enumerate(level):
        if not _is_nonempty_str(item):
            raise InvariantViolation(f"ICE_INVALID_LEVEL_ITEM: {name}[{i}] must be a non-empty string statement, got {item!r}")
        rebuilt.append(item)
    return rebuilt


def generate_iceberg_model_analysis(
    record_id: str,
    events: list[str],
    provenance: dict[str, Any],
    *,
    patterns: list[str] | None = None,
    structures: list[str] | None = None,
    mental_models: list[str] | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/iceberg-model-analysis.schema.yaml``.

    Enforces the method contract's own precondition (at least one event)
    and Atlas L547's own top-down dig order (a deeper level may only be
    populated once every shallower level already is) fail-closed, before
    returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"ICE_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"ICE_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("ICE_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    events_list = _validate_level("events", events)
    if not events_list:
        raise InvariantViolation("ICE_NO_EVENTS: at least one event-level statement is required (methods/contracts/systems.iceberg_model.contract.yaml precondition)")
    patterns_list = _validate_level("patterns", patterns)
    structures_list = _validate_level("structures", structures)
    mental_models_list = _validate_level("mental_models", mental_models)

    if structures_list and not patterns_list:
        raise InvariantViolation(
            "ICE_STRUCTURE_WITHOUT_PATTERN: structures is populated while patterns is empty -- Atlas L547's own "
            "top-down dig order (Event->Pattern->Structure->Mental Model) forbids skipping a shallower level"
        )
    if mental_models_list and not structures_list:
        raise InvariantViolation(
            "ICE_MENTAL_MODEL_WITHOUT_STRUCTURE: mental_models is populated while structures is empty -- same "
            "top-down dig order rule"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "events": events_list,
        "patterns": patterns_list,
        "structures": structures_list,
        "mental_models": mental_models_list,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record carries a schema-valid provenance_record."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_top_down_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L547's own top-down dig order directly from the raw record -- not just trusting that
    ``generate_iceberg_model_analysis``'s own construction-time check already ran (a hand-crafted/tampered
    record must still be caught, same discipline every prior slice's gate-re-derivation already established)."""
    if not isinstance(record, dict):
        return _result("top_down_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    events = record.get("events")
    patterns = record.get("patterns")
    structures = record.get("structures")
    mental_models = record.get("mental_models")
    problems: list[str] = []
    if not isinstance(events, list) or not events:
        problems.append("events must be a non-empty list")
    if isinstance(structures, list) and structures and not (isinstance(patterns, list) and patterns):
        problems.append("structures is populated while patterns is empty")
    if isinstance(mental_models, list) and mental_models and not (isinstance(structures, list) and structures):
        problems.append("mental_models is populated while structures is empty")
    passed = not problems
    return _result("top_down_completeness", passed, [{"problems": problems}], validator, timestamp)


def evaluate_iceberg_model_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_top_down_completeness_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
