"""``database_data.data_quality_dimensions`` vertical slice -- the forty-second Method Atlas slice, eighth
member of the `database_data` family. Directly closes `database_data.data_contract`'s own OQ-DC-2.

Builds a real two-dimension assessment where one dimension fails its
own threshold (QUARANTINED overall, all four Data-Gate soft links
populated), and a minimal single-dimension PASS assessment with no
optional soft links. Then proves the dimension-shape invariant is real
by attempting to construct a record with an illegal dimension enum
value (construction layer), and proves the "re-derived, not trusted"
discipline at the independent gate layer by hand-tampering a COPY of
the valid QUARANTINED record to falsely claim `quality_gate_status:
PASS` (gate layer).

Run::

    python -m ai_lego.apps.cli.run_data_quality_dimensions_slice
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
from ai_lego.modules.database_data.data_quality_dimensions import (
    METHOD_ID,
    all_gates_pass,
    evaluate_data_quality_gates,
    generate_data_quality_assessment_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DATAQUALITY-SYNTHETIC-001"
EXECUTION_ID = "EX-DATAQUALITY-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-DATAQUALITY-001"

S = {
    "data_quality_record": "ai-lego://specs/cognitive/typed-objects/data-quality-assessment-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _dim(dimension: str, rule: str, profiled_score: float, threshold: float, owner: str) -> dict[str, Any]:
    return {"dimension": dimension, "rule": rule, "profiled_score": profiled_score, "threshold": threshold, "owner": owner}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-data-quality-dimensions-slice"


def run_data_quality_dimensions_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real two-dimension assessment: Completeness passes, Accuracy fails and is quarantined. All four
    # Data-Gate soft links populated (schema/lineage/restore_drill/data_contract). ---
    descriptor, order_events_record = catalog.invoke(
        METHOD_ID,
        generate_data_quality_assessment_record,
        "DQ-2026-09-06-001",
        "checkout-api.order-events (Kafka topic)",
        [
            _dim("completeness", "customer_id must be non-null for every event", 0.98, 0.95, "checkout-platform-team"),
            _dim("accuracy", "total_cents must equal sum of line items within 1 cent", 0.80, 0.99, "checkout-platform-team"),
        ],
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        schema_ref="ERD-2026-09-05-001",
        lineage_ref="DLR-2026-09-05-001",
        restore_drill_ref="DRILL-2026-09-05-001",
        data_contract_ref="DC-2026-09-05-001",
    )
    contracts.validate(S["data_quality_record"], order_events_record, "order-events data quality record")
    if order_events_record["quality_gate_status"] != "QUARANTINED":
        raise InvariantViolation(f"DATAQUALITY_EXPECTED_QUARANTINED: expected QUARANTINED, got {order_events_record['quality_gate_status']!r}")
    if len(order_events_record["quarantined_dimensions"]) != 1 or order_events_record["quarantined_dimensions"][0]["dimension"] != "accuracy":
        raise InvariantViolation(f"DATAQUALITY_EXPECTED_ONE_ACCURACY_QUARANTINE: got {order_events_record['quarantined_dimensions']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DataQualityAssessmentRecordGenerated", {"data_quality_record": order_events_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_data_quality_gates(order_events_record, "run_data_quality_dimensions_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"data quality gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DATAQUALITY_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DataQualityGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal single-dimension PASS assessment, no optional soft links. ---
    _, reference_record = catalog.invoke(
        METHOD_ID,
        generate_data_quality_assessment_record,
        "DQ-2026-09-06-002",
        "internal-reference.country-codes",
        [_dim("uniqueness", "iso_code must be unique across all rows", 1.0, 1.0, "data-platform-team")],
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["data_quality_record"], reference_record, "country-codes data quality record")
    if reference_record["quality_gate_status"] != "PASS":
        raise InvariantViolation(f"DATAQUALITY_EXPECTED_PASS: expected PASS, got {reference_record['quality_gate_status']!r}")

    # --- Prove the dimension-shape invariant is real, at the CONSTRUCTION layer: an illegal dimension enum
    # value. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_data_quality_assessment_record(
            "DQ-2026-09-06-003",
            "some-dataset",
            [_dim("freshness", "not a real dimension", 0.9, 0.9, "some-team")],
            make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "DATAQUALITY_INVALID_DIMENSIONS" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("DATAQUALITY_INVARIANT_GUARD_DID_NOT_FIRE: an illegal dimension enum value was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid QUARANTINED record and hand-tamper it to falsely claim quality_gate_status: PASS,
    # leaving every dimension entry's own raw profiled_score/threshold UNTOUCHED. Pinned to the SPECIFIC
    # data_quality_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(order_events_record)
    tampered["quality_gate_status"] = "PASS"
    tampered["quarantined_dimensions"] = []
    tampered_gate_results = evaluate_data_quality_gates(tampered, "run_data_quality_dimensions_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "data_quality_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "disagrees with recomputation" in integrity_result["evidence"][0]["reason"]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"DATAQUALITY_GATE_GUARD_DID_NOT_FIRE: data_quality_integrity did not flag the falsely-claimed PASS status "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "DataQualityInvariantVerified",
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
        "order_events_data_quality_record": order_events_record,
        "reference_data_quality_record": reference_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_normalization_slice.py)",
    }
    write_json(runtime / "results" / "data_quality_dimensions_slice_result.json", result)
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
        result = run_data_quality_dimensions_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["order_events_data_quality_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS database_data.data_quality_dimensions: order_events={record['quality_gate_status']} "
        f"({len(record['dimensions'])} dimensions, {len(record['quarantined_dimensions'])} quarantined), "
        f"reference={result['reference_data_quality_record']['quality_gate_status']}, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
