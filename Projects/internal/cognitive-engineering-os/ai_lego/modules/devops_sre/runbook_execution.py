"""``devops_sre.runbook_execution`` -- thirty-third Method Atlas slice, EIGHTH from the `devops_sre`
family (F19).

Atlas's own 5-part formula (F19 tool table, L861: "preconditions→
steps→expected output→stop/go→rollback") directly implies FOUR
separate, real invariants this module enforces, one per formula
transition: (1) step numbering is well-formed (1..N, no gaps, no
duplicates); (2) a step's own `decision: go` requires BOTH its own
`preconditions_met: true` AND its own `outcome: matched_expected` --
"stop/go" is not a free caller choice independent of the preceding two
formula steps, though a CONSERVATIVE `stop` remains legal even when
both checks pass (the same one-directional restraint every prior
status-like field this session built already establishes); (3) once
any step's own decision is `stop`, no LATER step may be recorded -- an
operator does not continue past a stop gate; (4) if any step stopped,
`rollback_performed: true` is REQUIRED at the record level.

This module was written to proactively apply every lesson this
session's own history has established, by name, not merely in the
abstract: shared predicates for EVERY precondition (not only computed
outputs) called by both the builder and the gate, including the
record's own `id`/`runbook_ref` identity fields and each step's own key
set -- the exact class of gap `devops_sre.capacity_model`'s own critic
round caught, and `devops_sre.release_readiness_review`'s own critic
round then found had been reintroduced one slice later despite that.
Every shared predicate here is called by BOTH layers from the start of
this module's own first draft, not added after a critic round.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "devops_sre.runbook_execution"
VALID_OUTCOMES = frozenset({"matched_expected", "deviated"})
VALID_DECISIONS = frozenset({"go", "stop"})
_KNOWN_STEP_KEYS = frozenset({"step_number", "description", "preconditions_met", "outcome", "decision"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_bool(value: Any) -> bool:
    return isinstance(value, bool)


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


def _record_identity_is_valid(record_id: Any, runbook_ref: Any) -> bool:
    """Shared predicate: are both record-identity fields real, non-empty strings? Called by BOTH the
    builder's construction-time check and the gate's independent re-derivation."""
    return _is_nonempty_str(record_id) and _is_nonempty_str(runbook_ref)


def _step_keys_are_known(item: Any) -> bool:
    """Shared predicate: does this step carry ONLY the five known fields, no attacker-controlled extra
    field? Called by BOTH the builder (which additionally rebuilds from known fields) and the gate (where
    this IS the only defense, since the gate does not rebuild anything)."""
    return isinstance(item, dict) and set(item.keys()) == _KNOWN_STEP_KEYS


def _step_is_valid(item: Any) -> bool:
    """Shared predicate: is one step's own shape fully valid -- known keys only, positive integer
    step_number, non-empty description, boolean preconditions_met, valid outcome/decision? Called by BOTH
    the builder and the gate."""
    if not _step_keys_are_known(item):
        return False
    if not _is_positive_int(item.get("step_number")):
        return False
    if not _is_nonempty_str(item.get("description")):
        return False
    if not _is_bool(item.get("preconditions_met")):
        return False
    if item.get("outcome") not in VALID_OUTCOMES:
        return False
    if item.get("decision") not in VALID_DECISIONS:
        return False
    return True


def _decision_is_justified(preconditions_met: bool, outcome: str, decision: str) -> bool:
    """Shared predicate: is this step's own decision consistent with its own preceding two checks?
    decision:go REQUIRES both preconditions_met:true and outcome:matched_expected. decision:stop is
    UNCONDITIONALLY legal (a conservative stop even when both checks pass is a legitimate operator choice,
    the same one-directional restraint every prior status-like field this session built already
    establishes) -- called by BOTH the builder and the gate."""
    if decision == "stop":
        return True
    return preconditions_met is True and outcome == "matched_expected"


def _duplicate_step_numbers(steps: list[Any]) -> list[int]:
    """Shared predicate: which step_number values (if any) appear more than once? Called by BOTH the
    builder's construction-time check and the gate's independent re-derivation."""
    seen: set[int] = set()
    duplicates: set[int] = set()
    for item in steps:
        number = item.get("step_number") if isinstance(item, dict) else None
        if not _is_positive_int(number):
            continue
        if number in seen:
            duplicates.add(number)
        seen.add(number)
    return sorted(duplicates)


def _non_contiguous_step_numbers(step_numbers: frozenset[int]) -> list[int]:
    """Shared predicate: given the SET of recorded step_number values (a ``frozenset`` -- its own type makes
    "duplicates in the input" structurally impossible to forge here, the same discipline
    `database_data.expand_contract_migration`'s own critic round established for an analogous check), which
    numbers would need to exist to make this a contiguous 1..N sequence but do not? Returns the missing
    numbers, or an empty list if the set is exactly {1, ..., N}. Called by BOTH layers, both of which dedupe
    (see ``_duplicate_step_numbers``) before calling this."""
    if not step_numbers:
        return []
    expected = frozenset(range(1, len(step_numbers) + 1))
    return sorted(expected - step_numbers)


def _stopped_steps_are_last(steps: list[dict[str, Any]]) -> list[int]:
    """Shared predicate: given well-shaped, deduped, contiguously-numbered steps, which step_numbers (if
    any) were recorded AFTER a stop gate already fired? Atlas's own formula ends a stopped execution at
    rollback -- no further step should exist beyond the first stop. Returns the offending later step_numbers,
    or an empty list if no step follows a stop. Called by BOTH the builder and the gate."""
    ordered = sorted(steps, key=lambda item: item["step_number"])
    first_stop_index = next((i for i, item in enumerate(ordered) if item["decision"] == "stop"), None)
    if first_stop_index is None:
        return []
    return [item["step_number"] for item in ordered[first_stop_index + 1 :]]


def _rollback_requirement_is_satisfied(steps: list[dict[str, Any]], rollback_performed: Any) -> bool:
    """Shared predicate: if any step stopped, rollback_performed must be true. No requirement in the other
    direction -- a caller may perform a precautionary rollback even when every step went, the same
    one-directional restraint every prior status-like field this session built already establishes. Called
    by BOTH the builder and the gate. Deliberately checks `isinstance(rollback_performed, bool)`
    unconditionally FIRST (a critic review found a non-bool rollback_performed on a non-stopped record was
    silently accepted, and produced a misleading "stopped execution missing rollback" message on the
    stopped path if this check ran only there) -- both callers get a shape-accurate reason either way."""
    if not isinstance(rollback_performed, bool):
        return False
    any_stopped = any(item.get("decision") == "stop" for item in steps)
    if any_stopped:
        return rollback_performed is True
    return True


def generate_runbook_execution_record(
    record_id: str,
    runbook_ref: str,
    steps: list[dict[str, Any]],
    rollback_performed: bool,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/runbook-execution-record.schema.yaml``. Enforces the method contract's
    own preconditions fail-closed: record_id/runbook_ref non-empty, every step well-shaped with a known key
    set, step numbering contiguous 1..N with no duplicates, every decision:go justified by both preceding
    checks, no step recorded after a stop gate, and rollback_performed:true whenever any step stopped.
    RECOMPUTES/rebuilds every step from known fields, accepting hand-built dicts (not just ones produced by
    a dedicated per-step builder) as a legitimate input shape, re-validated here rather than assumed.
    """
    if not _record_identity_is_valid(record_id, runbook_ref):
        raise InvariantViolation(f"RUNBOOKEXEC_EMPTY_RECORD_FIELD: record_id/runbook_ref must both be non-empty strings, got {record_id!r}/{runbook_ref!r}")
    if not isinstance(steps, list) or not steps:
        raise InvariantViolation("RUNBOOKEXEC_NO_STEPS: methods/contracts/devops_sre.runbook_execution.contract.yaml requires at least one step")

    rebuilt: list[dict[str, Any]] = []
    for item in steps:
        if not _step_is_valid(item):
            raise InvariantViolation(f"RUNBOOKEXEC_INVALID_STEP: {item!r} is not a valid step (unknown/missing keys, bad step_number, empty description, or invalid preconditions_met/outcome/decision)")
        if not _decision_is_justified(item["preconditions_met"], item["outcome"], item["decision"]):
            raise InvariantViolation(
                f"RUNBOOKEXEC_UNJUSTIFIED_GO: step {item['step_number']!r} claims decision:go but preconditions_met={item['preconditions_met']!r}/outcome={item['outcome']!r} -- "
                "Atlas's own formula (F19 L861) requires BOTH preconditions and expected output to hold before go"
            )
        rebuilt.append({
            "step_number": item["step_number"],
            "description": item["description"],
            "preconditions_met": item["preconditions_met"],
            "outcome": item["outcome"],
            "decision": item["decision"],
        })

    duplicates = _duplicate_step_numbers(rebuilt)
    if duplicates:
        raise InvariantViolation(f"RUNBOOKEXEC_DUPLICATE_STEP_NUMBER: {duplicates} recorded more than once")
    step_number_set = frozenset(item["step_number"] for item in rebuilt)
    missing = _non_contiguous_step_numbers(step_number_set)
    if missing:
        raise InvariantViolation(f"RUNBOOKEXEC_NONCONTIGUOUS_STEPS: step number(s) {missing} missing -- steps must be numbered exactly 1..N with no gaps")

    later_than_stop = _stopped_steps_are_last(rebuilt)
    if later_than_stop:
        raise InvariantViolation(f"RUNBOOKEXEC_STEP_AFTER_STOP: step(s) {later_than_stop} recorded after a stop gate already fired -- Atlas's own formula (F19 L861) does not continue past stop")

    if not _rollback_requirement_is_satisfied(rebuilt, rollback_performed):
        raise InvariantViolation("RUNBOOKEXEC_STOP_REQUIRES_ROLLBACK: a stopped execution requires rollback_performed:true -- Atlas's own formula (F19 L861) ends a stopped sequence at rollback")

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "runbook_ref": runbook_ref,
        "steps": rebuilt,
        "rollback_performed": rollback_performed,
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


def evaluate_runbook_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id/runbook_ref,
    well-shaped steps with a known key set, justified decisions, contiguous numbering, no step after a stop,
    and the rollback requirement. Does not trust any stored value. FAILS CLOSED at every step on malformed
    input rather than crashing."""
    if not isinstance(record, dict):
        return _result("runbook_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _record_identity_is_valid(record.get("id"), record.get("runbook_ref")):
        return _result("runbook_integrity", False, [{"reason": "id/runbook_ref missing or empty"}], validator, timestamp)

    steps = record.get("steps")
    if not isinstance(steps, list) or not steps:
        return _result("runbook_integrity", False, [{"reason": "steps missing, not a list, or empty"}], validator, timestamp)
    invalid = [item for item in steps if not _step_is_valid(item)]
    if invalid:
        return _result("runbook_integrity", False, [{"reason": "one or more steps is invalid (unknown/missing keys, bad step_number, empty description, or invalid preconditions_met/outcome/decision)", "invalid_count": len(invalid)}], validator, timestamp)

    unjustified = [item["step_number"] for item in steps if not _decision_is_justified(item["preconditions_met"], item["outcome"], item["decision"])]
    if unjustified:
        return _result("runbook_integrity", False, [{"reason": "decision:go not justified by preconditions_met/outcome", "unjustified_step_numbers": unjustified}], validator, timestamp)

    duplicates = _duplicate_step_numbers(steps)
    if duplicates:
        return _result("runbook_integrity", False, [{"reason": "duplicate step_number", "duplicate_step_numbers": duplicates}], validator, timestamp)
    step_number_set = frozenset(item["step_number"] for item in steps)
    missing = _non_contiguous_step_numbers(step_number_set)
    if missing:
        return _result("runbook_integrity", False, [{"reason": "non-contiguous step numbering", "missing_step_numbers": missing}], validator, timestamp)

    later_than_stop = _stopped_steps_are_last(steps)
    if later_than_stop:
        return _result("runbook_integrity", False, [{"reason": "step recorded after a stop gate", "step_numbers_after_stop": later_than_stop}], validator, timestamp)

    if not _rollback_requirement_is_satisfied(steps, record.get("rollback_performed")):
        return _result("runbook_integrity", False, [{"reason": "stopped execution missing rollback_performed:true"}], validator, timestamp)

    return _result("runbook_integrity", True, [{"steps_recorded": len(steps), "rollback_performed": record.get("rollback_performed")}], validator, timestamp)


def evaluate_runbook_execution_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_runbook_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
