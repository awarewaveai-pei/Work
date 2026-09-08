"""``decision.weighted_decision_matrix`` vertical slice -- Method Atlas slice, 7th member of the
``decision`` family (F16).

Builds a real 2-option, 3-criteria vendor-selection decision, rated directly on a common 1-5 scale (no
normalization -- see ``ai_lego/modules/decision/weighted_decision_matrix.py`` module docstring for the
due-diligence finding that this method is NOT a decision.mcda duplicate), computed by
``ai_lego/compute/weighted_decision_matrix/scoring.py::validate_scores_within_common_scale`` (hand-verified
against known in-range/out-of-range cases before this CLI was written) and
``ai_lego.compute.ahp.weights.rank_options`` (reused unchanged, third family to do so). Then demonstrates
this method's own inferred no-automatic-authority rule is real, the same way ``run_mcda_slice.py`` already
proved it for its own table-cited sibling rule: attempts to smuggle an ``approved`` key onto a copy of a
valid record and confirms it is refused at both the runtime layer and the schema layer independently.

Run::

    python -m ai_lego.apps.cli.run_weighted_decision_matrix_slice
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
from ai_lego.modules.decision.weighted_decision_matrix import (
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_weighted_decision_matrix_gates,
    generate_weighted_decision_matrix_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-WDM-SYNTHETIC-001"
EXECUTION_ID = "EX-WDM-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-WDM-001"

S = {
    "wdm_analysis": "ai-lego://specs/cognitive/typed-objects/weighted-decision-matrix-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-weighted-decision-matrix-slice"


def run_weighted_decision_matrix_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real decision: pick between two vendors, rated directly 1-5 on price/reliability/quality --
    # already on one common scale, no per-criterion normalization needed (Atlas §12.33's own pipeline). ---
    options = [{"id": "O1", "label": "供應商 A"}, {"id": "O2", "label": "供應商 B"}]
    criteria = [
        {"id": "C1", "label": "價格競爭力（1-5，5=最便宜）"},
        {"id": "C2", "label": "交期可靠度（1-5，5=最可靠）"},
        {"id": "C3", "label": "品質紀錄（1-5，5=最佳）"},
    ]
    scores = [
        {"option_id": "O1", "criterion_id": "C1", "value": 4},
        {"option_id": "O1", "criterion_id": "C2", "value": 3},
        {"option_id": "O1", "criterion_id": "C3", "value": 5},
        {"option_id": "O2", "criterion_id": "C1", "value": 2},
        {"option_id": "O2", "criterion_id": "C2", "value": 5},
        {"option_id": "O2", "criterion_id": "C3", "value": 4},
    ]
    weights = [
        {"criterion_id": "C1", "weight": 0.3},
        {"criterion_id": "C2", "weight": 0.4},
        {"criterion_id": "C3", "weight": 0.3},
    ]
    descriptor, wdm_analysis = catalog.invoke(
        METHOD_ID,
        generate_weighted_decision_matrix_analysis,
        "WDM-2026-09-08-001",
        options,
        criteria,
        scores,
        weights,
        1,
        5,
        "O1/O2 差距僅 0.1 分（滿分區間 1-5），屬高敏感度：任一標準權重調整 0.05 以上就可能反轉排名。人工檢查，非機械計算。",
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["wdm_analysis"], wdm_analysis, "weighted decision matrix analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "WeightedDecisionMatrixAnalysisGenerated", {"wdm_analysis": wdm_analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_weighted_decision_matrix_gates(wdm_analysis, "run_weighted_decision_matrix_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"weighted decision matrix gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"WDM_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "WeightedDecisionMatrixGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove this method's own inferred no-automatic-authority rule is real, same as run_mcda_slice.py
    # already proved for its own table-cited sibling rule: smuggle an "approved" key onto a COPY of the
    # record, at both layers. Neither attempt may succeed. ---
    tampered = copy.deepcopy(wdm_analysis)
    tampered["approved"] = True
    runtime_layer_blocked = False
    try:
        assert_no_automatic_authority_claim(tampered)
    except InvariantViolation:
        runtime_layer_blocked = True
    schema_layer_blocked = False
    try:
        contracts.validate(S["wdm_analysis"], tampered, "tampered analysis (must be refused)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not (runtime_layer_blocked and schema_layer_blocked):
        raise InvariantViolation(
            f"WDM_AUTHORITY_GUARD_DID_NOT_FIRE: runtime_layer_blocked={runtime_layer_blocked}, schema_layer_blocked={schema_layer_blocked} -- "
            "both layers must independently refuse a smuggled automatic-authority claim"
        )
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "WeightedDecisionMatrixNoAutomaticAuthorityVerified", {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked}, 1.3)
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
        "wdm_analysis": wdm_analysis,
        "gate_results": gate_results,
        "no_automatic_authority_verification": {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "weighted_decision_matrix_slice_result.json", result)
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
        result = run_weighted_decision_matrix_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    analysis = result["wdm_analysis"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["no_automatic_authority_verification"]
    print(
        f"PASS decision.weighted_decision_matrix: ranking={analysis['ranking']}, gates [{gate_summary}], "
        f"no_automatic_authority_verified(runtime={v['runtime_layer_blocked']}, schema={v['schema_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
