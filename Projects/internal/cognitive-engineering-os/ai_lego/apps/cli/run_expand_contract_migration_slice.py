"""``database_data.expand_contract_migration`` vertical slice -- the thirtieth Method Atlas slice, fourth
from the `database_data` family.

Builds a real in-flight migration record (8 of 15 canonical stages
completed, through Backfill) and a real fully-completed 15-stage
record (referencing a `database_data.reconciliation` record's own id
as evidence on the `reconciliation` stage -- the disclosed soft link
this slice's own contract established). Then proves the
contiguous-prefix invariant is real by attempting to record
`contract_old_schema` while `reconciliation` has not been recorded
(construction layer), and by hand-tampering a valid completed record
to remove a middle stage while leaving later stages present (gate
layer).

Run::

    python -m ai_lego.apps.cli.run_expand_contract_migration_slice
"""

from __future__ import annotations

import argparse
import copy
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_lego import PRODUCT_ROOT, REPO_ROOT, __version__, resolve_spec_root
from ai_lego.core.contracts.ledger_guards import PiiLedgerGuard
from ai_lego.core.contracts.runtime_dir import guard_runtime_dir, prepare_runtime_dir
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.expand_contract_migration import (
    METHOD_ID,
    STAGE_SEQUENCE,
    all_gates_pass,
    evaluate_expand_contract_migration_gates,
    generate_expand_contract_migration_record,
    stage,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-EXPANDCONTRACT-SYNTHETIC-001"
EXECUTION_ID = "EX-EXPANDCONTRACT-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-EXPANDCONTRACT-001"

S = {
    "expand_contract_migration_record": "ai-lego://specs/cognitive/typed-objects/expand-contract-migration-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-expand-contract-migration-slice"


def run_expand_contract_migration_slice(config: SliceConfig) -> dict[str, Any]:
    spec_root = resolve_spec_root(config.spec_root)
    runtime = (config.runtime_dir or default_runtime_dir()).resolve()
    allowed_repo_location = PRODUCT_ROOT / ".runtime"
    guard_runtime_dir(runtime, spec_root, REPO_ROOT, allowed_repo_location)
    prepare_runtime_dir(runtime, config.reset)

    clock = DEFAULT_CLOCK
    contracts = SchemaContracts(spec_root)
    pii_guard = PiiLedgerGuard()
    ledger = EventLedger(runtime / "data" / "events" / "ledger.jsonl", RUN_ID, clock, validator=contracts.validate, payload_guard=pii_guard)

    milestones: list[str] = ["RECEIVED"]

    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- A real in-flight migration: 8 of 15 stages completed, through Backfill. ---
    in_flight_stages = [
        stage("schema_baseline", "2026-09-01T09:00:00Z"),
        stage("data_contract", "2026-09-01T10:00:00Z"),
        stage("compatibility_analysis", "2026-09-01T14:00:00Z"),
        stage("backup_restore_validation", "2026-09-02T09:00:00Z"),
        stage("expand", "2026-09-02T15:00:00Z"),
        stage("deploy_compatible_code", "2026-09-03T09:00:00Z"),
        stage("enable_dual_write", "2026-09-03T09:30:00Z"),
        stage("backfill", "2026-09-04T02:00:00Z"),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_expand_contract_migration_record,
        "ECMIG-2026-09-05-001",
        "orders table: add customer_tier column, 2026-Q3",
        in_flight_stages,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["expand_contract_migration_record"], record, "in-flight migration record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ExpandContractMigrationRecordGenerated", {"expand_contract_migration_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_expand_contract_migration_gates(record, "run_expand_contract_migration_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"expand-contract migration gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"EXPANDCONTRACT_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ExpandContractMigrationGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real fully-completed migration through all 15 stages, its own reconciliation stage backed by a
    # real database_data.reconciliation record id -- the disclosed soft-link this slice's own contract
    # established (compilation_decisions), answering database_data.reconciliation's own OQ-RECONCILIATION-2. ---
    completed_stages = [
        stage("schema_baseline", "2026-08-01T09:00:00Z"),
        stage("data_contract", "2026-08-01T10:00:00Z"),
        stage("compatibility_analysis", "2026-08-01T14:00:00Z"),
        stage("backup_restore_validation", "2026-08-02T09:00:00Z"),
        stage("expand", "2026-08-02T15:00:00Z"),
        stage("deploy_compatible_code", "2026-08-03T09:00:00Z"),
        stage("enable_dual_write", "2026-08-03T09:30:00Z"),
        stage("backfill", "2026-08-04T02:00:00Z"),
        stage("reconciliation", "2026-08-04T10:00:00Z", evidence_ref="RECON-2026-09-05-001"),
        stage("dual_read_verification", "2026-08-05T09:00:00Z"),
        stage("canary", "2026-08-06T09:00:00Z"),
        stage("traffic_migration_switch", "2026-08-07T09:00:00Z"),
        stage("observe", "2026-08-10T09:00:00Z"),
        stage("contract_old_schema", "2026-08-12T09:00:00Z"),
        stage("close_rollback_window", "2026-08-12T09:05:00Z"),
    ]
    _, completed_record = catalog.invoke(
        METHOD_ID,
        generate_expand_contract_migration_record,
        "ECMIG-2026-09-05-002",
        "legacy_orders_db -> orders_db_v2, full cutover",
        completed_stages,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["expand_contract_migration_record"], completed_record, "fully-completed migration record")

    # --- Prove the contiguous-prefix invariant is real, at the CONSTRUCTION layer: attempt to record
    # contract_old_schema (stage 14) while reconciliation (stage 9) has not been recorded. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_expand_contract_migration_record(
            "ECMIG-2026-09-05-003",
            "orders table: add customer_tier column, 2026-Q3",
            in_flight_stages + [stage("contract_old_schema", "2026-09-05T09:00:00Z")],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "EXPANDCONTRACT_STAGE_SKIPPED_AHEAD" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("EXPANDCONTRACT_INVARIANT_GUARD_DID_NOT_FIRE: a record skipping ahead to contract_old_schema was accepted (or a different guard fired instead)")

    # --- Prove the SAME invariant at the independent GATE layer: take a COPY of the real, valid completed
    # record and hand-tamper it by REMOVING the reconciliation stage entry (index 8) while leaving every
    # later stage (dual_read_verification through close_rollback_window) present -- a real gap. Pinned to the
    # SPECIFIC stage_order_integrity gate and its own evidence (not "any gate failed for any reason"). ---
    tampered = copy.deepcopy(completed_record)
    removed = next(item for item in tampered["stages"] if item["stage_id"] == "reconciliation")
    tampered["stages"] = [item for item in tampered["stages"] if item["stage_id"] != "reconciliation"]
    tampered_gate_results = evaluate_expand_contract_migration_gates(tampered, "run_expand_contract_migration_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "stage_order_integrity")
    evidence = integrity_result["evidence"][0]
    gate_layer_blocked = integrity_result["status"] == "FAIL" and removed["stage_id"] in evidence.get("missing_earlier_stage_ids", [])
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"EXPANDCONTRACT_GATE_GUARD_DID_NOT_FIRE: stage_order_integrity did not flag the removed stage {removed['stage_id']!r} "
            f"(status={integrity_result['status']}, evidence={evidence})"
        )

    # --- Prove the SECOND invariant (completed_at temporal order, added post-critic-review) is real, at
    # BOTH layers: a record where every canonical stage_id is present (the prefix check alone would PASS)
    # but reconciliation's own completed_at is AFTER contract_old_schema's -- the exact "destroyed the
    # rollback path before reconciliation ran" scenario this method exists to forbid. ---
    temporally_broken_stages = [dict(item) for item in completed_stages]
    reconciliation_index = next(i for i, item in enumerate(temporally_broken_stages) if item["stage_id"] == "reconciliation")
    temporally_broken_stages[reconciliation_index] = dict(temporally_broken_stages[reconciliation_index], completed_at="2026-09-30T09:00:00Z")

    temporal_construction_blocked = False
    try:
        generate_expand_contract_migration_record("ECMIG-2026-09-05-004", "x", temporally_broken_stages, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        temporal_construction_blocked = "EXPANDCONTRACT_COMPLETION_OUT_OF_ORDER" in str(error)
    if not temporal_construction_blocked:
        raise InvariantViolation("EXPANDCONTRACT_TEMPORAL_GUARD_DID_NOT_FIRE: a record with reconciliation completed AFTER contract_old_schema was accepted at construction")

    temporal_tampered = copy.deepcopy(completed_record)
    for item in temporal_tampered["stages"]:
        if item["stage_id"] == "reconciliation":
            item["completed_at"] = "2026-09-30T09:00:00Z"
    temporal_gate_results = evaluate_expand_contract_migration_gates(temporal_tampered, "run_expand_contract_migration_slice", clock.at(1.28))
    temporal_integrity_result = next(g for g in temporal_gate_results if g["gate_id"] == "stage_order_integrity")
    temporal_evidence = temporal_integrity_result["evidence"][0]
    temporal_gate_blocked = temporal_integrity_result["status"] == "FAIL" and any(
        "reconciliation" in pair for pair in temporal_evidence.get("out_of_order_pairs", [])
    )
    if not temporal_gate_blocked:
        raise InvariantViolation(
            f"EXPANDCONTRACT_TEMPORAL_GATE_GUARD_DID_NOT_FIRE: stage_order_integrity did not flag the reconciliation/contract_old_schema temporal violation "
            f"(status={temporal_integrity_result['status']}, evidence={temporal_evidence})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ExpandContractMigrationInvariantVerified",
        {
            "construction_layer_blocked": construction_layer_blocked,
            "gate_layer_blocked": gate_layer_blocked,
            "temporal_construction_layer_blocked": temporal_construction_blocked,
            "temporal_gate_layer_blocked": temporal_gate_blocked,
        },
        1.3,
    )
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "expand_contract_migration_record": record,
        "completed_expand_contract_migration_record": completed_record,
        "gate_results": gate_results,
        "invariant_verification": {
            "construction_layer_blocked": construction_layer_blocked,
            "gate_layer_blocked": gate_layer_blocked,
            "temporal_construction_layer_blocked": temporal_construction_blocked,
            "temporal_gate_layer_blocked": temporal_gate_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "expand_contract_migration_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_expand_contract_migration_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    record = result["expand_contract_migration_record"]
    completed = result["completed_expand_contract_migration_record"]
    v = result["invariant_verification"]
    print(
        f"PASS database_data.expand_contract_migration: in-flight {len(record['stages'])}/{len(STAGE_SEQUENCE)} stages, "
        f"completed {len(completed['stages'])}/{len(STAGE_SEQUENCE)} stages, gates [{gate_summary}], "
        f"invariant_verified(prefix_construction={v['construction_layer_blocked']}, prefix_gate={v['gate_layer_blocked']}, "
        f"temporal_construction={v['temporal_construction_layer_blocked']}, temporal_gate={v['temporal_gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
