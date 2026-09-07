"""Mutation-style tests for ``learning.decision_journal`` (ninth Method Atlas slice, second member of the
`learning` family, F17, after `learning.reversal_criteria`). Two-layer discipline proven for BOTH headline
invariants:

1. Genuine decision (``DECISIONJOURNAL_OPTIONS_INVARIANT_VIOLATED``, plus its own shape code
   ``DECISIONJOURNAL_INVALID_OPTIONS``) -- >= 2 options, unique ids, exactly one ``chosen``.
2. Hindsight-bias structural immutability (``DECISIONJOURNAL_STAGE1_HASH_MISMATCH`` /
   ``DECISIONJOURNAL_OUTCOME_ALREADY_RECORDED`` at construction; re-derived independently by
   ``evaluate_hindsight_bias_integrity_gate``) -- stage-1 fields (context/options/evidence/forecast/
   confidence) become tamper-evident the moment an entry is built, and stay that way whether or not an
   outcome is ever attached; the outcome, once attached, gets the same treatment via its own hash.

Each is checked at CONSTRUCTION (raises before a malformed/tampered record is ever built or extended) and
independently RE-DERIVED at the GATE (a hand-tampered copy of an already-valid record -- built by direct
dict mutation, never through ``generate_decision_journal_entry``/``record_outcome`` -- must still be caught;
the gate never trusts a stored value)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.core.support import sha256_json
from ai_lego.errors import InvariantViolation
from ai_lego.modules.learning.decision_journal import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_decision_journal_gates,
    evaluate_evidence_labeling_required_gate,
    evaluate_hindsight_bias_integrity_gate,
    evaluate_options_integrity_gate,
    evaluate_provenance_required_gate,
    evidence_item,
    generate_decision_journal_entry,
    option,
    record_outcome,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

ENTRY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/decision-journal-entry.schema.yaml"
TS = "2026-09-07T00:00:00Z"


def _prov(epistemic_type="DECISION", authorship_state="HUMAN_APPROVED", locked=None):
    return make_provenance(epistemic_type, authorship_state, locked)


def _options():
    return [option("OPT-A", "alternative A", False), option("OPT-B", "chosen B", True)]


def _evidence():
    return [
        evidence_item("EV-1", "a fact known at decision time", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), source="test fixture"),
        evidence_item("EV-2", "an assumption made at decision time", _prov("ASSUMPTION", "HUMAN_ORIGINAL")),
    ]


def _build(
    entry_id="DJ-T-001",
    context="a decision context",
    options=None,
    evidence=None,
    forecast="a forecast",
    confidence=70,
    provenance=None,
    **kwargs,
):
    return generate_decision_journal_entry(
        entry_id,
        context,
        _options() if options is None else options,
        _evidence() if evidence is None else evidence,
        forecast,
        confidence,
        _prov() if provenance is None else provenance,
        **kwargs,
    )


def _valid_entry():
    return _build()


def _completed_entry():
    return record_outcome(_valid_entry(), "what actually happened", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")


class ConstructionHappyPathTests(unittest.TestCase):
    """Real construction, various legal shapes -- not just 'does it run'."""

    def test_minimal_entry_constructs(self):
        entry = _valid_entry()
        self.assertEqual(entry["id"], "DJ-T-001")
        self.assertEqual(entry["context"], "a decision context")
        self.assertEqual(len(entry["options"]), 2)

    def test_entry_has_outcome_none_initially(self):
        self.assertIsNone(_valid_entry()["outcome"])

    def test_entry_has_a_nonempty_stage1_integrity_hash(self):
        entry = _valid_entry()
        self.assertIsInstance(entry["stage1_integrity_hash"], str)
        self.assertEqual(len(entry["stage1_integrity_hash"]), 64)

    def test_stage1_hash_is_a_real_sha256_over_exactly_the_five_atlas_fields(self):
        entry = _valid_entry()
        expected = sha256_json({"context": entry["context"], "options": entry["options"], "evidence": entry["evidence"], "forecast": entry["forecast"], "confidence": entry["confidence"]})
        self.assertEqual(entry["stage1_integrity_hash"], expected)

    def test_stage1_hash_does_not_cover_id_version_or_decision_ref(self):
        """Disclosed scope: two entries differing only in id/version/decision_ref hash identically."""
        entry_a = _build(entry_id="DJ-T-100A", decision_ref="DEC-1")
        entry_b = _build(entry_id="DJ-T-100B", decision_ref="DEC-2")
        self.assertEqual(entry_a["stage1_integrity_hash"], entry_b["stage1_integrity_hash"])

    def test_decision_ref_defaults_to_none(self):
        self.assertIsNone(_valid_entry()["decision_ref"])

    def test_decision_ref_can_be_supplied(self):
        entry = _build(decision_ref="DEC-2026-09-07-001")
        self.assertEqual(entry["decision_ref"], "DEC-2026-09-07-001")

    def test_empty_string_decision_ref_is_legal_but_unusual(self):
        """Documents actual behavior: decision_ref has no non-empty floor, unlike context/forecast."""
        entry = _build(decision_ref="")
        self.assertEqual(entry["decision_ref"], "")

    def test_evidence_can_be_empty_list(self):
        """KEY disclosed divergence from every sibling list field in this package -- see module docstring."""
        entry = _build(evidence=[])
        self.assertEqual(entry["evidence"], [])

    def test_evidence_with_multiple_items(self):
        entry = _build(evidence=_evidence() + [evidence_item("EV-3", "a third item", _prov("HYPOTHESIS", "AI_GENERATED"))])
        self.assertEqual(len(entry["evidence"]), 3)

    def test_generated_by_method_defaults_to_method_id(self):
        self.assertEqual(_valid_entry()["generated_by_method"], METHOD_ID)

    def test_builder_round_trips_generated_by_method_and_version(self):
        entry = _build(version="2.3.4", generated_by_method="learning.decision_journal@test")
        self.assertEqual(entry["version"], "2.3.4")
        self.assertEqual(entry["generated_by_method"], "learning.decision_journal@test")

    def test_confidence_boundary_zero_is_legal(self):
        self.assertEqual(_build(confidence=0)["confidence"], 0)

    def test_confidence_boundary_hundred_is_legal(self):
        self.assertEqual(_build(confidence=100)["confidence"], 100)

    def test_confidence_float_is_legal(self):
        self.assertEqual(_build(confidence=62.5)["confidence"], 62.5)

    def test_three_options_with_exactly_one_chosen_is_legal(self):
        opts = [option("OPT-A", "a", False), option("OPT-B", "b", True), option("OPT-C", "c", False)]
        entry = _build(options=opts)
        self.assertEqual(len(entry["options"]), 3)


class OptionsInvariantConstructionTests(unittest.TestCase):
    """Invariant #1 (genuine decision): checked at construction, before any record is ever built."""

    def test_single_option_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_OPTIONS_INVARIANT_VIOLATED"):
            _build(options=[option("OPT-A", "only one", True)])

    def test_zero_options_is_refused(self):
        """An empty list vacuously passes the shape check (all() over an empty iterable is True) and is
        correctly caught downstream by the count invariant instead -- DECISIONJOURNAL_OPTIONS_INVARIANT_VIOLATED,
        not DECISIONJOURNAL_INVALID_OPTIONS (that code is reserved for a genuinely malformed list/items)."""
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_OPTIONS_INVARIANT_VIOLATED"):
            _build(options=[])

    def test_exactly_two_options_is_legal_boundary(self):
        entry = _build(options=_options())
        self.assertEqual(len(entry["options"]), 2)

    def test_duplicate_option_ids_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_OPTIONS_INVARIANT_VIOLATED"):
            _build(options=[option("OPT-A", "a", False), option("OPT-A", "b", True)])

    def test_zero_chosen_options_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_OPTIONS_INVARIANT_VIOLATED"):
            _build(options=[option("OPT-A", "a", False), option("OPT-B", "b", False)])

    def test_two_chosen_options_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_OPTIONS_INVARIANT_VIOLATED"):
            _build(options=[option("OPT-A", "a", True), option("OPT-B", "b", True)])

    def test_three_options_two_chosen_refused(self):
        opts = [option("OPT-A", "a", True), option("OPT-B", "b", True), option("OPT-C", "c", False)]
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_OPTIONS_INVARIANT_VIOLATED"):
            _build(options=opts)

    def test_malformed_option_missing_key_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_OPTIONS"):
            _build(options=[{"id": "OPT-A", "description": "a"}, option("OPT-B", "b", True)])

    def test_option_with_extra_key_refused(self):
        bad = {"id": "OPT-A", "description": "a", "chosen": False, "unexpected": 1}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_OPTIONS"):
            _build(options=[bad, option("OPT-B", "b", True)])

    def test_option_non_dict_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_OPTIONS"):
            _build(options=["not-a-dict", option("OPT-B", "b", True)])

    def test_options_non_list_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_OPTIONS"):
            _build(options={"OPT-A": True})

    def test_option_chosen_wrong_type_refused(self):
        bad = {"id": "OPT-A", "description": "a", "chosen": "true"}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_OPTIONS"):
            _build(options=[bad, option("OPT-B", "b", True)])

    def test_option_empty_id_in_hand_built_dict_refused(self):
        bad = {"id": "", "description": "a", "chosen": False}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_OPTIONS"):
            _build(options=[bad, option("OPT-B", "b", True)])


class Stage1FieldValidationTests(unittest.TestCase):
    """Every other stage-1 field's own fail-closed validation at construction."""

    def test_empty_entry_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_ENTRY_ID"):
            _build(entry_id="")

    def test_entry_id_without_dj_prefix_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_ENTRY_ID"):
            _build(entry_id="RCS-T-001")

    def test_non_string_entry_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_ENTRY_ID"):
            _build(entry_id=123)

    def test_empty_context_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_EMPTY_CONTEXT"):
            _build(context="")

    def test_whitespace_only_context_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_EMPTY_CONTEXT"):
            _build(context="   ")

    def test_non_string_version_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_VERSION"):
            _build(version=1)

    def test_invalid_decision_ref_type_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_DECISION_REF"):
            _build(decision_ref=123)

    def test_evidence_non_list_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_EVIDENCE"):
            _build(evidence={"EV-1": "x"})

    def test_evidence_item_missing_content_refused(self):
        bad = {"id": "EV-1", "provenance": _prov()}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_EVIDENCE"):
            _build(evidence=[bad])

    def test_evidence_item_extra_key_refused(self):
        bad = {"id": "EV-1", "content": "x", "provenance": _prov(), "unexpected": 1}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_EVIDENCE"):
            _build(evidence=[bad])

    def test_evidence_item_source_wrong_type_refused(self):
        bad = {"id": "EV-1", "content": "x", "provenance": _prov(), "source": 42}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_EVIDENCE"):
            _build(evidence=[bad])

    def test_evidence_item_non_dict_provenance_refused_not_crashed(self):
        """Regression guard: a non-dict (here, non-JSON-serializable) provenance on an evidence item used
        to crash generate_decision_journal_entry with a raw json.dumps TypeError instead of raising a clean
        InvariantViolation, because _evidence_shape_is_valid never inspected provenance's own type before
        this fix -- found via direct reproduction during this session's own R0 bug hunt, fixed by adding an
        isinstance(item["provenance"], dict) check to _evidence_shape_is_valid."""
        bad = {"id": "EV-1", "content": "x", "provenance": {1, 2, 3}}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_EVIDENCE"):
            _build(evidence=[bad])

    def test_evidence_item_string_provenance_refused(self):
        bad = {"id": "EV-1", "content": "x", "provenance": "DECISION"}
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_EVIDENCE"):
            _build(evidence=[bad])

    def test_empty_forecast_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_EMPTY_FORECAST"):
            _build(forecast="")

    def test_invalid_confidence_negative_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_CONFIDENCE"):
            _build(confidence=-0.1)

    def test_invalid_confidence_above_100_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_CONFIDENCE"):
            _build(confidence=100.1)

    def test_invalid_confidence_boolean_refused_not_silently_accepted(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_CONFIDENCE"):
            _build(confidence=True)

    def test_invalid_confidence_nan_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_CONFIDENCE"):
            _build(confidence=float("nan"))

    def test_invalid_confidence_infinite_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_CONFIDENCE"):
            _build(confidence=float("inf"))

    def test_invalid_confidence_string_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_CONFIDENCE"):
            _build(confidence="70")

    def test_invalid_confidence_none_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_CONFIDENCE"):
            _build(confidence=None)

    def test_invalid_provenance_missing_epistemic_type_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_PROVENANCE"):
            _build(provenance={"authorship_state": "HUMAN_APPROVED"})

    def test_invalid_provenance_bad_epistemic_type_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_PROVENANCE"):
            _build(provenance={"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"})

    def test_invalid_provenance_locked_epistemic_mismatch_refused(self):
        """locked=LOCKED_DECISION is only legal when epistemic_type == DECISION (epistemic-label.schema.yaml)."""
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_PROVENANCE"):
            _build(provenance={"epistemic_type": "HUMAN_OPINION", "authorship_state": "HUMAN_APPROVED", "locked": "LOCKED_DECISION"})

    def test_invalid_provenance_non_dict_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_PROVENANCE"):
            _build(provenance="DECISION")


class ConvenienceConstructorTests(unittest.TestCase):
    """option()/evidence_item() are convenience only -- generate_decision_journal_entry re-validates
    whatever it is handed regardless of how it was built (see ConstructionHappyPathTests /
    OptionsInvariantConstructionTests, which hand-build dicts directly)."""

    def test_option_happy_path(self):
        self.assertEqual(option("OPT-A", "desc", True), {"id": "OPT-A", "description": "desc", "chosen": True})

    def test_option_empty_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_EMPTY_OPTION_FIELD"):
            option("", "desc", True)

    def test_option_empty_description_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_EMPTY_OPTION_FIELD"):
            option("OPT-A", "", True)

    def test_option_chosen_non_bool_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_CHOSEN_FLAG"):
            option("OPT-A", "desc", 1)

    def test_evidence_item_happy_path_without_source(self):
        item = evidence_item("EV-1", "content", _prov())
        self.assertNotIn("source", item)

    def test_evidence_item_happy_path_with_source(self):
        item = evidence_item("EV-1", "content", _prov(), source="a source")
        self.assertEqual(item["source"], "a source")

    def test_evidence_item_empty_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_EMPTY_EVIDENCE_FIELD"):
            evidence_item("", "content", _prov())

    def test_evidence_item_empty_content_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_EMPTY_EVIDENCE_FIELD"):
            evidence_item("EV-1", "", _prov())


class RecordOutcomeConstructionTests(unittest.TestCase):
    """Invariant #2 (hindsight-bias immutability), STAGE-2 half: checked at construction, before an outcome
    is ever attached to a record."""

    def test_happy_path_attaches_outcome(self):
        completed = _completed_entry()
        self.assertEqual(completed["outcome"]["actual_result"], "what actually happened")

    def test_outcome_has_its_own_nonempty_integrity_hash(self):
        outcome = _completed_entry()["outcome"]
        self.assertIsInstance(outcome["outcome_integrity_hash"], str)
        self.assertEqual(len(outcome["outcome_integrity_hash"]), 64)

    def test_outcome_hash_is_a_real_sha256_over_actual_result_and_recorded_at(self):
        outcome = _completed_entry()["outcome"]
        expected = sha256_json({"actual_result": outcome["actual_result"], "recorded_at": outcome["recorded_at"]})
        self.assertEqual(outcome["outcome_integrity_hash"], expected)

    def test_stage1_fields_copied_forward_verbatim_not_re_derivable_from_record_outcomes_own_arguments(self):
        """record_outcome has no parameter for context/options/evidence/forecast/confidence -- the returned
        record's own values for them can only be what the input entry already had."""
        entry = _valid_entry()
        completed = record_outcome(entry, "result", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")
        self.assertEqual(completed["context"], entry["context"])
        self.assertEqual(completed["options"], entry["options"])
        self.assertEqual(completed["evidence"], entry["evidence"])
        self.assertEqual(completed["forecast"], entry["forecast"])
        self.assertEqual(completed["confidence"], entry["confidence"])
        self.assertEqual(completed["stage1_integrity_hash"], entry["stage1_integrity_hash"])

    def test_record_outcome_rebuilds_not_aliases_options_and_evidence(self):
        entry = _valid_entry()
        completed = record_outcome(entry, "result", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")
        entry["options"][0]["description"] = "mutated after the fact"
        entry["evidence"][0]["content"] = "mutated after the fact"
        self.assertNotEqual(completed["options"][0]["description"], "mutated after the fact")
        self.assertNotEqual(completed["evidence"][0]["content"], "mutated after the fact")

    def test_double_recording_refused(self):
        completed = _completed_entry()
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_OUTCOME_ALREADY_RECORDED"):
            record_outcome(completed, "a second, revised outcome", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-11-01T00:00:00Z")

    def test_tampered_entry_before_record_outcome_is_refused_not_silently_built_on(self):
        """THE core hindsight-bias construction-time check: an entry hand-edited after construction (before
        any outcome exists) must be refused, not silently accepted as a foundation for an outcome."""
        entry = _valid_entry()
        entry["confidence"] = 99  # still a structurally valid confidence value -- only the HASH now disagrees
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_STAGE1_HASH_MISMATCH"):
            record_outcome(entry, "result", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")

    def test_tampered_context_before_record_outcome_is_refused(self):
        entry = _valid_entry()
        entry["context"] = "a rewritten context"
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_STAGE1_HASH_MISMATCH"):
            record_outcome(entry, "result", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")

    def test_tampered_options_before_record_outcome_is_refused(self):
        entry = _valid_entry()
        entry["options"][0]["description"] = "quietly rewritten"
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_STAGE1_HASH_MISMATCH"):
            record_outcome(entry, "result", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")

    def test_entry_non_dict_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_ENTRY"):
            record_outcome("not-a-dict", "result", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")

    def test_entry_missing_keys_refused(self):
        entry = _valid_entry()
        del entry["stage1_integrity_hash"]
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_ENTRY"):
            record_outcome(entry, "result", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")

    def test_entry_with_extra_unknown_key_refused(self):
        entry = _valid_entry()
        entry["unexpected"] = "injected"
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_ENTRY"):
            record_outcome(entry, "result", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")

    def test_entry_with_options_invariant_broken_by_hand_is_refused_before_hash_check(self):
        entry = _valid_entry()
        entry["options"] = [entry["options"][0]]  # deleted the alternative -- back to a single option
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_STAGE1_INVALID"):
            record_outcome(entry, "result", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")

    def test_empty_actual_result_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_EMPTY_ACTUAL_RESULT"):
            record_outcome(_valid_entry(), "", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "2026-10-01T00:00:00Z")

    def test_empty_recorded_at_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_EMPTY_RECORDED_AT"):
            record_outcome(_valid_entry(), "result", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), "")

    def test_invalid_outcome_provenance_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DECISIONJOURNAL_INVALID_OUTCOME_PROVENANCE"):
            record_outcome(_valid_entry(), "result", {"epistemic_type": "NOT_REAL"}, "2026-10-01T00:00:00Z")


class HindsightBiasTamperGateTests(unittest.TestCase):
    """Invariant #2, GATE half: hand-tampered records that never went through record_outcome (or that were
    tampered again AFTER a legitimate record_outcome call) must still be caught -- these are exactly the
    'caught only by the independent gate' cases R0 requires: they cannot be produced through the real API,
    only by direct dict mutation bypassing it entirely."""

    def _gate(self, record):
        return evaluate_hindsight_bias_integrity_gate(record, "test", TS)

    def test_valid_stage1_only_entry_passes(self):
        self.assertEqual(self._gate(_valid_entry())["status"], "PASS")

    def test_completed_entry_passes(self):
        self.assertEqual(self._gate(_completed_entry())["status"], "PASS")

    def test_hand_tampered_confidence_on_stage1_only_entry_fails(self):
        """No record_outcome call anywhere -- pure hand-tamper of a stage-1-only entry."""
        entry = _valid_entry()
        entry["confidence"] = 99
        result = self._gate(entry)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["stage1_hash_match"])

    def test_hand_tampered_context_on_stage1_only_entry_fails(self):
        entry = _valid_entry()
        entry["context"] = "rewritten"
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_hand_tampered_forecast_on_stage1_only_entry_fails(self):
        entry = _valid_entry()
        entry["forecast"] = "rewritten"
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_hand_tampered_options_on_stage1_only_entry_fails(self):
        entry = _valid_entry()
        entry["options"][1]["description"] = "rewritten"
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_hand_tampered_evidence_on_stage1_only_entry_fails(self):
        entry = _valid_entry()
        entry["evidence"][0]["content"] = "rewritten"
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_hand_tampered_confidence_after_outcome_attached_fails(self):
        """THE headline scenario: outcome is already known, and someone bumps their stated confidence up to
        look better in hindsight. record_outcome was never called again -- pure hand-tamper of the
        completed record."""
        completed = _completed_entry()
        completed["confidence"] = 95
        result = self._gate(completed)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["stage1_hash_match"])

    def test_hand_tampered_outcome_actual_result_fails(self):
        """Second-order tamper: editing the RECORDED OUTCOME itself after the fact to flatter the original
        forecast -- caught by outcome_integrity_hash, independent of stage1_hash_match."""
        completed = _completed_entry()
        completed["outcome"]["actual_result"] = "actually it worked perfectly"
        result = self._gate(completed)
        self.assertEqual(result["status"], "FAIL")
        self.assertTrue(result["evidence"][0]["stage1_hash_match"])
        self.assertFalse(result["evidence"][0]["outcome_hash_match"])

    def test_hand_tampered_outcome_recorded_at_fails(self):
        completed = _completed_entry()
        completed["outcome"]["recorded_at"] = "2026-09-08T00:00:00Z"  # backdated to hide how long hindsight had to creep in
        result = self._gate(completed)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["outcome_hash_match"])

    def test_both_stage1_and_outcome_tampered_simultaneously_fails_on_both(self):
        completed = _completed_entry()
        completed["confidence"] = 95
        completed["outcome"]["actual_result"] = "rewritten"
        result = self._gate(completed)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["stage1_hash_match"])
        self.assertFalse(result["evidence"][0]["outcome_hash_match"])

    def test_missing_stage1_integrity_hash_fails_closed(self):
        entry = _valid_entry()
        entry["stage1_integrity_hash"] = ""
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_stage1_integrity_hash_not_a_string_fails_closed(self):
        entry = _valid_entry()
        entry["stage1_integrity_hash"] = None
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_missing_outcome_integrity_hash_fails_closed(self):
        completed = _completed_entry()
        completed["outcome"]["outcome_integrity_hash"] = ""
        self.assertEqual(self._gate(completed)["status"], "FAIL")

    def test_malformed_outcome_extra_key_fails_closed(self):
        completed = _completed_entry()
        completed["outcome"]["unexpected"] = 1
        self.assertEqual(self._gate(completed)["status"], "FAIL")

    def test_malformed_outcome_missing_key_fails_closed(self):
        completed = _completed_entry()
        del completed["outcome"]["recorded_at"]
        self.assertEqual(self._gate(completed)["status"], "FAIL")

    def test_outcome_non_dict_fails_closed(self):
        completed = _completed_entry()
        completed["outcome"] = "not-a-dict"
        self.assertEqual(self._gate(completed)["status"], "FAIL")

    def test_record_non_dict_fails_closed(self):
        self.assertEqual(self._gate("not-a-dict")["status"], "FAIL")

    def test_record_none_fails_closed(self):
        self.assertEqual(self._gate(None)["status"], "FAIL")

    def test_empty_dict_fails_closed(self):
        self.assertEqual(self._gate({})["status"], "FAIL")

    def test_hand_tampered_non_serializable_confidence_fails_closed_not_crashes(self):
        """Regression guard: a hand-tampered field that is not JSON-serializable at all (e.g. a Python set
        poked directly into record["confidence"], bypassing every real constructor) used to crash this gate
        with a raw json.dumps TypeError instead of returning FAIL, because the gate hashed raw fields with
        no shape pre-check (unlike the constructors, which reject non-dict-shaped content before ever
        reaching the hash). Found via direct reproduction during this session's own R0 bug hunt, fixed by
        _safe_compute_hash wrapping the gate's own hash re-derivation."""
        entry = _valid_entry()
        entry["confidence"] = {1, 2, 3}
        result = self._gate(entry)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["stage1_hash_match"])

    def test_hand_tampered_non_serializable_outcome_field_fails_closed_not_crashes(self):
        completed = _completed_entry()
        completed["outcome"]["actual_result"] = {1, 2, 3}
        result = self._gate(completed)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["outcome_hash_match"])

    def test_hand_tampered_nested_non_serializable_evidence_provenance_fails_closed_not_crashes(self):
        """Deeper case than the two tests above: the non-serializable value is nested two levels down
        (inside one evidence item's own provenance dict, itself nested inside the hashed `evidence` field),
        not a direct top-level field replacement. Critic verified this live (2026-09-07) and confirmed
        _safe_compute_hash's construction-time try/except genuinely covers it; this test makes that
        previously-implicit coverage explicit rather than leaving it demonstrated only in a review
        transcript."""
        entry = _valid_entry()
        entry["evidence"][0]["provenance"]["unserializable_extra"] = {1, 2, 3}
        result = self._gate(entry)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["stage1_hash_match"])


class OptionsIntegrityGateTests(unittest.TestCase):
    """Invariant #1, GATE half: re-derived independently from raw options, catching a hand-tampered record
    that never went through generate_decision_journal_entry at all."""

    def _gate(self, record):
        return evaluate_options_integrity_gate(record, "test", TS)

    def test_valid_entry_passes(self):
        self.assertEqual(self._gate(_valid_entry())["status"], "PASS")

    def test_hand_deleted_alternative_option_fails(self):
        entry = _valid_entry()
        entry["options"] = [entry["options"][1]]  # only the chosen one survives
        result = self._gate(entry)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["option_count"], 1)

    def test_hand_duplicated_option_id_fails(self):
        entry = _valid_entry()
        entry["options"][0]["id"] = entry["options"][1]["id"]
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_hand_flipped_to_zero_chosen_fails(self):
        entry = _valid_entry()
        entry["options"][1]["chosen"] = False
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_hand_flipped_to_two_chosen_fails(self):
        entry = _valid_entry()
        entry["options"][0]["chosen"] = True
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_hand_tampered_malformed_option_fails_closed(self):
        entry = _valid_entry()
        entry["options"][0] = {"id": "OPT-A"}  # missing description/chosen
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_options_non_list_fails_closed(self):
        entry = _valid_entry()
        entry["options"] = "not-a-list"
        self.assertEqual(self._gate(entry)["status"], "FAIL")

    def test_record_non_dict_fails_closed(self):
        self.assertEqual(self._gate("not-a-dict")["status"], "FAIL")

    def test_tampering_options_fails_both_options_integrity_and_hindsight_bias_gates(self):
        """The two gates are independent but consistent: an options tamper trips both, for different,
        distinguishable reasons (structural invariant vs content-hash mismatch)."""
        entry = _valid_entry()
        entry["options"] = [entry["options"][1]]
        self.assertEqual(evaluate_options_integrity_gate(entry, "test", TS)["status"], "FAIL")
        self.assertEqual(evaluate_hindsight_bias_integrity_gate(entry, "test", TS)["status"], "FAIL")


class ProvenanceAndEvidenceLabelingGateTests(unittest.TestCase):
    def test_valid_entry_passes_provenance_required_gate(self):
        self.assertEqual(evaluate_provenance_required_gate(_valid_entry(), "test", TS)["status"], "PASS")

    def test_completed_entry_passes_provenance_required_gate(self):
        self.assertEqual(evaluate_provenance_required_gate(_completed_entry(), "test", TS)["status"], "PASS")

    def test_hand_tampered_top_level_provenance_fails(self):
        entry = _valid_entry()
        entry["provenance"] = {"epistemic_type": "NOT_REAL"}
        self.assertEqual(evaluate_provenance_required_gate(entry, "test", TS)["status"], "FAIL")

    def test_hand_tampered_evidence_provenance_fails(self):
        entry = _valid_entry()
        entry["evidence"][0]["provenance"] = {"epistemic_type": "NOT_REAL"}
        self.assertEqual(evaluate_provenance_required_gate(entry, "test", TS)["status"], "FAIL")

    def test_hand_tampered_outcome_provenance_fails(self):
        completed = _completed_entry()
        completed["outcome"]["provenance"] = {"epistemic_type": "NOT_REAL"}
        self.assertEqual(evaluate_provenance_required_gate(completed, "test", TS)["status"], "FAIL")

    def test_provenance_gate_record_non_dict_fails_closed(self):
        self.assertEqual(evaluate_provenance_required_gate("not-a-dict", "test", TS)["status"], "FAIL")

    def test_evidence_labeling_empty_evidence_passes_vacuously(self):
        """Consistent with evidence being a legally empty list -- nothing to mislabel."""
        entry = _build(evidence=[])
        self.assertEqual(evaluate_evidence_labeling_required_gate(entry, "test", TS)["status"], "PASS")

    def test_evidence_labeling_source_fact_without_source_fails(self):
        bad_item = {"id": "EV-1", "content": "x", "provenance": _prov("SOURCE_FACT", "HUMAN_ORIGINAL")}
        entry = _build(evidence=[bad_item])
        result = evaluate_evidence_labeling_required_gate(entry, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("labeled SOURCE_FACT but names no source", result["evidence"][0]["problems"][0]["reason"])

    def test_evidence_labeling_source_fact_with_source_passes(self):
        item = evidence_item("EV-1", "x", _prov("SOURCE_FACT", "HUMAN_ORIGINAL"), source="a named source")
        entry = _build(evidence=[item])
        self.assertEqual(evaluate_evidence_labeling_required_gate(entry, "test", TS)["status"], "PASS")

    def test_evidence_labeling_non_source_fact_without_source_passes(self):
        item = evidence_item("EV-1", "x", _prov("ASSUMPTION", "HUMAN_ORIGINAL"))
        entry = _build(evidence=[item])
        self.assertEqual(evaluate_evidence_labeling_required_gate(entry, "test", TS)["status"], "PASS")

    def test_evidence_labeling_missing_epistemic_type_fails(self):
        entry = _valid_entry()
        del entry["evidence"][0]["provenance"]["epistemic_type"]
        self.assertEqual(evaluate_evidence_labeling_required_gate(entry, "test", TS)["status"], "FAIL")

    def test_evidence_labeling_invalid_epistemic_type_fails(self):
        entry = _valid_entry()
        entry["evidence"][0]["provenance"]["epistemic_type"] = "NOT_REAL"
        self.assertEqual(evaluate_evidence_labeling_required_gate(entry, "test", TS)["status"], "FAIL")

    def test_evidence_labeling_non_dict_item_fails(self):
        entry = _valid_entry()
        entry["evidence"].append("not-a-dict")
        self.assertEqual(evaluate_evidence_labeling_required_gate(entry, "test", TS)["status"], "FAIL")

    def test_evidence_labeling_evidence_non_list_fails_closed(self):
        entry = _valid_entry()
        entry["evidence"] = "not-a-list"
        self.assertEqual(evaluate_evidence_labeling_required_gate(entry, "test", TS)["status"], "FAIL")

    def test_evidence_labeling_record_non_dict_fails_closed(self):
        self.assertEqual(evaluate_evidence_labeling_required_gate("not-a-dict", "test", TS)["status"], "FAIL")


class AllGatesAndAggregateTests(unittest.TestCase):
    def test_valid_stage1_entry_passes_all_four_gates(self):
        results = evaluate_decision_journal_gates(_valid_entry(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "evidence_labeling_required", "options_integrity", "hindsight_bias_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_completed_entry_passes_all_four_gates(self):
        self.assertTrue(all_gates_pass(evaluate_decision_journal_gates(_completed_entry(), "test", TS)))

    def test_all_gates_pass_returns_false_when_one_gate_fails(self):
        entry = _valid_entry()
        entry["confidence"] = 99  # breaks hindsight_bias_integrity only
        self.assertFalse(all_gates_pass(evaluate_decision_journal_gates(entry, "test", TS)))

    def test_all_gates_pass_true_for_not_applicable_status(self):
        self.assertTrue(all_gates_pass([{"gate_id": "x", "status": "NOT_APPLICABLE"}]))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_minimal_stage1_entry_validates_against_the_real_schema(self):
        self.contracts.validate(ENTRY_SCHEMA, _valid_entry(), "minimal stage-1 decision journal entry")

    def test_completed_entry_validates_against_the_real_schema(self):
        self.contracts.validate(ENTRY_SCHEMA, _completed_entry(), "completed decision journal entry")

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "decision-journal-entry.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "decision-journal-entry.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(ENTRY_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_decision_journal_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    def test_schema_rejects_only_one_option(self):
        entry = _valid_entry()
        entry["options"] = [entry["options"][0]]
        entry["options"][0]["chosen"] = True
        with self.assertRaises(Exception):
            self.contracts.validate(ENTRY_SCHEMA, entry, "schema minItems:2 on options")

    def test_schema_rejects_zero_chosen_options_via_contains(self):
        entry = _valid_entry()
        entry["options"][1]["chosen"] = False
        with self.assertRaises(Exception):
            self.contracts.validate(ENTRY_SCHEMA, entry, "schema minContains:1 on chosen==true")

    def test_schema_rejects_two_chosen_options_via_contains(self):
        entry = _valid_entry()
        entry["options"][0]["chosen"] = True
        with self.assertRaises(Exception):
            self.contracts.validate(ENTRY_SCHEMA, entry, "schema maxContains:1 on chosen==true")

    def test_schema_rejects_confidence_above_100(self):
        entry = _valid_entry()
        entry["confidence"] = 150
        with self.assertRaises(Exception):
            self.contracts.validate(ENTRY_SCHEMA, entry, "schema maximum:100 on confidence")

    def test_schema_rejects_malformed_stage1_integrity_hash(self):
        entry = _valid_entry()
        entry["stage1_integrity_hash"] = "not-hex"
        with self.assertRaises(Exception):
            self.contracts.validate(ENTRY_SCHEMA, entry, "schema pattern on stage1_integrity_hash")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_entry(self):
        options = _options()
        evidence = _evidence()
        entry = generate_decision_journal_entry("DJ-T-020", "ctx", options, evidence, "forecast", 50, _prov())
        options[0]["description"] = "mutated"
        evidence[0]["content"] = "mutated"
        self.assertNotEqual(entry["options"][0]["description"], "mutated")
        self.assertNotEqual(entry["evidence"][0]["content"], "mutated")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        """Same convention every sibling module in this package already uses (see fault_tree/reversal_criteria
        tests) -- provenance is stored by reference, not copied."""
        provenance = _prov()
        entry = generate_decision_journal_entry("DJ-T-021", "ctx", _options(), _evidence(), "forecast", 50, provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(entry["provenance"]["epistemic_type"], "AI_INFERENCE")

    # --- method resolution ---
    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_decision_journal_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_record_id_prefix_constant_matches_the_schema_pattern(self):
        self.assertEqual(RECORD_ID_PREFIX, "DJ-")


if __name__ == "__main__":
    unittest.main()
