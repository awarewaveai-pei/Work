"""``strategy.lean_canvas`` vertical slice -- strategy family, added 2026-09-18 per direct operator
request (see ``ai_lego/modules/strategy/lean_canvas.py``'s own module docstring). Primary template:
``run_business_model_canvas_slice.py`` (read in full first) -- same closed-block-set shape, scaled
to Lean Canvas's own 9-block vocabulary.

Builds a real, well-formed Lean Canvas for an early-stage SaaS accounts-payable automation
startup covering all 9 blocks, then demonstrates the same 2 real invariants once each as a
construction-time REFUSAL (an incomplete block set missing UNFAIR_ADVANTAGE; an empty block
``content``), same "show a real refusal, not only a real success" discipline every sibling slice's
CLI demo already establishes. Invariant 3 (``validation_status``) cannot be builder-refused the
same way -- the builder never accepts it as a parameter at all -- so its toothlessness proof
instead hand-tampers a VALID record's raw dict directly and shows the independent gate, not the
builder, catches it, same pattern ``run_business_model_canvas_slice.py``'s own Step 4 establishes.

A final step demonstrates the contract's own ``forbidden_transition: ["LeanCanvas ->
AutomaticProductionDeployment"]`` is real -- but ONLY at the schema layer: unlike
``decision.eisenhower_matrix``, ``ai_lego/modules/strategy/lean_canvas.py`` has no separate runtime
guard function (grep-confirmed), so a smuggled ``approved`` key on a copy of a valid record can
only ever be refused by the typed-object schema's own ``additionalProperties: false`` -- this step
proves that refusal is real, and does not claim a second, nonexistent runtime layer.

Run::

    python -m ai_lego.apps.cli.run_lean_canvas_slice
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
from ai_lego.modules.strategy.lean_canvas import (
    METHOD_ID,
    VALIDATION_STATUS,
    all_gates_pass,
    block_entry,
    evaluate_lean_canvas_gates,
    generate_lean_canvas,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-LEANCANVAS-SYNTHETIC-001"
EXECUTION_ID = "EX-LEANCANVAS-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-LEANCANVAS-001"

S = {
    "lean_canvas": "ai-lego://specs/cognitive/typed-objects/lean-canvas-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-lean-canvas-slice"


def _well_formed_blocks() -> list[dict[str, Any]]:
    return [
        block_entry("PROBLEM", "中小企業應付帳款仍靠人工比對發票，每月耗費 20+ 小時且常出錯", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("CUSTOMER_SEGMENTS", "50-200 人規模的中小型製造業／貿易公司財務部門", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-601"]),
        block_entry("UNIQUE_VALUE_PROPOSITION", "發票自動比對＋異常標記，人工核對時間降低 80%", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("SOLUTION", "OCR 擷取發票欄位＋規則比對引擎＋異常人工複核佇列", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("CHANNELS", "會計師事務所轉介、財務長社群直接推廣", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("REVENUE_STREAMS", "月費訂閱，依每月處理發票量分級", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-602"]),
        block_entry("COST_STRUCTURE", "OCR API 用量費、雲端基礎設施、客服支援人力", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("KEY_METRICS", "月活躍公司數、每月處理發票總量、異常標記準確率", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("UNFAIR_ADVANTAGE", "創辦團隊過去 5 年深耕該產業財務系統整合，累積真實客戶關係", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]


def run_lean_canvas_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed canvas -- all 3 real invariants satisfied. ---
    descriptor, canvas = catalog.invoke(
        METHOD_ID,
        generate_lean_canvas,
        "LEANCANVAS-2026-09-25-001",
        _well_formed_blocks(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["lean_canvas"], canvas, "lean canvas")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "LeanCanvasGenerated", {"canvas": canvas, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_lean_canvas_gates(canvas, "run_lean_canvas_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.lean_canvas gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("LEANCANVAS_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (completeness) is not toothless -- a block set missing
    # UNFAIR_ADVANTAGE (only 8 of the 9 required blocks) MUST be refused before any record is
    # constructed. ---
    incomplete_blocks = [b for b in _well_formed_blocks() if b["block"] != "UNFAIR_ADVANTAGE"]
    incomplete_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_lean_canvas("LEANCANVAS-INCOMPLETE-REFUSED-001", incomplete_blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "LEANCANVAS_INCOMPLETE_BLOCK_SET" not in str(error):
            raise
        incomplete_refusal_proof["raised"] = True
        incomplete_refusal_proof["error_code"] = "LEANCANVAS_INCOMPLETE_BLOCK_SET"
    if not incomplete_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("LEANCANVAS_INVARIANT_NOT_ENFORCED: an incomplete block set (missing UNFAIR_ADVANTAGE) was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompleteBlockSetRefused", {"refusal_proof": incomplete_refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-block content) is not toothless -- an empty content on
    # one block MUST be refused. block_entry() itself validates block/content only, so the
    # empty-content defect is constructed directly as a raw dict to exercise generate_lean_canvas's
    # own check. ---
    empty_content_blocks = _well_formed_blocks()
    empty_content_blocks[0] = {**empty_content_blocks[0], "content": "   "}
    empty_content_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_lean_canvas("LEANCANVAS-EMPTY-CONTENT-REFUSED-001", empty_content_blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "LEANCANVAS_EMPTY_CONTENT" not in str(error):
            raise
        empty_content_refusal_proof["raised"] = True
        empty_content_refusal_proof["error_code"] = "LEANCANVAS_EMPTY_CONTENT"
    if not empty_content_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("LEANCANVAS_INVARIANT_NOT_ENFORCED: an empty block content was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyContentRefused", {"refusal_proof": empty_content_refusal_proof}, 1.5)
    milestones.append("EMPTY_CONTENT_REFUSAL_PROVEN")

    # --- Step 4: proof invariant 3 (validation_status) is not toothless. The builder never accepts
    # validation_status as a parameter at all (structural elimination -- see module docstring), so
    # there is no builder call to refuse. Instead: hand-tamper a VALID record's raw dict directly
    # (bypassing the builder entirely) to claim a validated business, and prove the INDEPENDENT
    # gate -- not the builder -- catches it. ---
    tampered_status = dict(canvas)
    tampered_status["validation_status"] = "VALIDATED_BUSINESS"  # a caller could never get the builder to emit this
    tampered_status_gate = evaluate_lean_canvas_gates(tampered_status, "run_lean_canvas_slice", clock.at(1.7))
    validation_status_tamper_caught = not all_gates_pass(tampered_status_gate)
    if not validation_status_tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("LEANCANVAS_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered validation_status claiming a validated business")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedValidationStatusCaughtByGate", {"tampered_gate_results": tampered_status_gate}, 1.8)
    milestones.append("VALIDATION_STATUS_TAMPER_PROVEN")

    # --- Step 5: forbidden_transition ("LeanCanvas -> AutomaticProductionDeployment") -- SCHEMA
    # LAYER ONLY (see module docstring above for why there is no separate runtime layer here). A
    # smuggled "approved" key on a copy of the valid record must be refused by the typed-object
    # schema's own additionalProperties: false. ---
    tampered_authority = copy.deepcopy(canvas)
    tampered_authority["approved"] = True
    schema_layer_blocked = False
    try:
        contracts.validate(S["lean_canvas"], tampered_authority, "tampered canvas (must be refused)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not schema_layer_blocked:
        milestones.append("BLOCKED")
        raise InvariantViolation("LEANCANVAS_AUTHORITY_GUARD_DID_NOT_FIRE: the schema layer did NOT refuse a smuggled automatic-authority claim")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NoAutomaticAuthorityVerified", {"schema_layer_blocked": schema_layer_blocked}, 2.0)
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
        "canvas": canvas,
        "gate_results": gate_results,
        "incomplete_refusal_proof": incomplete_refusal_proof,
        "empty_content_refusal_proof": empty_content_refusal_proof,
        "tampered_validation_status_gate_results": tampered_status_gate,
        "no_automatic_authority_verification": {"schema_layer_blocked": schema_layer_blocked},
        "validation_status_constant": VALIDATION_STATUS,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_business_model_canvas_slice.py)",
    }
    write_json(runtime / "results" / "lean_canvas_slice_result.json", result)
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
        result = run_lean_canvas_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    canvas = result["canvas"]
    block_summary = ", ".join(b["block"] for b in canvas["blocks"])
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["no_automatic_authority_verification"]
    print(
        f"PASS strategy.lean_canvas: blocks=[{block_summary}], validation_status={canvas['validation_status']}, gates [{gate_summary}], "
        f"schema_layer_authority_guard_verified={v['schema_layer_blocked']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
