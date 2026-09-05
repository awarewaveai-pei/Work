"""Mutation-style tests for ``database_data.retention_deletion_model`` (forty-third Method Atlas slice,
ninth and FINAL member of the `database_data` family). This is a STRUCTURAL POLICY record (provenance_required
+ one integrity gate), not genuine compute -- proven at BOTH independent layers: the conflict-resolution
invariant (required iff more than one hold is active, absent otherwise) is checked at construction, and the
gate independently RE-DERIVES it fresh from the record's own raw holds rather than trusting a stored value."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.retention_deletion_model import (
    METHOD_ID,
    VALID_HOLD_TYPES,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_retention_deletion_gates,
    evaluate_retention_deletion_integrity_gate,
    generate_retention_deletion_model_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/retention-deletion-model-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _hold(hold_type="legal_hold", reason="a reason", active=True):
    return {"hold_type": hold_type, "reason": reason, "active": active}


def _build(
    record_id="RDM-T-001",
    data_class="customer PII",
    purpose="fraud investigation",
    retention_rule="7 years",
    deletion_trigger="automated purge",
    holds=None,
    compliance_evidence="legal review approved",
    conflict_resolution=None,
    schema_ref=None,
    deletion_evidence_ref=None,
):
    return generate_retention_deletion_model_record(
        record_id,
        data_class,
        purpose,
        retention_rule,
        deletion_trigger,
        [_hold()] if holds is None else holds,
        compliance_evidence,
        _prov(),
        conflict_resolution=conflict_resolution,
        schema_ref=schema_ref,
        deletion_evidence_ref=deletion_evidence_ref,
    )


def _valid_record():
    return _build()


def _two_active_holds_record():
    return _build(
        record_id="RDM-T-002",
        holds=[_hold("legal_hold", "hold A", True), _hold("regulatory_hold", "hold B", True), _hold("user_deletion_request", "hold C", False)],
        conflict_resolution="Legal and regulatory both take precedence.",
    )


def _fully_linked_record():
    return _build(record_id="RDM-T-003", schema_ref="ERD-2026-09-05-001", deletion_evidence_ref="DEL-2026-01-001")


def _no_holds_record():
    return _build(record_id="RDM-T-004", holds=[])


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_single_active_hold_record_validates_against_the_real_schema(self):
        record = _valid_record()
        self.contracts.validate(RECORD_SCHEMA, record, "single-hold retention/deletion record")
        self.assertNotIn("conflict_resolution", record)

    def test_two_active_holds_record_validates_with_conflict_resolution(self):
        record = _two_active_holds_record()
        self.contracts.validate(RECORD_SCHEMA, record, "two-active-holds retention/deletion record")
        self.assertIn("conflict_resolution", record)

    def test_fully_linked_record_validates(self):
        self.contracts.validate(RECORD_SCHEMA, _fully_linked_record(), "fully-linked retention/deletion record")

    def test_no_holds_record_validates(self):
        record = _no_holds_record()
        self.contracts.validate(RECORD_SCHEMA, record, "zero-holds retention/deletion record")
        self.assertNotIn("conflict_resolution", record)

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_retention_deletion_model_record(
            "RDM-T-005", "d", "p", "r", "dt", [], "ce", _prov(), version="2.3.4", generated_by_method="database_data.retention_deletion_model@test"
        )
        self.assertEqual(record["generated_by_method"], "database_data.retention_deletion_model@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    # --- all six enum-vocabulary and citation-completeness lessons applied from the first draft ---
    def test_all_five_mp114_hold_types_round_trip_through_builder_and_gates(self):
        """Pins all five Master Plan §114 hold types individually -- a critic-caught coverage gap in the
        immediately preceding slice found two of six enum values were never exercised by any test."""
        expected = {"legal_hold", "regulatory_hold", "research_hold", "contractual_hold", "user_deletion_request"}
        self.assertEqual(VALID_HOLD_TYPES, frozenset(expected))
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "retention-deletion-model-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        schema_enum = set(schema_doc["$defs"]["hold"]["properties"]["hold_type"]["enum"])
        self.assertEqual(schema_enum, expected)
        for hold_type in expected:
            with self.subTest(hold_type=hold_type):
                record = _build(holds=[_hold(hold_type=hold_type)])
                self.contracts.validate(RECORD_SCHEMA, record, f"round-trip for hold_type={hold_type}")
                self.assertTrue(all_gates_pass(evaluate_retention_deletion_gates(record, "test", TS)))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        """Closes the same critic-identified gap the two immediately preceding slices' own test files
        already closed for their own schemas."""
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "retention-deletion-model-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "retention-deletion-model-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_retention_deletion_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version (checked at both layers from this first draft) ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_rdm_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_RECORD_ID"):
            _build(record_id="ERD-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_VERSION"):
            generate_retention_deletion_model_record("RDM-T-VERSION", "d", "p", "r", "dt", [], "ce", _prov(), version=123)

    def test_none_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_VERSION"):
            generate_retention_deletion_model_record("RDM-T-VERSION2", "d", "p", "r", "dt", [], "ce", _prov(), version=None)

    # --- scalar fields ---
    def test_whitespace_only_data_class_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_EMPTY_RECORD_FIELD"):
            _build(data_class="   ")

    def test_empty_purpose_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_EMPTY_RECORD_FIELD"):
            _build(purpose="")

    def test_empty_retention_rule_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_EMPTY_RECORD_FIELD"):
            _build(retention_rule="")

    def test_empty_deletion_trigger_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_EMPTY_RECORD_FIELD"):
            _build(deletion_trigger="")

    def test_empty_compliance_evidence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_EMPTY_RECORD_FIELD"):
            _build(compliance_evidence="")

    # --- holds: shape ---
    def test_illegal_hold_type_enum_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_HOLDS"):
            _build(holds=[_hold(hold_type="retention_policy")])

    def test_hold_with_extra_key_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_HOLDS"):
            _build(holds=[dict(_hold(), note="x")])

    def test_hold_missing_a_required_key_is_refused(self):
        entry = _hold()
        del entry["reason"]
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_HOLDS"):
            _build(holds=[entry])

    def test_empty_hold_reason_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_HOLDS"):
            _build(holds=[_hold(reason="")])

    def test_non_bool_active_is_refused_not_coerced(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_HOLDS"):
            _build(holds=[{"hold_type": "legal_hold", "reason": "x", "active": 1}])

    def test_non_dict_hold_entry_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_HOLDS"):
            _build(holds=["legal_hold"])

    def test_non_list_holds_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_HOLDS"):
            _build(holds="not a list")

    def test_repeated_hold_type_is_legal(self):
        """Disclosed legality: two independent legal holds for two different matters."""
        record = _build(holds=[_hold("legal_hold", "matter A", False), _hold("legal_hold", "matter B", False)])
        self.assertEqual(len(record["holds"]), 2)

    def test_repeated_hold_type_both_active_is_legal_and_still_requires_conflict_resolution(self):
        """Regression for a critic-caught coverage gap: the prior repeated-hold-type test used two INACTIVE
        holds, missing the more interesting case -- two ACTIVE same-type holds, which additionally trips the
        conflict_resolution requirement (the two invariants compose, they don't interact specially)."""
        record = _build(
            holds=[_hold("legal_hold", "matter A", True), _hold("legal_hold", "matter B", True)],
            conflict_resolution="Matter A takes precedence as the earlier-filed case.",
        )
        self.assertEqual(len(record["holds"]), 2)
        self.assertIn("conflict_resolution", record)

    def test_inactive_hold_is_recorded_but_not_counted_as_active(self):
        record = _build(holds=[_hold(active=False)])
        self.assertNotIn("conflict_resolution", record)
        self.assertFalse(record["holds"][0]["active"])

    # --- conflict_resolution invariant (the core real invariant) ---
    def test_two_active_holds_without_conflict_resolution_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_CONFLICT_RESOLUTION"):
            _build(holds=[_hold("legal_hold", "a", True), _hold("regulatory_hold", "b", True)])

    def test_zero_active_holds_with_a_conflict_resolution_is_refused(self):
        """The inverse direction: conflict_resolution MUST be absent when there is no conflict -- an invented
        resolution for a non-conflict is refused, not silently accepted."""
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_CONFLICT_RESOLUTION"):
            _build(holds=[_hold(active=False)], conflict_resolution="unnecessary resolution")

    def test_one_active_hold_with_a_conflict_resolution_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_CONFLICT_RESOLUTION"):
            _build(holds=[_hold(active=True)], conflict_resolution="unnecessary resolution")

    def test_three_active_holds_require_conflict_resolution(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_CONFLICT_RESOLUTION"):
            _build(holds=[_hold("legal_hold", "a", True), _hold("regulatory_hold", "b", True), _hold("research_hold", "c", True)])

    def test_empty_string_conflict_resolution_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_CONFLICT_RESOLUTION"):
            _build(holds=[_hold("legal_hold", "a", True), _hold("regulatory_hold", "b", True)], conflict_resolution="")

    # --- soft-link refs ---
    def test_schema_ref_none_is_legal_and_omitted(self):
        self.assertNotIn("schema_ref", _valid_record())

    def test_schema_ref_with_erd_prefix_is_accepted(self):
        self.assertEqual(_build(schema_ref="ERD-2026-09-05-001")["schema_ref"], "ERD-2026-09-05-001")

    def test_deletion_evidence_ref_with_del_prefix_is_accepted(self):
        self.assertEqual(_build(deletion_evidence_ref="DEL-2026-01-001")["deletion_evidence_ref"], "DEL-2026-01-001")

    def test_schema_ref_with_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_SOFT_REF"):
            _build(schema_ref="DEL-999")

    def test_deletion_evidence_ref_with_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RETENTIONDELETION_INVALID_SOFT_REF"):
            _build(deletion_evidence_ref="ERD-999")

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_rdm_prefix(self):
        record = _valid_record()
        record["id"] = "ERD-1"
        with self.assertRaisesRegex(Exception, "RDM-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_schema_ref_without_the_erd_prefix(self):
        record = _valid_record()
        record["schema_ref"] = "RDM-999"
        with self.assertRaisesRegex(Exception, "ERD-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema schema_ref prefix")

    def test_schema_layer_rejects_a_deletion_evidence_ref_without_the_del_prefix(self):
        record = _valid_record()
        record["deletion_evidence_ref"] = "ERD-999"
        with self.assertRaisesRegex(Exception, "DEL-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema deletion_evidence_ref prefix")

    def test_schema_layer_rejects_an_illegal_hold_type_value(self):
        record = _valid_record()
        record["holds"][0]["hold_type"] = "retention_policy"
        with self.assertRaisesRegex(Exception, "retention_policy"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema hold_type enum")

    def test_schema_layer_rejects_extra_key_on_a_hold_entry(self):
        record = _valid_record()
        record["holds"][0]["note"] = "x"
        with self.assertRaisesRegex(Exception, "note"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema hold additionalProperties")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["compliance_evidence"]
        with self.assertRaisesRegex(Exception, "compliance_evidence"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_accepts_empty_holds(self):
        record = _no_holds_record()
        self.contracts.validate(RECORD_SCHEMA, record, "schema empty holds")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        holds = [_hold()]
        record = generate_retention_deletion_model_record("RDM-T-010", "d", "p", "r", "dt", holds, "ce", _prov())
        holds[0]["reason"] = "mutated"
        holds.append(_hold(hold_type="regulatory_hold"))
        self.assertEqual(record["holds"][0]["reason"], "a reason")
        self.assertEqual(len(record["holds"]), 1)

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_retention_deletion_model_record("RDM-T-011", "d", "p", "r", "dt", [], "ce", provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_retention_deletion_model_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_retention_deletion_integrity_gate(record, "test", TS)

    def test_valid_single_hold_record_passes_both_gates(self):
        results = evaluate_retention_deletion_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "retention_deletion_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_two_active_holds_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_retention_deletion_gates(_two_active_holds_record(), "test", TS)))

    def test_valid_fully_linked_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_retention_deletion_gates(_fully_linked_record(), "test", TS)))

    def test_valid_no_holds_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_retention_deletion_gates(_no_holds_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_retention_deletion_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'RDM-'")

    def test_hand_tampered_id_without_rdm_prefix_fails_the_gate(self):
        record = _valid_record()
        record["id"] = "ERD-1"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'RDM-'")

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

    def test_hand_tampered_empty_data_class_fails_the_gate(self):
        record = _valid_record()
        record["data_class"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "data_class missing or empty")

    def test_hand_tampered_empty_scalar_field_fails_the_gate(self):
        """Regression for a critic-caught Major: mutation testing found the gate's own re-derivation loop
        over data_class/purpose/retention_rule/deletion_trigger/compliance_evidence was only pinned for
        data_class -- deleting any of the other four field names from that loop survived all prior tests,
        including compliance_evidence, Atlas's own terminal 'proof' formula step."""
        for field_name in ("data_class", "purpose", "retention_rule", "deletion_trigger", "compliance_evidence"):
            with self.subTest(field_name=field_name):
                record = _valid_record()
                record[field_name] = " "
                gate = self._gate(record)
                self.assertEqual(gate["status"], "FAIL")
                self.assertEqual(gate["evidence"][0]["reason"], f"{field_name} missing or empty")

    def test_hand_tampered_illegal_hold_type_fails_the_gate(self):
        record = _valid_record()
        record["holds"][0]["hold_type"] = "retention_policy"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "holds invalid (malformed entry, unknown keys, illegal hold_type value, or non-bool active)")

    def test_hand_tampered_extra_key_on_a_hold_fails_the_gate(self):
        record = _valid_record()
        record["holds"][0]["owner"] = "someone"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "holds invalid (malformed entry, unknown keys, illegal hold_type value, or non-bool active)")

    def test_hand_tampered_removed_conflict_resolution_with_two_active_holds_fails_the_gate(self):
        """The core invariant: a record genuinely requiring conflict_resolution (2 active holds) cannot be
        hand-tampered to drop it -- the gate recomputes fresh from the record's own raw holds."""
        record = _two_active_holds_record()
        self.assertIn("conflict_resolution", record)
        del record["conflict_resolution"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "conflict_resolution inconsistent with the active-hold count")
        self.assertEqual(gate["evidence"][0]["active_hold_count"], 2)

    def test_hand_tampered_added_conflict_resolution_with_zero_active_holds_fails_the_gate(self):
        """The inverse direction: adding an unneeded conflict_resolution when no conflict exists must also be
        caught, not just removing a required one."""
        record = _valid_record()
        record["holds"][0]["active"] = False
        record["conflict_resolution"] = "invented resolution"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "conflict_resolution inconsistent with the active-hold count")
        self.assertEqual(gate["evidence"][0]["active_hold_count"], 0)

    def test_hand_tampered_explicit_null_conflict_resolution_fails_the_gate_at_every_active_count(self):
        """Regression for a critic-caught Minor: record.get('conflict_resolution') alone returns None for
        BOTH 'key absent' and 'key present with an explicit null value', indistinguishable without a separate
        presence check -- a first-draft version let an explicit `conflict_resolution: null` slip past the
        gate (only the schema layer caught it) whenever 0 or 1 holds were active. Probes 0, 1, and 2 active
        holds, all with the key explicitly present and null."""
        for active_count, holds, conflict_resolution in (
            (0, [_hold(active=False)], None),
            (1, [_hold(active=True)], None),
            (2, [_hold("legal_hold", "a", True), _hold("regulatory_hold", "b", True)], "a real resolution, then hand-tampered to null below"),
        ):
            with self.subTest(active_count=active_count):
                record = _build(holds=holds, conflict_resolution=conflict_resolution)
                record["conflict_resolution"] = None
                gate = self._gate(record)
                self.assertEqual(gate["status"], "FAIL")
                self.assertEqual(gate["evidence"][0]["reason"], "conflict_resolution inconsistent with the active-hold count")

    def test_hand_tampered_flipping_a_hold_to_active_with_conflict_resolution_already_present_is_deliberately_accepted(self):
        """Regression for a critic-caught Major: this test's own name previously claimed the opposite of its
        body. A more subtle tamper: flip the third (inactive) hold in the two-active-holds fixture to active,
        without updating conflict_resolution -- now 3 active holds share the SAME (still non-empty)
        conflict_resolution text, which the gate DELIBERATELY still accepts (the invariant only checks
        PRESENCE/ABSENCE consistency with the active count, not that the text itself was updated to name all
        three -- the same disclosed limit as test_three_active_holds_require_conflict_resolution's own sibling
        compilation_decision, not a silent gap)."""
        record = _two_active_holds_record()
        record["holds"][2]["active"] = True
        self.assertTrue(all_gates_pass(evaluate_retention_deletion_gates(record, "test", TS)))

    def test_hand_tampered_schema_ref_prefix_broken_fails_the_gate(self):
        record = _build(schema_ref="ERD-2026-09-05-001")
        record["schema_ref"] = "RDM-not-an-erd"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "schema_ref present but malformed (missing 'ERD-' prefix or empty)")

    def test_hand_tampered_deletion_evidence_ref_prefix_broken_fails_the_gate(self):
        record = _build(deletion_evidence_ref="DEL-2026-01-001")
        record["deletion_evidence_ref"] = "ERD-not-a-deletion"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "deletion_evidence_ref present but malformed (missing 'DEL-' prefix or empty)")

    def test_hand_tampered_deletion_of_present_soft_refs_still_passes(self):
        record = _fully_linked_record()
        for ref_name in ("schema_ref", "deletion_evidence_ref"):
            self.assertIn(ref_name, record)
            del record[ref_name]
        self.assertTrue(all_gates_pass(evaluate_retention_deletion_gates(record, "test", TS)))

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_two_active_holds_record())
        self.assertEqual(gate["evidence"][0], {"hold_count": 3, "active_hold_count": 2})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _two_active_holds_record()
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
