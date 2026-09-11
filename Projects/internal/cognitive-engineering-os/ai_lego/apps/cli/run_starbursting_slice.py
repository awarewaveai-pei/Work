"""``divergent.starbursting`` vertical slice -- F03 divergent-ideation family, 1st member (family opened
this same batch by 10 parallel agents; no prior sibling slice to reference for this family specifically,
so this file follows ``run_bcg_matrix_slice.py``'s structure -- record-level-only provenance, 2 gates, no
evidence-labeling gate -- the closest sibling shape in this corpus).

Scenario: a Starbursting session radiating open questions from an unscoped "為中小企業導入 AI 客服" topic,
before any problem has been framed -- same synthetic style every sibling slice's CLI demo uses. Builds a
real, well-formed ``StarburstingSession`` covering all 6 Atlas L385 categories (with 2 questions on WHO to
prove the unbounded-count design is genuinely exercised, not merely accepted), then demonstrates each of
the 3 real invariants once as a construction-time REFUSAL (a category set missing HOW; an empty
question_text; a declarative statement smuggled in without a trailing '?'), proving none is toothless,
same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo already
establishes. A final step hand-tampers a VALID record directly (bypassing the builder) to prove the
independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_starbursting_slice
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
from ai_lego.modules.divergent.starbursting import (
    METHOD_ID,
    all_gates_pass,
    evaluate_starbursting_gates,
    generate_starbursting_session,
    question_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-STARBURSTING-SYNTHETIC-001"
EXECUTION_ID = "EX-STARBURSTING-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-STARBURSTING-001"
CENTRAL_TOPIC = "為中小企業導入 AI 客服"

S = {
    "starbursting_session": "ai-lego://specs/cognitive/typed-objects/starbursting-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-starbursting-slice"


def _well_formed_questions() -> list[dict[str, Any]]:
    return [
        question_entry("WHO", "誰是第一批會實際操作這個 AI 客服的內部人員？"),
        question_entry("WHO", "哪些客戶群體最可能拒絕與機器人互動？"),
        question_entry("WHAT", "AI 客服需要涵蓋哪些既有人工客服的服務範圍？"),
        question_entry("WHEN", "什麼時間點導入對旺季營運衝擊最小？"),
        question_entry("WHERE", "哪些既有系統或管道需要串接這個 AI 客服？"),
        question_entry("WHY", "為什麼現有人工客服無法滿足現在的需求？"),
        question_entry("HOW", "導入後如何衡量它是否真的降低了客服負擔？"),
    ]


def run_starbursting_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. divergent.starbursting resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed session -- all 3 real invariants satisfied, invoked through
    # the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_starbursting_session,
        "STARBURST-2026-09-11-001",
        CENTRAL_TOPIC,
        _well_formed_questions(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["starbursting_session"], session, "starbursting session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "StarburstingSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_starbursting_gates(session, "run_starbursting_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"divergent.starbursting gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("STARBURSTING_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (category coverage) is not toothless -- a question set missing HOW
    # entirely MUST be refused before any record is constructed. ---
    incomplete_questions = [q for q in _well_formed_questions() if q["category"] != "HOW"]
    incomplete_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_starbursting_session("STARBURST-INCOMPLETE-REFUSED-001", CENTRAL_TOPIC, incomplete_questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "STARBURSTING_INCOMPLETE_CATEGORY_COVERAGE" not in str(error):
            raise
        incomplete_refusal_proof["raised"] = True
        incomplete_refusal_proof["error_code"] = "STARBURSTING_INCOMPLETE_CATEGORY_COVERAGE"
    if not incomplete_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STARBURSTING_INVARIANT_NOT_ENFORCED: a question set missing HOW was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompleteCategoryCoverageRefused", {"refusal_proof": incomplete_refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (non-empty question_text) is not toothless -- an empty question_text
    # MUST be refused. question_entry() itself validates this, so the defect is constructed directly as a
    # raw dict to exercise generate_starbursting_session's own check. ---
    empty_text_questions = _well_formed_questions()
    empty_text_questions[0] = {**empty_text_questions[0], "question_text": "   "}
    empty_text_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_starbursting_session("STARBURST-EMPTY-TEXT-REFUSED-001", CENTRAL_TOPIC, empty_text_questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "STARBURSTING_EMPTY_QUESTION_TEXT" not in str(error):
            raise
        empty_text_refusal_proof["raised"] = True
        empty_text_refusal_proof["error_code"] = "STARBURSTING_EMPTY_QUESTION_TEXT"
    if not empty_text_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STARBURSTING_INVARIANT_NOT_ENFORCED: an empty question_text was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyQuestionTextRefused", {"refusal_proof": empty_text_refusal_proof}, 1.5)
    milestones.append("EMPTY_TEXT_REFUSAL_PROVEN")

    # --- Step 4: proof invariant 3 (must literally be a question) is not toothless -- a declarative
    # statement smuggled in (no trailing '?'/'？') MUST be refused: this is the method's own real,
    # checkable differentiator from framing.five_w_one_h (see module docstring). ---
    declarative_questions = _well_formed_questions()
    declarative_questions[0] = {**declarative_questions[0], "question_text": "第一批操作 AI 客服的內部人員是客服主管"}  # no trailing '?'/'？'
    declarative_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_starbursting_session("STARBURST-DECLARATIVE-REFUSED-001", CENTRAL_TOPIC, declarative_questions, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "STARBURSTING_NOT_A_QUESTION" not in str(error):
            raise
        declarative_refusal_proof["raised"] = True
        declarative_refusal_proof["error_code"] = "STARBURSTING_NOT_A_QUESTION"
    if not declarative_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("STARBURSTING_INVARIANT_NOT_ENFORCED: a declarative statement without a trailing '?'/'？' was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DeclarativeStatementRefused", {"refusal_proof": declarative_refusal_proof}, 1.7)
    milestones.append("DECLARATIVE_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (drops all WHY questions from a raw copy of an already-valid record). ---
    tampered = dict(session)
    tampered["questions"] = [q for q in session["questions"] if q["category"] != "WHY"]
    tampered_gate = evaluate_starbursting_gates(tampered, "run_starbursting_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("STARBURSTING_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered incomplete category set")
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
        "incomplete_refusal_proof": incomplete_refusal_proof,
        "empty_text_refusal_proof": empty_text_refusal_proof,
        "declarative_refusal_proof": declarative_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "starbursting_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_starbursting_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS divergent.starbursting: StarburstingSession {result['session']['id']} built with "
        f"{len(result['session']['questions'])} questions across all 6 categories, gates [{gate_summary}]; "
        f"INCOMPLETE_CATEGORY_COVERAGE/EMPTY_QUESTION_TEXT/NOT_A_QUESTION invariants each REFUSED a malformed attempt "
        f"({result['incomplete_refusal_proof']['error_code']}, {result['empty_text_refusal_proof']['error_code']}, "
        f"{result['declarative_refusal_proof']['error_code']}); "
        f"hand-tampered incomplete category set caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
