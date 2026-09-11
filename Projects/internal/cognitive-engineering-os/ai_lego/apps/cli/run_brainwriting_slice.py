"""``divergent.brainwriting`` vertical slice -- F03 divergent-ideation family, FIRST member (family
previously entirely unbuilt; see the module's own docstring for the Atlas §12.9 grounding).

Scenario: a Brainwriting session with 3 distinct contributors submitting 4 independent ideas, merged
into 2 shared themes -- same synthetic style every sibling slice's CLI demo uses. Builds a real,
well-formed ``BrainwritingSession``, then demonstrates each of the 2 real invariants once as a
construction-time REFUSAL (all contributions from a single contributor_id -- contributor-diversity
invariant; a merged idea referencing a nonexistent contribution id -- referential-integrity
invariant), proving neither is toothless, same "show a real refusal, not only a real success"
discipline every sibling slice's CLI demo already establishes. A final pair of steps hand-tamper a
VALID record directly (bypassing the builder) to prove the independent gate, not just the builder,
catches the same defect class: collapsing all contributions onto one contributor_id, and a dangling
source_contribution_ref.

Run::

    python -m ai_lego.apps.cli.run_brainwriting_slice
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
from ai_lego.modules.divergent.brainwriting import (
    METHOD_ID,
    all_gates_pass,
    evaluate_brainwriting_gates,
    generate_brainwriting_session,
    individual_contribution,
    merged_idea,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BRAINWRITING-SYNTHETIC-001"
EXECUTION_ID = "EX-BRAINWRITING-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BRAINWRITING-001"

S = {
    "brainwriting_session": "ai-lego://specs/cognitive/typed-objects/brainwriting-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-brainwriting-slice"


def _well_formed_contributions() -> list[dict[str, Any]]:
    return [
        individual_contribution("IC-1", "user-alice", "推出訂閱制方案，降低客戶進入門檻", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
        individual_contribution("IC-2", "user-bob", "按月訂閱搭配前三個月折扣", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
        individual_contribution("IC-3", "user-carol", "開放企業客戶客製化議價", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
        individual_contribution("IC-4", "user-alice", "提供年繳方案並附加額外服務", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
    ]


def _well_formed_merged_ideas() -> list[dict[str, Any]]:
    return [
        merged_idea("MI-1", ["IC-1", "IC-2", "IC-4"]),
        merged_idea("MI-2", ["IC-3"]),
    ]


def run_brainwriting_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. divergent.brainwriting resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism
    # every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed session -- both real invariants satisfied, invoked
    # through the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_brainwriting_session,
        "BRAINWRITE-2026-09-11-001",
        _well_formed_contributions(),
        _well_formed_merged_ideas(),
    )
    contracts.validate(S["brainwriting_session"], session, "brainwriting session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BrainwritingSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_brainwriting_gates(session, "run_brainwriting_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"divergent.brainwriting gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("BRAINWRITE_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (contributor diversity) is not toothless -- collapsing every
    # contribution onto a single contributor_id MUST be refused before any record is constructed. ---
    single_voice_contributions = [
        individual_contribution("IC-1", "user-alice", "推出訂閱制方案，降低客戶進入門檻", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
        individual_contribution("IC-2", "user-alice", "按月訂閱搭配前三個月折扣", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
    ]  # both entries share contributor_id "user-alice" -- no diversity at all
    single_contributor_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_brainwriting_session("BRAINWRITE-SINGLE-CONTRIBUTOR-REFUSED-001", single_voice_contributions, [merged_idea("MI-1", ["IC-1", "IC-2"])])
    except InvariantViolation as error:
        if "BRAINWRITE_SINGLE_CONTRIBUTOR" not in str(error):
            raise
        single_contributor_refusal_proof["raised"] = True
        single_contributor_refusal_proof["error_code"] = "BRAINWRITE_SINGLE_CONTRIBUTOR"
    if not single_contributor_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BRAINWRITE_INVARIANT_NOT_ENFORCED: a single-contributor session was NOT refused -- the contributor-diversity invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SingleContributorRefused", {"refusal_proof": single_contributor_refusal_proof}, 1.3)
    milestones.append("SINGLE_CONTRIBUTOR_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (referential integrity) is not toothless -- a merged idea
    # referencing a nonexistent contribution id MUST be refused. ---
    dangling_ref_merged_ideas = [merged_idea("MI-1", ["IC-NONEXISTENT"])]
    dangling_ref_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_brainwriting_session("BRAINWRITE-DANGLING-REFUSED-001", _well_formed_contributions(), dangling_ref_merged_ideas)
    except InvariantViolation as error:
        if "BRAINWRITE_DANGLING_SOURCE_REF" not in str(error):
            raise
        dangling_ref_refusal_proof["raised"] = True
        dangling_ref_refusal_proof["error_code"] = "BRAINWRITE_DANGLING_SOURCE_REF"
    if not dangling_ref_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BRAINWRITE_INVARIANT_NOT_ENFORCED: a dangling source_contribution_ref was NOT refused -- the referential-integrity invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "DanglingRefRefused", {"refusal_proof": dangling_ref_refusal_proof}, 1.5)
    milestones.append("DANGLING_REF_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof (single-contributor) -- the INDEPENDENT gate catches a defect
    # even when a caller bypasses the builder entirely (flips every stored contributor_id to the
    # same value). ---
    tampered_single_voice = dict(session)
    tampered_single_voice["individual_contributions"] = [{**c, "contributor_id": "user-alice"} for c in session["individual_contributions"]]  # was 3 distinct contributors
    tampered_single_voice_gate = evaluate_brainwriting_gates(tampered_single_voice, "run_brainwriting_slice", clock.at(2.0))
    single_voice_tamper_caught = not all_gates_pass(tampered_single_voice_gate)
    if not single_voice_tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("BRAINWRITE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered single-contributor record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedSingleVoiceCaughtByGate", {"tampered_gate_results": tampered_single_voice_gate}, 2.1)
    milestones.append("SINGLE_VOICE_TAMPER_CAUGHT_BY_GATE")

    # --- Step 5: hand-tampering proof (dangling ref) -- flips the first merged idea's stored
    # source_contribution_refs to reference an id that resolves to no real
    # individual_contributions[].id. ---
    tampered_dangling = dict(session)
    tampered_dangling["merged_ideas"] = [dict(session["merged_ideas"][0]), *session["merged_ideas"][1:]]
    tampered_dangling["merged_ideas"][0]["source_contribution_refs"] = ["IC-NONEXISTENT"]  # was ["IC-1", "IC-2", "IC-4"]
    tampered_dangling_gate = evaluate_brainwriting_gates(tampered_dangling, "run_brainwriting_slice", clock.at(2.2))
    dangling_tamper_caught = not all_gates_pass(tampered_dangling_gate)
    if not dangling_tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("BRAINWRITE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered dangling source_contribution_ref")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedDanglingRefCaughtByGate", {"tampered_gate_results": tampered_dangling_gate}, 2.3)
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
        "single_contributor_refusal_proof": single_contributor_refusal_proof,
        "dangling_ref_refusal_proof": dangling_ref_refusal_proof,
        "tampered_single_voice_gate_results": tampered_single_voice_gate,
        "tampered_dangling_gate_results": tampered_dangling_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "brainwriting_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_brainwriting_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS divergent.brainwriting: BrainwritingSession {result['session']['id']} built with "
        f"{len(result['session']['individual_contributions'])} contributions from "
        f"{len({c['contributor_id'] for c in result['session']['individual_contributions']})} distinct contributors, "
        f"merged into {len(result['session']['merged_ideas'])} ideas, gates [{gate_summary}]; "
        f"BRAINWRITE_SINGLE_CONTRIBUTOR/BRAINWRITE_DANGLING_SOURCE_REF invariants each REFUSED a malformed "
        f"attempt ({result['single_contributor_refusal_proof']['error_code']}, "
        f"{result['dangling_ref_refusal_proof']['error_code']}); hand-tampered single-voice-collapse AND "
        f"dangling source_contribution_ref each caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
