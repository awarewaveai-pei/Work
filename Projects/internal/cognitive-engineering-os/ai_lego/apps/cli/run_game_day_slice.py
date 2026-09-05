"""``devops_sre.game_day`` vertical slice -- the thirty-fourth Method Atlas slice, ninth from the
`devops_sre` family.

Builds a real recovered exercise (three distinct roles, recovery via a
real runbook execution soft link, AAR fully answered) and a real
not-recovered exercise (no recovery duration, AAR fully answered). Then
proves the recover-phase invariant is real by attempting to construct a
recovered exercise with no recovery duration (construction layer), and
proves the SAME coupling at the independent gate layer by hand-tampering
a valid not-recovered record to smuggle in a `time_to_recover_minutes`
-- a failed exercise made to read as "recovered in 12 minutes" -- while
leaving every other field untouched (gate layer).

Run::

    python -m ai_lego.apps.cli.run_game_day_slice
"""

from __future__ import annotations

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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.game_day import (
    METHOD_ID,
    all_gates_pass,
    evaluate_game_day_gates,
    generate_game_day_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-GAMEDAY-SYNTHETIC-001"
EXECUTION_ID = "EX-GAMEDAY-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-GAMEDAY-001"

S = {
    "game_day_record": "ai-lego://specs/cognitive/typed-objects/game-day-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-game-day-slice"


def _role(role: str, assignee: str) -> dict[str, Any]:
    return {"role": role, "assignee": assignee}


def run_game_day_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real recovered exercise: three distinct roles, recovery via a real runbook execution soft link. ---
    roles = [
        _role("Incident Commander", "alice"),
        _role("Communications Lead", "bob"),
        _role("Database Operator", "carol"),
    ]
    aar = {
        "expected": "replica promoted and traffic repointed within 15 minutes",
        "actual": "replica promoted at T+9, connection string repoint took until T+23 because the secret rotation step was undocumented",
        "why": "the failover runbook's step 3 assumed the connection secret was already rotated; it was not",
        "next": "add an explicit secret-rotation precondition to step 3 of database-failover-runbook v3",
    }
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_game_day_record,
        "GAMEDAY-2026-09-05-001",
        "primary database loses its data volume during peak traffic",
        roles,
        "detached the primary's data volume via the cloud console at T+0",
        {"outcome": "recovered", "time_to_recover_minutes": 23, "runbook_execution_ref": "RBEXEC-2026-09-05-002"},
        aar,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["game_day_record"], record, "game day record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "GameDayRecordGenerated", {"game_day_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_game_day_gates(record, "run_game_day_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"game day gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"GAMEDAY_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "GameDayGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real not-recovered exercise: no recovery duration, AAR fully answered. ---
    _, not_recovered_record = catalog.invoke(
        METHOD_ID,
        generate_game_day_record,
        "GAMEDAY-2026-09-05-002",
        "object storage region becomes unreachable",
        [_role("Incident Commander", "alice"), _role("Storage Operator", "dave")],
        "blocked egress to the storage region at the firewall",
        {"outcome": "not_recovered"},
        {
            "expected": "artifacts served from the secondary region within 30 minutes",
            "actual": "secondary region had never been synced; exercise abandoned at T+45",
            "why": "cross-region replication was configured but the replication job had been silently failing for 11 days",
            "next": "add replication-lag to the SLO set and a game day precondition that verifies it before injection",
        },
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["game_day_record"], not_recovered_record, "not-recovered game day record")

    # --- Prove the recover-phase invariant is real, at the CONSTRUCTION layer: attempt to build a recovered
    # exercise with NO recovery duration. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_game_day_record(
            "GAMEDAY-2026-09-05-003",
            "primary database loses its data volume during peak traffic",
            roles,
            "detached the primary's data volume via the cloud console at T+0",
            {"outcome": "recovered"},
            aar,
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "GAMEDAY_RECOVERY_TIME_MISMATCH" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("GAMEDAY_INVARIANT_GUARD_DID_NOT_FIRE: a recovered exercise with no time_to_recover_minutes was accepted (or a different guard fired instead)")

    # --- Prove the SAME coupling at the independent GATE layer: take a COPY of the real, valid not-recovered
    # record and hand-tamper it by SMUGGLING IN a time_to_recover_minutes -- a failed exercise made to read as
    # "recovered in 12 minutes" -- while leaving every other field untouched. Pinned to the SPECIFIC
    # game_day_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(not_recovered_record)
    tampered["recovery"]["time_to_recover_minutes"] = 12
    tampered_gate_results = evaluate_game_day_gates(tampered, "run_game_day_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "game_day_integrity")
    evidence = integrity_result["evidence"][0]
    gate_layer_blocked = (
        integrity_result["status"] == "FAIL"
        and evidence.get("reason") == "recovery time_to_recover_minutes inconsistent with outcome"
        and evidence.get("outcome") == "not_recovered"
        and evidence.get("time_present") is True
    )
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"GAMEDAY_GATE_GUARD_DID_NOT_FIRE: game_day_integrity did not flag the smuggled recovery duration "
            f"(status={integrity_result['status']}, evidence={evidence})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "GameDayInvariantVerified",
        {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        1.3,
    )
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
        "game_day_record": record,
        "not_recovered_game_day_record": not_recovered_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "game_day_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_game_day_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["game_day_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.game_day: {len(record['roles'])} roles, outcome={record['recovery']['outcome']}, "
        f"time_to_recover_minutes={record['recovery'].get('time_to_recover_minutes')}, "
        f"runbook_execution_ref={record['recovery'].get('runbook_execution_ref')}, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
