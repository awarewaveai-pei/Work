"""Mutation-style tests for ``root_cause.event_tree`` (7th member of the `root_cause` family, F05 -- the
STRUCTURAL OPPOSITE of `root_cause.fault_tree`'s backward AND/OR cause-decomposition: this method walks
FORWARD from a single initiating_event through an ORDERED barriers[] sequence). Two-layer discipline proven
for BOTH headline invariants:

1. Referential integrity (``EVENTTREE_DANGLING_BARRIER_REFERENCE``) -- every barrier_id named in any
   outcome's own path must resolve to a real barriers[].barrier_id in the same record.
2. Ordered-prefix reachability / no phantom outcome (``EVENTTREE_PATH_NOT_ORDERED_PREFIX``) -- every
   outcome's own path, position by position, must equal an actual prefix of the declared barriers[]
   sequence.

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
from ai_lego.modules.root_cause.event_tree import (
    BARRIER_ID_PREFIX,
    METHOD_ID,
    OUTCOME_ID_PREFIX,
    RECORD_ID_PREFIX,
    VALID_RESULTS,
    all_gates_pass,
    barrier,
    evaluate_event_tree_gates,
    evaluate_event_tree_integrity_gate,
    evaluate_provenance_required_gate,
    generate_event_tree_record,
    outcome,
    outcome_probability,
    path_step,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/event-tree-record.schema.yaml"
TS = "2026-09-07T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _initiating_event(description="an initiating event"):
    return {"description": description}


def _minimal_barriers():
    return [barrier("BAR-A", "barrier A"), barrier("BAR-B", "barrier B")]


def _minimal_outcomes():
    return [outcome("OUT-1", "outcome one", [path_step("BAR-A", "success"), path_step("BAR-B", "success")])]


def _build(
    record_id="EVENTTREE-T-001",
    system_under_analysis="a system",
    initiating_event=None,
    barriers=None,
    outcomes=None,
    version="1.0.0",
):
    return generate_event_tree_record(
        record_id,
        system_under_analysis,
        _initiating_event() if initiating_event is None else initiating_event,
        _minimal_barriers() if barriers is None else barriers,
        _minimal_outcomes() if outcomes is None else outcomes,
        _prov(),
        version=version,
    )


def _valid_record():
    return _build()


def _watchdog_barriers():
    return [
        barrier("BAR-WATCHDOG", "Per-minute reconcile task attempts an automated restart"),
        barrier("BAR-SMOKE-DETECT", "Daily smoke test surfaces a WARN if the watchdog itself is unhealthy"),
        barrier("BAR-MANUAL", "Operator manually recovers the daemon once paged"),
    ]


def _watchdog_outcomes():
    return [
        outcome("OUT-AUTO-RECOVERED", "Watchdog restarts the daemon successfully", [path_step("BAR-WATCHDOG", "success", probability=0.9)]),
        outcome(
            "OUT-DETECTED-MANUAL-RECOVERED",
            "Watchdog fails; smoke detects it; operator manually recovers",
            [path_step("BAR-WATCHDOG", "failure", probability=0.1), path_step("BAR-SMOKE-DETECT", "success", probability=0.95), path_step("BAR-MANUAL", "success", probability=0.9)],
        ),
        outcome(
            "OUT-DETECTED-UNRESOLVED",
            "Watchdog fails; smoke detects it; operator does not resolve it in time",
            [path_step("BAR-WATCHDOG", "failure", probability=0.1), path_step("BAR-SMOKE-DETECT", "success", probability=0.95), path_step("BAR-MANUAL", "failure", probability=0.1)],
        ),
        outcome(
            "OUT-UNDETECTED-UNRESOLVED",
            "Watchdog fails AND smoke itself is blind",
            [path_step("BAR-WATCHDOG", "failure", probability=0.1), path_step("BAR-SMOKE-DETECT", "failure", probability=0.05)],
        ),
    ]


def _watchdog_record():
    return _build(record_id="EVENTTREE-T-WATCHDOG", system_under_analysis="Docker Desktop watchdog system", barriers=_watchdog_barriers(), outcomes=_watchdog_outcomes())


class OutcomeProbabilityComputeTests(unittest.TestCase):
    """Pure compute tests for ``outcome_probability`` -- hand-computed expected values, independent of the
    module's own shape validation."""

    def test_single_step_outcome_computes_its_own_probability(self):
        record = _watchdog_record()
        self.assertAlmostEqual(outcome_probability(record, "OUT-AUTO-RECOVERED"), 0.9)

    def test_multi_step_outcome_computes_the_product_of_every_step(self):
        record = _watchdog_record()
        self.assertAlmostEqual(outcome_probability(record, "OUT-DETECTED-MANUAL-RECOVERED"), 0.1 * 0.95 * 0.9)

    def test_two_step_early_terminated_outcome_computes_correctly(self):
        record = _watchdog_record()
        self.assertAlmostEqual(outcome_probability(record, "OUT-UNDETECTED-UNRESOLVED"), 0.1 * 0.05)

    def test_four_illustrative_outcomes_partition_to_exactly_one(self):
        record = _watchdog_record()
        total = sum(outcome_probability(record, o["outcome_id"]) for o in record["outcomes"])
        self.assertAlmostEqual(total, 1.0)

    def test_returns_none_when_no_step_has_a_probability(self):
        record = _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success"), path_step("BAR-B", "success")])])
        self.assertIsNone(outcome_probability(record, "OUT-1"))

    def test_returns_none_when_only_the_last_step_is_missing_probability(self):
        record = _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success", probability=0.8), path_step("BAR-B", "success")])])
        self.assertIsNone(outcome_probability(record, "OUT-1"))

    def test_returns_none_when_only_the_first_step_is_missing_probability(self):
        record = _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success"), path_step("BAR-B", "success", probability=0.8)])])
        self.assertIsNone(outcome_probability(record, "OUT-1"))

    def test_returns_none_for_an_unknown_outcome_id(self):
        record = _watchdog_record()
        self.assertIsNone(outcome_probability(record, "OUT-DOES-NOT-EXIST"))

    def test_probability_boundary_zero_and_one_compute_correctly(self):
        record = _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success", probability=0.0), path_step("BAR-B", "success", probability=1.0)])])
        self.assertEqual(outcome_probability(record, "OUT-1"), 0.0)

    def test_compute_does_not_mutate_the_record(self):
        record = _watchdog_record()
        before = copy.deepcopy(record)
        outcome_probability(record, "OUT-AUTO-RECOVERED")
        self.assertEqual(record, before)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    # --- happy path / schema conformance ---
    def test_minimal_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal event tree record")

    def test_watchdog_scenario_record_validates_and_all_gates_pass(self):
        record = _watchdog_record()
        self.contracts.validate(RECORD_SCHEMA, record, "watchdog-scenario event tree record")
        self.assertTrue(all_gates_pass(evaluate_event_tree_gates(record, "test", TS)))

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_event_tree_record("EVENTTREE-T-005", "s", _initiating_event(), _minimal_barriers(), _minimal_outcomes(), _prov(), version="2.3.4", generated_by_method="root_cause.event_tree@test")
        self.assertEqual(record["generated_by_method"], "root_cause.event_tree@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "event-tree-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "event-tree-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_event_tree_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    def test_both_result_values_round_trip(self):
        self.assertEqual(VALID_RESULTS, frozenset({"success", "failure"}))
        for result in VALID_RESULTS:
            with self.subTest(result=result):
                record = _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", result)])])
                self.contracts.validate(RECORD_SCHEMA, record, f"round-trip for result={result}")

    # --- id / version / system_under_analysis ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_eventtree_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_RECORD_ID"):
            _build(record_id="FAULTTREE-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_VERSION"):
            generate_event_tree_record("EVENTTREE-T-V1", "s", _initiating_event(), _minimal_barriers(), _minimal_outcomes(), _prov(), version=123)

    def test_empty_system_under_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_EMPTY_RECORD_FIELD"):
            _build(system_under_analysis="")

    def test_whitespace_only_system_under_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_EMPTY_RECORD_FIELD"):
            _build(system_under_analysis="   ")

    # --- initiating_event shape ---
    def test_initiating_event_missing_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_INITIATING_EVENT"):
            _build(initiating_event={})

    def test_initiating_event_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_INITIATING_EVENT"):
            _build(initiating_event={"description": "d", "id": "IE-1"})

    def test_initiating_event_non_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_INITIATING_EVENT"):
            _build(initiating_event="not a dict")

    def test_initiating_event_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_INITIATING_EVENT"):
            _build(initiating_event={"description": "   "})

    # --- barriers shape ---
    def test_empty_barriers_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_BARRIERS"):
            _build(barriers=[])

    def test_barriers_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_BARRIERS"):
            _build(barriers="not a list")

    def test_barrier_missing_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_BARRIERS"):
            _build(barriers=[{"barrier_id": "BAR-A"}, barrier("BAR-B", "b")])

    def test_barrier_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_BARRIERS"):
            _build(barriers=[dict(barrier("BAR-A", "a"), severity="high"), barrier("BAR-B", "b")])

    def test_barrier_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_BARRIERS"):
            _build(barriers=[barrier("", "a"), barrier("BAR-B", "b")])

    def test_barrier_id_without_bar_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_BARRIERS"):
            _build(barriers=[barrier("XYZ-A", "a"), barrier("BAR-B", "b")])

    def test_barrier_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_BARRIERS"):
            _build(barriers=[barrier("BAR-A", ""), barrier("BAR-B", "b")])

    def test_duplicate_barrier_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_BARRIERS"):
            _build(barriers=[barrier("BAR-A", "a"), barrier("BAR-A", "a again")], outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success")])])

    # --- outcomes shape ---
    def test_empty_outcomes_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[])

    def test_outcomes_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes="not a list")

    def test_outcome_missing_path_key_is_refused(self):
        o = outcome("OUT-1", "d", [path_step("BAR-A", "success")])
        del o["path"]
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[o])

    def test_outcome_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[dict(outcome("OUT-1", "d", [path_step("BAR-A", "success")]), severity="high")])

    def test_outcome_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("", "d", [path_step("BAR-A", "success")])])

    def test_outcome_id_without_out_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("XYZ-1", "d", [path_step("BAR-A", "success")])])

    def test_outcome_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "", [path_step("BAR-A", "success")])])

    def test_duplicate_outcome_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d1", [path_step("BAR-A", "success")]), outcome("OUT-1", "d2", [path_step("BAR-A", "failure")])])

    def test_outcome_empty_path_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d", [])])

    def test_outcome_path_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[{"outcome_id": "OUT-1", "description": "d", "path": "not a list"}])

    def test_outcome_path_longer_than_barriers_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(barriers=[barrier("BAR-A", "a")], outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success"), path_step("BAR-A", "failure")])])

    def test_outcome_path_exactly_len_barriers_is_legal(self):
        record = _build(barriers=_minimal_barriers(), outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success"), path_step("BAR-B", "failure")])])
        self.contracts.validate(RECORD_SCHEMA, record, "path exactly len(barriers)")

    def test_outcome_path_length_one_early_termination_is_legal(self):
        record = _build(barriers=_minimal_barriers(), outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success")])])
        self.contracts.validate(RECORD_SCHEMA, record, "path length 1, early termination")

    # --- path_step shape ---
    def test_path_step_missing_result_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d", [{"barrier_id": "BAR-A"}])])

    def test_path_step_illegal_result_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d", [{"barrier_id": "BAR-A", "result": "maybe"}])])

    def test_path_step_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d", [dict(path_step("BAR-A", "success"), severity="high")])])

    def test_path_step_empty_barrier_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d", [{"barrier_id": "", "result": "success"}])])

    def test_path_step_probability_above_one_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success", probability=1.5)])])

    def test_path_step_probability_negative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success", probability=-0.1)])])

    def test_path_step_probability_boolean_is_refused_not_silently_accepted(self):
        """Regression guard: bool is a subclass of int in Python -- probability=True must NOT silently pass
        an isinstance(value, (int, float)) check as if it were 1.0."""
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success", probability=True)])])

    def test_path_step_probability_nan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success", probability=float("nan"))])])

    def test_path_step_probability_infinite_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_OUTCOMES"):
            _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success", probability=float("inf"))])])

    def test_path_step_probability_omitted_is_legal(self):
        record = _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success")])])
        self.assertNotIn("probability", record["outcomes"][0]["path"][0])
        self.contracts.validate(RECORD_SCHEMA, record, "record with omitted probability")

    def test_path_step_probability_zero_and_one_are_legal(self):
        record = _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success", probability=0.0), path_step("BAR-B", "failure", probability=1.0)])])
        self.contracts.validate(RECORD_SCHEMA, record, "record with boundary probabilities")

    # --- invariant #1: referential integrity, at CONSTRUCTION ---
    def test_path_referencing_nonexistent_barrier_id_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_DANGLING_BARRIER_REFERENCE"):
            _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-DOES-NOT-EXIST", "success")])])

    def test_path_referencing_nonexistent_barrier_id_at_second_position_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_DANGLING_BARRIER_REFERENCE"):
            _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success"), path_step("BAR-GHOST", "failure")])])

    def test_multiple_outcomes_one_dangling_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_DANGLING_BARRIER_REFERENCE"):
            _build(outcomes=[outcome("OUT-1", "d1", [path_step("BAR-A", "success")]), outcome("OUT-2", "d2", [path_step("BAR-GHOST", "failure")])])

    # --- invariant #2: ordered-prefix reachability, at CONSTRUCTION ---
    def test_path_starting_at_wrong_barrier_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_PATH_NOT_ORDERED_PREFIX"):
            _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-B", "success")])])

    def test_path_reordering_two_real_barriers_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_PATH_NOT_ORDERED_PREFIX"):
            _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-B", "success"), path_step("BAR-A", "failure")])])

    def test_path_skipping_a_middle_barrier_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_PATH_NOT_ORDERED_PREFIX"):
            _build(
                barriers=[barrier("BAR-A", "a"), barrier("BAR-B", "b"), barrier("BAR-C", "c")],
                outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success"), path_step("BAR-C", "failure")])],
            )

    def test_path_with_duplicate_barrier_in_same_path_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_PATH_NOT_ORDERED_PREFIX"):
            _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success"), path_step("BAR-A", "failure")])])

    def test_path_of_length_one_matching_first_barrier_is_legal(self):
        record = _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success")])])
        self.contracts.validate(RECORD_SCHEMA, record, "length-1 path matching first barrier")
        self.assertTrue(all_gates_pass(evaluate_event_tree_gates(record, "test", TS)))

    def test_path_of_full_length_matching_all_barriers_in_order_is_legal(self):
        record = _valid_record()
        self.assertTrue(all_gates_pass(evaluate_event_tree_gates(record, "test", TS)))

    def test_three_barrier_path_terminating_after_second_barrier_is_legal(self):
        record = _build(barriers=_watchdog_barriers(), outcomes=[outcome("OUT-1", "d", [path_step("BAR-WATCHDOG", "failure"), path_step("BAR-SMOKE-DETECT", "failure")])])
        self.contracts.validate(RECORD_SCHEMA, record, "3-barrier tree, 2-step early-terminated path")

    # --- helper functions ---
    def test_path_step_helper_rejects_an_illegal_result(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTTREE_INVALID_RESULT"):
            path_step("BAR-A", "maybe")

    def test_barrier_helper_builds_expected_shape(self):
        self.assertEqual(barrier("BAR-X", "d"), {"barrier_id": "BAR-X", "description": "d"})

    def test_outcome_helper_builds_expected_shape(self):
        steps = [path_step("BAR-A", "success")]
        built = outcome("OUT-X", "d", steps)
        self.assertEqual(built, {"outcome_id": "OUT-X", "description": "d", "path": steps})

    def test_outcome_helper_copies_the_path_list_not_aliases_it(self):
        steps = [path_step("BAR-A", "success")]
        built = outcome("OUT-X", "d", steps)
        steps.append(path_step("BAR-B", "failure"))
        self.assertEqual(len(built["path"]), 1)

    # --- orphan barrier (deliberately NOT an invariant violation -- see compilation_decisions) ---
    def test_orphan_barrier_never_referenced_does_not_block_construction(self):
        record = _build(barriers=[barrier("BAR-A", "a"), barrier("BAR-B", "b"), barrier("BAR-ORPHAN", "never referenced by any outcome")], outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success")])])
        self.contracts.validate(RECORD_SCHEMA, record, "record with an orphan barrier")
        self.assertTrue(all_gates_pass(evaluate_event_tree_gates(record, "test", TS)))

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_eventtree_prefix(self):
        record = _valid_record()
        record["id"] = "FAULTTREE-1"
        with self.assertRaisesRegex(Exception, "EVENTTREE-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["outcomes"]
        with self.assertRaisesRegex(Exception, "outcomes"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_a_probability_above_one(self):
        record = _build(outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success", probability=0.5)])])
        record["outcomes"][0]["path"][0]["probability"] = 1.5
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema probability bound")

    def test_schema_layer_rejects_an_illegal_result_value(self):
        record = _valid_record()
        record["outcomes"][0]["path"][0]["result"] = "maybe"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema result enum")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        initiating_event = _initiating_event()
        barriers = _minimal_barriers()
        outcomes = _minimal_outcomes()
        record = generate_event_tree_record("EVENTTREE-T-010", "s", initiating_event, barriers, outcomes, _prov())
        initiating_event["description"] = "mutated"
        barriers[0]["description"] = "mutated"
        outcomes[0]["path"].append(path_step("BAR-A", "failure"))
        self.assertEqual(record["initiating_event"]["description"], "an initiating event")
        self.assertEqual(record["barriers"][0]["description"], "barrier A")
        self.assertEqual(len(record["outcomes"][0]["path"]), 2)

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_event_tree_record("EVENTTREE-T-011", "s", _initiating_event(), _minimal_barriers(), _minimal_outcomes(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    # --- method resolution ---
    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_event_tree_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate_result(self, record):
        return evaluate_event_tree_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_event_tree_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "event_tree_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_watchdog_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_event_tree_gates(_watchdog_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_event_tree_gates(record, "test", TS)))

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

    def test_hand_tampered_initiating_event_missing_description_fails_the_gate(self):
        record = _valid_record()
        del record["initiating_event"]["description"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "initiating_event missing, malformed, or has an empty description")

    def test_hand_tampered_empty_barriers_fails_the_gate(self):
        record = _valid_record()
        record["barriers"] = []
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "barriers invalid (empty, malformed, or a duplicate/missing/wrongly-prefixed barrier_id)")

    def test_hand_tampered_malformed_outcome_fails_the_gate(self):
        record = _valid_record()
        record["outcomes"][0]["path"][0]["result"] = "maybe"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "outcomes invalid (empty, malformed, a duplicate/missing/wrongly-prefixed outcome_id, or a path step malformed/too long)")

    def test_hand_tampered_duplicate_barrier_id_fails_the_gate(self):
        record = _valid_record()
        record["barriers"][1]["barrier_id"] = "BAR-A"  # collides with barriers[0]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "barriers invalid (empty, malformed, or a duplicate/missing/wrongly-prefixed barrier_id)")

    def test_hand_tampered_duplicate_outcome_id_fails_the_gate(self):
        record = _watchdog_record()
        record["outcomes"][1]["outcome_id"] = record["outcomes"][0]["outcome_id"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "outcomes invalid (empty, malformed, a duplicate/missing/wrongly-prefixed outcome_id, or a path step malformed/too long)")

    def test_hand_tampered_path_longer_than_barriers_fails_the_gate(self):
        record = _build(barriers=[barrier("BAR-A", "a")], outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success")])])
        record["outcomes"][0]["path"].append(path_step("BAR-A", "failure"))  # now length 2 > len(barriers)=1
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "outcomes invalid (empty, malformed, a duplicate/missing/wrongly-prefixed outcome_id, or a path step malformed/too long)")

    def test_hand_tampered_path_step_illegal_result_fails_the_gate(self):
        record = _valid_record()
        record["outcomes"][0]["path"][1]["result"] = "unknown"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")

    # --- invariant #1, hand-tampered at the GATE layer only (bypasses the builder entirely) ---
    def test_hand_tampered_dangling_barrier_reference_fails_the_gate(self):
        """The core re-derived-not-trusted invariant for referential integrity: a copy of an already-VALID
        record, with a raw dict field hand-tampered afterward, must be caught by real re-derivation, not
        accepted because the record merely looked well-formed when it was built."""
        record = _watchdog_record()
        record["outcomes"][1]["path"][1]["barrier_id"] = "BAR-DOES-NOT-EXIST"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "dangling barrier reference")

    def test_hand_tampered_dangling_reference_at_first_position_fails_the_gate(self):
        record = _valid_record()
        record["outcomes"][0]["path"][0]["barrier_id"] = "BAR-GHOST"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "dangling barrier reference")

    # --- invariant #2, hand-tampered at the GATE layer only (bypasses the builder entirely) ---
    def test_hand_tampered_reordered_path_fails_the_gate(self):
        record = _watchdog_record()
        record["outcomes"][1]["path"][0], record["outcomes"][1]["path"][1] = record["outcomes"][1]["path"][1], record["outcomes"][1]["path"][0]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "phantom outcome (path not an ordered prefix of barriers)")

    def test_hand_tampered_skipped_barrier_fails_the_gate(self):
        record = _watchdog_record()
        # outcomes[1] originally [BAR-WATCHDOG, BAR-SMOKE-DETECT, BAR-MANUAL] -- drop the middle step in place.
        del record["outcomes"][1]["path"][1]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "phantom outcome (path not an ordered prefix of barriers)")

    def test_hand_tampered_path_starting_mid_sequence_fails_the_gate(self):
        record = _valid_record()
        record["outcomes"][0]["path"][0]["barrier_id"] = "BAR-B"  # was BAR-A; now starts at position 1's own id
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "phantom outcome (path not an ordered prefix of barriers)")

    # --- gate evidence content ---
    def test_gate_evidence_reports_accurate_barrier_and_outcome_counts(self):
        result = self._gate_result(_watchdog_record())
        evidence = result["evidence"][0]
        self.assertEqual(evidence["barrier_count"], 3)
        self.assertEqual(evidence["outcome_count"], 4)
        self.assertEqual(evidence["unreferenced_barrier_ids"], [])

    def test_gate_evidence_reports_unreferenced_barrier_ids(self):
        record = _build(barriers=[barrier("BAR-A", "a"), barrier("BAR-B", "b"), barrier("BAR-ORPHAN", "never referenced")], outcomes=[outcome("OUT-1", "d", [path_step("BAR-A", "success")])])
        result = self._gate_result(record)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"][0]["unreferenced_barrier_ids"], ["BAR-B", "BAR-ORPHAN"])

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _watchdog_record()
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

    def test_outcome_id_prefix_constant_matches_schema_pattern(self):
        import yaml

        schema_path = resolve_spec_root() / "specs" / "cognitive" / "typed-objects" / "event-tree-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(schema_doc["$defs"]["outcome"]["properties"]["outcome_id"]["pattern"], f"^{OUTCOME_ID_PREFIX}")
        self.assertEqual(schema_doc["$defs"]["barrier"]["properties"]["barrier_id"]["pattern"], f"^{BARRIER_ID_PREFIX}")


if __name__ == "__main__":
    unittest.main()
