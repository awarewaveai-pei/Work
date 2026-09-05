"""``database_data.data_contract`` -- fortieth Method Atlas slice, SIXTH member of the `database_data`
family (F21). Directly closes `database_data.erd`'s own `OQ-ERD-4`.

Atlas gives this method its own dedicated §11.49 section AND an F21 tool
table row: the table's own usage string ("schema→semantics→quality/SLO
→ownership→compatibility") is a compressed restatement of §11.49's own
fuller seven-step formula ("Schema→Semantics→Owner→Freshness→Quality→
Compatibility→Deprecation") -- the table compresses BOTH "Freshness" and
"Quality" into one hyphenated "quality/SLO" token and omits "Deprecation"
entirely. §11.49's own formula is treated as authoritative here.

FOUR optional fields are format-only soft links to sibling records this
session already built, reused by reference rather than re-modeled:
``schema_ref`` (ERD-, `database_data.erd`, resolving OQ-ERD-4),
``freshness_ref`` (SLO-, `devops_sre.sli_slo`, whose own metric_type
enum already includes "freshness" -- the exact word Atlas's own formula
names), ``compatibility_ref`` (ECMIG-, `database_data
.expand_contract_migration`, resolving the DB Migration recipe's own
L1113 "Data Contract→Compatibility→Expand/Contract" pairing), and
``deprecation_ref`` (DEP-, `specs/execution/deprecation-pipeline
.schema.yaml`, whose own object_type enum includes "Schema"). None of
these referenced records is inspected -- format-only, the same declared
limit every prior soft-link field in this package already carries.

``fields[]`` (the "Schema" step) is a DISTINCT three-key shape from
`database_data.erd`'s own attribute $def -- {name, data_type, nullable},
not {name, data_type, is_primary_key} -- deliberately, since nullability
and primary-key status are different concerns (see method contract
compilation_decisions). "Quality" has no structured link yet (no metric
_type value matches it in devops_sre.sli_slo) and stays free text,
forward-pointing to a still-unbuilt `database_data
.data_quality_dimensions` (OQ-DC-2).

No genuine-compute gate is reused here -- like `database_data.erd`, this
method performs no arithmetic; it is a structured, cross-referentially-
validated record (provenance_required + one integrity gate only).
``provenance`` is stored BY REFERENCE, not rebuilt -- the same family-
wide convention every prior module in this package already follows.
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "database_data.data_contract"
_KNOWN_FIELD_KEYS = frozenset({"name", "data_type", "nullable"})
RECORD_ID_PREFIX = "DC-"
SCHEMA_REF_PREFIX = "ERD-"
FRESHNESS_REF_PREFIX = "SLO-"
COMPATIBILITY_REF_PREFIX = "ECMIG-"
DEPRECATION_REF_PREFIX = "DEP-"


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _nonempty_str_list_is_valid(value: Any) -> bool:
    """Shared predicate: a list (possibly empty) of non-empty strings. Called by BOTH the builder and the
    gate for quality_notes (see the dedicated wrapper below for consumers/fields, which may NOT be empty)."""
    return isinstance(value, list) and all(_is_nonempty_str(v) for v in value)


def _consumers_are_valid(value: Any) -> bool:
    """Shared predicate: at least 1 entry, every entry a non-empty string, entries unique. Called by BOTH the
    builder and the gate."""
    if not isinstance(value, list) or not value:
        return False
    if not all(_is_nonempty_str(v) for v in value):
        return False
    return len(value) == len(set(value))


def _field_is_valid(field: Any) -> bool:
    """Shared predicate: exactly the three known keys, name/data_type non-empty strings, nullable a real
    bool. Called by BOTH the builder (which additionally rebuilds from known fields) and the gate."""
    if not isinstance(field, dict) or set(field.keys()) != _KNOWN_FIELD_KEYS:
        return False
    return _is_nonempty_str(field["name"]) and _is_nonempty_str(field["data_type"]) and isinstance(field["nullable"], bool)


def _fields_are_valid(fields: Any) -> bool:
    """Shared predicate: at least 1 entry, each shape-valid, field names unique across the whole record
    (case-sensitive exact match -- see method contract compilation_decisions). Called by BOTH the builder
    and the gate."""
    if not isinstance(fields, list) or not fields:
        return False
    if not all(_field_is_valid(f) for f in fields):
        return False
    names = [f["name"] for f in fields]
    return len(names) == len(set(names))


def _soft_ref_is_valid(ref: Any, prefix: str) -> bool:
    """Shared predicate: is a SUPPLIED soft-link ref a non-empty string carrying the given prefix? (Absence
    is handled by the caller -- every soft-link field in this record is optional.) Format-only by design,
    see method contract compilation_decisions. Called by BOTH the builder and the gate."""
    return _is_nonempty_str(ref) and ref.startswith(prefix)


def generate_data_contract_record(
    record_id: str,
    dataset_or_topic: str,
    producer: str,
    consumers: list[str],
    fields: list[dict[str, Any]],
    semantics: str,
    quality_notes: list[str],
    compatibility_policy: str,
    provenance: dict[str, Any],
    *,
    schema_ref: str | None = None,
    freshness_ref: str | None = None,
    compatibility_ref: str | None = None,
    deprecation_ref: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/data-contract-record.schema.yaml``. Enforces the method contract's own
    preconditions fail-closed: record_id non-empty AND carrying this record's own DC- prefix, version a
    real string, dataset_or_topic/producer/semantics/compatibility_policy non-empty, consumers a non-empty
    list of unique non-empty strings, fields a non-empty list of shape-valid entries with unique names,
    quality_notes a list (may be empty) of non-empty strings, and every supplied soft-link ref carrying its
    own required prefix. ADDED post-critic-review: record_id's own DC- prefix and version's own type are now
    checked here AND re-derived by the integrity gate below, symmetric with the four outbound soft-link ref
    checks -- a first-draft asymmetry left them schema-layer-only, which a critic review's own mutation
    probe caught (a record minted with id="ERD-1" passed both runtime gates). REBUILDS every nested object
    it owns (consumers/fields/quality_notes) from known fields; provenance is stored by reference, the same
    family-wide convention every prior module in this package already follows."""
    for field_name, value in (("dataset_or_topic", dataset_or_topic), ("producer", producer), ("semantics", semantics), ("compatibility_policy", compatibility_policy)):
        if not _is_nonempty_str(value):
            raise InvariantViolation(f"DATACONTRACT_EMPTY_RECORD_FIELD: {field_name} must be a non-empty string, got {value!r}")
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"DATACONTRACT_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"DATACONTRACT_INVALID_VERSION: version must be a string, got {version!r}")
    if not _consumers_are_valid(consumers):
        raise InvariantViolation(f"DATACONTRACT_INVALID_CONSUMERS: consumers must be a non-empty list of unique, non-empty strings, got {consumers!r}")
    if not _fields_are_valid(fields):
        raise InvariantViolation(f"DATACONTRACT_INVALID_FIELDS: fields must be a non-empty list of well-shaped entries (known keys name/data_type/nullable, non-empty name/data_type, real bool nullable) with unique names, got {fields!r}")
    if not _nonempty_str_list_is_valid(quality_notes):
        raise InvariantViolation(f"DATACONTRACT_INVALID_QUALITY_NOTES: quality_notes must be a list of non-empty strings, got {quality_notes!r}")
    for ref_name, ref_value, prefix in (
        ("schema_ref", schema_ref, SCHEMA_REF_PREFIX),
        ("freshness_ref", freshness_ref, FRESHNESS_REF_PREFIX),
        ("compatibility_ref", compatibility_ref, COMPATIBILITY_REF_PREFIX),
        ("deprecation_ref", deprecation_ref, DEPRECATION_REF_PREFIX),
    ):
        if ref_value is not None and not _soft_ref_is_valid(ref_value, prefix):
            raise InvariantViolation(f"DATACONTRACT_INVALID_SOFT_REF: {ref_name} must be None or a non-empty string beginning with {prefix!r}, got {ref_value!r}")

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "dataset_or_topic": dataset_or_topic,
        "producer": producer,
        "consumers": list(consumers),
        "fields": [{"name": f["name"], "data_type": f["data_type"], "nullable": f["nullable"]} for f in fields],
        "semantics": semantics,
        "quality_notes": list(quality_notes),
        "compatibility_policy": compatibility_policy,
        "provenance": provenance,
    }
    if schema_ref is not None:
        record["schema_ref"] = schema_ref
    if freshness_ref is not None:
        record["freshness_ref"] = freshness_ref
    if compatibility_ref is not None:
        record["compatibility_ref"] = compatibility_ref
    if deprecation_ref is not None:
        record["deprecation_ref"] = deprecation_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_data_contract_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    DC- prefix), a real string version, dataset_or_topic/producer/semantics/compatibility_policy, well-shaped
    consumers (non-empty, unique), well-shaped fields (non-empty, unique names), valid quality_notes, and
    every present soft-link ref carrying its own required prefix. Does not trust any stored value. FAILS
    CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("data_contract_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("data_contract_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("data_contract_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    for field_name in ("dataset_or_topic", "producer", "semantics", "compatibility_policy"):
        if not _is_nonempty_str(record.get(field_name)):
            return _result("data_contract_integrity", False, [{"reason": f"{field_name} missing or empty"}], validator, timestamp)

    if not _consumers_are_valid(record.get("consumers")):
        return _result("data_contract_integrity", False, [{"reason": "consumers invalid (empty, malformed, non-string entry, or duplicate name)"}], validator, timestamp)

    if not _fields_are_valid(record.get("fields")):
        return _result("data_contract_integrity", False, [{"reason": "fields invalid (empty, malformed entry, unknown keys, or duplicate field name)"}], validator, timestamp)

    if not _nonempty_str_list_is_valid(record.get("quality_notes")):
        return _result("data_contract_integrity", False, [{"reason": "quality_notes invalid (not a list, or contains a non-string/empty entry)"}], validator, timestamp)

    for ref_name, prefix in (
        ("schema_ref", SCHEMA_REF_PREFIX),
        ("freshness_ref", FRESHNESS_REF_PREFIX),
        ("compatibility_ref", COMPATIBILITY_REF_PREFIX),
        ("deprecation_ref", DEPRECATION_REF_PREFIX),
    ):
        if ref_name in record and not _soft_ref_is_valid(record.get(ref_name), prefix):
            return _result("data_contract_integrity", False, [{"reason": f"{ref_name} present but malformed (missing {prefix!r} prefix or empty)"}], validator, timestamp)

    return _result(
        "data_contract_integrity",
        True,
        [{"consumer_count": len(record["consumers"]), "field_count": len(record["fields"]), "quality_note_count": len(record["quality_notes"])}],
        validator,
        timestamp,
    )


def evaluate_data_contract_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_data_contract_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
