"""``devops_sre.soak_test`` vertical slice -- the thirty-seventh Method Atlas slice, twelfth from the
`devops_sre` family.

Builds a real stable soak (four samples over 3 hours at a constant 200
rps, no degradation) and a real leaking soak (same shape, memory climbs
steadily, flagged as a degraded resource). Then proves the constant-load
invariant is real by attempting to construct a record with one sample
at a different load level (construction layer), and proves the
"computed, not asserted" discipline at the independent gate layer by
hand-tampering a COPY of the leaking record to claim no degradation
occurred, leaving every raw sample untouched (gate layer).

Run::

    python -m ai_lego.apps.cli.run_soak_test_slice
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
from ai_lego.modules.devops_sre.soak_test import (
    METHOD_ID,
    all_gates_pass,
    evaluate_soak_test_gates,
    generate_soak_test_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SOAKTEST-SYNTHETIC-001"
EXECUTION_ID = "EX-SOAKTEST-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SOAKTEST-001"

S = {
    "soak_test_record": "ai-lego://specs/cognitive/typed-objects/soak-test-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _measurement(p95: float, error_rate: float, util: dict[str, float]) -> dict[str, Any]:
    return {"load_rps": 200, "latency_p95_ms": p95, "error_rate": error_rate, "resource_utilization": util}


def _sample(elapsed: float, p95: float, error_rate: float, util: dict[str, float]) -> dict[str, Any]:
    return {"elapsed_minutes": elapsed, "measurement": _measurement(p95, error_rate, util)}


STABLE_SAMPLES = [
    _sample(0, 140, 0.002, {"cpu": 0.40, "memory": 0.35, "db_connections": 0.30}),
    _sample(60, 142, 0.002, {"cpu": 0.41, "memory": 0.36, "db_connections": 0.31}),
    _sample(120, 141, 0.003, {"cpu": 0.40, "memory": 0.37, "db_connections": 0.30}),
    _sample(180, 143, 0.002, {"cpu": 0.42, "memory": 0.38, "db_connections": 0.31}),
]
LEAKING_SAMPLES = [
    _sample(0, 140, 0.002, {"cpu": 0.40, "memory": 0.35, "db_connections": 0.30}),
    _sample(60, 145, 0.002, {"cpu": 0.41, "memory": 0.55, "db_connections": 0.31}),
    _sample(120, 150, 0.003, {"cpu": 0.40, "memory": 0.75, "db_connections": 0.30}),
    _sample(180, 155, 0.003, {"cpu": 0.42, "memory": 0.95, "db_connections": 0.31}),
]
THRESHOLDS = {"latency_p95_increase_ms_max": 20, "error_rate_increase_max": 0.01, "resource_increase_max": 0.10}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-soak-test-slice"


def run_soak_test_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real stable soak: four samples over 3 hours at a constant 200 rps, no degradation. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_soak_test_record,
        "SOAKTEST-2026-09-05-001",
        "checkout-api v2.3 on staging",
        200,
        STABLE_SAMPLES,
        THRESHOLDS,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["soak_test_record"], record, "soak test record")
    if record["degradation"]["overall_degraded"] is not False:
        raise InvariantViolation(f"SOAKTEST_EXPECTED_STABLE: expected overall_degraded:False, got {record['degradation']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SoakTestRecordGenerated", {"soak_test_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_soak_test_gates(record, "run_soak_test_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"soak test gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SOAKTEST_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SoakTestGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real leaking soak: same shape, memory climbs steadily, flagged as a degraded resource. ---
    _, leaking_record = catalog.invoke(
        METHOD_ID,
        generate_soak_test_record,
        "SOAKTEST-2026-09-05-002",
        "checkout-api v2.3 on staging",
        200,
        LEAKING_SAMPLES,
        THRESHOLDS,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["soak_test_record"], leaking_record, "leaking soak test record")
    if leaking_record["degradation"]["degraded_resources"] != ["memory"]:
        raise InvariantViolation(f"SOAKTEST_EXPECTED_MEMORY_LEAK: expected degraded_resources==['memory'], got {leaking_record['degradation']['degraded_resources']!r}")

    # --- Prove the constant-load invariant is real, at the CONSTRUCTION layer: one sample at a DIFFERENT load
    # level than the declared sustained_load_rps. Must be refused. ---
    construction_layer_blocked = False
    try:
        tampered_input_samples = copy.deepcopy(STABLE_SAMPLES)
        tampered_input_samples[2]["measurement"]["load_rps"] = 999
        generate_soak_test_record(
            "SOAKTEST-2026-09-05-003",
            "checkout-api v2.3 on staging",
            200,
            tampered_input_samples,
            THRESHOLDS,
            make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "SOAKTEST_LOAD_NOT_CONSTANT" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("SOAKTEST_INVARIANT_GUARD_DID_NOT_FIRE: a sample at a different load level than sustained_load_rps was accepted (or a different guard fired instead)")

    # --- Prove the SAME "computed, not asserted" discipline at the independent GATE layer: take a COPY of the
    # real, valid LEAKING record and hand-tamper its own COMPUTED degradation to claim stability, leaving
    # every raw sample UNTOUCHED. Pinned to the SPECIFIC soak_test_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(leaking_record)
    tampered["degradation"] = {"latency_degraded": False, "error_rate_degraded": False, "degraded_resources": [], "overall_degraded": False}
    tampered_gate_results = evaluate_soak_test_gates(tampered, "run_soak_test_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "soak_test_integrity")
    mismatches = integrity_result["evidence"][0].get("mismatches", {})
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "overall_degraded" in mismatches and "degraded_resources" in mismatches
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"SOAKTEST_GATE_GUARD_DID_NOT_FIRE: soak_test_integrity did not flag the smuggled stable verdict "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "SoakTestInvariantVerified",
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
        "soak_test_record": record,
        "leaking_soak_test_record": leaking_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "soak_test_slice_result.json", result)
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
        result = run_soak_test_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["soak_test_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.soak_test: {len(record['samples'])} samples over {record['samples'][-1]['elapsed_minutes']} min at {record['sustained_load_rps']} rps, "
        f"overall_degraded={record['degradation']['overall_degraded']}, gates [{gate_summary}], "
        f"invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
