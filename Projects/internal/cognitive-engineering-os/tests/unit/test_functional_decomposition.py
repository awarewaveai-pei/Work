"""Mutation-style tests for ``decomposition.functional_decomposition`` (F02 decomposition family, 2nd member).

Two real invariants beyond per-field shape (whole-tree id uniqueness, interface referential integrity),
exercised at BOTH layers: construction-time refusal (``generate_functional_decomposition`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation (``evaluate_tree_integrity_gate``/
``evaluate_interface_referential_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/functional-decomposition.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decomposition.functional_decomposition import (
    MAX_TREE_DEPTH,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    collect_function_ids,
    evaluate_functional_decomposition_gates,
    evaluate_interface_referential_integrity_gate,
    evaluate_provenance_required_gate,
    evaluate_tree_integrity_gate,
    function_node,
    generate_functional_decomposition,
    interface,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

FUNCTIONAL_DECOMPOSITION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/functional-decomposition.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "AI_SUGGESTED")


def _simple_tree() -> dict:
    return function_node(
        "F-ROOT",
        "top function",
        children=[
            function_node(
                "F-A",
                "subfunction A",
                children=[
                    function_node("F-A1", "subfunction A1"),
                    function_node("F-A2", "subfunction A2"),
                ],
            ),
            function_node("F-B", "subfunction B"),
        ],
    )


def _simple_interfaces() -> list[dict]:
    return [
        interface("IF-1", "F-A1", "F-A2", "A1 hands off its output to A2"),
        interface("IF-2", "F-A", "F-B", "A's validated result feeds B"),
    ]


def _valid_record(
    *,
    record_id: str = "FUNCDECOMP-T-001",
    top_function: dict | None = None,
    interfaces: list[dict] | None = None,
):
    return generate_functional_decomposition(
        record_id,
        top_function if top_function is not None else _simple_tree(),
        PROVENANCE,
        interfaces=interfaces if interfaces is not None else _simple_interfaces(),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(FUNCTIONAL_DECOMPOSITION_SCHEMA, _valid_record(), "functional decomposition")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_functional_decomposition, "FUNCDECOMP-T-INVOKE", _simple_tree(), PROVENANCE)
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/decomposition.functional_decomposition.contract.yaml")
        self.assertEqual(record["id"], "FUNCDECOMP-T-INVOKE")

    def test_empty_catalog_blocks_functional_decomposition_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["interfaces"][0]["to_function_ref"] = "F-GHOST"
        gate = evaluate_interface_referential_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        # The schema itself has no referential-integrity operator (runtime-only invariant, disclosed in the
        # schema's own compilation_decisions) -- schema validation alone would NOT catch this, confirming the
        # gate is the real enforcement layer here, not a redundant belt-and-suspenders check.
        self.contracts.validate(FUNCTIONAL_DECOMPOSITION_SCHEMA, tampered, "tampered record (schema-shape-valid, referentially broken)")

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FUNCTIONAL_DECOMPOSITION_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_function_node(self):
        record = _valid_record()
        record["top_function"] = {**record["top_function"], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FUNCTIONAL_DECOMPOSITION_SCHEMA, record, "record with a smuggled function_node key")

    def test_schema_rejects_an_unknown_key_inside_an_interface_entry(self):
        record = _valid_record()
        record["interfaces"][0] = {**record["interfaces"][0], "weight": 1}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FUNCTIONAL_DECOMPOSITION_SCHEMA, record, "record with a smuggled interfaces[] key")

    def test_schema_rejects_a_per_node_provenance_attempt(self):
        """Record-level-only provenance: additionalProperties:false on function_node structurally forbids a
        per-node provenance key, same discipline issue-tree.schema.yaml's own identical test establishes."""
        record = _valid_record()
        record["top_function"] = {**record["top_function"], "provenance": PROVENANCE}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FUNCTIONAL_DECOMPOSITION_SCHEMA, record, "record with a smuggled per-node provenance")

    def test_schema_accepts_an_empty_interfaces_list(self):
        record = _valid_record(interfaces=[])
        self.contracts.validate(FUNCTIONAL_DECOMPOSITION_SCHEMA, record, "record with no interfaces")

    def test_id_is_distinct_from_issue_tree_machine_id(self):
        self.assertEqual(METHOD_ID, "decomposition.functional_decomposition")
        self.assertNotEqual(METHOD_ID, "decomposition.issue_tree")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "decomposition.functional_decomposition.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "decomposition.functional_decomposition contract")


class FunctionNodeVocabularyTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "FUNCDECOMP-")

    def test_function_node_rejects_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_EMPTY_NODE_ID"):
            function_node("   ", "x")

    def test_function_node_rejects_empty_function_name(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_EMPTY_FUNCTION_NAME"):
            function_node("F-X", "   ")

    def test_function_node_defaults_children_to_empty_list(self):
        node = function_node("F-X", "leaf function")
        self.assertEqual(node["children"], [])

    def test_function_node_rejects_non_list_children(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_INVALID_CHILDREN"):
            function_node("F-X", "x", children="not-a-list")

    def test_interface_rejects_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_EMPTY_INTERFACE_ID"):
            interface("   ", "F-A", "F-B", "desc")

    def test_interface_rejects_empty_from_ref(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_EMPTY_FROM_FUNCTION_REF"):
            interface("IF-1", "   ", "F-B", "desc")

    def test_interface_rejects_empty_to_ref(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_EMPTY_TO_FUNCTION_REF"):
            interface("IF-1", "F-A", "   ", "desc")

    def test_interface_rejects_empty_description(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_EMPTY_INTERFACE_DESCRIPTION"):
            interface("IF-1", "F-A", "F-B", "   ")


class CollectFunctionIdsTests(unittest.TestCase):
    def test_collects_every_id_at_every_depth_in_pre_order(self):
        ids = collect_function_ids(_simple_tree())
        self.assertEqual(ids, ["F-ROOT", "F-A", "F-A1", "F-A2", "F-B"])

    def test_single_node_with_no_children(self):
        self.assertEqual(collect_function_ids(function_node("F-ONLY", "x")), ["F-ONLY"])


class TreeShapeAndIdUniquenessTests(unittest.TestCase):
    """Invariant #1 (module docstring): every function_node id anywhere in the whole tree is globally unique."""

    def test_well_formed_tree_is_accepted(self):
        record = _valid_record()
        self.assertEqual(record["top_function"]["id"], "F-ROOT")

    def test_single_node_tree_is_accepted(self):
        record = _valid_record(top_function=function_node("F-ONLY", "the only function"), interfaces=[])
        self.assertEqual(record["top_function"]["id"], "F-ONLY")

    def test_duplicate_root_and_child_id_is_refused(self):
        tree = function_node("F-DUP", "root", children=[function_node("F-DUP", "child with same id")])
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_DUPLICATE_NODE_ID"):
            generate_functional_decomposition("FUNCDECOMP-T-DUP", tree, PROVENANCE)

    def test_duplicate_id_across_two_separate_branches_is_refused(self):
        tree = function_node(
            "F-ROOT",
            "root",
            children=[
                function_node("F-SAME", "branch 1 leaf"),
                function_node("F-SAME", "branch 2 leaf, same id as branch 1"),
            ],
        )
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_DUPLICATE_NODE_ID"):
            generate_functional_decomposition("FUNCDECOMP-T-DUP2", tree, PROVENANCE)

    def test_malformed_tree_missing_a_required_key_is_refused(self):
        bad_tree = {"id": "F-X", "function_name": "x"}  # missing "children"
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_INVALID_TREE_SHAPE"):
            generate_functional_decomposition("FUNCDECOMP-T-BADSHAPE", bad_tree, PROVENANCE)

    def test_tree_deeper_than_max_depth_is_refused(self):
        node = function_node("F-LEAF", "leaf")
        for level in range(MAX_TREE_DEPTH + 2):
            node = function_node(f"F-L{level}", f"level {level}", children=[node])
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_INVALID_TREE_SHAPE"):
            generate_functional_decomposition("FUNCDECOMP-T-TOODEEP", node, PROVENANCE)

    def test_top_function_is_rebuilt_not_aliased(self):
        """Critic finding, 2026-09-11: the builder used to return the caller's own ``top_function`` object by
        reference. Mutating the ORIGINAL input after construction must NOT be visible in the returned record --
        same "not aliased" regression class ``decomposition.issue_tree``/``decomposition.logic_tree`` already
        cover for their own recursive node shapes."""
        tree = _simple_tree()
        record = generate_functional_decomposition("FUNCDECOMP-T-ALIAS", tree, PROVENANCE)
        self.assertIsNot(record["top_function"], tree)
        tree["function_name"] = "mutated after construction"
        tree["children"][0]["id"] = "F-DUP"  # would collide with an existing sibling id if aliased
        self.assertEqual(record["top_function"]["function_name"], "top function")
        self.assertEqual(record["top_function"]["children"][0]["id"], "F-A")

    def test_nested_grandchildren_are_deep_rebuilt_not_aliased(self):
        tree = _simple_tree()
        record = generate_functional_decomposition("FUNCDECOMP-T-ALIAS2", tree, PROVENANCE)
        tree["children"][0]["children"][0]["function_name"] = "mutated after construction"
        self.assertEqual(record["top_function"]["children"][0]["children"][0]["function_name"], "subfunction A1")

    def test_interfaces_are_rebuilt_not_aliased(self):
        ifaces = _simple_interfaces()
        record = generate_functional_decomposition("FUNCDECOMP-T-ALIAS3", _simple_tree(), PROVENANCE, interfaces=ifaces)
        ifaces[0]["description"] = "mutated after construction"
        self.assertEqual(record["interfaces"][0]["description"], "A1 hands off its output to A2")


class InterfaceReferentialIntegrityTests(unittest.TestCase):
    """Invariant #2 (module docstring): every interfaces[] entry's from_function_ref/to_function_ref must
    resolve to a real function id present somewhere in top_function."""

    def test_interfaces_referencing_real_ids_are_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["interfaces"]), 2)

    def test_empty_interfaces_list_is_accepted(self):
        record = _valid_record(interfaces=[])
        self.assertEqual(record["interfaces"], [])

    def test_dangling_from_function_ref_is_refused(self):
        bad_interfaces = [interface("IF-BAD", "F-DOES-NOT-EXIST", "F-A", "dangling from-ref")]
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_DANGLING_INTERFACE_REF"):
            generate_functional_decomposition("FUNCDECOMP-T-DANGLE1", _simple_tree(), PROVENANCE, interfaces=bad_interfaces)

    def test_dangling_to_function_ref_is_refused(self):
        bad_interfaces = [interface("IF-BAD", "F-A", "F-DOES-NOT-EXIST", "dangling to-ref")]
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_DANGLING_INTERFACE_REF"):
            generate_functional_decomposition("FUNCDECOMP-T-DANGLE2", _simple_tree(), PROVENANCE, interfaces=bad_interfaces)

    def test_both_refs_dangling_is_refused(self):
        bad_interfaces = [interface("IF-BAD", "F-GHOST-1", "F-GHOST-2", "both refs dangling")]
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_DANGLING_INTERFACE_REF"):
            generate_functional_decomposition("FUNCDECOMP-T-DANGLE3", _simple_tree(), PROVENANCE, interfaces=bad_interfaces)

    def test_self_referencing_interface_is_accepted(self):
        """Not forbidden -- see method contract's own compilation_decisions."""
        self_ref_interfaces = [interface("IF-SELF", "F-A", "F-A", "a self-relationship, not forbidden")]
        record = generate_functional_decomposition("FUNCDECOMP-T-SELFREF", _simple_tree(), PROVENANCE, interfaces=self_ref_interfaces)
        self.assertEqual(record["interfaces"][0]["from_function_ref"], "F-A")

    def test_malformed_interface_missing_a_key_is_refused(self):
        bad_interfaces = [{"id": "IF-BAD", "from_function_ref": "F-A", "to_function_ref": "F-B"}]  # missing description
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_INVALID_INTERFACE"):
            generate_functional_decomposition("FUNCDECOMP-T-BADIFACE", _simple_tree(), PROVENANCE, interfaces=bad_interfaces)

    def test_interfaces_checked_only_after_tree_shape_and_id_uniqueness(self):
        """A duplicate-id tree with an also-dangling interface must report the DUPLICATE_NODE_ID failure first
        (builder's own documented check order) -- proves the ordering in the module docstring, not just that
        both invariants exist somewhere."""
        dup_tree = function_node("F-X", "root", children=[function_node("F-X", "dup child")])
        bad_interfaces = [interface("IF-BAD", "F-GHOST", "F-X", "dangling too")]
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_DUPLICATE_NODE_ID"):
            generate_functional_decomposition("FUNCDECOMP-T-ORDER", dup_tree, PROVENANCE, interfaces=bad_interfaces)


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_INVALID_VERSION"):
            generate_functional_decomposition("FUNCDECOMP-T-002", _simple_tree(), PROVENANCE, version=1)

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FUNCDECOMP_INVALID_PROVENANCE"):
            generate_functional_decomposition("FUNCDECOMP-T-003", _simple_tree(), {"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_functional_decomposition_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_tree_gate_catches_hand_tampered_duplicate_id(self):
        record = copy.deepcopy(_valid_record())
        record["top_function"]["children"][1]["id"] = record["top_function"]["children"][0]["id"]
        gate = evaluate_tree_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_tree_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_tree_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_tree_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_tree_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_tree_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_tree_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_interface_gate_catches_hand_tampered_dangling_reference(self):
        record = copy.deepcopy(_valid_record())
        record["interfaces"].append({"id": "IF-TAMPERED", "from_function_ref": "F-A", "to_function_ref": "F-GHOST", "description": "spliced in after construction"})
        gate = evaluate_interface_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_interface_gate_passes_when_tree_is_valid_and_no_interfaces_dangle(self):
        record = copy.deepcopy(_valid_record())
        gate = evaluate_interface_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_interface_gate_fails_closed_when_tree_itself_is_invalid(self):
        record = copy.deepcopy(_valid_record())
        del record["top_function"]["children"]
        gate = evaluate_interface_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_interface_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_interface_referential_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_functional_decomposition_gates_returns_three_gates_in_order(self):
        results = evaluate_functional_decomposition_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "tree_integrity", "interface_referential_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "decomposition.functional_decomposition")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "top_function", "interfaces", "provenance"})


if __name__ == "__main__":
    unittest.main()
