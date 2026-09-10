"""``framing.goal_statement`` vertical slice -- Method Atlas slice for the F01 framing family's "Goal
Statement" tool (Atlas F01 table row, AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:334 -- the
method's only citation).

Scenario (grounded, disclosed honestly, self-referential): this run's own GoalStatementRecord IS this
slice's own real task brief, restated in the method's 5-field shape -- not a synthetic Cascadia scenario.
The goal, beneficiaries, timeframe, success_condition, and constraints below are the literal terms this
session was given for building ``framing.goal_statement`` itself (operator task brief, this session,
2026-09-08). Disclosed as self-referential rather than presented as an independent example, same honesty
discipline every sibling slice in this family already applies to its own scenario grounding.

Question this run answers: does a method with a FLAT, heterogeneously-shaped record (unlike
root_cause.kepner_tregoe's positional 2x4 array, unlike learning.kill_criteria's closed-3-enum threshold
set, unlike root_cause.fishbone's forbidden-transition promotion chain) assemble against the same shared
LEGO framework with zero changes to any of it? Every import below except
``ai_lego.modules.framing.goal_statement`` itself is unchanged, reused code.

This run demonstrates BOTH real invariants twice each: once as a construction-time PASS (a complete,
well-formed record), and once as a construction-time REFUSAL (a deliberately malformed attempt), proving
neither invariant is toothless -- same "show a real refusal, not only a real success" discipline
``security.abuse_case``/``root_cause.kepner_tregoe``'s own CLI demos already establish. A final step then
hand-tampers a VALID record directly (bypassing the builder) to prove the independent gate, not just the
builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_goal_statement_slice
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
from ai_lego.modules.framing.goal_statement import (
    METHOD_ID,
    all_gates_pass,
    evaluate_goal_statement_gates,
    generate_goal_statement,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-GOALSTATEMENT-SYNTHETIC-001"
EXECUTION_ID = "EX-GOALSTATEMENT-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-GOALSTATEMENT-001"

S = {
    "goal_statement": "ai-lego://specs/cognitive/typed-objects/goal-statement-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-goal-statement-slice"


def run_goal_statement_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. framing.goal_statement resolves because
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
    record = generate_goal_statement(
        "GOAL-2026-09-08-001",
        "把 framing.goal_statement 建成有 contract、schema、gate、CLI demo、測試的 ai_lego 模組",
        ["Cognitive OS 後續使用者（消費 F01 framing 記錄的下游方法）", "同批平行建置 framing.smart / framing.non_goals 的其他 agent"],
        "本次 session 內完成",
        "CLI demo 兩個真發生的 InvariantViolation 拒絕都証實、unittest 全綠、contract 通過 method.schema.yaml 驗證",
        ["不得修改 contract-backlog.yaml / method-inventory.yaml（留給整合階段的 orchestrating session）", "不得與另外 2 個並行 agent 的檔案重疊"],
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["goal_statement"], record, "goal statement record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "GoalStatementRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_goal_statement_gates(record, "run_goal_statement_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"goal_statement gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("GOALSTATEMENT_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof Invariant #1 is not toothless -- a deliberately empty constraints list MUST be
    # refused before any record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_goal_statement(
            "GOAL-REFUSED-001",
            "同上",
            ["同上"],
            "同上",
            "同上但不同字串",
            [],  # empty constraints -- a "goal statement" with zero limits is exactly the vague-wish shape this method exists to eliminate
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "GOALSTATEMENT_EMPTY_CONSTRAINTS" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "GOALSTATEMENT_EMPTY_CONSTRAINTS"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("GOALSTATEMENT_INVARIANT_NOT_ENFORCED: an empty constraints list was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 1.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 3: proof Invariant #2 is not toothless -- success_condition identical to goal MUST be refused. ---
    echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_goal_statement(
            "GOAL-ECHO-REFUSED-001",
            "把 X 完成",
            ["某人"],
            "某時",
            "把 X 完成",  # identical to goal -- an echo, not a checkable condition
            ["某限制"],
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "GOALSTATEMENT_SUCCESS_ECHOES_GOAL" not in str(error):
            raise
        echo_refusal_proof["raised"] = True
        echo_refusal_proof["error_code"] = "GOALSTATEMENT_SUCCESS_ECHOES_GOAL"
    if not echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("GOALSTATEMENT_INVARIANT_NOT_ENFORCED: success_condition==goal was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EchoRecordRefused", {"echo_refusal_proof": echo_refusal_proof}, 1.7)
    milestones.append("ECHO_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely. ---
    tampered = dict(record)
    tampered["beneficiaries"] = []  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_goal_statement_gates(tampered, "run_goal_statement_slice", clock.at(1.9))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("GOALSTATEMENT_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered empty beneficiaries list")
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
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "goal_statement_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_goal_statement_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS framing.goal_statement: GoalStatementRecord {result['record']['id']} built with "
        f"{len(result['record']['beneficiaries'])} beneficiaries/{len(result['record']['constraints'])} constraints, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"EMPTY_CONSTRAINTS invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"SUCCESS_ECHOES_GOAL invariant REFUSED an echoing attempt ({result['echo_refusal_proof']['error_code']}); "
        f"empty-beneficiaries tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
