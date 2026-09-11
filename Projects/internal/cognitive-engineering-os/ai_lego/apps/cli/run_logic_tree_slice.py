"""``decomposition.logic_tree`` vertical slice -- F02 decomposition & structuring family, opened in this
same batch (see ``ai_lego/modules/decomposition/logic_tree.py`` module docstring; ``decomposition.issue_tree``
landed in the same batch from a different agent, not depended on here).

Scenario: a logic tree classifying customers by ``classification_rule="分類依 客戶規模"`` (classify by
customer size) -- root "全部客戶" (all customers) expands into 3 top-level categories (Enterprise/SMB/
Startup), and the Enterprise branch expands one further level into 續約狀態 (renewal status: 已續約/已流失) --
2 levels, 6 nodes total. Builds a real, well-formed ``LogicTree``, then demonstrates each of the 2 real
invariants once as a construction-time REFUSAL (an empty classification_rule; a duplicate sibling
category_value introduced at the NESTED level, not just the root, proving the invariant is checked
recursively at every depth, not only the top), same "show a real refusal, not only a real success"
discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a VALID record
directly (bypassing the builder) to prove the independent gate, not just the builder, catches the same
defect.

Run::

    python -m ai_lego.apps.cli.run_logic_tree_slice
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
from ai_lego.modules.decomposition.logic_tree import (
    METHOD_ID,
    all_gates_pass,
    evaluate_logic_tree_gates,
    generate_logic_tree,
    logic_tree_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-LOGICTREE-SYNTHETIC-001"
EXECUTION_ID = "EX-LOGICTREE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-LOGICTREE-001"
CLASSIFICATION_RULE = "分類依 客戶規模 (Enterprise / SMB / Startup)"

S = {
    "logic_tree": "ai-lego://specs/cognitive/typed-objects/logic-tree.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-logic-tree-slice"


def _well_formed_root() -> dict[str, Any]:
    return logic_tree_node(
        "ROOT",
        "全部客戶",
        children=[
            logic_tree_node(
                "N-ENTERPRISE",
                "Enterprise",
                children=[
                    logic_tree_node("N-ENT-RENEWED", "已續約"),
                    logic_tree_node("N-ENT-CHURNED", "已流失"),
                ],
            ),
            logic_tree_node("N-SMB", "SMB"),
            logic_tree_node("N-STARTUP", "Startup"),
        ],
    )


def run_logic_tree_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. decomposition.logic_tree resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed 2-level, 6-node tree -- both real invariants satisfied, invoked
    # through the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, tree = catalog.invoke(
        METHOD_ID,
        generate_logic_tree,
        "LOGICTREE-2026-09-11-001",
        CLASSIFICATION_RULE,
        _well_formed_root(),
    )
    contracts.validate(S["logic_tree"], tree, "logic tree")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "LogicTreeGenerated", {"tree": tree, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_logic_tree_gates(tree, "run_logic_tree_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decomposition.logic_tree gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("LOGICTREE_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (non-empty classification_rule) is not toothless -- an empty rule MUST be
    # refused before any record is constructed. ---
    empty_rule_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_logic_tree("LOGICTREE-EMPTY-RULE-REFUSED-001", "   ", _well_formed_root())
    except InvariantViolation as error:
        if "LOGICTREE_EMPTY_CLASSIFICATION_RULE" not in str(error):
            raise
        empty_rule_refusal_proof["raised"] = True
        empty_rule_refusal_proof["error_code"] = "LOGICTREE_EMPTY_CLASSIFICATION_RULE"
    if not empty_rule_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("LOGICTREE_INVARIANT_NOT_ENFORCED: an empty classification_rule was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyClassificationRuleRefused", {"refusal_proof": empty_rule_refusal_proof}, 1.3)
    milestones.append("EMPTY_CLASSIFICATION_RULE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (sibling category_value uniqueness) is not toothless AT A NESTED LEVEL,
    # not just the root -- duplicate "已續約" under the SAME Enterprise parent MUST be refused. Root's own
    # top-level siblings (Enterprise/SMB/Startup) are left untouched to isolate the defect to one level. ---
    nested_duplicate_root = logic_tree_node(
        "ROOT",
        "全部客戶",
        children=[
            logic_tree_node(
                "N-ENTERPRISE",
                "Enterprise",
                children=[
                    logic_tree_node("N-ENT-RENEWED", "已續約"),
                    logic_tree_node("N-ENT-RENEWED-DUP", "已續約"),  # duplicate category_value among N-ENTERPRISE's own children
                ],
            ),
            logic_tree_node("N-SMB", "SMB"),
            logic_tree_node("N-STARTUP", "Startup"),
        ],
    )
    nested_duplicate_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_logic_tree("LOGICTREE-NESTED-DUP-REFUSED-001", CLASSIFICATION_RULE, nested_duplicate_root)
    except InvariantViolation as error:
        if "LOGICTREE_DUPLICATE_SIBLING_CATEGORY_VALUE" not in str(error) or "N-ENTERPRISE" not in str(error):
            raise
        nested_duplicate_refusal_proof["raised"] = True
        nested_duplicate_refusal_proof["error_code"] = "LOGICTREE_DUPLICATE_SIBLING_CATEGORY_VALUE"
    if not nested_duplicate_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("LOGICTREE_INVARIANT_NOT_ENFORCED: a nested-level duplicate sibling category_value was NOT refused -- the invariant is toothless below the root")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NestedDuplicateSiblingCategoryValueRefused", {"refusal_proof": nested_duplicate_refusal_proof}, 1.5)
    milestones.append("NESTED_DUPLICATE_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (mutates a copy of the VALID record's own SMB node to duplicate Startup's own
    # category_value directly among root's children, never going through generate_logic_tree again). ---
    tampered = copy.deepcopy(tree)
    tampered["root"]["children"][1]["category_value"] = "Startup"  # was "SMB" -- now collides with root.children[2]'s own "Startup"
    tampered_gate = evaluate_logic_tree_gates(tampered, "run_logic_tree_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("LOGICTREE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered duplicate sibling category_value")
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
        "gate_results": gate_results,
        "empty_rule_refusal_proof": empty_rule_refusal_proof,
        "nested_duplicate_refusal_proof": nested_duplicate_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "logic_tree_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_logic_tree_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decomposition.logic_tree: LogicTree {result['tree']['id']} built under classification_rule="
        f"{result['tree']['classification_rule']!r}, gates [{gate_summary}]; "
        f"LOGICTREE_EMPTY_CLASSIFICATION_RULE/LOGICTREE_DUPLICATE_SIBLING_CATEGORY_VALUE (nested level) invariants each REFUSED a "
        f"malformed attempt ({result['empty_rule_refusal_proof']['error_code']}, {result['nested_duplicate_refusal_proof']['error_code']}); "
        f"hand-tampered duplicate sibling category_value caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
