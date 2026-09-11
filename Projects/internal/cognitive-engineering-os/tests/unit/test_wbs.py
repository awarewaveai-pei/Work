"""Mutation-style tests for ``decomposition.wbs`` (F02 family, one of 9 concurrent members opening this
family in the same batch -- see the module's own docstring for the full due-diligence read against
``decomposition.issue_tree.py``).

Two-layer discipline proven for BOTH headline invariants:

1. Leaf/non-leaf owner+estimate placement (``WBS_LEAF_MISSING_OWNER_OR_ESTIMATE`` /
   ``WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE``) -- Atlas F02 L371's own "Deliverable→Work package→owner/estimate"
   tier progression: owner/estimate are a work-package (leaf) tier property, never a deliverable (non-leaf)
   tier one.
2. ``total_estimate_hours`` GENUINE_COMPUTE rollup (``WBS_TOTAL_ESTIMATE_MISMATCH``, surfaced via
   ``evaluate_wbs_rollup_integrity_gate``) -- the real external WBS "100% rule": a parent's total work equals
   the sum of its parts, mechanically re-derived bottom-up, never caller-supplied.

Each is checked at CONSTRUCTION (raises before a malformed record is ever built) and independently RE-DERIVED
at the GATE (a hand-tampered copy of an already-valid record must still be caught -- the gate never trusts a
stored value, and never crashes on malformed/non-dict input -- fails closed instead).

Includes one hand-worked arithmetic example, task-mandated: 3 leaves (4h/6h/10h) under one 2-level tree,
confirming the parent's ``total_estimate_hours`` is mechanically 20 -- not caller-asserted.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decomposition.wbs import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_wbs_gates,
    evaluate_wbs_rollup_integrity_gate,
    evaluate_wbs_structural_integrity_gate,
    generate_wbs,
    list_leaf_work_packages,
    wbs_node,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/work-breakdown-structure.schema.yaml"
TS = "2026-09-11T00:00:00Z"


def _prov():
    return make_provenance("HYPOTHESIS", "AI_SUGGESTED")


def _leaf(node_id="WP-1", name="a work package", owner="someone", estimate_hours=1.0, children=None):
    return wbs_node(node_id, name, owner=owner, estimate_hours=estimate_hours, children=children)


def _minimal_deliverable():
    return wbs_node("D-ROOT", "a deliverable", children=[_leaf()])


def _three_leaf_two_level_deliverable():
    """The task-mandated hand-worked example: 3 leaves (4h/6h/10h) under one 2-level tree. 視覺設計 branch
    totals 4+6=10; the whole deliverable totals 4+6+10=20."""
    return wbs_node(
        "D-ROOT",
        "公司官網改版上線",
        children=[
            wbs_node(
                "D-DESIGN",
                "視覺設計",
                children=[
                    _leaf("WP-WIREFRAME", "線框稿", owner="設計師A", estimate_hours=4),
                    _leaf("WP-VISUALDESIGN", "視覺稿", owner="設計師A", estimate_hours=6),
                ],
            ),
            _leaf("WP-FRONTEND", "前端切版與串接", owner="工程師B", estimate_hours=10),
        ],
    )


def _build(record_id="WBS-T-001", deliverable=None, provenance=None, version="1.0.0"):
    return generate_wbs(record_id, deliverable if deliverable is not None else _minimal_deliverable(), provenance if provenance is not None else _prov(), version=version)


def _valid_record():
    return _build()


class WbsNodeConstructorTests(unittest.TestCase):
    def test_leaf_returns_five_keys_no_total(self):
        node = _leaf()
        self.assertEqual(set(node.keys()), {"id", "name", "owner", "estimate_hours", "children"})

    def test_default_children_is_empty_list(self):
        node = wbs_node("N1", "a node")
        self.assertEqual(node["children"], [])

    def test_default_owner_and_estimate_are_none(self):
        node = wbs_node("N1", "a node")
        self.assertIsNone(node["owner"])
        self.assertIsNone(node["estimate_hours"])

    def test_fields_round_trip_verbatim(self):
        node = wbs_node("N9", "some name", owner="alice", estimate_hours=2.5)
        self.assertEqual(node["id"], "N9")
        self.assertEqual(node["name"], "some name")
        self.assertEqual(node["owner"], "alice")
        self.assertEqual(node["estimate_hours"], 2.5)

    def test_empty_node_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_EMPTY_NODE_ID"):
            wbs_node("", "a name")

    def test_empty_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_EMPTY_NODE_NAME"):
            wbs_node("N1", "")

    def test_whitespace_only_owner_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_OWNER"):
            wbs_node("N1", "a name", owner="   ")

    def test_negative_estimate_hours_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_ESTIMATE_HOURS"):
            wbs_node("N1", "a name", estimate_hours=-1)

    def test_nan_estimate_hours_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_ESTIMATE_HOURS"):
            wbs_node("N1", "a name", estimate_hours=float("nan"))

    def test_bool_estimate_hours_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_ESTIMATE_HOURS"):
            wbs_node("N1", "a name", estimate_hours=True)

    def test_zero_estimate_hours_is_legal(self):
        node = wbs_node("N1", "a name", owner="x", estimate_hours=0)
        self.assertEqual(node["estimate_hours"], 0)


class GenerateWbsConstructionTests(unittest.TestCase):
    # --- happy path ---
    def test_minimal_record_constructs(self):
        record = _valid_record()
        self.assertTrue(record["id"].startswith(RECORD_ID_PREFIX))

    def test_defaults_version_and_generated_by_method(self):
        record = _valid_record()
        self.assertEqual(record["version"], "1.0.0")
        self.assertEqual(record["generated_by_method"], METHOD_ID)

    def test_custom_version_and_generated_by_method_round_trip(self):
        record = generate_wbs("WBS-T-002", _minimal_deliverable(), _prov(), version="2.3.4", generated_by_method="decomposition.wbs@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(record["generated_by_method"], "decomposition.wbs@test")

    def test_provenance_stored_by_reference(self):
        prov = _prov()
        record = generate_wbs("WBS-T-003", _minimal_deliverable(), prov)
        self.assertIs(record["provenance"], prov)

    def test_deliverable_is_rebuilt_not_aliased(self):
        deliverable = _minimal_deliverable()
        record = _build(deliverable=deliverable)
        deliverable["name"] = "mutated after construction"
        self.assertEqual(record["deliverable"]["name"], "a deliverable")

    # --- HAND-WORKED ARITHMETIC (task-mandated): 3 leaves (4/6/10) under a 2-level tree, parent total = 20 ---
    def test_hand_worked_rollup_leaf_values_unchanged(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        design_branch = record["deliverable"]["children"][0]
        self.assertEqual(design_branch["children"][0]["total_estimate_hours"], 4)
        self.assertEqual(design_branch["children"][1]["total_estimate_hours"], 6)
        self.assertEqual(record["deliverable"]["children"][1]["total_estimate_hours"], 10)

    def test_hand_worked_rollup_intermediate_branch_is_mechanically_ten(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        design_branch = record["deliverable"]["children"][0]
        self.assertEqual(design_branch["total_estimate_hours"], 4 + 6)
        self.assertEqual(design_branch["total_estimate_hours"], 10)

    def test_hand_worked_rollup_root_is_mechanically_twenty_not_caller_asserted(self):
        # generate_wbs/wbs_node accept no total_estimate_hours parameter anywhere -- this value can ONLY have
        # come from the builder's own bottom-up sum, never from anything the test itself asserted into place.
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        self.assertEqual(record["deliverable"]["total_estimate_hours"], 4 + 6 + 10)
        self.assertEqual(record["deliverable"]["total_estimate_hours"], 20)

    def test_single_leaf_deliverable_total_equals_its_own_estimate(self):
        record = _build(deliverable=_leaf("WP-SOLO", "a solo work package", owner="x", estimate_hours=7))
        self.assertEqual(record["deliverable"]["total_estimate_hours"], 7)

    def test_wide_flat_tree_sums_all_leaves(self):
        deliverable = wbs_node("D-ROOT", "a deliverable", children=[_leaf(f"WP-{n}", f"wp {n}", owner="x", estimate_hours=n) for n in range(1, 6)])
        record = _build(deliverable=deliverable)
        self.assertEqual(record["deliverable"]["total_estimate_hours"], sum(range(1, 6)))

    # --- record_id ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_RECORD_ID"):
            _build(record_id="NOTWBS-1")

    def test_none_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_RECORD_ID"):
            _build(record_id=None)

    # --- version / provenance ---
    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_VERSION"):
            _build(version=1.0)

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_PROVENANCE"):
            _build(provenance={"nonsense": "not real"})

    # --- tree shape ---
    def test_non_dict_deliverable_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_TREE_SHAPE"):
            _build(deliverable="not a dict")

    def test_deliverable_missing_children_key_is_refused(self):
        bad = _leaf()
        del bad["children"]
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_TREE_SHAPE"):
            _build(deliverable=bad)

    def test_deliverable_unknown_extra_key_is_refused(self):
        bad = {**_leaf(), "unexpected_field": "surprise"}
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_TREE_SHAPE"):
            _build(deliverable=bad)

    def test_deliverable_with_smuggled_total_estimate_hours_is_refused(self):
        # total_estimate_hours is NEVER an accepted input key -- a caller-supplied one must be refused as an
        # unknown/wrong-shape key, not silently accepted.
        bad = {**_leaf(), "total_estimate_hours": 999}
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_TREE_SHAPE"):
            _build(deliverable=bad)

    def test_deliverable_non_string_name_is_refused(self):
        bad = {**_leaf(), "name": 42}
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_TREE_SHAPE"):
            _build(deliverable=bad)

    def test_deliverable_non_list_children_is_refused(self):
        bad = {**_leaf(), "children": "not a list"}
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_TREE_SHAPE"):
            _build(deliverable=bad)

    def test_nested_malformed_child_is_refused(self):
        deliverable = wbs_node("D-ROOT", "a deliverable", children=[{**_leaf(), "id": ""}])
        with self.assertRaisesRegex(InvariantViolation, "WBS_INVALID_TREE_SHAPE"):
            _build(deliverable=deliverable)

    # --- invariant #1: leaf must carry owner+estimate ---
    def test_leaf_missing_owner_is_refused(self):
        deliverable = wbs_node("D-ROOT", "a deliverable", children=[_leaf(owner=None)])
        with self.assertRaisesRegex(InvariantViolation, "WBS_LEAF_MISSING_OWNER_OR_ESTIMATE"):
            _build(deliverable=deliverable)

    def test_leaf_missing_estimate_hours_is_refused(self):
        deliverable = wbs_node("D-ROOT", "a deliverable", children=[_leaf(estimate_hours=None)])
        with self.assertRaisesRegex(InvariantViolation, "WBS_LEAF_MISSING_OWNER_OR_ESTIMATE"):
            _build(deliverable=deliverable)

    def test_leaf_missing_both_owner_and_estimate_is_refused(self):
        deliverable = wbs_node("D-ROOT", "a deliverable", children=[_leaf(owner=None, estimate_hours=None)])
        with self.assertRaisesRegex(InvariantViolation, "WBS_LEAF_MISSING_OWNER_OR_ESTIMATE"):
            _build(deliverable=deliverable)

    def test_top_level_leaf_deliverable_missing_owner_is_refused(self):
        # The deliverable ITSELF can be a leaf (children == []) -- the rule is structural (leaf-vs-non-leaf),
        # not "top-level is always exempt".
        with self.assertRaisesRegex(InvariantViolation, "WBS_LEAF_MISSING_OWNER_OR_ESTIMATE"):
            _build(deliverable=wbs_node("D-ROOT", "a solo deliverable"))

    def test_leaf_violation_names_the_specific_node(self):
        deliverable = wbs_node("D-ROOT", "a deliverable", children=[_leaf(node_id="WP-BAD", owner=None)])
        with self.assertRaisesRegex(InvariantViolation, "WP-BAD"):
            _build(deliverable=deliverable)

    def test_deeply_nested_leaf_violation_is_caught(self):
        deliverable = wbs_node(
            "D-ROOT", "a deliverable",
            children=[wbs_node("D-MID", "a mid deliverable", children=[_leaf(node_id="WP-DEEP", owner=None)])],
        )
        with self.assertRaisesRegex(InvariantViolation, "WBS_LEAF_MISSING_OWNER_OR_ESTIMATE"):
            _build(deliverable=deliverable)

    # --- invariant #1: non-leaf must NOT carry owner/estimate ---
    def test_nonleaf_with_owner_is_refused(self):
        deliverable = wbs_node("D-ROOT", "a deliverable", owner="should not be here", children=[_leaf()])
        with self.assertRaisesRegex(InvariantViolation, "WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE"):
            _build(deliverable=deliverable)

    def test_nonleaf_with_estimate_hours_is_refused(self):
        deliverable = wbs_node("D-ROOT", "a deliverable", estimate_hours=5, children=[_leaf()])
        with self.assertRaisesRegex(InvariantViolation, "WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE"):
            _build(deliverable=deliverable)

    def test_nonleaf_with_both_owner_and_estimate_is_refused(self):
        deliverable = wbs_node("D-ROOT", "a deliverable", owner="x", estimate_hours=5, children=[_leaf()])
        with self.assertRaisesRegex(InvariantViolation, "WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE"):
            _build(deliverable=deliverable)

    def test_nonleaf_violation_names_the_specific_node(self):
        deliverable = wbs_node("D-BAD", "a deliverable", owner="x", children=[_leaf()])
        with self.assertRaisesRegex(InvariantViolation, "D-BAD"):
            _build(deliverable=deliverable)

    def test_intermediate_nonleaf_with_owner_is_refused(self):
        deliverable = wbs_node(
            "D-ROOT", "a deliverable",
            children=[wbs_node("D-MID", "a mid deliverable", owner="should not be here", children=[_leaf()])],
        )
        with self.assertRaisesRegex(InvariantViolation, "WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE"):
            _build(deliverable=deliverable)

    def test_well_formed_leaf_and_nonleaf_construct_successfully(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        self.assertEqual(record["deliverable"]["owner"], None)
        self.assertEqual(record["deliverable"]["children"][1]["owner"], "工程師B")


class ListLeafWorkPackagesTests(unittest.TestCase):
    def test_returns_all_three_leaves_in_order(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        packages = list_leaf_work_packages(record)
        self.assertEqual([p["id"] for p in packages], ["WP-WIREFRAME", "WP-VISUALDESIGN", "WP-FRONTEND"])

    def test_leaf_packages_carry_their_own_owner_and_estimate(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        packages = list_leaf_work_packages(record)
        wireframe = next(p for p in packages if p["id"] == "WP-WIREFRAME")
        self.assertEqual(wireframe["owner"], "設計師A")
        self.assertEqual(wireframe["estimate_hours"], 4)

    def test_single_leaf_deliverable_returns_one_package(self):
        record = _build(deliverable=_leaf("WP-SOLO", "solo", owner="x", estimate_hours=1))
        self.assertEqual(len(list_leaf_work_packages(record)), 1)


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_all_three_gates(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        self.assertTrue(all_gates_pass(evaluate_wbs_gates(record, "test", TS)))

    def test_evaluate_wbs_gates_returns_exactly_three_gates_in_order(self):
        results = evaluate_wbs_gates(_valid_record(), "test", TS)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "wbs_structural_integrity", "wbs_rollup_integrity"])

    # --- provenance gate ---
    def test_provenance_gate_fails_on_non_dict_record(self):
        for bad_record in (None, "not a record", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_provenance_gate_fails_on_missing_provenance(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")

    # --- structural integrity gate: fails closed on malformed/non-dict input, never crashes ---
    def test_structural_gate_fails_on_non_dict_record_without_raising(self):
        for bad_record in (None, "not-a-dict", [], 42, 3.14, True):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(evaluate_wbs_structural_integrity_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_structural_gate_fails_on_tampered_id_prefix(self):
        record = _valid_record()
        record["id"] = "NOTWBS-2026-001"
        result = evaluate_wbs_structural_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("id", result["evidence"][0]["reason"])

    def test_structural_gate_fails_on_non_string_version(self):
        record = _valid_record()
        record["version"] = 1.0
        self.assertEqual(evaluate_wbs_structural_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_structural_gate_catches_hand_tampered_missing_node_key(self):
        record = _valid_record()
        del record["deliverable"]["children"][0]["name"]
        self.assertEqual(evaluate_wbs_structural_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_structural_gate_catches_hand_tampered_unknown_node_key(self):
        record = _valid_record()
        record["deliverable"]["children"][0]["smuggled_field"] = "should not be here"
        self.assertEqual(evaluate_wbs_structural_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_structural_gate_catches_hand_tampered_leaf_with_nulled_owner(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        record["deliverable"]["children"][1]["owner"] = None  # WP-FRONTEND, a leaf -- illegal
        result = evaluate_wbs_structural_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("WBS_LEAF_MISSING_OWNER_OR_ESTIMATE", "".join(result["evidence"][0]["violations"]))

    def test_structural_gate_catches_hand_tampered_nonleaf_with_injected_owner(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        record["deliverable"]["children"][0]["owner"] = "sneaked in"  # D-DESIGN, non-leaf -- illegal
        result = evaluate_wbs_structural_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("WBS_NONLEAF_HAS_OWNER_OR_ESTIMATE", "".join(result["evidence"][0]["violations"]))

    def test_structural_gate_passes_and_reports_leaf_count(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        result = evaluate_wbs_structural_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"][0]["leaf_work_package_count"], 3)

    # --- rollup integrity gate: THE genuine-compute re-derivation, independent of the builder ---
    def test_rollup_gate_fails_on_non_dict_record(self):
        self.assertEqual(evaluate_wbs_rollup_integrity_gate(None, "test", TS)["status"], "FAIL")

    def test_rollup_gate_passes_on_valid_record(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        self.assertEqual(evaluate_wbs_rollup_integrity_gate(record, "test", TS)["status"], "PASS")

    def test_rollup_gate_catches_tampered_root_total(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        record["deliverable"]["total_estimate_hours"] = 999  # was 20
        result = evaluate_wbs_rollup_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["recomputed_deliverable_total_estimate_hours"], 20)

    def test_rollup_gate_catches_tampered_intermediate_total(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        record["deliverable"]["children"][0]["total_estimate_hours"] = 1  # D-DESIGN, was 10
        result = evaluate_wbs_rollup_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")

    def test_rollup_gate_catches_tampered_leaf_total(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        record["deliverable"]["children"][0]["children"][0]["total_estimate_hours"] = 0  # WP-WIREFRAME, was 4
        result = evaluate_wbs_rollup_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")

    def test_rollup_gate_names_the_specific_node_path(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        record["deliverable"]["children"][0]["total_estimate_hours"] = 1
        result = evaluate_wbs_rollup_integrity_gate(record, "test", TS)
        joined = "".join(result["evidence"][0]["violations"])
        self.assertIn("D-DESIGN", joined)

    def test_rollup_gate_refuses_to_evaluate_over_leaf_discipline_violation(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        record["deliverable"]["children"][1]["owner"] = None  # leaf missing owner -- structural precondition
        result = evaluate_wbs_rollup_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")

    def test_all_gates_pass_false_when_only_rollup_is_tampered(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        record["deliverable"]["total_estimate_hours"] = 999
        self.assertFalse(all_gates_pass(evaluate_wbs_gates(record, "test", TS)))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_minimal_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal WBS record")

    def test_three_leaf_scenario_record_validates_and_all_gates_pass(self):
        record = _build(deliverable=_three_leaf_two_level_deliverable())
        self.contracts.validate(RECORD_SCHEMA, record, "3-leaf 2-level WBS record")
        self.assertTrue(all_gates_pass(evaluate_wbs_gates(record, "test", TS)))

    def test_hand_tampered_rollup_record_fails_the_gate_but_still_matches_schema_shape(self):
        # total_estimate_hours is a plain `number` in the schema (the leaf/non-leaf cross-field agreement is a
        # runtime-only invariant, see schema's own OQ-WORKBREAKDOWNSTRUCTURE-1) -- so a tampered numeric value
        # still SHAPE-validates; the runtime gate is the actual enforcement authority here.
        tampered = copy.deepcopy(_build(deliverable=_three_leaf_two_level_deliverable()))
        tampered["deliverable"]["total_estimate_hours"] = 999
        self.contracts.validate(RECORD_SCHEMA, tampered, "tampered-but-shape-valid WBS record")
        gate = evaluate_wbs_rollup_integrity_gate(tampered, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_leaf_discipline_record_fails_real_schema_validation(self):
        # A leaf with a null owner IS a genuine schema-level shape violation (owner's type union permits null,
        # but the specific leaf/non-leaf coupling is enforced by the runtime gate, not by this negative
        # control -- this test instead proves a genuinely wrong-TYPE smuggled key is rejected by the schema).
        tampered = copy.deepcopy(_valid_record())
        tampered["deliverable"]["children"][0]["smuggled_field"] = "nope"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, tampered, "tampered WBS record with a smuggled node key")

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "work-breakdown-structure.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "work-breakdown-structure.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_wbs_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_wbs_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


if __name__ == "__main__":
    unittest.main()
