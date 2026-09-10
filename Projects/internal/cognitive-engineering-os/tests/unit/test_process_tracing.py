"""Mutation-style tests for ``causal.process_tracing`` (2nd member of the F11 causal family, after
``causal.dag``). A GENUINE_COMPUTE record, proven at BOTH independent layers, at a NEW per-ITEM granularity
(not just record-level): every evidence entry's own ``implication`` is re-derived from its own
``test_type``/``result`` at construction AND independently re-derived and compared by the gate; the
record-level ``hypothesis_status`` is likewise re-derived from ``evidence[].implication`` at both layers, with
``ELIMINATED`` taking precedence over ``CONFIRMED`` when both appear in the same evidence set."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.process_tracing.evidence_evaluation import VALID_RESULTS, VALID_TEST_TYPES, derive_hypothesis_status, derive_implication
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.causal.process_tracing import (
    METHOD_ID,
    VALID_HYPOTHESIS_STATUSES,
    VALID_IMPLICATIONS,
    all_gates_pass,
    evaluate_process_tracing_gates,
    evaluate_process_tracing_integrity_gate,
    evaluate_provenance_required_gate,
    generate_process_tracing_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/process-tracing-record.schema.yaml"
TS = "2026-09-10T00:00:00Z"
MECHANISM = "Regulatory approval delay caused the product launch slip, mediated by a compliance re-filing requirement, not by engineering capacity."


def _prov(epistemic_type="HUMAN_OPINION", authorship_state="HUMAN_ORIGINAL"):
    return make_provenance(epistemic_type, authorship_state)


def _evidence(evidence_id="EV-1", test_type="HOOP", description="d", result="PRESENT"):
    return {"id": evidence_id, "test_type": test_type, "description": description, "result": result, "provenance": _prov("EVIDENCE", "HUMAN_APPROVED")}


def _build(record_id="PROCESSTRACING-T-001", causal_mechanism=MECHANISM, evidence=None, cause_hypothesis_set_ref=None):
    return generate_process_tracing_record(
        record_id,
        causal_mechanism,
        [_evidence()] if evidence is None else evidence,
        _prov(),
        cause_hypothesis_set_ref=cause_hypothesis_set_ref,
    )


def _valid_record():
    return _build()


def _confirmed_record():
    return _build(
        record_id="PROCESSTRACING-T-002",
        evidence=[
            _evidence("EV-1", "HOOP", "hoop test description", "PRESENT"),
            _evidence("EV-2", "SMOKING_GUN", "smoking gun description", "PRESENT"),
        ],
    )


def _eliminated_record():
    return _build(
        record_id="PROCESSTRACING-T-003",
        evidence=[
            _evidence("EV-1", "HOOP", "hoop test description", "ABSENT"),
            _evidence("EV-2", "SMOKING_GUN", "smoking gun description", "PRESENT"),
        ],
    )


class ComputeUnitTests(unittest.TestCase):
    """Direct unit tests for the compute submodule -- the four-cell lookup table and the precedence rule."""

    def test_hoop_present_does_not_eliminate(self):
        self.assertEqual(derive_implication("HOOP", "PRESENT"), "HYPOTHESIS_NOT_ELIMINATED")

    def test_hoop_absent_eliminates(self):
        self.assertEqual(derive_implication("HOOP", "ABSENT"), "HYPOTHESIS_ELIMINATED")

    def test_smoking_gun_present_confirms(self):
        self.assertEqual(derive_implication("SMOKING_GUN", "PRESENT"), "HYPOTHESIS_CONFIRMED")

    def test_smoking_gun_absent_does_not_confirm(self):
        self.assertEqual(derive_implication("SMOKING_GUN", "ABSENT"), "HYPOTHESIS_NOT_CONFIRMED")

    def test_status_survives_when_neither_eliminated_nor_confirmed(self):
        self.assertEqual(derive_hypothesis_status(["HYPOTHESIS_NOT_ELIMINATED"]), "SURVIVING")
        self.assertEqual(derive_hypothesis_status(["HYPOTHESIS_NOT_CONFIRMED"]), "SURVIVING")
        self.assertEqual(derive_hypothesis_status(["HYPOTHESIS_NOT_ELIMINATED", "HYPOTHESIS_NOT_CONFIRMED"]), "SURVIVING")

    def test_status_confirmed_when_any_confirmed_and_none_eliminated(self):
        self.assertEqual(derive_hypothesis_status(["HYPOTHESIS_NOT_ELIMINATED", "HYPOTHESIS_CONFIRMED"]), "CONFIRMED")

    def test_status_eliminated_when_any_eliminated(self):
        self.assertEqual(derive_hypothesis_status(["HYPOTHESIS_ELIMINATED"]), "ELIMINATED")

    def test_eliminated_takes_precedence_over_confirmed(self):
        """The core logical-asymmetry invariant: a failed HOOP test is dispositive even alongside a
        SMOKING_GUN confirmation in the same evidence set."""
        self.assertEqual(derive_hypothesis_status(["HYPOTHESIS_ELIMINATED", "HYPOTHESIS_CONFIRMED"]), "ELIMINATED")
        self.assertEqual(derive_hypothesis_status(["HYPOTHESIS_CONFIRMED", "HYPOTHESIS_ELIMINATED"]), "ELIMINATED")


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "single-evidence process tracing record")

    def test_confirmed_record_validates_and_resolves_confirmed(self):
        record = _confirmed_record()
        self.contracts.validate(RECORD_SCHEMA, record, "confirmed process tracing record")
        self.assertEqual(record["hypothesis_status"], "CONFIRMED")

    def test_eliminated_record_validates_and_precedence_holds(self):
        record = _eliminated_record()
        self.contracts.validate(RECORD_SCHEMA, record, "eliminated process tracing record")
        self.assertEqual(record["hypothesis_status"], "ELIMINATED")

    def test_surviving_record_validates(self):
        record = _build(evidence=[_evidence("EV-1", "HOOP", "d", "PRESENT")])
        self.contracts.validate(RECORD_SCHEMA, record, "surviving process tracing record")
        self.assertEqual(record["hypothesis_status"], "SURVIVING")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_process_tracing_record("PROCESSTRACING-T-005", MECHANISM, [_evidence()], _prov(), version="2.3.4", generated_by_method="causal.process_tracing@test")
        self.assertEqual(record["generated_by_method"], "causal.process_tracing@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_optional_cause_hypothesis_set_ref_round_trips_when_present(self):
        record = _build(cause_hypothesis_set_ref="CHS-2026-09-04-001")
        self.contracts.validate(RECORD_SCHEMA, record, "record with cause_hypothesis_set_ref")
        self.assertEqual(record["cause_hypothesis_set_ref"], "CHS-2026-09-04-001")

    def test_cause_hypothesis_set_ref_is_absent_when_not_supplied(self):
        record = _valid_record()
        self.assertNotIn("cause_hypothesis_set_ref", record)

    def test_evidence_entry_with_implication_key_is_refused_at_construction(self):
        """Confirms implication has no code path through the builder -- even a CORRECT pre-computed value is
        refused, because the key is not accepted at all (extra key vs the 5-key input shape)."""
        entry = _evidence()
        entry["implication"] = derive_implication(entry["test_type"], entry["result"])
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_EVIDENCE"):
            _build(evidence=[entry])

    def test_hypothesis_status_is_not_a_builder_parameter(self):
        import inspect

        params = list(inspect.signature(generate_process_tracing_record).parameters)
        self.assertNotIn("hypothesis_status", params)

    # --- both test_type values and both result values round-trip ---
    def test_both_test_types_round_trip_through_builder_and_gates(self):
        self.assertEqual(VALID_TEST_TYPES, frozenset({"HOOP", "SMOKING_GUN"}))
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "process-tracing-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        schema_enum = set(schema_doc["$defs"]["evidence_test"]["properties"]["test_type"]["enum"])
        self.assertEqual(schema_enum, {"HOOP", "SMOKING_GUN"})
        for test_type in VALID_TEST_TYPES:
            for result in VALID_RESULTS:
                with self.subTest(test_type=test_type, result=result):
                    record = _build(evidence=[_evidence(test_type=test_type, result=result)])
                    self.contracts.validate(RECORD_SCHEMA, record, f"round-trip for test_type={test_type}, result={result}")
                    self.assertTrue(all_gates_pass(evaluate_process_tracing_gates(record, "test", TS)))

    def test_implication_enum_matches_schema(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "process-tracing-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        schema_enum = set(schema_doc["$defs"]["evidence_test"]["properties"]["implication"]["enum"])
        self.assertEqual(schema_enum, VALID_IMPLICATIONS)

    def test_hypothesis_status_enum_matches_schema(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "process-tracing-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        schema_enum = set(schema_doc["properties"]["hypothesis_status"]["enum"])
        self.assertEqual(schema_enum, VALID_HYPOTHESIS_STATUSES)

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "process-tracing-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "process-tracing-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_process_tracing_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_processtracing_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_RECORD_ID"):
            _build(record_id="CDA-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_VERSION"):
            generate_process_tracing_record("PROCESSTRACING-T-V1", MECHANISM, [_evidence()], _prov(), version=123)

    def test_none_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_VERSION"):
            generate_process_tracing_record("PROCESSTRACING-T-V2", MECHANISM, [_evidence()], _prov(), version=None)

    # --- causal_mechanism ---
    def test_empty_causal_mechanism_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_EMPTY_MECHANISM"):
            _build(causal_mechanism="")

    def test_whitespace_only_causal_mechanism_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_EMPTY_MECHANISM"):
            _build(causal_mechanism="   ")

    # --- cause_hypothesis_set_ref ---
    def test_empty_string_cause_hypothesis_set_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_CAUSE_HYPOTHESIS_SET_REF"):
            _build(cause_hypothesis_set_ref="")

    # --- evidence: shape + minItems (the core structural floor) ---
    def test_empty_evidence_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_EMPTY_EVIDENCE"):
            _build(evidence=[])

    def test_non_list_evidence_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_EMPTY_EVIDENCE"):
            _build(evidence="not-a-list")

    def test_evidence_illegal_test_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_EVIDENCE"):
            _build(evidence=[_evidence(test_type="STRAW_IN_THE_WIND")])

    def test_evidence_illegal_result_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_EVIDENCE"):
            _build(evidence=[_evidence(result="MAYBE")])

    def test_evidence_missing_a_required_key_is_refused(self):
        entry = _evidence()
        del entry["description"]
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_EVIDENCE"):
            _build(evidence=[entry])

    def test_evidence_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_EVIDENCE"):
            _build(evidence=[dict(_evidence(), severity="high")])

    def test_evidence_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_EVIDENCE"):
            _build(evidence=[_evidence(evidence_id="")])

    def test_evidence_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_EVIDENCE"):
            _build(evidence=[_evidence(description="")])

    def test_evidence_invalid_provenance_is_refused(self):
        entry = _evidence()
        entry["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_ORIGINAL"}
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_INVALID_EVIDENCE"):
            _build(evidence=[entry])

    def test_duplicate_evidence_ids_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROCESSTRACING_DUPLICATE_EVIDENCE_ID"):
            _build(evidence=[_evidence("EV-1", result="PRESENT"), _evidence("EV-1", "SMOKING_GUN", result="ABSENT")])

    def test_multiple_evidence_entries_with_distinct_ids_are_legal(self):
        record = _build(evidence=[_evidence("EV-1"), _evidence("EV-2", "SMOKING_GUN")])
        self.assertEqual(len(record["evidence"]), 2)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_processtracing_prefix(self):
        record = _valid_record()
        record["id"] = "CDA-1"
        with self.assertRaisesRegex(Exception, "PROCESSTRACING-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_an_illegal_test_type_value(self):
        record = _valid_record()
        record["evidence"][0]["test_type"] = "STRAW_IN_THE_WIND"
        with self.assertRaisesRegex(Exception, "STRAW_IN_THE_WIND"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema test_type enum")

    def test_schema_layer_rejects_extra_key_on_an_evidence_entry(self):
        record = _valid_record()
        record["evidence"][0]["severity"] = "high"
        with self.assertRaisesRegex(Exception, "severity"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema evidence_test additionalProperties")

    def test_schema_layer_rejects_an_unknown_top_level_key(self):
        """Same discipline as how-might-we-record.schema.yaml's own test: additionalProperties:false must
        reject a smuggled top-level key on the record itself, not just on nested evidence_test entries."""
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, record, "process tracing record with a smuggled top-level key")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["causal_mechanism"]
        with self.assertRaisesRegex(Exception, "causal_mechanism"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_empty_evidence(self):
        record = _valid_record()
        record["evidence"] = []
        with self.assertRaisesRegex(Exception, "evidence"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema evidence minItems")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_evidence_list_after_construction_does_not_affect_the_stored_record(self):
        evidence = [_evidence()]
        record = generate_process_tracing_record("PROCESSTRACING-T-010", MECHANISM, evidence, _prov())
        evidence.append(_evidence("EV-2", "SMOKING_GUN"))
        evidence[0]["description"] = "mutated"
        self.assertEqual(len(record["evidence"]), 1)
        self.assertEqual(record["evidence"][0]["description"], "d")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_process_tracing_record("PROCESSTRACING-T-011", MECHANISM, [_evidence()], provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_process_tracing_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_process_tracing_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_process_tracing_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "process_tracing_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_confirmed_and_eliminated_records_both_pass_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_process_tracing_gates(_confirmed_record(), "test", TS)))
        self.assertTrue(all_gates_pass(evaluate_process_tracing_gates(_eliminated_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_process_tracing_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'PROCESSTRACING-'")

    def test_hand_tampered_id_without_prefix_fails_the_gate(self):
        record = _valid_record()
        record["id"] = "CDA-1"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'PROCESSTRACING-'")

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

    def test_hand_tampered_empty_causal_mechanism_fails_the_gate(self):
        record = _valid_record()
        record["causal_mechanism"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "causal_mechanism missing or empty")

    def test_hand_tampered_non_string_cause_hypothesis_set_ref_fails_the_gate(self):
        record = _build(cause_hypothesis_set_ref="CHS-1")
        record["cause_hypothesis_set_ref"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "cause_hypothesis_set_ref present but not a non-empty string")

    def test_hand_tampered_empty_evidence_fails_the_gate(self):
        record = _valid_record()
        record["evidence"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "evidence missing, not a list, or empty")

    def test_hand_tampered_illegal_test_type_fails_the_gate(self):
        record = _valid_record()
        record["evidence"][0]["test_type"] = "STRAW_IN_THE_WIND"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("evidence invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_duplicate_evidence_ids_fail_the_gate(self):
        record = _confirmed_record()
        record["evidence"][1]["id"] = record["evidence"][0]["id"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "evidence ids are not unique")

    def test_hand_tampered_evidence_implication_mismatch_fails_the_gate(self):
        """The core PER-ITEM re-derived-not-trusted invariant: falsely flipping one evidence entry's own
        implication while its own test_type/result stay untouched must be caught by recomputation."""
        record = _eliminated_record()
        self.assertEqual(record["evidence"][0]["implication"], "HYPOTHESIS_ELIMINATED")
        record["evidence"][0]["implication"] = "HYPOTHESIS_NOT_ELIMINATED"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("disagreeing with its own re-derivation", gate["evidence"][0]["reason"])

    def test_hand_tampered_hypothesis_status_mismatch_fails_the_gate(self):
        """The record-level re-derived-not-trusted invariant, independent of the per-item one above: every
        per-item implication stays correct, but the record-level hypothesis_status is falsely overwritten."""
        record = _confirmed_record()
        self.assertEqual(record["hypothesis_status"], "CONFIRMED")
        record["hypothesis_status"] = "SURVIVING"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored hypothesis_status disagrees with recomputation")
        self.assertEqual(gate["evidence"][0]["stored"], "SURVIVING")
        self.assertEqual(gate["evidence"][0]["recomputed"], "CONFIRMED")

    def test_hand_tampered_elimination_precedence_falsely_overwritten_fails_the_gate(self):
        """The ELIMINATED-overrides-CONFIRMED precedence, re-checked at the gate: an eliminated record whose
        hypothesis_status is falsely overwritten to CONFIRMED (the confirming entry's own implication is real
        and correct) must still be caught -- ELIMINATED must win the recomputation."""
        record = _eliminated_record()
        record["hypothesis_status"] = "CONFIRMED"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["recomputed"], "ELIMINATED")

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_confirmed_record())
        self.assertEqual(gate["evidence"][0], {"evidence_count": 2, "hypothesis_status": "CONFIRMED"})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _confirmed_record()
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
