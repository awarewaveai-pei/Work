"""``epistemic.toulmin_model`` vertical slice -- F10 epistemic-quality family (Atlas L574).

Builds a real ``ToulminArgument`` for a synthetic staffing-plan claim (all
six Toulmin columns filled: claim, grounds, warrant, backing, qualifier,
rebuttal), then proves Atlas's own missing-bridge rule (L574: "防止缺推理
橋梁") is real at both independent layers: a construction-time attempt to
build a claim+grounds record with a blank warrant is refused, and a
hand-tampered valid record (`warrant` wiped after construction, bypassing
the builder) is independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_toulmin_model_slice
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
from ai_lego.modules.epistemic.toulmin_model import (
    METHOD_ID,
    all_gates_pass,
    evaluate_missing_bridge_gate,
    evaluate_toulmin_model_gates,
    generate_toulmin_argument,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-TOULMIN-SYNTHETIC-001"
EXECUTION_ID = "EX-TOULMIN-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-TOULMIN-001"

S = {
    "toulmin_argument": "ai-lego://specs/cognitive/typed-objects/toulmin-argument.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-toulmin-model-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "claim": "團隊應該在下一季增加兩名後端工程師",
        "grounds": ["過去兩季 API 平均回應時間從 200ms 上升到 800ms", "目前 on-call 輪值只有 3 人，低於建議下限"],
        "warrant": "回應時間變慢與 on-call 人力不足都是工程產能不足的直接徵兆，而產能不足會直接拖慢下一季的交付承諾",
        "backing": ["前兩次類似的人力擴編都在一季內讓回應時間恢復到 300ms 以下"],
        "qualifier": "假設下一季的流量成長率維持在目前的 +-20% 區間內",
        "rebuttal": "若下一季有大型功能凍結或流量預期萎縮，則不需要立即擴編",
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_toulmin_model_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed argument -- all six Toulmin columns filled, including a real bridge. ---
    descriptor, argument = catalog.invoke(
        METHOD_ID,
        generate_toulmin_argument,
        "TOULMIN-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["toulmin_argument"], argument, "toulmin argument")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ToulminArgumentGenerated", {"argument": argument, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_toulmin_model_gates(argument, "run_toulmin_model_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"toulmin model gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"TOULMIN_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ToulminModelGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L574's own missing-bridge rule is not toothless -- a claim+grounds record with a
    # blank warrant MUST be refused before any record is constructed. ---
    blank_warrant_kwargs = {**_well_formed_kwargs(), "backing": [], "warrant": "   "}
    missing_bridge_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_toulmin_argument("TOULMIN-MISSING-WARRANT-REFUSED-001", **blank_warrant_kwargs)
    except InvariantViolation as error:
        if "TOULMIN_MISSING_WARRANT" not in str(error):
            raise
        missing_bridge_refusal_proof["raised"] = True
        missing_bridge_refusal_proof["error_code"] = "TOULMIN_MISSING_WARRANT"
    if not missing_bridge_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("TOULMIN_INVARIANT_NOT_ENFORCED: a blank warrant was NOT refused -- the missing-bridge invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingBridgeRefused", {"refusal_proof": missing_bridge_refusal_proof}, 1.3)
    milestones.append("MISSING_BRIDGE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely (wipes `warrant` directly on a copy of a VALID record's own raw dict). ---
    tampered = copy.deepcopy(argument)
    tampered["warrant"] = ""
    tampered_gate = evaluate_missing_bridge_gate(tampered, "run_toulmin_model_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("TOULMIN_GATE_NOT_INDEPENDENT: the independent missing_bridge gate did NOT catch a hand-tampered record with backing populated but warrant wiped")
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
        "toulmin_argument": argument,
        "gate_results": gate_results,
        "missing_bridge_refusal_proof": missing_bridge_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "toulmin_model_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_toulmin_model_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS epistemic.toulmin_model: ToulminArgument {result['toulmin_argument']['id']} built (6 columns), gates [{gate_summary}]; "
        f"TOULMIN_MISSING_WARRANT REFUSED a blank-warrant attempt ({result['missing_bridge_refusal_proof']['error_code']}); "
        f"hand-tampered record (warrant wiped) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
