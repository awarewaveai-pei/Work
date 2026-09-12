"""Mutation-style tests for ``jurisdiction.resolver`` (F23 jurisdiction family, Atlas L935, §11.53).

Atlas §11.53's own "not country == XX" purpose is proven at BOTH independent
layers: the construction-time builder refuses a resolution collapsed onto a
single declared dimension (when 2+ were declared), a dangling dimension
reference, and malformed entries, and the independent gates re-derive the
same rules directly from a raw (possibly hand-tampered) dict, never trusting
that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.jurisdiction.resolver import (
    DIMENSIONS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_dimension_coverage_gate,
    evaluate_jurisdiction_resolution_gates,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    generate_jurisdiction_resolution,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

JURISDICTION_RESOLUTION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/jurisdiction-resolution-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        declared_dimensions=[
            {"dimension": "USER_LOCATION", "value": "DE"},
            {"dimension": "DATA_SUBJECT_LOCATION", "value": "FR"},
            {"dimension": "PROCESSING_LOCATION", "value": "US"},
        ],
        resolved_jurisdictions=[
            {"jurisdiction_id": "EU-GDPR", "derived_from_dimensions": ["USER_LOCATION", "DATA_SUBJECT_LOCATION"], "basis": "Users and data subjects both in EU"},
            {"jurisdiction_id": "US-Federal", "derived_from_dimensions": ["PROCESSING_LOCATION"], "basis": "Processing occurs on US soil"},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_resolution(*, record_id: str = "JRES-T-001", **overrides: object):
    return generate_jurisdiction_resolution(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_resolution_validates_against_the_real_schema(self):
        self.contracts.validate(JURISDICTION_RESOLUTION_SCHEMA, _valid_resolution(), "jurisdiction resolution")

    def test_one_dimension_one_jurisdiction_is_a_valid_minimal_resolution(self):
        record = generate_jurisdiction_resolution(
            "JRES-T-002",
            declared_dimensions=[{"dimension": "MARKET", "value": "JP"}],
            resolved_jurisdictions=[{"jurisdiction_id": "JP-National", "derived_from_dimensions": ["MARKET"], "basis": "Sole declared dimension"}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(JURISDICTION_RESOLUTION_SCHEMA, record, "minimal single-dimension resolution")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_jurisdiction_resolution, "JRES-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/jurisdiction.resolver.contract.yaml")
        self.assertEqual(record["id"], "JRES-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_resolution()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(JURISDICTION_RESOLUTION_SCHEMA, record, "resolution with a smuggled top-level key")

    def test_schema_rejects_an_unknown_dimension_value(self):
        record = _valid_resolution()
        record["declared_dimensions"][0]["dimension"] = "PLANET_OF_ORIGIN"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(JURISDICTION_RESOLUTION_SCHEMA, record, "resolution with an invalid dimension enum value")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "jurisdiction.resolver.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "jurisdiction.resolver contract")


class DimensionCountTests(unittest.TestCase):
    def test_zero_dimensions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JRES_TOO_FEW_DIMENSIONS"):
            generate_jurisdiction_resolution("JRES-T-003", declared_dimensions=[], resolved_jurisdictions=[], provenance=PROVENANCE)

    def test_zero_resolved_jurisdictions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JRES_TOO_FEW_JURISDICTIONS"):
            generate_jurisdiction_resolution(
                "JRES-T-004",
                declared_dimensions=[{"dimension": "MARKET", "value": "JP"}],
                resolved_jurisdictions=[],
                provenance=PROVENANCE,
            )

    def test_duplicate_dimension_is_refused(self):
        kwargs = _kwargs()
        kwargs["declared_dimensions"].append({"dimension": "USER_LOCATION", "value": "IT"})
        with self.assertRaisesRegex(InvariantViolation, "JRES_DUPLICATE_DIMENSION"):
            generate_jurisdiction_resolution("JRES-T-005", **kwargs)


class ReferentialIntegrityTests(unittest.TestCase):
    def test_dangling_dimension_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["resolved_jurisdictions"][0]["derived_from_dimensions"] = ["SECTOR"]
        with self.assertRaisesRegex(InvariantViolation, "JRES_DANGLING_DIMENSION_REF"):
            generate_jurisdiction_resolution("JRES-T-006", **kwargs)


class DimensionCoverageTests(unittest.TestCase):
    """Atlas §11.53's own 'not country == XX' purpose -- >=2 declared dimensions must jointly cover >=2 of
    them across the whole resolution."""

    def test_collapsed_to_single_dimension_is_refused_when_multiple_declared(self):
        kwargs = _kwargs()
        kwargs["resolved_jurisdictions"] = [{"jurisdiction_id": "EU-GDPR", "derived_from_dimensions": ["USER_LOCATION"], "basis": "Collapsed"}]
        with self.assertRaisesRegex(InvariantViolation, "JRES_INSUFFICIENT_DIMENSION_COVERAGE"):
            generate_jurisdiction_resolution("JRES-T-007", **kwargs)

    def test_single_declared_dimension_needs_no_coverage_check(self):
        record = generate_jurisdiction_resolution(
            "JRES-T-008",
            declared_dimensions=[{"dimension": "MARKET", "value": "JP"}],
            resolved_jurisdictions=[{"jurisdiction_id": "JP-National", "derived_from_dimensions": ["MARKET"], "basis": "Sole dimension"}],
            provenance=PROVENANCE,
        )
        self.assertEqual(len(record["declared_dimensions"]), 1)

    def test_two_dimensions_split_across_two_jurisdictions_is_accepted(self):
        record = _valid_resolution()
        distinct_used = {d for j in record["resolved_jurisdictions"] for d in j["derived_from_dimensions"]}
        self.assertGreaterEqual(len(distinct_used), 2)

    def test_a_single_jurisdiction_citing_both_dimensions_satisfies_coverage(self):
        record = generate_jurisdiction_resolution(
            "JRES-T-009",
            declared_dimensions=[{"dimension": "USER_LOCATION", "value": "DE"}, {"dimension": "SECTOR", "value": "finance"}],
            resolved_jurisdictions=[{"jurisdiction_id": "DE-BaFin", "derived_from_dimensions": ["USER_LOCATION", "SECTOR"], "basis": "German financial sector regulation"}],
            provenance=PROVENANCE,
        )
        self.assertEqual(len(record["resolved_jurisdictions"]), 1)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        record = generate_jurisdiction_resolution("JRES-T-010", **kwargs)
        kwargs["resolved_jurisdictions"][0]["derived_from_dimensions"].append("SECTOR")
        self.assertEqual(record["resolved_jurisdictions"][0]["derived_from_dimensions"], ["USER_LOCATION", "DATA_SUBJECT_LOCATION"])
        self.assertIsNot(record["resolved_jurisdictions"], kwargs["resolved_jurisdictions"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_resolution(self):
        results = evaluate_jurisdiction_resolution_gates(_valid_resolution(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_referential_integrity_gate_catches_hand_tampered_dangling_ref(self):
        record = copy.deepcopy(_valid_resolution())
        record["resolved_jurisdictions"][0]["derived_from_dimensions"] = ["SECTOR"]
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_too_few_dimensions(self):
        record = copy.deepcopy(_valid_resolution())
        record["declared_dimensions"] = []
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_dimension_coverage_gate_catches_hand_tampered_collapse(self):
        record = copy.deepcopy(_valid_resolution())
        for j in record["resolved_jurisdictions"]:
            j["derived_from_dimensions"] = ["USER_LOCATION"]
        gate = evaluate_dimension_coverage_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_dimension_coverage_gate_passes_a_genuinely_covering_resolution(self):
        gate = evaluate_dimension_coverage_gate(_valid_resolution(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_jurisdiction_resolution_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_resolution(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_resolution())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "JRES-")

    def test_dimensions_constant_has_11_members(self):
        self.assertEqual(len(DIMENSIONS), 11)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JRES_INVALID_ID"):
            _valid_resolution(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JRES_INVALID_VERSION"):
            generate_jurisdiction_resolution("JRES-T-011", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JRES_INVALID_PROVENANCE"):
            _valid_resolution(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "jurisdiction.resolver")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_jurisdiction_resolution_gates(_valid_resolution(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "referential_integrity", "dimension_coverage"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_resolution()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "declared_dimensions", "resolved_jurisdictions", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Recurring bug class across F10/F13/F15/F22: builders returning the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy, so mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too. Fixed by ``copy.deepcopy``ing provenance at the
    return statement; this test proves the fix and guards against a 5th recurrence."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_resolution()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_jurisdiction_resolution(base["id"], base["declared_dimensions"], base["resolved_jurisdictions"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
