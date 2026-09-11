"""``decomposition.fast`` vertical slice -- F02 "拆解與結構化" family, one of 9 methods opening it in one batch
(see ``ai_lego/modules/decomposition/fast.py`` for the full due-diligence read: Atlas F02 table row L369, the
Why/How chain semantics, and why cycle detection reuses ``ai_lego.compute.graph.dag.find_cycle`` unchanged).

Scenario: a 5-function FAST chain for a customer-retention initiative -- root "增加客戶留存" (increase customer
retention), one linear why/how hop down to "提升產品使用黏著度" (increase product stickiness), which itself has
TWO "how" branches ("建立每週使用習慣" / build a weekly usage habit, itself further decomposed into "發送個人化
週報提醒" / send a personalized weekly digest; and "主動客服關懷通知" / proactive customer-care outreach) -- a
real tree, not merely a straight line, same synthetic style every sibling slice's CLI demo uses. Builds a real,
well-formed ``FastDiagram``, then demonstrates EACH of the 2 real invariants is not toothless via a
construction-time REFUSAL: (1) 2 functions both claiming ``why_ref: null`` (multiple roots); (2) a genuinely
malformed diagram where the ONE root is legitimate but two OTHER functions form a cycle disconnected from it --
chosen deliberately over a trivial self-loop to prove invariant 2 is a real, separate check from invariant 1,
not merely a restatement of it. A final step hand-tampers a VALID record directly (bypassing the builder) to
prove the independent gate, not just the builder, catches the same class of defect.

Run::

    python -m ai_lego.apps.cli.run_fast_slice
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
from ai_lego.modules.decomposition.fast import (
    METHOD_ID,
    all_gates_pass,
    evaluate_fast_diagram_gates,
    fast_function,
    generate_fast_diagram,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FAST-SYNTHETIC-001"
EXECUTION_ID = "EX-FAST-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-FAST-001"

S = {
    "fast_diagram": "ai-lego://specs/cognitive/typed-objects/fast-diagram.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-fast-slice"


def _well_formed_functions() -> list[dict[str, Any]]:
    return [
        fast_function("FN-1", "增加客戶留存", None),
        fast_function("FN-2", "提升產品使用黏著度", "FN-1"),
        fast_function("FN-3", "建立每週使用習慣", "FN-2"),
        fast_function("FN-4", "發送個人化週報提醒", "FN-3"),
        fast_function("FN-5", "主動客服關懷通知", "FN-2"),
    ]


def run_fast_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. decomposition.fast resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed diagram -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, diagram = catalog.invoke(
        METHOD_ID,
        generate_fast_diagram,
        "FAST-2026-09-11-001",
        _well_formed_functions(),
    )
    contracts.validate(S["fast_diagram"], diagram, "fast diagram")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "FastDiagramGenerated", {"diagram": diagram, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_fast_diagram_gates(diagram, "run_fast_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decomposition.fast gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("FAST_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    root_functions = [f for f in diagram["functions"] if f["why_ref"] is None]
    if len(root_functions) != 1 or root_functions[0]["id"] != "FN-1":
        milestones.append("BLOCKED")
        raise InvariantViolation(f"FAST_UNEXPECTED_ROOT: expected exactly 1 root FN-1, got {root_functions!r}")
    milestones.append("ROOT_CONFIRMED")

    # --- Step 2: proof invariant 1 (exactly one root) is not toothless -- 2 functions both claiming
    # why_ref: null MUST be refused before any record is constructed. ---
    multiple_roots_functions = _well_formed_functions()
    multiple_roots_functions[2] = fast_function("FN-3", "建立每週使用習慣", None)  # was why_ref="FN-2" -- now a second root
    multiple_roots_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_fast_diagram("FAST-MULTIROOT-REFUSED-001", multiple_roots_functions)
    except InvariantViolation as error:
        if "FAST_MULTIPLE_ROOTS" not in str(error):
            raise
        multiple_roots_refusal_proof["raised"] = True
        multiple_roots_refusal_proof["error_code"] = "FAST_MULTIPLE_ROOTS"
    if not multiple_roots_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FAST_INVARIANT_NOT_ENFORCED: a 2-root functions list was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MultipleRootsRefused", {"refusal_proof": multiple_roots_refusal_proof}, 1.3)
    milestones.append("MULTIPLE_ROOTS_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (acyclicity) is not toothless, and is a REAL, SEPARATE check from invariant
    # 1 -- a diagram with exactly ONE legitimate root (FN-A) plus a genuinely disconnected 2-cycle between two
    # OTHER functions (FN-B <-> FN-C) MUST also be refused. Referential integrity holds (every why_ref resolves
    # to a real id) and the root count is exactly 1, so only the cycle-detection traversal can catch this. ---
    disconnected_cycle_functions = [
        fast_function("FN-A", "根功能（合法）", None),
        fast_function("FN-B", "與 FN-C 互相指向（環）", "FN-C"),
        fast_function("FN-C", "與 FN-B 互相指向（環）", "FN-B"),
        fast_function("FN-D", "正確依附於根功能", "FN-A"),
    ]
    cycle_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_fast_diagram("FAST-CYCLE-REFUSED-001", disconnected_cycle_functions)
    except InvariantViolation as error:
        if "FAST_CYCLE_DETECTED" not in str(error):
            raise
        cycle_refusal_proof["raised"] = True
        cycle_refusal_proof["error_code"] = "FAST_CYCLE_DETECTED"
    if not cycle_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FAST_INVARIANT_NOT_ENFORCED: a disconnected cycle was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DisconnectedCycleRefused", {"refusal_proof": cycle_refusal_proof}, 1.5)
    milestones.append("CYCLE_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely. Mutates the VALID diagram's own raw dict directly: FN-3's stored why_ref is flipped from
    # "FN-2" to "FN-4" while FN-4's own why_ref ("FN-3") is left untouched, closing a 2-cycle between FN-3 and
    # FN-4 -- the root (FN-1) and the referential-integrity invariant are both still individually satisfied, so
    # only the independent gate's own cycle-detection traversal can catch this. ---
    tampered = copy.deepcopy(diagram)
    tampered["functions"] = [dict(entry) for entry in tampered["functions"]]
    by_id = {entry["id"]: entry for entry in tampered["functions"]}
    by_id["FN-3"]["why_ref"] = "FN-4"  # was "FN-2" -- bypasses the builder directly, closes FN-3<->FN-4
    tampered_gate = evaluate_fast_diagram_gates(tampered, "run_fast_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("FAST_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered cycle")
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
        "diagram": diagram,
        "gate_results": gate_results,
        "multiple_roots_refusal_proof": multiple_roots_refusal_proof,
        "cycle_refusal_proof": cycle_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "fast_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_fast_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decomposition.fast: FastDiagram {result['diagram']['id']} built with "
        f"{len(result['diagram']['functions'])} functions, gates [{gate_summary}]; "
        f"FAST_MULTIPLE_ROOTS/FAST_CYCLE_DETECTED invariants each REFUSED a malformed attempt "
        f"({result['multiple_roots_refusal_proof']['error_code']}, {result['cycle_refusal_proof']['error_code']}); "
        f"hand-tampered cycle caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
