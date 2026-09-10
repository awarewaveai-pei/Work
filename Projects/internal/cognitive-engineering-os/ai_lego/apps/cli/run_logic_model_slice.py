"""``causal.logic_model`` vertical slice -- F11 causal family, 2nd member (``causal.dag`` was the 1st,
``run_causal_dag_slice.py``), built concurrently with ``causal.counterfactual_reasoning``/
``causal.theory_of_change``/``causal.process_tracing``/``causal.rct`` in the same batch (their files not
read here). See ``ai_lego.modules.causal.logic_model``'s own module docstring for the full disambiguation
from ``causal.theory_of_change``'s own near-identical Atlas citation.

Self-contained scenario (the method contract's own ``inputs.required: []`` -- no external ProblemStatement/
CauseHypothesisSet input, unlike ``root_cause.kepner_tregoe``/``causal.dag``): Cascadia's onboarding
activation program, the same synthetic tenant/company ``run_causal_dag_slice.py`` already establishes for
this family, modeled end to end as a 5-stage Logic Model with both outcome stages carrying a real
indicator.

Then proves BOTH headline invariants are real, at BOTH layers:

1. Fixed stage order/count (``LOGICMODEL_INVALID_STAGE_SET``): a malformed stage list with two stages
   swapped must be refused at CONSTRUCTION. A copy of the valid record with the same swap applied directly
   to the raw dict must be caught independently at the GATE layer.
2. Outcome-stage indicator requirement (``LOGICMODEL_OUTCOME_MISSING_INDICATOR``): a malformed
   SHORT_TERM_OUTCOMES stage carrying no indicators must be refused at CONSTRUCTION. A copy of the valid
   record with LONG_TERM_OUTCOMES's own stored indicators stripped out must be caught independently at the
   GATE layer.

Run::

    python -m ai_lego.apps.cli.run_logic_model_slice
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
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.causal.logic_model import (
    METHOD_ID,
    all_gates_pass,
    evaluate_logic_model_gates,
    evaluate_logic_model_integrity_gate,
    generate_logic_model,
    stage_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-LOGICMODEL-SYNTHETIC-001"
EXECUTION_ID = "EX-LOGICMODEL-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-LOGICMODEL-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "logic_model_record": "ai-lego://specs/cognitive/typed-objects/logic-model-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-logic-model-slice"


def _valid_stages() -> list[dict[str, Any]]:
    return [
        stage_entry("INPUTS", "產品團隊 2 FTE + 單季 $50K 預算", make_provenance("SOURCE_FACT", "HUMAN_APPROVED")),
        stage_entry("ACTIVITIES", "建置互動式 onboarding tutorial + 7 日啟動 email 序列", make_provenance("DECISION", "HUMAN_APPROVED")),
        stage_entry(
            "OUTPUTS",
            "完成 tutorial 的新用戶數、已送達 email 數",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            supporting_evidence_refs=["E-950"],
        ),
        stage_entry(
            "SHORT_TERM_OUTCOMES",
            "7 日內首次啟用率提升",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
            indicators=["7-day activation rate"],
        ),
        stage_entry(
            "LONG_TERM_OUTCOMES",
            "次月流失率下降",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
            indicators=["Month-2 churn rate"],
        ),
    ]


def run_logic_model_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. causal.logic_model resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: evidence the OUTPUTS stage's EVIDENCE-labeled claim cites. ---
    output_evidence = evidence_record("E-950", "onboarding tutorial 完成數與 email 送達數,兩者皆可從產品分析後台直接計數", "product analytics dashboard", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    contracts.validate(S["evidence"], output_evidence, "evidence E-950")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [output_evidence]}, 1)

    # --- Step 2: the complete, well-formed 5-stage Logic Model -- both invariants satisfied. ---
    stages = _valid_stages()
    logic_model = generate_logic_model(
        "LGM-LOGICMODEL-2026-09-10-001",
        "Cascadia 新用戶啟用計畫",
        stages,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["logic_model_record"], logic_model, "logic model record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "LogicModelGenerated", {"logic_model": logic_model}, 1.5)
    milestones.append("LOGIC_MODEL_BUILT")

    gate_results = evaluate_logic_model_gates(logic_model, "run_logic_model_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"logic_model gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("LOGICMODEL_GATE_FAILED on the deliberately well-formed logic model")
    milestones.append("GATES_PASSED")

    # --- Step 3: prove invariant #1 (fixed stage order) is real at the CONSTRUCTION layer -- two stages
    # swapped must be refused. ---
    swapped_stages = list(stages)
    swapped_stages[0], swapped_stages[1] = swapped_stages[1], swapped_stages[0]
    stage_order_construction_blocked = False
    try:
        generate_logic_model("LGM-LOGICMODEL-REFUSED-001", "Cascadia 新用戶啟用計畫", swapped_stages, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        stage_order_construction_blocked = "LOGICMODEL_INVALID_STAGE_SET" in str(error)
    if not stage_order_construction_blocked:
        milestones.append("BLOCKED")
        raise InvariantViolation("LOGICMODEL_INVARIANT_NOT_ENFORCED: a stage-order swap was accepted (or a different guard fired) -- invariant #1 is toothless")

    # --- Step 4: prove invariant #2 (outcome stages require an indicator) is real at the CONSTRUCTION layer
    # -- a SHORT_TERM_OUTCOMES stage with no indicators must be refused. ---
    missing_indicator_stages = list(stages)
    missing_indicator_stages[3] = stage_entry("SHORT_TERM_OUTCOMES", "7 日內首次啟用率提升", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))  # no indicators
    outcome_indicator_construction_blocked = False
    try:
        generate_logic_model("LGM-LOGICMODEL-REFUSED-002", "Cascadia 新用戶啟用計畫", missing_indicator_stages, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        outcome_indicator_construction_blocked = "LOGICMODEL_OUTCOME_MISSING_INDICATOR" in str(error)
    if not outcome_indicator_construction_blocked:
        milestones.append("BLOCKED")
        raise InvariantViolation("LOGICMODEL_INVARIANT_NOT_ENFORCED: a SHORT_TERM_OUTCOMES stage with no indicators was accepted -- invariant #2 is toothless")

    ledger.append(
        CASCADIA.tenant_id,
        AGGREGATE_ID,
        "MalformedLogicModelRefused",
        {"stage_order_construction_blocked": stage_order_construction_blocked, "outcome_indicator_construction_blocked": outcome_indicator_construction_blocked},
        1.7,
    )
    milestones.append("REFUSAL_PROVEN")

    # --- Step 5: prove the SAME "re-derived, not trusted" discipline at the independent GATE layer --
    # hand-tampered copies of the already-valid record, bypassing the builder entirely, must still be caught. ---
    tampered_order = copy.deepcopy(logic_model)
    tampered_order["stages"][0], tampered_order["stages"][1] = tampered_order["stages"][1], tampered_order["stages"][0]
    stage_order_gate_result = evaluate_logic_model_integrity_gate(tampered_order, "run_logic_model_slice", clock.at(1.8))
    stage_order_gate_blocked = stage_order_gate_result["status"] == "FAIL"
    if not stage_order_gate_blocked:
        milestones.append("BLOCKED")
        raise InvariantViolation(
            f"LOGICMODEL_GATE_NOT_INDEPENDENT: logic_model_integrity did not flag a hand-tampered stage-order swap (status={stage_order_gate_result['status']})"
        )

    tampered_indicator = copy.deepcopy(logic_model)
    del tampered_indicator["stages"][4]["indicators"]  # LONG_TERM_OUTCOMES now carries no indicator, bypassing the constructor entirely
    outcome_indicator_gate_result = evaluate_logic_model_integrity_gate(tampered_indicator, "run_logic_model_slice", clock.at(1.9))
    outcome_indicator_gate_blocked = outcome_indicator_gate_result["status"] == "FAIL"
    if not outcome_indicator_gate_blocked:
        milestones.append("BLOCKED")
        raise InvariantViolation(
            f"LOGICMODEL_GATE_NOT_INDEPENDENT: logic_model_integrity did not flag a hand-tampered LONG_TERM_OUTCOMES with no indicators (status={outcome_indicator_gate_result['status']})"
        )

    ledger.append(
        CASCADIA.tenant_id,
        AGGREGATE_ID,
        "TamperedLogicModelCaughtByGate",
        {"stage_order_gate_results": stage_order_gate_result, "outcome_indicator_gate_results": outcome_indicator_gate_result},
        2.0,
    )
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "logic_model": logic_model,
        "gate_results": gate_results,
        "invariant_verification": {
            "stage_order_construction_blocked": stage_order_construction_blocked,
            "outcome_indicator_construction_blocked": outcome_indicator_construction_blocked,
            "stage_order_gate_blocked": stage_order_gate_blocked,
            "outcome_indicator_gate_blocked": outcome_indicator_gate_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_causal_dag_slice.py)",
    }
    write_json(runtime / "results" / "logic_model_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_logic_model_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS causal.logic_model: LogicModel {result['logic_model']['id']} built with {len(result['logic_model']['stages'])}/5 stages, "
        f"gates [{gate_summary}]; stage_order(construction={v['stage_order_construction_blocked']}, gate={v['stage_order_gate_blocked']}), "
        f"outcome_indicator(construction={v['outcome_indicator_construction_blocked']}, gate={v['outcome_indicator_gate_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
