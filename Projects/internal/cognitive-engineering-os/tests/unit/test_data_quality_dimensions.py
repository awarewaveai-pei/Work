"""Mutation-style tests for ``database_data.data_quality_dimensions`` (forty-second Method Atlas slice,
eighth member of the `database_data` family). Atlas's own formula (rules->profiling->threshold->quarantine
->owner) is GENUINE COMPUTE -- proven at BOTH independent layers: the builder's own public interface does not
accept passes_threshold/quality_gate_status/quarantined_dimensions as parameters, and the gate independently
RECOMPUTES the classification fresh from the record's own raw dimensions rather than trusting stored values.
This record's own id/version are checked at both layers from this FIRST draft, applying the lesson
database_data.normalization's own critic round had to learn the hard way."""

from __future__ import annotations

import copy
import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.database_data.data_quality_dimensions import (
    METHOD_ID,
    all_gates_pass,
    evaluate_data_quality_gates,
    evaluate_data_quality_integrity_gate,
    evaluate_genuine_compute_gate,
    evaluate_provenance_required_gate,
    generate_data_quality_assessment_record,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/data-quality-assessment-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _dim(dimension="completeness", rule="rule text", profiled_score=0.98, threshold=0.95, owner="team-a"):
    return {"dimension": dimension, "rule": rule, "profiled_score": profiled_score, "threshold": threshold, "owner": owner}


def _build(
    record_id="DQ-T-001",
    dataset="checkout-api.order-events",
    dimensions=None,
    schema_ref=None,
    lineage_ref=None,
    restore_drill_ref=None,
    data_contract_ref=None,
):
    return generate_data_quality_assessment_record(
        record_id,
        dataset,
        [_dim(), _dim(dimension="accuracy", profiled_score=0.80, threshold=0.99)] if dimensions is None else dimensions,
        _prov(),
        schema_ref=schema_ref,
        lineage_ref=lineage_ref,
        restore_drill_ref=restore_drill_ref,
        data_contract_ref=data_contract_ref,
    )


def _valid_record():
    return _build()


def _fully_linked_record():
    return _build(
        record_id="DQ-T-002",
        schema_ref="ERD-2026-09-05-001",
        lineage_ref="DLR-2026-09-05-001",
        restore_drill_ref="DRILL-2026-09-05-001",
        data_contract_ref="DC-2026-09-05-001",
    )


def _pass_record():
    return _build(record_id="DQ-T-003", dataset="internal-reference.country-codes", dimensions=[_dim(dimension="uniqueness", profiled_score=1.0, threshold=1.0)])


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_quarantined_record_validates_against_the_real_schema(self):
        record = _valid_record()
        self.contracts.validate(RECORD_SCHEMA, record, "quarantined data quality record")
        self.assertEqual(record["quality_gate_status"], "QUARANTINED")

    def test_fully_linked_record_validates(self):
        self.contracts.validate(RECORD_SCHEMA, _fully_linked_record(), "fully-linked data quality record")

    def test_pass_record_validates(self):
        record = _pass_record()
        self.contracts.validate(RECORD_SCHEMA, record, "pass data quality record")
        self.assertEqual(record["quality_gate_status"], "PASS")
        self.assertEqual(record["quarantined_dimensions"], [])

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_data_quality_assessment_record("DQ-T-004", "d", [_dim()], _prov(), version="2.3.4", generated_by_method="database_data.data_quality_dimensions@test")
        self.assertEqual(record["generated_by_method"], "database_data.data_quality_dimensions@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_generate_record_has_no_computed_field_parameters(self):
        """Pins the core design claim: the builder's own public interface does not even let a caller ATTEMPT
        to fake the computed fields."""
        import inspect

        params = set(inspect.signature(generate_data_quality_assessment_record).parameters)
        self.assertNotIn("quality_gate_status", params)
        self.assertNotIn("quarantined_dimensions", params)
        self.assertNotIn("passes_threshold", params)

    # --- id / version (checked at both layers from this first draft) ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_dq_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_RECORD_ID"):
            _build(record_id="ERD-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_VERSION"):
            generate_data_quality_assessment_record("DQ-T-VERSION", "d", [_dim()], _prov(), version=123)

    def test_none_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_VERSION"):
            generate_data_quality_assessment_record("DQ-T-VERSION2", "d", [_dim()], _prov(), version=None)

    def test_whitespace_only_dataset_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_EMPTY_RECORD_FIELD"):
            _build(dataset="   ")

    # --- dimensions: shape ---
    def test_zero_dimensions_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[])

    def test_illegal_dimension_enum_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[_dim(dimension="freshness")])

    def test_dimension_with_extra_key_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[dict(_dim(), note="x")])

    def test_dimension_missing_a_required_key_is_refused(self):
        entry = _dim()
        del entry["owner"]
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[entry])

    def test_empty_rule_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[_dim(rule="")])

    def test_empty_owner_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[_dim(owner="")])

    def test_non_dict_dimension_entry_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=["completeness"])

    def test_non_list_dimensions_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions="not a list")

    # --- dimensions: score/threshold bounds (a critic-caught class in devops_sre.capacity_model, applied
    # here from the first draft) ---
    def test_negative_profiled_score_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[_dim(profiled_score=-0.1)])

    def test_profiled_score_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[_dim(profiled_score=1.1)])

    def test_infinite_threshold_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[_dim(threshold=math.inf)])

    def test_nan_profiled_score_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[_dim(profiled_score=math.nan)])

    def test_bool_profiled_score_is_refused_not_coerced(self):
        """bool is a Python int subclass -- True/False must not silently pass as 1.0/0.0."""
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[_dim(profiled_score=True)])

    def test_string_threshold_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_DIMENSIONS"):
            _build(dimensions=[_dim(threshold="0.9")])

    def test_score_exactly_zero_and_one_are_legal_boundary_values(self):
        record = _build(dimensions=[_dim(profiled_score=0.0, threshold=0.0), _dim(dimension="validity", profiled_score=1.0, threshold=1.0)])
        self.assertTrue(all(e["passes_threshold"] for e in record["dimensions"]))

    def test_score_exactly_equal_to_threshold_passes(self):
        """Explicitly names and pins the >= (not >) comparison at a mid-range value, independent of the
        boundary-value test above -- a critic-caught coverage gap: that test alone was the only thing
        defending this, incidentally, under a name about boundaries rather than the comparison operator
        itself."""
        record = _build(dimensions=[_dim(profiled_score=0.95, threshold=0.95)])
        self.assertTrue(record["dimensions"][0]["passes_threshold"])

    def test_all_six_atlas_dimensions_round_trip_through_builder_and_gates(self):
        """A critic-caught coverage gap: deleting a value from VALID_DIMENSIONS survived all prior tests
        because consistency and timeliness were never exercised. Pins all six §12.39 values individually,
        and cross-checks the module's own enum against the schema's own enum (the vocabulary lives in two
        places with no parity test)."""
        import yaml

        from ai_lego.modules.database_data.data_quality_dimensions import VALID_DIMENSIONS

        expected = {"completeness", "accuracy", "consistency", "uniqueness", "timeliness", "validity"}
        self.assertEqual(VALID_DIMENSIONS, frozenset(expected))
        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "data-quality-assessment-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        schema_enum = set(schema_doc["$defs"]["dimension_assessment"]["properties"]["dimension"]["enum"])
        self.assertEqual(schema_enum, expected)
        for dimension in expected:
            with self.subTest(dimension=dimension):
                record = _build(dimensions=[_dim(dimension=dimension)])
                self.contracts.validate(RECORD_SCHEMA, record, f"round-trip for dimension={dimension}")
                self.assertTrue(all_gates_pass(evaluate_data_quality_gates(record, "test", TS)))

    # --- disclosed legality: repeated dimension values ---
    def test_repeated_dimension_value_is_legal(self):
        record = _build(dimensions=[_dim(rule="rule for column A"), _dim(rule="rule for column B")])
        self.assertEqual(len(record["dimensions"]), 2)
        self.assertEqual({d["dimension"] for d in record["dimensions"]}, {"completeness"})

    # --- soft-link refs ---
    def test_all_four_soft_refs_none_are_legal_and_omitted(self):
        record = _valid_record()
        for ref_name in ("schema_ref", "lineage_ref", "restore_drill_ref", "data_contract_ref"):
            self.assertNotIn(ref_name, record)

    def test_schema_ref_with_erd_prefix_is_accepted(self):
        self.assertEqual(_build(schema_ref="ERD-2026-09-05-001")["schema_ref"], "ERD-2026-09-05-001")

    def test_lineage_ref_with_dlr_prefix_is_accepted(self):
        self.assertEqual(_build(lineage_ref="DLR-2026-09-05-001")["lineage_ref"], "DLR-2026-09-05-001")

    def test_restore_drill_ref_with_drill_prefix_is_accepted(self):
        self.assertEqual(_build(restore_drill_ref="DRILL-2026-09-05-001")["restore_drill_ref"], "DRILL-2026-09-05-001")

    def test_data_contract_ref_with_dc_prefix_is_accepted(self):
        self.assertEqual(_build(data_contract_ref="DC-2026-09-05-001")["data_contract_ref"], "DC-2026-09-05-001")

    def test_each_soft_ref_with_wrong_prefix_is_refused(self):
        for kwarg, bad_value in (
            ("schema_ref", "DQ-999"),
            ("lineage_ref", "ERD-999"),
            ("restore_drill_ref", "DLR-999"),
            ("data_contract_ref", "DRILL-999"),
        ):
            with self.subTest(kwarg=kwarg):
                with self.assertRaisesRegex(InvariantViolation, "DATAQUALITY_INVALID_SOFT_REF"):
                    _build(**{kwarg: bad_value})

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_dq_prefix(self):
        record = _valid_record()
        record["id"] = "ERD-1"
        with self.assertRaisesRegex(Exception, "DQ-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_an_illegal_dimension_enum_value(self):
        record = _valid_record()
        record["dimensions"][0]["dimension"] = "freshness"
        with self.assertRaisesRegex(Exception, "freshness"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema dimension enum")

    def test_schema_layer_rejects_an_illegal_quality_gate_status_value(self):
        record = _valid_record()
        record["quality_gate_status"] = "WARN"
        with self.assertRaisesRegex(Exception, "WARN"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema quality_gate_status enum")

    def test_schema_layer_rejects_wrong_engine_value(self):
        record = _valid_record()
        record["engine"] = "gpt-4"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema engine const")

    def test_schema_layer_rejects_wrong_computation_provenance_ref(self):
        record = _valid_record()
        record["computation_provenance_ref"] = "ai_lego.compute.other.thing"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema computation_provenance_ref const")

    def test_schema_layer_rejects_extra_key_on_a_dimension_entry(self):
        record = _valid_record()
        record["dimensions"][0]["note"] = "x"
        with self.assertRaisesRegex(Exception, "note"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema dimension additionalProperties")

    def test_schema_layer_rejects_zero_dimensions(self):
        record = _valid_record()
        record["dimensions"] = []
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema minItems on dimensions")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["quality_gate_status"]
        with self.assertRaisesRegex(Exception, "quality_gate_status"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_score_above_one(self):
        record = _valid_record()
        record["dimensions"][0]["profiled_score"] = 1.5
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema profiled_score maximum")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        dimensions = [_dim()]
        record = generate_data_quality_assessment_record("DQ-T-010", "d", dimensions, _prov())
        dimensions[0]["profiled_score"] = 0.0
        dimensions.append(_dim(dimension="validity"))
        self.assertEqual(record["dimensions"][0]["profiled_score"], 0.98)
        self.assertEqual(len(record["dimensions"]), 1)

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_data_quality_assessment_record("DQ-T-011", "d", [_dim()], provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_quarantined_dimensions_entries_do_not_alias_dimensions_entries(self):
        """Regression for the exact class that shipped as a real bug in the immediately preceding slice
        (database_data.normalization's own dict(fd) shallow copy left a nested list aliased). The compute
        module's own docstring claims quarantined_dimensions entries are never the same object as their
        dimensions counterpart -- pinned here by object identity, not just by value equality, so mutating
        one cannot silently corrupt the other."""
        record = _valid_record()
        dimension_ids = {id(entry) for entry in record["dimensions"]}
        for quarantined_entry in record["quarantined_dimensions"]:
            self.assertNotIn(id(quarantined_entry), dimension_ids)
        record["quarantined_dimensions"][0]["owner"] = "mutated"
        matching = next(e for e in record["dimensions"] if e["dimension"] == record["quarantined_dimensions"][0]["dimension"])
        self.assertNotEqual(matching["owner"], "mutated")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_data_quality_dimensions_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        """Closes the same critic-identified gap database_data.normalization's own test file first closed for
        its own schema: no repo-wide rule yet validates a typed-object schema's own examples against the
        schema AND its real gates, so each slice checks its own."""
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "data-quality-assessment-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "data-quality-assessment-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_data_quality_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_data_quality_integrity_gate(record, "test", TS)

    def test_valid_quarantined_record_passes_all_three_gates(self):
        results = evaluate_data_quality_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "genuine_compute", "data_quality_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_fully_linked_record_passes_all_three_gates(self):
        self.assertTrue(all_gates_pass(evaluate_data_quality_gates(_fully_linked_record(), "test", TS)))

    def test_valid_pass_record_passes_all_three_gates(self):
        self.assertTrue(all_gates_pass(evaluate_data_quality_gates(_pass_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_data_quality_gates(record, "test", TS)))

    # --- genuine_compute gate ---
    def test_genuine_compute_gate_is_the_real_evaluate_statistical_gate_function_reused_unchanged(self):
        """Twelfth reuse this session (CORRECTED post-critic-review from a first-draft miscount of 'eighth' --
        real chain: pareto/ahp/mcda/error_budget/data_lineage/reconciliation/capacity_model/load_test
        /stress_test/soak_test/normalization/data_quality_dimensions)."""
        from ai_lego.modules.database_data import data_quality_dimensions as dq_module

        self.assertIs(dq_module.evaluate_statistical_gate, evaluate_statistical_gate)

    def test_hand_tampered_wrong_epistemic_type_fails_the_genuine_compute_gate(self):
        record = _valid_record()
        record["provenance"] = make_provenance("AI_INFERENCE", "AI_GENERATED")
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", TS)["status"], "FAIL")

    def test_hand_tampered_wrong_engine_fails_the_genuine_compute_gate(self):
        record = _valid_record()
        record["engine"] = "gpt-4"
        self.assertEqual(evaluate_genuine_compute_gate(record, "test", TS)["status"], "FAIL")

    def test_non_dict_record_fails_the_genuine_compute_gate_not_a_crash(self):
        self.assertEqual(evaluate_genuine_compute_gate(None, "test", TS)["status"], "FAIL")

    # --- data_quality_integrity gate: structural re-derivation ---
    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'DQ-'")

    def test_hand_tampered_id_without_dq_prefix_fails_the_gate(self):
        record = _valid_record()
        record["id"] = "ERD-1"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'DQ-'")

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

    def test_hand_tampered_empty_dataset_fails_the_gate(self):
        record = _valid_record()
        record["dataset_or_topic"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "dataset_or_topic missing or empty")

    def test_hand_tampered_empty_dimensions_fails_the_gate(self):
        record = _valid_record()
        record["dimensions"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "dimensions invalid (empty, malformed entry, unknown keys, illegal dimension value, non-finite score, or non-bool passes_threshold)")

    def test_hand_tampered_illegal_dimension_value_fails_the_gate(self):
        record = _valid_record()
        record["dimensions"][0]["dimension"] = "freshness"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "dimensions invalid (empty, malformed entry, unknown keys, illegal dimension value, non-finite score, or non-bool passes_threshold)")

    def test_hand_tampered_extra_key_on_a_dimension_entry_fails_the_shape_check_directly(self):
        """Pins the exact-key-set check itself (_dimensions_stored_are_valid), not just its downstream
        effect via the recomputation-mismatch fallback -- a critic-caught coverage gap: relaxing the key-set
        check to a superset test still failed the gate (via recomputation disagreeing), but the check's own
        FIRST-line reason ('dimensions invalid...') was never independently pinned against this specific
        mutation."""
        record = _valid_record()
        record["dimensions"][0]["note"] = "an extra key the shape check should reject on its own"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "dimensions invalid (empty, malformed entry, unknown keys, illegal dimension value, non-finite score, or non-bool passes_threshold)")

    def test_hand_tampered_non_bool_passes_threshold_fails_the_gate(self):
        record = _valid_record()
        record["dimensions"][0]["passes_threshold"] = "yes"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "dimensions invalid (empty, malformed entry, unknown keys, illegal dimension value, non-finite score, or non-bool passes_threshold)")

    def test_hand_tampered_infinite_score_fails_the_gate(self):
        record = _valid_record()
        record["dimensions"][0]["profiled_score"] = math.inf
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "dimensions invalid (empty, malformed entry, unknown keys, illegal dimension value, non-finite score, or non-bool passes_threshold)")

    def test_hand_tampered_soft_ref_prefix_broken_fails_the_gate(self):
        for ref_name, good, bad in (
            ("schema_ref", "ERD-2026-09-05-001", "DQ-not-an-erd"),
            ("lineage_ref", "DLR-2026-09-05-001", "ERD-not-a-lineage"),
            ("restore_drill_ref", "DRILL-2026-09-05-001", "DLR-not-a-drill"),
            ("data_contract_ref", "DC-2026-09-05-001", "DRILL-not-a-contract"),
        ):
            with self.subTest(ref_name=ref_name):
                record = _build(**{ref_name: good})
                record[ref_name] = bad
                gate = self._gate(record)
                self.assertEqual(gate["status"], "FAIL")
                self.assertIn("present but malformed", gate["evidence"][0]["reason"])

    def test_hand_tampered_deletion_of_a_present_soft_ref_key_still_passes(self):
        """Regression for a critic-caught 'test doesn't test what its name claims' Minor: the prior version
        of this test built a record that never had the refs and asserted absence, duplicating
        test_all_four_soft_refs_none_are_legal_and_omitted above without ever hand-tampering anything. This
        one starts from a record that DOES carry all four refs, deletes them, and confirms absence remains
        legal (only a PRESENT-but-malformed value should fail -- see the prefix-broken tests above)."""
        record = _fully_linked_record()
        for ref_name in ("schema_ref", "lineage_ref", "restore_drill_ref", "data_contract_ref"):
            self.assertIn(ref_name, record)
            del record[ref_name]
        self.assertTrue(all_gates_pass(evaluate_data_quality_gates(record, "test", TS)))

    # --- the load-bearing invariant: stored classification must match recomputation ---
    def test_hand_tampered_falsely_claimed_pass_status_fails_the_gate(self):
        """The core genuine-compute invariant: a record genuinely QUARANTINED cannot be hand-tampered to
        claim PASS -- the gate recomputes fresh from the record's own raw dimension scores."""
        record = _valid_record()
        self.assertEqual(record["quality_gate_status"], "QUARANTINED")
        record["quality_gate_status"] = "PASS"
        record["quarantined_dimensions"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored quality_gate_status disagrees with recomputation")
        self.assertEqual(gate["evidence"][0]["recomputed"], "QUARANTINED")

    def test_hand_tampered_falsely_flipped_passes_threshold_fails_the_gate(self):
        """Regression class: flipping a single entry's own passes_threshold (without touching
        quality_gate_status/quarantined_dimensions) must also be caught by the dimensions-vs-recomputation
        check, not just the top-level status check."""
        record = _valid_record()
        record["dimensions"][1]["passes_threshold"] = True  # the accuracy entry, genuinely 0.80 < 0.99
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored dimensions (including passes_threshold) disagrees with recomputation")

    def test_hand_tampered_falsely_emptied_quarantined_dimensions_fails_the_gate(self):
        record = _valid_record()
        record["quarantined_dimensions"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored quarantined_dimensions disagrees with recomputation")

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_pass_record())
        self.assertEqual(gate["evidence"][0], {"dimension_count": 1, "quality_gate_status": "PASS", "quarantined_count": 0})

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
