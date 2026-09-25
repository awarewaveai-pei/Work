"""Mutation-style tests for ``epistemic.evidence_hierarchy`` (F10 epistemic quality family, Atlas L566-600,
Evidence Hierarchy row L576). See ``ai_lego.modules.epistemic.evidence_hierarchy``'s own module docstring for
the seam this method closes in ``specs/evidence/evidence.schema.yaml``'s deliberately domain-specific
``hierarchy_tier`` field.

Two real invariants, each exercised at BOTH layers: construction-time refusal (``generate_evidence_hierarchy``
raising a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_evidence_hierarchy_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.epistemic.evidence_hierarchy import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_evidence_hierarchy_gates,
    evaluate_evidence_hierarchy_integrity_gate,
    evaluate_provenance_required_gate,
    evidence_assignment,
    generate_evidence_hierarchy,
    hierarchy_level,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

EVIDENCE_HIERARCHY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/evidence-hierarchy.schema.yaml"


def _levels() -> list[dict]:
    return [hierarchy_level("L-RCT", "Randomized Controlled Trial", 1), hierarchy_level("L-COHORT", "Cohort Study", 2), hierarchy_level("L-CASE", "Case Report", 3)]


def _assignments() -> list[dict]:
    return [evidence_assignment("E-1", "L-RCT"), evidence_assignment("E-2", "L-COHORT")]


def _valid_record(*, record_id: str = "EVHIER-T-001", domain: str = "clinical research", levels=None, assignments=None):
    return generate_evidence_hierarchy(
        record_id,
        domain,
        levels if levels is not None else _levels(),
        assignments if assignments is not None else _assignments(),
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )


class RecordConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(EVIDENCE_HIERARCHY_SCHEMA, _valid_record(), "evidence hierarchy")

    def test_zero_evidence_assignments_is_legal_a_hierarchy_may_be_declared_before_any_evidence_is_assigned(self):
        record = _valid_record(assignments=[])
        self.contracts.validate(EVIDENCE_HIERARCHY_SCHEMA, record, "hierarchy with no assignments yet")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_evidence_hierarchy_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_VERSION"):
            generate_evidence_hierarchy("EVHIER-T-002", "clinical research", _levels(), _assignments(), make_provenance("AI_INFERENCE", "AI_GENERATED"), version=1)

    def test_empty_domain_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_EMPTY_DOMAIN"):
            _valid_record(domain="   ")

    def test_schema_rejects_unknown_top_level_key(self):
        record = _valid_record()
        record["unexpected_top_level_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EVIDENCE_HIERARCHY_SCHEMA, record, "record with unknown top-level key")

    def test_schema_rejects_unknown_level_key(self):
        record = _valid_record()
        record["hierarchy_levels"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EVIDENCE_HIERARCHY_SCHEMA, record, "record with unknown level key")

    def test_schema_rejects_unknown_assignment_key(self):
        record = _valid_record()
        record["evidence_assignments"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EVIDENCE_HIERARCHY_SCHEMA, record, "record with unknown assignment key")


class HierarchyLevelShapeTests(unittest.TestCase):
    def test_empty_hierarchy_levels_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_LEVELS"):
            _valid_record(levels=[], assignments=[])

    def test_levels_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_LEVELS"):
            _valid_record(levels="not-a-list", assignments=[])

    def test_level_missing_required_key_is_refused(self):
        levels = _levels()
        del levels[0]["rank"]
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_LEVELS"):
            _valid_record(levels=levels)

    def test_level_unknown_extra_key_is_refused(self):
        levels = _levels()
        levels[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_LEVELS"):
            _valid_record(levels=levels)

    def test_level_blank_label_is_refused(self):
        levels = _levels()
        levels[0]["label"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_LEVELS"):
            _valid_record(levels=levels)

    def test_level_bool_rank_is_refused(self):
        """``isinstance(True, int)`` is True in Python -- a bool must not silently pass as a rank."""
        levels = _levels()
        levels[0]["rank"] = True
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_LEVELS"):
            _valid_record(levels=levels)

    def test_level_non_int_rank_is_refused(self):
        levels = _levels()
        levels[0]["rank"] = "1"
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_LEVELS"):
            _valid_record(levels=levels)

    def test_duplicate_level_id_is_refused(self):
        levels = _levels()
        levels[1]["level_id"] = levels[0]["level_id"]
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_DUPLICATE_LEVEL_ID"):
            _valid_record(levels=levels)

    def test_duplicate_rank_is_refused(self):
        """THE core invariant this method exists for: two levels tied at the same rank must be refused."""
        levels = _levels()
        levels[1]["rank"] = levels[0]["rank"]
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_DUPLICATE_RANK"):
            _valid_record(levels=levels)


class EvidenceAssignmentReferentialIntegrityTests(unittest.TestCase):
    def test_assignments_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_ASSIGNMENTS"):
            _valid_record(assignments="not-a-list")

    def test_assignment_missing_required_key_is_refused(self):
        assignments = _assignments()
        del assignments[0]["level_id"]
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_ASSIGNMENTS"):
            _valid_record(assignments=assignments)

    def test_assignment_malformed_evidence_id_is_refused(self):
        assignments = _assignments()
        assignments[0]["evidence_id"] = "NOT-AN-EVIDENCE-ID"
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_ASSIGNMENTS"):
            _valid_record(assignments=assignments)

    def test_assignment_unknown_extra_key_is_refused(self):
        assignments = _assignments()
        assignments[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_INVALID_ASSIGNMENTS"):
            _valid_record(assignments=assignments)

    def test_assignment_referencing_undeclared_level_is_refused(self):
        """THE core referential-integrity invariant: a dangling level_id must be refused, never silently
        accepted."""
        assignments = _assignments() + [evidence_assignment("E-99", "L-DOES-NOT-EXIST")]
        with self.assertRaisesRegex(InvariantViolation, "EVIDENCEHIERARCHY_DANGLING_LEVEL_REF"):
            _valid_record(assignments=assignments)


class GateIndependenceTests(unittest.TestCase):
    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_record()
        gate = evaluate_evidence_hierarchy_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_duplicate_rank(self):
        record = copy.deepcopy(_valid_record())
        record["hierarchy_levels"][1]["rank"] = record["hierarchy_levels"][0]["rank"]
        gate = evaluate_evidence_hierarchy_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("DUPLICATE_RANK", gate["evidence"][0]["reason"])

    def test_gate_catches_hand_tampered_dangling_level_ref(self):
        record = copy.deepcopy(_valid_record())
        record["evidence_assignments"][0]["level_id"] = "L-DOES-NOT-EXIST"
        gate = evaluate_evidence_hierarchy_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("DANGLING_REF", gate["evidence"][0]["reason"])

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_evidence_hierarchy_integrity_gate(bad_record, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_evidence_hierarchy_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_domain(self):
        record = copy.deepcopy(_valid_record())
        record["domain"] = ""
        gate = evaluate_evidence_hierarchy_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_caller_mutation_of_a_returned_record_does_not_corrupt_a_subsequently_built_record(self):
        """Post-construction caller-mutation test (F09 critic lesson: nested-list aliasing). Neither
        hierarchy_levels[] nor evidence_assignments[] items carry nested list fields of their own, but the
        builder's per-item ``dict(item)`` rebuild must still produce genuinely independent copies -- mutating
        one built record's own lists/dicts must not leak into a second, independently built record from the
        SAME input lists."""
        levels = _levels()
        assignments = _assignments()
        first = _valid_record(record_id="EVHIER-T-010", levels=levels, assignments=assignments)
        first["hierarchy_levels"][0]["rank"] = 999
        first["hierarchy_levels"].append(hierarchy_level("L-INJECTED", "should not appear elsewhere", 4))
        first["evidence_assignments"][0]["level_id"] = "TAMPERED"
        second = _valid_record(record_id="EVHIER-T-011", levels=levels, assignments=assignments)
        self.assertEqual(second["hierarchy_levels"][0]["rank"], 1)
        self.assertEqual(len(second["hierarchy_levels"]), 3)
        self.assertEqual(second["evidence_assignments"][0]["level_id"], "L-RCT")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_hierarchy_level_helper_shape(self):
        level = hierarchy_level("L-RCT", "Randomized Controlled Trial", 1)
        self.assertEqual(level, {"level_id": "L-RCT", "label": "Randomized Controlled Trial", "rank": 1})

    def test_evidence_assignment_helper_shape(self):
        assignment = evidence_assignment("E-1", "L-RCT")
        self.assertEqual(assignment, {"evidence_id": "E-1", "level_id": "L-RCT"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_evidence_hierarchy_gates_returns_two_gates_in_order(self):
        results = evaluate_evidence_hierarchy_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_hierarchy_integrity"])

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "EVHIER-")

    def test_method_id_constant_is_schema_pattern_valid(self):
        """method.schema.yaml's own id pattern (^[a-z_]+\\.[a-z_]+$) -- verify the constant itself actually
        conforms, not just that it 'looks right'."""
        import re

        self.assertEqual(METHOD_ID, "epistemic.evidence_hierarchy")
        self.assertIsNotNone(re.fullmatch(r"[a-z_]+\.[a-z_]+", METHOD_ID))


if __name__ == "__main__":
    unittest.main()
