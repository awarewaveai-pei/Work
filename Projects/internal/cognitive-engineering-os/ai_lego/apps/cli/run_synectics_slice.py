"""``divergent.synectics`` vertical slice -- F03 divergent-ideation family (1 of 10 agents opening
independent F03 members in this same parallel batch; see ``run_vrio_slice.py``/``run_bcg_matrix_slice.py``
for this suite's shared CLI-demo conventions).

Scenario: a Synectics session reframing a customer-support response-time problem -- same synthetic style
every sibling slice's CLI demo uses. Builds a real, well-formed ``SynecticsSession`` covering all 3 Atlas
L388 analogy types, then demonstrates each of the real invariants once as a construction-time REFUSAL (an
invalid ``analogy_type`` enum value outside the 3-value vocabulary; an empty ``reframed_insight``; an empty
``original_problem``; an empty ``analogies`` list), proving none is toothless, same "show a real refusal,
not only a real success" discipline every sibling slice's CLI demo already establishes. A final step
hand-tampers a VALID record's ``analogies[0].analogy_type`` directly (bypassing the builder) to prove the
independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_synectics_slice
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
from ai_lego.modules.divergent.synectics import (
    ANALOGY_TYPES,
    METHOD_ID,
    all_gates_pass,
    analogy_entry,
    evaluate_synectics_gates,
    generate_synectics_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SYNECTICS-SYNTHETIC-001"
EXECUTION_ID = "EX-SYNECTICS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SYNECTICS-001"

S = {
    "synectics_session": "ai-lego://specs/cognitive/typed-objects/synectics-session.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

ORIGINAL_PROBLEM = "客服信箱平均回覆時間長達 48 小時，客戶滿意度持續下滑"


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-synectics-slice"


def _well_formed_analogies() -> list[dict[str, Any]]:
    return [
        analogy_entry(
            "DIRECT",
            "像醫院急診室的檢傷分類（triage）制度，依緊急程度插隊處理，不是先到先服務",
            "客服信箱應該先做輕重緩急分類，不是按收件時間順序處理",
        ),
        analogy_entry(
            "PERSONAL",
            "如果我是那封被已讀不回 48 小時的信，我會覺得自己不重要、被公司遺忘了",
            "問題核心不是回覆速度本身，而是客戶在等待期間完全沒收到任何『被看見』的訊號",
        ),
        analogy_entry(
            "SYMBOLIC",
            "回覆時間就像水壩洩洪閘門，一次全開反而沖垮下游（客服人力），需要的是穩定小流量",
            "與其衝刺清空信箱，該做的是穩定分批、可預期的處理節奏，而非間歇性大量清空",
        ),
    ]


def run_synectics_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. divergent.synectics resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed session -- all 4 real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_synectics_session,
        "SYNECTICS-2026-09-11-001",
        ORIGINAL_PROBLEM,
        _well_formed_analogies(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["synectics_session"], session, "synectics session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SynecticsSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_synectics_gates(session, "run_synectics_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"divergent.synectics gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("SYNECTICS_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 3 (closed 3-value analogy_type vocabulary) is not toothless -- a 4th value
    # outside {DIRECT, PERSONAL, SYMBOLIC} (e.g. a "Fantasy Analogy") MUST be refused before construction. ---
    invalid_type_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        analogy_entry("FANTASY", "假裝問題是一場太空冒險", "想像力發散但未實際重構問題")
    except InvariantViolation as error:
        if "SYNECTICS_INVALID_ANALOGY_TYPE" not in str(error):
            raise
        invalid_type_refusal_proof["raised"] = True
        invalid_type_refusal_proof["error_code"] = "SYNECTICS_INVALID_ANALOGY_TYPE"
    if not invalid_type_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SYNECTICS_INVARIANT_NOT_ENFORCED: analogy_type outside {sorted(ANALOGY_TYPES)} was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InvalidAnalogyTypeRefused", {"refusal_proof": invalid_type_refusal_proof}, 1.3)
    milestones.append("INVALID_ANALOGY_TYPE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 4 (per-entry reframed_insight content) is not toothless -- an empty
    # reframed_insight on one analogy MUST be refused. analogy_entry() itself validates this, so the defect
    # is constructed directly as a raw dict to exercise generate_synectics_session's own check. ---
    empty_insight_analogies = _well_formed_analogies()
    empty_insight_analogies[0] = {**empty_insight_analogies[0], "reframed_insight": "   "}
    empty_insight_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_synectics_session("SYNECTICS-EMPTY-INSIGHT-REFUSED-001", ORIGINAL_PROBLEM, empty_insight_analogies, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "SYNECTICS_EMPTY_REFRAMED_INSIGHT" not in str(error):
            raise
        empty_insight_refusal_proof["raised"] = True
        empty_insight_refusal_proof["error_code"] = "SYNECTICS_EMPTY_REFRAMED_INSIGHT"
    if not empty_insight_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYNECTICS_INVARIANT_NOT_ENFORCED: an empty reframed_insight was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyReframedInsightRefused", {"refusal_proof": empty_insight_refusal_proof}, 1.5)
    milestones.append("EMPTY_REFRAMED_INSIGHT_REFUSAL_PROVEN")

    # --- Step 4: proof invariant 1 (original_problem) is not toothless -- a blank subject MUST be refused:
    # analogies with no named problem cannot be audited against reality. ---
    empty_problem_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_synectics_session("SYNECTICS-EMPTY-PROBLEM-REFUSED-001", "   ", _well_formed_analogies(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "SYNECTICS_EMPTY_ORIGINAL_PROBLEM" not in str(error):
            raise
        empty_problem_refusal_proof["raised"] = True
        empty_problem_refusal_proof["error_code"] = "SYNECTICS_EMPTY_ORIGINAL_PROBLEM"
    if not empty_problem_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYNECTICS_INVARIANT_NOT_ENFORCED: an empty original_problem was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyOriginalProblemRefused", {"refusal_proof": empty_problem_refusal_proof}, 1.7)
    milestones.append("EMPTY_ORIGINAL_PROBLEM_REFUSAL_PROVEN")

    # --- Step 5: proof invariant 2 (non-empty analogies) is not toothless -- a zero-length analogies list
    # MUST be refused. ---
    empty_analogies_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_synectics_session("SYNECTICS-EMPTY-ANALOGIES-REFUSED-001", ORIGINAL_PROBLEM, [], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "SYNECTICS_EMPTY_ANALOGY_LIST" not in str(error):
            raise
        empty_analogies_refusal_proof["raised"] = True
        empty_analogies_refusal_proof["error_code"] = "SYNECTICS_EMPTY_ANALOGY_LIST"
    if not empty_analogies_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYNECTICS_INVARIANT_NOT_ENFORCED: an empty analogies list was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyAnalogyListRefused", {"refusal_proof": empty_analogies_refusal_proof}, 1.9)
    milestones.append("EMPTY_ANALOGY_LIST_REFUSAL_PROVEN")

    # --- Step 6: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (smuggles an illegal analogy_type onto a raw copy of an already-valid record,
    # proving invariant 3 is re-derived, not trusted). ---
    tampered = dict(session)
    tampered["analogies"] = [dict(a) for a in session["analogies"]]
    tampered["analogies"][0] = {**tampered["analogies"][0], "analogy_type": "FANTASY"}
    tampered_gate = evaluate_synectics_gates(tampered, "run_synectics_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYNECTICS_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered analogy_type")
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
        "session": session,
        "gate_results": gate_results,
        "invalid_analogy_type_refusal_proof": invalid_type_refusal_proof,
        "empty_reframed_insight_refusal_proof": empty_insight_refusal_proof,
        "empty_original_problem_refusal_proof": empty_problem_refusal_proof,
        "empty_analogy_list_refusal_proof": empty_analogies_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_vrio_slice.py)",
    }
    write_json(runtime / "results" / "synectics_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_synectics_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS divergent.synectics: SynecticsSession {result['session']['id']} built with "
        f"{len(result['session']['analogies'])} analogies, gates [{gate_summary}]; "
        f"SYNECTICS_INVALID_ANALOGY_TYPE/SYNECTICS_EMPTY_REFRAMED_INSIGHT/SYNECTICS_EMPTY_ORIGINAL_PROBLEM/"
        f"SYNECTICS_EMPTY_ANALOGY_LIST invariants each REFUSED a malformed attempt "
        f"({result['invalid_analogy_type_refusal_proof']['error_code']}, "
        f"{result['empty_reframed_insight_refusal_proof']['error_code']}, "
        f"{result['empty_original_problem_refusal_proof']['error_code']}, "
        f"{result['empty_analogy_list_refusal_proof']['error_code']}); "
        f"hand-tampered analogy_type caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
