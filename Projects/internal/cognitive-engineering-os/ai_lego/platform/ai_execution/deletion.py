"""EC §31 Data Deletion Contract -- the 10-step ``deletion_request`` record, built as the steps actually happen.

Shape owned by ``specs/execution/data-deletion.schema.yaml#/deletion_request``.
The builder refuses out-of-order steps and non-monotonic timestamps, so the
record can only ever describe the real chronology (Approval before Deletion,
Deletion at the destruction instant, Deletion Evidence after the
``PersonalDataRedacted`` event).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.support import parse_timestamp
from ai_lego.errors import InvariantViolation

DELETION_STEPS = (
    "Authorization",
    "Legal Hold Check",
    "Retention Check",
    "Dependency Check",
    "Dry Run",
    "Count / Scope Preview",
    "Approval",
    "Deletion",
    "Verification",
    "Deletion Evidence",
)


class DeletionRequestBuilder:
    def __init__(self, request_id: str, subject_id: str, requested_at: str) -> None:
        if not request_id.startswith("DEL-"):
            raise InvariantViolation("DELETION_REQUEST_ID_INVALID: must start with DEL-")
        self.request_id = request_id
        self.subject_id = subject_id
        self.requested_at = requested_at
        self.steps: list[dict[str, Any]] = []

    def record(self, step: str, completed_at: str, evidence_ref: str) -> None:
        expected = DELETION_STEPS[len(self.steps)] if len(self.steps) < len(DELETION_STEPS) else None
        if step != expected:
            raise InvariantViolation(f"DELETION_STEP_OUT_OF_ORDER: got {step!r}, expected {expected!r}")
        previous = self.steps[-1]["completed_at"] if self.steps else self.requested_at
        if parse_timestamp(completed_at) < parse_timestamp(previous):
            raise InvariantViolation(f"DELETION_STEP_TIME_REGRESSION: {step} at {completed_at} before {previous}")
        self.steps.append({"step": step, "status": "passed", "completed_at": completed_at, "evidence_ref": evidence_ref})

    def build(self) -> dict[str, Any]:
        missing = [step for step in DELETION_STEPS[len(self.steps):]]
        if missing:
            raise InvariantViolation(f"DELETION_STEPS_INCOMPLETE: {', '.join(missing)}")
        return {
            "request_id": self.request_id,
            "deletion_type": "personal_data_crypto_shred",
            "subject_id": self.subject_id,
            "target_refs": [],
            "requested_at": self.requested_at,
            "steps": list(self.steps),
        }
