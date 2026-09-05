"""``database_data.retention_deletion_model`` -- forty-third Method Atlas slice, NINTH and FINAL member of
the `database_data` family (F21). F21's own TEN-row table (L899-908) is now fully accounted for: nine built
machine_ids (this one included) plus one remaining row, Schema Compatibility Analysis (L903), investigated
and found to be ALREADY FULLY COVERED by
`database_data.expand_contract_migration`'s own `compatibility_analysis` stage (stage 3 of its own 15-stage
EC §28 sequence) -- confirmed by direct read, not a separate build candidate.

Atlas's own F21 tool table formula (L906: "data class→purpose→
retention→deletion→exception→proof") plus Master Plan §114 Records
Retention / Legal Hold / eDiscovery (L4711-4735: five named hold types
-- legal_hold/regulatory_hold/research_hold/contractual_hold/
user_deletion_request -- plus a Policy-Engine conflict-resolution
requirement, "衝突時...並產生理由") ground this record.

A STRUCTURAL POLICY record (provenance_required + one integrity gate),
NOT genuine compute -- deliberately: see the method contract's own
compilation_decisions for why a live "eligible for deletion now" check
(which would depend on wall-clock time at evaluation) is out of scope.

The real invariant: whenever MORE THAN ONE `holds[]` entry has
`active: true`, `conflict_resolution` is REQUIRED (a non-empty string)
-- directly implementing MP §114's own conflict-resolution requirement.
With 0 or 1 active holds, `conflict_resolution` MUST be absent.

This record's own `id` (`RDM-` prefix) and `version` (a real string)
are checked at BOTH the builder and the gate FROM THIS FIRST DRAFT,
the same discipline every `database_data` module since `database_data
.normalization`'s own critic round already establishes.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "database_data.retention_deletion_model"
RECORD_ID_PREFIX = "RDM-"
SCHEMA_REF_PREFIX = "ERD-"
DELETION_EVIDENCE_REF_PREFIX = "DEL-"
VALID_HOLD_TYPES = frozenset({"legal_hold", "regulatory_hold", "research_hold", "contractual_hold", "user_deletion_request"})
_KNOWN_HOLD_KEYS = frozenset({"hold_type", "reason", "active"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _hold_is_valid(entry: Any) -> bool:
    """Shared predicate: exactly the three known keys, hold_type a legal MP §114 enum value, reason a
    non-empty string, active a real bool. Called by BOTH the builder and the gate."""
    if not isinstance(entry, dict) or set(entry.keys()) != _KNOWN_HOLD_KEYS:
        return False
    return entry["hold_type"] in VALID_HOLD_TYPES and _is_nonempty_str(entry["reason"]) and isinstance(entry["active"], bool)


def _holds_are_valid(holds: Any) -> bool:
    """Shared predicate: a list (may be empty), every entry shape-valid. Called by BOTH the builder and the
    gate."""
    return isinstance(holds, list) and all(_hold_is_valid(h) for h in holds)


def _active_hold_count(holds: list[dict[str, Any]]) -> int:
    return sum(1 for h in holds if h["active"])


def _conflict_resolution_is_consistent(holds: list[dict[str, Any]], has_conflict_resolution: bool, conflict_resolution: Any) -> bool:
    """Shared predicate (precondition: holds already shape-valid): conflict_resolution is REQUIRED (a
    non-empty string, KEY PRESENT) iff more than one hold is active; the KEY MUST BE ABSENT otherwise --
    directly implements MP §114's own 'Policy Engine 決定，並產生理由' requirement for simultaneous
    conflicting holds, and refuses an invented resolution for a non-conflict. Takes an explicit
    ``has_conflict_resolution`` flag (critic-caught Minor: a first-draft version used
    ``record.get("conflict_resolution")`` alone, which returns None for BOTH 'key absent' and 'key present
    with an explicit null value' -- indistinguishable without a separate presence check, silently letting an
    explicit `conflict_resolution: null` in a 0/1-active-hold record pass the gate while the schema layer
    alone caught it). Called by BOTH the builder and the gate."""
    active_count = _active_hold_count(holds)
    if active_count > 1:
        return has_conflict_resolution and _is_nonempty_str(conflict_resolution)
    return not has_conflict_resolution


def _soft_ref_is_valid(ref: Any, prefix: str) -> bool:
    """Shared predicate: is a SUPPLIED soft-link ref a non-empty string carrying the given prefix? (Absence
    is handled by the caller -- both soft-link fields in this record are optional.) Format-only by design.
    Called by BOTH the builder and the gate."""
    return _is_nonempty_str(ref) and ref.startswith(prefix)


def generate_retention_deletion_model_record(
    record_id: str,
    data_class: str,
    purpose: str,
    retention_rule: str,
    deletion_trigger: str,
    holds: list[dict[str, Any]],
    compliance_evidence: str,
    provenance: dict[str, Any],
    *,
    conflict_resolution: str | None = None,
    schema_ref: str | None = None,
    deletion_evidence_ref: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/retention-deletion-model-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed: record_id (RDM- prefix)/data_class/purpose/retention_rule/
    deletion_trigger/compliance_evidence non-empty, version a real string, holds a list (may be empty) of
    well-shaped entries, conflict_resolution required iff more than one hold is active (and absent
    otherwise), and every supplied soft-link ref carrying its own required prefix. REBUILDS every nested
    object it owns; provenance is stored by reference, the same family-wide convention every prior module in
    this package already follows."""
    for field_name, value in (
        ("data_class", data_class),
        ("purpose", purpose),
        ("retention_rule", retention_rule),
        ("deletion_trigger", deletion_trigger),
        ("compliance_evidence", compliance_evidence),
    ):
        if not _is_nonempty_str(value):
            raise InvariantViolation(f"RETENTIONDELETION_EMPTY_RECORD_FIELD: {field_name} must be a non-empty string, got {value!r}")
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"RETENTIONDELETION_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"RETENTIONDELETION_INVALID_VERSION: version must be a string, got {version!r}")
    if not _holds_are_valid(holds):
        raise InvariantViolation(f"RETENTIONDELETION_INVALID_HOLDS: every entry must have known keys (hold_type/reason/active), hold_type in {sorted(VALID_HOLD_TYPES)}, non-empty reason, and a real bool active, got {holds!r}")
    if not _conflict_resolution_is_consistent(holds, conflict_resolution is not None, conflict_resolution):
        raise InvariantViolation(
            f"RETENTIONDELETION_INVALID_CONFLICT_RESOLUTION: conflict_resolution must be a non-empty string when more than one hold is active ({_active_hold_count(holds)} active here), and must be absent (None) otherwise, got {conflict_resolution!r}"
        )
    if schema_ref is not None and not _soft_ref_is_valid(schema_ref, SCHEMA_REF_PREFIX):
        raise InvariantViolation(f"RETENTIONDELETION_INVALID_SOFT_REF: schema_ref must be None or a non-empty string beginning with {SCHEMA_REF_PREFIX!r}, got {schema_ref!r}")
    if deletion_evidence_ref is not None and not _soft_ref_is_valid(deletion_evidence_ref, DELETION_EVIDENCE_REF_PREFIX):
        raise InvariantViolation(f"RETENTIONDELETION_INVALID_SOFT_REF: deletion_evidence_ref must be None or a non-empty string beginning with {DELETION_EVIDENCE_REF_PREFIX!r}, got {deletion_evidence_ref!r}")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "data_class": data_class,
        "purpose": purpose,
        "retention_rule": retention_rule,
        "deletion_trigger": deletion_trigger,
        "holds": [{"hold_type": h["hold_type"], "reason": h["reason"], "active": h["active"]} for h in holds],
        "compliance_evidence": compliance_evidence,
        "provenance": provenance,
    }
    if conflict_resolution is not None:
        record["conflict_resolution"] = conflict_resolution
    if schema_ref is not None:
        record["schema_ref"] = schema_ref
    if deletion_evidence_ref is not None:
        record["deletion_evidence_ref"] = deletion_evidence_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_retention_deletion_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    RDM- prefix), a real string version, data_class/purpose/retention_rule/deletion_trigger/
    compliance_evidence, well-shaped holds, conflict_resolution consistency with the active-hold count, and
    every present soft-link ref. Does not trust any stored value. FAILS CLOSED on malformed input rather
    than crashing."""
    if not isinstance(record, dict):
        return _result("retention_deletion_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("retention_deletion_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("retention_deletion_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    for field_name in ("data_class", "purpose", "retention_rule", "deletion_trigger", "compliance_evidence"):
        if not _is_nonempty_str(record.get(field_name)):
            return _result("retention_deletion_integrity", False, [{"reason": f"{field_name} missing or empty"}], validator, timestamp)

    holds = record.get("holds")
    if not _holds_are_valid(holds):
        return _result("retention_deletion_integrity", False, [{"reason": "holds invalid (malformed entry, unknown keys, illegal hold_type value, or non-bool active)"}], validator, timestamp)
    if not _conflict_resolution_is_consistent(holds, "conflict_resolution" in record, record.get("conflict_resolution")):
        return _result(
            "retention_deletion_integrity",
            False,
            [{"reason": "conflict_resolution inconsistent with the active-hold count", "active_hold_count": _active_hold_count(holds), "conflict_resolution": record.get("conflict_resolution")}],
            validator,
            timestamp,
        )

    for ref_name, prefix in (("schema_ref", SCHEMA_REF_PREFIX), ("deletion_evidence_ref", DELETION_EVIDENCE_REF_PREFIX)):
        if ref_name in record and not _soft_ref_is_valid(record.get(ref_name), prefix):
            return _result("retention_deletion_integrity", False, [{"reason": f"{ref_name} present but malformed (missing {prefix!r} prefix or empty)"}], validator, timestamp)

    return _result(
        "retention_deletion_integrity",
        True,
        [{"hold_count": len(holds), "active_hold_count": _active_hold_count(holds)}],
        validator,
        timestamp,
    )


def evaluate_retention_deletion_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_retention_deletion_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
