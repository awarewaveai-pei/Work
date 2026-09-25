"""Mutation-style tests for ``insight.contextual_inquiry`` (Method Atlas slice, insight family F06).

Covers: happy path, the real invariant (per-entry 3-field completeness + overall non-empty list) violated at
construction with its own distinct error codes, the invariant violated via hand-tampering a dict AFTER
construction (bypassing the constructor entirely) and caught only by the independent gate, fail-closed
behavior on malformed (non-dict / wrong-type) input, and structural edge cases.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.insight.contextual_inquiry import (
    METHOD_ID,
    all_gates_pass,
    evaluate_contextual_inquiry_gates,
    evaluate_observation_cycle_completeness_gate,
    evaluate_provenance_required_gate,
    generate_contextual_inquiry_session,
    observation,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CTXINQUIRY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/contextual-inquiry-session.schema.yaml"


def _obs(**overrides):
    kwargs = dict(
        action_observed="the user manually re-checked the shelf even though the system said stock was fine",
        researcher_note="a trust gap between the system and reality that no manual documents",
        followup_question="how often does the system disagree with what you see on the shelf?",
    )
    kwargs.update(overrides)
    return observation(**kwargs)


def _obs2(**overrides):
    kwargs = dict(
        action_observed="she photographed the discrepancy and sent it to a private chat instead of filing a report",
        researcher_note="the formal reporting path is evidently slower or more awkward than the informal one",
        followup_question="why send a photo instead of filing directly in the system?",
    )
    kwargs.update(overrides)
    return observation(**kwargs)


def _valid_record(**overrides):
    kwargs = dict(
        session_id="CTXINQUIRY-T-001",
        environment_context="a warehouse night-shift supervisor's real inventory workstation",
        observations=[_obs(), _obs2()],
        provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    kwargs.update(overrides)
    return generate_contextual_inquiry_session(**kwargs)


class ConvenienceConstructorTests(unittest.TestCase):
    """``observation`` does minimal shape validation; the real invariant lives only in
    ``generate_contextual_inquiry_session`` (see module docstring's DECISION section)."""

    def test_empty_action_observed_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE"):
            observation("", "a real note", "a real question?")

    def test_empty_researcher_note_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE"):
            observation("did something", "", "a real question?")

    def test_empty_followup_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE"):
            observation("did something", "a real note", "")

    def test_whitespace_only_field_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE"):
            observation("did something", "   ", "a real question?")

    def test_valid_observation_builds_expected_dict(self):
        item = observation("did something", "a real note", "a real question?")
        self.assertEqual(item, {"action_observed": "did something", "researcher_note": "a real note", "followup_question": "a real question?"})


class RecordScalarFieldConstructionTests(unittest.TestCase):
    """Envelope fields (id/environment_context/version/provenance) checked at construction."""

    def test_invalid_session_id_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INVALID_ID"):
            _valid_record(session_id="WRONG-001")

    def test_empty_session_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INVALID_ID"):
            _valid_record(session_id="")

    def test_empty_environment_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_EMPTY_ENVIRONMENT_CONTEXT"):
            _valid_record(environment_context="")

    def test_whitespace_only_environment_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_EMPTY_ENVIRONMENT_CONTEXT"):
            _valid_record(environment_context="   ")

    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INVALID_VERSION"):
            _valid_record(version=1.0)

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL", "authorship_state": "AI_SUGGESTED", "locked": None})

    def test_version_defaults_to_1_0_0(self):
        self.assertEqual(_valid_record()["version"], "1.0.0")

    def test_generated_by_method_defaults_to_method_id(self):
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_happy_path_returns_all_expected_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "environment_context", "observations", "provenance"},
        )


class ObservationsShapeTests(unittest.TestCase):
    """Malformed observations (hand-built, bypassing ``observation()``) refused with CTXINQUIRY_INVALID_OBSERVATIONS."""

    def test_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INVALID_OBSERVATIONS"):
            _valid_record(observations="not-a-list")

    def test_list_with_non_dict_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INVALID_OBSERVATIONS"):
            _valid_record(observations=[_obs(), "not-a-dict"])

    def test_entry_with_unknown_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INVALID_OBSERVATIONS"):
            _valid_record(observations=[_obs(), {**_obs2(), "extra": "nope"}])

    def test_entry_missing_a_required_key_entirely_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INVALID_OBSERVATIONS"):
            _valid_record(observations=[_obs(), {"action_observed": "x", "researcher_note": "y"}])

    def test_entry_with_non_string_field_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INVALID_OBSERVATIONS"):
            _valid_record(observations=[_obs(), {**_obs2(), "followup_question": 123}])


class ObservationCycleInvariantTests(unittest.TestCase):
    """The REAL invariant: >= 1 entry overall, every entry's own 3 fields all non-empty -- checked once shape
    is already valid (via hand-built dicts bypassing ``observation()``'s own eager check)."""

    def test_zero_observations_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_EMPTY_OBSERVATIONS"):
            _valid_record(observations=[])

    def test_one_complete_observation_passes(self):
        record = _valid_record(observations=[_obs()])
        self.assertEqual(len(record["observations"]), 1)

    def test_hand_built_entry_with_empty_action_observed_is_refused_with_cycle_code(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE"):
            _valid_record(observations=[{"action_observed": "", "researcher_note": "y", "followup_question": "z?"}])

    def test_hand_built_entry_with_empty_researcher_note_is_refused_with_cycle_code(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE"):
            _valid_record(observations=[{"action_observed": "x", "researcher_note": "", "followup_question": "z?"}])

    def test_hand_built_entry_with_empty_followup_question_is_refused_with_cycle_code(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE"):
            _valid_record(observations=[{"action_observed": "x", "researcher_note": "y", "followup_question": ""}])

    def test_hand_built_whitespace_only_field_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE"):
            _valid_record(observations=[{"action_observed": "x", "researcher_note": "   ", "followup_question": "z?"}])

    def test_one_complete_one_incomplete_among_several_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CTXINQUIRY_INCOMPLETE_OBSERVATION_CYCLE"):
            _valid_record(observations=[_obs(), {"action_observed": "x", "researcher_note": "y", "followup_question": ""}])

    def test_multiple_complete_observations_passes(self):
        record = _valid_record(observations=[_obs(), _obs2()])
        self.assertEqual(len(record["observations"]), 2)


class RecordIntegrityTests(unittest.TestCase):
    """Rebuild-from-known-fields regression guard, same discipline every builder in this package uses."""

    def test_mutating_caller_supplied_observations_list_after_construction_does_not_affect_stored_record(self):
        source = [_obs()]
        record = _valid_record(observations=source)
        source.append(_obs2())
        self.assertEqual(len(record["observations"]), 1)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(CTXINQUIRY_SCHEMA, _valid_record(), "contextual inquiry session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_contextual_inquiry_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_both_gates(self):
        results = evaluate_contextual_inquiry_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "observation_cycle_completeness"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(evaluate_observation_cycle_completeness_gate(record, "test", "2026-09-11T00:00:00Z")["status"], "PASS")

    def test_hand_tampered_empty_observations_fails_cycle_gate_only(self):
        record = _valid_record()
        record["observations"] = []
        gate = evaluate_observation_cycle_completeness_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")["status"], "PASS")

    def test_hand_tampered_entry_emptied_after_construction_fails_cycle_gate(self):
        """Independent-gate hand-tamper proof: build a valid record, then mutate ONE stored entry's own
        researcher_note to blank AFTER construction (bypassing generate_contextual_inquiry_session entirely
        on the mutation itself) -- the gate must catch this even though the record was valid the moment it
        was built."""
        record = _valid_record()
        record["observations"][0] = {**record["observations"][0], "researcher_note": ""}
        gate = evaluate_observation_cycle_completeness_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        violations_text = " ".join(gate["evidence"][0]["violations"])
        self.assertIn("[0]", violations_text)  # index 0 is the tampered entry
        self.assertEqual(evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")["status"], "PASS")

    def test_hand_tampered_extra_key_injected_after_construction_fails_cycle_gate(self):
        record = _valid_record()
        record["observations"][0] = {**record["observations"][0], "extra": "smuggled"}
        gate = evaluate_observation_cycle_completeness_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_malformed_record_not_a_dict_fails_closed_on_every_gate(self):
        for malformed in (None, [], "not-a-dict", 42):
            for gate_fn in (evaluate_provenance_required_gate, evaluate_observation_cycle_completeness_gate):
                gate = gate_fn(malformed, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL", f"{gate_fn.__name__} did not fail closed on {malformed!r}")

    def test_malformed_observations_entries_fail_closed_not_a_crash(self):
        record = _valid_record()
        record["observations"] = ["not-a-dict", 42, None]
        gate = evaluate_observation_cycle_completeness_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_observations_not_a_list_fails_closed_on_cycle_gate(self):
        record = _valid_record()
        record["observations"] = "not-a-list"
        gate = evaluate_observation_cycle_completeness_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_results_validate_against_the_real_gate_result_schema(self):
        contracts = SchemaContracts(resolve_spec_root())
        results = evaluate_contextual_inquiry_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        for gate in results:
            contracts.validate("ai-lego://specs/execution/gate.schema.yaml#/gate_result", gate, f"gate {gate['gate_id']}")


if __name__ == "__main__":
    unittest.main()
