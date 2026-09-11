"""``decomposition.functional_decomposition`` vertical slice -- F02 decomposition family, 2nd member
(``decomposition.issue_tree`` opened the family concurrently in this same batch, see ``run_issue_tree_slice.py``
if/when it lands).

Scenario: a functional decomposition of an order-processing system -- 3-level ``top_function`` tree (root ->
2 first-level functions -> 2 second-level functions under one of them), same synthetic style every sibling
slice's CLI demo uses. Builds a real, well-formed ``FunctionalDecomposition`` with 2 real interfaces (one
sibling-to-sibling at the deepest level, one cross-branch between the two first-level functions), then
demonstrates each of the 2 real invariants once as a construction-time REFUSAL:

* invariant #1 (whole-tree id uniqueness) -- a duplicate node id spliced into the tree MUST be refused before
  any record is constructed.
* invariant #2 (referential integrity) -- an interface naming a function id that does not exist anywhere in the
  tree MUST be refused before any record is constructed.

A final step hand-tampers a VALID record directly (bypassing the builder) to prove the independent
``interface_referential_integrity`` gate, not just the builder, catches a dangling reference introduced after
construction -- same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo
already establishes.

Run::

    python -m ai_lego.apps.cli.run_functional_decomposition_slice
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
from ai_lego.modules.decomposition.functional_decomposition import (
    METHOD_ID,
    all_gates_pass,
    evaluate_functional_decomposition_gates,
    function_node,
    generate_functional_decomposition,
    interface,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FUNCDECOMP-SYNTHETIC-001"
EXECUTION_ID = "EX-FUNCDECOMP-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-FUNCDECOMP-001"

S = {
    "functional_decomposition": "ai-lego://specs/cognitive/typed-objects/functional-decomposition.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-functional-decomposition-slice"


def _well_formed_top_function() -> dict[str, Any]:
    return function_node(
        "F-ROOT",
        "處理客戶訂單",
        children=[
            function_node(
                "F-L1-VALIDATE",
                "驗證訂單內容",
                children=[
                    function_node("F-L2-CHECK-STOCK", "檢查庫存是否足夠"),
                    function_node("F-L2-CHECK-PAYMENT", "驗證付款方式有效性"),
                ],
            ),
            function_node("F-L1-FULFILL", "履行訂單出貨"),
        ],
    )


def _well_formed_interfaces() -> list[dict[str, Any]]:
    return [
        interface(
            "IF-STOCK-PAYMENT",
            "F-L2-CHECK-STOCK",
            "F-L2-CHECK-PAYMENT",
            "庫存檢查結果需在付款驗證前確認，避免對缺貨商品收款",
        ),
        interface(
            "IF-VALIDATE-FULFILL",
            "F-L1-VALIDATE",
            "F-L1-FULFILL",
            "驗證通過後，訂單內容與庫存鎖定資訊傳遞給出貨模組",
        ),
    ]


def run_functional_decomposition_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. decomposition.functional_decomposition resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed decomposition -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, decomposition = catalog.invoke(
        METHOD_ID,
        generate_functional_decomposition,
        "FUNCDECOMP-2026-09-11-001",
        _well_formed_top_function(),
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        interfaces=_well_formed_interfaces(),
    )
    contracts.validate(S["functional_decomposition"], decomposition, "functional decomposition")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "FunctionalDecompositionGenerated", {"decomposition": decomposition, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_functional_decomposition_gates(decomposition, "run_functional_decomposition_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decomposition.functional_decomposition gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("FUNCDECOMP_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (whole-tree id uniqueness) is not toothless -- a duplicate node id spliced
    # into the tree MUST be refused before any record is constructed. ---
    duplicate_id_tree = function_node(
        "F-ROOT",
        "處理客戶訂單",
        children=[
            function_node("F-L1-VALIDATE", "驗證訂單內容"),
            function_node("F-L1-VALIDATE", "履行訂單出貨（意外重複的 id）"),
        ],
    )
    duplicate_id_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_functional_decomposition("FUNCDECOMP-DUPLICATE-REFUSED-001", duplicate_id_tree, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "FUNCDECOMP_DUPLICATE_NODE_ID" not in str(error):
            raise
        duplicate_id_refusal_proof["raised"] = True
        duplicate_id_refusal_proof["error_code"] = "FUNCDECOMP_DUPLICATE_NODE_ID"
    if not duplicate_id_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FUNCDECOMP_INVARIANT_NOT_ENFORCED: a duplicate node id was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DuplicateNodeIdRefused", {"refusal_proof": duplicate_id_refusal_proof}, 1.3)
    milestones.append("DUPLICATE_ID_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (referential integrity) is not toothless -- an interface naming a function id
    # that does not exist anywhere in the tree MUST be refused before any record is constructed. ---
    dangling_interfaces = [
        interface("IF-DANGLING", "F-L1-VALIDATE", "F-DOES-NOT-EXIST", "此介面指向一個不存在的功能節點"),
    ]
    dangling_ref_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_functional_decomposition(
            "FUNCDECOMP-DANGLING-REFUSED-001",
            _well_formed_top_function(),
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
            interfaces=dangling_interfaces,
        )
    except InvariantViolation as error:
        if "FUNCDECOMP_DANGLING_INTERFACE_REF" not in str(error):
            raise
        dangling_ref_refusal_proof["raised"] = True
        dangling_ref_refusal_proof["error_code"] = "FUNCDECOMP_DANGLING_INTERFACE_REF"
    if not dangling_ref_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FUNCDECOMP_INVARIANT_NOT_ENFORCED: a dangling interface reference was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DanglingInterfaceRefRefused", {"refusal_proof": dangling_ref_refusal_proof}, 1.5)
    milestones.append("DANGLING_REF_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a dangling interface directly into a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(decomposition)
    tampered["interfaces"] = [
        *decomposition["interfaces"],
        {"id": "IF-TAMPERED", "from_function_ref": "F-L1-FULFILL", "to_function_ref": "F-GHOST-NODE", "description": "建構後直接插入、繞過 builder 的懸空參照"},
    ]
    tampered_gate = evaluate_functional_decomposition_gates(tampered, "run_functional_decomposition_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("FUNCDECOMP_GATE_NOT_INDEPENDENT: the independent interface_referential_integrity gate did NOT catch a hand-tampered dangling interface reference")
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
        "decomposition": decomposition,
        "gate_results": gate_results,
        "duplicate_id_refusal_proof": duplicate_id_refusal_proof,
        "dangling_ref_refusal_proof": dangling_ref_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "functional_decomposition_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_functional_decomposition_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decomposition.functional_decomposition: FunctionalDecomposition {result['decomposition']['id']} built with "
        f"{len(result['decomposition']['interfaces'])} interfaces over a multi-level top_function tree, gates [{gate_summary}]; "
        f"FUNCDECOMP_DUPLICATE_NODE_ID/FUNCDECOMP_DANGLING_INTERFACE_REF invariants each REFUSED a malformed attempt "
        f"({result['duplicate_id_refusal_proof']['error_code']}, {result['dangling_ref_refusal_proof']['error_code']}); "
        f"hand-tampered dangling interface reference caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
