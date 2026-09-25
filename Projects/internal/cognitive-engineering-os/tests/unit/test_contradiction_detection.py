"""Mutation-style tests for ``epistemic.contradiction_detection`` (F10 epistemic quality family, Atlas
L566-600, Contradiction Detection row L579). See ``ai_lego.modules.epistemic.contradiction_detection``'s own
module docstring for how this differs from ``claim.schema.yaml``'s own ``contradicting_evidence`` field.

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_contradiction_detection`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_contradiction_detection_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely). The unordered-pair-uniqueness invariant is tested in BOTH orderings, per this
method's own "subtle case" design note.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.epistemic.contradiction_detection import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    claim_ref,
    contradiction_relation,
    evaluate_contradiction_detection_gates,
    evaluate_contradiction_detection_integrity_gate,
    evaluate_provenance_required_gate,
    generate_contradiction_detection,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CONTRADICTION_DETECTION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/contradiction-detection.schema.yaml"


def _claims() -> list[dict]:
    return [claim_ref("C-1"), claim_ref("C-2"), claim_ref("C-3")]


def _relations() -> list[dict]:
    return [contradiction_relation("C-1", "C-2", "CONTRADICTS"), contradiction_relation("C-1", "C-3", "CONTEXT_DEPENDENT")]


def _valid_record(*, record_id: str = "CDET-T-001", claims=None, relations=None):
    return generate_contradiction_detection(
        record_id,
        claims if claims is not None else _claims(),
        relations if relations is not None else _relations(),
        make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )


class RecordConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(CONTRADICTION_DETECTION_SCHEMA, _valid_record(), "contradiction detection")

    def test_zero_relations_is_legal_a_roster_may_be_examined_and_found_free_of_conflict(self):
        record = _valid_record(relations=[])
        self.contracts.validate(CONTRADICTION_DETECTION_SCHEMA, record, "no relations found")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_contradiction_detection_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_INVALID_VERSION"):
            generate_contradiction_detection("CDET-T-002", _claims(), _relations(), make_provenance("AI_INFERENCE", "AI_GENERATED"), version=1)

    def test_schema_rejects_unknown_top_level_key(self):
        record = _valid_record()
        record["unexpected_top_level_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONTRADICTION_DETECTION_SCHEMA, record, "record with unknown top-level key")

    def test_schema_rejects_unknown_claim_key(self):
        record = _valid_record()
        record["claims"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONTRADICTION_DETECTION_SCHEMA, record, "record with unknown claim key")

    def test_schema_rejects_unknown_relation_key(self):
        record = _valid_record()
        record["relations"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONTRADICTION_DETECTION_SCHEMA, record, "record with unknown relation key")

    def test_schema_rejects_invalid_relation_enum_value(self):
        record = _valid_record()
        record["relations"][0]["relation"] = "MAYBE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONTRADICTION_DETECTION_SCHEMA, record, "record with invalid relation enum")


class ClaimRosterShapeTests(unittest.TestCase):
    def test_too_few_claims_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_INVALID_CLAIMS"):
            _valid_record(claims=[claim_ref("C-1")], relations=[])

    def test_claims_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_INVALID_CLAIMS"):
            _valid_record(claims="not-a-list", relations=[])

    def test_claim_malformed_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_INVALID_CLAIMS"):
            _valid_record(claims=[claim_ref("NOT-A-CLAIM-ID"), claim_ref("C-2")], relations=[])

    def test_claim_unknown_extra_key_is_refused(self):
        claims = _claims()
        claims[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_INVALID_CLAIMS"):
            _valid_record(claims=claims, relations=[])

    def test_duplicate_claim_id_is_refused(self):
        claims = _claims()
        claims[1]["claim_id"] = claims[0]["claim_id"]
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_DUPLICATE_CLAIM_ID"):
            _valid_record(claims=claims, relations=[])


class RelationReferentialIntegrityTests(unittest.TestCase):
    def test_relations_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_INVALID_RELATIONS"):
            _valid_record(relations="not-a-list")

    def test_relation_invalid_enum_value_is_refused(self):
        relations = _relations()
        relations[0]["relation"] = "MAYBE"
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_INVALID_RELATION_ENUM"):
            _valid_record(relations=relations)

    def test_self_relation_is_refused(self):
        """A claim cannot be declared to contradict/support/context itself."""
        relations = _relations() + [contradiction_relation("C-1", "C-1", "CONTRADICTS")]
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_SELF_RELATION"):
            _valid_record(relations=relations)

    def test_relation_referencing_undeclared_claim_a_is_refused(self):
        relations = _relations() + [contradiction_relation("C-99", "C-2", "SUPPORTS")]
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_DANGLING_CLAIM_REF"):
            _valid_record(relations=relations)

    def test_relation_referencing_undeclared_claim_b_is_refused(self):
        relations = _relations() + [contradiction_relation("C-2", "C-99", "SUPPORTS")]
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_DANGLING_CLAIM_REF"):
            _valid_record(relations=relations)

    def test_same_order_duplicate_pair_is_refused(self):
        relations = _relations() + [contradiction_relation("C-1", "C-2", "SUPPORTS")]
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_DUPLICATE_PAIR"):
            _valid_record(relations=relations)

    def test_reversed_order_duplicate_pair_is_refused(self):
        """THE subtle invariant this method's own design specifically calls out: {A,B} and {B,A} are the SAME
        unordered pair, and declaring it again with a DIFFERENT relation value must still be refused."""
        relations = _relations() + [contradiction_relation("C-2", "C-1", "SUPPORTS")]
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_DUPLICATE_PAIR"):
            _valid_record(relations=relations)

    def test_relation_unknown_extra_key_is_refused(self):
        relations = _relations()
        relations[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "CONTRADICTIONDETECTION_INVALID_RELATIONS"):
            _valid_record(relations=relations)


class GateIndependenceTests(unittest.TestCase):
    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_record()
        gate = evaluate_contradiction_detection_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_self_relation(self):
        record = copy.deepcopy(_valid_record())
        record["relations"][0]["claim_id_b"] = record["relations"][0]["claim_id_a"]
        gate = evaluate_contradiction_detection_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("SELF_RELATION", gate["evidence"][0]["reason"])

    def test_gate_catches_hand_tampered_dangling_claim_ref(self):
        record = copy.deepcopy(_valid_record())
        record["relations"][0]["claim_id_b"] = "C-99999"
        gate = evaluate_contradiction_detection_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("DANGLING_REF", gate["evidence"][0]["reason"])

    def test_gate_catches_hand_tampered_reversed_duplicate_pair(self):
        record = copy.deepcopy(_valid_record())
        record["relations"].append({"claim_id_a": "C-2", "claim_id_b": "C-1", "relation": "SUPPORTS"})
        gate = evaluate_contradiction_detection_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("DUPLICATE_PAIR", gate["evidence"][0]["reason"])

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_contradiction_detection_integrity_gate(bad_record, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_contradiction_detection_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_too_few_claims(self):
        record = copy.deepcopy(_valid_record())
        record["claims"] = record["claims"][:1]
        gate = evaluate_contradiction_detection_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_caller_mutation_of_a_returned_record_does_not_corrupt_a_subsequently_built_record(self):
        """Post-construction caller-mutation test (F09 critic lesson: nested-list aliasing). Neither claims[]
        nor relations[] items carry nested list fields of their own, but the builder's per-item ``dict(item)``
        rebuild must still produce genuinely independent copies -- mutating one built record's own
        claims/relations lists must not leak into a second, independently built record from the SAME input
        lists."""
        claims = _claims()
        relations = _relations()
        first = _valid_record(record_id="CDET-T-010", claims=claims, relations=relations)
        first["claims"][0]["claim_id"] = "TAMPERED"
        first["claims"].append(claim_ref("C-999"))
        first["relations"][0]["relation"] = "SUPPORTS"
        second = _valid_record(record_id="CDET-T-011", claims=claims, relations=relations)
        self.assertEqual(second["claims"][0]["claim_id"], "C-1")
        self.assertEqual(len(second["claims"]), 3)
        self.assertEqual(second["relations"][0]["relation"], "CONTRADICTS")


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
    def test_claim_ref_helper_shape(self):
        self.assertEqual(claim_ref("C-1"), {"claim_id": "C-1"})

    def test_contradiction_relation_helper_shape(self):
        self.assertEqual(contradiction_relation("C-1", "C-2", "CONTRADICTS"), {"claim_id_a": "C-1", "claim_id_b": "C-2", "relation": "CONTRADICTS"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_contradiction_detection_gates_returns_two_gates_in_order(self):
        results = evaluate_contradiction_detection_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "contradiction_detection_integrity"])

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CDET-")

    def test_method_id_constant_is_schema_pattern_valid(self):
        """method.schema.yaml's own id pattern (^[a-z_]+\\.[a-z_]+$) -- verify the constant itself actually
        conforms, not just that it 'looks right'."""
        import re

        self.assertEqual(METHOD_ID, "epistemic.contradiction_detection")
        self.assertIsNotNone(re.fullmatch(r"[a-z_]+\.[a-z_]+", METHOD_ID))


if __name__ == "__main__":
    unittest.main()
