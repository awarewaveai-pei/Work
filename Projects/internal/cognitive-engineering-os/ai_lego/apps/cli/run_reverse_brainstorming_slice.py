"""``divergent.reverse_brainstorming`` vertical slice -- divergent ideation family, added
2026-09-18 alongside ``decision.eisenhower_matrix`` per direct operator request (see
``ai_lego/modules/divergent/reverse_brainstorming.py``'s own module docstring). Primary template:
``run_impact_effort_slice.py`` (read in full first) for overall CLI shape; this method's own
contract declares NO ``forbidden_transition`` (grep-confirmed: empty/absent), so unlike
``run_impact_effort_slice.py``/``run_eisenhower_matrix_slice.py`` there is no automatic-authority
demo step here -- nothing to demonstrate that the contract does not claim.

Builds a real reverse-brainstorming session for a customer-onboarding drop-off problem: 3
worsening ideas, 2 inverted into candidate solutions, 1 deliberately left pending (a legal,
incomplete-but-valid state per the module's own docstring). Then demonstrates the two real,
independently-enforced invariants are not toothless the same "show a real refusal, not only a
real success" discipline every sibling slice's CLI demo already establishes:
``REVERSEBRAINSTORM_DUPLICATE_IDEA_ID`` (a worsening idea id reused) and
``REVERSEBRAINSTORM_DANGLING_IDEA_REF`` (an inversion referencing a worsening idea id that does
not exist).

Run::

    python -m ai_lego.apps.cli.run_reverse_brainstorming_slice
"""

from __future__ import annotations

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
from ai_lego.modules.divergent.reverse_brainstorming import (
    METHOD_ID,
    all_gates_pass,
    evaluate_reverse_brainstorming_gates,
    generate_reverse_brainstorming_session,
    inversion,
    worsening_idea,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-REVERSEBRAINSTORM-SYNTHETIC-001"
EXECUTION_ID = "EX-REVERSEBRAINSTORM-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-REVERSEBRAINSTORM-001"

S = {
    "reverse_brainstorming_session": "ai-lego://specs/cognitive/typed-objects/reverse-brainstorming-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-reverse-brainstorming-slice"


def run_reverse_brainstorming_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real reverse-brainstorming session: 3 worsening ideas, 2 inverted, 1 left pending
    # (a legal, incomplete-but-valid state -- see module docstring). ---
    hyp = make_provenance("HYPOTHESIS", "AI_SUGGESTED")
    worsening_ideas = [
        worsening_idea("IDEA-1", "第一步就要求填 20 個欄位的表單", hyp),
        worsening_idea("IDEA-2", "完全不寄任何引導 email，讓使用者自己摸索", hyp),
        worsening_idea("IDEA-3", "把最有價值的功能藏在第三層選單裡", hyp),
    ]
    inversions = [
        inversion("IDEA-1", "只問 2 個必要欄位，其餘留到之後漸進收集", hyp),
        inversion("IDEA-2", "註冊後立即寄出 3 封分階段的引導 email", hyp),
        # IDEA-3 deliberately left uninverted -- inversion deferred to a later pass.
    ]
    record_provenance = make_provenance("HYPOTHESIS", "AI_SUGGESTED")
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_reverse_brainstorming_session,
        "REVERSEBRAINSTORM-2026-09-25-001",
        "新客戶 onboarding 流失率過高",
        worsening_ideas,
        record_provenance,
        inversions=inversions,
    )
    contracts.validate(S["reverse_brainstorming_session"], session, "reverse brainstorming session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ReverseBrainstormingSessionGenerated", {"reverse_brainstorming_session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_reverse_brainstorming_gates(session, "run_reverse_brainstorming_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"reverse brainstorming gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"REVERSEBRAINSTORM_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ReverseBrainstormingGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove both real invariants are not toothless: a duplicate worsening-idea id, and a
    # dangling inversion reference, each refused at construction. ---
    duplicate_id_blocked = False
    try:
        generate_reverse_brainstorming_session(
            "REVERSEBRAINSTORM-2026-09-25-TAMPER-001",
            "測試用問題陳述",
            [worsening_idea("DUP-1", "第一個版本", hyp), worsening_idea("DUP-1", "重複 id 的第二個版本", hyp)],
            record_provenance,
        )
    except InvariantViolation as error:
        duplicate_id_blocked = "REVERSEBRAINSTORM_DUPLICATE_IDEA_ID" in str(error)

    dangling_ref_blocked = False
    try:
        generate_reverse_brainstorming_session(
            "REVERSEBRAINSTORM-2026-09-25-TAMPER-002",
            "測試用問題陳述",
            [worsening_idea("REAL-1", "唯一一個真實 idea", hyp)],
            record_provenance,
            inversions=[inversion("DOES-NOT-EXIST", "指向不存在 id 的反轉", hyp)],
        )
    except InvariantViolation as error:
        dangling_ref_blocked = "REVERSEBRAINSTORM_DANGLING_IDEA_REF" in str(error)

    if not (duplicate_id_blocked and dangling_ref_blocked):
        raise InvariantViolation(
            f"REVERSEBRAINSTORM_INVARIANT_GUARD_DID_NOT_FIRE: duplicate_id_blocked={duplicate_id_blocked}, dangling_ref_blocked={dangling_ref_blocked} -- "
            "both real invariants must independently refuse the malformed input that violates them"
        )
    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ReverseBrainstormingInvariantsVerified",
        {"duplicate_id_blocked": duplicate_id_blocked, "dangling_ref_blocked": dangling_ref_blocked},
        1.3,
    )
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
        "reverse_brainstorming_session": session,
        "gate_results": gate_results,
        "invariant_verification": {"duplicate_id_blocked": duplicate_id_blocked, "dangling_ref_blocked": dangling_ref_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_impact_effort_slice.py)",
    }
    write_json(runtime / "results" / "reverse_brainstorming_slice_result.json", result)
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
        result = run_reverse_brainstorming_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    session = result["reverse_brainstorming_session"]
    idea_summary = ", ".join(i["id"] for i in session["worsening_ideas"])
    inversion_summary = ", ".join(i["worsening_idea_ref"] for i in session["inversions"])
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["invariant_verification"]
    print(
        f"PASS divergent.reverse_brainstorming: worsening_ideas=[{idea_summary}], inverted=[{inversion_summary}], gates [{gate_summary}], "
        f"invariants_verified(duplicate_id={v['duplicate_id_blocked']}, dangling_ref={v['dangling_ref_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
