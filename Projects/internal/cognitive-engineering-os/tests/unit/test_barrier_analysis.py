"""Mutation-style tests for ``root_cause.barrier_analysis`` (F05 root_cause family, seventh concrete
entry alongside fishbone/five_whys/pareto/fault_tree/bow_tie/kepner_tregoe). Two real invariant classes
proven at BOTH the construction and the independent gate layer: (1) NO-BLAME structural -- Atlas's own
literal misuse warning ('避免責怪個人', avoid blaming individuals), barriers[]/failure_modes[] entries have
a CLOSED key set with no field for a named individual/person, only the BARRIER itself; (2) CHAIN
CONNECTIVITY -- hazard_description/target_description must be non-empty, and every failure_mode's own
barrier_ref must resolve to a real barrier living INSIDE this SAME record (a dangling reference is
refused, the same bug class root_cause.fault_tree's own referential-integrity invariant guards against)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.root_cause.barrier_analysis import (
    BARRIER_ID_PREFIX,
    FAILURE_MODE_ID_PREFIX,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_barrier_analysis_gates,
    evaluate_barrier_analysis_integrity_gate,
    evaluate_provenance_required_gate,
    generate_barrier_analysis_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/barrier-analysis-record.schema.yaml"
TS = "2026-09-07T00:00:00Z"
HAZARD = "An unreviewed code change is pushed toward the production deploy path"
TARGET = "Production environment"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _barrier(barrier_id="B-001", description="Deploy-approval gate"):
    return {"barrier_id": barrier_id, "description": description}


def _failure_mode(failure_mode_id="FM-001", barrier_ref="B-001", description="Gate configuration allowed a bypass path"):
    return {"failure_mode_id": failure_mode_id, "barrier_ref": barrier_ref, "description": description}


def _build(
    record_id="BARRIER-T-001",
    system_or_incident="s",
    hazard_description=None,
    target_description=None,
    barriers=None,
    failure_modes=None,
):
    return generate_barrier_analysis_record(
        record_id,
        system_or_incident,
        HAZARD if hazard_description is None else hazard_description,
        TARGET if target_description is None else target_description,
        [_barrier()] if barriers is None else barriers,
        [_failure_mode()] if failure_modes is None else failure_modes,
        _prov(),
    )


def _valid_record():
    return _build()


def _build_with_version(version, generated_by_method):
    return generate_barrier_analysis_record(
        "BARRIER-T-005", "s", HAZARD, TARGET, [_barrier()], [_failure_mode()], _prov(), version=version, generated_by_method=generated_by_method
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal barrier analysis record")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = _build_with_version("2.3.4", "root_cause.barrier_analysis@test")
        self.assertEqual(record["generated_by_method"], "root_cause.barrier_analysis@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_id_prefix_constants(self):
        self.assertEqual(RECORD_ID_PREFIX, "BARRIER-")
        self.assertEqual(BARRIER_ID_PREFIX, "B-")
        self.assertEqual(FAILURE_MODE_ID_PREFIX, "FM-")

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "barrier-analysis-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "barrier-analysis-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_barrier_analysis_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version / system_or_incident / hazard_description / target_description ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_barrier_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_RECORD_ID"):
            _build(record_id="BOWTIE-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_VERSION"):
            generate_barrier_analysis_record("BARRIER-T-V1", "s", HAZARD, TARGET, [_barrier()], [_failure_mode()], _prov(), version=123)

    def test_empty_system_or_incident_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_EMPTY_RECORD_FIELD"):
            _build(system_or_incident="  ")

    def test_empty_hazard_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_HAZARD"):
            _build(hazard_description=" ")

    def test_whitespace_only_hazard_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_HAZARD"):
            _build(hazard_description="\n\t")

    def test_empty_target_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_TARGET"):
            _build(target_description=" ")

    def test_whitespace_only_target_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_TARGET"):
            _build(target_description="\n\t")

    # --- barriers[]: shape ---
    def test_empty_barriers_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_BARRIERS"):
            _build(barriers=[])

    def test_non_list_barriers_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_BARRIERS"):
            _build(barriers="not-a-list")

    def test_barrier_id_without_b_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_BARRIERS"):
            _build(barriers=[_barrier(barrier_id="BAR-001")])

    def test_barrier_empty_barrier_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_BARRIERS"):
            _build(barriers=[_barrier(barrier_id="")])

    def test_barrier_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_BARRIERS"):
            _build(barriers=[_barrier(description=" ")])

    def test_non_dict_barrier_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_BARRIERS"):
            _build(barriers=["not-a-dict"])

    def test_barrier_missing_key_is_refused(self):
        barrier = _barrier()
        del barrier["description"]
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_BARRIERS"):
            _build(barriers=[barrier])

    def test_duplicate_barrier_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_BARRIERS"):
            _build(barriers=[_barrier(), _barrier(description="a second, different description")])

    def test_two_barriers_different_ids_validates(self):
        record = _build(barriers=[_barrier("B-001", "a"), _barrier("B-002", "b")], failure_modes=[_failure_mode(barrier_ref="B-001")])
        self.assertEqual(len(record["barriers"]), 2)

    # --- barriers[]: NO-BLAME structural invariant (a barrier entry has no room for an individual) ---
    def test_barrier_with_extra_key_is_refused(self):
        barrier = _barrier()
        barrier["category"] = "process"
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_BARRIERS"):
            _build(barriers=[barrier])

    def test_barrier_with_blame_shaped_extra_key_is_refused(self):
        """The real, textually-grounded no-blame constraint: an attempted individual-attribution field is
        refused the same way any other extra key would be -- the shape has structurally no room for it."""
        barrier = _barrier()
        barrier["responsible_person"] = "a named engineer"
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_BARRIERS"):
            _build(barriers=[barrier])

    # --- failure_modes[]: shape ---
    def test_empty_failure_modes_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes=[])

    def test_non_list_failure_modes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes={"not": "a list"})

    def test_failure_mode_id_without_fm_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes=[_failure_mode(failure_mode_id="F-001")])

    def test_failure_mode_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes=[_failure_mode(description=" ")])

    def test_failure_mode_empty_barrier_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes=[_failure_mode(barrier_ref=" ")])

    def test_non_dict_failure_mode_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes=[42])

    def test_failure_mode_missing_key_is_refused(self):
        failure_mode = _failure_mode()
        del failure_mode["barrier_ref"]
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes=[failure_mode])

    def test_duplicate_failure_mode_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes=[_failure_mode(), _failure_mode(description="a second, different description")])

    # --- failure_modes[]: NO-BLAME structural invariant ---
    def test_failure_mode_with_extra_key_is_refused(self):
        failure_mode = _failure_mode()
        failure_mode["severity"] = "high"
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes=[failure_mode])

    def test_failure_mode_with_blame_shaped_extra_key_is_refused(self):
        """Same real constraint on the other entry type: an attempted individual-attribution field on a
        failure_mode is refused the same way any other extra key would be."""
        failure_mode = _failure_mode()
        failure_mode["responsible_person"] = "a named engineer"
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes=[failure_mode])

    def test_failure_mode_with_who_key_is_refused(self):
        failure_mode = _failure_mode()
        failure_mode["who"] = "a named engineer"
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_INVALID_FAILURE_MODES"):
            _build(failure_modes=[failure_mode])

    # --- failure_modes[]: CHAIN CONNECTIVITY invariant (referential integrity) ---
    def test_failure_mode_pointing_at_nonexistent_barrier_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_DANGLING_FAILURE_REFERENCE"):
            _build(failure_modes=[_failure_mode(barrier_ref="B-999")])

    def test_failure_mode_barrier_ref_is_case_sensitive(self):
        with self.assertRaisesRegex(InvariantViolation, "BARRIER_DANGLING_FAILURE_REFERENCE"):
            _build(barriers=[_barrier("B-001", "a")], failure_modes=[_failure_mode(barrier_ref="b-001")])

    def test_failure_mode_pointing_at_real_barrier_validates(self):
        record = _build(failure_modes=[_failure_mode(barrier_ref="B-001")])
        self.assertEqual(record["failure_modes"][0]["barrier_ref"], "B-001")

    def test_two_failure_modes_same_barrier_validates(self):
        """Defense-in-depth analog: two distinct failure modes can legitimately reference the SAME
        barrier (e.g. two independent reasons it failed)."""
        record = _build(
            failure_modes=[_failure_mode("FM-001", "B-001", "a"), _failure_mode("FM-002", "B-001", "b")]
        )
        self.assertEqual(len(record["failure_modes"]), 2)

    def test_failure_modes_need_not_cover_every_barrier(self):
        """No coverage requirement -- only DECLARED failure_modes must reference a real barrier; a barrier
        with no failure_mode at all (it held) is a legitimate, common real-world outcome."""
        record = _build(
            barriers=[_barrier("B-001", "a"), _barrier("B-002", "b")],
            failure_modes=[_failure_mode("FM-001", "B-001", "d")],
        )
        self.assertEqual(len(record["barriers"]), 2)
        self.assertEqual(len(record["failure_modes"]), 1)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_barrier_prefix(self):
        record = _valid_record()
        record["id"] = "BOWTIE-1"
        with self.assertRaisesRegex(Exception, "BARRIER-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["failure_modes"]
        with self.assertRaisesRegex(Exception, "failure_modes"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_barrier_with_additional_property(self):
        record = _valid_record()
        record["barriers"][0]["responsible_person"] = "a named engineer"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema barrier additionalProperties")

    def test_schema_layer_rejects_failure_mode_with_additional_property(self):
        record = _valid_record()
        record["failure_modes"][0]["responsible_person"] = "a named engineer"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema failure_mode additionalProperties")

    def test_schema_layer_rejects_barrier_id_without_b_prefix(self):
        record = _valid_record()
        record["barriers"][0]["barrier_id"] = "BAR-001"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema barrier_id pattern")

    def test_schema_layer_rejects_failure_mode_id_without_fm_prefix(self):
        record = _valid_record()
        record["failure_modes"][0]["failure_mode_id"] = "F-001"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema failure_mode_id pattern")

    def test_schema_layer_rejects_empty_hazard_description(self):
        record = _valid_record()
        record["hazard_description"] = ""
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema hazard_description minLength")

    def test_schema_layer_rejects_empty_target_description(self):
        record = _valid_record()
        record["target_description"] = ""
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema target_description minLength")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        barriers = [_barrier()]
        failure_modes = [_failure_mode()]
        record = generate_barrier_analysis_record("BARRIER-T-010", "s", HAZARD, TARGET, barriers, failure_modes, _prov())
        barriers[0]["description"] = "mutated"
        failure_modes[0]["description"] = "mutated"
        self.assertNotEqual(record["barriers"][0]["description"], "mutated")
        self.assertNotEqual(record["failure_modes"][0]["description"], "mutated")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_barrier_analysis_record("BARRIER-T-011", "s", HAZARD, TARGET, [_barrier()], [_failure_mode()], provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_barrier_analysis_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_barrier_analysis_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_barrier_analysis_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "barrier_analysis_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_barrier_analysis_gates(record, "test", TS)))

    # --- basic field shape, hand-tampered (bypassing the builder entirely) ---
    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("id missing", gate["evidence"][0]["reason"])

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("version missing", gate["evidence"][0]["reason"])

    def test_hand_tampered_empty_system_or_incident_fails_the_gate(self):
        record = _valid_record()
        record["system_or_incident"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("system_or_incident missing", gate["evidence"][0]["reason"])

    def test_hand_tampered_empty_hazard_description_fails_the_gate(self):
        record = _valid_record()
        record["hazard_description"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("hazard_description missing", gate["evidence"][0]["reason"])

    def test_hand_tampered_empty_target_description_fails_the_gate(self):
        record = _valid_record()
        record["target_description"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("target_description missing", gate["evidence"][0]["reason"])

    def test_hand_tampered_barriers_dropped_fails_the_gate(self):
        record = _valid_record()
        record["barriers"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BARRIER_INVALID_BARRIERS", gate["evidence"][0]["reason"])

    def test_hand_tampered_failure_modes_dropped_fails_the_gate(self):
        record = _valid_record()
        record["failure_modes"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BARRIER_INVALID_FAILURE_MODES", gate["evidence"][0]["reason"])

    def test_hand_tampered_duplicate_barrier_id_fails_the_gate(self):
        record = _build(barriers=[_barrier("B-001", "a"), _barrier("B-002", "b")], failure_modes=[_failure_mode(barrier_ref="B-001")])
        record["barriers"][1]["barrier_id"] = "B-001"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BARRIER_INVALID_BARRIERS", gate["evidence"][0]["reason"])

    # --- NO-BLAME invariant, caught ONLY by the gate after hand-tampering ---
    def test_hand_tampered_barrier_blame_field_added_fails_the_gate(self):
        """The record was VALID at construction; a hand-tamperer later adds an individual-attribution
        field to a barrier entry. Only the independent gate re-derivation catches this."""
        record = _valid_record()
        record["barriers"][0]["responsible_person"] = "a named engineer"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BARRIER_INVALID_BARRIERS", gate["evidence"][0]["reason"])

    def test_hand_tampered_failure_mode_blame_field_added_fails_the_gate(self):
        record = _valid_record()
        record["failure_modes"][0]["responsible_person"] = "a named engineer"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BARRIER_INVALID_FAILURE_MODES", gate["evidence"][0]["reason"])

    # --- CHAIN CONNECTIVITY invariant (dangling reference), caught ONLY by the gate after hand-tampering ---
    def test_hand_tampered_failure_mode_retargeted_to_dangling_barrier_fails_the_gate(self):
        record = _valid_record()
        record["failure_modes"][0]["barrier_ref"] = "B-DOES-NOT-EXIST"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BARRIER_DANGLING_FAILURE_REFERENCE", gate["evidence"][0]["reason"])

    def test_hand_tampered_barrier_id_renamed_creates_dangling_reference_fails_the_gate(self):
        """Renaming the barrier a failure_mode already points to (without updating the reference) turns a
        legal reference into a dangling one -- the same real-world editing mistake
        FAULTTREE_DANGLING_REFERENCE's own family precedent guards against."""
        record = _valid_record()
        record["barriers"][0]["barrier_id"] = "B-RENAMED"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BARRIER_DANGLING_FAILURE_REFERENCE", gate["evidence"][0]["reason"])

    def test_hand_tampered_duplicate_failure_mode_id_fails_the_gate(self):
        record = _build(failure_modes=[_failure_mode("FM-001", "B-001", "a"), _failure_mode("FM-002", "B-001", "b")])
        record["failure_modes"][1]["failure_mode_id"] = "FM-001"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BARRIER_INVALID_FAILURE_MODES", gate["evidence"][0]["reason"])

    # --- evidence / non-crashing / no-mutation discipline ---
    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_valid_record())
        self.assertEqual(gate["evidence"][0]["barrier_count"], 1)
        self.assertEqual(gate["evidence"][0]["failure_mode_count"], 1)

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
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

    def test_hand_tampered_barriers_wrong_type_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["barriers"] = "not-a-list"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_failure_modes_wrong_type_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["failure_modes"] = {"not": "a list"}
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
