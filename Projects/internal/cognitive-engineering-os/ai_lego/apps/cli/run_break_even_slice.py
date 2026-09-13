"""``feasibility.break_even`` vertical slice -- F14 feasibility family, first of two members built this batch.

Builds a real, well-formed ``BreakEvenAnalysis`` from a hand-computed worked example (fixed_cost=120000,
contribution_margin_per_unit=15 -> break_even_volume_units=8000), then demonstrates THE real invariant (a
non-positive contribution margin is refused, never crashes, never silently returns a negative/zero/inf value) is
not toothless, demonstrates ``break_even_volume_units`` cannot be smuggled in as a caller-supplied argument, and
finally hand-tampers a VALID record's own ``break_even_volume_units`` directly (bypassing the builder) to prove
the independent gate, not just the builder, catches the defect.

Run::

    python -m ai_lego.apps.cli.run_break_even_slice
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
from ai_lego.modules.feasibility.break_even import (
    METHOD_ID,
    all_gates_pass,
    evaluate_break_even_gates,
    generate_break_even_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BREAKEVEN-SYNTHETIC-001"
EXECUTION_ID = "EX-BREAKEVEN-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BREAKEVEN-001"

S = {
    "break_even_analysis": "ai-lego://specs/cognitive/typed-objects/break-even-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-break-even-slice"


def _well_formed_analysis_kwargs() -> dict[str, Any]:
    return {
        "subject_ref": "新產品線 X 的第一年定價方案",
        "fixed_cost": 120000,
        "contribution_margin_per_unit": 15,
        "provenance": make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"),
    }


def run_break_even_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed analysis -- every real invariant satisfied, invoked through the
    # catalog's own per-invocation gate. Hand-computed: 120000/15 = 8000. ---
    descriptor, analysis = catalog.invoke(
        METHOD_ID,
        generate_break_even_analysis,
        "BEVEN-2026-09-12-001",
        **_well_formed_analysis_kwargs(),
    )
    contracts.validate(S["break_even_analysis"], analysis, "break-even analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BreakEvenAnalysisGenerated", {"analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    if analysis["break_even_volume_units"] != 8000:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"BREAKEVEN_HAND_COMPUTED_MISMATCH: expected 8000, got {analysis['break_even_volume_units']!r}")

    gate_results = evaluate_break_even_gates(analysis, "run_break_even_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"feasibility.break_even gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("BREAKEVEN_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof THE real invariant (the non-positive contribution margin trap) is not toothless. ---
    nonpositive_margin_kwargs = {**_well_formed_analysis_kwargs(), "contribution_margin_per_unit": 0}
    nonpositive_margin_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_break_even_analysis("BEVEN-NONPOSMARGIN-REFUSED-001", **nonpositive_margin_kwargs)
    except InvariantViolation as error:
        if "BREAKEVEN_NONPOSITIVE_CONTRIBUTION_MARGIN" not in str(error):
            raise
        nonpositive_margin_proof["raised"] = True
        nonpositive_margin_proof["error_code"] = "BREAKEVEN_NONPOSITIVE_CONTRIBUTION_MARGIN"
    if not nonpositive_margin_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BREAKEVEN_INVARIANT_NOT_ENFORCED: a zero contribution margin was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NonPositiveContributionMarginRefused", {"refusal_proof": nonpositive_margin_proof}, 1.2)
    milestones.append("NONPOSITIVE_MARGIN_REFUSAL_PROVEN")

    # --- Step 3: proof break_even_volume_units cannot be smuggled in as a caller-supplied argument -- the builder
    # has no such parameter at all, so this is a plain TypeError, not a silently-accepted value. ---
    smuggle_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_break_even_analysis("BEVEN-SMUGGLE-REFUSED-001", **_well_formed_analysis_kwargs(), break_even_volume_units=1)  # type: ignore[call-arg]
    except TypeError:
        smuggle_proof["raised"] = True
        smuggle_proof["error_type"] = "TypeError"
    if not smuggle_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BREAKEVEN_INVARIANT_NOT_ENFORCED: a smuggled break_even_volume_units= argument was NOT refused -- GENUINE_COMPUTE is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SmuggledVolumeRefused", {"refusal_proof": smuggle_proof}, 1.3)
    milestones.append("SMUGGLED_VOLUME_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (rewrites a VALID record's own break_even_volume_units directly). ---
    tampered = dict(analysis)
    tampered["break_even_volume_units"] = 1  # was 8000 -- bypasses the builder directly
    tampered_gate = evaluate_break_even_gates(tampered, "run_break_even_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("BREAKEVEN_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered break_even_volume_units")
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
        "analysis": analysis,
        "gate_results": gate_results,
        "nonpositive_margin_proof": nonpositive_margin_proof,
        "smuggle_proof": smuggle_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bayesian_updating_slice.py)",
    }
    write_json(runtime / "results" / "break_even_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_break_even_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS feasibility.break_even: BreakEvenAnalysis {result['analysis']['id']} break_even_volume_units={result['analysis']['break_even_volume_units']} "
        f"(hand-computed 120000/15=8000), gates [{gate_summary}]; non-positive-margin/smuggled-volume invariants each REFUSED a malformed "
        f"attempt; hand-tampered break_even_volume_units caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
