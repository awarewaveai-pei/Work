"""``strategy.pestel`` vertical slice -- 2nd F08 context/strategy family tenant (after `strategy.swot`).

Scenario: a market-entry PESTEL scan for a data-center operator evaluating
Singapore expansion -- 3 factors across 3 distinct dimensions (Political,
Economic, Environmental), one with an open-ended validity window
(``effective_to: null``). Builds a real, well-formed ``PESTELAnalysis``
covering Atlas §11.9's own 9-field necessary-fields block, then demonstrates
each of this method's 4 real structural invariants once as a construction-time
REFUSAL (invalid dimension; invalid source_type; effective_to before
effective_from; empty factor set), proving none is toothless, same "show a
real refusal, not only a real success" discipline every sibling slice's CLI
demo already establishes. A final step hand-tampers a VALID analysis directly
(bypassing the builder) to prove the independent gate, not just the builder,
catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_pestel_slice
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
from ai_lego.modules.strategy.pestel import (
    METHOD_ID,
    all_gates_pass,
    evaluate_pestel_gates,
    generate_pestel_analysis,
    pestel_factor,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PESTEL-SYNTHETIC-001"
EXECUTION_ID = "EX-PESTEL-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PESTEL-001"

S = {
    "pestel_analysis": "ai-lego://specs/cognitive/typed-objects/pestel-analysis.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-pestel-slice"


def _well_formed_factors() -> list[dict[str, Any]]:
    return [
        pestel_factor(
            "PESTEL-2026-09-11-001-F1", "POLITICAL",
            "地方政府宣布 2027 年起外資設立資料中心需通過新的能源使用審查", "SG",
            "經濟發展局 2026-08 政策公告", "official", "2026-08-01", None,
            "審查門檻逐年收緊", "新設施的能源效率設計需提前納入合規評估", "high",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-401"],
        ),
        pestel_factor(
            "PESTEL-2026-09-11-001-F2", "ECONOMIC",
            "區域內平均雲端運算成本連續四季下降", "APAC",
            "市場研究報告 2026-Q2", "research", "2026-01-01", "2026-12-31",
            "年降幅約 6-8%", "新進入者的固定成本門檻降低", 0.7,
            make_provenance("EVIDENCE", "AI_SUGGESTED"), supporting_evidence_refs=["E-402"],
        ),
        pestel_factor(
            "PESTEL-2026-09-11-001-F3", "ENVIRONMENTAL",
            "鄰近港口城市預期收緊資料中心用水配額", "SG",
            "現場訪談筆記", "other", "2026-06-01", None,
            "配額討論仍在進行，方向未定", "選址評估需納入用水風險，方案尚未定案", "low -- single unconfirmed source",
            make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
    ]


def run_pestel_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.pestel resolves because its contract is
    # ACTIVE in the spec root's methods/contracts/, exactly the same mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed analysis -- all 3 factors across 3 dimensions, all invariants satisfied.
    # No knowledge_set argument (unlike run_swot_slice.py) -- PESTEL factors are self-evidencing, see pestel.py. ---
    descriptor, analysis = catalog.invoke(METHOD_ID, generate_pestel_analysis, "PESTEL-2026-09-11-001", _well_formed_factors())
    contracts.validate(S["pestel_analysis"], analysis, "pestel analysis")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PestelAnalysisGenerated", {"pestel_analysis": analysis, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_pestel_gates(analysis, "run_pestel_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.pestel gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        failing = [gate["gate_id"] for gate in gate_results if gate["status"] not in {"PASS", "NOT_APPLICABLE"}]
        raise InvariantViolation(f"PESTEL_GATE_FAILED on the deliberately well-formed analysis: {', '.join(failing)}")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the dimension-enum invariant is not toothless. ---
    invalid_dimension_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        pestel_factor(
            "PESTEL-REFUSED-DIM-001-F1", "MACROECONOMIC",  # not one of the 6 real dimensions
            "statement", "SG", "source", "official", "2026-01-01", None, "trend", "implication", "confidence",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "PESTEL_INVALID_DIMENSION" not in str(error):
            raise
        invalid_dimension_proof["raised"] = True
        invalid_dimension_proof["error_code"] = "PESTEL_INVALID_DIMENSION"
    if not invalid_dimension_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PESTEL_INVARIANT_NOT_ENFORCED: an invalid dimension was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InvalidDimensionRefused", {"refusal_proof": invalid_dimension_proof}, 1.3)
    milestones.append("INVALID_DIMENSION_REFUSAL_PROVEN")

    # --- Step 3: proof the source_type-enum invariant (Atlas L1390's own closed enum) is not toothless. ---
    invalid_source_type_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        pestel_factor(
            "PESTEL-REFUSED-SRC-001-F1", "LEGAL",
            "statement", "SG", "source", "rumor",  # not one of official|research|market|other
            "2026-01-01", None, "trend", "implication", "confidence",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "PESTEL_INVALID_SOURCE_TYPE" not in str(error):
            raise
        invalid_source_type_proof["raised"] = True
        invalid_source_type_proof["error_code"] = "PESTEL_INVALID_SOURCE_TYPE"
    if not invalid_source_type_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PESTEL_INVARIANT_NOT_ENFORCED: an invalid source_type was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "InvalidSourceTypeRefused", {"refusal_proof": invalid_source_type_proof}, 1.5)
    milestones.append("INVALID_SOURCE_TYPE_REFUSAL_PROVEN")

    # --- Step 4: proof the effective_from/effective_to ordering invariant is not toothless. ---
    backwards_window_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        pestel_factor(
            "PESTEL-REFUSED-WINDOW-001-F1", "ECONOMIC",
            "statement", "SG", "source", "market", "2026-12-31", "2026-01-01",  # effective_to before effective_from
            "trend", "implication", "confidence",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        )
    except InvariantViolation as error:
        if "PESTEL_EFFECTIVE_TO_BEFORE_FROM" not in str(error):
            raise
        backwards_window_proof["raised"] = True
        backwards_window_proof["error_code"] = "PESTEL_EFFECTIVE_TO_BEFORE_FROM"
    if not backwards_window_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PESTEL_INVARIANT_NOT_ENFORCED: a backwards validity window was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BackwardsWindowRefused", {"refusal_proof": backwards_window_proof}, 1.7)
    milestones.append("BACKWARDS_WINDOW_REFUSAL_PROVEN")

    # --- Step 5: proof the empty-factor-set invariant is not toothless. ---
    empty_factor_set_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_pestel_analysis("PESTEL-REFUSED-EMPTY-001", [])
    except InvariantViolation as error:
        if "PESTEL_EMPTY_FACTOR_SET" not in str(error):
            raise
        empty_factor_set_proof["raised"] = True
        empty_factor_set_proof["error_code"] = "PESTEL_EMPTY_FACTOR_SET"
    if not empty_factor_set_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("PESTEL_INVARIANT_NOT_ENFORCED: an empty factor set was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyFactorSetRefused", {"refusal_proof": empty_factor_set_proof}, 1.9)
    milestones.append("EMPTY_FACTOR_SET_REFUSAL_PROVEN")

    # --- Step 6: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely. ---
    tampered = dict(analysis)
    tampered["factors"] = [dict(f) for f in analysis["factors"]]
    tampered["factors"][0]["dimension"] = "MACROECONOMIC"  # bypasses the builder's own check directly on a raw copy
    tampered_gate = evaluate_pestel_gates(tampered, "run_pestel_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("PESTEL_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered invalid dimension")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedAnalysisCaughtByGate", {"tampered_gate_results": tampered_gate}, 2.1)
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
        "pestel_analysis": analysis,
        "gate_results": gate_results,
        "invalid_dimension_proof": invalid_dimension_proof,
        "invalid_source_type_proof": invalid_source_type_proof,
        "backwards_window_proof": backwards_window_proof,
        "empty_factor_set_proof": empty_factor_set_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_swot_slice.py)",
    }
    write_json(runtime / "results" / "pestel_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_pestel_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.pestel: PESTELAnalysis {result['pestel_analysis']['id']} built with "
        f"{len(result['pestel_analysis']['factors'])} factors, gates [{gate_summary}]; "
        f"INVALID_DIMENSION invariant REFUSED ({result['invalid_dimension_proof']['error_code']}); "
        f"INVALID_SOURCE_TYPE invariant REFUSED ({result['invalid_source_type_proof']['error_code']}); "
        f"EFFECTIVE_TO_BEFORE_FROM invariant REFUSED ({result['backwards_window_proof']['error_code']}); "
        f"EMPTY_FACTOR_SET invariant REFUSED ({result['empty_factor_set_proof']['error_code']}); "
        f"hand-tampered dimension caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
