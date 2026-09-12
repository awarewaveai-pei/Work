"""``delivery.risk_register`` vertical slice -- F22 PM/delivery/governance family (Atlas L926).

Builds a 2-risk register over a synthetic supplier/staffing scenario, then proves Atlas's own "exposure" pipeline
stage is a real, mechanically-derived invariant, not a caller-asserted label: a construction-time attempt to
submit a risk with a mismatched exposure is refused (the builder does not even accept an ``exposure`` parameter,
so this is proven via a raw-dict construction path instead), and a hand-tampered valid record (exposure rewritten
after construction to disagree with probability * impact) is independently caught by the exposure_derivation gate.

Run::

    python -m ai_lego.apps.cli.run_risk_register_slice
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
from ai_lego.modules.delivery.risk_register import (
    METHOD_ID,
    all_gates_pass,
    evaluate_exposure_derivation_gate,
    evaluate_risk_register_gates,
    generate_risk_register,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RISKREG-SYNTHETIC-001"
EXECUTION_ID = "EX-RISKREG-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-RISKREG-001"

S = {
    "risk_register": "ai-lego://specs/cognitive/typed-objects/risk-register-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-risk-register-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "risks": [
            {"risk_id": "R1", "description": "關鍵供應商延遲交貨", "probability": 0.2, "impact": 0.5, "owner": "採購經理", "control": "備援供應商已簽約，可 5 天內切換", "trigger": "供應商未於合約交期前 3 天回覆出貨確認"},
            {"risk_id": "R2", "description": "核心工程師離職", "probability": 0.3, "impact": 0.9, "owner": "工程總監", "control": "關鍵知識已文件化並有 2 名以上熟悉者", "trigger": "該工程師遞出辭呈或連續 2 週請假"},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_risk_register_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed register -- 2 risks, each with a mechanically-derived exposure. ---
    descriptor, register = catalog.invoke(
        METHOD_ID,
        generate_risk_register,
        "RREG-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["risk_register"], register, "risk register")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RiskRegisterGenerated", {"register": register, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_risk_register_gates(register, "run_risk_register_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"risk register gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"RISKREG_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "RiskRegisterGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L926's own "exposure" pipeline stage is not toothless. risk_entry() accepts no
    # ``exposure`` parameter at all, so a caller cannot even ATTEMPT a mismatched value through the normal
    # construction path -- the only way to produce one is to hand-tamper an already-built record, bypassing the
    # builder entirely. Prove the INDEPENDENT gate catches that. ---
    exposure_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    tampered_record = copy.deepcopy(register)
    tampered_record["risks"][0]["exposure"] = 0.999  # hand-tamper AFTER construction, bypassing risk_entry() entirely
    tampered_gate = evaluate_exposure_derivation_gate(tampered_record, "run_risk_register_slice", clock.at(1.3))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("RISKREG_GATE_NOT_INDEPENDENT: the independent exposure_derivation gate did NOT catch a hand-tampered mismatched exposure")
    exposure_refusal_proof["raised"] = True
    exposure_refusal_proof["error_code"] = "RISKREG_EXPOSURE_MISMATCH (caught via independent gate, not construction -- risk_entry() accepts no exposure parameter at all)"
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedExposureCaughtByGate", {"tampered_gate_result": tampered_gate}, 1.4)
    milestones.append("EXPOSURE_TAMPER_CAUGHT")

    # --- Step 3: a risk missing owner/control/trigger MUST be refused at construction time. ---
    untrackable_kwargs = copy.deepcopy(_well_formed_kwargs())
    untrackable_kwargs["risks"][0]["owner"] = ""
    untrackable_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_risk_register("RREG-UNTRACKABLE-REFUSED-001", **untrackable_kwargs)
    except InvariantViolation as error:
        if "RISKREG_INVALID_RISK" not in str(error):
            raise
        untrackable_refusal_proof["raised"] = True
        untrackable_refusal_proof["error_code"] = "RISKREG_INVALID_RISK"
    if not untrackable_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RISKREG_INVARIANT_NOT_ENFORCED: a risk with an empty owner was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UntrackableRiskRefused", {"refusal_proof": untrackable_refusal_proof}, 1.5)
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
        "risk_register": register,
        "gate_results": gate_results,
        "exposure_refusal_proof": exposure_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "untrackable_refusal_proof": untrackable_refusal_proof,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_cross_impact_analysis_slice.py)",
    }
    write_json(runtime / "results" / "risk_register_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_risk_register_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS delivery.risk_register: RiskRegister {result['risk_register']['id']} built "
        f"(2 risks, mechanically-derived exposure), gates [{gate_summary}]; "
        f"hand-tampered mismatched exposure caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']}); "
        f"RISKREG_INVALID_RISK REFUSED an empty-owner (untrackable) risk at construction ({result['untrackable_refusal_proof']['error_code']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
