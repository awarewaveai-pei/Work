"""Mutation-style tests for ``foresight.outlier_analysis`` (F13 foresight family, Atlas L678).

Atlas L678's own "identify→排除資料錯誤→深挖機制" ordering is proven at BOTH
independent layers: the construction-time builder refuses a
``mechanism_hypothesis`` attached before ``data_error_ruled_out`` is
exactly ``True`` (a real bool, int 0/1 refused), and the independent gates
re-derive the same rule directly from a raw (possibly hand-tampered) dict.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.outlier_analysis import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_data_error_ordering_gate,
    evaluate_no_duplicate_id_gate,
    evaluate_outlier_analysis_gates,
    evaluate_provenance_required_gate,
    generate_outlier_analysis_record,
    outlier,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

OUTLIER_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/outlier-analysis.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _outlier(**overrides: object) -> dict:
    base = {
        "id": "OUT-1",
        "description": "單一經銷商的月訂購量是同區其他經銷商的 8 倍",
        "data_error_ruled_out": True,
        "data_error_assessment": "已核對原始出貨單與 ERP 紀錄，數字一致",
        "mechanism_hypothesis": "該經銷商同時服務一個新開的跨境電商客戶",
    }
    base.update(overrides)
    return base


def _outlier_without(*keys: str) -> dict:
    o = _outlier()
    for key in keys:
        o.pop(key, None)
    return o


def _kwargs(**overrides: object) -> dict:
    base = dict(outliers=[_outlier()], provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "OUTLIER-T-001", **overrides: object):
    return generate_outlier_analysis_record(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(OUTLIER_ANALYSIS_SCHEMA, _valid_record(), "outlier analysis record")

    def test_record_without_mechanism_hypothesis_is_legal(self):
        """A dimension may legitimately be examined and data error NOT yet ruled out -- no mechanism required."""
        record = _valid_record(outliers=[_outlier_without("mechanism_hypothesis")])
        self.contracts.validate(OUTLIER_ANALYSIS_SCHEMA, record, "outlier analysis record without mechanism_hypothesis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_outlier_analysis_record, "OUTLIER-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.outlier_analysis.contract.yaml")
        self.assertEqual(record["id"], "OUTLIER-T-INVOKE")

    def test_empty_catalog_blocks_outlier_analysis_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OUTLIER_ANALYSIS_SCHEMA, record, "outlier analysis record with a smuggled top-level key")

    def test_schema_rejects_zero_outliers(self):
        record = _valid_record()
        record["outliers"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OUTLIER_ANALYSIS_SCHEMA, record, "outlier analysis record with zero outliers")

    def test_schema_rejects_data_error_ruled_out_as_int(self):
        """isinstance(True, int) is True but int 1/0 must NOT be accepted as a real bool -- JSON Schema's own
        `type: boolean` already refuses this at the schema layer."""
        record = _valid_record()
        record["outliers"][0]["data_error_ruled_out"] = 1
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OUTLIER_ANALYSIS_SCHEMA, record, "outlier analysis record with data_error_ruled_out as int 1")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.outlier_analysis.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.outlier_analysis contract")


class DataErrorOrderingTests(unittest.TestCase):
    """Atlas L678's own 'identify→排除資料錯誤→深挖機制' ordering: mechanism_hypothesis requires
    data_error_ruled_out is True AND a non-empty data_error_assessment."""

    def test_well_formed_record_is_accepted(self):
        record = _valid_record()
        self.assertEqual(record["outliers"][0]["mechanism_hypothesis"], "該經銷商同時服務一個新開的跨境電商客戶")

    def test_mechanism_hypothesis_with_ruled_out_false_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_INVALID_OUTLIER"):
            _valid_record(outliers=[_outlier(data_error_ruled_out=False)])

    def test_mechanism_hypothesis_with_ruled_out_as_int_one_is_refused(self):
        """bool/int confusion guard: isinstance(True, int) is True, but int 1 must be refused as a genuine bool."""
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_INVALID_OUTLIER"):
            _valid_record(outliers=[_outlier(data_error_ruled_out=1)])

    def test_mechanism_hypothesis_with_ruled_out_as_int_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_INVALID_OUTLIER"):
            _valid_record(outliers=[_outlier(data_error_ruled_out=0)])

    def test_ruled_out_true_without_mechanism_hypothesis_is_legal(self):
        record = _valid_record(outliers=[_outlier_without("mechanism_hypothesis")])
        self.assertNotIn("mechanism_hypothesis", record["outliers"][0])

    def test_ruled_out_false_without_mechanism_hypothesis_is_legal(self):
        not_yet_ruled_out = {**_outlier_without("mechanism_hypothesis"), "data_error_ruled_out": False}
        record = _valid_record(outliers=[not_yet_ruled_out])
        self.assertFalse(record["outliers"][0]["data_error_ruled_out"])

    def test_blank_mechanism_hypothesis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_INVALID_OUTLIER"):
            _valid_record(outliers=[_outlier(mechanism_hypothesis="   ")])

    def test_blank_data_error_assessment_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_INVALID_OUTLIER"):
            _valid_record(outliers=[_outlier(data_error_assessment="   ")])

    def test_non_bool_data_error_ruled_out_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_INVALID_OUTLIER"):
            outlier("OUT-1", "desc", "true", "assessment")

    def test_outlier_helper_constructs_without_mechanism(self):
        built = outlier("OUT-1", "desc", True, "assessment")
        self.assertNotIn("mechanism_hypothesis", built)

    def test_outlier_helper_constructs_with_mechanism(self):
        built = outlier("OUT-1", "desc", True, "assessment", "mechanism")
        self.assertEqual(built["mechanism_hypothesis"], "mechanism")

    def test_outlier_helper_refuses_premature_mechanism(self):
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_INVALID_OUTLIER"):
            outlier("OUT-1", "desc", False, "assessment", "mechanism")


class DuplicateIdTests(unittest.TestCase):
    def test_duplicate_outlier_id_is_refused(self):
        second = {**_outlier_without("mechanism_hypothesis"), "id": "OUT-1"}
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_DUPLICATE_ID"):
            _valid_record(outliers=[_outlier(id="OUT-1"), second])

    def test_zero_outliers_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_NO_OUTLIERS"):
            _valid_record(outliers=[])


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "OUTLIER-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_INVALID_VERSION"):
            generate_outlier_analysis_record("OUTLIER-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OUTLIER_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.outlier_analysis")

    def test_evaluate_outlier_analysis_gates_returns_three_gates_in_order(self):
        results = evaluate_outlier_analysis_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "data_error_ruled_out_before_mechanism", "no_duplicate_id"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "outliers", "provenance"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. Proves the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_outlier_analysis_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_ordering_gate_catches_hand_tampered_ruled_out_flipped_to_false(self):
        record = copy.deepcopy(_valid_record())
        record["outliers"][0]["data_error_ruled_out"] = False
        gate = evaluate_data_error_ordering_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_ordering_gate_catches_hand_tampered_int_instead_of_bool(self):
        record = copy.deepcopy(_valid_record())
        record["outliers"][0]["data_error_ruled_out"] = 1
        gate = evaluate_data_error_ordering_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_ordering_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_data_error_ordering_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_ordering_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_data_error_ordering_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_no_duplicate_id_gate_catches_hand_tampered_duplicate(self):
        record = copy.deepcopy(_valid_record())
        record["outliers"].append(dict(record["outliers"][0]))
        gate = evaluate_no_duplicate_id_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_no_duplicate_id_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_no_duplicate_id_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_no_duplicate_id_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_no_duplicate_id_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_outlier_analysis_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class DeepCopyTests(unittest.TestCase):
    """The builder deep-copies the rebuilt outliers list -- mutating the returned record's own dict must not
    affect a second call built from the same source data."""

    def test_mutating_the_returned_outlier_does_not_affect_a_fresh_build(self):
        record_1 = _valid_record()
        record_1["outliers"][0]["description"] = "MUTATED"
        record_2 = _valid_record()
        self.assertEqual(record_2["outliers"][0]["description"], "單一經銷商的月訂購量是同區其他經銷商的 8 倍")



class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of this batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_record()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_outlier_analysis_record(base["id"], base["outliers"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
