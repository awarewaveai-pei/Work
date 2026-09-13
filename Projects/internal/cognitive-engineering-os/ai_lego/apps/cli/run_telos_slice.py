"""``feasibility.telos`` vertical slice -- F14 feasibility/economics family (Atlas L722, §12.24).

Builds a genuine 5-dimension TELOS feasibility assessment for a synthetic
"migrate to a new data center over a weekend" proposal, then proves Atlas
§12.24's own 5-element checklist is a real invariant, not mere narrative
order: a construction-time attempt to submit only 4 dimensions (schedule
omitted) is refused with a plain Python TypeError (the parameter is simply
missing), and a hand-tampered valid record (the ``schedule`` dimension's own
4 lists all emptied out after construction, bypassing the builder) is
independently caught by the ``five_dimensions_complete`` gate.

Run::

    python -m ai_lego.apps.cli.run_telos_slice
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
from ai_lego.modules.feasibility.telos import (
    METHOD_ID,
    all_gates_pass,
    dimension,
    evaluate_five_dimensions_complete_gate,
    evaluate_telos_gates,
    generate_telos_assessment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-TELOS-SYNTHETIC-001"
EXECUTION_ID = "EX-TELOS-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-TELOS-001"

S = {
    "telos_assessment": "ai-lego://specs/cognitive/typed-objects/telos-feasibility-assessment.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-telos-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "technical": dimension(assumptions=["現有團隊具備所需的資料庫遷移工具操作能力"], gaps=["尚未驗證新機房網路延遲是否符合 SLA"]),
        "economic": dimension(gaps=["尚未取得完整的遷移人力成本估算"]),
        "legal": dimension(stop_conditions=["若客戶資料需跨境傳輸且無合法傳輸機制，立即停止"]),
        "operational": dimension(evidence=["新機房已通過內部維運團隊的資源盤點"]),
        "schedule": dimension(assumptions=["供應商可在遷移週末前完成新機房網路配置"]),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_telos_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed 5-dimension assessment. ---
    descriptor, assessment = catalog.invoke(
        METHOD_ID,
        generate_telos_assessment,
        "TELOS-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["telos_assessment"], assessment, "telos feasibility assessment")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TelosFeasibilityAssessmentGenerated", {"assessment": assessment, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_telos_gates(assessment, "run_telos_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"telos gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"TELOS_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TelosGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas §12.24's own 5-element checklist is not toothless -- omitting a dimension MUST be
    # refused before any record is constructed (a plain Python TypeError, since all 5 are required parameters). ---
    incomplete_kwargs = copy.deepcopy(_well_formed_kwargs())
    del incomplete_kwargs["schedule"]
    missing_dimension_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_telos_assessment("TELOS-MISSING-DIMENSION-REFUSED-001", **incomplete_kwargs)
    except TypeError:
        missing_dimension_refusal_proof["raised"] = True
        missing_dimension_refusal_proof["error_code"] = "TypeError (missing required positional argument: schedule)"
    if not missing_dimension_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("TELOS_INVARIANT_NOT_ENFORCED: an assessment missing a dimension was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingDimensionRefused", {"refusal_proof": missing_dimension_refusal_proof}, 1.3)
    milestones.append("MISSING_DIMENSION_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT five_dimensions_complete gate catches the same defect
    # class even when a caller bypasses the builder entirely (schedule's own 4 lists all emptied out post-hoc). ---
    tampered = copy.deepcopy(assessment)
    tampered["schedule"] = {"assumptions": [], "evidence": [], "gaps": [], "stop_conditions": []}
    tampered_gate = evaluate_five_dimensions_complete_gate(tampered, "run_telos_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("TELOS_GATE_NOT_INDEPENDENT: the independent five_dimensions_complete gate did NOT catch a hand-tampered, entirely-emptied schedule dimension")
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
        "telos_assessment": assessment,
        "gate_results": gate_results,
        "missing_dimension_refusal_proof": missing_dimension_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_red_team_slice.py)",
    }
    write_json(runtime / "results" / "telos_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_telos_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS feasibility.telos: TelosFeasibilityAssessment {result['telos_assessment']['id']} built "
        f"(5/5 dimensions assessed), gates [{gate_summary}]; "
        f"missing-dimension call REFUSED ({result['missing_dimension_refusal_proof']['error_code']}); "
        f"hand-tampered entirely-emptied dimension caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
