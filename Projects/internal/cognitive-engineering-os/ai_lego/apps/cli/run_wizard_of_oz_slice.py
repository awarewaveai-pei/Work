"""``experiment.wizard_of_oz`` vertical slice -- F15 experiment & validation family (Atlas L743).

Builds a well-formed WoZ record over a synthetic "AI scheduling assistant"
whose front end looks automated while a human ops analyst actually reads the
calendar and types the reply, then proves Atlas's own "mock automation->
human backend" contrast is a real invariant, not mere narrative order: a
construction-time attempt to submit a record where the backend is NOT
actually human-operated is refused, and a hand-tampered valid record (its
disclosure.faked_components emptied, bypassing the builder) is independently
caught by the disclosure_integrity gate.

Run::

    python -m ai_lego.apps.cli.run_wizard_of_oz_slice
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
from ai_lego.modules.experiment.wizard_of_oz import (
    METHOD_ID,
    all_gates_pass,
    evaluate_disclosure_integrity_gate,
    evaluate_wizard_of_oz_gates,
    generate_wizard_of_oz_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-WOZ-SYNTHETIC-001"
EXECUTION_ID = "EX-WOZ-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-WOZ-001"

S = {
    "wizard_of_oz": "ai-lego://specs/cognitive/typed-objects/wizard-of-oz-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-wizard-of-oz-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "interaction_description": "User asks a chat widget to 'find me a meeting slot next week' and receives a proposed time",
        "front_end": {
            "presented_as_automated": True,
            "description": "Chat widget labeled 'AI Scheduling Assistant' with a typing indicator and instant-looking replies",
        },
        "back_end": {
            "actually_human_operated": True,
            "operator_role": "ops analyst manually reading the calendar and typing the reply",
            "description": "A human reads the request, checks the real calendar, and types the proposed slot through an internal console",
        },
        "disclosure": {
            "faked_components": [
                "the 'AI' scheduling logic (no model runs; a human decides every slot)",
                "the typing-indicator latency (added to look automated)",
            ],
            "real_components": ["the underlying calendar data", "the actual proposed meeting slot"],
            "disclosed_to": "WILL_DISCLOSE_TO_USER_AT_STUDY_END",
        },
        "provenance": make_provenance("EVIDENCE", "HUMAN_ORIGINAL"),
    }


def run_wizard_of_oz_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the well-formed record -- automated-looking front, human-operated back, 2 disclosed fakes. ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_wizard_of_oz_record,
        "WOZ-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["wizard_of_oz"], record, "wizard of oz record")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "WizardOfOzRecordGenerated", {"record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_wizard_of_oz_gates(record, "run_wizard_of_oz_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"wizard of oz gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"WOZ_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "WizardOfOzGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L743's own "後台人工" (human backend) half is not toothless -- a record claiming
    # the backend is NOT actually human-operated MUST be refused before any record is constructed (that would
    # just be claiming to have shipped a real automated feature). ---
    fake_backend_kwargs = copy.deepcopy(_well_formed_kwargs())
    fake_backend_kwargs["back_end"]["actually_human_operated"] = False
    back_not_human_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_wizard_of_oz_record("WOZ-BACK-NOT-HUMAN-REFUSED-001", **fake_backend_kwargs)
    except InvariantViolation as error:
        if "WOZ_BACK_NOT_HUMAN" not in str(error):
            raise
        back_not_human_refusal_proof["raised"] = True
        back_not_human_refusal_proof["error_code"] = "WOZ_BACK_NOT_HUMAN"
    if not back_not_human_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("WOZ_INVARIANT_NOT_ENFORCED: a record claiming a non-human-operated backend was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "BackNotHumanRefused", {"refusal_proof": back_not_human_refusal_proof}, 1.3)
    milestones.append("BACK_NOT_HUMAN_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT disclosure_integrity gate catches an emptied
    # disclosure.faked_components even though the builder never re-runs on this record. ---
    tampered = copy.deepcopy(record)
    tampered["disclosure"]["faked_components"] = []
    tampered_gate = evaluate_disclosure_integrity_gate(tampered, "run_wizard_of_oz_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("WOZ_GATE_NOT_INDEPENDENT: the independent disclosure_integrity gate did NOT catch a hand-tampered emptied faked_components[]")
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
        "wizard_of_oz_record": record,
        "gate_results": gate_results,
        "back_not_human_refusal_proof": back_not_human_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_cross_impact_analysis_slice.py)",
    }
    write_json(runtime / "results" / "wizard_of_oz_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_wizard_of_oz_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.wizard_of_oz: WizardOfOzRecord {result['wizard_of_oz_record']['id']} built "
        f"(automated-looking front, human-operated back, 2 disclosed fakes), gates [{gate_summary}]; "
        f"WOZ_BACK_NOT_HUMAN REFUSED a fake-human-backend attempt ({result['back_not_human_refusal_proof']['error_code']}); "
        f"hand-tampered emptied disclosure caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
