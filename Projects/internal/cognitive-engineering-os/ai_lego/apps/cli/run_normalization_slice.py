"""``database_data.normalization`` vertical slice -- the forty-first Method Atlas slice, seventh member of
the `database_data` family. Directly closes `database_data.erd`'s own OQ-ERD-3.

Builds a real 2NF-violating entity (order_items: a composite key,
product_id alone determines product_name/product_price), a real fully-
BCNF entity (customers: single-attribute key, no non-key FDs), and a
real 3NF-holds-but-BCNF-fails entity (the classic student/course/
teacher example). Then proves the key/non-key disjointness invariant
is real by attempting to construct a record with an attribute in both
lists (construction layer), and proves the "re-derived, not trusted"
discipline at the independent gate layer by hand-tampering a COPY of
the valid record to claim a stronger achieved_normal_form than the
declared key/FDs actually support (gate layer).

Run::

    python -m ai_lego.apps.cli.run_normalization_slice
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
from ai_lego.modules.database_data.normalization import (
    METHOD_ID,
    all_gates_pass,
    evaluate_normalization_gates,
    generate_normalization_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-NORMALIZATION-SYNTHETIC-001"
EXECUTION_ID = "EX-NORMALIZATION-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-NORMALIZATION-001"

S = {
    "normalization_record": "ai-lego://specs/cognitive/typed-objects/normalization-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _fd(determinant: list[str], dependent: str) -> dict[str, Any]:
    return {"determinant": determinant, "dependent": dependent}


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-normalization-slice"


def run_normalization_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real 2NF-violating entity: order_items has a composite key, product_id alone (a proper subset)
    # determines product_name/product_price -- a partial dependency, resolving to FIRST_NF. Cites the ERD
    # this entity came from (resolving OQ-ERD-3) and records a conscious denormalization decision. ---
    descriptor, order_items_record = catalog.invoke(
        METHOD_ID,
        generate_normalization_record,
        "NORM-2026-09-06-001",
        "order_items",
        ["order_id", "product_id"],
        ["quantity", "product_name", "product_price"],
        [_fd(["product_id"], "product_name"), _fd(["product_id"], "product_price")],
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        schema_ref="ERD-2026-09-05-002",
        denormalization_decision={"decision": "denormalize", "reasoning": "product_name/product_price are intentionally duplicated to preserve the historical price at time of order."},
    )
    contracts.validate(S["normalization_record"], order_items_record, "order_items normalization record")
    if order_items_record["achieved_normal_form"] != "FIRST_NF":
        raise InvariantViolation(f"NORMALIZATION_EXPECTED_FIRST_NF: expected FIRST_NF, got {order_items_record['achieved_normal_form']!r}")
    if len(order_items_record["partial_dependency_violations"]) != 2:
        raise InvariantViolation(f"NORMALIZATION_EXPECTED_TWO_PARTIAL_VIOLATIONS: expected 2, got {len(order_items_record['partial_dependency_violations'])}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NormalizationRecordGenerated", {"normalization_record": order_items_record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_normalization_gates(order_items_record, "run_normalization_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"normalization gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"NORMALIZATION_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "NormalizationGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real fully-BCNF entity: single-attribute key, no non-key functional dependencies. ---
    _, customers_record = catalog.invoke(
        METHOD_ID,
        generate_normalization_record,
        "NORM-2026-09-06-002",
        "customers",
        ["customer_id"],
        ["email", "signup_date"],
        [],
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["normalization_record"], customers_record, "customers normalization record")
    if customers_record["achieved_normal_form"] != "BCNF":
        raise InvariantViolation(f"NORMALIZATION_EXPECTED_BCNF: expected BCNF, got {customers_record['achieved_normal_form']!r}")

    # --- The classic student/course/teacher example: 3NF holds (the only non-superkey determinant's
    # dependent is itself a key attribute) but BCNF fails. ---
    _, enrollment_record = catalog.invoke(
        METHOD_ID,
        generate_normalization_record,
        "NORM-2026-09-06-003",
        "enrollments",
        ["student_id", "course_id"],
        ["teacher_id"],
        [_fd(["student_id", "course_id"], "teacher_id"), _fd(["teacher_id"], "course_id")],
        make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
    )
    contracts.validate(S["normalization_record"], enrollment_record, "enrollments normalization record")
    if enrollment_record["achieved_normal_form"] != "THIRD_NF":
        raise InvariantViolation(f"NORMALIZATION_EXPECTED_THIRD_NF: expected THIRD_NF, got {enrollment_record['achieved_normal_form']!r}")
    if not enrollment_record["bcnf_violations"] or enrollment_record["transitive_dependency_violations"]:
        raise InvariantViolation(
            f"NORMALIZATION_EXPECTED_BCNF_ONLY_VIOLATION: expected non-empty bcnf_violations and empty transitive_dependency_violations, "
            f"got bcnf={enrollment_record['bcnf_violations']!r} transitive={enrollment_record['transitive_dependency_violations']!r}"
        )

    # --- Prove the key/non-key disjointness invariant is real, at the CONSTRUCTION layer: an attribute
    # appearing in BOTH lists. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_normalization_record(
            "NORM-2026-09-06-004",
            "broken_entity",
            ["id"],
            ["id", "name"],
            [],
            make_provenance("CALCULATED_RESULT", "AI_GENERATED"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "NORMALIZATION_KEY_NONKEY_OVERLAP" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("NORMALIZATION_INVARIANT_GUARD_DID_NOT_FIRE: an attribute in both primary_key_attributes and non_key_attributes was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of
    # the real, valid order_items record (genuinely FIRST_NF) and hand-tamper its own achieved_normal_form to
    # claim a stronger classification (BCNF) than the declared key/FDs actually support, leaving every raw
    # input field UNTOUCHED. Pinned to the SPECIFIC normalization_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(order_items_record)
    tampered["achieved_normal_form"] = "BCNF"
    tampered["partial_dependency_violations"] = []
    tampered["bcnf_violations"] = []
    tampered_gate_results = evaluate_normalization_gates(tampered, "run_normalization_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "normalization_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "disagrees with recomputation" in integrity_result["evidence"][0]["reason"]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"NORMALIZATION_GATE_GUARD_DID_NOT_FIRE: normalization_integrity did not flag the falsely-upgraded achieved_normal_form "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "NormalizationInvariantVerified",
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
        "order_items_normalization_record": order_items_record,
        "customers_normalization_record": customers_record,
        "enrollments_normalization_record": enrollment_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_erd_slice.py)",
    }
    write_json(runtime / "results" / "normalization_slice_result.json", result)
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
        result = run_normalization_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["order_items_normalization_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS database_data.normalization: order_items={record['achieved_normal_form']}, "
        f"customers={result['customers_normalization_record']['achieved_normal_form']}, "
        f"enrollments={result['enrollments_normalization_record']['achieved_normal_form']}, "
        f"gates [{gate_summary}], invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
