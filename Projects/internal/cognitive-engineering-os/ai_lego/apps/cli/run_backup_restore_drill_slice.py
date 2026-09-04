"""``database_data.backup_restore_drill`` vertical slice -- the twenty-fifth Method Atlas slice, FIRST from the
`database_data` family.

Builds a real passed drill (integrity OK, restored within RTO). Then
demonstrates the failed-criteria-cannot-pass invariant is real by
attempting to claim ``status: passed`` when the restore exceeded its
RTO target and confirming it is refused.

Run::

    python -m ai_lego.apps.cli.run_backup_restore_drill_slice
"""

from __future__ import annotations

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
from ai_lego.modules.database_data.backup_restore_drill import (
    METHOD_ID,
    all_gates_pass,
    evaluate_backup_restore_drill_gates,
    generate_backup_restore_drill_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BACKUPDRILL-SYNTHETIC-001"
EXECUTION_ID = "EX-BACKUPDRILL-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BACKUPDRILL-001"

S = {
    "backup_drill": "ai-lego://specs/cognitive/typed-objects/backup-restore-drill-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-backupdrill-slice"


def run_backup_restore_drill_slice(config: SliceConfig) -> dict[str, Any]:
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

    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_backup_restore_drill_record,
        "DRILL-2026-09-05-001",
        "BACKUP-2026-09-04-nightly",
        "isolated-restore-staging (no production network access)",
        True,
        3600.0,
        2415.0,
        "passed",
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["backup_drill"], record, "backup restore drill record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BackupRestoreDrillRecordGenerated", {"backup_restore_drill_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_backup_restore_drill_gates(record, "run_backup_restore_drill_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"backup drill gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BACKUPDRILL_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BackupRestoreDrillGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the failed-criteria-cannot-pass invariant is real, on BOTH the RTO and RPO halves of Atlas's
    # own L3090 pass bar. Both attempts must be refused. ---
    rto_invariant_blocked = False
    try:
        generate_backup_restore_drill_record(
            "DRILL-2026-09-05-002",
            "BACKUP-2026-09-04-nightly",
            "isolated-restore-staging (no production network access)",
            True,
            3600.0,
            5100.0,
            "passed",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        # Pinned to the specific code under proof, not any InvariantViolation.
        rto_invariant_blocked = "BACKUPDRILL_FAILED_CRITERIA_CANNOT_PASS" in str(error)
    if not rto_invariant_blocked:
        raise InvariantViolation("BACKUPDRILL_INVARIANT_GUARD_DID_NOT_FIRE: status:passed with an over-RTO restore was accepted (or a different guard fired instead)")

    rpo_invariant_blocked = False
    try:
        generate_backup_restore_drill_record(
            "DRILL-2026-09-05-003",
            "BACKUP-2026-09-04-nightly",
            "isolated-restore-staging (no production network access)",
            True,
            3600.0,
            2000.0,
            "passed",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
            rpo_target_seconds=900.0,
            observed_data_age_seconds=1200.0,
        )
    except InvariantViolation as error:
        rpo_invariant_blocked = "BACKUPDRILL_FAILED_CRITERIA_CANNOT_PASS" in str(error)
    if not rpo_invariant_blocked:
        raise InvariantViolation("BACKUPDRILL_INVARIANT_GUARD_DID_NOT_FIRE: status:passed with an over-RPO restore was accepted (or a different guard fired instead)")

    invariant_blocked = rto_invariant_blocked and rpo_invariant_blocked
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BackupRestoreDrillInvariantVerified", {"rto_invariant_blocked": rto_invariant_blocked, "rpo_invariant_blocked": rpo_invariant_blocked}, 1.3)
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
        "backup_restore_drill_record": record,
        "gate_results": gate_results,
        "invariant_verification": {"invariant_blocked": invariant_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "backupdrill_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_backup_restore_drill_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["backup_restore_drill_record"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS database_data.backup_restore_drill: status={record['status']}, "
        f"actual_recovery_duration_seconds={record['actual_recovery_duration_seconds']}, "
        f"rto_target_seconds={record['rto_target_seconds']}, gates [{gate_summary}], "
        f"invariant_verified={result['invariant_verification']['invariant_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
