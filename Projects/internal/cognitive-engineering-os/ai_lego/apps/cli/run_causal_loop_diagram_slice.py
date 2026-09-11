"""``systems.causal_loop_diagram`` vertical slice -- F09 systems thinking family (Atlas L541-559), opening
member this batch.

Builds Atlas's own F09 worked mermaid diagram (L554-562) as a real ``CausalLoopDiagram``: 5 variables, 6 signed
causal edges, 2 closed feedback loops, both independently recomputed BALANCING by this method's own parity rule
(each loop contains exactly 1 negative edge). Then proves the loop_type recompute invariant is real at BOTH
independent layers -- a caller-claimed loop_type disagreeing with the recomputed one is refused BEFORE
construction, and a hand-tampered record that bypassed the builder entirely (loop_type flipped after the fact)
is still caught by the gate's own independent re-derivation.

Run::

    python -m ai_lego.apps.cli.run_causal_loop_diagram_slice
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
from ai_lego.modules.systems.causal_loop_diagram import (
    METHOD_ID,
    all_gates_pass,
    edge,
    evaluate_causal_loop_diagram_gates,
    generate_causal_loop_diagram,
    loop,
    variable,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CLD-SYNTHETIC-001"
EXECUTION_ID = "EX-CLD-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CLD-001"

S = {
    "causal_loop_diagram": "ai-lego://specs/cognitive/typed-objects/causal-loop-diagram.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-causal-loop-diagram-slice"


def run_causal_loop_diagram_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Atlas's own F09 worked diagram (L554-562), transcribed: price/demand/load/quality/economies-of-scale,
    # 2 closed loops, both independently recomputed BALANCING (each contains exactly 1 negative edge). ---
    variables = [
        variable("VA", "價格下降"),
        variable("VB", "需求增加"),
        variable("VC", "系統負載"),
        variable("VD", "服務品質"),
        variable("VE", "規模經濟"),
    ]
    edges = [
        edge("E1", "VA", "VB", "+"),
        edge("E2", "VB", "VC", "+"),
        edge("E3", "VC", "VD", "-"),
        edge("E4", "VD", "VB", "+"),
        edge("E5", "VB", "VE", "+"),
        edge("E6", "VE", "VA", "-"),
    ]
    loops = [
        loop("L1", ["E2", "E3", "E4"], "BALANCING"),
        loop("L2", ["E1", "E5", "E6"], "BALANCING"),
    ]
    descriptor, diagram = catalog.invoke(
        METHOD_ID,
        generate_causal_loop_diagram,
        "CLD-2026-09-11-001",
        variables,
        edges,
        loops,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["causal_loop_diagram"], diagram, "causal loop diagram")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CausalLoopDiagramGenerated", {"causal_loop_diagram": diagram, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_causal_loop_diagram_gates(diagram, "run_causal_loop_diagram_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"causal loop diagram gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CLD_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CausalLoopDiagramGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the loop_type recompute invariant is real, at BOTH independent layers (same discipline
    # challenge.red_team's own no-final-authority proof and causal.dag's own acyclic_verified proof already
    # established): L1's own edges (E2 '+', E3 '-', E4 '+') recompute to BALANCING (1 negative edge, odd). ---
    construction_layer_blocked = False
    try:
        generate_causal_loop_diagram(
            "CLD-2026-09-11-002",
            variables,
            edges,
            [loop("L1", ["E2", "E3", "E4"], "REINFORCING")],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "CLD_LOOP_TYPE_MISMATCH" in str(error)

    tampered = copy.deepcopy(diagram)
    tampered["loops"][0]["loop_type"] = "REINFORCING"
    tampered_gate_results = evaluate_causal_loop_diagram_gates(tampered, "run_causal_loop_diagram_slice", clock.at(1.3))
    gate_layer_blocked = not all_gates_pass(tampered_gate_results)

    if not (construction_layer_blocked and gate_layer_blocked):
        raise InvariantViolation(
            f"CLD_MISMATCH_GUARD_DID_NOT_FIRE: construction_layer_blocked={construction_layer_blocked}, gate_layer_blocked={gate_layer_blocked} -- "
            "both layers must independently refuse a mismatched loop_type"
        )
    ledger.append(
        CASCADIA.tenant_id,
        AGGREGATE_ID,
        "CausalLoopDiagramMismatchGuardVerified",
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
        "causal_loop_diagram": diagram,
        "gate_results": gate_results,
        "mismatch_guard_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "causal_loop_diagram_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_causal_loop_diagram_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["mismatch_guard_verification"]
    print(
        f"PASS systems.causal_loop_diagram: {len(result['causal_loop_diagram']['variables'])} variables, "
        f"{len(result['causal_loop_diagram']['edges'])} edges, {len(result['causal_loop_diagram']['loops'])} loops, "
        f"gates [{gate_summary}], mismatch_guard_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
