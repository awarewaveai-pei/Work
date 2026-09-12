"""``representation.audio_conversational_view`` vertical slice -- F24 representation family (Atlas L970).

Builds an Audio / Conversational View with one properly-confirmed structured
object (readback + confirm) and one still-DRAFT object, then proves Atlas's
own "speech->structured objects->readback/confirm" pipeline is a real
invariant, not mere narrative order: a construction-time attempt to mark a
structured object CONFIRMED with NO readback/confirm evidence is refused, and
a hand-tampered valid record (confirmed_by_user flipped back to false after
the fact, bypassing the builder) is independently caught by the
readback_confirm_required gate.

Run::

    python -m ai_lego.apps.cli.run_audio_conversational_view_slice
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
from ai_lego.modules.representation.audio_conversational_view import (
    METHOD_ID,
    all_gates_pass,
    evaluate_audio_conversational_view_gates,
    evaluate_readback_confirm_required_gate,
    generate_audio_conversational_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ACVIEW-SYNTHETIC-001"
EXECUTION_ID = "EX-ACVIEW-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-ACVIEW-001"

S = {
    "audio_conversational_view": "ai-lego://specs/cognitive/typed-objects/audio-conversational-view-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-audio-conversational-view-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "knowledge_ref": "KNOW-2026-09-12-001",
        "structured_objects": [
            {
                "object_id": "SO-1",
                "status": "CONFIRMED",
                "transcript": "把截止日改成下週五",
                "readback_transcript": "你是說把截止日改成下週五，對嗎？",
                "confirmed_by_user": True,
            },
            {
                "object_id": "SO-2",
                "status": "DRAFT",
                "transcript": "新增一個負責人叫做小陳",
                "readback_transcript": None,
                "confirmed_by_user": False,
            },
        ],
        "state": {"visible_fields": ["object_id", "status", "transcript"]},
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_audio_conversational_view_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed View -- one properly readback/confirmed object, one still-DRAFT object. ---
    descriptor, view = catalog.invoke(
        METHOD_ID,
        generate_audio_conversational_view,
        "ACVIEW-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["audio_conversational_view"], view, "audio conversational view")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AudioConversationalViewGenerated", {"view": view, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_audio_conversational_view_gates(view, "run_audio_conversational_view_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"audio conversational view gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ACVIEW_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "AudioConversationalViewGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L970's own "readback/confirm" pipeline stage is not toothless -- a
    # CONFIRMED object with NO readback/confirm evidence MUST be refused before any record is
    # constructed. ---
    unconfirmed_kwargs = copy.deepcopy(_well_formed_kwargs())
    unconfirmed_kwargs["structured_objects"][1]["status"] = "CONFIRMED"  # SO-2 flipped to CONFIRMED with readback_transcript still null, confirmed_by_user still False
    missing_readback_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_audio_conversational_view("ACVIEW-MISSING-READBACK-REFUSED-001", **unconfirmed_kwargs)
    except InvariantViolation as error:
        if "ACVIEW_MISSING_READBACK_CONFIRM" not in str(error):
            raise
        missing_readback_refusal_proof["raised"] = True
        missing_readback_refusal_proof["error_code"] = "ACVIEW_MISSING_READBACK_CONFIRM"
    if not missing_readback_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ACVIEW_INVARIANT_NOT_ENFORCED: a CONFIRMED object with no readback/confirm evidence was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MissingReadbackConfirmRefused", {"refusal_proof": missing_readback_refusal_proof}, 1.3)
    milestones.append("MISSING_READBACK_CONFIRM_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT readback_confirm_required gate catches the
    # same defect class even when a caller bypasses the builder entirely (confirmed_by_user flipped
    # back to False on an already-built CONFIRMED record). ---
    tampered = copy.deepcopy(view)
    tampered["structured_objects"][0]["confirmed_by_user"] = False
    tampered_gate = evaluate_readback_confirm_required_gate(tampered, "run_audio_conversational_view_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("ACVIEW_GATE_NOT_INDEPENDENT: the independent readback_confirm_required gate did NOT catch a hand-tampered confirmed_by_user=False on a CONFIRMED entry")
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
        "audio_conversational_view": view,
        "gate_results": gate_results,
        "missing_readback_refusal_proof": missing_readback_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_cross_impact_analysis_slice.py)",
    }
    write_json(runtime / "results" / "audio_conversational_view_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_audio_conversational_view_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS representation.audio_conversational_view: AudioConversationalViewRecord {result['audio_conversational_view']['id']} built "
        f"(1 CONFIRMED w/ readback+confirm, 1 DRAFT), gates [{gate_summary}]; "
        f"ACVIEW_MISSING_READBACK_CONFIRM REFUSED an unconfirmed-evidence CONFIRMED attempt ({result['missing_readback_refusal_proof']['error_code']}); "
        f"hand-tampered confirmed_by_user=False caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
