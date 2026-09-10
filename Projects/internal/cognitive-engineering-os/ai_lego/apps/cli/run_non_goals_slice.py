"""``framing.non_goals`` vertical slice -- 1st Method Atlas slice from the brand-new ``framing`` family (F01),
alongside ``framing.goal_statement`` built concurrently this same batch. See
``ai_lego.modules.framing.non_goals``'s own module docstring for the full due-diligence read (verified, not
merely repeated, distinction from decision.moscow's WONT bucket; confirmed absence from Atlas §22.3's
automatic-authority gate table).

Self-referential scenario, same class ``run_moscow_slice.py`` already establishes (the demo IS the thing it
demonstrates, not an invented business scenario): this very F01 framing family build batch's own excluded
scope, directly citing Atlas's own "最佳搭配" pairing for Non-goals (WBS -- unbuilt, excluded here for real)
and cross-referencing decision.moscow's own demo WONT item (MOSCOW-001-I6, "GraphQL API wrapper around the
CLI") through ``related_moscow_wont_ref`` -- a genuine, traceable example of the exact soft-link this slice's
own contract adds to resolve OQ-MOSCOW-1.

Then proves BOTH headline invariants are real, at BOTH layers:

1. Pipeline completeness (``NONGOALS_EMPTY_REREVIEW_TRIGGER``): a hand-crafted entry missing
   re_review_trigger -- the field that is this method's own differentiator from MoSCoW's WONT bucket -- must
   be refused at CONSTRUCTION. A copy of the valid record with one entry's stored re_review_trigger stripped
   must be caught independently at the GATE layer.
2. Item-id uniqueness (``NONGOALS_DUPLICATE_ITEM_ID``): a hand-crafted second entry reusing an existing
   entry's id must be refused at CONSTRUCTION. A copy of the valid record with one entry's stored id
   overwritten to collide with another must be caught independently at the GATE layer.

Run::

    python -m ai_lego.apps.cli.run_non_goals_slice
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
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.framing.non_goals import (
    METHOD_ID,
    all_gates_pass,
    entries_with_moscow_ref,
    evaluate_non_goals_gates,
    evaluate_non_goals_integrity_gate,
    excluded_scope_entry,
    generate_non_goals_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-NONGOALS-SYNTHETIC-001"
EXECUTION_ID = "EX-NONGOALS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-NONGOALS-001"

S = {
    "non_goals_record": "ai-lego://specs/cognitive/typed-objects/non-goals-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-non-goals-slice"


def run_non_goals_slice(config: SliceConfig) -> dict[str, Any]:
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

    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Self-referential scenario (disclosed): this F01 framing family build batch's own excluded scope.
    # NG-001 soft-links decision.moscow's own demo WONT item (MOSCOW-001-I6) -- a real, traceable example of
    # the exact cross-reference this slice's own contract adds to resolve OQ-MOSCOW-1. NG-002 transcribes
    # Atlas's own "最佳搭配" WBS pairing, genuinely excluded (unbuilt F02 sibling, out of this task's scope). ---
    entries = [
        excluded_scope_entry(
            "NG-001",
            "即時多人協作編輯（多人同時編輯同一份 record）",
            "本批次目標是單人 R0/R4 驗證管線，非即時協作系統",
            "第二個真實使用者需要同時寫入同一份 record 時，重新評估",
            make_provenance("DECISION", "HUMAN_APPROVED"),
            related_moscow_wont_ref="MOSCOW-001-I6",
        ),
        excluded_scope_entry(
            "NG-002",
            "WBS（F02 Work Breakdown Structure，尚未建置）",
            "Atlas 最佳搭配欄位所指的另一個 F02 method，本任務範疇明確排除",
            "F02 WBS mint 出 machine_id 且有真實整合需求時",
            make_provenance("DECISION", "HUMAN_APPROVED"),
        ),
    ]
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_non_goals_record,
        "NONGOALS-2026-09-08-001",
        "Cognitive OS Method Atlas F01 framing family build batch, 2026-09-08",
        entries,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["non_goals_record"], record, "framing.non_goals slice deliverable-set record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NonGoalsRecordGenerated", {"non_goals_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_non_goals_gates(record, "run_non_goals_slice", clock.at(1.1))
    for g in gate_results:
        contracts.validate(S["gate_result"], g, f"non_goals gate {g['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"NONGOALS_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NonGoalsGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Real derived view: entries_with_moscow_ref, recomputed fresh -- exactly NG-001. ---
    moscow_ref_ids = entries_with_moscow_ref(record)
    if moscow_ref_ids != ["NG-001"]:
        raise InvariantViolation(f"NONGOALS_MOSCOW_REF_VIEW_UNEXPECTED: expected ['NG-001'], got {moscow_ref_ids}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NonGoalsMoscowRefViewComputed", {"entries_with_moscow_ref": moscow_ref_ids}, 1.3)

    # --- Prove invariant #1 (pipeline completeness) is real at the CONSTRUCTION layer: a hand-crafted entry
    # missing re_review_trigger -- the field that differentiates this method from MoSCoW's WONT bucket --
    # must be refused. ---
    rereview_construction_blocked = False
    try:
        unreviewed = {
            "id": "NG-003",
            "scope_item": "some out-of-scope idea",
            "reason": "not worth doing now",
            "re_review_trigger": "",  # present but BLANK -- MoSCoW's WONT bucket would already accept this omitted entirely; Non-goals must not accept it blank either
            "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        }
        generate_non_goals_record("NONGOALS-2026-09-08-002", "some project", [unreviewed], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        rereview_construction_blocked = "NONGOALS_EMPTY_REREVIEW_TRIGGER" in str(error)
    if not rereview_construction_blocked:
        raise InvariantViolation("NONGOALS_INVARIANT_GUARD_DID_NOT_FIRE: an entry with no re_review_trigger was accepted (or a different guard fired instead)")

    # --- Prove invariant #2 (id uniqueness) is real at the CONSTRUCTION layer: a second entry reusing an
    # existing id must be refused. ---
    duplicate_id_construction_blocked = False
    try:
        duplicated = excluded_scope_entry("NG-001", "a different scope item entirely", "a different reason", "a different trigger", make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
        generate_non_goals_record("NONGOALS-2026-09-08-003", "some project", [entries[0], duplicated], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        duplicate_id_construction_blocked = "NONGOALS_DUPLICATE_ITEM_ID" in str(error)
    if not duplicate_id_construction_blocked:
        raise InvariantViolation("NONGOALS_INVARIANT_GUARD_DID_NOT_FIRE: a duplicate excluded_scope id was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: hand-tampered
    # copies of the already-valid record must still be caught. ---
    tampered_rereview = copy.deepcopy(record)
    tampered_rereview["excluded_scope"][0]["re_review_trigger"] = ""  # NG-001, bypassing the constructor entirely
    rereview_gate_result = evaluate_non_goals_integrity_gate(tampered_rereview, "run_non_goals_slice", clock.at(1.4))
    rereview_gate_blocked = rereview_gate_result["status"] == "FAIL" and rereview_gate_result["evidence"][0]["reason"] == "NONGOALS_EMPTY_REREVIEW_TRIGGER"
    if not rereview_gate_blocked:
        raise InvariantViolation(
            f"NONGOALS_GATE_GUARD_DID_NOT_FIRE: non_goals_integrity did not flag the hand-tampered missing re_review_trigger "
            f"(status={rereview_gate_result['status']}, evidence={rereview_gate_result['evidence']})"
        )

    tampered_duplicate = copy.deepcopy(record)
    tampered_duplicate["excluded_scope"][1]["id"] = tampered_duplicate["excluded_scope"][0]["id"]  # collide NG-002 into NG-001
    duplicate_gate_result = evaluate_non_goals_integrity_gate(tampered_duplicate, "run_non_goals_slice", clock.at(1.5))
    duplicate_gate_blocked = duplicate_gate_result["status"] == "FAIL" and duplicate_gate_result["evidence"][0]["reason"] == "duplicate excluded_scope id"
    if not duplicate_gate_blocked:
        raise InvariantViolation(
            f"NONGOALS_GATE_GUARD_DID_NOT_FIRE: non_goals_integrity did not flag the hand-tampered duplicate id "
            f"(status={duplicate_gate_result['status']}, evidence={duplicate_gate_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "NonGoalsInvariantVerified",
        {
            "rereview_construction_blocked": rereview_construction_blocked,
            "rereview_gate_blocked": rereview_gate_blocked,
            "duplicate_id_construction_blocked": duplicate_id_construction_blocked,
            "duplicate_id_gate_blocked": duplicate_gate_blocked,
        },
        1.6,
    )
    milestones.append("VERIFYING")
    ledger.close_aggregate(AGGREGATE_ID)

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "non_goals_record": record,
        "gate_results": gate_results,
        "entries_with_moscow_ref": moscow_ref_ids,
        "invariant_verification": {
            "rereview_construction_blocked": rereview_construction_blocked,
            "rereview_gate_blocked": rereview_gate_blocked,
            "duplicate_id_construction_blocked": duplicate_id_construction_blocked,
            "duplicate_id_gate_blocked": duplicate_gate_blocked,
        },
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_moscow_slice.py)",
    }
    write_json(runtime / "results" / "non_goals_slice_result.json", result)
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
        result = run_non_goals_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS framing.non_goals: gates [{gate_summary}], entries_with_moscow_ref={result['entries_with_moscow_ref']}, "
        f"rereview_trigger(construction={v['rereview_construction_blocked']}, gate={v['rereview_gate_blocked']}), "
        f"duplicate_id(construction={v['duplicate_id_construction_blocked']}, gate={v['duplicate_id_gate_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
