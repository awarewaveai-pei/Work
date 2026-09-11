"""``decomposition.mece`` vertical slice -- F02 decomposition & structuring family, opening member (built in
the same batch as ``decomposition.issue_tree``, disjoint files -- see ``run_bcg_matrix_slice.py`` for the
sibling-slice CLI style this reuses).

Scenario: a support-ticket triage classification -- same synthetic style every sibling slice's CLI demo
uses. Step 1 builds a real, well-formed ``MeceCheck`` over a clean classification (``is_mece: True``). Steps
2-3 demonstrate that a real overlap and a real gap are each a LEGAL outcome (``is_mece: False``), NOT a
construction-time refusal -- Atlas §12.7's own caution ("不是所有現實系統都能完美 MECE；不要為形式強切世界")
means a classification that genuinely fails the check is exactly what this method exists to surface. Step 4
demonstrates the one real REFUSAL this method does enforce: structurally malformed input (an empty
``universe_item_ids``). Step 5 hand-tampers a VALID record directly (bypassing the builder) to prove the
independent gate, not just the builder, catches a stored check result that disagrees with fresh
re-derivation.

Run::

    python -m ai_lego.apps.cli.run_mece_slice
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
from ai_lego.modules.decomposition.mece import (
    METHOD_ID,
    all_gates_pass,
    category,
    evaluate_mece_gates,
    generate_mece_check,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-MECE-SYNTHETIC-001"
EXECUTION_ID = "EX-MECE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-MECE-001"

S = {
    "mece_check": "ai-lego://specs/cognitive/typed-objects/mece-check.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-mece-slice"


def _clean_universe_and_categories() -> tuple[list[str], list[dict[str, Any]]]:
    universe = ["TICKET-1", "TICKET-2", "TICKET-3", "TICKET-4", "TICKET-5", "TICKET-6"]
    categories = [
        category("billing", ["TICKET-1", "TICKET-2"]),
        category("login", ["TICKET-3", "TICKET-4"]),
        category("shipping", ["TICKET-5", "TICKET-6"]),
    ]
    return universe, categories


def run_mece_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. decomposition.mece resolves because its
    # contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: a clean, well-formed classification -- is_mece: True. ---
    universe, categories = _clean_universe_and_categories()
    descriptor, clean_check = catalog.invoke(
        METHOD_ID,
        generate_mece_check,
        "MECE-2026-09-11-001",
        universe,
        categories,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["mece_check"], clean_check, "mece check (clean)")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MeceCheckGenerated", {"check": clean_check, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_mece_gates(clean_check, "run_mece_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"decomposition.mece gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("MECE_GATE_FAILED on the deliberately well-formed record")
    if not clean_check["is_mece"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("MECE_DEMO_SETUP_WRONG: the clean scenario was expected to be MECE")
    milestones.append("GATES_PASSED")

    # --- Step 2: a real OVERLAP (TICKET-2 in both billing and login) -- LEGAL outcome (is_mece: False), NOT
    # a construction-time refusal (Atlas §12.7's own caution, see module docstring). ---
    overlap_categories = [
        category("billing", ["TICKET-1", "TICKET-2"]),
        category("login", ["TICKET-2", "TICKET-3"]),
        category("shipping", ["TICKET-4", "TICKET-5", "TICKET-6"]),
    ]
    overlap_check = generate_mece_check("MECE-2026-09-11-002", universe, overlap_categories, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
    contracts.validate(S["mece_check"], overlap_check, "mece check (real overlap)")
    if overlap_check["is_mece"] or overlap_check["overlaps"] != ["TICKET-2"]:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MECE_DEMO_SETUP_WRONG: expected overlaps == ['TICKET-2'], got {overlap_check['overlaps']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MeceOverlapCheckedNotRefused", {"check": overlap_check}, 1.3)
    milestones.append("OVERLAP_CASE_ACCEPTED_AS_LEGAL")

    # --- Step 3: a real GAP (TICKET-6 in no category) -- also a LEGAL outcome, not a refusal. ---
    gap_categories = [
        category("billing", ["TICKET-1", "TICKET-2"]),
        category("login", ["TICKET-3", "TICKET-4"]),
        category("shipping", ["TICKET-5"]),
    ]
    gap_check = generate_mece_check("MECE-2026-09-11-003", universe, gap_categories, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
    contracts.validate(S["mece_check"], gap_check, "mece check (real gap)")
    if gap_check["is_mece"] or gap_check["gaps"] != ["TICKET-6"]:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"MECE_DEMO_SETUP_WRONG: expected gaps == ['TICKET-6'], got {gap_check['gaps']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "MeceGapCheckedNotRefused", {"check": gap_check}, 1.5)
    milestones.append("GAP_CASE_ACCEPTED_AS_LEGAL")

    # --- Step 4: the one real REFUSAL -- structurally malformed input (empty universe_item_ids) MUST be
    # refused before any record is constructed. ---
    empty_universe_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_mece_check("MECE-EMPTY-REFUSED-001", [], categories, make_provenance("CALCULATED_RESULT", "AI_GENERATED"))
    except InvariantViolation as error:
        if "MECE_INVALID_UNIVERSE" not in str(error):
            raise
        empty_universe_refusal_proof["raised"] = True
        empty_universe_refusal_proof["error_code"] = "MECE_INVALID_UNIVERSE"
    if not empty_universe_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("MECE_INVARIANT_NOT_ENFORCED: an empty universe_item_ids list was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyUniverseRefused", {"refusal_proof": empty_universe_refusal_proof}, 1.7)
    milestones.append("EMPTY_UNIVERSE_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses
    # the builder entirely (flips the stored is_mece/overlaps of the deliberately-clean Step 1 record to
    # values that disagree with its own universe_item_ids/categories). ---
    tampered = dict(clean_check)
    tampered["is_mece"] = False
    tampered["overlaps"] = ["TICKET-1"]  # was [] -- disagrees with the record's own universe/categories
    tampered_gate = evaluate_mece_gates(tampered, "run_mece_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("MECE_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered check result that disagrees with its own universe_item_ids/categories")
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
        "clean_check": clean_check,
        "overlap_check": overlap_check,
        "gap_check": gap_check,
        "gate_results": gate_results,
        "empty_universe_refusal_proof": empty_universe_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "mece_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_mece_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS decomposition.mece: MeceCheck {result['clean_check']['id']} built clean (is_mece=True), gates [{gate_summary}]; "
        f"real overlap {result['overlap_check']['overlaps']!r} and real gap {result['gap_check']['gaps']!r} each ACCEPTED as legal (is_mece=False), not refused; "
        f"MECE_INVALID_UNIVERSE invariant REFUSED a malformed attempt ({result['empty_universe_refusal_proof']['error_code']}); "
        f"hand-tampered check result caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
