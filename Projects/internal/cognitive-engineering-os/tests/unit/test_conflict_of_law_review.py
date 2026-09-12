"""Mutation-style tests for ``jurisdiction.conflict_of_law_review`` (F23 jurisdiction family, Atlas L944).

Atlas's own "conflicts->legal review" pipeline stage is proven at BOTH
independent layers: the construction-time builder REFUSES to finalize a
conflict's applicable_law without a non-empty legal_review already attached
(the star invariant -- no auto-resolution without human sign-off), a
dangling disputed_law_ids reference, and a duplicate id across the
governing_laws/mandatory_rules namespaces; the independent gates re-derive
the same rules directly from a raw (possibly hand-tampered) dict, never
trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.jurisdiction.conflict_of_law_review import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_conflict_of_law_review_gates,
    evaluate_legal_review_required_gate,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    generate_conflict_of_law_review,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

CONFLICT_OF_LAW_REVIEW_SCHEMA = "ai-lego://specs/cognitive/typed-objects/conflict-of-law-review-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        governing_laws=[
            {"law_id": "LAW-EU-GDPR", "jurisdiction": "EU", "description": "General Data Protection Regulation"},
            {"law_id": "LAW-US-CCPA", "jurisdiction": "US-CA", "description": "California Consumer Privacy Act"},
        ],
        mandatory_rules=[
            {"rule_id": "RULE-EU-PUBLIC-POLICY", "jurisdiction": "EU", "description": "EU public policy override"},
        ],
        conflicts=[
            {
                "conflict_id": "CONF-001",
                "disputed_law_ids": ["LAW-EU-GDPR", "LAW-US-CCPA"],
                "description": "Deletion request conflicts with a US retention obligation",
                "legal_review": {"reviewer": "J. Alvarez, Esq.", "date": "2026-09-01", "outcome": "GDPR erasure right upheld"},
                "applicable_law": "LAW-EU-GDPR",
            },
            {
                "conflict_id": "CONF-002",
                "disputed_law_ids": ["LAW-US-CCPA", "RULE-EU-PUBLIC-POLICY"],
                "description": "Cross-border transfer mechanism disputed",
                "legal_review": None,
                "applicable_law": None,
            },
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_review(*, record_id: str = "COLR-T-001", **overrides: object):
    return generate_conflict_of_law_review(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_review_validates_against_the_real_schema(self):
        self.contracts.validate(CONFLICT_OF_LAW_REVIEW_SCHEMA, _valid_review(), "conflict of law review")

    def test_minimal_review_with_no_mandatory_rules_and_one_pending_conflict_is_valid(self):
        review = generate_conflict_of_law_review(
            "COLR-T-002",
            governing_laws=[{"law_id": "LAW-A", "jurisdiction": "A", "description": "d"}, {"law_id": "LAW-B", "jurisdiction": "B", "description": "d"}],
            mandatory_rules=[],
            conflicts=[{"conflict_id": "CONF-1", "disputed_law_ids": ["LAW-A", "LAW-B"], "description": "d", "legal_review": None, "applicable_law": None}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(CONFLICT_OF_LAW_REVIEW_SCHEMA, review, "minimal pending review")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, review = live.invoke(METHOD_ID, generate_conflict_of_law_review, "COLR-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/jurisdiction.conflict_of_law_review.contract.yaml")
        self.assertEqual(review["id"], "COLR-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        review = _valid_review()
        review["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONFLICT_OF_LAW_REVIEW_SCHEMA, review, "review with a smuggled top-level key")

    def test_schema_rejects_a_finalized_conflict_with_null_legal_review(self):
        """The allOf rule itself, exercised directly against the schema (belt: schema; suspenders: runtime)."""
        review = _valid_review()
        review["conflicts"][1]["applicable_law"] = "LAW-US-CCPA"  # CONF-002 has legal_review: null
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONFLICT_OF_LAW_REVIEW_SCHEMA, review, "finalized conflict with null legal_review")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "jurisdiction.conflict_of_law_review.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "jurisdiction.conflict_of_law_review contract")


class GoverningLawAndMandatoryRuleTests(unittest.TestCase):
    def test_zero_governing_laws_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COL_TOO_FEW_GOVERNING_LAWS"):
            generate_conflict_of_law_review("COLR-T-003", governing_laws=[], mandatory_rules=[], conflicts=[], provenance=PROVENANCE)

    def test_duplicate_id_across_governing_laws_and_mandatory_rules_is_refused(self):
        kwargs = _kwargs()
        kwargs["mandatory_rules"].append({"rule_id": "LAW-EU-GDPR", "jurisdiction": "EU", "description": "colliding id"})
        with self.assertRaisesRegex(InvariantViolation, "COL_DUPLICATE_LAW_OR_RULE_ID"):
            generate_conflict_of_law_review("COLR-T-004", **kwargs)

    def test_malformed_governing_law_is_refused(self):
        kwargs = _kwargs()
        kwargs["governing_laws"][0] = {"law_id": "", "jurisdiction": "EU", "description": "d"}
        with self.assertRaisesRegex(InvariantViolation, "COL_INVALID_GOVERNING_LAW"):
            generate_conflict_of_law_review("COLR-T-005", **kwargs)


class ReferentialIntegrityTests(unittest.TestCase):
    def test_dangling_disputed_law_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["conflicts"][0]["disputed_law_ids"] = ["LAW-EU-GDPR", "LAW-NONEXISTENT"]
        with self.assertRaisesRegex(InvariantViolation, "COL_DANGLING_LAW_REF"):
            generate_conflict_of_law_review("COLR-T-006", **kwargs)

    def test_fewer_than_two_disputed_law_ids_is_refused(self):
        kwargs = _kwargs()
        kwargs["conflicts"][0]["disputed_law_ids"] = ["LAW-EU-GDPR"]
        with self.assertRaisesRegex(InvariantViolation, "COL_INVALID_CONFLICTS"):
            generate_conflict_of_law_review("COLR-T-007", **kwargs)

    def test_duplicate_conflict_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["conflicts"].append(dict(kwargs["conflicts"][0]))
        with self.assertRaisesRegex(InvariantViolation, "COL_DUPLICATE_CONFLICT_ID"):
            generate_conflict_of_law_review("COLR-T-008", **kwargs)


class LegalReviewRequiredTests(unittest.TestCase):
    """THE core fail-closed invariant (Atlas L944's own '防自動化錯用法律') -- no finalized
    applicable_law without a non-empty, well-formed legal_review already attached."""

    def test_finalizing_applicable_law_without_legal_review_is_refused(self):
        kwargs = _kwargs()
        kwargs["conflicts"][1]["applicable_law"] = "LAW-US-CCPA"  # CONF-002's legal_review is still None
        with self.assertRaisesRegex(InvariantViolation, "COL_MISSING_LEGAL_REVIEW"):
            generate_conflict_of_law_review("COLR-T-009", **kwargs)

    def test_pending_conflict_with_null_applicable_law_and_null_legal_review_is_accepted(self):
        review = _valid_review()
        pending = review["conflicts"][1]
        self.assertIsNone(pending["applicable_law"])
        self.assertIsNone(pending["legal_review"])

    def test_applicable_law_not_among_disputed_law_ids_is_refused(self):
        kwargs = _kwargs()
        kwargs["conflicts"][0]["applicable_law"] = "RULE-EU-PUBLIC-POLICY"  # not in this conflict's disputed_law_ids
        with self.assertRaisesRegex(InvariantViolation, "COL_INVALID_APPLICABLE_LAW"):
            generate_conflict_of_law_review("COLR-T-010", **kwargs)

    def test_legal_review_missing_reviewer_is_refused(self):
        kwargs = _kwargs()
        kwargs["conflicts"][0]["legal_review"] = {"reviewer": "", "date": "2026-09-01", "outcome": "resolved"}
        with self.assertRaisesRegex(InvariantViolation, "COL_INVALID_CONFLICTS"):
            generate_conflict_of_law_review("COLR-T-011", **kwargs)

    def test_legal_review_invalid_calendar_date_is_refused(self):
        kwargs = _kwargs()
        kwargs["conflicts"][0]["legal_review"] = {"reviewer": "J. Alvarez", "date": "2026-02-30", "outcome": "resolved"}
        with self.assertRaisesRegex(InvariantViolation, "COL_INVALID_CONFLICTS"):
            generate_conflict_of_law_review("COLR-T-012", **kwargs)

    def test_legal_review_empty_outcome_is_refused(self):
        kwargs = _kwargs()
        kwargs["conflicts"][0]["legal_review"] = {"reviewer": "J. Alvarez", "date": "2026-09-01", "outcome": ""}
        with self.assertRaisesRegex(InvariantViolation, "COL_INVALID_CONFLICTS"):
            generate_conflict_of_law_review("COLR-T-013", **kwargs)

    def test_conflict_with_legal_review_but_still_no_finalized_applicable_law_is_accepted(self):
        """A human reviewed the conflict but has not (yet) committed to a determination -- legal_review
        present, applicable_law still null. Legal to allow; the invariant only forbids the reverse."""
        review = _valid_review(
            conflicts=[
                {
                    "conflict_id": "CONF-REVIEWED-UNDECIDED",
                    "disputed_law_ids": ["LAW-EU-GDPR", "LAW-US-CCPA"],
                    "description": "d",
                    "legal_review": {"reviewer": "J. Alvarez", "date": "2026-09-01", "outcome": "under advisement"},
                    "applicable_law": None,
                }
            ]
        )
        self.assertIsNone(review["conflicts"][0]["applicable_law"])
        self.assertIsNotNone(review["conflicts"][0]["legal_review"])


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        review = generate_conflict_of_law_review("COLR-T-014", **kwargs)
        kwargs["conflicts"][0]["legal_review"]["outcome"] = "TAMPERED"
        self.assertNotEqual(review["conflicts"][0]["legal_review"]["outcome"], "TAMPERED")
        kwargs["conflicts"][0]["disputed_law_ids"][0] = "TAMPERED-ID"
        self.assertNotEqual(review["conflicts"][0]["disputed_law_ids"][0], "TAMPERED-ID")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_review(self):
        results = evaluate_conflict_of_law_review_gates(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_referential_integrity_gate_catches_hand_tampered_dangling_ref(self):
        record = copy.deepcopy(_valid_review())
        record["conflicts"][0]["disputed_law_ids"] = ["LAW-EU-GDPR", "LAW-NONEXISTENT"]
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_cross_namespace_id_collision(self):
        record = copy.deepcopy(_valid_review())
        record["mandatory_rules"].append({"rule_id": "LAW-EU-GDPR", "jurisdiction": "EU", "description": "colliding"})
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_legal_review_required_gate_catches_hand_tampered_stripped_legal_review(self):
        """The star hand-tamper proof: strip legal_review from an already-finalized conflict,
        bypassing the builder entirely -- the independent gate must still catch it."""
        record = copy.deepcopy(_valid_review())
        record["conflicts"][0]["legal_review"] = None
        gate = evaluate_legal_review_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_legal_review_required_gate_catches_hand_tampered_applicable_law_not_in_disputed(self):
        record = copy.deepcopy(_valid_review())
        record["conflicts"][0]["applicable_law"] = "RULE-EU-PUBLIC-POLICY"
        gate = evaluate_legal_review_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_legal_review_required_gate_passes_a_genuinely_valid_review(self):
        gate = evaluate_legal_review_required_gate(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_conflict_of_law_review_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_review())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "COLR-")

    def test_record_id_prefix_is_distinct_from_the_pre_existing_conflict_of_laws_engine_prefix(self):
        """Disambiguation from specs/jurisdiction/conflict-of-laws-output.schema.yaml's `^COL-` prefix
        -- see that schema's own $id and this method's contract yaml open_questions."""
        self.assertNotEqual(RECORD_ID_PREFIX, "COL-")
        self.assertTrue(RECORD_ID_PREFIX.startswith("COL"))

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COL_INVALID_ID"):
            _valid_review(record_id="WRONG-PREFIX-001")

    def test_id_with_the_pre_existing_engine_prefix_but_not_this_methods_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COL_INVALID_ID"):
            _valid_review(record_id="COL-NOT-COLR-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COL_INVALID_VERSION"):
            generate_conflict_of_law_review("COLR-T-015", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COL_INVALID_PROVENANCE"):
            _valid_review(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "jurisdiction.conflict_of_law_review")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_conflict_of_law_review_gates(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "referential_integrity", "legal_review_required"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        review = _valid_review()
        self.assertEqual(
            set(review.keys()),
            {"id", "version", "generated_by_method", "governing_laws", "mandatory_rules", "conflicts", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of the F13 corpus's 14 builders returned the caller's own
    ``provenance`` dict BY REFERENCE rather than a copy -- mutating the caller's dict after
    construction silently rewrote the already-returned 'validated' record's provenance too, with no
    exception. That exact class recurred a 4th time in the immediately-prior F22 batch. Fixed here by
    ``copy.deepcopy``ing provenance at the return statement; this test proves the fix and guards
    against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_review()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_conflict_of_law_review(base["id"], base["governing_laws"], base["mandatory_rules"], base["conflicts"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_returned_record_does_not_alias_the_callers_legal_review_dict(self):
        """This method's own extra nested-mutable field beyond provenance -- legal_review is a
        per-conflict dict, the same aliasing trap class if not independently deepcopy'd."""
        kwargs = _kwargs()
        review = generate_conflict_of_law_review("COLR-T-016", **kwargs)
        kwargs["conflicts"][0]["legal_review"]["outcome"] = "MUTATED_AFTER_RETURN"
        self.assertNotEqual(review["conflicts"][0]["legal_review"]["outcome"], "MUTATED_AFTER_RETURN")


if __name__ == "__main__":
    unittest.main()
