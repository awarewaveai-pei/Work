"""``experiment.mvp`` vertical slice -- F15 experiment & validation family (Atlas L739, §12.29).

Builds a decision-changing MVP record over a synthetic paid-feature value
assumption where real usage meets the pre-registered bar, then proves
§12.29's own "足以改變決策的 evidence" requirement is a real invariant, not
mere narrative order: a construction-time attempt to submit a threshold
whose met/not-met decision arms are IDENTICAL is refused, and a
hand-tampered valid record (``outcome.decision_taken`` overridden to
contradict the pre-registered rule, bypassing the builder) is independently
caught by the ``decision_consistency`` gate.

Run::

    python -m ai_lego.apps.cli.run_mvp_slice
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
from ai_lego.modules.experiment.mvp import (
    METHOD_ID,
    all_gates_pass,
    evaluate_decision_consistency_gate,
    evaluate_mvp_gates,
    generate_mvp,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-MVP-SYNTHETIC-001"
EXECUTION_ID = "EX-MVP-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-MVP-001"

S = {
    "mvp": "ai-lego://specs/cognitive/typed-objects/mvp-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-mvp-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "critical_assumption_": {
            "statement": "使用者願意為『一鍵報稅摘要』功能付費",
            "falsifiable_if": "付費轉換率低於 5%",
        },
        "decision_threshold_": {
            "metric": "付費轉換率",
            "target_value": 0.05,
            "comparison": "GTE",
            "decision_if_met": "投入完整開發",
            "decision_if_not_met": "砍掉此功能方向",
        },
        "real_usage_result_": {
            "actual_value": 0.08,
            "real_users_count": 120,
            "usage_context": "真實付費牆，120 位候補名單使用者",
        },
        "provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    }


def run_mvp_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed MVP -- real usage (0.08) beats the pre-registered 0.05 GTE bar. ---
    descriptor, mvp = catalog.invoke(
        METHOD_ID,
        generate_mvp,
        "MVP-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["mvp"], mvp, "mvp record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MVPGenerated", {"mvp": mvp, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_mvp_gates(mvp, "run_mvp_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"mvp gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MVP_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MVPGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove §12.29's own "足以改變決策的 evidence" requirement is not toothless -- a threshold
    # whose met/not-met arms are IDENTICAL (cannot change any decision) MUST be refused before any record is
    # constructed. ---
    non_decision_changing_kwargs = copy.deepcopy(_well_formed_kwargs())
    non_decision_changing_kwargs["decision_threshold_"]["decision_if_not_met"] = non_decision_changing_kwargs["decision_threshold_"]["decision_if_met"]
    non_decision_changing_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_mvp("MVP-NON-DECISION-CHANGING-REFUSED-001", **non_decision_changing_kwargs)
    except InvariantViolation as error:
        if "MVP_THRESHOLD_NOT_DECISION_CHANGING" not in str(error):
            raise
        non_decision_changing_refusal_proof["raised"] = True
        non_decision_changing_refusal_proof["error_code"] = "MVP_THRESHOLD_NOT_DECISION_CHANGING"
    if not non_decision_changing_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("MVP_INVARIANT_NOT_ENFORCED: a threshold with identical decision arms was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NonDecisionChangingThresholdRefused", {"refusal_proof": non_decision_changing_refusal_proof}, 1.3)
    milestones.append("NON_DECISION_CHANGING_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT decision_consistency gate catches the same defect
    # class even when a caller bypasses the builder entirely (outcome.decision_taken overridden to the
    # NOT-MET arm despite the real usage result actually meeting the threshold). ---
    tampered = copy.deepcopy(mvp)
    tampered["outcome"]["decision_taken"] = tampered["decision_threshold"]["decision_if_not_met"]
    tampered_gate = evaluate_decision_consistency_gate(tampered, "run_mvp_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("MVP_GATE_NOT_INDEPENDENT: the independent decision_consistency gate did NOT catch a hand-tampered decision_taken contradicting the pre-registered rule")
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
        "mvp": mvp,
        "gate_results": gate_results,
        "non_decision_changing_refusal_proof": non_decision_changing_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "mvp_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_mvp_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.mvp: MVPRecord {result['mvp']['id']} built "
        f"(decision-changing threshold, outcome={result['mvp']['outcome']['decision_taken']!r}), gates [{gate_summary}]; "
        f"MVP_THRESHOLD_NOT_DECISION_CHANGING REFUSED an identical-arms attempt ({result['non_decision_changing_refusal_proof']['error_code']}); "
        f"hand-tampered decision override caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
