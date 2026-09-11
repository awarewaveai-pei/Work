"""``challenge.devils_advocate`` vertical slice -- F12 challenge/red-team/risk family, fourth built member
(after red_team/blue_team/independent_judge).

Builds a real ``DevilsAdvocatePosition`` steelmanning the case against a synthetic team decision (ship on
schedule behind a kill-switch), with three real supporting arguments. Then demonstrates the method's two
real invariants are not toothless: an alternative_position that merely restates mainstream_position
(after normalization) is refused, and a position with zero supporting_arguments is refused. A final step
hand-tampers a VALID record directly (bypassing the builder, overwriting alternative_position to match
mainstream_position) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_devils_advocate_slice
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
from ai_lego.modules.challenge.devils_advocate import (
    METHOD_ID,
    all_gates_pass,
    evaluate_devils_advocate_gates,
    generate_devils_advocate_position,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DEVADV-SYNTHETIC-001"
EXECUTION_ID = "EX-DEVADV-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-DEVADV-001"

S = {
    "devils_advocate_position": "ai-lego://specs/cognitive/typed-objects/devils-advocate-position.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-devils-advocate-slice"


def _mainstream_position() -> str:
    return "團隊多數共識：功能已達最低可行標準，週五準時上線，靠 kill-switch 兜底風險。"


def _alternative_position() -> str:
    return "應延後一週上線：kill-switch 本身從未在真實流量下驗證過，若上線當下才發現 kill-switch 失效，將沒有任何後備手段。"


def _supporting_arguments() -> list[str]:
    return [
        "kill-switch 只在 staging 用合成流量測過一次，從未在生產環境的真實併發下驗證",
        "上線窗口在週五，若 kill-switch 失效，週末值班人力最薄弱，修復時間拉長",
        "多數共識本身建立在'kill-switch 一定有效'這個未經驗證的假設上，一旦假設錯誤，整組決策的基礎就不成立",
    ]


def _well_formed_position_kwargs() -> dict[str, Any]:
    return {
        "mainstream_position": _mainstream_position(),
        "alternative_position": _alternative_position(),
        "supporting_arguments": _supporting_arguments(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_devils_advocate_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. challenge.devils_advocate resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed position -- every real invariant satisfied, invoked through
    # the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, position = catalog.invoke(
        METHOD_ID,
        generate_devils_advocate_position,
        "DEVADV-2026-09-11-001",
        **_well_formed_position_kwargs(),
    )
    contracts.validate(S["devils_advocate_position"], position, "devils advocate position")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DevilsAdvocatePositionGenerated", {"position": position, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_devils_advocate_gates(position, "run_devils_advocate_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"challenge.devils_advocate gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("DEVADV_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (positions must be substantively distinct, Atlas L2807's own
    # viewpoint/argument scope) is not toothless -- a copied position (whitespace/case varied) MUST be
    # refused before any record is constructed. ---
    copied_position_kwargs = {**_well_formed_position_kwargs(), "alternative_position": f"  {_mainstream_position().upper()}  "}
    positions_not_distinct_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_devils_advocate_position("DEVADV-COPIED-POSITION-REFUSED-001", **copied_position_kwargs)
    except InvariantViolation as error:
        if "DEVADV_POSITIONS_NOT_DISTINCT" not in str(error):
            raise
        positions_not_distinct_refusal_proof["raised"] = True
        positions_not_distinct_refusal_proof["error_code"] = "DEVADV_POSITIONS_NOT_DISTINCT"
    if not positions_not_distinct_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DEVADV_INVARIANT_NOT_ENFORCED: a copied alternative_position was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "PositionsNotDistinctRefused", {"refusal_proof": positions_not_distinct_refusal_proof}, 1.3)
    milestones.append("POSITIONS_NOT_DISTINCT_REFUSAL_PROVEN")

    # --- Step 3: proof a second invariant (at least one supporting argument) is not toothless -- a bare
    # assertion with zero supporting_arguments MUST be refused before any record is constructed. ---
    no_arguments_kwargs = {**_well_formed_position_kwargs(), "supporting_arguments": []}
    no_arguments_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_devils_advocate_position("DEVADV-NO-ARGUMENTS-REFUSED-001", **no_arguments_kwargs)
    except InvariantViolation as error:
        if "DEVADV_NO_SUPPORTING_ARGUMENTS" not in str(error):
            raise
        no_arguments_refusal_proof["raised"] = True
        no_arguments_refusal_proof["error_code"] = "DEVADV_NO_SUPPORTING_ARGUMENTS"
    if not no_arguments_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DEVADV_INVARIANT_NOT_ENFORCED: a position with zero supporting_arguments was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NoSupportingArgumentsRefused", {"refusal_proof": no_arguments_refusal_proof}, 1.5)
    milestones.append("NO_SUPPORTING_ARGUMENTS_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (overwrites alternative_position to match mainstream_position directly on a
    # VALID record's own raw dict, after construction). ---
    tampered = dict(position)
    tampered["alternative_position"] = position["mainstream_position"]  # bypasses the builder directly
    tampered_gate = evaluate_devils_advocate_gates(tampered, "run_devils_advocate_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("DEVADV_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered, non-distinct position")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "position": position,
        "gate_results": gate_results,
        "positions_not_distinct_refusal_proof": positions_not_distinct_refusal_proof,
        "no_arguments_refusal_proof": no_arguments_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_game_theory_slice.py)",
    }
    write_json(runtime / "results" / "devils_advocate_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_devils_advocate_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS challenge.devils_advocate: DevilsAdvocatePosition {result['position']['id']} built, gates [{gate_summary}]; "
        f"DEVADV_POSITIONS_NOT_DISTINCT/DEVADV_NO_SUPPORTING_ARGUMENTS invariants each REFUSED a malformed attempt "
        f"({result['positions_not_distinct_refusal_proof']['error_code']}, {result['no_arguments_refusal_proof']['error_code']}); "
        f"hand-tampered non-distinct position caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
