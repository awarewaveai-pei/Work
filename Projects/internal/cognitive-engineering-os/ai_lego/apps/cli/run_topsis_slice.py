"""``decision.topsis`` vertical slice -- Method Atlas slice, 7th member of the ``decision`` family (F16),
after ``decision.ahp``/``decision.mcda``/``decision.impact_effort``/``decision.ice``/``decision.rice``/
``decision.moscow``.

Builds a real 3-vendor cloud-hosting selection (monthly cost in USD,
minimize; support quality 1-10, maximize; weights cost=0.6/quality=0.4),
computed by ``ai_lego/compute/topsis/distance.py::compute_topsis_ranking``
(hand-verified against a worked-by-hand closeness computation, then
cross-checked by a live Python run, before this CLI was written -- see that
module's own docstring). Then proves all three headline invariants are
real, at both layers: ``TOPSIS_TOO_FEW_OPTIONS`` fires at construction for a
1-option input; the ``genuine_compute`` gate catches a hand-tampered
``ranking`` on a copy of an already-valid record; and ``topsis_structure``
independently catches a hand-stripped option, not just relying on the
construction-time check.

Run::

    python -m ai_lego.apps.cli.run_topsis_slice
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
from ai_lego.modules.decision.topsis import (
    METHOD_ID,
    all_gates_pass,
    evaluate_topsis_gates,
    evaluate_topsis_structure_gate,
    generate_topsis_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-TOPSIS-SYNTHETIC-001"
EXECUTION_ID = "EX-TOPSIS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-TOPSIS-001"

S = {
    "topsis_analysis": "ai-lego://specs/cognitive/typed-objects/topsis-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-topsis-slice"


def run_topsis_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real decision: pick a cloud-hosting vendor among 3, weighing monthly cost (minimize) against
    # support quality (maximize). Hand-verified closeness_coefficient before this CLI was written (see
    # ai_lego/compute/topsis/distance.py's own module docstring): V1=0.6, V2=0.5 (exactly equidistant --
    # its own weighted vector is the midpoint between the negative and positive ideal), V3=0.4. ---
    options = [{"id": "V1", "label": "Vendor A"}, {"id": "V2", "label": "Vendor B"}, {"id": "V3", "label": "Vendor C"}]
    criteria = [{"id": "COST", "label": "Monthly cost (USD)", "direction": "minimize"}, {"id": "QUALITY", "label": "Support quality (1-10)", "direction": "maximize"}]
    raw_scores = [
        {"option_id": "V1", "criterion_id": "COST", "raw_value": 1000},
        {"option_id": "V1", "criterion_id": "QUALITY", "raw_value": 1},
        {"option_id": "V2", "criterion_id": "COST", "raw_value": 2000},
        {"option_id": "V2", "criterion_id": "QUALITY", "raw_value": 5},
        {"option_id": "V3", "criterion_id": "COST", "raw_value": 3000},
        {"option_id": "V3", "criterion_id": "QUALITY", "raw_value": 9},
    ]
    weights = [{"criterion_id": "COST", "weight": 0.6}, {"criterion_id": "QUALITY", "weight": 0.4}]
    descriptor, topsis_analysis = catalog.invoke(
        METHOD_ID,
        generate_topsis_analysis,
        "TOPSIS-2026-09-08-001",
        options,
        criteria,
        raw_scores,
        weights,
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["topsis_analysis"], topsis_analysis, "topsis analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TopsisAnalysisGenerated", {"topsis_analysis": topsis_analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_topsis_gates(topsis_analysis, "run_topsis_slice", clock.at(1.1))
    for g in gate_results:
        contracts.validate(S["gate_result"], g, f"topsis gate {g['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"TOPSIS_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TopsisGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Cross-check against the hand-verified expectation (see compute module docstring). If this ever
    # drifts (a future change to normalize_scores or compute_topsis_ranking), the CLI itself fails loudly
    # rather than silently printing a different ranking. ---
    closeness_by_option = {entry["option_id"]: entry["closeness_coefficient"] for entry in topsis_analysis["ranking"]}
    expected_closeness = {"V1": 0.6, "V2": 0.5, "V3": 0.4}
    hand_verified_match = all(abs(closeness_by_option[option_id] - expected) < 1e-8 for option_id, expected in expected_closeness.items())
    if not hand_verified_match:
        raise InvariantViolation(f"TOPSIS_HAND_VERIFIED_MISMATCH: computed {closeness_by_option}, expected {expected_closeness}")

    # --- Prove TOPSIS_TOO_FEW_OPTIONS (invariant #3) is real at the CONSTRUCTION layer: a single-option
    # input must be refused. ---
    too_few_blocked = False
    try:
        generate_topsis_analysis(
            "TOPSIS-2026-09-08-002",
            [{"id": "SOLO", "label": "only option"}],
            criteria,
            [{"option_id": "SOLO", "criterion_id": "COST", "raw_value": 1}, {"option_id": "SOLO", "criterion_id": "QUALITY", "raw_value": 1}],
            weights,
            make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        too_few_blocked = "TOPSIS_TOO_FEW_OPTIONS" in str(error)
    if not too_few_blocked:
        raise InvariantViolation("TOPSIS_INVARIANT_GUARD_DID_NOT_FIRE: a single-option analysis was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer (invariants #1
    # and #2): hand-tamper a COPY of the valid record's stored ranking (swap two options' own
    # closeness_coefficient) and confirm the genuine_compute gate catches it. ---
    tampered_ranking = copy.deepcopy(topsis_analysis)
    tampered_ranking["ranking"][0]["closeness_coefficient"], tampered_ranking["ranking"][1]["closeness_coefficient"] = (
        tampered_ranking["ranking"][1]["closeness_coefficient"],
        tampered_ranking["ranking"][0]["closeness_coefficient"],
    )
    tampered_gate_results = evaluate_topsis_gates(tampered_ranking, "run_topsis_slice", clock.at(1.3))
    genuine_compute_result = next(g for g in tampered_gate_results if g["gate_id"] == "genuine_compute")
    genuine_compute_tamper_caught = genuine_compute_result["status"] == "FAIL"
    if not genuine_compute_tamper_caught:
        raise InvariantViolation(f"TOPSIS_GATE_GUARD_DID_NOT_FIRE: genuine_compute did not flag a hand-tampered ranking (status={genuine_compute_result['status']})")

    # --- Prove topsis_structure (invariant #3) independently catches a hand-stripped option on a COPY of
    # the valid record too -- not just TOPSIS_TOO_FEW_OPTIONS's own construction-time check. Strips down to
    # exactly 1 (not just one fewer -- this scenario has 3, and 3-1=2 is still a legal option count). ---
    stripped = copy.deepcopy(topsis_analysis)
    stripped["options"] = stripped["options"][:1]
    structure_result = evaluate_topsis_structure_gate(stripped, "run_topsis_slice", clock.at(1.4))
    structure_tamper_caught = structure_result["status"] == "FAIL"
    if not structure_tamper_caught:
        raise InvariantViolation(f"TOPSIS_GATE_GUARD_DID_NOT_FIRE: topsis_structure did not flag a hand-stripped option (status={structure_result['status']})")

    invariant_verification = {
        "hand_verified_closeness_match": hand_verified_match,
        "too_few_options_construction_blocked": too_few_blocked,
        "genuine_compute_gate_caught_tamper": genuine_compute_tamper_caught,
        "topsis_structure_gate_caught_stripped_option": structure_tamper_caught,
    }
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TopsisInvariantVerified", invariant_verification, 1.5)
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
        "topsis_analysis": topsis_analysis,
        "gate_results": gate_results,
        "invariant_verification": invariant_verification,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_mcda_slice.py)",
    }
    write_json(runtime / "results" / "topsis_slice_result.json", result)
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
        result = run_topsis_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    analysis = result["topsis_analysis"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["invariant_verification"]
    ranking_summary = ", ".join(f"{r['option_id']}={r['closeness_coefficient']}" for r in analysis["ranking"])
    print(
        f"PASS decision.topsis: ranking=[{ranking_summary}], gates [{gate_summary}], "
        f"hand_verified_match={v['hand_verified_closeness_match']}, too_few_options_blocked={v['too_few_options_construction_blocked']}, "
        f"genuine_compute_tamper_caught={v['genuine_compute_gate_caught_tamper']}, structure_tamper_caught={v['topsis_structure_gate_caught_stripped_option']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
