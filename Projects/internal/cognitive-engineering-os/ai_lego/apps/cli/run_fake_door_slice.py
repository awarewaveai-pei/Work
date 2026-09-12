"""``experiment.fake_door`` vertical slice -- F15 experiment & validation family (Atlas L744).

Builds a well-formed, honestly-disclosed Fake Door experiment over a synthetic "export to Notion"
CTA, then proves Atlas's own "告知尚未開放" (disclose: not yet available) pipeline stage is a real
invariant, not mere narrative order: a construction-time attempt to submit an UNDISCLOSED record
(``disclosure_shown=False``) is refused, and a hand-tampered valid record (click_count silently
bumped above its own impression_count, bypassing the builder) is independently caught by the
measurement_integrity gate.

Run::

    python -m ai_lego.apps.cli.run_fake_door_slice
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
from ai_lego.modules.experiment.fake_door import (
    METHOD_ID,
    all_gates_pass,
    evaluate_fake_door_gates,
    evaluate_measurement_integrity_gate,
    generate_fake_door_experiment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-FAKEDOOR-SYNTHETIC-001"
EXECUTION_ID = "EX-FAKEDOOR-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-FAKEDOOR-001"

S = {
    "fake_door_experiment": "ai-lego://specs/cognitive/typed-objects/fake-door-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-fake-door-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "feature_under_test": "一鍵匯出到 Notion",
        "cta_copy": "立即匯出到 Notion",
        "disclosure_shown": True,
        "disclosure_text": "此功能尚未開放，感謝您的興趣，我們已記錄下來",
        "impression_count": 1200,
        "click_count": 87,
        "provenance": make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL"),
    }


def run_fake_door_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the honestly-disclosed, well-measured record. ---
    descriptor, experiment = catalog.invoke(
        METHOD_ID,
        generate_fake_door_experiment,
        "FAKEDOOR-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["fake_door_experiment"], experiment, "fake door experiment")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "FakeDoorExperimentGenerated", {"experiment": experiment, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_fake_door_gates(experiment, "run_fake_door_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"fake door experiment gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"FAKEDOOR_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "FakeDoorExperimentGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L744's own "告知尚未開放" pipeline stage is not toothless -- an
    # UNDISCLOSED attempt (disclosure_shown=False) MUST be refused before any record is constructed. ---
    undisclosed_kwargs = copy.deepcopy(_well_formed_kwargs())
    undisclosed_kwargs["disclosure_shown"] = False
    not_disclosed_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_fake_door_experiment("FAKEDOOR-UNDISCLOSED-REFUSED-001", **undisclosed_kwargs)
    except InvariantViolation as error:
        if "FAKEDOOR_NOT_DISCLOSED" not in str(error):
            raise
        not_disclosed_refusal_proof["raised"] = True
        not_disclosed_refusal_proof["error_code"] = "FAKEDOOR_NOT_DISCLOSED"
    if not not_disclosed_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("FAKEDOOR_INVARIANT_NOT_ENFORCED: an undisclosed Fake Door was NOT refused -- the invariant is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NotDisclosedRefused", {"refusal_proof": not_disclosed_refusal_proof}, 1.3)
    milestones.append("NOT_DISCLOSED_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT measurement_integrity gate catches a
    # click_count silently bumped above its own impression_count, bypassing the builder entirely. ---
    tampered = copy.deepcopy(experiment)
    tampered["click_count"] = tampered["impression_count"] + 1
    tampered_gate = evaluate_measurement_integrity_gate(tampered, "run_fake_door_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("FAKEDOOR_GATE_NOT_INDEPENDENT: the independent measurement_integrity gate did NOT catch a hand-tampered click_count > impression_count")
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
        "fake_door_experiment": experiment,
        "gate_results": gate_results,
        "not_disclosed_refusal_proof": not_disclosed_refusal_proof,
        "tampered_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_iceberg_model_slice.py)",
    }
    write_json(runtime / "results" / "fake_door_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_fake_door_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS experiment.fake_door: FakeDoorExperiment {result['fake_door_experiment']['id']} built "
        f"(disclosed, {result['fake_door_experiment']['click_count']}/{result['fake_door_experiment']['impression_count']} measured), "
        f"gates [{gate_summary}]; FAKEDOOR_NOT_DISCLOSED REFUSED an undisclosed attempt ({result['not_disclosed_refusal_proof']['error_code']}); "
        f"hand-tampered over-limit click_count caught via the INDEPENDENT gate ({result['tampered_gate_result']['gate_id']}={result['tampered_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
