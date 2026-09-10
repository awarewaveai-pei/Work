"""Mutation-style tests for ``association.morphological_analysis`` (F04 association family, Atlas F04 table
row L414 + §11.11 L1436-1460).

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_morphological_analysis_record`` raising a specific ``InvariantViolation`` code) and independent
gate re-derivation (``evaluate_morphological_analysis_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely, never calling the builder itself). Schema conformance is checked against the
real spec-root schema this same slice added
(``typed-objects/morphological-analysis-record.schema.yaml``), including an ``additionalProperties: false``
top-level rejection check. ``CombinationGenerationComputeTests`` tests the pure GENUINE_COMPUTE function
directly with hand-computed expected values, independent of the module's own validation layer -- same split
``test_attack_tree.py``'s own ``AggregateComputeTests`` already establishes for its own compute submodule.
"""

from __future__ import annotations

import copy
import unittest
from unittest.mock import patch

from ai_lego import resolve_spec_root
from ai_lego.compute.morphological_analysis.combination_generation import generate_legal_combinations
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.association.morphological_analysis import (
    MAX_RAW_COMBINATION_SPACE,
    METHOD_ID,
    MIN_DIMENSIONS,
    MIN_OPTIONS_PER_DIMENSION,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_morphological_analysis_gates,
    evaluate_morphological_analysis_integrity_gate,
    evaluate_provenance_required_gate,
    generate_morphological_analysis_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

MORPHANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/morphological-analysis-record.schema.yaml"

_DEPLOYMENT_AI_DIMENSIONS = [
    {"name": "Deployment", "options": ["Cloud", "Local"]},
    {"name": "AI", "options": ["Bundled", "BYOAI"]},
]
_DEPLOYMENT_AI_ONE_CONSTRAINT = [{"dimension_a": "Deployment", "option_a": "Local", "dimension_b": "AI", "option_b": "Bundled"}]
_DEPLOYMENT_AI_ALL_CONSTRAINTS = [
    {"dimension_a": "Deployment", "option_a": "Cloud", "dimension_b": "AI", "option_b": "Bundled"},
    {"dimension_a": "Deployment", "option_a": "Cloud", "dimension_b": "AI", "option_b": "BYOAI"},
    {"dimension_a": "Deployment", "option_a": "Local", "dimension_b": "AI", "option_b": "Bundled"},
    {"dimension_a": "Deployment", "option_a": "Local", "dimension_b": "AI", "option_b": "BYOAI"},
]


def _dims(*pairs: tuple[str, list[str]]) -> list[dict]:
    return [{"name": name, "options": options} for name, options in pairs]


def _valid_record(*, dimensions=None, constraints=None, record_id: str = "MORPHANALYSIS-T-001", subject: str = "test subject", informs_mcda_ref=None):
    return generate_morphological_analysis_record(
        record_id,
        subject,
        dimensions if dimensions is not None else _DEPLOYMENT_AI_DIMENSIONS,
        constraints if constraints is not None else [],
        make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"),
        informs_mcda_ref=informs_mcda_ref,
    )


class RecordConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(MORPHANALYSIS_SCHEMA, _valid_record(), "morphological analysis record")

    def test_valid_record_with_informs_mcda_ref_validates(self):
        record = _valid_record(informs_mcda_ref="MCDA-2026-09-10-001")
        self.contracts.validate(MORPHANALYSIS_SCHEMA, record, "morphological analysis record with forward link")
        self.assertEqual(record["informs_mcda_ref"], "MCDA-2026-09-10-001")

    def test_record_with_one_constraint_validates_and_has_three_legal_combinations(self):
        record = _valid_record(constraints=_DEPLOYMENT_AI_ONE_CONSTRAINT)
        self.contracts.validate(MORPHANALYSIS_SCHEMA, record, "morphological analysis record, 3 legal")
        self.assertEqual(record["legal_combination_count"], 3)

    def test_record_with_all_constraints_validates_and_has_zero_legal_combinations(self):
        """Zero legal combinations is a real, meaningful record state -- not refused, still schema-valid."""
        record = _valid_record(constraints=_DEPLOYMENT_AI_ALL_CONSTRAINTS)
        self.contracts.validate(MORPHANALYSIS_SCHEMA, record, "morphological analysis record, zero legal")
        self.assertEqual(record["legal_combinations"], [])
        self.assertEqual(record["legal_combination_count"], 0)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_morphological_analysis_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_record_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_INVALID_VERSION"):
            generate_morphological_analysis_record("MORPHANALYSIS-T-002", "subject", _DEPLOYMENT_AI_DIMENSIONS, [], make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"), version=1)

    def test_empty_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_EMPTY_SUBJECT"):
            _valid_record(subject="   ")

    def test_invalid_informs_mcda_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_INVALID_INFORMS_MCDA_REF"):
            _valid_record(informs_mcda_ref="   ")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: a dimension hand-tampered down to a single option fails BOTH the runtime gate
        (MORPHANALYSIS_DIMENSION_TOO_FEW_OPTIONS class) and the real JSON schema's own minItems:2 on
        options independently."""
        tampered = copy.deepcopy(_valid_record())
        tampered["dimensions"][0]["options"] = ["Cloud"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MORPHANALYSIS_SCHEMA, tampered, "tampered record")
        gate = evaluate_morphological_analysis_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_unknown_top_level_key(self):
        record = _valid_record()
        record["unexpected_top_level_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MORPHANALYSIS_SCHEMA, record, "record with unknown top-level key")

    def test_schema_rejects_unknown_dimension_entry_key(self):
        record = _valid_record()
        record["dimensions"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MORPHANALYSIS_SCHEMA, record, "record with unknown dimension key")

    def test_schema_rejects_dimension_with_one_option(self):
        record = _valid_record()
        record["dimensions"][0]["options"] = ["OnlyOne"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MORPHANALYSIS_SCHEMA, record, "record with a 1-option dimension")


class DimensionShapeTests(unittest.TestCase):
    def test_single_dimension_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_TOO_FEW_DIMENSIONS"):
            _valid_record(dimensions=_DEPLOYMENT_AI_DIMENSIONS[:1])

    def test_zero_dimensions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_TOO_FEW_DIMENSIONS"):
            _valid_record(dimensions=[])

    def test_dimensions_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_TOO_FEW_DIMENSIONS"):
            _valid_record(dimensions="not-a-list")

    def test_dimension_missing_required_key_is_refused(self):
        dims = copy.deepcopy(_DEPLOYMENT_AI_DIMENSIONS)
        del dims[0]["options"]
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_INVALID_DIMENSION_SHAPE"):
            _valid_record(dimensions=dims)

    def test_dimension_unknown_extra_key_is_refused(self):
        dims = copy.deepcopy(_DEPLOYMENT_AI_DIMENSIONS)
        dims[0]["unexpected"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_INVALID_DIMENSION_SHAPE"):
            _valid_record(dimensions=dims)

    def test_dimension_name_not_a_string_is_refused(self):
        dims = copy.deepcopy(_DEPLOYMENT_AI_DIMENSIONS)
        dims[0]["name"] = 42
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_INVALID_DIMENSION_SHAPE"):
            _valid_record(dimensions=dims)

    def test_dimension_too_few_options_is_refused(self):
        dims = copy.deepcopy(_DEPLOYMENT_AI_DIMENSIONS)
        dims[0]["options"] = ["OnlyOne"]
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_DIMENSION_TOO_FEW_OPTIONS"):
            _valid_record(dimensions=dims)

    def test_dimension_duplicate_options_is_refused(self):
        dims = copy.deepcopy(_DEPLOYMENT_AI_DIMENSIONS)
        dims[0]["options"] = ["Cloud", "Cloud"]
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_DIMENSION_DUPLICATE_OPTIONS"):
            _valid_record(dimensions=dims)

    def test_duplicate_dimension_names_is_refused(self):
        dims = _dims(("Deployment", ["Cloud", "Local"]), ("Deployment", ["X", "Y"]))
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_DUPLICATE_DIMENSION_NAME"):
            _valid_record(dimensions=dims)


class ConstraintShapeTests(unittest.TestCase):
    def test_empty_constraints_is_legal(self):
        record = _valid_record(constraints=[])
        self.assertEqual(record["legal_combination_count"], 4)

    def test_constraint_same_dimension_is_refused(self):
        bad = [{"dimension_a": "Deployment", "option_a": "Cloud", "dimension_b": "Deployment", "option_b": "Local"}]
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_CONSTRAINT_SAME_DIMENSION"):
            _valid_record(constraints=bad)

    def test_constraint_unknown_dimension_is_refused(self):
        bad = [{"dimension_a": "Deployment", "option_a": "Cloud", "dimension_b": "NoSuchDimension", "option_b": "X"}]
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_CONSTRAINT_UNKNOWN_DIMENSION"):
            _valid_record(constraints=bad)

    def test_constraint_unknown_option_is_refused(self):
        bad = [{"dimension_a": "Deployment", "option_a": "NoSuchOption", "dimension_b": "AI", "option_b": "Bundled"}]
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_CONSTRAINT_UNKNOWN_OPTION"):
            _valid_record(constraints=bad)

    def test_constraint_missing_required_key_is_refused(self):
        bad = [{"dimension_a": "Deployment", "option_a": "Cloud", "dimension_b": "AI"}]
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_INVALID_CONSTRAINT_SHAPE"):
            _valid_record(constraints=bad)

    def test_constraints_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_INVALID_CONSTRAINT_SHAPE"):
            _valid_record(constraints="not-a-list")


class CombinatorialSpaceCapTests(unittest.TestCase):
    """MAX_RAW_COMBINATION_SPACE is checked BEFORE any enumeration is attempted -- verified here with the
    real default (a genuinely oversized profile) and, for the exact-boundary case, a monkeypatched smaller
    cap so the test itself stays fast."""

    def test_real_default_cap_is_100000(self):
        self.assertEqual(MAX_RAW_COMBINATION_SPACE, 100_000)

    def test_oversized_profile_is_refused_under_the_real_default_cap(self):
        huge_dims = [{"name": f"Dim{i}", "options": [f"opt{j}" for j in range(10)]} for i in range(6)]  # 10^6 raw combinations
        with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_COMBINATION_SPACE_TOO_LARGE"):
            _valid_record(dimensions=huge_dims, constraints=[])

    def test_space_exactly_at_a_patched_cap_is_allowed(self):
        with patch("ai_lego.modules.association.morphological_analysis.MAX_RAW_COMBINATION_SPACE", 4):
            record = _valid_record(dimensions=_DEPLOYMENT_AI_DIMENSIONS, constraints=[])  # 2x2=4, exactly the patched cap
            self.assertEqual(record["legal_combination_count"], 4)

    def test_space_one_over_a_patched_cap_is_refused(self):
        with patch("ai_lego.modules.association.morphological_analysis.MAX_RAW_COMBINATION_SPACE", 3):
            with self.assertRaisesRegex(InvariantViolation, "MORPHANALYSIS_COMBINATION_SPACE_TOO_LARGE"):
                _valid_record(dimensions=_DEPLOYMENT_AI_DIMENSIONS, constraints=[])  # 2x2=4 > patched cap of 3


class CombinationGenerationComputeTests(unittest.TestCase):
    """Pure compute tests for generate_legal_combinations -- hand-computed expected values, independent of
    the module's own validation layer."""

    def test_two_by_two_no_constraints_yields_all_four_in_product_order(self):
        result = generate_legal_combinations(_DEPLOYMENT_AI_DIMENSIONS, [])
        self.assertEqual(
            result,
            [
                {"Deployment": "Cloud", "AI": "Bundled"},
                {"Deployment": "Cloud", "AI": "BYOAI"},
                {"Deployment": "Local", "AI": "Bundled"},
                {"Deployment": "Local", "AI": "BYOAI"},
            ],
        )

    def test_one_constraint_excludes_exactly_the_named_pair(self):
        result = generate_legal_combinations(_DEPLOYMENT_AI_DIMENSIONS, _DEPLOYMENT_AI_ONE_CONSTRAINT)
        self.assertEqual(
            result,
            [
                {"Deployment": "Cloud", "AI": "Bundled"},
                {"Deployment": "Cloud", "AI": "BYOAI"},
                {"Deployment": "Local", "AI": "BYOAI"},
            ],
        )
        self.assertNotIn({"Deployment": "Local", "AI": "Bundled"}, result)

    def test_all_constraints_together_yield_empty_list(self):
        result = generate_legal_combinations(_DEPLOYMENT_AI_DIMENSIONS, _DEPLOYMENT_AI_ALL_CONSTRAINTS)
        self.assertEqual(result, [])

    def test_no_duplicate_combinations_ever_produced(self):
        result = generate_legal_combinations(_DEPLOYMENT_AI_DIMENSIONS, [])
        seen = [tuple(sorted(combo.items())) for combo in result]
        self.assertEqual(len(seen), len(set(seen)))

    def test_three_dimension_batch_matches_the_slice_demo_expectation(self):
        """Cross-check against run_morphological_analysis_slice.py's own real self-referential profile."""
        dimensions = [
            {"name": "ComputeLocation", "options": ["Inline", "SeparateSubmodule"]},
            {"name": "ZeroLegalCombinationsPolicy", "options": ["Refuse", "AllowAsMeaningfulState"]},
            {"name": "ConstraintSemantics", "options": ["MutuallyExclusiveOnly", "RequiresImpliesToo"]},
        ]
        constraints = [{"dimension_a": "ComputeLocation", "option_a": "Inline", "dimension_b": "ConstraintSemantics", "option_b": "RequiresImpliesToo"}]
        result = generate_legal_combinations(dimensions, constraints)
        self.assertEqual(len(result), 6)
        real_choice = {"ComputeLocation": "SeparateSubmodule", "ZeroLegalCombinationsPolicy": "AllowAsMeaningfulState", "ConstraintSemantics": "MutuallyExclusiveOnly"}
        self.assertIn(real_choice, result)


class GenuineComputeRecordTests(unittest.TestCase):
    """GENUINE_COMPUTE: legal_combinations/legal_combination_count are derived, never caller-supplied,
    verified re-derivable through the public builder API."""

    def test_generate_record_accepts_no_legal_combinations_parameter(self):
        """The builder signature itself has no legal_combinations parameter -- there is no code path for a
        caller to inject a mismatched value at construction time."""
        import inspect

        sig = inspect.signature(generate_morphological_analysis_record)
        self.assertNotIn("legal_combinations", sig.parameters)
        self.assertNotIn("legal_combination_count", sig.parameters)

    def test_legal_combination_count_always_equals_list_length(self):
        for constraints in ([], _DEPLOYMENT_AI_ONE_CONSTRAINT, _DEPLOYMENT_AI_ALL_CONSTRAINTS):
            with self.subTest(constraints=constraints):
                record = _valid_record(constraints=constraints)
                self.assertEqual(record["legal_combination_count"], len(record["legal_combinations"]))


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_record(constraints=_DEPLOYMENT_AI_ONE_CONSTRAINT)
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_legal_combinations_claiming_more_than_reality(self):
        record = copy.deepcopy(_valid_record(constraints=_DEPLOYMENT_AI_ONE_CONSTRAINT))
        record["legal_combinations"].append({"Deployment": "Local", "AI": "Bundled"})  # lies -- this pair is excluded by the constraint
        record["legal_combination_count"] = 4
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "MORPHANALYSIS_LEGAL_COMBINATIONS_MISMATCH")

    def test_gate_catches_hand_tampered_legal_combinations_claiming_fewer_than_reality(self):
        record = copy.deepcopy(_valid_record(constraints=[]))
        record["legal_combinations"] = record["legal_combinations"][:2]  # lies -- drops 2 real legal combinations
        record["legal_combination_count"] = 2
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "MORPHANALYSIS_LEGAL_COMBINATIONS_MISMATCH")

    def test_gate_catches_hand_tampered_legal_combinations_wrong_order(self):
        record = copy.deepcopy(_valid_record(constraints=[]))
        record["legal_combinations"] = list(reversed(record["legal_combinations"]))
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_count_mismatch_with_correct_list(self):
        record = copy.deepcopy(_valid_record(constraints=[]))
        record["legal_combination_count"] = 999
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "MORPHANALYSIS_LEGAL_COMBINATION_COUNT_MISMATCH")

    def test_gate_catches_hand_tampered_duplicate_dimension_name(self):
        record = copy.deepcopy(_valid_record())
        record["dimensions"][1]["name"] = record["dimensions"][0]["name"]
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_constraint_unknown_dimension(self):
        record = copy.deepcopy(_valid_record())
        record["constraints"] = [{"dimension_a": "Deployment", "option_a": "Cloud", "dimension_b": "NoSuchDimension", "option_b": "X"}]
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_morphological_analysis_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_subject(self):
        record = copy.deepcopy(_valid_record())
        record["subject"] = ""
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_blank_informs_mcda_ref(self):
        record = copy.deepcopy(_valid_record())
        record["informs_mcda_ref"] = "   "
        gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_a_record_whose_own_dimensions_exceed_a_patched_cap(self):
        record = copy.deepcopy(_valid_record())
        with patch("ai_lego.modules.association.morphological_analysis.MAX_RAW_COMBINATION_SPACE", 3):
            gate = evaluate_morphological_analysis_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
            self.assertEqual(gate["status"], "FAIL")
            self.assertIn("exceeds MAX_RAW_COMBINATION_SPACE", gate["evidence"][0]["reason"])


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        results = [{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        results = [{"status": "PASS"}, {"status": "FAIL"}]
        self.assertFalse(all_gates_pass(results))

    def test_evaluate_morphological_analysis_gates_returns_two_gates_in_order(self):
        results = evaluate_morphological_analysis_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "morphological_analysis_integrity"])

    def test_evaluate_morphological_analysis_gates_all_pass_on_a_valid_record(self):
        results = evaluate_morphological_analysis_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "MORPHANALYSIS-")

    def test_min_dimensions_and_min_options_constants(self):
        self.assertEqual(MIN_DIMENSIONS, 2)
        self.assertEqual(MIN_OPTIONS_PER_DIMENSION, 2)

    def test_method_id_constant_is_schema_pattern_valid(self):
        import re

        self.assertEqual(METHOD_ID, "association.morphological_analysis")
        self.assertIsNotNone(re.fullmatch(r"[a-z_]+\.[a-z_]+", METHOD_ID))


if __name__ == "__main__":
    unittest.main()
