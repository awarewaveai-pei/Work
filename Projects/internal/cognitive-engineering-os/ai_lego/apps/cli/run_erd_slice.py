"""``database_data.erd`` vertical slice -- the thirty-ninth Method Atlas slice, fifth member of the
`database_data` family.

Builds a real two-entity model (orders reference customers, many_to_one,
citing the migration that introduced this schema) and a real
junction-entity model (order_items resolves a many_to_many between
orders and products via two many_to_one relationships, PLUS a third
entity, shipments, referencing order_items via a COMPOSITE foreign key
-- one relationship entry with two foreign_key_attributes, not two
independent relationships). Then proves the at-least-one-key-per-entity
invariant is real by attempting to construct an entity with no primary
key attribute (construction layer), and proves the "re-derived, not
trusted" discipline at the independent gate layer by hand-tampering a
COPY of the valid model to retarget a relationship's own
foreign_key_attributes at an attribute that does not exist on its own
from_entity, leaving every entity untouched (gate layer).

Run::

    python -m ai_lego.apps.cli.run_erd_slice
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
from ai_lego.modules.database_data.erd import (
    METHOD_ID,
    all_gates_pass,
    evaluate_erd_gates,
    generate_erd_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RUN_ID = "RUN-ERD-SYNTHETIC-001"
EXECUTION_ID = "EX-ERD-SYNTHETIC-001"
AGGREGATE_ID = f"{NORDBROOK.tenant_id}:PROJ-ERD-001"

S = {
    "erd_record": "ai-lego://specs/cognitive/typed-objects/erd-record.schema.yaml",
    "method_resolution": "ai-lego://specs/execution/method-resolution.schema.yaml#/method_resolution_result",
    "gate_result": "ai-lego://specs/execution/gate.schema.yaml#/gate_result",
}


def _attr(name: str, data_type: str = "uuid", pk: bool = False) -> dict[str, Any]:
    return {"name": name, "data_type": data_type, "is_primary_key": pk}


def _entity(name: str, attributes: list[dict[str, Any]]) -> dict[str, Any]:
    return {"name": name, "attributes": attributes}


def _rel(from_entity: str, to_entity: str, fks: list[str], cardinality: str = "many_to_one") -> dict[str, Any]:
    return {"from_entity": from_entity, "to_entity": to_entity, "cardinality": cardinality, "foreign_key_attributes": fks}


TWO_ENTITY_ENTITIES = [
    _entity("customers", [_attr("customer_id", pk=True), _attr("email", "varchar(255)")]),
    _entity("orders", [_attr("order_id", pk=True), _attr("customer_id"), _attr("total_cents", "bigint")]),
]
TWO_ENTITY_RELATIONSHIPS = [_rel("orders", "customers", ["customer_id"])]

JUNCTION_ENTITIES = [
    _entity("orders", [_attr("order_id", pk=True)]),
    _entity("products", [_attr("product_id", pk=True)]),
    _entity("order_items", [_attr("order_id", pk=True), _attr("product_id", pk=True), _attr("quantity", "integer")]),
    _entity("shipments", [_attr("shipment_id", pk=True), _attr("order_id"), _attr("product_id"), _attr("shipped_at", "timestamptz")]),
]
JUNCTION_RELATIONSHIPS = [
    _rel("order_items", "orders", ["order_id"]),
    _rel("order_items", "products", ["product_id"]),
    _rel("shipments", "order_items", ["order_id", "product_id"]),  # a COMPOSITE foreign key, one relationship entry
]


@dataclass
class SliceConfig:
    spec_root: Path | None = None
    runtime_dir: Path | None = None
    reset: bool = True


def default_runtime_dir() -> Path:
    import tempfile

    return Path(tempfile.gettempdir()) / "ai-lego-erd-slice"


def run_erd_slice(config: SliceConfig) -> dict[str, Any]:
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

    # --- A real two-entity model: orders reference customers, many_to_one, citing the migration that
    # introduced this schema (resolves Atlas's own §11.47 L2305 migration soft-link benefit). ---
    descriptor, record = catalog.invoke(
        METHOD_ID,
        generate_erd_record,
        "ERD-2026-09-05-001",
        "checkout-api order database",
        TWO_ENTITY_ENTITIES,
        TWO_ENTITY_RELATIONSHIPS,
        ["orders.customer_id references a customer that must exist"],
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        migration_ref="ECMIG-2026-09-05-001",
    )
    contracts.validate(S["erd_record"], record, "erd record")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ErdRecordGenerated", {"erd_record": record, "method_descriptor": descriptor}, 1)
    milestones.append("METHOD_EXECUTED")

    gate_results = evaluate_erd_gates(record, "run_erd_slice", clock.at(1.1))
    for gate in gate_results:
        contracts.validate(S["gate_result"], gate, f"erd gate {gate['gate_id']}")
    if not all_gates_pass(gate_results):
        milestones.append("BLOCKED")
        raise InvariantViolation(f"ERD_GATE_FAILED: {[g['gate_id'] for g in gate_results if g['status'] not in {'PASS', 'NOT_APPLICABLE'}]}")
    ledger.append(NORDBROOK.tenant_id, AGGREGATE_ID, "ErdGatesEvaluated", {"gate_results": gate_results}, 1.2)
    milestones.append("GATES_PASSED")

    # --- A real junction-entity model: order_items resolves a many_to_many via two many_to_one relationships,
    # PLUS shipments referencing order_items via a COMPOSITE foreign key (one relationship, two columns). ---
    _, junction_record = catalog.invoke(
        METHOD_ID,
        generate_erd_record,
        "ERD-2026-09-05-002",
        "checkout-api order database",
        JUNCTION_ENTITIES,
        JUNCTION_RELATIONSHIPS,
        [],
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    contracts.validate(S["erd_record"], junction_record, "junction-entity erd record")
    if len(junction_record["relationships"]) != 3:
        raise InvariantViolation(f"ERD_EXPECTED_THREE_RELATIONSHIPS: expected 3, got {len(junction_record['relationships'])}")
    composite_rel = next(r for r in junction_record["relationships"] if r["from_entity"] == "shipments")
    if composite_rel["foreign_key_attributes"] != ["order_id", "product_id"]:
        raise InvariantViolation(f"ERD_EXPECTED_COMPOSITE_FK: expected ['order_id', 'product_id'], got {composite_rel['foreign_key_attributes']!r}")

    # --- Prove the at-least-one-key-per-entity invariant is real, at the CONSTRUCTION layer: an entity with
    # NO primary key attribute. Must be refused. ---
    construction_layer_blocked = False
    try:
        generate_erd_record(
            "ERD-2026-09-05-003",
            "checkout-api order database",
            [_entity("audit_log", [_attr("event_type", "text"), _attr("occurred_at", "timestamptz")])],
            [],
            [],
            make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        )
    except InvariantViolation as error:
        construction_layer_blocked = "ERD_INVALID_ENTITIES" in str(error)
    if not construction_layer_blocked:
        raise InvariantViolation("ERD_INVARIANT_GUARD_DID_NOT_FIRE: an entity with no primary key attribute was accepted (or a different guard fired instead)")

    # --- Prove the SAME "re-derived, not trusted" discipline at the independent GATE layer: take a COPY of the
    # real, valid two-entity model and hand-tamper its own relationship to retarget foreign_key_attributes at
    # an attribute that exists on customers (to_entity) but NOT on orders (from_entity), leaving every entity
    # UNTOUCHED. Pinned to the SPECIFIC erd_integrity gate and its own evidence. ---
    tampered = copy.deepcopy(record)
    tampered["relationships"][0]["foreign_key_attributes"] = ["email"]
    tampered_gate_results = evaluate_erd_gates(tampered, "run_erd_slice", clock.at(1.25))
    integrity_result = next(g for g in tampered_gate_results if g["gate_id"] == "erd_integrity")
    gate_layer_blocked = integrity_result["status"] == "FAIL" and "invalid_relationships" in integrity_result["evidence"][0]
    if not gate_layer_blocked:
        raise InvariantViolation(
            f"ERD_GATE_GUARD_DID_NOT_FIRE: erd_integrity did not flag the retargeted foreign_key_attribute "
            f"(status={integrity_result['status']}, evidence={integrity_result['evidence']})"
        )

    ledger.append(
        NORDBROOK.tenant_id,
        AGGREGATE_ID,
        "ErdInvariantVerified",
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
        "erd_record": record,
        "junction_erd_record": junction_record,
        "gate_results": gate_results,
        "invariant_verification": {"construction_layer_blocked": construction_layer_blocked, "gate_layer_blocked": gate_layer_blocked},
        "milestones": milestones,
        "state_machine_final_state": "VERIFYING (release states are outside the local synthetic slice, same scope decision as run_fishbone_slice.py)",
    }
    write_json(runtime / "results" / "erd_slice_result.json", result)
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
        result = run_erd_slice(config)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    record = result["erd_record"]
    v = result["invariant_verification"]
    gate_summary = ", ".join(f"{g['gate_id']}={g['status']}" for g in result["gate_results"])
    print(
        f"PASS database_data.erd: {len(record['entities'])} entities, {len(record['relationships'])} relationships, "
        f"{len(record['constraints'])} constraints, migration_ref={record.get('migration_ref')}, gates [{gate_summary}], "
        f"invariant_verified(construction={v['construction_layer_blocked']}, gate={v['gate_layer_blocked']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
