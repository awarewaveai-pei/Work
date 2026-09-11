"""``divergent.random_stimulus`` vertical slice -- F03 divergent ideation family, 1st built member (see
``run_bcg_matrix_slice.py``/``run_business_model_canvas_slice.py``, read in full as this module's primary
repo-convention templates, neither edited).

Scenario: a Random Stimulus session breaking inertia on a stalled product-naming/dashboard problem --
same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed
``RandomStimulusSession`` covering 2 stimulus-to-idea entries, then demonstrates each of the 2
construction-time real invariants once as a REFUSAL (an empty entries list; a raw-dict-smuggled empty
forced_connection), proving neither is toothless. Invariant 3 (``feasibility_status``) cannot be
builder-refused the same way -- the builder never accepts it as a parameter at all (structural
elimination, see module docstring) -- so its refusal proof instead calls the builder WITH that keyword
argument and shows Python itself refuses the call (``TypeError``, not even reaching
``InvariantViolation``). A final step hand-tampers a VALID record's raw dict directly (bypassing the
builder entirely, claiming ``FEASIBLE``) to prove the independent gate, not just the builder, catches the
same defect.

Run::

    python -m ai_lego.apps.cli.run_random_stimulus_slice
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
from ai_lego.modules.divergent.random_stimulus import (
    FEASIBILITY_STATUS,
    METHOD_ID,
    all_gates_pass,
    evaluate_random_stimulus_gates,
    generate_random_stimulus_session,
    stimulus_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RANDOMSTIM-SYNTHETIC-001"
EXECUTION_ID = "EX-RANDOMSTIM-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-RANDOMSTIM-001"

S = {
    "random_stimulus_session": "ai-lego://specs/cognitive/typed-objects/random-stimulus-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-random-stimulus-slice"


def _well_formed_entries() -> list[dict[str, Any]]:
    return [
        stimulus_entry(
            "水母（jellyfish）",
            "水母沒有骨架卻能自在漂浮 -- 對應我們產品「無需安裝、隨開即用」的特性",
            "產品命名/定位改走「無重量感」訴求，強調零安裝負擔",
        ),
        stimulus_entry(
            "紅綠燈",
            "紅綠燈用顏色瞬間傳達狀態，不需文字 -- 對應儀表板需要一眼判斷健康狀態",
            "儀表板改成三色狀態燈號，取代目前的長段文字說明",
        ),
    ]


def run_random_stimulus_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. divergent.random_stimulus resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every
    # sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed session -- both real invariants satisfied, invoked through
    # the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, session = catalog.invoke(
        METHOD_ID,
        generate_random_stimulus_session,
        "RANDOMSTIM-2026-09-11-001",
        _well_formed_entries(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["random_stimulus_session"], session, "random stimulus session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RandomStimulusSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_random_stimulus_gates(session, "run_random_stimulus_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"divergent.random_stimulus gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("RANDOMSTIM_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (non-empty entries) is not toothless -- an empty entries list MUST
    # be refused before any record is constructed. ---
    empty_entries_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_random_stimulus_session("RANDOMSTIM-EMPTY-REFUSED-001", [], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "RANDOMSTIM_EMPTY_ENTRIES" not in str(error):
            raise
        empty_entries_refusal_proof["raised"] = True
        empty_entries_refusal_proof["error_code"] = "RANDOMSTIM_EMPTY_ENTRIES"
    if not empty_entries_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RANDOMSTIM_INVARIANT_NOT_ENFORCED: an empty entries list was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyEntriesRefused", {"refusal_proof": empty_entries_refusal_proof}, 1.3)
    milestones.append("EMPTY_ENTRIES_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-entry disclosed content) is not toothless -- an empty
    # forced_connection on one entry MUST be refused. stimulus_entry() itself validates this via its own
    # builder path, so the defect is constructed directly as a raw dict to exercise
    # generate_random_stimulus_session's own check. ---
    empty_connection_entries = _well_formed_entries()
    empty_connection_entries[0] = {**empty_connection_entries[0], "forced_connection": "   "}
    empty_connection_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_random_stimulus_session("RANDOMSTIM-EMPTY-CONNECTION-REFUSED-001", empty_connection_entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "RANDOMSTIM_INVALID_ENTRY" not in str(error):
            raise
        empty_connection_refusal_proof["raised"] = True
        empty_connection_refusal_proof["error_code"] = "RANDOMSTIM_INVALID_ENTRY"
    if not empty_connection_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RANDOMSTIM_INVARIANT_NOT_ENFORCED: an empty forced_connection was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyForcedConnectionRefused", {"refusal_proof": empty_connection_refusal_proof}, 1.5)
    milestones.append("EMPTY_FORCED_CONNECTION_REFUSAL_PROVEN")

    # --- Step 4: proof invariant 3 (feasibility_status) is not toothless. Unlike invariants 1+2, the
    # builder never accepts feasibility_status as a parameter at all (structural elimination -- see
    # module docstring), so a CALLER attempting to supply it is refused by Python itself (TypeError)
    # before any of this method's own invariant checks even run. ---
    caller_supplied_status_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_random_stimulus_session(
            "RANDOMSTIM-BADKWARG-001",
            _well_formed_entries(),
            make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            feasibility_status="FEASIBLE",  # type: ignore[call-arg]  # a caller could never get the builder to accept this
        )
    except TypeError as error:
        caller_supplied_status_proof["raised"] = True
        caller_supplied_status_proof["error_type"] = "TypeError"
        caller_supplied_status_proof["error_message"] = str(error)
    if not caller_supplied_status_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("RANDOMSTIM_INVARIANT_NOT_ENFORCED: a caller-supplied feasibility_status keyword was NOT refused -- the structural elimination is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CallerSuppliedFeasibilityStatusRefused", {"refusal_proof": caller_supplied_status_proof}, 1.7)
    milestones.append("CALLER_FEASIBILITY_STATUS_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller
    # bypasses the builder entirely (flips the first entry's stored feasibility_status to a
    # still-schema-legal-shaped-but-wrong claim of FEASIBLE, something the builder itself can never be
    # made to emit). ---
    tampered = dict(session)
    tampered["entries"] = [dict(session["entries"][0]), *session["entries"][1:]]
    tampered["entries"][0]["feasibility_status"] = "FEASIBLE"  # was NOT_YET_SCREENED -- bypasses the builder directly
    tampered_gate = evaluate_random_stimulus_gates(tampered, "run_random_stimulus_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("RANDOMSTIM_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered feasibility_status claiming FEASIBLE")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedFeasibilityStatusCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "empty_entries_refusal_proof": empty_entries_refusal_proof,
        "empty_forced_connection_refusal_proof": empty_connection_refusal_proof,
        "caller_supplied_feasibility_status_proof": caller_supplied_status_proof,
        "tampered_gate_results": tampered_gate,
        "feasibility_status_constant": FEASIBILITY_STATUS,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "random_stimulus_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_random_stimulus_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS divergent.random_stimulus: RandomStimulusSession {result['session']['id']} built with "
        f"{len(result['session']['entries'])} entries, gates [{gate_summary}]; "
        f"RANDOMSTIM_EMPTY_ENTRIES/RANDOMSTIM_INVALID_ENTRY invariants each REFUSED a malformed attempt "
        f"({result['empty_entries_refusal_proof']['error_code']}, {result['empty_forced_connection_refusal_proof']['error_code']}); "
        f"caller-supplied feasibility_status REFUSED via {result['caller_supplied_feasibility_status_proof']['error_type']} "
        f"(builder exposes no such parameter); hand-tampered feasibility_status ({result['feasibility_status_constant']!r} "
        f"spoofed as FEASIBLE) caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
