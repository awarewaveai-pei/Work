"""``insight.focus_group`` vertical slice -- F06 human/customer-insight family, one of 9 members opened in
this same batch (see ``run_random_stimulus_slice.py``, read in full as this module's primary structural
template -- the closest sibling for a single-legal-value-field-refused-via-TypeError CLI demo -- neither
edited).

Scenario: a Focus Group session exploring reactions to a redesigned onboarding flow -- same synthetic style
every sibling slice's CLI demo uses. Builds a real, well-formed ``FocusGroupSession`` with 8 participants,
then demonstrates each of the 2 real invariants as REFUSALS: invariant 1 (``participant_count`` in the
closed range [6,10], bool excluded) three separate ways -- too few (5), too many (11), and a bool
masquerading as an int (``True``) -- proving the range check and the bool-exclusion guard are each real, not
toothless. Invariant 2 (``generalizability_scope``) cannot be builder-refused the same way -- the builder
never accepts it as a parameter at all (structural elimination, see module docstring) -- so its refusal
proof instead calls the builder WITH that keyword argument and shows Python itself refuses the call
(``TypeError``, not even reaching ``InvariantViolation``). A final step hand-tampers a VALID record's raw
dict directly (bypassing the builder entirely, claiming a population-representative scope) to prove the
independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_focus_group_slice
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
from ai_lego.modules.insight.focus_group import (
    GENERALIZABILITY_SCOPE,
    METHOD_ID,
    all_gates_pass,
    evaluate_focus_group_gates,
    generate_focus_group_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FOCUSGROUP-SYNTHETIC-001"
EXECUTION_ID = "EX-FOCUSGROUP-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-FOCUSGROUP-001"

S = {
    "focus_group_session": "ai-lego://specs/cognitive/typed-objects/focus-group-session.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-focus-group-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return dict(
        topic="新版 onboarding 流程的第一印象與情緒反應",
        participant_count=8,
        moderation_approach="半結構式引導，主持人準備 6 道開放式問題，允許參與者互相回應與延伸討論",
        discussion_summary="多數參與者認為步驟數變少是正面改變，但有 3 人提到跳過教學後找不到回頭重看的入口",
        analysis="步驟精簡本身被普遍接受，但『教學可回頭查看』是目前設計缺口，建議下一輪迭代優先處理",
    )


def run_focus_group_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. insight.focus_group resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
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
        generate_focus_group_session,
        "FOCUSGROUP-2026-09-11-001",
        **_well_formed_kwargs(),
        provenance=make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["focus_group_session"], session, "focus group session")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "FocusGroupSessionGenerated", {"session": session, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_focus_group_gates(session, "run_focus_group_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"insight.focus_group gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("FOCUSGROUP_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (participant_count in [6,10]) is not toothless -- too FEW participants
    # (5) MUST be refused before any record is constructed. ---
    too_few_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_focus_group_session(
            "FOCUSGROUP-TOOFEW-REFUSED-001", **{**_well_formed_kwargs(), "participant_count": 5}, provenance=make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
    except InvariantViolation as error:
        if "FOCUSGROUP_INVALID_PARTICIPANT_COUNT" not in str(error):
            raise
        too_few_refusal_proof["raised"] = True
        too_few_refusal_proof["error_code"] = "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"
    if not too_few_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FOCUSGROUP_INVARIANT_NOT_ENFORCED: participant_count=5 (below the closed range) was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TooFewParticipantsRefused", {"refusal_proof": too_few_refusal_proof}, 1.2)
    milestones.append("TOO_FEW_REFUSAL_PROVEN")

    # --- Step 3: too MANY participants (11) MUST also be refused -- the range has two ends, not just a
    # floor. ---
    too_many_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_focus_group_session(
            "FOCUSGROUP-TOOMANY-REFUSED-001", **{**_well_formed_kwargs(), "participant_count": 11}, provenance=make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
    except InvariantViolation as error:
        if "FOCUSGROUP_INVALID_PARTICIPANT_COUNT" not in str(error):
            raise
        too_many_refusal_proof["raised"] = True
        too_many_refusal_proof["error_code"] = "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"
    if not too_many_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FOCUSGROUP_INVARIANT_NOT_ENFORCED: participant_count=11 (above the closed range) was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TooManyParticipantsRefused", {"refusal_proof": too_many_refusal_proof}, 1.3)
    milestones.append("TOO_MANY_REFUSAL_PROVEN")

    # --- Step 4: bool-masquerade proof -- bool is a subclass of int in Python (True == 1); participant_count
    # MUST refuse True exactly as it would refuse the integer 1 (also out of range), proving the explicit
    # isinstance(..., bool) exclusion guard is real, not merely coincidental range-based safety. ---
    bool_masquerade_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_focus_group_session(
            "FOCUSGROUP-BOOLMASQUERADE-REFUSED-001",
            **{**_well_formed_kwargs(), "participant_count": True},  # type: ignore[arg-type]  # bool is a subclass of int -- must still be refused
            provenance=make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
        )
    except InvariantViolation as error:
        if "FOCUSGROUP_INVALID_PARTICIPANT_COUNT" not in str(error):
            raise
        bool_masquerade_refusal_proof["raised"] = True
        bool_masquerade_refusal_proof["error_code"] = "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"
    if not bool_masquerade_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FOCUSGROUP_INVARIANT_NOT_ENFORCED: participant_count=True (bool masquerading as int) was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BoolMasqueradeParticipantCountRefused", {"refusal_proof": bool_masquerade_refusal_proof}, 1.4)
    milestones.append("BOOL_MASQUERADE_REFUSAL_PROVEN")

    # --- Step 5: proof invariant 2 (generalizability_scope) is not toothless. Unlike invariant 1, the
    # builder never accepts generalizability_scope as a parameter at all (structural elimination -- see
    # module docstring), so a CALLER attempting to supply it is refused by Python itself (TypeError) before
    # any of this method's own invariant checks even run. ---
    caller_supplied_scope_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_focus_group_session(
            "FOCUSGROUP-BADKWARG-001",
            **_well_formed_kwargs(),
            provenance=make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            generalizability_scope="POPULATION_REPRESENTATIVE",  # type: ignore[call-arg]  # a caller could never get the builder to accept this
        )
    except TypeError as error:
        caller_supplied_scope_proof["raised"] = True
        caller_supplied_scope_proof["error_type"] = "TypeError"
        caller_supplied_scope_proof["error_message"] = str(error)
    if not caller_supplied_scope_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FOCUSGROUP_INVARIANT_NOT_ENFORCED: a caller-supplied generalizability_scope keyword was NOT refused -- the structural elimination is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CallerSuppliedGeneralizabilityScopeRefused", {"refusal_proof": caller_supplied_scope_proof}, 1.5)
    milestones.append("GENERALIZABILITY_SCOPE_REFUSAL_PROVEN")

    # --- Step 6: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (flips the stored generalizability_scope to a fabricated population-representative
    # claim, directly contradicting Atlas's own F06 caution "不用來估人口比例"). ---
    tampered = dict(session)
    tampered["generalizability_scope"] = "POPULATION_REPRESENTATIVE"  # was QUALITATIVE_EXPLORATION_NOT_POPULATION_ESTIMATE -- bypasses the builder directly
    tampered_gate = evaluate_focus_group_gates(tampered, "run_focus_group_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("FOCUSGROUP_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered generalizability_scope claim")
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
        "too_few_refusal_proof": too_few_refusal_proof,
        "too_many_refusal_proof": too_many_refusal_proof,
        "bool_masquerade_refusal_proof": bool_masquerade_refusal_proof,
        "caller_supplied_generalizability_scope_proof": caller_supplied_scope_proof,
        "tampered_gate_results": tampered_gate,
        "generalizability_scope_constant": GENERALIZABILITY_SCOPE,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "focus_group_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_focus_group_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS insight.focus_group: FocusGroupSession {result['session']['id']} built with "
        f"participant_count={result['session']['participant_count']} (generalizability_scope={GENERALIZABILITY_SCOPE}), gates [{gate_summary}]; "
        f"FOCUSGROUP_INVALID_PARTICIPANT_COUNT REFUSED participant_count=5/11/True "
        f"({result['too_few_refusal_proof']['error_code']}, {result['too_many_refusal_proof']['error_code']}, {result['bool_masquerade_refusal_proof']['error_code']}); "
        f"caller-supplied generalizability_scope REFUSED via {result['caller_supplied_generalizability_scope_proof']['error_type']} "
        f"(builder exposes no such parameter); hand-tampered generalizability_scope claim caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
