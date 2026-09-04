"""``computation.monte_carlo`` vertical slice -- the eleventh Method Atlas slice, first from the `computation`
family (the first family this session opened outside Atlas's own F01-F24 numbering).

Builds a real 2-input-distribution project-cost simulation (material cost,
normally distributed; labor cost, triangularly distributed -- summed),
10000 runs, seeded for reproducibility, with a caller-defined success
criterion (total cost at or below budget). Computed by
``ai_lego/compute/montecarlo/simulation.py::run_simulation`` (hand-
verified against known statistical facts -- fixed-seed reproducibility,
large-N normal convergence, uniform/triangular bounds, success-probability
sanity -- before this CLI was written). Then demonstrates Atlas §22.3's
own no-guaranteed-outcome rule (L4153) is real the same way
``run_red_team_slice.py``/``run_mcda_slice.py`` already proved it for
sibling methods: attempts to smuggle a ``guaranteed`` key onto a copy of a
valid record and confirms it is refused at both the runtime layer and the
schema layer independently.

Run::

    python -m ai_lego.apps.cli.run_monte_carlo_slice
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
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.computation.monte_carlo import (
    METHOD_ID,
    all_gates_pass,
    assert_no_certainty_claim,
    evaluate_monte_carlo_gates,
    generate_monte_carlo_simulation,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-MONTECARLO-SYNTHETIC-001"
EXECUTION_ID = "EX-MONTECARLO-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-MONTECARLO-001"

S = {
    "monte_carlo_simulation": "ai-lego://specs/cognitive/typed-objects/monte-carlo-simulation.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-monte-carlo-slice"


def run_monte_carlo_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real project-cost simulation: material cost (normal, uncertain around a central estimate) plus labor
    # cost (triangular, min/most-likely/max bounded), summed. Success = total cost stays within a $90,000 budget. ---
    input_distributions = [
        {"id": "D1", "label": "材料成本（美元）", "distribution_type": "normal", "params": {"mean": 50000, "std_dev": 8000}},
        {"id": "D2", "label": "工時成本（美元）", "distribution_type": "triangular", "params": {"min": 20000, "mode": 30000, "max": 45000}},
    ]
    descriptor, simulation = catalog.invoke(
        METHOD_ID,
        generate_monte_carlo_simulation,
        "MC-2026-09-04-001",
        input_distributions,
        42,
        10000,
        "材料成本（D1）std_dev 對 P95 尾端影響最大；工時成本（D2）三角分布上界對高成本情境有貢獻但幅度較小。人工檢查，非機械計算。",
        make_provenance("SIMULATED_RESULT", "AI_GENERATED"),
        success_threshold=90000,
        success_direction="at_most",
    )
    contracts.validate(S["monte_carlo_simulation"], simulation, "monte carlo simulation")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MonteCarloSimulationGenerated", {"monte_carlo_simulation": simulation, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_monte_carlo_gates(simulation, "run_monte_carlo_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"monte carlo gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MONTECARLO_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MonteCarloGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove Atlas §22.3 (L4153) is real: attempt to smuggle a "guaranteed" key onto a COPY of the record, at
    # both layers. Neither attempt may succeed. ---
    tampered = copy.deepcopy(simulation)
    tampered["guaranteed"] = True
    runtime_layer_blocked = False
    try:
        assert_no_certainty_claim(tampered)
    except InvariantViolation:
        runtime_layer_blocked = True
    schema_layer_blocked = False
    try:
        contracts.validate(S["monte_carlo_simulation"], tampered, "tampered simulation (must be refused)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not (runtime_layer_blocked and schema_layer_blocked):
        raise InvariantViolation(
            f"MONTECARLO_CERTAINTY_GUARD_DID_NOT_FIRE: runtime_layer_blocked={runtime_layer_blocked}, schema_layer_blocked={schema_layer_blocked} -- "
            "both layers must independently refuse a smuggled certainty claim"
        )
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MonteCarloNoCertaintyClaimVerified", {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked}, 1.3)
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
        "monte_carlo_simulation": simulation,
        "gate_results": gate_results,
        "no_certainty_claim_verification": {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "monte_carlo_slice_result.json", result)
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
        result = run_monte_carlo_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    simulation = result["monte_carlo_simulation"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["no_certainty_claim_verification"]
    outcome = simulation["outcome_distribution"]
    print(
        f"PASS computation.monte_carlo: mean={outcome['mean']:.1f}, P95={simulation['tail_risk']['tail_value']:.1f}, "
        f"success_probability={simulation['success_probability']}, gates [{gate_summary}], "
        f"no_certainty_claim_verified(runtime={v['runtime_layer_blocked']}, schema={v['schema_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
