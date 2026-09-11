"""``stakeholders.interest_based_negotiation`` vertical slice -- F07 利害關係人／權力／協商 family, opening
member (new family this batch opens in parallel, 10 concurrent agents).

Scenario: an office-lease renewal negotiation between a small studio tenant and its landlord, same synthetic
style every sibling slice's CLI demo uses. Builds a real, well-formed ``InterestBasedNegotiationRecord``
covering all 4 of the row's own pipeline stages plus a genuinely-transformed ``position``, then demonstrates
each of the 2 real invariants once as a construction-time REFUSAL (a missing pipeline stage; an interests
entry that verbatim-echoes ``position``), proving neither is toothless, same "show a real refusal, not only a
real success" discipline every sibling slice's CLI demo already establishes. A final step hand-tampers a
VALID record directly (bypassing the builder) to prove the independent gate, not just the builder, catches
the same defect.

Run::

    python -m ai_lego.apps.cli.run_interest_based_negotiation_slice
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
from ai_lego.modules.stakeholders.interest_based_negotiation import (
    METHOD_ID,
    all_gates_pass,
    evaluate_interest_based_negotiation_gates,
    generate_interest_based_negotiation_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-IBN-SYNTHETIC-001"
EXECUTION_ID = "EX-IBN-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-IBN-001"

S = {
    "ibn_record": "ai-lego://specs/cognitive/typed-objects/interest-based-negotiation.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-interest-based-negotiation-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return dict(
        record_id="IBN-2026-09-11-001",
        separate_people_from_problem="房東對去年疫情期間租金緩繳一事仍有情緒，先花時間單獨確認『這次續約談判不是要翻舊帳』，再回到條款本身",
        interests=["房客需要月租金維持在可負擔範圍，以撐過目前的營運淡季", "房東需要長期穩定的租約，避免空租期造成的收入缺口"],
        options=["降低月租金 10%，但續約年限從 1 年延長為 3 年", "維持原月租金，但由房東負擔這次的裝潢整修費用"],
        objective_criteria=["鄰近同類型商辦近 6 個月實際成交租金行情", "本大樓過去 3 年平均空租期天數"],
        provenance=make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        position="房東一開始堅持『租金一毛都不能少，且只簽 1 年』",
    )


def run_interest_based_negotiation_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. stakeholders.interest_based_negotiation
    # resolves because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism
    # every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed negotiation record -- both real invariants satisfied, invoked
    # through the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, record = catalog.invoke(METHOD_ID, generate_interest_based_negotiation_record, **_well_formed_kwargs())
    contracts.validate(S["ibn_record"], record, "interest-based negotiation record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InterestBasedNegotiationRecordGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_interest_based_negotiation_gates(record, "run_interest_based_negotiation_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stakeholders.interest_based_negotiation gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("IBN_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (all 4 of the row's own pipeline stages present/non-empty) is not
    # toothless -- a blanked-out pipeline stage (objective_criteria) MUST be refused before any record is
    # constructed. ---
    missing_stage_kwargs = {**_well_formed_kwargs(), "record_id": "IBN-MISSING-STAGE-REFUSED-001", "objective_criteria": []}
    missing_stage_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_interest_based_negotiation_record(**missing_stage_kwargs)
    except InvariantViolation as error:
        if "IBN_INVALID_STAGES" not in str(error):
            raise
        missing_stage_refusal_proof["raised"] = True
        missing_stage_refusal_proof["error_code"] = "IBN_INVALID_STAGES"
    if not missing_stage_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("IBN_INVARIANT_NOT_ENFORCED: a blanked pipeline stage (objective_criteria) was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MissingStageRefused", {"refusal_proof": missing_stage_refusal_proof}, 1.3)
    milestones.append("MISSING_STAGE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (an interests entry may not verbatim-echo position) is not toothless --
    # pasting the stated position straight into interests MUST be refused even when all 4 pipeline stages are
    # otherwise well-formed. ---
    echo_kwargs = {
        **_well_formed_kwargs(),
        "record_id": "IBN-ECHO-REFUSED-001",
        "interests": ["房東一開始堅持『租金一毛都不能少，且只簽 1 年』", "希望長期穩定的租約"],
    }
    echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_interest_based_negotiation_record(**echo_kwargs)
    except InvariantViolation as error:
        if "IBN_INTEREST_ECHOES_POSITION" not in str(error):
            raise
        echo_refusal_proof["raised"] = True
        echo_refusal_proof["error_code"] = "IBN_INTEREST_ECHOES_POSITION"
    if not echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("IBN_INVARIANT_NOT_ENFORCED: an interests entry verbatim-echoing position was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PositionEchoRefused", {"refusal_proof": echo_refusal_proof}, 1.5)
    milestones.append("POSITION_ECHO_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (blanks `options` directly on a copy of the valid record). ---
    tampered = dict(record)
    tampered["options"] = []
    tampered_gate = evaluate_interest_based_negotiation_gates(tampered, "run_interest_based_negotiation_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("IBN_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered empty options[] list")
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
        "record": record,
        "gate_results": gate_results,
        "missing_stage_refusal_proof": missing_stage_refusal_proof,
        "echo_refusal_proof": echo_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "interest_based_negotiation_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_interest_based_negotiation_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS stakeholders.interest_based_negotiation: InterestBasedNegotiationRecord {result['record']['id']} built with "
        f"{len(result['record']['interests'])} interests / {len(result['record']['options'])} options / "
        f"{len(result['record']['objective_criteria'])} objective_criteria, gates [{gate_summary}]; "
        f"IBN_INVALID_STAGES/IBN_INTEREST_ECHOES_POSITION invariants each REFUSED a malformed attempt "
        f"({result['missing_stage_refusal_proof']['error_code']}, {result['echo_refusal_proof']['error_code']}); "
        f"hand-tampered empty options[] caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
