"""``systems.iceberg_model`` vertical slice -- F09 systems-thinking family (Atlas L547).

Digs a synthetic support-ticket-surge event down through all four Iceberg
levels (event -> pattern -> structure -> mental model), then proves Atlas's
own top-down dig order (L547: "由事件往下挖深層結構") is a real invariant,
not mere narrative order: a construction-time attempt to populate
`structures` while skipping `patterns` is refused, and a hand-tampered
valid record (patterns wiped after construction, bypassing the builder) is
independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_iceberg_model_slice
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
from ai_lego.modules.systems.iceberg_model import (
    METHOD_ID,
    all_gates_pass,
    evaluate_iceberg_model_gates,
    evaluate_top_down_completeness_gate,
    generate_iceberg_model_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ICEBERG-SYNTHETIC-001"
EXECUTION_ID = "EX-ICEBERG-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ICEBERG-001"

S = {
    "iceberg_model_analysis": "ai-lego://specs/cognitive/typed-objects/iceberg-model-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-iceberg-model-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "events": ["本週客服工單量暴增 3 倍"],
        "patterns": ["每次新版本發布後一週內工單量都會上升"],
        "structures": ["QA 環境與 production 設定漂移，發布前測試涵蓋不到真實流量模式"],
        "mental_models": ["團隊認為「先上線、有問題再修」比「發布前完整驗證」更能維持交付速度"],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_iceberg_model_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed analysis -- all four levels populated in Atlas's own top-down order. ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_iceberg_model_analysis,
        "ICEBERG-2026-09-11-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["iceberg_model_analysis"], analysis, "iceberg model analysis")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "IcebergModelAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_iceberg_model_gates(analysis, "run_iceberg_model_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"iceberg model gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ICE_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "IcebergModelGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L547's own top-down dig order is not toothless -- populating `structures` while
    # skipping `patterns` MUST be refused before any record is constructed. ---
    skip_pattern_kwargs = {**_well_formed_kwargs(), "patterns": []}
    skip_pattern_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_iceberg_model_analysis("ICEBERG-SKIP-PATTERN-REFUSED-001", **skip_pattern_kwargs)
    except InvariantViolation as error:
        if "ICE_STRUCTURE_WITHOUT_PATTERN" not in str(error):
            raise
        skip_pattern_refusal_proof["raised"] = True
        skip_pattern_refusal_proof["error_code"] = "ICE_STRUCTURE_WITHOUT_PATTERN"
    if not skip_pattern_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ICE_INVARIANT_NOT_ENFORCED: structures populated while patterns was empty was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SkipPatternLevelRefused", {"refusal_proof": skip_pattern_refusal_proof}, 1.3)
    milestones.append("SKIP_PATTERN_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely (wipes `patterns` directly on a copy of a VALID record's own raw dict). ---
    tampered = copy.deepcopy(analysis)
    tampered["patterns"] = []
    tampered_gate = evaluate_top_down_completeness_gate(tampered, "run_iceberg_model_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("ICE_GATE_NOT_INDEPENDENT: the independent top_down_completeness gate did NOT catch a hand-tampered record with structures populated but patterns wiped")
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
        "iceberg_model_analysis": analysis,
        "gate_results": gate_results,
        "skip_pattern_refusal_proof": skip_pattern_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_game_theory_slice.py)",
    }
    write_json(runtime / "results" / "iceberg_model_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_iceberg_model_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS systems.iceberg_model: IcebergModelAnalysis {result['iceberg_model_analysis']['id']} built (4 levels), gates [{gate_summary}]; "
        f"ICE_STRUCTURE_WITHOUT_PATTERN REFUSED a skip-pattern-level attempt ({result['skip_pattern_refusal_proof']['error_code']}); "
        f"hand-tampered record (patterns wiped) caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
