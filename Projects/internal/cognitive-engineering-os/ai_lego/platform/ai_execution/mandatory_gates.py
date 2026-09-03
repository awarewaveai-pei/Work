"""R3/R4 Mandatory Gate Injection (Atlas §14.2; ADR-004; ``policies/ai-execution/mandatory-gates.yaml``).

When a Workflow IR's ``risk_tier`` is R3 or R4, the two grounded high-risk
gates (``human_specialist_review``, ``recovery_rollback_rehearsal``) must be
present in the execution's gate results -- injected here, not silently
skipped. A local synthetic slice cannot genuinely exercise either (no human
specialist reviewer, no real rehearsed recovery run), so both are recorded
``NOT_APPLICABLE`` with an honest rationale -- schema-legal, and never
presented as PASS.
"""

from __future__ import annotations

from typing import Any

MANDATORY_TRIGGER_TIERS = {"R3", "R4"}
HIGH_RISK_GATE_IDS = ("human_specialist_review", "recovery_rollback_rehearsal")


def inject_mandatory_gates(risk_tier: str, validator: str, timestamp: str) -> list[dict[str, Any]]:
    if risk_tier not in MANDATORY_TRIGGER_TIERS:
        return []
    return [
        {
            "gate_id": gate_id,
            "status": "NOT_APPLICABLE",
            "evidence": [],
            "validator": validator,
            "timestamp": timestamp,
            "rationale": f"Local synthetic Phase 5 slice cannot genuinely exercise {gate_id} (no human specialist reviewer / no rehearsed recovery run available in this environment); injected per risk_tier={risk_tier} per ADR-004, not silently skipped.",
        }
        for gate_id in HIGH_RISK_GATE_IDS
    ]
