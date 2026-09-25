"""Mutation-style tests for ``stakeholders.zopa`` (F07 stakeholder/power/negotiation family, OPENING member).

One real invariant beyond id/version/provenance shape (zopa_exists/zopa_range are decisively derived from
seller_minimum/buyer_maximum, never independently authored), exercised at BOTH layers: construction-time
refusal of malformed numeric inputs (``generate_zopa_analysis`` raising a specific ``InvariantViolation``
code) and independent gate re-derivation (``evaluate_zopa_content_integrity_gate`` catching a hand-tampered
raw dict that bypassed the builder entirely, never calling the builder itself). Schema conformance is checked
against the real spec-root schema this same slice added (``typed-objects/zopa.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.stakeholders.zopa import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_zopa_content_integrity_gate,
    evaluate_zopa_gates,
    generate_zopa_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

ZOPA_SCHEMA = "ai-lego://specs/cognitive/typed-objects/zopa.schema.yaml"
PROVENANCE = make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        seller_minimum=80000,
        buyer_maximum=95000,
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_statement(*, record_id: str = "ZOPA-T-001", **overrides: object):
    return generate_zopa_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_overlap_statement_validates_against_the_real_schema(self):
        self.contracts.validate(ZOPA_SCHEMA, _valid_statement(), "zopa analysis (overlap)")

    def test_valid_no_overlap_statement_validates_against_the_real_schema(self):
        statement = _valid_statement(seller_minimum=100000, buyer_maximum=90000)
        self.contracts.validate(ZOPA_SCHEMA, statement, "zopa analysis (no overlap)")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, statement = live.invoke(METHOD_ID, generate_zopa_analysis, "ZOPA-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/stakeholders.zopa.contract.yaml")
        self.assertEqual(statement["id"], "ZOPA-T-INVOKE")

    def test_empty_catalog_blocks_zopa_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_statement())
        tampered["zopa_range"] = "not-an-array"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ZOPA_SCHEMA, tampered, "tampered statement")
        gate = evaluate_zopa_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        statement = _valid_statement()
        statement["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ZOPA_SCHEMA, statement, "statement with a smuggled top-level key")

    def test_schema_rejects_missing_zopa_range(self):
        statement = _valid_statement()
        del statement["zopa_range"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ZOPA_SCHEMA, statement, "statement with zopa_range removed")

    def test_id_is_distinct_from_a_sibling_f07_machine_id(self):
        self.assertEqual(METHOD_ID, "stakeholders.zopa")
        self.assertNotEqual(METHOD_ID, "stakeholders.batna")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "stakeholders.zopa.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "stakeholders.zopa contract")


class NumericInputValidityTests(unittest.TestCase):
    """seller_minimum/buyer_maximum must each be a finite real number, never caller-supplied garbage."""

    def test_well_formed_inputs_are_accepted(self):
        statement = _valid_statement()
        self.assertEqual(statement["seller_minimum"], 80000)
        self.assertEqual(statement["buyer_maximum"], 95000)

    def test_non_numeric_seller_minimum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_SELLER_MINIMUM"):
            _valid_statement(seller_minimum="not-a-number")

    def test_none_seller_minimum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_SELLER_MINIMUM"):
            _valid_statement(seller_minimum=None)

    def test_nan_seller_minimum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_SELLER_MINIMUM"):
            _valid_statement(seller_minimum=float("nan"))

    def test_infinite_seller_minimum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_SELLER_MINIMUM"):
            _valid_statement(seller_minimum=float("inf"))

    def test_bool_seller_minimum_is_refused(self):
        """Python's bool is an int subclass -- True/False must NOT silently pass as 1/0."""
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_SELLER_MINIMUM"):
            _valid_statement(seller_minimum=True)

    def test_non_numeric_buyer_maximum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_BUYER_MAXIMUM"):
            _valid_statement(buyer_maximum="not-a-number")

    def test_none_buyer_maximum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_BUYER_MAXIMUM"):
            _valid_statement(buyer_maximum=None)

    def test_bool_buyer_maximum_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_BUYER_MAXIMUM"):
            _valid_statement(buyer_maximum=False)

    def test_float_inputs_are_accepted(self):
        statement = _valid_statement(seller_minimum=79999.5, buyer_maximum=95000.25)
        self.assertEqual(statement["seller_minimum"], 79999.5)
        self.assertEqual(statement["buyer_maximum"], 95000.25)


class ComputedZopaExistsTests(unittest.TestCase):
    """Real invariant, component (a): zopa_exists is decisively derived, never caller-supplied."""

    def test_generate_zopa_analysis_has_no_zopa_exists_parameter(self):
        import inspect

        params = inspect.signature(generate_zopa_analysis).parameters
        self.assertNotIn("zopa_exists", params)

    def test_overlapping_points_compute_zopa_exists_true(self):
        statement = _valid_statement(seller_minimum=80000, buyer_maximum=95000)
        self.assertTrue(statement["zopa_exists"])

    def test_non_overlapping_points_compute_zopa_exists_false(self):
        statement = _valid_statement(seller_minimum=100000, buyer_maximum=90000)
        self.assertFalse(statement["zopa_exists"])

    def test_equal_reservation_points_compute_zopa_exists_true(self):
        """seller_minimum == buyer_maximum is a boundary overlap (<=, not <) -- a single-point ZOPA."""
        statement = _valid_statement(seller_minimum=50000, buyer_maximum=50000)
        self.assertTrue(statement["zopa_exists"])
        self.assertEqual(statement["zopa_range"], [50000, 50000])


class ComputedZopaRangeTests(unittest.TestCase):
    """Real invariant, component (b): zopa_range is exactly [seller_minimum, buyer_maximum] when zopa_exists,
    else null -- never independently authored numbers."""

    def test_overlap_range_is_exactly_the_two_reservation_points(self):
        statement = _valid_statement(seller_minimum=80000, buyer_maximum=95000)
        self.assertEqual(statement["zopa_range"], [80000, 95000])

    def test_no_overlap_range_is_null(self):
        statement = _valid_statement(seller_minimum=100000, buyer_maximum=90000)
        self.assertIsNone(statement["zopa_range"])

    def test_generate_zopa_analysis_has_no_zopa_range_parameter(self):
        import inspect

        params = inspect.signature(generate_zopa_analysis).parameters
        self.assertNotIn("zopa_range", params)


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ZOPA-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_ID"):
            _valid_statement(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_ID"):
            _valid_statement(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_VERSION"):
            generate_zopa_analysis("ZOPA-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ZOPA_INVALID_PROVENANCE"):
            _valid_statement(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID statement's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_statement(self):
        results = evaluate_zopa_gates(_valid_statement(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_zopa_exists_flipped_false(self):
        record = copy.deepcopy(_valid_statement(seller_minimum=80000, buyer_maximum=95000))
        record["zopa_exists"] = False  # was computed True
        gate = evaluate_zopa_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_zopa_exists_flipped_true(self):
        record = copy.deepcopy(_valid_statement(seller_minimum=100000, buyer_maximum=90000))
        record["zopa_exists"] = True  # was computed False
        gate = evaluate_zopa_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_zopa_range_wrong_numbers(self):
        record = copy.deepcopy(_valid_statement(seller_minimum=80000, buyer_maximum=95000))
        record["zopa_range"] = [1, 2]  # was [80000, 95000]
        gate = evaluate_zopa_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_zopa_range_swapped_order(self):
        record = copy.deepcopy(_valid_statement(seller_minimum=80000, buyer_maximum=95000))
        record["zopa_range"] = [95000, 80000]  # swapped -- still wrong even though same two numbers
        gate = evaluate_zopa_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_non_null_range_on_no_overlap_record(self):
        record = copy.deepcopy(_valid_statement(seller_minimum=100000, buyer_maximum=90000))
        record["zopa_range"] = [90000, 100000]  # should be null -- no overlap
        gate = evaluate_zopa_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_bool_inside_range(self):
        """A bool smuggled inside zopa_range must not be silently accepted as numerically-equal-to-1/0 via
        Python's bool<int subclass relationship -- seller_minimum=1/buyer_maximum=1 is a genuine overlap
        (zopa_exists stays correctly True), only zopa_range's own element types are tampered."""
        record = copy.deepcopy(_valid_statement(seller_minimum=1, buyer_maximum=1))
        record["zopa_range"] = [True, True]  # True == 1 numerically, but must still be refused as a bool
        gate = evaluate_zopa_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_zopa_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_statement())
        record["id"] = "WRONG-001"
        gate = evaluate_zopa_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_statement())
        record["version"] = 1
        gate = evaluate_zopa_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_seller_minimum(self):
        record = copy.deepcopy(_valid_statement())
        record["seller_minimum"] = "not-a-number"
        gate = evaluate_zopa_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_statement(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_statement())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_zopa_gates_returns_two_gates_in_order(self):
        results = evaluate_zopa_gates(_valid_statement(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "zopa_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "stakeholders.zopa")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        statement = _valid_statement()
        self.assertEqual(
            set(statement.keys()),
            {"id", "version", "generated_by_method", "seller_minimum", "buyer_maximum", "zopa_exists", "zopa_range", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
