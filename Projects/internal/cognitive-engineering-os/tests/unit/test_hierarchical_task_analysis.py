"""Mutation-style tests for ``decomposition.hierarchical_task_analysis`` (F02 decomposition &
structuring family, 1st member -- family previously entirely unbuilt).

3 real invariants (node shape: non-empty id/task_name, exact key set, children is a list; plan
REQUIRED iff >=2 children; plan FORBIDDEN [must be null] iff 0-1 children), exercised at THREE layers:
construction-time refusal (``task_node``/``generate_hierarchical_task_analysis`` raising a specific
``InvariantViolation`` code), independent gate re-derivation (``evaluate_tree_shape_gate``/
``evaluate_plan_required_for_multi_child_gate``/``evaluate_plan_forbidden_for_leaf_or_single_child_gate``
catching a hand-tampered raw dict that bypassed the builder entirely, at ANY recursion depth), and the
real JSON Schema itself (recursive ``$defs/task_node``, if/then/else), checked against the spec-root
schema this same slice added (``typed-objects/hierarchical-task-analysis.schema.yaml``), not a schema
this test file invents.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decomposition.hierarchical_task_analysis import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_hierarchical_task_analysis_gates,
    evaluate_plan_forbidden_for_leaf_or_single_child_gate,
    evaluate_plan_required_for_multi_child_gate,
    evaluate_tree_shape_gate,
    generate_hierarchical_task_analysis,
    plan_is_required,
    task_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

HTA_SCHEMA = "ai-lego://specs/cognitive/typed-objects/hierarchical-task-analysis.schema.yaml"


def _well_formed_goal():
    """4-level tree: goal (2 children, plan required) -> prepare-tools (leaf) / assemble-body
    (2 children, plan required) -> assemble-base-and-sides (leaf) / attach-back-and-shelves
    (1 child, plan null) -> secure-back-panel-screws (leaf)."""
    secure_back_panel_screws = task_node("secure-back-panel-screws", "鎖背板螺絲固定層板位置", [])
    attach_back_and_shelves = task_node("attach-back-and-shelves", "裝背板與層板", [secure_back_panel_screws])
    assemble_base_and_sides = task_node("assemble-base-and-sides", "鎖底板與兩側板", [])
    assemble_body = task_node(
        "assemble-body", "組裝主體與收尾", [assemble_base_and_sides, attach_back_and_shelves], plan="先鎖底板與兩側板，再裝背板與層板"
    )
    prepare_tools = task_node("prepare-tools", "準備工具與材料", [])
    return task_node("goal", "組裝書架", [prepare_tools, assemble_body], plan="先準備工具與材料，再組裝主體與收尾")


def _valid_analysis(record_id="HTA-T-001", goal=None, version="1.0.0"):
    return generate_hierarchical_task_analysis(record_id, goal if goal is not None else _well_formed_goal(), version=version)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(HTA_SCHEMA, _valid_analysis(), "Hierarchical Task Analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_hierarchical_task_analysis, "HTA-T-INVOKE", _well_formed_goal())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/decomposition.hierarchical_task_analysis.contract.yaml")
        self.assertEqual(analysis["id"], "HTA-T-INVOKE")

    def test_empty_catalog_blocks_hta_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_INVALID_ID"):
            _valid_analysis(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_INVALID_VERSION"):
            generate_hierarchical_task_analysis("HTA-T-002", _well_formed_goal(), version=1)

    def test_id_is_distinct_from_sibling_machine_ids(self):
        self.assertNotEqual(METHOD_ID, "strategy.bcg_matrix")
        self.assertNotEqual(METHOD_ID, "strategy.blue_ocean")
        self.assertEqual(METHOD_ID, "decomposition.hierarchical_task_analysis")

    def test_hta_and_bcg_matrix_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.bcg_matrix"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check
        strategy.blue_ocean.contract.yaml's own test suite already establishes -- not just a one-time
        manual claim in prose."""
        contract_path = self.spec_root / "methods" / "contracts" / "decomposition.hierarchical_task_analysis.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "decomposition.hierarchical_task_analysis contract")


class NodeShapeInvariantTests(unittest.TestCase):
    def test_empty_node_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_EMPTY_NODE_ID"):
            task_node("", "任務名稱", [])

    def test_whitespace_only_node_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_EMPTY_NODE_ID"):
            task_node("   ", "任務名稱", [])

    def test_empty_task_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_EMPTY_TASK_NAME"):
            task_node("some-id", "", [])

    def test_whitespace_only_task_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_EMPTY_TASK_NAME"):
            task_node("some-id", "   ", [])

    def test_non_list_children_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_INVALID_CHILDREN"):
            task_node("some-id", "任務名稱", "not-a-list")  # type: ignore[arg-type]

    def test_plan_is_required_helper_matches_the_real_hta_domain_rule(self):
        self.assertFalse(plan_is_required(0))
        self.assertFalse(plan_is_required(1))
        self.assertTrue(plan_is_required(2))
        self.assertTrue(plan_is_required(5))


class PlanRequiredForMultiChildInvariantTests(unittest.TestCase):
    """Direction 1: Atlas F02 L370's own '→Plan' -- a node with >=2 children has real work to
    sequence, so a stated plan is required."""

    def test_two_children_without_plan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_MISSING_PLAN_FOR_MULTI_CHILD"):
            task_node("multi", "多子任務", [task_node("c1", "子任務一", []), task_node("c2", "子任務二", [])])

    def test_three_children_without_plan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_MISSING_PLAN_FOR_MULTI_CHILD"):
            task_node("multi3", "三子任務", [task_node("c1", "一", []), task_node("c2", "二", []), task_node("c3", "三", [])])

    def test_two_children_with_whitespace_only_plan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_MISSING_PLAN_FOR_MULTI_CHILD"):
            task_node("multi", "多子任務", [task_node("c1", "子任務一", []), task_node("c2", "子任務二", [])], plan="   ")

    def test_two_children_with_a_real_plan_is_accepted(self):
        node = task_node("multi", "多子任務", [task_node("c1", "子任務一", []), task_node("c2", "子任務二", [])], plan="先做一再做二")
        self.assertEqual(node["plan"], "先做一再做二")


class PlanForbiddenForLeafOrSingleChildInvariantTests(unittest.TestCase):
    """Direction 2: a leaf (0 children) or single-child node has nothing to sequence, so plan MUST
    be null."""

    def test_leaf_with_plan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD"):
            task_node("leaf", "葉節點", [], plan="不應該存在")

    def test_single_child_with_plan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD"):
            task_node("single", "單子任務", [task_node("only-child", "唯一子任務", [])], plan="不應該存在")

    def test_leaf_without_plan_is_accepted(self):
        node = task_node("leaf", "葉節點", [])
        self.assertIsNone(node["plan"])

    def test_single_child_without_plan_is_accepted(self):
        node = task_node("single", "單子任務", [task_node("only-child", "唯一子任務", [])])
        self.assertIsNone(node["plan"])


class TopLevelRecursiveGatekeeperTests(unittest.TestCase):
    """``generate_hierarchical_task_analysis`` re-validates the WHOLE tree from raw fields, even when
    the caller assembles nodes as plain dicts bypassing ``task_node`` entirely."""

    def test_raw_dict_tree_with_a_deep_violation_is_refused(self):
        raw_goal = {
            "id": "goal",
            "task_name": "根任務",
            "plan": None,
            "children": [
                {
                    "id": "deep-bad",
                    "task_name": "深層違規節點",
                    "plan": None,  # 2 children but no plan -- violation buried at depth 1
                    "children": [
                        {"id": "gc1", "task_name": "孫任務一", "plan": None, "children": []},
                        {"id": "gc2", "task_name": "孫任務二", "plan": None, "children": []},
                    ],
                }
            ],
        }
        with self.assertRaisesRegex(InvariantViolation, "HTA_MISSING_PLAN_FOR_MULTI_CHILD"):
            generate_hierarchical_task_analysis("HTA-T-DEEP-001", raw_goal)

    def test_raw_dict_tree_with_a_deep_unexpected_plan_is_refused(self):
        raw_goal = {
            "id": "goal",
            "task_name": "根任務",
            "plan": None,
            "children": [
                {"id": "leaf-with-plan", "task_name": "不該有計畫的葉節點", "plan": "違規計畫", "children": []},
            ],
        }
        with self.assertRaisesRegex(InvariantViolation, "HTA_UNEXPECTED_PLAN_FOR_LEAF_OR_SINGLE_CHILD"):
            generate_hierarchical_task_analysis("HTA-T-DEEP-002", raw_goal)

    def test_smuggled_extra_key_at_depth_is_refused(self):
        raw_goal = {
            "id": "goal",
            "task_name": "根任務",
            "plan": None,
            "children": [
                {"id": "leaf", "task_name": "葉節點", "plan": None, "children": [], "confidence": 0.9},
            ],
        }
        with self.assertRaisesRegex(InvariantViolation, "HTA_INVALID_NODE_SHAPE"):
            generate_hierarchical_task_analysis("HTA-T-SHAPE-001", raw_goal)

    def test_valid_deep_tree_round_trips_through_generate(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["goal"]["id"], "goal")
        self.assertEqual(analysis["goal"]["children"][1]["children"][1]["children"][0]["id"], "secure-back-panel-screws")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then
    call the gates. These prove the gates re-derive from raw fields rather than trusting the builder's
    own work -- at ANY recursion depth, not just the root."""

    def test_gate_passes_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_hierarchical_task_analysis_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_gate_catches_hand_tampered_missing_plan_at_the_root(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["plan"] = None  # root has 2 children -- stripping its plan violates Direction 1
        gate = evaluate_plan_required_for_multi_child_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("goal", gate["evidence"][0]["violation_paths"])

    def test_gate_catches_hand_tampered_missing_plan_deep_in_the_tree(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["children"][1]["plan"] = None  # "assemble-body", depth 1, has 2 children
        gate = evaluate_plan_required_for_multi_child_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("goal.children[1]", gate["evidence"][0]["violation_paths"])

    def test_gate_catches_hand_tampered_unexpected_plan_on_a_leaf(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["children"][0]["plan"] = "違規計畫"  # "prepare-tools" is a leaf
        gate = evaluate_plan_forbidden_for_leaf_or_single_child_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("goal.children[0]", gate["evidence"][0]["violation_paths"])

    def test_gate_catches_hand_tampered_unexpected_plan_on_a_single_child_node(self):
        analysis = copy.deepcopy(_valid_analysis())
        # "attach-back-and-shelves" (goal.children[1].children[1]) has exactly 1 child.
        analysis["goal"]["children"][1]["children"][1]["plan"] = "違規計畫"
        gate = evaluate_plan_forbidden_for_leaf_or_single_child_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("goal.children[1].children[1]", gate["evidence"][0]["violation_paths"])

    def test_gate_catches_hand_tampered_smuggled_key(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["children"][0]["confidence"] = 0.9
        gate = evaluate_tree_shape_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("goal.children[0]", gate["evidence"][0]["shape_violation_paths"])

    def test_gate_catches_hand_tampered_empty_task_name(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["children"][0]["task_name"] = "   "
        gate = evaluate_tree_shape_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_non_list_children(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["children"] = "not-a-list"
        gate = evaluate_tree_shape_gate(analysis, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_all_gates_catch_non_dict_analysis(self):
        for bad_analysis in (None, "not-a-dict", [], 42):
            with self.subTest(bad_analysis=bad_analysis):
                self.assertEqual(evaluate_tree_shape_gate(bad_analysis, "test", "t")["status"], "FAIL")
                self.assertEqual(evaluate_plan_required_for_multi_child_gate(bad_analysis, "test", "t")["status"], "FAIL")
                self.assertEqual(evaluate_plan_forbidden_for_leaf_or_single_child_gate(bad_analysis, "test", "t")["status"], "FAIL")

    def test_hand_tampered_analysis_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = copy.deepcopy(_valid_analysis())
        tampered["goal"]["children"][0]["plan"] = "違規計畫"
        with self.assertRaises(SchemaValidationError):
            contracts.validate(HTA_SCHEMA, tampered, "tampered analysis with a leaf illegally carrying a plan")
        gate = evaluate_plan_forbidden_for_leaf_or_single_child_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class SchemaLevelCoverageTests(unittest.TestCase):
    """Proves the schema's own recursive $defs/if-then-else constraints are real, not just the
    runtime gates."""

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HTA_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_node_key_at_the_root(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["confidence"] = 0.9
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HTA_SCHEMA, analysis, "analysis with a smuggled root node key")

    def test_schema_rejects_an_unknown_node_key_deep_in_the_tree(self):
        """The recursive $defs/task_node definition enforces additionalProperties:false at EVERY
        depth, not just the root -- this is the whole point of using $defs self-reference instead of
        hand-nesting a fixed number of levels."""
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["children"][1]["children"][1]["children"][0]["confidence"] = 0.9
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HTA_SCHEMA, analysis, "analysis with a smuggled key 3 levels deep")

    def test_schema_rejects_multi_child_node_with_null_plan(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["plan"] = None
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HTA_SCHEMA, analysis, "2-children root with plan:null")

    def test_schema_rejects_leaf_node_with_non_null_plan(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["children"][0]["plan"] = "違規計畫"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HTA_SCHEMA, analysis, "leaf with a non-null plan")

    def test_schema_rejects_single_child_node_with_non_null_plan(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["children"][1]["children"][1]["plan"] = "違規計畫"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HTA_SCHEMA, analysis, "single-child node with a non-null plan")

    def test_schema_rejects_multi_child_node_with_empty_string_plan(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["goal"]["plan"] = "   "
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HTA_SCHEMA, analysis, "2-children root with whitespace-only plan")

    def test_schema_rejects_invalid_top_level_id_prefix(self):
        analysis = copy.deepcopy(_valid_analysis())
        analysis["id"] = "WRONG-001"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HTA_SCHEMA, analysis, "wrong id prefix")

    def test_schema_accepts_the_unmodified_valid_example(self):
        self.contracts.validate(HTA_SCHEMA, _valid_analysis(), "unmodified valid example")

    def test_schema_accepts_a_deeper_5th_level_recursion(self):
        """Proves the $defs self-reference has no artificial depth limit."""
        level5 = task_node("level5", "第五層任務", [])
        level4 = task_node("level4", "第四層任務", [level5])
        level3 = task_node("level3", "第三層任務", [level4])
        level2 = task_node("level2", "第二層任務", [level3])
        level1 = task_node("level1", "第一層任務", [level2])
        goal = task_node("goal5", "五層深的目標", [level1])
        analysis = generate_hierarchical_task_analysis("HTA-T-DEEP5-001", goal)
        self.contracts.validate(HTA_SCHEMA, analysis, "5-level-deep single-child chain")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_hierarchical_task_analysis_gates_returns_three_gates_in_order(self):
        results = evaluate_hierarchical_task_analysis_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(
            [r["gate_id"] for r in results],
            ["tree_shape", "plan_required_for_multi_child", "plan_forbidden_for_leaf_or_single_child"],
        )

    def test_evaluate_hierarchical_task_analysis_gates_all_pass_on_a_valid_analysis(self):
        results = evaluate_hierarchical_task_analysis_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "HTA-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "decomposition.hierarchical_task_analysis")

    def test_builder_does_not_leak_extra_keys_at_top_level(self):
        analysis = _valid_analysis()
        self.assertEqual(set(analysis.keys()), {"id", "version", "generated_by_method", "goal"})

    def test_task_node_does_not_leak_extra_keys(self):
        node = task_node("leaf", "葉節點", [])
        self.assertEqual(set(node.keys()), {"id", "task_name", "plan", "children"})


if __name__ == "__main__":
    unittest.main()
