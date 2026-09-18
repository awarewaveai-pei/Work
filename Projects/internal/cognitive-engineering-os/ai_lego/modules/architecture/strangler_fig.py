"""``architecture.strangler_fig`` -- nineteenth Method Atlas slice, eighth from the `architecture` family (F18's
own "Software Architecture Pack"). Each slice references a real seam -- a structurally-necessary cross-reference,
same class ``architecture.system_context_model``'s own container/component reference already established.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "architecture.strangler_fig"
RECORD_ID_PREFIX = "SFP-"
# Value MUST match typed-objects/strangler-fig-plan.schema.yaml's own `id` pattern (`^SFP-`) -- NOT a
# mechanical transliteration of the method name (critic-caught 2026-09-18: this line originally said
# "STRANGLERFIG-", which the canonical schema does not declare; see the same-day WORKLOG entry for the other
# modules this exact mistake was found in). Not load-bearing for API auto-injection (identity param is the
# domain-specific plan_id, not `record_id`) -- exists only for the dashboard's opt-in id-suggest button. See
# atam.py's own RECORD_ID_PREFIX comment for the full rationale (2026-09-18), not repeated in every sibling
# file.
VALID_STATUSES = frozenset({"planned", "verified", "expanded", "retired"})


def generate_strangler_fig_plan(
    plan_id: str,
    legacy_system_under_migration: str,
    seams: list[dict[str, Any]],
    slices: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/strangler-fig-plan.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: at least 1 seam, at least 1 slice, every slice references a real seam and a valid
    status."""
    if not seams:
        raise InvariantViolation("SFP_NO_SEAMS: at least 1 required")
    if not slices:
        raise InvariantViolation("SFP_NO_SLICES: at least 1 required")

    seam_ids = {s["id"] for s in seams}
    unknown_seams = sorted({sl["seam_id"] for sl in slices} - seam_ids)
    if unknown_seams:
        raise InvariantViolation(f"SFP_UNKNOWN_SEAM_IN_SLICE: {unknown_seams} not in seams")

    invalid_statuses = sorted({sl["status"] for sl in slices} - VALID_STATUSES)
    if invalid_statuses:
        raise InvariantViolation(f"SFP_INVALID_STATUS: {invalid_statuses} not in {sorted(VALID_STATUSES)}")

    return {
        "id": plan_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "legacy_system_under_migration": legacy_system_under_migration,
        "seams": list(seams),
        "slices": list(slices),
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(plan: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    passed = provenance_is_valid(plan.get("provenance"))
    return _result("provenance_required", passed, [{"provenance": plan.get("provenance")}], validator, timestamp)


def evaluate_slice_seam_integrity_gate(plan: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-checks the seam cross-reference invariant structurally on any record handed to it -- not just trusting
    the builder's own construction-time check already ran."""
    seam_ids = {s["id"] for s in plan.get("seams", [])}
    unknown = sorted({sl["seam_id"] for sl in plan.get("slices", [])} - seam_ids)
    return _result("slice_seam_integrity", not unknown, [{"unknown_seams_referenced": unknown}], validator, timestamp)


def evaluate_strangler_fig_plan_gates(plan: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(plan, validator, timestamp),
        evaluate_slice_seam_integrity_gate(plan, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
