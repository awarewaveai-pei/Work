"""``divergent.six_three_five`` vertical slice -- F03 divergent-ideation family, one of 10 agents opening
independent F03 members in this same parallel batch (see ``run_mece_slice.py`` for the sibling-slice CLI
style this reuses).

Scenario: a 4-participant brainwriting session (Atlas's own '人數可調整' caution -- headcount NOT hardcoded
to 6), 2 sheets, each fully rotated. Step 1 builds a real, well-formed ``SixThreeFiveSession`` (both real
invariants hold). Steps 2-4 demonstrate the three real REFUSALS this method enforces: a round with 2 ideas
instead of 3, a round with 4 ideas instead of 3, and a sheet missing one participant's own rotation turn
(with another appearing twice). Step 5 hand-tampers a VALID record directly (bypassing the builder) to prove
the independent gate, not just the builder, catches a stored session that disagrees with fresh
re-derivation.

Run::

    python -m ai_lego.apps.cli.run_six_three_five_slice
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
from ai_lego.modules.divergent.six_three_five import (
    METHOD_ID,
    all_gates_pass,
    evaluate_six_three_five_gates,
    evaluate_six_three_five_integrity_gate,
    generate_six_three_five_session,
    round_entry,
    sheet,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SIXTHREEFIVE-SYNTHETIC-001"
EXECUTION_ID = "EX-SIXTHREEFIVE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SIXTHREEFIVE-001"

S = {
    "session": "ai-lego://specs/cognitive/typed-objects/six-three-five-session.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

PARTICIPANTS = ["P1", "P2", "P3", "P4"]
# 4, NOT 6 -- deliberately proves headcount is NOT hardcoded (Atlas's own F03 row caution, "人數可調整").


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-six-three-five-slice"


def _clean_sheets() -> list[dict[str, Any]]:
    """2 sheets, each fully rotated through all 4 PARTICIPANTS (a different rotation ORDER per sheet, same
    "order doesn't matter to the invariant, only the multiset does" fact ``_sheet_rotation_is_complete``'s
    own docstring establishes) -- every round carrying exactly 3 ideas."""
    return [
        sheet(
            "SHEET-A",
            [
                round_entry(1, "P1", ["idea-a1", "idea-a2", "idea-a3"]),
                round_entry(2, "P2", ["idea-a4", "idea-a5", "idea-a6"]),
                round_entry(3, "P3", ["idea-a7", "idea-a8", "idea-a9"]),
                round_entry(4, "P4", ["idea-a10", "idea-a11", "idea-a12"]),
            ],
        ),
        sheet(
            "SHEET-B",
            [
                round_entry(1, "P2", ["idea-b1", "idea-b2", "idea-b3"]),
                round_entry(2, "P3", ["idea-b4", "idea-b5", "idea-b6"]),
                round_entry(3, "P4", ["idea-b7", "idea-b8", "idea-b9"]),
                round_entry(4, "P1", ["idea-b10", "idea-b11", "idea-b12"]),
            ],
        ),
    ]


def run_six_three_five_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. divergent.six_three_five resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: a clean, well-formed 4-participant session -- both real invariants hold. ---
    clean_sheets = _clean_sheets()
    descriptor, clean_session = catalog.invoke(
        METHOD_ID,
        generate_six_three_five_session,
        "SIXTHREEFIVE-2026-09-11-001",
        PARTICIPANTS,
        clean_sheets,
        make_provenance("AI_SUGGESTION", "AI_GENERATED"),
    )
    contracts.validate(S["session"], clean_session, "six-three-five session (clean)")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SixThreeFiveSessionGenerated", {"session": clean_session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_six_three_five_gates(clean_session, "run_six_three_five_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"divergent.six_three_five gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("SIXTHREEFIVE_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: the real REFUSAL for TOO FEW ideas (2 instead of 3) -- MUST be refused before any record is
    # constructed. ---
    too_few_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        round_entry(1, "P1", ["only-one", "only-two"])
    except InvariantViolation as error:
        if "SIXTHREEFIVE_INVALID_IDEAS_COUNT" not in str(error):
            raise
        too_few_refusal_proof["raised"] = True
        too_few_refusal_proof["error_code"] = "SIXTHREEFIVE_INVALID_IDEAS_COUNT"
    if not too_few_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SIXTHREEFIVE_INVARIANT_NOT_ENFORCED: a 2-idea round was NOT refused -- the invariant is toothless")
    milestones.append("TOO_FEW_IDEAS_REFUSAL_PROVEN")

    # --- Step 3: the real REFUSAL for TOO MANY ideas (4 instead of 3). ---
    too_many_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        round_entry(1, "P1", ["one", "two", "three", "four"])
    except InvariantViolation as error:
        if "SIXTHREEFIVE_INVALID_IDEAS_COUNT" not in str(error):
            raise
        too_many_refusal_proof["raised"] = True
        too_many_refusal_proof["error_code"] = "SIXTHREEFIVE_INVALID_IDEAS_COUNT"
    if not too_many_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SIXTHREEFIVE_INVARIANT_NOT_ENFORCED: a 4-idea round was NOT refused -- the invariant is toothless")
    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "IdeaCountRefusalsProven",
        {"too_few": too_few_refusal_proof, "too_many": too_many_refusal_proof},
        1.3,
    )
    milestones.append("TOO_MANY_IDEAS_REFUSAL_PROVEN")

    # --- Step 4: the real REFUSAL for an INCOMPLETE ROTATION -- SHEET-C is missing P4 entirely and has P1
    # appearing twice instead (same total round count, so this is genuinely a rotation defect, not just a
    # short sheet). ---
    incomplete_sheets = [
        sheet(
            "SHEET-C",
            [
                round_entry(1, "P1", ["x1", "x2", "x3"]),
                round_entry(2, "P2", ["x4", "x5", "x6"]),
                round_entry(3, "P3", ["x7", "x8", "x9"]),
                round_entry(4, "P1", ["x10", "x11", "x12"]),  # P1 twice, P4 never -- incomplete rotation
            ],
        )
    ]
    incomplete_rotation_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_six_three_five_session("SIXTHREEFIVE-INCOMPLETE-REFUSED-001", PARTICIPANTS, incomplete_sheets, make_provenance("AI_SUGGESTION", "AI_GENERATED"))
    except InvariantViolation as error:
        if "SIXTHREEFIVE_INCOMPLETE_ROTATION" not in str(error):
            raise
        incomplete_rotation_refusal_proof["raised"] = True
        incomplete_rotation_refusal_proof["error_code"] = "SIXTHREEFIVE_INCOMPLETE_ROTATION"
    if not incomplete_rotation_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SIXTHREEFIVE_INVARIANT_NOT_ENFORCED: a sheet missing one participant's rotation was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompleteRotationRefused", {"refusal_proof": incomplete_rotation_refusal_proof}, 1.7)
    milestones.append("INCOMPLETE_ROTATION_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (flips SHEET-A's own stored contributor_id so P4 appears twice and P1 never
    # appears, on the deliberately-clean Step 1 record). ---
    tampered = copy.deepcopy(clean_session)
    tampered["sheets"][0]["rounds"][0]["contributor_id"] = "P4"  # was "P1" -- now P4 appears twice on SHEET-A, P1 never
    tampered_gate = evaluate_six_three_five_gates(tampered, "run_six_three_five_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("SIXTHREEFIVE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered session with a broken rotation")
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
        "clean_session": clean_session,
        "gate_results": gate_results,
        "too_few_ideas_refusal_proof": too_few_refusal_proof,
        "too_many_ideas_refusal_proof": too_many_refusal_proof,
        "incomplete_rotation_refusal_proof": incomplete_rotation_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_mece_slice.py)",
    }
    write_json(runtime / "results" / "six_three_five_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_six_three_five_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS divergent.six_three_five: SixThreeFiveSession {result['clean_session']['id']} built clean "
        f"({len(result['clean_session']['participant_ids'])} participants, {len(result['clean_session']['sheets'])} sheets, "
        f"every sheet fully rotated), gates [{gate_summary}]; "
        f"2-idea round REFUSED ({result['too_few_ideas_refusal_proof']['error_code']}); "
        f"4-idea round REFUSED ({result['too_many_ideas_refusal_proof']['error_code']}); "
        f"incomplete-rotation sheet REFUSED ({result['incomplete_rotation_refusal_proof']['error_code']}); "
        f"hand-tampered session caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
