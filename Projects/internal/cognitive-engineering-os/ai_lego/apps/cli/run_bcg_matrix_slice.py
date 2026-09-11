"""``strategy.bcg_matrix`` vertical slice -- F08 context/strategy family, 14th and final member
(``strategy.ansoff`` was the most recent, see ``run_ansoff_slice.py``).

Scenario: a BCG Growth-Share Matrix for a 3-product SaaS portfolio -- same synthetic style every sibling
slice's CLI demo uses. Builds a real, well-formed ``BcgMatrixAnalysis`` covering 3 portfolio items spanning 3
of the 4 real quadrants (STAR/CASH_COW/QUESTION_MARK), then demonstrates each of the 2 real invariants once as
a construction-time REFUSAL (an empty portfolio; an item with an empty growth_rate_reasoning), proving neither
is toothless, same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo
already establishes. A final step hand-tampers a VALID record directly (bypassing the builder) to prove the
independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_bcg_matrix_slice
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
from ai_lego.modules.strategy.bcg_matrix import (
    METHOD_ID,
    all_gates_pass,
    evaluate_bcg_matrix_gates,
    generate_bcg_matrix,
    portfolio_item,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BCGMATRIX-SYNTHETIC-001"
EXECUTION_ID = "EX-BCGMATRIX-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BCGMATRIX-001"

S = {
    "bcg_matrix": "ai-lego://specs/cognitive/typed-objects/bcg-matrix-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-bcg-matrix-slice"


def _well_formed_portfolio_items() -> list[dict[str, Any]]:
    return [
        portfolio_item(
            "旗艦分析模組（既有核心產品）",
            "HIGH", "所屬區域分析軟體市場年成長率約 22%，明顯高於公司整體平均",
            "HIGH", "在既有客群中的市占率為同類模組最大競爭者的 2.3 倍",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
        portfolio_item(
            "傳統報表工具（早期成熟產品）",
            "LOW", "報表工具品類成長已趨緩，市場年成長率低於 5%",
            "HIGH", "長期市占率領先，穩定貢獻現金流",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
        portfolio_item(
            "新推出的即時協作功能（剛上市）",
            "HIGH", "協作類功能所屬品類正快速成長，年成長率超過 30%",
            "LOW", "剛上市，市占率遠低於此品類的領先競爭者",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
    ]


def run_bcg_matrix_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.bcg_matrix resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed matrix -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, matrix = catalog.invoke(
        METHOD_ID,
        generate_bcg_matrix,
        "BCG-2026-09-11-001",
        _well_formed_portfolio_items(),
    )
    contracts.validate(S["bcg_matrix"], matrix, "bcg matrix analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BcgMatrixAnalysisGenerated", {"matrix": matrix, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_bcg_matrix_gates(matrix, "run_bcg_matrix_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.bcg_matrix gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("BCG_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (non-empty portfolio) is not toothless -- an empty portfolio_items list
    # MUST be refused before any record is constructed. ---
    empty_portfolio_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_bcg_matrix("BCG-EMPTY-REFUSED-001", [])
    except InvariantViolation as error:
        if "BCG_EMPTY_PORTFOLIO" not in str(error):
            raise
        empty_portfolio_refusal_proof["raised"] = True
        empty_portfolio_refusal_proof["error_code"] = "BCG_EMPTY_PORTFOLIO"
    if not empty_portfolio_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BCG_INVARIANT_NOT_ENFORCED: an empty portfolio_items list was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyPortfolioRefused", {"refusal_proof": empty_portfolio_refusal_proof}, 1.3)
    milestones.append("EMPTY_PORTFOLIO_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-item disclosed content) is not toothless -- an empty
    # growth_rate_reasoning on one item MUST be refused. portfolio_item() itself validates this via its own
    # builder path, so the defect is constructed directly as a raw dict to exercise generate_bcg_matrix's own
    # check. ---
    empty_reasoning_items = _well_formed_portfolio_items()
    empty_reasoning_items[0] = {**empty_reasoning_items[0], "growth_rate_reasoning": "   "}
    empty_reasoning_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_bcg_matrix("BCG-EMPTY-REASONING-REFUSED-001", empty_reasoning_items)
    except InvariantViolation as error:
        if "BCG_INVALID_PORTFOLIO_ITEM" not in str(error):
            raise
        empty_reasoning_refusal_proof["raised"] = True
        empty_reasoning_refusal_proof["error_code"] = "BCG_INVALID_PORTFOLIO_ITEM"
    if not empty_reasoning_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BCG_INVARIANT_NOT_ENFORCED: an empty growth_rate_reasoning was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyReasoningRefused", {"refusal_proof": empty_reasoning_refusal_proof}, 1.5)
    milestones.append("EMPTY_REASONING_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (flips the first item's stored quadrant to a different, still-schema-legal enum value
    # that disagrees with its own disclosed growth_rate/relative_share). ---
    tampered = dict(matrix)
    tampered["portfolio_items"] = [dict(matrix["portfolio_items"][0]), *matrix["portfolio_items"][1:]]
    tampered["portfolio_items"][0]["quadrant"] = "DOG"  # was STAR (HIGH/HIGH) -- bypasses the builder directly
    tampered_gate = evaluate_bcg_matrix_gates(tampered, "run_bcg_matrix_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("BCG_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered quadrant that disagrees with its own axes")
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
        "matrix": matrix,
        "gate_results": gate_results,
        "empty_portfolio_refusal_proof": empty_portfolio_refusal_proof,
        "empty_reasoning_refusal_proof": empty_reasoning_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_ansoff_slice.py)",
    }
    write_json(runtime / "results" / "bcg_matrix_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_bcg_matrix_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.bcg_matrix: BcgMatrixAnalysis {result['matrix']['id']} built with "
        f"{len(result['matrix']['portfolio_items'])} portfolio items, gates [{gate_summary}]; "
        f"BCG_EMPTY_PORTFOLIO/BCG_INVALID_PORTFOLIO_ITEM invariants each REFUSED a malformed attempt "
        f"({result['empty_portfolio_refusal_proof']['error_code']}, {result['empty_reasoning_refusal_proof']['error_code']}); "
        f"hand-tampered quadrant caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
