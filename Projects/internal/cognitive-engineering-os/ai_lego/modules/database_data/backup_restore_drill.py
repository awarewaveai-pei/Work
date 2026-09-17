"""``database_data.backup_restore_drill`` -- twenty-fifth Method Atlas slice, FIRST from the `database_data`
family.

Atlas §12.40's own purpose line (L3090, "證明備份不是「檔案存在」，而是
「可以在 RTO/RPO 內恢復成可用系統」" -- prove a backup is not just "a
file exists" but "restorable to a working system within RTO/RPO")
directly implies a real invariant this module enforces: a record cannot
claim ``status: passed`` unless ``integrity_checks_passed`` is true AND
``actual_recovery_duration_seconds`` does not exceed ``rto_target_seconds``
AND (if RPO is tracked) ``observed_data_age_seconds`` does not exceed
``rpo_target_seconds`` -- same "raise before construction on a real,
Atlas-implied structural rule" discipline every prior forbidden-state
guard this session built already established. This is ONE-DIRECTIONAL:
the reverse (``status: failed`` despite every criterion technically
passing) is a legal, real operational judgment call Atlas's own text
never forbids -- see the method contract's own preconditions.

``_drill_would_pass``/``_rpo_pairing_is_valid`` are the SHARED pure
predicates the builder's construction-time check and
``evaluate_pass_invariant_gate``'s independent re-derivation both call
-- one definition, two callers, so the two checks cannot silently drift
apart. A critic review of this slice's first draft found this sharing
was still incomplete: the gate re-derived the pass verdict but not the
RPO-pairing precondition itself, so deleting exactly one of
``rpo_target_seconds``/``observed_data_age_seconds`` from a record let a
real RPO failure hide behind a `status: passed` claim the gate still
accepted. Fixed by folding the pairing check into the same shared
predicate the gate calls. The critic also found the gate itself was
MORE restrictive than the builder (bidirectional status equivalence,
rejecting a legitimate conservative-failed record) -- fixed to match
the builder's one-directional semantics. Both classes of bug are the
same lesson ``devops_sre.error_budget``'s own critic-caught fix
(WORKLOG continuation 37) already taught this session: a gate that
re-reads a stored value, or that enforces a stricter rule than the
contract actually states, is not a genuine independent check.
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "database_data.backup_restore_drill"
RECORD_ID_PREFIX = "DRILL-"  # = typed-object schema id pattern; used only when the API auto-supplies record_id
VALID_STATUSES = frozenset({"passed", "failed"})


def _is_finite_number(value: Any) -> bool:
    """True iff value is a real number (not bool -- bool is technically an int subclass in Python but is never
    a legitimate seconds/duration value here) and finite (rejects NaN/inf, both realistic outputs of a
    malformed timing/metrics pipeline, not contrived inputs)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _rpo_pairing_is_valid(rpo_target_seconds: float | None, observed_data_age_seconds: float | None) -> bool:
    """True iff the RPO fields are in a legal state: BOTH absent (RPO not tracked), or BOTH present with
    rpo_target_seconds a finite number > 0 and observed_data_age_seconds a finite number >= 0. Shared by the
    builder's construction-time check and the gate's independent re-derivation -- same "one definition, two
    callers" discipline ``_drill_would_pass`` already applies to the pass/fail verdict itself. A record with
    exactly one of the two fields present is illegal under this predicate regardless of which one -- this is
    what closes the critic-caught gap where deleting only ``rpo_target_seconds`` (leaving
    ``observed_data_age_seconds`` behind as an orphaned, unexplained value) was accepted as "RPO not tracked".
    """
    if rpo_target_seconds is None and observed_data_age_seconds is None:
        return True
    if rpo_target_seconds is None or observed_data_age_seconds is None:
        return False
    if not (_is_finite_number(rpo_target_seconds) and rpo_target_seconds > 0):
        return False
    if not (_is_finite_number(observed_data_age_seconds) and observed_data_age_seconds >= 0):
        return False
    return True


def _drill_would_pass(
    *,
    integrity_checks_passed: bool,
    rto_target_seconds: float,
    actual_recovery_duration_seconds: float,
    rpo_target_seconds: float | None,
    observed_data_age_seconds: float | None,
) -> bool:
    """Pure predicate: does this combination of raw fields satisfy Atlas's own L3090 pass bar? Keyword-only
    arguments (post-critic-review) so a future parameter reorder cannot silently swap two same-typed values at
    either of this function's two call sites."""
    if not isinstance(integrity_checks_passed, bool) or not integrity_checks_passed:
        return False
    if not _is_finite_number(rto_target_seconds) or not _is_finite_number(actual_recovery_duration_seconds):
        return False
    if actual_recovery_duration_seconds > rto_target_seconds:
        return False
    if not _rpo_pairing_is_valid(rpo_target_seconds, observed_data_age_seconds):
        return False
    if rpo_target_seconds is not None and observed_data_age_seconds > rpo_target_seconds:
        return False
    return True


def generate_backup_restore_drill_record(
    record_id: str,
    backup_id: str,
    restore_environment: str,
    integrity_checks_passed: bool,
    rto_target_seconds: float,
    actual_recovery_duration_seconds: float,
    status: str,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
    rpo_target_seconds: float | None = None,
    observed_data_age_seconds: float | None = None,
    issues_recorded: list[str] | None = None,
) -> dict[str, Any]:
    """Instance of ``typed-objects/backup-restore-drill-record.schema.yaml``. Enforces the method contract's
    own preconditions fail-closed: backup_id/restore_environment non-empty, rto_target_seconds a finite number
    > 0, actual_recovery_duration_seconds a finite number >= 0, status valid, integrity_checks_passed a real
    bool, the RPO fields paired and individually valid (see ``_rpo_pairing_is_valid``), issues_recorded a real
    list of non-empty strings (not a bare string -- iterating a string yields its individual characters, which
    would silently destroy Atlas's own step 5 "記錄問題" content), and status:passed requires the full L3090
    pass bar (see ``_drill_would_pass``) -- ONE-DIRECTIONAL, status:failed despite passing criteria is legal.
    """
    if not backup_id or not backup_id.strip():
        raise InvariantViolation("BACKUPDRILL_EMPTY_BACKUP_ID: backup_id must be non-empty")
    if not restore_environment or not restore_environment.strip():
        raise InvariantViolation("BACKUPDRILL_EMPTY_RESTORE_ENVIRONMENT: restore_environment must be non-empty")
    if not isinstance(integrity_checks_passed, bool):
        raise InvariantViolation(f"BACKUPDRILL_INVALID_INTEGRITY_FLAG: integrity_checks_passed must be a real boolean, got {integrity_checks_passed!r}")
    if not (_is_finite_number(rto_target_seconds) and rto_target_seconds > 0):
        raise InvariantViolation(f"BACKUPDRILL_INVALID_RTO_TARGET: rto_target_seconds must be a finite number > 0, got {rto_target_seconds!r}")
    if not (_is_finite_number(actual_recovery_duration_seconds) and actual_recovery_duration_seconds >= 0):
        raise InvariantViolation(f"BACKUPDRILL_INVALID_DURATION: actual_recovery_duration_seconds must be a finite number >= 0, got {actual_recovery_duration_seconds!r}")
    if status not in VALID_STATUSES:
        raise InvariantViolation(f"BACKUPDRILL_INVALID_STATUS: {status!r} not in {sorted(VALID_STATUSES)}")
    if not _rpo_pairing_is_valid(rpo_target_seconds, observed_data_age_seconds):
        if rpo_target_seconds is not None and observed_data_age_seconds is None:
            raise InvariantViolation("BACKUPDRILL_RPO_WITHOUT_OBSERVED_AGE: rpo_target_seconds was supplied without observed_data_age_seconds")
        if observed_data_age_seconds is not None and rpo_target_seconds is None:
            raise InvariantViolation("BACKUPDRILL_OBSERVED_AGE_WITHOUT_RPO: observed_data_age_seconds was supplied without rpo_target_seconds")
        if rpo_target_seconds is not None and not (_is_finite_number(rpo_target_seconds) and rpo_target_seconds > 0):
            raise InvariantViolation(f"BACKUPDRILL_INVALID_RPO_TARGET: rpo_target_seconds must be a finite number > 0, got {rpo_target_seconds!r}")
        raise InvariantViolation(f"BACKUPDRILL_INVALID_DATA_AGE: observed_data_age_seconds must be a finite number >= 0, got {observed_data_age_seconds!r}")
    if issues_recorded is not None:
        if isinstance(issues_recorded, str) or not all(isinstance(item, str) and item.strip() for item in issues_recorded):
            raise InvariantViolation(f"BACKUPDRILL_INVALID_ISSUES_RECORDED: issues_recorded must be a list of non-empty strings (not a bare string -- iterating one splits it into characters), got {issues_recorded!r}")

    would_pass = _drill_would_pass(
        integrity_checks_passed=integrity_checks_passed,
        rto_target_seconds=rto_target_seconds,
        actual_recovery_duration_seconds=actual_recovery_duration_seconds,
        rpo_target_seconds=rpo_target_seconds,
        observed_data_age_seconds=observed_data_age_seconds,
    )
    if status == "passed" and not would_pass:
        raise InvariantViolation("BACKUPDRILL_FAILED_CRITERIA_CANNOT_PASS: Atlas's own purpose line (§12.40 L3090: restorable within RTO/RPO) forbids status:passed here")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "backup_id": backup_id,
        "restore_environment": restore_environment,
        "integrity_checks_passed": integrity_checks_passed,
        "rto_target_seconds": rto_target_seconds,
        "actual_recovery_duration_seconds": actual_recovery_duration_seconds,
        "issues_recorded": list(issues_recorded) if issues_recorded is not None else [],
        "status": status,
        "provenance": provenance,
    }
    if rpo_target_seconds is not None:
        record["rpo_target_seconds"] = rpo_target_seconds
    if observed_data_age_seconds is not None:
        record["observed_data_age_seconds"] = observed_data_age_seconds
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": record.get("provenance")}], validator, timestamp)


def evaluate_pass_invariant_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives the pass/fail verdict from the record's own raw fields via the SAME predicates the builder
    uses (``_drill_would_pass``, which itself calls ``_rpo_pairing_is_valid``) -- does not trust the stored
    ``status`` string, and does not trust that the RPO fields are still paired. ONE-DIRECTIONAL, matching the
    builder and the method contract's own preconditions: only ``status: passed`` while the recomputed verdict
    is False is a FAIL -- a conservative ``status: failed`` despite the recomputed verdict being True is
    legal and PASSES this gate (post-critic-review fix; the first draft wrongly required bidirectional
    equivalence)."""
    unverifiable_reason: str | None = None
    would_pass = False
    try:
        would_pass = _drill_would_pass(
            integrity_checks_passed=record["integrity_checks_passed"],
            rto_target_seconds=record["rto_target_seconds"],
            actual_recovery_duration_seconds=record["actual_recovery_duration_seconds"],
            rpo_target_seconds=record.get("rpo_target_seconds"),
            observed_data_age_seconds=record.get("observed_data_age_seconds"),
        )
    except (KeyError, TypeError, ValueError) as error:
        unverifiable_reason = f"{type(error).__name__}: {error}"

    stored_status = record.get("status")
    if unverifiable_reason is not None:
        passed = False
    else:
        passed = not (stored_status == "passed" and not would_pass)

    evidence = [
        {
            "stored_status": stored_status,
            "recomputed_would_pass": would_pass if unverifiable_reason is None else None,
            "unverifiable_reason": unverifiable_reason,
        }
    ]
    return _result("pass_invariant", passed, evidence, validator, timestamp)


def evaluate_backup_restore_drill_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_pass_invariant_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
