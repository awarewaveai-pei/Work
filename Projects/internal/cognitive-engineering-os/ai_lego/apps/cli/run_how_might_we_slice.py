"""``framing.how_might_we`` vertical slice -- Method Atlas slice for the F01 framing family's "How Might We"
tool (Atlas F01 table row, AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:342, plus dedicated
Sec12.3, L2575-2580 -- the method's only 2 citations, grep-confirmed).

Scenario: Atlas's own Sec12.3 worked example, transcribed rather than a synthetic Cascadia scenario --
disclosed as literal-citation-derived rather than presented as an independent case, same honesty discipline
every sibling slice's CLI demo already applies to its own scenario grounding. ``hmw_question`` is Atlas's own
cited sentence verbatim; ``pain_point`` is this slice's own restatement of the underlying pain Atlas's example
contrasts against an anti-pattern solution statement ("做一個 chatbot").

This run demonstrates each of the 4 real invariants once as a construction-time REFUSAL (empty hmw_question,
an echoing hmw_question, a stem-less hmw_question, a question-mark-less hmw_question), proving none is
toothless, same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo
already establishes. A final step then hand-tampers a VALID record directly (bypassing the builder) to prove
the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_how_might_we_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.framing.how_might_we import (
    METHOD_ID,
    all_gates_pass,
    evaluate_how_might_we_gates,
    generate_how_might_we,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-HOWMIGHTWE-SYNTHETIC-001"
EXECUTION_ID = "EX-HOWMIGHTWE-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-HOWMIGHTWE-001"

S = {
    "how_might_we": "ai-lego://specs/cognitive/typed-objects/how-might-we-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-how-might-we-slice"


def run_how_might_we_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. framing.how_might_we resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- both real invariants satisfied. Scenario: Atlas's own
    # Sec12.3 worked example, see module docstring. ---
    record = generate_how_might_we(
        "HMW-2026-09-10-001",
        "新使用者常常找不到正確資訊，只能反覆摸索甚至放棄",
        "我們可以如何讓第一次使用者在 3 分鐘內找到正確資訊？",
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["how_might_we"], record, "how might we record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "HowMightWeRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_how_might_we_gates(record, "run_how_might_we_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"how_might_we gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("HOWMIGHTWE_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the completeness invariant is not toothless -- a deliberately empty hmw_question MUST
    # be refused before any record is constructed. ---
    refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_how_might_we(
            "HMW-REFUSED-001",
            "同上",
            "",  # empty hmw_question -- an unreframed pain point is exactly the ambiguity this method exists to eliminate
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "HOWMIGHTWE_EMPTY_HMW_QUESTION" not in str(error):
            raise
        refusal_proof["raised"] = True
        refusal_proof["error_code"] = "HOWMIGHTWE_EMPTY_HMW_QUESTION"
    if not refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("HOWMIGHTWE_INVARIANT_NOT_ENFORCED: an empty hmw_question was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MalformedRecordRefused", {"refusal_proof": refusal_proof}, 1.5)
    milestones.append("REFUSAL_PROVEN")

    # --- Step 3: proof the echo invariant is not toothless -- hmw_question identical to pain_point MUST be
    # refused (no real reframing, just an echo). ---
    echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_how_might_we(
            "HMW-ECHO-REFUSED-001",
            "使用者流失率過高",
            "使用者流失率過高",  # identical to pain_point -- an echo, not an actual reframing
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "HOWMIGHTWE_QUESTION_ECHOES_PAIN_POINT" not in str(error):
            raise
        echo_refusal_proof["raised"] = True
        echo_refusal_proof["error_code"] = "HOWMIGHTWE_QUESTION_ECHOES_PAIN_POINT"
    if not echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("HOWMIGHTWE_INVARIANT_NOT_ENFORCED: hmw_question==pain_point was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "EchoRecordRefused", {"echo_refusal_proof": echo_refusal_proof}, 1.7)
    milestones.append("ECHO_REFUSAL_PROVEN")

    # --- Step 4: proof the stem invariant is not toothless -- a declarative solution statement with no HMW
    # stem MUST be refused, even though it ends with a question mark. ---
    stem_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_how_might_we(
            "HMW-STEM-REFUSED-001",
            "使用者流失率過高",
            "我們應該直接做一個忠誠計畫留住使用者？",  # presupposes the solution, no recognized HMW stem
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "HOWMIGHTWE_QUESTION_MISSING_STEM" not in str(error):
            raise
        stem_refusal_proof["raised"] = True
        stem_refusal_proof["error_code"] = "HOWMIGHTWE_QUESTION_MISSING_STEM"
    if not stem_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("HOWMIGHTWE_INVARIANT_NOT_ENFORCED: a stem-less hmw_question was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "StemlessRecordRefused", {"stem_refusal_proof": stem_refusal_proof}, 1.8)
    milestones.append("STEM_REFUSAL_PROVEN")

    # --- Step 5: proof the question-mark invariant is not toothless -- a correctly-stemmed sentence with no
    # question mark MUST be refused. ---
    question_mark_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_how_might_we(
            "HMW-QMARK-REFUSED-001",
            "使用者流失率過高",
            "我們可以如何讓使用者流失率下降",  # correct stem, but no trailing question mark
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "HOWMIGHTWE_QUESTION_MISSING_QUESTION_MARK" not in str(error):
            raise
        question_mark_refusal_proof["raised"] = True
        question_mark_refusal_proof["error_code"] = "HOWMIGHTWE_QUESTION_MISSING_QUESTION_MARK"
    if not question_mark_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("HOWMIGHTWE_INVARIANT_NOT_ENFORCED: a question-mark-less hmw_question was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "QuestionMarklessRecordRefused", {"question_mark_refusal_proof": question_mark_refusal_proof}, 1.9)
    milestones.append("QUESTION_MARK_REFUSAL_PROVEN")

    # --- Step 6: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely. ---
    tampered = dict(record)
    tampered["hmw_question"] = ""  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_how_might_we_gates(tampered, "run_how_might_we_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("HOWMIGHTWE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered empty hmw_question")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "echo_refusal_proof": echo_refusal_proof,
        "stem_refusal_proof": stem_refusal_proof,
        "question_mark_refusal_proof": question_mark_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_goal_statement_slice.py)",
    }
    write_json(runtime / "results" / "how_might_we_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_how_might_we_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS framing.how_might_we: HowMightWeRecord {result['record']['id']} built, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"EMPTY_HMW_QUESTION invariant REFUSED a malformed attempt ({result['refusal_proof']['error_code']}); "
        f"QUESTION_ECHOES_PAIN_POINT invariant REFUSED an echoing attempt ({result['echo_refusal_proof']['error_code']}); "
        f"MISSING_STEM invariant REFUSED a solution-presupposing attempt ({result['stem_refusal_proof']['error_code']}); "
        f"MISSING_QUESTION_MARK invariant REFUSED a non-interrogative attempt ({result['question_mark_refusal_proof']['error_code']}); "
        f"empty-hmw_question tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
