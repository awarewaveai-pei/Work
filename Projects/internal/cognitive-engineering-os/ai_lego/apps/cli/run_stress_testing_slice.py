"""``challenge.stress_testing`` vertical slice -- tenth and FINAL Method Atlas slice from the ``challenge`` family
(F12), after ``red_team``, ``blue_team``, ``independent_judge``.

Scenario: a new payment-gateway rollout proposal, subjected to two extreme-but-plausible scenarios (a 6x traffic
spike, a simultaneous upstream-bank latency/error event) -- one DEGRADED, one BROKEN, same synthetic style every
sibling slice's CLI demo uses. Builds a real, well-formed ``StressTestScenarioSet`` satisfying every real
invariant, then demonstrates THE real invariant (extreme_value must be strictly outside normal_range) is not
toothless via a construction-time REFUSAL, and that the independent gate (not just the builder) catches the same
defect on a hand-tampered record.

Run::

    python -m ai_lego.apps.cli.run_stress_testing_slice
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
from ai_lego.modules.challenge.stress_testing import (
    METHOD_ID,
    all_gates_pass,
    evaluate_stress_testing_gates,
    generate_stress_test_scenario_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-STRESSTESTING-SYNTHETIC-001"
EXECUTION_ID = "EX-STRESSTESTING-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-STRESSTESTING-001"

S = {
    "stress_test_scenario_set": "ai-lego://specs/cognitive/typed-objects/stress-test-scenario-set.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-stress-testing-slice"


def _scenarios() -> list[dict[str, Any]]:
    return [
        {
            "id": "STSS-2026-09-11-001-S1",
            "description": "黑色星期五流量暴衝：尖峰負載達到平日的 6 倍，過去大型促銷曾發生過的合理範圍",
            "normal_range": {"min": 50, "max": 200},
            "extreme_value": 1200,
            "outcome": "DEGRADED",
        },
        {
            "id": "STSS-2026-09-11-001-S2",
            "description": "上游銀行 API 同時延遲 3 秒且錯誤率升至 20%，過去一年曾發生過一次類似事件",
            "normal_range": {"min": 0, "max": 0.02},
            "extreme_value": 0.20,
            "outcome": "BROKEN",
        },
    ]


def _well_formed_scenario_set_kwargs() -> dict[str, Any]:
    return {
        "proposal_ref": "PROP-2026-09-11-002: 新支付閘道上線計畫，預期尖峰 200 TPS",
        "scenarios": _scenarios(),
        "provenance": make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
    }


def run_stress_testing_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. challenge.stress_testing resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed scenario set -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, scenario_set = catalog.invoke(
        METHOD_ID,
        generate_stress_test_scenario_set,
        "STSS-2026-09-11-001",
        **_well_formed_scenario_set_kwargs(),
    )
    contracts.validate(S["stress_test_scenario_set"], scenario_set, "stress test scenario set")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "StressTestScenarioSetGenerated", {"scenario_set": scenario_set, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_stress_testing_gates(scenario_set, "run_stress_testing_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stress testing gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("STRESSTESTING_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (extreme_value strictly outside normal_range, Atlas L652's own '極端'
    # qualifier) is not toothless -- a scenario whose extreme_value sits INSIDE its own normal_range MUST be
    # refused before any record is constructed. ---
    not_extreme_scenarios = [{**_scenarios()[0], "extreme_value": 150}, _scenarios()[1]]  # 150 is inside [50, 200]
    not_extreme_kwargs = {**_well_formed_scenario_set_kwargs(), "scenarios": not_extreme_scenarios}
    not_extreme_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_stress_test_scenario_set("STSS-NOT-EXTREME-REFUSED-001", **not_extreme_kwargs)
    except InvariantViolation as error:
        if "STRESSTESTING_EXTREME_VALUE_NOT_EXTREME" not in str(error):
            raise
        not_extreme_refusal_proof["raised"] = True
        not_extreme_refusal_proof["error_code"] = "STRESSTESTING_EXTREME_VALUE_NOT_EXTREME"
    if not not_extreme_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STRESSTESTING_INVARIANT_NOT_ENFORCED: a scenario whose extreme_value fell inside its own normal_range was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NotExtremeValueRefused", {"refusal_proof": not_extreme_refusal_proof}, 1.3)
    milestones.append("NOT_EXTREME_REFUSAL_PROVEN")

    # --- Step 3: proof a second invariant (a scenario with no outcome scored) is not toothless. ---
    unscored_scenarios = [dict(_scenarios()[0]), _scenarios()[1]]
    del unscored_scenarios[0]["outcome"]
    unscored_kwargs = {**_well_formed_scenario_set_kwargs(), "scenarios": unscored_scenarios}
    unscored_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_stress_test_scenario_set("STSS-UNSCORED-REFUSED-001", **unscored_kwargs)
    except InvariantViolation as error:
        if "STRESSTESTING_INVALID_SCENARIO" not in str(error):
            raise
        unscored_refusal_proof["raised"] = True
        unscored_refusal_proof["error_code"] = "STRESSTESTING_INVALID_SCENARIO"
    if not unscored_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STRESSTESTING_INVARIANT_NOT_ENFORCED: a scenario missing its outcome was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UnscoredScenarioRefused", {"refusal_proof": unscored_refusal_proof}, 1.5)
    milestones.append("UNSCORED_SCENARIO_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (edits a VALID record's own raw dict directly, moving extreme_value back inside
    # normal_range, after construction). ---
    tampered = copy.deepcopy(scenario_set)
    tampered["scenarios"][0]["extreme_value"] = 150  # was 1200 -- bypasses the builder directly
    tampered_gate = evaluate_stress_testing_gates(tampered, "run_stress_testing_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("STRESSTESTING_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered, no-longer-extreme scenario")
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
        "scenario_set": scenario_set,
        "gate_results": gate_results,
        "not_extreme_refusal_proof": not_extreme_refusal_proof,
        "unscored_refusal_proof": unscored_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_game_theory_slice.py)",
    }
    write_json(runtime / "results" / "stress_testing_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_stress_testing_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS challenge.stress_testing: StressTestScenarioSet {result['scenario_set']['id']} built with 2 scenarios, gates [{gate_summary}]; "
        f"STRESSTESTING_EXTREME_VALUE_NOT_EXTREME/STRESSTESTING_INVALID_SCENARIO invariants each REFUSED a malformed attempt "
        f"({result['not_extreme_refusal_proof']['error_code']}, {result['unscored_refusal_proof']['error_code']}); "
        f"hand-tampered no-longer-extreme scenario caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
