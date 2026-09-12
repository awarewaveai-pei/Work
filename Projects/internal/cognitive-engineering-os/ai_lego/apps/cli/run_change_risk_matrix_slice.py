"""``delivery.change_risk_matrix`` vertical slice -- F22 PM/Delivery/Governance Pack (Atlas L922).

Builds a HIGH-tier record (security_impact=HIGH dominates the worst-of-5
derivation) over a synthetic legacy-auth-removal change, with the full HIGH
control baseline declared, then proves Atlas L922's own "高風險自動增加控制"
benefit is a real invariant, not mere narrative order: a construction-time
attempt to declare that same HIGH-tier change with only the LOW baseline of
controls is refused, and a hand-tampered valid record (``risk_tier``
downgraded to LOW post-construction despite a HIGH factor, bypassing the
builder) is independently caught by the ``risk_tier_derivation`` gate.

Run::

    python -m ai_lego.apps.cli.run_change_risk_matrix_slice
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
from ai_lego.modules.delivery.change_risk_matrix import (
    HIGH_CONTROL_BASELINE,
    METHOD_ID,
    all_gates_pass,
    evaluate_change_risk_matrix_gates,
    evaluate_risk_tier_derivation_gate,
    generate_change_risk_matrix,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CRMATRIX-SYNTHETIC-001"
EXECUTION_ID = "EX-CRMATRIX-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CRMATRIX-001"

S = {
    "change_risk_matrix": "ai-lego://specs/cognitive/typed-objects/change-risk-matrix-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-change-risk-matrix-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "change_description": "移除舊版付款 API 的 legacy auth fallback",
        "factors": {"scope": "MEDIUM", "reversibility": "LOW", "data_sensitivity": "HIGH", "traffic_impact": "MEDIUM", "security_impact": "HIGH"},
        "required_controls": sorted(HIGH_CONTROL_BASELINE),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_change_risk_matrix_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed record -- security_impact=HIGH dominates the worst-of-5 derivation, and the
    # full HIGH control baseline is declared. ---
    descriptor, matrix = catalog.invoke(
        METHOD_ID,
        generate_change_risk_matrix,
        "CRMATRIX-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["change_risk_matrix"], matrix, "change risk matrix record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ChangeRiskMatrixGenerated", {"change_risk_matrix": matrix, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_change_risk_matrix_gates(matrix, "run_change_risk_matrix_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"change risk matrix gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"CHANGE_RISK_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ChangeRiskMatrixGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L922's own "高風險自動增加控制" benefit is not toothless -- the SAME HIGH-tier
    # factors declared with only the LOW control baseline MUST be refused before any record is constructed. ---
    insufficient_controls_kwargs = copy.deepcopy(_well_formed_kwargs())
    insufficient_controls_kwargs["required_controls"] = ["peer_review"]
    insufficient_controls_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_change_risk_matrix("CRMATRIX-INSUFFICIENT-CONTROLS-REFUSED-001", **insufficient_controls_kwargs)
    except InvariantViolation as error:
        if "CHANGE_RISK_INSUFFICIENT_CONTROLS" not in str(error):
            raise
        insufficient_controls_refusal_proof["raised"] = True
        insufficient_controls_refusal_proof["error_code"] = "CHANGE_RISK_INSUFFICIENT_CONTROLS"
    if not insufficient_controls_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CHANGE_RISK_INVARIANT_NOT_ENFORCED: a HIGH-tier change declared with only the LOW control baseline was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "InsufficientControlsRefused", {"refusal_proof": insufficient_controls_refusal_proof}, 1.3)
    milestones.append("INSUFFICIENT_CONTROLS_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT risk_tier_derivation gate catches the same defect
    # class even when a caller bypasses the builder entirely (risk_tier downgraded to LOW post-construction
    # despite security_impact still being HIGH). ---
    tampered = copy.deepcopy(matrix)
    tampered["risk_tier"] = "LOW"
    tampered_gate = evaluate_risk_tier_derivation_gate(tampered, "run_change_risk_matrix_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("CHANGE_RISK_GATE_NOT_INDEPENDENT: the independent risk_tier_derivation gate did NOT catch a hand-downgraded risk_tier contradicting a HIGH factor")
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
        "change_risk_matrix": matrix,
        "gate_results": gate_results,
        "insufficient_controls_refusal_proof": insufficient_controls_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "change_risk_matrix_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_change_risk_matrix_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS delivery.change_risk_matrix: ChangeRiskMatrixRecord {result['change_risk_matrix']['id']} built "
        f"(risk_tier={result['change_risk_matrix']['risk_tier']!r} derived from factors, {len(result['change_risk_matrix']['required_controls'])} controls), gates [{gate_summary}]; "
        f"CHANGE_RISK_INSUFFICIENT_CONTROLS REFUSED an under-controlled HIGH-tier attempt ({result['insufficient_controls_refusal_proof']['error_code']}); "
        f"hand-downgraded risk_tier caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
