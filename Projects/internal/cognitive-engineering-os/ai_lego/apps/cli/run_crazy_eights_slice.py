"""``divergent.crazy_eights`` vertical slice -- F03 divergent-ideation family, 1st member, opening the family
(no prior F03 sibling slice exists to pattern-match against; ``run_ansoff_slice.py`` is the primary structural
template read in full, closest sibling: a closed, fixed-count vocabulary with completeness+uniqueness
required).

Scenario: a Crazy 8s session sketching 8 different checkout-flow redesign concepts -- same synthetic style
every sibling slice's CLI demo uses. Builds a real, well-formed ``CrazyEightsSession`` covering all 8 box
numbers with 8 genuinely distinct sketches, then demonstrates each of the 2 real invariants as a
construction-time REFUSAL: a 7-concept set (missing box 8), a 9-concept set (a 9th duplicate box number), and
a duplicated sketch_description across two boxes -- proving none is toothless, same "show a real refusal, not
only a real success" discipline every sibling slice's CLI demo already establishes. A final step hand-tampers
a VALID record directly (bypassing the builder) to prove the independent gate, not just the builder, catches
the same defect.

Run::

    python -m ai_lego.apps.cli.run_crazy_eights_slice
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
from ai_lego.modules.divergent.crazy_eights import (
    METHOD_ID,
    all_gates_pass,
    concept_entry,
    evaluate_crazy_eights_gates,
    generate_crazy_eights_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-CRAZY8-SYNTHETIC-001"
EXECUTION_ID = "EX-CRAZY8-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-CRAZY8-001"

S = {
    "crazy_eights_session": "ai-lego://specs/cognitive/typed-objects/crazy-eights-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-crazy-eights-slice"


def _well_formed_concepts() -> list[dict[str, Any]]:
    descriptions = [
        "單頁結帳，所有欄位攤平在同一畫面",
        "分 3 步驟精靈式結帳，每步只問一件事",
        "側邊抽屜式結帳，商品頁不跳轉",
        "先付款後填地址，降低放棄率",
        "純語音輸入的結帳流程，無需打字",
        "以聊天機器人問答方式完成結帳",
        "掃碼在實體店取貨，線上只需選規格",
        "訂閱制自動續購，首次之後完全免結帳",
    ]
    return [concept_entry(box_number, description) for box_number, description in enumerate(descriptions, start=1)]


def run_crazy_eights_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. divergent.crazy_eights resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    session_provenance = make_provenance("HYPOTHESIS", "AI_SUGGESTED")

    # --- Step 1: the complete, well-formed session -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_crazy_eights_session,
        "CRAZY8-2026-09-11-001",
        _well_formed_concepts(),
        session_provenance,
    )
    contracts.validate(S["crazy_eights_session"], session, "crazy eights session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CrazyEightsSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_crazy_eights_gates(session, "run_crazy_eights_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"divergent.crazy_eights gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("CRAZY8_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (completeness) is not toothless -- a 7-concept set (missing box 8) MUST be
    # refused before any record is constructed. ---
    seven_concepts = _well_formed_concepts()[:7]  # drops box_number 8
    seven_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_crazy_eights_session("CRAZY8-SEVEN-REFUSED-001", seven_concepts, session_provenance)
    except InvariantViolation as error:
        if "CRAZY8_INCOMPLETE_CONCEPT_SET" not in str(error):
            raise
        seven_refusal_proof["raised"] = True
        seven_refusal_proof["error_code"] = "CRAZY8_INCOMPLETE_CONCEPT_SET"
    if not seven_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CRAZY8_INVARIANT_NOT_ENFORCED: a 7-concept set missing box_number 8 was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SevenConceptSetRefused", {"refusal_proof": seven_refusal_proof}, 1.2)
    milestones.append("SEVEN_CONCEPT_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 1 also refuses a 9-concept set (a 9th entry duplicating box_number 1). ---
    nine_concepts = _well_formed_concepts() + [concept_entry(1, "第 9 個重複 box_number 的多餘方案")]
    nine_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_crazy_eights_session("CRAZY8-NINE-REFUSED-001", nine_concepts, session_provenance)
    except InvariantViolation as error:
        if "CRAZY8_INCOMPLETE_CONCEPT_SET" not in str(error):
            raise
        nine_refusal_proof["raised"] = True
        nine_refusal_proof["error_code"] = "CRAZY8_INCOMPLETE_CONCEPT_SET"
    if not nine_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CRAZY8_INVARIANT_NOT_ENFORCED: a 9-concept set with a duplicated box_number was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NineConceptSetRefused", {"refusal_proof": nine_refusal_proof}, 1.3)
    milestones.append("NINE_CONCEPT_REFUSAL_PROVEN")

    # --- Step 4: proof invariant 2 (pairwise distinctness) is not toothless -- box 2's sketch_description
    # copied verbatim onto box 1 (both boxes otherwise legally shaped) MUST be refused. ---
    duplicate_description_concepts = _well_formed_concepts()
    duplicate_description_concepts[0] = {**duplicate_description_concepts[0], "sketch_description": duplicate_description_concepts[1]["sketch_description"]}
    duplicate_description_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_crazy_eights_session("CRAZY8-DUPDESC-REFUSED-001", duplicate_description_concepts, session_provenance)
    except InvariantViolation as error:
        if "CRAZY8_DUPLICATE_SKETCH_DESCRIPTION" not in str(error):
            raise
        duplicate_description_refusal_proof["raised"] = True
        duplicate_description_refusal_proof["error_code"] = "CRAZY8_DUPLICATE_SKETCH_DESCRIPTION"
    if not duplicate_description_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("CRAZY8_INVARIANT_NOT_ENFORCED: a duplicated sketch_description across two boxes was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DuplicateSketchDescriptionRefused", {"refusal_proof": duplicate_description_refusal_proof}, 1.5)
    milestones.append("DUPLICATE_DESCRIPTION_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (drops box 8 from a raw copy of an already-valid record, duplicating box 1 in its
    # place). ---
    tampered = dict(session)
    tampered["concepts"] = [c for c in session["concepts"] if c["box_number"] != 8] + [session["concepts"][0]]  # bypasses the builder directly
    tampered_gate = evaluate_crazy_eights_gates(tampered, "run_crazy_eights_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("CRAZY8_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered incomplete concept set")
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
        "seven_concept_refusal_proof": seven_refusal_proof,
        "nine_concept_refusal_proof": nine_refusal_proof,
        "duplicate_description_refusal_proof": duplicate_description_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_ansoff_slice.py)",
    }
    write_json(runtime / "results" / "crazy_eights_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_crazy_eights_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS divergent.crazy_eights: CrazyEightsSession {result['session']['id']} built, "
        f"gates [{gate_summary}]; "
        f"CRAZY8_INCOMPLETE_CONCEPT_SET (7-item)/CRAZY8_INCOMPLETE_CONCEPT_SET (9-item)/CRAZY8_DUPLICATE_SKETCH_DESCRIPTION invariants each REFUSED a malformed attempt "
        f"({result['seven_concept_refusal_proof']['error_code']}, {result['nine_concept_refusal_proof']['error_code']}, {result['duplicate_description_refusal_proof']['error_code']}); "
        f"hand-tampered incomplete concept set caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
