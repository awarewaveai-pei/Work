"""``decision.wsjf`` vertical slice -- Method Atlas slice, 12th member of the ``decision`` family (F16).

Builds a real single-job WSJF score (an API rate-limiting fix, business
value 8, time criticality 13, risk reduction/opportunity enablement 5, 5
points of job size), computed by
``ai_lego/compute/wsjf/scoring.py::compute_cost_of_delay``/
``compute_wsjf_score`` (hand-verified against a known case before this CLI
was written). Then demonstrates BOTH of this method's own real invariants
are actually enforced, not merely documented:

1. The inferred no-automatic-authority rule (see the sibling module's own
   due-diligence for why this citation is the weakest-grounded in the
   family) is real the same way ``run_rice_slice.py`` already proved it for
   a sibling method: attempts to smuggle an ``approved`` key onto a copy of
   a valid record and confirms it is refused at both the runtime layer and
   the schema layer independently.
2. The ``genuine_compute`` gate is real, not a rubber stamp: a copy of the
   valid record has its ``wsjf_score`` hand-tampered to an inflated value
   (never re-derived from the real inputs) and the gate is confirmed to
   FAIL -- proving the gate actually re-invokes ``compute_cost_of_delay``/
   ``compute_wsjf_score`` against the record's own raw fields rather than
   trusting whatever ``cost_of_delay_total``/``wsjf_score`` happens to be
   stored.

Run::

    python -m ai_lego.apps.cli.run_wsjf_slice
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
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decision.wsjf import (
    METHOD_ID,
    all_gates_pass,
    assert_no_automatic_authority_claim,
    evaluate_wsjf_gates,
    evaluate_wsjf_genuine_compute_gate,
    generate_wsjf_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-WSJF-SYNTHETIC-001"
EXECUTION_ID = "EX-WSJF-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-WSJF-001"

S = {
    "wsjf_score_record": "ai-lego://specs/cognitive/typed-objects/wsjf-score-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-wsjf-slice"


def run_wsjf_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real portfolio job: an API rate-limiting fix. Business value 8, time criticality 13 (delaying
    # it keeps costing more), risk reduction/opportunity enablement 5, sized at 5 job-size points. ---
    job = {"id": "JOB-1", "label": "API 速率限制修復"}
    cost_of_delay = {"business_value": 8, "time_criticality": 13, "risk_reduction_opportunity_enablement": 5}
    job_size = 5
    descriptor, wsjf_record = catalog.invoke(
        METHOD_ID,
        generate_wsjf_record,
        "WSJF-2026-09-08-001",
        job,
        cost_of_delay,
        job_size,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["wsjf_score_record"], wsjf_record, "wsjf score record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "WsjfScoreRecordGenerated", {"wsjf_score_record": wsjf_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_wsjf_gates(wsjf_record, "run_wsjf_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"wsjf gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"WSJF_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "WsjfGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the inferred no-automatic-authority rule is real: attempt to smuggle an "approved" key onto
    # a COPY of the record, at both layers. Neither attempt may succeed. ---
    tampered_authority = copy.deepcopy(wsjf_record)
    tampered_authority["approved"] = True
    runtime_layer_blocked = False
    try:
        assert_no_automatic_authority_claim(tampered_authority)
    except InvariantViolation:
        runtime_layer_blocked = True
    schema_layer_blocked = False
    try:
        contracts.validate(S["wsjf_score_record"], tampered_authority, "tampered record (must be refused)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not (runtime_layer_blocked and schema_layer_blocked):
        raise InvariantViolation(
            f"WSJF_AUTHORITY_GUARD_DID_NOT_FIRE: runtime_layer_blocked={runtime_layer_blocked}, schema_layer_blocked={schema_layer_blocked} -- "
            "both layers must independently refuse a smuggled automatic-authority claim"
        )
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "WsjfNoAutomaticAuthorityVerified", {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked}, 1.3)
    milestones.append("VERIFYING")

    # --- Prove the genuine_compute gate actually re-derives, never trusts, the stored wsjf_score: a copy of
    # the record has its wsjf_score hand-inflated (never recomputed from cost_of_delay/job_size) -- the gate
    # must catch this, schema-valid shape notwithstanding. ---
    tampered_score = copy.deepcopy(wsjf_record)
    tampered_score["wsjf_score"] = wsjf_record["wsjf_score"] * 100  # a caller inflating priority by fiat
    tampered_gate = evaluate_wsjf_genuine_compute_gate(tampered_score, "run_wsjf_slice", clock.at(1.4))
    if tampered_gate["status"] != "FAIL":
        raise InvariantViolation(f"WSJF_GENUINE_COMPUTE_GUARD_DID_NOT_FIRE: tampered wsjf_score was not caught by evaluate_wsjf_genuine_compute_gate (status={tampered_gate['status']})")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "WsjfGenuineComputeGuardVerified", {"tampered_gate_status": tampered_gate["status"]}, 1.5)
    ledger.close_aggregate(AGGREGATE_ID)

    result = {
        "run_id": RUN_ID,
        "execution_id": EXECUTION_ID,
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": METHOD_ID,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        "wsjf_score_record": wsjf_record,
        "gate_results": gate_results,
        "no_automatic_authority_verification": {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
        "genuine_compute_guard_verification": {"tampered_gate_status": tampered_gate["status"]},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_rice_slice.py)",
    }
    write_json(runtime / "results" / "wsjf_slice_result.json", result)
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
        result = run_wsjf_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["wsjf_score_record"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["no_automatic_authority_verification"]
    g = result["genuine_compute_guard_verification"]
    print(
        f"PASS decision.wsjf: cost_of_delay_total={record['cost_of_delay_total']}, wsjf_score={record['wsjf_score']}, gates [{gate_summary}], "
        f"no_automatic_authority_verified(runtime={v['runtime_layer_blocked']}, schema={v['schema_layer_blocked']}), "
        f"genuine_compute_guard_verified(tampered_gate={g['tampered_gate_status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
