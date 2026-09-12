"""``foresight.delphi`` vertical slice -- F13 foresight family (Atlas L684, §12.23 L2821-2828).

Runs a synthetic 2-round Delphi study estimating an AI-adoption timeline,
preserving one minority position alongside the consensus summary. Then
proves, mirroring ``run_red_team_slice.py``'s own two-layer discipline:

* Atlas L684's own anonymity rule is real at BOTH independent layers -- a
  construction-time attempt to smuggle a ``name`` key onto a response is
  refused, and a hand-crafted bypass (skipping the builder entirely) is
  independently refused by the schema's own ``additionalProperties: false``.
* §12.23's own L2827 limitation ("Consensus 不是 truth；應保存 minority
  range") is real -- a construction-time attempt to record a
  ``consensus_summary`` with no minority range preserved is refused.
* ``dispersion`` is genuinely computed, not a stored label -- a
  hand-tampered record (final-round estimate changed after construction,
  stale ``dispersion`` left in place) is independently caught by the gate.

Run::

    python -m ai_lego.apps.cli.run_delphi_slice
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
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.delphi import (
    METHOD_ID,
    all_gates_pass,
    evaluate_delphi_gates,
    evaluate_dispersion_integrity_gate,
    generate_delphi_study,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-DELPHI-SYNTHETIC-001"
EXECUTION_ID = "EX-DELPHI-SYNTHETIC-001"
AGGREGATE_ID = f"{CASCADIA.tenant_id}:PROJ-DELPHI-001"

S = {
    "delphi_study": "ai-lego://specs/cognitive/typed-objects/delphi-study.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-delphi-slice"


def _well_formed_kwargs() -> dict[str, Any]:
    return {
        "rounds": [
            {
                "round_number": 1,
                "responses": [
                    {"participant_id": "P1", "estimate": 5, "rationale": "現有法規框架尚未成熟"},
                    {"participant_id": "P2", "estimate": 2, "rationale": "技術已具備，採用速度取決於成本下降"},
                ],
            },
            {
                "round_number": 2,
                "responses": [
                    {"participant_id": "P1", "estimate": 4},
                    {"participant_id": "P2", "estimate": 3},
                ],
            },
        ],
        "consensus_summary": "多數專家估計 3-4 年內主流採用",
        "minority_positions": ["P1 認為法規是主要瓶頸，時程應以最保守估計為準"],
        "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED"),
    }


def run_delphi_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed study -- 2 rounds, 2 responses each, minority range preserved. ---
    descriptor, study = catalog.invoke(
        METHOD_ID,
        generate_delphi_study,
        "DELPHI-2026-09-12-001",
        **_well_formed_kwargs(),
    )
    contracts.validate(S["delphi_study"], study, "delphi study")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DelphiStudyGenerated", {"study": study, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_delphi_gates(study, "run_delphi_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"delphi gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"DELPHI_GATE_FAILED on the deliberately well-formed record: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DelphiGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- Step 2: prove Atlas L684's own anonymity rule is real at the RUNTIME layer -- a `name` key smuggled
    # onto a response must be refused BEFORE any record is constructed. ---
    named_kwargs = copy.deepcopy(_well_formed_kwargs())
    named_kwargs["rounds"][0]["responses"][0]["name"] = "Alice"
    runtime_layer_blocked = False
    try:
        generate_delphi_study("DELPHI-NAMED-RESPONSE-REFUSED-001", **named_kwargs)
    except InvariantViolation as error:
        if "DELPHI_INVALID_ROUNDS" not in str(error) and "DELPHI_INVALID_RESPONSE" not in str(error):
            raise
        runtime_layer_blocked = True
    if not runtime_layer_blocked:
        milestones.append("BLOCKED")
        raise InvariantViolation("DELPHI_ANONYMITY_GUARD_DID_NOT_FIRE: a smuggled 'name' key on a response was NOT refused at construction")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "NamedResponseRefusedAtRuntime", {"runtime_layer_blocked": runtime_layer_blocked}, 1.3)
    milestones.append("RUNTIME_ANONYMITY_REFUSAL_PROVEN")

    # --- Step 3: prove Atlas L684's own anonymity rule is ALSO real at the independent SCHEMA layer -- a
    # hand-crafted bypass (name added directly to a COPY of a valid record's raw dict, skipping the builder
    # entirely) must be refused too. ---
    tampered = copy.deepcopy(study)
    tampered["rounds"][0]["responses"][0]["name"] = "Alice"
    schema_layer_blocked = False
    try:
        contracts.validate(S["delphi_study"], tampered, "tampered study (must be refused)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not schema_layer_blocked:
        milestones.append("BLOCKED")
        raise InvariantViolation("DELPHI_ANONYMITY_GUARD_DID_NOT_FIRE: schema layer did not refuse a hand-crafted 'name' key bypass")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "DelphiAnonymityVerified", {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked}, 1.4)
    milestones.append("SCHEMA_ANONYMITY_REFUSAL_PROVEN")

    # --- Step 4: prove §12.23's own L2827 limitation is real -- a consensus_summary recorded with NEITHER a
    # minority_positions[] NOR an explicit none-recorded reason must be refused BEFORE construction. ---
    no_minority_kwargs = copy.deepcopy(_well_formed_kwargs())
    del no_minority_kwargs["minority_positions"]
    minority_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_delphi_study("DELPHI-MINORITY-DROPPED-REFUSED-001", **no_minority_kwargs)
    except InvariantViolation as error:
        if "DELPHI_MINORITY_RANGE_NOT_PRESERVED" not in str(error):
            raise
        minority_refusal_proof["raised"] = True
        minority_refusal_proof["error_code"] = "DELPHI_MINORITY_RANGE_NOT_PRESERVED"
    if not minority_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("DELPHI_INVARIANT_NOT_ENFORCED: consensus_summary with no minority range preserved was NOT refused -- §12.23 L2827 is toothless")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "MinorityRangeDroppedRefused", {"refusal_proof": minority_refusal_proof}, 1.5)
    milestones.append("MINORITY_RANGE_REFUSAL_PROVEN")

    # --- Step 5: hand-tampering proof -- the INDEPENDENT dispersion_integrity gate catches a stale dispersion
    # value left in place after a caller directly mutates the final round's estimates on a copy of a VALID
    # record, bypassing the builder entirely. ---
    dispersion_tampered = copy.deepcopy(study)
    dispersion_tampered["rounds"][1]["responses"][0]["estimate"] = 999
    tampered_gate = evaluate_dispersion_integrity_gate(dispersion_tampered, "run_delphi_slice", clock.at(2.0))
    if tampered_gate["status"] != "FAIL":
        milestones.append("BLOCKED")
        raise InvariantViolation("DELPHI_GATE_NOT_INDEPENDENT: the independent dispersion_integrity gate did NOT catch a hand-tampered final-round estimate with a stale dispersion value")
    ledger.append(CASCADIA.tenant_id, AGGREGATE_ID, "TamperedDispersionCaughtByGate", {"tampered_gate_result": tampered_gate}, 2.1)
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
        "delphi_study": study,
        "gate_results": gate_results,
        "anonymity_verification": {"runtime_layer_blocked": runtime_layer_blocked, "schema_layer_blocked": schema_layer_blocked},
        "minority_range_refusal_proof": minority_refusal_proof,
        "tampered_dispersion_gate_result": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_red_team_slice.py)",
    }
    write_json(runtime / "results" / "delphi_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_delphi_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["anonymity_verification"]
    print(
        f"PASS foresight.delphi: DelphiStudy {result['delphi_study']['id']} built (2 rounds, dispersion={result['delphi_study']['dispersion']}), gates [{gate_summary}]; "
        f"anonymity verified at both layers (runtime={v['runtime_layer_blocked']}, schema={v['schema_layer_blocked']}); "
        f"DELPHI_MINORITY_RANGE_NOT_PRESERVED REFUSED a dropped-minority attempt ({result['minority_range_refusal_proof']['error_code']}); "
        f"hand-tampered dispersion caught via the INDEPENDENT gate ({result['tampered_dispersion_gate_result']['gate_id']}={result['tampered_dispersion_gate_result']['status']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
