"""``challenge.hazop`` vertical slice -- F12 challenge/red-team/risk family, ninth built member.

Scenario: the same synthetic weekend-database-migration proposal ``challenge.red_team``'s own CLI demo attacks,
now examined node-by-node with HAZOP guide words instead. Builds a real, well-formed ``HazopStudy`` satisfying
every real invariant, then demonstrates two of them each as a construction-time REFUSAL (a deviation referencing
a node that does not exist; a deviation using a guide word outside the closed 11-word vocabulary), proving
neither is toothless, same "show a real refusal, not only a real success" discipline every sibling slice's CLI
demo already establishes. A final step hand-tampers a VALID record directly (bypassing the builder, splicing a
dangling node_id into a deviation) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_hazop_slice
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
from ai_lego.modules.challenge.hazop import (
    METHOD_ID,
    all_gates_pass,
    evaluate_hazop_gates,
    generate_hazop_study,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-HAZOP-SYNTHETIC-001"
EXECUTION_ID = "EX-HAZOP-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-HAZOP-001"

S = {
    "hazop_study": "ai-lego://specs/cognitive/typed-objects/hazop-study.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-hazop-slice"


def _nodes() -> list[dict[str, Any]]:
    return [
        {"id": "N1", "description": "自動觸發週末遷移排程"},
        {"id": "N2", "description": "資料庫連線從舊機房切換到新機房"},
    ]


def _deviations() -> list[dict[str, Any]]:
    return [
        {
            "node_id": "N1",
            "guide_word": "EARLY",
            "cause": "排程時鐘漂移或人為提前手動觸發",
            "consequence": "尚有生產流量時就開始遷移，資料處於不一致視窗",
            "safeguard": "",
            "risk_rating": 7,
        },
        {
            "node_id": "N2",
            "guide_word": "OTHER_THAN",
            "cause": "設定檔誤填，切換到錯誤的目標資料庫實例",
            "consequence": "客戶資料寫入錯誤環境，需要額外回復程序",
            "safeguard": "部署前腳本自動核對目標連線字串與預期主機指紋",
            "risk_rating": 9,
        },
        {
            "node_id": "N2",
            "guide_word": "NO_NOT",
            "cause": "（已檢查：新機房連線設定經過雙人覆核，未發現此偏差的實際成因）",
            "consequence": "N/A -- examined, no real deviation found",
            "safeguard": "",
        },
    ]


def _well_formed_study_kwargs() -> dict[str, Any]:
    return {
        "nodes": _nodes(),
        "deviations": _deviations(),
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_hazop_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. challenge.hazop resolves because its contract
    # is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed study -- 2 nodes, 3 deviations (2 real findings + 1 clean pass),
    # invoked through the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, study = catalog.invoke(
        METHOD_ID,
        generate_hazop_study,
        "HAZOP-2026-09-11-001",
        **_well_formed_study_kwargs(),
    )
    contracts.validate(S["hazop_study"], study, "hazop study")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "HazopStudyGenerated", {"study": study, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_hazop_gates(study, "run_hazop_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"challenge.hazop gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("HAZOP_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof the referential-integrity invariant is not toothless -- a deviation naming a node_id that
    # does not exist in nodes MUST be refused before any record is constructed. ---
    dangling_node_kwargs = {**_well_formed_study_kwargs(), "deviations": _deviations() + [{"node_id": "N99", "guide_word": "LATE", "cause": "x", "consequence": "y", "safeguard": ""}]}
    dangling_node_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_hazop_study("HAZOP-DANGLING-NODE-REFUSED-001", **dangling_node_kwargs)
    except InvariantViolation as error:
        if "HAZOP_DEVIATION_UNKNOWN_NODE" not in str(error):
            raise
        dangling_node_refusal_proof["raised"] = True
        dangling_node_refusal_proof["error_code"] = "HAZOP_DEVIATION_UNKNOWN_NODE"
    if not dangling_node_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("HAZOP_INVARIANT_NOT_ENFORCED: a deviation referencing a non-existent node was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DanglingNodeReferenceRefused", {"refusal_proof": dangling_node_refusal_proof}, 1.3)
    milestones.append("DANGLING_NODE_REFUSAL_PROVEN")

    # --- Step 3: proof the closed-vocabulary invariant is not toothless -- a deviation using a guide_word outside
    # the 11-word set MUST be refused before any record is constructed. ---
    invalid_guide_word_kwargs = {**_well_formed_study_kwargs(), "deviations": _deviations() + [{"node_id": "N1", "guide_word": "VIBES", "cause": "x", "consequence": "y", "safeguard": ""}]}
    invalid_guide_word_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_hazop_study("HAZOP-INVALID-GUIDE-WORD-REFUSED-001", **invalid_guide_word_kwargs)
    except InvariantViolation as error:
        if "HAZOP_INVALID_GUIDE_WORD" not in str(error):
            raise
        invalid_guide_word_refusal_proof["raised"] = True
        invalid_guide_word_refusal_proof["error_code"] = "HAZOP_INVALID_GUIDE_WORD"
    if not invalid_guide_word_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("HAZOP_INVARIANT_NOT_ENFORCED: a deviation using a guide_word outside the closed 11-word set was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "InvalidGuideWordRefused", {"refusal_proof": invalid_guide_word_refusal_proof}, 1.5)
    milestones.append("INVALID_GUIDE_WORD_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a dangling node_id into a VALID record's own raw dict, after construction). ---
    tampered = dict(study)
    tampered["deviations"] = [dict(d) for d in study["deviations"]] + [{"node_id": "N99", "guide_word": "LATE", "cause": "x", "consequence": "y", "safeguard": ""}]
    tampered_gate = evaluate_hazop_gates(tampered, "run_hazop_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("HAZOP_GATE_NOT_INDEPENDENT: the independent content-integrity gate did NOT catch a hand-tampered dangling node_id reference")
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
        "study": study,
        "gate_results": gate_results,
        "dangling_node_refusal_proof": dangling_node_refusal_proof,
        "invalid_guide_word_refusal_proof": invalid_guide_word_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_game_theory_slice.py)",
    }
    write_json(runtime / "results" / "hazop_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_hazop_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS challenge.hazop: HazopStudy {result['study']['id']} built ({len(result['study']['nodes'])} nodes, "
        f"{len(result['study']['deviations'])} deviations), gates [{gate_summary}]; "
        f"HAZOP_DEVIATION_UNKNOWN_NODE/HAZOP_INVALID_GUIDE_WORD invariants each REFUSED a malformed attempt "
        f"({result['dangling_node_refusal_proof']['error_code']}, {result['invalid_guide_word_refusal_proof']['error_code']}); "
        f"hand-tampered dangling node_id caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
