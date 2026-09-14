"""Policy-gated lifecycle for deleting an encrypted Workflow journal object."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Mapping

from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.deletion import DeletionRequestBuilder, DELETION_STEPS
from ai_lego.platform.workflow.deletion_policy import policy_checks


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
    checks: Mapping[str, PolicyCheck] | None = None,
    now: Timestamp = utc_now_iso,
    *,
    policy_decision: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the common deletion checks, delete one object, and verify it cannot restore.

    ``checks`` is deliberately required and explicit: this function does not guess legal holds,
    retention expiry, dependencies, or approval. A failed check raises before the protector's
    delete method is reached. The returned record uses the existing EC §31 builder shape.
    """
    if checks is not None and policy_decision is not None:
        raise InvariantViolation("JOURNAL_DELETION_POLICY_INPUTS_AMBIGUOUS")
    if policy_decision is not None:
        checks = policy_checks(policy_decision)
    if checks is None:
        raise InvariantViolation("JOURNAL_DELETION_POLICY_INPUTS_MISSING")
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
    cas_path = stored_reference.get("cas_path") if isinstance(stored_reference, Mapping) else None
    if not isinstance(cas_path, Mapping) or not isinstance(cas_path.get("hash"), str) or not cas_path["hash"].strip():
        raise InvariantViolation("JOURNAL_DELETION_TARGET_INVALID")
    policy_ref = policy_decision.get("decision_ref") if policy_decision is not None else None
    evidence = lambda step: (
        f"policy-decision://{policy_ref}/{step.lower().replace(' ', '-')}"
        if policy_ref is not None
        else f"workflow-deletion://{request_id}/{step.lower().replace(' ', '-')}"
    )
    completed_policy_steps: list[tuple[str, str]] = []
    for step, key in required_checks.items():
        try:
            passed = bool(checks[key]())
        except Exception as error:
            raise InvariantViolation(f"JOURNAL_DELETION_POLICY_ERROR: {step}") from error
        if not passed:
            raise InvariantViolation(f"JOURNAL_DELETION_POLICY_BLOCKED: {step}")
        completed_policy_steps.append((step, now()))

    # This operation unlinks one CAS object and proves it is no longer restorable.
    # It is production-row/object deletion, not DEK destruction or crypto-shred.
    builder = DeletionRequestBuilder(
        request_id,
        None,
        requested_at,
        deletion_type="production_row",
        target_refs=[f"cas-sha256:{cas_path['hash']}"],
    )
    for step, completed_at in completed_policy_steps:
        builder.record(step, completed_at, evidence(step))

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
