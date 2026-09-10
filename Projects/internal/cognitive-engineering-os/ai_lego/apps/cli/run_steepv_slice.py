"""``strategy.steepv`` vertical slice -- Method Atlas slice for the F08 "context & strategy" family's STEEPV
tool (Atlas F08 table row, AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:516 -- the method's only
citation).

Scenario (grounded, disclosed honestly, self-referential, same discipline run_swot_slice.py and
run_counterfactual_reasoning_slice.py already apply): a synthetic long-term environmental scan across 4 of the
6 STEEPV dimensions, including the required VALUES factor -- illustrating exactly what L516's own purpose text
names as this method's defining addition over PESTEL.

Run::

    python -m ai_lego.apps.cli.run_steepv_slice
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
from ai_lego.errors import InvariantViolation
from ai_lego.modules.strategy.steepv import (
    METHOD_ID,
    all_gates_pass,
    evaluate_steepv_gates,
    generate_steepv_analysis,
    steepv_factor,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-STEEPV-SYNTHETIC-001"
EXECUTION_ID = "EX-STEEPV-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-STEEPV-001"

S = {
    "steepv_analysis": "ai-lego://specs/cognitive/typed-objects/steepv-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-steepv-slice"


def run_steepv_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.steepv resolves because its contract
    # is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed analysis -- 4 dimensions, including the required VALUES factor. ---
    factors = [
        steepv_factor("STEEPV-2026-09-11-001-F1", "SOCIAL", "區域高齡化人口比例預估未來 15 年持續上升", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-401"]),
        steepv_factor("STEEPV-2026-09-11-001-F2", "TECHNOLOGICAL", "生成式 AI 工具採用率在目標產業快速上升", make_provenance("EVIDENCE", "AI_SUGGESTED"), supporting_evidence_refs=["E-402"]),
        steepv_factor("STEEPV-2026-09-11-001-F3", "ENVIRONMENTAL", "供應鏈上游法規對碳排放要求逐年收緊", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        steepv_factor("STEEPV-2026-09-11-001-F4", "VALUES", "年輕世代消費者對企業永續承諾的重視程度長期上升，非短期波動", make_provenance("HYPOTHESIS", "HUMAN_APPROVED")),
    ]
    steepv_analysis = generate_steepv_analysis("STEEPV-2026-09-11-001", factors)
    contracts.validate(S["steepv_analysis"], steepv_analysis, "steepv analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SteepvAnalysisGenerated", {"steepv_analysis": steepv_analysis}, 1)
    milestones.append("ANALYSIS_BUILT")

    gate_results = evaluate_steepv_gates(steepv_analysis, "run_steepv_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"steepv gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("STEEPV_GATE_FAILED on the deliberately well-formed analysis")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the VALUES-required invariant is not toothless -- an analysis missing the VALUES
    # dimension MUST be refused before any record is constructed (Atlas L516's own defining differentiator). ---
    missing_values_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_steepv_analysis(
            "STEEPV-REFUSED-001",
            [steepv_factor("STEEPV-REFUSED-001-F1", "SOCIAL", "同上但無 VALUES 因子", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))],
        )
    except InvariantViolation as error:
        if "STEEPV_MISSING_VALUES_DIMENSION" not in str(error):
            raise
        missing_values_refusal_proof["raised"] = True
        missing_values_refusal_proof["error_code"] = "STEEPV_MISSING_VALUES_DIMENSION"
    if not missing_values_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STEEPV_INVARIANT_NOT_ENFORCED: an analysis missing the VALUES dimension was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingValuesAnalysisRefused", {"refusal_proof": missing_values_refusal_proof}, 1.5)
    milestones.append("MISSING_VALUES_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (strips the VALUES factor directly from a raw copy of an already-valid analysis). ---
    tampered = dict(steepv_analysis)
    tampered["factors"] = [f for f in steepv_analysis["factors"] if f["dimension"] != "VALUES"]
    tampered_gate = evaluate_steepv_gates(tampered, "run_steepv_slice", clock.at(1.9))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("STEEPV_GATE_NOT_INDEPENDENT: the independent gate did NOT catch a hand-tampered analysis with the VALUES factor stripped out")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedAnalysisCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.0)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "steepv_analysis": steepv_analysis,
        "gate_results": gate_results,
        "missing_values_refusal_proof": missing_values_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_swot_slice.py)",
    }
    write_json(runtime / "results" / "steepv_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_steepv_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.steepv: {len(result['steepv_analysis']['factors'])} factors, gates [{gate_summary}]; "
        f"STEEPV_MISSING_VALUES_DIMENSION invariant REFUSED a malformed attempt "
        f"({result['missing_values_refusal_proof']['error_code']}); VALUES-stripped tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
