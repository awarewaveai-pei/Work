"""provenance_record -- the three orthogonal axes of ADR-004 (Shared Kernel noun).

Shape owned by ``specs/governance/epistemic-label.schema.yaml#/provenance_record``:
``epistemic_type`` (what kind of claim is this content), ``authorship_state``
(who produced / last touched it), ``locked`` (LOCKED_FACT only on SOURCE_FACT,
LOCKED_DECISION only on DECISION). Lives in ``core/domain`` because every
vertical carries it; no module may define its own copy.
"""

from __future__ import annotations

from typing import Any

EPISTEMIC_TYPES = frozenset(
    {"SOURCE_FACT", "EVIDENCE", "ASSUMPTION", "HYPOTHESIS", "AI_INFERENCE", "AI_SUGGESTION", "HUMAN_OPINION", "CALCULATED_RESULT", "SIMULATED_RESULT", "DECISION", "UNKNOWN"}
)
AUTHORSHIP_STATES = frozenset({"HUMAN_ORIGINAL", "AI_GENERATED", "AI_SUGGESTED", "HUMAN_EDITED", "HUMAN_APPROVED", "SOURCE_QUOTATION"})
LOCK_REQUIRES = {"LOCKED_FACT": "SOURCE_FACT", "LOCKED_DECISION": "DECISION"}


def make_provenance(epistemic_type: str, authorship_state: str, locked: str | None = None) -> dict[str, Any]:
    return {"epistemic_type": epistemic_type, "authorship_state": authorship_state, "locked": locked}


def provenance_is_valid(record: Any) -> bool:
    """Structural check mirroring the schema's enums AND its locked/epistemic coupling (allOf)."""
    if not isinstance(record, dict):
        return False
    epistemic = record.get("epistemic_type")
    authorship = record.get("authorship_state")
    locked = record.get("locked")
    if epistemic not in EPISTEMIC_TYPES or authorship not in AUTHORSHIP_STATES:
        return False
    if locked is None:
        return True
    return LOCK_REQUIRES.get(locked) == epistemic
