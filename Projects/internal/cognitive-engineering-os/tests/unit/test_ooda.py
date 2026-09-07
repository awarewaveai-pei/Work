"""Mutation-style tests for ``learning.ooda`` (6th Method Atlas slice from the learning family, after
reversal_criteria/kill_criteria/decision_journal/pdca/after_action_review).

Covers: lazy (non-validating) convenience constructors, all FOUR real invariants (stage shape, stage
order, timestamp monotonicity, orient grounding) violated at construction with distinct error codes, each
invariant violated via hand-tampering a valid record after construction and caught only by the
independent gate, fail-closed behavior on malformed input, cross-gate independence, the two disclosed
scope gaps (duplicate observation ids, duplicate observation_refs -- neither rejected, both documented as
legal), the compute helper, and schema conformance including the schema's own embedded examples.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.learning.ooda import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    STAGE_TYPES_IN_ORDER,
    act_stage,
    all_gates_pass,
    compute_cycle_tempo_seconds,
    decide_stage,
    evaluate_ooda_gates,
    evaluate_ooda_integrity_gate,
    evaluate_provenance_required_gate,
    generate_ooda_cycle_record,
    observation,
    observe_stage,
    orient_stage,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

OODA_CYCLE_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/ooda-cycle-record.schema.yaml"
T = "2026-09-07T00:00:00Z"
T0, T1, T2, T3 = "2026-09-07T00:00:00Z", "2026-09-07T00:01:00Z", "2026-09-07T00:02:00Z", "2026-09-07T00:03:00Z"


def _prov(etype="HUMAN_OPINION", astate="HUMAN_ORIGINAL"):
    return make_provenance(etype, astate)


def _obs(id_="OBS-1", content="an observation", prov=None):
    return observation(id_, content, prov or _prov())


def _observe(timestamp=T0, obs=None, prov=None, content="observed something"):
    return observe_stage(content, timestamp, prov or _prov(), obs if obs is not None else [_obs()])


def _orient(timestamp=T1, refs=None, mmu="model updated because of what was observed", prov=None, content="oriented"):
    return orient_stage(content, timestamp, prov or _prov(), refs if refs is not None else ["OBS-1"], mmu)


def _decide(timestamp=T2, prov=None, content="decided"):
    return decide_stage(content, timestamp, prov or _prov())


def _act(timestamp=T3, prov=None, content="acted"):
    return act_stage(content, timestamp, prov or _prov())


def _valid_stages():
    return [_observe(), _orient(), _decide(), _act()]


def _build(record_id="OODA-T-001", situation="test situation", stages=None, prov=None, **kw):
    return generate_ooda_cycle_record(record_id, situation, stages if stages is not None else _valid_stages(), prov if prov is not None else _prov(), **kw)


def _valid_record():
    return _build()


class ObservationConstructorTests(unittest.TestCase):
    def test_builds_expected_shape(self):
        obs = observation("OBS-1", "a fact", _prov())
        self.assertEqual(set(obs.keys()), {"id", "content", "provenance"})
        self.assertEqual(obs["id"], "OBS-1")
        self.assertEqual(obs["content"], "a fact")

    def test_does_not_eagerly_validate_empty_content(self):
        """Not the invariant boundary -- generate_ooda_cycle_record validates whatever it is handed
        regardless of how it was built, same division of labor fault_tree.basic_event establishes."""
        obs = observation("OBS-1", "", _prov())
        self.assertEqual(obs["content"], "")

    def test_does_not_eagerly_validate_empty_id(self):
        obs = observation("", "content", _prov())
        self.assertEqual(obs["id"], "")


class StageConstructorTests(unittest.TestCase):
    def test_observe_stage_shape(self):
        stage = _observe()
        self.assertEqual(set(stage.keys()), {"stage_type", "content", "timestamp", "provenance", "observations"})
        self.assertEqual(stage["stage_type"], "OBSERVE")

    def test_observe_stage_copies_observations_list_not_same_list(self):
        obs_list = [_obs()]
        stage = observe_stage("c", T0, _prov(), obs_list)
        obs_list.append(_obs("OBS-2"))
        self.assertEqual(len(stage["observations"]), 1)

    def test_orient_stage_shape(self):
        stage = _orient()
        self.assertEqual(set(stage.keys()), {"stage_type", "content", "timestamp", "provenance", "observation_refs", "mental_model_update"})
        self.assertEqual(stage["stage_type"], "ORIENT")

    def test_orient_stage_copies_refs_list_not_same_list(self):
        refs = ["OBS-1"]
        stage = orient_stage("c", T1, _prov(), refs, "update")
        refs.append("OBS-2")
        self.assertEqual(stage["observation_refs"], ["OBS-1"])

    def test_decide_stage_shape(self):
        stage = _decide()
        self.assertEqual(set(stage.keys()), {"stage_type", "content", "timestamp", "provenance"})
        self.assertEqual(stage["stage_type"], "DECIDE")

    def test_act_stage_shape(self):
        stage = _act()
        self.assertEqual(set(stage.keys()), {"stage_type", "content", "timestamp", "provenance"})
        self.assertEqual(stage["stage_type"], "ACT")

    def test_constructors_do_not_eagerly_validate_empty_content(self):
        """Lazy, non-validating constructors (fault_tree.py convention, not pdca.py's eager one) -- the
        module docstring discloses this choice explicitly."""
        self.assertEqual(observe_stage("", T0, _prov(), [_obs()])["content"], "")
        self.assertEqual(orient_stage("", T1, _prov(), ["OBS-1"], "")["mental_model_update"], "")
        self.assertEqual(decide_stage("", T2, _prov())["content"], "")
        self.assertEqual(act_stage("", T3, _prov())["content"], "")


class RecordFieldConstructionTests(unittest.TestCase):
    def test_valid_record_top_level_fields(self):
        record = _valid_record()
        self.assertEqual(record["id"], "OODA-T-001")
        self.assertEqual(record["version"], "1.0.0")
        self.assertEqual(record["generated_by_method"], METHOD_ID)
        self.assertEqual(record["situation"], "test situation")

    def test_custom_version_and_generated_by_method_stored(self):
        record = _build(version="2.3.4", generated_by_method="learning.ooda@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(record["generated_by_method"], "learning.ooda@test")

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_whitespace_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_RECORD_ID"):
            _build(record_id="   ")

    def test_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_RECORD_ID"):
            _build(record_id="PDCA-T-001")

    def test_empty_situation_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_EMPTY_RECORD_FIELD"):
            _build(situation="")

    def test_whitespace_situation_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_EMPTY_RECORD_FIELD"):
            _build(situation="   ")

    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_VERSION"):
            _build(version=1.0)

    def test_missing_provenance_is_refused(self):
        """Direct call, not via _build() -- that helper treats prov=None as 'use the default', so a real
        None must be passed straight to the generator to exercise this branch."""
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_PROVENANCE"):
            generate_ooda_cycle_record("OODA-T-001", "test situation", _valid_stages(), None)

    def test_malformed_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_PROVENANCE"):
            _build(prov={"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"})

    def test_provenance_checked_last_after_stages_are_otherwise_valid(self):
        """Order-of-checks regression guard: a bad provenance on top of otherwise-invalid stages must
        report the STAGES problem first, not provenance."""
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe()], prov=None)


class StagesShapeConstructionTests(unittest.TestCase):
    def test_stages_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages="not-a-list")

    def test_stages_empty_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[])

    def test_stages_with_three_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), _decide()])

    def test_stages_with_five_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), _decide(), _act(), _decide(timestamp=T3)])

    def test_stages_with_non_dict_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), _decide(), "not-a-dict"])

    def test_unknown_stage_type_is_refused(self):
        bad = dict(_decide(), stage_type="REACT")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    def test_stage_missing_content_key_is_refused(self):
        bad = _decide()
        del bad["content"]
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    def test_stage_with_extra_unknown_key_is_refused(self):
        bad = dict(_decide(), extra="nope")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    def test_decide_stage_with_observations_key_is_refused(self):
        """A stage-type-specific extra key is illegal on the WRONG stage type (exact key-set match)."""
        bad = dict(_decide(), observations=[_obs()])
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    def test_act_stage_with_observation_refs_key_is_refused(self):
        bad = dict(_act(), observation_refs=["OBS-1"])
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), _decide(), bad])

    def test_stage_content_empty_is_refused(self):
        bad = _decide(content="")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    def test_stage_content_whitespace_is_refused(self):
        bad = _decide(content="   ")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    def test_stage_timestamp_missing_is_refused(self):
        bad = _decide()
        del bad["timestamp"]
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    def test_stage_timestamp_unparseable_is_refused(self):
        bad = _decide(timestamp="not-a-timestamp")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    def test_stage_timestamp_non_string_is_refused(self):
        bad = dict(_decide(), timestamp=12345)
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    def test_stage_provenance_missing_is_refused(self):
        bad = dict(_decide(), provenance=None)
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    def test_stage_provenance_non_dict_is_refused(self):
        bad = dict(_decide(), provenance="not-a-dict")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), _orient(), bad, _act()])

    # --- OBSERVE-specific ---
    def test_observe_with_empty_observations_is_refused(self):
        bad = _observe(obs=[])
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[bad, _orient(), _decide(), _act()])

    def test_observe_observations_not_a_list_is_refused(self):
        bad = dict(_observe(), observations="not-a-list")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[bad, _orient(), _decide(), _act()])

    def test_observation_missing_id_is_refused(self):
        bad_obs = {"content": "c", "provenance": _prov()}
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(obs=[bad_obs]), _orient(), _decide(), _act()])

    def test_observation_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(obs=[_obs(id_="")]), _orient(), _decide(), _act()])

    def test_observation_empty_content_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(obs=[_obs(content="")]), _orient(), _decide(), _act()])

    def test_observation_non_dict_provenance_is_refused(self):
        bad_obs = {"id": "OBS-1", "content": "c", "provenance": "nope"}
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(obs=[bad_obs]), _orient(), _decide(), _act()])

    def test_observation_extra_key_is_refused(self):
        bad_obs = dict(_obs(), extra="nope")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(obs=[bad_obs]), _orient(), _decide(), _act()])

    # --- ORIENT-specific ---
    def test_orient_with_empty_observation_refs_is_refused(self):
        bad = _orient(refs=[])
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), bad, _decide(), _act()])

    def test_orient_observation_refs_not_a_list_is_refused(self):
        bad = dict(_orient(), observation_refs="OBS-1")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), bad, _decide(), _act()])

    def test_orient_observation_refs_with_non_string_entry_is_refused(self):
        bad = dict(_orient(), observation_refs=["OBS-1", 1])
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), bad, _decide(), _act()])

    def test_orient_observation_refs_with_empty_string_entry_is_refused(self):
        bad = dict(_orient(), observation_refs=["OBS-1", ""])
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), bad, _decide(), _act()])

    def test_orient_mental_model_update_empty_is_refused(self):
        bad = _orient(mmu="")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), bad, _decide(), _act()])

    def test_orient_mental_model_update_whitespace_is_refused(self):
        bad = _orient(mmu="   ")
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), bad, _decide(), _act()])

    def test_orient_missing_mental_model_update_key_is_refused(self):
        bad = _orient()
        del bad["mental_model_update"]
        with self.assertRaisesRegex(InvariantViolation, "OODA_INVALID_STAGES"):
            _build(stages=[_observe(), bad, _decide(), _act()])


class StageOrderConstructionTests(unittest.TestCase):
    def test_orient_and_decide_swapped_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_STAGE_ORDER_VIOLATED"):
            _build(stages=[_observe(), _decide(), _orient(), _act()])

    def test_observe_and_orient_swapped_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_STAGE_ORDER_VIOLATED"):
            _build(stages=[_orient(), _observe(), _decide(), _act()])

    def test_decide_and_act_swapped_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_STAGE_ORDER_VIOLATED"):
            _build(stages=[_observe(), _orient(), _act(), _decide()])

    def test_starting_with_decide_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_STAGE_ORDER_VIOLATED"):
            _build(stages=[_decide(), _observe(), _orient(), _act()])

    def test_fully_reversed_order_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_STAGE_ORDER_VIOLATED"):
            _build(stages=[_act(), _decide(), _orient(), _observe()])

    def test_duplicated_observe_missing_orient_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_STAGE_ORDER_VIOLATED"):
            _build(stages=[_observe(), _observe(timestamp=T1), _decide(), _act()])

    def test_error_message_names_the_actual_and_required_sequence(self):
        with self.assertRaisesRegex(InvariantViolation, r"\['OBSERVE', 'DECIDE', 'ORIENT', 'ACT'\]"):
            _build(stages=[_observe(), _decide(), _orient(), _act()])


class TimestampMonotonicityConstructionTests(unittest.TestCase):
    def test_orient_before_observe_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_NONMONOTONIC_TIMESTAMPS"):
            _build(stages=[_observe(timestamp=T1), _orient(timestamp=T0), _decide(), _act()])

    def test_decide_before_orient_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_NONMONOTONIC_TIMESTAMPS"):
            _build(stages=[_observe(), _orient(timestamp=T2), _decide(timestamp=T1), _act()])

    def test_act_before_decide_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_NONMONOTONIC_TIMESTAMPS"):
            _build(stages=[_observe(), _orient(), _decide(timestamp=T3), _act(timestamp=T2)])

    def test_act_before_observe_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "OODA_NONMONOTONIC_TIMESTAMPS"):
            _build(stages=[_observe(timestamp=T3), _orient(timestamp="2026-09-07T00:04:00Z"), _decide(timestamp="2026-09-07T00:05:00Z"), _act(timestamp=T0)])

    def test_all_four_stages_at_the_identical_timestamp_is_legal(self):
        """Boundary: the code checks 'later < earlier' (strict), so equal timestamps across every stage are
        legal -- a real, if extreme, case (an instant decision) must not be rejected."""
        record = _build(stages=[_observe(timestamp=T0), _orient(timestamp=T0), _decide(timestamp=T0), _act(timestamp=T0)])
        self.assertEqual(compute_cycle_tempo_seconds(record), 0.0)

    def test_equal_timestamp_between_exactly_two_adjacent_stages_is_legal(self):
        record = _build(stages=[_observe(timestamp=T0), _orient(timestamp=T0), _decide(timestamp=T2), _act(timestamp=T3)])
        self.assertEqual(record["stages"][0]["timestamp"], record["stages"][1]["timestamp"])

    def test_strictly_increasing_timestamps_is_the_happy_path(self):
        record = _valid_record()
        self.assertEqual([s["timestamp"] for s in record["stages"]], [T0, T1, T2, T3])


class OrientGroundingConstructionTests(unittest.TestCase):
    def test_ref_to_nonexistent_observation_id_is_refused(self):
        bad = _orient(refs=["OBS-GHOST"])
        with self.assertRaisesRegex(InvariantViolation, "OODA_ORIENT_NOT_GROUNDED"):
            _build(stages=[_observe(), bad, _decide(), _act()])

    def test_partially_unresolved_refs_names_only_the_bad_id(self):
        bad = _orient(refs=["OBS-1", "OBS-GHOST"])
        with self.assertRaisesRegex(InvariantViolation, r"OBS-GHOST"):
            _build(stages=[_observe(), bad, _decide(), _act()])

    def test_ref_into_a_different_records_observation_id_is_still_refused(self):
        """Grounding is scoped to THIS record's own OBSERVE stage -- an id that merely looks plausible but
        was never actually observed here must still be refused."""
        bad = _orient(refs=["OBS-FROM-ANOTHER-RECORD"])
        with self.assertRaisesRegex(InvariantViolation, "OODA_ORIENT_NOT_GROUNDED"):
            _build(stages=[_observe(obs=[_obs("OBS-1"), _obs("OBS-2")]), bad, _decide(), _act()])

    def test_happy_path_ref_to_one_of_several_observations(self):
        record = _build(stages=[_observe(obs=[_obs("OBS-1"), _obs("OBS-2"), _obs("OBS-3")]), _orient(refs=["OBS-2"]), _decide(), _act()])
        self.assertEqual(record["stages"][1]["observation_refs"], ["OBS-2"])

    def test_happy_path_ref_to_all_observations(self):
        record = _build(stages=[_observe(obs=[_obs("OBS-1"), _obs("OBS-2")]), _orient(refs=["OBS-1", "OBS-2"]), _decide(), _act()])
        self.assertEqual(len(record["stages"][1]["observation_refs"]), 2)

    def test_disclosed_scope_gap_duplicate_ref_to_the_same_valid_id_is_not_rejected(self):
        """Documented non-invariant (OQ-OODA-3 adjacent): observation_refs referencing the SAME valid id
        twice resolves fine via set membership -- not separately rejected."""
        record = _build(stages=[_observe(), _orient(refs=["OBS-1", "OBS-1"]), _decide(), _act()])
        self.assertEqual(record["stages"][1]["observation_refs"], ["OBS-1", "OBS-1"])

    def test_disclosed_scope_gap_duplicate_observation_ids_within_one_observe_stage_is_not_rejected(self):
        """Documented scope gap (module docstring): duplicate observations[].id within one OBSERVE stage is
        not separately rejected -- grounding still resolves correctly via set membership."""
        dup_obs = [_obs("OBS-1", content="first"), _obs("OBS-1", content="second, same id")]
        record = _build(stages=[_observe(obs=dup_obs), _orient(refs=["OBS-1"]), _decide(), _act()])
        self.assertEqual(len(record["stages"][0]["observations"]), 2)


class HappyPathConstructionTests(unittest.TestCase):
    def test_full_valid_record_end_to_end(self):
        record = _valid_record()
        self.assertEqual(len(record["stages"]), 4)
        self.assertEqual([s["stage_type"] for s in record["stages"]], list(STAGE_TYPES_IN_ORDER))

    def test_default_version_and_method_id_applied(self):
        record = _valid_record()
        self.assertEqual(record["version"], "1.0.0")
        self.assertEqual(record["generated_by_method"], "learning.ooda")

    def test_mutating_the_callers_own_stages_list_after_construction_does_not_affect_the_stored_record(self):
        stages = _valid_stages()
        record = _build(stages=stages)
        stages.append(_decide(timestamp="2026-09-07T00:09:00Z"))
        self.assertEqual(len(record["stages"]), 4)

    def test_mutating_the_callers_own_observations_list_after_construction_does_not_affect_the_stored_record(self):
        obs_list = [_obs("OBS-1")]
        observe = observe_stage("c", T0, _prov(), obs_list)
        record = _build(stages=[observe, _orient(), _decide(), _act()])
        obs_list.append(_obs("OBS-2"))
        self.assertEqual(len(record["stages"][0]["observations"]), 1)

    def test_mutating_the_callers_own_observation_refs_list_after_construction_does_not_affect_the_stored_record(self):
        refs = ["OBS-1"]
        orient = orient_stage("c", T1, _prov(), refs, "update")
        record = _build(stages=[_observe(), orient, _decide(), _act()])
        refs.append("OBS-2")
        self.assertEqual(record["stages"][1]["observation_refs"], ["OBS-1"])

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = _build(prov=provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_record_top_level_keys_are_exactly_the_six_the_schema_expects(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "situation", "stages", "provenance"})


class ComputeCycleTempoTests(unittest.TestCase):
    def test_twenty_minute_tempo(self):
        record = _build(stages=[_observe(timestamp="2026-04-20T09:00:00Z"), _orient(timestamp="2026-04-20T09:02:00Z"), _decide(timestamp="2026-04-20T09:05:00Z"), _act(timestamp="2026-04-20T09:20:00Z")])
        self.assertEqual(compute_cycle_tempo_seconds(record), 1200.0)

    def test_zero_duration_when_all_stages_share_a_timestamp(self):
        record = _build(stages=[_observe(timestamp=T0), _orient(timestamp=T0), _decide(timestamp=T0), _act(timestamp=T0)])
        self.assertEqual(compute_cycle_tempo_seconds(record), 0.0)

    def test_one_second_tempo(self):
        record = _build(stages=[_observe(timestamp="2026-09-07T00:00:00Z"), _orient(timestamp="2026-09-07T00:00:00Z"), _decide(timestamp="2026-09-07T00:00:00Z"), _act(timestamp="2026-09-07T00:00:01Z")])
        self.assertEqual(compute_cycle_tempo_seconds(record), 1.0)

    def test_ignores_orient_and_decide_timestamps_entirely(self):
        """Only OBSERVE and ACT bound the tempo -- ORIENT/DECIDE timestamps in between do not affect it."""
        fast = _build(stages=[_observe(timestamp=T0), _orient(timestamp=T0), _decide(timestamp=T0), _act(timestamp=T3)])
        slow_middle = _build(stages=[_observe(timestamp=T0), _orient(timestamp="2026-09-07T00:00:30Z"), _decide(timestamp="2026-09-07T00:02:30Z"), _act(timestamp=T3)])
        self.assertEqual(compute_cycle_tempo_seconds(fast), compute_cycle_tempo_seconds(slow_middle))

    def test_recomputed_fresh_not_a_stored_field(self):
        record = _valid_record()
        self.assertNotIn("tempo_seconds", record)
        self.assertNotIn("tempo_seconds", record["stages"][0])


class GateProvenanceTests(unittest.TestCase):
    def test_valid_record_passes_provenance_gate(self):
        self.assertEqual(evaluate_provenance_required_gate(_valid_record(), "test", T)["status"], "PASS")

    def test_hand_tampered_top_level_provenance_fails_only_this_gate(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", T)["status"], "FAIL")
        self.assertEqual(evaluate_ooda_integrity_gate(record, "test", T)["status"], "PASS")

    def test_hand_tampered_stage_provenance_fails_and_names_the_stage(self):
        record = _valid_record()
        record["stages"][2] = {**record["stages"][2], "provenance": None}
        gate = evaluate_provenance_required_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("DECIDE", gate["evidence"][0]["invalid_stage_provenance_types"])

    def test_hand_tampered_observation_provenance_fails_and_names_the_id(self):
        record = _valid_record()
        record["stages"][0]["observations"][0] = {**record["stages"][0]["observations"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(record, "test", T)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("OBS-1", gate["evidence"][0]["invalid_observation_provenance_ids"])

    def test_malformed_record_types_fail_closed(self):
        for bad in (None, [], "not-a-dict", 42, True):
            with self.subTest(bad=bad):
                self.assertEqual(evaluate_provenance_required_gate(bad, "test", T)["status"], "FAIL")

    def test_missing_stages_key_does_not_crash_and_isolates_to_top_level_provenance(self):
        record = {"provenance": _prov()}
        self.assertEqual(evaluate_provenance_required_gate(record, "test", T)["status"], "PASS")

    def test_non_dict_stage_entry_is_silently_skipped_by_this_gate_but_not_by_ooda_integrity(self):
        """Each gate owns one concern -- a structurally-broken stage entry is ooda_integrity's job, not
        provenance_required's (matches learning.pdca's own documented
        test_garbage_cycle_entry_is_silently_skipped_by_this_gate_but_not_others precedent)."""
        record = _valid_record()
        record["stages"][1] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", T)["status"], "PASS")
        self.assertEqual(evaluate_ooda_integrity_gate(record, "test", T)["status"], "FAIL")

    def test_non_observe_stage_provenance_tamper_does_not_touch_observation_list(self):
        record = _valid_record()
        record["stages"][3] = {**record["stages"][3], "provenance": None}
        gate = evaluate_provenance_required_gate(record, "test", T)
        self.assertEqual(gate["evidence"][0]["invalid_observation_provenance_ids"], [])


class GateOodaIntegrityTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_ooda_integrity_gate(record, "test", T)

    def test_valid_record_passes_with_expected_evidence(self):
        record = _valid_record()
        result = self._gate(record)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["evidence"][0]["stage_count"], 4)
        self.assertEqual(result["evidence"][0]["tempo_seconds"], compute_cycle_tempo_seconds(record))

    def test_non_dict_record_types_fail_closed(self):
        for bad in (None, [], "not-a-dict", 42, 3.14, True):
            with self.subTest(bad=bad):
                self.assertEqual(self._gate(bad)["status"], "FAIL", f"did not fail closed on {bad!r}")

    def test_hand_tampered_empty_id_fails(self):
        record = _valid_record()
        record["id"] = ""
        result = self._gate(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}")

    def test_hand_tampered_wrong_prefix_id_fails(self):
        record = _valid_record()
        record["id"] = "PDCA-T-001"
        self.assertEqual(self._gate(record)["status"], "FAIL")

    def test_hand_tampered_non_string_version_fails(self):
        record = _valid_record()
        record["version"] = 123
        result = self._gate(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_empty_situation_fails(self):
        record = _valid_record()
        record["situation"] = "   "
        result = self._gate(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "situation missing or empty")

    def test_hand_tampered_stages_wrong_length_fails(self):
        record = _valid_record()
        record["stages"] = record["stages"][:3]
        result = self._gate(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("stages invalid", result["evidence"][0]["reason"])

    def test_hand_tampered_stage_missing_key_fails(self):
        record = _valid_record()
        del record["stages"][1]["mental_model_update"]
        result = self._gate(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("stages invalid", result["evidence"][0]["reason"])

    # --- invariant #2, hand-tampered at the GATE layer only ---
    def test_hand_tampered_order_swap_fails_isolated_to_order(self):
        """Bypasses the constructor entirely -- proves the gate, not just generate_ooda_cycle_record,
        enforces order. Positions swapped so each stage individually stays well-shaped."""
        record = _valid_record()
        record["stages"] = [record["stages"][0], record["stages"][2], record["stages"][1], record["stages"][3]]
        result = self._gate(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "stage order violated")

    def test_hand_tampered_order_evidence_carries_details(self):
        record = _valid_record()
        record["stages"] = [record["stages"][0], record["stages"][2], record["stages"][1], record["stages"][3]]
        result = self._gate(record)
        self.assertTrue(result["evidence"][0]["details"])

    # --- invariant #3, hand-tampered at the GATE layer only ---
    def test_hand_tampered_act_timestamp_before_observe_fails_isolated_to_monotonicity(self):
        record = _valid_record()
        record["stages"][3]["timestamp"] = "2026-01-01T00:00:00Z"
        result = self._gate(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "timestamps not monotonic")

    def test_hand_tampered_orient_timestamp_before_observe_fails(self):
        record = _valid_record()
        record["stages"][1]["timestamp"] = "2026-01-01T00:00:00Z"
        result = self._gate(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "timestamps not monotonic")

    # --- invariant #4, hand-tampered at the GATE layer only ---
    def test_hand_tampered_observation_refs_dangling_fails_isolated_to_grounding(self):
        record = _valid_record()
        record["stages"][1]["observation_refs"] = ["OBS-GHOST"]
        result = self._gate(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "orient not grounded")

    def test_hand_tampered_observation_id_renamed_breaks_grounding(self):
        """Renaming the OBSERVE-side id (rather than the ORIENT-side ref) is an equally valid way to break
        the same cross-reference."""
        record = _valid_record()
        record["stages"][0]["observations"][0]["id"] = "OBS-RENAMED"
        result = self._gate(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "orient not grounded")

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
        before = copy.deepcopy(record)
        self._gate(record)
        self.assertEqual(record, before)

    def test_missing_stages_key_fails_closed(self):
        self.assertEqual(self._gate({"id": "OODA-X", "version": "1.0.0", "situation": "s", "provenance": _prov()})["status"], "FAIL")


class AllGatesPassAndAggregateTests(unittest.TestCase):
    def test_evaluate_ooda_gates_returns_two_gates_with_expected_ids(self):
        results = evaluate_ooda_gates(_valid_record(), "test", T)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "ooda_integrity"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass(evaluate_ooda_gates(_valid_record(), "test", T)))

    def test_all_gates_pass_false_when_provenance_fails(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertFalse(all_gates_pass(evaluate_ooda_gates(record, "test", T)))

    def test_all_gates_pass_false_when_integrity_fails(self):
        record = _valid_record()
        record["stages"][1]["observation_refs"] = ["OBS-GHOST"]
        self.assertFalse(all_gates_pass(evaluate_ooda_gates(record, "test", T)))

    def test_all_gates_pass_treats_not_applicable_as_passing(self):
        fake = [{"gate_id": "x", "status": "PASS"}, {"gate_id": "y", "status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(fake))


class ConstantsTests(unittest.TestCase):
    def test_record_id_prefix(self):
        self.assertEqual(RECORD_ID_PREFIX, "OODA-")

    def test_stage_types_in_order(self):
        self.assertEqual(STAGE_TYPES_IN_ORDER, ("OBSERVE", "ORIENT", "DECIDE", "ACT"))

    def test_method_id(self):
        self.assertEqual(METHOD_ID, "learning.ooda")


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_schema(self):
        self.contracts.validate(OODA_CYCLE_RECORD_SCHEMA, _valid_record(), "ooda record")

    def test_multi_observation_record_validates_against_schema(self):
        record = _build(stages=[_observe(obs=[_obs("OBS-1"), _obs("OBS-2"), _obs("OBS-3")]), _orient(refs=["OBS-1", "OBS-3"]), _decide(), _act()])
        self.contracts.validate(OODA_CYCLE_RECORD_SCHEMA, record, "multi-observation ooda record")

    def test_schema_rejects_wrong_id_prefix(self):
        record = _valid_record()
        record["id"] = "PDCA-T-001"
        with self.assertRaises(Exception):
            self.contracts.validate(OODA_CYCLE_RECORD_SCHEMA, record, "wrong id prefix")

    def test_schema_rejects_missing_required_top_level_field(self):
        record = _valid_record()
        del record["stages"]
        with self.assertRaises(Exception):
            self.contracts.validate(OODA_CYCLE_RECORD_SCHEMA, record, "missing stages")

    def test_schema_rejects_a_fifth_stage(self):
        record = _valid_record()
        record["stages"].append(_decide(timestamp="2026-09-07T00:09:00Z"))
        with self.assertRaises(Exception):
            self.contracts.validate(OODA_CYCLE_RECORD_SCHEMA, record, "five stages")

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "ooda-cycle-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "ooda-cycle-record.schema.yaml has no examples to check")
        self.assertEqual(len(examples), 2)
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(OODA_CYCLE_RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_ooda_gates(value, "test", T)), f"schema example failed a real gate: {example.get('description')}")

    def test_contract_yaml_id_matches_method_id(self):
        import yaml

        contract_path = self.spec_root / "methods" / "contracts" / "learning.ooda.contract.yaml"
        contract_doc = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.assertEqual(contract_doc["id"], METHOD_ID)
        self.assertEqual(contract_doc["status"], "ACTIVE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_ooda_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


if __name__ == "__main__":
    unittest.main()
