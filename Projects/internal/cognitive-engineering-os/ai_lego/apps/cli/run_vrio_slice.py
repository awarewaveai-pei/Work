"""``strategy.vrio`` vertical slice -- F08 context/strategy family, 7th member (built concurrently with 3
siblings -- ``strategy.value_chain``/``stp``/``ansoff`` -- see ``run_porter_five_forces_slice.py`` for this
batch's shared CLI-demo conventions).

Scenario: a VRIO analysis for a proprietary supply-chain data pipeline -- same synthetic style every sibling
slice's CLI demo uses. Builds a real, well-formed ``VrioAnalysis`` covering all 4 Atlas §12.13 dimensions,
then demonstrates each of the 4 real invariants once as a construction-time REFUSAL (an incomplete question
set missing ORGANIZATION; an empty ``reasoning``; a missing ``resource_description``), proving none is
toothless, same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo
already establishes. A final step hand-tampers a VALID record's ``competitive_implication`` directly
(bypassing the builder) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_vrio_slice
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
from ai_lego.modules.strategy.vrio import (
    METHOD_ID,
    all_gates_pass,
    evaluate_vrio_gates,
    generate_vrio_analysis,
    question_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-VRIO-SYNTHETIC-001"
EXECUTION_ID = "EX-VRIO-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-VRIO-001"

S = {
    "vrio_analysis": "ai-lego://specs/cognitive/typed-objects/vrio-analysis.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

RESOURCE_DESCRIPTION = "5 年累積的區域供應鏈即時異常偵測資料管線與其專屬訓練資料集"


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-vrio-slice"


def _well_formed_questions() -> list[dict[str, Any]]:
    return [
        question_entry("VALUE", "YES", "偵測異常的平均前置時間比業界標準快 3 倍，直接降低缺貨成本", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-501"]),
        question_entry("RARITY", "YES", "同業僅 1 家有類似規模的自建資料管線，其餘皆採第三方通用方案", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        question_entry("IMITABILITY", "YES", "5 年累積的專屬異常標註資料難以短期複製，屬於路徑依賴優勢", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        question_entry("ORGANIZATION", "NO", "資料管線目前僅供內部維運團隊使用，尚無產品化或跨部門流程去實際變現此優勢", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]


def run_vrio_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.vrio resolves because its contract
    # is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed analysis -- all 4 real invariants satisfied, competitive_implication
    # computed (not caller-supplied), invoked through the catalog's own per-invocation gate (ADR-023
    # Consequences 5's pattern, unchanged). ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_vrio_analysis,
        "VRIO-2026-09-11-001",
        RESOURCE_DESCRIPTION,
        _well_formed_questions(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["vrio_analysis"], analysis, "vrio analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "VrioAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_vrio_gates(analysis, "run_vrio_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.vrio gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("VRIO_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (completeness) is not toothless -- a question set missing ORGANIZATION
    # (only 3 of the 4 required dimensions) MUST be refused before any record is constructed. ---
    incomplete_questions = _well_formed_questions()[:3]  # drops ORGANIZATION
    incomplete_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_vrio_analysis("VRIO-INCOMPLETE-REFUSED-001", RESOURCE_DESCRIPTION, incomplete_questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "VRIO_INCOMPLETE_QUESTION_SET" not in str(error):
            raise
        incomplete_refusal_proof["raised"] = True
        incomplete_refusal_proof["error_code"] = "VRIO_INCOMPLETE_QUESTION_SET"
    if not incomplete_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("VRIO_INVARIANT_NOT_ENFORCED: a question set missing ORGANIZATION was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompleteQuestionSetRefused", {"refusal_proof": incomplete_refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-question content) is not toothless -- an empty reasoning on one
    # question MUST be refused. question_entry() itself validates dimension/answer only, so the
    # empty-reasoning defect is constructed directly as a raw dict to exercise generate_vrio_analysis's own
    # check. ---
    empty_reasoning_questions = _well_formed_questions()
    empty_reasoning_questions[0] = {**empty_reasoning_questions[0], "reasoning": "   "}
    empty_reasoning_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_vrio_analysis("VRIO-EMPTY-REASONING-REFUSED-001", RESOURCE_DESCRIPTION, empty_reasoning_questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "VRIO_EMPTY_REASONING" not in str(error):
            raise
        empty_reasoning_refusal_proof["raised"] = True
        empty_reasoning_refusal_proof["error_code"] = "VRIO_EMPTY_REASONING"
    if not empty_reasoning_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("VRIO_INVARIANT_NOT_ENFORCED: an empty question reasoning was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyReasoningRefused", {"refusal_proof": empty_reasoning_refusal_proof}, 1.5)
    milestones.append("EMPTY_REASONING_REFUSAL_PROVEN")

    # --- Step 4: proof invariant 4 (resource_description) is not toothless -- a blank subject MUST be
    # refused: 4 answered dimensions with no named resource cannot be audited against reality. ---
    empty_resource_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_vrio_analysis("VRIO-EMPTY-RESOURCE-REFUSED-001", "   ", _well_formed_questions(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "VRIO_EMPTY_RESOURCE_DESCRIPTION" not in str(error):
            raise
        empty_resource_refusal_proof["raised"] = True
        empty_resource_refusal_proof["error_code"] = "VRIO_EMPTY_RESOURCE_DESCRIPTION"
    if not empty_resource_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("VRIO_INVARIANT_NOT_ENFORCED: an empty resource_description was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyResourceDescriptionRefused", {"refusal_proof": empty_resource_refusal_proof}, 1.7)
    milestones.append("EMPTY_RESOURCE_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (flips the stored competitive_implication on a raw copy of an already-valid record,
    # proving invariant 3 -- GENUINE_COMPUTE -- is re-derived, not trusted). ---
    tampered = dict(analysis)
    tampered["competitive_implication"] = "SUSTAINED_COMPETITIVE_ADVANTAGE" if analysis["competitive_implication"] != "SUSTAINED_COMPETITIVE_ADVANTAGE" else "COMPETITIVE_DISADVANTAGE"
    tampered_gate = evaluate_vrio_gates(tampered, "run_vrio_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("VRIO_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered competitive_implication")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "analysis": analysis,
        "gate_results": gate_results,
        "incomplete_refusal_proof": incomplete_refusal_proof,
        "empty_reasoning_refusal_proof": empty_reasoning_refusal_proof,
        "empty_resource_refusal_proof": empty_resource_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_porter_five_forces_slice.py)",
    }
    write_json(runtime / "results" / "vrio_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_vrio_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.vrio: VrioAnalysis {result['analysis']['id']} built with competitive_implication="
        f"{result['analysis']['competitive_implication']}, gates [{gate_summary}]; "
        f"INCOMPLETE_QUESTION_SET/EMPTY_REASONING/EMPTY_RESOURCE_DESCRIPTION invariants each REFUSED a malformed attempt "
        f"({result['incomplete_refusal_proof']['error_code']}, {result['empty_reasoning_refusal_proof']['error_code']}, "
        f"{result['empty_resource_refusal_proof']['error_code']}); "
        f"hand-tampered competitive_implication caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
