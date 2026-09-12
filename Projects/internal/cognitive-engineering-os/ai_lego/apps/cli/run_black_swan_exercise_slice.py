"""``foresight.black_swan_exercise`` vertical slice -- F13 unknown-unknowns/foresight family, FIRST built member.

Scenario: a synthetic single-region cloud dependency, exercised through Atlas L679's own tail-events->exposure->
survivability->hedges chain. Builds a real, well-formed ``BlackSwanExercise`` satisfying every real invariant,
then demonstrates the chain-completeness invariant is not toothless as a construction-time REFUSAL (a tail
event left with zero traced exposure). A final step hand-tampers a VALID record directly (bypassing the
builder, deleting the only survivability assessment covering an exposure) to prove the independent gate, not
just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_black_swan_exercise_slice
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
from ai_lego.modules.foresight.black_swan_exercise import (
    METHOD_ID,
    all_gates_pass,
    evaluate_black_swan_exercise_gates,
    generate_black_swan_exercise,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BLACKSWAN-SYNTHETIC-001"
EXECUTION_ID = "EX-BLACKSWAN-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-BLACKSWAN-001"

S = {
    "black_swan_exercise": "ai-lego://specs/cognitive/typed-objects/black-swan-exercise.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-black-swan-exercise-slice"


def _tail_events() -> list[dict[str, Any]]:
    return [{"id": "TE-001", "description": "唯一雲端區域發生連續 72 小時全區中斷，且該供應商官方溝通完全靜默"}]


def _exposures() -> list[dict[str, Any]]:
    return [{"id": "EXP-001", "tail_event_id": "TE-001", "description": "所有客戶資料與服務都部署在該單一區域，無跨區備援，中斷期間完全無法對外服務"}]


def _survivability_assessments() -> list[dict[str, Any]]:
    return [{"id": "SA-001", "exposure_id": "EXP-001", "description": "不可存活超過 24 小時 -- 目前無跨區備援與離線資料副本，客戶合約 SLA 將全數違約"}]


def _hedges() -> list[dict[str, Any]]:
    return [{"id": "HDG-001", "exposure_id": "EXP-001", "description": "建立第二區域的唯讀備援與每日離線快照，目標可承受 72 小時單區中斷"}]


def _well_formed_exercise_kwargs() -> dict[str, Any]:
    return {
        "tail_events": _tail_events(),
        "exposures": _exposures(),
        "survivability_assessments": _survivability_assessments(),
        "hedges": _hedges(),
        "provenance": make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
    }


def run_black_swan_exercise_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. foresight.black_swan_exercise resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed exercise -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, exercise = catalog.invoke(
        METHOD_ID,
        generate_black_swan_exercise,
        "BSWAN-2026-09-12-001",
        **_well_formed_exercise_kwargs(),
    )
    contracts.validate(S["black_swan_exercise"], exercise, "black swan exercise")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BlackSwanExerciseGenerated", {"exercise": exercise, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_black_swan_exercise_gates(exercise, "run_black_swan_exercise_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"foresight.black_swan_exercise gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("BSWAN_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (tail-event-to-exposure coverage, Atlas L679's own "tail events→
    # exposure") is not toothless -- dropping the only exposure tracing TE-001 MUST be refused before any
    # record is constructed. ---
    uncovered_kwargs = {**_well_formed_exercise_kwargs(), "exposures": [], "survivability_assessments": [], "hedges": []}
    uncovered_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_black_swan_exercise("BSWAN-UNCOVERED-TAIL-EVENT-REFUSED-001", **uncovered_kwargs)
    except InvariantViolation as error:
        if "BSWAN_UNCOVERED_TAIL_EVENT" not in str(error):
            raise
        uncovered_refusal_proof["raised"] = True
        uncovered_refusal_proof["error_code"] = "BSWAN_UNCOVERED_TAIL_EVENT"
    if not uncovered_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BSWAN_INVARIANT_NOT_ENFORCED: an uncovered tail event was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UncoveredTailEventRefused", {"refusal_proof": uncovered_refusal_proof}, 1.3)
    milestones.append("UNCOVERED_TAIL_EVENT_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (deletes the only survivability assessment covering EXP-001 directly from a VALID
    # record's own raw dict, after construction). ---
    tampered = dict(exercise)
    tampered["survivability_assessments"] = [a for a in exercise["survivability_assessments"] if a["id"] != "SA-001"]  # was the only assessment covering EXP-001
    tampered_gate = evaluate_black_swan_exercise_gates(tampered, "run_black_swan_exercise_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("BSWAN_GATE_NOT_INDEPENDENT: the independent chain-integrity gate did NOT catch a hand-tampered, uncovered exposure")
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
        "exercise": exercise,
        "gate_results": gate_results,
        "uncovered_refusal_proof": uncovered_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_pre_mortem_slice.py)",
    }
    write_json(runtime / "results" / "black_swan_exercise_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_black_swan_exercise_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS foresight.black_swan_exercise: BlackSwanExercise {result['exercise']['id']} built, gates [{gate_summary}]; "
        f"BSWAN_UNCOVERED_TAIL_EVENT invariant REFUSED a malformed attempt ({result['uncovered_refusal_proof']['error_code']}); "
        f"hand-tampered uncovered exposure caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
