"""``causal.counterfactual_reasoning`` vertical slice -- Method Atlas slice for the F11 causal family's
"Counterfactual Reasoning" tool (Atlas F11 table row,
AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:617 -- the method's only citation).

Scenario (grounded, disclosed honestly, self-referential, same discipline run_problem_statement_slice.py
already applies): a synthetic price-increase intervention with a claimed no-intervention counterfactual and
disclosed assumptions, illustrating exactly the WHAT-IF comparison the table's own 4-stage pipeline
(intervention→actual→counterfactual→assumptions) describes.

Run::

    python -m ai_lego.apps.cli.run_counterfactual_reasoning_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.causal.counterfactual_reasoning import (
    METHOD_ID,
    all_gates_pass,
    evaluate_counterfactual_reasoning_gates,
    generate_counterfactual_reasoning_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-COUNTERFACTUALREASONING-SYNTHETIC-001"
EXECUTION_ID = "EX-COUNTERFACTUALREASONING-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-COUNTERFACTUALREASONING-001"

S = {
    "counterfactual_reasoning": "ai-lego://specs/cognitive/typed-objects/counterfactual-reasoning-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-counterfactual-reasoning-slice"


def run_counterfactual_reasoning_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. causal.counterfactual_reasoning resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- both invariants satisfied. ---
    record = generate_counterfactual_reasoning_record(
        "CFR-2026-09-10-001",
        "2026 Q2 將訂閱月費從 NT$299 調漲至 NT$349（+17%）",
        "調漲後 3 個月留存率從 92% 降至 87%，月營收淨增 4%",
        "若未調漲，留存率預估維持 92% 基準線，月營收持平（無淨增）",
        [
            "同期無其他重大產品變更或行銷活動足以單獨解釋留存率下降",
            "競品定價與可比性在此 3 個月內未發生足以轉移使用者的重大變化",
            "留存率的既有下滑趨勢（若有）在調漲前已扣除，非本次比較污染源",
        ],
        make_provenance("HYPOTHESIS", "HUMAN_APPROVED"),
    )
    contracts.validate(S["counterfactual_reasoning"], record, "counterfactual reasoning record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "CounterfactualReasoningRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_counterfactual_reasoning_gates(record, "run_counterfactual_reasoning_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"counterfactual_reasoning gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("COUNTERFACTUAL_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the assumptions invariant is not toothless -- a deliberately empty assumptions list
    # MUST be refused before any record is constructed (Atlas's own 4th pipeline stage). ---
    empty_assumptions_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_counterfactual_reasoning_record(
            "CFR-REFUSED-001",
            "同上",
            "同上但不同字串",
            "同上但又不同字串",
            [],  # empty assumptions -- an undisclosed-assumption counterfactual is exactly the risk this method exists to prevent
            make_provenance("HYPOTHESIS", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "COUNTERFACTUAL_EMPTY_ASSUMPTIONS" not in str(error):
            raise
        empty_assumptions_refusal_proof["raised"] = True
        empty_assumptions_refusal_proof["error_code"] = "COUNTERFACTUAL_EMPTY_ASSUMPTIONS"
    if not empty_assumptions_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("COUNTERFACTUAL_INVARIANT_NOT_ENFORCED: empty assumptions was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EmptyAssumptionsRecordRefused", {"refusal_proof": empty_assumptions_refusal_proof}, 1.5)
    milestones.append("EMPTY_ASSUMPTIONS_REFUSAL_PROVEN")

    # --- Step 3: proof the distinctness invariant is not toothless -- counterfactual_outcome identical to
    # actual_outcome (the core degenerate WHAT-IF case: no real comparison being made) MUST be refused. ---
    echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_counterfactual_reasoning_record(
            "CFR-ECHO-REFUSED-001",
            "調漲月費 17%",
            "留存率降至 87%",
            "留存率降至 87%",  # identical to actual_outcome -- an echo, not a genuine counterfactual claim
            ["某假設"],
            make_provenance("HYPOTHESIS", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "COUNTERFACTUAL_COUNTERFACTUAL_ECHOES_ACTUAL" not in str(error):
            raise
        echo_refusal_proof["raised"] = True
        echo_refusal_proof["error_code"] = "COUNTERFACTUAL_COUNTERFACTUAL_ECHOES_ACTUAL"
    if not echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("COUNTERFACTUAL_INVARIANT_NOT_ENFORCED: counterfactual_outcome==actual_outcome was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EchoRecordRefused", {"echo_refusal_proof": echo_refusal_proof}, 1.7)
    milestones.append("ECHO_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely. ---
    tampered = dict(record)
    tampered["assumptions"] = []  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_counterfactual_reasoning_gates(tampered, "run_counterfactual_reasoning_slice", clock.at(1.9))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("COUNTERFACTUAL_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered empty assumptions list")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.0)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "record": record,
        "gate_results": gate_results,
        "empty_assumptions_refusal_proof": empty_assumptions_refusal_proof,
        "echo_refusal_proof": echo_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_problem_statement_slice.py)",
    }
    write_json(runtime / "results" / "counterfactual_reasoning_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_counterfactual_reasoning_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS causal.counterfactual_reasoning: CounterfactualReasoningRecord {result['record']['id']} built with "
        f"{len(result['record']['assumptions'])} disclosed assumptions, {len(result['gate_results'])} gates all PASS; "
        f"EMPTY_ASSUMPTIONS invariant REFUSED a malformed attempt ({result['empty_assumptions_refusal_proof']['error_code']}); "
        f"COUNTERFACTUAL_ECHOES_ACTUAL invariant REFUSED an echoing attempt ({result['echo_refusal_proof']['error_code']}); "
        f"empty-assumptions tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
