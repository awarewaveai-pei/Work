"""``framing.frame_storming`` vertical slice -- Method Atlas slice for the F01 framing family's 10th member
(Atlas F01 table row L343 + §28 quick-tool table L4468). See ``ai_lego.modules.framing.frame_storming``'s own
module docstring for the full due-diligence read (zero pre-existing implementation, no dedicated §12.x
section, no §22.3/EC §32 row).

Self-referential scenario, same class ``run_problem_statement_slice.py``/``run_5w1h_slice.py`` already
establish for this batch (the demo IS a real thing observed during this build, not an invented business
narrative): this session's own repeated finding that every F01 sibling's ``method-inventory.yaml`` row cites
an Atlas line number stale-by-exactly-1 (framing.problem_statement's own OQ-PROBLEMSTATEMENT-2,
framing.five_w_one_h's own OQ-FIVEW1H-1, and this method's own row -- fixed to 343 in the same commit that
built this file) is reframed here across 3 genuinely distinct candidate framings.

Demonstrates all three real invariants, each at BOTH layers:

1. ``FRAMESTORMING_TOO_FEW_CANDIDATES``: a single-candidate attempt is refused at CONSTRUCTION -- proves
   "at least 2 distinct candidates" is not toothless.
2. ``FRAMESTORMING_SELECTED_FRAME_NOT_FOUND``: a ``selected_frame_ref`` naming an id that was never generated
   is refused at CONSTRUCTION -- proves the core "selection must be traceable to a generated candidate"
   invariant is not toothless.
3. The same mismatch, re-derived independently: a hand-tampered COPY of a valid record, with
   ``selected_frame_ref`` overwritten to a non-existent id, bypasses the builder entirely -- the independent
   gate must catch it by re-deriving the candidate id set itself, never trusting the stored value.

Run::

    python -m ai_lego.apps.cli.run_frame_storming_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.framing.frame_storming import (
    METHOD_ID,
    all_gates_pass,
    candidate_framing,
    evaluate_frame_storming_gates,
    generate_frame_storming_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FRAMESTORMING-SYNTHETIC-001"
EXECUTION_ID = "EX-FRAMESTORMING-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-FRAMESTORMING-001"

S = {
    "frame_storming_record": "ai-lego://specs/cognitive/typed-objects/frame-storming-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-frame-storming-slice"


def run_frame_storming_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. framing.frame_storming resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- 3 genuinely distinct candidate framings of the same real
    # phenomenon, one selected and traceable to a generated candidate. Self-referential scenario, see module
    # docstring: this IS a real finding from this same build batch. ---
    candidates = [
        candidate_framing(
            "F-COPY",
            "這只是單次抄寫錯誤，逐列各自修正就好嗎？",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
            cluster="root-cause-framing",
        ),
        candidate_framing(
            "F-STRUCT",
            "是不是 method-inventory.yaml 建置當時的 Atlas 版本整段少了一列，導致往後全部列往前推一行？",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
            cluster="root-cause-framing",
        ),
        candidate_framing(
            "F-PROCESS",
            "現有『每個切片各自順手修一行』的流程，會不會讓同一份表永遠零星修不完，該不該換成一次性掃描腳本？",
            make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            cluster="process-framing",
        ),
    ]
    record = generate_frame_storming_record(
        "FS-2026-09-10-001",
        "method-inventory.yaml 的 F01 每一列引用的 Atlas 行號都跟真實行號差 1（本方法自己這列也是：line 342 應為 343）",
        candidates,
        "F-PROCESS",  # selected -- the process-level framing, matching the operator-owned open-question pattern every F01 sibling this batch already disclosed (OQ-PROBLEMSTATEMENT-2, OQ-FIVEW1H-1, OQ-FRAMESTORMING-1)
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        informs_boundary_critique_ref="BC-2026-09-10-001",
    )
    contracts.validate(S["frame_storming_record"], record, "frame storming record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "FrameStormingRecordGenerated", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_frame_storming_gates(record, "run_frame_storming_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"frame_storming gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("FRAMESTORMING_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant #1 is not toothless -- a single candidate framing MUST be refused before any
    # record is constructed ("storming" requires multiple). ---
    too_few_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_frame_storming_record(
            "FS-TOOFEW-001",
            "同一現象",
            [candidates[0]],
            "F-COPY",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "FRAMESTORMING_TOO_FEW_CANDIDATES" not in str(error):
            raise
        too_few_proof["raised"] = True
        too_few_proof["error_code"] = "FRAMESTORMING_TOO_FEW_CANDIDATES"
    if not too_few_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FRAMESTORMING_INVARIANT_NOT_ENFORCED: a single-candidate attempt was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TooFewCandidatesRefused", {"too_few_proof": too_few_proof}, 1.5)
    milestones.append("TOO_FEW_REFUSAL_PROVEN")

    # --- Step 3: proof invariant #2 (the core one) is not toothless -- a selected_frame_ref naming an id that
    # was never generated MUST be refused before any record is constructed. ---
    ungrounded_selection_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_frame_storming_record(
            "FS-UNGROUNDED-001",
            "同一現象",
            candidates,
            "F-NEVER-GENERATED",  # never appears in candidates -- a free-floating selection
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "FRAMESTORMING_SELECTED_FRAME_NOT_FOUND" not in str(error):
            raise
        ungrounded_selection_proof["raised"] = True
        ungrounded_selection_proof["error_code"] = "FRAMESTORMING_SELECTED_FRAME_NOT_FOUND"
    if not ungrounded_selection_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FRAMESTORMING_INVARIANT_NOT_ENFORCED: a selection ungrounded in any generated candidate was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "UngroundedSelectionRefused", {"ungrounded_selection_proof": ungrounded_selection_proof}, 1.7)
    milestones.append("UNGROUNDED_SELECTION_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches the same defect even when a caller
    # bypasses the builder entirely and hand-edits a valid record's own selected_frame_ref. ---
    tampered = copy.deepcopy(record)
    tampered["selected_frame_ref"] = "F-NEVER-GENERATED"  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_frame_storming_gates(tampered, "run_frame_storming_slice", clock.at(1.9))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("FRAMESTORMING_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered ungrounded selected_frame_ref")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.0)
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
        "too_few_proof": too_few_proof,
        "ungrounded_selection_proof": ungrounded_selection_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_problem_statement_slice.py)",
    }
    write_json(runtime / "results" / "frame_storming_slice_result.json", result)
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
        result = run_frame_storming_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS framing.frame_storming: FrameStormingRecord {result['record']['id']} built with "
        f"{len(result['record']['candidate_framings'])} candidate framings, selected_frame_ref={result['record']['selected_frame_ref']!r}, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"TOO_FEW_CANDIDATES invariant REFUSED a malformed attempt ({result['too_few_proof']['error_code']}); "
        f"SELECTED_FRAME_NOT_FOUND invariant REFUSED an ungrounded selection ({result['ungrounded_selection_proof']['error_code']}); "
        f"ungrounded-selection tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
