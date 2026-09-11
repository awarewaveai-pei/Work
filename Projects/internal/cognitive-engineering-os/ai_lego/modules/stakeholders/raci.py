"""``stakeholders.raci`` -- F07 stakeholder/power/negotiation family, OPENING member (F07 had zero built methods
before this batch -- grep-confirmed no ``ai_lego/modules/stakeholders/`` implementation existed at batch start;
1 of 10 concurrent agents opening F07 in this same parallel batch).

Atlas cites this method ONCE: the F07 tool table row (L491: "RACI｜明確 R/A/C/I｜每 task 指定責任｜降低責任模糊").
Grep-confirmed the only real hit case-insensitively across the whole Atlas file -- no dedicated section, same
thin-citation class ``strategy.bcg_matrix``/``insight.persona`` already establish.

**Disambiguation (NOT the same method as a future F22 method)**: ``methods/registry/method-inventory.yaml``
L1365-1369 already registers a separate, still-unbuilt, pending "RACI (delivery)" entry under `category: "F22
pm-governance"` -- delivery-TASK execution responsibility, a different future module/namespace. This module is
F07's stakeholder-engagement/decision-responsibility sense of RACI. The two are deliberately disambiguated via
``METHOD_ID`` (``stakeholders.raci``, not a bare ``pm_governance.raci`` or similar), the record id prefix
(``SRACI-``, deliberately NOT bare ``RACI-``), and this docstring -- neither imports the other, and none is
expected to ever exist as of this module's writing.

**Real invariants, ALL re-derived independently at both construction time and gate time (never trusting a
stored flag)**, real standard RACI management practice (independently verified, not obscure) -- the substance
behind L491's own "降低責任模糊" (reduce responsibility ambiguity) benefit column:

1. **Structural non-emptiness** (``RACI_EMPTY_TASKS`` / ``RACI_EMPTY_TASK_NAME`` / ``RACI_EMPTY_ASSIGNMENTS`` /
   ``RACI_EMPTY_STAKEHOLDER_NAME``): ``tasks`` is a non-empty list; every task has a non-empty ``task_name`` and
   a non-empty ``assignments`` list; every assignment has a non-empty ``stakeholder_name``.

2. **Closed role enum** (``RACI_INVALID_ROLE``): every assignment's ``role`` is one of exactly ``{R, A, C, I}``
   -- L491's own closed "R/A/C/I" role set, never a free-text field.

3. **Exactly one Accountable per task** (``RACI_TASK_NOT_EXACTLY_ONE_ACCOUNTABLE``): the count of ``role == "A"``
   assignments on a task must equal exactly 1 -- never 0 (nobody answerable) and never 2+ (which IS the
   responsibility ambiguity RACI exists to remove; two people both "accountable" for the same task is not a
   safety margin, it is the exact failure mode L491's own "降低責任模糊" benefit names).

4. **At least one Responsible per task** (``RACI_TASK_MISSING_RESPONSIBLE``): the count of ``role == "R"``
   assignments on a task must be >= 1 -- a task with nobody doing the work is not actually assigned.

Invariants 3-4 are counted over genuine ``int`` sums (``sum(1 for ... if ...)``), never over a caller-supplied
integer field -- this method has no numeric/scored input anywhere in its shape (``role`` is a closed string
enum, not a 1-N scale), so the batch-wide bool-is-a-subclass-of-int pitfall flagged for this F07 build does not
apply to any check in this module.

C (Consulted) and I (Informed) carry NO minimum-count requirement -- a task may legitimately have zero of
either (see contract's own ``open_questions`` OQ-RACI-3).

Record-level-only provenance (NOT per-task/per-assignment) -- same batch-wide placement
``insight.jtbd``/``insight.persona`` already establish for an adjacent family: a RaciMatrix's tasks are one
coherent responsibility-assignment claim, not a list of independently-sourced items each needing its own
epistemic stamp.

Grepped the whole ``agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`` and
``Projects/internal/cognitive-engineering-os`` trees case-insensitively for "raci" before writing any of this
method's own files: zero pre-existing implementation (only method-inventory.yaml's own unrelated, unbuilt F22
backlog row, see disambiguation above).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "stakeholders.raci"
RECORD_ID_PREFIX = "SRACI-"

RESPONSIBLE = "R"
ACCOUNTABLE = "A"
CONSULTED = "C"
INFORMED = "I"
VALID_ROLES: frozenset[str] = frozenset({RESPONSIBLE, ACCOUNTABLE, CONSULTED, INFORMED})
# L491's own closed "R/A/C/I" role set -- NOT Atlas-invented, the real, standard RACI vocabulary (see module
# docstring); a disclosed per-assignment judgment call, never computed.

_TASK_INPUT_KEYS = frozenset({"task_name", "assignments"})
_ASSIGNMENT_KEYS = frozenset({"stakeholder_name", "role"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _normalize_task_name(task_name: str) -> str:
    """Whitespace/case-insensitive comparison key for task_name duplicate-detection (2nd critic pass,
    2026-09-11): the first fix's exact-string dedup let ``"Ship release"`` and ``"Ship release "`` (or
    ``"Ship Release"``) count as 2 DISTINCT tasks, each with its own single Accountable -- exactly the
    responsibility-ambiguity failure mode the fix's own comment already named, just not closed for anything
    but byte-identical strings. Same normalization convention this corpus already establishes
    (``devops_sre/game_day.py``'s own ``_normalize_role_name``: ``" ".join(name.split()).casefold()``). The
    stored ``task_name`` itself is never rewritten, only the key used to detect duplicates."""
    return " ".join(task_name.split()).casefold()


def _shallow_describe(value: Any) -> str:
    """One-level-deep description for error messages -- never a raw recursive ``repr()`` over caller-supplied
    input of unknown size, same discipline every prior module in this codebase (``jtbd``/``bcg_matrix``)
    already establishes."""
    if isinstance(value, list):
        return f"<list of {len(value)} item(s)>"
    if isinstance(value, dict):
        return f"<dict with keys {sorted(map(str, value.keys()))}>"
    return repr(value)


def _assignment_is_valid(entry: Any) -> bool:
    """Shared shape+content predicate for ONE assignment entry -- exactly the 2 input keys, non-empty
    stakeholder_name, role in the closed VALID_ROLES set. Same shape for both input and stored records (unlike
    ``strategy.bcg_matrix``'s portfolio items, no computed field is ever added here). Called by both the
    builder and the independent gate."""
    if not isinstance(entry, dict) or set(entry.keys()) != _ASSIGNMENT_KEYS:
        return False
    if not _is_nonempty_str(entry.get("stakeholder_name")):
        return False
    return entry.get("role") in VALID_ROLES


# --------------------------------------------------------------------------
# Builder
# --------------------------------------------------------------------------


def generate_raci_matrix(
    record_id: str,
    tasks: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/stakeholder-raci.schema.yaml``.

    Enforces every real invariant fail-closed, in order: id/version/provenance shape, then ``tasks`` structural
    non-emptiness, then per-task/per-assignment shape and closed-role-enum validity, then the 2 real cross-
    assignment counting invariants (exactly 1 Accountable, at least 1 Responsible) per task. A RACI matrix
    failing any one of these is refused at construction, never silently stored with an ambiguous or
    unassigned task.
    """
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"RACI_INVALID_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"RACI_INVALID_VERSION: version must be a string, got {version!r}")
    if not provenance_is_valid(provenance):
        raise InvariantViolation(f"RACI_INVALID_PROVENANCE: provenance failed schema validation, got {_shallow_describe(provenance)}")

    if not isinstance(tasks, list) or not tasks:
        raise InvariantViolation(
            f"RACI_EMPTY_TASKS: tasks must be a non-empty list -- a RACI matrix naming zero tasks has not actually "
            f"'指定責任' for anything (L491's own defining purpose), got {_shallow_describe(tasks)}"
        )

    rebuilt_tasks: list[dict[str, Any]] = []
    task_names: list[str] = []
    for index, task in enumerate(tasks):
        if not isinstance(task, dict) or set(task.keys()) != _TASK_INPUT_KEYS:
            raise InvariantViolation(f"RACI_INVALID_TASK: tasks[{index}] must be a dict with exactly the keys {sorted(_TASK_INPUT_KEYS)}, got {_shallow_describe(task)}")
        task_name = task["task_name"]
        if not _is_nonempty_str(task_name):
            raise InvariantViolation(f"RACI_EMPTY_TASK_NAME: tasks[{index}].task_name must be a non-empty string, got {task_name!r}")

        assignments = task["assignments"]
        if not isinstance(assignments, list) or not assignments:
            raise InvariantViolation(
                f"RACI_EMPTY_ASSIGNMENTS: tasks[{index}] ({task_name!r}).assignments must be a non-empty list, got {_shallow_describe(assignments)}"
            )
        for a_index, assignment in enumerate(assignments):
            if not isinstance(assignment, dict) or set(assignment.keys()) != _ASSIGNMENT_KEYS:
                raise InvariantViolation(
                    f"RACI_INVALID_ASSIGNMENT: tasks[{index}] ({task_name!r}).assignments[{a_index}] must be a dict with exactly the keys "
                    f"{sorted(_ASSIGNMENT_KEYS)}, got {_shallow_describe(assignment)}"
                )
            if not _is_nonempty_str(assignment.get("stakeholder_name")):
                raise InvariantViolation(
                    f"RACI_EMPTY_STAKEHOLDER_NAME: tasks[{index}] ({task_name!r}).assignments[{a_index}].stakeholder_name must be a non-empty "
                    f"string, got {assignment.get('stakeholder_name')!r}"
                )
            if assignment.get("role") not in VALID_ROLES:
                raise InvariantViolation(
                    f"RACI_INVALID_ROLE: tasks[{index}] ({task_name!r}).assignments[{a_index}].role must be one of {sorted(VALID_ROLES)}, "
                    f"got {assignment.get('role')!r}"
                )

        accountable_count = sum(1 for a in assignments if a["role"] == ACCOUNTABLE)
        if accountable_count != 1:
            raise InvariantViolation(
                f"RACI_TASK_NOT_EXACTLY_ONE_ACCOUNTABLE: tasks[{index}] ({task_name!r}) has {accountable_count} Accountable (A) assignment(s) -- "
                f"the real, standard RACI discipline (L491's own '降低責任模糊' benefit) requires EXACTLY 1, never 0 (nobody answerable) and never "
                f"2+ (which IS the responsibility ambiguity RACI exists to remove)"
            )
        responsible_count = sum(1 for a in assignments if a["role"] == RESPONSIBLE)
        if responsible_count < 1:
            raise InvariantViolation(
                f"RACI_TASK_MISSING_RESPONSIBLE: tasks[{index}] ({task_name!r}) has zero Responsible (R) assignments -- every task must have at "
                f"least 1 person doing the work"
            )

        task_names.append(task_name)
        rebuilt_tasks.append({"task_name": task_name, "assignments": [dict(a) for a in assignments]})

    # Cross-task check, critic-found gap (2026-09-11): the exactly-1-Accountable invariant above is counted
    # PER LIST ENTRY, with no uniqueness check on task_name -- two tasks[] entries both literally named
    # "Ship release", each with its own single Accountable, passed the per-entry check while the real-world
    # task now has 2 people who each think they are the one Accountable. That IS the exact 責任模糊 (L491's
    # own benefit) RACI exists to remove, reachable through the normal builder path, not just tampering.
    normalized_task_names = [_normalize_task_name(name) for name in task_names]
    duplicate_names = {task_names[i] for i, key in enumerate(normalized_task_names) if normalized_task_names.count(key) > 1}
    if duplicate_names:
        raise InvariantViolation(
            f"RACI_DUPLICATE_TASK_NAME: task_name(s) {sorted(duplicate_names)} appear in more than one tasks[] entry -- "
            f"each would carry its own separately-counted Accountable, silently reintroducing the exact responsibility "
            f"ambiguity this method exists to remove"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "tasks": rebuilt_tasks,
        "provenance": provenance,
    }


# --------------------------------------------------------------------------
# Gates -- independently re-derive every invariant from raw fields, fail-closed on malformed input. Never call
# generate_raci_matrix -- a hand-tampered record that bypassed the builder entirely must be caught exactly as a
# builder-refused one would have been.
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


def evaluate_raci_content_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY real invariant from the record's OWN raw fields -- does not trust any stored value and
    does NOT call ``generate_raci_matrix``, so a hand-tampered record that bypassed the builder entirely is
    caught here exactly as a builder-refused one would have been. Checks id/version shape, tasks/assignments
    structural non-emptiness, closed-role-enum validity, and the 2 real per-task counting invariants (exactly 1
    Accountable, at least 1 Responsible), all independently. Fails closed on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("raci_content_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("raci_content_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("raci_content_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)

    tasks = record.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        return _result("raci_content_integrity", False, [{"reason": "tasks missing, not a list, or empty"}], validator, timestamp)

    problems: list[str] = []
    task_names: list[str] = []
    for index, task in enumerate(tasks):
        if not isinstance(task, dict) or set(task.keys()) != _TASK_INPUT_KEYS:
            problems.append(f"tasks[{index}] malformed shape")
            continue
        task_name = task.get("task_name")
        if not _is_nonempty_str(task_name):
            problems.append(f"tasks[{index}].task_name missing or empty")
        else:
            task_names.append(task_name)

        assignments = task.get("assignments")
        if not isinstance(assignments, list) or not assignments:
            problems.append(f"tasks[{index}] ({task_name!r}).assignments missing, not a list, or empty")
            continue
        if not all(_assignment_is_valid(a) for a in assignments):
            problems.append(f"tasks[{index}] ({task_name!r}) has a malformed assignment entry (bad shape, empty stakeholder_name, or role not in {sorted(VALID_ROLES)})")
            continue

        accountable_count = sum(1 for a in assignments if a["role"] == ACCOUNTABLE)
        if accountable_count != 1:
            problems.append(f"tasks[{index}] ({task_name!r}) has {accountable_count} Accountable assignment(s), must be exactly 1")
        responsible_count = sum(1 for a in assignments if a["role"] == RESPONSIBLE)
        if responsible_count < 1:
            problems.append(f"tasks[{index}] ({task_name!r}) has zero Responsible assignments, must be at least 1")

    normalized_task_names = [_normalize_task_name(name) for name in task_names]
    duplicate_names = {task_names[i] for i, key in enumerate(normalized_task_names) if normalized_task_names.count(key) > 1}
    if duplicate_names:
        problems.append(f"task_name(s) {sorted(duplicate_names)} appear in more than one tasks[] entry, reintroducing responsibility ambiguity across entries")

    return _result("raci_content_integrity", not problems, [{"problems": problems}], validator, timestamp)


def evaluate_raci_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    """Both of the contract's real gates, in catalog order: the one declared ``quality`` property, then the
    independent content-integrity re-derivation. No ``evidence_labeling_required`` gate -- the contract sets
    that flag to ``false`` (see module docstring and strategy.bcg_matrix.contract.yaml's own identical "only
    emit gates for what is actually declared true" discipline)."""
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_raci_content_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
