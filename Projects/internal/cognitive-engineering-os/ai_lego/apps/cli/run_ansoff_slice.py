"""``strategy.ansoff`` vertical slice -- F08 context/strategy family, 7th member (``strategy.porter_five_forces``
was the most recent, see ``run_porter_five_forces_slice.py``).

Scenario: an Ansoff Growth Matrix for a regional SaaS product's growth-strategy options -- same synthetic
style every sibling slice's CLI demo uses. Builds a real, well-formed ``AnsoffMatrix`` covering all 4
disambiguated quadrants (see ``ai_lego/modules/strategy/ansoff.py`` module docstring for the "development"
disambiguation), then demonstrates each of the 2 real invariants once as a construction-time REFUSAL (a
quadrant set missing DIVERSIFICATION; an empty ``strategy_description``), proving neither is toothless, same
"show a real refusal, not only a real success" discipline every sibling slice's CLI demo already establishes.
A final step hand-tampers a VALID record directly (bypassing the builder) to prove the independent gate, not
just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_ansoff_slice
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
from ai_lego.modules.strategy.ansoff import (
    METHOD_ID,
    all_gates_pass,
    evaluate_ansoff_gates,
    generate_ansoff_matrix,
    quadrant_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ANSOFF-SYNTHETIC-001"
EXECUTION_ID = "EX-ANSOFF-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-ANSOFF-001"

S = {
    "ansoff_matrix": "ai-lego://specs/cognitive/typed-objects/ansoff-matrix.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-ansoff-slice"


def _well_formed_quadrants() -> list[dict[str, Any]]:
    return [
        quadrant_entry(
            "MARKET_PENETRATION", "在既有市場加碼行銷與銷售資源，提高既有客群的滲透率與續約率", "LOW", make_provenance("HYPOTHESIS", "AI_SUGGESTED")
        ),
        quadrant_entry(
            "MARKET_DEVELOPMENT", "既有產品原封不動，拓展至歐洲新市場，需在地化語言與合規調整", "MEDIUM", make_provenance("HYPOTHESIS", "AI_SUGGESTED")
        ),
        quadrant_entry(
            "PRODUCT_DEVELOPMENT", "在既有客群基礎上推出進階分析模組，滿足既有客戶未被滿足的需求", "MEDIUM", make_provenance("HYPOTHESIS", "AI_SUGGESTED")
        ),
        quadrant_entry(
            "DIVERSIFICATION", "跨入全新垂直領域（如醫療產業）推出全新產品線，產品與市場皆未驗證", "HIGH", make_provenance("HYPOTHESIS", "AI_SUGGESTED")
        ),
    ]


def run_ansoff_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.ansoff resolves because its
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
        generate_ansoff_matrix,
        "ANSOFF-2026-09-11-001",
        _well_formed_quadrants(),
    )
    contracts.validate(S["ansoff_matrix"], matrix, "ansoff matrix")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AnsoffMatrixGenerated", {"matrix": matrix, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_ansoff_gates(matrix, "run_ansoff_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.ansoff gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("ANSOFF_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (completeness) is not toothless -- a quadrant set missing DIVERSIFICATION
    # (only 3 of the 4 required quadrants) MUST be refused before any record is constructed. ---
    incomplete_quadrants = _well_formed_quadrants()[:3]  # drops DIVERSIFICATION
    incomplete_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_ansoff_matrix("ANSOFF-INCOMPLETE-REFUSED-001", incomplete_quadrants)
    except InvariantViolation as error:
        if "ANSOFF_INCOMPLETE_QUADRANT_SET" not in str(error):
            raise
        incomplete_refusal_proof["raised"] = True
        incomplete_refusal_proof["error_code"] = "ANSOFF_INCOMPLETE_QUADRANT_SET"
    if not incomplete_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ANSOFF_INVARIANT_NOT_ENFORCED: a quadrant set missing DIVERSIFICATION was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompleteQuadrantSetRefused", {"refusal_proof": incomplete_refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-quadrant content) is not toothless -- an empty strategy_description on
    # one quadrant MUST be refused. quadrant_entry() itself validates quadrant/risk_level only via its own
    # builder path, so the empty-description defect is constructed directly as a raw dict to exercise
    # generate_ansoff_matrix's own check. ---
    empty_description_quadrants = _well_formed_quadrants()
    empty_description_quadrants[0] = {**empty_description_quadrants[0], "strategy_description": "   "}
    empty_description_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_ansoff_matrix("ANSOFF-EMPTY-DESCRIPTION-REFUSED-001", empty_description_quadrants)
    except InvariantViolation as error:
        if "ANSOFF_EMPTY_STRATEGY_DESCRIPTION" not in str(error):
            raise
        empty_description_refusal_proof["raised"] = True
        empty_description_refusal_proof["error_code"] = "ANSOFF_EMPTY_STRATEGY_DESCRIPTION"
    if not empty_description_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ANSOFF_INVARIANT_NOT_ENFORCED: an empty strategy_description was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyStrategyDescriptionRefused", {"refusal_proof": empty_description_refusal_proof}, 1.5)
    milestones.append("EMPTY_DESCRIPTION_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (drops PRODUCT_DEVELOPMENT from a raw copy of an already-valid record, duplicating
    # MARKET_PENETRATION in its place). ---
    tampered = dict(matrix)
    tampered["quadrants"] = [q for q in matrix["quadrants"] if q["quadrant"] != "PRODUCT_DEVELOPMENT"] + [matrix["quadrants"][0]]  # bypasses the builder directly
    tampered_gate = evaluate_ansoff_gates(tampered, "run_ansoff_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("ANSOFF_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered incomplete quadrant set")
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
        "incomplete_refusal_proof": incomplete_refusal_proof,
        "empty_description_refusal_proof": empty_description_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_porter_five_forces_slice.py)",
    }
    write_json(runtime / "results" / "ansoff_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_ansoff_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.ansoff: AnsoffMatrix {result['matrix']['id']} built, "
        f"gates [{gate_summary}]; "
        f"INCOMPLETE_QUADRANT_SET/EMPTY_STRATEGY_DESCRIPTION invariants each REFUSED a malformed attempt "
        f"({result['incomplete_refusal_proof']['error_code']}, {result['empty_description_refusal_proof']['error_code']}); "
        f"hand-tampered incomplete quadrant set caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
