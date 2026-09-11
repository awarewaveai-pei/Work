"""``decomposition.hierarchical_task_analysis`` vertical slice -- F02 decomposition & structuring
family, 1st member (family previously entirely unbuilt).

Scenario: a 4-level Hierarchical Task Analysis for assembling a flat-pack bookshelf (Goal ->
2 top-level tasks -> ... -> 1 leaf 3 levels deep) -- same synthetic style every sibling slice's CLI
demo uses. Covers all 3 real child-count classes at least once: a leaf (0 children, plan null), a
single-child node (1 child, plan null), and 2 multi-child nodes (2 children each, plan required and
disclosed). Then demonstrates EACH direction of the plan invariant once as a construction-time
REFUSAL (a >=2-children node missing its required plan; a 0-or-1-children node illegally carrying a
non-null plan), proving neither direction is toothless, same "show a real refusal, not only a real
success" discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a
VALID record directly (bypassing the builder) in BOTH directions to prove the independent gate, not
just the builder, catches each.

Run::

    python -m ai_lego.apps.cli.run_hierarchical_task_analysis_slice
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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decomposition.hierarchical_task_analysis import (
    METHOD_ID,
    all_gates_pass,
    evaluate_hierarchical_task_analysis_gates,
    generate_hierarchical_task_analysis,
    task_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-HTA-SYNTHETIC-001"
EXECUTION_ID = "EX-HTA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-HTA-001"

S = {
    "hta": "ai-lego://specs/cognitive/typed-objects/hierarchical-task-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-hierarchical-task-analysis-slice"


def _well_formed_goal() -> dict[str, Any]:
    """4-level tree: goal (2 children, plan required) -> prepare-tools (leaf) / assemble-body
    (2 children, plan required) -> assemble-base-and-sides (leaf) / attach-back-and-shelves
    (1 child, plan null) -> secure-back-panel-screws (leaf)."""
    secure_back_panel_screws = task_node("secure-back-panel-screws", "鎖背板螺絲固定層板位置", [])
    attach_back_and_shelves = task_node("attach-back-and-shelves", "裝背板與層板", [secure_back_panel_screws])
    assemble_base_and_sides = task_node("assemble-base-and-sides", "鎖底板與兩側板", [])
    assemble_body = task_node(
        "assemble-body",
        "組裝主體與收尾",
        [assemble_base_and_sides, attach_back_and_shelves],
        plan="先鎖底板與兩側板，再裝背板與層板",
    )
    prepare_tools = task_node("prepare-tools", "準備工具與材料", [])
    return task_node(
        "goal",
        "組裝書架",
        [prepare_tools, assemble_body],
        plan="先準備工具與材料，再組裝主體與收尾",
    )


def run_hierarchical_task_analysis_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. decomposition.hierarchical_task_
    # analysis resolves because its contract is ACTIVE in the spec root's methods/contracts/, exactly
    # the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed 4-level tree -- all 3 real child-count classes covered
    # (leaf/single-child/multi-child), invoked through the catalog's own per-invocation gate (ADR-023
    # Consequences 5's pattern, unchanged). ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_hierarchical_task_analysis,
        "HTA-2026-09-11-001",
        _well_formed_goal(),
    )
    contracts.validate(S["hta"], analysis, "hierarchical task analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "HierarchicalTaskAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_hierarchical_task_analysis_gates(analysis, "run_hierarchical_task_analysis_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decomposition.hierarchical_task_analysis gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("HTA_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof Direction 1 (plan REQUIRED for >=2 children) is not toothless -- a 2-children
    # node with no plan MUST be refused before any node is constructed. ---
    missing_plan_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        task_node("bad-multi-child", "壞掉的多子任務", [task_node("bad-multi-child-c1", "子任務一", []), task_node("bad-multi-child-c2", "子任務二", [])])
    except InvariantViolation as error:
        if "HTA_MISSING_PLAN_FOR_MULTI_CHILD" not in str(error):
            raise
        missing_plan_refusal_proof["raised"] = True
        missing_plan_refusal_proof["error_code"] = "HTA_MISSING_PLAN_FOR_MULTI_CHILD"
    if not missing_plan_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("HTA_INVARIANT_NOT_ENFORCED: a >=2-children node missing its plan was NOT refused -- Direction 1 is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingPlanForMultiChildRefused", {"refusal_proof": missing_plan_refusal_proof}, 1.3)
    milestones.append("MISSING_PLAN_REFUSAL_PROVEN")

    # --- Step 3: proof Direction 2 (plan FORBIDDEN for 0-or-1 children) is not toothless -- a leaf
    # node illegally carrying a non-null plan MUST be refused before any node is constructed. ---
    unexpected_plan_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        task_node("bad-leaf", "壞掉的葉節點", [], plan="不應該存在的計畫")
    except InvariantViolation as error:
        if "HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD" not in str(error):
            raise
        unexpected_plan_refusal_proof["raised"] = True
        unexpected_plan_refusal_proof["error_code"] = "HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD"
    if not unexpected_plan_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("HTA_INVARIANT_NOT_ENFORCED: a leaf node with a non-null plan was NOT refused -- Direction 2 is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "UnexpectedPlanForLeafRefused", {"refusal_proof": unexpected_plan_refusal_proof}, 1.5)
    milestones.append("UNEXPECTED_PLAN_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof, BOTH directions -- the INDEPENDENT gate catches a defect even
    # when a caller bypasses the builder entirely and mutates a raw dict directly. ---
    tampered_missing_plan = copy.deepcopy(analysis)
    tampered_missing_plan["goal"]["children"][1]["plan"] = None  # "assemble-body" has 2 children -- strips its required plan
    tampered_missing_plan_gate = evaluate_hierarchical_task_analysis_gates(tampered_missing_plan, "run_hierarchical_task_analysis_slice", clock.at(2.0))
    if all_gates_pass(tampered_missing_plan_gate):
        milestones.append("BLOCKED")
        raise InvariantViolation("HTA_GATE_NOT_INDEPENDENT: the independent gate did NOT catch a hand-tampered multi-child node with its plan stripped (Direction 1)")
    milestones.append("TAMPER_DIRECTION_1_CAUGHT")

    tampered_unexpected_plan = copy.deepcopy(analysis)
    tampered_unexpected_plan["goal"]["children"][0]["plan"] = "不應該存在的計畫"  # "prepare-tools" is a leaf -- injects a forbidden plan
    tampered_unexpected_plan_gate = evaluate_hierarchical_task_analysis_gates(tampered_unexpected_plan, "run_hierarchical_task_analysis_slice", clock.at(2.1))
    if all_gates_pass(tampered_unexpected_plan_gate):
        milestones.append("BLOCKED")
        raise InvariantViolation("HTA_GATE_NOT_INDEPENDENT: the independent gate did NOT catch a hand-tampered leaf node with an injected plan (Direction 2)")
    milestones.append("TAMPER_DIRECTION_2_CAUGHT")

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "TamperedRecordsCaughtByGate",
        {"tampered_missing_plan_gate_results": tampered_missing_plan_gate, "tampered_unexpected_plan_gate_results": tampered_unexpected_plan_gate},
        2.2,
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
        "analysis": analysis,
        "gate_results": gate_results,
        "missing_plan_refusal_proof": missing_plan_refusal_proof,
        "unexpected_plan_refusal_proof": unexpected_plan_refusal_proof,
        "tampered_missing_plan_gate_results": tampered_missing_plan_gate,
        "tampered_unexpected_plan_gate_results": tampered_unexpected_plan_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "hierarchical_task_analysis_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_hierarchical_task_analysis_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decomposition.hierarchical_task_analysis: HierarchicalTaskAnalysis {result['analysis']['id']} built, "
        f"gates [{gate_summary}]; HTA_MISSING_PLAN_FOR_MULTI_CHILD/HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD invariants "
        f"each REFUSED a malformed attempt ({result['missing_plan_refusal_proof']['error_code']}, "
        f"{result['unexpected_plan_refusal_proof']['error_code']}); hand-tampered records in BOTH directions caught via the "
        f"INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
