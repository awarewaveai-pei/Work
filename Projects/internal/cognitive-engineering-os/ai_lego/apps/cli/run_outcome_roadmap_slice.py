"""``delivery.outcome_roadmap`` vertical slice -- F22 PM/Delivery/Governance Pack (Atlas L925).

Builds a well-formed 1-theme/2-outcome/2-bet roadmap over a synthetic
product scenario, then proves Atlas's own "以 outcomes 而非 feature" pipeline
order is a real invariant, not mere narrative order: a construction-time
attempt to submit a bet that references a NONEXISTENT outcome is refused,
and a hand-tampered valid record (an outcome's theme_id repointed to a theme
deleted after construction, bypassing the builder) is independently caught
by the theme_coverage gate.

Run::

    python -m ai_lego.apps.cli.run_outcome_roadmap_slice
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
from ai_lego.errors import InvariantViolation
from ai_lego.modules.delivery.outcome_roadmap import (
    METHOD_ID,
    all_gates_pass,
    evaluate_outcome_roadmap_gates,
    evaluate_theme_coverage_gate,
    generate_outcome_roadmap,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-OROAD-SYNTHETIC-001"
EXECUTION_ID = "EX-OROAD-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-OROAD-001"

S = {
    "outcome_roadmap": "ai-lego://specs/cognitive/typed-objects/outcome-roadmap-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-outcome-roadmap-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "themes": [
            {"theme_id": "T1", "name": "客戶自助架站體驗"},
        ],
        "outcomes": [
            {"outcome_id": "O1", "theme_id": "T1", "description": "新客戶 7 天內完成首次上線"},
            {"outcome_id": "O2", "theme_id": "T1", "description": "既有客戶自助排除 80% 常見問題"},
        ],
        "bets": [
            {"bet_id": "B1", "outcome_id": "O1", "description": "一鍵架站精靈", "evidence": ["現行手動流程平均 14 天"]},
            {"bet_id": "B2", "outcome_id": "O2", "description": "自助修復中心", "evidence": []},
        ],
        "next_review": "2026-12-01 或 O1 達成率超過 50% 時",
        "provenance": make_provenance("DECISION", "HUMAN_APPROVED"),
    }


def run_outcome_roadmap_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed roadmap -- 1 theme, 2 outcomes, 2 bets, every reference resolves. ---
    descriptor, roadmap = catalog.invoke(
        METHOD_ID,
        generate_outcome_roadmap,
        "OROAD-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["outcome_roadmap"], roadmap, "outcome roadmap")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "OutcomeRoadmapGenerated", {"roadmap": roadmap, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_outcome_roadmap_gates(roadmap, "run_outcome_roadmap_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"outcome roadmap gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"OROAD_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "OutcomeRoadmapGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L925's own "以 outcomes 而非 feature" pipeline order is not toothless -- a bet
    # referencing a NONEXISTENT outcome MUST be refused before any record is constructed. ---
    dangling_bet_kwargs = copy.deepcopy(_well_formed_kwargs())
    dangling_bet_kwargs["bets"].append({"bet_id": "B3", "outcome_id": "O-NONEXISTENT", "description": "無主 feature，直接塞進 roadmap", "evidence": []})
    dangling_bet_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_outcome_roadmap("OROAD-DANGLING-BET-REFUSED-001", **dangling_bet_kwargs)
    except InvariantViolation as error:
        if "OROAD_DANGLING_OUTCOME_REF" not in str(error):
            raise
        dangling_bet_refusal_proof["raised"] = True
        dangling_bet_refusal_proof["error_code"] = "OROAD_DANGLING_OUTCOME_REF"
    if not dangling_bet_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("OROAD_INVARIANT_NOT_ENFORCED: a bet referencing a nonexistent outcome was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DanglingBetRefused", {"refusal_proof": dangling_bet_refusal_proof}, 1.3)
    milestones.append("DANGLING_BET_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT theme_coverage gate catches the same defect class
    # even when a caller bypasses the builder entirely (outcome O1's theme_id repointed to a theme that was
    # never declared, simulating a theme deleted after construction). ---
    tampered = copy.deepcopy(roadmap)
    tampered["outcomes"][0]["theme_id"] = "T-DELETED-AFTER-CONSTRUCTION"
    tampered_gate = evaluate_theme_coverage_gate(tampered, "run_outcome_roadmap_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("OROAD_GATE_NOT_INDEPENDENT: the independent theme_coverage gate did NOT catch a hand-tampered outcome pointing at a nonexistent theme")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
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
        "outcome_roadmap": roadmap,
        "gate_results": gate_results,
        "dangling_bet_refusal_proof": dangling_bet_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "outcome_roadmap_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_outcome_roadmap_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS delivery.outcome_roadmap: OutcomeRoadmap {result['outcome_roadmap']['id']} built "
        f"(1 theme, 2 outcomes, 2 bets -- every reference resolves), gates [{gate_summary}]; "
        f"OROAD_DANGLING_OUTCOME_REF REFUSED a dangling-bet attempt ({result['dangling_bet_refusal_proof']['error_code']}); "
        f"hand-tampered dangling-theme record caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
