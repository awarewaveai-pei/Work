"""``devops_sre.rto_rpo`` vertical slice -- the thirty-eighth Method Atlas slice, thirteenth and last member
of the `devops_sre` family. F19 is now COMPLETE (13/13).

Builds a real Tier 0 target definition citing a real drill via its own
`drill_ref` soft link, and a real Tier 2 target definition with no
drill yet performed. Then proves the both-required-RTO-and-RPO
invariant is real by attempting to construct a record with an invalid
RPO target while RTO is fine (construction layer), and proves the
"re-derived, not trusted" discipline at the independent gate layer by
hand-tampering a COPY of the valid record to smuggle a malformed
drill_ref, leaving every other field untouched (gate layer).

Run::

    python -m ai_lego.apps.cli.run_rto_rpo_slice
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
from ai_lego.modules.devops_sre.rto_rpo import (
    METHOD_ID,
    all_gates_pass,
    evaluate_rto_rpo_gates,
    generate_rto_rpo_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-RTORPO-SYNTHETIC-001"
EXECUTION_ID = "EX-RTORPO-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-RTORPO-001"

S = {
    "rto_rpo_record": "ai-lego://specs/cognitive/typed-objects/rto-rpo-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-rto-rpo-slice"


def run_rto_rpo_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real Tier 0 target definition, citing a real drill that verified it. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_rto_rpo_record,
        "RTORPO-2026-09-05-001",
        "checkout-api order database",
        "checkout-api outage stops 100% of online revenue and blocks all order fulfillment",
        "Tier 0 - Critical",
        7200,
        300,
        "DRILL-2026-09-05-001",
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["rto_rpo_record"], record, "rto/rpo record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RtoRpoRecordGenerated", {"rto_rpo_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_rto_rpo_gates(record, "run_rto_rpo_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"rto/rpo gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"RTORPO_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "RtoRpoGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real Tier 2 target definition, no drill performed yet. ---
    _, no_drill_record = catalog.invoke(
        METHOD_ID,
        generate_rto_rpo_record,
        "RTORPO-2026-09-05-002",
        "internal analytics dashboard",
        "outage delays internal reporting by up to a business day; no customer-facing or revenue impact",
        "Tier 2 - Standard",
        86400,
        86400,
        None,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["rto_rpo_record"], no_drill_record, "rto/rpo record without drill_ref")
    if "drill_ref" in no_drill_record:
        raise InvariantViolation(f"RTORPO_EXPECTED_NO_DRILL_REF: expected drill_ref omitted, got {no_drill_record.get('drill_ref')!r}")

    # --- Prove the both-required-RTO-and-RPO invariant is real, at the CONSTRUCTION layer: RTO fine, RPO
    # invalid (negative). Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_rto_rpo_record(
            "RTORPO-2026-09-05-003",
            "s",
            "i",
            "t",
            7200,
            -1,
            None,
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "RTORPO_INVALID_RPO" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("RTORPO_INVARIANT_GUARD_DID_NOT_FIRE: a record with a negative rpo_target_seconds was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid Tier 0 record and hand-tamper its own drill_ref to a malformed value, leaving every
    # other field UNTOUCHED. Pinned to the SPECIFIC rto_rpo_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(record)
    tampered["drill_ref"] = "RTORPO-not-a-drill"
    tampered_gate_results = evaluate_rto_rpo_gates(tampered, "run_rto_rpo_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "rto_rpo_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and integrity_result["evidence"][0].get("reason") == "drill_ref present but malformed (missing DRILL- prefix or empty)"
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"RTORPO_GATE_GUARD_DID_NOT_FIRE: rto_rpo_integrity did not flag the malformed drill_ref "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "RtoRpoInvariantVerified",
        {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
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
        "rto_rpo_record": record,
        "no_drill_rto_rpo_record": no_drill_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "rto_rpo_slice_result.json", result)
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
        result = run_rto_rpo_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["rto_rpo_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.rto_rpo: {record['system_or_component']!r} tier={record['tier']!r}, "
        f"rto={record['rto_target_seconds']}s, rpo={record['rpo_target_seconds']}s, drill_ref={record.get('drill_ref')}, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
