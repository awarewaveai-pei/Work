"""``epistemic.ladder_of_inference`` -- F10 epistemic-quality family (Atlas L566-600).

Atlas's own table row (L572, verbatim): "Ladder of Inference | 追 data→
meaning→assumption→conclusion | 把每一步顯式化 | 找認知跳躍" (climb from data
to meaning to assumption to conclusion; make every step explicit; find the
cognitive leap).

Real invariant (structural ascending completeness), enforced at TWO
independent layers, same belt-and-suspenders discipline every prior slice in
this corpus establishes: a higher rung may only be non-empty if every lower
rung already is. `assumptions_made[]` requires `meanings_assigned[]`
non-empty; `conclusions_drawn[]` requires `assumptions_made[]` non-empty.
`meanings_assigned[]` requiring `observed_data[]` non-empty needs no separate
check -- `observed_data[]` is already required non-empty by both the method
contract's own precondition and this module's own construction-time check
below (same reasoning `systems.iceberg_model`'s own `events[]`->`patterns[]`
base case already establishes for the structurally identical descending
shape). A conclusion recorded with no assumption or meaning rung beneath it
IS the cognitive leap this method exists to expose (Atlas's own "找認知
跳躍"), so it is refused, not silently stored.

Grepped `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS` and
`Projects/internal/cognitive-engineering-os` case-insensitively for "ladder
of inference"/"ladder_of_inference" and every schema title, before writing
any of this method's own files: zero pre-existing implementation or schema
title overlap.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "epistemic.ladder_of_inference"
RECORD_ID_PREFIX = "LADDER-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _validate_rung(name: str, rung: Any) -> list[str]:
    """Rebuilds ``rung`` into a fresh list of non-empty strings, or raises. ``None`` is treated as "rung not
    supplied" (the empty list), matching the schema's own ``default: []`` for every rung but ``observed_data``.
    Rebuilding into a NEW list (not aliasing the caller's own list object) avoids the nested-list-aliasing defect a
    critic pass found in this corpus's F09 batch (``systems.causal_loop_diagram``/``systems_archetypes``/
    ``rich_picture``'s builders) -- see WORKLOG 2026-09-12 F09 entry."""
    if rung is None:
        return []
    if not isinstance(rung, list):
        raise InvariantViolation(f"LADDER_INVALID_RUNG: {name} must be a list, got {type(rung).__name__}")
    rebuilt: list[str] = []
    for i, item in enumerate(rung):
        if not _is_nonempty_str(item):
            raise InvariantViolation(f"LADDER_INVALID_RUNG_ITEM: {name}[{i}] must be a non-empty string statement, got {item!r}")
        rebuilt.append(item)
    return rebuilt


def generate_ladder_of_inference_analysis(
    record_id: str,
    observed_data: list[str],
    provenance: dict[str, Any],
    *,
    meanings_assigned: list[str] | None = None,
    assumptions_made: list[str] | None = None,
    conclusions_drawn: list[str] | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/ladder-of-inference-analysis.schema.yaml``.

    Enforces the method contract's own precondition (at least one observed
    datum) and Atlas L572's own ascending climb order (a higher rung may
    only be populated once every lower rung already is) fail-closed, before
    returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"LADDER_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"LADDER_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("LADDER_INVALID_PROVENANCE: provenance must be a valid provenance_record")

    observed_data_list = _validate_rung("observed_data", observed_data)
    if not observed_data_list:
        raise InvariantViolation("LADDER_NO_OBSERVED_DATA: at least one observed_data statement is required (methods/contracts/epistemic.ladder_of_inference.contract.yaml precondition)")
    meanings_list = _validate_rung("meanings_assigned", meanings_assigned)
    assumptions_list = _validate_rung("assumptions_made", assumptions_made)
    conclusions_list = _validate_rung("conclusions_drawn", conclusions_drawn)

    if assumptions_list and not meanings_list:
        raise InvariantViolation(
            "LADDER_ASSUMPTION_WITHOUT_MEANING: assumptions_made is populated while meanings_assigned is empty -- "
            "Atlas L572's own ascending climb order (data->meaning->assumption->conclusion) forbids skipping a lower rung"
        )
    if conclusions_list and not assumptions_list:
        raise InvariantViolation(
            "LADDER_CONCLUSION_WITHOUT_ASSUMPTION: conclusions_drawn is populated while assumptions_made is empty -- "
            "same ascending climb order rule; this is exactly the cognitive leap Atlas L572 names (找認知跳躍)"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "observed_data": observed_data_list,
        "meanings_assigned": meanings_list,
        "assumptions_made": assumptions_list,
        "conclusions_drawn": conclusions_list,
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


def evaluate_ascending_completeness_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives Atlas L572's own ascending climb order directly from the raw record -- not just trusting that
    ``generate_ladder_of_inference_analysis``'s own construction-time check already ran (a hand-crafted/tampered
    record must still be caught, same discipline every prior slice's gate-re-derivation already established)."""
    if not isinstance(record, dict):
        return _result("ascending_completeness", False, [{"reason": "record is not a dict"}], validator, timestamp)
    observed_data = record.get("observed_data")
    meanings_assigned = record.get("meanings_assigned")
    assumptions_made = record.get("assumptions_made")
    conclusions_drawn = record.get("conclusions_drawn")
    problems: list[str] = []
    record_id = record.get("id")
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        problems.append(f"id must be a string starting with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(record.get("version"), str):
        problems.append(f"version must be a string, got {record.get('version')!r}")
    if not isinstance(observed_data, list) or not observed_data:
        problems.append("observed_data must be a non-empty list")
    if isinstance(assumptions_made, list) and assumptions_made and not (isinstance(meanings_assigned, list) and meanings_assigned):
        problems.append("assumptions_made is populated while meanings_assigned is empty")
    if isinstance(conclusions_drawn, list) and conclusions_drawn and not (isinstance(assumptions_made, list) and assumptions_made):
        problems.append("conclusions_drawn is populated while assumptions_made is empty")
    passed = not problems
    return _result("ascending_completeness", passed, [{"problems": problems}], validator, timestamp)


def evaluate_ladder_of_inference_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_ascending_completeness_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
