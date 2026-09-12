"""``delivery.raid_log`` -- F22 PM/Delivery/Governance family (Atlas L918 table row, dedicated section
11.51 L2368-2392: "Risks, Assumptions, Issues, Dependencies Log").

Atlas's own table row (L918, verbatim): "RAID Log | 管 Risks/Assumptions/Issues/Dependencies |
ID→owner→status→impact→next action→review date | 風險不散落聊天". Section 11.51 names 9 minimum fields per
item (ID/Type/Statement/Owner/Impact/Status/Next Action/Due-Review Date/Evidence) and states the benefit
verbatim: "把散落在 Slack、聊天、會議中的 critical knowledge 正式化" (formalize critical knowledge scattered
across Slack/chat/meetings).

Real invariants, enforced at TWO independent layers, same belt-and-suspenders discipline every prior
slice in this corpus establishes:

1. **Type closed set** (``RAID_INVALID_ITEM``) -- ``type`` must be one of RISK/ASSUMPTION/ISSUE/
   DEPENDENCY, literally what the R-A-I-D acronym names.
2. **8-of-9 fields non-empty** (``RAID_INVALID_ITEM``) -- item_id/type/statement/owner/impact/status/
   next_action/due_review_date must each be a non-empty string (``evidence`` is the deliberate
   exception, see #3).
3. **Closure requires evidence, THE real invariant this method exists to enforce**
   (``RAID_CLOSED_WITHOUT_EVIDENCE``) -- a RAID item whose status is CLOSED or RESOLVED must carry a
   non-empty ``evidence`` field. A RAID item silently closed with no evidence defeats section 11.51's
   own stated benefit: formalizing scattered critical knowledge means the CLOSURE itself must be backed
   by something checkable, not just a status flip.

Grepped ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` case-insensitively for "raid" before writing any of this
method's own files: zero pre-existing `delivery.*` implementation or schema-title overlap (all
pre-existing hits are Atlas/registry cross-references -- the mother doc itself, method-inventory.yaml,
architecture-inventory.yaml, the section index).
"""

from __future__ import annotations

import copy
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "delivery.raid_log"
RECORD_ID_PREFIX = "RAID-"
VALID_TYPES = frozenset({"RISK", "ASSUMPTION", "ISSUE", "DEPENDENCY"})
TERMINAL_STATUSES = frozenset({"CLOSED", "RESOLVED"})
_ITEM_KEYS = frozenset({"item_id", "type", "statement", "owner", "impact", "status", "next_action", "due_review_date", "evidence"})
_REQUIRED_NONEMPTY_KEYS = frozenset({"item_id", "statement", "owner", "impact", "status", "next_action", "due_review_date"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _item_shape_problem(value: Any) -> str | None:
    """The single definition of "is this a well-shaped items[] entry" -- shape/type-closed-set/non-empty
    fields only, NOT the closure-evidence rule (a distinct, separately-checked invariant, see
    ``_item_closure_problem``). Consulted by both the builder and the ``item_shape_integrity`` gate."""
    if not isinstance(value, dict):
        return f"not a dict: {value!r}"
    unknown = set(value.keys()) - _ITEM_KEYS
    if unknown:
        return f"unknown key(s) {sorted(unknown, key=repr)}"
    if not _ITEM_KEYS <= value.keys():
        return f"missing key(s) {sorted(_ITEM_KEYS - value.keys(), key=repr)}"
    for key in _REQUIRED_NONEMPTY_KEYS:
        if not _is_nonempty_str(value.get(key)):
            return f"{key} must be a non-empty string, got {value.get(key)!r}"
    if value.get("type") not in VALID_TYPES:
        return f"type must be one of {sorted(VALID_TYPES)} (R-A-I-D), got {value.get('type')!r}"
    if not isinstance(value.get("evidence"), str):
        return f"evidence must be a string, got {value.get('evidence')!r}"
    return None


def _item_closure_problem(value: Any) -> str | None:
    """Precondition: ``_item_shape_problem(value) is None``. THE real invariant this method exists to
    enforce -- a terminal status (CLOSED/RESOLVED) must carry non-empty evidence."""
    if value.get("status") in TERMINAL_STATUSES and not value.get("evidence", "").strip():
        return (
            f"status is {value.get('status')!r} (a terminal status) but evidence is empty -- a RAID item "
            "closed with no evidence defeats the entire 'formalize scattered knowledge' purpose"
        )
    return None


def raid_item(
    item_id: str,
    type: str,
    statement: str,
    owner: str,
    impact: str,
    status: str,
    next_action: str,
    due_review_date: str,
    evidence: str = "",
) -> dict[str, Any]:
    """One item of ``typed-objects/raid-log-record.schema.yaml#/properties/items``."""
    record = {
        "item_id": item_id,
        "type": type,
        "statement": statement,
        "owner": owner,
        "impact": impact,
        "status": status,
        "next_action": next_action,
        "due_review_date": due_review_date,
        "evidence": evidence,
    }
    shape_problem = _item_shape_problem(record)
    if shape_problem is not None:
        raise InvariantViolation(f"RAID_INVALID_ITEM: {shape_problem}")
    closure_problem = _item_closure_problem(record)
    if closure_problem is not None:
        raise InvariantViolation(f"RAID_CLOSED_WITHOUT_EVIDENCE: {closure_problem}")
    return record


def generate_raid_log(
    record_id: str,
    items: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/raid-log-record.schema.yaml``.

    Rebuilds every ``items[]`` entry via ``raid_item()`` (never trusting the caller's raw dicts), then
    enforces the method contract's own real invariants fail-closed, in order: id/version/provenance
    shape, at least 1 item, unique item_id, and -- per item -- the type closed-set + 8-field non-empty +
    closure-requires-evidence rules -- BEFORE returning.
    """
    if not isinstance(record_id, str) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"RAID_INVALID_ID: id must start with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"RAID_INVALID_VERSION: version must be a string, got {type(version).__name__}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation("RAID_INVALID_PROVENANCE: provenance must be a valid provenance_record")
    if not isinstance(items, list) or not items:
        raise InvariantViolation(f"RAID_EMPTY_ITEMS: at least 1 item is required, got {items!r}")

    rebuilt_items: list[dict[str, Any]] = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise InvariantViolation(f"RAID_INVALID_ITEMS: items[{i}] must be a dict, got {it!r}")
        try:
            rebuilt_items.append(
                raid_item(
                    it.get("item_id"),
                    it.get("type"),
                    it.get("statement"),
                    it.get("owner"),
                    it.get("impact"),
                    it.get("status"),
                    it.get("next_action"),
                    it.get("due_review_date"),
                    it.get("evidence", ""),
                )
            )
        except InvariantViolation as error:
            raise InvariantViolation(f"RAID_INVALID_ITEMS: items[{i}]: {error}") from error

    item_ids = [it["item_id"] for it in rebuilt_items]
    if len(item_ids) != len(set(item_ids)):
        duplicate = sorted({i for i in item_ids if item_ids.count(i) > 1})
        raise InvariantViolation(f"RAID_DUPLICATE_ITEM_ID: item_id(s) {duplicate} declared more than once")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "items": rebuilt_items,
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


def evaluate_item_shape_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives item shape (type closed-set, 8-field non-empty) directly from raw fields using the SAME
    ``_item_shape_problem`` predicate the builder uses -- without this the gate could pass records the
    builder refuses. Fails closed on malformed entries rather than crashing."""
    if not isinstance(record, dict):
        return _result("item_shape_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    items = record.get("items")
    if not isinstance(items, list) or not items:
        return _result("item_shape_integrity", False, [{"reason": "items must be a non-empty list"}], validator, timestamp)
    problems = [f"items[{i}]: {p}" for i, p in ((i, _item_shape_problem(it)) for i, it in enumerate(items)) if p]
    well_shaped = [it for it in items if _item_shape_problem(it) is None]
    item_ids = [it["item_id"] for it in well_shaped]
    if len(item_ids) != len(set(item_ids)):
        problems.append(f"duplicate item_id in items[]: {item_ids!r}")
    passed = not problems
    return _result("item_shape_integrity", passed, [{"problems": problems}], validator, timestamp)


def evaluate_closure_evidence_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """THE real invariant, re-derived independently from raw fields via the SAME ``_item_closure_problem``
    predicate the builder uses -- a terminal-status item without evidence is caught even when
    hand-tampered directly onto a raw dict, bypassing the builder entirely. Does NOT assume shape
    integrity already passed (recomputes against well-shaped items only)."""
    if not isinstance(record, dict):
        return _result("closure_evidence", False, [{"reason": "record is not a dict"}], validator, timestamp)
    items = record.get("items")
    if not isinstance(items, list) or not items:
        return _result("closure_evidence", False, [{"reason": "items must be a non-empty list"}], validator, timestamp)
    well_shaped = [it for it in items if _item_shape_problem(it) is None]
    problems = [f"{it['item_id']}: {problem}" for it in well_shaped for problem in [_item_closure_problem(it)] if problem]
    passed = bool(well_shaped) and not problems
    return _result("closure_evidence", passed, [{"items_checked": len(well_shaped), "problems": problems}], validator, timestamp)


def evaluate_raid_log_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_item_shape_integrity_gate(record, validator, timestamp),
        evaluate_closure_evidence_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
