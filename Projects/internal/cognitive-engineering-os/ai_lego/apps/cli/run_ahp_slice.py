"""``decision.ahp`` vertical slice -- the seventh Method Atlas slice, first from the ``decision`` family (F16).

Unlike every prior slice this session, this one is NOT chained off a
``CauseHypothesisSet`` -- AHP is a standalone decision method: a real
pairwise-comparison matrix, geometric-mean weight derivation, Saaty's own
published consistency check, and (optionally) a weighted option ranking,
all computed by ``ai_lego/compute/ahp/weights.py`` (hand-verified against
a known perfectly-consistent case before this CLI was written).

Run::

    python -m ai_lego.apps.cli.run_ahp_slice
"""

from __future__ import annotations

import argparse
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
from ai_lego.modules.decision.ahp import (
    METHOD_ID,
    all_gates_pass,
    evaluate_ahp_gates,
    generate_ahp_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-AHP-SYNTHETIC-001"
EXECUTION_ID = "EX-AHP-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-AHP-001"

S = {
    "ahp_analysis": "ai-lego://specs/cognitive/typed-objects/ahp-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-ahp-slice"


def run_ahp_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real 3-criteria, 2-option decision: which product direction to prioritize next quarter, weighing
    # revenue potential against engineering feasibility and strategic fit. ---
    criteria = [
        {"id": "C1", "label": "營收潛力"},
        {"id": "C2", "label": "工程可行性"},
        {"id": "C3", "label": "策略契合度"},
    ]
    pairwise_comparisons = [
        {"criterion_a_id": "C1", "criterion_b_id": "C2", "value": 2.0},
        {"criterion_a_id": "C1", "criterion_b_id": "C3", "value": 4.0},
        {"criterion_a_id": "C2", "criterion_b_id": "C3", "value": 2.0},
    ]
    options = [{"id": "O1", "label": "方案 A：擴充既有訂閱功能"}, {"id": "O2", "label": "方案 B：新開一條產品線"}]
    option_scores = [
        {"option_id": "O1", "criterion_id": "C1", "score": 0.8},
        {"option_id": "O1", "criterion_id": "C2", "score": 0.5},
        {"option_id": "O1", "criterion_id": "C3", "score": 0.2},
        {"option_id": "O2", "criterion_id": "C1", "score": 0.3},
        {"option_id": "O2", "criterion_id": "C2", "score": 0.9},
        {"option_id": "O2", "criterion_id": "C3", "score": 0.9},
    ]
    descriptor, ahp_analysis = catalog.invoke(
        METHOD_ID,
        generate_ahp_analysis,
        "AHP-2026-09-04-001",
        "選擇下一季優先投入的產品方向",
        criteria,
        pairwise_comparisons,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        options=options,
        option_scores=option_scores,
    )
    contracts.validate(S["ahp_analysis"], ahp_analysis, "ahp analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AhpAnalysisGenerated", {"ahp_analysis": ahp_analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_ahp_gates(ahp_analysis, "run_ahp_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"ahp gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"AHP_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AhpGatesEvaluated", {"gate_results": gate_results}, 1.2)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("GATES_PASSED")
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "ahp_analysis": ahp_analysis,
        "gate_results": gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "ahp_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_ahp_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    analysis = result["ahp_analysis"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decision.ahp: weights={[(w['criterion_id'], round(w['weight'], 4)) for w in analysis['criteria_weights']]}, "
        f"CR={analysis['consistency_ratio']}, consistent={analysis['consistent']}, ranking={analysis['ranking']}, gates [{gate_summary}]"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
