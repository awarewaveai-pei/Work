"""``database_data.schema_compatibility_analysis`` -- Method Atlas slice, TENTH member of the
`database_data` family (F21, "資料庫／資料套件"), closing F21 10/10.

Atlas's F21 table row (L903) redirects its own step sequence to Execution Contract
§28 ("精確步驟序列見 Execution Contract §28（唯一正本），本節僅說明概念與適用場景")
-- the same one-line redirect `database_data.expand_contract_migration`'s own
contract already disclosed as its OWN thinnest-possible citation. Real due-diligence
question before writing this module (not skipped): is "Schema Compatibility
Analysis" a genuinely distinct method, or already fully subsumed by
`database_data.expand_contract_migration` (whose own `STAGE_SEQUENCE` names
`compatibility_analysis` as stage 3 of 15) or `database_data.data_contract` (whose
own `compatibility_policy` field covers Atlas §11.49's "Compatibility" formula
step)? Both already-built siblings were read in full before this module was
written:

- `expand_contract_migration.py`'s own `compatibility_analysis` stage is a
  PRESENCE-AND-TIMESTAMP checkpoint (`{stage_id, completed_at, evidence_ref?}`) --
  it records THAT the step happened and WHEN, never WHAT was actually checked.
- `data_contract.py`'s own `compatibility_policy` is a free-text POLICY STATEMENT
  (plus an optional `compatibility_ref` soft link to an expand_contract_migration
  record) -- a caller-asserted sentence, not a computed classification.

Neither performs the substantive analysis Atlas's own benefit column names
("支援零停機 migration"): given a set of concrete schema changes, classify EACH one
into a closed compatible/breaking vocabulary, and derive the migration's own
OVERALL verdict from those classifications, independent of caller assertion. This
is confirmed a REAL gap, not a duplicate -- see the method contract's own
`compilation_decisions` for the full comparison, and contrast with this session's
own precedent for the OPPOSITE finding (`architecture.trade_off_matrix`, a
contract-only reuse of `decision.mcda`'s field-for-field-identical pipeline --
Schema Compatibility Analysis has no such field-for-field twin among its 9 already-
built `database_data` siblings). Atlas's own Quick Reference table (L4482: "DB
Migration | Schema Compatibility | Expand–Contract | Breaking ALTER") independently
confirms the same conclusion by listing "Schema Compatibility" and "Expand–Contract"
as two DIFFERENT named tools for the same scenario, not one tool under two labels.

Two real invariant classes, each enforced BOTH at construction (raise BEFORE any
record is built) AND independently by a gate that re-derives from raw fields, same
"shared predicate, reused by both layers" discipline every sibling module in this
suite already establishes:

1. `changes[]` shape and uniqueness: at least 1 entry, each a well-shaped
   `{change_type, target, notes?}` dict, `change_type` one of
   `ai_lego.compute.schema_compatibility.classification.KNOWN_CHANGE_TYPES` (a
   closed, disclosed vocabulary -- see that module's own docstring), `target` a
   non-empty string, no two entries sharing the exact same `(change_type, target)`
   pair (a literal duplicate recorded change is meaningless, same
   dedup-by-shared-predicate class `expand_contract_migration.py`'s own
   `_duplicate_stage_ids` already establishes -- `target` itself is NOT required
   unique, since one real migration legitimately applies MULTIPLE DIFFERENT
   changes to the same column, e.g. narrow_type + tighten_nullable_to_not_null on
   the same target, disclosed in the method contract's own compilation_decisions).
2. `change_classifications`/`overall_verdict` are GENUINE_COMPUTE, NOT accepted
   parameters -- always computed fresh via
   `ai_lego.compute.schema_compatibility.classification.classify_changes` /
   `aggregate_overall_verdict`, re-derived (never trusted from a stored value) by
   the independent gate, same `security.attack_tree`-own `root_aggregate` /
   `association.morphological_analysis`-own `legal_combinations` two-layer
   discipline this session's own precedent already establishes for a lookup-and-
   reduce (rather than numeric) genuine-compute shape.
"""

from __future__ import annotations

from typing import Any

from ai_lego.compute.schema_compatibility.classification import (
    KNOWN_CHANGE_TYPES,
    VALID_COMPATIBILITY_CLASSES,
    VALID_OVERALL_VERDICTS,
    aggregate_overall_verdict,
    classify_changes,
)
from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.errors import InvariantViolation

METHOD_ID = "database_data.schema_compatibility_analysis"
RECORD_ID_PREFIX = "SCA-"
MIGRATION_REF_PREFIX = "ECMIG-"
_KNOWN_CHANGE_KEYS = frozenset({"change_type", "target", "notes"})
_REQUIRED_CHANGE_KEYS = frozenset({"change_type", "target"})


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_known_change_type(value: Any) -> bool:
    """isinstance guard FIRST: an unhashable change_type (a list/dict, from a rehydrated malformed record)
    would otherwise raise TypeError out of `in KNOWN_CHANGE_TYPES` instead of failing closed -- the exact bug
    class `expand_contract_migration.py`'s own `_is_known_stage_id` already fixed for stage_id."""
    return isinstance(value, str) and value in KNOWN_CHANGE_TYPES


def _change_is_valid(entry: Any) -> bool:
    """Shared predicate: a dict with exactly `change_type`/`target` required and `notes` optional (no other
    keys), a known `change_type`, a non-empty `target`, and -- when present -- a non-empty `notes`. Called by
    BOTH the builder and the gate."""
    if not isinstance(entry, dict) or not set(entry.keys()) <= _KNOWN_CHANGE_KEYS or not _REQUIRED_CHANGE_KEYS <= entry.keys():
        return False
    if not _is_known_change_type(entry.get("change_type")):
        return False
    if not _is_nonempty_str(entry.get("target")):
        return False
    if "notes" in entry and not _is_nonempty_str(entry["notes"]):
        return False
    return True


def _changes_are_shape_valid(changes: Any) -> bool:
    """Shared predicate: a non-empty list of shape-valid change entries. Called by BOTH the builder and the
    gate."""
    return isinstance(changes, list) and bool(changes) and all(_change_is_valid(entry) for entry in changes)


def _duplicate_change_keys(changes: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """Shared predicate: which `(change_type, target)` pairs (if any) appear more than once? `target` alone
    is deliberately NOT the dedup key -- one real migration legitimately applies multiple DIFFERENT changes to
    the same target (see method contract's own compilation_decisions); only a LITERAL repeat of the same
    change on the same target is refused. Called by BOTH the builder's construction-time check and the gate's
    independent re-derivation. Precondition: every entry already passed `_change_is_valid`."""
    seen: set[tuple[str, str]] = set()
    duplicates: set[tuple[str, str]] = set()
    for entry in changes:
        key = (entry["change_type"], entry["target"])
        if key in seen:
            duplicates.add(key)
        seen.add(key)
    return sorted(duplicates)


def _rebuild_change(entry: dict[str, Any]) -> dict[str, Any]:
    """REBUILDS a change entry from known fields only -- the same family-wide 'rebuild, don't alias'
    discipline every sibling module in this suite already follows (e.g. `expand_contract_migration.py`'s own
    stage rebuild), so a hand-built dict with an attacker-controlled extra field cannot survive into the
    constructed record. Precondition: entry already passed `_change_is_valid`."""
    clean: dict[str, Any] = {"change_type": entry["change_type"], "target": entry["target"]}
    if "notes" in entry:
        clean["notes"] = entry["notes"]
    return clean


def generate_schema_compatibility_analysis_record(
    record_id: str,
    subject: str,
    changes: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    migration_ref: str | None = None,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/schema-compatibility-analysis-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed: record_id (SCA- prefix)/subject non-empty, version a real
    string, changes a non-empty list of shape-valid entries with no literal (change_type, target) duplicate,
    and migration_ref (when supplied) a non-empty string carrying its own required ECMIG- prefix.
    ``change_classifications``/``overall_verdict`` are NOT parameters -- always computed fresh via
    ``ai_lego.compute.schema_compatibility.classification``, so there is no code path through which a caller
    could construct a record whose stored verdict disagrees with its own changes[]. REBUILDS every change
    entry it owns; provenance is stored by reference, the same family-wide convention every prior
    `database_data` module already follows."""
    if not _is_nonempty_str(record_id) or not record_id.startswith(RECORD_ID_PREFIX):
        raise InvariantViolation(f"SCHEMACOMPAT_INVALID_RECORD_ID: record_id must be a non-empty string beginning with {RECORD_ID_PREFIX!r}, got {record_id!r}")
    if not _is_nonempty_str(subject):
        raise InvariantViolation(f"SCHEMACOMPAT_EMPTY_SUBJECT: subject must be a non-empty string, got {subject!r}")
    if not isinstance(version, str):
        raise InvariantViolation(f"SCHEMACOMPAT_INVALID_VERSION: version must be a string, got {version!r}")
    if migration_ref is not None and (not _is_nonempty_str(migration_ref) or not migration_ref.startswith(MIGRATION_REF_PREFIX)):
        raise InvariantViolation(f"SCHEMACOMPAT_INVALID_MIGRATION_REF: migration_ref, when present, must be a non-empty string beginning with {MIGRATION_REF_PREFIX!r}, got {migration_ref!r}")
    if not isinstance(changes, list) or not changes:
        raise InvariantViolation("SCHEMACOMPAT_NO_CHANGES: methods/contracts/database_data.schema_compatibility_analysis.contract.yaml requires at least one schema change")
    if not _changes_are_shape_valid(changes):
        raise InvariantViolation(
            f"SCHEMACOMPAT_INVALID_CHANGE_SHAPE: every change must be a dict with change_type (one of {sorted(KNOWN_CHANGE_TYPES)}) and a non-empty target, "
            f"an optional non-empty notes, and no other keys, got {changes!r}"
        )

    rebuilt = [_rebuild_change(entry) for entry in changes]
    duplicates = _duplicate_change_keys(rebuilt)
    if duplicates:
        raise InvariantViolation(f"SCHEMACOMPAT_DUPLICATE_CHANGE: {duplicates} (change_type, target) pair(s) recorded more than once")

    change_classifications = classify_changes(rebuilt)
    overall_verdict = aggregate_overall_verdict(change_classifications)

    record: dict[str, Any] = {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "subject": subject,
        "changes": rebuilt,
        "change_classifications": change_classifications,
        "overall_verdict": overall_verdict,
        "provenance": provenance,
    }
    if migration_ref is not None:
        record["migration_ref"] = migration_ref
    return record


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    if not isinstance(record, dict):
        return _result("provenance_required", False, [{"reason": "record is not a dict"}], validator, timestamp)
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_schema_compatibility_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw fields -- valid id (non-empty,
    SCA- prefix), a real string version, subject, well-shaped changes with no literal duplicate, a
    well-formed migration_ref when present -- AND RECOMPUTES ``change_classifications``/``overall_verdict``
    fresh via ``ai_lego.compute.schema_compatibility.classification``, comparing against the stored values.
    Does not trust any stored value, including the stored verdict -- the ``genuine_compute`` guarantee this
    gate exists to prove. FAILS CLOSED on malformed input rather than crashing."""
    if not isinstance(record, dict):
        return _result("schema_compatibility_integrity", False, [{"reason": "record is not a dict"}], validator, timestamp)
    if not _is_nonempty_str(record.get("id")) or not record.get("id", "").startswith(RECORD_ID_PREFIX):
        return _result("schema_compatibility_integrity", False, [{"reason": f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}"}], validator, timestamp)
    if not isinstance(record.get("version"), str):
        return _result("schema_compatibility_integrity", False, [{"reason": "version missing or not a string"}], validator, timestamp)
    if not _is_nonempty_str(record.get("subject")):
        return _result("schema_compatibility_integrity", False, [{"reason": "subject missing or empty"}], validator, timestamp)

    migration_ref = record.get("migration_ref")
    if migration_ref is not None and (not _is_nonempty_str(migration_ref) or not migration_ref.startswith(MIGRATION_REF_PREFIX)):
        return _result("schema_compatibility_integrity", False, [{"reason": f"migration_ref present but malformed (missing {MIGRATION_REF_PREFIX!r} prefix or empty)"}], validator, timestamp)

    changes = record.get("changes")
    if not _changes_are_shape_valid(changes):
        return _result("schema_compatibility_integrity", False, [{"reason": "changes invalid (empty, not a list, malformed entry, unknown change_type, or empty target/notes)"}], validator, timestamp)

    duplicates = _duplicate_change_keys(changes)
    if duplicates:
        return _result("schema_compatibility_integrity", False, [{"reason": "duplicate (change_type, target) pair(s)", "duplicate_change_keys": [list(pair) for pair in duplicates]}], validator, timestamp)

    recomputed_classifications = classify_changes(changes)
    stored_classifications = record.get("change_classifications")
    if not isinstance(stored_classifications, list) or stored_classifications != recomputed_classifications:
        return _result(
            "schema_compatibility_integrity",
            False,
            [{"reason": "SCHEMACOMPAT_CLASSIFICATIONS_MISMATCH", "stored": stored_classifications, "recomputed": recomputed_classifications}],
            validator,
            timestamp,
        )

    recomputed_verdict = aggregate_overall_verdict(recomputed_classifications)
    stored_verdict = record.get("overall_verdict")
    if stored_verdict != recomputed_verdict:
        return _result(
            "schema_compatibility_integrity",
            False,
            [{"reason": "SCHEMACOMPAT_VERDICT_MISMATCH", "stored": stored_verdict, "recomputed": recomputed_verdict}],
            validator,
            timestamp,
        )
    if stored_verdict not in VALID_OVERALL_VERDICTS or any(entry["compatibility_class"] not in VALID_COMPATIBILITY_CLASSES for entry in stored_classifications):
        return _result("schema_compatibility_integrity", False, [{"reason": "stored verdict or a classification is not a legal enum value despite matching recomputation"}], validator, timestamp)

    return _result(
        "schema_compatibility_integrity",
        True,
        [{"change_count": len(changes), "overall_verdict": recomputed_verdict}],
        validator,
        timestamp,
    )


def evaluate_schema_compatibility_analysis_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_schema_compatibility_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
