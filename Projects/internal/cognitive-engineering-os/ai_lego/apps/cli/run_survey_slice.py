"""``insight.survey`` vertical slice -- opening member of the NEW F06 `insight` family.

Scenario: a translated customer-satisfaction survey (English-original instrument fielded in
Taiwan), covering all 4 §12.18 quality dimensions and both global-localization fields
(``semantic_equivalence_check``/``local_pilot_ref``, since ``is_translated=True``). Builds a
real, well-formed ``SurveyStudy`` covering Atlas F06 L468's own "construct→question→pilot→
sample→analysis" pipeline, then demonstrates each of the 3 real invariants as a
construction-time REFUSAL (an empty pipeline stage; a quality_dimensions set missing one of
the 4 named concerns; a translated study missing semantic_equivalence_check; an untranslated
study illegally carrying local_pilot_ref), proving none is toothless, same "show a real
refusal, not only a real success" discipline every sibling slice's CLI demo already
establishes. A final step hand-tampers a VALID study directly (bypassing the builder) to prove
the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_survey_slice
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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.insight.survey import (
    METHOD_ID,
    all_gates_pass,
    evaluate_survey_gates,
    generate_survey_study,
    quality_dimension_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SURVEY-SYNTHETIC-001"
EXECUTION_ID = "EX-SURVEY-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SURVEY-001"

S = {
    "survey_study": "ai-lego://specs/cognitive/typed-objects/survey-study.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-survey-slice"


def _valid_quality_dimensions() -> list[dict[str, Any]]:
    return [
        quality_dimension_entry("CONSTRUCT_VALIDITY", "以三個子構念收斂效度題組驗證滿意度構念，避免單題測量誤差"),
        quality_dimension_entry("SAMPLING", "採分層隨機抽樣涵蓋各訂單金額層級與地區，避免自選樣本偏誤"),
        quality_dimension_entry("QUESTION_WORDING", "題目經雙盲翻譯回譯比對，避免引導性用詞與文化不對等表達"),
        quality_dimension_entry("NON_RESPONSE_BIAS", "比對填答與未填答客戶的既有訂單紀錄，確認兩者消費行為無顯著差異"),
    ]


CONSTRUCT_DEFINITION = "顧客整體滿意度（含產品品質、客服回應、交付準時性三個子構念），以 5 點 Likert 量表操作化"
QUESTION_DESIGN = "每個子構念各 3 題正向措辭題目，另加 1 題整體滿意度題，避免雙重否定與引導性用詞"
PILOT_SUMMARY = "先以 40 位既有客戶進行認知訪談（cognitive interview），依回饋修正 2 題語意不清的題目"
SAMPLING_PLAN = "以過去 12 個月下單客戶為母體，依訂單金額分層隨機抽樣，各層目標樣本數 200，涵蓋全部地區"
ANALYSIS_PLAN = "以分層加權估計整體滿意度比例與信賴區間，並以地區/等級交叉分析進行分群比較"
SEMANTIC_EQUIVALENCE_CHECK = "原始英文題本經雙向回譯（forward-backward translation）比對，2 位獨立譯者回譯結果與原文語意一致，無需再修正"
LOCAL_PILOT_REF = "PILOT-TW-2026-09-05-001"


def run_survey_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. insight.survey resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the
    # mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed study -- all 3 real invariants satisfied (all 5
    # pipeline stages non-empty, all 4 quality dimensions covered, translation fields present
    # because is_translated=True), invoked through the catalog's own per-invocation gate
    # (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, study = catalog.invoke(
        METHOD_ID,
        generate_survey_study,
        "SURVEY-2026-09-11-001",
        CONSTRUCT_DEFINITION,
        QUESTION_DESIGN,
        PILOT_SUMMARY,
        SAMPLING_PLAN,
        ANALYSIS_PLAN,
        _valid_quality_dimensions(),
        True,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        semantic_equivalence_check=SEMANTIC_EQUIVALENCE_CHECK,
        local_pilot_ref=LOCAL_PILOT_REF,
    )
    contracts.validate(S["survey_study"], study, "Survey study")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SurveyStudyGenerated", {"study": study, "method_descriptor": descriptor}, 1)
    milestones.append("STUDY_BUILT")

    gate_results = evaluate_survey_gates(study, "run_survey_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"insight.survey gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SURVEY_GATE_FAILED on the deliberately well-formed study: {gate_results}")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the pipeline-stage-completeness invariant is not toothless -- an empty
    # sampling_plan MUST be refused before any record is constructed (Atlas's own literal
    # 5-stage arrow-chain IS the method's definition). ---
    empty_stage_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_survey_study(
            "SURVEY-REFUSED-001",
            CONSTRUCT_DEFINITION,
            QUESTION_DESIGN,
            PILOT_SUMMARY,
            "",  # deliberately empty sampling_plan -- this is the defect under test
            ANALYSIS_PLAN,
            _valid_quality_dimensions(),
            False,
            make_provenance("EVIDENCE", "AI_SUGGESTED"),
        )
    except InvariantViolation as error:
        if "SURVEY_EMPTY_SAMPLING_PLAN" not in str(error):
            raise
        empty_stage_refusal_proof["raised"] = True
        empty_stage_refusal_proof["error_code"] = "SURVEY_EMPTY_SAMPLING_PLAN"
    if not empty_stage_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SURVEY_INVARIANT_NOT_ENFORCED: an empty sampling_plan was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyPipelineStageRecordRefused", {"refusal_proof": empty_stage_refusal_proof}, 1.3)
    milestones.append("EMPTY_PIPELINE_STAGE_REFUSAL_PROVEN")

    # --- Step 3: proof the quality-dimension-completeness invariant is not toothless -- a
    # quality_dimensions set missing NON_RESPONSE_BIAS entirely (only the other 3 named
    # concerns present) MUST be refused. ---
    missing_dimension_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_survey_study(
            "SURVEY-REFUSED-002",
            CONSTRUCT_DEFINITION,
            QUESTION_DESIGN,
            PILOT_SUMMARY,
            SAMPLING_PLAN,
            ANALYSIS_PLAN,
            _valid_quality_dimensions()[:3],  # drop NON_RESPONSE_BIAS -- this is the defect under test
            False,
            make_provenance("EVIDENCE", "AI_SUGGESTED"),
        )
    except InvariantViolation as error:
        if "SURVEY_INCOMPLETE_QUALITY_DIMENSIONS" not in str(error):
            raise
        missing_dimension_refusal_proof["raised"] = True
        missing_dimension_refusal_proof["error_code"] = "SURVEY_INCOMPLETE_QUALITY_DIMENSIONS"
    if not missing_dimension_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SURVEY_INVARIANT_NOT_ENFORCED: a quality_dimensions set missing NON_RESPONSE_BIAS was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingQualityDimensionRecordRefused", {"refusal_proof": missing_dimension_refusal_proof}, 1.5)
    milestones.append("MISSING_QUALITY_DIMENSION_REFUSAL_PROVEN")

    # --- Step 4: proof the translation asymmetry is not toothless (translated direction) -- an
    # is_translated=True study missing semantic_equivalence_check MUST be refused (Atlas's own
    # §12.18 explicit global requirement). ---
    missing_semantic_check_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_survey_study(
            "SURVEY-REFUSED-003",
            CONSTRUCT_DEFINITION,
            QUESTION_DESIGN,
            PILOT_SUMMARY,
            SAMPLING_PLAN,
            ANALYSIS_PLAN,
            _valid_quality_dimensions(),
            True,
            make_provenance("EVIDENCE", "AI_SUGGESTED"),
            local_pilot_ref=LOCAL_PILOT_REF,
            # deliberately no semantic_equivalence_check -- this is the defect under test
        )
    except InvariantViolation as error:
        if "SURVEY_MISSING_SEMANTIC_EQUIVALENCE_CHECK" not in str(error):
            raise
        missing_semantic_check_refusal_proof["raised"] = True
        missing_semantic_check_refusal_proof["error_code"] = "SURVEY_MISSING_SEMANTIC_EQUIVALENCE_CHECK"
    if not missing_semantic_check_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SURVEY_INVARIANT_NOT_ENFORCED: a translated study missing semantic_equivalence_check was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingSemanticEquivalenceCheckRecordRefused", {"refusal_proof": missing_semantic_check_refusal_proof}, 1.7)
    milestones.append("MISSING_SEMANTIC_EQUIVALENCE_CHECK_REFUSAL_PROVEN")

    # --- Step 5: proof the translation asymmetry is not toothless (untranslated direction) -- an
    # is_translated=False study illegally carrying local_pilot_ref MUST be refused (a survey
    # never translated has nothing to disclose at that key). ---
    illegal_local_pilot_ref_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_survey_study(
            "SURVEY-REFUSED-004",
            CONSTRUCT_DEFINITION,
            QUESTION_DESIGN,
            PILOT_SUMMARY,
            SAMPLING_PLAN,
            ANALYSIS_PLAN,
            _valid_quality_dimensions(),
            False,
            make_provenance("EVIDENCE", "AI_SUGGESTED"),
            local_pilot_ref=LOCAL_PILOT_REF,  # illegal for is_translated=False -- this is the defect under test
        )
    except InvariantViolation as error:
        if "SURVEY_UNEXPECTED_TRANSLATION_FIELD_WHEN_NOT_TRANSLATED" not in str(error):
            raise
        illegal_local_pilot_ref_refusal_proof["raised"] = True
        illegal_local_pilot_ref_refusal_proof["error_code"] = "SURVEY_UNEXPECTED_TRANSLATION_FIELD_WHEN_NOT_TRANSLATED"
    if not illegal_local_pilot_ref_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SURVEY_INVARIANT_NOT_ENFORCED: an untranslated study carrying local_pilot_ref was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IllegalLocalPilotRefRecordRefused", {"refusal_proof": illegal_local_pilot_ref_refusal_proof}, 1.9)
    milestones.append("ILLEGAL_LOCAL_PILOT_REF_REFUSAL_PROVEN")

    # --- Step 6: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a
    # caller bypasses the builder entirely (strip local_pilot_ref from the valid, translated
    # study's own raw dict copy while leaving is_translated=True -- an inconsistency the builder
    # would never have produced). ---
    tampered = copy.deepcopy(study)
    del tampered["local_pilot_ref"]  # is_translated stays True -- now internally inconsistent
    tampered_gate_results = evaluate_survey_gates(tampered, "run_survey_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate_results)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("SURVEY_GATE_NOT_INDEPENDENT: the independent translation_consistency gate did NOT catch a hand-tampered translated study missing local_pilot_ref")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate_results}, 2.1)
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
        "empty_stage_refusal_proof": empty_stage_refusal_proof,
        "missing_dimension_refusal_proof": missing_dimension_refusal_proof,
        "missing_semantic_check_refusal_proof": missing_semantic_check_refusal_proof,
        "illegal_local_pilot_ref_refusal_proof": illegal_local_pilot_ref_refusal_proof,
        "tampered_gate_results": tampered_gate_results,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_blue_ocean_slice.py)",
    }
    write_json(runtime / "results" / "survey_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_survey_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS insight.survey: SurveyStudy {result['study']['id']} built covering {len(result['study']['quality_dimensions'])} quality-dimension "
        f"entries, gates [{gate_summary}]; "
        f"SURVEY_EMPTY_SAMPLING_PLAN invariant REFUSED an empty pipeline stage ({result['empty_stage_refusal_proof']['error_code']}); "
        f"SURVEY_INCOMPLETE_QUALITY_DIMENSIONS invariant REFUSED a set missing NON_RESPONSE_BIAS ({result['missing_dimension_refusal_proof']['error_code']}); "
        f"SURVEY_MISSING_SEMANTIC_EQUIVALENCE_CHECK invariant REFUSED a translated study missing it ({result['missing_semantic_check_refusal_proof']['error_code']}); "
        f"SURVEY_UNEXPECTED_TRANSLATION_FIELD_WHEN_NOT_TRANSLATED invariant REFUSED an untranslated study carrying local_pilot_ref "
        f"({result['illegal_local_pilot_ref_refusal_proof']['error_code']}); "
        f"missing-local_pilot_ref tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
