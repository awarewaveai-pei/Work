"""``feasibility.unit_economics`` vertical slice -- F14 feasibility & economics family, sibling method 2/2 built
this batch (with ``feasibility.tco``).

Builds a real, well-formed, scalable ``UnitEconomicsAnalysis`` (ltv_to_cac_ratio = 4200/1200 = 3.5,
contribution_margin=180 >= 0), then demonstrates THE sharpest real invariant (``scalable`` MUST be false
whenever ``contribution_margin < 0`` -- Atlas's own "營收成長但越賣越虧" failure mode, made structural) is not
toothless via a second, deliberately loss-making record, demonstrates ``cac<=0`` is refused, demonstrates
``scalable`` cannot be smuggled in as a caller-supplied argument at all, and finally hand-tampers a VALID
record's own ``scalable``/``ltv_to_cac_ratio`` directly (bypassing the builder) to prove the independent gate,
not just the builder, catches the defect.

Run::

    python -m ai_lego.apps.cli.run_unit_economics_slice
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
from ai_lego.modules.feasibility.unit_economics import (
    METHOD_ID,
    all_gates_pass,
    evaluate_unit_economics_gates,
    generate_unit_economics,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-UNITECONOMICS-SYNTHETIC-001"
EXECUTION_ID = "EX-UNITECONOMICS-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-UNITECONOMICS-001"

S = {
    "unit_economics": "ai-lego://specs/cognitive/typed-objects/unit-economics-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-unit-economics-slice"


def _healthy_kwargs() -> dict[str, Any]:
    return {
        "subject_ref": "SaaS 中小企業方案（月訂閱）",
        "cac": 1200,
        "ltv": 4200,
        "gross_margin": 0.72,
        "payback_period": 8,
        "churn_rate": 0.03,
        "arpu": 350,
        "contribution_margin": 180,
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def _loss_making_kwargs() -> dict[str, Any]:
    """contribution_margin is negative -- ltv_to_cac_ratio alone (2400/800=3) would look healthy, but scalable
    MUST be false regardless (Atlas's own named failure mode)."""
    return {
        "subject_ref": "促銷方案（折扣後單位虧損）",
        "cac": 800,
        "ltv": 2400,
        "gross_margin": 0.4,
        "payback_period": 14,
        "churn_rate": 0.08,
        "arpu": 150,
        "contribution_margin": -25,
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_unit_economics_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the healthy, scalable analysis -- every real invariant satisfied. Hand-computed:
    # ltv_to_cac_ratio = 4200/1200 = 3.5. ---
    descriptor, healthy = catalog.invoke(METHOD_ID, generate_unit_economics, "UECON-2026-09-12-001", **_healthy_kwargs())
    contracts.validate(S["unit_economics"], healthy, "unit economics analysis (healthy)")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UnitEconomicsAnalysisGenerated", {"analysis": healthy, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    if healthy["ltv_to_cac_ratio"] != 3.5 or healthy["scalable"] is not True:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"UECON_HAND_COMPUTED_MISMATCH: expected ltv_to_cac_ratio=3.5, scalable=True; got {healthy['ltv_to_cac_ratio']!r}, {healthy['scalable']!r}")

    gate_results = evaluate_unit_economics_gates(healthy, "run_unit_economics_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"feasibility.unit_economics gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("UECON_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: THE sharpest real invariant -- a loss-making record (contribution_margin=-25) MUST come back
    # scalable=False, even though ltv_to_cac_ratio alone (2400/800=3) looks healthy. ---
    descriptor_loss, loss_making = catalog.invoke(METHOD_ID, generate_unit_economics, "UECON-2026-09-12-002", **_loss_making_kwargs())
    contracts.validate(S["unit_economics"], loss_making, "unit economics analysis (loss-making)")
    if loss_making["scalable"] is not False:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"UECON_INVARIANT_NOT_ENFORCED: contribution_margin={loss_making['contribution_margin']!r} but scalable={loss_making['scalable']!r} -- the failure mode is not caught")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "LossMakingRecordCorrectlyNotScalable", {"analysis": loss_making, "method_descriptor": descriptor_loss}, 1.2)
    milestones.append("NEGATIVE_CONTRIBUTION_MARGIN_NOT_SCALABLE_PROVEN")

    # --- Step 3: proof cac<=0 is refused (the ratio would be undefined at cac=0). ---
    cac_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_unit_economics("UECON-BADCAC-REFUSED-001", **{**_healthy_kwargs(), "cac": 0})
    except InvariantViolation as error:
        if "UECON_INVALID_CAC" not in str(error):
            raise
        cac_refusal_proof["raised"] = True
        cac_refusal_proof["error_code"] = "UECON_INVALID_CAC"
    if not cac_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("UECON_INVARIANT_NOT_ENFORCED: cac<=0 was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NonPositiveCacRefused", {"refusal_proof": cac_refusal_proof}, 1.3)
    milestones.append("NON_POSITIVE_CAC_REFUSAL_PROVEN")

    # --- Step 4: proof scalable cannot be smuggled in as a caller-supplied argument -- the builder has no such
    # parameter at all, so this is a plain TypeError, not a silently-accepted value. ---
    smuggle_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_unit_economics("UECON-SMUGGLE-REFUSED-001", **_healthy_kwargs(), scalable=True)  # type: ignore[call-arg]
    except TypeError:
        smuggle_proof["raised"] = True
        smuggle_proof["error_type"] = "TypeError"
    if not smuggle_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("UECON_INVARIANT_NOT_ENFORCED: a smuggled scalable= argument was NOT refused -- GENUINE_COMPUTE is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SmuggledScalableRefused", {"refusal_proof": smuggle_proof}, 1.4)
    milestones.append("SMUGGLED_SCALABLE_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (rewrites a VALID loss-making record's own scalable directly to True). ---
    tampered = dict(loss_making)
    tampered["scalable"] = True  # was False -- bypasses the builder directly, exactly the failure mode Atlas names
    tampered_gate = evaluate_unit_economics_gates(tampered, "run_unit_economics_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("UECON_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered scalable=True over a negative contribution_margin")
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
        "healthy_analysis": healthy,
        "loss_making_analysis": loss_making,
        "gate_results": gate_results,
        "cac_refusal_proof": cac_refusal_proof,
        "smuggle_proof": smuggle_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fmea_slice.py)",
    }
    write_json(runtime / "results" / "unit_economics_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_unit_economics_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS feasibility.unit_economics: UnitEconomicsAnalysis {result['healthy_analysis']['id']} "
        f"ltv_to_cac_ratio={result['healthy_analysis']['ltv_to_cac_ratio']} scalable={result['healthy_analysis']['scalable']}; "
        f"loss-making sibling {result['loss_making_analysis']['id']} contribution_margin={result['loss_making_analysis']['contribution_margin']} "
        f"correctly scalable={result['loss_making_analysis']['scalable']}, gates [{gate_summary}]; cac<=0/smuggled-scalable invariants each "
        f"REFUSED a malformed attempt; hand-tampered scalable=True over negative contribution_margin caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
