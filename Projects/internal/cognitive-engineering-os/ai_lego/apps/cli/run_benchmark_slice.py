"""``experiment.benchmark`` vertical slice -- F15 experiment & validation family (Atlas L748).

Builds a well-formed 2-candidate benchmark record (baseline + 1 comparator)
over a synthetic checkout-latency workload, then proves Atlas's own "fixed
workload/metrics/environment" pipeline stage is a real invariant, not mere
narrative order: a construction-time attempt to submit a candidate scored on
a DIFFERENT metric set (missing one of the fixed metrics) is refused, and a
hand-tampered valid record (a candidate's results[] gains an extra metric
key not in the fixed set, bypassing the builder) is independently caught by
the fixed_metric_coverage gate.

Run::

    python -m ai_lego.apps.cli.run_benchmark_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.experiment.benchmark import (
    METHOD_ID,
    all_gates_pass,
    evaluate_benchmark_gates,
    evaluate_fixed_metric_coverage_gate,
    generate_benchmark,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BENCHMARK-SYNTHETIC-001"
EXECUTION_ID = "EX-BENCHMARK-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-BENCHMARK-001"

S = {
    "benchmark_record": "ai-lego://specs/cognitive/typed-objects/benchmark-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-benchmark-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "workload": {"description": "10k synthetic checkout requests, fixed seed", "parameters": {"request_count": 10000, "seed": 42}},
        "environment": {"description": "single c6i.xlarge, us-east-1, cold cache", "parameters": {"instance_type": "c6i.xlarge", "region": "us-east-1"}},
        "metrics": ["p95_latency_ms", "throughput_rps", "error_rate"],
        "candidates": [
            {"candidate_id": "baseline-v1", "label": "Current production checkout", "results": {"p95_latency_ms": 420, "throughput_rps": 180, "error_rate": 0.004}},
            {"candidate_id": "candidate-v2", "label": "New checkout flow", "results": {"p95_latency_ms": 310, "throughput_rps": 240, "error_rate": 0.002}},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_benchmark_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed benchmark -- 2 candidates, both scored on the identical fixed
    # metric set. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_benchmark,
        "BENCH-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["benchmark_record"], record, "benchmark record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BenchmarkGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_benchmark_gates(record, "run_benchmark_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"benchmark gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BENCH_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BenchmarkGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L748's own "fixed workload/metrics/environment" pipeline stage is not
    # toothless -- a candidate scored on a DIFFERENT metric set (missing error_rate) MUST be
    # refused before any record is constructed. ---
    mismatched_kwargs = copy.deepcopy(_well_formed_kwargs())
    del mismatched_kwargs["candidates"][1]["results"]["error_rate"]
    metric_mismatch_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_benchmark("BENCH-METRIC-MISMATCH-REFUSED-001", **mismatched_kwargs)
    except InvariantViolation as error:
        if "BENCH_METRIC_MISMATCH" not in str(error):
            raise
        metric_mismatch_refusal_proof["raised"] = True
        metric_mismatch_refusal_proof["error_code"] = "BENCH_METRIC_MISMATCH"
    if not metric_mismatch_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BENCH_INVARIANT_NOT_ENFORCED: a candidate missing a fixed metric was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MetricMismatchRefused", {"refusal_proof": metric_mismatch_refusal_proof}, 1.3)
    milestones.append("METRIC_MISMATCH_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT fixed_metric_coverage gate catches the
    # same defect class even when a caller bypasses the builder entirely (an extra, non-fixed
    # metric key added to one candidate's results after construction). ---
    tampered = copy.deepcopy(record)
    tampered["candidates"][0]["results"]["cpu_utilization_pct"] = 55
    tampered_gate = evaluate_fixed_metric_coverage_gate(tampered, "run_benchmark_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("BENCH_GATE_NOT_INDEPENDENT: the independent fixed_metric_coverage gate did NOT catch a hand-tampered extra metric key")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
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
        "benchmark_record": record,
        "gate_results": gate_results,
        "metric_mismatch_refusal_proof": metric_mismatch_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "benchmark_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_benchmark_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.benchmark: BenchmarkRecord {result['benchmark_record']['id']} built "
        f"(2 candidates, fixed metric set {result['benchmark_record']['metrics']}), gates [{gate_summary}]; "
        f"BENCH_METRIC_MISMATCH REFUSED a missing-fixed-metric attempt "
        f"({result['metric_mismatch_refusal_proof']['error_code']}); "
        f"hand-tampered extra metric key caught via the INDEPENDENT gate "
        f"({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
