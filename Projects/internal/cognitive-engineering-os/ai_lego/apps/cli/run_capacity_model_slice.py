"""``devops_sre.capacity_model`` vertical slice -- the thirty-first Method Atlas slice, sixth from the
`devops_sre` family.

Builds a real healthy-capacity record (29% headroom after 6 periods of
10% growth) and a real insufficient-capacity record (same growth
projection against too little current capacity, headroom negative).
Then demonstrates the threshold-ordering precondition is real by
attempting to construct a record with ``low_threshold_ratio >=
high_threshold_ratio`` (construction layer), and demonstrates the
status/headroom_ratio computation is genuinely re-derived, not merely
re-read, by hand-tampering a valid record's own COMPUTED fields while
leaving its raw inputs untouched (gate layer).

Run::

    python -m ai_lego.apps.cli.run_capacity_model_slice
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
from ai_lego.modules.devops_sre.capacity_model import (
    METHOD_ID,
    all_gates_pass,
    evaluate_capacity_model_gates,
    generate_capacity_model_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CAPACITYMODEL-SYNTHETIC-001"
EXECUTION_ID = "EX-CAPACITYMODEL-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-CAPACITYMODEL-001"

S = {
    "capacity_model_record": "ai-lego://specs/cognitive/typed-objects/capacity-model-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-capacity-model-slice"


def run_capacity_model_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real healthy projection: 1000 req/s growing 10%/period for 6 periods, 5 cores provisioned. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_capacity_model_record,
        "CAPMODEL-2026-09-05-001",
        "checkout-api CPU cores",
        1000.0,
        0.10,
        6,
        0.002,
        5.0,
        0.15,
        0.60,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["capacity_model_record"], record, "capacity model record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CapacityModelRecordGenerated", {"capacity_model_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_capacity_model_gates(record, "run_capacity_model_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"capacity model gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CAPACITYMODEL_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CapacityModelGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real insufficient projection: SAME growth, only 3 cores provisioned -- negative headroom. ---
    _, insufficient_record = catalog.invoke(
        METHOD_ID,
        generate_capacity_model_record,
        "CAPMODEL-2026-09-05-002",
        "checkout-api CPU cores",
        1000.0,
        0.10,
        6,
        0.002,
        3.0,
        0.15,
        0.60,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["capacity_model_record"], insufficient_record, "insufficient capacity model record")
    if insufficient_record["status"] != "insufficient":
        raise InvariantViolation(f"CAPACITYMODEL_EXPECTED_INSUFFICIENT: expected status:insufficient, got {insufficient_record['status']!r}")

    # --- Prove the threshold-ordering precondition is real, at the CONSTRUCTION layer: attempt to build a
    # record with low_threshold_ratio >= high_threshold_ratio. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_capacity_model_record(
            "CAPMODEL-2026-09-05-003", "x", 1000.0, 0.10, 6, 0.002, 5.0, 0.60, 0.15, make_provenance("CALCULATED_RESULT", "AI_GENERATED")
        )
    except InvariantViolation as error:
        construction_layer_blocked = "CAPACITYMODEL_INVALID_THRESHOLDS" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("CAPACITYMODEL_INVARIANT_GUARD_DID_NOT_FIRE: a record with low_threshold_ratio >= high_threshold_ratio was accepted (or a different guard fired instead)")

    # --- Prove the SAME "computed, not asserted" discipline at the independent GATE layer: take a COPY of
    # the real, valid healthy record and hand-tamper its own COMPUTED status/headroom_ratio to claim
    # "insufficient" while leaving every raw input field (current_workload, growth_rate_per_period, etc.)
    # UNTOUCHED. Pinned to the SPECIFIC capacity_integrity gate and its own evidence (not "any gate failed for
    # any reason"). ---
    tampered = copy.deepcopy(record)
    tampered["status"] = "insufficient"
    tampered["headroom_ratio"] = -0.5
    tampered_gate_results = evaluate_capacity_model_gates(tampered, "run_capacity_model_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "capacity_integrity")
    mismatches = integrity_result["evidence"][0].get("mismatches", {})
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "status" in mismatches and "headroom_ratio" in mismatches
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"CAPACITYMODEL_GATE_GUARD_DID_NOT_FIRE: capacity_integrity did not flag the tampered status/headroom_ratio "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "CapacityModelInvariantVerified",
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
        "capacity_model_record": record,
        "insufficient_capacity_model_record": insufficient_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "capacity_model_slice_result.json", result)
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
        result = run_capacity_model_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["capacity_model_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.capacity_model: headroom_ratio={record['headroom_ratio']:.4f}, status={record['status']}, gates [{gate_summary}], "
        f"invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
