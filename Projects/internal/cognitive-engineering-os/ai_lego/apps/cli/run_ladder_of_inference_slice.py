"""``epistemic.ladder_of_inference`` vertical slice -- F10 epistemic-quality family (Atlas L572).

Climbs a synthetic customer-complaint ladder through all four Ladder of
Inference rungs (observed data -> meaning assigned -> assumption made ->
conclusion drawn), then proves Atlas's own ascending climb order (L572:
"追 data→meaning→assumption→conclusion") is a real invariant, not mere
narrative order: a construction-time attempt to populate `assumptions_made`
while skipping `meanings_assigned` is refused, and a hand-tampered valid
record (`meanings_assigned` wiped after construction, bypassing the
builder) is independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_ladder_of_inference_slice
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
from ai_lego.modules.epistemic.ladder_of_inference import (
    METHOD_ID,
    all_gates_pass,
    evaluate_ascending_completeness_gate,
    evaluate_ladder_of_inference_gates,
    generate_ladder_of_inference_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-LADDER-SYNTHETIC-001"
EXECUTION_ID = "EX-LADDER-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-LADDER-001"

S = {
    "ladder_of_inference_analysis": "ai-lego://specs/cognitive/typed-objects/ladder-of-inference-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-ladder-of-inference-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "observed_data": ["客戶在會議中遲到 10 分鐘且沒有事先通知"],
        "meanings_assigned": ["這代表他不重視這次合作"],
        "assumptions_made": ["假設準時等於重視程度，且遲到必然是故意的"],
        "conclusions_drawn": ["結論：這個客戶不值得投入更多資源"],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_ladder_of_inference_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed analysis -- all four rungs populated in Atlas's own ascending order. ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_ladder_of_inference_analysis,
        "LADDER-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["ladder_of_inference_analysis"], analysis, "ladder of inference analysis")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "LadderOfInferenceAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_ladder_of_inference_gates(analysis, "run_ladder_of_inference_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"ladder of inference gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"LADDER_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "LadderOfInferenceGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L572's own ascending climb order is not toothless -- populating `assumptions_made`
    # while skipping `meanings_assigned` MUST be refused before any record is constructed. ---
    skip_meaning_kwargs = {**_well_formed_kwargs(), "meanings_assigned": []}
    skip_meaning_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_ladder_of_inference_analysis("LADDER-SKIP-MEANING-REFUSED-001", **skip_meaning_kwargs)
    except InvariantViolation as error:
        if "LADDER_ASSUMPTION_WITHOUT_MEANING" not in str(error):
            raise
        skip_meaning_refusal_proof["raised"] = True
        skip_meaning_refusal_proof["error_code"] = "LADDER_ASSUMPTION_WITHOUT_MEANING"
    if not skip_meaning_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("LADDER_INVARIANT_NOT_ENFORCED: assumptions_made populated while meanings_assigned was empty was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SkipMeaningRungRefused", {"refusal_proof": skip_meaning_refusal_proof}, 1.3)
    milestones.append("SKIP_MEANING_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely (wipes `meanings_assigned` directly on a copy of a VALID record's own raw dict). ---
    tampered = copy.deepcopy(analysis)
    tampered["meanings_assigned"] = []
    tampered_gate = evaluate_ascending_completeness_gate(tampered, "run_ladder_of_inference_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("LADDER_GATE_NOT_INDEPENDENT: the independent ascending_completeness gate did NOT catch a hand-tampered record with assumptions_made populated but meanings_assigned wiped")
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
        "ladder_of_inference_analysis": analysis,
        "gate_results": gate_results,
        "skip_meaning_refusal_proof": skip_meaning_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "ladder_of_inference_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_ladder_of_inference_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS epistemic.ladder_of_inference: LadderOfInferenceAnalysis {result['ladder_of_inference_analysis']['id']} built (4 rungs), gates [{gate_summary}]; "
        f"LADDER_ASSUMPTION_WITHOUT_MEANING REFUSED a skip-meaning-rung attempt ({result['skip_meaning_refusal_proof']['error_code']}); "
        f"hand-tampered record (meanings_assigned wiped) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
