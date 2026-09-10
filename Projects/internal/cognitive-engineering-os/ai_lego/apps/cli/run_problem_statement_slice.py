"""``framing.problem_statement`` vertical slice -- Method Atlas slice for the F01 framing family's "Problem
Statement" tool (Atlas F01 table row, AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:341 -- the
method's only citation).

Scenario (grounded, disclosed honestly, self-referential, same discipline run_goal_statement_slice.py already
applies): this run's own ProblemStatement IS this slice's own real task brief, restated in the method's
current/expected/gap shape -- Atlas F01's "Problem Statement" row had no method contract, no module, no gate,
and no CLI even though its own OUTPUT SCHEMA (typed-objects/problem-statement.schema.yaml) already existed and
was already required input for 5 other built methods.

Run::

    python -m ai_lego.apps.cli.run_problem_statement_slice
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
from ai_lego.modules.framing.problem_statement import (
    METHOD_ID,
    all_gates_pass,
    evaluate_problem_statement_gates,
    generate_problem_statement,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PROBLEMSTATEMENT-SYNTHETIC-001"
EXECUTION_ID = "EX-PROBLEMSTATEMENT-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-PROBLEMSTATEMENT-001"

S = {
    "problem_statement": "ai-lego://specs/cognitive/typed-objects/problem-statement.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-problem-statement-slice"


def run_problem_statement_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. framing.problem_statement resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- both invariants satisfied. Self-referential scenario,
    # see module docstring: this IS this slice's own real task brief. ---
    record = generate_problem_statement(
        "PROB-2026-09-10-001",
        "Atlas F01「Problem Statement」在 method-inventory.yaml 標 has_contract:false；輸出型別 schema 早已存在且被 5 個已建方法引用為必要輸入，但沒有任何方法真正產生它",
        "framing.problem_statement 有真實 contract、gate、CLI demo、測試，且輸出重用既有 schema（不重複造型別）",
        "F01 這一列從 Atlas 命名到現在，一直缺一個真正的 producer -- 6 個消費端只能自己手刻不受管制的假資料",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        status="validated",
        affected_stakeholders=["Cognitive OS 下游 6 個消費方法（fishbone/event_tree/fault_tree/kepner_tregoe/decision_tree/change_analysis）", "同批平行建置 framing.5w1h 等其他 agent"],
        impact="F01 框架族缺一個真正的鏈起點 producer，下游方法只能繞過 gate 手刻假資料",
        evidence=["methods/contracts/ 內 5 個 sibling contract 皆宣告 inputs.required: [ProblemStatement]（grep 確認）"],
        constraints=["不得修改 contract-backlog.yaml / method-inventory.yaml（留給整合階段）", "不得重造第二份 problem-statement schema"],
        origin_method=METHOD_ID,
    )
    contracts.validate(S["problem_statement"], record, "problem statement record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ProblemStatementRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_problem_statement_gates(record, "run_problem_statement_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"problem_statement gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("PROBLEMSTATEMENT_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof Invariant #1 is not toothless -- a deliberately empty gap MUST be refused before any
    # record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_problem_statement(
            "PROB-REFUSED-001",
            "同上",
            "同上但不同字串",
            "",  # empty gap -- a "problem statement" with no stated gap is exactly the ambiguity this method exists to eliminate
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "PROBLEMSTATEMENT_EMPTY_GAP" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "PROBLEMSTATEMENT_EMPTY_GAP"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PROBLEMSTATEMENT_INVARIANT_NOT_ENFORCED: an empty gap was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 1.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 3: proof Invariant #2 is not toothless -- expected_state identical to current_state MUST be
    # refused (no real gap, just an echo). ---
    echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_problem_statement(
            "PROB-ECHO-REFUSED-001",
            "訂單取消率 8%",
            "訂單取消率 8%",  # identical to current_state -- an echo, not a checkable gap
            "無差距",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "PROBLEMSTATEMENT_EXPECTED_ECHOES_CURRENT" not in str(error):
            raise
        echo_refusal_proof["raised"] = True
        echo_refusal_proof["error_code"] = "PROBLEMSTATEMENT_EXPECTED_ECHOES_CURRENT"
    if not echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PROBLEMSTATEMENT_INVARIANT_NOT_ENFORCED: expected_state==current_state was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EchoRecordRefused", {"echo_refusal_proof": echo_refusal_proof}, 1.7)
    milestones.append("ECHO_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely. ---
    tampered = dict(record)
    tampered["content"] = dict(tampered["content"])
    tampered["content"]["gap"] = ""  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_problem_statement_gates(tampered, "run_problem_statement_slice", clock.at(1.9))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("PROBLEMSTATEMENT_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered empty gap")
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
        "refusal_proof": refusal_proof,
        "echo_refusal_proof": echo_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_goal_statement_slice.py)",
    }
    write_json(runtime / "results" / "problem_statement_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_problem_statement_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS framing.problem_statement: ProblemStatement {result['record']['id']} built with "
        f"status={result['record']['status']!r}, {len(result['gate_results'])} gates all PASS; "
        f"EMPTY_GAP invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"EXPECTED_ECHOES_CURRENT invariant REFUSED an echoing attempt ({result['echo_refusal_proof']['error_code']}); "
        f"empty-gap tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
