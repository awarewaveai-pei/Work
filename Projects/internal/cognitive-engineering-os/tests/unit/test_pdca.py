"""Mutation-style tests for ``learning.pdca`` (4th Method Atlas slice from the learning family, after
reversal_criteria/kill_criteria/decision_journal).

Covers: happy path (1-4 stage cycles, multi-cycle chains), both real invariants (stage order,
learning continuity) violated at construction with distinct error codes, each invariant violated via
hand-tampering a dict after construction and caught only by the independent gate, fail-closed behavior
on malformed input, cross-gate independence, and the two bonus helpers.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.learning.pdca import (
    ACTION_ITEM_ID_PREFIX,
    METHOD_ID,
    RECORD_ID_PREFIX,
    STAGE_ORDER,
    action_item,
    all_gates_pass,
    cycle,
    evaluate_learning_continuity_gate,
    evaluate_pdca_gates,
    evaluate_provenance_required_gate,
    evaluate_stage_order_gate,
    generate_pdca_record,
    is_cycle_complete,
    resolve_carried_forward_action_items,
    stage_act,
    stage_check,
    stage_do,
    stage_plan,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

PDCA_CYCLE_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/pdca-cycle-record.schema.yaml"
T = "2026-09-07T00:00:00Z"


def _prov():
    return make_provenance("DECISION", "HUMAN_APPROVED")


def _plan(description="plan stage", *, cf=None):
    return stage_plan(description, _prov(), carried_forward_action_item_ids=cf)


def _do(description="do stage"):
    return stage_do(description, _prov())


def _check(description="check stage"):
    return stage_check(description, _prov())


def _act(description="act stage", items=None):
    if items is None:
        items = [action_item("ACTION-001", "default action item")]
    return stage_act(description, _prov(), items)


def _complete_cycle(n, *, cf=None, act_items=None):
    return cycle(n, [_plan(cf=cf), _do(), _check(), _act(items=act_items)])


def _partial_cycle(n, *, cf=None, stage_count=2):
    stages = [_plan(cf=cf), _do(), _check(), _act()]
    return cycle(n, stages[:stage_count])


def _valid_two_cycle_record():
    c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "a1"), action_item("ACTION-002", "a2")])
    c2 = _partial_cycle(2, cf=["ACTION-002"], stage_count=2)
    return generate_pdca_record("PDCA-T-001", "test process", [c1, c2], _prov())


def _valid_single_cycle_record(stage_count=4):
    c1 = _partial_cycle(1, stage_count=stage_count)
    return generate_pdca_record("PDCA-T-002", "test process", [c1], _prov())


class ActionItemConstructorTests(unittest.TestCase):
    def test_valid_action_item_builds(self):
        item = action_item("ACTION-001", "do the thing")
        self.assertEqual(item, {"id": "ACTION-001", "description": "do the thing"})

    def test_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_ACTION_ITEM_ID"):
            action_item("", "desc")

    def test_whitespace_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_ACTION_ITEM_ID"):
            action_item("   ", "desc")

    def test_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_ACTION_ITEM_ID"):
            action_item("ITEM-001", "desc")

    def test_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_EMPTY_ACTION_ITEM_DESCRIPTION"):
            action_item("ACTION-001", "")

    def test_whitespace_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_EMPTY_ACTION_ITEM_DESCRIPTION"):
            action_item("ACTION-001", "   ")


class StageConstructorTests(unittest.TestCase):
    def test_stage_plan_default_carried_forward_is_none(self):
        stage = stage_plan("plan it", _prov())
        self.assertEqual(stage["stage_name"], "PLAN")
        self.assertIsNone(stage["carried_forward_action_item_ids"])

    def test_stage_plan_with_carried_forward_stores_it(self):
        stage = stage_plan("plan it", _prov(), carried_forward_action_item_ids=["ACTION-001"])
        self.assertEqual(stage["carried_forward_action_item_ids"], ["ACTION-001"])

    def test_stage_plan_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_EMPTY_STAGE_DESCRIPTION"):
            stage_plan("", _prov())

    def test_stage_do_shape(self):
        stage = stage_do("do it", _prov())
        self.assertEqual(set(stage.keys()), {"stage_name", "description", "provenance"})
        self.assertEqual(stage["stage_name"], "DO")

    def test_stage_do_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_EMPTY_STAGE_DESCRIPTION"):
            stage_do("   ", _prov())

    def test_stage_check_shape(self):
        stage = stage_check("check it", _prov())
        self.assertEqual(stage["stage_name"], "CHECK")

    def test_stage_check_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_EMPTY_STAGE_DESCRIPTION"):
            stage_check("", _prov())

    def test_stage_act_copies_action_items_not_same_list(self):
        items = [action_item("ACTION-001", "a")]
        stage = stage_act("act it", _prov(), items)
        items.append(action_item("ACTION-002", "b"))
        self.assertEqual(len(stage["action_items"]), 1)

    def test_stage_act_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_EMPTY_STAGE_DESCRIPTION"):
            stage_act("", _prov(), [action_item("ACTION-001", "a")])

    def test_cycle_helper_copies_stages_not_same_list(self):
        stages = [_plan()]
        cyc = cycle(1, stages)
        stages.append(_do())
        self.assertEqual(len(cyc["stages"]), 1)


class RecordFieldConstructionTests(unittest.TestCase):
    def test_valid_record_top_level_fields(self):
        record = _valid_single_cycle_record(stage_count=1)
        self.assertEqual(record["id"], "PDCA-T-002")
        self.assertEqual(record["version"], "1.0.0")
        self.assertEqual(record["generated_by_method"], METHOD_ID)
        self.assertEqual(record["process_under_improvement"], "test process")

    def test_custom_version_and_generated_by_method_stored(self):
        record = generate_pdca_record("PDCA-T-003", "proc", [_complete_cycle(1)], _prov(), version="2.0.0", generated_by_method="learning.pdca_custom")
        self.assertEqual(record["version"], "2.0.0")
        self.assertEqual(record["generated_by_method"], "learning.pdca_custom")

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_RECORD_ID"):
            generate_pdca_record("", "proc", [_complete_cycle(1)], _prov())

    def test_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_RECORD_ID"):
            generate_pdca_record("WRONG-001", "proc", [_complete_cycle(1)], _prov())

    def test_whitespace_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_RECORD_ID"):
            generate_pdca_record("   ", "proc", [_complete_cycle(1)], _prov())

    def test_empty_process_under_improvement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_EMPTY_RECORD_FIELD"):
            generate_pdca_record("PDCA-T-004", "", [_complete_cycle(1)], _prov())

    def test_whitespace_process_under_improvement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_EMPTY_RECORD_FIELD"):
            generate_pdca_record("PDCA-T-004", "   ", [_complete_cycle(1)], _prov())

    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_VERSION"):
            generate_pdca_record("PDCA-T-005", "proc", [_complete_cycle(1)], _prov(), version=1.0)

    def test_missing_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_PROVENANCE"):
            generate_pdca_record("PDCA-T-006", "proc", [_complete_cycle(1)], None)

    def test_malformed_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_PROVENANCE"):
            generate_pdca_record("PDCA-T-006", "proc", [_complete_cycle(1)], {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"})


class CycleShapeConstructionTests(unittest.TestCase):
    def test_cycles_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-010", "proc", "not-a-list", _prov())

    def test_cycles_empty_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-011", "proc", [], _prov())

    def test_cycles_with_non_dict_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-012", "proc", ["not-a-dict"], _prov())

    def test_cycle_number_bool_true_is_rejected_as_not_a_real_int(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-013", "proc", [cycle(True, [_plan()])], _prov())

    def test_cycle_number_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-014", "proc", [cycle(0, [_plan()])], _prov())

    def test_cycle_number_negative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-015", "proc", [cycle(-1, [_plan()])], _prov())

    def test_cycle_number_non_int_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-016", "proc", [cycle("1", [_plan()])], _prov())

    def test_cycle_with_extra_unknown_key_is_refused(self):
        bad = {"cycle_number": 1, "stages": [_plan()], "extra": "nope"}
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-017", "proc", [bad], _prov())

    def test_cycle_missing_stages_key_is_refused(self):
        bad = {"cycle_number": 1}
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-018", "proc", [bad], _prov())

    def test_stages_empty_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-019", "proc", [cycle(1, [])], _prov())

    def test_stages_more_than_four_is_refused(self):
        five = [_plan(), _do(), _check(), _act(), _do("extra")]
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-020", "proc", [cycle(1, five)], _prov())

    def test_single_cycle_numbered_two_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-021", "proc", [cycle(2, [_plan()])], _prov())

    def test_numbering_gap_is_refused(self):
        c1 = _complete_cycle(1)
        c3 = cycle(3, [_plan(cf=["ACTION-001"])])
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-022", "proc", [c1, c3], _prov())

    def test_numbering_duplicate_is_refused(self):
        c1a = _complete_cycle(1)
        c1b = cycle(1, [_plan()])
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-023", "proc", [c1a, c1b], _prov())

    def test_numbering_reordered_is_refused(self):
        c1 = _complete_cycle(1)
        c2 = _partial_cycle(2, cf=["ACTION-001"], stage_count=1)
        with self.assertRaisesRegex(InvariantViolation, "PDCA_INVALID_CYCLES"):
            generate_pdca_record("PDCA-T-024", "proc", [c2, c1], _prov())


class StageOrderConstructionTests(unittest.TestCase):
    def test_single_stage_that_is_do_instead_of_plan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-030", "proc", [cycle(1, [_do()])], _prov())

    def test_skipping_do_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-031", "proc", [cycle(1, [_plan(), _check()])], _prov())

    def test_reversed_do_plan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-032", "proc", [cycle(1, [_do(), _plan()])], _prov())

    def test_check_before_do_is_refused(self):
        """The due-diligence invariant this task named explicitly: cannot Check before Do."""
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-033", "proc", [cycle(1, [_plan(), _check(), _do()])], _prov())

    def test_act_before_check_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-034", "proc", [cycle(1, [_plan(), _do(), _act(), _check()])], _prov())

    def test_plan_missing_carried_forward_key_is_refused(self):
        bad_plan = {"stage_name": "PLAN", "description": "x", "provenance": _prov()}
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-035", "proc", [cycle(1, [bad_plan])], _prov())

    def test_plan_with_extra_unknown_key_is_refused(self):
        bad_plan = dict(_plan(), extra="nope")
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-036", "proc", [cycle(1, [bad_plan])], _prov())

    def test_do_with_extra_key_is_refused(self):
        bad_do = dict(_do(), carried_forward_action_item_ids=None)
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-037", "proc", [cycle(1, [_plan(), bad_do])], _prov())

    def test_check_with_extra_key_is_refused(self):
        bad_check = dict(_check(), extra="nope")
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-038", "proc", [cycle(1, [_plan(), _do(), bad_check])], _prov())

    def test_act_with_extra_key_is_refused(self):
        bad_act = dict(_act(), extra="nope")
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-039", "proc", [cycle(1, [_plan(), _do(), _check(), bad_act])], _prov())

    def test_act_with_empty_action_items_is_refused(self):
        bad_act = dict(_act(), action_items=[])
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-040", "proc", [cycle(1, [_plan(), _do(), _check(), bad_act])], _prov())

    def test_act_with_malformed_action_item_is_refused(self):
        bad_act = dict(_act(), action_items=[{"id": "ACTION-001"}])  # missing description
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-041", "proc", [cycle(1, [_plan(), _do(), _check(), bad_act])], _prov())

    def test_stage_with_missing_provenance_is_refused(self):
        bad_do = {"stage_name": "DO", "description": "x", "provenance": None}
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-042", "proc", [cycle(1, [_plan(), bad_do])], _prov())

    def test_stage_with_non_dict_provenance_is_refused(self):
        bad_do = {"stage_name": "DO", "description": "x", "provenance": "not-a-dict"}
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-043", "proc", [cycle(1, [_plan(), bad_do])], _prov())

    def test_plan_carried_forward_empty_list_is_refused_not_treated_as_null(self):
        """Schema semantics: carried_forward_action_item_ids is [array,null] with minItems:1 when an array --
        an empty list is a shape violation, distinct from the null-is-legal-for-cycle-1 case."""
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-044", "proc", [cycle(1, [_plan(cf=[])])], _prov())

    def test_plan_carried_forward_with_unprefixed_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-045", "proc", [cycle(1, [_plan(cf=["ITEM-001"])])], _prov())

    def test_plan_carried_forward_as_string_not_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PDCA_STAGE_ORDER_VIOLATED"):
            generate_pdca_record("PDCA-T-046", "proc", [cycle(1, [_plan(cf="ACTION-001")])], _prov())


class DuplicateActionItemConstructionTests(unittest.TestCase):
    def test_duplicate_ids_within_one_act_stage_is_refused(self):
        bad_act = _act(items=[action_item("ACTION-001", "a"), action_item("ACTION-001", "b")])
        with self.assertRaisesRegex(InvariantViolation, "PDCA_DUPLICATE_ACTION_ITEM_ID"):
            generate_pdca_record("PDCA-T-050", "proc", [cycle(1, [_plan(), _do(), _check(), bad_act])], _prov())

    def test_duplicate_error_names_the_specific_id(self):
        bad_act = _act(items=[action_item("ACTION-009", "a"), action_item("ACTION-009", "b"), action_item("ACTION-010", "c")])
        with self.assertRaisesRegex(InvariantViolation, "ACTION-009"):
            generate_pdca_record("PDCA-T-051", "proc", [cycle(1, [_plan(), _do(), _check(), bad_act])], _prov())

    def test_same_id_reused_across_different_cycles_act_stages_is_not_a_duplicate(self):
        """Uniqueness is scoped to ONE ACT stage's own action_items, not global across the record --
        deliberate design choice (see contract compilation_decisions)."""
        c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "cycle1 item")])
        c2 = _complete_cycle(2, cf=["ACTION-001"], act_items=[action_item("ACTION-001", "cycle2 item, same id string, different cycle")])
        record = generate_pdca_record("PDCA-T-052", "proc", [c1, c2], _prov())
        self.assertEqual(record["cycles"][1]["stages"][3]["action_items"][0]["description"], "cycle2 item, same id string, different cycle")


class LearningContinuityConstructionTests(unittest.TestCase):
    def test_cycle_one_with_non_null_carried_forward_is_refused(self):
        c1 = cycle(1, [_plan(cf=["ACTION-999"]), _do(), _check(), _act()])
        with self.assertRaisesRegex(InvariantViolation, "PDCA_LEARNING_CONTINUITY_VIOLATED"):
            generate_pdca_record("PDCA-T-060", "proc", [c1], _prov())

    def test_cycle_two_when_cycle_one_never_reached_act_is_refused(self):
        c1 = _partial_cycle(1, stage_count=2)  # PLAN+DO only
        c2 = _partial_cycle(2, cf=["ACTION-001"], stage_count=1)
        with self.assertRaisesRegex(InvariantViolation, "PDCA_LEARNING_CONTINUITY_VIOLATED"):
            generate_pdca_record("PDCA-T-061", "proc", [c1, c2], _prov())

    def test_cycle_two_with_null_carried_forward_is_refused(self):
        c1 = _complete_cycle(1)
        c2 = _partial_cycle(2, cf=None, stage_count=1)
        with self.assertRaisesRegex(InvariantViolation, "PDCA_LEARNING_CONTINUITY_VIOLATED"):
            generate_pdca_record("PDCA-T-062", "proc", [c1, c2], _prov())

    def test_cycle_two_referencing_unknown_action_id_is_refused(self):
        c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "a")])
        c2 = _partial_cycle(2, cf=["ACTION-999"], stage_count=1)
        with self.assertRaisesRegex(InvariantViolation, "PDCA_LEARNING_CONTINUITY_VIOLATED"):
            generate_pdca_record("PDCA-T-063", "proc", [c1, c2], _prov())

    def test_cycle_two_partially_unresolved_reference_names_only_the_bad_id(self):
        c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "a"), action_item("ACTION-002", "b")])
        c2 = _partial_cycle(2, cf=["ACTION-001", "ACTION-999"], stage_count=1)
        with self.assertRaisesRegex(InvariantViolation, r"ACTION-999"):
            generate_pdca_record("PDCA-T-064", "proc", [c1, c2], _prov())

    def test_three_cycle_chain_skipping_the_immediately_prior_cycle_is_refused(self):
        c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "a")])
        c2 = _complete_cycle(2, cf=["ACTION-001"], act_items=[action_item("ACTION-002", "b")])
        c3_wrong = _partial_cycle(3, cf=["ACTION-001"], stage_count=1)  # should reference cycle 2's ACTION-002, not cycle 1's
        with self.assertRaisesRegex(InvariantViolation, "PDCA_LEARNING_CONTINUITY_VIOLATED"):
            generate_pdca_record("PDCA-T-065", "proc", [c1, c2, c3_wrong], _prov())

    def test_happy_path_three_cycle_chain(self):
        c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "a")])
        c2 = _complete_cycle(2, cf=["ACTION-001"], act_items=[action_item("ACTION-002", "b")])
        c3 = _partial_cycle(3, cf=["ACTION-002"], stage_count=1)
        record = generate_pdca_record("PDCA-T-066", "proc", [c1, c2, c3], _prov())
        self.assertEqual(len(record["cycles"]), 3)

    def test_happy_path_carrying_forward_multiple_ids(self):
        c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "a"), action_item("ACTION-002", "b")])
        c2 = _partial_cycle(2, cf=["ACTION-001", "ACTION-002"], stage_count=1)
        record = generate_pdca_record("PDCA-T-067", "proc", [c1, c2], _prov())
        self.assertEqual(record["cycles"][1]["stages"][0]["carried_forward_action_item_ids"], ["ACTION-001", "ACTION-002"])

    def test_happy_path_carrying_forward_a_subset_is_legal(self):
        """Not every action_item from cycle N-1's ACT must be carried forward -- a subset is real, honest content."""
        c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "a"), action_item("ACTION-002", "b")])
        c2 = _partial_cycle(2, cf=["ACTION-002"], stage_count=1)
        record = generate_pdca_record("PDCA-T-068", "proc", [c1, c2], _prov())
        self.assertEqual(record["cycles"][1]["stages"][0]["carried_forward_action_item_ids"], ["ACTION-002"])


class HappyPathConstructionTests(unittest.TestCase):
    def test_single_stage_plan_only_cycle(self):
        record = _valid_single_cycle_record(stage_count=1)
        self.assertEqual(len(record["cycles"][0]["stages"]), 1)

    def test_two_stage_plan_do_cycle(self):
        record = _valid_single_cycle_record(stage_count=2)
        self.assertEqual(len(record["cycles"][0]["stages"]), 2)

    def test_three_stage_plan_do_check_cycle(self):
        record = _valid_single_cycle_record(stage_count=3)
        self.assertEqual(len(record["cycles"][0]["stages"]), 3)

    def test_four_stage_complete_cycle(self):
        record = _valid_single_cycle_record(stage_count=4)
        self.assertEqual(len(record["cycles"][0]["stages"]), 4)
        self.assertEqual(record["cycles"][0]["stages"][3]["stage_name"], "ACT")

    def test_returned_record_is_independent_of_input_cycles_list(self):
        cycles = [_complete_cycle(1)]
        record = generate_pdca_record("PDCA-T-070", "proc", cycles, _prov())
        cycles.append(_partial_cycle(2, cf=["ACTION-001"], stage_count=1))
        self.assertEqual(len(record["cycles"]), 1)

    def test_default_version_and_method_id_applied(self):
        record = generate_pdca_record("PDCA-T-071", "proc", [_complete_cycle(1)], _prov())
        self.assertEqual(record["version"], "1.0.0")
        self.assertEqual(record["generated_by_method"], "learning.pdca")

    def test_two_cycle_record_end_to_end(self):
        record = _valid_two_cycle_record()
        self.assertEqual(record["cycles"][0]["cycle_number"], 1)
        self.assertEqual(record["cycles"][1]["cycle_number"], 2)
        self.assertIsNone(record["cycles"][0]["stages"][0]["carried_forward_action_item_ids"])
        self.assertEqual(record["cycles"][1]["stages"][0]["carried_forward_action_item_ids"], ["ACTION-002"])


class GateProvenanceTests(unittest.TestCase):
    def test_valid_record_passes_provenance_gate(self):
        gate = evaluate_provenance_required_gate(_valid_two_cycle_record(), "test", T)
        self.assertEqual(gate["status"], "PASS")

    def test_hand_tampered_top_level_provenance_fails_only_this_gate(self):
        record = _valid_two_cycle_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", T)["status"], "FAIL")
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "PASS")

    def test_hand_tampered_stage_provenance_fails_and_is_identified(self):
        record = _valid_two_cycle_record()
        record["cycles"][0]["stages"][1] = {**record["cycles"][0]["stages"][1], "provenance": None}
        gate = evaluate_provenance_required_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("cycle 1 stages[1]", gate["evidence"][0]["invalid_stage_provenance"])

    def test_malformed_record_fails_closed(self):
        for bad in (None, [], "not-a-dict", 42):
            self.assertEqual(evaluate_provenance_required_gate(bad, "test", T)["status"], "FAIL")

    def test_missing_cycles_key_does_not_crash_and_isolates_to_top_level_provenance(self):
        record = {"provenance": _prov()}
        self.assertEqual(evaluate_provenance_required_gate(record, "test", T)["status"], "PASS")

    def test_non_dict_stage_is_flagged_not_skipped(self):
        record = _valid_two_cycle_record()
        record["cycles"][0]["stages"][1] = None
        gate = evaluate_provenance_required_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")

    def test_garbage_cycle_entry_is_silently_skipped_by_this_gate_but_not_others(self):
        """Each gate owns one concern -- a structurally-broken cycle entry is stage_order_integrity's job,
        not provenance_required's."""
        record = _valid_two_cycle_record()
        record["cycles"].append("garbage")
        self.assertEqual(evaluate_provenance_required_gate(record, "test", T)["status"], "PASS")
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "FAIL")


class GateStageOrderTests(unittest.TestCase):
    def test_valid_record_passes(self):
        self.assertEqual(evaluate_stage_order_gate(_valid_two_cycle_record(), "test", T)["status"], "PASS")

    def test_hand_tampered_empty_cycles_fails(self):
        record = _valid_two_cycle_record()
        record["cycles"] = []
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_cycles_not_a_list_fails(self):
        record = _valid_two_cycle_record()
        record["cycles"] = "not-a-list"
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_numbering_gap_fails(self):
        record = _valid_two_cycle_record()
        record["cycles"][1]["cycle_number"] = 3
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_numbering_duplicate_fails(self):
        record = _valid_two_cycle_record()
        record["cycles"][1]["cycle_number"] = 1
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_stage_name_flip_fails_not_crashes(self):
        """Bypasses the constructor entirely -- proves the gate, not just generate_pdca_record, enforces order."""
        record = _valid_two_cycle_record()
        record["cycles"][0]["stages"][0] = {**record["cycles"][0]["stages"][0], "stage_name": "DO"}
        gate = evaluate_stage_order_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(gate["evidence"][0]["order_violations"])

    def test_hand_tampered_act_action_items_emptied_fails(self):
        record = _valid_two_cycle_record()
        record["cycles"][0]["stages"][3] = {**record["cycles"][0]["stages"][3], "action_items": []}
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_act_duplicate_ids_fails(self):
        record = _valid_two_cycle_record()
        dup_items = [action_item("ACTION-007", "x"), action_item("ACTION-007", "y")]
        record["cycles"][0]["stages"][3] = {**record["cycles"][0]["stages"][3], "action_items": dup_items}
        gate = evaluate_stage_order_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(gate["evidence"][0]["duplicate_action_item_violations"])

    def test_hand_tampered_carried_forward_emptied_to_list_fails(self):
        record = _valid_two_cycle_record()
        record["cycles"][1]["stages"][0] = {**record["cycles"][1]["stages"][0], "carried_forward_action_item_ids": []}
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_stage_replaced_with_non_dict_fails_not_crashes(self):
        record = _valid_two_cycle_record()
        record["cycles"][0]["stages"][2] = "garbage"
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_cycle_replaced_with_non_dict_fails_not_crashes(self):
        record = _valid_two_cycle_record()
        record["cycles"][1] = "garbage"
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "FAIL")

    def test_top_level_provenance_tamper_does_not_affect_this_gate(self):
        record = _valid_two_cycle_record()
        record["provenance"] = None
        self.assertEqual(evaluate_stage_order_gate(record, "test", T)["status"], "PASS")

    def test_malformed_record_types_fail_closed(self):
        for bad in (None, [], "not-a-dict", 42, 3.14, True):
            self.assertEqual(evaluate_stage_order_gate(bad, "test", T)["status"], "FAIL", f"did not fail closed on {bad!r}")


class GateLearningContinuityTests(unittest.TestCase):
    def test_valid_record_passes(self):
        self.assertEqual(evaluate_learning_continuity_gate(_valid_two_cycle_record(), "test", T)["status"], "PASS")

    def test_single_complete_cycle_trivially_passes(self):
        record = _valid_single_cycle_record(stage_count=4)
        self.assertEqual(evaluate_learning_continuity_gate(record, "test", T)["status"], "PASS")

    def test_hand_tampered_cycle_one_non_null_carried_forward_fails(self):
        record = _valid_two_cycle_record()
        record["cycles"][0]["stages"][0] = {**record["cycles"][0]["stages"][0], "carried_forward_action_item_ids": ["ACTION-999"]}
        gate = evaluate_learning_continuity_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(gate["evidence"][0]["violations"])

    def test_hand_tampered_cycle_two_references_unknown_id_fails(self):
        record = _valid_two_cycle_record()
        record["cycles"][1]["stages"][0] = {**record["cycles"][1]["stages"][0], "carried_forward_action_item_ids": ["ACTION-999"]}
        self.assertEqual(evaluate_learning_continuity_gate(record, "test", T)["status"], "FAIL")

    def test_hand_tampered_cycle_two_carried_forward_set_to_null_fails(self):
        record = _valid_two_cycle_record()
        record["cycles"][1]["stages"][0] = {**record["cycles"][1]["stages"][0], "carried_forward_action_item_ids": None}
        self.assertEqual(evaluate_learning_continuity_gate(record, "test", T)["status"], "FAIL")

    def test_stage_order_broken_reports_precondition_failure_not_crash(self):
        record = _valid_two_cycle_record()
        record["cycles"][0]["stages"][0] = {**record["cycles"][0]["stages"][0], "stage_name": "DO"}
        gate = evaluate_learning_continuity_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stage order invalid", gate["evidence"][0]["reason"])

    def test_cycles_missing_fails_closed(self):
        self.assertEqual(evaluate_learning_continuity_gate({"provenance": _prov()}, "test", T)["status"], "FAIL")

    def test_malformed_record_types_fail_closed(self):
        for bad in (None, [], "not-a-dict", 42, 3.14, True):
            self.assertEqual(evaluate_learning_continuity_gate(bad, "test", T)["status"], "FAIL", f"did not fail closed on {bad!r}")

    def test_three_cycle_chain_skip_reference_tamper_fails(self):
        c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "a")])
        c2 = _complete_cycle(2, cf=["ACTION-001"], act_items=[action_item("ACTION-002", "b")])
        c3 = _partial_cycle(3, cf=["ACTION-002"], stage_count=1)
        record = generate_pdca_record("PDCA-T-080", "proc", [c1, c2, c3], _prov())
        record["cycles"][2]["stages"][0] = {**record["cycles"][2]["stages"][0], "carried_forward_action_item_ids": ["ACTION-001"]}
        self.assertEqual(evaluate_learning_continuity_gate(record, "test", T)["status"], "FAIL")

    def test_harmless_description_tamper_does_not_affect_continuity(self):
        record = _valid_two_cycle_record()
        record["cycles"][0]["stages"][1] = {**record["cycles"][0]["stages"][1], "description": "changed, harmless"}
        self.assertEqual(evaluate_learning_continuity_gate(record, "test", T)["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_stage_order_constant(self):
        self.assertEqual(STAGE_ORDER, ("PLAN", "DO", "CHECK", "ACT"))

    def test_action_item_id_prefix_constant(self):
        self.assertEqual(ACTION_ITEM_ID_PREFIX, "ACTION-")

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "PDCA-")

    def test_is_cycle_complete_true_for_four_stages(self):
        self.assertTrue(is_cycle_complete(_complete_cycle(1)))

    def test_is_cycle_complete_false_for_partial(self):
        for n in (1, 2, 3):
            self.assertFalse(is_cycle_complete(_partial_cycle(1, stage_count=n)))

    def test_resolve_carried_forward_returns_none_for_cycle_one(self):
        record = _valid_two_cycle_record()
        self.assertIsNone(resolve_carried_forward_action_items(record, 1))

    def test_resolve_carried_forward_returns_none_for_unknown_cycle(self):
        record = _valid_two_cycle_record()
        self.assertIsNone(resolve_carried_forward_action_items(record, 99))

    def test_resolve_carried_forward_returns_resolved_dicts(self):
        record = _valid_two_cycle_record()
        resolved = resolve_carried_forward_action_items(record, 2)
        self.assertEqual(resolved, [{"id": "ACTION-002", "description": "a2"}])

    def test_resolve_carried_forward_returns_multiple_in_order(self):
        c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "first"), action_item("ACTION-002", "second")])
        c2 = _partial_cycle(2, cf=["ACTION-002", "ACTION-001"], stage_count=1)
        record = generate_pdca_record("PDCA-T-090", "proc", [c1, c2], _prov())
        resolved = resolve_carried_forward_action_items(record, 2)
        self.assertEqual([a["id"] for a in resolved], ["ACTION-002", "ACTION-001"])

    def test_resolve_carried_forward_defensively_filters_unresolvable_ids(self):
        """Operates on an already-valid record per its own docstring, but does not crash on a hand-tampered
        one either -- silently omits an id that no longer resolves rather than raising."""
        record = _valid_two_cycle_record()
        record["cycles"][1]["stages"][0] = {**record["cycles"][1]["stages"][0], "carried_forward_action_item_ids": ["ACTION-002", "ACTION-999"]}
        resolved = resolve_carried_forward_action_items(record, 2)
        self.assertEqual([a["id"] for a in resolved], ["ACTION-002"])

    def test_resolve_carried_forward_returns_none_when_previous_cycle_incomplete(self):
        record = {"cycles": [{"cycle_number": 1, "stages": [_plan(), _do()]}, {"cycle_number": 2, "stages": [_plan(cf=["ACTION-001"])]}]}
        self.assertIsNone(resolve_carried_forward_action_items(record, 2))


class AllGatesPassAndAggregateTests(unittest.TestCase):
    def test_evaluate_pdca_gates_returns_three_gates_with_expected_ids(self):
        results = evaluate_pdca_gates(_valid_two_cycle_record(), "test", T)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "stage_order_integrity", "learning_continuity"})

    def test_all_gates_pass_true_when_all_pass(self):
        results = evaluate_pdca_gates(_valid_two_cycle_record(), "test", T)
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        record = _valid_two_cycle_record()
        record["provenance"] = None
        results = evaluate_pdca_gates(record, "test", T)
        self.assertFalse(all_gates_pass(results))

    def test_all_gates_pass_treats_not_applicable_as_passing(self):
        fake = [{"gate_id": "x", "status": "PASS"}, {"gate_id": "y", "status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(fake))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_single_cycle_record_validates_against_schema(self):
        self.contracts.validate(PDCA_CYCLE_RECORD_SCHEMA, _valid_single_cycle_record(stage_count=1), "pdca record")

    def test_two_cycle_record_validates_against_schema(self):
        self.contracts.validate(PDCA_CYCLE_RECORD_SCHEMA, _valid_two_cycle_record(), "pdca record")

    def test_three_cycle_chain_validates_against_schema(self):
        c1 = _complete_cycle(1, act_items=[action_item("ACTION-001", "a")])
        c2 = _complete_cycle(2, cf=["ACTION-001"], act_items=[action_item("ACTION-002", "b")])
        c3 = _partial_cycle(3, cf=["ACTION-002"], stage_count=1)
        record = generate_pdca_record("PDCA-T-100", "proc", [c1, c2, c3], _prov())
        self.contracts.validate(PDCA_CYCLE_RECORD_SCHEMA, record, "pdca record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_pdca_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


if __name__ == "__main__":
    unittest.main()
