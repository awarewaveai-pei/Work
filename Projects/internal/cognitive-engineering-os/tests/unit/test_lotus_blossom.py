"""Mutation-style tests for ``divergent.lotus_blossom`` (F03 發散式創意 family).

Two real invariants beyond per-field shape (top-level branch_number completeness/distinctness over 1-8;
per-branch nested exactly-8-ideas completeness), exercised at BOTH layers: construction-time refusal
(``generate_lotus_blossom_session`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_lotus_blossom_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/lotus-blossom-session.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.divergent.lotus_blossom import (
    BRANCH_NUMBERS,
    IDEAS_PER_BRANCH,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    branch_entry,
    evaluate_lotus_blossom_gates,
    evaluate_lotus_blossom_integrity_gate,
    evaluate_provenance_required_gate,
    generate_lotus_blossom_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

LOTUS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/lotus-blossom-session.schema.yaml"
CENTER_THEME = "提升新用戶 onboarding 留存率"


def _ideas(prefix: str) -> list[str]:
    return [f"{prefix}-idea-{i}" for i in range(1, 9)]


def _branches(**overrides: dict) -> list[dict]:
    base = {n: dict(branch_number=n, branch_theme=f"branch-theme-{n}", ideas=_ideas(f"b{n}")) for n in range(1, 9)}
    base.update(overrides)
    return [branch_entry(v["branch_number"], v["branch_theme"], v["ideas"]) for v in base.values()]


def _valid_session(
    *,
    session_id: str = "LOTUS-T-001",
    center_theme: str = CENTER_THEME,
    branches: list[dict] | None = None,
    provenance: dict | None = None,
):
    return generate_lotus_blossom_session(
        session_id,
        center_theme,
        branches if branches is not None else _branches(),
        provenance if provenance is not None else make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_session_validates_against_the_real_schema(self):
        self.contracts.validate(LOTUS_SCHEMA, _valid_session(), "lotus blossom session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, session = live.invoke(
            METHOD_ID, generate_lotus_blossom_session, "LOTUS-T-INVOKE", CENTER_THEME, _branches(), make_provenance("HYPOTHESIS", "AI_SUGGESTED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/divergent.lotus_blossom.contract.yaml")
        self.assertEqual(session["id"], "LOTUS-T-INVOKE")

    def test_empty_catalog_blocks_lotus_blossom_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_session())
        tampered["branches"] = tampered["branches"][:7]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LOTUS_SCHEMA, tampered, "tampered session")
        gate = evaluate_lotus_blossom_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        session = _valid_session()
        session["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LOTUS_SCHEMA, session, "session with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_branches_entry(self):
        session = _valid_session()
        session["branches"][0] = {**session["branches"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LOTUS_SCHEMA, session, "session with a smuggled branches[] key")

    def test_id_is_distinct_from_strategy_ansoff_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.ansoff")
        self.assertEqual(METHOD_ID, "divergent.lotus_blossom")

    def test_lotus_blossom_and_ansoff_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.ansoff"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "divergent.lotus_blossom.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "divergent.lotus_blossom contract")


class ConstantsTests(unittest.TestCase):
    def test_branch_numbers_is_exactly_one_through_eight(self):
        self.assertEqual(BRANCH_NUMBERS, frozenset({1, 2, 3, 4, 5, 6, 7, 8}))

    def test_ideas_per_branch_is_eight(self):
        self.assertEqual(IDEAS_PER_BRANCH, 8)

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "LOTUS-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "divergent.lotus_blossom")


class BranchEntryTests(unittest.TestCase):
    def test_branch_entry_rejects_an_unknown_branch_number(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_BRANCH_NUMBER"):
            branch_entry(9, "not one of the eight", _ideas("x"))

    def test_branch_entry_rejects_branch_number_zero(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_BRANCH_NUMBER"):
            branch_entry(0, "not one of the eight", _ideas("x"))

    def test_branch_entry_rejects_bool_masquerading_as_branch_number(self):
        """Critic finding, 2026-09-11: bool is a subclass of int -- True/False must never masquerade as 1/0."""
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_BRANCH_NUMBER"):
            branch_entry(True, "bool must not masquerade as int", _ideas("x"))

    def test_branch_entry_rejects_an_empty_branch_theme(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_EMPTY_BRANCH_THEME"):
            branch_entry(1, "   ", _ideas("x"))

    def test_branch_entry_rejects_seven_ideas(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_IDEAS_COUNT"):
            branch_entry(1, "theme", _ideas("x")[:7])

    def test_branch_entry_rejects_nine_ideas(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_IDEAS_COUNT"):
            branch_entry(1, "theme", _ideas("x") + ["one-too-many"])

    def test_branch_entry_rejects_an_empty_idea_among_eight(self):
        ideas = _ideas("x")
        ideas[3] = "   "
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_IDEAS_COUNT"):
            branch_entry(1, "theme", ideas)

    def test_branch_entry_accepts_all_8_branch_numbers(self):
        for n in sorted(BRANCH_NUMBERS):
            entry = branch_entry(n, f"theme-{n}", _ideas(f"n{n}"))
            self.assertEqual(entry["branch_number"], n)
            self.assertEqual(len(entry["ideas"]), 8)

    def test_branch_entry_does_not_leak_extra_keys(self):
        entry = branch_entry(1, "theme", _ideas("x"))
        self.assertEqual(set(entry.keys()), {"branch_number", "branch_theme", "ideas"})


class BranchSetCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): branches must name EXACTLY BRANCH_NUMBERS 1-8, each exactly once, in
    any order -- the top-level "closed SET, unordered, completeness required" design-shape invariant."""

    def test_valid_8_branches_in_canonical_order_is_accepted(self):
        session = _valid_session()
        self.assertEqual(len(session["branches"]), 8)

    def test_valid_8_branches_in_a_shuffled_order_is_also_accepted(self):
        """Order carries no meaning Atlas cites -- same "no position enforced" discipline
        strategy.ansoff.py's own identical test establishes."""
        branches = _branches()
        shuffled = [branches[7], branches[2], branches[0], branches[5], branches[1], branches[6], branches[3], branches[4]]
        session = generate_lotus_blossom_session("LOTUS-T-SHUFFLED", CENTER_THEME, shuffled, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual({b["branch_number"] for b in session["branches"]}, BRANCH_NUMBERS)

    def test_seven_branches_missing_branch_8_is_refused(self):
        branches = _branches()[:7]  # drops branch_number 8 (dict insertion order preserved -- it is last)
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INCOMPLETE_BRANCH_SET"):
            generate_lotus_blossom_session("LOTUS-T-SEVEN", CENTER_THEME, branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_nine_branches_is_refused(self):
        branches = _branches() + [branch_entry(1, "a 9th duplicate entry", _ideas("dup"))]
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INCOMPLETE_BRANCH_SET"):
            generate_lotus_blossom_session("LOTUS-T-NINE", CENTER_THEME, branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_missing_all_branches_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INCOMPLETE_BRANCH_SET"):
            generate_lotus_blossom_session("LOTUS-T-EMPTY", CENTER_THEME, [], make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_duplicate_branch_number_replacing_a_different_one_is_refused(self):
        """8 entries where branch_number 1 is duplicated and branch_number 8 is entirely missing must still
        be refused by the runtime completeness check -- same shape count (8), still incomplete."""
        branches = _branches()[:7] + [_branches()[0]]  # branch 1 appears twice, branch 8 missing
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INCOMPLETE_BRANCH_SET"):
            generate_lotus_blossom_session("LOTUS-T-DUP", CENTER_THEME, branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_non_list_branches_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_BRANCH_SET"):
            generate_lotus_blossom_session("LOTUS-T-NONLIST", CENTER_THEME, "not a list", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_unknown_branch_number_smuggled_in_via_raw_dict_is_refused(self):
        branches = _branches()[:7] + [{"branch_number": 9, "branch_theme": "x", "ideas": _ideas("x")}]
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_BRANCH_NUMBER"):
            generate_lotus_blossom_session("LOTUS-T-UNKNOWNBRANCH", CENTER_THEME, branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))


class NestedIdeasCountTests(unittest.TestCase):
    """Invariant 2 (module docstring): every branch's OWN ideas list must be EXACTLY 8 non-empty entries --
    independent of and nested inside invariant 1's top-level 8-branch completeness."""

    def test_one_branch_with_seven_ideas_is_refused(self):
        branches = _branches()
        branches[0] = {**branches[0], "ideas": branches[0]["ideas"][:7]}
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_IDEAS_COUNT"):
            generate_lotus_blossom_session("LOTUS-T-SEVENIDEAS", CENTER_THEME, branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_one_branch_with_nine_ideas_is_refused(self):
        branches = _branches()
        branches[0] = {**branches[0], "ideas": branches[0]["ideas"] + ["one-too-many"]}
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_IDEAS_COUNT"):
            generate_lotus_blossom_session("LOTUS-T-NINEIDEAS", CENTER_THEME, branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_one_branch_with_an_empty_idea_string_is_refused(self):
        branches = _branches()
        ideas = list(branches[0]["ideas"])
        ideas[2] = "   "
        branches[0] = {**branches[0], "ideas": ideas}
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_IDEAS_COUNT"):
            generate_lotus_blossom_session("LOTUS-T-EMPTYIDEA", CENTER_THEME, branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_one_branch_with_non_list_ideas_is_refused(self):
        branches = _branches()
        branches[0] = {**branches[0], "ideas": "not a list"}
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_IDEAS_COUNT"):
            generate_lotus_blossom_session("LOTUS-T-IDEASNOTLIST", CENTER_THEME, branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_empty_branch_theme_is_refused(self):
        branches = _branches()
        branches[0] = {**branches[0], "branch_theme": ""}
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_EMPTY_BRANCH_THEME"):
            generate_lotus_blossom_session("LOTUS-T-EMPTYTHEME", CENTER_THEME, branches, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_all_8_branches_can_independently_carry_exactly_8_ideas_each(self):
        session = _valid_session()
        for branch in session["branches"]:
            self.assertEqual(len(branch["ideas"]), IDEAS_PER_BRANCH)


class CenterThemeIdAndVersionTests(unittest.TestCase):
    def test_empty_center_theme_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_EMPTY_CENTER_THEME"):
            generate_lotus_blossom_session("LOTUS-T-002", "   ", _branches(), make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_ID"):
            _valid_session(session_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_ID"):
            _valid_session(session_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOTUS_INVALID_VERSION"):
            generate_lotus_blossom_session("LOTUS-T-003", CENTER_THEME, _branches(), make_provenance("HYPOTHESIS", "AI_SUGGESTED"), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID session's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_session(self):
        gate = evaluate_lotus_blossom_integrity_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_branch(self):
        session = copy.deepcopy(_valid_session())
        session["branches"] = session["branches"][:7]
        gate = evaluate_lotus_blossom_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicated_branch(self):
        session = copy.deepcopy(_valid_session())
        session["branches"] = session["branches"][:7] + [session["branches"][0]]
        gate = evaluate_lotus_blossom_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_short_ideas_list(self):
        session = copy.deepcopy(_valid_session())
        session["branches"][0]["ideas"] = session["branches"][0]["ideas"][:7]
        gate = evaluate_lotus_blossom_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_long_ideas_list(self):
        session = copy.deepcopy(_valid_session())
        session["branches"][0]["ideas"] = session["branches"][0]["ideas"] + ["one-too-many"]
        gate = evaluate_lotus_blossom_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_branch_theme(self):
        session = copy.deepcopy(_valid_session())
        session["branches"][0]["branch_theme"] = ""
        gate = evaluate_lotus_blossom_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_bool_masquerading_as_branch_number(self):
        """Critic finding, 2026-09-11: ``bool`` is a subclass of ``int`` in Python (``True == 1``) -- a
        hand-tampered ``branch_number: True`` standing in for branch 1 must NOT be accepted by either the
        builder or the independent gate, same guard ``crazy_eights``/``six_three_five`` already establish
        for their own structurally identical closed-integer-enum fields."""
        session = copy.deepcopy(_valid_session())
        session["branches"][0]["branch_number"] = True  # was 1
        gate = evaluate_lotus_blossom_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_center_theme(self):
        session = copy.deepcopy(_valid_session())
        session["center_theme"] = ""
        gate = evaluate_lotus_blossom_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_session(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_lotus_blossom_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        session = copy.deepcopy(_valid_session())
        session["id"] = "WRONG-001"
        gate = evaluate_lotus_blossom_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        session = copy.deepcopy(_valid_session())
        session["version"] = 1
        gate = evaluate_lotus_blossom_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    """RECORD-LEVEL only (module docstring) -- unlike ansoff/bcg, there is no per-branch provenance to check
    here at all."""

    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        session = copy.deepcopy(_valid_session())
        session["provenance"] = None
        gate = evaluate_provenance_required_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_missing_provenance_key(self):
        gate = evaluate_provenance_required_gate({"branches": []}, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_lotus_blossom_gates_returns_two_gates_in_order(self):
        results = evaluate_lotus_blossom_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "lotus_blossom_integrity"])

    def test_evaluate_lotus_blossom_gates_all_pass_on_a_valid_session(self):
        results = evaluate_lotus_blossom_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_builder_does_not_leak_extra_top_level_keys(self):
        session = _valid_session()
        self.assertEqual(set(session.keys()), {"id", "version", "generated_by_method", "center_theme", "branches", "provenance"})


if __name__ == "__main__":
    unittest.main()
