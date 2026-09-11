"""``insight.interview`` vertical slice -- F06 人類／顧客洞察 family, 7th of 9 members (new family
this batch opens in parallel).

Scenario: a real interview study investigating checkout abandonment (8 recruited users), same
synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed ``InterviewStudy``
covering all 9 of §12.17's own pipeline stages plus ``documented_biases``, then demonstrates each of
the 2 real invariants once as a construction-time REFUSAL (a missing pipeline stage; an empty
``documented_biases``), proving neither is toothless, same "show a real refusal, not only a real
success" discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a
VALID record directly (bypassing the builder) to prove the independent gate, not just the builder,
catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_interview_slice
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
from ai_lego.modules.insight.interview import (
    METHOD_ID,
    all_gates_pass,
    evaluate_interview_gates,
    generate_interview_study,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-INTERVIEW-SYNTHETIC-001"
EXECUTION_ID = "EX-INTERVIEW-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-INTERVIEW-001"

S = {
    "interview_study": "ai-lego://specs/cognitive/typed-objects/interview-study.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-interview-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return dict(
        record_id="INTERVIEW-2026-09-11-001",
        research_question="為什麼有結帳意圖的使用者最後沒有完成付款？",
        sampling_approach="從近 30 天內加入購物車但未結帳的使用者中，以 email 招募 8 位，涵蓋新舊客各半",
        documented_biases="樣本僅來自願意受訪的使用者（自我選擇偏誤），且全數為行動裝置使用者，結論不可直接推論到桌面使用者",
        guide="半結構式題綱：上次結帳經驗描述→卡關的具體步驟→當下情緒→最終決定原因→若能重來會怎麼做",
        consent_process="訪談前以書面說明錄音用途與資料保存期限，受訪者口頭同意錄音，同意記錄存於訪談排程表",
        interview_notes="多數受訪者在填寫地址與運費揭露的步驟猶豫，3 位提到運費出現得太晚感覺被欺騙",
        transcript_ref="docs/research/interviews/2026-09-checkout-abandon/transcripts/",
        codes=["late_shipping_disclosure", "trust_breach", "address_form_friction", "price_anchoring"],
        themes=["運費揭露時機影響信任", "表單摩擦造成放棄"],
        negative_cases="1 位受訪者反而覺得運費揭露時機沒有影響，放棄純粹因為想比價，顯示 late_shipping_disclosure 非唯一原因",
        provenance=make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )


def run_interview_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. insight.interview resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed interview study -- both real invariants satisfied,
    # invoked through the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern,
    # unchanged). ---
    descriptor, study = catalog.invoke(METHOD_ID, generate_interview_study, **_well_formed_kwargs())
    contracts.validate(S["interview_study"], study, "interview study")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InterviewStudyGenerated", {"study": study, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_interview_gates(study, "run_interview_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"insight.interview gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("INTERVIEW_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (all 9 §12.17 pipeline stages present/non-empty) is not
    # toothless -- a blanked-out pipeline stage (negative_cases) MUST be refused before any record
    # is constructed. ---
    missing_stage_kwargs = {**_well_formed_kwargs(), "record_id": "INTERVIEW-MISSING-STAGE-REFUSED-001", "negative_cases": "   "}
    missing_stage_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_interview_study(**missing_stage_kwargs)
    except InvariantViolation as error:
        if "INTERVIEW_INVALID_STAGES" not in str(error):
            raise
        missing_stage_refusal_proof["raised"] = True
        missing_stage_refusal_proof["error_code"] = "INTERVIEW_INVALID_STAGES"
    if not missing_stage_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("INTERVIEW_INVARIANT_NOT_ENFORCED: a blanked pipeline stage (negative_cases) was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingStageRefused", {"refusal_proof": missing_stage_refusal_proof}, 1.3)
    milestones.append("MISSING_STAGE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (documented_biases is a SEPARATE, ADDITIONAL required field) is
    # not toothless -- an empty documented_biases MUST be refused even when all 9 pipeline stages
    # are otherwise well-formed. ---
    empty_biases_kwargs = {**_well_formed_kwargs(), "record_id": "INTERVIEW-EMPTY-BIASES-REFUSED-001", "documented_biases": "   "}
    empty_biases_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_interview_study(**empty_biases_kwargs)
    except InvariantViolation as error:
        if "INTERVIEW_EMPTY_DOCUMENTED_BIASES" not in str(error):
            raise
        empty_biases_refusal_proof["raised"] = True
        empty_biases_refusal_proof["error_code"] = "INTERVIEW_EMPTY_DOCUMENTED_BIASES"
    if not empty_biases_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("INTERVIEW_INVARIANT_NOT_ENFORCED: an empty documented_biases was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyDocumentedBiasesRefused", {"refusal_proof": empty_biases_refusal_proof}, 1.5)
    milestones.append("EMPTY_BIASES_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller
    # bypasses the builder entirely (blanks `themes` directly on a copy of the valid record). ---
    tampered = dict(study)
    tampered["themes"] = []
    tampered_gate = evaluate_interview_gates(tampered, "run_interview_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("INTERVIEW_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered empty themes[] list")
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
        "study": study,
        "gate_results": gate_results,
        "missing_stage_refusal_proof": missing_stage_refusal_proof,
        "empty_biases_refusal_proof": empty_biases_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "interview_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_interview_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS insight.interview: InterviewStudy {result['study']['id']} built with "
        f"{len(result['study']['codes'])} codes / {len(result['study']['themes'])} themes, gates [{gate_summary}]; "
        f"INTERVIEW_INVALID_STAGES/INTERVIEW_EMPTY_DOCUMENTED_BIASES invariants each REFUSED a malformed attempt "
        f"({result['missing_stage_refusal_proof']['error_code']}, {result['empty_biases_refusal_proof']['error_code']}); "
        f"hand-tampered empty themes[] caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
