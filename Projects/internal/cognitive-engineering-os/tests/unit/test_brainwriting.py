"""Mutation-style tests for ``divergent.brainwriting`` (F03 divergent-ideation family, FIRST member).

Two real invariants beyond per-field shape (2+ DISTINCT contributor_id values across
``individual_contributions``, referential integrity from ``merged_ideas[].source_contribution_refs``
back to ``individual_contributions[].id``), exercised at BOTH layers: construction-time refusal
(``generate_brainwriting_session`` raising a specific ``InvariantViolation`` code) and independent
gate re-derivation (``evaluate_brainwriting_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely, never calling the builder itself). Schema conformance is checked
against the real spec-root schema this same slice added
(``typed-objects/brainwriting-session.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.divergent.brainwriting import (
    METHOD_ID,
    MIN_DISTINCT_CONTRIBUTORS,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_brainwriting_gates,
    evaluate_brainwriting_integrity_gate,
    evaluate_provenance_required_gate,
    generate_brainwriting_session,
    individual_contribution,
    merged_idea,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

BRAINWRITING_SCHEMA = "ai-lego://specs/cognitive/typed-objects/brainwriting-session.schema.yaml"


def _contributions(**overrides: dict) -> list[dict]:
    base = {
        "alice_1": dict(contribution_id="IC-1", contributor_id="user-alice", idea_text="推出訂閱制方案，降低客戶進入門檻"),
        "bob_1": dict(contribution_id="IC-2", contributor_id="user-bob", idea_text="按月訂閱搭配前三個月折扣"),
        "carol_1": dict(contribution_id="IC-3", contributor_id="user-carol", idea_text="開放企業客戶客製化議價"),
        "alice_2": dict(contribution_id="IC-4", contributor_id="user-alice", idea_text="提供年繳方案並附加額外服務"),
    }
    base.update(overrides)
    return [individual_contribution(v["contribution_id"], v["contributor_id"], v["idea_text"], make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")) for v in base.values()]


def _merged_ideas(**overrides: dict) -> list[dict]:
    base = {
        "mi_1": dict(merged_idea_id="MI-1", source_contribution_refs=["IC-1", "IC-2", "IC-4"]),
        "mi_2": dict(merged_idea_id="MI-2", source_contribution_refs=["IC-3"]),
    }
    base.update(overrides)
    return [merged_idea(v["merged_idea_id"], v["source_contribution_refs"]) for v in base.values()]


def _valid_session(
    *,
    session_id: str = "BRAINWRITE-T-001",
    individual_contributions: list[dict] | None = None,
    merged_ideas: list[dict] | None = None,
):
    return generate_brainwriting_session(
        session_id,
        individual_contributions if individual_contributions is not None else _contributions(),
        merged_ideas if merged_ideas is not None else _merged_ideas(),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_session_validates_against_the_real_schema(self):
        self.contracts.validate(BRAINWRITING_SCHEMA, _valid_session(), "brainwriting session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, session = live.invoke(METHOD_ID, generate_brainwriting_session, "BRAINWRITE-T-INVOKE", _contributions(), _merged_ideas())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/divergent.brainwriting.contract.yaml")
        self.assertEqual(session["id"], "BRAINWRITE-T-INVOKE")

    def test_empty_catalog_blocks_brainwriting_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_session())
        tampered["merged_ideas"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BRAINWRITING_SCHEMA, tampered, "tampered session")
        gate = evaluate_brainwriting_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        session = _valid_session()
        session["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BRAINWRITING_SCHEMA, session, "session with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_an_individual_contributions_entry(self):
        session = _valid_session()
        session["individual_contributions"][0] = {**session["individual_contributions"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BRAINWRITING_SCHEMA, session, "session with a smuggled individual_contributions[] key")

    def test_schema_rejects_an_unknown_key_inside_a_merged_ideas_entry(self):
        session = _valid_session()
        session["merged_ideas"][0] = {**session["merged_ideas"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BRAINWRITING_SCHEMA, session, "session with a smuggled merged_ideas[] key")

    def test_schema_rejects_a_single_item_individual_contributions_list(self):
        """minItems:2 -- a real necessary condition for the 2+-distinct-contributor invariant (see
        schema's own compilation_decisions)."""
        session = _valid_session()
        session["individual_contributions"] = session["individual_contributions"][:1]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BRAINWRITING_SCHEMA, session, "session with only 1 contribution")

    def test_id_is_distinct_from_strategy_bcg_matrix_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.bcg_matrix")
        self.assertEqual(METHOD_ID, "divergent.brainwriting")

    def test_brainwriting_and_bcg_matrix_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.bcg_matrix"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated
        against specs/cognitive/method.schema.yaml') true going forward, same live check every
        sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "divergent.brainwriting.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "divergent.brainwriting contract")


class IndividualContributionVocabularyTests(unittest.TestCase):
    def test_min_distinct_contributors_constant(self):
        self.assertEqual(MIN_DISTINCT_CONTRIBUTORS, 2)

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BRAINWRITE-")

    def test_individual_contribution_rejects_an_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_EMPTY_CONTRIBUTION_ID"):
            individual_contribution("   ", "user-alice", "idea", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"))

    def test_individual_contribution_rejects_an_empty_contributor_id(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_EMPTY_CONTRIBUTOR_ID"):
            individual_contribution("IC-1", "   ", "idea", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"))

    def test_individual_contribution_rejects_an_empty_idea_text(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_EMPTY_IDEA_TEXT"):
            individual_contribution("IC-1", "user-alice", "   ", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"))

    def test_individual_contribution_rejects_invalid_provenance(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_INVALID_PROVENANCE"):
            individual_contribution("IC-1", "user-alice", "idea", {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_ORIGINAL"})

    def test_individual_contribution_does_not_leak_extra_keys(self):
        entry = individual_contribution("IC-1", "user-alice", "idea", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL"))
        self.assertEqual(set(entry.keys()), {"id", "contributor_id", "idea_text", "provenance"})


class MergedIdeaConstructorTests(unittest.TestCase):
    def test_merged_idea_rejects_an_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_EMPTY_MERGED_IDEA_ID"):
            merged_idea("   ", ["IC-1"])

    def test_merged_idea_rejects_an_empty_source_refs_list(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_EMPTY_SOURCE_REFS"):
            merged_idea("MI-1", [])

    def test_merged_idea_rejects_a_non_list_source_refs(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_EMPTY_SOURCE_REFS"):
            merged_idea("MI-1", "IC-1")

    def test_merged_idea_rejects_a_blank_ref_entry(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_EMPTY_SOURCE_REFS"):
            merged_idea("MI-1", ["IC-1", "   "])

    def test_merged_idea_does_not_leak_extra_keys(self):
        entry = merged_idea("MI-1", ["IC-1"])
        self.assertEqual(set(entry.keys()), {"id", "source_contribution_refs"})


class ContributorDiversityTests(unittest.TestCase):
    """Invariant 1 (module docstring): individual_contributions must collectively carry 2+ DISTINCT
    contributor_id values."""

    def test_3_distinct_contributors_across_4_contributions_is_accepted(self):
        session = _valid_session()
        self.assertEqual(len(session["individual_contributions"]), 4)
        distinct = {c["contributor_id"] for c in session["individual_contributions"]}
        self.assertEqual(len(distinct), 3)

    def test_exactly_2_distinct_contributors_is_accepted(self):
        session = generate_brainwriting_session(
            "BRAINWRITE-T-TWO",
            [
                individual_contribution("IC-1", "user-alice", "idea one", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
                individual_contribution("IC-2", "user-bob", "idea two", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
            ],
            [merged_idea("MI-1", ["IC-1", "IC-2"])],
        )
        self.assertEqual(len({c["contributor_id"] for c in session["individual_contributions"]}), 2)

    def test_large_diverse_contribution_set_is_accepted(self):
        """Open-ended, no maxItems -- unbounded number of contributions/contributors."""
        contributions = [individual_contribution(f"IC-{i}", f"user-{i}", f"idea {i}", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")) for i in range(10)]
        session = generate_brainwriting_session("BRAINWRITE-T-LARGE", contributions, [merged_idea("MI-1", [c["id"] for c in contributions])])
        self.assertEqual(len(session["individual_contributions"]), 10)

    def test_insufficient_contributions_count_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_INSUFFICIENT_CONTRIBUTIONS"):
            generate_brainwriting_session("BRAINWRITE-T-TOOFEW", _contributions()[:1], _merged_ideas())

    def test_empty_individual_contributions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_INSUFFICIENT_CONTRIBUTIONS"):
            generate_brainwriting_session("BRAINWRITE-T-EMPTY", [], _merged_ideas())

    def test_non_list_individual_contributions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_INSUFFICIENT_CONTRIBUTIONS"):
            generate_brainwriting_session("BRAINWRITE-T-NONLIST", "not a list", _merged_ideas())

    def test_duplicate_contribution_id_is_refused(self):
        contributions = _contributions()
        contributions[1] = {**contributions[1], "id": contributions[0]["id"]}
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_DUPLICATE_CONTRIBUTION_ID"):
            generate_brainwriting_session("BRAINWRITE-T-DUPID", contributions, _merged_ideas())

    def test_all_contributions_from_a_single_contributor_is_refused(self):
        """The core purpose-grounded invariant: 2 contributions is not enough if they share one
        contributor_id -- '先各自寫' / '降低權威/外向者主導' requires actual diversity, not just count."""
        single_voice = [
            individual_contribution("IC-1", "user-alice", "idea one", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
            individual_contribution("IC-2", "user-alice", "idea two", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
            individual_contribution("IC-3", "user-alice", "idea three", make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")),
        ]
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_SINGLE_CONTRIBUTOR"):
            generate_brainwriting_session("BRAINWRITE-T-SINGLEVOICE", single_voice, [merged_idea("MI-1", ["IC-1", "IC-2", "IC-3"])])


class ReferentialIntegrityTests(unittest.TestCase):
    """Invariant 2 (module docstring): every merged_ideas[].source_contribution_refs entry must
    resolve to a real individual_contributions[].id. NOT bijective -- no completeness/uniqueness-of-
    coverage requirement (see module docstring)."""

    def test_dangling_ref_is_refused(self):
        merged = [merged_idea("MI-1", ["IC-NONEXISTENT"])]
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_DANGLING_SOURCE_REF"):
            generate_brainwriting_session("BRAINWRITE-T-DANGLING", _contributions(), merged)

    def test_partial_dangling_ref_among_valid_refs_is_refused(self):
        merged = [merged_idea("MI-1", ["IC-1", "IC-NONEXISTENT"])]
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_DANGLING_SOURCE_REF"):
            generate_brainwriting_session("BRAINWRITE-T-PARTIALDANGLING", _contributions(), merged)

    def test_not_every_contribution_needs_to_be_referenced(self):
        """Deliberately NOT a bijection, unlike decomposition.objective_tree -- a real merge step can
        discard raw contributions."""
        merged = [merged_idea("MI-1", ["IC-1"])]  # IC-2, IC-3, IC-4 never referenced
        session = generate_brainwriting_session("BRAINWRITE-T-PARTIALCOVERAGE", _contributions(), merged)
        self.assertEqual(len(session["merged_ideas"]), 1)

    def test_the_same_contribution_may_be_referenced_by_more_than_one_merged_idea(self):
        merged = [merged_idea("MI-1", ["IC-1"]), merged_idea("MI-2", ["IC-1"])]
        session = generate_brainwriting_session("BRAINWRITE-T-SHAREDREF", _contributions(), merged)
        self.assertEqual(len(session["merged_ideas"]), 2)

    def test_empty_merged_ideas_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_EMPTY_MERGED_IDEAS"):
            generate_brainwriting_session("BRAINWRITE-T-EMPTYMERGED", _contributions(), [])

    def test_duplicate_merged_idea_id_is_refused(self):
        merged = _merged_ideas()
        merged[1] = {**merged[1], "id": merged[0]["id"]}
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_DUPLICATE_MERGED_IDEA_ID"):
            generate_brainwriting_session("BRAINWRITE-T-DUPMERGEDID", _contributions(), merged)


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_INVALID_ID"):
            _valid_session(session_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_INVALID_ID"):
            _valid_session(session_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINWRITE_INVALID_VERSION"):
            generate_brainwriting_session("BRAINWRITE-T-002", _contributions(), _merged_ideas(), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID session's raw dict directly (never going through the builder again), then
    call the gate. These prove the gate re-derives from raw fields rather than trusting the builder's
    own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_session(self):
        gate = evaluate_brainwriting_integrity_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_insufficient_contributions(self):
        session = copy.deepcopy(_valid_session())
        session["individual_contributions"] = session["individual_contributions"][:1]
        gate = evaluate_brainwriting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_single_contributor_collapse(self):
        session = copy.deepcopy(_valid_session())
        session["individual_contributions"] = [{**c, "contributor_id": "user-alice"} for c in session["individual_contributions"]]
        gate = evaluate_brainwriting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_merged_ideas(self):
        session = copy.deepcopy(_valid_session())
        session["merged_ideas"] = []
        gate = evaluate_brainwriting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_dangling_source_ref(self):
        session = copy.deepcopy(_valid_session())
        session["merged_ideas"][0]["source_contribution_refs"] = ["IC-NONEXISTENT"]
        gate = evaluate_brainwriting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_session(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_brainwriting_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        session = copy.deepcopy(_valid_session())
        session["id"] = "WRONG-001"
        gate = evaluate_brainwriting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        session = copy.deepcopy(_valid_session())
        session["version"] = 1
        gate = evaluate_brainwriting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_duplicate_contribution_id(self):
        session = copy.deepcopy(_valid_session())
        session["individual_contributions"][1]["id"] = session["individual_contributions"][0]["id"]
        gate = evaluate_brainwriting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_duplicate_merged_idea_id(self):
        session = copy.deepcopy(_valid_session())
        session["merged_ideas"][1]["id"] = session["merged_ideas"][0]["id"]
        gate = evaluate_brainwriting_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_contribution_provenance_invalid(self):
        session = copy.deepcopy(_valid_session())
        session["individual_contributions"][0]["provenance"] = None
        gate = evaluate_provenance_required_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_empty_individual_contributions(self):
        gate = evaluate_provenance_required_gate({"individual_contributions": []}, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_brainwriting_gates_returns_two_gates_in_order(self):
        results = evaluate_brainwriting_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "brainwriting_integrity"])

    def test_evaluate_brainwriting_gates_all_pass_on_a_valid_session(self):
        results = evaluate_brainwriting_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "divergent.brainwriting")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        session = _valid_session()
        self.assertEqual(set(session.keys()), {"id", "version", "generated_by_method", "individual_contributions", "merged_ideas"})


if __name__ == "__main__":
    unittest.main()
