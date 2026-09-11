"""``stakeholders.game_theory`` vertical slice -- F07 stakeholder/power/negotiation family, OPENING member (F07
had zero built methods before this batch; 1 of 10 concurrent agents opening every F07 member in this same
parallel batch).

Scenario: two ride-hailing platforms each deciding between keeping subsidies or raising fares, with a complete
payoff table and a stable-equilibrium conclusion -- same synthetic style every sibling slice's CLI demo uses.
Builds a real, well-formed ``GameTheoryModel`` satisfying every real invariant, then demonstrates two of them
each as a construction-time REFUSAL (an incomplete payoff table; a player with zero strategies), proving neither
is toothless, same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo
already establishes. A final step hand-tampers a VALID record directly (bypassing the builder, deleting one
payoff entry) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_game_theory_slice
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
from ai_lego.modules.stakeholders.game_theory import (
    METHOD_ID,
    all_gates_pass,
    evaluate_game_theory_gates,
    generate_game_theory_model,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-GAMETH-SYNTHETIC-001"
EXECUTION_ID = "EX-GAMETH-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-GAMETH-001"

S = {
    "game_theory_model": "ai-lego://specs/cognitive/typed-objects/game-theory.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-game-theory-slice"


def _players() -> list[dict[str, Any]]:
    return [
        {"id": "P1", "name": "平台 A"},
        {"id": "P2", "name": "平台 B"},
    ]


def _strategies() -> list[dict[str, Any]]:
    return [
        {"player_id": "P1", "strategy_id": "S1", "name": "維持現有補貼"},
        {"player_id": "P1", "strategy_id": "S2", "name": "調漲車資 10%"},
        {"player_id": "P2", "strategy_id": "S1", "name": "維持現有補貼"},
        {"player_id": "P2", "strategy_id": "S2", "name": "調漲車資 10%"},
    ]


def _payoffs() -> list[dict[str, Any]]:
    return [
        {"player_id": "P1", "strategy_id": "S1", "value": 15},
        {"player_id": "P1", "strategy_id": "S2", "value": -8},
        {"player_id": "P2", "strategy_id": "S1", "value": 12},
        {"player_id": "P2", "strategy_id": "S2", "value": -5},
    ]


def _well_formed_model_kwargs() -> dict[str, Any]:
    return {
        "players": _players(),
        "strategies": _strategies(),
        "payoffs": _payoffs(),
        "equilibrium": "雙方皆維持現有補貼（S1）是穩定策略組合：任一方片面調漲車資（S2）預期 payoff 由正轉負，缺乏片面偏離誘因。",
        "provenance": make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
    }


def run_game_theory_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. stakeholders.game_theory resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed model -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, model = catalog.invoke(
        METHOD_ID,
        generate_game_theory_model,
        "GAMETH-2026-09-11-001",
        **_well_formed_model_kwargs(),
    )
    contracts.validate(S["game_theory_model"], model, "game theory model")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "GameTheoryModelGenerated", {"model": model, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_game_theory_gates(model, "run_game_theory_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stakeholders.game_theory gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("GAMETH_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (payoff completeness, §12.19's own "Payoff 設錯，模型再漂亮也無用")
    # is not toothless -- dropping one strategy's payoff MUST be refused before any record is constructed. ---
    incomplete_payoffs_kwargs = {**_well_formed_model_kwargs(), "payoffs": _payoffs()[:-1]}
    incomplete_payoff_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_game_theory_model("GAMETH-INCOMPLETE-PAYOFF-REFUSED-001", **incomplete_payoffs_kwargs)
    except InvariantViolation as error:
        if "GAMETH_PAYOFF_INCOMPLETE" not in str(error):
            raise
        incomplete_payoff_refusal_proof["raised"] = True
        incomplete_payoff_refusal_proof["error_code"] = "GAMETH_PAYOFF_INCOMPLETE"
    if not incomplete_payoff_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("GAMETH_INVARIANT_NOT_ENFORCED: an incomplete payoff table was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompletePayoffRefused", {"refusal_proof": incomplete_payoff_refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_PAYOFF_REFUSAL_PROVEN")

    # --- Step 3: proof a second invariant (every player has >=1 strategy) is not toothless -- a player with no
    # strategies MUST be refused before any record is constructed. ---
    strategies_missing_p2 = [s for s in _strategies() if s["player_id"] != "P2"]
    payoffs_missing_p2 = [p for p in _payoffs() if p["player_id"] != "P2"]
    player_without_strategy_kwargs = {**_well_formed_model_kwargs(), "strategies": strategies_missing_p2, "payoffs": payoffs_missing_p2}
    player_without_strategy_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_game_theory_model("GAMETH-PLAYER-WITHOUT-STRATEGY-REFUSED-001", **player_without_strategy_kwargs)
    except InvariantViolation as error:
        if "GAMETH_PLAYER_WITHOUT_STRATEGY" not in str(error):
            raise
        player_without_strategy_refusal_proof["raised"] = True
        player_without_strategy_refusal_proof["error_code"] = "GAMETH_PLAYER_WITHOUT_STRATEGY"
    if not player_without_strategy_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("GAMETH_INVARIANT_NOT_ENFORCED: a player with zero strategies was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PlayerWithoutStrategyRefused", {"refusal_proof": player_without_strategy_refusal_proof}, 1.5)
    milestones.append("PLAYER_WITHOUT_STRATEGY_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (deletes one payoff entry directly from a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(model)
    tampered["payoffs"] = model["payoffs"][:-1]  # was 4 complete payoffs -- bypasses the builder directly
    tampered_gate = evaluate_game_theory_gates(tampered, "run_game_theory_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("GAMETH_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered, incomplete payoff table")
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
        "model": model,
        "gate_results": gate_results,
        "incomplete_payoff_refusal_proof": incomplete_payoff_refusal_proof,
        "player_without_strategy_refusal_proof": player_without_strategy_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "game_theory_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_game_theory_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS stakeholders.game_theory: GameTheoryModel {result['model']['id']} built, gates [{gate_summary}]; "
        f"GAMETH_PAYOFF_INCOMPLETE/GAMETH_PLAYER_WITHOUT_STRATEGY invariants each REFUSED a malformed attempt "
        f"({result['incomplete_payoff_refusal_proof']['error_code']}, {result['player_without_strategy_refusal_proof']['error_code']}); "
        f"hand-tampered incomplete payoff table caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
