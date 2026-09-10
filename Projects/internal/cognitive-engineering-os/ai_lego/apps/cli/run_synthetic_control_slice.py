"""``causal.synthetic_control`` vertical slice -- 10th and FINAL F11 `causal` family member.

Scenario: a completed synthetic-control study on a state-level minimum-wage policy's
effect on regional employment -- same synthetic style every sibling slice's CLI demo
uses, distinct from ``run_rct_slice.py``'s own onboarding-email scenario (this record
does not reference or depend on that slice's data). Builds a real, well-formed
``SyntheticControlRecord`` covering Atlas F11 L625's own 5-step pipeline (donor
pool→fit→weights→post gap→placebo), then demonstrates each of the 3 structural
invariants once as a construction-time REFUSAL (donor pool too small; treated_unit
echoing a donor_pool entry; a weight naming a donor outside the pool), proving none
is toothless, same "show a real refusal, not only a real success" discipline every
sibling slice's CLI demo already establishes. A final step hand-tampers a VALID
record directly (bypassing the builder) to prove the independent gate, not just the
builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_synthetic_control_slice
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
from ai_lego.modules.causal.synthetic_control import (
    METHOD_ID,
    all_gates_pass,
    evaluate_synthetic_control_gates,
    generate_synthetic_control_record,
    synthetic_control_weight,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SYNTHCONTROL-SYNTHETIC-001"
EXECUTION_ID = "EX-SYNTHCONTROL-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SYNTHCONTROL-001"

S = {
    "synthetic_control_record": "ai-lego://specs/cognitive/typed-objects/synthetic-control-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}

TREATED_UNIT = "A 州（2020 年實施最低工資調漲政策的處置州）"
DONOR_POOL = ["B 州", "C 州", "D 州", "E 州", "F 州"]


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-synthetic-control-slice"


def run_synthetic_control_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. causal.synthetic_control resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed record -- all 4 real invariants satisfied. ---
    record = generate_synthetic_control_record(
        "SYNTH-2026-09-10-001",
        TREATED_UNIT,
        DONOR_POOL,
        "政策實施前 5 年，加權組合州與 A 州的就業率趨勢視覺上高度吻合，處置前平均絕對誤差低於 0.3 個百分點",
        [
            synthetic_control_weight("B 州", 0.42),
            synthetic_control_weight("C 州", 0.31),
            synthetic_control_weight("D 州", 0.0),
            synthetic_control_weight("E 州", 0.18),
            synthetic_control_weight("F 州", 0.09),
        ],
        "政策實施後 3 年，A 州實際就業率較加權合成對照組低 1.4 個百分點，缺口於第 2 年後持續擴大",
        [
            "空間安慰劑：對 5 個未處置州依序執行同一流程，A 州自身缺口大小落在安慰劑分佈的第 92 百分位，優於多數安慰劑州",
            "時間安慰劑：將處置時點提前 3 年重跑，處置前期間未觀察到有意義缺口",
        ],
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )
    contracts.validate(S["synthetic_control_record"], record, "synthetic control record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SyntheticControlRecorded", {"record": record}, 1)
    milestones.append("RECORD_BUILT")

    gate_results = evaluate_synthetic_control_gates(record, "run_synthetic_control_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"causal.synthetic_control gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("SYNTHCONTROL_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the donor-pool-size invariant is not toothless -- a pool of 1 donor MUST be refused
    # before any record is constructed (a synthetic control is BY DEFINITION a weighted combination). ---
    small_pool_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_synthetic_control_record(
            "SYNTH-REFUSED-SMALLPOOL-001",
            TREATED_UNIT,
            ["B 州"],  # only 1 donor -- cannot produce a WEIGHTED combination
            "視覺上吻合",
            [synthetic_control_weight("B 州", 1.0)],
            "缺口 1.4 個百分點",
            ["空間安慰劑"],
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "SYNTH_DONOR_POOL_TOO_SMALL" not in str(error):
            raise
        small_pool_refusal_proof["raised"] = True
        small_pool_refusal_proof["error_code"] = "SYNTH_DONOR_POOL_TOO_SMALL"
    if not small_pool_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYNTHCONTROL_INVARIANT_NOT_ENFORCED: a 1-donor pool was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SmallDonorPoolRefused", {"refusal_proof": small_pool_refusal_proof}, 1.3)
    milestones.append("SMALL_POOL_REFUSAL_PROVEN")

    # --- Step 3: proof the treated-unit/donor-pool distinctness invariant is not toothless -- a treated_unit
    # echoing a donor_pool entry MUST be refused (the treated unit is, by definition, not a donor). ---
    echo_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_synthetic_control_record(
            "SYNTH-REFUSED-ECHO-001",
            "B 州",  # identical to a donor_pool entry below -- an echo, not a real treated/donor split
            ["B 州", "C 州"],
            "視覺上吻合",
            [synthetic_control_weight("B 州", 0.5), synthetic_control_weight("C 州", 0.5)],
            "缺口 1.4 個百分點",
            ["空間安慰劑"],
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "SYNTH_TREATED_UNIT_IN_DONOR_POOL" not in str(error):
            raise
        echo_refusal_proof["raised"] = True
        echo_refusal_proof["error_code"] = "SYNTH_TREATED_UNIT_IN_DONOR_POOL"
    if not echo_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYNTHCONTROL_INVARIANT_NOT_ENFORCED: treated_unit echoing a donor was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TreatedUnitEchoRefused", {"echo_refusal_proof": echo_refusal_proof}, 1.5)
    milestones.append("ECHO_REFUSAL_PROVEN")

    # --- Step 4: proof the weight-referential-integrity invariant is not toothless -- a weight naming a donor
    # outside donor_pool MUST be refused. ---
    unknown_donor_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_synthetic_control_record(
            "SYNTH-REFUSED-UNKNOWNDONOR-001",
            TREATED_UNIT,
            ["B 州", "C 州"],
            "視覺上吻合",
            [synthetic_control_weight("B 州", 0.5), synthetic_control_weight("Z 州", 0.5)],  # Z 州 not in donor_pool
            "缺口 1.4 個百分點",
            ["空間安慰劑"],
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "SYNTH_WEIGHT_REFERENCES_UNKNOWN_DONOR" not in str(error):
            raise
        unknown_donor_refusal_proof["raised"] = True
        unknown_donor_refusal_proof["error_code"] = "SYNTH_WEIGHT_REFERENCES_UNKNOWN_DONOR"
    if not unknown_donor_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYNTHCONTROL_INVARIANT_NOT_ENFORCED: a weight naming an unknown donor was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "UnknownDonorWeightRefused", {"refusal_proof": unknown_donor_refusal_proof}, 1.7)
    milestones.append("UNKNOWN_DONOR_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely. ---
    tampered = dict(record)
    tampered["treated_unit"] = tampered["donor_pool"][0]  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_synthetic_control_gates(tampered, "run_synthetic_control_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("SYNTHCONTROL_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered echoing treated_unit")
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
        "record": record,
        "gate_results": gate_results,
        "small_pool_refusal_proof": small_pool_refusal_proof,
        "echo_refusal_proof": echo_refusal_proof,
        "unknown_donor_refusal_proof": unknown_donor_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_rct_slice.py)",
    }
    write_json(runtime / "results" / "synthetic_control_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_synthetic_control_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(
        f"PASS causal.synthetic_control: SyntheticControlRecord {result['record']['id']} built, "
        f"{len(result['gate_results'])} gates all PASS; "
        f"DONOR_POOL_TOO_SMALL invariant REFUSED a 1-donor attempt ({result['small_pool_refusal_proof']['error_code']}); "
        f"TREATED_UNIT_IN_DONOR_POOL invariant REFUSED an echoing attempt ({result['echo_refusal_proof']['error_code']}); "
        f"WEIGHT_REFERENCES_UNKNOWN_DONOR invariant REFUSED an out-of-pool weight ({result['unknown_donor_refusal_proof']['error_code']}); "
        f"echoing-treated_unit tamper caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
