"""Rollback plan (EC §20; ``specs/execution/rollback.schema.yaml``), required before ROLLBACK_VALIDATED.

The recovery mechanism this record describes is real, not decorative: the
pre-deletion key-vault snapshot plus the independent-destruction-record
replay gate (``security/key_vault/local_key_vault.py``) IS this slice's
rollback capability for the KNOWLEDGE_SNAPSHOT/PROMPT layers. Post-launch
recovery is honestly marked not possible (ADR-002/ADR-003 precedent: a
crypto-shredded subject cannot be un-shredded).
"""

from __future__ import annotations

from typing import Any


def build_rollback_plan(plan_id: str, task_id: str, execution_id: str, recovery_point: dict[str, Any]) -> dict[str, Any]:
    return {
        "plan_id": plan_id,
        "task_id": task_id,
        "execution_id": execution_id,
        "targets_validated_before_execution": True,
        "rollback_capable_layers": [
            {"layer": "PROMPT", "capable": True, "note": "PromptVersionRollback event + per-version ThemeSet retained in the projection"},
            {"layer": "KNOWLEDGE_SNAPSHOT", "capable": True, "note": "pre-deletion key-vault snapshot + independent destruction-record replay gate"},
            {"layer": "WORKFLOW", "capable": False, "note": "Workflow IR is compiled fresh each run from the versioned Recipe; not independently rolled back"},
            {"layer": "APPLICATION", "capable": False, "note": "no deployed application surface in this local slice"},
            {"layer": "MODEL", "capable": False, "note": "no model registry in this slice; STT adapter selection is a CLI flag, not a rollback target"},
            {"layer": "SCHEMA", "capable": False, "note": "runtime does not modify the read-only spec root"},
            {"layer": "POLICY", "capable": False, "note": "no policy engine in this slice"},
        ],
        "strategy": {"value": {"database": "restore from pre-deletion snapshot, then independent-destruction-record replay"}},
        "trigger_conditions": ["operator-initiated: restore a pre-deletion snapshot", "restore-replay gate FAILED"],
        "recovery_point": recovery_point,
        "validation": {"tested": True, "environment": "local-isolated"},
        "owner": "synthetic-local-slice",
        "max_recovery_time": "seconds (in-process replay)",
        "reversibility": {
            "pre_launch": {"possible": True, "note": "before any deletion, the whole runtime dir can simply be reset (--reset)"},
            "post_launch": {
                "possible": False,
                "note": "a crypto-shredded subject cannot be un-shredded (ADR-002 invariant); this is by design, not a gap",
                "compensation_plan": "none: erasure is the intended terminal state for the subject",
                "recovery_plan": "restore the pre-deletion snapshot and replay independent destruction records to confirm re-erasure (see restore_event)",
                "explicit_authority": "A4 explicit_human_authority (same authorization as the original deletion)",
            },
        },
    }
