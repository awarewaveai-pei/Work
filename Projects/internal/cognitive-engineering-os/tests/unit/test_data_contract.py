"""Mutation-style tests for ``database_data.data_contract`` (fortieth Method Atlas slice, sixth member of
the `database_data` family). Atlas's own §11.49 formula (Schema->Semantics->Owner->Freshness->Quality->
Compatibility->Deprecation) is proven at BOTH independent layers -- construction-time and gate re-derivation,
the gate RE-DERIVING every structural check fresh from the record's own raw fields rather than trusting
stored values. Every soft-link field (schema_ref/freshness_ref/compatibility_ref/deprecation_ref) is tested
present-valid, present-malformed, and absent, at both layers -- the same discipline database_data.erd's own
migration_ref tests already established."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.data_contract import (
    METHOD_ID,
    all_gates_pass,
    evaluate_data_contract_gates,
    evaluate_data_contract_integrity_gate,
    evaluate_provenance_required_gate,
    generate_data_contract_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/data-contract-record.schema.yaml"
TS = "2026-09-05T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _field(name, data_type="uuid", nullable=False):
    return {"name": name, "data_type": data_type, "nullable": nullable}


def _default_fields():
    return [_field("order_id"), _field("customer_id"), _field("total_cents", "bigint")]


def _default_consumers():
    return ["analytics-team", "fraud-detection-team"]


def _build(
    record_id="DC-T-001",
    dataset="checkout-api.order-events",
    producer="checkout-platform-team",
    consumers=None,
    fields=None,
    semantics="Emitted once per finalized checkout order.",
    quality_notes=None,
    compatibility_policy="Backward-compatible only.",
    schema_ref=None,
    freshness_ref=None,
    compatibility_ref=None,
    deprecation_ref=None,
):
    return generate_data_contract_record(
        record_id,
        dataset,
        producer,
        _default_consumers() if consumers is None else consumers,
        _default_fields() if fields is None else fields,
        semantics,
        [] if quality_notes is None else quality_notes,
        compatibility_policy,
        _prov(),
        schema_ref=schema_ref,
        freshness_ref=freshness_ref,
        compatibility_ref=compatibility_ref,
        deprecation_ref=deprecation_ref,
    )


def _valid_record():
    return _build()


def _fully_linked_record():
    return _build(
        record_id="DC-T-002",
        schema_ref="ERD-2026-09-05-001",
        freshness_ref="SLO-2026-09-05-001",
        compatibility_ref="ECMIG-2026-09-05-001",
        deprecation_ref="DEP-2026-08-01-003",
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_minimal_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal data contract record")

    def test_fully_linked_record_validates(self):
        self.contracts.validate(RECORD_SCHEMA, _fully_linked_record(), "fully-linked data contract record")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_data_contract_record(
            "DC-T-003", "d", "p", ["c"], [_field("x")], "s", [], "cp", _prov(), version="2.3.4", generated_by_method="database_data.data_contract@test"
        )
        self.assertEqual(record["generated_by_method"], "database_data.data_contract@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_quality_notes_free_text_is_accepted_unparsed(self):
        record = _build(quality_notes=["promo_code is unvalidated at emit time"])
        self.assertEqual(record["quality_notes"], ["promo_code is unvalidated at emit time"])

    def test_empty_quality_notes_is_legal(self):
        record = _valid_record()
        self.assertEqual(record["quality_notes"], [])

    # --- schema_ref ---
    def test_schema_ref_none_is_legal_and_omitted_from_the_record(self):
        self.assertNotIn("schema_ref", _valid_record())

    def test_schema_ref_with_erd_prefix_is_accepted(self):
        record = _build(schema_ref="ERD-2026-09-05-001")
        self.assertEqual(record["schema_ref"], "ERD-2026-09-05-001")

    def test_schema_ref_with_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_SOFT_REF"):
            _build(schema_ref="DC-2026-09-05-001")

    def test_schema_ref_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_SOFT_REF"):
            _build(schema_ref="")

    # --- freshness_ref ---
    def test_freshness_ref_with_slo_prefix_is_accepted(self):
        record = _build(freshness_ref="SLO-2026-09-05-001")
        self.assertEqual(record["freshness_ref"], "SLO-2026-09-05-001")

    def test_freshness_ref_with_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_SOFT_REF"):
            _build(freshness_ref="ERD-2026-09-05-001")

    # --- compatibility_ref ---
    def test_compatibility_ref_with_ecmig_prefix_is_accepted(self):
        record = _build(compatibility_ref="ECMIG-2026-09-05-001")
        self.assertEqual(record["compatibility_ref"], "ECMIG-2026-09-05-001")

    def test_compatibility_ref_with_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_SOFT_REF"):
            _build(compatibility_ref="SLO-2026-09-05-001")

    # --- deprecation_ref ---
    def test_deprecation_ref_with_dep_prefix_is_accepted(self):
        record = _build(deprecation_ref="DEP-2026-08-01-003")
        self.assertEqual(record["deprecation_ref"], "DEP-2026-08-01-003")

    def test_deprecation_ref_with_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_SOFT_REF"):
            _build(deprecation_ref="ECMIG-2026-08-01-003")

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_dc_prefix(self):
        record = _valid_record()
        record["id"] = "ERD-1"
        with self.assertRaisesRegex(Exception, "DC-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_schema_ref_without_the_erd_prefix(self):
        record = _valid_record()
        record["schema_ref"] = "DC-999"
        with self.assertRaisesRegex(Exception, "ERD-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema schema_ref prefix")

    def test_schema_layer_rejects_a_freshness_ref_without_the_slo_prefix(self):
        record = _valid_record()
        record["freshness_ref"] = "ERD-999"
        with self.assertRaisesRegex(Exception, "SLO-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema freshness_ref prefix")

    def test_schema_layer_rejects_a_compatibility_ref_without_the_ecmig_prefix(self):
        record = _valid_record()
        record["compatibility_ref"] = "SLO-999"
        with self.assertRaisesRegex(Exception, "ECMIG-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema compatibility_ref prefix")

    def test_schema_layer_rejects_a_deprecation_ref_without_the_dep_prefix(self):
        record = _valid_record()
        record["deprecation_ref"] = "ECMIG-999"
        with self.assertRaisesRegex(Exception, "DEP-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema deprecation_ref prefix")

    def test_schema_layer_rejects_extra_key_on_a_field(self):
        record = _valid_record()
        record["fields"][0]["is_primary_key"] = True
        with self.assertRaisesRegex(Exception, "is_primary_key"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema field additionalProperties")

    def test_schema_layer_rejects_zero_fields(self):
        record = _valid_record()
        record["fields"] = []
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema minItems on fields")

    def test_schema_layer_rejects_zero_consumers(self):
        record = _valid_record()
        record["consumers"] = []
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema minItems on consumers")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        """Regression class database_data.erd's own critic round caught: deleting a whole top-level required
        key, not just mutating its value."""
        record = _valid_record()
        del record["quality_notes"]
        with self.assertRaisesRegex(Exception, "quality_notes"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    # --- scalar fields ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_dc_prefix_is_refused_at_construction(self):
        """Regression for a critic-caught Major: a first-draft asymmetry checked the four OUTBOUND soft-link
        ref prefixes at both layers but left the record's OWN inbound DC- prefix schema-layer-only -- a
        record minted with id='ERD-1' passed both runtime gates."""
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_RECORD_ID"):
            _build(record_id="ERD-1")

    def test_non_string_version_is_refused_at_construction(self):
        """Regression for the same critic-caught Major: version had zero runtime enforcement at either
        layer, only a schema-layer type check."""
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_VERSION"):
            generate_data_contract_record("DC-T-VERSION", "d", "p", ["c"], [_field("x")], "s", [], "cp", _prov(), version=123)

    def test_whitespace_only_dataset_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_EMPTY_RECORD_FIELD"):
            _build(dataset="   ")

    def test_empty_producer_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_EMPTY_RECORD_FIELD"):
            _build(producer="")

    def test_empty_semantics_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_EMPTY_RECORD_FIELD"):
            _build(semantics="")

    def test_empty_compatibility_policy_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_EMPTY_RECORD_FIELD"):
            _build(compatibility_policy="")

    # --- consumers ---
    def test_zero_consumers_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_CONSUMERS"):
            _build(consumers=[])

    def test_duplicate_consumer_names_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_CONSUMERS"):
            _build(consumers=["team-a", "team-a"])

    def test_non_string_consumer_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_CONSUMERS"):
            _build(consumers=["team-a", 123])

    def test_non_list_consumers_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_CONSUMERS"):
            _build(consumers="team-a")

    # --- fields ---
    def test_zero_fields_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_FIELDS"):
            _build(fields=[])

    def test_duplicate_field_names_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_FIELDS"):
            _build(fields=[_field("order_id"), _field("order_id")])

    def test_field_name_case_sensitivity_orderid_and_OrderId_are_distinct(self):
        """Compilation decision: case-sensitive exact match, not case-folded."""
        record = _build(fields=[_field("orderid"), _field("OrderId")])
        self.assertEqual({f["name"] for f in record["fields"]}, {"orderid", "OrderId"})

    def test_field_with_extra_key_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_FIELDS"):
            _build(fields=[dict(_field("order_id"), description="the order id")])

    def test_field_missing_a_required_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_FIELDS"):
            _build(fields=[{"name": "order_id", "data_type": "uuid"}])

    def test_non_bool_nullable_is_refused_not_coerced(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_FIELDS"):
            _build(fields=[{"name": "order_id", "data_type": "uuid", "nullable": 1}])

    def test_non_dict_field_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_FIELDS"):
            _build(fields=["order_id"])

    def test_nullable_true_is_accepted(self):
        record = _build(fields=[_field("promo_code", "varchar(64)", nullable=True)])
        self.assertTrue(record["fields"][0]["nullable"])

    # --- quality_notes ---
    def test_non_list_quality_notes_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_QUALITY_NOTES"):
            _build(quality_notes="not a list")

    def test_non_string_quality_note_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_QUALITY_NOTES"):
            _build(quality_notes=[123])

    def test_empty_string_quality_note_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATACONTRACT_INVALID_QUALITY_NOTES"):
            _build(quality_notes=[""])

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        consumers = ["team-a"]
        fields = [_field("x")]
        quality_notes = ["note-1"]
        record = generate_data_contract_record("DC-T-010", "d", "p", consumers, fields, "s", quality_notes, "cp", _prov())
        consumers.append("team-b")
        fields[0]["nullable"] = True
        fields[0]["name"] = "renamed"
        quality_notes.append("note-2")
        self.assertEqual(record["consumers"], ["team-a"])
        self.assertFalse(record["fields"][0]["nullable"])
        self.assertEqual(record["fields"][0]["name"], "x")
        self.assertEqual(record["quality_notes"], ["note-1"])

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        """Pins the family-wide convention (documented in this module's own docstring): provenance is stored
        BY REFERENCE. Mutating the caller's own provenance dict after construction DOES affect the stored
        record -- unlike consumers/fields/quality_notes above, which are rebuilt."""
        provenance = _prov()
        record = generate_data_contract_record("DC-T-011", "d", "p", ["c"], [_field("x")], "s", [], "cp", provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_data_contract_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_data_contract_integrity_gate(record, "test", TS)

    def test_valid_minimal_record_passes_both_gates(self):
        results = evaluate_data_contract_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "data_contract_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_fully_linked_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_data_contract_gates(_fully_linked_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        """Regression for the critic-caught class in devops_sre.rto_rpo / database_data.erd: all_gates_pass's
        own FAIL direction must be pinned, not just its PASS direction."""
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_data_contract_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'DC-'")

    def test_hand_tampered_id_without_dc_prefix_fails_the_gate(self):
        """Gate-layer companion to the builder's own regression: id's own DC- prefix must be re-derived by
        the gate, not just the schema."""
        record = _valid_record()
        record["id"] = "ERD-1"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'DC-'")

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_missing_version_key_fails_the_gate(self):
        record = _valid_record()
        del record["version"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_whitespace_distinct_consumer_is_deliberately_accepted(self):
        """Compilation decision (extended post-critic-review): exact string match on case AND whitespace --
        'team-a' and 'team-a ' are treated as distinct names, disclosed, not a silent gap."""
        record = _valid_record()
        record["consumers"] = record["consumers"] + [record["consumers"][0] + " "]
        self.assertTrue(all_gates_pass(evaluate_data_contract_gates(record, "test", TS)))

    def test_gate_deletion_of_every_required_top_level_key_fails_the_gate(self):
        """Regression for a critic-caught coverage gap (family-wide, not a regression here specifically):
        every required top-level key's absence must fail the gate when tested independently, not just via
        value-mutation."""
        for key in ("id", "version", "dataset_or_topic", "producer", "consumers", "fields", "semantics", "quality_notes", "compatibility_policy"):
            with self.subTest(key=key):
                record = _valid_record()
                del record[key]
                self.assertFalse(all_gates_pass(evaluate_data_contract_gates(record, "test", TS)))

    def test_hand_tampered_empty_dataset_fails_the_gate(self):
        record = _valid_record()
        record["dataset_or_topic"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "dataset_or_topic missing or empty")

    def test_hand_tampered_empty_producer_fails_the_gate(self):
        record = _valid_record()
        record["producer"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "producer missing or empty")

    def test_hand_tampered_empty_semantics_fails_the_gate(self):
        record = _valid_record()
        record["semantics"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "semantics missing or empty")

    def test_hand_tampered_empty_compatibility_policy_fails_the_gate(self):
        record = _valid_record()
        record["compatibility_policy"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "compatibility_policy missing or empty")

    def test_hand_tampered_empty_consumers_fails_the_gate(self):
        record = _valid_record()
        record["consumers"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "consumers invalid (empty, malformed, non-string entry, or duplicate name)")

    def test_hand_tampered_duplicate_consumer_fails_the_gate(self):
        record = _valid_record()
        record["consumers"] = [record["consumers"][0], record["consumers"][0]]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "consumers invalid (empty, malformed, non-string entry, or duplicate name)")

    def test_hand_tampered_empty_fields_fails_the_gate(self):
        record = _valid_record()
        record["fields"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "fields invalid (empty, malformed entry, unknown keys, or duplicate field name)")

    def test_hand_tampered_duplicate_field_name_fails_the_gate(self):
        record = _valid_record()
        record["fields"][1]["name"] = record["fields"][0]["name"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "fields invalid (empty, malformed entry, unknown keys, or duplicate field name)")

    def test_hand_tampered_extra_key_on_a_field_fails_the_gate(self):
        record = _valid_record()
        record["fields"][0]["owner"] = "finance-team"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "fields invalid (empty, malformed entry, unknown keys, or duplicate field name)")

    def test_hand_tampered_non_bool_nullable_fails_the_gate(self):
        record = _valid_record()
        record["fields"][0]["nullable"] = "yes"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "fields invalid (empty, malformed entry, unknown keys, or duplicate field name)")

    def test_hand_tampered_non_string_quality_note_fails_the_gate(self):
        record = _valid_record()
        record["quality_notes"] = [123]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "quality_notes invalid (not a list, or contains a non-string/empty entry)")

    def test_hand_tampered_quality_notes_replaced_by_string_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["quality_notes"] = "none"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "quality_notes invalid (not a list, or contains a non-string/empty entry)")

    def test_hand_tampered_schema_ref_prefix_broken_fails_the_gate(self):
        record = _build(schema_ref="ERD-2026-09-05-001")
        record["schema_ref"] = "DC-not-an-erd"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "schema_ref present but malformed (missing 'ERD-' prefix or empty)")

    def test_hand_tampered_freshness_ref_prefix_broken_fails_the_gate(self):
        record = _build(freshness_ref="SLO-2026-09-05-001")
        record["freshness_ref"] = "ERD-not-an-slo"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "freshness_ref present but malformed (missing 'SLO-' prefix or empty)")

    def test_hand_tampered_compatibility_ref_prefix_broken_fails_the_gate(self):
        record = _build(compatibility_ref="ECMIG-2026-09-05-001")
        record["compatibility_ref"] = "SLO-not-a-migration"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "compatibility_ref present but malformed (missing 'ECMIG-' prefix or empty)")

    def test_hand_tampered_deprecation_ref_prefix_broken_fails_the_gate(self):
        record = _build(deprecation_ref="DEP-2026-08-01-003")
        record["deprecation_ref"] = "ECMIG-not-a-deprecation"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "deprecation_ref present but malformed (missing 'DEP-' prefix or empty)")

    def test_hand_tampered_missing_soft_ref_keys_still_pass(self):
        """Absence (no key at all) remains legal for all four soft-link fields -- only a present-but-malformed
        value fails."""
        record = _valid_record()
        for ref_name in ("schema_ref", "freshness_ref", "compatibility_ref", "deprecation_ref"):
            self.assertNotIn(ref_name, record)
        self.assertTrue(all_gates_pass(evaluate_data_contract_gates(record, "test", TS)))

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_valid_record())
        self.assertEqual(gate["evidence"][0], {"consumer_count": 2, "field_count": 3, "quality_note_count": 0})

    def test_gate_evidence_reports_a_nonzero_quality_note_count(self):
        """Regression for a critic-caught coverage gap: the one count that can legitimately vary was never
        pinned non-zero."""
        record = _build(quality_notes=["note-1", "note-2"])
        gate = self._gate(record)
        self.assertEqual(gate["evidence"][0]["quality_note_count"], 2)

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _fully_linked_record()
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
