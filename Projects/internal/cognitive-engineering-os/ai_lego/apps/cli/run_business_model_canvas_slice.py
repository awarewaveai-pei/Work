"""``strategy.business_model_canvas`` vertical slice -- F08 context/strategy family, 11th member
(``strategy.vrio`` was the 10th; see ``run_porter_five_forces_slice.py``, read in full as this
module's primary repo-convention template).

Scenario: a Business Model Canvas for a regional SaaS accounting-automation business -- same
synthetic style every sibling slice's CLI demo uses. Builds a real, well-formed
``BusinessModelCanvas`` covering all 9 Atlas §12.15 blocks, then demonstrates 2 of the 3 real
invariants once each as a construction-time REFUSAL (an incomplete block set missing
KEY_PARTNERS; an empty block ``content``), proving neither is toothless, same "show a real
refusal, not only a real success" discipline every sibling slice's CLI demo already establishes.
Invariant 3 (``validation_status``) cannot be builder-refused the same way -- the builder never
accepts it as a parameter at all (structural elimination, see module docstring) -- so its
toothlessness proof instead hand-tampers a VALID record's raw dict directly (bypassing the
builder entirely) and shows the independent gate, not the builder, catches it. A final step also
hand-tampers the block set (drops a block from an already-valid record) to prove the same gate
independence porter_five_forces's own final step establishes.

Run::

    python -m ai_lego.apps.cli.run_business_model_canvas_slice
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
from ai_lego.modules.strategy.business_model_canvas import (
    METHOD_ID,
    VALIDATION_STATUS,
    all_gates_pass,
    block_entry,
    evaluate_business_model_canvas_gates,
    generate_business_model_canvas,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-BMC-SYNTHETIC-001"
EXECUTION_ID = "EX-BMC-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-BMC-001"

S = {
    "bmc": "ai-lego://specs/cognitive/typed-objects/business-model-canvas.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-business-model-canvas-slice"


def _well_formed_blocks() -> list[dict[str, Any]]:
    return [
        block_entry("CUSTOMER_SEGMENTS", "中小型會計師事務所（5-50人），台灣市場", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-501"]),
        block_entry("VALUE_PROPOSITIONS", "自動化帳務對帳，節省 70% 人工核對時間", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("CHANNELS", "會計師公會推薦、直接業務銷售、免費試用轉付費", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("CUSTOMER_RELATIONSHIPS", "專屬客戶成功經理 + 自助說明中心", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("REVENUE_STREAMS", "月費訂閱制，依帳戶數分級", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-502"]),
        block_entry("KEY_RESOURCES", "核心對帳演算法、雲端基礎設施、會計專業團隊", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("KEY_ACTIVITIES", "產品研發、客戶導入、法規更新維護", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("KEY_PARTNERS", "雲端服務供應商、會計軟體整合夥伴、會計師公會", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        block_entry("COST_STRUCTURE", "研發人力、雲端運算成本、業務與行銷費用", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]


def run_business_model_canvas_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Method resolution: zero new code in method_resolver.py. strategy.business_model_canvas
    # resolves because its contract is ACTIVE in the spec root's methods/contracts/, exactly the
    # mechanism every sibling slice uses. ---
    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([METHOD_ID])
    contracts.validate(S["method_resolution"], resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    # --- Step 1: the complete, well-formed canvas -- all 3 real invariants satisfied, invoked
    # through the catalog's own per-invocation gate (ADR-023 Consequences 5's pattern, unchanged). ---
    descriptor, canvas = catalog.invoke(
        METHOD_ID,
        generate_business_model_canvas,
        "BMC-2026-09-11-001",
        _well_formed_blocks(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )
    contracts.validate(S["bmc"], canvas, "business model canvas")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "BusinessModelCanvasGenerated", {"canvas": canvas, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_business_model_canvas_gates(canvas, "run_business_model_canvas_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"strategy.business_model_canvas gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("BMC_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof invariant 1 (completeness) is not toothless -- a block set missing
    # KEY_PARTNERS (only 8 of the 9 required blocks) MUST be refused before any record is
    # constructed. ---
    incomplete_blocks = [b for b in _well_formed_blocks() if b["block"] != "KEY_PARTNERS"]
    incomplete_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_business_model_canvas("BMC-INCOMPLETE-REFUSED-001", incomplete_blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "BMC_INCOMPLETE_BLOCK_SET" not in str(error):
            raise
        incomplete_refusal_proof["raised"] = True
        incomplete_refusal_proof["error_code"] = "BMC_INCOMPLETE_BLOCK_SET"
    if not incomplete_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BMC_INVARIANT_NOT_ENFORCED: an incomplete block set (missing KEY_PARTNERS) was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "IncompleteBlockSetRefused", {"refusal_proof": incomplete_refusal_proof}, 1.3)
    milestones.append("INCOMPLETE_REFUSAL_PROVEN")

    # --- Step 3: proof invariant 2 (per-block content) is not toothless -- an empty content on
    # one block MUST be refused. block_entry() itself validates block/content only, so the
    # empty-content defect is constructed directly as a raw dict to exercise
    # generate_business_model_canvas's own check. ---
    empty_content_blocks = _well_formed_blocks()
    empty_content_blocks[0] = {**empty_content_blocks[0], "content": "   "}
    empty_content_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_business_model_canvas("BMC-EMPTY-CONTENT-REFUSED-001", empty_content_blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
    except InvariantViolation as error:
        if "BMC_EMPTY_CONTENT" not in str(error):
            raise
        empty_content_refusal_proof["raised"] = True
        empty_content_refusal_proof["error_code"] = "BMC_EMPTY_CONTENT"
    if not empty_content_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("BMC_INVARIANT_NOT_ENFORCED: an empty block content was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "EmptyContentRefused", {"refusal_proof": empty_content_refusal_proof}, 1.5)
    milestones.append("EMPTY_CONTENT_REFUSAL_PROVEN")

    # --- Step 4: proof invariant 3 (validation_status) is not toothless. Unlike invariants 1+2,
    # the builder never accepts validation_status as a parameter at all (structural elimination --
    # see module docstring "Limitation handling"), so there is no builder call to refuse. Instead:
    # hand-tamper a VALID record's raw dict directly (bypassing the builder entirely) to claim a
    # validated business, and prove the INDEPENDENT gate -- not the builder -- catches it. ---
    tampered_status = dict(canvas)
    tampered_status["validation_status"] = "VALIDATED_BUSINESS"  # a caller could never get the builder to emit this
    tampered_status_gate = evaluate_business_model_canvas_gates(tampered_status, "run_business_model_canvas_slice", clock.at(1.7))
    validation_status_tamper_caught = not all_gates_pass(tampered_status_gate)
    if not validation_status_tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation(
            "BMC_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered validation_status claiming a validated business"
        )
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedValidationStatusCaughtByGate", {"tampered_gate_results": tampered_status_gate}, 1.8)
    milestones.append("VALIDATION_STATUS_TAMPER_PROVEN")

    # --- Step 5: hand-tampering proof for invariant 1's gate side -- the INDEPENDENT gate catches
    # a defect even when a caller bypasses the builder entirely (drops KEY_RESOURCES from a raw
    # copy of an already-valid record), same final-step discipline
    # run_porter_five_forces_slice.py's own Step 5 establishes. ---
    tampered_blocks = dict(canvas)
    tampered_blocks["blocks"] = [b for b in canvas["blocks"] if b["block"] != "KEY_RESOURCES"] + [canvas["blocks"][0]]  # bypasses the builder directly
    tampered_blocks_gate = evaluate_business_model_canvas_gates(tampered_blocks, "run_business_model_canvas_slice", clock.at(2.0))
    blocks_tamper_caught = not all_gates_pass(tampered_blocks_gate)
    if not blocks_tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation("BMC_GATE_NOT_INDEPENDENT: the independent integrity gate did NOT catch a hand-tampered incomplete block set")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedBlockSetCaughtByGate", {"tampered_gate_results": tampered_blocks_gate}, 2.1)
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
        "tampered_block_set_gate_results": tampered_blocks_gate,
        "validation_status_constant": VALIDATION_STATUS,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_swot_slice.py)",
    }
    write_json(runtime / "results" / "business_model_canvas_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_business_model_canvas_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS strategy.business_model_canvas: BusinessModelCanvas {result['canvas']['id']} built, "
        f"gates [{gate_summary}]; "
        f"BMC_INCOMPLETE_BLOCK_SET/BMC_EMPTY_CONTENT invariants each REFUSED a malformed builder attempt "
        f"({result['incomplete_refusal_proof']['error_code']}, {result['empty_content_refusal_proof']['error_code']}); "
        f"hand-tampered validation_status ({result['validation_status_constant']!r} spoofed) and hand-tampered "
        f"incomplete block set were both caught via the INDEPENDENT gate (not the builder, which never exposes "
        f"validation_status as a parameter at all)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
