"""Mutation-style tests for ``decomposition.problem_tree`` (F02 decomposition & structuring family, opening
member).

Real invariants beyond per-field shape (non-empty causes, non-empty effects, schema-valid per-item
provenance): within-causes id uniqueness, within-effects id uniqueness, and the method's CORE invariant
(causes[].id / effects[].id cross-list disjointness) -- the latter two added/fixed post-critic-review,
2026-09-11 (see ``ai_lego/modules/decomposition/problem_tree.py`` module docstring). All exercised at BOTH
layers: construction-time refusal (``generate_problem_tree`` raising a specific ``InvariantViolation`` code)
and independent gate re-derivation (``evaluate_problem_tree_integrity_gate`` catching a hand-tampered raw
dict that bypassed the builder entirely, never calling the builder itself). Schema conformance is checked
against the real spec-root schema this same slice added (``typed-objects/problem-tree.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decomposition.problem_tree import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_problem_tree_gates,
    evaluate_problem_tree_integrity_gate,
    generate_problem_tree,
    tree_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

PROBLEM_TREE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/problem-tree.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "AI_SUGGESTED")


def _core_problem() -> str:
    return "existing customer renewal rate has declined for three consecutive quarters"


def _causes(**overrides: dict) -> list[dict]:
    base = {
        "c1": ("C1", "support first-response time has stretched past 48 hours on average"),
        "c2": ("C2", "a new product release disrupted existing workflows, raising the relearning cost for customers"),
    }
    base.update(overrides)
    return [tree_node(node_id, statement, PROVENANCE) for node_id, statement in base.values()]


def _effects(**overrides: dict) -> list[dict]:
    base = {
        "e1": ("E1", "annual recurring revenue growth has slowed"),
        "e2": ("E2", "sales has been forced to offer deeper discounts to retain at-risk accounts, compressing margin"),
    }
    base.update(overrides)
    return [tree_node(node_id, statement, PROVENANCE) for node_id, statement in base.values()]


def _valid_tree(
    *,
    tree_id: str = "PROBTREE-T-001",
    core_problem: str | None = None,
    causes: list[dict] | None = None,
    effects: list[dict] | None = None,
):
    return generate_problem_tree(
        tree_id,
        core_problem if core_problem is not None else _core_problem(),
        causes if causes is not None else _causes(),
        effects if effects is not None else _effects(),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_tree_validates_against_the_real_schema(self):
        self.contracts.validate(PROBLEM_TREE_SCHEMA, _valid_tree(), "problem tree")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, tree = live.invoke(METHOD_ID, generate_problem_tree, "PROBTREE-T-INVOKE", _core_problem(), _causes(), _effects())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/decomposition.problem_tree.contract.yaml")
        self.assertEqual(tree["id"], "PROBTREE-T-INVOKE")

    def test_empty_catalog_blocks_problem_tree_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_tree())
        tampered["causes"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PROBLEM_TREE_SCHEMA, tampered, "tampered tree")
        gate = evaluate_problem_tree_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        tree = _valid_tree()
        tree["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PROBLEM_TREE_SCHEMA, tree, "tree with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_causes_entry(self):
        tree = _valid_tree()
        tree["causes"][0] = {**tree["causes"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PROBLEM_TREE_SCHEMA, tree, "tree with a smuggled causes[] key")

    def test_schema_rejects_an_unknown_key_inside_an_effects_entry(self):
        tree = _valid_tree()
        tree["effects"][0] = {**tree["effects"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PROBLEM_TREE_SCHEMA, tree, "tree with a smuggled effects[] key")

    def test_id_is_distinct_from_root_cause_fishbone_machine_id(self):
        self.assertNotEqual(METHOD_ID, "root_cause.fishbone")
        self.assertEqual(METHOD_ID, "decomposition.problem_tree")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "decomposition.problem_tree.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "decomposition.problem_tree contract")


class TreeNodeTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "PROBTREE-")

    def test_tree_node_rejects_an_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_EMPTY_NODE_ID"):
            tree_node("   ", "statement", PROVENANCE)

    def test_tree_node_rejects_an_empty_statement(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_EMPTY_NODE_STATEMENT"):
            tree_node("C1", "   ", PROVENANCE)

    def test_tree_node_rejects_invalid_provenance(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_INVALID_NODE_PROVENANCE"):
            tree_node("C1", "statement", {"epistemic_type": "NOT_A_REAL_VALUE"})

    def test_tree_node_emits_exactly_id_statement_and_provenance(self):
        entry = tree_node("C1", "statement", PROVENANCE)
        self.assertEqual(set(entry.keys()), {"id", "statement", "provenance"})


class CausesEffectsCompletenessTests(unittest.TestCase):
    """Invariant: causes and effects must each be non-empty lists."""

    def test_2_causes_and_2_effects_is_accepted(self):
        tree = _valid_tree()
        self.assertEqual(len(tree["causes"]), 2)
        self.assertEqual(len(tree["effects"]), 2)

    def test_single_cause_and_single_effect_is_accepted(self):
        tree = generate_problem_tree("PROBTREE-T-SINGLE", _core_problem(), _causes()[:1], _effects()[:1])
        self.assertEqual(len(tree["causes"]), 1)
        self.assertEqual(len(tree["effects"]), 1)

    def test_empty_causes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_EMPTY_CAUSES"):
            generate_problem_tree("PROBTREE-T-EMPTYCAUSES", _core_problem(), [], _effects())

    def test_empty_effects_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_EMPTY_EFFECTS"):
            generate_problem_tree("PROBTREE-T-EMPTYEFFECTS", _core_problem(), _causes(), [])

    def test_non_list_causes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_EMPTY_CAUSES"):
            generate_problem_tree("PROBTREE-T-NONLISTCAUSES", _core_problem(), "not a list", _effects())

    def test_non_list_effects_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_EMPTY_EFFECTS"):
            generate_problem_tree("PROBTREE-T-NONLISTEFFECTS", _core_problem(), _causes(), "not a list")

    def test_large_causes_and_effects_lists_are_accepted(self):
        """Open-ended, no maxItems -- Atlas names no fixed count for either side. Each entry needs a
        genuinely distinct id (post-critic-review within-list uniqueness fix, 2026-09-11) -- repeating the
        same 2 entries 5x would now be refused as within-list duplicates, so this builds 10 distinct ids."""
        causes = [tree_node(f"C{i}", f"cause number {i}", PROVENANCE) for i in range(10)]
        effects = [tree_node(f"E{i}", f"effect number {i}", PROVENANCE) for i in range(10)]
        tree = generate_problem_tree("PROBTREE-T-LARGE", _core_problem(), causes, effects)
        self.assertEqual(len(tree["causes"]), 10)
        self.assertEqual(len(tree["effects"]), 10)


class CoreProblemTests(unittest.TestCase):
    def test_empty_core_problem_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_EMPTY_CORE_PROBLEM"):
            generate_problem_tree("PROBTREE-T-NOCOREPROBLEM", "   ", _causes(), _effects())

    def test_non_string_core_problem_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_EMPTY_CORE_PROBLEM"):
            generate_problem_tree("PROBTREE-T-BADCOREPROBLEM", None, _causes(), _effects())


class NodeContentTests(unittest.TestCase):
    """Every causes[]/effects[] entry needs a non-empty id and a non-empty statement."""

    def test_missing_statement_key_smuggled_in_via_raw_dict_is_refused(self):
        causes = _causes()
        del causes[0]["statement"]
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_INVALID_CAUSE"):
            generate_problem_tree("PROBTREE-T-NOSTATEMENT", _core_problem(), causes, _effects())

    def test_empty_cause_id_smuggled_in_via_raw_dict_is_refused(self):
        causes = _causes()
        causes[0] = {**causes[0], "id": ""}
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_INVALID_CAUSE"):
            generate_problem_tree("PROBTREE-T-EMPTYCAUSEID", _core_problem(), causes, _effects())

    def test_empty_effect_statement_smuggled_in_via_raw_dict_is_refused(self):
        effects = _effects()
        effects[0] = {**effects[0], "statement": "   "}
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_INVALID_EFFECT"):
            generate_problem_tree("PROBTREE-T-EMPTYEFFECTSTMT", _core_problem(), _causes(), effects)

    def test_smuggled_extra_key_on_a_cause_entry_is_refused(self):
        causes = _causes()
        causes[0] = {**causes[0], "category": "process"}
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_INVALID_CAUSE"):
            generate_problem_tree("PROBTREE-T-EXTRAKEY", _core_problem(), causes, _effects())

    def test_invalid_provenance_smuggled_into_a_cause_is_refused(self):
        causes = _causes()
        causes[0] = {**causes[0], "provenance": {"epistemic_type": "NOT_A_REAL_VALUE"}}
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_INVALID_CAUSE"):
            generate_problem_tree("PROBTREE-T-BADPROVENANCE", _core_problem(), causes, _effects())


class CauseEffectDisjointnessTests(unittest.TestCase):
    """The method's CORE invariant: causes[].id and effects[].id must never overlap."""

    def test_colliding_id_across_causes_and_effects_is_refused(self):
        colliding_causes = [*_causes(), tree_node("E1", "duplicate id reused from effects", PROVENANCE)]
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_CAUSE_EFFECT_ID_COLLISION"):
            generate_problem_tree("PROBTREE-T-COLLISION", _core_problem(), colliding_causes, _effects())

    def test_collision_error_names_the_colliding_id(self):
        colliding_causes = [*_causes(), tree_node("E1", "duplicate id reused from effects", PROVENANCE)]
        with self.assertRaisesRegex(InvariantViolation, r"E1"):
            generate_problem_tree("PROBTREE-T-COLLISION-NAMED", _core_problem(), colliding_causes, _effects())

    def test_disjoint_ids_are_accepted(self):
        tree = _valid_tree()
        cause_ids = {c["id"] for c in tree["causes"]}
        effect_ids = {e["id"] for e in tree["effects"]}
        self.assertEqual(cause_ids & effect_ids, set())


class WithinListIdUniquenessTests(unittest.TestCase):
    """Critic finding, 2026-09-11: duplicate ids WITHIN one list (causes alone, or effects alone) must be
    refused, distinct from the cross-list disjointness invariant above -- the original disjointness check
    built a set() from each list before comparing, which silently absorbed a within-list duplicate."""

    def test_duplicate_id_within_causes_is_refused(self):
        causes = [tree_node("C1", "first", PROVENANCE), tree_node("C1", "second, same id, still within causes only", PROVENANCE)]
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_DUPLICATE_CAUSE_ID"):
            generate_problem_tree("PROBTREE-T-INTRALIST-DUP-CAUSE", _core_problem(), causes, _effects())

    def test_duplicate_id_within_effects_is_refused(self):
        effects = [tree_node("E1", "first", PROVENANCE), tree_node("E1", "second, same id, still within effects only", PROVENANCE)]
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_DUPLICATE_EFFECT_ID"):
            generate_problem_tree("PROBTREE-T-INTRALIST-DUP-EFFECT", _core_problem(), _causes(), effects)

    def test_duplicate_cause_id_error_names_the_id(self):
        causes = [tree_node("C1", "first", PROVENANCE), tree_node("C1", "second", PROVENANCE)]
        with self.assertRaisesRegex(InvariantViolation, r"C1"):
            generate_problem_tree("PROBTREE-T-INTRALIST-DUP-NAMED", _core_problem(), causes, _effects())

    def test_gate_catches_hand_tampered_duplicate_id_within_causes(self):
        tree = copy.deepcopy(_valid_tree())
        tree["causes"][1]["id"] = tree["causes"][0]["id"]
        gate = evaluate_problem_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_id_within_effects(self):
        tree = copy.deepcopy(_valid_tree())
        tree["effects"][1]["id"] = tree["effects"][0]["id"]
        gate = evaluate_problem_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_INVALID_ID"):
            _valid_tree(tree_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_INVALID_ID"):
            _valid_tree(tree_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PROBTREE_INVALID_VERSION"):
            generate_problem_tree("PROBTREE-T-002", _core_problem(), _causes(), _effects(), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID tree's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_tree(self):
        gate = evaluate_problem_tree_integrity_gate(_valid_tree(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_causes(self):
        tree = copy.deepcopy(_valid_tree())
        tree["causes"] = []
        gate = evaluate_problem_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_effects(self):
        tree = copy.deepcopy(_valid_tree())
        tree["effects"] = []
        gate = evaluate_problem_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_id_collision(self):
        """The core proof: a caller who bypasses the builder and directly overwrites a causes[] id to match
        an existing effects[] id MUST be caught by the independent gate."""
        tree = copy.deepcopy(_valid_tree())
        tree["causes"][0]["id"] = tree["effects"][0]["id"]
        gate = evaluate_problem_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["colliding_ids"], [tree["effects"][0]["id"]])

    def test_gate_catches_hand_tampered_empty_core_problem(self):
        tree = copy.deepcopy(_valid_tree())
        tree["core_problem"] = ""
        gate = evaluate_problem_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_malformed_cause_entry(self):
        tree = copy.deepcopy(_valid_tree())
        tree["causes"][0] = {"id": "C1"}  # missing statement
        gate = evaluate_problem_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_tree(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_problem_tree_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        tree = copy.deepcopy(_valid_tree())
        tree["id"] = "WRONG-001"
        gate = evaluate_problem_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        tree = copy.deepcopy(_valid_tree())
        tree["version"] = 1
        gate = evaluate_problem_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_problem_tree_gates_returns_one_gate(self):
        results = evaluate_problem_tree_gates(_valid_tree(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["problem_tree_integrity"])

    def test_evaluate_problem_tree_gates_all_pass_on_a_valid_tree(self):
        results = evaluate_problem_tree_gates(_valid_tree(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "decomposition.problem_tree")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        tree = _valid_tree()
        self.assertEqual(set(tree.keys()), {"id", "version", "generated_by_method", "core_problem", "causes", "effects"})


if __name__ == "__main__":
    unittest.main()
