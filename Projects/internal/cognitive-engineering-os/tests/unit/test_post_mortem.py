"""Mutation-style tests for ``learning.post_mortem`` (F17 learning family, 4th concrete entry after
reversal_criteria/kill_criteria/decision_journal).

Covers: convenience constructors (timeline_event/cause/action) validated in isolation; each of the three real
invariants (NO-BLAME shape, referential integrity, action ownership) violated at construction with its own
distinct error code; each invariant violated via hand-tampering a dict AFTER construction (bypassing the
constructors entirely) and caught only by the independent gate; fail-closed behavior on malformed (non-dict /
wrong-type) input on all four gates; structural edge cases (closed key sets reject an extra "blame" field;
duplicate ids within one array; a dangling cause->timeline reference).
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.learning.post_mortem import (
    METHOD_ID,
    action,
    all_gates_pass,
    cause,
    evaluate_post_mortem_action_ownership_gate,
    evaluate_post_mortem_gates,
    evaluate_post_mortem_referential_integrity_gate,
    evaluate_post_mortem_structure_gate,
    evaluate_provenance_required_gate,
    generate_post_mortem_record,
    timeline_event,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

POST_MORTEM_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/post-mortem-record.schema.yaml"
PROV = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _valid_timeline():
    return [
        timeline_event("T-001", "2026-05-22T14:38:00+08:00", "change made without checking git log"),
        timeline_event("T-002", "2026-05-22T14:52:00+08:00", "conflict discovered"),
    ]


def _valid_causes():
    return [
        cause("C-001", "no pre-edit git log check", "T-001"),
        cause("C-002", "no mechanical gate existed yet", "T-002", source_analysis_ref="BARRIER-T-001"),
    ]


def _valid_actions():
    return [
        action("A-001", "codify git log rule in AGENTS.md", "operator"),
        action("A-002", "add git-log-injector.js gate", "operator"),
    ]


def _build(**overrides):
    kwargs = dict(
        record_id="POSTMORTEM-T-001",
        incident_name="test incident",
        timeline=_valid_timeline(),
        impact_description="some impact",
        causes=_valid_causes(),
        actions=_valid_actions(),
        provenance=PROV,
        version="1.0.0",
    )
    kwargs.update(overrides)
    return generate_post_mortem_record(
        kwargs["record_id"],
        kwargs["incident_name"],
        kwargs["timeline"],
        kwargs["impact_description"],
        kwargs["causes"],
        kwargs["actions"],
        kwargs["provenance"],
        version=kwargs["version"],
    )


class TimelineEventConstructorTests(unittest.TestCase):
    def test_valid_timeline_event_builds(self):
        entry = timeline_event("T-001", "2026-01-01T00:00:00Z", "something happened")
        self.assertEqual(entry, {"event_id": "T-001", "timestamp": "2026-01-01T00:00:00Z", "description": "something happened"})

    def test_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            timeline_event("001", "2026-01-01T00:00:00Z", "desc")

    def test_empty_event_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            timeline_event("", "2026-01-01T00:00:00Z", "desc")

    def test_whitespace_event_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            timeline_event("   ", "2026-01-01T00:00:00Z", "desc")

    def test_empty_timestamp_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            timeline_event("T-001", "", "desc")

    def test_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            timeline_event("T-001", "2026-01-01T00:00:00Z", "")

    def test_non_string_event_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            timeline_event(123, "2026-01-01T00:00:00Z", "desc")


class CauseConstructorTests(unittest.TestCase):
    def test_valid_cause_without_source_ref_builds(self):
        entry = cause("C-001", "systemic reason", "T-001")
        self.assertEqual(entry, {"cause_id": "C-001", "description": "systemic reason", "timeline_ref": "T-001"})
        self.assertNotIn("source_analysis_ref", entry)

    def test_valid_cause_with_source_ref_builds(self):
        entry = cause("C-001", "systemic reason", "T-001", source_analysis_ref="BARRIER-2026-01-01-001")
        self.assertEqual(entry["source_analysis_ref"], "BARRIER-2026-01-01-001")

    def test_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            cause("001", "desc", "T-001")

    def test_empty_cause_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            cause("", "desc", "T-001")

    def test_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            cause("C-001", "", "T-001")

    def test_empty_timeline_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            cause("C-001", "desc", "")

    def test_whitespace_timeline_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            cause("C-001", "desc", "   ")

    def test_empty_source_analysis_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            cause("C-001", "desc", "T-001", source_analysis_ref="")

    def test_whitespace_source_analysis_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            cause("C-001", "desc", "T-001", source_analysis_ref="   ")

    def test_none_source_analysis_ref_is_accepted_as_absent(self):
        entry = cause("C-001", "desc", "T-001", source_analysis_ref=None)
        self.assertNotIn("source_analysis_ref", entry)


class ActionConstructorTests(unittest.TestCase):
    def test_valid_action_builds(self):
        entry = action("A-001", "prevent recurrence", "ops_lead")
        self.assertEqual(entry, {"action_id": "A-001", "description": "prevent recurrence", "owner": "ops_lead"})

    def test_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_ACTIONS"):
            action("001", "desc", "owner")

    def test_empty_action_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_ACTIONS"):
            action("", "desc", "owner")

    def test_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_ACTIONS"):
            action("A-001", "", "owner")

    def test_empty_owner_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_UNOWNED_ACTION"):
            action("A-001", "desc", "")

    def test_whitespace_owner_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_UNOWNED_ACTION"):
            action("A-001", "desc", "   ")

    def test_non_string_owner_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_UNOWNED_ACTION"):
            action("A-001", "desc", None)  # type: ignore[arg-type]


class RecordLevelConstructionTests(unittest.TestCase):
    def test_missing_record_id_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_RECORD_ID"):
            _build(record_id="NOTPREFIXED-001")

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_empty_incident_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_EMPTY_RECORD_FIELD"):
            _build(incident_name="")

    def test_whitespace_incident_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_EMPTY_RECORD_FIELD"):
            _build(incident_name="   ")

    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_VERSION"):
            _build(version=1.0)  # type: ignore[arg-type]

    def test_empty_impact_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_IMPACT"):
            _build(impact_description="")

    def test_whitespace_impact_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_IMPACT"):
            _build(impact_description="   ")


class TimelineConstructionInvariantTests(unittest.TestCase):
    """Invariant #1 (NO-BLAME shape) for timeline[], and half of invariant #2 (must exist)."""

    def test_empty_timeline_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            _build(timeline=[])

    def test_non_list_timeline_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            _build(timeline="not-a-list")  # type: ignore[arg-type]

    def test_malformed_entry_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            _build(timeline=["not-a-dict"])

    def test_entry_with_extra_blame_field_is_refused(self):
        """The closed key set IS the no-blame mechanism -- an entry naming a responsible person is refused
        the same way a malformed/typo'd key would be."""
        tampered = timeline_event("T-001", "2026-01-01T00:00:00Z", "desc")
        tampered["responsible_person"] = "someone"
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            _build(timeline=[tampered])

    def test_entry_missing_a_required_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            _build(timeline=[{"event_id": "T-001", "description": "desc"}])  # missing timestamp

    def test_duplicate_event_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_TIMELINE"):
            _build(timeline=[timeline_event("T-001", "t1", "d1"), timeline_event("T-001", "t2", "d2")])

    def test_single_timeline_event_is_sufficient(self):
        record = _build(timeline=[timeline_event("T-001", "t1", "d1")], causes=[cause("C-001", "desc", "T-001")])
        self.assertEqual(len(record["timeline"]), 1)


class CausesConstructionInvariantTests(unittest.TestCase):
    """Invariant #1 (NO-BLAME shape) for causes[], and invariant #2 (referential integrity)."""

    def test_empty_causes_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            _build(causes=[])

    def test_non_list_causes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            _build(causes="not-a-list")  # type: ignore[arg-type]

    def test_malformed_entry_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            _build(causes=[42])

    def test_entry_with_extra_blame_field_is_refused(self):
        tampered = cause("C-001", "desc", "T-001")
        tampered["at_fault_individual"] = "someone"
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            _build(causes=[tampered])

    def test_entry_missing_a_required_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            _build(causes=[{"cause_id": "C-001", "description": "desc"}])  # missing timeline_ref

    def test_duplicate_cause_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_CAUSES"):
            _build(causes=[cause("C-001", "d1", "T-001"), cause("C-001", "d2", "T-002")])

    def test_dangling_timeline_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_DANGLING_CAUSE_REFERENCE"):
            _build(causes=[cause("C-001", "desc", "T-999")])

    def test_dangling_timeline_ref_among_valid_causes_is_still_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_DANGLING_CAUSE_REFERENCE"):
            _build(causes=[cause("C-001", "d1", "T-001"), cause("C-002", "d2", "T-999")])

    def test_single_cause_is_sufficient(self):
        record = _build(causes=[cause("C-001", "desc", "T-001")])
        self.assertEqual(len(record["causes"]), 1)

    def test_cause_with_source_analysis_ref_round_trips(self):
        record = _build(causes=[cause("C-001", "desc", "T-001", source_analysis_ref="FAULTTREE-2026-01-01-001")])
        self.assertEqual(record["causes"][0]["source_analysis_ref"], "FAULTTREE-2026-01-01-001")


class ActionsConstructionInvariantTests(unittest.TestCase):
    """Invariant #3 (ownership), shape separate from non-empty-owner."""

    def test_empty_actions_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_ACTIONS"):
            _build(actions=[])

    def test_non_list_actions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_ACTIONS"):
            _build(actions="not-a-list")  # type: ignore[arg-type]

    def test_malformed_entry_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_ACTIONS"):
            _build(actions=[None])

    def test_entry_with_extra_key_is_refused(self):
        tampered = action("A-001", "desc", "owner")
        tampered["due_date"] = "2026-12-31"
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_ACTIONS"):
            _build(actions=[tampered])

    def test_entry_missing_a_required_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_ACTIONS"):
            _build(actions=[{"action_id": "A-001", "description": "desc"}])  # missing owner

    def test_duplicate_action_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_INVALID_ACTIONS"):
            _build(actions=[action("A-001", "d1", "o1"), action("A-001", "d2", "o2")])

    def test_hand_tampered_empty_owner_is_refused_at_construction(self):
        """Bypasses the action() constructor's own owner check by building the dict directly -- proves
        generate_post_mortem_record itself, not just the convenience constructor, enforces invariant #3."""
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_UNOWNED_ACTION"):
            _build(actions=[{"action_id": "A-001", "description": "desc", "owner": ""}])

    def test_hand_tampered_whitespace_owner_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "POSTMORTEM_UNOWNED_ACTION"):
            _build(actions=[{"action_id": "A-001", "description": "desc", "owner": "   "}])

    def test_single_action_is_sufficient(self):
        record = _build(actions=[action("A-001", "desc", "owner")])
        self.assertEqual(len(record["actions"]), 1)


class HappyPathConstructionTests(unittest.TestCase):
    def test_valid_record_builds_with_expected_fields(self):
        record = _build()
        self.assertEqual(record["id"], "POSTMORTEM-T-001")
        self.assertEqual(record["generated_by_method"], METHOD_ID)
        self.assertEqual(len(record["timeline"]), 2)
        self.assertEqual(len(record["causes"]), 2)
        self.assertEqual(len(record["actions"]), 2)

    def test_default_version_is_1_0_0(self):
        record = generate_post_mortem_record(
            "POSTMORTEM-T-002", "incident", _valid_timeline(), "impact", _valid_causes(), _valid_actions(), PROV
        )
        self.assertEqual(record["version"], "1.0.0")

    def test_builder_rebuilds_nested_lists_not_aliases_caller_input(self):
        """REBUILDS every nested object it owns -- mutating the caller's own list after construction must
        not silently mutate the stored record."""
        timeline = _valid_timeline()
        record = _build(timeline=timeline)
        timeline.append(timeline_event("T-999", "t", "d"))
        self.assertEqual(len(record["timeline"]), 2)

    def test_no_blame_fields_absent_from_timeline_and_causes(self):
        record = _build()
        for entry in record["timeline"]:
            self.assertEqual(set(entry.keys()), {"event_id", "timestamp", "description"})
        for entry in record["causes"]:
            self.assertLessEqual(set(entry.keys()), {"cause_id", "description", "timeline_ref", "source_analysis_ref"})

    def test_actions_carry_owner_field(self):
        record = _build()
        for entry in record["actions"]:
            self.assertIn("owner", entry)
            self.assertTrue(entry["owner"])


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_post_mortem_record_validates_against_the_real_schema(self):
        self.contracts.validate(POST_MORTEM_RECORD_SCHEMA, _build(), "post-mortem record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_post_mortem_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_all_four_gates(self):
        results = evaluate_post_mortem_gates(_build(), "test", "2026-09-07T00:00:00Z")
        self.assertEqual(
            {r["gate_id"] for r in results},
            {"provenance_required", "post_mortem_structure", "post_mortem_referential_integrity", "post_mortem_action_ownership"},
        )
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        record = _build()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", "t")["status"], "FAIL")
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "PASS")
        self.assertEqual(evaluate_post_mortem_referential_integrity_gate(record, "test", "t")["status"], "PASS")
        self.assertEqual(evaluate_post_mortem_action_ownership_gate(record, "test", "t")["status"], "PASS")

    def test_hand_tampered_blame_field_on_timeline_fails_structure_gate_only(self):
        """Mutation-style: the structure gate re-checks structurally, it does not just trust that
        construction already ran (a hand-crafted/tampered record must still be caught)."""
        record = _build()
        record["timeline"][0] = {**record["timeline"][0], "who": "someone"}
        gate = evaluate_post_mortem_structure_gate(record, "test", "t")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("POSTMORTEM_INVALID_TIMELINE", gate["evidence"][0]["reason"])

    def test_hand_tampered_blame_field_on_causes_fails_structure_gate_only(self):
        record = _build()
        record["causes"][0] = {**record["causes"][0], "blamed_person": "someone"}
        gate = evaluate_post_mortem_structure_gate(record, "test", "t")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("POSTMORTEM_INVALID_CAUSES", gate["evidence"][0]["reason"])

    def test_hand_tampered_empty_timeline_fails_structure_and_referential_gates(self):
        """Bypasses the constructor entirely -- proves the gates, not just generate_post_mortem_record, are
        what actually enforce the invariant."""
        record = _build()
        record["timeline"] = []
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "FAIL")
        self.assertEqual(evaluate_post_mortem_referential_integrity_gate(record, "test", "t")["status"], "FAIL")
        # Ownership is untouched by this mutation -- stays independently diagnosable.
        self.assertEqual(evaluate_post_mortem_action_ownership_gate(record, "test", "t")["status"], "PASS")

    def test_hand_tampered_dangling_timeline_ref_fails_referential_integrity_gate_only(self):
        record = _build()
        record["causes"][0] = {**record["causes"][0], "timeline_ref": "T-DOES-NOT-EXIST"}
        gate = evaluate_post_mortem_referential_integrity_gate(record, "test", "t")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn(record["causes"][0]["cause_id"], gate["evidence"][0]["dangling_cause_ids"])
        # Structure (shape) is untouched by this mutation -- a real string timeline_ref is still well-shaped.
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "PASS")
        self.assertEqual(evaluate_post_mortem_action_ownership_gate(record, "test", "t")["status"], "PASS")

    def test_hand_tampered_empty_owner_fails_action_ownership_gate_only(self):
        record = _build()
        record["actions"][0] = {**record["actions"][0], "owner": "   "}
        gate = evaluate_post_mortem_action_ownership_gate(record, "test", "t")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn(record["actions"][0]["action_id"], gate["evidence"][0]["unowned_action_ids"])
        # Structure/referential integrity untouched by this mutation.
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "PASS")
        self.assertEqual(evaluate_post_mortem_referential_integrity_gate(record, "test", "t")["status"], "PASS")

    def test_one_unowned_action_among_several_is_individually_diagnosable(self):
        record = _build()
        record["actions"][0] = {**record["actions"][0], "owner": ""}
        gate = evaluate_post_mortem_action_ownership_gate(record, "test", "t")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(len(gate["evidence"][0]["unowned_action_ids"]), 1)

    def test_malformed_record_not_a_dict_fails_closed_on_every_gate(self):
        for malformed in (None, [], "not-a-dict", 42):
            for gate_fn in (
                evaluate_provenance_required_gate,
                evaluate_post_mortem_structure_gate,
                evaluate_post_mortem_referential_integrity_gate,
                evaluate_post_mortem_action_ownership_gate,
            ):
                gate = gate_fn(malformed, "test", "t")
                self.assertEqual(gate["status"], "FAIL", f"{gate_fn.__name__} did not fail closed on {malformed!r}")

    def test_malformed_timeline_entries_fail_closed_not_a_crash(self):
        record = _build()
        record["timeline"] = ["not-a-dict", 42, None]
        for gate_fn in (evaluate_post_mortem_structure_gate, evaluate_post_mortem_referential_integrity_gate):
            self.assertEqual(gate_fn(record, "test", "t")["status"], "FAIL")

    def test_malformed_causes_entries_fail_closed_not_a_crash(self):
        record = _build()
        record["causes"] = ["not-a-dict", 42, None]
        for gate_fn in (evaluate_post_mortem_structure_gate, evaluate_post_mortem_referential_integrity_gate):
            self.assertEqual(gate_fn(record, "test", "t")["status"], "FAIL")

    def test_malformed_actions_entries_fail_closed_not_a_crash(self):
        record = _build()
        record["actions"] = ["not-a-dict", 42, None]
        for gate_fn in (evaluate_post_mortem_structure_gate, evaluate_post_mortem_action_ownership_gate):
            self.assertEqual(gate_fn(record, "test", "t")["status"], "FAIL")

    def test_missing_timeline_key_entirely_fails_closed(self):
        record = _build()
        del record["timeline"]
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "FAIL")
        self.assertEqual(evaluate_post_mortem_referential_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_missing_causes_key_entirely_fails_closed(self):
        record = _build()
        del record["causes"]
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "FAIL")
        self.assertEqual(evaluate_post_mortem_referential_integrity_gate(record, "test", "t")["status"], "FAIL")

    def test_missing_actions_key_entirely_fails_closed(self):
        record = _build()
        del record["actions"]
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "FAIL")
        self.assertEqual(evaluate_post_mortem_action_ownership_gate(record, "test", "t")["status"], "FAIL")

    def test_missing_id_fails_structure_gate(self):
        record = _build()
        del record["id"]
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_wrong_prefix_id_fails_structure_gate(self):
        record = _build()
        record["id"] = "WRONG-001"
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_non_string_version_fails_structure_gate(self):
        record = _build()
        record["version"] = 1
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_empty_incident_name_fails_structure_gate(self):
        record = _build()
        record["incident_name"] = ""
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_empty_impact_description_fails_structure_gate(self):
        record = _build()
        record["impact_description"] = "   "
        self.assertEqual(evaluate_post_mortem_structure_gate(record, "test", "t")["status"], "FAIL")

    def test_gate_evidence_reports_counts_on_success(self):
        record = _build()
        gate = evaluate_post_mortem_structure_gate(record, "test", "t")
        self.assertEqual(gate["evidence"][0]["timeline_count"], 2)
        self.assertEqual(gate["evidence"][0]["cause_count"], 2)
        self.assertEqual(gate["evidence"][0]["action_count"], 2)

    def test_referential_integrity_gate_reports_no_dangling_ids_on_success(self):
        record = _build()
        gate = evaluate_post_mortem_referential_integrity_gate(record, "test", "t")
        self.assertEqual(gate["evidence"][0]["dangling_cause_ids"], [])

    def test_action_ownership_gate_reports_no_unowned_ids_on_success(self):
        record = _build()
        gate = evaluate_post_mortem_action_ownership_gate(record, "test", "t")
        self.assertEqual(gate["evidence"][0]["unowned_action_ids"], [])


if __name__ == "__main__":
    unittest.main()
