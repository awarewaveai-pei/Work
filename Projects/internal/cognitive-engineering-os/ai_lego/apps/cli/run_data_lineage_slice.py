"""``database_data.data_lineage`` vertical slice -- the twenty-eighth Method Atlas slice, second from the
`database_data` family.

Builds a real 4-stage chain (a customer database snapshot ingested,
transformed, and landed in a final dataset) plus a real merge case (two
independent SOURCE systems joined by one TRANSFORM), demonstrating the
general-graph (not strict-linear) design. Then demonstrates the
traces-to-source invariant is real by attempting to construct a record
with an orphaned node (no upstream, not itself SOURCE) and confirming
it is refused.

Run::

    python -m ai_lego.apps.cli.run_data_lineage_slice
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
from ai_lego.modules.database_data.data_lineage import (
    METHOD_ID,
    all_gates_pass,
    evaluate_data_lineage_gates,
    generate_data_lineage_record,
    node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DATALINEAGE-SYNTHETIC-001"
EXECUTION_ID = "EX-DATALINEAGE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-DATALINEAGE-001"

S = {
    "data_lineage_record": "ai-lego://specs/cognitive/typed-objects/data-lineage-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-data-lineage-slice"


def run_data_lineage_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real merge case: two independent SOURCE systems joined by one TRANSFORM, both correctly tracing. ---
    nodes = [
        node("DLR-2026-09-05-001-N1", "SOURCE", "CRM 系統客戶資料", make_provenance("AI_INFERENCE", "AI_GENERATED")),
        node("DLR-2026-09-05-001-N2", "SOURCE", "訂單系統客戶資料", make_provenance("AI_INFERENCE", "AI_GENERATED")),
        node(
            "DLR-2026-09-05-001-N3",
            "TRANSFORM",
            "join CRM 與訂單系統資料，去除重複客戶記錄",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
            upstream_refs=["DLR-2026-09-05-001-N1", "DLR-2026-09-05-001-N2"],
        ),
        node(
            "DLR-2026-09-05-001-N4",
            "DATASET",
            "combined_customer_view 最終資料集",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
            upstream_refs=["DLR-2026-09-05-001-N3"],
        ),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_data_lineage_record,
        "DLR-2026-09-05-001",
        "combined_customer_view",
        nodes,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["data_lineage_record"], record, "data lineage record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DataLineageRecordGenerated", {"data_lineage_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_data_lineage_gates(record, "run_data_lineage_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"data lineage gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DATALINEAGE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DataLineageGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the traces-to-source invariant is real, at the CONSTRUCTION layer: attempt to build a record
    # with an orphaned node (no upstream, not itself SOURCE). Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_data_lineage_record(
            "DLR-2026-09-05-002",
            "orphaned_dataset",
            [
                node("DLR-2026-09-05-002-N1", "SOURCE", "real source", make_provenance("AI_INFERENCE", "AI_GENERATED")),
                node("DLR-2026-09-05-002-N2", "DATASET", "claims no real upstream", make_provenance("AI_INFERENCE", "AI_GENERATED")),
            ],
            make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "DATALINEAGE_NODE_DOES_NOT_TRACE_TO_SOURCE" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("DATALINEAGE_INVARIANT_GUARD_DID_NOT_FIRE: a record with an orphaned node was accepted (or a different guard fired instead)")

    # --- Prove the SAME invariant at the independent GATE layer: take a COPY of the real, valid record and
    # hand-tamper the LAST node to inject a dangling upstream_ref (pointing to a node id that does not exist)
    # while deliberately leaving its own stored traces_to_source:true UNTOUCHED. Pinned to the SPECIFIC
    # structural_integrity gate and its own evidence (not "any gate failed for any reason") -- a weak oracle
    # here would prove nothing about genuine recomputation, the same "test that didn't test what it claimed"
    # class a critic review caught in a sibling family's own slice (challenge.blue_team, WORKLOG
    # continuation 39). ---
    tampered = copy.deepcopy(record)
    tampered_node_id = tampered["nodes"][-1]["id"]
    tampered["nodes"][-1]["upstream_refs"] = ["DOES-NOT-EXIST"]
    tampered_gate_results = evaluate_data_lineage_gates(tampered, "run_data_lineage_slice", clock.at(1.25))
    structural_integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "structural_integrity")
    evidence = structural_integrity_result["evidence"][0]
    gate_layer_blocked = structural_integrity_result["status"] == "FAIL" and (
        tampered_node_id in evidence.get("recomputed_mismatched_ids", []) or tampered_node_id in evidence.get("unresolved_non_source_ids", [])
    )
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"DATALINEAGE_GATE_GUARD_DID_NOT_FIRE: structural_integrity did not flag the tampered node {tampered_node_id!r} via genuine recomputation "
            f"(status={structural_integrity_result['status']}, evidence={evidence})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "DataLineageInvariantVerified",
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
        "data_lineage_record": record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "data_lineage_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_data_lineage_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    record = result["data_lineage_record"]
    v = result["invariant_verification"]
    print(
        f"PASS database_data.data_lineage: {len(record['nodes'])} nodes, gates [{gate_summary}], "
        f"invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
