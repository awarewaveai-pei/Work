"""Mutation-style tests for ``root_cause.kepner_tregoe`` (F05 root_cause family, Atlas F05 table row L440).

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_kepner_tregoe_specification`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_kepner_tregoe_integrity_gate`` catching a hand-tampered raw dict
that bypassed the builder entirely, never calling the builder itself).
Schema conformance is checked against the real spec-root schema this same
slice added (``typed-objects/kepner-tregoe-problem-specification.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.root_cause.fishbone import build_problem_statement
from ai_lego.modules.root_cause.kepner_tregoe import (
    DIMENSION_ORDER,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    change_entry,
    dimension_entry,
    distinction_entry,
    evaluate_evidence_labeling_required_gate,
    evaluate_kepner_tregoe_gates,
    evaluate_kepner_tregoe_integrity_gate,
    evaluate_provenance_required_gate,
    generate_kepner_tregoe_specification,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

KTPS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/kepner-tregoe-problem-specification.schema.yaml"


def _problem_statement(status: str = "validated"):
    return build_problem_statement("PROB-T-KT-001", {"current_state": "x", "expected_state": "y", "gap": "z"}, make_provenance("EVIDENCE", "HUMAN_APPROVED"), status=status)


def _dim(dimension: str, is_: str, is_not: str | None = "default is_not", refs: list[str] | None = ("E-1",)) -> dict:
    return dimension_entry(dimension, is_, make_provenance("EVIDENCE", "HUMAN_APPROVED"), is_not=is_not, supporting_evidence_refs=list(refs) if refs else None)


def _valid_dimensions() -> list[dict]:
    return [
        _dim("WHAT", "script times out on the remote host", "node-gates script does not time out"),
        _dim("WHERE", "remote SSH session on ks-aw-01", "local laptop execution"),
        _dim("WHEN", "after the script grew from 19925 to 81481 bytes", "before that growth, no timeout"),
        _dim("EXTENT", "3 consecutive remote timeouts", "0 timeouts locally"),
    ]


def _valid_spec(*, distinctions=None, changes=None, dimensions=None, problem_statement=None, spec_id: str = "KTPS-T-001"):
    return generate_kepner_tregoe_specification(
        spec_id,
        problem_statement or _problem_statement(),
        dimensions if dimensions is not None else _valid_dimensions(),
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        distinctions=distinctions,
        changes=changes,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_specification_validates_against_the_real_schema(self):
        self.contracts.validate(KTPS_SCHEMA, _valid_spec(), "kepner-tregoe specification")

    def test_valid_specification_with_distinctions_and_changes_validates(self):
        distinctions = [distinction_entry("DIST-001", "WHEN", "timeout only after growth", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        changes = [change_entry("CHG-001", "DIST-001", "many more SQL mutation cases added", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        spec = _valid_spec(distinctions=distinctions, changes=changes)
        self.contracts.validate(KTPS_SCHEMA, spec, "kepner-tregoe specification with distinctions/changes")
        self.assertEqual(len(spec["distinctions"]), 1)
        self.assertEqual(len(spec["changes"]), 1)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_kepner_tregoe_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_problem_statement_not_validated_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_PRECONDITION_FAILED"):
            _valid_spec(problem_statement=_problem_statement(status="draft"))

    def test_invalid_spec_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_ID"):
            _valid_spec(spec_id="WRONG-PREFIX-001")

    def test_invalid_spec_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_ID"):
            _valid_spec(spec_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_VERSION"):
            generate_kepner_tregoe_specification("KTPS-T-002", _problem_statement(), _valid_dimensions(), make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_spec())
        tampered["dimensions"][0]["is"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(KTPS_SCHEMA, tampered, "tampered specification")
        gate = evaluate_kepner_tregoe_integrity_gate(tampered, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class DimensionShapeTests(unittest.TestCase):
    def test_dimensions_wrong_count_too_few_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DIMENSION_SET"):
            _valid_spec(dimensions=_valid_dimensions()[:3])

    def test_dimensions_wrong_count_too_many_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DIMENSION_SET"):
            _valid_spec(dimensions=_valid_dimensions() + [_dim("WHAT", "extra")])

    def test_dimensions_wrong_order_is_refused(self):
        dims = _valid_dimensions()
        dims[0], dims[1] = dims[1], dims[0]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DIMENSION_SET"):
            _valid_spec(dimensions=dims)

    def test_dimensions_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DIMENSION_SET"):
            _valid_spec(dimensions="not-a-list")

    def test_dimension_entry_missing_required_key_is_refused(self):
        dims = _valid_dimensions()
        del dims[0]["provenance"]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DIMENSION_SET"):
            _valid_spec(dimensions=dims)

    def test_dimension_entry_unknown_extra_key_is_refused(self):
        dims = _valid_dimensions()
        dims[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DIMENSION_SET"):
            _valid_spec(dimensions=dims)

    def test_dimension_entry_wrong_dimension_name_is_refused(self):
        dims = _valid_dimensions()
        dims[0]["dimension"] = "IDENTITY"
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DIMENSION_SET"):
            _valid_spec(dimensions=dims)

    def test_is_only_whitespace_is_treated_as_empty_and_refused(self):
        dims = _valid_dimensions()
        dims[0]["is"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_EMPTY_IS"):
            _valid_spec(dimensions=dims)

    def test_is_not_explicit_empty_string_is_refused(self):
        """An explicit blank is_not is malformed, not the same as omitting the field entirely."""
        dims = _valid_dimensions()
        dims[0]["is_not"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DIMENSION_SET"):
            _valid_spec(dimensions=dims)

    def test_is_not_absent_is_legal_at_construction(self):
        dims = _valid_dimensions()
        del dims[0]["is_not"]
        spec = _valid_spec(dimensions=dims)
        self.assertNotIn("is_not", spec["dimensions"][0])

    def test_is_not_genuinely_different_is_accepted(self):
        spec = _valid_spec()
        self.assertNotEqual(spec["dimensions"][0]["is"], spec["dimensions"][0]["is_not"])


class EmptyIsPerDimensionTests(unittest.TestCase):
    """Every one of the 4 dimensions must independently enforce the non-empty-IS invariant."""

    def _assert_empty_is_refused(self, position: int):
        dims = _valid_dimensions()
        dims[position]["is"] = ""
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_EMPTY_IS"):
            _valid_spec(dimensions=dims)

    def test_empty_is_on_what_is_refused(self):
        self._assert_empty_is_refused(0)

    def test_empty_is_on_where_is_refused(self):
        self._assert_empty_is_refused(1)

    def test_empty_is_on_when_is_refused(self):
        self._assert_empty_is_refused(2)

    def test_empty_is_on_extent_is_refused(self):
        self._assert_empty_is_refused(3)


class IsEqualsIsNotPerDimensionTests(unittest.TestCase):
    """Every one of the 4 dimensions must independently enforce the IS != IS-NOT invariant."""

    def _assert_identical_pair_refused(self, position: int, is_value: str, is_not_value: str):
        dims = _valid_dimensions()
        dims[position]["is"] = is_value
        dims[position]["is_not"] = is_not_value
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_IS_EQUALS_ISNOT"):
            _valid_spec(dimensions=dims)

    def test_is_equals_is_not_exact_match_on_what_is_refused(self):
        self._assert_identical_pair_refused(0, "script times out", "script times out")

    def test_is_equals_is_not_case_insensitive_match_on_where_is_refused(self):
        self._assert_identical_pair_refused(1, "Remote Host", "remote host")

    def test_is_equals_is_not_whitespace_insensitive_match_on_when_is_refused(self):
        self._assert_identical_pair_refused(2, "after growth", "  after   growth  ")

    def test_is_equals_is_not_exact_match_on_extent_is_refused(self):
        self._assert_identical_pair_refused(3, "3 timeouts", "3 timeouts")


class DistinctionTests(unittest.TestCase):
    def _spec_with_distinction(self, dimension: str, description: str = "a real distinction"):
        distinctions = [distinction_entry("DIST-001", dimension, description, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        return _valid_spec(distinctions=distinctions)

    def test_distinction_on_complete_what_dimension_is_accepted(self):
        spec = self._spec_with_distinction("WHAT")
        self.assertEqual(spec["distinctions"][0]["dimension"], "WHAT")

    def test_distinction_on_complete_where_dimension_is_accepted(self):
        spec = self._spec_with_distinction("WHERE")
        self.assertEqual(spec["distinctions"][0]["dimension"], "WHERE")

    def test_distinction_on_complete_when_dimension_is_accepted(self):
        spec = self._spec_with_distinction("WHEN")
        self.assertEqual(spec["distinctions"][0]["dimension"], "WHEN")

    def test_distinction_on_complete_extent_dimension_is_accepted(self):
        spec = self._spec_with_distinction("EXTENT")
        self.assertEqual(spec["distinctions"][0]["dimension"], "EXTENT")

    def test_distinction_on_dimension_missing_is_not_is_refused(self):
        dims = _valid_dimensions()
        del dims[1]["is_not"]  # WHERE now incomplete
        distinctions = [distinction_entry("DIST-001", "WHERE", "cannot derive this", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_DISTINCTION_DIMENSION_INCOMPLETE"):
            _valid_spec(dimensions=dims, distinctions=distinctions)

    def test_distinction_unknown_dimension_value_is_refused(self):
        distinctions = [distinction_entry("DIST-001", "WHY", "not a real dimension", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_DISTINCTION_UNKNOWN_DIMENSION"):
            _valid_spec(distinctions=distinctions)

    def test_distinction_missing_required_key_is_refused(self):
        distinctions = [{"distinction_id": "DIST-001", "dimension": "WHAT", "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}]  # no description
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DISTINCTION"):
            _valid_spec(distinctions=distinctions)

    def test_distinction_duplicate_id_is_refused(self):
        distinctions = [
            distinction_entry("DIST-001", "WHAT", "first", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            distinction_entry("DIST-001", "WHERE", "second, same id", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DISTINCTION"):
            _valid_spec(distinctions=distinctions)

    def test_distinction_id_missing_prefix_is_refused(self):
        distinctions = [distinction_entry("BAD-001", "WHAT", "wrong prefix", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DISTINCTION"):
            _valid_spec(distinctions=distinctions)

    def test_distinctions_none_is_legal(self):
        spec = _valid_spec(distinctions=None)
        self.assertNotIn("distinctions", spec)

    def test_distinctions_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DISTINCTION"):
            _valid_spec(distinctions="not-a-list")

    def test_distinction_empty_description_is_refused(self):
        distinctions = [distinction_entry("DIST-001", "WHAT", "", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_DISTINCTION"):
            _valid_spec(distinctions=distinctions)


class ChangeTests(unittest.TestCase):
    def _distinctions(self):
        return [distinction_entry("DIST-001", "WHAT", "a real distinction", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]

    def test_change_referencing_existing_distinction_is_accepted(self):
        changes = [change_entry("CHG-001", "DIST-001", "something changed", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        spec = _valid_spec(distinctions=self._distinctions(), changes=changes)
        self.assertEqual(spec["changes"][0]["distinction_id"], "DIST-001")

    def test_change_referencing_unknown_distinction_is_refused(self):
        changes = [change_entry("CHG-001", "DIST-DOES-NOT-EXIST", "something changed", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_CHANGE_UNKNOWN_DISTINCTION"):
            _valid_spec(distinctions=self._distinctions(), changes=changes)

    def test_change_missing_required_key_is_refused(self):
        changes = [{"change_id": "CHG-001", "distinction_id": "DIST-001", "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}]  # no description
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_CHANGE"):
            _valid_spec(distinctions=self._distinctions(), changes=changes)

    def test_change_duplicate_id_is_refused(self):
        changes = [
            change_entry("CHG-001", "DIST-001", "first", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            change_entry("CHG-001", "DIST-001", "second, same id", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_CHANGE"):
            _valid_spec(distinctions=self._distinctions(), changes=changes)

    def test_change_id_missing_prefix_is_refused(self):
        changes = [change_entry("BAD-001", "DIST-001", "wrong prefix", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_CHANGE"):
            _valid_spec(distinctions=self._distinctions(), changes=changes)

    def test_changes_none_is_legal(self):
        spec = _valid_spec(distinctions=self._distinctions(), changes=None)
        self.assertNotIn("changes", spec)

    def test_changes_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_CHANGE"):
            _valid_spec(distinctions=self._distinctions(), changes="not-a-list")

    def test_change_empty_description_is_refused(self):
        changes = [change_entry("CHG-001", "DIST-001", "", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_INVALID_CHANGE"):
            _valid_spec(distinctions=self._distinctions(), changes=changes)

    def test_change_without_any_distinctions_present_is_refused(self):
        changes = [change_entry("CHG-001", "DIST-001", "no distinctions exist at all", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "KEPNERTREGOE_CHANGE_UNKNOWN_DISTINCTION"):
            _valid_spec(distinctions=None, changes=changes)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_spec()
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_is(self):
        record = copy.deepcopy(_valid_spec())
        record["dimensions"][2]["is"] = ""
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_is_equals_is_not(self):
        record = copy.deepcopy(_valid_spec())
        record["dimensions"][0]["is_not"] = record["dimensions"][0]["is"]
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_dimension_order(self):
        record = copy.deepcopy(_valid_spec())
        record["dimensions"][0], record["dimensions"][1] = record["dimensions"][1], record["dimensions"][0]
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_distinction_on_incomplete_dimension(self):
        record = copy.deepcopy(_valid_spec())
        del record["dimensions"][1]["is_not"]  # WHERE now incomplete, bypassing the builder's own check
        record["distinctions"] = [distinction_entry("DIST-001", "WHERE", "should not be derivable", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_distinction_unknown_dimension(self):
        record = copy.deepcopy(_valid_spec())
        record["distinctions"] = [distinction_entry("DIST-001", "SEVERITY", "not a real dimension", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_change_unknown_distinction(self):
        record = copy.deepcopy(_valid_spec(distinctions=[distinction_entry("DIST-001", "WHAT", "d", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]))
        record["changes"] = [change_entry("CHG-001", "DIST-GHOST", "references nothing real", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_distinction_id(self):
        record = copy.deepcopy(_valid_spec())
        record["distinctions"] = [
            distinction_entry("DIST-001", "WHAT", "first", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            distinction_entry("DIST-001", "WHERE", "duplicate id", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_change_id(self):
        record = copy.deepcopy(_valid_spec(distinctions=[distinction_entry("DIST-001", "WHAT", "d", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]))
        record["changes"] = [
            change_entry("CHG-001", "DIST-001", "first", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
            change_entry("CHG-001", "DIST-001", "duplicate id", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        ]
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_kepner_tregoe_integrity_gate(bad_record, "test", "2026-09-07T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_spec())
        record["id"] = "WRONG-001"
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_spec())
        record["version"] = 1
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_problem_statement_ref_prefix(self):
        record = copy.deepcopy(_valid_spec())
        record["problem_statement_ref"] = "NOT-PROB-001"
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_wrong_dimension_count(self):
        record = copy.deepcopy(_valid_spec())
        record["dimensions"] = record["dimensions"][:2]
        gate = evaluate_kepner_tregoe_integrity_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceAndEvidenceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_all_valid(self):
        gate = evaluate_provenance_required_gate(_valid_spec(), "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_dimension_provenance_invalid(self):
        record = copy.deepcopy(_valid_spec())
        record["dimensions"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        record = copy.deepcopy(_valid_spec())
        record["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_when_evidence_labeled_dimensions_cite_refs(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_spec(), "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeling_gate_fails_when_evidence_labeled_dimension_cites_no_refs(self):
        dims = _valid_dimensions()
        dims[0] = dimension_entry("WHAT", dims[0]["is"], make_provenance("EVIDENCE", "HUMAN_APPROVED"), is_not=dims[0]["is_not"])  # no refs
        spec = _valid_spec(dimensions=dims)
        gate = evaluate_evidence_labeling_required_gate(spec, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_fails_when_no_epistemic_type_label(self):
        record = copy.deepcopy(_valid_spec())
        record["dimensions"][0]["provenance"] = {}
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_for_hypothesis_labeled_dimension_without_refs(self):
        dims = _valid_dimensions()
        dims[3] = dimension_entry("EXTENT", dims[3]["is"], make_provenance("HYPOTHESIS", "AI_SUGGESTED"), is_not=dims[3]["is_not"])  # no refs, not EVIDENCE
        spec = _valid_spec(dimensions=dims)
        gate = evaluate_evidence_labeling_required_gate(spec, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_dimension_entry_helper_omits_is_not_when_none(self):
        entry = dimension_entry("WHAT", "x", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
        self.assertNotIn("is_not", entry)

    def test_dimension_entry_helper_includes_is_not_when_given(self):
        entry = dimension_entry("WHAT", "x", make_provenance("EVIDENCE", "HUMAN_APPROVED"), is_not="y")
        self.assertEqual(entry["is_not"], "y")

    def test_distinction_entry_helper_shape(self):
        entry = distinction_entry("DIST-001", "WHAT", "desc", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual(entry["distinction_id"], "DIST-001")
        self.assertEqual(entry["dimension"], "WHAT")

    def test_change_entry_helper_shape(self):
        entry = change_entry("CHG-001", "DIST-001", "desc", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual(entry["change_id"], "CHG-001")
        self.assertEqual(entry["distinction_id"], "DIST-001")

    def test_all_gates_pass_true_when_all_pass(self):
        results = [{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        results = [{"status": "PASS"}, {"status": "FAIL"}]
        self.assertFalse(all_gates_pass(results))

    def test_evaluate_kepner_tregoe_gates_returns_three_gates_in_order(self):
        results = evaluate_kepner_tregoe_gates(_valid_spec(), "test", "2026-09-07T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "kepner_tregoe_integrity"])

    def test_evaluate_kepner_tregoe_gates_all_pass_on_a_valid_specification(self):
        results = evaluate_kepner_tregoe_gates(_valid_spec(), "test", "2026-09-07T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_dimension_order_constant_matches_atlas_citation_order(self):
        self.assertEqual(DIMENSION_ORDER, ("WHAT", "WHERE", "WHEN", "EXTENT"))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "KTPS-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "root_cause.kepner_tregoe")


if __name__ == "__main__":
    unittest.main()
