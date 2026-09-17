"""``devops_sre.rto_rpo`` -- thirty-eighth Method Atlas slice, THIRTEENTH and LAST member of the
`devops_sre` family (F19). F19 is now COMPLETE (13/13).

Atlas's own formula (F19 tool table, L860: "business impact→tiers→
architecture→drill", purpose "定義恢復時間/資料損失") grounds one field
per formula word, in formula order: `business_impact_statement`
("business impact"), `tier` ("tiers"), `system_or_component`
("architecture"), and an OPTIONAL `drill_ref` ("drill", a format-only
soft link into `database_data.backup_restore_drill`'s own output --
resolving that contract's own OQ-BACKUPDRILL-2). `rto_target_seconds`
and `rpo_target_seconds` are the NUMBERS this method's own purpose line
exists to define -- BOTH required here, unlike
`database_data.backup_restore_drill`'s own optional RPO pair (see the
method contract's own compilation_decisions for why).

No genuine-compute gate is reused here -- unlike
`devops_sre.capacity_model`/`load_test`/`stress_test`/`soak_test`, this
method performs no arithmetic; it is a structured definitional record,
the same class `devops_sre.game_day`/`devops_sre.runbook_execution`
already are (provenance_required + one integrity gate only).
"""

from __future__ import annotations

import math
from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "devops_sre.rto_rpo"
RECORD_ID_PREFIX = "RTORPO-"  # = typed-object schema id pattern; used only when the API auto-supplies record_id
DRILL_REF_PREFIX = "DRILL-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_real_number(value: Any) -> bool:
    """``bool`` is a subclass of ``int`` in Python -- excluded explicitly."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_finite_positive(value: Any) -> bool:
    return _is_real_number(value) and math.isfinite(value) and value > 0


def _drill_ref_is_valid(ref: Any) -> bool:
    """Shared predicate: is a SUPPLIED drill_ref a non-empty string carrying the
    database_data.backup_restore_drill id prefix? (Absence is handled by the caller -- the field is
    optional.) Format-only by design, see the method contract's own compilation_decisions.

    A critic review confirmed the ``_is_nonempty_str(ref)`` conjunct is a provably EQUIVALENT mutant of
    ``ref.startswith(DRILL_REF_PREFIX)`` alone (any string satisfying the prefix check is already >= 6
    non-whitespace characters) -- kept for symmetry with this module's other shared predicates and for
    defense-in-depth if ``DRILL_REF_PREFIX`` is ever shortened, not because it is independently load-bearing
    today."""
    return _is_nonempty_str(ref) and ref.startswith(DRILL_REF_PREFIX)


def generate_rto_rpo_record(
    record_id: str,
    system_or_component: str,
    business_impact_statement: str,
    tier: str,
    rto_target_seconds: float,
    rpo_target_seconds: float,
    drill_ref: str | None,
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/rto-rpo-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: record_id/system_or_component/business_impact_statement/tier all non-empty,
    both rto_target_seconds/rpo_target_seconds finite and strictly positive, and a supplied drill_ref carrying
    the DRILL- prefix."""
    if not _is_nonempty_str(record_id):
        raise InvariantViolation(f"RTORPO_EMPTY_RECORD_ID: record_id must be a non-empty string, got {record_id!r}")
    if not _is_nonempty_str(system_or_component):
        raise InvariantViolation(f"RTORPO_EMPTY_SYSTEM_OR_COMPONENT: system_or_component must be a non-empty string, got {system_or_component!r}")
    if not _is_nonempty_str(business_impact_statement):
        raise InvariantViolation(f"RTORPO_EMPTY_BUSINESS_IMPACT: business_impact_statement must be a non-empty string, got {business_impact_statement!r}")
    if not _is_nonempty_str(tier):
        raise InvariantViolation(f"RTORPO_EMPTY_TIER: tier must be a non-empty string, got {tier!r}")
    if not _is_finite_positive(rto_target_seconds):
        raise InvariantViolation(f"RTORPO_INVALID_RTO: rto_target_seconds must be a finite number > 0, got {rto_target_seconds!r}")
    if not _is_finite_positive(rpo_target_seconds):
        raise InvariantViolation(f"RTORPO_INVALID_RPO: rpo_target_seconds must be a finite number > 0, got {rpo_target_seconds!r}")
    if drill_ref is not None and not _drill_ref_is_valid(drill_ref):
        raise InvariantViolation(f"RTORPO_INVALID_DRILL_REF: drill_ref must be None or a non-empty string beginning with {DRILL_REF_PREFIX!r}, got {drill_ref!r}")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "system_or_component": system_or_component,
        "business_impact_statement": business_impact_statement,
        "tier": tier,
        "rto_target_seconds": rto_target_seconds,
        "rpo_target_seconds": rpo_target_seconds,
        "provenance": provenance,
    }
    if drill_ref is not None:
        record["drill_ref"] = drill_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_rto_rpo_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id/
    system_or_component/business_impact_statement/tier, both targets finite and strictly positive, and a
    valid drill_ref if present. Does not trust any stored value. FAILS CLOSED on malformed input rather than
    crashing."""
    if not isinstance(record, dict):
        return _result("rto_rpo_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")):
        return _result("rto_rpo_integrity", False, [{"reason": "id missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("system_or_component")):
        return _result("rto_rpo_integrity", False, [{"reason": "system_or_component missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("business_impact_statement")):
        return _result("rto_rpo_integrity", False, [{"reason": "business_impact_statement missing or empty"}], validator, timestamp)
    if not _is_nonempty_str(record.get("tier")):
        return _result("rto_rpo_integrity", False, [{"reason": "tier missing or empty"}], validator, timestamp)
    if not _is_finite_positive(record.get("rto_target_seconds")):
        return _result("rto_rpo_integrity", False, [{"reason": "rto_target_seconds missing or invalid"}], validator, timestamp)
    if not _is_finite_positive(record.get("rpo_target_seconds")):
        return _result("rto_rpo_integrity", False, [{"reason": "rpo_target_seconds missing or invalid"}], validator, timestamp)
    if "drill_ref" in record and not _drill_ref_is_valid(record.get("drill_ref")):
        return _result("rto_rpo_integrity", False, [{"reason": "drill_ref present but malformed (missing DRILL- prefix or empty)"}], validator, timestamp)

    return _result(
        "rto_rpo_integrity",
        True,
        [{"tier": record.get("tier"), "rto_target_seconds": record.get("rto_target_seconds"), "rpo_target_seconds": record.get("rpo_target_seconds"), "drill_ref": record.get("drill_ref")}],
        validator,
        timestamp,
    )


def evaluate_rto_rpo_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_rto_rpo_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
