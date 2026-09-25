"""Mutation-style tests for ``database_data.erd`` (thirty-ninth Method Atlas slice, fifth member of the
`database_data` family). Atlas's own formula (entities->keys->relationships->constraints) plus §11.47's own
purpose/benefits are proven at BOTH independent layers -- construction-time and gate re-derivation, the gate
RE-DERIVING every structural and referential-integrity check fresh from the record's own raw fields rather
than trusting stored values. Every sorted-evidence test uses at least two distinct bad entries (the
untested-sort class three prior slices' own critic rounds each caught), all_gates_pass's own FAIL direction is
pinned (the class devops_sre.rto_rpo's own critic round caught), and foreign_key_attributes is an ARRAY
supporting composite foreign keys (a critic-caught design bug in this slice's own first draft, which used a
single string and could not represent a composite FK even though composite primary keys were already legal)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.erd import (
    METHOD_ID,
    all_gates_pass,
    evaluate_erd_gates,
    evaluate_erd_integrity_gate,
    evaluate_provenance_required_gate,
    generate_erd_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/erd-record.schema.yaml"
TS = "2026-09-05T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _attr(name, data_type="uuid", pk=False):
    return {"name": name, "data_type": data_type, "is_primary_key": pk}


def _entity(name, attributes):
    return {"name": name, "attributes": attributes}


def _rel(from_entity, to_entity, fks, cardinality="many_to_one"):
    return {"from_entity": from_entity, "to_entity": to_entity, "cardinality": cardinality, "foreign_key_attributes": fks if isinstance(fks, list) else [fks]}


def _two_entity_model():
    entities = [
        _entity("customers", [_attr("customer_id", pk=True), _attr("email")]),
        _entity("orders", [_attr("order_id", pk=True), _attr("customer_id"), _attr("total_cents", "bigint")]),
    ]
    relationships = [_rel("orders", "customers", "customer_id")]
    return entities, relationships


def _junction_model():
    entities = [
        _entity("orders", [_attr("order_id", pk=True)]),
        _entity("products", [_attr("product_id", pk=True)]),
        _entity("order_items", [_attr("order_id", pk=True), _attr("product_id", pk=True), _attr("quantity", "integer")]),
    ]
    relationships = [_rel("order_items", "orders", "order_id"), _rel("order_items", "products", "product_id")]
    return entities, relationships


def _composite_fk_model():
    """order_items has a composite PK (order_id, product_id); shipments holds a composite FK referencing
    BOTH columns as one relationship entry -- NOT two independent relationships."""
    entities = [
        _entity("orders", [_attr("order_id", pk=True)]),
        _entity("products", [_attr("product_id", pk=True)]),
        _entity("order_items", [_attr("order_id", pk=True), _attr("product_id", pk=True), _attr("quantity", "integer")]),
        _entity("shipments", [_attr("shipment_id", pk=True), _attr("order_id"), _attr("product_id"), _attr("shipped_at", "timestamptz")]),
    ]
    relationships = [
        _rel("order_items", "orders", "order_id"),
        _rel("order_items", "products", "product_id"),
        _rel("shipments", "order_items", ["order_id", "product_id"]),
    ]
    return entities, relationships


def _build(record_id="ERD-T-001", system="checkout-api order database", entities=None, relationships=None, constraints=None, migration_ref=None):
    if entities is None:
        entities, default_rels = _two_entity_model()
        if relationships is None:
            relationships = default_rels
    if relationships is None:
        relationships = []
    return generate_erd_record(record_id, system, entities, relationships, [] if constraints is None else constraints, _prov(), migration_ref=migration_ref)


def _valid_record():
    return _build()


def _valid_junction_record():
    entities, relationships = _junction_model()
    return _build(record_id="ERD-T-002", entities=entities, relationships=relationships)


def _valid_composite_fk_record():
    entities, relationships = _composite_fk_model()
    return _build(record_id="ERD-T-composite", entities=entities, relationships=relationships)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_two_entity_model_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "two-entity ERD record")

    def test_junction_entity_model_validates(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_junction_record(), "junction-entity ERD record")

    def test_composite_foreign_key_model_validates_as_one_relationship_entry(self):
        record = _valid_composite_fk_record()
        self.contracts.validate(RECORD_SCHEMA, record, "composite-FK ERD record")
        composite_rel = next(r for r in record["relationships"] if r["from_entity"] == "shipments")
        self.assertEqual(composite_rel["foreign_key_attributes"], ["order_id", "product_id"])

    def test_single_entity_no_relationships_validates(self):
        record = _build(record_id="ERD-T-003", entities=[_entity("settings", [_attr("key", pk=True), _attr("value")])], relationships=[])
        self.contracts.validate(RECORD_SCHEMA, record, "single-entity ERD record")

    def test_self_referencing_relationship_is_legal(self):
        """An entity may reference itself (e.g. employee.manager_id -> employee.employee_id) -- Atlas's own
        formula does not forbid this, and it is a real, common ERD shape."""
        entities = [_entity("employees", [_attr("employee_id", pk=True), _attr("manager_id")])]
        relationships = [_rel("employees", "employees", "manager_id")]
        record = _build(record_id="ERD-T-004", entities=entities, relationships=relationships)
        self.assertEqual(record["relationships"][0]["from_entity"], record["relationships"][0]["to_entity"])

    def test_composite_primary_key_is_legal(self):
        """More than one attribute flagged is_primary_key:true is legitimate (a composite key), not
        forbidden -- the junction-entity model already exercises this at construction; assert directly here."""
        record = _valid_junction_record()
        order_items = next(e for e in record["entities"] if e["name"] == "order_items")
        pk_count = sum(1 for a in order_items["attributes"] if a["is_primary_key"])
        self.assertEqual(pk_count, 2)

    def test_builder_round_trips_generated_by_method_and_version(self):
        entities, relationships = _two_entity_model()
        record = generate_erd_record("ERD-T-005", "s", entities, relationships, [], _prov(), version="2.3.4", generated_by_method="database_data.erd@test")
        self.assertEqual(record["generated_by_method"], "database_data.erd@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_constraints_free_text_is_accepted_unparsed(self):
        record = _build(constraints=["orders.customer_id references a customer that must exist"])
        self.assertEqual(record["constraints"], ["orders.customer_id references a customer that must exist"])

    # --- migration_ref ---
    def test_migration_ref_none_is_legal_and_omitted_from_the_record(self):
        record = _valid_record()
        self.assertNotIn("migration_ref", record)

    def test_migration_ref_with_ecmig_prefix_is_accepted(self):
        record = _build(migration_ref="ECMIG-2026-09-05-001")
        self.assertEqual(record["migration_ref"], "ECMIG-2026-09-05-001")

    def test_migration_ref_with_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_MIGRATION_REF"):
            _build(migration_ref="ERD-2026-09-05-001")

    def test_migration_ref_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_MIGRATION_REF"):
            _build(migration_ref="")

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_erd_prefix(self):
        record = _valid_record()
        record["id"] = "RTORPO-1"
        with self.assertRaisesRegex(Exception, "ERD-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_migration_ref_without_the_ecmig_prefix(self):
        record = _valid_record()
        record["migration_ref"] = "ERD-999"
        with self.assertRaisesRegex(Exception, "ECMIG-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema migration_ref prefix")

    def test_schema_layer_rejects_an_illegal_cardinality_value(self):
        record = _valid_record()
        record["relationships"][0]["cardinality"] = "one_to_many"
        with self.assertRaisesRegex(Exception, "one_to_many"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema cardinality enum")

    def test_schema_layer_rejects_an_empty_foreign_key_attributes_list(self):
        record = _valid_record()
        record["relationships"][0]["foreign_key_attributes"] = []
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema foreign_key_attributes minItems")

    def test_schema_layer_rejects_extra_key_on_an_attribute(self):
        record = _valid_record()
        record["entities"][0]["attributes"][0]["nullable"] = True
        with self.assertRaisesRegex(Exception, "nullable"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema attribute additionalProperties")

    def test_schema_layer_rejects_extra_key_on_an_entity(self):
        record = _valid_record()
        record["entities"][0]["description"] = "x"
        with self.assertRaisesRegex(Exception, "description"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema entity additionalProperties")

    def test_schema_layer_rejects_extra_key_on_a_relationship(self):
        record = _valid_record()
        record["relationships"][0]["note"] = "x"
        with self.assertRaisesRegex(Exception, "note"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema relationship additionalProperties")

    def test_schema_layer_rejects_zero_entities(self):
        record = _valid_record()
        record["entities"] = []
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema minItems on entities")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        """Regression for a critic-caught Minor: deleting the whole top-level `required` list survived every
        prior test because none of them deleted a required key outright (only mutated its value)."""
        record = _valid_record()
        del record["constraints"]
        with self.assertRaisesRegex(Exception, "constraints"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_accepts_empty_relationships_and_constraints(self):
        record = _build(entities=[_entity("settings", [_attr("key", pk=True)])], relationships=[], constraints=[])
        self.contracts.validate(RECORD_SCHEMA, record, "schema empty relationships/constraints")

    # --- scalar fields ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ERD_EMPTY_RECORD_FIELD"):
            _build(record_id="")

    def test_whitespace_only_system_or_database_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ERD_EMPTY_RECORD_FIELD"):
            _build(system="   ")

    # --- entities ---
    def test_zero_entities_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_ENTITIES"):
            _build(entities=[], relationships=[])

    def test_duplicate_entity_names_is_refused(self):
        entities = [_entity("orders", [_attr("order_id", pk=True)]), _entity("orders", [_attr("id", pk=True)])]
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_ENTITIES"):
            _build(entities=entities, relationships=[])

    def test_entity_name_case_sensitivity_orders_and_Orders_are_distinct(self):
        """Compilation decision: case-sensitive exact match, not case-folded."""
        entities = [_entity("orders", [_attr("id", pk=True)]), _entity("Orders", [_attr("id", pk=True)])]
        record = _build(entities=entities, relationships=[])
        self.assertEqual({e["name"] for e in record["entities"]}, {"orders", "Orders"})

    def test_entity_with_zero_attributes_is_refused(self):
        entities = [_entity("orders", [])]
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_ENTITIES"):
            _build(entities=entities, relationships=[])

    def test_entity_with_extra_key_is_refused_at_construction(self):
        """Regression for a critic-caught Minor: weakening _entity_shape_is_valid's exact-key-set check to a
        subset check survived the whole suite -- no test tampered an ENTITY's own key set at the builder or
        gate layer (only the schema layer and the attribute layer had coverage)."""
        entities = [dict(_entity("orders", [_attr("order_id", pk=True)]), owner="finance-team")]
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_ENTITIES"):
            _build(entities=entities, relationships=[])

    def test_duplicate_attribute_names_within_an_entity_is_refused(self):
        entities = [_entity("orders", [_attr("id", pk=True), _attr("id")])]
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_ENTITIES"):
            _build(entities=entities, relationships=[])

    def test_same_attribute_name_across_different_entities_is_accepted(self):
        """Attribute-name uniqueness is per-entity, not record-wide -- 'id' on two different entities is
        normal ERD practice."""
        entities = [_entity("orders", [_attr("id", pk=True)]), _entity("customers", [_attr("id", pk=True)])]
        record = _build(entities=entities, relationships=[])
        self.assertEqual(len(record["entities"]), 2)

    def test_entity_with_no_primary_key_attribute_is_refused(self):
        """The core 'keys' invariant: at least one is_primary_key:true attribute per entity."""
        entities = [_entity("orders", [_attr("order_id"), _attr("total_cents", "bigint")])]
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_ENTITIES"):
            _build(entities=entities, relationships=[])

    def test_attribute_with_extra_key_is_refused_at_construction(self):
        entities = [_entity("orders", [dict(_attr("order_id", pk=True), nullable=False)])]
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_ENTITIES"):
            _build(entities=entities, relationships=[])

    def test_attribute_missing_a_required_field_is_refused(self):
        entities = [_entity("orders", [{"name": "order_id", "is_primary_key": True}])]
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_ENTITIES"):
            _build(entities=entities, relationships=[])

    def test_non_bool_is_primary_key_is_refused_not_coerced(self):
        entities = [_entity("orders", [{"name": "order_id", "data_type": "uuid", "is_primary_key": 1}])]
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_ENTITIES"):
            _build(entities=entities, relationships=[])

    def test_non_dict_entity_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_ENTITIES"):
            _build(entities=["orders"], relationships=[])

    # --- relationships: shape ---
    def test_relationship_with_extra_key_is_refused_at_construction(self):
        entities, relationships = _two_entity_model()
        relationships[0] = dict(relationships[0], note="x")
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_RELATIONSHIPS"):
            _build(entities=entities, relationships=relationships)

    def test_one_to_many_cardinality_is_refused(self):
        """The core cardinality-taxonomy invariant: only one_to_one/many_to_one, since foreign_key_attributes
        always lives on from_entity (see method contract compilation_decisions)."""
        entities, relationships = _two_entity_model()
        relationships[0]["cardinality"] = "one_to_many"
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_RELATIONSHIPS"):
            _build(entities=entities, relationships=relationships)

    def test_many_to_many_cardinality_is_refused(self):
        entities, relationships = _two_entity_model()
        relationships[0]["cardinality"] = "many_to_many"
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_RELATIONSHIPS"):
            _build(entities=entities, relationships=relationships)

    def test_relationship_missing_a_required_field_is_refused(self):
        entities, _ = _two_entity_model()
        bad = {"from_entity": "orders", "to_entity": "customers", "cardinality": "many_to_one"}
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_RELATIONSHIPS"):
            _build(entities=entities, relationships=[bad])

    def test_empty_foreign_key_attributes_list_is_refused_at_construction(self):
        entities, _ = _two_entity_model()
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_RELATIONSHIPS"):
            _build(entities=entities, relationships=[_rel("orders", "customers", [])])

    def test_non_dict_relationship_is_refused_not_crashed(self):
        entities, _ = _two_entity_model()
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_RELATIONSHIPS"):
            _build(entities=entities, relationships=["orders->customers"])

    # --- relationships: referential integrity ---
    def test_relationship_with_dangling_from_entity_is_refused(self):
        entities, _ = _two_entity_model()
        with self.assertRaisesRegex(InvariantViolation, "ERD_DANGLING_RELATIONSHIP_REF"):
            _build(entities=entities, relationships=[_rel("shipments", "customers", "customer_id")])

    def test_relationship_with_dangling_to_entity_is_refused(self):
        entities, _ = _two_entity_model()
        with self.assertRaisesRegex(InvariantViolation, "ERD_DANGLING_RELATIONSHIP_REF"):
            _build(entities=entities, relationships=[_rel("orders", "warehouses", "customer_id")])

    def test_relationship_with_foreign_key_attribute_not_on_from_entity_is_refused(self):
        """The core FK-direction invariant: every foreign_key_attributes entry must exist on from_entity, NOT
        to_entity -- a critic-class regression, since 'customer_id' really does exist as an attribute, just
        on the wrong side (a plausible authoring mistake this check must still catch)."""
        entities = [
            _entity("customers", [_attr("customer_id", pk=True), _attr("email")]),
            _entity("orders", [_attr("order_id", pk=True)]),  # orders has NO customer_id attribute
        ]
        with self.assertRaisesRegex(InvariantViolation, "ERD_DANGLING_RELATIONSHIP_REF"):
            _build(entities=entities, relationships=[_rel("orders", "customers", "customer_id")])

    def test_composite_foreign_key_with_one_missing_column_is_refused(self):
        """A composite FK is only referentially valid if EVERY listed column exists on from_entity -- one
        real column plus one dangling column must still be refused, not silently accepted because SOME
        column matched."""
        entities, relationships = _composite_fk_model()
        relationships[-1]["foreign_key_attributes"] = ["order_id", "nonexistent_column"]
        with self.assertRaisesRegex(InvariantViolation, "ERD_DANGLING_RELATIONSHIP_REF"):
            _build(entities=entities, relationships=relationships)

    def test_two_dangling_relationships_are_both_named_and_sorted(self):
        """Regression class from three prior slices' own critic rounds: a sort with only one real element
        proves nothing -- this fixture has two distinct dangling relationships whose alphabetical order
        differs from insertion order, so only a real sort produces the expected evidence order."""
        entities, _ = _two_entity_model()
        bad = [_rel("zzz_ghost", "customers", "customer_id"), _rel("aaa_ghost", "customers", "customer_id")]
        with self.assertRaisesRegex(InvariantViolation, r"'from_entity': 'aaa_ghost'.*'from_entity': 'zzz_ghost'"):
            _build(entities=entities, relationships=bad)

    def test_valid_and_dangling_relationships_together_is_refused_naming_only_the_bad_one(self):
        entities, relationships = _two_entity_model()
        relationships.append(_rel("orders", "nonexistent", "customer_id"))
        with self.assertRaisesRegex(InvariantViolation, "nonexistent"):
            _build(entities=entities, relationships=relationships)

    # --- disclosed limit: relationships are not deduplicated (compilation_decisions) ---
    def test_contradictory_cardinality_on_the_same_relationship_triple_is_deliberately_accepted(self):
        """Compilation decision: relationships[] is not deduplicated and cardinality is an unverified caller
        assertion -- two entries with the identical (from, to, fk) triple but contradictory cardinality both
        pass, disclosed as OQ-ERD-5, not a silent gap this test pretends doesn't exist."""
        entities, _ = _two_entity_model()
        relationships = [_rel("orders", "customers", "customer_id", "many_to_one"), _rel("orders", "customers", "customer_id", "one_to_one")]
        record = _build(entities=entities, relationships=relationships)
        self.assertEqual(len(record["relationships"]), 2)

    # --- constraints ---
    def test_empty_string_constraint_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_CONSTRAINTS"):
            _build(constraints=[""])

    def test_non_list_constraints_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_CONSTRAINTS"):
            _build(constraints="not a list")

    def test_non_string_constraint_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ERD_INVALID_CONSTRAINTS"):
            _build(constraints=[123])

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        entities, relationships = _two_entity_model()
        constraints = ["c1"]
        record = generate_erd_record("ERD-T-010", "s", entities, relationships, constraints, _prov())
        entities[0]["attributes"][0]["is_primary_key"] = False
        entities[0]["name"] = "renamed"
        relationships[0]["cardinality"] = "one_to_one"
        relationships[0]["foreign_key_attributes"].append("extra_column")
        constraints.append("c2")
        self.assertTrue(record["entities"][0]["attributes"][0]["is_primary_key"])
        self.assertEqual(record["entities"][0]["name"], "customers")
        self.assertEqual(record["relationships"][0]["cardinality"], "many_to_one")
        self.assertEqual(record["relationships"][0]["foreign_key_attributes"], ["customer_id"])
        self.assertEqual(record["constraints"], ["c1"])

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_erd_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_erd_integrity_gate(record, "test", TS)

    def test_valid_two_entity_record_passes_both_gates(self):
        results = evaluate_erd_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "erd_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_junction_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_erd_gates(_valid_junction_record(), "test", TS)))

    def test_valid_composite_fk_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_erd_gates(_valid_composite_fk_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        """Regression for the critic-caught class in devops_sre.rto_rpo: all_gates_pass's own FAIL direction
        must be pinned, not just its PASS direction."""
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_erd_gates(record, "test", TS)))

    def test_hand_tampered_missing_primary_key_fails_the_gate(self):
        record = _valid_record()
        for attribute in record["entities"][0]["attributes"]:
            attribute["is_primary_key"] = False
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "entities invalid (empty, malformed, duplicate entity/attribute names, or missing a primary key on some entity)")

    def test_hand_tampered_extra_key_on_an_entity_fails_the_gate(self):
        """Gate-layer companion to the builder's own regression: the exact-key-set check on an entity must be
        re-derived by the gate, not just the schema."""
        record = _valid_record()
        record["entities"][0]["owner"] = "finance-team"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "entities invalid (empty, malformed, duplicate entity/attribute names, or missing a primary key on some entity)")

    def test_hand_tampered_duplicate_entity_name_fails_the_gate(self):
        record = _valid_record()
        record["entities"][1]["name"] = record["entities"][0]["name"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "entities invalid (empty, malformed, duplicate entity/attribute names, or missing a primary key on some entity)")

    def test_hand_tampered_duplicate_attribute_name_fails_the_gate(self):
        record = _valid_record()
        record["entities"][0]["attributes"].append(dict(record["entities"][0]["attributes"][0]))
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "entities invalid (empty, malformed, duplicate entity/attribute names, or missing a primary key on some entity)")

    def test_hand_tampered_illegal_cardinality_fails_the_gate(self):
        record = _valid_record()
        record["relationships"][0]["cardinality"] = "one_to_many"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "relationships invalid (malformed entry, unknown keys, or an illegal cardinality value)")

    def test_hand_tampered_empty_foreign_key_attributes_fails_the_gate(self):
        record = _valid_record()
        record["relationships"][0]["foreign_key_attributes"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "relationships invalid (malformed entry, unknown keys, or an illegal cardinality value)")

    def test_hand_tampered_dangling_from_entity_fails_the_gate(self):
        record = _valid_record()
        record["relationships"][0]["from_entity"] = "ghost"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more relationships reference an entity that does not exist, or a foreign_key_attributes entry not present on their own from_entity")
        self.assertEqual(len(gate["evidence"][0]["invalid_relationships"]), 1)

    def test_hand_tampered_two_dangling_relationships_fail_the_gate_sorted(self):
        record = _valid_record()
        record["relationships"] = [_rel("zzz_ghost", "customers", "customer_id"), _rel("aaa_ghost", "customers", "customer_id")]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        invalid = gate["evidence"][0]["invalid_relationships"]
        self.assertEqual([r["from_entity"] for r in invalid], ["aaa_ghost", "zzz_ghost"])

    def test_hand_tampered_foreign_key_attribute_moved_to_wrong_side_fails_the_gate(self):
        record = _valid_record()
        record["relationships"][0]["foreign_key_attributes"] = ["email"]  # exists on customers, not orders
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more relationships reference an entity that does not exist, or a foreign_key_attributes entry not present on their own from_entity")

    def test_hand_tampered_composite_fk_with_one_bad_column_fails_the_gate(self):
        record = _valid_composite_fk_record()
        composite_rel = next(r for r in record["relationships"] if r["from_entity"] == "shipments")
        composite_rel["foreign_key_attributes"] = ["order_id", "nonexistent_column"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more relationships reference an entity that does not exist, or a foreign_key_attributes entry not present on their own from_entity")

    def test_hand_tampered_extra_key_on_relationship_fails_the_gate(self):
        record = _valid_record()
        record["relationships"][0]["note"] = "x"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "relationships invalid (malformed entry, unknown keys, or an illegal cardinality value)")

    def test_hand_tampered_empty_constraint_string_fails_the_gate(self):
        record = _valid_record()
        record["constraints"] = [""]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "constraints invalid (not a list, or contains a non-string/empty entry)")

    def test_hand_tampered_constraints_replaced_by_string_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["constraints"] = "none"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "constraints invalid (not a list, or contains a non-string/empty entry)")

    def test_hand_tampered_migration_ref_prefix_broken_fails_the_gate(self):
        record = _build(migration_ref="ECMIG-2026-09-05-001")
        record["migration_ref"] = "ERD-not-a-migration"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "migration_ref present but malformed (missing ECMIG- prefix or empty)")

    def test_hand_tampered_missing_migration_ref_key_still_passes(self):
        """Absence (no key at all) remains legal -- only a present-but-malformed value fails."""
        record = _valid_record()
        self.assertNotIn("migration_ref", record)
        self.assertTrue(all_gates_pass(evaluate_erd_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing or empty")

    def test_hand_tampered_empty_system_or_database_fails_the_gate(self):
        record = _valid_record()
        record["system_or_database"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "system_or_database missing or empty")

    def test_hand_tampered_empty_entities_fails_the_gate(self):
        record = _valid_record()
        record["entities"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "entities invalid (empty, malformed, duplicate entity/attribute names, or missing a primary key on some entity)")

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_valid_junction_record())
        self.assertEqual(gate["evidence"][0], {"entity_count": 3, "relationship_count": 2, "constraint_count": 0})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_junction_record()
        before = copy.deepcopy(record)
        self._gate(record)
        self.assertEqual(record, before)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
