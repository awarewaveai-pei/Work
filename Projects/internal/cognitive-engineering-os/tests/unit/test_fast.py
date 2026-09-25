"""Mutation-style tests for ``decomposition.fast`` (F02 decomposition family, one of 9 members opened in one
batch).

Two real invariants (module docstring in ``ai_lego/modules/decomposition/fast.py``): exactly one root
(``why_ref: null``) and an acyclic why_ref chain that terminates at that root -- exercised at BOTH layers:
construction-time refusal (``generate_fast_diagram`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_fast_diagram_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely, never calling the builder itself). Acyclicity is checked against a genuinely
DISCONNECTED cycle (two functions cycling between each other while the diagram's single root and referential
integrity both remain individually valid) to prove invariant 2 is a real, separate check from invariant 1, not
a restatement of it. Schema conformance is checked against the real spec-root schema this same slice added
(``typed-objects/fast-diagram.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decomposition.fast import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_fast_diagram_gates,
    evaluate_fast_diagram_integrity_gate,
    fast_function,
    generate_fast_diagram,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

FAST_DIAGRAM_SCHEMA = "ai-lego://specs/cognitive/typed-objects/fast-diagram.schema.yaml"


def _functions(**overrides: dict) -> list[dict]:
    base = {
        "root": dict(function_id="FN-1", name="增加客戶留存", why_ref=None),
        "mid": dict(function_id="FN-2", name="提升產品使用黏著度", why_ref="FN-1"),
        "habit": dict(function_id="FN-3", name="建立每週使用習慣", why_ref="FN-2"),
        "digest": dict(function_id="FN-4", name="發送個人化週報提醒", why_ref="FN-3"),
        "care": dict(function_id="FN-5", name="主動客服關懷通知", why_ref="FN-2"),
    }
    base.update(overrides)
    return [fast_function(v["function_id"], v["name"], v["why_ref"]) for v in base.values()]


def _valid_diagram(*, diagram_id: str = "FAST-T-001", functions: list[dict] | None = None):
    return generate_fast_diagram(diagram_id, functions if functions is not None else _functions())


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_diagram_validates_against_the_real_schema(self):
        self.contracts.validate(FAST_DIAGRAM_SCHEMA, _valid_diagram(), "fast diagram")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, diagram = live.invoke(METHOD_ID, generate_fast_diagram, "FAST-T-INVOKE", _functions())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/decomposition.fast.contract.yaml")
        self.assertEqual(diagram["id"], "FAST-T-INVOKE")

    def test_empty_catalog_blocks_fast_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_diagram())
        tampered["functions"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FAST_DIAGRAM_SCHEMA, tampered, "tampered diagram")
        gate = evaluate_fast_diagram_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        diagram = _valid_diagram()
        diagram["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FAST_DIAGRAM_SCHEMA, diagram, "diagram with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_functions_entry(self):
        diagram = _valid_diagram()
        diagram["functions"][0] = {**diagram["functions"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FAST_DIAGRAM_SCHEMA, diagram, "diagram with a smuggled functions[] key")

    def test_schema_rejects_a_functions_entry_missing_why_ref(self):
        diagram = _valid_diagram()
        del diagram["functions"][0]["why_ref"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FAST_DIAGRAM_SCHEMA, diagram, "diagram missing why_ref on an entry")

    def test_id_is_distinct_from_decomposition_issue_tree_machine_id(self):
        self.assertNotEqual(METHOD_ID, "decomposition.issue_tree")
        self.assertEqual(METHOD_ID, "decomposition.fast")

    def test_fast_and_issue_tree_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "decomposition.issue_tree"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "decomposition.fast.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "decomposition.fast contract")


class FunctionEntryTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "FAST-")

    def test_fast_function_rejects_an_empty_function_id(self):
        with self.assertRaisesRegex(InvariantViolation, "FAST_EMPTY_FUNCTION_ID"):
            fast_function("   ", "name")

    def test_fast_function_rejects_an_empty_name(self):
        with self.assertRaisesRegex(InvariantViolation, "FAST_EMPTY_FUNCTION_NAME"):
            fast_function("FN-1", "   ")

    def test_fast_function_rejects_a_whitespace_only_why_ref(self):
        with self.assertRaisesRegex(InvariantViolation, "FAST_INVALID_WHY_REF"):
            fast_function("FN-1", "name", "   ")

    def test_fast_function_accepts_a_null_why_ref(self):
        entry = fast_function("FN-1", "name", None)
        self.assertIsNone(entry["why_ref"])

    def test_fast_function_default_why_ref_is_none(self):
        entry = fast_function("FN-1", "name")
        self.assertIsNone(entry["why_ref"])

    def test_fast_function_emits_exactly_the_3_keys(self):
        entry = fast_function("FN-1", "name", "FN-0")
        self.assertEqual(set(entry.keys()), {"id", "name", "why_ref"})


class RootCountInvariantTests(unittest.TestCase):
    """Invariant 1 (module docstring): exactly one functions[] entry has why_ref: null."""

    def test_5_function_tree_with_1_root_is_accepted(self):
        diagram = _valid_diagram()
        roots = [f for f in diagram["functions"] if f["why_ref"] is None]
        self.assertEqual([r["id"] for r in roots], ["FN-1"])

    def test_single_function_diagram_is_accepted(self):
        diagram = generate_fast_diagram("FAST-T-SINGLE", [fast_function("FN-1", "root only", None)])
        self.assertEqual(len(diagram["functions"]), 1)

    def test_zero_roots_is_refused(self):
        functions = _functions()
        functions[0] = fast_function("FN-1", "增加客戶留存", "FN-2")  # root now points at FN-2 -- 0 nulls, and a cycle too
        with self.assertRaisesRegex(InvariantViolation, "FAST_NO_ROOT"):
            generate_fast_diagram("FAST-T-ZEROROOT", functions)

    def test_two_roots_is_refused(self):
        functions = _functions()
        functions[2] = fast_function("FN-3", "建立每週使用習慣", None)  # was why_ref="FN-2" -- now a second root
        with self.assertRaisesRegex(InvariantViolation, "FAST_MULTIPLE_ROOTS"):
            generate_fast_diagram("FAST-T-TWOROOTS", functions)

    def test_empty_functions_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAST_EMPTY_FUNCTIONS"):
            generate_fast_diagram("FAST-T-EMPTY", [])

    def test_non_list_functions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAST_EMPTY_FUNCTIONS"):
            generate_fast_diagram("FAST-T-NONLIST", "not a list")

    def test_dangling_why_ref_is_refused(self):
        functions = _functions()
        functions[1] = fast_function("FN-2", "提升產品使用黏著度", "FN-DOES-NOT-EXIST")
        with self.assertRaisesRegex(InvariantViolation, "FAST_DANGLING_WHY_REF"):
            generate_fast_diagram("FAST-T-DANGLING", functions)

    def test_duplicate_function_id_is_refused(self):
        functions = _functions()
        functions[1] = fast_function("FN-1", "重複使用 root 的 id", "FN-1")  # duplicate id, and self-referential too
        with self.assertRaisesRegex(InvariantViolation, "FAST_DUPLICATE_FUNCTION_ID"):
            generate_fast_diagram("FAST-T-DUPID", functions)

    def test_large_diagram_is_accepted(self):
        """Open-ended, no maxItems -- a straight-line chain of 20 functions."""
        functions = [fast_function("FN-0", "root", None)]
        for i in range(1, 20):
            functions.append(fast_function(f"FN-{i}", f"function {i}", f"FN-{i - 1}"))
        diagram = generate_fast_diagram("FAST-T-LARGE", functions)
        self.assertEqual(len(diagram["functions"]), 20)


class AcyclicityInvariantTests(unittest.TestCase):
    """Invariant 2 (module docstring): the why_ref chain from every function terminates at the root with no
    cycle -- proven with a DISCONNECTED cycle so this is confirmed to be a real, separate check from invariant
    1 (single root), not merely a restatement of it."""

    def test_self_referential_function_is_refused(self):
        functions = _functions()
        functions[1] = fast_function("FN-2", "提升產品使用黏著度", "FN-2")  # points at itself
        with self.assertRaisesRegex(InvariantViolation, "FAST_CYCLE_DETECTED"):
            generate_fast_diagram("FAST-T-SELFLOOP", functions)

    def test_disconnected_cycle_away_from_the_legitimate_root_is_refused(self):
        """FN-A is a genuinely legitimate sole root; FN-B/FN-C cycle between each other; FN-D is properly
        attached to FN-A. Root count == 1 and referential integrity both hold -- only the cycle-detection
        traversal can catch this."""
        functions = [
            fast_function("FN-A", "根功能（合法）", None),
            fast_function("FN-B", "與 FN-C 互相指向", "FN-C"),
            fast_function("FN-C", "與 FN-B 互相指向", "FN-B"),
            fast_function("FN-D", "正確依附於根功能", "FN-A"),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FAST_CYCLE_DETECTED"):
            generate_fast_diagram("FAST-T-DISCONNECTEDCYCLE", functions)

    def test_3_cycle_is_refused(self):
        functions = [
            fast_function("FN-ROOT", "根功能", None),
            fast_function("FN-X", "cycle member 1", "FN-Y"),
            fast_function("FN-Y", "cycle member 2", "FN-Z"),
            fast_function("FN-Z", "cycle member 3", "FN-X"),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FAST_CYCLE_DETECTED"):
            generate_fast_diagram("FAST-T-3CYCLE", functions)

    def test_branching_tree_two_children_sharing_one_parent_is_accepted(self):
        """FN-2 has two 'how' children (FN-3, FN-5) -- a real tree, not merely a straight line."""
        diagram = _valid_diagram()
        children_of_fn2 = sorted(f["id"] for f in diagram["functions"] if f["why_ref"] == "FN-2")
        self.assertEqual(children_of_fn2, ["FN-3", "FN-5"])

    def test_cycle_error_names_a_function_genuinely_on_the_cycle_even_when_a_legitimate_branch_comes_first(self):
        """Critic finding, 2026-09-11: the original heuristic reported 'the first function in list order with
        a non-null why_ref', which is wrong whenever a legitimate, root-terminating branch happens to appear
        BEFORE the actual cyclic branch. Here FN-D is legitimate (attached to root FN-A) and listed before the
        real FN-B<->FN-C cycle -- the old code would have misreported 'FN-D'. The error must name a function
        that is genuinely part of the B/C cycle, never the innocent D."""
        functions = [
            fast_function("FN-A", "根功能（合法）", None),
            fast_function("FN-D", "正確依附於根功能，且在清單順序上排在真正的環之前", "FN-A"),
            fast_function("FN-B", "與 FN-C 互相指向", "FN-C"),
            fast_function("FN-C", "與 FN-B 互相指向", "FN-B"),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FAST_CYCLE_DETECTED") as ctx:
            generate_fast_diagram("FAST-T-LEGITBRANCHFIRST", functions)
        self.assertNotIn("FN-D", str(ctx.exception))
        self.assertRegex(str(ctx.exception), r"FN-[BC]")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID diagram's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_diagram(self):
        gate = evaluate_fast_diagram_integrity_gate(_valid_diagram(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_functions(self):
        diagram = copy.deepcopy(_valid_diagram())
        diagram["functions"] = []
        gate = evaluate_fast_diagram_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_second_root(self):
        diagram = copy.deepcopy(_valid_diagram())
        diagram["functions"][2]["why_ref"] = None  # FN-3 gains a second null root
        gate = evaluate_fast_diagram_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_zero_roots(self):
        diagram = copy.deepcopy(_valid_diagram())
        diagram["functions"][0]["why_ref"] = "FN-2"  # root's own null overwritten
        gate = evaluate_fast_diagram_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_disconnected_cycle(self):
        """The exact tampering the CLI slice's own hand-tampering proof performs: FN-3's why_ref flipped from
        FN-2 to FN-4 while FN-4's own why_ref (FN-3) is untouched, closing a 2-cycle. Root count and referential
        integrity both remain individually valid."""
        diagram = copy.deepcopy(_valid_diagram())
        by_id = {entry["id"]: entry for entry in diagram["functions"]}
        by_id["FN-3"]["why_ref"] = "FN-4"
        gate = evaluate_fast_diagram_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_dangling_why_ref(self):
        diagram = copy.deepcopy(_valid_diagram())
        diagram["functions"][1]["why_ref"] = "FN-DOES-NOT-EXIST"
        gate = evaluate_fast_diagram_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_id(self):
        diagram = copy.deepcopy(_valid_diagram())
        diagram["functions"][1]["id"] = diagram["functions"][0]["id"]
        gate = evaluate_fast_diagram_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_name(self):
        diagram = copy.deepcopy(_valid_diagram())
        diagram["functions"][0]["name"] = ""
        gate = evaluate_fast_diagram_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_diagram(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_fast_diagram_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        diagram = copy.deepcopy(_valid_diagram())
        diagram["id"] = "WRONG-001"
        gate = evaluate_fast_diagram_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        diagram = copy.deepcopy(_valid_diagram())
        diagram["version"] = 1
        gate = evaluate_fast_diagram_integrity_gate(diagram, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_fast_diagram_gates_returns_one_gate(self):
        results = evaluate_fast_diagram_gates(_valid_diagram(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["fast_diagram_integrity"])

    def test_evaluate_fast_diagram_gates_all_pass_on_a_valid_diagram(self):
        results = evaluate_fast_diagram_gates(_valid_diagram(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "decomposition.fast")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        diagram = _valid_diagram()
        self.assertEqual(set(diagram.keys()), {"id", "version", "generated_by_method", "functions"})

    def test_builder_does_not_leak_extra_function_keys(self):
        diagram = _valid_diagram()
        for entry in diagram["functions"]:
            self.assertEqual(set(entry.keys()), {"id", "name", "why_ref"})


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAST_INVALID_ID"):
            _valid_diagram(diagram_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAST_INVALID_ID"):
            _valid_diagram(diagram_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAST_INVALID_VERSION"):
            generate_fast_diagram("FAST-T-002", _functions(), version=1)


if __name__ == "__main__":
    unittest.main()
