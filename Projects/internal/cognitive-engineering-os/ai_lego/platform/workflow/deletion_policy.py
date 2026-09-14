"""Provider-neutral deletion policy decision boundary.

The policy engine owns the meaning of each decision (jurisdiction, holds,
retention schedule, and authorization).  This module deliberately does not
infer any of those facts; it validates that every required decision is an
explicit, typed observation before the deletion workflow can consume it.
"""

from __future__ import annotations

from typing import Any, Mapping

from ai_lego.core.support import parse_timestamp
from ai_lego.errors import InvariantViolation


POLICY_DECISION_KEYS = (
    "authorization",
    "legal_hold",
    "retention",
    "dependency",
    "dry_run",
    "scope_preview",
    "approval",
)


def _nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _validate_decision(decision: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(decision, Mapping):
        raise InvariantViolation("DELETION_POLICY_DECISION_INVALID: expected mapping")
    missing = [key for key in (*POLICY_DECISION_KEYS, "decision_ref", "evaluated_at") if key not in decision]
    if missing:
        raise InvariantViolation(f"DELETION_POLICY_DECISION_MISSING: {', '.join(missing)}")
    invalid = [key for key in POLICY_DECISION_KEYS if type(decision[key]) is not bool]
    if invalid:
        raise InvariantViolation(f"DELETION_POLICY_DECISION_BOOLEAN_REQUIRED: {', '.join(invalid)}")
    if not _nonempty_string(decision["decision_ref"]):
        raise InvariantViolation("DELETION_POLICY_DECISION_REF_INVALID")
    if not _nonempty_string(decision["evaluated_at"]):
        raise InvariantViolation("DELETION_POLICY_DECISION_TIMESTAMP_INVALID")
    try:
        parse_timestamp(decision["evaluated_at"])
    except Exception as error:
        raise InvariantViolation("DELETION_POLICY_DECISION_TIMESTAMP_INVALID") from error
    return {key: decision[key] for key in (*POLICY_DECISION_KEYS, "decision_ref", "evaluated_at")}


def evaluate_deletion_policy(decision: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and normalize one explicit policy-engine decision.

    ``True`` means the named prerequisite was positively established by the
    caller's authoritative policy source.  In particular, ``retention=True``
    is not calculated from a free-form retention string or the local wall
    clock, and ``legal_hold=True`` is not inferred from absent data.
    """
    normalized = _validate_decision(decision)
    blocked_steps = [key for key in POLICY_DECISION_KEYS if not normalized[key]]
    return {
        "status": "PASS" if not blocked_steps else "BLOCKED",
        "decision_ref": normalized["decision_ref"],
        "evaluated_at": normalized["evaluated_at"],
        "steps": {key: {"status": "PASS" if normalized[key] else "BLOCKED"} for key in POLICY_DECISION_KEYS},
        "blocked_steps": blocked_steps,
    }


def policy_checks(decision: Mapping[str, Any]) -> dict[str, Any]:
    """Adapt a validated decision to the existing deletion orchestration seam."""
    normalized = _validate_decision(decision)
    return {key: (lambda value=normalized[key]: value) for key in POLICY_DECISION_KEYS}
