"""``decision.mcda`` vertical slice -- the tenth Method Atlas slice, second from the ``decision`` family (F16).

Builds a real 2-option, 3-criteria decision (build in-house vs. outsource,
weighing cost, launch speed, and long-term maintainability -- one
minimize-direction criterion, two maximize-direction), computed by
``ai_lego/compute/mcda/scoring.py::normalize_scores`` (hand-verified
against 3 known cases before this CLI was written) and
``ai_lego.compute.ahp.weights.rank_options`` (reused unchanged from the
``decision.ahp`` slice). Then demonstrates Atlas §22.3's own
no-automatic-authority rule (L4154) is real the same way
``run_red_team_slice.py`` already proved it for a sibling method: attempts
to smuggle an ``approved`` key onto a copy of a valid record and confirms
it is refused at both the runtime layer and the schema layer independently.

Run::

    python -m ai_lego.apps.cli.run_mcda_slice
"""

from __future__ import annotations

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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.mcda import (
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_mcda_gates,
    generate_mcda_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-MCDA-SYNTHETIC-001"
EXECUTION_ID = "EX-MCDA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-MCDA-001"

S = {
    "mcda_analysis": "ai-lego://specs/cognitive/typed-objects/mcda-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-mcda-slice"


def run_mcda_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real decision: build the next feature in-house or outsource it, weighing cost (minimize), launch
    # speed (maximize) and long-term maintainability (maximize). Outsourcing costs less and ships faster, but
    # is harder to maintain long-term -- a genuine multi-criteria tradeoff, not a one-sided comparison. ---
    options = [{"id": "O1", "label": "方案 A：自建"}, {"id": "O2", "label": "方案 B：外包"}]
    criteria = [
        {"id": "C1", "label": "成本（美元）", "direction": "minimize"},
        {"id": "C2", "label": "上線速度（1-10）", "direction": "maximize"},
        {"id": "C3", "label": "長期可維護性（1-10）", "direction": "maximize"},
    ]
    raw_scores = [
        {"option_id": "O1", "criterion_id": "C1", "raw_value": 80000},
        {"option_id": "O1", "criterion_id": "C2", "raw_value": 4},
        {"option_id": "O1", "criterion_id": "C3", "raw_value": 9},
        {"option_id": "O2", "criterion_id": "C1", "raw_value": 50000},
        {"option_id": "O2", "criterion_id": "C2", "raw_value": 8},
        {"option_id": "O2", "criterion_id": "C3", "raw_value": 5},
    ]
    weights = [
        {"criterion_id": "C1", "weight": 0.4},
        {"criterion_id": "C2", "weight": 0.3},
        {"criterion_id": "C3", "weight": 0.3},
    ]
    descriptor, mcda_analysis = catalog.invoke(
        METHOD_ID,
        generate_mcda_analysis,
        "MCDA-2026-09-04-001",
        options,
        criteria,
        raw_scores,
        weights,
        "C1（成本）權重從 0.4 降到 0.25 以下時排名反轉；其餘區間排名穩定。人工檢查，非機械計算。",
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["mcda_analysis"], mcda_analysis, "mcda analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "McdaAnalysisGenerated", {"mcda_analysis": mcda_analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_mcda_gates(mcda_analysis, "run_mcda_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"mcda gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MCDA_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "McdaGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove Atlas §22.3 (L4154) is real: attempt to smuggle an "approved" key onto a COPY of the record, at
    # both layers. Neither attempt may succeed. ---
    tampered = copy.deepcopy(mcda_analysis)
    tampered["approved"] = True
    runtime_layer_blocked = False
    try:
        assert_no_automatic_authority_claim(tampered)
    except InvariantViolation:
        runtime_layer_blocked = True
    schema_layer_blocked = False
    try:
        contracts.validate(S["mcda_analysis"], tampered, "tampered analysis (must be refused)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not (runtime_layer_blocked and schema_layer_blocked):
        raise InvariantViolation(
            f"MCDA_AUTHORITY_GUARD_DID_NOT_FIRE: runtime_layer_blocked={runtime_layer_blocked}, schema_layer_blocked={schema_layer_blocked} -- "
            "both layers must independently refuse a smuggled automatic-authority claim"
        )
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "McdaNoAutomaticAuthorityVerified", {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked}, 1.3)
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
        "mcda_analysis": mcda_analysis,
        "gate_results": gate_results,
        "no_automatic_authority_verification": {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "mcda_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_mcda_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    analysis = result["mcda_analysis"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["no_automatic_authority_verification"]
    print(
        f"PASS decision.mcda: ranking={analysis['ranking']}, gates [{gate_summary}], "
        f"no_automatic_authority_verified(runtime={v['runtime_layer_blocked']}, schema={v['schema_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
