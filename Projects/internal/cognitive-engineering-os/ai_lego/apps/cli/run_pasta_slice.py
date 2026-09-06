"""``security.pasta`` vertical slice -- the forty-seventh Method Atlas slice, FOURTH member of the
`security` family (F20), a genuinely THIRD structural shape (a fixed-length, positionally-ordered
seven-stage pipeline) after STRIDE/LINDDUN's shared flat-DFD shape and Attack Tree's own recursive tree.

Builds a real payment-gateway-integration PASTA review walking all
seven of Atlas's own stages in Atlas's own literal order, and a minimal
review. Then proves the ORDER invariant is real at the CONSTRUCTION
layer (two adjacent stages swapped must be refused), and the
"re-derived, not trusted" discipline at the independent GATE layer
(hand-tampering a copy's own stage order must be caught).

Run::

    python -m ai_lego.apps.cli.run_pasta_slice
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
from ai_lego.modules.security.pasta import (
    METHOD_ID,
    all_gates_pass,
    evaluate_pasta_gates,
    generate_pasta_threat_model_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PASTA-SYNTHETIC-001"
EXECUTION_ID = "EX-PASTA-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PASTA-001"

S = {
    "pasta_record": "ai-lego://specs/cognitive/typed-objects/pasta-threat-model-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _process(stage_id: str, summary: str) -> dict[str, Any]:
    return {"stage_id": stage_id, "summary": summary}


def _risk(summary: str, control: str, residual_risk: str, test_evidence: str) -> dict[str, Any]:
    return {"stage_id": "risk", "summary": summary, "control": control, "residual_risk": residual_risk, "test_evidence": test_evidence}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-pasta-slice"


def run_pasta_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real payment-gateway-integration PASTA review, all seven of Atlas's own stages in Atlas's own
    # literal order. ---
    stages = [
        _process("business", "Protect merchant revenue and PCI compliance posture; a breach here risks card-network fines and loss of processing rights."),
        _process("scope", "In scope: the merchant's own charge-initiation service and its outbound call to the gateway. Out of scope: the gateway's own internal infrastructure."),
        _process("decompose", "Charge request assembled from cart total -> tokenized card reference attached -> signed request sent to gateway -> webhook callback updates order status."),
        _process("threat", "Webhook callback endpoint could be spoofed to falsely mark unpaid orders as paid."),
        _process("vulnerability", "Webhook signature verification exists but the shared secret has not been rotated since initial integration."),
        _process("attack", "An attacker who obtains the webhook secret (e.g. via a misconfigured log) could forge a paid-order callback for any order id."),
        _risk(
            "Medium-high residual risk given the secret rotation gap.",
            "Webhook signature verification enforced; secret stored in the secrets manager, not in application config.",
            "Medium -- rotation policy not yet automated.",
            "Manual verification of signature-check code path, 2026-09-01.",
        ),
    ]
    descriptor, payment_record = catalog.invoke(
        METHOD_ID,
        generate_pasta_threat_model_record,
        "PASTA-2026-09-06-001",
        "third-party payment gateway integration",
        ["cardholder tokenized reference", "merchant settlement records"],
        [{"name": "merchant backend to payment gateway", "description": "Outbound calls cross into a third-party PCI-scope boundary."}],
        ["POST /v1/checkout/charge"],
        stages,
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["pasta_record"], payment_record, "payment-gateway PASTA record")
    if [s["stage_id"] for s in payment_record["stages"]] != ["business", "scope", "decompose", "threat", "vulnerability", "attack", "risk"]:
        raise InvariantViolation(f"PASTA_EXPECTED_ATLAS_ORDER: got {[s['stage_id'] for s in payment_record['stages']]!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PastaThreatModelRecordGenerated", {"pasta_record": payment_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_pasta_gates(payment_record, "run_pasta_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"pasta gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"PASTA_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "PastaGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal, freshly-scoped review with empty trust_boundaries/entry_points. ---
    minimal_stages = [
        _process("business", "Keep the reference table available for internal lookups."),
        _process("scope", "In scope: the lookup service itself only."),
        _process("decompose", "Single read-only endpoint querying a static table."),
        _process("threat", "No credible threat identified for non-sensitive reference data."),
        _process("vulnerability", "None identified."),
        _process("attack", "No viable attack path identified."),
        _risk("Low residual risk.", "Read-only role, no write path exists.", "Low -- data is non-sensitive reference data.", "Access review, 2026-09-01."),
    ]
    _, reference_record = catalog.invoke(
        METHOD_ID,
        generate_pasta_threat_model_record,
        "PASTA-2026-09-06-003",
        "internal-reference lookup service",
        ["country-code reference table"],
        [],
        [],
        minimal_stages,
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["pasta_record"], reference_record, "internal-reference PASTA record")
    if [s["stage_id"] for s in reference_record["stages"]] != list(("business", "scope", "decompose", "threat", "vulnerability", "attack", "risk")):
        raise InvariantViolation(f"PASTA_EXPECTED_ATLAS_ORDER: got {[s['stage_id'] for s in reference_record['stages']]!r}")

    # --- Prove the ORDER invariant is real, at the CONSTRUCTION layer: two adjacent process stages
    # (business/scope) swapped must be refused, even though the SET of seven stage_ids is unchanged. ---
    swapped_stages = list(stages)
    swapped_stages[0], swapped_stages[1] = swapped_stages[1], swapped_stages[0]
    construction_layer_blocked = False
    try:
        generate_pasta_threat_model_record(
            "PASTA-2026-09-06-002",
            "some-system",
            ["some-asset"],
            [],
            [],
            swapped_stages,
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "PASTA_INVALID_STAGES" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("PASTA_INVARIANT_GUARD_DID_NOT_FIRE: two adjacent stages swapped (same set, wrong order) were accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid payment record and hand-tamper its own stage ORDER (same seven stage_ids, business and
    # scope swapped), leaving every raw stage's own content UNTOUCHED. Pinned to the SPECIFIC pasta_integrity
    # gate. ---
    tampered = copy.deepcopy(payment_record)
    tampered["stages"][0], tampered["stages"][1] = tampered["stages"][1], tampered["stages"][0]
    tampered_gate_results = evaluate_pasta_gates(tampered, "run_pasta_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "pasta_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "stages invalid" in integrity_result["evidence"][0]["reason"]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"PASTA_GATE_GUARD_DID_NOT_FIRE: pasta_integrity did not flag the reordered stages "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "PastaInvariantVerified",
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
        "payment_pasta_record": payment_record,
        "reference_pasta_record": reference_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "pasta_slice_result.json", result)
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
        result = run_pasta_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["payment_pasta_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS security.pasta: {len(record['stages'])} stages in order {[s['stage_id'] for s in record['stages']]}, gates [{gate_summary}], "
        f"invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
