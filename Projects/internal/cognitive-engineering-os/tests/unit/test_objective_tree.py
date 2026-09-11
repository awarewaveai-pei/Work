"""Mutation-style tests for ``decomposition.objective_tree`` (F02 decomposition family, FIRST
member).

Two real invariants beyond per-field shape (bijective coverage between ``source_problem_items`` and
``objectives``, anti-passthrough on ``positive_statement``), exercised at BOTH layers:
construction-time refusal (``generate_objective_tree`` raising a specific ``InvariantViolation``
code) and independent gate re-derivation (``evaluate_objective_tree_integrity_gate`` catching a
hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself). Schema
conformance is checked against the real spec-root schema this same slice added
(``typed-objects/objective-tree.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decomposition.objective_tree import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_POLARITIES,
    all_gates_pass,
    evaluate_objective_tree_gates,
    evaluate_objective_tree_integrity_gate,
    generate_objective_tree,
    objective,
    source_problem_item,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

OBJECTIVE_TREE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/objective-tree.schema.yaml"


def _source_items(**overrides: dict) -> list[dict]:
    base = {
        "cause_1": dict(item_id="PT-1", statement="第一線客服人員流動率過高", polarity="CAUSE"),
        "cause_2": dict(item_id="PT-2", statement="客服系統回應速度緩慢", polarity="CAUSE"),
        "effect_1": dict(item_id="PT-3", statement="客戶滿意度持續下滑", polarity="EFFECT"),
    }
    base.update(overrides)
    return [source_problem_item(v["item_id"], v["statement"], v["polarity"]) for v in base.values()]


def _objectives(**overrides: dict) -> list[dict]:
    base = {
        "obj_1": dict(objective_id="OBJ-1", source_item_ref="PT-1", positive_statement="提升第一線客服人員留任率"),
        "obj_2": dict(objective_id="OBJ-2", source_item_ref="PT-2", positive_statement="縮短客服系統平均回應時間"),
        "obj_3": dict(objective_id="OBJ-3", source_item_ref="PT-3", positive_statement="提升客戶滿意度至目標水準以上"),
    }
    base.update(overrides)
    return [objective(v["objective_id"], v["source_item_ref"], v["positive_statement"]) for v in base.values()]


def _valid_tree(
    *,
    tree_id: str = "OBJTREE-T-001",
    source_problem_items: list[dict] | None = None,
    objectives: list[dict] | None = None,
):
    return generate_objective_tree(
        tree_id,
        source_problem_items if source_problem_items is not None else _source_items(),
        objectives if objectives is not None else _objectives(),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_tree_validates_against_the_real_schema(self):
        self.contracts.validate(OBJECTIVE_TREE_SCHEMA, _valid_tree(), "objective tree")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, tree = live.invoke(METHOD_ID, generate_objective_tree, "OBJTREE-T-INVOKE", _source_items(), _objectives())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/decomposition.objective_tree.contract.yaml")
        self.assertEqual(tree["id"], "OBJTREE-T-INVOKE")

    def test_empty_catalog_blocks_objective_tree_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_tree())
        tampered["objectives"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OBJECTIVE_TREE_SCHEMA, tampered, "tampered tree")
        gate = evaluate_objective_tree_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        tree = _valid_tree()
        tree["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OBJECTIVE_TREE_SCHEMA, tree, "tree with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_source_problem_items_entry(self):
        tree = _valid_tree()
        tree["source_problem_items"][0] = {**tree["source_problem_items"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OBJECTIVE_TREE_SCHEMA, tree, "tree with a smuggled source_problem_items[] key")

    def test_schema_rejects_an_unknown_key_inside_an_objectives_entry(self):
        tree = _valid_tree()
        tree["objectives"][0] = {**tree["objectives"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(OBJECTIVE_TREE_SCHEMA, tree, "tree with a smuggled objectives[] key")

    def test_id_is_distinct_from_strategy_bcg_matrix_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.bcg_matrix")
        self.assertEqual(METHOD_ID, "decomposition.objective_tree")

    def test_objective_tree_and_bcg_matrix_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.bcg_matrix"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated
        against specs/cognitive/method.schema.yaml') true going forward, same live check every
        sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "decomposition.objective_tree.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "decomposition.objective_tree contract")


class SourceProblemItemVocabularyTests(unittest.TestCase):
    def test_valid_polarities_is_exactly_cause_effect(self):
        self.assertEqual(VALID_POLARITIES, frozenset({"CAUSE", "EFFECT"}))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "OBJTREE-")

    def test_source_problem_item_rejects_an_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_EMPTY_SOURCE_ITEM_ID"):
            source_problem_item("   ", "statement", "CAUSE")

    def test_source_problem_item_rejects_an_empty_statement(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_EMPTY_SOURCE_STATEMENT"):
            source_problem_item("PT-1", "   ", "CAUSE")

    def test_source_problem_item_rejects_an_unknown_polarity(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_INVALID_POLARITY"):
            source_problem_item("PT-1", "statement", "NEUTRAL")

    def test_source_problem_item_accepts_both_polarities(self):
        for polarity in sorted(VALID_POLARITIES):
            entry = source_problem_item("PT-1", "statement", polarity)
            self.assertEqual(entry["polarity"], polarity)


class ObjectiveConstructorTests(unittest.TestCase):
    def test_objective_rejects_an_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_EMPTY_OBJECTIVE_ID"):
            objective("   ", "PT-1", "positive statement")

    def test_objective_rejects_an_empty_source_item_ref(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_EMPTY_SOURCE_ITEM_REF"):
            objective("OBJ-1", "   ", "positive statement")

    def test_objective_rejects_an_empty_positive_statement(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_EMPTY_POSITIVE_STATEMENT"):
            objective("OBJ-1", "PT-1", "   ")

    def test_objective_does_not_leak_extra_keys(self):
        entry = objective("OBJ-1", "PT-1", "positive statement")
        self.assertEqual(set(entry.keys()), {"id", "source_item_ref", "positive_statement"})


class BijectiveCoverageTests(unittest.TestCase):
    """Invariant 1 (module docstring): the set of objectives[].source_item_ref must equal EXACTLY
    the set of source_problem_items[].id -- no duplicates, no missing, no dangling."""

    def test_exact_bijection_of_3_items_is_accepted(self):
        tree = _valid_tree()
        self.assertEqual(len(tree["source_problem_items"]), 3)
        self.assertEqual(len(tree["objectives"]), 3)

    def test_single_item_bijection_is_accepted(self):
        tree = generate_objective_tree(
            "OBJTREE-T-SINGLE",
            [source_problem_item("PT-1", "statement", "CAUSE")],
            [objective("OBJ-1", "PT-1", "positive statement")],
        )
        self.assertEqual(len(tree["source_problem_items"]), 1)
        self.assertEqual(len(tree["objectives"]), 1)

    def test_large_bijection_is_accepted(self):
        """Open-ended, no maxItems -- unbounded number of source items/objectives, only exact
        bijection matters."""
        items = [source_problem_item(f"PT-{i}", f"statement {i}", "CAUSE" if i % 2 else "EFFECT") for i in range(10)]
        objs = [objective(f"OBJ-{i}", f"PT-{i}", f"positive statement {i}") for i in range(10)]
        tree = generate_objective_tree("OBJTREE-T-LARGE", items, objs)
        self.assertEqual(len(tree["objectives"]), 10)

    def test_empty_source_problem_items_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_EMPTY_SOURCE_ITEMS"):
            generate_objective_tree("OBJTREE-T-EMPTYSRC", [], _objectives())

    def test_non_list_source_problem_items_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_EMPTY_SOURCE_ITEMS"):
            generate_objective_tree("OBJTREE-T-NONLISTSRC", "not a list", _objectives())

    def test_empty_objectives_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_EMPTY_OBJECTIVES"):
            generate_objective_tree("OBJTREE-T-EMPTYOBJ", _source_items(), [])

    def test_duplicate_source_problem_item_id_is_refused(self):
        items = _source_items()
        items[1] = {**items[1], "id": items[0]["id"]}
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_DUPLICATE_SOURCE_ITEM_ID"):
            generate_objective_tree("OBJTREE-T-DUPSRC", items, _objectives())

    def test_missing_coverage_is_refused_when_one_source_item_left_unconverted(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_MISSING_COVERAGE"):
            generate_objective_tree("OBJTREE-T-MISSING", _source_items(), _objectives()[:2])

    def test_dangling_ref_is_refused(self):
        objs = _objectives()
        objs[0] = {**objs[0], "source_item_ref": "PT-NONEXISTENT"}
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_DANGLING_SOURCE_REF"):
            generate_objective_tree("OBJTREE-T-DANGLING", _source_items(), objs)

    def test_duplicate_ref_is_refused(self):
        objs = _objectives()
        objs[1] = {**objs[1], "source_item_ref": objs[0]["source_item_ref"]}
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_DUPLICATE_SOURCE_REF"):
            generate_objective_tree("OBJTREE-T-DUPREF", _source_items(), objs)

    def test_duplicate_objective_id_is_refused(self):
        objs = _objectives()
        objs[1] = {**objs[1], "id": objs[0]["id"]}
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_DUPLICATE_OBJECTIVE_ID"):
            generate_objective_tree("OBJTREE-T-DUPOBJID", _source_items(), objs)

    def test_extra_objective_beyond_a_clean_bijection_is_refused_as_duplicate(self):
        """More objectives than source items necessarily means some source item is referenced twice
        -- caught as a duplicate ref, not silently accepted as 'extra coverage'."""
        objs = _objectives() + [objective("OBJ-4", "PT-1", "another positive statement")]
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_DUPLICATE_SOURCE_REF"):
            generate_objective_tree("OBJTREE-T-EXTRA", _source_items(), objs)


class PassthroughGuardTests(unittest.TestCase):
    """Invariant 2 (module docstring): positive_statement must be non-empty and NOT
    character-for-character identical to its referenced source item's own statement."""

    def test_verbatim_copy_of_source_statement_is_refused(self):
        objs = _objectives()
        objs[0] = {**objs[0], "positive_statement": "第一線客服人員流動率過高"}  # == PT-1's own statement
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_PASSTHROUGH_STATEMENT"):
            generate_objective_tree("OBJTREE-T-PASSTHROUGH", _source_items(), objs)

    def test_a_near_identical_but_not_exact_rephrase_is_accepted(self):
        """The invariant is deliberately cheap/structural (character-for-character only) -- see the
        contract's own compilation_decisions/open_questions on why a superficial rephrase is not
        caught."""
        objs = _objectives()
        objs[0] = {**objs[0], "positive_statement": "第一線客服人員流動率過高。"}  # one added character
        tree = generate_objective_tree("OBJTREE-T-NEARMISS", _source_items(), objs)
        self.assertEqual(tree["objectives"][0]["positive_statement"], "第一線客服人員流動率過高。")

    def test_empty_positive_statement_smuggled_in_via_raw_dict_is_refused(self):
        objs = _objectives()
        objs[0] = {**objs[0], "positive_statement": "   "}
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_INVALID_OBJECTIVE"):
            generate_objective_tree("OBJTREE-T-EMPTYPOS", _source_items(), objs)


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_INVALID_ID"):
            _valid_tree(tree_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_INVALID_ID"):
            _valid_tree(tree_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OBJTREE_INVALID_VERSION"):
            generate_objective_tree("OBJTREE-T-002", _source_items(), _objectives(), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID tree's raw dict directly (never going through the builder again), then
    call the gate. These prove the gate re-derives from raw fields rather than trusting the
    builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_tree(self):
        gate = evaluate_objective_tree_integrity_gate(_valid_tree(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_source_problem_items(self):
        tree = copy.deepcopy(_valid_tree())
        tree["source_problem_items"] = []
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_objectives(self):
        tree = copy.deepcopy(_valid_tree())
        tree["objectives"] = []
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_dangling_source_item_ref(self):
        tree = copy.deepcopy(_valid_tree())
        tree["objectives"][0]["source_item_ref"] = "PT-NONEXISTENT"
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_source_item_ref(self):
        tree = copy.deepcopy(_valid_tree())
        tree["objectives"][1]["source_item_ref"] = tree["objectives"][0]["source_item_ref"]
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_missing_coverage(self):
        tree = copy.deepcopy(_valid_tree())
        del tree["objectives"][0]
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_passthrough_statement(self):
        tree = copy.deepcopy(_valid_tree())
        source_statement = tree["source_problem_items"][0]["statement"]
        tree["objectives"][0]["positive_statement"] = source_statement
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_reasoning_style_blank_statement(self):
        tree = copy.deepcopy(_valid_tree())
        tree["objectives"][0]["positive_statement"] = "   "
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_tree(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_objective_tree_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        tree = copy.deepcopy(_valid_tree())
        tree["id"] = "WRONG-001"
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        tree = copy.deepcopy(_valid_tree())
        tree["version"] = 1
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_duplicate_source_problem_item_id(self):
        tree = copy.deepcopy(_valid_tree())
        tree["source_problem_items"][1]["id"] = tree["source_problem_items"][0]["id"]
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_duplicate_objective_id(self):
        tree = copy.deepcopy(_valid_tree())
        tree["objectives"][1]["id"] = tree["objectives"][0]["id"]
        gate = evaluate_objective_tree_integrity_gate(tree, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_objective_tree_gates_returns_exactly_one_gate(self):
        """No provenance/evidence-labeling gate -- the contract sets both quality flags to false and
        this shape carries no provenance field anywhere (see module docstring)."""
        results = evaluate_objective_tree_gates(_valid_tree(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["objective_tree_integrity"])

    def test_evaluate_objective_tree_gates_all_pass_on_a_valid_tree(self):
        results = evaluate_objective_tree_gates(_valid_tree(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "decomposition.objective_tree")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        tree = _valid_tree()
        self.assertEqual(set(tree.keys()), {"id", "version", "generated_by_method", "source_problem_items", "objectives"})


if __name__ == "__main__":
    unittest.main()
