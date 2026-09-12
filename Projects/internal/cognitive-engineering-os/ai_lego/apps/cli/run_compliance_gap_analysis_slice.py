"""``jurisdiction.compliance_gap_analysis`` vertical slice -- F23 global jurisdiction/compliance/localization
family (Atlas L938).

Builds a 3-required/1-implemented compliance gap analysis (2 mechanically-derived gaps, each annotated with
severity+plan) over a synthetic go-live readiness scenario, then proves Atlas L938's own "required controls
vs implemented->gaps" pipeline stage is a real invariant, not a caller's narrative: a construction-time
attempt to assert a gap set that DISAGREES with the real set difference (omitting a real gap) is refused, and
a hand-tampered valid record (a gaps[] entry appended for a control that is actually implemented) is
independently caught by the gap_derivation gate.

Run::

    python -m ai_lego.apps.cli.run_compliance_gap_analysis_slice
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
from ai_lego.modules.jurisdiction.compliance_gap_analysis import (
    METHOD_ID,
    all_gates_pass,
    evaluate_compliance_gap_analysis_gates,
    evaluate_gap_derivation_gate,
    generate_compliance_gap_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CGAP-SYNTHETIC-001"
EXECUTION_ID = "EX-CGAP-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-CGAP-001"

S = {
    "compliance_gap_analysis": "ai-lego://specs/cognitive/typed-objects/compliance-gap-analysis-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-compliance-gap-analysis-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "required_controls": ["CTRL-1", "CTRL-2", "CTRL-3"],
        "implemented_controls": ["CTRL-1"],
        "gap_annotations": [
            {"control_id": "CTRL-2", "severity": "high", "plan": "assign Security Lead, target close 2026-10-31"},
            {"control_id": "CTRL-3", "severity": "critical", "plan": "blocks go-live -- escalate to Compliance Steward this week"},
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_compliance_gap_analysis_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed analysis -- 3 required, 1 implemented, 2 mechanically-derived gaps. ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_compliance_gap_analysis,
        "CGAP-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["compliance_gap_analysis"], analysis, "compliance gap analysis")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ComplianceGapAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_compliance_gap_analysis_gates(analysis, "run_compliance_gap_analysis_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"compliance gap analysis gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"COMPLIANCEGAP_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "ComplianceGapAnalysisGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L938's own "required controls vs implemented->gaps" pipeline stage is not
    # toothless -- a caller omitting a real gap from its own asserted gap_annotations MUST be refused before
    # any record is constructed. ---
    mismatched_kwargs = copy.deepcopy(_well_formed_kwargs())
    mismatched_kwargs["gap_annotations"] = mismatched_kwargs["gap_annotations"][:-1]  # omit the real CTRL-3 gap
    mismatch_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_compliance_gap_analysis("CGAP-MISMATCH-REFUSED-001", **mismatched_kwargs)
    except InvariantViolation as error:
        if "COMPLIANCEGAP_GAP_MISMATCH" not in str(error):
            raise
        mismatch_refusal_proof["raised"] = True
        mismatch_refusal_proof["error_code"] = "COMPLIANCEGAP_GAP_MISMATCH"
    if not mismatch_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("COMPLIANCEGAP_INVARIANT_NOT_ENFORCED: an asserted gap set disagreeing with the real set difference was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "GapMismatchRefused", {"refusal_proof": mismatch_refusal_proof}, 1.3)
    milestones.append("GAP_MISMATCH_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gap_derivation gate catches a gaps[] entry appended
    # for CTRL-1, a control that is actually implemented (not a real gap), bypassing the builder entirely. ---
    tampered = copy.deepcopy(analysis)
    tampered["gaps"].append({"control_id": "CTRL-1", "severity": "low", "plan": "narrative-only, not a real gap"})
    tampered_gate = evaluate_gap_derivation_gate(tampered, "run_compliance_gap_analysis_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("COMPLIANCEGAP_GATE_NOT_INDEPENDENT: the independent gap_derivation gate did NOT catch a hand-tampered non-gap annotation")
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
        "compliance_gap_analysis": analysis,
        "gate_results": gate_results,
        "gap_mismatch_refusal_proof": mismatch_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "compliance_gap_analysis_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_compliance_gap_analysis_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS jurisdiction.compliance_gap_analysis: ComplianceGapAnalysis {result['compliance_gap_analysis']['id']} built "
        f"(3 required, 1 implemented -- 2 mechanically-derived gaps), gates [{gate_summary}]; "
        f"COMPLIANCEGAP_GAP_MISMATCH REFUSED an incomplete gap assertion ({result['gap_mismatch_refusal_proof']['error_code']}); "
        f"hand-tampered non-gap annotation caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
