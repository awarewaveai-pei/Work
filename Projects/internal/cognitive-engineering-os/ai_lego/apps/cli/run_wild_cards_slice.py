"""``foresight.wild_cards`` vertical slice -- F13 unknown-unknowns/foresight family, second built member.

Scenario: a synthetic "expand into 3 new markets next year" strategy, stress-tested through Atlas L680's own
wild-card->re-run-strategy pipeline. Builds a real, well-formed ``WildCardSet`` satisfying every real
invariant, then demonstrates the strategy-rerun-required invariant is not toothless as a construction-time
REFUSAL (a wild card recorded with no ``strategy_rerun`` at all). A final step hand-tampers a VALID record
directly (bypassing the builder, deleting ``strategy_rerun`` from an otherwise-valid card) to prove the
independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_wild_cards_slice
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
from ai_lego.modules.foresight.wild_cards import (
    METHOD_ID,
    all_gates_pass,
    evaluate_wild_card_set_gates,
    generate_wild_card_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-WILDCARDS-SYNTHETIC-001"
EXECUTION_ID = "EX-WILDCARDS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-WILDCARDS-001"

S = {
    "wild_card_set": "ai-lego://specs/cognitive/typed-objects/wild-card-set.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-wild-cards-slice"


def _wild_cards() -> list[dict[str, Any]]:
    return [
        {
            "id": "WC-001",
            "description": "三個目標市場的政府同時在同一季宣布全面禁止本產業的跨境資料傳輸",
            "strategy_rerun": {
                "strategy_ref": "STRAT-2026-EXPAND-3-MARKETS",
                "outcome_under_card": "原計畫的集中式資料架構無法合規，需在地化資料儲存，擴張時程延後兩季、毛利率下降 8 個百分點",
                "still_holds": True,
            },
        },
    ]


def _well_formed_set_kwargs() -> dict[str, Any]:
    return {
        "wild_cards": _wild_cards(),
        "provenance": make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
    }


def run_wild_cards_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. foresight.wild_cards resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed set -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, wild_card_set = catalog.invoke(
        METHOD_ID,
        generate_wild_card_set,
        "WCARD-2026-09-12-001",
        **_well_formed_set_kwargs(),
    )
    contracts.validate(S["wild_card_set"], wild_card_set, "wild card set")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "WildCardSetGenerated", {"wild_card_set": wild_card_set, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_wild_card_set_gates(wild_card_set, "run_wild_cards_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"foresight.wild_cards gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("WCARD_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (Atlas L680's own "wild card→重跑 strategy") is not toothless -- a
    # wild card recorded with strategy_rerun stripped down to a bare empty outcome MUST be refused before any
    # record is constructed. ---
    unresolved_cards = [{**_wild_cards()[0], "strategy_rerun": {"strategy_ref": "STRAT-2026-EXPAND-3-MARKETS", "outcome_under_card": "", "still_holds": True}}]
    unresolved_kwargs = {**_well_formed_set_kwargs(), "wild_cards": unresolved_cards}
    unresolved_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_wild_card_set("WCARD-NO-RERUN-REFUSED-001", **unresolved_kwargs)
    except InvariantViolation as error:
        if "WCARD_INVALID_WILD_CARD_ENTRY" not in str(error):
            raise
        unresolved_refusal_proof["raised"] = True
        unresolved_refusal_proof["error_code"] = "WCARD_INVALID_WILD_CARD_ENTRY"
    if not unresolved_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("WCARD_INVARIANT_NOT_ENFORCED: a wild card with an empty strategy_rerun outcome was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyStrategyRerunRefused", {"refusal_proof": unresolved_refusal_proof}, 1.3)
    milestones.append("EMPTY_STRATEGY_RERUN_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (deletes strategy_rerun directly from a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(wild_card_set)
    tampered["wild_cards"] = [dict(c) for c in wild_card_set["wild_cards"]]
    del tampered["wild_cards"][0]["strategy_rerun"]
    tampered_gate = evaluate_wild_card_set_gates(tampered, "run_wild_cards_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("WCARD_GATE_NOT_INDEPENDENT: the independent gate did NOT catch a hand-tampered wild card missing strategy_rerun")
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
        "wild_card_set": wild_card_set,
        "gate_results": gate_results,
        "unresolved_refusal_proof": unresolved_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_black_swan_exercise_slice.py)",
    }
    write_json(runtime / "results" / "wild_cards_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_wild_cards_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS foresight.wild_cards: WildCardSet {result['wild_card_set']['id']} built, gates [{gate_summary}]; "
        f"WCARD_INVALID_WILD_CARD_ENTRY invariant REFUSED a malformed attempt ({result['unresolved_refusal_proof']['error_code']}); "
        f"hand-tampered missing strategy_rerun caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
