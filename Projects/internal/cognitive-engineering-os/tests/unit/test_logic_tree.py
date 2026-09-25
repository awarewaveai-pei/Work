"""Mutation-style tests for ``decomposition.logic_tree`` (F02 decomposition & structuring family, opened in
this same batch alongside ``decomposition.issue_tree`` -- a DIFFERENT invariant class, not imported from
here, not depended on).

One real invariant beyond per-field shape: at EVERY level of the tree, sibling ``category_value`` entries
under the same parent must be unique. Exercised at BOTH layers: construction-time refusal
(``generate_logic_tree`` raising a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_logic_tree_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself), at the ROOT level AND at a nested level several layers down --
proving the recursion, not just a root-only check. The ``MAX_TREE_DEPTH`` bound is confirmed via a long
linear chain, same discipline ``test_attack_tree.py``'s own depth-bound test already establishes for a
different recursive tree family. Schema conformance is checked against the real spec-root schema this same
slice added (``typed-objects/logic-tree.schema.yaml``), including its recursive ``$defs`` reference.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decomposition.logic_tree import (
    MAX_TREE_DEPTH,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_logic_tree_gates,
    evaluate_logic_tree_integrity_gate,
    generate_logic_tree,
    logic_tree_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

LOGIC_TREE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/logic-tree.schema.yaml"
RULE = "分類依 客戶規模"


def _well_formed_root() -> dict:
    return logic_tree_node(
        "ROOT",
        "全部客戶",
        children=[
            logic_tree_node(
                "N-ENTERPRISE",
                "Enterprise",
                children=[
                    logic_tree_node("N-ENT-RENEWED", "已續約"),
                    logic_tree_node("N-ENT-CHURNED", "已流失"),
                ],
            ),
            logic_tree_node("N-SMB", "SMB"),
            logic_tree_node("N-STARTUP", "Startup"),
        ],
    )


def _valid_tree(*, tree_id: str = "LOGICTREE-T-001", root: dict | None = None, classification_rule: str = RULE):
    return generate_logic_tree(tree_id, classification_rule, root if root is not None else _well_formed_root())


def _chain(depth: int) -> dict:
    """A linear chain of ``depth`` nodes, each with exactly one child (no siblings, so never trips the
    sibling-uniqueness invariant) -- used only to probe MAX_TREE_DEPTH."""
    node = logic_tree_node(f"D{depth - 1}", f"V{depth - 1}")
    for i in range(depth - 2, -1, -1):
        node = logic_tree_node(f"D{i}", f"V{i}", children=[node])
    return node


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_tree_validates_against_the_real_schema(self):
        self.contracts.validate(LOGIC_TREE_SCHEMA, _valid_tree(), "logic tree")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, tree = live.invoke(METHOD_ID, generate_logic_tree, "LOGICTREE-T-INVOKE", RULE, _well_formed_root())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/decomposition.logic_tree.contract.yaml")
        self.assertEqual(tree["id"], "LOGICTREE-T-INVOKE")

    def test_empty_catalog_blocks_logic_tree_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_tree())
        tampered["root"] = {}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LOGIC_TREE_SCHEMA, tampered, "tampered tree")
        gate = evaluate_logic_tree_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        tree = _valid_tree()
        tree["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LOGIC_TREE_SCHEMA, tree, "tree with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_node(self):
        tree = _valid_tree()
        tree["root"] = {**tree["root"], "weight": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LOGIC_TREE_SCHEMA, tree, "tree with a smuggled node key")

    def test_schema_accepts_the_recursive_defs_reference_several_levels_deep(self):
        """The schema's own $defs/logic_tree_node self-reference must resolve through multiple nested
        levels, not just the root -- same real-schema-validity check test_decision_tree.py's own recursive
        oneOf union already establishes for a different family."""
        self.contracts.validate(LOGIC_TREE_SCHEMA, _valid_tree(root=_chain(5)), "5-level chain tree")

    def test_id_is_distinct_from_decomposition_issue_tree_machine_id(self):
        self.assertNotEqual(METHOD_ID, "decomposition.issue_tree")
        self.assertEqual(METHOD_ID, "decomposition.logic_tree")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "decomposition.logic_tree.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "decomposition.logic_tree contract")


class NodeConstructorTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "LOGICTREE-")

    def test_logic_tree_node_rejects_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_EMPTY_NODE_ID"):
            logic_tree_node("   ", "x")

    def test_logic_tree_node_rejects_empty_category_value(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_EMPTY_CATEGORY_VALUE"):
            logic_tree_node("x", "   ")

    def test_logic_tree_node_defaults_children_to_empty_list(self):
        node = logic_tree_node("x", "y")
        self.assertEqual(node["children"], [])

    def test_logic_tree_node_does_not_alias_the_caller_supplied_children_list(self):
        children = [logic_tree_node("c1", "v1")]
        node = logic_tree_node("x", "y", children=children)
        children.append(logic_tree_node("c2", "v2"))
        self.assertEqual(len(node["children"]), 1)


class TreeCompletenessTests(unittest.TestCase):
    """Shape invariants beyond the sibling-uniqueness invariant: id/version/classification_rule."""

    def test_well_formed_2_level_6_node_tree_is_accepted(self):
        tree = _valid_tree()
        root = tree["root"]
        self.assertEqual(len(root["children"]), 3)
        self.assertEqual(len(root["children"][0]["children"]), 2)

    def test_minimal_single_node_tree_is_accepted(self):
        tree = generate_logic_tree("LOGICTREE-T-MIN", RULE, logic_tree_node("ROOT", "全部產品"))
        self.assertEqual(tree["root"]["children"], [])

    def test_empty_classification_rule_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_EMPTY_CLASSIFICATION_RULE"):
            generate_logic_tree("LOGICTREE-T-NORULE", "   ", _well_formed_root())

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_INVALID_RECORD_ID"):
            generate_logic_tree("WRONG-PREFIX-001", RULE, _well_formed_root())

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_INVALID_RECORD_ID"):
            generate_logic_tree("", RULE, _well_formed_root())

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_INVALID_VERSION"):
            generate_logic_tree("LOGICTREE-T-002", RULE, _well_formed_root(), version=1)

    def test_builder_does_not_leak_extra_top_level_keys(self):
        tree = _valid_tree()
        self.assertEqual(set(tree.keys()), {"id", "version", "generated_by_method", "classification_rule", "root"})


class NodeShapeTests(unittest.TestCase):
    """Invalid raw-dict node shapes smuggled in directly, bypassing logic_tree_node()."""

    def test_root_missing_a_known_key_is_refused(self):
        bad_root = {"id": "ROOT", "category_value": "x"}  # missing children
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_INVALID_ROOT"):
            generate_logic_tree("LOGICTREE-T-BADROOT1", RULE, bad_root)

    def test_root_with_extra_key_is_refused(self):
        bad_root = {**logic_tree_node("ROOT", "x"), "weight": 1}
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_INVALID_ROOT"):
            generate_logic_tree("LOGICTREE-T-BADROOT2", RULE, bad_root)

    def test_root_with_non_list_children_is_refused(self):
        bad_root = {"id": "ROOT", "category_value": "x", "children": "not-a-list"}
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_INVALID_ROOT"):
            generate_logic_tree("LOGICTREE-T-BADROOT3", RULE, bad_root)

    def test_nested_child_with_empty_category_value_smuggled_in_via_raw_dict_is_refused(self):
        bad_child = {"id": "C1", "category_value": "", "children": []}
        bad_root = {"id": "ROOT", "category_value": "x", "children": [bad_child]}
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_INVALID_ROOT"):
            generate_logic_tree("LOGICTREE-T-BADCHILD", RULE, bad_root)

    def test_non_dict_root_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_INVALID_ROOT"):
            generate_logic_tree("LOGICTREE-T-NOTDICT", RULE, "not-a-dict")


class SiblingUniquenessInvariantTests(unittest.TestCase):
    """The real invariant: at EVERY level, sibling category_value values must be unique. Proven at the ROOT
    level, at a NESTED level, and confirmed NOT to over-apply across different parents."""

    def test_duplicate_category_value_among_root_children_is_refused(self):
        root = logic_tree_node("ROOT", "x", children=[logic_tree_node("A", "Enterprise"), logic_tree_node("B", "Enterprise")])
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_DUPLICATE_SIBLING_CATEGORY_VALUE"):
            generate_logic_tree("LOGICTREE-T-DUPROOT", RULE, root)

    def test_duplicate_category_value_at_a_nested_level_is_refused(self):
        """Same defect, but 2 levels down from the root -- proving the check is genuinely recursive, not a
        root-only shortcut."""
        root = logic_tree_node(
            "ROOT",
            "全部客戶",
            children=[
                logic_tree_node(
                    "N-ENTERPRISE",
                    "Enterprise",
                    children=[logic_tree_node("A", "已續約"), logic_tree_node("B", "已續約")],
                ),
                logic_tree_node("N-SMB", "SMB"),
            ],
        )
        with self.assertRaisesRegex(InvariantViolation, r"LOGICTREE_DUPLICATE_SIBLING_CATEGORY_VALUE.*N-ENTERPRISE"):
            generate_logic_tree("LOGICTREE-T-DUPNESTED", RULE, root)

    def test_duplicate_category_value_three_levels_deep_is_refused(self):
        root = logic_tree_node(
            "ROOT",
            "x",
            children=[
                logic_tree_node(
                    "L1",
                    "a",
                    children=[
                        logic_tree_node(
                            "L2",
                            "b",
                            children=[logic_tree_node("L3A", "dup"), logic_tree_node("L3B", "dup")],
                        )
                    ],
                )
            ],
        )
        with self.assertRaisesRegex(InvariantViolation, r"LOGICTREE_DUPLICATE_SIBLING_CATEGORY_VALUE.*L2"):
            generate_logic_tree("LOGICTREE-T-DUPDEEP", RULE, root)

    def test_same_category_value_across_different_parents_is_allowed(self):
        """Only SIBLINGS under the SAME parent must differ -- the same category_value under two different
        parents is not a defect (the invariant is per-level, per-parent, not whole-tree)."""
        root = logic_tree_node(
            "ROOT",
            "x",
            children=[
                logic_tree_node("P1", "GroupA", children=[logic_tree_node("C1", "已續約")]),
                logic_tree_node("P2", "GroupB", children=[logic_tree_node("C2", "已續約")]),  # same "已續約", different parent -- legal
            ],
        )
        tree = generate_logic_tree("LOGICTREE-T-CROSSPARENT-OK", RULE, root)
        self.assertEqual(tree["root"]["children"][0]["children"][0]["category_value"], "已續約")
        self.assertEqual(tree["root"]["children"][1]["children"][0]["category_value"], "已續約")

    def test_single_child_never_trips_the_invariant(self):
        root = logic_tree_node("ROOT", "x", children=[logic_tree_node("ONLY", "y")])
        tree = generate_logic_tree("LOGICTREE-T-SINGLECHILD", RULE, root)
        self.assertEqual(len(tree["root"]["children"]), 1)


class DepthBoundTests(unittest.TestCase):
    """MAX_TREE_DEPTH must reject a pathologically deep chain without raising Python's own RecursionError,
    same discipline test_attack_tree.py's own depth-bound test already establishes for a different family."""

    def test_a_shallow_chain_well_within_the_bound_is_accepted(self):
        tree = generate_logic_tree("LOGICTREE-T-SHALLOW", RULE, _chain(10))
        self.assertEqual(tree["root"]["id"], "D0")

    def test_a_chain_deeper_than_max_tree_depth_is_refused_not_a_recursion_error(self):
        too_deep = _chain(MAX_TREE_DEPTH + 50)
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_INVALID_ROOT"):
            generate_logic_tree("LOGICTREE-T-TOODEEP", RULE, too_deep)

    def test_a_pathologically_deep_chain_is_refused_without_raising_recursion_error(self):
        """A chain deep enough (2000 levels) that an UNBOUNDED recursive walk (e.g. the diagnostic
        duplicate-finder that runs after the primary validity check fails) would raise Python's own
        RecursionError if it were not itself depth-bounded -- both the primary validator AND the diagnostic
        helper it calls on the failure path must fail closed, not crash."""
        pathological = _chain(2000)
        with self.assertRaisesRegex(InvariantViolation, "LOGICTREE_INVALID_ROOT"):
            generate_logic_tree("LOGICTREE-T-PATHOLOGICAL", RULE, pathological)
        gate = evaluate_logic_tree_integrity_gate({"id": "LOGICTREE-X", "version": "1.0.0", "classification_rule": RULE, "root": pathological}, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID tree's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_tree(self):
        gate = evaluate_logic_tree_integrity_gate(_valid_tree(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_duplicate_sibling_category_value_at_root(self):
        tree = copy.deepcopy(_valid_tree())
        tree["root"]["children"][1]["category_value"] = "Startup"  # was "SMB" -- now collides with children[2]'s own "Startup"
        gate = evaluate_logic_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "duplicate sibling category_value")

    def test_gate_catches_hand_tampered_duplicate_sibling_category_value_nested(self):
        tree = copy.deepcopy(_valid_tree())
        tree["root"]["children"][0]["children"][1]["category_value"] = "已續約"  # was "已流失" -- now collides with its own sibling "已續約"
        gate = evaluate_logic_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_classification_rule(self):
        tree = copy.deepcopy(_valid_tree())
        tree["classification_rule"] = ""
        gate = evaluate_logic_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_category_value(self):
        tree = copy.deepcopy(_valid_tree())
        tree["root"]["children"][0]["category_value"] = ""
        gate = evaluate_logic_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_tree(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_logic_tree_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        tree = copy.deepcopy(_valid_tree())
        tree["id"] = "WRONG-001"
        gate = evaluate_logic_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        tree = copy.deepcopy(_valid_tree())
        tree["version"] = 1
        gate = evaluate_logic_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_reports_node_count_evidence_on_pass(self):
        gate = evaluate_logic_tree_integrity_gate(_valid_tree(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["evidence"][0]["node_count"], 6)
        self.assertEqual(gate["evidence"][0]["leaf_count"], 4)


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_logic_tree_gates_returns_exactly_one_gate(self):
        """No provenance_required gate -- the contract sets that flag to false (task-mandated shape carries
        no provenance field anywhere), same "only emit gates for what is actually declared true" discipline
        strategy.bcg_matrix's own evaluate_bcg_matrix_gates already establishes."""
        results = evaluate_logic_tree_gates(_valid_tree(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["logic_tree_integrity"])

    def test_evaluate_logic_tree_gates_all_pass_on_a_valid_tree(self):
        results = evaluate_logic_tree_gates(_valid_tree(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "decomposition.logic_tree")


if __name__ == "__main__":
    unittest.main()
