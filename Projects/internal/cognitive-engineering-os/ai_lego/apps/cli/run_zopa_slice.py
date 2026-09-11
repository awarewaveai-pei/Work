"""``stakeholders.zopa`` vertical slice -- F07 stakeholder/power/negotiation family, OPENING member (F07 had
zero built methods before this batch; 1 of 10 concurrent agents opening every F07 member in this same parallel
batch).

Scenario: a salary negotiation ZOPA between a hiring manager (buyer) and a candidate (seller), with a real
overlap -- same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed
``ZopaAnalysis`` where the reservation points overlap (``zopa_exists=True``), then a second where they do NOT
(``zopa_exists=False``), proving both branches of the computed derivation are exercised, not just the happy
path. Then demonstrates each input-shape invariant once as a construction-time REFUSAL (a non-numeric
seller_minimum; a non-numeric buyer_maximum), proving neither is toothless. Two final steps hand-tamper a
VALID record directly (bypassing the builder) -- once on ``zopa_exists``, once on ``zopa_range`` -- to prove
the independent gate, not just the builder, catches each computed-field defect.

Run::

    python -m ai_lego.apps.cli.run_zopa_slice
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
from ai_lego.modules.stakeholders.zopa import (
    METHOD_ID,
    all_gates_pass,
    evaluate_zopa_gates,
    generate_zopa_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ZOPA-SYNTHETIC-001"
EXECUTION_ID = "EX-ZOPA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-ZOPA-001"

S = {
    "zopa_analysis": "ai-lego://specs/cognitive/typed-objects/zopa.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-zopa-slice"


def _overlap_kwargs() -> dict[str, Any]:
    return {
        "seller_minimum": 80000,
        "buyer_maximum": 95000,
        "provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    }


def _no_overlap_kwargs() -> dict[str, Any]:
    return {
        "seller_minimum": 100000,
        "buyer_maximum": 90000,
        "provenance": make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    }


def run_zopa_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. stakeholders.zopa resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the overlap case -- both reservation points overlap, zopa_exists computed True, zopa_range
    # computed as exactly [seller_minimum, buyer_maximum], invoked through the catalog's own per-invocation
    # gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, overlap_record = catalog.invoke(
        METHOD_ID,
        generate_zopa_analysis,
        "ZOPA-2026-09-11-001",
        **_overlap_kwargs(),
    )
    contracts.validate(S["zopa_analysis"], overlap_record, "zopa analysis (overlap)")
    if overlap_record["zopa_exists"] is not True or overlap_record["zopa_range"] != [80000, 95000]:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ZOPA_COMPUTE_WRONG: overlap case computed zopa_exists={overlap_record['zopa_exists']!r} zopa_range={overlap_record['zopa_range']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ZopaAnalysisGenerated", {"record": overlap_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    overlap_gate_results = evaluate_zopa_gates(overlap_record, "run_zopa_slice", clock.at(1.1))
    for gate in overlap_gate_results:
        contracts.validate(S["gate_result"], gate, f"stakeholders.zopa gate {gate['gate_id']}")
    if not all_gates_pass(overlap_gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("ZOPA_GATE_FAILED on the deliberately well-formed overlap record")
    milestones.append("GATES_PASSED")

    # --- Step 2: the no-overlap case -- reservation points do NOT overlap, zopa_exists computed False,
    # zopa_range computed None, proving the second branch is not merely assumed. ---
    _, no_overlap_record = catalog.invoke(
        METHOD_ID,
        generate_zopa_analysis,
        "ZOPA-2026-09-11-002",
        **_no_overlap_kwargs(),
    )
    contracts.validate(S["zopa_analysis"], no_overlap_record, "zopa analysis (no overlap)")
    if no_overlap_record["zopa_exists"] is not False or no_overlap_record["zopa_range"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ZOPA_COMPUTE_WRONG: no-overlap case computed zopa_exists={no_overlap_record['zopa_exists']!r} zopa_range={no_overlap_record['zopa_range']!r}")
    no_overlap_gate_results = evaluate_zopa_gates(no_overlap_record, "run_zopa_slice", clock.at(1.2))
    if not all_gates_pass(no_overlap_gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("ZOPA_GATE_FAILED on the deliberately well-formed no-overlap record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ZopaNoOverlapAnalysisGenerated", {"record": no_overlap_record}, 1.3)
    milestones.append("NO_OVERLAP_BRANCH_PROVEN")

    # --- Step 3: proof the seller_minimum shape invariant is not toothless -- a non-numeric seller_minimum
    # MUST be refused before any record is constructed. ---
    invalid_seller_kwargs = {**_overlap_kwargs(), "seller_minimum": "not-a-number"}
    invalid_seller_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_zopa_analysis("ZOPA-INVALID-SELLER-REFUSED-001", **invalid_seller_kwargs)
    except InvariantViolation as error:
        if "ZOPA_INVALID_SELLER_MINIMUM" not in str(error):
            raise
        invalid_seller_refusal_proof["raised"] = True
        invalid_seller_refusal_proof["error_code"] = "ZOPA_INVALID_SELLER_MINIMUM"
    if not invalid_seller_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ZOPA_INVARIANT_NOT_ENFORCED: a non-numeric seller_minimum was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InvalidSellerMinimumRefused", {"refusal_proof": invalid_seller_refusal_proof}, 1.5)
    milestones.append("INVALID_SELLER_MINIMUM_REFUSAL_PROVEN")

    # --- Step 4: proof the buyer_maximum shape invariant is not toothless -- a non-numeric buyer_maximum
    # MUST be refused before any record is constructed. ---
    invalid_buyer_kwargs = {**_overlap_kwargs(), "buyer_maximum": float("nan")}
    invalid_buyer_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_zopa_analysis("ZOPA-INVALID-BUYER-REFUSED-001", **invalid_buyer_kwargs)
    except InvariantViolation as error:
        if "ZOPA_INVALID_BUYER_MAXIMUM" not in str(error):
            raise
        invalid_buyer_refusal_proof["raised"] = True
        invalid_buyer_refusal_proof["error_code"] = "ZOPA_INVALID_BUYER_MAXIMUM"
    if not invalid_buyer_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ZOPA_INVARIANT_NOT_ENFORCED: a NaN buyer_maximum was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InvalidBuyerMaximumRefused", {"refusal_proof": invalid_buyer_refusal_proof}, 1.6)
    milestones.append("INVALID_BUYER_MAXIMUM_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof #1 -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (flips zopa_exists on a VALID record's own raw dict, after construction). ---
    tampered_exists = dict(overlap_record)
    tampered_exists["zopa_exists"] = False  # was computed True -- bypasses the builder directly
    tampered_exists_gate = evaluate_zopa_gates(tampered_exists, "run_zopa_slice", clock.at(2.0))
    if all_gates_pass(tampered_exists_gate):
        milestones.append("BLOCKED")
        raise InvariantViolation("ZOPA_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered zopa_exists")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedZopaExistsCaughtByGate", {"tampered_gate_results": tampered_exists_gate}, 2.1)
    milestones.append("TAMPERED_ZOPA_EXISTS_CAUGHT")

    # --- Step 6: hand-tampering proof #2 -- same proof for zopa_range specifically (a distinct computed
    # field from zopa_exists; catching one tamper must not be assumed to catch the other). ---
    tampered_range = dict(overlap_record)
    tampered_range["zopa_range"] = [1, 2]  # was [80000, 95000] -- bypasses the builder directly
    tampered_range_gate = evaluate_zopa_gates(tampered_range, "run_zopa_slice", clock.at(2.2))
    if all_gates_pass(tampered_range_gate):
        milestones.append("BLOCKED")
        raise InvariantViolation("ZOPA_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered zopa_range")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedZopaRangeCaughtByGate", {"tampered_gate_results": tampered_range_gate}, 2.3)
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
        "overlap_record": overlap_record,
        "no_overlap_record": no_overlap_record,
        "overlap_gate_results": overlap_gate_results,
        "invalid_seller_minimum_refusal_proof": invalid_seller_refusal_proof,
        "invalid_buyer_maximum_refusal_proof": invalid_buyer_refusal_proof,
        "tampered_zopa_exists_gate_results": tampered_exists_gate,
        "tampered_zopa_range_gate_results": tampered_range_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_jtbd_slice.py)",
    }
    write_json(runtime / "results" / "zopa_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_zopa_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["overlap_gate_results"])
    print(
        f"PASS stakeholders.zopa: ZopaAnalysis {result['overlap_record']['id']} (overlap) built, gates [{gate_summary}]; "
        f"no-overlap branch {result['no_overlap_record']['id']} computed zopa_exists=False/zopa_range=None; "
        f"ZOPA_INVALID_SELLER_MINIMUM/ZOPA_INVALID_BUYER_MAXIMUM invariants each REFUSED a malformed attempt "
        f"({result['invalid_seller_minimum_refusal_proof']['error_code']}, {result['invalid_buyer_maximum_refusal_proof']['error_code']}); "
        f"hand-tampered zopa_exists AND zopa_range each caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
