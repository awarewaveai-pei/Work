"""Mutation-style tests for ``root_cause.fishbone`` (second Method Atlas slice, F05 root-cause family).

Every builder output is validated against the real, ratified spec-root schema
(``typed-objects/problem-statement.schema.yaml``,
``typed-objects/cause-hypothesis-set.schema.yaml``,
``typed-objects/root-cause-fact.schema.yaml``) -- this is not a
self-consistency check against a schema this test file invents, it is
conformance against files that predate this module by a full session's
governance process. The forbidden-transition guard is proven both ways: the
direct path must raise, and the legal path (after
``record_validation_applied``) must succeed and itself validate.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.root_cause.fishbone import (
    METHOD_ID,
    all_gates_pass,
    attempt_promote_to_root_cause_fact,
    build_problem_statement,
    cause_hypothesis,
    evaluate_evidence_labeling_required_gate,
    evaluate_fishbone_gates,
    evaluate_provenance_required_gate,
    generate_cause_hypothesis_set,
    record_validation_applied,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

PROBLEM_STATEMENT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/problem-statement.schema.yaml"
CAUSE_HYPOTHESIS_SET_SCHEMA = "ai-lego://specs/cognitive/typed-objects/cause-hypothesis-set.schema.yaml"
ROOT_CAUSE_FACT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/root-cause-fact.schema.yaml"


def _content():
    return {
        "current_state": "訂單取消率本月上升至 8%",
        "expected_state": "訂單取消率維持在 2% 基準線",
        "gap": "6 個百分點的異常上升",
    }


def _validated_problem_statement():
    return build_problem_statement("PROB-T-001", _content(), make_provenance("EVIDENCE", "HUMAN_APPROVED"))


def _hypotheses():
    return [
        cause_hypothesis("CHS-T-001-H1", "電商系統與 ERP 之間庫存事件未即時同步", "Technology", make_provenance("EVIDENCE", "AI_SUGGESTED"), supporting_evidence_refs=["order_log.csv"]),
        cause_hypothesis("CHS-T-001-H2", "客服人員手動確認流程造成延遲", "Process", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]


def _valid_set():
    return generate_cause_hypothesis_set("CHS-T-001", _validated_problem_statement(), _hypotheses())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_problem_statement_validates_against_the_real_schema(self):
        self.contracts.validate(PROBLEM_STATEMENT_SCHEMA, _validated_problem_statement(), "problem statement")

    def test_draft_problem_statement_is_schema_legal_but_fails_the_fishbone_precondition(self):
        draft = build_problem_statement("PROB-T-002", _content(), make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"), status="draft")
        self.contracts.validate(PROBLEM_STATEMENT_SCHEMA, draft, "draft problem statement")  # schema allows draft
        with self.assertRaisesRegex(InvariantViolation, "FISHBONE_PRECONDITION_FAILED"):
            generate_cause_hypothesis_set("CHS-T-002", draft, _hypotheses())

    def test_cause_hypothesis_set_validates_against_the_real_schema(self):
        self.contracts.validate(CAUSE_HYPOTHESIS_SET_SCHEMA, _valid_set(), "cause hypothesis set")

    def test_empty_hypotheses_is_refused_before_any_schema_check(self):
        with self.assertRaisesRegex(InvariantViolation, "FISHBONE_EMPTY_HYPOTHESIS_SET"):
            generate_cause_hypothesis_set("CHS-T-003", _validated_problem_statement(), [])

    def test_root_cause_fact_validates_against_the_real_schema_on_the_legal_path(self):
        chs = record_validation_applied(_valid_set(), ["root_cause.five_whys"])
        rcf = attempt_promote_to_root_cause_fact("RCF-T-001", chs, "CHS-T-001-H1", "statement", True, make_provenance("SOURCE_FACT", "HUMAN_APPROVED"))
        self.contracts.validate(ROOT_CAUSE_FACT_SCHEMA, rcf, "root cause fact")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, chs = live.invoke(METHOD_ID, generate_cause_hypothesis_set, "CHS-T-INVOKE", _validated_problem_statement(), _hypotheses())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/root_cause.fishbone.contract.yaml")
        self.assertEqual(chs["id"], "CHS-T-INVOKE")

    def test_empty_catalog_blocks_fishbone_the_same_way_it_blocks_qualitative_coding(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_set_passes_both_gates(self):
        results = evaluate_fishbone_gates(_valid_set(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "evidence_labeling_required"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        chs = _valid_set()
        chs["hypotheses"][0] = {**chs["hypotheses"][0], "provenance": None}
        provenance_gate = evaluate_provenance_required_gate(chs, "test", "2026-09-04T00:00:00Z")
        evidence_gate = evaluate_evidence_labeling_required_gate(chs, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(provenance_gate["status"], "FAIL")
        self.assertIn("CHS-T-001-H1", provenance_gate["evidence"][0]["invalid_provenance_ids"])
        self.assertEqual(evidence_gate["status"], "FAIL")  # no epistemic_type to check either

    def test_evidence_labeled_hypothesis_with_no_supporting_refs_fails_evidence_labeling_gate(self):
        """The real structural check: claiming EVIDENCE without citing evidence is a fabricated-evidence-shaped
        defect, same class the qualitative-coding gates.py docstring names -- not a constant the producer always
        writes the same way."""
        chs = _valid_set()
        fabricated = cause_hypothesis("CHS-T-001-H3", "unsupported claim", "Technology", make_provenance("EVIDENCE", "AI_SUGGESTED"))
        chs["hypotheses"].append(fabricated)
        gate = evaluate_evidence_labeling_required_gate(chs, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        problems = gate["evidence"][0]["problems"]
        self.assertTrue(any(p["id"] == "CHS-T-001-H3" for p in problems))

    def test_hypothesis_gate_passes_have_real_evidence_not_an_empty_constant(self):
        results = evaluate_fishbone_gates(_valid_set(), "test", "2026-09-04T00:00:00Z")
        self.assertTrue(all(r["evidence"] for r in results))


class ForbiddenTransitionTests(unittest.TestCase):
    """Atlas SS9 forbidden_transition / SS11.4 L1267: CauseHypothesisSet -> RootCauseFact (direct) is refused."""

    def test_direct_promotion_on_a_freshly_generated_set_is_refused(self):
        chs = _valid_set()  # promotion.validation_methods_applied == [] by construction
        with self.assertRaisesRegex(InvariantViolation, "FORBIDDEN_TRANSITION_BLOCKED"):
            attempt_promote_to_root_cause_fact("RCF-T-BLOCKED", chs, "CHS-T-001-H1", "statement", False, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_ready_for_promotion_false_still_refuses_even_if_validation_methods_applied_is_nonempty_but_flag_is_stale(self):
        """Mutation-style: an inconsistent record (list non-empty, flag not recomputed) must still be refused --
        the guard checks BOTH fields, it does not trust the caller's derived flag alone."""
        chs = _valid_set()
        chs["promotion"] = {"validation_methods_applied": ["root_cause.five_whys"], "ready_for_promotion": False}
        with self.assertRaisesRegex(InvariantViolation, "FORBIDDEN_TRANSITION_BLOCKED"):
            attempt_promote_to_root_cause_fact("RCF-T-STALE", chs, "CHS-T-001-H1", "statement", False, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_record_validation_applied_does_not_mutate_the_input_set(self):
        original = _valid_set()
        updated = record_validation_applied(original, ["root_cause.five_whys"])
        self.assertEqual(original["promotion"], {"validation_methods_applied": [], "ready_for_promotion": False})
        self.assertEqual(updated["promotion"], {"validation_methods_applied": ["root_cause.five_whys"], "ready_for_promotion": True})

    def test_legal_promotion_after_a_real_validation_method_succeeds(self):
        chs = record_validation_applied(_valid_set(), ["root_cause.five_whys", "causal.dag"])
        rcf = attempt_promote_to_root_cause_fact("RCF-T-LEGAL", chs, "CHS-T-001-H1", "statement", True, make_provenance("SOURCE_FACT", "HUMAN_APPROVED"))
        self.assertEqual(rcf["source_cause_hypothesis_set_ref"], "CHS-T-001")
        self.assertEqual(rcf["legal_promotion_path"]["validation_methods_applied"], ["root_cause.five_whys", "causal.dag"])

    def test_promoting_an_unknown_hypothesis_id_is_refused(self):
        chs = record_validation_applied(_valid_set(), ["root_cause.five_whys"])
        with self.assertRaisesRegex(InvariantViolation, "UNKNOWN_HYPOTHESIS_ID"):
            attempt_promote_to_root_cause_fact("RCF-T-UNKNOWN", chs, "CHS-DOES-NOT-EXIST", "statement", True, make_provenance("SOURCE_FACT", "HUMAN_APPROVED"))


if __name__ == "__main__":
    unittest.main()
