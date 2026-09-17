"""Mutation-style tests for ``root_cause.fault_tree`` (fourth member of the `root_cause` family, F05 --
same AND/OR-tree STRUCTURE as `security.attack_tree`, deliberately a DIFFERENT shape: flat basic_events/gates
cross-referenced by id, not embedded nesting). Two-layer discipline proven for BOTH headline invariants:

1. Gate-mode consistency (``FAULTTREE_GATE_MODE_MISMATCH``) -- a gate's own ``required_count`` must match its
   own ``gate_type`` (AND = all children, OR = any one).
2. Referential integrity / acyclicity (``FAULTTREE_DANGLING_REFERENCE`` / ``FAULTTREE_CYCLE_DETECTED``) --
   every id referenced anywhere must resolve, without a cycle, within the record's own lists.

Each is checked at CONSTRUCTION (raises before a malformed record is ever built) and independently
RE-DERIVED at the GATE (a hand-tampered copy of an already-valid record must still be caught -- the gate
never trusts a stored value)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.root_cause.fault_tree import (
    MAX_GATE_DEPTH,
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_GATE_TYPES,
    all_gates_pass,
    basic_event,
    evaluate_fault_tree_gates,
    evaluate_fault_tree_integrity_gate,
    evaluate_provenance_required_gate,
    evaluate_top_event,
    gate,
    generate_fault_tree_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/fault-tree-record.schema.yaml"
TS = "2026-09-07T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _top_event(description="a top event", gate_ref="G1"):
    return {"description": description, "gate_ref": gate_ref}


def _minimal_basic_events():
    return [basic_event("BE-A", "cause A"), basic_event("BE-B", "cause B")]


def _minimal_gates():
    return [gate("G1", "top gate", "OR", ["BE-A", "BE-B"])]


def _build(
    record_id="FAULTTREE-T-001",
    system_under_analysis="a system",
    top_event=None,
    basic_events=None,
    gates=None,
    version="1.0.0",
):
    return generate_fault_tree_record(
        record_id,
        system_under_analysis,
        _top_event() if top_event is None else top_event,
        _minimal_basic_events() if basic_events is None else basic_events,
        _minimal_gates() if gates is None else gates,
        _prov(),
        version=version,
    )


def _valid_record():
    return _build()


def _deploy_top_event():
    return {"description": "Broken production deploy reaches customers undetected", "gate_ref": "GATE-TOP"}


def _deploy_basic_events():
    return [
        basic_event("BE-TEST-SKIPPED", "npm test gate silently skipped in CI", probability=0.02),
        basic_event("BE-HEALTHCHECK-BLIND", "healthcheck endpoint does not exercise the broken code path", probability=0.1),
        basic_event("BE-SMOKE-BLIND", "HTTP smoke test does not exercise the broken code path", probability=0.1),
        basic_event("BE-ROLLBACK-BROKEN", "auto-rollback trigger itself is disabled or broken", probability=0.01),
    ]


def _deploy_gates():
    return [
        gate("GATE-TOP", "Broken production deploy reaches customers undetected", "OR", ["BE-TEST-SKIPPED", "GATE-DETECTION-FAILED", "BE-ROLLBACK-BROKEN"]),
        gate("GATE-DETECTION-FAILED", "Both automated detection layers fail to catch the defect", "AND", ["BE-HEALTHCHECK-BLIND", "BE-SMOKE-BLIND"]),
    ]


def _deploy_record():
    return _build(record_id="FAULTTREE-T-DEPLOY", top_event=_deploy_top_event(), basic_events=_deploy_basic_events(), gates=_deploy_gates())


def _diamond_gates(layers):
    """``layers`` layers of two gates each, G{i}A/G{i}B, both taking BOTH of the PREVIOUS layer's two gates as
    children (full diamond fan-in/out from layer 1 up) -- the exact shape that made the pre-2026-09-17
    path-tracking DFS re-explore shared lower gates exponentially many times (measured ~6s at 20 layers).
    Layer 0's two gates each take one distinct basic_event leaf. Returns (gates, top_gate_id, leaf_ids)."""
    leaves = ["BE1", "BE2"]
    gates = [gate("G0A", "layer 0 A", "OR", [leaves[0]]), gate("G0B", "layer 0 B", "OR", [leaves[1]])]
    prev = ["G0A", "G0B"]
    for layer in range(1, layers):
        cur = [f"G{layer}A", f"G{layer}B"]
        gates.append(gate(cur[0], f"layer {layer} A", "OR", list(prev)))
        gates.append(gate(cur[1], f"layer {layer} B", "OR", list(prev)))
        prev = cur
    return gates, prev[0], leaves


def _deep_chain_gates(depth):
    """``depth`` gates G0..G(depth-1), each single-child, alternating AND/OR (mathematically identical for a
    single child -- required_count is always 1 either way), G(depth-1) pointing at G(depth-2) down to G0,
    whose own child is the basic_event leaf 'BE-LEAF'. Returns (gates, top_gate_id)."""
    gates = []
    child = "BE-LEAF"
    for i in range(depth):
        gate_type = "AND" if i % 2 == 0 else "OR"
        gid = f"G{i}"
        gates.append(gate(gid, f"gate {i}", gate_type, [child]))
        child = gid
    return gates, child


class EvaluateTopEventComputeTests(unittest.TestCase):
    """Pure compute tests for ``evaluate_top_event`` -- hand-computed expected values, independent of the
    module's own shape validation."""

    def test_or_gate_fires_when_the_single_referenced_basic_event_occurred(self):
        record = _valid_record()
        self.assertTrue(evaluate_top_event(record, {"BE-A"}))

    def test_or_gate_does_not_fire_when_no_referenced_basic_event_occurred(self):
        record = _valid_record()
        self.assertFalse(evaluate_top_event(record, set()))

    def test_or_gate_fires_when_only_one_of_two_children_occurred(self):
        record = _valid_record()
        self.assertTrue(evaluate_top_event(record, {"BE-B"}))

    def test_and_gate_does_not_fire_when_only_one_of_two_children_occurred(self):
        record = _deploy_record()
        self.assertFalse(evaluate_top_event(record, {"BE-HEALTHCHECK-BLIND"}))

    def test_and_gate_fires_only_when_all_children_occurred(self):
        record = _deploy_record()
        self.assertTrue(evaluate_top_event(record, {"BE-HEALTHCHECK-BLIND", "BE-SMOKE-BLIND"}))

    def test_or_top_gate_fires_via_a_single_direct_basic_event_child(self):
        record = _deploy_record()
        self.assertTrue(evaluate_top_event(record, {"BE-TEST-SKIPPED"}))

    def test_or_top_gate_fires_via_rollback_broken_alone(self):
        record = _deploy_record()
        self.assertTrue(evaluate_top_event(record, {"BE-ROLLBACK-BROKEN"}))

    def test_nothing_occurred_top_event_does_not_fire(self):
        record = _deploy_record()
        self.assertFalse(evaluate_top_event(record, set()))

    def test_everything_occurred_top_event_fires(self):
        record = _deploy_record()
        all_ids = {e["id"] for e in record["basic_events"]}
        self.assertTrue(evaluate_top_event(record, all_ids))

    def test_deep_single_child_chain_propagates_true_from_the_leaf(self):
        gates, top_gate_id = _deep_chain_gates(50)
        record = _build(top_event=_top_event(gate_ref=top_gate_id), basic_events=[basic_event("BE-LEAF", "leaf cause")], gates=gates)
        self.assertTrue(evaluate_top_event(record, {"BE-LEAF"}))

    def test_deep_single_child_chain_propagates_false_when_leaf_did_not_occur(self):
        gates, top_gate_id = _deep_chain_gates(50)
        record = _build(top_event=_top_event(gate_ref=top_gate_id), basic_events=[basic_event("BE-LEAF", "leaf cause")], gates=gates)
        self.assertFalse(evaluate_top_event(record, set()))

    def test_scenario_evaluation_does_not_mutate_the_record(self):
        record = _deploy_record()
        before = copy.deepcopy(record)
        evaluate_top_event(record, {"BE-TEST-SKIPPED"})
        self.assertEqual(record, before)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    # --- happy path / schema conformance ---
    def test_minimal_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal fault tree record")

    def test_deploy_scenario_record_validates_and_all_gates_pass(self):
        record = _deploy_record()
        self.contracts.validate(RECORD_SCHEMA, record, "deploy-scenario fault tree record")
        self.assertTrue(all_gates_pass(evaluate_fault_tree_gates(record, "test", TS)))

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_fault_tree_record("FAULTTREE-T-005", "s", _top_event(), _minimal_basic_events(), _minimal_gates(), _prov(), version="2.3.4", generated_by_method="root_cause.fault_tree@test")
        self.assertEqual(record["generated_by_method"], "root_cause.fault_tree@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_both_gate_types_round_trip(self):
        self.assertEqual(VALID_GATE_TYPES, frozenset({"AND", "OR"}))
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "fault-tree-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(set(schema_doc["$defs"]["gate"]["properties"]["gate_type"]["enum"]), {"AND", "OR"})
        for gate_type in VALID_GATE_TYPES:
            with self.subTest(gate_type=gate_type):
                record = _build(gates=[gate("G1", "d", gate_type, ["BE-A", "BE-B"])])
                self.contracts.validate(RECORD_SCHEMA, record, f"round-trip for gate_type={gate_type}")
                self.assertTrue(all_gates_pass(evaluate_fault_tree_gates(record, "test", TS)))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "fault-tree-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "fault-tree-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_fault_tree_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version / system_under_analysis ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_faulttree_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_RECORD_ID"):
            _build(record_id="ATTACKTREE-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_VERSION"):
            generate_fault_tree_record("FAULTTREE-T-V1", "s", _top_event(), _minimal_basic_events(), _minimal_gates(), _prov(), version=123)

    def test_empty_system_under_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_EMPTY_RECORD_FIELD"):
            _build(system_under_analysis="")

    def test_whitespace_only_system_under_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_EMPTY_RECORD_FIELD"):
            _build(system_under_analysis="   ")

    # --- top_event shape ---
    def test_top_event_missing_gate_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_TOP_EVENT"):
            _build(top_event={"description": "d"})

    def test_top_event_missing_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_TOP_EVENT"):
            _build(top_event={"gate_ref": "G1"})

    def test_top_event_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_TOP_EVENT"):
            _build(top_event={"description": "d", "gate_ref": "G1", "id": "TOP-1"})

    def test_top_event_non_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_TOP_EVENT"):
            _build(top_event="not a dict")

    def test_top_event_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_TOP_EVENT"):
            _build(top_event={"description": "", "gate_ref": "G1"})

    def test_top_event_empty_gate_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_TOP_EVENT"):
            _build(top_event={"description": "d", "gate_ref": "  "})

    # --- basic_events shape ---
    def test_empty_basic_events_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events=[])

    def test_basic_events_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events="not a list")

    def test_basic_event_missing_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events=[{"id": "BE-A"}, basic_event("BE-B", "b")])

    def test_basic_event_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events=[dict(basic_event("BE-A", "a"), severity="high"), basic_event("BE-B", "b")])

    def test_basic_event_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events=[basic_event("", "a"), basic_event("BE-B", "b")])

    def test_basic_event_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events=[basic_event("BE-A", ""), basic_event("BE-B", "b")])

    def test_basic_event_probability_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events=[basic_event("BE-A", "a", probability=1.5), basic_event("BE-B", "b")])

    def test_basic_event_probability_negative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events=[basic_event("BE-A", "a", probability=-0.1), basic_event("BE-B", "b")])

    def test_basic_event_probability_boolean_is_refused_not_silently_accepted(self):
        """Regression guard: bool is a subclass of int in Python -- probability=True must NOT silently pass
        an isinstance(value, (int, float)) check as if it were 1.0."""
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events=[basic_event("BE-A", "a", probability=True), basic_event("BE-B", "b")])

    def test_basic_event_probability_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events=[basic_event("BE-A", "a", probability=float("nan")), basic_event("BE-B", "b")])

    def test_basic_event_probability_infinite_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_BASIC_EVENTS"):
            _build(basic_events=[basic_event("BE-A", "a", probability=float("inf")), basic_event("BE-B", "b")])

    def test_basic_event_probability_omitted_is_legal(self):
        record = _build(basic_events=[basic_event("BE-A", "a"), basic_event("BE-B", "b")])
        self.assertNotIn("probability", record["basic_events"][0])
        self.contracts.validate(RECORD_SCHEMA, record, "record with omitted probability")

    def test_basic_event_probability_zero_and_one_are_legal(self):
        record = _build(basic_events=[basic_event("BE-A", "a", probability=0.0), basic_event("BE-B", "b", probability=1.0)])
        self.contracts.validate(RECORD_SCHEMA, record, "record with boundary probabilities")

    # --- gates shape ---
    def test_empty_gates_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[])

    def test_gate_missing_children_key_is_refused(self):
        g = gate("G1", "d", "OR", ["BE-A"])
        del g["children"]
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[g])

    def test_gate_empty_children_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "OR", "required_count": 1, "children": []}])

    def test_gate_illegal_gate_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "XOR", "required_count": 1, "children": ["BE-A"]}])

    def test_gate_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[gate("", "d", "OR", ["BE-A"])])

    def test_gate_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[{"id": "G1", "description": "", "gate_type": "OR", "required_count": 1, "children": ["BE-A"]}])

    def test_gate_required_count_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "OR", "required_count": 0, "children": ["BE-A"]}])

    def test_gate_required_count_negative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "OR", "required_count": -1, "children": ["BE-A"]}])

    def test_gate_required_count_non_int_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "OR", "required_count": "one", "children": ["BE-A"]}])

    def test_gate_required_count_boolean_is_refused_not_silently_accepted(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "OR", "required_count": True, "children": ["BE-A"]}])

    def test_gate_children_with_non_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "OR", "required_count": 1, "children": ["BE-A", 1]}])

    def test_gate_children_with_empty_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "OR", "required_count": 1, "children": ["BE-A", ""]}])

    def test_gate_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATES"):
            _build(gates=[dict(gate("G1", "d", "OR", ["BE-A"]), severity="high")])

    # --- duplicate id across the combined namespace ---
    def test_duplicate_id_between_two_basic_events_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_DUPLICATE_ID"):
            _build(basic_events=[basic_event("BE-A", "a"), basic_event("BE-A", "a again")], gates=[gate("G1", "d", "OR", ["BE-A"])])

    def test_duplicate_id_between_two_gates_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_DUPLICATE_ID"):
            _build(gates=[gate("G1", "d", "OR", ["BE-A"]), gate("G1", "d2", "OR", ["BE-B"])])

    def test_duplicate_id_between_a_gate_and_a_basic_event_is_refused(self):
        """A real ambiguity bug class: if a gate and a basic_event share the same id, a `children` entry
        naming that id cannot be resolved unambiguously."""
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_DUPLICATE_ID"):
            _build(basic_events=[basic_event("SHARED-ID", "a"), basic_event("BE-B", "b")], gates=[gate("SHARED-ID", "d", "OR", ["BE-B"])], top_event=_top_event(gate_ref="SHARED-ID"))

    # --- invariant #1: gate-mode consistency, at CONSTRUCTION ---
    def test_and_gate_required_count_too_low_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_GATE_MODE_MISMATCH"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "AND", "required_count": 1, "children": ["BE-A", "BE-B"]}])

    def test_and_gate_required_count_too_high_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_GATE_MODE_MISMATCH"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "AND", "required_count": 3, "children": ["BE-A", "BE-B"]}])

    def test_or_gate_required_count_not_one_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_GATE_MODE_MISMATCH"):
            _build(gates=[{"id": "G1", "description": "d", "gate_type": "OR", "required_count": 2, "children": ["BE-A", "BE-B"]}])

    def test_and_gate_with_correct_required_count_is_legal(self):
        record = _build(gates=[gate("G1", "d", "AND", ["BE-A", "BE-B"])])
        self.assertEqual(record["gates"][0]["required_count"], 2)
        self.contracts.validate(RECORD_SCHEMA, record, "AND gate with correct required_count")

    def test_single_child_and_and_or_are_mathematically_identical(self):
        and_record = _build(basic_events=[basic_event("BE-A", "a")], gates=[gate("G1", "d", "AND", ["BE-A"])])
        or_record = _build(basic_events=[basic_event("BE-A", "a")], gates=[gate("G1", "d", "OR", ["BE-A"])])
        self.assertEqual(and_record["gates"][0]["required_count"], 1)
        self.assertEqual(or_record["gates"][0]["required_count"], 1)
        self.assertEqual(evaluate_top_event(and_record, {"BE-A"}), evaluate_top_event(or_record, {"BE-A"}))

    def test_three_child_and_gate_requires_all_three_not_just_two(self):
        record = _build(
            basic_events=[basic_event("BE-A", "a"), basic_event("BE-B", "b"), basic_event("BE-C", "c")],
            gates=[gate("G1", "d", "AND", ["BE-A", "BE-B", "BE-C"])],
        )
        self.assertEqual(record["gates"][0]["required_count"], 3)
        self.assertFalse(evaluate_top_event(record, {"BE-A", "BE-B"}))
        self.assertTrue(evaluate_top_event(record, {"BE-A", "BE-B", "BE-C"}))

    def test_gate_helper_rejects_an_illegal_gate_type(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_INVALID_GATE_TYPE"):
            gate("G1", "d", "XOR", ["BE-A"])

    # --- invariant #2: referential integrity, at CONSTRUCTION ---
    def test_top_event_gate_ref_not_a_real_gate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_DANGLING_REFERENCE"):
            _build(top_event=_top_event(gate_ref="G-DOES-NOT-EXIST"))

    def test_top_event_gate_ref_pointing_to_a_basic_event_is_refused(self):
        """The top event must decompose through a GATE, never bare-point at a basic_event -- Atlas's own
        formula is 'top event -> basic events -> gates', always through a gate."""
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_DANGLING_REFERENCE"):
            _build(top_event=_top_event(gate_ref="BE-A"))

    def test_gate_child_referencing_nonexistent_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_DANGLING_REFERENCE"):
            _build(gates=[gate("G1", "d", "OR", ["BE-A", "BE-DOES-NOT-EXIST"])])

    def test_deeply_nested_dangling_reference_is_refused(self):
        """The recursive invariant: a dangling reference several gates deep, not just at the top gate, must
        still be refused."""
        gates = [
            gate("G-TOP", "top", "OR", ["G-MID"]),
            gate("G-MID", "mid", "OR", ["G-LEAF"]),
            {"id": "G-LEAF", "description": "leaf gate", "gate_type": "OR", "required_count": 1, "children": ["BE-GHOST"]},
        ]
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_DANGLING_REFERENCE"):
            _build(top_event=_top_event(gate_ref="G-TOP"), gates=gates)

    # --- invariant #2: acyclicity, at CONSTRUCTION ---
    def test_self_referential_gate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_CYCLE_DETECTED"):
            _build(basic_events=[basic_event("BE-X", "x")], top_event=_top_event(gate_ref="G1"), gates=[gate("G1", "d", "OR", ["G1"])])

    def test_two_gate_cycle_is_refused(self):
        gates = [gate("G1", "d1", "OR", ["G2"]), gate("G2", "d2", "OR", ["G1"])]
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_CYCLE_DETECTED"):
            _build(basic_events=[basic_event("BE-X", "x")], top_event=_top_event(gate_ref="G1"), gates=gates)

    def test_three_gate_cycle_is_refused(self):
        gates = [gate("G1", "d1", "OR", ["G2"]), gate("G2", "d2", "OR", ["G3"]), gate("G3", "d3", "OR", ["G1"])]
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_CYCLE_DETECTED"):
            _build(basic_events=[basic_event("BE-X", "x")], top_event=_top_event(gate_ref="G1"), gates=gates)

    def test_cycle_in_a_sub_graph_unreachable_from_top_event_is_still_refused(self):
        """A cycle does not need to be reachable from the top event to be a malformed record -- the whole
        record is checked, not just the path the top event happens to take."""
        gates = [
            gate("G-TOP", "top", "OR", ["BE-A"]),
            gate("G-ORPHAN-1", "orphan 1", "OR", ["G-ORPHAN-2"]),
            gate("G-ORPHAN-2", "orphan 2", "OR", ["G-ORPHAN-1"]),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_CYCLE_DETECTED"):
            _build(top_event=_top_event(gate_ref="G-TOP"), gates=gates)

    def test_tree_at_exactly_max_gate_depth_is_legal(self):
        """A real, if extreme, deep chain right at the boundary must still validate -- the guard must not
        reject legitimate depth, only pathological depth. Boundary counts GATES only (see
        `_cycle_violations`'s own docstring): the trailing basic_event leaf does not count."""
        gates, top_gate_id = _deep_chain_gates(MAX_GATE_DEPTH)
        record = _build(top_event=_top_event(gate_ref=top_gate_id), basic_events=[basic_event("BE-LEAF", "leaf")], gates=gates)
        self.assertTrue(evaluate_top_event(record, {"BE-LEAF"}))

    def test_chain_exceeding_max_gate_depth_is_refused_not_crashed(self):
        """The core regression guard: a chain far deeper than any real fault tree (or Python's own default
        recursion limit would tolerate if this used call recursion) must be refused with InvariantViolation,
        not raise RecursionError -- the traversal is an explicit-stack iterative DFS specifically so this
        never happens regardless of graph size."""
        gates, top_gate_id = _deep_chain_gates(MAX_GATE_DEPTH + 5000)
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_CYCLE_DETECTED.*MAX_GATE_DEPTH"):
            _build(top_event=_top_event(gate_ref=top_gate_id), basic_events=[basic_event("BE-LEAF", "leaf")], gates=gates)

    def test_diamond_sharing_graph_is_linear_time_not_exponential(self):
        """OQ-FAULTTREE-3 regression guard (resolved 2026-09-17): a 20-layer diamond-sharing DAG (the exact
        pathological shape the old docstring measured at ~6s) must now validate in well under a second --
        proves `_cycle_violations` no longer re-explores a shared gate down every path that reaches it."""
        import time

        gates, top_gate_id, leaves = _diamond_gates(20)
        started = time.monotonic()
        record = _build(top_event=_top_event(gate_ref=top_gate_id), basic_events=[basic_event(leaf, "occurs") for leaf in leaves], gates=gates)
        elapsed = time.monotonic() - started
        self.assertLess(elapsed, 1.0, f"took {elapsed:.3f}s -- exponential blowup regression")
        self.assertTrue(evaluate_top_event(record, {leaves[0]}))

    def test_cycle_inside_a_diamond_shared_subgraph_is_still_caught(self):
        """The memoized/colored traversal must not let a gate marked BLACK on one path hide a real cycle
        reachable only through a different, still-unexplored path into the same shared region."""
        gates = [
            gate("G-TOP", "top", "OR", ["G-SHARED-A", "G-SHARED-B"]),
            gate("G-SHARED-A", "shared, acyclic from here", "OR", ["BE-X"]),
            gate("G-SHARED-B", "reaches the same shared gate via a cyclic detour", "OR", ["G-CYCLE-1"]),
            gate("G-CYCLE-1", "cycle member 1", "OR", ["G-CYCLE-2"]),
            gate("G-CYCLE-2", "cycle member 2", "OR", ["G-CYCLE-1"]),
        ]
        with self.assertRaisesRegex(InvariantViolation, "FAULTTREE_CYCLE_DETECTED"):
            _build(basic_events=[basic_event("BE-X", "x")], top_event=_top_event(gate_ref="G-TOP"), gates=gates)

    # --- orphan basic_event (deliberately NOT an invariant violation -- see compilation_decisions) ---
    def test_orphan_basic_event_never_referenced_does_not_block_construction(self):
        record = _build(basic_events=[basic_event("BE-A", "a"), basic_event("BE-B", "b"), basic_event("BE-ORPHAN", "never referenced by any gate")], gates=[gate("G1", "d", "OR", ["BE-A", "BE-B"])])
        self.contracts.validate(RECORD_SCHEMA, record, "record with an orphan basic event")
        self.assertTrue(all_gates_pass(evaluate_fault_tree_gates(record, "test", TS)))

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_faulttree_prefix(self):
        record = _valid_record()
        record["id"] = "ATTACKTREE-1"
        with self.assertRaisesRegex(Exception, "FAULTTREE-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["gates"]
        with self.assertRaisesRegex(Exception, "gates"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_a_probability_above_one(self):
        record = _build(basic_events=[basic_event("BE-A", "a", probability=0.5), basic_event("BE-B", "b")])
        record["basic_events"][0]["probability"] = 1.5
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema probability bound")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        top_event = _top_event()
        basic_events = _minimal_basic_events()
        gates = _minimal_gates()
        record = generate_fault_tree_record("FAULTTREE-T-010", "s", top_event, basic_events, gates, _prov())
        top_event["description"] = "mutated"
        basic_events[0]["description"] = "mutated"
        gates[0]["children"].append("mutated")
        self.assertEqual(record["top_event"]["description"], "a top event")
        self.assertEqual(record["basic_events"][0]["description"], "cause A")
        self.assertEqual(record["gates"][0]["children"], ["BE-A", "BE-B"])

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_fault_tree_record("FAULTTREE-T-011", "s", _top_event(), _minimal_basic_events(), _minimal_gates(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    # --- method resolution ---
    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_fault_tree_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate_result(self, record):
        return evaluate_fault_tree_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_fault_tree_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "fault_tree_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_deploy_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_fault_tree_gates(_deploy_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_fault_tree_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}")

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_empty_system_under_analysis_fails_the_gate(self):
        record = _valid_record()
        record["system_under_analysis"] = " "
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "system_under_analysis missing or empty")

    def test_hand_tampered_top_event_missing_gate_ref_fails_the_gate(self):
        record = _valid_record()
        del record["top_event"]["gate_ref"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "top_event missing, malformed, or has an empty description/gate_ref")

    def test_hand_tampered_empty_basic_events_fails_the_gate(self):
        record = _valid_record()
        record["basic_events"] = []
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "basic_events invalid (empty, malformed, or an entry with unknown/missing keys)")

    def test_hand_tampered_malformed_gate_fails_the_gate(self):
        record = _valid_record()
        record["gates"][0]["gate_type"] = "XOR"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "gates invalid (empty, malformed, or an entry with unknown/missing keys)")

    def test_hand_tampered_duplicate_id_fails_the_gate(self):
        record = _valid_record()
        record["gates"][0]["id"] = "BE-A"  # collides with the existing basic_event id
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "duplicate id across basic_events/gates combined namespace")

    # --- invariant #1, hand-tampered at the GATE layer only ---
    def test_hand_tampered_and_gate_required_count_mismatch_fails_the_gate(self):
        """The core re-derived-not-trusted invariant for gate-mode: a copy of an already-VALID record, with
        its own stored required_count hand-tampered afterward, must be caught by real re-derivation, not
        accepted because the record merely looked well-formed when it was built."""
        record = _deploy_record()
        self.assertEqual(record["gates"][1]["gate_type"], "AND")
        self.assertEqual(record["gates"][1]["required_count"], 2)
        record["gates"][1]["required_count"] = 1
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "stored required_count disagrees with gate_type")
        self.assertIn("GATE-DETECTION-FAILED", result["evidence"][0]["gate_ids"])

    def test_hand_tampered_or_gate_required_count_mismatch_fails_the_gate(self):
        record = _valid_record()
        self.assertEqual(record["gates"][0]["gate_type"], "OR")
        record["gates"][0]["required_count"] = 2
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "stored required_count disagrees with gate_type")

    # --- invariant #2, hand-tampered at the GATE layer only ---
    def test_hand_tampered_dangling_child_reference_fails_the_gate(self):
        record = _deploy_record()
        record["gates"][1]["children"] = ["BE-HEALTHCHECK-BLIND", "BE-DOES-NOT-EXIST"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "dangling reference")

    def test_hand_tampered_top_event_gate_ref_fails_the_gate(self):
        record = _valid_record()
        record["top_event"]["gate_ref"] = "G-DOES-NOT-EXIST"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "dangling reference")

    def test_hand_tampered_self_referential_gate_fails_the_gate(self):
        record = _valid_record()
        record["gates"][0]["children"] = ["G1"]  # G1 now references itself
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "cycle detected")

    def test_hand_tampered_two_gate_cycle_fails_the_gate(self):
        record = _build(
            basic_events=[basic_event("BE-X", "x")],
            top_event=_top_event(gate_ref="G1"),
            gates=[gate("G1", "d1", "OR", ["BE-X"]), gate("G2", "d2", "OR", ["G1"])],
        )
        record["gates"][0]["children"] = ["G2"]  # G1 -> G2 -> G1, introduced post-construction
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "cycle detected")

    # --- gate evidence content ---
    def test_gate_evidence_reports_accurate_basic_event_and_gate_counts(self):
        result = self._gate_result(_deploy_record())
        evidence = result["evidence"][0]
        self.assertEqual(evidence["basic_event_count"], 4)
        self.assertEqual(evidence["gate_count"], 2)
        self.assertEqual(evidence["unreferenced_basic_event_ids"], [])

    def test_gate_evidence_reports_unreferenced_basic_events(self):
        record = _build(basic_events=[basic_event("BE-A", "a"), basic_event("BE-B", "b"), basic_event("BE-ORPHAN", "never referenced")], gates=[gate("G1", "d", "OR", ["BE-A", "BE-B"])])
        result = self._gate_result(record)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"][0]["unreferenced_basic_event_ids"], ["BE-ORPHAN"])

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _deploy_record()
        before = copy.deepcopy(record)
        self._gate_result(record)
        self.assertEqual(record, before)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate_result(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")

    def test_hand_tampered_too_deep_chain_fails_the_gate_not_a_crash(self):
        """Same MAX_GATE_DEPTH guard, proven at the independent GATE layer too -- a record whose own gate
        graph was somehow stored deeper than the builder would ever allow must still fail closed, not
        crash."""
        gates, top_gate_id = _deep_chain_gates(MAX_GATE_DEPTH + 5000)
        record = {
            "id": "FAULTTREE-T-DEEP",
            "version": "1.0.0",
            "generated_by_method": METHOD_ID,
            "system_under_analysis": "s",
            "top_event": _top_event(gate_ref=top_gate_id),
            "basic_events": [basic_event("BE-LEAF", "leaf")],
            "gates": gates,
            "provenance": _prov(),
        }
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "cycle detected")
        self.assertTrue(any("MAX_GATE_DEPTH" in d for d in result["evidence"][0]["details"]))


if __name__ == "__main__":
    unittest.main()
