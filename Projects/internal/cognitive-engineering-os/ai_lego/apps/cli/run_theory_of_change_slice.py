"""``causal.theory_of_change`` vertical slice -- Method Atlas slice for the F11 "Causal & Research Reasoning"
family's 7th member (``causal.dag`` landed earlier this same batch). See
``ai_lego.modules.causal.theory_of_change``'s own module docstring for the full due-diligence read
(positional 6-stage/5-transition invariant, unconditional 4-attribute-per-arrow requirement, zero
pre-existing implementation confirmed by whole-tree grep).

Scenario: a local-government vocational training subsidy program (matching Atlas's own named benefit domain,
L1711, "非常適合政策、教育、社會方案") -- distinct from every other Cascadia-scenario slice in this suite, since
Atlas §11.22 gives no Cascadia-style worked instance of its own to transcribe.

Demonstrates both real invariants, each at BOTH layers:

1. Positional shape (``THEORYOFCHANGE_INVALID_STAGE_SET``/``THEORYOFCHANGE_INVALID_TRANSITION_SET``/
   ``THEORYOFCHANGE_TRANSITION_MISSING_ATTRIBUTE``): a construction-time PASS (the real 6-stage/5-transition
   chain below) and a construction-time REFUSAL (a transition missing its own ``risk`` attribute, the exact
   "every arrow needs all 4 attributes" invariant Atlas §11.22 states unconditionally) are both shown.
2. Runtime-gate independence: a hand-tampered COPY of the valid record, with one transition's ``risk`` field
   blanked directly on the raw dict, bypasses the builder entirely -- the independent
   ``theory_of_change_integrity`` gate must catch it by re-deriving from raw fields, never trusting that the
   builder ran (or ran correctly) on the record it is given.

Run::

    python -m ai_lego.apps.cli.run_theory_of_change_slice
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
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.causal.theory_of_change import (
    METHOD_ID,
    all_gates_pass,
    evaluate_theory_of_change_gates,
    generate_theory_of_change_record,
    stage_entry,
    transition_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-THEORYOFCHANGE-SYNTHETIC-001"
EXECUTION_ID = "EX-THEORYOFCHANGE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-THEORYOFCHANGE-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "theory_of_change_record": "ai-lego://specs/cognitive/typed-objects/theory-of-change-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-theory-of-change-slice"


def run_theory_of_change_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. causal.theory_of_change resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: evidence the EVIDENCE-labeled transitions cite -- real, directly observable facts about this
    # own scenario's own scheduling/completion/employer/retention track record. ---
    scheduling_evidence = evidence_record("E-2001", "過去兩期同規模計畫的排課紀錄顯示講師與場地可同時支援開課", "past program scheduling log", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    completion_evidence = evidence_record("E-2002", "同類職訓課程過去結業率約 80%", "past program completion statistics", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    retention_evidence = evidence_record("E-2003", "上一期學員 12 個月留職率追蹤資料顯示多數初期就業具持續性", "prior cohort 12-month retention tracking", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    for record in (scheduling_evidence, completion_evidence, retention_evidence):
        contracts.validate(S["evidence"], record, f"evidence {record['evidence_id']}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [scheduling_evidence, completion_evidence, retention_evidence]}, 1)

    # --- Step 2: the complete, well-formed 6-stage/5-transition chain -- a local-government vocational
    # training subsidy program, matching Atlas's own named benefit domain (L1711). ---
    stages = [
        stage_entry("INPUTS", "年度預算 NT$5,000 萬、20 名訓練講師、3 個訓練中心場地", make_provenance("SOURCE_FACT", "HUMAN_APPROVED")),
        stage_entry("ACTIVITIES", "為 800 名失業者開設 12 週職業技能課程（電腦、餐飲、長照三類）", make_provenance("SOURCE_FACT", "HUMAN_APPROVED")),
        stage_entry("OUTPUTS", "800 名學員完成課程，其中 650 名取得技能證照", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        stage_entry("SHORT_TERM_OUTCOMES", "結業後 3 個月內，450 名學員成功就業", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        stage_entry("LONG_TERM_OUTCOMES", "結業後 12 個月，450 名就業者中 380 名仍在職，平均薪資較訓練前提升 18%", make_provenance("EVIDENCE", "HUMAN_APPROVED")),
        stage_entry("IMPACT", "計畫涵蓋區域失業率由 6.2% 下降至 5.1%", make_provenance("AI_INFERENCE", "AI_SUGGESTED")),
    ]
    transitions = [
        transition_entry(
            "INPUTS", "ACTIVITIES",
            "講師與場地足以同時開課而不互相排擠", "過去兩期同規模計畫的排課紀錄顯示可行", "課程如期開班的班次比例", "講師流動或場地檔期衝突導致開課延遲",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-2001"],
        ),
        transition_entry(
            "ACTIVITIES", "OUTPUTS",
            "學員出席率足以完成課程並通過檢定", "同類課程過去結業率約 80%", "結業率、證照通過率", "學員因家庭或經濟壓力中途退訓",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-2002"],
        ),
        transition_entry(
            "OUTPUTS", "SHORT_TERM_OUTCOMES",
            "持有證照的學員具備雇主要求的最低技能門檻", "訓練中心與 12 家在地企業的用人合作備忘錄", "結業後 3 個月就業率", "當地就業市場需求萎縮，證照與職缺不匹配",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
        transition_entry(
            "SHORT_TERM_OUTCOMES", "LONG_TERM_OUTCOMES",
            "初期就業具有可持續性，不會短期內流失", "上一期學員 12 個月留職率追蹤資料", "12 個月在職率、薪資變化", "試用期後遭資遣或自願離職",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-2003"],
        ),
        transition_entry(
            "LONG_TERM_OUTCOMES", "IMPACT",
            "計畫規模足以在區域統計層級產生可偵測的失業率變化", "區域勞動力調查基準線與追蹤期比較", "區域失業率", "總體經濟景氣同時影響失業率，難以歸因於本計畫",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
    ]
    record = generate_theory_of_change_record(
        "TOC-2026-09-10-001",
        "地方政府職業訓練津貼計畫",
        stages,
        transitions,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["theory_of_change_record"], record, "theory of change record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TheoryOfChangeRecordGenerated", {"record": record}, 1.5)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_theory_of_change_gates(record, "run_theory_of_change_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"theory of change gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("THEORYOFCHANGE_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 3: proof the "every arrow needs all 4 attributes" invariant is not toothless -- a transition
    # missing its own risk attribute (the exact Atlas §11.22 unconditional requirement) MUST be refused BEFORE
    # any record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    malformed_transitions = list(transitions)
    malformed_transitions[-1] = transition_entry(
        "LONG_TERM_OUTCOMES", "IMPACT",
        "計畫規模足以在區域統計層級產生可偵測的失業率變化", "區域勞動力調查基準線與追蹤期比較", "區域失業率", "",  # risk deliberately blank
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    try:
        generate_theory_of_change_record("TOC-REFUSED-001", "地方政府職業訓練津貼計畫", stages, malformed_transitions, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "THEORYOFCHANGE_TRANSITION_MISSING_ATTRIBUTE" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "THEORYOFCHANGE_TRANSITION_MISSING_ATTRIBUTE"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("THEORYOFCHANGE_INVARIANT_NOT_ENFORCED: a transition missing its own risk attribute was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 2)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the positional/completeness invariant is caught by the INDEPENDENT
    # gate even when a caller bypasses the builder entirely and hand-edits a raw copy of the valid record. ---
    tampered = copy.deepcopy(record)
    tampered["transitions"][-1]["risk"] = ""  # present but blanked: the Atlas-mandated attribute is simply gone
    tampered_gate = evaluate_theory_of_change_gates(tampered, "run_theory_of_change_slice", clock.at(2.5))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("THEORYOFCHANGE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered transition missing its own risk attribute")
    integrity_gate = next(g for g in tampered_gate if g["gate_id"] == "theory_of_change_integrity")
    if "MISSING_ATTRIBUTE" not in integrity_gate["evidence"][0].get("reason", ""):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"THEORYOFCHANGE_DEMO_INVARIANT: expected a MISSING_ATTRIBUTE reason, got {integrity_gate['evidence'][0]!r}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedTransitionCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.6)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "record": record,
        "gate_results": gate_results,
        "refusal_proof": refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "theory_of_change_slice_result.json", result)
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
        result = run_theory_of_change_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS causal.theory_of_change: TheoryOfChangeRecord {result['record']['id']} built with "
        f"{len(result['record']['stages'])} stages/{len(result['record']['transitions'])} transitions, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"missing-attribute invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"positional/completeness mismatch caught a hand-tampered record via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
