"""``database_data.expand_contract_migration`` -- thirtieth Method Atlas slice, FOURTH from the
`database_data` family (F21).

Execution Contract §28's own diagram (L1077-1116) is a single LINEAR
sequence of 15 stages, not a DAG with alternate orderings -- and §30's
own emphatic rule ("Migration 完成不能只看 command exit code = 0，必須
證明 data invariant = PASS") directly implies the real invariant this
module enforces: a stage may only be recorded completed if every
EARLIER stage in the canonical sequence has ALSO been recorded
completed, AND its own ``completed_at`` timestamp is not later than any
LATER stage's own timestamp. `contract_old_schema` (stage 14, which
destroys the rollback path) being blocked without `reconciliation`
(stage 9) having genuinely completed FIRST -- in real time, not merely
"present in the same snapshot" -- is one instance of this single
general rule, not a separate pairwise special case.

A critic review of this slice's own first draft found a Critical: the
presence-only prefix check (which stage_ids exist in the record) was
the ONLY thing enforced -- nothing compared ``completed_at`` values
against canonical order, so a record built with
``reconciliation completed 2026-09-30`` and
``contract_old_schema completed 2026-08-09`` (the schema explicitly
destroyed BEFORE reconciliation ever ran) passed the builder, both
gates, and the schema. Fixed by requiring every ``completed_at`` to be
a real, parseable ISO-8601 timestamp (removing the first draft's
"free-form, no structured format" design, which is exactly what made
the hole possible) and enforcing non-decreasing order across stages
sorted by their own canonical index.

`STAGE_SEQUENCE` transcribes, verbatim and in the same order,
`recipes/validated/db-migration-expand-contract.recipe.yaml`'s own
`steps[].ref` values -- the same vocabulary, not independently invented
(confirmed correct by the same critic review).
"""

from __future__ import annotations

from typing import Any

from ai_lego.core.domain.provenance import provenance_is_valid
from ai_lego.core.support import parse_timestamp
from ai_lego.errors import InvariantViolation

METHOD_ID = "database_data.expand_contract_migration"

STAGE_SEQUENCE: tuple[str, ...] = (
    "schema_baseline",
    "data_contract",
    "compatibility_analysis",
    "backup_restore_validation",
    "expand",
    "deploy_compatible_code",
    "enable_dual_write",
    "backfill",
    "reconciliation",
    "dual_read_verification",
    "canary",
    "traffic_migration_switch",
    "observe",
    "contract_old_schema",
    "close_rollback_window",
)
_STAGE_INDEX: dict[str, int] = {stage_id: index for index, stage_id in enumerate(STAGE_SEQUENCE)}


def _is_nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_known_stage_id(value: Any) -> bool:
    """isinstance guard FIRST: an unhashable stage_id (a list/dict, from a rehydrated malformed record)
    would otherwise raise TypeError out of `in _STAGE_INDEX` instead of failing closed."""
    return isinstance(value, str) and value in _STAGE_INDEX


def _duplicate_stage_ids(stages: list[Any]) -> list[str]:
    """Shared predicate: which stage_ids (if any) appear more than once? Called by BOTH the builder's
    construction-time check and the gate's independent re-derivation."""
    seen: set[str] = set()
    duplicates: set[str] = set()
    for item in stages:
        stage_id = item.get("stage_id") if isinstance(item, dict) else None
        if not isinstance(stage_id, str):
            continue
        if stage_id in seen:
            duplicates.add(stage_id)
        seen.add(stage_id)
    return sorted(duplicates)


def _non_contiguous_gaps(stage_ids: frozenset[str]) -> list[str]:
    """Shared predicate: given the SET of recorded stage_ids (a ``frozenset`` -- the parameter's own type
    makes "duplicates in the input" structurally impossible to forge, rather than a runtime check this
    function would otherwise need to duplicate), which EARLIER-in-sequence stages are MISSING relative to the
    latest one recorded? Returns the missing stage_ids (a real gap), or an empty list if the recorded set is
    exactly the canonical prefix 0..k-1. Called by BOTH the builder's construction-time check and the gate's
    independent re-derivation, both of which dedupe (see ``_duplicate_stage_ids``) before calling this."""
    indices = sorted(_STAGE_INDEX[stage_id] for stage_id in stage_ids)
    if indices == list(range(len(indices))):
        return []
    present = set(indices)
    highest = max(indices)
    return [STAGE_SEQUENCE[i] for i in range(highest + 1) if i not in present]


def _out_of_order_pairs(stages: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """Shared predicate: given well-shaped stages (valid canonical stage_id, parseable completed_at, already
    deduped), which ADJACENT (in canonical order) (earlier_stage_id, later_stage_id) pairs have the
    EARLIER-in-sequence stage completed AFTER the LATER-in-sequence one? A record is only genuinely
    "completed in order" if, sorted by canonical index, completed_at is non-decreasing -- presence alone (the
    first draft's only check) proves nothing about the real order events happened in. Checking only adjacent
    canonical pairs is sufficient to catch EVERY violation, not just adjacent ones: a sequence is
    non-decreasing overall if and only if it is non-decreasing at every adjacent step (if some later stage's
    timestamp is before some earlier stage's, there must be at least one adjacent step where the timestamp
    goes backward, by a standard telescoping argument)."""
    ordered = sorted(stages, key=lambda item: _STAGE_INDEX[item["stage_id"]])
    violations: list[tuple[str, str]] = []
    for earlier, later in zip(ordered, ordered[1:]):
        if parse_timestamp(later["completed_at"]) < parse_timestamp(earlier["completed_at"]):
            violations.append((earlier["stage_id"], later["stage_id"]))
    return violations


def stage(stage_id: str, completed_at: str, *, evidence_ref: str | None = None) -> dict[str, Any]:
    """One item of ``typed-objects/expand-contract-migration-record.schema.yaml#/properties/stages``."""
    if not _is_known_stage_id(stage_id):
        raise InvariantViolation(f"EXPANDCONTRACT_UNKNOWN_STAGE: {stage_id!r} is not one of {list(STAGE_SEQUENCE)}")
    if not _is_nonempty_str(completed_at):
        raise InvariantViolation(f"EXPANDCONTRACT_EMPTY_COMPLETED_AT: stage {stage_id!r} must have a non-empty completed_at")
    try:
        parse_timestamp(completed_at)
    except ValueError as error:
        raise InvariantViolation(f"EXPANDCONTRACT_INVALID_COMPLETED_AT: stage {stage_id!r}'s completed_at {completed_at!r} is not a parseable ISO-8601 timestamp") from error
    if evidence_ref is not None and not _is_nonempty_str(evidence_ref):
        raise InvariantViolation(f"EXPANDCONTRACT_EMPTY_EVIDENCE_REF: stage {stage_id!r}'s evidence_ref must be a non-empty string when supplied, got {evidence_ref!r}")
    item: dict[str, Any] = {"stage_id": stage_id, "completed_at": completed_at}
    if evidence_ref is not None:
        item["evidence_ref"] = evidence_ref
    return item


def generate_expand_contract_migration_record(
    record_id: str,
    migration_ref: str,
    stages: list[dict[str, Any]],
    provenance: dict[str, Any],
    *,
    version: str = "1.0.0",
    generated_by_method: str = METHOD_ID,
) -> dict[str, Any]:
    """Instance of ``typed-objects/expand-contract-migration-record.schema.yaml``. Enforces the method
    contract's own preconditions fail-closed: non-empty stages, unique stage_ids, valid canonical stage_ids,
    parseable completed_at, the recorded stage_ids forming a contiguous prefix of ``STAGE_SEQUENCE``, AND
    completed_at values non-decreasing when sorted by canonical index (the temporal-order check a critic
    review found entirely absent from this module's first draft). RECOMPUTES every field from each hand-built
    stage dict and REBUILDS a fresh record -- a critic review of the immediately-prior `database_data
    .reconciliation` slice caught that storing a hand-built dict verbatim lets a caller smuggle extra/wrong
    fields (e.g. a `status: pending` marker) into a record certified as fully completed; this builder does not
    repeat that mistake.
    """
    if not _is_nonempty_str(record_id) or not _is_nonempty_str(migration_ref):
        raise InvariantViolation(f"EXPANDCONTRACT_EMPTY_RECORD_FIELD: record_id/migration_ref must both be non-empty strings, got {record_id!r}/{migration_ref!r}")
    if not isinstance(stages, list) or not stages:
        raise InvariantViolation("EXPANDCONTRACT_NO_STAGES: methods/contracts/database_data.expand_contract_migration.contract.yaml requires at least one completed stage")

    rebuilt: list[dict[str, Any]] = []
    for item in stages:
        if not isinstance(item, dict) or not _is_nonempty_str(item.get("completed_at")):
            raise InvariantViolation(f"EXPANDCONTRACT_INVALID_STAGE_SHAPE: each stage must be a dict with a non-empty completed_at, got {item!r}")
        stage_id = item.get("stage_id")
        if not _is_known_stage_id(stage_id):
            raise InvariantViolation(f"EXPANDCONTRACT_UNKNOWN_STAGE: {stage_id!r} is not one of {list(STAGE_SEQUENCE)}")
        try:
            parse_timestamp(item["completed_at"])
        except ValueError as error:
            raise InvariantViolation(f"EXPANDCONTRACT_INVALID_COMPLETED_AT: stage {stage_id!r}'s completed_at {item['completed_at']!r} is not a parseable ISO-8601 timestamp") from error
        evidence_ref = item.get("evidence_ref")
        if evidence_ref is not None and not _is_nonempty_str(evidence_ref):
            raise InvariantViolation(f"EXPANDCONTRACT_EMPTY_EVIDENCE_REF: stage {stage_id!r}'s evidence_ref must be a non-empty string when supplied, got {evidence_ref!r}")
        clean: dict[str, Any] = {"stage_id": stage_id, "completed_at": item["completed_at"]}
        if evidence_ref is not None:
            clean["evidence_ref"] = evidence_ref
        rebuilt.append(clean)

    duplicates = _duplicate_stage_ids(rebuilt)
    if duplicates:
        raise InvariantViolation(f"EXPANDCONTRACT_DUPLICATE_STAGE: {duplicates} recorded more than once")

    stage_id_set = frozenset(item["stage_id"] for item in rebuilt)
    gaps = _non_contiguous_gaps(stage_id_set)
    if gaps:
        raise InvariantViolation(
            f"EXPANDCONTRACT_STAGE_SKIPPED_AHEAD: {gaps} must be recorded completed before the later stages already present -- "
            "Execution Contract §28's own sequence is linear (EC §30: 'exit code != proof, data invariant = PASS is')"
        )
    out_of_order = _out_of_order_pairs(rebuilt)
    if out_of_order:
        raise InvariantViolation(
            f"EXPANDCONTRACT_COMPLETION_OUT_OF_ORDER: {out_of_order} -- an earlier-in-sequence stage's own completed_at is AFTER a later stage's, "
            "meaning the canonical order was violated in real time even though every stage_id is present (EC §30: 'exit code != proof, data invariant = PASS is')"
        )

    return {
        "id": record_id,
        "version": version,
        "generated_by_method": generated_by_method,
        "migration_ref": migration_ref,
        "stages": rebuilt,
        "provenance": provenance,
    }


def _result(gate_id: str, passed: bool, evidence: list[Any], validator: str, timestamp: str) -> dict[str, Any]:
    return {"gate_id": gate_id, "status": "PASS" if passed else "FAIL", "evidence": evidence, "validator": validator, "timestamp": timestamp}


def evaluate_provenance_required_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Contract ``quality.provenance_required: true`` -- the record's own provenance is schema-valid."""
    passed = provenance_is_valid(record.get("provenance"))
    return _result("provenance_required", passed, [{"provenance_valid": passed}], validator, timestamp)


def evaluate_stage_order_integrity_gate(record: dict[str, Any], validator: str, timestamp: str) -> dict[str, Any]:
    """Re-derives EVERY structural precondition from the record's own raw ``stages[]`` field -- well-shaped
    entries, valid canonical stage_ids, parseable completed_at, no duplicates -- AND RECOMPUTES both the
    contiguous-prefix check AND the completed_at temporal-order check fresh. Does not trust any prior
    validation. FAILS CLOSED at every step on malformed input."""
    stages = record.get("stages")
    if not isinstance(stages, list) or not stages:
        return _result("stage_order_integrity", False, [{"reason": "stages missing, not a list, or empty"}], validator, timestamp)
    if not all(isinstance(item, dict) and _is_nonempty_str(item.get("completed_at")) for item in stages):
        return _result("stage_order_integrity", False, [{"reason": "one or more stages is not a well-shaped dict with a real completed_at"}], validator, timestamp)
    unknown = [item.get("stage_id") for item in stages if not _is_known_stage_id(item.get("stage_id"))]
    if unknown:
        return _result("stage_order_integrity", False, [{"reason": "unknown stage_id", "unknown_stage_ids": unknown}], validator, timestamp)
    unparseable = []
    for item in stages:
        try:
            parse_timestamp(item["completed_at"])
        except ValueError:
            unparseable.append(item["stage_id"])
    if unparseable:
        return _result("stage_order_integrity", False, [{"reason": "completed_at is not a parseable ISO-8601 timestamp", "unparseable_stage_ids": unparseable}], validator, timestamp)
    duplicates = _duplicate_stage_ids(stages)
    if duplicates:
        return _result("stage_order_integrity", False, [{"reason": "duplicate stage ids", "duplicate_stage_ids": duplicates}], validator, timestamp)

    stage_id_set = frozenset(item["stage_id"] for item in stages)
    gaps = _non_contiguous_gaps(stage_id_set)
    if gaps:
        return _result("stage_order_integrity", False, [{"reason": "stage(s) skipped ahead of an earlier stage", "missing_earlier_stage_ids": gaps}], validator, timestamp)
    out_of_order = _out_of_order_pairs(stages)
    if out_of_order:
        return _result(
            "stage_order_integrity", False,
            [{"reason": "completed_at order contradicts canonical stage order", "out_of_order_pairs": [list(pair) for pair in out_of_order]}],
            validator, timestamp,
        )

    return _result("stage_order_integrity", True, [{"stages_recorded": len(stages), "latest_stage_id": STAGE_SEQUENCE[max(_STAGE_INDEX[item["stage_id"]] for item in stages)]}], validator, timestamp)


def evaluate_expand_contract_migration_gates(record: dict[str, Any], validator: str, timestamp: str) -> list[dict[str, Any]]:
    return [
        evaluate_provenance_required_gate(record, validator, timestamp),
        evaluate_stage_order_integrity_gate(record, validator, timestamp),
    ]


def all_gates_pass(gate_results: list[dict[str, Any]]) -> bool:
    return all(gate["status"] in {"PASS", "NOT_APPLICABLE"} for gate in gate_results)
