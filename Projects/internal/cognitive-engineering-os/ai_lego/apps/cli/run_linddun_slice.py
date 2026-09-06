"""``security.linddun`` vertical slice -- the forty-fifth Method Atlas slice, SECOND member of the
`security` family (F20), immediately after `security.stride`.

Mirrors `run_stride_slice.py`'s own structure exactly: a real memory-
retrieval-service privacy review with two DFD elements, one threat
recorded against the process element (leaving the shared vector index
surfaced in `elements_with_no_recorded_threats`, not enforced as an
error), and a minimal freshly-scoped review with zero threats. Then
proves the referential-integrity invariant is real at the construction
layer, and the "re-derived, not trusted" discipline at the independent
gate layer, the identical two-layer proof `run_stride_slice.py` already
establishes.

Run::

    python -m ai_lego.apps.cli.run_linddun_slice
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
from ai_lego.modules.security.linddun import (
    METHOD_ID,
    all_gates_pass,
    evaluate_linddun_gates,
    generate_linddun_privacy_threat_model_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-LINDDUN-SYNTHETIC-001"
EXECUTION_ID = "EX-LINDDUN-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-LINDDUN-001"

S = {
    "linddun_record": "ai-lego://specs/cognitive/typed-objects/linddun-privacy-threat-model-record.schema.yaml",
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

    return Path(tempfile.gettempdir()) / "ai-lego-linddun-slice"


def run_linddun_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real memory-retrieval-service privacy review: one threat against the process element, the
    # shared vector index surfaced as having no recorded threats (not an error -- genuine, disclosed
    # coverage evidence). ---
    descriptor, memory_record = catalog.invoke(
        METHOD_ID,
        generate_linddun_privacy_threat_model_record,
        "LINDDUN-2026-09-06-001",
        "cross-project semantic memory retrieval service",
        ["personal preference embeddings", "cross-project semantic memory index"],
        [{"name": "Project A workspace to shared vector index", "description": "Queries from one project's workspace reach a vector index shared across all projects."}],
        ["POST /v1/memory/query"],
        [_dfd("memory_retrieval_process", "process"), _dfd("shared_vector_index", "data_store")],
        [
            _threat(
                "memory_retrieval_process",
                "linkability",
                "Query results could link a data subject's preferences across otherwise-separate projects/workspaces without their awareness.",
                "Query scope is restricted server-side to the requesting project's own tenant_id filter.",
                "Medium -- filter is enforced but not yet covered by an automated cross-project leakage test.",
                "Manual review of the query-scoping middleware, 2026-09-01.",
            )
        ],
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
    )
    contracts.validate(S["linddun_record"], memory_record, "memory-retrieval-service LINDDUN record")
    if memory_record["elements_with_no_recorded_threats"] != ["shared_vector_index"]:
        raise InvariantViolation(f"LINDDUN_EXPECTED_SHARED_VECTOR_INDEX_UNCOVERED: got {memory_record['elements_with_no_recorded_threats']!r}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "LinddunPrivacyThreatModelRecordGenerated", {"linddun_record": memory_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_linddun_gates(memory_record, "run_linddun_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"linddun gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"LINDDUN_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "LinddunGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A minimal, freshly-scoped review with zero threats recorded yet. ---
    _, reference_record = catalog.invoke(
        METHOD_ID,
        generate_linddun_privacy_threat_model_record,
        "LINDDUN-2026-09-06-002",
        "internal-reference lookup service",
        ["country-code reference table"],
        [],
        [],
        [_dfd("lookup_process", "process")],
        [],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["linddun_record"], reference_record, "internal-reference LINDDUN record")
    if reference_record["elements_with_no_recorded_threats"] != ["lookup_process"]:
        raise InvariantViolation(f"LINDDUN_EXPECTED_LOOKUP_PROCESS_UNCOVERED: got {reference_record['elements_with_no_recorded_threats']!r}")

    # --- Prove the referential-integrity invariant is real, at the CONSTRUCTION layer: a threat naming a
    # data-flow element that does not exist. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_linddun_privacy_threat_model_record(
            "LINDDUN-2026-09-06-003",
            "some-system",
            ["some-asset"],
            [],
            [],
            [_dfd("real_element", "process")],
            [_threat("nonexistent_element", "identifiability", "d", "c", "r", "t")],
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "LINDDUN_INVALID_THREATS" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("LINDDUN_INVARIANT_GUARD_DID_NOT_FIRE: a threat naming a non-existent data_flow_elements entry was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid memory-retrieval record and hand-tamper it to falsely claim
    # elements_with_no_recorded_threats is empty, leaving every raw threats[]/data_flow_elements[] entry
    # UNTOUCHED. Pinned to the SPECIFIC linddun_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(memory_record)
    tampered["elements_with_no_recorded_threats"] = []
    tampered_gate_results = evaluate_linddun_gates(tampered, "run_linddun_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "linddun_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and integrity_result["evidence"][0]["reason"] == "stored elements_with_no_recorded_threats disagrees with recomputation"
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"LINDDUN_GATE_GUARD_DID_NOT_FIRE: linddun_integrity did not flag the falsely-emptied elements_with_no_recorded_threats "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "LinddunInvariantVerified",
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
        "memory_linddun_record": memory_record,
        "reference_linddun_record": reference_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_stride_slice.py)",
    }
    write_json(runtime / "results" / "linddun_slice_result.json", result)
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
        result = run_linddun_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["memory_linddun_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS security.linddun: {len(record['data_flow_elements'])} elements, {len(record['threats'])} threats, "
        f"uncovered={record['elements_with_no_recorded_threats']}, gates [{gate_summary}], "
        f"invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
