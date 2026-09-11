"""Mutation-style tests for ``decomposition.issue_tree`` (1st `decomposition` family member, F02, opening a
brand-new family -- see the module's own docstring for the full due-diligence read: Atlas F02 table row L363 +
dedicated §12.6 worked example, the differentiation from ``association.mind_map``'s own fixed-4-level shape,
and the arbitrary-depth/``MAX_TREE_DEPTH`` precedent reused from ``decision.decision_tree``).

Two-layer discipline proven for BOTH real invariants:

1. Tree shape/completeness (``ISSUETREE_INVALID_TREE_SHAPE``) -- every node non-empty ``id``/``question``,
   ``children`` a list (possibly empty, for a leaf) of recursively well-shaped entries, bounded to
   ``MAX_TREE_DEPTH=100``.
2. Whole-tree id uniqueness (``ISSUETREE_DUPLICATE_NODE_ID``) -- every node id, root AND every descendant at
   ANY depth, shares one id namespace; same invariant class ``association.mind_map``'s own
   ``MINDMAP_DUPLICATE_BRANCH_ID`` establishes, generalized here to arbitrary recursion depth.

Each is checked at CONSTRUCTION (raises before a malformed record is ever built) and independently RE-DERIVED
at the GATE (a hand-tampered copy of an already-valid record must still be caught -- the gate never trusts a
stored value, and never crashes on malformed/non-dict input -- fails closed instead).

Also covers: the real derived view ``all_questions`` (recomputed fresh, never a stored field), schema
conformance against the real spec-root schema this same slice added, the ``MAX_TREE_DEPTH`` boundary (exactly
at the limit legal, one past it refused), and the structural (closed-key-set) proof that no per-node
provenance field can be smuggled into a valid record (record-level-only placement, see module docstring).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decomposition.issue_tree import (
    MAX_TREE_DEPTH,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    all_questions,
    evaluate_issue_tree_gates,
    evaluate_issue_tree_integrity_gate,
    evaluate_provenance_required_gate,
    generate_issue_tree,
    issue_tree_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/issue-tree.schema.yaml"
TS = "2026-09-11T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _raw_node(**overrides):
    base = {"id": "Q-T-1", "question": "some sub-question", "children": []}
    base.update(overrides)
    return base


def _minimal_root():
    return issue_tree_node("Q-T-1", "some sub-question")


def _build(record_id="ISSUETREE-T-001", root=None, version="1.0.0"):
    return generate_issue_tree(record_id, _minimal_root() if root is None else root, _prov(), version=version)


def _valid_record():
    return _build()


def _deliverable_root():
    return issue_tree_node(
        "Q-ROOT",
        "是否進入新市場?",
        children=[
            issue_tree_node(
                "Q-L1-MARKET",
                "市場吸引力是否足夠?",
                children=[
                    issue_tree_node("Q-L2-SIZE", "目標市場規模是否達到最低可行門檻?"),
                    issue_tree_node("Q-L2-GROWTH", "該市場年成長率是否高於公司整體平均?"),
                ],
            ),
            issue_tree_node("Q-L1-CAPABILITY", "公司能力是否足以支撐進入?"),
            issue_tree_node("Q-L1-FINANCE", "財務可行性是否成立?"),
        ],
    )


def _deliverable_record():
    return _build(record_id="ISSUETREE-T-DELIVERABLE", root=_deliverable_root())


def _chain_of_depth(total_nodes: int) -> dict:
    """A single-child right-leaning chain of ``total_nodes`` nodes (root at depth 0, leaf at depth
    ``total_nodes - 1``), each id unique -- used to probe the ``MAX_TREE_DEPTH`` boundary without the
    duplicate-id invariant confounding the result."""
    node = {"id": f"D-{total_nodes - 1}", "question": "leaf", "children": []}
    for level in range(total_nodes - 2, -1, -1):
        node = {"id": f"D-{level}", "question": f"level {level}", "children": [node]}
    return node


class ConstructorTests(unittest.TestCase):
    def test_returns_the_three_keys(self):
        node = issue_tree_node("Q1", "question text")
        self.assertEqual(set(node.keys()), {"id", "question", "children"})

    def test_children_defaults_to_empty_list_when_omitted(self):
        node = issue_tree_node("Q1", "question text")
        self.assertEqual(node["children"], [])

    def test_children_defaults_to_empty_list_when_none(self):
        node = issue_tree_node("Q1", "question text", children=None)
        self.assertEqual(node["children"], [])

    def test_children_included_when_given(self):
        child = issue_tree_node("Q2", "child question")
        node = issue_tree_node("Q1", "question text", children=[child])
        self.assertEqual(len(node["children"]), 1)

    def test_children_list_is_rebuilt_not_aliased(self):
        children = [issue_tree_node("Q2", "child question")]
        node = issue_tree_node("Q1", "question text", children=children)
        children[0]["question"] = "mutated after construction"
        self.assertEqual(node["children"][0]["question"], "child question")

    def test_nested_grandchildren_are_deep_rebuilt_not_aliased(self):
        grandchild = issue_tree_node("Q3", "grandchild question")
        child = issue_tree_node("Q2", "child question", children=[grandchild])
        node = issue_tree_node("Q1", "question text", children=[child])
        grandchild["question"] = "mutated after construction"
        self.assertEqual(node["children"][0]["children"][0]["question"], "grandchild question")

    def test_fields_round_trip_verbatim(self):
        node = issue_tree_node("Q9", "some label")
        self.assertEqual(node["id"], "Q9")
        self.assertEqual(node["question"], "some label")

    def test_empty_node_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_EMPTY_NODE_ID"):
            issue_tree_node("", "question")

    def test_whitespace_node_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_EMPTY_NODE_ID"):
            issue_tree_node("   ", "question")

    def test_empty_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_EMPTY_QUESTION"):
            issue_tree_node("Q1", "")

    def test_whitespace_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_EMPTY_QUESTION"):
            issue_tree_node("Q1", "   ")


class GenerateRecordConstructionTests(unittest.TestCase):
    # --- happy path ---
    def test_minimal_record_constructs(self):
        record = _valid_record()
        self.assertTrue(record["id"].startswith(RECORD_ID_PREFIX))

    def test_defaults_version_and_generated_by_method(self):
        record = _valid_record()
        self.assertEqual(record["version"], "1.0.0")
        self.assertEqual(record["generated_by_method"], METHOD_ID)

    def test_custom_version_and_generated_by_method_round_trip(self):
        record = generate_issue_tree("ISSUETREE-T-002", _minimal_root(), _prov(), version="2.3.4", generated_by_method="decomposition.issue_tree@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(record["generated_by_method"], "decomposition.issue_tree@test")

    def test_multi_level_tree_constructs_successfully(self):
        record = _build(root=_deliverable_root())
        self.assertEqual(len(record["root"]["children"]), 3)
        self.assertEqual(len(record["root"]["children"][0]["children"]), 2)

    def test_leaf_node_children_is_empty_list_not_omitted(self):
        record = _valid_record()
        self.assertIn("children", record["root"])
        self.assertEqual(record["root"]["children"], [])

    def test_provenance_stored_by_reference(self):
        prov = _prov()
        record = generate_issue_tree("ISSUETREE-T-003", _minimal_root(), prov)
        self.assertIs(record["provenance"], prov)

    def test_root_is_rebuilt_not_aliased(self):
        root = _minimal_root()
        record = _build(root=root)
        root["question"] = "mutated after construction"
        self.assertEqual(record["root"]["question"], "some sub-question")

    def test_nested_children_are_deep_rebuilt_not_aliased(self):
        root = _deliverable_root()
        record = _build(root=root)
        root["children"][0]["children"][0]["question"] = "mutated after construction"
        self.assertEqual(record["root"]["children"][0]["children"][0]["question"], "目標市場規模是否達到最低可行門檻?")

    # --- record_id ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_RECORD_ID"):
            _build(record_id="MINDMAP-1")

    def test_non_string_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_RECORD_ID"):
            _build(record_id=12345)

    def test_none_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_RECORD_ID"):
            _build(record_id=None)

    # --- version ---
    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_VERSION"):
            _build(version=1.0)

    # --- provenance ---
    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_PROVENANCE"):
            generate_issue_tree("ISSUETREE-T-004", _minimal_root(), {"nonsense": "not a real provenance_record"})

    def test_none_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_PROVENANCE"):
            generate_issue_tree("ISSUETREE-T-005", _minimal_root(), None)

    # --- tree shape: root itself ---
    def test_root_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root="not a dict")

    def test_root_none_is_refused(self):
        # NOT via _build() -- that helper treats root=None as "use the default minimal root", so it would
        # never actually exercise this path. Call the generator directly to pass a real None through.
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            generate_issue_tree("ISSUETREE-T-001", None, _prov())

    def test_root_missing_id_is_refused(self):
        entry = _raw_node()
        del entry["id"]
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=entry)

    def test_root_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(id=""))

    def test_root_non_string_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(id=7))

    def test_root_missing_question_is_refused(self):
        entry = _raw_node()
        del entry["question"]
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=entry)

    def test_root_empty_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(question=""))

    def test_root_whitespace_only_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(question="   "))

    def test_root_missing_children_key_is_refused(self):
        entry = _raw_node()
        del entry["children"]
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=entry)

    def test_root_non_list_children_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(children="not a list"))

    def test_root_unknown_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(unexpected_field="surprise"))

    def test_root_empty_children_list_is_legal(self):
        record = _build(root=_raw_node(children=[]))
        self.assertEqual(record["root"]["children"], [])

    # --- tree shape: nested child (recursion actually walks) ---
    def test_nested_child_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(children=["not a dict"]))

    def test_nested_child_missing_id_is_refused(self):
        child = _raw_node(id="Q-CHILD")
        del child["id"]
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(children=[child]))

    def test_nested_child_empty_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(children=[_raw_node(id="Q-CHILD", question="")]))

    def test_nested_child_unknown_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(children=[_raw_node(id="Q-CHILD", smuggled="x")]))

    def test_deeply_nested_grandchild_defect_is_caught(self):
        """Confirms the recursive check actually walks multiple levels down, not just one."""
        grandchild = _raw_node(id="Q-GRANDCHILD", question="")
        child = _raw_node(id="Q-CHILD", children=[grandchild])
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(children=[child]))

    def test_well_shaped_nested_child_is_legal(self):
        record = _build(root=_raw_node(children=[_raw_node(id="Q-CHILD")]))
        self.assertEqual(record["root"]["children"][0]["id"], "Q-CHILD")

    # --- per-node provenance is structurally impossible (record-level only) ---
    def test_node_with_smuggled_provenance_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_raw_node(provenance=_prov()))

    # --- invariant #2: whole-tree duplicate node id ---
    def test_duplicate_root_and_direct_child_id_is_refused(self):
        root = _raw_node(id="SAME-ID", children=[_raw_node(id="SAME-ID", question="child")])
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_DUPLICATE_NODE_ID"):
            _build(root=root)

    def test_duplicate_id_across_two_siblings_is_refused(self):
        root = _raw_node(id="Q-ROOT", children=[_raw_node(id="SAME-ID", question="c1"), _raw_node(id="SAME-ID", question="c2")])
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_DUPLICATE_NODE_ID"):
            _build(root=root)

    def test_duplicate_id_across_two_different_subtrees_is_refused(self):
        """Cross-branch, not merely within-one-subtree: a grandchild under branch A reusing a grandchild id
        under branch B."""
        root = _raw_node(
            id="Q-ROOT",
            children=[
                _raw_node(id="BRANCH-A", children=[_raw_node(id="SAME-ID", question="a-grandchild")]),
                _raw_node(id="BRANCH-B", children=[_raw_node(id="SAME-ID", question="b-grandchild")]),
            ],
        )
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_DUPLICATE_NODE_ID"):
            _build(root=root)

    def test_duplicate_node_id_error_names_the_id(self):
        root = _raw_node(id="DUP-X", children=[_raw_node(id="DUP-X", question="child")])
        with self.assertRaisesRegex(InvariantViolation, "DUP-X"):
            _build(root=root)

    def test_many_unique_ids_construct_successfully(self):
        children = [issue_tree_node(f"Q-{n}", f"question {n}") for n in range(20)]
        record = _build(root=issue_tree_node("Q-ROOT", "root question", children=children))
        self.assertEqual(len(record["root"]["children"]), 20)

    # --- MAX_TREE_DEPTH boundary ---
    def test_chain_at_exactly_max_depth_is_legal(self):
        # total_nodes = MAX_TREE_DEPTH + 1 -> leaf depth == MAX_TREE_DEPTH (boundary inclusive)
        record = _build(root=_chain_of_depth(MAX_TREE_DEPTH + 1))
        self.assertTrue(record["id"].startswith(RECORD_ID_PREFIX))

    def test_chain_one_past_max_depth_is_refused(self):
        # total_nodes = MAX_TREE_DEPTH + 2 -> leaf depth == MAX_TREE_DEPTH + 1, over the bound
        with self.assertRaisesRegex(InvariantViolation, "ISSUETREE_INVALID_TREE_SHAPE"):
            _build(root=_chain_of_depth(MAX_TREE_DEPTH + 2))


class AllQuestionsComputeTests(unittest.TestCase):
    def test_returns_single_question_for_leaf_only_record(self):
        record = _valid_record()
        self.assertEqual(all_questions(record), ["some sub-question"])

    def test_returns_questions_in_tree_pre_order(self):
        record = _deliverable_record()
        self.assertEqual(
            all_questions(record),
            [
                "是否進入新市場?",
                "市場吸引力是否足夠?",
                "目標市場規模是否達到最低可行門檻?",
                "該市場年成長率是否高於公司整體平均?",
                "公司能力是否足以支撐進入?",
                "財務可行性是否成立?",
            ],
        )

    def test_count_matches_node_count(self):
        record = _deliverable_record()
        self.assertEqual(len(all_questions(record)), 6)


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_both_gates(self):
        record = _deliverable_record()
        self.assertTrue(all_gates_pass(evaluate_issue_tree_gates(record, "test", TS)))

    def test_valid_record_passes_provenance_gate(self):
        self.assertEqual(evaluate_provenance_required_gate(_valid_record(), "test", TS)["status"], "PASS")

    def test_valid_record_passes_integrity_gate(self):
        self.assertEqual(evaluate_issue_tree_integrity_gate(_valid_record(), "test", TS)["status"], "PASS")

    def test_integrity_gate_evidence_reports_total_node_count(self):
        result = evaluate_issue_tree_integrity_gate(_deliverable_record(), "test", TS)
        self.assertEqual(result["evidence"][0]["total_node_count"], 6)

    # --- provenance gate ---
    def test_provenance_gate_fails_on_non_dict_record(self):
        for bad_record in (None, "not a record", [], 42):
            with self.subTest(bad_record=bad_record):
                result = evaluate_provenance_required_gate(bad_record, "test", TS)
                self.assertEqual(result["status"], "FAIL")

    def test_provenance_gate_fails_on_missing_record_provenance(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")

    def test_provenance_gate_fails_on_structurally_garbage_provenance(self):
        record = _valid_record()
        record["provenance"] = {"nonsense": "not a real provenance_record"}
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")

    # --- integrity gate: fails closed on malformed/non-dict input, never crashes ---
    def test_integrity_gate_fails_on_non_dict_record_without_raising(self):
        for bad_record in (None, "not-a-dict", [], 42, 3.14, True):
            with self.subTest(bad_record=bad_record):
                result = evaluate_issue_tree_integrity_gate(bad_record, "test", TS)
                self.assertEqual(result["status"], "FAIL")

    def test_gates_bundle_fails_closed_on_non_dict_record_without_raising(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                results = evaluate_issue_tree_gates(bad_record, "test", TS)
                self.assertFalse(all_gates_pass(results))
                self.assertEqual(len(results), 2)

    def test_integrity_gate_fails_on_tampered_id_prefix(self):
        record = _valid_record()
        record["id"] = "NOTISSUETREE-2026-001"
        result = evaluate_issue_tree_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("id", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_empty_id(self):
        record = _valid_record()
        record["id"] = ""
        self.assertEqual(evaluate_issue_tree_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_fails_on_non_string_version(self):
        record = _valid_record()
        record["version"] = 1.0
        result = evaluate_issue_tree_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("version", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_missing_root(self):
        record = _valid_record()
        del record["root"]
        self.assertEqual(evaluate_issue_tree_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_fails_on_non_dict_root(self):
        record = _valid_record()
        record["root"] = "not a dict"
        self.assertEqual(evaluate_issue_tree_integrity_gate(record, "test", TS)["status"], "FAIL")

    # --- integrity gate: re-derives per-node shape (bypassing the constructor entirely) ---
    def test_integrity_gate_catches_hand_tampered_missing_node_key(self):
        record = _valid_record()
        del record["root"]["question"]
        self.assertEqual(evaluate_issue_tree_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_unknown_node_key(self):
        record = _valid_record()
        record["root"]["smuggled_field"] = "should not be here"
        self.assertEqual(evaluate_issue_tree_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_empty_question(self):
        record = _deliverable_record()
        record["root"]["children"][0]["question"] = ""
        result = evaluate_issue_tree_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_deeply_nested_defect(self):
        record = _deliverable_record()
        record["root"]["children"][0]["children"][1]["question"] = "   "
        result = evaluate_issue_tree_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_smuggled_per_node_provenance(self):
        """No such field exists in this schema by design (record-level-only provenance, see module docstring)
        -- but if a caller hand-tampers one onto a stored node anyway (bypassing the schema entirely), the
        integrity gate's own closed-key-set shape check still rejects it."""
        record = _deliverable_record()
        record["root"]["children"][0]["provenance"] = _prov()
        result = evaluate_issue_tree_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")

    # --- integrity gate: re-derives invariant #2 (bypassing the constructor entirely) ---
    def test_integrity_gate_catches_hand_tampered_duplicate_sibling_id(self):
        record = _deliverable_record()
        record["root"]["children"][1]["id"] = record["root"]["children"][0]["id"]
        result = evaluate_issue_tree_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ISSUETREE_DUPLICATE_NODE_ID")

    def test_integrity_gate_catches_hand_tampered_cross_depth_duplicate_id(self):
        record = _deliverable_record()
        record["root"]["children"][2]["id"] = record["root"]["children"][0]["children"][0]["id"]
        result = evaluate_issue_tree_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ISSUETREE_DUPLICATE_NODE_ID")

    def test_integrity_gate_this_asymmetric_case_is_unreachable_through_the_real_constructor(self):
        # generate_issue_tree's own duplicate-id check makes this construction-time unreachable (proven
        # above); the gate is the ONLY layer that can ever observe it, hence this dedicated hand-tampering
        # test (same asymmetric-coverage class association.mind_map's own test suite documents).
        record = _deliverable_record()
        record["root"]["children"].append(copy.deepcopy(record["root"]["children"][0]))
        self.assertEqual(evaluate_issue_tree_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_root_id_reused_by_grandchild(self):
        record = _deliverable_record()
        record["root"]["children"][0]["children"][0]["id"] = record["root"]["id"]
        result = evaluate_issue_tree_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "ISSUETREE_DUPLICATE_NODE_ID")


class EvaluateIssueTreeGatesTests(unittest.TestCase):
    def test_returns_exactly_two_gates_in_order(self):
        results = evaluate_issue_tree_gates(_valid_record(), "test", TS)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "issue_tree_integrity"])

    def test_all_gates_pass_true_when_both_pass(self):
        self.assertTrue(all_gates_pass(evaluate_issue_tree_gates(_valid_record(), "test", TS)))

    def test_all_gates_pass_false_when_one_fails(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertFalse(all_gates_pass(evaluate_issue_tree_gates(record, "test", TS)))

    def test_all_gates_pass_false_when_both_fail(self):
        record = _valid_record()
        record["provenance"] = None
        del record["root"]["question"]
        self.assertFalse(all_gates_pass(evaluate_issue_tree_gates(record, "test", TS)))

    def test_all_gates_pass_treats_not_applicable_as_passing(self):
        fake = [{"gate_id": "x", "status": "PASS"}, {"gate_id": "y", "status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(fake))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_minimal_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal issue tree record")

    def test_deliverable_scenario_record_validates_and_all_gates_pass(self):
        record = _deliverable_record()
        self.contracts.validate(RECORD_SCHEMA, record, "deliverable-set issue tree record")
        self.assertTrue(all_gates_pass(evaluate_issue_tree_gates(record, "test", TS)))

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["root"]["question"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, tampered, "tampered issue tree record")
        gate = evaluate_issue_tree_integrity_gate(tampered, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "issue-tree.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "issue-tree.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_issue_tree_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_issue_tree("ISSUETREE-T-006", _minimal_root(), _prov(), version="9.9.9", generated_by_method="decomposition.issue_tree@test")
        self.contracts.validate(RECORD_SCHEMA, record, "custom version/generated_by_method record")
        self.assertEqual(record["generated_by_method"], "decomposition.issue_tree@test")
        self.assertEqual(record["version"], "9.9.9")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_issue_tree_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_unknown_top_level_key(self):
        record = _valid_record()
        record["unexpected_top_level_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, record, "record with unknown top-level key")

    def test_schema_rejects_smuggled_per_node_provenance(self):
        record = _valid_record()
        record["root"]["provenance"] = _prov()
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, record, "record with a smuggled per-node provenance field")

    def test_schema_accepts_a_leaf_with_empty_children_array(self):
        record = _valid_record()
        self.assertEqual(record["root"]["children"], [])
        self.contracts.validate(RECORD_SCHEMA, record, "leaf node with empty children array")

    def test_schema_does_not_itself_reject_a_duplicate_node_id(self):
        """JSON Schema has no native cross-recursive-structure uniqueness operator (disclosed in the schema's
        own top-level description) -- a duplicate id passes SCHEMA validation; only the runtime gate/builder
        catch it. This test documents that boundary rather than asserting a false schema guarantee."""
        record = _valid_record()
        record["root"]["children"] = [dict(record["root"])]
        self.contracts.validate(RECORD_SCHEMA, record, "schema does not itself reject a duplicate id")
        gate = evaluate_issue_tree_integrity_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
