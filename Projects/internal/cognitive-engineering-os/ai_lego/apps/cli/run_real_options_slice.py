"""``feasibility.real_options`` vertical slice -- F14 feasibility family (Atlas L730).

Builds a real ``RealOptionsAnalysis`` modeling an EXPAND option (warehouse
expansion) with a real trigger condition and 2 distinct future states. Then
proves Atlas L730's own "避免一次性 yes/no" invariant is not toothless: a
construction-time attempt to declare an option with only 1 future state is
refused, and a hand-tampered valid record (an empty ``trigger_condition``
spliced in, bypassing the builder) is independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_real_options_slice
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
from ai_lego.modules.feasibility.real_options import (
    METHOD_ID,
    all_gates_pass,
    evaluate_option_structure_gate,
    evaluate_real_options_gates,
    generate_real_options_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ROPT-SYNTHETIC-001"
EXECUTION_ID = "EX-ROPT-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ROPT-001"

S = {
    "real_options_analysis": "ai-lego://specs/cognitive/typed-objects/real-options-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-real-options-slice"


def _well_formed_option() -> dict[str, Any]:
    return {
        "id": "OPT-EXPAND-WAREHOUSE",
        "option_type": "EXPAND",
        "trigger_condition": "首年海外訂單量連續 3 個月超過現有產能 80%",
        "cost": 250000,
        "future_states": [
            {"id": "FS-DEMAND-HIGH", "description": "海外需求持續成長，擴張後產能被充分利用", "estimated_value": 900000},
            {"id": "FS-DEMAND-FLAT", "description": "海外需求持平，擴張後產能閒置", "estimated_value": -120000},
        ],
    }


def run_real_options_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: a real EXPAND option with a trigger condition and 2 distinct future states. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_real_options_analysis,
        "ROPT-2026-09-12-001",
        "海外倉儲擴張決策",
        [_well_formed_option()],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["real_options_analysis"], record, "real options analysis")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RealOptionsAnalysisGenerated", {"real_options_analysis": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_real_options_gates(record, "run_real_options_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"real options gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ROPT_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RealOptionsGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L730's own "避免一次性 yes/no" invariant is real -- an option with only 1 future
    # state (a one-shot scenario) MUST be refused before any record is constructed. ---
    one_shot_option = _well_formed_option()
    one_shot_option["id"] = "OPT-ONE-SHOT"
    one_shot_option["future_states"] = [one_shot_option["future_states"][0]]
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_real_options_analysis("ROPT-ONE-SHOT-REFUSED-001", "X", [one_shot_option], make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "ROPT_INSUFFICIENT_FUTURE_STATES" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "ROPT_INSUFFICIENT_FUTURE_STATES"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ROPT_INVARIANT_NOT_ENFORCED: a single-future-state (one-shot) option was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "OneShotOptionRefused", {"refusal_proof": refusal_proof}, 1.3)
    milestones.append("ONE_SHOT_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches an emptied trigger_condition even when a
    # caller bypasses the builder entirely (direct mutation of a VALID record's own raw dict). ---
    tampered = copy.deepcopy(record)
    tampered["options"][0]["trigger_condition"] = "   "
    tampered_gate = evaluate_option_structure_gate(tampered, "run_real_options_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("ROPT_GATE_NOT_INDEPENDENT: the independent option_structure gate did NOT catch a hand-tampered blank trigger_condition")
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
        "real_options_analysis": record,
        "gate_results": gate_results,
        "one_shot_refusal_proof": refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_horizon_scanning_slice.py)",
    }
    write_json(runtime / "results" / "real_options_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_real_options_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS feasibility.real_options: RealOptionsAnalysis {result['real_options_analysis']['id']} built (1 option, 2 future states), gates [{gate_summary}]; "
        f"ROPT_INSUFFICIENT_FUTURE_STATES REFUSED a one-shot single-future-state option ({result['one_shot_refusal_proof']['error_code']}); "
        f"hand-tampered blank trigger_condition caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
