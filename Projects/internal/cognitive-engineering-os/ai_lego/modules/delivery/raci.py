"""``delivery.raci`` -- F22 PM/delivery/governance family, OPENING member (1 of 4 concurrent agents opening
F22 in this same parallel batch, this agent covering Risk Register + RACI (delivery)).

Atlas cites this method ONCE: the F22 tool table row (L927: "RACI｜明確責任｜每 deliverable 定義 R/A/C/I｜
防責任空洞"). Grep-confirmed the only real hit case-insensitively across the whole Atlas file for this row --
no dedicated section, same thin-citation class ``stakeholders.raci`` already establishes for the sibling F07
method.

**Disambiguation (NOT the same method as ``stakeholders.raci``, F07, Atlas L491)**: that method's own contract
(``methods/contracts/stakeholders.raci.contract.yaml``) explicitly anticipated and reserved this exact F22
entry -- read in full before writing this module. F07's RACI operates over generic ``tasks`` at the
stakeholder-responsibility level (exactly-1-Accountable/at-least-1-Responsible only, no due date, no
availability concept). THIS module is F22's delivery-TASK-execution/governance sense of RACI, over
``deliverables`` specifically, and adds two invariants F07 does not need:

1. **due_date required, calendrically valid** (``DRACI_INVALID_DUE_DATE``) -- L927's own word is
   "deliverable", not "task"; a deliverable in a governance context is bound to a milestone. Same
   ``date.fromisoformat`` calendrical-validity discipline ``framing.smart``'s own ``_valid_iso_date`` already
   establishes (rejects e.g. ``'2026-02-30'``, which a bare regex would accept).

2. **Escalation path required when the Accountable is unavailable, THE genuinely new invariant this method
   exists to enforce beyond F07** (``DRACI_MISSING_ESCALATION_PATH``) -- if a deliverable's Accountable
   assignment has ``status == "UNAVAILABLE"``, ``escalation_path`` (a fallback Accountable) MUST be a
   non-empty string. An unavailable Accountable with no declared fallback IS the responsibility void L927's
   own "防責任空洞" (prevent a responsibility void) benefit exists to prevent -- this is the real governance
   angle F07's simpler stakeholder-engagement RACI does not raise.

Also carried over from F07's own base discipline (real, standard RACI management practice, not obscure):
exactly one Accountable per deliverable (``DRACI_DELIVERABLE_NOT_EXACTLY_ONE_ACCOUNTABLE``), at least one
Responsible per deliverable (``DRACI_DELIVERABLE_MISSING_RESPONSIBLE``), a closed role enum
(``DRACI_INVALID_ROLE``), and deliverable_name uniqueness (``DRACI_DUPLICATE_DELIVERABLE_NAME``, same
cross-entry-ambiguity class ``stakeholders.raci``'s own duplicate task_name check already establishes).

Record id prefix ``DRACI-`` -- deliberately NEW, neither bare ``RACI-`` nor ``stakeholders.raci``'s own
``SRACI-`` (that method's contract already reserved SRACI- anticipating this exact F22 entry; reusing it here
would defeat that disambiguation). Grep-confirmed zero ``DRACI-`` collision across the whole corpus before
writing any of this method's own files.
"""

from __future__ import annotations

import copy
from datetime import date
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "delivery.raci"
RECORD_ID_PREFIX = "DRACI-"

RESPONSIBLE = "R"
ACCOUNTABLE = "A"
CONSULTED = "C"
INFORMED = "I"
VALID_ROLES: frozenset[str] = frozenset({RESPONSIBLE, ACCOUNTABLE, CONSULTED, INFORMED})
# L927's own closed "R/A/C/I" role set -- same standard RACI vocabulary stakeholders.raci's own VALID_ROLES
# already establishes for the sibling F07 method (disclosed per-assignment judgment call, never computed).

AVAILABLE = "AVAILABLE"
UNAVAILABLE = "UNAVAILABLE"
VALID_STATUSES: frozenset[str] = frozenset({AVAILABLE, UNAVAILABLE})
# NEW beyond stakeholders.raci -- the governance/continuity angle this method exists to add.

_DELIVERABLE_INPUT_KEYS = frozenset({"deliverable_name", "due_date", "assignments", "escalation_path"})
_ASSIGNMENT_KEYS = frozenset({"stakeholder_name", "role", "status"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _valid_iso_date(value: Any) -> bool:
    """Syntactic AND calendrical validity (rejects e.g. '2026-02-30', which a bare regex would accept). Same
    convention ``framing.smart``'s own ``_valid_iso_date`` already establishes for this corpus."""
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _normalize_deliverable_name(name: str) -> str:
    """Whitespace/case-insensitive comparison key for deliverable_name duplicate-detection -- same
    normalization convention this corpus's ``stakeholders.raci`` own ``_normalize_task_name`` establishes
    (``devops_sre/game_day.py``'s own ``_normalize_role_name``: ``" ".join(name.split()).casefold()``)."""
    return " ".join(name.split()).casefold()


def _shallow_describe(value: Any) -> str:
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _assignment_is_valid(entry: Any) -> bool:
    """Shared shape+content predicate for ONE assignment entry. Called by both the builder and the
    independent gate."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ASSIGNMENT_KEYS:
        return False
    if not _is_nonempty_str(entry.get("stakeholder_name")):
        return False
    if entry.get("role") not in VALID_ROLES:
        return False
    return entry.get("status") in VALID_STATUSES


def _accountable_assignments(assignments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [a for a in assignments if a.get("role") == ACCOUNTABLE]


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_delivery_raci_matrix(
    record_id: str,
    deliverables: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/delivery-raci-matrix.schema.yaml``.

    Enforces every real invariant fail-closed, in order: id/version/provenance shape; ``deliverables``
    structural non-emptiness; per-deliverable/per-assignment shape and closed-role/status-enum validity;
    due_date calendrical validity; the 2 cross-assignment counting invariants carried over from F07's own base
    discipline (exactly 1 Accountable, at least 1 Responsible); deliverable_name uniqueness across the whole
    array; and -- THE invariant this method exists to add beyond F07 -- escalation_path is non-empty whenever
    the Accountable assignment's status is UNAVAILABLE. A delivery RACI matrix failing any one of these is
    refused at construction, never silently stored with an ambiguous, unassigned, or un-escalated deliverable.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DRACI_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DRACI_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"DRACI_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(deliverables, list) or not deliverables:
        raise InvariantViolation(
            f"DRACI_EMPTY_DELIVERABLES: deliverables must be a non-empty list -- a matrix naming zero deliverables has not actually "
            f"'明確責任' for anything (L927's own defining purpose), got {_shallow_describe(deliverables)}"
        )

    rebuilt_deliverables: list[dict[str, Any]] = []
    deliverable_names: list[str] = []
    for index, deliverable in enumerate(deliverables):
        if not isinstance(deliverable, dict) or set(deliverable.keys()) != _DELIVERABLE_INPUT_KEYS:
            raise InvariantViolation(f"DRACI_INVALID_DELIVERABLE: deliverables[{index}] must be a dict with exactly the keys {sorted(_DELIVERABLE_INPUT_KEYS)}, got {_shallow_describe(deliverable)}")

        deliverable_name = deliverable["deliverable_name"]
        if not _is_nonempty_str(deliverable_name):
            raise InvariantViolation(f"DRACI_EMPTY_DELIVERABLE_NAME: deliverables[{index}].deliverable_name must be a non-empty string, got {deliverable_name!r}")

        due_date = deliverable["due_date"]
        if not _valid_iso_date(due_date):
            raise InvariantViolation(
                f"DRACI_INVALID_DUE_DATE: deliverables[{index}] ({deliverable_name!r}).due_date must be a calendrically valid ISO date string, got {due_date!r} -- "
                "a deliverable (unlike a generic task) is milestone-bound (L927's own 'deliverable' wording)"
            )

        assignments = deliverable["assignments"]
        if not isinstance(assignments, list) or not assignments:
            raise InvariantViolation(
                f"DRACI_EMPTY_ASSIGNMENTS: deliverables[{index}] ({deliverable_name!r}).assignments must be a non-empty list, got {_shallow_describe(assignments)}"
            )
        for a_index, assignment in enumerate(assignments):
            if not isinstance(assignment, dict) or set(assignment.keys()) != _ASSIGNMENT_KEYS:
                raise InvariantViolation(
                    f"DRACI_INVALID_ASSIGNMENT: deliverables[{index}] ({deliverable_name!r}).assignments[{a_index}] must be a dict with exactly the keys "
                    f"{sorted(_ASSIGNMENT_KEYS)}, got {_shallow_describe(assignment)}"
                )
            if not _is_nonempty_str(assignment.get("stakeholder_name")):
                raise InvariantViolation(
                    f"DRACI_EMPTY_STAKEHOLDER_NAME: deliverables[{index}] ({deliverable_name!r}).assignments[{a_index}].stakeholder_name must be a non-empty "
                    f"string, got {assignment.get('stakeholder_name')!r}"
                )
            if assignment.get("role") not in VALID_ROLES:
                raise InvariantViolation(
                    f"DRACI_INVALID_ROLE: deliverables[{index}] ({deliverable_name!r}).assignments[{a_index}].role must be one of {sorted(VALID_ROLES)}, "
                    f"got {assignment.get('role')!r}"
                )
            if assignment.get("status") not in VALID_STATUSES:
                raise InvariantViolation(
                    f"DRACI_INVALID_STATUS: deliverables[{index}] ({deliverable_name!r}).assignments[{a_index}].status must be one of {sorted(VALID_STATUSES)}, "
                    f"got {assignment.get('status')!r}"
                )

        accountable_count = sum(1 for a in assignments if a["role"] == ACCOUNTABLE)
        if accountable_count != 1:
            raise InvariantViolation(
                f"DRACI_DELIVERABLE_NOT_EXACTLY_ONE_ACCOUNTABLE: deliverables[{index}] ({deliverable_name!r}) has {accountable_count} Accountable (A) "
                f"assignment(s) -- the real, standard RACI discipline requires EXACTLY 1, never 0 (nobody answerable) and never 2+ (responsibility ambiguity)"
            )
        responsible_count = sum(1 for a in assignments if a["role"] == RESPONSIBLE)
        if responsible_count < 1:
            raise InvariantViolation(
                f"DRACI_DELIVERABLE_MISSING_RESPONSIBLE: deliverables[{index}] ({deliverable_name!r}) has zero Responsible (R) assignments -- every "
                f"deliverable must have at least 1 person doing the work"
            )

        accountable = _accountable_assignments(assignments)[0]
        escalation_path = deliverable["escalation_path"]
        if escalation_path is not None and not _is_nonempty_str(escalation_path):
            raise InvariantViolation(
                f"DRACI_INVALID_ESCALATION_PATH: deliverables[{index}] ({deliverable_name!r}).escalation_path must be null or a non-empty string, got {escalation_path!r}"
            )
        if accountable["status"] == UNAVAILABLE and not _is_nonempty_str(escalation_path):
            raise InvariantViolation(
                f"DRACI_MISSING_ESCALATION_PATH: deliverables[{index}] ({deliverable_name!r})'s Accountable ({accountable['stakeholder_name']!r}) is "
                f"UNAVAILABLE but no non-empty escalation_path is declared -- an unavailable Accountable with no fallback IS the responsibility void "
                "L927's own '防責任空洞' benefit exists to prevent"
            )

        deliverable_names.append(deliverable_name)
        rebuilt_deliverables.append(
            {
                "deliverable_name": deliverable_name,
                "due_date": due_date,
                "assignments": [dict(a) for a in assignments],
                "escalation_path": escalation_path,
            }
        )

    normalized_names = [_normalize_deliverable_name(name) for name in deliverable_names]
    duplicate_names = {deliverable_names[i] for i, key in enumerate(normalized_names) if normalized_names.count(key) > 1}
    if duplicate_names:
        raise InvariantViolation(
            f"DRACI_DUPLICATE_DELIVERABLE_NAME: deliverable_name(s) {sorted(duplicate_names)} appear in more than one deliverables[] entry -- "
            f"each would carry its own separately-counted Accountable, silently reintroducing the exact responsibility void this method exists to remove"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "deliverables": rebuilt_deliverables,
        "provenance": copy.deepcopy(provenance),
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_delivery_raci_matrix -- a hand-tampered record that bypassed the builder entirely must be caught
# exactly as a builder-refused one would have been.
# --------------------------------------------------------------------------


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own top-level provenance is schema-valid.
    Fails closed on non-dict input."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_raci_role_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives shape, closed-role/status-enum validity, exactly-1-Accountable/at-least-1-Responsible, and
    deliverable_name uniqueness directly from the record's OWN raw fields -- does not trust any stored value
    and does NOT call ``generate_delivery_raci_matrix``. Fails closed on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("raci_role_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("raci_role_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("raci_role_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    deliverables = record.get("deliverables")
    if not isinstance(deliverables, list) or not deliverables:
        return _result("raci_role_integrity", False, [{"reason": "deliverables missing, not a list, or empty"}], validator, timestamp)

    problems: list[str] = []
    deliverable_names: list[str] = []
    for index, deliverable in enumerate(deliverables):
        if not isinstance(deliverable, dict) or set(deliverable.keys()) != _DELIVERABLE_INPUT_KEYS:
            problems.append(f"deliverables[{index}] malformed shape")
            continue
        deliverable_name = deliverable.get("deliverable_name")
        if not _is_nonempty_str(deliverable_name):
            problems.append(f"deliverables[{index}].deliverable_name missing or empty")
        else:
            deliverable_names.append(deliverable_name)

        assignments = deliverable.get("assignments")
        if not isinstance(assignments, list) or not assignments:
            problems.append(f"deliverables[{index}] ({deliverable_name!r}).assignments missing, not a list, or empty")
            continue
        if not all(_assignment_is_valid(a) for a in assignments):
            problems.append(f"deliverables[{index}] ({deliverable_name!r}) has a malformed assignment entry (bad shape, empty stakeholder_name, invalid role, or invalid status)")
            continue

        accountable_count = sum(1 for a in assignments if a["role"] == ACCOUNTABLE)
        if accountable_count != 1:
            problems.append(f"deliverables[{index}] ({deliverable_name!r}) has {accountable_count} Accountable assignment(s), must be exactly 1")
        responsible_count = sum(1 for a in assignments if a["role"] == RESPONSIBLE)
        if responsible_count < 1:
            problems.append(f"deliverables[{index}] ({deliverable_name!r}) has zero Responsible assignments, must be at least 1")

    normalized_names = [_normalize_deliverable_name(name) for name in deliverable_names]
    duplicate_names = {deliverable_names[i] for i, key in enumerate(normalized_names) if normalized_names.count(key) > 1}
    if duplicate_names:
        problems.append(f"deliverable_name(s) {sorted(duplicate_names)} appear in more than one deliverables[] entry")

    return _result("raci_role_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_deliverable_governance_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the 2 invariants that make this a DELIVERABLE-level (not generic-task-level) governance
    instrument, directly from raw fields: due_date calendrical validity, and escalation_path non-empty whenever
    the Accountable's status is UNAVAILABLE -- THE genuinely new invariant beyond stakeholders.raci. Does NOT
    assume raci_role_integrity already passed (recomputes against well-shaped entries only) and does NOT call
    generate_delivery_raci_matrix, so a hand-tampered record that bypassed the builder entirely is caught here
    exactly as a builder-refused one would have been."""
    if not isinstance(record, dict):
        return _result("deliverable_governance", False, [{"reason": "record is not a dict"}], validator, timestamp)
    deliverables = record.get("deliverables")
    if not isinstance(deliverables, list) or not deliverables:
        return _result("deliverable_governance", False, [{"reason": "deliverables missing, not a list, or empty"}], validator, timestamp)

    problems: list[str] = []
    for index, deliverable in enumerate(deliverables):
        if not isinstance(deliverable, dict):
            problems.append(f"deliverables[{index}] is not a dict")
            continue
        deliverable_name = deliverable.get("deliverable_name")

        if not _valid_iso_date(deliverable.get("due_date")):
            problems.append(f"deliverables[{index}] ({deliverable_name!r}).due_date is missing or not a calendrically valid ISO date: {deliverable.get('due_date')!r}")

        assignments = deliverable.get("assignments")
        escalation_path = deliverable.get("escalation_path")
        if escalation_path is not None and not _is_nonempty_str(escalation_path):
            problems.append(f"deliverables[{index}] ({deliverable_name!r}).escalation_path is neither null nor a non-empty string: {escalation_path!r}")
        if isinstance(assignments, list):
            well_shaped_accountables = [a for a in assignments if _assignment_is_valid(a) and a.get("role") == ACCOUNTABLE]
            unavailable_accountables = [a for a in well_shaped_accountables if a.get("status") == UNAVAILABLE]
            if unavailable_accountables and not _is_nonempty_str(escalation_path):
                problems.append(
                    f"deliverables[{index}] ({deliverable_name!r}) has an UNAVAILABLE Accountable but no non-empty escalation_path is declared"
                )
        else:
            problems.append(f"deliverables[{index}] ({deliverable_name!r}).assignments is not a list -- cannot evaluate Accountable availability")

    return _result("deliverable_governance", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_delivery_raci_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_raci_role_integrity_gate(record, validator, timestamp),
        evaluate_deliverable_governance_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
