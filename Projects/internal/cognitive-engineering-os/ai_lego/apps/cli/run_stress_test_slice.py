"""``devops_sre.stress_test`` vertical slice -- the thirty-sixth Method Atlas slice, eleventh from the
`devops_sre` family.

Builds a real escalating ladder that finds a cliff at step 3 (1000 rps)
followed by a successful recovery at a reduced load, and a real ladder
that never exceeds a safe margin (no cliff, no recovery field). Then
proves the recovery-iff-cliff invariant is real by attempting to
construct a record with a real breaking point but NO recovery
observation (construction layer), and proves the "computed, not
asserted" discipline at the independent gate layer by hand-tampering a
COPY of the cliff record to claim `breaking_point: null` while leaving
every raw load step untouched (gate layer).

Run::

    python -m ai_lego.apps.cli.run_stress_test_slice
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
from ai_lego.modules.devops_sre.stress_test import (
    METHOD_ID,
    all_gates_pass,
    evaluate_stress_test_gates,
    generate_stress_test_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-STRESSTEST-SYNTHETIC-001"
EXECUTION_ID = "EX-STRESSTEST-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-STRESSTEST-001"

S = {
    "stress_test_record": "ai-lego://specs/cognitive/typed-objects/stress-test-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

BREAKING_LADDER = [
    {"load_rps": 500, "latency_p95_ms": 240, "error_rate": 0.004, "resource_utilization": {"cpu": 0.72, "db_connections": 0.91, "memory": 0.55}},
    {"load_rps": 750, "latency_p95_ms": 310, "error_rate": 0.006, "resource_utilization": {"cpu": 0.85, "db_connections": 0.97, "memory": 0.60}},
    {"load_rps": 900, "latency_p95_ms": 480, "error_rate": 0.02, "resource_utilization": {"cpu": 0.95, "db_connections": 1.0, "memory": 0.66}},
    {"load_rps": 1000, "latency_p95_ms": 1800, "error_rate": 0.35, "resource_utilization": {"cpu": 0.99, "db_connections": 1.0, "memory": 0.70}},
]
SAFE_LADDER = [
    {"load_rps": 500, "latency_p95_ms": 240, "error_rate": 0.004, "resource_utilization": {"cpu": 0.40, "db_connections": 0.50, "memory": 0.30}},
    {"load_rps": 750, "latency_p95_ms": 280, "error_rate": 0.005, "resource_utilization": {"cpu": 0.55, "db_connections": 0.65, "memory": 0.35}},
]
THRESHOLDS = {"latency_p95_ms_max": 500, "error_rate_max": 0.05}
RECOVERY = {"reduced_load_rps": 600, "latency_p95_ms": 260, "error_rate": 0.005, "recovered": True}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-stress-test-slice"


def run_stress_test_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real escalating ladder that finds a cliff at step 3 (1000 rps), followed by a successful recovery. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_stress_test_record,
        "STRESSTEST-2026-09-05-001",
        "checkout-api v2.3 on staging",
        500,
        BREAKING_LADDER,
        THRESHOLDS,
        RECOVERY,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["stress_test_record"], record, "stress test record")
    if record["breaking_point"] != {"step_index": 3, "load_rps": 1000} or record["recovery"]["recovered"] is not True:
        raise InvariantViolation(f"STRESSTEST_EXPECTED_CLIFF_AND_RECOVERY: expected breaking_point at step 3 with recovered:True, got {record['breaking_point']!r}/{record['recovery']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "StressTestRecordGenerated", {"stress_test_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_stress_test_gates(record, "run_stress_test_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stress test gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"STRESSTEST_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "StressTestGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real ladder that never exceeds a safe margin: no cliff, no recovery field. ---
    _, safe_record = catalog.invoke(
        METHOD_ID,
        generate_stress_test_record,
        "STRESSTEST-2026-09-05-002",
        "checkout-api v2.3 on staging",
        500,
        SAFE_LADDER,
        THRESHOLDS,
        None,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["stress_test_record"], safe_record, "stress test record without a cliff")
    if safe_record["breaking_point"] is not None or safe_record["recovery"] is not None:
        raise InvariantViolation(f"STRESSTEST_EXPECTED_NO_CLIFF: expected breaking_point/recovery both null, got {safe_record['breaking_point']!r}/{safe_record['recovery']!r}")

    # --- Prove the recovery-iff-cliff invariant is real, at the CONSTRUCTION layer: a real breaking point with
    # NO recovery observation supplied. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_stress_test_record(
            "STRESSTEST-2026-09-05-003",
            "checkout-api v2.3 on staging",
            500,
            BREAKING_LADDER,
            THRESHOLDS,
            None,
            make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "STRESSTEST_MISSING_RECOVERY" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("STRESSTEST_INVARIANT_GUARD_DID_NOT_FIRE: a real breaking point with no recovery observation was accepted (or a different guard fired instead)")

    # --- Prove the SAME "computed, not asserted" discipline at the independent GATE layer: take a COPY of the
    # real, valid CLIFF record and hand-tamper its own COMPUTED breaking_point/recovery to claim no cliff was
    # found, leaving every raw load step UNTOUCHED. Pinned to the SPECIFIC stress_test_integrity gate. ---
    tampered = copy.deepcopy(record)
    tampered["breaking_point"] = None
    tampered["recovery"] = None
    tampered_gate_results = evaluate_stress_test_gates(tampered, "run_stress_test_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "stress_test_integrity")
    evidence = integrity_result["evidence"][0]
    gate_layer_blocked = integrity_result["status"] == "FAIL" and evidence.get("reason") == "breaking_point mismatch" and evidence.get("stored") is None
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"STRESSTEST_GATE_GUARD_DID_NOT_FIRE: stress_test_integrity did not flag the smuggled null breaking_point "
            f"(status={integrity_result['status']}, evidence={evidence})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "StressTestInvariantVerified",
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
        "stress_test_record": record,
        "safe_stress_test_record": safe_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "stress_test_slice_result.json", result)
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
        result = run_stress_test_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["stress_test_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.stress_test: {len(record['load_steps'])} steps, breaking_point={record['breaking_point']}, "
        f"recovered={record['recovery']['recovered']}, gates [{gate_summary}], "
        f"invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
