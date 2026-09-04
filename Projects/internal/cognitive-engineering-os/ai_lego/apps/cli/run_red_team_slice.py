"""``challenge.red_team`` vertical slice -- the ninth Method Atlas slice, first from the ``challenge`` family (F12).

Builds a real ``RedTeamChallenge`` attacking a synthetic deployment
proposal across two of Atlas's own 11 named dimensions (OPERATIONS,
SECURITY), including one deliberately unresolved finding (no rollback
plan) and one clean pass (SECURITY examined, no finding). Then
demonstrates Atlas's own no-final-authority rule (L1735) is real by
attempting to smuggle an ``approved`` key onto the record and confirming
it is refused -- both at the runtime layer (before construction) and
independently at the schema layer (a hand-crafted bypass).

Run::

    python -m ai_lego.apps.cli.run_red_team_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.challenge.red_team import (
    METHOD_ID,
    all_gates_pass,
    evaluate_red_team_gates,
    finding,
    generate_red_team_challenge,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-REDTEAM-SYNTHETIC-001"
EXECUTION_ID = "EX-REDTEAM-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-REDTEAM-001"

S = {
    "red_team_challenge": "ai-lego://specs/cognitive/typed-objects/red-team-challenge.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-red-team-slice"


def run_red_team_slice(config: SliceConfig) -> dict[str, Any]:
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

    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- A real proposal, attacked across two dimensions: one real finding (OPERATIONS -- no rollback plan), one
    # clean pass (SECURITY -- examined, nothing found). ---
    findings = [
        finding(
            "RTC-2026-09-04-001-F1",
            "OPERATIONS",
            "遷移計畫沒有寫明失敗時的 rollback 步驟與觸發條件,週末執行且無人值班窗口",
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
            severity="high -- no described recovery path if the migration fails partway, and no on-call coverage during the execution window",
        ),
    ]
    descriptor, challenge = catalog.invoke(
        METHOD_ID,
        generate_red_team_challenge,
        "RTC-2026-09-04-001",
        "PROP-2026-09-04-001: 週末自動把所有客戶資料庫遷移到新機房",
        ["OPERATIONS", "SECURITY"],
        findings,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["red_team_challenge"], challenge, "red team challenge")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RedTeamChallengeGenerated", {"red_team_challenge": challenge, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_red_team_gates(challenge, "run_red_team_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"red team gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"REDTEAM_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RedTeamGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove Atlas L1735 is real: attempt to smuggle an "approved" key onto a COPY of the record, at both
    # layers. Neither attempt may succeed. ---
    tampered = copy.deepcopy(challenge)
    tampered["approved"] = True
    runtime_layer_blocked = False
    try:
        from ai_lego.modules.challenge.red_team import assert_no_authority_claim

        assert_no_authority_claim(tampered)
    except InvariantViolation:
        runtime_layer_blocked = True
    schema_layer_blocked = False
    try:
        contracts.validate(S["red_team_challenge"], tampered, "tampered challenge (must be refused)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not (runtime_layer_blocked and schema_layer_blocked):
        raise InvariantViolation(
            f"REDTEAM_AUTHORITY_GUARD_DID_NOT_FIRE: runtime_layer_blocked={runtime_layer_blocked}, schema_layer_blocked={schema_layer_blocked} -- "
            "both layers must independently refuse a smuggled authority claim"
        )
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RedTeamNoFinalAuthorityVerified", {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked}, 1.3)
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
        "red_team_challenge": challenge,
        "gate_results": gate_results,
        "no_final_authority_verification": {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "red_team_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_red_team_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["no_final_authority_verification"]
    print(f"PASS challenge.red_team: 2 dimensions examined, 1 finding, gates [{gate_summary}], no_final_authority_verified(runtime={v['runtime_layer_blocked']}, schema={v['schema_layer_blocked']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
