"""``foresight.historical_analogy`` vertical slice -- F13 (Unknown Unknowns & Foresight) family.

Builds a real ``HistoricalAnalogySet`` comparing a synthetic platform-migration
proposal to a historical infrastructure cutover, then demonstrates the real
invariant is enforced at both layers: (1) a construction-time refusal when an
analogy is missing its required ``differences``/``analogy_limits`` (the
surface-level analogy Atlas L674 exists to prevent), and (2) an independent
gate catching the same defect on a hand-tampered record that bypassed the
builder entirely.

Run::

    python -m ai_lego.apps.cli.run_historical_analogy_slice
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
from ai_lego.modules.foresight.historical_analogy import (
    METHOD_ID,
    all_gates_pass,
    analogy,
    evaluate_historical_analogy_gates,
    generate_historical_analogy_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-HISTORICALANALOGY-SYNTHETIC-001"
EXECUTION_ID = "EX-HISTORICALANALOGY-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-HISTORICALANALOGY-001"

S = {
    "historical_analogy_set": "ai-lego://specs/cognitive/typed-objects/historical-analogy.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-historical-analogy-slice"


def run_historical_analogy_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real analogy: similarities AND differences AND an extracted mechanism AND stated limits. ---
    analogies = [
        analogy(
            "HA-1",
            "1990 年代電信業從類比交換機轉數位交換機的分階段切換",
            ["都是核心基礎設施的不可逆轉換", "都要求新舊系統並行一段時間"],
            ["當年是硬體汰換，現在是純軟體重構", "當年監理框架強制分階段，現在無外部強制時程"],
            "並行雙軌 + 漸進流量切換，降低單點失敗風險",
            "電信轉換有明確法規時程與資金保障，本案沒有對應的外部強制與資金後盾，類比僅適用於技術切換節奏，不適用於時程與預算規劃",
        ),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_historical_analogy_set,
        "HANALOGY-2026-09-12-001",
        "PROP-2026-09-12-001: 把核心資料庫從單體搬到微服務",
        analogies,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["historical_analogy_set"], record, "historical analogy set")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "HistoricalAnalogySetGenerated", {"historical_analogy_set": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_historical_analogy_gates(record, "run_historical_analogy_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"historical analogy gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"HANALOGY_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "HistoricalAnalogyGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the real invariant is real, at both layers. ---
    # Layer 1: construction-time refusal -- an analogy with similarities but NO differences/limits is the
    # surface-level analogy Atlas L674 exists to prevent.
    construction_refused = False
    try:
        analogy("HA-BAD", "some historical case", ["only a similarity"], [], "a mechanism", "")
    except InvariantViolation:
        construction_refused = True

    # Layer 2: independent gate catches a hand-tampered record that bypassed the builder entirely (mutate a
    # deep copy so the already-validated `record` above is untouched).
    tampered = copy.deepcopy(record)
    tampered["analogies"][0]["differences"] = []
    tampered["analogies"][0]["analogy_limits"] = ""
    gate_on_tampered = evaluate_historical_analogy_gates(tampered, "run_historical_analogy_slice", clock.at(1.3))
    gate_caught_tamper = not all_gates_pass(gate_on_tampered)

    if not (construction_refused and gate_caught_tamper):
        raise InvariantViolation(
            f"HANALOGY_INVARIANT_GUARD_DID_NOT_FIRE: construction_refused={construction_refused}, gate_caught_tamper={gate_caught_tamper} -- "
            "both layers must independently refuse a surface-level analogy"
        )
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "HistoricalAnalogyInvariantVerified", {"construction_refused": construction_refused, "gate_caught_tamper": gate_caught_tamper}, 1.4)
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
        "historical_analogy_set": record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_refused": construction_refused, "gate_caught_tamper": gate_caught_tamper},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "historical_analogy_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_historical_analogy_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["invariant_verification"]
    print(f"PASS foresight.historical_analogy: 1 analogy, gates [{gate_summary}], surface_level_analogy_refused(construction={v['construction_refused']}, gate={v['gate_caught_tamper']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
