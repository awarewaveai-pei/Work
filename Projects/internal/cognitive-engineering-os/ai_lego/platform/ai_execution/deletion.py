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
    def __init__(
        self,
        request_id: str,
        subject_id: str | None,
        requested_at: str,
        *,
        deletion_type: str = "personal_data_crypto_shred",
        target_refs: list[str] | None = None,
    ) -> None:
        if not request_id.startswith("DEL-"):
            raise InvariantViolation("DELETION_REQUEST_ID_INVALID: must start with DEL-")
        if deletion_type not in {"personal_data_crypto_shred", "production_row"}:
            raise InvariantViolation(f"DELETION_TYPE_INVALID: {deletion_type!r}")
        if deletion_type == "personal_data_crypto_shred" and not isinstance(subject_id, str):
            raise InvariantViolation("DELETION_SUBJECT_ID_REQUIRED")
        if deletion_type == "production_row" and subject_id is not None:
            raise InvariantViolation("DELETION_PRODUCTION_ROW_SUBJECT_FORBIDDEN")
        normalized_refs = list(target_refs or [])
        if deletion_type == "production_row" and not normalized_refs:
            raise InvariantViolation("DELETION_PRODUCTION_ROW_TARGET_REQUIRED")
        if not all(isinstance(ref, str) and ref.strip() for ref in normalized_refs):
            raise InvariantViolation("DELETION_TARGET_REF_INVALID")
        self.request_id = request_id
        self.subject_id = subject_id
        self.requested_at = requested_at
        self.deletion_type = deletion_type
        self.target_refs = normalized_refs
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
            "deletion_type": self.deletion_type,
            "subject_id": self.subject_id,
            "target_refs": list(self.target_refs),
            "requested_at": self.requested_at,
            "steps": list(self.steps),
        }
