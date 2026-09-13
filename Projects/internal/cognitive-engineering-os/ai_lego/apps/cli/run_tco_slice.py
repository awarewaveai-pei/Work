"""``feasibility.tco`` vertical slice -- F14 feasibility & economics family, sibling method 1/2 built this batch
(with ``feasibility.unit_economics``).

Builds a real, well-formed ``TotalCostOfOwnership`` from a hand-computed worked example (12 named categories
summing to 187500.50), then demonstrates THE real invariant (a missing category is refused -- an omitted
category is exactly a hidden cost slipping through unexamined) is not toothless, demonstrates ``total_tco``
cannot be smuggled in as a caller-supplied argument, and finally hand-tampers a VALID record's own
``total_tco`` directly (bypassing the builder) to prove the independent gate, not just the builder, catches the
defect.

Run::

    python -m ai_lego.apps.cli.run_tco_slice
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.feasibility.tco import (
    COST_CATEGORIES,
    METHOD_ID,
    all_gates_pass,
    evaluate_tco_gates,
    generate_tco,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-TCO-SYNTHETIC-001"
EXECUTION_ID = "EX-TCO-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-TCO-001"

S = {
    "tco": "ai-lego://specs/cognitive/typed-objects/total-cost-of-ownership.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-tco-slice"


def _well_formed_cost_categories() -> dict[str, float]:
    # Hand-computed: 0+45000+32000.5+60000+28000+9000+6000+4000+2500+0+1000+0 = 187500.5
    return {
        "purchase": 0,
        "implementation": 45000,
        "migration": 32000.5,
        "people": 60000,
        "operation": 28000,
        "support": 9000,
        "security": 6000,
        "compliance": 4000,
        "downtime": 2500,
        "exit": 0,
        "data_egress": 1000,
        "decommission": 0,
    }


def run_tco_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed TCO -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate. Hand-computed total: 187500.50. ---
    descriptor, tco = catalog.invoke(
        METHOD_ID,
        generate_tco,
        "TCO-2026-09-12-001",
        "遷移現有自架 PostgreSQL 到 Managed Cloud DB 服務（3 年期）",
        _well_formed_cost_categories(),
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["tco"], tco, "total cost of ownership")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TotalCostOfOwnershipGenerated", {"tco": tco, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    if tco["total_tco"] != 187500.5:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"TCO_HAND_COMPUTED_MISMATCH: expected 187500.5, got {tco['total_tco']!r}")

    gate_results = evaluate_tco_gates(tco, "run_tco_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"feasibility.tco gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("TCO_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (missing category refused) is not toothless -- drop "exit" entirely. ---
    incomplete_categories = {k: v for k, v in _well_formed_cost_categories().items() if k != "exit"}
    missing_category_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_tco("TCO-MISSING-REFUSED-001", "測試：缺一個類別", incomplete_categories, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "TCO_INVALID_COST_CATEGORIES" not in str(error):
            raise
        missing_category_proof["raised"] = True
        missing_category_proof["error_code"] = "TCO_INVALID_COST_CATEGORIES"
    if not missing_category_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("TCO_INVARIANT_NOT_ENFORCED: a missing cost category was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingCostCategoryRefused", {"refusal_proof": missing_category_proof}, 1.2)
    milestones.append("MISSING_CATEGORY_REFUSAL_PROVEN")

    # --- Step 3: proof total_tco cannot be smuggled in as a caller-supplied argument -- the builder has no such
    # parameter at all, so this is a plain TypeError, not a silently-accepted value. ---
    smuggle_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_tco(
            "TCO-SMUGGLE-REFUSED-001",
            "測試：偷塞 total_tco",
            _well_formed_cost_categories(),
            make_provenance("AI_INFERENCE", "AI_GENERATED"),
            total_tco=1.0,  # type: ignore[call-arg]
        )
    except TypeError:
        smuggle_proof["raised"] = True
        smuggle_proof["error_type"] = "TypeError"
    if not smuggle_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("TCO_INVARIANT_NOT_ENFORCED: a smuggled total_tco= argument was NOT refused -- GENUINE_COMPUTE is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "SmuggledTotalTcoRefused", {"refusal_proof": smuggle_proof}, 1.3)
    milestones.append("SMUGGLED_TOTAL_TCO_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (rewrites a VALID record's own total_tco directly). ---
    tampered = dict(tco)
    tampered["total_tco"] = 1.0  # was 187500.5 -- bypasses the builder directly
    tampered_gate = evaluate_tco_gates(tampered, "run_tco_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("TCO_GATE_NOT_INDEPENDENT: the independent total_tco_integrity gate did NOT catch a hand-tampered total_tco")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "tco": tco,
        "gate_results": gate_results,
        "missing_category_proof": missing_category_proof,
        "smuggle_proof": smuggle_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fmea_slice.py)",
    }
    write_json(runtime / "results" / "tco_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_tco_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS feasibility.tco: TotalCostOfOwnership {result['tco']['id']} total_tco={result['tco']['total_tco']} "
        f"(hand-computed across {len(COST_CATEGORIES)} categories), gates [{gate_summary}]; missing-category/smuggled-total_tco "
        f"invariants each REFUSED a malformed attempt; hand-tampered total_tco caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
