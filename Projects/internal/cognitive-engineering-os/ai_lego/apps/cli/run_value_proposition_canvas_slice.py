"""``strategy.value_proposition_canvas`` vertical slice -- F08 context/strategy family, 14th and FINAL member.

Self-contained scenario (the method contract's own ``inputs.required: []`` -- no external upstream typed-object
input, same class as ``strategy.stp``'s own self-contained design): Nordbrook Research Lab builds a Value
Proposition Canvas for its white-label reporting feature -- 1 job/pain/gain (Customer Profile) and 1
product-and-service/pain-reliever/gain-creator (Value Map), then pairs the reliever against the pain and the
creator against the gain (2 fit hypotheses, 1 PAIN_RELIEF + 1 GAIN_CREATION). Proves 4 of VPC's own real
invariants once each as a construction-time REFUSAL (empty jobs; an id reused across pains and gains; a
fit_hypothesis with a caller-supplied fit_type; a pain_reliever paired against a gain instead of a pain), same
"show a real refusal, not only a real success" discipline every sibling slice's CLI demo already establishes.
A final step hand-tampers a VALID ValuePropositionCanvas directly (bypassing the builder) to prove the
independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_value_proposition_canvas_slice
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
from ai_lego.core.domain.evidence import evidence_record
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.domain.tenant import NORDBROOK
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.strategy.value_proposition_canvas import (
    METHOD_ID,
    all_gates_pass,
    canvas_item,
    evaluate_vpc_gates,
    fit_hypothesis,
    generate_value_proposition_canvas,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-VPC-SYNTHETIC-001"
EXECUTION_ID = "EX-VPC-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-VPC-001"

S = {
    "evidence": "ai-lego://specs/evidence/evidence.schema.yaml",
    "vpc_canvas": "ai-lego://specs/cognitive/typed-objects/value-proposition-canvas.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-vpc-slice"


def _jobs() -> list[dict[str, Any]]:
    return [canvas_item("VPC-2026-09-11-001-J1", "中型行銷代理商需要在單一工作區內管理多個客戶的行銷成效報表")]


def _pains() -> list[dict[str, Any]]:
    return [canvas_item("VPC-2026-09-11-001-PA1", "手動切換多個客戶帳號匯出報表耗時且易出錯")]


def _gains() -> list[dict[str, Any]]:
    return [canvas_item("VPC-2026-09-11-001-GA1", "希望能在一次登入內看到所有客戶的成效總覽")]


def _products_and_services() -> list[dict[str, Any]]:
    return [canvas_item("VPC-2026-09-11-001-PS1", "多租戶白牌行銷報表平台")]


def _pain_relievers() -> list[dict[str, Any]]:
    return [canvas_item("VPC-2026-09-11-001-PR1", "單一登入下的跨客戶帳號切換，零手動匯出")]


def _gain_creators() -> list[dict[str, Any]]:
    return [canvas_item("VPC-2026-09-11-001-GC1", "跨客戶成效總覽儀表板，一次登入即可查看")]


def _valid_fit_hypotheses() -> list[dict[str, Any]]:
    return [
        fit_hypothesis("VPC-2026-09-11-001-H1", "VPC-2026-09-11-001-PR1", "VPC-2026-09-11-001-PA1", "單一登入直接消除手動匯出這個具體 pain，兩者一對一對應"),
        fit_hypothesis("VPC-2026-09-11-001-H2", "VPC-2026-09-11-001-GC1", "VPC-2026-09-11-001-GA1", "跨客戶儀表板直接實現「一次登入看到全部成效」這個具體 gain"),
    ]


def run_value_proposition_canvas_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution -- zero new code in method_resolver.py. strategy.value_proposition_canvas resolves
    # because its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling
    # slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: evidence the reliever's own array entry could plausibly cite (not schema-required here, VPC's
    # own quality.evidence_labeling_required is false -- recorded for scenario realism only). ---
    pain_evidence = evidence_record("E-401", "中型代理商客戶訪談：5 家中,4 家表示手動匯出報表是每週最耗時的環節", "SRC-AGENCY-INTERVIEWS-Q3", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
    contracts.validate(S["evidence"], pain_evidence, "evidence E-401")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EvidenceRecorded", {"evidence": [pain_evidence]}, 1)

    # --- Step 2: Customer Profile (jobs/pains/gains) + Value Map (products_and_services/pain_relievers/
    # gain_creators) -- the complete, well-formed ValuePropositionCanvas. ---
    jobs, pains, gains = _jobs(), _pains(), _gains()
    products_and_services, pain_relievers, gain_creators = _products_and_services(), _pain_relievers(), _gain_creators()
    fit_hypotheses = _valid_fit_hypotheses()

    vpc_descriptor, vpc_canvas = catalog.invoke(
        METHOD_ID,
        generate_value_proposition_canvas,
        "VPC-2026-09-11-001",
        jobs,
        pains,
        gains,
        products_and_services,
        pain_relievers,
        gain_creators,
        fit_hypotheses,
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["vpc_canvas"], vpc_canvas, "value proposition canvas")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ValuePropositionCanvasGenerated", {"vpc_canvas": vpc_canvas, "method_descriptor": vpc_descriptor}, 1.5)
    milestones.append("VPC_CANVAS_BUILT")

    gate_results = evaluate_vpc_gates(vpc_canvas, "run_value_proposition_canvas_slice", clock.at(1.6))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.value_proposition_canvas gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("VPC_GATE_FAILED on the deliberately well-formed canvas")
    milestones.append("GATES_PASSED")

    # --- Step 3: proof the empty-jobs invariant is not toothless -- Customer Profile missing its own jobs side
    # MUST be refused before any record is constructed. ---
    empty_jobs_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_value_proposition_canvas(
            "VPC-REFUSED-EMPTYJOBS-001", [], pains, gains, products_and_services, pain_relievers, gain_creators, fit_hypotheses, make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
    except InvariantViolation as error:
        if "VPC_EMPTY_JOBS" not in str(error):
            raise
        empty_jobs_refusal_proof["raised"] = True
        empty_jobs_refusal_proof["error_code"] = "VPC_EMPTY_JOBS"
    if not empty_jobs_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("VPC_INVARIANT_NOT_ENFORCED: empty jobs was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyJobsRefused", {"refusal_proof": empty_jobs_refusal_proof}, 1.7)
    milestones.append("EMPTY_JOBS_REFUSAL_PROVEN")

    # --- Step 4: proof the pain/gain id-collision invariant is not toothless -- an id reused across pains and
    # gains would make a fit_hypothesis's pain_or_gain_id resolution ambiguous, so it MUST be refused. ---
    colliding_gains = [canvas_item("VPC-2026-09-11-001-PA1", "duplicate id, different array")]
    id_collision_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_value_proposition_canvas(
            "VPC-REFUSED-IDCOLLISION-001", jobs, pains, colliding_gains, products_and_services, pain_relievers, gain_creators, fit_hypotheses, make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
    except InvariantViolation as error:
        if "VPC_ID_COLLISION_PAIN_GAIN" not in str(error):
            raise
        id_collision_refusal_proof["raised"] = True
        id_collision_refusal_proof["error_code"] = "VPC_ID_COLLISION_PAIN_GAIN"
    if not id_collision_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("VPC_INVARIANT_NOT_ENFORCED: a pain/gain id collision was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IdCollisionRefused", {"refusal_proof": id_collision_refusal_proof}, 1.8)
    milestones.append("ID_COLLISION_REFUSAL_PROVEN")

    # --- Step 5: proof the fit_type-must-not-be-caller-supplied invariant is not toothless -- a raw
    # fit_hypothesis dict smuggling its own fit_type key MUST be refused, never silently trusted. ---
    caller_supplied_hypotheses = [{**fit_hypotheses[0], "fit_type": "PAIN_RELIEF"}, fit_hypotheses[1]]
    caller_supplied_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_value_proposition_canvas(
            "VPC-REFUSED-CALLERFITTYPE-001",
            jobs,
            pains,
            gains,
            products_and_services,
            pain_relievers,
            gain_creators,
            caller_supplied_hypotheses,
            make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
        )
    except InvariantViolation as error:
        if "VPC_FIT_TYPE_MUST_NOT_BE_CALLER_SUPPLIED" not in str(error):
            raise
        caller_supplied_refusal_proof["raised"] = True
        caller_supplied_refusal_proof["error_code"] = "VPC_FIT_TYPE_MUST_NOT_BE_CALLER_SUPPLIED"
    if not caller_supplied_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("VPC_INVARIANT_NOT_ENFORCED: a caller-supplied fit_type was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "CallerSuppliedFitTypeRefused", {"refusal_proof": caller_supplied_refusal_proof}, 1.9)
    milestones.append("CALLER_SUPPLIED_FIT_TYPE_REFUSAL_PROVEN")

    # --- Step 6: proof the fit_type-mismatch invariant is not toothless -- a pain_reliever paired against a
    # gain (instead of a pain) is not a coherent fit hypothesis and MUST be refused. ---
    mismatched_hypotheses = [
        fit_hypothesis("VPC-2026-09-11-001-HMISMATCH", "VPC-2026-09-11-001-PR1", "VPC-2026-09-11-001-GA1", "a pain_reliever paired against a gain -- should be refused")
    ]
    mismatch_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_value_proposition_canvas(
            "VPC-REFUSED-FITTYPEMISMATCH-001",
            jobs,
            pains,
            gains,
            products_and_services,
            pain_relievers,
            gain_creators,
            mismatched_hypotheses,
            make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
        )
    except InvariantViolation as error:
        if "VPC_FIT_TYPE_MISMATCH" not in str(error):
            raise
        mismatch_refusal_proof["raised"] = True
        mismatch_refusal_proof["error_code"] = "VPC_FIT_TYPE_MISMATCH"
    if not mismatch_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("VPC_INVARIANT_NOT_ENFORCED: a pain_reliever/gain fit_type mismatch was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "FitTypeMismatchRefused", {"refusal_proof": mismatch_refusal_proof}, 2.0)
    milestones.append("FIT_TYPE_MISMATCH_REFUSAL_PROVEN")

    # --- Step 7: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely. ---
    tampered = {**vpc_canvas, "fit_hypotheses": [{**vpc_canvas["fit_hypotheses"][0], "pain_or_gain_id": "VPC-2026-09-11-001-GA1"}, vpc_canvas["fit_hypotheses"][1]]}
    tampered_gate = evaluate_vpc_gates(tampered, "run_value_proposition_canvas_slice", clock.at(2.1))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("VPC_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered pain_or_gain_id")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.2)
    ledger.close_aggregate(AGGREGATE_ID)
    milestones.append("VERIFYING")

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "vpc_canvas": vpc_canvas,
        "gate_results": gate_results,
        "empty_jobs_refusal_proof": empty_jobs_refusal_proof,
        "id_collision_refusal_proof": id_collision_refusal_proof,
        "caller_supplied_refusal_proof": caller_supplied_refusal_proof,
        "mismatch_refusal_proof": mismatch_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stp_slice.py)",
    }
    write_json(runtime / "results" / "value_proposition_canvas_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_value_proposition_canvas_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.value_proposition_canvas: ValuePropositionCanvas {result['vpc_canvas']['id']} built "
        f"({len(result['vpc_canvas']['fit_hypotheses'])} fit hypotheses), gates [{gate_summary}]; "
        f"EMPTY_JOBS REFUSED ({result['empty_jobs_refusal_proof']['error_code']}); "
        f"ID_COLLISION_PAIN_GAIN REFUSED ({result['id_collision_refusal_proof']['error_code']}); "
        f"CALLER_SUPPLIED_FIT_TYPE REFUSED ({result['caller_supplied_refusal_proof']['error_code']}); "
        f"FIT_TYPE_MISMATCH REFUSED ({result['mismatch_refusal_proof']['error_code']}); "
        f"tampered pain_or_gain_id caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
