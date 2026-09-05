"""``database_data.reconciliation`` vertical slice -- the twenty-ninth Method Atlas slice, third from the
`database_data` family.

Builds a real reconciled record (a COUNT check and a CHECKSUM check,
both matching between a pre- and post-migration snapshot) plus an
`open` record where a real COUNT mismatch has been investigated and
confirmed as a genuine problem (`resolved_as_expected: false`). Then
demonstrates the diff->resolve invariant is real by attempting to
construct a record claiming `overall_status: reconciled` while a check
remains unsatisfied, at BOTH the construction layer and the
independent gate layer.

Run::

    python -m ai_lego.apps.cli.run_reconciliation_slice
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
from ai_lego.modules.database_data.reconciliation import (
    METHOD_ID,
    all_gates_pass,
    check,
    evaluate_reconciliation_gates,
    generate_reconciliation_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RECONCILIATION-SYNTHETIC-001"
EXECUTION_ID = "EX-RECONCILIATION-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-RECONCILIATION-001"

S = {
    "reconciliation_record": "ai-lego://specs/cognitive/typed-objects/reconciliation-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-reconciliation-slice"


def run_reconciliation_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real reconciled case: one COUNT check and one CHECKSUM check, both matching. ---
    checks = [
        check("RCN-2026-09-05-001-C1", "row count: orders table", "COUNT", "48213", "48213"),
        check("RCN-2026-09-05-001-C2", "checksum: customer PII column", "CHECKSUM", "d41d8cd98f00b204e9800998ecf8427e", "d41d8cd98f00b204e9800998ecf8427e"),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_reconciliation_record,
        "RECON-2026-09-05-001",
        "legacy_orders_db (pre-migration snapshot)",
        "orders_db_v2 (post-migration)",
        checks,
        "reconciled",
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["reconciliation_record"], record, "reconciliation record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ReconciliationRecordGenerated", {"reconciliation_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_reconciliation_gates(record, "run_reconciliation_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"reconciliation gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"RECONCILIATION_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ReconciliationGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real 'open' case: a genuine COUNT mismatch, investigated and confirmed as a REAL problem (not
    # expected) -- overall_status:open is legal here even though a resolution IS recorded, because
    # resolved_as_expected:false means "a real issue was found", not "this is fine". ---
    open_checks = [
        check(
            "RCN-2026-09-05-002-C1",
            "row count: orders table",
            "COUNT",
            "48213",
            "48201",
            resolution={"resolved_as_expected": False, "note": "12 orders confirmed lost during migration cutover window -- real data-loss incident, not expected."},
        ),
    ]
    _, open_record = catalog.invoke(
        METHOD_ID,
        generate_reconciliation_record,
        "RECON-2026-09-05-002",
        "legacy_orders_db (pre-migration snapshot)",
        "orders_db_v2 (post-migration)",
        open_checks,
        "open",
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["reconciliation_record"], open_record, "open reconciliation record")

    # --- Prove the diff->resolve invariant is real, at the CONSTRUCTION layer: attempt to build a record
    # claiming overall_status:reconciled while a check's own resolution documents a REAL problem
    # (resolved_as_expected:false). Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_reconciliation_record(
            "RECON-2026-09-05-003",
            "legacy_orders_db (pre-migration snapshot)",
            "orders_db_v2 (post-migration)",
            open_checks,
            "reconciled",
            make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "RECONCILIATION_NOT_ACTUALLY_RECONCILED" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("RECONCILIATION_INVARIANT_GUARD_DID_NOT_FIRE: a record claiming reconciled over an unsatisfied check was accepted (or a different guard fired instead)")

    # --- Prove the SAME invariant at the independent GATE layer: take a COPY of the real, valid reconciled
    # record and hand-tamper the FIRST check's target_value to diverge from source_value (a genuine new
    # mismatch), while deliberately leaving its own stored matches:true/diff:0 UNTOUCHED (stale). Pinned to
    # the SPECIFIC reconciliation_integrity gate and its own evidence (not "any gate failed for any reason")
    # -- the same "test that didn't test what it claimed" class a critic review caught in a sibling family's
    # own slice (challenge.blue_team, WORKLOG continuation 39). ---
    tampered = copy.deepcopy(record)
    tampered_check_id = tampered["checks"][0]["id"]
    tampered["checks"][0]["target_value"] = "99999999"
    tampered_gate_results = evaluate_reconciliation_gates(tampered, "run_reconciliation_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "reconciliation_integrity")
    evidence = integrity_result["evidence"][0]
    gate_layer_blocked = integrity_result["status"] == "FAIL" and tampered_check_id in evidence.get("mismatched_check_ids", [])
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"RECONCILIATION_GATE_GUARD_DID_NOT_FIRE: reconciliation_integrity did not flag the tampered check {tampered_check_id!r} via genuine recomputation "
            f"(status={integrity_result['status']}, evidence={evidence})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ReconciliationInvariantVerified",
        {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
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
        "reconciliation_record": record,
        "open_reconciliation_record": open_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "reconciliation_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_reconciliation_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    record = result["reconciliation_record"]
    v = result["invariant_verification"]
    print(
        f"PASS database_data.reconciliation: {len(record['checks'])} checks, status={record['overall_status']}, gates [{gate_summary}], "
        f"invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
