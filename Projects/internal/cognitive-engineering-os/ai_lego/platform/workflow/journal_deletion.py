"""Policy-gated lifecycle for deleting an encrypted Workflow journal object."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Mapping

from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.deletion import DeletionRequestBuilder, DELETION_STEPS


PolicyCheck = Callable[[], bool]
Timestamp = Callable[[], str]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def delete_journal_object(
    protector: Any,
    stored_reference: Mapping[str, Any],
    request_id: str,
    subject_id: str,
    requested_at: str,
    checks: Mapping[str, PolicyCheck],
    now: Timestamp = utc_now_iso,
) -> dict[str, Any]:
    """Run the common deletion checks, delete one object, and verify it cannot restore.

    ``checks`` is deliberately required and explicit: this function does not guess legal holds,
    retention expiry, dependencies, or approval. A failed check raises before the protector's
    delete method is reached. The returned record uses the existing EC §31 builder shape.
    """
    required_checks = {
        "Authorization": "authorization",
        "Legal Hold Check": "legal_hold",
        "Retention Check": "retention",
        "Dependency Check": "dependency",
        "Dry Run": "dry_run",
        "Count / Scope Preview": "scope_preview",
        "Approval": "approval",
    }
    missing = [name for name, key in required_checks.items() if key not in checks or not callable(checks[key])]
    if missing:
        raise InvariantViolation(f"JOURNAL_DELETION_CHECKS_MISSING: {', '.join(missing)}")
    builder = DeletionRequestBuilder(request_id, subject_id, requested_at)
    evidence = lambda step: f"workflow-deletion://{request_id}/{step.lower().replace(' ', '-')}"
    for step, key in required_checks.items():
        try:
            passed = bool(checks[key]())
        except Exception as error:
            raise InvariantViolation(f"JOURNAL_DELETION_POLICY_ERROR: {step}") from error
        if not passed:
            raise InvariantViolation(f"JOURNAL_DELETION_POLICY_BLOCKED: {step}")
        builder.record(step, now(), evidence(step))

    try:
        protector.delete(stored_reference)
    except Exception as error:
        raise InvariantViolation("JOURNAL_DELETION_FAILED") from error
    builder.record("Deletion", now(), evidence("Deletion"))

    try:
        protector.restore(stored_reference)
    except InvariantViolation:
        builder.record("Verification", now(), evidence("Verification"))
    else:
        raise InvariantViolation("JOURNAL_DELETION_VERIFICATION_FAILED: object remained restorable")
    builder.record("Deletion Evidence", now(), evidence("Deletion Evidence"))
    record = builder.build()
    if [step["step"] for step in record["steps"]] != list(DELETION_STEPS):
        raise InvariantViolation("JOURNAL_DELETION_STEP_SEQUENCE_INVALID")
    return record
