"""``devops_sre.game_day`` -- thirty-fourth Method Atlas slice, NINTH from the `devops_sre` family (F19).

Atlas's own 5-phase formula (F19 tool table, L858: "scenario→roles→
inject→recover→AAR", benefit "驗證人與流程") grounds FOUR real invariants
this module enforces: (1) "roles" -- role names are unique (compared
after whitespace-collapse + casefold), because an exercise whose benefit
is verifying PEOPLE cannot have two entries ambiguously holding the same
role; (2) "recover" -- `time_to_recover_minutes` is REQUIRED when
`outcome: recovered` and FORBIDDEN when `outcome: not_recovered`
(deliberately BIDIRECTIONAL, unlike every prior one-directional
status-like field this session built -- a duration on a failed exercise
is not a conservative extra, it is a number that reads as success); (3)
the optional `recovery.runbook_execution_ref`, when present, carries the
`RunbookExecutionRecord` id prefix `RBEXEC-` -- the soft link
`devops_sre.runbook_execution`'s own OQ-RUNBOOKEXECUTION-2 asked for;
(4) "AAR" -- all four of Atlas F17 L804's own After Action Review
questions (Expected? Actual? Why? Next?) are answered, non-empty.

Like `devops_sre.runbook_execution` before it, this module was written
applying every "gate must re-validate the inputs its outputs depend on"
lesson this session's own history established, from the first draft:
shared predicates for EVERY precondition (record scalar fields, each
role's own key set, the recovery object's own key set, the aar object's
own key set, and every value rule) called by BOTH the builder and the
gate, with the builder additionally REBUILDING every nested object from
known fields so a caller's later mutation of its own input cannot reach
the stored record.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "devops_sre.game_day"
RECORD_ID_PREFIX = "GAMEDAY-"  # = typed-object schema id pattern; used only when the API auto-supplies record_id
VALID_OUTCOMES = frozenset({"recovered", "not_recovered"})
RUNBOOK_EXECUTION_REF_PREFIX = "RBEXEC-"
_KNOWN_ROLE_KEYS = frozenset({"role", "assignee"})
_REQUIRED_RECOVERY_KEYS = frozenset({"outcome"})
_KNOWN_RECOVERY_KEYS = frozenset({"outcome", "time_to_recover_minutes", "runbook_execution_ref"})
_KNOWN_AAR_KEYS = frozenset({"expected", "actual", "why", "next"})
_TIME_KEY = "time_to_recover_minutes"
_REF_KEY = "runbook_execution_ref"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _normalize_role_name(name: str) -> str:
    """Shared helper: collapse internal whitespace, strip, casefold -- so 'Incident Commander' and
    'incident  commander' compare equal for the uniqueness check while the stored value stays as supplied."""
    return " ".join(name.split()).casefold()


def _record_scalar_fields_are_valid(record_id: Any, scenario: Any, injected_failure: Any) -> bool:
    """Shared predicate: are the record's own id (identity) and its two free-text phase fields (scenario,
    injected_failure -- Atlas's own 'scenario' and 'inject' phases) all real, non-empty strings? Called by
    BOTH the builder's construction-time check and the gate's independent re-derivation."""
    return _is_nonempty_str(record_id) and _is_nonempty_str(scenario) and _is_nonempty_str(injected_failure)


def _role_is_valid(item: Any) -> bool:
    """Shared predicate: is one role entry fully valid -- exactly the two known keys, both non-empty strings?
    Called by BOTH the builder (which additionally rebuilds from known fields) and the gate (where this IS
    the only defense, since the gate does not rebuild anything)."""
    if not isinstance(item, dict) or set(item.keys()) != _KNOWN_ROLE_KEYS:
        return False
    return _is_nonempty_str(item.get("role")) and _is_nonempty_str(item.get("assignee"))


def _duplicate_role_names(roles: list[Any]) -> list[str]:
    """Shared predicate: which NORMALIZED role names (if any) appear more than once? Only well-shaped roles
    are considered (both callers validate every role first). Returns the normalized duplicates, sorted, or
    an empty list. Called by BOTH the builder and the gate."""
    seen: set[str] = set()
    duplicates: set[str] = set()
    for item in roles:
        if not _role_is_valid(item):
            continue
        name = _normalize_role_name(item["role"])
        if name in seen:
            duplicates.add(name)
        seen.add(name)
    return sorted(duplicates)


def _runbook_execution_ref_is_valid(ref: Any) -> bool:
    """Shared predicate: is a SUPPLIED runbook_execution_ref a non-empty string carrying the
    RunbookExecutionRecord id prefix? (Absence is handled by the caller -- the field is optional.) Format-only
    by design, see the method contract's own compilation_decisions."""
    return _is_nonempty_str(ref) and ref.startswith(RUNBOOK_EXECUTION_REF_PREFIX)


def _recovery_keys_are_known(recovery: Any) -> bool:
    """Shared predicate: is the recovery object a dict carrying `outcome` and NO key outside the three known
    ones? Called by BOTH layers -- the gate's only defense against an attacker-controlled extra field."""
    if not isinstance(recovery, dict):
        return False
    keys = set(recovery.keys())
    return _REQUIRED_RECOVERY_KEYS <= keys <= _KNOWN_RECOVERY_KEYS


def _recovery_is_valid(recovery: Any) -> bool:
    """Shared predicate: known keys only, a valid outcome, and -- if a runbook_execution_ref is PRESENT -- a
    valid one (a present-but-null or wrong-prefix ref is invalid, not 'absent'). Does NOT check the
    time/outcome coupling; see ``_recovery_time_is_consistent``. Called by BOTH the builder and the gate."""
    if not _recovery_keys_are_known(recovery):
        return False
    if recovery.get("outcome") not in VALID_OUTCOMES:
        return False
    if _REF_KEY in recovery and not _runbook_execution_ref_is_valid(recovery[_REF_KEY]):
        return False
    return True


def _recovery_time_is_consistent(recovery: dict[str, Any]) -> bool:
    """Shared predicate (precondition: ``_recovery_is_valid`` already true): time_to_recover_minutes is
    PRESENT and a non-negative int iff outcome is recovered, and ABSENT (key not present at all) iff outcome
    is not_recovered. Deliberately bidirectional -- see the method contract's own compilation_decisions.
    Called by BOTH the builder and the gate."""
    if recovery["outcome"] == "recovered":
        return _TIME_KEY in recovery and _is_nonnegative_int(recovery[_TIME_KEY])
    return _TIME_KEY not in recovery


def _aar_is_valid(aar: Any) -> bool:
    """Shared predicate: is the aar object a dict carrying EXACTLY Atlas F17 L804's four questions
    (expected/actual/why/next), every one answered with a non-empty string? Called by BOTH layers."""
    if not isinstance(aar, dict) or set(aar.keys()) != _KNOWN_AAR_KEYS:
        return False
    return all(_is_nonempty_str(aar[key]) for key in _KNOWN_AAR_KEYS)


def generate_game_day_record(
    record_id: str,
    scenario: str,
    roles: list[dict[str, Any]],
    injected_failure: str,
    recovery: dict[str, Any],
    aar: dict[str, Any],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/game-day-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: record_id/scenario/injected_failure non-empty, every role well-shaped with a
    known key set and unique (normalized) name, a well-shaped recovery whose time_to_recover_minutes is
    present iff recovered and whose runbook_execution_ref (if present) carries the RBEXEC- prefix, and an aar
    with all four questions answered. REBUILDS every nested object from known fields, accepting hand-built
    dicts as a legitimate input shape, re-validated here rather than assumed.
    """
    if not _record_scalar_fields_are_valid(record_id, scenario, injected_failure):
        raise InvariantViolation(
            f"GAMEDAY_EMPTY_RECORD_FIELD: record_id/scenario/injected_failure must all be non-empty strings, got {record_id!r}/{scenario!r}/{injected_failure!r}"
        )
    if not isinstance(roles, list) or not roles:
        raise InvariantViolation("GAMEDAY_NO_ROLES: methods/contracts/devops_sre.game_day.contract.yaml requires at least one role -- Atlas's own formula (F19 L858) names 'roles' as its second phase")

    rebuilt_roles: list[dict[str, Any]] = []
    for item in roles:
        if not _role_is_valid(item):
            raise InvariantViolation(f"GAMEDAY_INVALID_ROLE: {item!r} is not a valid role (unknown/missing keys, or empty role/assignee)")
        rebuilt_roles.append({"role": item["role"], "assignee": item["assignee"]})
    duplicates = _duplicate_role_names(rebuilt_roles)
    if duplicates:
        raise InvariantViolation(f"GAMEDAY_DUPLICATE_ROLE: role name(s) {duplicates} recorded more than once (compared after whitespace-collapse + casefold) -- an exercise verifying people cannot have an ambiguous role holder")

    if not _recovery_is_valid(recovery):
        raise InvariantViolation(f"GAMEDAY_INVALID_RECOVERY: {recovery!r} is not a valid recovery (unknown/missing keys, bad outcome, or a present runbook_execution_ref not carrying the {RUNBOOK_EXECUTION_REF_PREFIX!r} prefix)")
    if not _recovery_time_is_consistent(recovery):
        raise InvariantViolation(
            f"GAMEDAY_RECOVERY_TIME_MISMATCH: outcome={recovery['outcome']!r} but time_to_recover_minutes={recovery.get(_TIME_KEY, '<absent>')!r} -- "
            "a non-negative integer is REQUIRED when recovered and FORBIDDEN when not_recovered (Atlas's own 'recover' phase, F19 L858)"
        )
    rebuilt_recovery: dict[str, Any] = {"outcome": recovery["outcome"]}
    if _TIME_KEY in recovery:
        rebuilt_recovery[_TIME_KEY] = recovery[_TIME_KEY]
    if _REF_KEY in recovery:
        rebuilt_recovery[_REF_KEY] = recovery[_REF_KEY]

    if not _aar_is_valid(aar):
        raise InvariantViolation(f"GAMEDAY_INVALID_AAR: {aar!r} does not answer exactly Atlas F17 L804's four questions (expected/actual/why/next, all non-empty)")
    rebuilt_aar = {"expected": aar["expected"], "actual": aar["actual"], "why": aar["why"], "next": aar["next"]}

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "scenario": scenario,
        "roles": rebuilt_roles,
        "injected_failure": injected_failure,
        "recovery": rebuilt_recovery,
        "aar": rebuilt_aar,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_game_day_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id/scenario/
    injected_failure, well-shaped unique roles, a well-shaped recovery with a consistent time/outcome coupling
    and a valid ref if present, and a fully answered aar. Does not trust any stored value. FAILS CLOSED at
    every step on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("game_day_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _record_scalar_fields_are_valid(record.get("id"), record.get("scenario"), record.get("injected_failure")):
        return _result("game_day_integrity", False, [{"reason": "id/scenario/injected_failure missing or empty"}], validator, timestamp)

    roles = record.get("roles")
    if not isinstance(roles, list) or not roles:
        return _result("game_day_integrity", False, [{"reason": "roles missing, not a list, or empty"}], validator, timestamp)
    invalid_roles = [item for item in roles if not _role_is_valid(item)]
    if invalid_roles:
        return _result("game_day_integrity", False, [{"reason": "one or more roles is invalid (unknown/missing keys, or empty role/assignee)", "invalid_count": len(invalid_roles)}], validator, timestamp)
    duplicates = _duplicate_role_names(roles)
    if duplicates:
        return _result("game_day_integrity", False, [{"reason": "duplicate role name", "duplicate_role_names": duplicates}], validator, timestamp)

    recovery = record.get("recovery")
    if not _recovery_is_valid(recovery):
        return _result("game_day_integrity", False, [{"reason": "recovery invalid (unknown/missing keys, bad outcome, or malformed runbook_execution_ref)"}], validator, timestamp)
    if not _recovery_time_is_consistent(recovery):
        return _result("game_day_integrity", False, [{"reason": "recovery time_to_recover_minutes inconsistent with outcome", "outcome": recovery["outcome"], "time_present": _TIME_KEY in recovery}], validator, timestamp)

    aar = record.get("aar")
    if not _aar_is_valid(aar):
        return _result("game_day_integrity", False, [{"reason": "aar invalid (unknown/missing keys, or an unanswered question)"}], validator, timestamp)

    return _result(
        "game_day_integrity",
        True,
        [{"roles_recorded": len(roles), "outcome": recovery["outcome"], "runbook_execution_ref": recovery.get(_REF_KEY)}],
        validator,
        timestamp,
    )


def evaluate_game_day_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_game_day_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
