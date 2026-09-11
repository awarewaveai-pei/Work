"""``stakeholders.power_interest`` vertical slice -- F07 stakeholder/power/negotiation family, OPENING member
(F07 had zero built methods before this batch; 1 of 10 concurrent agents opening every F07 member in the same
parallel batch).

Scenario: a Power-Interest Matrix for a small SaaS company's product-launch stakeholders, covering all 4 real
quadrants -- same synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed
``PowerInterestMatrix``, then demonstrates each of the 2 real invariants once as a construction-time REFUSAL
(an empty ``stakeholders`` list; a stakeholder with an empty ``power_reasoning``), proving neither is toothless,
same "show a real refusal, not only a real success" discipline every sibling slice's CLI demo already
establishes. A final step hand-tampers a VALID record directly (bypassing the builder) to prove the
independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_power_interest_slice
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
from ai_lego.modules.stakeholders.power_interest import (
    METHOD_ID,
    all_gates_pass,
    evaluate_power_interest_gates,
    generate_power_interest_matrix,
    stakeholder_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-POWINT-SYNTHETIC-001"
EXECUTION_ID = "EX-POWINT-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-POWINT-001"

S = {
    "power_interest_matrix": "ai-lego://specs/cognitive/typed-objects/power-interest-matrix.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-power-interest-slice"


def _well_formed_stakeholders() -> list[dict[str, Any]]:
    return [
        stakeholder_entry(
            "投資人董事會", 9, "掌握預算核准權與董事會席次，可直接否決重大決策",
            8, "本次產品線是公司下一輪募資的主要故事，高度關注上市時程",
        ),
        stakeholder_entry(
            "現有付費客戶社群", 8, "口碑與續約率直接影響營收，流失會立即反映在留存指標上",
            3, "多數客戶只在乎自己現有功能穩定，對新產品線本身關注度低",
        ),
        stakeholder_entry(
            "外部 SEO 內容外包團隊", 2, "僅負責內容產出，無預算或時程決定權",
            2, "只需按合約交付內容，對產品線走向沒有特別關注",
        ),
        stakeholder_entry(
            "內部客服團隊", 3, "無產品決策權，僅能回報客訴趨勢供參考",
            7, "新產品線上線後第一線要直接承接客訴與教學需求，高度關注上線細節",
        ),
    ]


def run_power_interest_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. stakeholders.power_interest resolves because
    # its contract is ACTIVE in the spec root's methods/contracts/, exactly the mechanism every sibling slice
    # uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed matrix -- both real invariants satisfied, invoked through the
    # catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, matrix = catalog.invoke(
        METHOD_ID,
        generate_power_interest_matrix,
        "POWINT-2026-09-11-001",
        _well_formed_stakeholders(),
        make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    contracts.validate(S["power_interest_matrix"], matrix, "power interest matrix")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PowerInterestMatrixGenerated", {"matrix": matrix, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_power_interest_gates(matrix, "run_power_interest_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stakeholders.power_interest gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("POWINT_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (non-empty stakeholders) is not toothless -- an empty stakeholders list
    # MUST be refused before any record is constructed. ---
    empty_stakeholders_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_power_interest_matrix("POWINT-EMPTY-REFUSED-001", [], make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "POWINT_EMPTY_STAKEHOLDERS" not in str(error):
            raise
        empty_stakeholders_refusal_proof["raised"] = True
        empty_stakeholders_refusal_proof["error_code"] = "POWINT_EMPTY_STAKEHOLDERS"
    if not empty_stakeholders_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("POWINT_INVARIANT_NOT_ENFORCED: an empty stakeholders list was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyStakeholdersRefused", {"refusal_proof": empty_stakeholders_refusal_proof}, 1.3)
    milestones.append("EMPTY_STAKEHOLDERS_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-stakeholder disclosed content) is not toothless -- an empty
    # power_reasoning on one stakeholder MUST be refused. stakeholder_entry() itself validates this via its own
    # builder path, so the defect is constructed directly as a raw dict to exercise generate_power_interest_
    # matrix's own check. ---
    empty_reasoning_stakeholders = _well_formed_stakeholders()
    empty_reasoning_stakeholders[0] = {**empty_reasoning_stakeholders[0], "power_reasoning": "   "}
    empty_reasoning_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_power_interest_matrix("POWINT-EMPTY-REASONING-REFUSED-001", empty_reasoning_stakeholders, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "POWINT_INVALID_STAKEHOLDER_ENTRY" not in str(error):
            raise
        empty_reasoning_refusal_proof["raised"] = True
        empty_reasoning_refusal_proof["error_code"] = "POWINT_INVALID_STAKEHOLDER_ENTRY"
    if not empty_reasoning_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("POWINT_INVARIANT_NOT_ENFORCED: an empty power_reasoning was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyReasoningRefused", {"refusal_proof": empty_reasoning_refusal_proof}, 1.5)
    milestones.append("EMPTY_REASONING_REFUSAL_PROVEN")

    # --- Step 4: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (flips the first stakeholder's stored quadrant to a different, still-schema-legal enum
    # value that disagrees with its own disclosed power_score/interest_score). ---
    tampered = dict(matrix)
    tampered["stakeholders"] = [dict(matrix["stakeholders"][0]), *matrix["stakeholders"][1:]]
    tampered["stakeholders"][0]["quadrant"] = "MONITOR"  # was MANAGE_CLOSELY (HIGH/HIGH) -- bypasses the builder directly
    tampered_gate = evaluate_power_interest_gates(tampered, "run_power_interest_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("POWINT_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered quadrant that disagrees with its own scores")
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
        "matrix": matrix,
        "gate_results": gate_results,
        "empty_stakeholders_refusal_proof": empty_stakeholders_refusal_proof,
        "empty_reasoning_refusal_proof": empty_reasoning_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_bcg_matrix_slice.py)",
    }
    write_json(runtime / "results" / "power_interest_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_power_interest_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS stakeholders.power_interest: PowerInterestMatrix {result['matrix']['id']} built with "
        f"{len(result['matrix']['stakeholders'])} stakeholders, gates [{gate_summary}]; "
        f"POWINT_EMPTY_STAKEHOLDERS/POWINT_INVALID_STAKEHOLDER_ENTRY invariants each REFUSED a malformed attempt "
        f"({result['empty_stakeholders_refusal_proof']['error_code']}, {result['empty_reasoning_refusal_proof']['error_code']}); "
        f"hand-tampered quadrant caught via the INDEPENDENT gate (not the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
