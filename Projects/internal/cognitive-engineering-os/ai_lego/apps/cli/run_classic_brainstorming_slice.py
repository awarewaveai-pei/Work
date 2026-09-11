"""``divergent.classic_brainstorming`` vertical slice -- F03 divergent ideation family, opening member (1 of 10
agents opening this family in one parallel batch, disjoint files, no shared state with any sibling
``divergent.*`` slice).

Scenario: a brainstorming session on "如何提升行動 App 的使用者留存率" (how to raise a mobile app's user
retention) -- same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed
``ClassicBrainstormingSession`` with 4 generated ideas and 2 evaluations referencing real idea ids, then
demonstrates each of this method's real invariants:

* a pure-generation session (``evaluations: []``) is a LEGAL state, not a refusal -- Atlas's own procedure
  places evaluation last and separate ("最後評估"); a session that has only generated ideas so far is exactly
  what the method's own ordering describes mid-flow.
* invariant #1 (idea id uniqueness) -- a duplicate idea id spliced into ``ideas`` MUST be refused before any
  record is constructed (a prerequisite for idea_ref resolution to be meaningful at all).
* invariant #2 (idea referential integrity) -- an evaluation naming an idea id that does not exist anywhere in
  ``ideas`` MUST be refused before any record is constructed (THE real differentiator this method contract
  exists to enforce -- directly grounded in Atlas's own "先禁止批判→追數量→延伸→最後評估" ordering).

A final step hand-tampers a VALID record directly (bypassing the builder) to prove the independent
``idea_referential_integrity`` gate, not just the builder, catches a dangling reference introduced after
construction -- same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo
already establishes.

Run::

    python -m ai_lego.apps.cli.run_classic_brainstorming_slice
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
from ai_lego.modules.divergent.classic_brainstorming import (
    METHOD_ID,
    all_gates_pass,
    evaluate_classic_brainstorming_gates,
    evaluation,
    generate_classic_brainstorming_session,
    idea,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BRAINSTORM-SYNTHETIC-001"
EXECUTION_ID = "EX-BRAINSTORM-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BRAINSTORM-001"

S = {
    "classic_brainstorming_session": "ai-lego://specs/cognitive/typed-objects/classic-brainstorming-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-classic-brainstorming-slice"


def _well_formed_ideas() -> list[dict[str, Any]]:
    return [
        idea("IDEA-1", "推出訂閱制而非一次性買斷", make_provenance("AI_SUGGESTION", "AI_GENERATED")),
        idea("IDEA-2", "新增每日登入獎勵機制", make_provenance("AI_SUGGESTION", "AI_GENERATED")),
        idea("IDEA-3", "推播個人化使用建議", make_provenance("AI_SUGGESTION", "AI_GENERATED")),
        idea("IDEA-4", "開放使用者自訂主題色", make_provenance("AI_SUGGESTION", "AI_GENERATED")),
    ]


def _well_formed_evaluations() -> list[dict[str, Any]]:
    return [
        evaluation("IDEA-1", "keep", "現金流可預測，符合本季度目標"),
        evaluation("IDEA-2", "keep", "實作成本低，可快速上線驗證"),
    ]


def run_classic_brainstorming_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. divergent.classic_brainstorming resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed session -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_classic_brainstorming_session,
        "BRAINSTORM-2026-09-11-001",
        _well_formed_ideas(),
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        evaluations=_well_formed_evaluations(),
    )
    contracts.validate(S["classic_brainstorming_session"], session, "classic brainstorming session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ClassicBrainstormingSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_classic_brainstorming_gates(session, "run_classic_brainstorming_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"divergent.classic_brainstorming gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("BRAINSTORM_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: a pure-generation session (evaluations: []) is a LEGAL state, not a refusal -- Atlas's own
    # ordering places evaluation last and separate; deferring it entirely is a legal mid-flow state. ---
    pure_generation_session = generate_classic_brainstorming_session(
        "BRAINSTORM-2026-09-11-002",
        _well_formed_ideas(),
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    contracts.validate(S["classic_brainstorming_session"], pure_generation_session, "classic brainstorming session (pure generation, no evaluations yet)")
    if pure_generation_session["evaluations"] != []:
        milestones.append("BLOCKED")
        raise InvariantViolation("BRAINSTORM_DEMO_SETUP_WRONG: expected an empty evaluations list by default")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PureGenerationSessionAcceptedAsLegal", {"session": pure_generation_session}, 1.2)
    milestones.append("PURE_GENERATION_ACCEPTED_AS_LEGAL")

    # --- Step 3: proof invariant #1 (idea id uniqueness) is not toothless -- a duplicate idea id spliced into
    # ideas MUST be refused before any record is constructed. ---
    duplicate_id_ideas = [
        idea("IDEA-DUP", "第一個想法", make_provenance("AI_SUGGESTION", "AI_GENERATED")),
        idea("IDEA-DUP", "意外重複 id 的第二個想法", make_provenance("AI_SUGGESTION", "AI_GENERATED")),
    ]
    duplicate_id_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_classic_brainstorming_session("BRAINSTORM-DUPLICATE-REFUSED-001", duplicate_id_ideas, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "BRAINSTORM_DUPLICATE_IDEA_ID" not in str(error):
            raise
        duplicate_id_refusal_proof["raised"] = True
        duplicate_id_refusal_proof["error_code"] = "BRAINSTORM_DUPLICATE_IDEA_ID"
    if not duplicate_id_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BRAINSTORM_INVARIANT_NOT_ENFORCED: a duplicate idea id was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DuplicateIdeaIdRefused", {"refusal_proof": duplicate_id_refusal_proof}, 1.3)
    milestones.append("DUPLICATE_ID_REFUSAL_PROVEN")

    # --- Step 4: proof invariant #2 (idea referential integrity) is not toothless -- an evaluation naming an
    # idea id that does not exist anywhere in ideas MUST be refused before any record is constructed. ---
    dangling_evaluations = [evaluation("IDEA-DOES-NOT-EXIST", "keep", "此評估指向一個不存在的想法")]
    dangling_ref_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_classic_brainstorming_session(
            "BRAINSTORM-DANGLING-REFUSED-001",
            _well_formed_ideas(),
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
            evaluations=dangling_evaluations,
        )
    except InvariantViolation as error:
        if "BRAINSTORM_DANGLING_IDEA_REF" not in str(error):
            raise
        dangling_ref_refusal_proof["raised"] = True
        dangling_ref_refusal_proof["error_code"] = "BRAINSTORM_DANGLING_IDEA_REF"
    if not dangling_ref_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BRAINSTORM_INVARIANT_NOT_ENFORCED: a dangling idea_ref was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DanglingIdeaRefRefused", {"refusal_proof": dangling_ref_refusal_proof}, 1.5)
    milestones.append("DANGLING_REF_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a dangling evaluation directly into a VALID record's own raw dict, after
    # construction). ---
    tampered = dict(session)
    tampered["evaluations"] = [
        *session["evaluations"],
        {"idea_ref": "IDEA-GHOST", "verdict": "keep", "rationale": "建構後直接插入、繞過 builder 的懸空參照"},
    ]
    tampered_gate = evaluate_classic_brainstorming_gates(tampered, "run_classic_brainstorming_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("BRAINSTORM_GATE_NOT_INDEPENDENT: the independent idea_referential_integrity gate did NOT catch a hand-tampered dangling idea_ref")
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
        "pure_generation_session": pure_generation_session,
        "gate_results": gate_results,
        "duplicate_id_refusal_proof": duplicate_id_refusal_proof,
        "dangling_ref_refusal_proof": dangling_ref_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "classic_brainstorming_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_classic_brainstorming_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS divergent.classic_brainstorming: ClassicBrainstormingSession {result['session']['id']} built with "
        f"{len(result['session']['ideas'])} ideas and {len(result['session']['evaluations'])} evaluations, gates [{gate_summary}]; "
        f"a pure-generation session (0 evaluations) ACCEPTED as legal; "
        f"BRAINSTORM_DUPLICATE_IDEA_ID/BRAINSTORM_DANGLING_IDEA_REF invariants each REFUSED a malformed attempt "
        f"({result['duplicate_id_refusal_proof']['error_code']}, {result['dangling_ref_refusal_proof']['error_code']}); "
        f"hand-tampered dangling idea_ref caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
