"""``systems.leverage_point_analysis`` vertical slice -- F09 systems-thinking family, first built member.

Scenario: a customer-support backlog problem, analyzed across two of Atlas's own 5-tier chain (a shallow
PARAMETERS fix, a deep PARADIGM shift) -- same synthetic-but-plausible style every sibling slice's CLI demo
uses. Builds a real, well-formed ``LeveragePointAnalysis`` satisfying every real invariant, then demonstrates
two of them each as a construction-time REFUSAL (a caller trying to pass ``tier_rank`` directly; an
out-of-vocabulary tier value), proving neither is toothless. A final step hand-tampers a VALID record directly
(bypassing the builder, splicing in a ``tier_rank`` that disagrees with its own ``tier``) to prove the
independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_leverage_point_analysis_slice
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
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.systems.leverage_point_analysis import (
    METHOD_ID,
    all_gates_pass,
    evaluate_leverage_point_analysis_gates,
    generate_leverage_point_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-LEVERAGEPOINT-SYNTHETIC-001"
EXECUTION_ID = "EX-LEVERAGEPOINT-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-LEVERAGEPOINT-001"

S = {
    "leverage_point_analysis": "ai-lego://specs/cognitive/typed-objects/leverage-point-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-leverage-point-analysis-slice"


def _intervention_points() -> list[dict[str, Any]]:
    return [
        {"id": "LP-001", "description": "調高客服工單佇列上限的緩衝參數，短期紓解積壓", "tier": "PARAMETERS"},
        {"id": "LP-002", "description": "改變團隊對『客服』角色的根本典範，從『滅火』轉為『從源頭消除工單成因』", "tier": "PARADIGM"},
    ]


def _well_formed_analysis_kwargs() -> dict[str, Any]:
    return {
        "intervention_points": _intervention_points(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_leverage_point_analysis_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed analysis -- every real invariant satisfied. ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_leverage_point_analysis,
        "LPA-2026-09-11-001",
        **_well_formed_analysis_kwargs(),
    )
    contracts.validate(S["leverage_point_analysis"], analysis, "leverage point analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "LeveragePointAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_leverage_point_analysis_gates(analysis, "run_leverage_point_analysis_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"systems.leverage_point_analysis gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("LEVERAGEPOINT_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof tier_rank cannot be smuggled in as a caller-supplied value -- a hand-crafted entry
    # carrying tier_rank directly MUST be refused before any record is constructed. ---
    smuggled_points = _intervention_points()
    smuggled_points[0] = {**smuggled_points[0], "tier_rank": 99}
    smuggled_rank_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_leverage_point_analysis("LPA-SMUGGLED-RANK-REFUSED-001", smuggled_points, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "LEVERAGEPOINT_INVALID_POINT_ENTRY" not in str(error):
            raise
        smuggled_rank_refusal_proof["raised"] = True
        smuggled_rank_refusal_proof["error_code"] = "LEVERAGEPOINT_INVALID_POINT_ENTRY"
    if not smuggled_rank_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("LEVERAGEPOINT_INVARIANT_NOT_ENFORCED: a caller-supplied tier_rank was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SmuggledTierRankRefused", {"refusal_proof": smuggled_rank_refusal_proof}, 1.3)
    milestones.append("SMUGGLED_TIER_RANK_REFUSAL_PROVEN")

    # --- Step 3: proof a second invariant (tier closed vocabulary) is not toothless -- an out-of-vocabulary
    # tier value MUST be refused before any record is constructed. ---
    bad_points = _intervention_points()
    bad_points[0] = {**bad_points[0], "tier": "MINDSET"}
    invalid_tier_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_leverage_point_analysis("LPA-INVALID-TIER-REFUSED-001", bad_points, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "LEVERAGEPOINT_INVALID_POINT_ENTRY" not in str(error):
            raise
        invalid_tier_refusal_proof["raised"] = True
        invalid_tier_refusal_proof["error_code"] = "LEVERAGEPOINT_INVALID_POINT_ENTRY"
    if not invalid_tier_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("LEVERAGEPOINT_INVARIANT_NOT_ENFORCED: an out-of-vocabulary tier value was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InvalidTierRefused", {"refusal_proof": invalid_tier_refusal_proof}, 1.5)
    milestones.append("INVALID_TIER_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a tier_rank disagreeing with its own tier directly into a VALID record's own raw
    # dict, after construction). ---
    tampered = dict(analysis)
    tampered["intervention_points"] = [dict(p) for p in analysis["intervention_points"]]
    tampered["intervention_points"][0]["tier_rank"] = 99  # was 1 for PARAMETERS
    tampered_gate = evaluate_leverage_point_analysis_gates(tampered, "run_leverage_point_analysis_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    schema_layer_blocked = False
    try:
        contracts.validate(S["leverage_point_analysis"], tampered, "tampered analysis (must be refused by schema too)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not (tamper_caught and schema_layer_blocked):
        milestones.append("BLOCKED")
        raise InvariantViolation(
            f"LEVERAGEPOINT_GATE_NOT_INDEPENDENT: runtime_gate_caught={tamper_caught}, schema_layer_blocked={schema_layer_blocked} -- both layers must "
            "independently catch a hand-tampered tier_rank"
        )
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate, "schema_layer_blocked": schema_layer_blocked}, 2.1)
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
        "analysis": analysis,
        "gate_results": gate_results,
        "smuggled_rank_refusal_proof": smuggled_rank_refusal_proof,
        "invalid_tier_refusal_proof": invalid_tier_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_pre_mortem_slice.py)",
    }
    write_json(runtime / "results" / "leverage_point_analysis_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_leverage_point_analysis_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS systems.leverage_point_analysis: LeveragePointAnalysis {result['analysis']['id']} built, gates [{gate_summary}]; "
        f"smuggled tier_rank / invalid tier invariants each REFUSED a malformed attempt "
        f"({result['smuggled_rank_refusal_proof']['error_code']}, {result['invalid_tier_refusal_proof']['error_code']}); "
        f"hand-tampered tier_rank caught via the INDEPENDENT gate AND the schema (not just the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
