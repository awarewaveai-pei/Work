"""``epistemic.assumption_mapping`` vertical slice -- 1st of 2 F10 epistemic-family members built this batch.

Scenario: 4 assumptions behind a university AI-platform-adoption proposal, one deliberately placed in each of
the 4 quadrants (VALIDATE_FIRST / KNOWN_CRITICAL / MONITOR / CHEAP_TESTS) -- same synthetic-but-plausible style
every sibling slice's CLI demo uses. Builds a real, well-formed ``AssumptionMapping`` satisfying every real
invariant, then demonstrates the real invariant (quadrant is never caller-suppliable) as a construction-time
REFUSAL (a caller trying to smuggle ``quadrant`` directly onto an entry). A final step hand-tampers a VALID
record directly (bypassing the builder, splicing in a ``quadrant`` that disagrees with its own
impact/uncertainty) to prove the independent gate, not just the builder, catches the same defect.

Run::

    python -m ai_lego.apps.cli.run_assumption_mapping_slice
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
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.epistemic.assumption_mapping import (
    METHOD_ID,
    all_gates_pass,
    evaluate_assumption_mapping_gates,
    generate_assumption_mapping,
    mapped_assumption,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ASSUMPTIONMAPPING-SYNTHETIC-001"
EXECUTION_ID = "EX-ASSUMPTIONMAPPING-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-ASSUMPTIONMAPPING-001"

S = {
    "assumption_mapping": "ai-lego://specs/cognitive/typed-objects/assumption-mapping.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-assumption-mapping-slice"


def _mapped_assumptions() -> list[dict[str, Any]]:
    return [
        mapped_assumption("ASM-1", "HIGH", "HIGH"),  # -> VALIDATE_FIRST
        mapped_assumption("ASM-2", "HIGH", "LOW"),  # -> KNOWN_CRITICAL
        mapped_assumption("ASM-3", "LOW", "LOW"),  # -> MONITOR
        mapped_assumption("ASM-4", "LOW", "HIGH"),  # -> CHEAP_TESTS
    ]


def run_assumption_mapping_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- Step 1: the complete, well-formed mapping -- every real invariant satisfied, one assumption per
    # quadrant. ---
    descriptor, mapping = catalog.invoke(
        METHOD_ID,
        generate_assumption_mapping,
        "AMAP-2026-09-12-001",
        _mapped_assumptions(),
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["assumption_mapping"], mapping, "assumption mapping")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "AssumptionMappingGenerated", {"mapping": mapping, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_assumption_mapping_gates(mapping, "run_assumption_mapping_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"epistemic.assumption_mapping gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation("ASSUMPTIONMAPPING_GATE_FAILED on the deliberately well-formed record")
    milestones.append("GATES_PASSED")

    # --- Step 2: proof quadrant cannot be smuggled in as a caller-supplied value -- a hand-crafted entry
    # carrying quadrant directly MUST be refused before any record is constructed. ---
    smuggled_entries = _mapped_assumptions()
    smuggled_entries[0] = {**smuggled_entries[0], "quadrant": "VALIDATE_FIRST"}
    smuggled_quadrant_refusal_proof: dict[str, Any] = {"attempted": True, "raised": False}
    try:
        generate_assumption_mapping("AMAP-SMUGGLED-QUADRANT-REFUSED-001", smuggled_entries, make_provenance("AI_INFERENCE", "AI_GENERATED"))
    except InvariantViolation as error:
        if "ASSUMPTIONMAPPING_INVALID_ENTRY" not in str(error):
            raise
        smuggled_quadrant_refusal_proof["raised"] = True
        smuggled_quadrant_refusal_proof["error_code"] = "ASSUMPTIONMAPPING_INVALID_ENTRY"
    if not smuggled_quadrant_refusal_proof["raised"]:
        milestones.append("BLOCKED")
        raise InvariantViolation("ASSUMPTIONMAPPING_INVARIANT_NOT_ENFORCED: a caller-supplied quadrant was NOT refused -- the invariant is toothless")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "SmuggledQuadrantRefused", {"refusal_proof": smuggled_quadrant_refusal_proof}, 1.3)
    milestones.append("SMUGGLED_QUADRANT_REFUSAL_PROVEN")

    # --- Step 3: hand-tampering proof -- the INDEPENDENT gate catches a defect even when a caller bypasses the
    # builder entirely (splices a quadrant disagreeing with its own impact/uncertainty directly into a VALID
    # record's own raw dict, after construction). ---
    tampered = dict(mapping)
    tampered["mapped_assumptions"] = [dict(e) for e in mapping["mapped_assumptions"]]
    tampered["mapped_assumptions"][0]["quadrant"] = "MONITOR"  # was VALIDATE_FIRST for HIGH/HIGH
    tampered_gate = evaluate_assumption_mapping_gates(tampered, "run_assumption_mapping_slice", clock.at(2.0))
    tamper_caught = not all_gates_pass(tampered_gate)
    schema_layer_blocked = False
    try:
        contracts.validate(S["assumption_mapping"], tampered, "tampered mapping (must be refused by schema too)")
    except SchemaValidationError:
        schema_layer_blocked = True
    if not tamper_caught:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ASSUMPTIONMAPPING_GATE_NOT_INDEPENDENT: runtime_gate_caught={tamper_caught} -- the independent gate must catch a hand-tampered quadrant")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "TamperedRecordCaughtByGate", {"tampered_gate_results": tampered_gate, "schema_layer_blocked": schema_layer_blocked}, 2.1)
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
        "mapping": mapping,
        "gate_results": gate_results,
        "smuggled_quadrant_refusal_proof": smuggled_quadrant_refusal_proof,
        "tampered_gate_results": tampered_gate,
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_leverage_point_analysis_slice.py)",
    }
    write_json(runtime / "results" / "assumption_mapping_slice_result.json", result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    config = SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset)
    try:
        result = run_assumption_mapping_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    quadrants = ", ".join(f"{e['assumption_id']}={e['quadrant']}" for e in result["mapping"]["mapped_assumptions"])
    print(
        f"PASS epistemic.assumption_mapping: AssumptionMapping {result['mapping']['id']} built [{quadrants}], gates [{gate_summary}]; "
        f"smuggled quadrant REFUSED ({result['smuggled_quadrant_refusal_proof']['error_code']}); "
        f"hand-tampered quadrant caught via the INDEPENDENT gate (not just the builder)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
