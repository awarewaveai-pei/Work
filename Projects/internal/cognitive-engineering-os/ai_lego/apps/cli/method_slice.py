"""Shared vertical-slice runner for single-method demos (``run_<name>_slice.py`` files built from 2026-09-17 on).

Each ``run_<name>_slice.py`` used to copy ~190 lines of identical ledger/runtime/gate/milestone plumbing. This
module owns that plumbing once; a slice file now declares only its ``MethodSliceSpec`` (fixture, a refusal, a
tamper) and calls ``main(spec)``. ``GET /methods/{id}/demo`` still shells out to ``run_<name>_slice.py`` --
the file per method stays, its body shrinks.

Trap: ``refuse`` MUST raise ``InvariantViolation`` and ``tamper`` MUST produce a record the gates reject; the
runner treats "guard did not fire" as a slice failure (exit 1), the same both-layers proof every legacy slice did.
"""

from __future__ import annotations

import argparse
import copy
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from ai_lego import PRODUCT_ROOT, REPO_ROOT, __version__, resolve_spec_root
from ai_lego.core.contracts.ledger_guards import PiiLedgerGuard
from ai_lego.core.contracts.runtime_dir import guard_runtime_dir, prepare_runtime_dir
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.tenant import CASCADIA
from ai_lego.core.support import DEFAULT_CLOCK, write_json
from ai_lego.data.events.event_ledger import EventLedger
from ai_lego.errors import InvariantViolation
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

METHOD_RESOLUTION_SCHEMA = "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result"
GATE_RESULT_SCHEMA = "ai-lego://specs/execution/gate.schema.yaml#/gate_result"


@dataclass(frozen=True)
class MethodSliceSpec:
    method_id: str
    schema_uri: str
    builder: Callable[..., dict[str, Any]]
    gates: Callable[[dict[str, Any], str, str], list[dict[str, Any]]]
    all_gates_pass: Callable[[list[dict[str, Any]]], bool]
    fixture_args: Callable[[], tuple[tuple[Any, ...], dict[str, Any]]]
    refuse: Callable[[], Any]
    tamper: Callable[[dict[str, Any]], dict[str, Any]]
    record_key: str
    summary: Callable[[dict[str, Any]], str] = field(default=lambda record: "")

    @property
    def slug(self) -> str:
        return self.method_id.split(".", 1)[1].upper().replace("_", "")


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def run_method_slice(spec: MethodSliceSpec, config: SliceConfig) -> dict[str, Any]:
    spec_root = resolve_spec_root(config.spec_root)
    runtime = (config.runtime_dir or Path(tempfile.gettempdir()) / f"ai-lego-{spec.method_id.replace('.', '-')}-slice").resolve()
    guard_runtime_dir(runtime, spec_root, REPO_ROOT, PRODUCT_ROOT / ".runtime")
    prepare_runtime_dir(runtime, config.reset)

    clock = DEFAULT_CLOCK
    contracts = SchemaContracts(spec_root)
    run_id = f"RUN-{spec.slug}-SYNTHETIC-001"
    aggregate_id = f"{CASCADIA.tenant_id}:PROJ-{spec.slug}-001"
    ledger = EventLedger(runtime / "data" / "events" / "ledger.jsonl", run_id, clock, validator=contracts.validate, payload_guard=PiiLedgerGuard())
    milestones = ["RECEIVED"]

    catalog = MethodCatalog.from_spec_root(spec_root)
    resolution = catalog.resolve([spec.method_id])
    contracts.validate(METHOD_RESOLUTION_SCHEMA, resolution, "method resolution")
    if resolution["blocked"] is not None:
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{METHOD_RESOLUTION_BLOCKED}: {resolution['blocked']['reason']}")
    milestones.append("METHODS_RESOLVED")

    args, kwargs = spec.fixture_args()
    descriptor, record = catalog.invoke(spec.method_id, spec.builder, *args, **kwargs)
    contracts.validate(spec.schema_uri, record, spec.record_key)
    ledger.append(CASCADIA.tenant_id, aggregate_id, f"{spec.slug.title()}Generated", {spec.record_key: record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    validator_name = f"run_{spec.method_id.split('.', 1)[1]}_slice"
    gate_results = spec.gates(record, validator_name, clock.at(1.1))
    for gate in gate_results:
        contracts.validate(GATE_RESULT_SCHEMA, gate, f"{spec.record_key} gate {gate['gate_id']}")
    if not spec.all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"{spec.slug}_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(CASCADIA.tenant_id, aggregate_id, f"{spec.slug.title()}GatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    construction_refused = False
    try:
        spec.refuse()
    except InvariantViolation:
        construction_refused = True
    tampered = spec.tamper(copy.deepcopy(record))
    gate_caught_tamper = not spec.all_gates_pass(spec.gates(tampered, validator_name, clock.at(1.3)))
    if not (construction_refused and gate_caught_tamper):
        raise InvariantViolation(f"{spec.slug}_INVARIANT_GUARD_DID_NOT_FIRE: construction_refused={construction_refused}, gate_caught_tamper={gate_caught_tamper}")
    ledger.append(CASCADIA.tenant_id, aggregate_id, f"{spec.slug.title()}InvariantVerified", {"construction_refused": True, "gate_caught_tamper": True}, 1.4)
    ledger.close_aggregate(aggregate_id)
    milestones.append("VERIFYING")

    result = {
        "run_id": run_id,
        "execution_id": f"EX-{spec.slug}-SYNTHETIC-001",
        "product_version": __version__,
        "runtime_dir": str(runtime),
        "method_id": spec.method_id,
        "method_resolution": resolution,
        "method_invocation": descriptor,
        spec.record_key: record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_refused": construction_refused, "gate_caught_tamper": gate_caught_tamper},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice)",
    }
    write_json(runtime / "results" / f"{spec.record_key}_slice_result.json", result)
    return result


def main(spec: MethodSliceSpec, argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=f"{spec.method_id} vertical slice")
    parser.add_argument("--spec-root", type=Path, default=None)
    parser.add_argument("--runtime-dir", type=Path, default=None)
    parser.add_argument("--no-reset", action="store_true")
    args = parser.parse_args(argv)
    try:
        result = run_method_slice(spec, SliceConfig(spec_root=args.spec_root, runtime_dir=args.runtime_dir, reset=not args.no_reset))
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    v = result["invariant_verification"]
    print(f"PASS {spec.method_id}: {spec.summary(result[spec.record_key])} gates [{gate_summary}], invariant_refused(construction={v['construction_refused']}, gate={v['gate_caught_tamper']})")
    return 0
