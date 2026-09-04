"""``devops_sre.sli_slo`` vertical slice -- the twentieth Method Atlas slice, first from the `devops_sre` family
(F19's own "DevOps／SRE／可靠性套件", a second pack this session opens after F18).

Builds a real 2-indicator set for a Checkout API: a latency SLO with no
SLA, and an availability SLO with a commercial SLA (exercising Atlas's
own SLI-then-SLO-then-SLA precedence principle both ways). Then
demonstrates the SLA-requires-terms invariant is real by attempting to
declare sla_required:true with no terms and confirming it is refused.

Run::

    python -m ai_lego.apps.cli.run_sli_slo_slice
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
from ai_lego.modules.devops_sre.sli_slo import (
    METHOD_ID,
    all_gates_pass,
    evaluate_sli_slo_set_gates,
    generate_sli_slo_set,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-SLISLO-SYNTHETIC-001"
EXECUTION_ID = "EX-SLISLO-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-SLISLO-001"

S = {
    "sli_slo_set": "ai-lego://specs/cognitive/typed-objects/sli-slo-set.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-slislo-slice"


def run_sli_slo_slice(config: SliceConfig) -> dict[str, Any]:
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

    indicators = [
        {"id": "IND1", "metric_type": "latency", "sli_description": "p99 API 回應時間", "slo_target": "p99 < 300ms，30 天滾動窗口", "sla_required": False},
        {"id": "IND2", "metric_type": "availability", "sli_description": "成功請求比例", "slo_target": "99.9% 可用性，30 天滾動窗口", "sla_required": True, "sla_terms": "低於 99.5% 時客戶可申請當月帳單 10% 折讓"},
    ]
    descriptor, sli_set = catalog.invoke(
        METHOD_ID,
        generate_sli_slo_set,
        "SLO-2026-09-04-001",
        "Checkout API",
        indicators,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["sli_slo_set"], sli_set, "sli slo set")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SliSloSetGenerated", {"sli_slo_set": sli_set, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_sli_slo_set_gates(sli_set, "run_sli_slo_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"sli slo gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"SLISLO_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SliSloGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Prove the SLA-requires-terms invariant is real: attempt to declare sla_required:true with no terms.
    # Must be refused. ---
    terms_blocked = False
    try:
        generate_sli_slo_set(
            "SLO-2026-09-04-002",
            "x",
            [{"id": "IND1", "metric_type": "durability", "sli_description": "x", "slo_target": "x", "sla_required": True}],
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
        )
    except InvariantViolation:
        terms_blocked = True
    if not terms_blocked:
        raise InvariantViolation("SLISLO_TERMS_GUARD_DID_NOT_FIRE: an sla_required indicator with no sla_terms was accepted")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SliSloSlaTermsInvariantVerified", {"terms_blocked": terms_blocked}, 1.3)
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
        "sli_slo_set": sli_set,
        "gate_results": gate_results,
        "sla_terms_invariant_verification": {"terms_blocked": terms_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "slislo_slice_result.json", result)
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
        result = run_sli_slo_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    sli_set = result["sli_slo_set"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS devops_sre.sli_slo: indicators={len(sli_set['indicators'])}, gates [{gate_summary}], "
        f"sla_terms_invariant_verified={result['sla_terms_invariant_verification']['terms_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
