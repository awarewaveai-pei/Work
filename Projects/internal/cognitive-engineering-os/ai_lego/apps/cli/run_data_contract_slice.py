"""``database_data.data_contract`` vertical slice -- the fortieth Method Atlas slice, sixth member of the
`database_data` family. Directly closes `database_data.erd`'s own OQ-ERD-4.

Builds a real contract for a Kafka-style order-events topic with ALL
FOUR optional soft links populated (schema_ref to an ERD record,
freshness_ref to an SLI/SLO record, compatibility_ref to an
expand-contract-migration record, deprecation_ref to a deprecation-
pipeline record), then a minimal contract with none of them. Then
proves the at-least-one-consumer invariant is real by attempting to
construct a record with zero consumers (construction layer), and
proves the "re-derived, not trusted" discipline at the independent
gate layer by hand-tampering a COPY of the valid record to duplicate a
field name, leaving every other field untouched (gate layer).

Run::

    python -m ai_lego.apps.cli.run_data_contract_slice
"""

from __future__ import annotations

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
from ai_lego.modules.database_data.data_contract import (
    METHOD_ID,
    all_gates_pass,
    evaluate_data_contract_gates,
    generate_data_contract_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DATACONTRACT-SYNTHETIC-001"
EXECUTION_ID = "EX-DATACONTRACT-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-DATACONTRACT-001"

S = {
    "data_contract_record": "ai-lego://specs/cognitive/typed-objects/data-contract-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _field(name: str, data_type: str = "uuid", nullable: bool = False) -> dict[str, Any]:
    return {"name": name, "data_type": data_type, "nullable": nullable}


ORDER_EVENTS_FIELDS = [
    _field("order_id"),
    _field("customer_id"),
    _field("total_cents", "bigint"),
    _field("promo_code", "varchar(64)", nullable=True),
]
ORDER_EVENTS_CONSUMERS = ["analytics-team", "fraud-detection-team", "fulfillment-team"]


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-data-contract-slice"


def run_data_contract_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real contract with ALL FOUR optional soft links populated (schema/freshness/compatibility/
    # deprecation), resolving OQ-ERD-4 and the DB Migration recipe's own L1113 pairing. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_data_contract_record,
        "DC-2026-09-05-001",
        "checkout-api.order-events (Kafka topic)",
        "checkout-platform-team",
        ORDER_EVENTS_CONSUMERS,
        ORDER_EVENTS_FIELDS,
        "Emitted once per finalized checkout order; total_cents is the post-discount charge amount.",
        ["promo_code is free text supplied by the frontend and not validated at emit time"],
        "Backward-compatible only: new optional fields allowed, no field removal or type change without a major version bump.",
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        schema_ref="ERD-2026-09-05-001",
        freshness_ref="SLO-2026-09-05-001",
        compatibility_ref="ECMIG-2026-09-05-001",
        deprecation_ref="DEP-2026-08-01-003",
    )
    contracts.validate(S["data_contract_record"], record, "data contract record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DataContractRecordGenerated", {"data_contract_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_data_contract_gates(record, "run_data_contract_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"data contract gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DATACONTRACT_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DataContractGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal contract with NONE of the four optional soft links. ---
    _, minimal_record = catalog.invoke(
        METHOD_ID,
        generate_data_contract_record,
        "DC-2026-09-05-002",
        "internal-metrics.daily-active-users",
        "growth-analytics-team",
        ["exec-dashboard-service"],
        [_field("count", "integer")],
        "Count of distinct users with at least one tracked session in the prior 24 hours, UTC day boundary.",
        [],
        "No compatibility guarantee yet -- single internal consumer, informal coordination.",
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["data_contract_record"], minimal_record, "minimal data contract record")
    for ref_name in ("schema_ref", "freshness_ref", "compatibility_ref", "deprecation_ref"):
        if ref_name in minimal_record:
            raise InvariantViolation(f"DATACONTRACT_UNEXPECTED_SOFT_REF: {ref_name} should be absent from the minimal record, got {minimal_record[ref_name]!r}")

    # --- Prove the at-least-one-consumer invariant is real, at the CONSTRUCTION layer: zero consumers. Must
    # be refused. ---
    construction_layer_blocked = False
    try:
        generate_data_contract_record(
            "DC-2026-09-05-003",
            "internal-metrics.orphaned-dataset",
            "some-team",
            [],
            [_field("value", "integer")],
            "A dataset nobody has registered as a consumer of.",
            [],
            "n/a",
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "DATACONTRACT_INVALID_CONSUMERS" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("DATACONTRACT_INVARIANT_GUARD_DID_NOT_FIRE: a record with zero consumers was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid record and hand-tamper it to duplicate a field name, leaving every other field
    # UNTOUCHED. Pinned to the SPECIFIC data_contract_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(record)
    tampered["fields"][1]["name"] = tampered["fields"][0]["name"]
    tampered_gate_results = evaluate_data_contract_gates(tampered, "run_data_contract_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "data_contract_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "fields invalid" in integrity_result["evidence"][0]["reason"]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"DATACONTRACT_GATE_GUARD_DID_NOT_FIRE: data_contract_integrity did not flag the duplicated field name "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "DataContractInvariantVerified",
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
        "data_contract_record": record,
        "minimal_data_contract_record": minimal_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_erd_slice.py)",
    }
    write_json(runtime / "results" / "data_contract_slice_result.json", result)
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
        result = run_data_contract_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["data_contract_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS database_data.data_contract: {len(record['fields'])} fields, {len(record['consumers'])} consumers, "
        f"schema_ref={record.get('schema_ref')}, freshness_ref={record.get('freshness_ref')}, "
        f"compatibility_ref={record.get('compatibility_ref')}, deprecation_ref={record.get('deprecation_ref')}, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
