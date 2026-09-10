"""``causal.process_tracing`` vertical slice -- 2nd member of the F11 causal family (after ``causal.dag``),
built alongside 4 concurrent siblings (causal.counterfactual_reasoning/theory_of_change/logic_model/rct) in
this same batch. See ``ai_lego.modules.causal.process_tracing``'s own module docstring for the full
due-diligence read (Atlas F11 table row L620, zero pre-existing implementation confirmed by whole-tree grep).

Builds a real product-launch-slip mechanism test: one HOOP test that passes (does not eliminate) and one
SMOKING_GUN test that finds direct evidence (confirms) -- ``hypothesis_status`` GENUINE_COMPUTE resolves to
``CONFIRMED``. Then proves the ``evidence`` minItems invariant is real by attempting to construct a record with
zero evidence (construction layer), and proves the "re-derived, not trusted" discipline at the independent
gate layer by hand-tampering a COPY of a record to falsely flip a HOOP test's own stored ``implication`` from
``HYPOTHESIS_ELIMINATED`` to ``HYPOTHESIS_NOT_ELIMINATED`` while leaving its own ``result: ABSENT`` untouched
-- proving the gate re-derives per-EVIDENCE-ITEM ``implication``, not just the record-level
``hypothesis_status`` (a new per-item genuine_compute shape in this suite, not previously exercised by
``association.morphological_analysis``'s own record-level-only tamper proof).

Run::

    python -m ai_lego.apps.cli.run_process_tracing_slice
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
from ai_lego.modules.causal.process_tracing import (
    METHOD_ID,
    all_gates_pass,
    evaluate_process_tracing_gates,
    generate_process_tracing_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-PROCESSTRACING-SYNTHETIC-001"
EXECUTION_ID = "EX-PROCESSTRACING-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-PROCESSTRACING-001"

S = {
    "process_tracing_record": "ai-lego://specs/cognitive/typed-objects/process-tracing-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _evidence(evidence_id: str, test_type: str, description: str, result: str) -> dict[str, Any]:
    epistemic_type = "SOURCE_FACT" if test_type == "SMOKING_GUN" else "EVIDENCE"
    return {"id": evidence_id, "test_type": test_type, "description": description, "result": result, "provenance": make_provenance(epistemic_type, "HUMAN_APPROVED")}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-process-tracing-slice"


def run_process_tracing_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real mechanism test: one HOOP test that passes (does not eliminate), one SMOKING_GUN test that
    # finds direct evidence (confirms). hypothesis_status GENUINE_COMPUTE resolves to CONFIRMED. ---
    mechanism = "Regulatory approval delay caused the product launch slip, mediated by a compliance re-filing requirement, not by engineering capacity."
    descriptor, confirmed_record = catalog.invoke(
        METHOD_ID,
        generate_process_tracing_record,
        "PROCESSTRACING-2026-09-10-001",
        mechanism,
        [
            _evidence("EV-1", "HOOP", "If the mechanism is real, the compliance re-filing date must precede the announced slip date.", "PRESENT"),
            _evidence(
                "EV-2",
                "SMOKING_GUN",
                "An internal compliance-team email explicitly requesting the re-filing, dated before the slip announcement, naming the launch as blocked.",
                "PRESENT",
            ),
        ],
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        cause_hypothesis_set_ref="CHS-2026-09-04-001",
    )
    contracts.validate(S["process_tracing_record"], confirmed_record, "confirmed process-tracing record")
    if confirmed_record["hypothesis_status"] != "CONFIRMED":
        raise InvariantViolation(f"PROCESSTRACING_EXPECTED_CONFIRMED: got {confirmed_record['hypothesis_status']!r}")
    if confirmed_record["evidence"][0]["implication"] != "HYPOTHESIS_NOT_ELIMINATED":
        raise InvariantViolation(f"PROCESSTRACING_EXPECTED_NOT_ELIMINATED: got {confirmed_record['evidence'][0]['implication']!r}")
    if confirmed_record["evidence"][1]["implication"] != "HYPOTHESIS_CONFIRMED":
        raise InvariantViolation(f"PROCESSTRACING_EXPECTED_CONFIRMED_EVIDENCE: got {confirmed_record['evidence'][1]['implication']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ProcessTracingRecordGenerated", {"process_tracing_record": confirmed_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_process_tracing_gates(confirmed_record, "run_process_tracing_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"process tracing gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"PROCESSTRACING_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ProcessTracingGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- An eliminated mechanism: the HOOP test fails, ELIMINATED overrides an unrelated SMOKING_GUN
    # confirmation in the SAME evidence set -- the real precedence invariant, not a hypothetical. ---
    _, eliminated_record = catalog.invoke(
        METHOD_ID,
        generate_process_tracing_record,
        "PROCESSTRACING-2026-09-10-002",
        mechanism,
        [
            _evidence("EV-1", "HOOP", "If the mechanism is real, a compliance re-filing record must exist in the regulator's own public docket for this product.", "ABSENT"),
            _evidence("EV-2", "SMOKING_GUN", "An internal engineering standup note mentioning a capacity shortfall in the same week as the slip.", "PRESENT"),
        ],
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["process_tracing_record"], eliminated_record, "eliminated process-tracing record")
    if eliminated_record["hypothesis_status"] != "ELIMINATED":
        raise InvariantViolation(
            f"PROCESSTRACING_EXPECTED_ELIMINATED_PRECEDENCE: a failed HOOP test must eliminate the hypothesis even alongside a SMOKING_GUN confirmation, got {eliminated_record['hypothesis_status']!r}"
        )

    # --- Prove the evidence minItems invariant is real, at the CONSTRUCTION layer: a mechanism with zero
    # evidence tests. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_process_tracing_record("PROCESSTRACING-2026-09-10-003", mechanism, [], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
    except InvariantViolation as error:
        construction_layer_blocked = "PROCESSTRACING_EMPTY_EVIDENCE" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("PROCESSTRACING_INVARIANT_GUARD_DID_NOT_FIRE: a mechanism with zero evidence tests was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer, at the PER-ITEM
    # level (new in this suite): take a COPY of the confirmed record and hand-tamper its own HOOP entry's
    # implication to falsely claim HYPOTHESIS_NOT_ELIMINATED while its own result stays PRESENT anyway (a
    # no-op edit) -- instead tamper a DIFFERENT copy of the eliminated record's own HOOP entry, flipping its
    # implication from HYPOTHESIS_ELIMINATED to HYPOTHESIS_NOT_ELIMINATED while leaving result: ABSENT
    # untouched, then confirm the gate still reports ELIMINATED-shape evidence as invalid. ---
    tampered = copy.deepcopy(eliminated_record)
    tampered["evidence"][0]["implication"] = "HYPOTHESIS_NOT_ELIMINATED"
    tampered_gate_results = evaluate_process_tracing_gates(tampered, "run_process_tracing_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "process_tracing_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "implication" in integrity_result["evidence"][0]["reason"]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"PROCESSTRACING_GATE_GUARD_DID_NOT_FIRE: process_tracing_integrity did not flag a hand-tampered evidence[0].implication "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ProcessTracingInvariantVerified",
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
        "confirmed_process_tracing_record": confirmed_record,
        "eliminated_process_tracing_record": eliminated_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "process_tracing_slice_result.json", result)
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
        result = run_process_tracing_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["confirmed_process_tracing_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS causal.process_tracing: {len(record['evidence'])} evidence tests, hypothesis_status={record['hypothesis_status']!r}, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
