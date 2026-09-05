"""``devops_sre.load_test`` vertical slice -- the thirty-fifth Method Atlas slice, tenth from the
`devops_sre` family.

Builds a real passed load test (5x load, p95 doubled but under budget,
db_connections named as the bottleneck) and a real failed one (same
load, p95 blew the budget). Then proves the baseline->target invariant
is real by attempting to construct a record whose target load equals
its baseline load (construction layer), and proves the "computed, not
asserted" discipline at the independent gate layer by hand-tampering a
COPY of the failed record to claim `status: passed` and a friendlier
bottleneck while leaving every raw measurement untouched (gate layer).

Run::

    python -m ai_lego.apps.cli.run_load_test_slice
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
from ai_lego.modules.devops_sre.load_test import (
    METHOD_ID,
    all_gates_pass,
    evaluate_load_test_gates,
    generate_load_test_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-LOADTEST-SYNTHETIC-001"
EXECUTION_ID = "EX-LOADTEST-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-LOADTEST-001"

S = {
    "load_test_record": "ai-lego://specs/cognitive/typed-objects/load-test-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

BASELINE = {"load_rps": 100, "latency_p95_ms": 120, "error_rate": 0.001, "resource_utilization": {"cpu": 0.35, "db_connections": 0.40, "memory": 0.50}}
TARGET_OK = {"load_rps": 500, "latency_p95_ms": 240, "error_rate": 0.004, "resource_utilization": {"cpu": 0.72, "db_connections": 0.91, "memory": 0.55}}
TARGET_SLOW = {"load_rps": 500, "latency_p95_ms": 420, "error_rate": 0.004, "resource_utilization": {"cpu": 0.72, "db_connections": 0.98, "memory": 0.55}}
ACCEPTANCE = {"latency_p95_ms_max": 300, "error_rate_max": 0.01}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-load-test-slice"


def run_load_test_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real passed load test: 100 -> 500 rps, p95 120 -> 240 ms (budget 300), db_connections at 91%. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_load_test_record,
        "LOADTEST-2026-09-05-001",
        "checkout-api v2.3 on staging",
        BASELINE,
        TARGET_OK,
        ACCEPTANCE,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["load_test_record"], record, "load test record")
    if record["status"] != "passed" or record["bottleneck"]["resource"] != "db_connections":
        raise InvariantViolation(f"LOADTEST_EXPECTED_PASSED: expected passed with db_connections bottleneck, got {record['status']!r}/{record['bottleneck']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "LoadTestRecordGenerated", {"load_test_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_load_test_gates(record, "run_load_test_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"load test gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"LOADTEST_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "LoadTestGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real failed load test: same load, p95 420 ms blows the 300 ms budget. ---
    _, failed_record = catalog.invoke(
        METHOD_ID,
        generate_load_test_record,
        "LOADTEST-2026-09-05-002",
        "checkout-api v2.3 on staging",
        BASELINE,
        TARGET_SLOW,
        ACCEPTANCE,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["load_test_record"], failed_record, "failed load test record")
    if failed_record["status"] != "failed":
        raise InvariantViolation(f"LOADTEST_EXPECTED_FAILED: expected status:failed, got {failed_record['status']!r}")

    # --- Prove the baseline->target invariant is real, at the CONSTRUCTION layer: a target at the SAME load
    # as the baseline is not a load test of the expected load. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_load_test_record(
            "LOADTEST-2026-09-05-003",
            "checkout-api v2.3 on staging",
            BASELINE,
            dict(TARGET_OK, load_rps=100),
            ACCEPTANCE,
            make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "LOADTEST_LOAD_NOT_INCREASED" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("LOADTEST_INVARIANT_GUARD_DID_NOT_FIRE: a target load equal to the baseline load was accepted (or a different guard fired instead)")

    # --- Prove the SAME "computed, not asserted" discipline at the independent GATE layer: take a COPY of the
    # real, valid FAILED record and hand-tamper its own COMPUTED status/bottleneck to claim "passed" with a
    # friendlier bottleneck, leaving every raw measurement UNTOUCHED. Pinned to the SPECIFIC
    # load_test_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(failed_record)
    tampered["status"] = "passed"
    tampered["bottleneck"] = {"resource": "memory", "utilization": 0.55}
    tampered_gate_results = evaluate_load_test_gates(tampered, "run_load_test_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "load_test_integrity")
    mismatches = integrity_result["evidence"][0].get("mismatches", {})
    gate_layer_blocked = integrity_result["status"] == "FAIL" and set(mismatches) == {"status", "bottleneck"}
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"LOADTEST_GATE_GUARD_DID_NOT_FIRE: load_test_integrity did not flag the tampered status/bottleneck "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "LoadTestInvariantVerified",
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
        "load_test_record": record,
        "failed_load_test_record": failed_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "load_test_slice_result.json", result)
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
        result = run_load_test_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["load_test_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.load_test: {record['baseline']['load_rps']}->{record['target']['load_rps']} rps, latency_ratio={record['latency_ratio']}, "
        f"error_rate_delta={record['error_rate_delta']}, bottleneck={record['bottleneck']['resource']}@{record['bottleneck']['utilization']}, status={record['status']}, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
