"""Mutation-style tests for ``devops_sre.release_readiness_review`` (thirty-second Method Atlas slice,
seventh from the `devops_sre` family). Atlas's own benefit text ("防漏掉跨域風險" -- prevent missing
cross-domain risk) is proven at BOTH independent layers -- construction-time and gate re-derivation, the
gate RECOMPUTING completeness/aggregation fresh rather than trusting stored values.

Applies lessons already established this session: shared predicates between builder and gate
(_duplicate_domains/_missing_domains/_assessment_is_valid), rebuild-not-alias for hand-built input
(database_data.reconciliation/devops_sre.capacity_model's own critic rounds), and evidence-pinned gate
tests (not bare status=='FAIL')."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.release_readiness_review import (
    CANONICAL_DOMAINS,
    METHOD_ID,
    all_gates_pass,
    domain_assessment,
    evaluate_provenance_required_gate,
    evaluate_readiness_integrity_gate,
    evaluate_release_readiness_review_gates,
    generate_release_readiness_review_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/release-readiness-review-record.schema.yaml"


def _all_ready_assessments():
    return [domain_assessment(domain, "ready") for domain in sorted(CANONICAL_DOMAINS)]


def _valid_record(overall_status: str = "ready"):
    return generate_release_readiness_review_record(
        "RRR-T-001", "test release", _all_ready_assessments(), overall_status, make_provenance("AI_INFERENCE", "AI_GENERATED")
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_canonical_domains_are_exactly_atlas_own_six(self):
        self.assertEqual(CANONICAL_DOMAINS, frozenset({"change", "data", "security", "observability", "rollback", "capacity"}))

    def test_ready_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "release readiness review record")

    def test_not_ready_record_with_a_documented_failure_validates(self):
        assessments = [domain_assessment(domain, "ready") for domain in sorted(CANONICAL_DOMAINS) if domain != "security"]
        assessments.append(domain_assessment("security", "not_ready", note="critical CVE with no patch"))
        record = generate_release_readiness_review_record("RRR-T-002", "test release", assessments, "not_ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(RECORD_SCHEMA, record, "not-ready release readiness review record")

    def test_domain_assessment_unknown_domain_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_UNKNOWN_DOMAIN"):
            domain_assessment("not_a_real_domain", "ready")

    def test_domain_assessment_unknown_verdict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_INVALID_VERDICT"):
            domain_assessment("change", "sort_of_ready")

    def test_domain_assessment_not_ready_without_note_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_NOT_READY_REQUIRES_NOTE"):
            domain_assessment("security", "not_ready")

    def test_domain_assessment_empty_note_when_supplied_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_EMPTY_NOTE"):
            domain_assessment("change", "ready", note="   ")

    def test_hand_built_ready_assessment_with_non_string_note_is_refused_at_construction(self):
        """Regression for a critic-caught Major: the shared _assessment_is_valid predicate originally
        validated note's own shape ONLY for the not_ready case, leaving a ready assessment's own note
        (e.g. an int, or a mutable list a caller could mutate after certification) completely unvalidated at
        the layer both builder and gate share."""
        hand_built = {"domain": "capacity", "verdict": "ready", "note": 42}
        assessments = [domain_assessment(domain, "ready") for domain in sorted(CANONICAL_DOMAINS) if domain != "capacity"] + [hand_built]
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_INVALID_ASSESSMENT"):
            generate_release_readiness_review_record("RRR-T-002B", "x", assessments, "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_hand_built_assessment_with_mutable_note_is_not_aliased(self):
        """Second half of the same regression: even a VALID string note must not let a caller's own mutable
        container structure leak a reference into the certified record -- rebuilt fresh, not stored
        verbatim."""
        hand_built = {"domain": "capacity", "verdict": "ready", "note": "a real string note"}
        assessments = [domain_assessment(domain, "ready") for domain in sorted(CANONICAL_DOMAINS) if domain != "capacity"] + [hand_built]
        record = generate_release_readiness_review_record("RRR-T-002C", "x", assessments, "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        capacity_entry = next(item for item in record["domain_assessments"] if item["domain"] == "capacity")
        self.assertEqual(capacity_entry["note"], "a real string note")

    def test_wrong_count_five_domains_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_WRONG_COUNT"):
            generate_release_readiness_review_record("RRR-T-003", "x", _all_ready_assessments()[:5], "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_wrong_count_seven_domains_is_refused(self):
        extra = _all_ready_assessments() + [{"domain": "change", "verdict": "ready"}]
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_WRONG_COUNT"):
            generate_release_readiness_review_record("RRR-T-004", "x", extra, "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_duplicate_domain_is_refused(self):
        """Six items total, but 'change' appears twice and 'capacity' is missing -- must be refused as a
        duplicate, not silently accepted because the COUNT happens to still be six."""
        assessments = [domain_assessment(domain, "ready") for domain in sorted(CANONICAL_DOMAINS) if domain != "capacity"]
        assessments.append(domain_assessment("change", "ready"))
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_DUPLICATE_DOMAIN"):
            generate_release_readiness_review_record("RRR-T-005", "x", assessments, "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_five_distinct_domains_with_one_duplicated_is_refused_as_duplicate_even_with_six_total_entries(self):
        """A record with six entries but only five DISTINCT canonical domains (one domain missing, a
        different one duplicated) is caught by the DUPLICATE check, not a separate missing-domain check --
        with exactly 6 entries, all schema-valid, `_missing_domains` (release_readiness_review.py) is
        PROVABLY unreachable given `_duplicate_domains` already ran first (verified by exhaustive
        enumeration of all 462 six-multisets of the six canonical domains during this slice's own critic
        review). This test's own name/assertion reflects that reality -- an earlier draft's docstring
        claimed this proves the missing-domain check specifically, which a critic review caught as
        self-contradicting its own assertion."""
        assessments = [{"domain": "change", "verdict": "ready"}] + [domain_assessment(domain, "ready") for domain in sorted(CANONICAL_DOMAINS) if domain != "capacity"]
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_DUPLICATE_DOMAIN"):
            generate_release_readiness_review_record("RRR-T-006", "x", assessments, "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_ready_with_a_not_ready_domain_present_is_refused(self):
        """The core aggregation invariant: overall_status:ready cannot coexist with a real not_ready domain."""
        assessments = [domain_assessment(domain, "ready") for domain in sorted(CANONICAL_DOMAINS) if domain != "security"]
        assessments.append(domain_assessment("security", "not_ready", note="critical CVE"))
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_NOT_ACTUALLY_READY"):
            generate_release_readiness_review_record("RRR-T-007", "x", assessments, "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_not_ready_is_legal_even_when_every_domain_is_ready(self):
        """DELIBERATELY ONE-DIRECTIONAL, same class as database_data.backup_restore_drill's own status
        field: a caller may conservatively declare not_ready even when nothing is actually wrong."""
        record = generate_release_readiness_review_record("RRR-T-008", "x", _all_ready_assessments(), "not_ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.assertEqual(record["overall_status"], "not_ready")

    def test_invalid_overall_status_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_INVALID_OVERALL_STATUS"):
            generate_release_readiness_review_record("RRR-T-009", "x", _all_ready_assessments(), "sort_of_ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_EMPTY_RECORD_FIELD"):
            generate_release_readiness_review_record("", "x", _all_ready_assessments(), "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_empty_release_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_EMPTY_RECORD_FIELD"):
            generate_release_readiness_review_record("RRR-T-010", "", _all_ready_assessments(), "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_non_dict_assessment_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_INVALID_ASSESSMENT_SHAPE"):
            generate_release_readiness_review_record("RRR-T-011", "x", ["not-a-dict"] * 6, "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_hand_built_assessment_with_unknown_domain_is_refused_not_crashed(self):
        assessments = _all_ready_assessments()[:5] + [{"domain": "not_a_real_domain", "verdict": "ready"}]
        with self.assertRaisesRegex(InvariantViolation, "RELEASEREADINESS_INVALID_ASSESSMENT"):
            generate_release_readiness_review_record("RRR-T-012", "x", assessments, "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_hand_built_assessment_with_extra_field_is_stripped_not_stored(self):
        """Regression, learned from database_data.reconciliation/devops_sre.capacity_model's own critic
        rounds: a hand-built assessment with an attacker-controlled extra field must not survive into the
        constructed record."""
        assessments = [domain_assessment(domain, "ready") for domain in sorted(CANONICAL_DOMAINS) if domain != "capacity"]
        assessments.append({"domain": "capacity", "verdict": "ready", "attacker_field": "x"})
        record = generate_release_readiness_review_record("RRR-T-013", "x", assessments, "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        capacity_entry = next(item for item in record["domain_assessments"] if item["domain"] == "capacity")
        self.assertEqual(capacity_entry, {"domain": "capacity", "verdict": "ready"})

    def test_mutating_the_callers_own_list_after_construction_does_not_affect_the_stored_record(self):
        caller_assessments = _all_ready_assessments()
        record = generate_release_readiness_review_record("RRR-T-014", "x", caller_assessments, "ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        caller_assessments[0]["verdict"] = "not_ready"
        self.assertEqual(record["domain_assessments"][0]["verdict"], "ready")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_release_readiness_review_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_ready_record_passes_both_gates(self):
        results = evaluate_release_readiness_review_gates(_valid_record(), "test", "2026-09-05T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "readiness_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_not_ready_record_passes_both_gates(self):
        assessments = [domain_assessment(domain, "ready") for domain in sorted(CANONICAL_DOMAINS) if domain != "security"]
        assessments.append(domain_assessment("security", "not_ready", note="real issue"))
        record = generate_release_readiness_review_record("RRR-T-015", "x", assessments, "not_ready", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        results = evaluate_release_readiness_review_gates(record, "test", "2026-09-05T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_verdict_flip_fails_the_gate_via_recomputation(self):
        """The critical regression this slice was built to avoid from the start: flipping a stored verdict
        to not_ready (with a note, so the assessment shape itself stays valid) while leaving
        overall_status:ready untouched must be caught by the gate's own independent re-derivation."""
        record = _valid_record()
        for item in record["domain_assessments"]:
            if item["domain"] == "security":
                item["verdict"] = "not_ready"
                item["note"] = "tampered"
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "overall_status:ready but not-ready domains remain")
        self.assertIn("security", gate["evidence"][0]["not_ready_domains"])

    def test_hand_tampered_duplicate_domain_fails_the_gate(self):
        record = _valid_record()
        record["domain_assessments"][-1] = dict(record["domain_assessments"][0])
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "duplicate domain")
        self.assertIn(record["domain_assessments"][0]["domain"], gate["evidence"][0]["duplicate_domains"])

    def test_hand_tampered_domain_swap_to_a_duplicate_fails_the_gate(self):
        """A record hand-tampered to swap one domain's own name for a duplicate of another (six entries
        total, only five distinct domains) is caught by the gate's own DUPLICATE check -- see
        SpecConformanceTests's own sibling test for why `_missing_domains` itself is provably unreachable
        once the duplicate check has already run."""
        record = _valid_record()
        record["domain_assessments"][-1]["domain"] = record["domain_assessments"][0]["domain"]
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "duplicate domain")

    def test_hand_tampered_not_ready_with_note_removed_fails_the_gate(self):
        record = _valid_record()
        for item in record["domain_assessments"]:
            if item["domain"] == "security":
                item["verdict"] = "not_ready"  # note deliberately absent -- invalid shape
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more assessments is invalid (unknown domain/verdict, non-string note, or not_ready with no note)")

    def test_hand_tampered_non_string_note_on_a_ready_domain_fails_the_gate(self):
        """Gate-layer companion to the builder's own M1 regression: a ready domain's own note tampered to a
        non-string value must be caught by the gate too, not just at construction."""
        record = _valid_record()
        record["domain_assessments"][0]["note"] = 42
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more assessments is invalid (unknown domain/verdict, non-string note, or not_ready with no note)")

    def test_hand_tampered_empty_record_id_fails_the_gate(self):
        """Regression for the critic-caught Major (M2, the capacity_model-class gate gap reintroduced here):
        the gate must independently re-validate id/release_ref, not only recompute completeness/aggregation
        against whatever those fields happen to say."""
        record = _valid_record()
        record["id"] = ""
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id/release_ref missing or empty")

    def test_hand_tampered_empty_release_ref_fails_the_gate(self):
        record = _valid_record()
        record["release_ref"] = ""
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id/release_ref missing or empty")

    def test_hand_tampered_extra_field_on_an_assessment_fails_the_gate(self):
        """Regression for the critic-caught Major (M3): the gate must reject an assessment carrying an
        attacker-controlled extra field, the same shape the builder's own rebuild-from-known-fields already
        defends against -- the gate has no rebuild step, so this check is its ONLY defense."""
        record = _valid_record()
        record["domain_assessments"][0]["signed_off_by"] = "nobody"
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more assessments carries an unknown extra field")

    def test_hand_tampered_wrong_count_fails_the_gate(self):
        record = _valid_record()
        record["domain_assessments"] = record["domain_assessments"][:5]
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "domain_assessments missing, not a list, or not exactly six entries")

    def test_hand_tampered_invalid_overall_status_fails_the_gate(self):
        record = _valid_record()
        record["overall_status"] = "sort_of_ready"
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "overall_status is not 'ready' or 'not_ready'")

    def test_non_dict_assessment_fails_the_gate_not_a_crash(self):
        """Regression for a critic-caught weak oracle: an un-pinned status=='FAIL' assertion here could not
        distinguish this specific guard firing from the missing-domain guard firing for an unrelated reason
        (a real mutation deleting the invalid-assessment check was proven, during this slice's own critic
        review, to leave this test green). Pinned to the specific reason now."""
        record = _valid_record()
        record["domain_assessments"] = ["not-a-dict"] * 6
        gate = evaluate_readiness_integrity_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more assessments carries an unknown extra field")

    def test_non_dict_record_fails_the_gates_not_a_crash(self):
        """Regression for a critic-caught Minor: both gates must fail closed on a non-dict record (None, a
        string, a list), not raise a raw AttributeError from `.get()` -- the gate docstrings both claim
        fail-closed behavior unconditionally."""
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_readiness_integrity_gate(bad_record, "test", "2026-09-05T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")
                provenance_gate = evaluate_provenance_required_gate(bad_record, "test", "2026-09-05T00:00:00Z")
                self.assertEqual(provenance_gate["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-05T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
