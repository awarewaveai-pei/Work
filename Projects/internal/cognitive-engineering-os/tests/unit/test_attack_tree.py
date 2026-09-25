"""Mutation-style tests for ``security.attack_tree`` (forty-sixth Method Atlas slice, THIRD member of the
`security` family, F20 -- the FIRST to structurally diverge from `security.stride`/`security.linddun`'s own
shared shape, and the first F20 `genuine_compute` method). Two-layer discipline proven for BOTH the tree-shape
invariant and the `root_aggregate` VALUE itself: shape is checked at construction, and the gate independently
RE-DERIVES the aggregate via real bottom-up AND/OR arithmetic rather than trusting a stored value."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.compute.attack_tree.aggregate import aggregate_node
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.security.attack_tree import (
    MAX_TREE_DEPTH,
    METHOD_ID,
    VALID_DETECTABILITY_LEVELS,
    VALID_NODE_TYPES,
    VALID_SKILL_LEVELS,
    all_gates_pass,
    evaluate_attack_tree_gates,
    evaluate_attack_tree_integrity_gate,
    evaluate_provenance_required_gate,
    generate_attack_tree_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/attack-tree-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _tb(name="boundary A", description="a description"):
    return {"name": name, "description": description}


def _leaf(name="leaf_a", cost=10, skill="low", detectability="low", control="c", residual_risk="r", test_evidence="t"):
    return {"name": name, "cost": cost, "skill": skill, "detectability": detectability, "control": control, "residual_risk": residual_risk, "test_evidence": test_evidence}


def _internal(name="node_a", node_type="OR", children=None):
    return {"name": name, "node_type": node_type, "children": [_leaf()] if children is None else children}


def _build(
    record_id="ATTACKTREE-T-001",
    system_or_component="a system",
    assets=None,
    trust_boundaries=None,
    entry_points=None,
    root=None,
):
    return generate_attack_tree_record(
        record_id,
        system_or_component,
        ["an asset"] if assets is None else assets,
        [] if trust_boundaries is None else trust_boundaries,
        [] if entry_points is None else entry_points,
        _leaf() if root is None else root,
        _prov(),
    )


def _valid_record():
    return _build()


def _customer_records_tree():
    return _internal(
        "取得敏感資料",
        "OR",
        [
            _internal("竊取帳密", "OR", [_leaf("Phishing", 200, "low", "medium"), _leaf("Credential Stuffing", 50, "low", "low")]),
            _internal("利用漏洞", "OR", [_leaf("RCE", 5000, "high", "high")]),
            _internal("取得備份", "OR", [_leaf("Misconfigured Storage", 100, "medium", "low")]),
        ],
    )


def _customer_records_record():
    return _build(record_id="ATTACKTREE-T-002", root=_customer_records_tree())


class AggregateComputeTests(unittest.TestCase):
    """Pure compute tests for aggregate_node -- hand-computed expected values, independent of the module's
    own shape validation."""

    def test_leaf_aggregate_is_its_own_values_unchanged(self):
        self.assertEqual(aggregate_node(_leaf("x", 42, "medium", "high")), {"cost": 42, "skill": "medium", "detectability": "high"})

    def test_or_node_takes_cheapest_and_best_case(self):
        node = _internal("g", "OR", [_leaf("a", 100, "high", "high"), _leaf("b", 10, "low", "low")])
        self.assertEqual(aggregate_node(node), {"cost": 10, "skill": "low", "detectability": "low"})

    def test_and_node_sums_cost_and_takes_worst_case(self):
        node = _internal("g", "AND", [_leaf("a", 100, "low", "low"), _leaf("b", 10, "high", "medium")])
        self.assertEqual(aggregate_node(node), {"cost": 110, "skill": "high", "detectability": "medium"})

    def test_or_does_not_mix_cheapest_cost_with_a_different_childs_skill(self):
        """Regression guard: OR must pick cost/skill/detectability each independently as the min RANK, not
        bundle all three attributes from whichever child happens to have the min cost -- the cheapest child
        and the lowest-skill child may be DIFFERENT children."""
        node = _internal("g", "OR", [_leaf("cheap_but_skilled", 5, "high", "high"), _leaf("expensive_but_easy", 500, "low", "low")])
        self.assertEqual(aggregate_node(node), {"cost": 5, "skill": "low", "detectability": "low"})

    def test_and_does_not_mix_summed_cost_with_a_single_childs_skill(self):
        node = _internal("g", "AND", [_leaf("a", 1, "low", "low"), _leaf("b", 1, "low", "low"), _leaf("c", 1, "high", "low")])
        self.assertEqual(aggregate_node(node), {"cost": 3, "skill": "high", "detectability": "low"})

    def test_single_child_or_and_and_are_mathematically_identical(self):
        or_node = _internal("g", "OR", [_leaf("a", 7, "medium", "high")])
        and_node = _internal("g", "AND", [_leaf("a", 7, "medium", "high")])
        self.assertEqual(aggregate_node(or_node), aggregate_node(and_node))
        self.assertEqual(aggregate_node(or_node), {"cost": 7, "skill": "medium", "detectability": "high"})

    def test_nested_tree_aggregates_bottom_up(self):
        self.assertEqual(aggregate_node(_customer_records_tree()), {"cost": 50, "skill": "low", "detectability": "low"})

    def test_aggregation_is_order_independent(self):
        a = _internal("g", "AND", [_leaf("x", 3, "low", "medium"), _leaf("y", 4, "high", "low")])
        b = _internal("g", "AND", [_leaf("y", 4, "high", "low"), _leaf("x", 3, "low", "medium")])
        self.assertEqual(aggregate_node(a), aggregate_node(b))

    def test_three_child_and_node_sums_all_three_not_just_two(self):
        """Regression guard: a sum over 3+ children could silently degrade to a pairwise sum missing one
        child if implemented wrong -- pin at least one 3-child case explicitly."""
        node = _internal("g", "AND", [_leaf("a", 10, "low", "low"), _leaf("b", 20, "low", "low"), _leaf("c", 30, "low", "low")])
        self.assertEqual(aggregate_node(node)["cost"], 60)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_single_leaf_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "single-leaf attack tree record")

    def test_customer_records_tree_validates_and_computes_cheapest_path(self):
        record = _customer_records_record()
        self.contracts.validate(RECORD_SCHEMA, record, "customer-records attack tree record")
        self.assertEqual(record["root_aggregate"], {"cost": 50, "skill": "low", "detectability": "low"})

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_attack_tree_record("ATTACKTREE-T-005", "s", ["a"], [], [], _leaf(), _prov(), version="2.3.4", generated_by_method="security.attack_tree@test")
        self.assertEqual(record["generated_by_method"], "security.attack_tree@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_root_aggregate_is_not_a_builder_parameter(self):
        import inspect

        params = list(inspect.signature(generate_attack_tree_record).parameters)
        self.assertNotIn("root_aggregate", params)

    def test_all_three_skill_levels_and_all_three_detectability_levels_round_trip(self):
        self.assertEqual(VALID_SKILL_LEVELS, frozenset({"low", "medium", "high"}))
        self.assertEqual(VALID_DETECTABILITY_LEVELS, frozenset({"low", "medium", "high"}))
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "attack-tree-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(set(schema_doc["$defs"]["leaf_node"]["properties"]["skill"]["enum"]), {"low", "medium", "high"})
        self.assertEqual(set(schema_doc["$defs"]["leaf_node"]["properties"]["detectability"]["enum"]), {"low", "medium", "high"})
        for skill in VALID_SKILL_LEVELS:
            for detectability in VALID_DETECTABILITY_LEVELS:
                with self.subTest(skill=skill, detectability=detectability):
                    record = _build(root=_leaf(skill=skill, detectability=detectability))
                    self.contracts.validate(RECORD_SCHEMA, record, f"round-trip for skill={skill}, detectability={detectability}")
                    self.assertTrue(all_gates_pass(evaluate_attack_tree_gates(record, "test", TS)))

    def test_both_and_and_or_node_types_round_trip(self):
        self.assertEqual(VALID_NODE_TYPES, frozenset({"AND", "OR"}))
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "attack-tree-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(set(schema_doc["$defs"]["internal_node"]["properties"]["node_type"]["enum"]), {"AND", "OR"})
        for node_type in VALID_NODE_TYPES:
            with self.subTest(node_type=node_type):
                record = _build(root=_internal(node_type=node_type))
                self.contracts.validate(RECORD_SCHEMA, record, f"round-trip for node_type={node_type}")
                self.assertTrue(all_gates_pass(evaluate_attack_tree_gates(record, "test", TS)))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "attack-tree-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "attack-tree-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_attack_tree_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_attacktree_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_RECORD_ID"):
            _build(record_id="STRIDE-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_VERSION"):
            generate_attack_tree_record("ATTACKTREE-T-V1", "s", ["a"], [], [], _leaf(), _prov(), version=123)

    def test_empty_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_EMPTY_RECORD_FIELD"):
            _build(system_or_component="")

    # --- assets / trust_boundaries / entry_points (same family-wide checks) ---
    def test_empty_assets_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ASSETS"):
            _build(assets=[])

    def test_trust_boundary_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_TRUST_BOUNDARIES"):
            _build(trust_boundaries=[dict(_tb(), owner="x")])

    def test_entry_points_with_non_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ENTRY_POINTS"):
            _build(entry_points=["a", 1])

    # --- root: leaf shape ---
    def test_leaf_missing_a_required_key_is_refused(self):
        leaf = _leaf()
        del leaf["control"]
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=leaf)

    def test_leaf_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=dict(_leaf(), severity="high"))

    def test_leaf_illegal_skill_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(skill="extreme"))

    def test_leaf_illegal_detectability_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(detectability="extreme"))

    def test_leaf_negative_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(cost=-1))

    def test_leaf_non_numeric_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(cost="expensive"))

    def test_leaf_boolean_cost_is_refused_not_silently_accepted_as_zero_or_one(self):
        """Regression guard: bool is a subclass of int in Python -- cost=True must NOT silently pass an
        isinstance(cost, (int, float)) check as if it were 1."""
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(cost=True))

    def test_leaf_zero_cost_is_legal(self):
        record = _build(root=_leaf(cost=0))
        self.assertEqual(record["root_aggregate"]["cost"], 0)

    def test_leaf_infinite_cost_is_refused(self):
        """Regression guard, critic-caught: a bare `>= 0` comparison alone lets `float('inf')` through
        (inf >= 0 is True), making 'cheapest path' meaningless and producing invalid RFC 8259 JSON."""
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(cost=float("inf")))

    def test_leaf_nan_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(cost=float("nan")))

    def test_leaf_empty_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(name=""))

    def test_leaf_empty_control_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(control=""))

    def test_leaf_empty_residual_risk_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(residual_risk="  "))

    def test_leaf_empty_test_evidence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_leaf(test_evidence=""))

    # --- root: internal shape ---
    def test_internal_missing_children_key_is_refused(self):
        node = _internal()
        del node["children"]
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=node)

    def test_internal_empty_children_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_internal(children=[]))

    def test_internal_illegal_node_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_internal(node_type="XOR"))

    def test_internal_empty_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=_internal(name=""))

    def test_node_mixing_leaf_and_internal_keys_is_refused(self):
        mixed = dict(_internal(), cost=1)
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=mixed)

    def test_deeply_nested_invalid_grandchild_is_refused(self):
        """The recursive invariant: an invalid node ANYWHERE in the tree, not just at the root or first
        level, must be refused."""
        bad_grandchild = _leaf(skill="extreme")
        tree = _internal("root", "OR", [_internal("mid", "OR", [bad_grandchild, _leaf()])])
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=tree)

    def test_non_dict_root_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root="not a node")

    # --- MAX_TREE_DEPTH guard (critic-caught: an unbounded recursive validator raises RecursionError) ---
    def test_tree_at_exactly_max_depth_is_legal(self):
        """A real, if extreme, deep chain right at the boundary must still validate -- the guard must not
        reject legitimate depth, only pathological depth."""
        node = _leaf()
        for i in range(MAX_TREE_DEPTH):
            node = _internal(f"node_{i}", "OR", [node])
        record = _build(root=node)
        self.assertEqual(record["root_aggregate"], {"cost": 10, "skill": "low", "detectability": "low"})

    def test_tree_exceeding_max_depth_is_refused_not_crashed(self):
        """The core regression guard: a tree far deeper than any real attack tree (or Python's own default
        recursion limit would tolerate for this validator, measured to crash around depth 332) must be
        refused with InvariantViolation, not raise RecursionError."""
        node = _leaf()
        for i in range(MAX_TREE_DEPTH + 5000):
            node = _internal(f"node_{i}", "OR", [node])
        with self.assertRaisesRegex(InvariantViolation, "ATTACKTREE_INVALID_ROOT"):
            _build(root=node)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_attacktree_prefix(self):
        record = _valid_record()
        record["id"] = "STRIDE-1"
        with self.assertRaisesRegex(Exception, "ATTACKTREE-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["assets"]
        with self.assertRaisesRegex(Exception, "assets"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_a_node_matching_neither_oneof_branch(self):
        record = _valid_record()
        record["root"] = {"name": "bad", "cost": 1}  # neither full leaf nor full internal shape
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema oneOf attack_node")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        assets = ["a"]
        trust_boundaries = [_tb()]
        entry_points = ["ep"]
        root = _internal("g", "OR", [_leaf("x")])
        record = generate_attack_tree_record("ATTACKTREE-T-010", "s", assets, trust_boundaries, entry_points, root, _prov())
        assets.append("mutated")
        trust_boundaries[0]["name"] = "mutated"
        entry_points.append("mutated")
        root["children"][0]["name"] = "mutated"
        self.assertEqual(record["assets"], ["a"])
        self.assertEqual(record["trust_boundaries"][0]["name"], "boundary A")
        self.assertEqual(record["entry_points"], ["ep"])
        self.assertEqual(record["root"]["children"][0]["name"], "x")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_attack_tree_record("ATTACKTREE-T-011", "s", ["a"], [], [], _leaf(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_attack_tree_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_attack_tree_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_attack_tree_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "attack_tree_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_customer_records_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_attack_tree_gates(_customer_records_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_attack_tree_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'ATTACKTREE-'")

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_empty_system_or_component_fails_the_gate(self):
        record = _valid_record()
        record["system_or_component"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "system_or_component missing or empty")

    def test_hand_tampered_empty_assets_fails_the_gate(self):
        record = _valid_record()
        record["assets"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "assets invalid (empty, malformed, or non-string entry)")

    def test_hand_tampered_trust_boundary_extra_key_fails_the_gate(self):
        record = _build(trust_boundaries=[_tb()])
        record["trust_boundaries"][0]["owner"] = "x"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "trust_boundaries invalid (malformed entry or unknown keys)")

    def test_hand_tampered_non_string_entry_point_fails_the_gate(self):
        record = _build(entry_points=["a"])
        record["entry_points"][0] = 1
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "entry_points invalid (not a list, or contains a non-string/empty entry)")

    def test_hand_tampered_illegal_skill_fails_the_gate(self):
        record = _valid_record()
        record["root"]["skill"] = "extreme"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("root invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_negative_cost_fails_the_gate(self):
        record = _valid_record()
        record["root"]["cost"] = -5
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("root invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_boolean_cost_fails_the_gate(self):
        record = _valid_record()
        record["root"]["cost"] = True
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("root invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_grandchild_illegal_node_type_fails_the_gate(self):
        record = _customer_records_record()
        record["root"]["children"][0]["node_type"] = "XOR"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("root invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_root_aggregate_mismatch_fails_the_gate(self):
        """The core re-derived-not-trusted invariant: falsely inflating root_aggregate must be caught by
        real recomputation, not accepted because the stored value merely looks well-formed."""
        record = _customer_records_record()
        self.assertEqual(record["root_aggregate"], {"cost": 50, "skill": "low", "detectability": "low"})
        record["root_aggregate"] = {"cost": 999999, "skill": "high", "detectability": "high"}
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored root_aggregate disagrees with recomputation")
        self.assertEqual(gate["evidence"][0]["recomputed"], {"cost": 50, "skill": "low", "detectability": "low"})

    def test_hand_tampered_root_aggregate_partial_field_mismatch_fails_the_gate(self):
        """A subtler tamper: only ONE of the three aggregate fields is wrong (skill), cost/detectability
        left correct -- the gate must still catch it via exact dict equality, not a per-field OR check."""
        record = _customer_records_record()
        tampered_aggregate = dict(record["root_aggregate"])
        tampered_aggregate["skill"] = "high"
        record["root_aggregate"] = tampered_aggregate
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored root_aggregate disagrees with recomputation")

    def test_gate_evidence_reports_accurate_leaf_and_internal_node_counts(self):
        gate = self._gate(_customer_records_record())
        evidence = gate["evidence"][0]
        self.assertEqual(evidence["asset_count"], 1)
        self.assertEqual(evidence["leaf_count"], 4)
        self.assertEqual(evidence["internal_node_count"], 4)
        self.assertEqual(evidence["root_aggregate"], {"cost": 50, "skill": "low", "detectability": "low"})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _customer_records_record()
        before = copy.deepcopy(record)
        self._gate(record)
        self.assertEqual(record, before)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")

    def test_hand_tampered_too_deep_root_fails_the_gate_not_a_crash(self):
        """Same MAX_TREE_DEPTH guard, proven at the independent GATE layer too -- a record whose own root
        was somehow stored deeper than the builder would ever allow must still fail closed, not crash."""
        record = _valid_record()
        node = _leaf()
        for i in range(MAX_TREE_DEPTH + 5000):
            node = _internal(f"node_{i}", "OR", [node])
        record["root"] = node
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("root invalid", gate["evidence"][0]["reason"])


if __name__ == "__main__":
    unittest.main()
