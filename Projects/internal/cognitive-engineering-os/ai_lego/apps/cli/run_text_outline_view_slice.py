"""``representation.text_outline_view`` vertical slice -- F24 Representation family (Atlas L964), opens the
family (0/10).

Builds a 2-node outline (one nested child) over a synthetic Knowledge Object, then proves the shared F24
View law is a real invariant, not mere narrative order: a construction-time attempt to smuggle inline
evidence text (a string containing a space, e.g. "see page 12") into `evidence_links[]` is refused, and a
hand-tampered valid record (an oversized `summary` written directly, bypassing the builder) is independently
caught by the summary_length gate.

Run::

    python -m ai_lego.apps.cli.run_text_outline_view_slice
"""

from __future__ import annotations

import argparse
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
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.modules.representation.text_outline_view import (
    METHOD_ID,
    SUMMARY_MAX_LENGTH,
    all_gates_pass,
    evaluate_summary_length_gate,
    evaluate_text_outline_view_gates,
    generate_text_outline_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-TXTVIEW-SYNTHETIC-001"
EXECUTION_ID = "EX-TXTVIEW-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-TXTVIEW-001"

S = {
    "text_outline_view": "ai-lego://specs/cognitive/typed-objects/text-outline-view-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-text-outline-view-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "source_knowledge_object_id": "KO-2026-09-12-001",
        "summary": "季度營運回顧的重點摘要",
        "outline": [
            {
                "id": "N1",
                "summary": "營收成長 12%",
                "details_ref": "KO-2026-09-12-001/section/revenue",
                "evidence_links": ["EVID-2026-09-001", "EVID-2026-09-002"],
                "children": [
                    {"id": "N1.1", "summary": "主要來自海外市場", "evidence_links": ["EVID-2026-09-003"]},
                ],
            },
        ],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_text_outline_view_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed record -- reference-shaped links, length-bounded summaries. ---
    descriptor, view = catalog.invoke(
        METHOD_ID,
        generate_text_outline_view,
        "TXTVIEW-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["text_outline_view"], view, "text outline view")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TextOutlineViewGenerated", {"view": view, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_text_outline_view_gates(view, "run_text_outline_view_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"text outline view gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"TXTVIEW_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TextOutlineViewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove the shared View law is not toothless -- inline evidence text (containing a space)
    # smuggled into evidence_links[] MUST be refused before any record is constructed. ---
    tampered_kwargs = copy.deepcopy(_well_formed_kwargs())
    tampered_kwargs["outline"][0]["evidence_links"].append("see page 12 for details")
    inline_evidence_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_text_outline_view("TXTVIEW-INLINE-EVIDENCE-REFUSED-001", **tampered_kwargs)
    except InvariantViolation as error:
        if "TXTVIEW_INVALID_OUTLINE_NODE" not in str(error):
            raise
        inline_evidence_refusal_proof["raised"] = True
        inline_evidence_refusal_proof["error_code"] = "TXTVIEW_INVALID_OUTLINE_NODE"
    if not inline_evidence_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("TXTVIEW_INVARIANT_NOT_ENFORCED: inline evidence text was NOT refused -- the reference-shape invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "InlineEvidenceRefused", {"refusal_proof": inline_evidence_refusal_proof}, 1.3)
    milestones.append("INLINE_EVIDENCE_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT summary_length gate catches an oversized summary
    # written directly onto an already-valid record, bypassing the builder entirely. ---
    tampered = copy.deepcopy(view)
    tampered["outline"][0]["summary"] = "x" * (SUMMARY_MAX_LENGTH + 1)
    tampered_gate = evaluate_summary_length_gate(tampered, "run_text_outline_view_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("TXTVIEW_GATE_NOT_INDEPENDENT: the independent summary_length gate did NOT catch a hand-tampered oversized summary")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
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
        "text_outline_view": view,
        "gate_results": gate_results,
        "inline_evidence_refusal_proof": inline_evidence_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "text_outline_view_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_text_outline_view_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS representation.text_outline_view: TextOutlineViewRecord {result['text_outline_view']['id']} built "
        f"(1 top-level node, 1 nested child), gates [{gate_summary}]; "
        f"TXTVIEW_INVALID_OUTLINE_NODE REFUSED an inline-evidence-text smuggling attempt ({result['inline_evidence_refusal_proof']['error_code']}); "
        f"hand-tampered oversized summary caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
