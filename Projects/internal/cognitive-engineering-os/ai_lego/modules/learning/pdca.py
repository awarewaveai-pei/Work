"""``learning.pdca`` -- F17 learning family, 4th member (after reversal_criteria/kill_criteria/decision_journal).
Atlas F17 L801: "PDCA | 持續改善 | Plan→Do→Check→Act | 穩定流程長期改進", §12.34 L2989-2999 loop formula.
Not a duplicate of OODA (L3011: process stability vs decision tempo).
Due diligence: grepped ai_lego/ + Atlas doc root for an existing cyclic-loop method -- none found;
contract-backlog.yaml L1975 lists PDCA as unbuilt.

Invariants (construction + independent gate, fail-closed):
1. PDCA_STAGE_ORDER_VIOLATED -- each cycle's stages[] is an ordered prefix of PLAN,DO,CHECK,ACT (fixed
   STAGE_ORDER constant, not per-record like event_tree's barriers[]). PDCA_INVALID_CYCLES -- cycle_number
   sequential 1..N, no gaps/duplicates/reordering. PDCA_DUPLICATE_ACTION_ITEM_ID -- ids unique within one
   ACT stage's action_items.
2. PDCA_LEARNING_CONTINUITY_VIOLATED -- cycle 1 PLAN.carried_forward_action_item_ids is null; cycle N>1
   requires cycle N-1 to have reached ACT with >=1 action_items, and every carried-forward id must resolve
   to one of cycle N-1's own ACT.action_items[].id.

Gate style: isinstance-first / safe-``.get()``, per ``root_cause.fault_tree``.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "learning.pdca"
RECORD_ID_PREFIX = "PDCA-"
ACTION_ITEM_ID_PREFIX = "ACTION-"
STAGE_ORDER = ("PLAN", "DO", "CHECK", "ACT")

_KNOWN_ACTION_ITEM_KEYS = frozenset({"id", "description"})
_KNOWN_PLAN_KEYS = frozenset({"stage_name", "description", "provenance", "carried_forward_action_item_ids"})
_KNOWN_DO_CHECK_KEYS = frozenset({"stage_name", "description", "provenance"})
_KNOWN_ACT_KEYS = frozenset({"stage_name", "description", "provenance", "action_items"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a recursive ``repr()`` (fault_tree.py pattern)."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _action_item_shape_is_valid(item: Any) -> bool:
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_ACTION_ITEM_KEYS:
        return False
    return _is_nonempty_str(item["id"]) and item["id"].startswith(ACTION_ITEM_ID_PREFIX) and _is_nonempty_str(item["description"])


def _stage_is_valid(stage: Any, expected_name: str) -> bool:
    """Shape AND position-type in one check -- PDCA's 4 stage types are heterogeneous (different required
    keys), so "well-shaped at position i" already means "stage_name == STAGE_ORDER[i]"; unlike event_tree's
    homogeneous path steps, order and shape are not separable checks here."""
    if not isinstance(stage, dict) or stage.get("stage_name") != expected_name:
        return False
    if not _is_nonempty_str(stage.get("description")) or not isinstance(stage.get("provenance"), dict):
        return False
    if expected_name == "PLAN":
        if set(stage.keys()) != _KNOWN_PLAN_KEYS:
            return False
        cf = stage["carried_forward_action_item_ids"]
        if cf is None:
            return True
        return isinstance(cf, list) and bool(cf) and all(_is_nonempty_str(i) and i.startswith(ACTION_ITEM_ID_PREFIX) for i in cf)
    if expected_name in ("DO", "CHECK"):
        return set(stage.keys()) == _KNOWN_DO_CHECK_KEYS
    # ACT
    if set(stage.keys()) != _KNOWN_ACT_KEYS:
        return False
    items = stage["action_items"]
    return isinstance(items, list) and bool(items) and all(_action_item_shape_is_valid(i) for i in items)


def _stage_order_violations(cycles: list[dict[str, Any]]) -> list[str]:
    """Invariant #1 (order half). Precondition: every cycle already passed ``_cycle_basic_shape_is_valid``."""
    violations: list[str] = []
    for c in cycles:
        for i, stage in enumerate(c["stages"]):
            if not _stage_is_valid(stage, STAGE_ORDER[i]):
                violations.append(f"cycle {c.get('cycle_number')} stages[{i}] is not a well-shaped {STAGE_ORDER[i]} stage")
    return violations


def _duplicate_action_item_violations(cycles: list[dict[str, Any]]) -> list[str]:
    """Precondition: stage order already valid (so any 4-stage cycle's stages[3] is a real ACT dict)."""
    violations: list[str] = []
    for c in cycles:
        stages = c["stages"]
        if len(stages) == 4:
            ids = [a["id"] for a in stages[3]["action_items"]]
            if len(set(ids)) != len(ids):
                dup = sorted({i for i in ids if ids.count(i) > 1})
                violations.append(f"cycle {c.get('cycle_number')} ACT.action_items has duplicate id(s) {dup}")
    return violations


def _cycle_basic_shape_is_valid(cyc: Any) -> bool:
    """cycle_number type/range + stages container shape only -- NOT stage order (separate check, separate code)."""
    if not isinstance(cyc, dict) or set(cyc.keys()) != {"cycle_number", "stages"}:
        return False
    cn = cyc["cycle_number"]
    if not isinstance(cn, int) or isinstance(cn, bool) or cn < 1:
        return False
    stages = cyc["stages"]
    return isinstance(stages, list) and bool(stages) and len(stages) <= len(STAGE_ORDER)


def _cycles_numbering_is_valid(cycles: list[dict[str, Any]]) -> bool:
    return [c["cycle_number"] for c in cycles] == list(range(1, len(cycles) + 1))


def _learning_continuity_violations(cycles: list[dict[str, Any]]) -> list[str]:
    """Invariant #2. Precondition: basic shape + numbering + stage order already valid (so
    cycles[i]["stages"][0] is always a real PLAN dict, and a 4-stage cycle's stages[3] is a real ACT dict)."""
    violations: list[str] = []
    first_plan = cycles[0]["stages"][0]
    if first_plan["carried_forward_action_item_ids"] is not None:
        violations.append("cycle 1 PLAN.carried_forward_action_item_ids must be null (nothing precedes cycle 1)")
    for i in range(1, len(cycles)):
        this_cycle_number = cycles[i]["cycle_number"]
        prev_cycle_number = cycles[i - 1]["cycle_number"]
        prev_stages = cycles[i - 1]["stages"]
        this_plan = cycles[i]["stages"][0]
        cf = this_plan["carried_forward_action_item_ids"]
        if len(prev_stages) < 4:
            violations.append(f"cycle {this_cycle_number} PLAN exists but cycle {prev_cycle_number} never reached ACT -- cannot carry learnings forward")
            continue
        if not cf:
            violations.append(f"cycle {this_cycle_number} PLAN.carried_forward_action_item_ids must be non-null (cycle {prev_cycle_number} ACT produced action_items)")
            continue
        prev_action_ids = {a["id"] for a in prev_stages[3]["action_items"]}
        unresolved = [aid for aid in cf if aid not in prev_action_ids]
        if unresolved:
            violations.append(f"cycle {this_cycle_number} PLAN carries forward unknown id(s) {unresolved}, not in cycle {prev_cycle_number} ACT.action_items")
    return violations


# --------------------------------------------------------------------------
# Convenience constructors -- eager non-empty/prefix validation, same discipline decision_journal's
# option()/evidence_item() use. NOT the invariant boundary: generate_pdca_record validates whatever dict
# it is handed regardless of how it was built.
# --------------------------------------------------------------------------


def action_item(item_id: str, description: str) -> dict[str, Any]:
    if not _is_nonempty_str(item_id) or not item_id.startswith(ACTION_ITEM_ID_PREFIX):
        raise InvariantViolation(f"PDCA_INVALID_ACTION_ITEM_ID: id must be a non-empty string beginning with {ACTION_ITEM_ID_PREFIX!r}, got {item_id!r}")
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"PDCA_EMPTY_ACTION_ITEM_DESCRIPTION: action_item {item_id!r} has empty description")
    return {"id": item_id, "description": description}


def stage_plan(description: str, provenance: dict[str, Any], *, carried_forward_action_item_ids: list[str] | None = None) -> dict[str, Any]:
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"PDCA_EMPTY_STAGE_DESCRIPTION: PLAN stage description must be non-empty, got {description!r}")
    return {"stage_name": "PLAN", "description": description, "provenance": provenance, "carried_forward_action_item_ids": carried_forward_action_item_ids}


def stage_do(description: str, provenance: dict[str, Any]) -> dict[str, Any]:
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"PDCA_EMPTY_STAGE_DESCRIPTION: DO stage description must be non-empty, got {description!r}")
    return {"stage_name": "DO", "description": description, "provenance": provenance}


def stage_check(description: str, provenance: dict[str, Any]) -> dict[str, Any]:
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"PDCA_EMPTY_STAGE_DESCRIPTION: CHECK stage description must be non-empty, got {description!r}")
    return {"stage_name": "CHECK", "description": description, "provenance": provenance}


def stage_act(description: str, provenance: dict[str, Any], action_items: list[dict[str, Any]]) -> dict[str, Any]:
    if not _is_nonempty_str(description):
        raise InvariantViolation(f"PDCA_EMPTY_STAGE_DESCRIPTION: ACT stage description must be non-empty, got {description!r}")
    return {"stage_name": "ACT", "description": description, "provenance": provenance, "action_items": list(action_items)}


def cycle(cycle_number: int, stages: list[dict[str, Any]]) -> dict[str, Any]:
    return {"cycle_number": cycle_number, "stages": list(stages)}


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_pdca_record(
    record_id: str,
    process_under_improvement: str,
    cycles: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/pdca-cycle-record.schema.yaml``. Enforces fail-closed, in order: field
    shape -> cycle shape+numbering -> stage order (invariant #1) -> duplicate action_item ids ->
    learning continuity (invariant #2). REBUILDS every nested list/dict it owns."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"PDCA_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(process_under_improvement):
        raise InvariantViolation(f"PDCA_EMPTY_RECORD_FIELD: process_under_improvement must be a non-empty string, got {process_under_improvement!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"PDCA_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"PDCA_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(cycles, list) or not cycles or not all(_cycle_basic_shape_is_valid(c) for c in cycles):
        raise InvariantViolation(
            f"PDCA_INVALID_CYCLES: cycles must be a non-empty list of well-shaped entries "
            f"(cycle_number a positive int, stages 1-{len(STAGE_ORDER)} entries), got {_shallow_describe(cycles)}"
        )
    if not _cycles_numbering_is_valid(cycles):
        raise InvariantViolation(f"PDCA_INVALID_CYCLES: cycle_number sequence must be exactly 1..{len(cycles)} with no gaps/duplicates/reordering, got {[c['cycle_number'] for c in cycles]}")

    order_violations = _stage_order_violations(cycles)
    if order_violations:
        raise InvariantViolation(f"PDCA_STAGE_ORDER_VIOLATED: {'; '.join(order_violations)}")

    dup_violations = _duplicate_action_item_violations(cycles)
    if dup_violations:
        raise InvariantViolation(f"PDCA_DUPLICATE_ACTION_ITEM_ID: {'; '.join(dup_violations)}")

    continuity_violations = _learning_continuity_violations(cycles)
    if continuity_violations:
        raise InvariantViolation(f"PDCA_LEARNING_CONTINUITY_VIOLATED: {'; '.join(continuity_violations)}")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "process_under_improvement": process_under_improvement,
        "cycles": [{"cycle_number": c["cycle_number"], "stages": [dict(s) for s in c["stages"]]} for c in cycles],
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Bonus helpers -- real compute over an ALREADY-VALID record, not one of the declared structural
# invariants (same scope split fault_tree.evaluate_top_event / event_tree.outcome_probability use).
# --------------------------------------------------------------------------


def is_cycle_complete(cyc: dict[str, Any]) -> bool:
    """True iff this cycle's own stages[] reached ACT (all 4 stages present)."""
    return len(cyc["stages"]) == len(STAGE_ORDER)


def resolve_carried_forward_action_items(record: dict[str, Any], cycle_number: int) -> list[dict[str, Any]] | None:
    """Resolves cycle ``cycle_number``'s PLAN.carried_forward_action_item_ids against cycle
    (cycle_number - 1)'s ACT.action_items, returning the full action_item dicts (not just ids). None for
    cycle 1 or an unknown cycle_number."""
    cycles_by_number = {c["cycle_number"]: c for c in record["cycles"]}
    if cycle_number == 1 or cycle_number not in cycles_by_number:
        return None
    plan = cycles_by_number[cycle_number]["stages"][0]
    cf_ids = plan.get("carried_forward_action_item_ids") or []
    prev_cycle = cycles_by_number.get(cycle_number - 1)
    if prev_cycle is None or len(prev_cycle["stages"]) < 4:
        return None
    by_id = {a["id"]: a for a in prev_cycle["stages"][3]["action_items"]}
    return [by_id[i] for i in cf_ids if i in by_id]


# --------------------------------------------------------------------------
# Gates -- independently re-derive both invariants from raw fields, fail-closed on malformed input.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- record's own provenance + every stage's own provenance."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    overall_valid = provenance_is_valid(record.get("provenance"))
    cycles = record.get("cycles") if isinstance(record.get("cycles"), list) else []
    invalid_stage_refs: list[str] = []
    for c in cycles:
        if not isinstance(c, dict) or not isinstance(c.get("stages"), list):
            continue
        for i, stage in enumerate(c["stages"]):
            if not isinstance(stage, dict) or not provenance_is_valid(stage.get("provenance")):
                invalid_stage_refs.append(f"cycle {c.get('cycle_number')} stages[{i}]")
    passed = overall_valid and not invalid_stage_refs
    return _result("provenance_required", passed, [{"overall_provenance_valid": overall_valid, "invalid_stage_provenance": invalid_stage_refs}], validator, timestamp)


def evaluate_stage_order_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #1, re-derived independently: cycle shape, sequential numbering, PLAN/DO/CHECK/ACT
    ordered-prefix per cycle, and within-ACT action_item id uniqueness. Fails closed on malformed input."""
    if not isinstance(record, dict):
        return _result("stage_order_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    cycles = record.get("cycles")
    if not isinstance(cycles, list) or not cycles:
        return _result("stage_order_integrity", False, [{"reason": "cycles missing, not a list, or empty"}], validator, timestamp)
    if not all(_cycle_basic_shape_is_valid(c) for c in cycles):
        return _result("stage_order_integrity", False, [{"reason": "one or more cycles malformed (cycle_number/stages shape)"}], validator, timestamp)
    if not _cycles_numbering_is_valid(cycles):
        return _result("stage_order_integrity", False, [{"reason": "cycle_number sequence is not 1..N with no gaps/duplicates/reordering", "cycle_numbers": [c.get("cycle_number") for c in cycles]}], validator, timestamp)
    order_violations = _stage_order_violations(cycles)
    dup_violations = _duplicate_action_item_violations(cycles) if not order_violations else []
    passed = not order_violations and not dup_violations
    return _result("stage_order_integrity", passed, [{"cycle_count": len(cycles), "order_violations": order_violations, "duplicate_action_item_violations": dup_violations}], validator, timestamp)


def evaluate_learning_continuity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Invariant #2, re-derived independently. Re-checks its own precondition (shape/numbering/order) first
    rather than trusting stage_order_integrity already ran -- fails closed instead of crashing."""
    if not isinstance(record, dict):
        return _result("learning_continuity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    cycles = record.get("cycles")
    if not isinstance(cycles, list) or not cycles or not all(_cycle_basic_shape_is_valid(c) for c in cycles) or not _cycles_numbering_is_valid(cycles):
        return _result("learning_continuity", False, [{"reason": "cycles malformed -- cannot evaluate learning continuity"}], validator, timestamp)
    if _stage_order_violations(cycles):
        return _result("learning_continuity", False, [{"reason": "stage order invalid -- cannot evaluate learning continuity"}], validator, timestamp)
    violations = _learning_continuity_violations(cycles)
    return _result("learning_continuity", not violations, [{"cycle_count": len(cycles), "violations": violations}], validator, timestamp)


def evaluate_pdca_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_stage_order_gate(record, validator, timestamp),
        evaluate_learning_continuity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
