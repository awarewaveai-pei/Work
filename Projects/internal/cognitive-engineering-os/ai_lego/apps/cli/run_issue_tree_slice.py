"""``decomposition.issue_tree`` vertical slice -- F02 "拆解與結構化" family, 1st member, opening a brand-new
family (see ``ai_lego/modules/decomposition/issue_tree.py`` for the full due-diligence read: Atlas F02 table
row L363 + dedicated §12.6 worked example, the differentiation from ``association.mind_map``'s own fixed
4-level shape, and the whole-tree id-uniqueness invariant this slice exercises below).

Scenario: an issue tree for a market-entry question ("是否進入新市場?", the exact root question §12.6's own
mermaid diagram uses), 2 levels deep, 6 nodes total (1 root + 3 first-level branches, one of which itself has 2
second-level children) -- same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed
``IssueTree``, then demonstrates the ONE real invariant (whole-tree node-id uniqueness) is not toothless via a
construction-time REFUSAL (two nodes sharing an id), same "show a real refusal, not only a real success"
discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a VALID record
directly (bypassing the builder) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_issue_tree_slice
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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decomposition.issue_tree import (
    METHOD_ID,
    all_gates_pass,
    all_questions,
    evaluate_issue_tree_gates,
    generate_issue_tree,
    issue_tree_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ISSUETREE-SYNTHETIC-001"
EXECUTION_ID = "EX-ISSUETREE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-ISSUETREE-001"

S = {
    "issue_tree": "ai-lego://specs/cognitive/typed-objects/issue-tree.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-issue-tree-slice"


def _well_formed_root() -> dict[str, Any]:
    """§12.6's own worked example root question, decomposed 2 levels deep (5 nodes total): 1 root + 3
    first-level branches, one of which (market attractiveness) itself has 2 second-level children."""
    return issue_tree_node(
        "Q-ROOT",
        "是否進入新市場?",
        children=[
            issue_tree_node(
                "Q-L1-MARKET",
                "市場吸引力是否足夠?",
                children=[
                    issue_tree_node("Q-L2-MARKET-SIZE", "目標市場規模是否達到最低可行門檻?"),
                    issue_tree_node("Q-L2-MARKET-GROWTH", "該市場年成長率是否高於公司整體平均?"),
                ],
            ),
            issue_tree_node("Q-L1-CAPABILITY", "公司能力是否足以支撐進入?"),
            issue_tree_node("Q-L1-FINANCE", "財務可行性是否成立?"),
        ],
    )


def run_issue_tree_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. decomposition.issue_tree resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed tree -- the real invariant (whole-tree id uniqueness) satisfied,
    # invoked through the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, tree = catalog.invoke(
        METHOD_ID,
        generate_issue_tree,
        "ISSUETREE-2026-09-11-001",
        _well_formed_root(),
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    contracts.validate(S["issue_tree"], tree, "issue tree")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IssueTreeGenerated", {"tree": tree, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_issue_tree_gates(tree, "run_issue_tree_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decomposition.issue_tree gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("ISSUETREE_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    flattened_questions = all_questions(tree)
    if len(flattened_questions) != 6:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ISSUETREE_UNEXPECTED_NODE_COUNT: expected 6 flattened questions, got {len(flattened_questions)}")
    milestones.append("QUESTIONS_FLATTENED")

    # --- Step 2: proof the ONE real invariant (whole-tree node-id uniqueness) is not toothless -- two nodes
    # sharing an id (root's own id reused by a second-level child, a cross-depth collision, not merely
    # within-one-level) MUST be refused BEFORE any record is constructed. ---
    duplicate_id_root = issue_tree_node(
        "Q-ROOT",
        "是否進入新市場?",
        children=[
            issue_tree_node(
                "Q-L1-MARKET",
                "市場吸引力是否足夠?",
                children=[issue_tree_node("Q-ROOT", "重複使用 root 自己的 id -- 應該被拒絕")],
            ),
        ],
    )
    duplicate_id_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_issue_tree("ISSUETREE-DUPLICATE-REFUSED-001", duplicate_id_root, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "ISSUETREE_DUPLICATE_NODE_ID" not in str(error):
            raise
        duplicate_id_refusal_proof["raised"] = True
        duplicate_id_refusal_proof["error_code"] = "ISSUETREE_DUPLICATE_NODE_ID"
    if not duplicate_id_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ISSUETREE_INVARIANT_NOT_ENFORCED: a cross-depth duplicate node id was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DuplicateNodeIdRefused", {"refusal_proof": duplicate_id_refusal_proof}, 1.3)
    milestones.append("DUPLICATE_ID_REFUSAL_PROVEN")

    # --- Step 3: proof the SECOND real invariant (non-empty question text) is not toothless -- a node with a
    # whitespace-only question MUST be refused. issue_tree_node() itself validates this via its own builder
    # path, so the defect is constructed directly as a raw dict to exercise generate_issue_tree's own check. ---
    empty_question_root = {
        "id": "Q-ROOT",
        "question": "   ",
        "children": [],
    }
    empty_question_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_issue_tree("ISSUETREE-EMPTY-QUESTION-REFUSED-001", empty_question_root, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "ISSUETREE_INVALID_TREE_SHAPE" not in str(error):
            raise
        empty_question_refusal_proof["raised"] = True
        empty_question_refusal_proof["error_code"] = "ISSUETREE_INVALID_TREE_SHAPE"
    if not empty_question_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ISSUETREE_INVARIANT_NOT_ENFORCED: a whitespace-only question was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyQuestionRefused", {"refusal_proof": empty_question_refusal_proof}, 1.5)
    milestones.append("EMPTY_QUESTION_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (mutates a VALID, already-built record's own stored tree to introduce a duplicate id
    # post-construction, something the builder itself can never be asked to do since it always refuses first).
    # ---
    tampered = copy.deepcopy(tree)
    tampered["root"]["children"][1]["id"] = tampered["root"]["children"][0]["id"]  # Q-L1-CAPABILITY's id overwritten with Q-L1-MARKET's -- bypasses the builder directly
    tampered_gate = evaluate_issue_tree_gates(tampered, "run_issue_tree_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("ISSUETREE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered duplicate node id")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "tree": tree,
        "flattened_questions": flattened_questions,
        "gate_results": gate_results,
        "duplicate_id_refusal_proof": duplicate_id_refusal_proof,
        "empty_question_refusal_proof": empty_question_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "issue_tree_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_issue_tree_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decomposition.issue_tree: IssueTree {result['tree']['id']} built with "
        f"{len(result['flattened_questions'])} nodes, gates [{gate_summary}]; "
        f"ISSUETREE_DUPLICATE_NODE_ID/ISSUETREE_INVALID_TREE_SHAPE invariants each REFUSED a malformed attempt "
        f"({result['duplicate_id_refusal_proof']['error_code']}, {result['empty_question_refusal_proof']['error_code']}); "
        f"hand-tampered duplicate id caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
