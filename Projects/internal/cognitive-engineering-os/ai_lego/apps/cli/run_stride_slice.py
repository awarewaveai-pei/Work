"""``security.stride`` vertical slice -- the forty-fourth Method Atlas slice, FIRST member of a new
`security` family (F20).

Builds a real checkout-API threat model with two DFD elements, one
threat recorded against the process element (leaving the data-store
element surfaced in `elements_with_no_recorded_threats`, not enforced
as an error), and a minimal freshly-scoped review with zero threats.
Then proves the referential-integrity invariant is real by attempting
to construct a threat naming a data-flow element that does not exist
(construction layer), and proves the "re-derived, not trusted"
discipline at the independent gate layer by hand-tampering a COPY of
the valid record to falsely claim an element has recorded threats when
it does not (gate layer).

Run::

    python -m ai_lego.apps.cli.run_stride_slice
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
from ai_lego.errors import InvariantViolation
from ai_lego.modules.security.stride import (
    METHOD_ID,
    all_gates_pass,
    evaluate_stride_gates,
    generate_stride_threat_model_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-STRIDE-SYNTHETIC-001"
EXECUTION_ID = "EX-STRIDE-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-STRIDE-001"

S = {
    "stride_record": "ai-lego://specs/cognitive/typed-objects/stride-threat-model-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _dfd(name: str, element_type: str) -> dict[str, Any]:
    return {"name": name, "element_type": element_type}


def _threat(element_name: str, category: str, description: str, control: str, residual_risk: str, test_evidence: str) -> dict[str, Any]:
    return {"element_name": element_name, "category": category, "description": description, "control": control, "residual_risk": residual_risk, "test_evidence": test_evidence}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-stride-slice"


def run_stride_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real checkout-API threat model: one threat against the process element, the data store element
    # surfaced as having no recorded threats (not an error -- genuine, disclosed coverage evidence). ---
    descriptor, checkout_record = catalog.invoke(
        METHOD_ID,
        generate_stride_threat_model_record,
        "STRIDE-2026-09-06-001",
        "checkout-api order processing service",
        ["customer PII database", "payment processing credentials"],
        [{"name": "public internet to API gateway", "description": "Unauthenticated external traffic crosses into the authenticated service perimeter here."}],
        ["POST /v1/checkout"],
        [_dfd("checkout_api_process", "process"), _dfd("order_database", "data_store")],
        [
            _threat(
                "checkout_api_process",
                "elevation_of_privilege",
                "A malformed request could bypass role checks and process an order as an admin.",
                "Role checks enforced server-side via a shared authorization middleware, not client-supplied claims.",
                "Low -- middleware is covered by its own unit tests.",
                "Verified via authorization bypass test suite, run AUTHZ-2026-09-01.",
            )
        ],
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["stride_record"], checkout_record, "checkout-api STRIDE record")
    if checkout_record["elements_with_no_recorded_threats"] != ["order_database"]:
        raise InvariantViolation(f"STRIDE_EXPECTED_ORDER_DATABASE_UNCOVERED: got {checkout_record['elements_with_no_recorded_threats']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "StrideThreatModelRecordGenerated", {"stride_record": checkout_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_stride_gates(checkout_record, "run_stride_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"stride gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"STRIDE_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "StrideGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal, freshly-scoped review with zero threats recorded yet. ---
    _, reference_record = catalog.invoke(
        METHOD_ID,
        generate_stride_threat_model_record,
        "STRIDE-2026-09-06-002",
        "internal-reference lookup service",
        ["country-code reference table"],
        [],
        [],
        [_dfd("lookup_process", "process")],
        [],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["stride_record"], reference_record, "internal-reference STRIDE record")
    if reference_record["elements_with_no_recorded_threats"] != ["lookup_process"]:
        raise InvariantViolation(f"STRIDE_EXPECTED_LOOKUP_PROCESS_UNCOVERED: got {reference_record['elements_with_no_recorded_threats']!r}")

    # --- Prove the referential-integrity invariant is real, at the CONSTRUCTION layer: a threat naming a
    # data-flow element that does not exist. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_stride_threat_model_record(
            "STRIDE-2026-09-06-003",
            "some-system",
            ["some-asset"],
            [],
            [],
            [_dfd("real_element", "process")],
            [_threat("nonexistent_element", "tampering", "d", "c", "r", "t")],
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "STRIDE_INVALID_THREATS" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("STRIDE_INVARIANT_GUARD_DID_NOT_FIRE: a threat naming a non-existent data_flow_elements entry was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid checkout record and hand-tamper it to falsely claim elements_with_no_recorded_threats
    # is empty, leaving every raw threats[]/data_flow_elements[] entry UNTOUCHED. Pinned to the SPECIFIC
    # stride_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(checkout_record)
    tampered["elements_with_no_recorded_threats"] = []
    tampered_gate_results = evaluate_stride_gates(tampered, "run_stride_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "stride_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and integrity_result["evidence"][0]["reason"] == "stored elements_with_no_recorded_threats disagrees with recomputation"
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"STRIDE_GATE_GUARD_DID_NOT_FIRE: stride_integrity did not flag the falsely-emptied elements_with_no_recorded_threats "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "StrideInvariantVerified",
        {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        1.3,
    )
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
        "checkout_stride_record": checkout_record,
        "reference_stride_record": reference_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_retention_deletion_model_slice.py)",
    }
    write_json(runtime / "results" / "stride_slice_result.json", result)
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
        result = run_stride_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["checkout_stride_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS security.stride: {len(record['data_flow_elements'])} elements, {len(record['threats'])} threats, "
        f"uncovered={record['elements_with_no_recorded_threats']}, gates [{gate_summary}], "
        f"invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
