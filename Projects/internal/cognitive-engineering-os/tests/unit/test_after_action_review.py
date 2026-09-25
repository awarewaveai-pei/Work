"""Mutation-style tests for ``learning.after_action_review`` (Method Atlas slice, learning family F17).

Covers: happy path, both real invariants (why-analysis genuineness, ownership) violated at construction
with their own distinct error codes, each invariant violated via hand-tampering a dict AFTER construction
(bypassing the constructor entirely) and caught only by the independent gate, fail-closed behavior on
malformed (non-dict / wrong-type) input, structural edge cases (duplicate ids, whitespace-only owners,
case/whitespace-insensitive duplicate detection), and a disclosed limitation: the >= 3-word floor is a
plain whitespace split, so it is blind to CJK text with no inter-word spacing (see
``WhyAnalysisInvariantTests.test_cjk_text_with_no_whitespace_is_word_floor_blind_spot`` below).
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.learning.after_action_review import (
    METHOD_ID,
    MIN_WHY_FACTOR_WORDS,
    MIN_WHY_FACTORS,
    all_gates_pass,
    evaluate_after_action_review_gates,
    evaluate_ownership_gate,
    evaluate_provenance_required_gate,
    evaluate_why_analysis_gate,
    generate_after_action_review_record,
    next_action,
    why_factor,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

AAR_SCHEMA = "ai-lego://specs/cognitive/typed-objects/after-action-review-record.schema.yaml"


def _why(**overrides):
    kwargs = dict(factor_id="WHY-1", description="root cause was a bad config change")
    kwargs.update(overrides)
    return why_factor(**kwargs)


def _why2(**overrides):
    kwargs = dict(factor_id="WHY-2", description="monitoring did not catch it quickly enough")
    kwargs.update(overrides)
    return why_factor(**kwargs)


def _action(**overrides):
    kwargs = dict(action_id="ACT-1", description="add an alert for this condition", owner="ops_lead")
    kwargs.update(overrides)
    return next_action(**kwargs)


def _valid_record(**overrides):
    kwargs = dict(
        record_id="AAR-T-001",
        expected="The deploy would complete without incident",
        actual="The deploy caused a 10 minute outage",
        why_factors=[_why(), _why2()],
        next_actions=[_action()],
        provenance=make_provenance("DECISION", "HUMAN_APPROVED"),
    )
    kwargs.update(overrides)
    return generate_after_action_review_record(**kwargs)


class ConvenienceConstructorTests(unittest.TestCase):
    """``why_factor``/``next_action`` do minimal shape validation; the real invariants live only in
    ``generate_after_action_review_record`` (see module docstring's DECISION section)."""

    def test_why_factor_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_EMPTY_WHY_FACTOR_FIELD"):
            why_factor("", "a real description with enough words")

    def test_why_factor_whitespace_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_EMPTY_WHY_FACTOR_FIELD"):
            why_factor("   ", "a real description with enough words")

    def test_why_factor_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_EMPTY_WHY_FACTOR_FIELD"):
            why_factor("WHY-1", "")

    def test_why_factor_valid_builds_expected_dict(self):
        item = why_factor("WHY-1", "a real description")
        self.assertEqual(item, {"id": "WHY-1", "description": "a real description"})

    def test_next_action_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_EMPTY_NEXT_ACTION_FIELD"):
            next_action("", "do the thing", "owner")

    def test_next_action_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_EMPTY_NEXT_ACTION_FIELD"):
            next_action("ACT-1", "", "owner")

    def test_next_action_empty_owner_is_refused_with_ownership_code(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_NO_OWNED_ACTION"):
            next_action("ACT-1", "do the thing", "")

    def test_next_action_whitespace_owner_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_NO_OWNED_ACTION"):
            next_action("ACT-1", "do the thing", "   ")

    def test_next_action_valid_builds_expected_dict(self):
        item = next_action("ACT-1", "do the thing", "owner")
        self.assertEqual(item, {"id": "ACT-1", "description": "do the thing", "owner": "owner"})


class RecordScalarFieldConstructionTests(unittest.TestCase):
    """Envelope fields (id/expected/actual/version/activity_ref/provenance) checked at construction."""

    def test_invalid_record_id_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_RECORD_ID"):
            _valid_record(record_id="WRONG-001")

    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_RECORD_ID"):
            _valid_record(record_id="")

    def test_empty_expected_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_EMPTY_EXPECTED"):
            _valid_record(expected="")

    def test_whitespace_only_expected_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_EMPTY_EXPECTED"):
            _valid_record(expected="   ")

    def test_empty_actual_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_EMPTY_ACTUAL"):
            _valid_record(actual="")

    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_VERSION"):
            _valid_record(version=1.0)

    def test_non_string_activity_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_ACTIVITY_REF"):
            _valid_record(activity_ref=123)

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED", "locked": None})

    def test_activity_ref_defaults_to_none(self):
        record = _valid_record()
        self.assertIsNone(record["activity_ref"])

    def test_activity_ref_accepts_a_string(self):
        record = _valid_record(activity_ref="ACT-REF-001")
        self.assertEqual(record["activity_ref"], "ACT-REF-001")

    def test_version_defaults_to_1_0_0(self):
        self.assertEqual(_valid_record()["version"], "1.0.0")

    def test_generated_by_method_defaults_to_method_id(self):
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_happy_path_returns_all_expected_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "activity_ref", "expected", "actual", "why_factors", "next_actions", "provenance"},
        )


class WhyFactorsShapeTests(unittest.TestCase):
    """Malformed why_factors (hand-built, bypassing ``why_factor()``) refused with AAR_INVALID_WHY_FACTORS."""

    def test_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_WHY_FACTORS"):
            _valid_record(why_factors="not-a-list")

    def test_list_with_non_dict_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_WHY_FACTORS"):
            _valid_record(why_factors=[_why(), "not-a-dict"])

    def test_entry_with_unknown_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_WHY_FACTORS"):
            _valid_record(why_factors=[_why(), {**_why2(), "extra": "nope"}])

    def test_entry_missing_description_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_WHY_FACTORS"):
            _valid_record(why_factors=[_why(), {"id": "WHY-2"}])

    def test_entry_with_empty_id_hand_built_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_WHY_FACTORS"):
            _valid_record(why_factors=[_why(), {"id": "", "description": "a real description here"}])

    def test_entry_with_non_string_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_WHY_FACTORS"):
            _valid_record(why_factors=[_why(), {"id": "WHY-2", "description": 123}])

    def test_duplicate_why_factor_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_DUPLICATE_WHY_FACTOR_ID"):
            _valid_record(why_factors=[_why(factor_id="DUP"), _why2(factor_id="DUP")])


class WhyAnalysisInvariantTests(unittest.TestCase):
    """Invariant #1 (AAR_INSUFFICIENT_WHY_ANALYSIS): >= 2 entries, each >= 3 words, no duplicate-after-
    normalize -- checked once shape is already valid."""

    def test_zero_why_factors_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INSUFFICIENT_WHY_ANALYSIS"):
            _valid_record(why_factors=[])

    def test_one_why_factor_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INSUFFICIENT_WHY_ANALYSIS"):
            _valid_record(why_factors=[_why()])

    def test_exactly_min_why_factors_with_exactly_min_words_passes(self):
        """Boundary: MIN_WHY_FACTORS entries, each exactly MIN_WHY_FACTOR_WORDS words, must PASS (not >)."""
        self.assertEqual(MIN_WHY_FACTORS, 2)
        self.assertEqual(MIN_WHY_FACTOR_WORDS, 3)
        record = _valid_record(why_factors=[_why(description="root cause identified"), _why2(description="fixed the thing")])
        self.assertEqual(len(record["why_factors"]), 2)

    def test_one_entry_below_word_floor_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INSUFFICIENT_WHY_ANALYSIS"):
            _valid_record(why_factors=[_why(description="two words"), _why2()])

    def test_single_word_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INSUFFICIENT_WHY_ANALYSIS"):
            _valid_record(why_factors=[_why(description="oneword"), _why2()])

    def test_hyphenated_phrase_counts_as_one_whitespace_token(self):
        """Regression guard, disclosed: word-count is a plain str.split() -- 'root-cause-identified' has no
        internal whitespace and counts as ONE token, not three, so it fails the floor even though a human
        would read it as a 3-concept phrase."""
        with self.assertRaisesRegex(InvariantViolation, "AAR_INSUFFICIENT_WHY_ANALYSIS"):
            _valid_record(why_factors=[_why(description="root-cause-identified"), _why2()])

    def test_cjk_text_with_no_whitespace_is_word_floor_blind_spot(self):
        """DISCLOSED LIMITATION (not silently dropped -- see this session's own report): the >= 3-word floor
        is str.split() on whitespace, which is a real, substantive Chinese sentence with zero internal
        whitespace -- it reads as ONE token and is rejected by the same floor an equivalent-length English
        sentence would pass. Recorded here as a locked-in regression, not a bug to silently fix; a future
        session should decide whether to add a CJK-aware character-count fallback (see this session's
        report / a future OQ-AAR-4)."""
        with self.assertRaisesRegex(InvariantViolation, "AAR_INSUFFICIENT_WHY_ANALYSIS"):
            _valid_record(why_factors=[_why(description="根本原因是設定變更未經審查"), _why2()])

    def test_cjk_text_with_inserted_spaces_passes_the_same_floor(self):
        """Companion to the blind-spot test above: inserting spaces between CJK tokens is a real, if
        awkward, workaround under the current whitespace-only counting technique."""
        record = _valid_record(why_factors=[_why(description="根本 原因 是 設定變更"), _why2()])
        self.assertEqual(len(record["why_factors"]), 2)

    def test_two_identical_descriptions_are_refused_as_duplicate(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INSUFFICIENT_WHY_ANALYSIS"):
            _valid_record(why_factors=[_why(description="the exact same root cause text"), _why2(description="the exact same root cause text")])

    def test_case_insensitive_duplicate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INSUFFICIENT_WHY_ANALYSIS"):
            _valid_record(why_factors=[_why(description="Root Cause Was Bad"), _why2(description="root cause was bad")])

    def test_whitespace_insensitive_duplicate_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INSUFFICIENT_WHY_ANALYSIS"):
            _valid_record(why_factors=[_why(description="root   cause   was  bad"), _why2(description="root cause was bad")])

    def test_three_entries_two_duplicate_one_distinct_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INSUFFICIENT_WHY_ANALYSIS"):
            _valid_record(
                why_factors=[
                    _why(factor_id="WHY-1", description="root cause was bad config"),
                    _why2(factor_id="WHY-2", description="a genuinely distinct third factor here"),
                    why_factor("WHY-3", "root cause was bad config"),
                ]
            )

    def test_three_distinct_well_formed_entries_passes(self):
        record = _valid_record(
            why_factors=[
                _why(factor_id="WHY-1", description="root cause was a bad config change"),
                _why2(factor_id="WHY-2", description="monitoring did not catch it in time"),
                why_factor("WHY-3", "the rollback runbook was out of date"),
            ]
        )
        self.assertEqual(len(record["why_factors"]), 3)


class NextActionsShapeTests(unittest.TestCase):
    """Malformed next_actions (hand-built, bypassing ``next_action()``) refused with AAR_INVALID_NEXT_ACTIONS."""

    def test_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_NEXT_ACTIONS"):
            _valid_record(next_actions="not-a-list")

    def test_list_with_non_dict_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_NEXT_ACTIONS"):
            _valid_record(next_actions=[_action(), 42])

    def test_entry_with_unknown_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_NEXT_ACTIONS"):
            _valid_record(next_actions=[{**_action(), "extra": "nope"}])

    def test_entry_missing_owner_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_NEXT_ACTIONS"):
            _valid_record(next_actions=[{"id": "ACT-1", "description": "do it"}])

    def test_entry_with_non_string_owner_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_INVALID_NEXT_ACTIONS"):
            _valid_record(next_actions=[{"id": "ACT-1", "description": "do it", "owner": 42}])

    def test_duplicate_next_action_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_DUPLICATE_NEXT_ACTION_ID"):
            _valid_record(next_actions=[_action(action_id="DUP"), _action(action_id="DUP", description="a second distinct action")])


class OwnershipInvariantTests(unittest.TestCase):
    """Invariant #2 (AAR_NO_OWNED_ACTION): >= 1 entry, every entry owned -- checked once shape is valid.
    Empty-owner cases here bypass ``next_action()``'s own eager check via hand-built dicts, proving
    ``generate_after_action_review_record`` itself -- not merely the convenience constructor -- enforces
    ownership (same "regardless of how each item was built" guarantee every builder in this package gives)."""

    def test_zero_next_actions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_NO_OWNED_ACTION"):
            _valid_record(next_actions=[])

    def test_hand_built_empty_owner_bypassing_constructor_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_NO_OWNED_ACTION"):
            _valid_record(next_actions=[{"id": "ACT-1", "description": "do it", "owner": ""}])

    def test_hand_built_whitespace_owner_bypassing_constructor_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_NO_OWNED_ACTION"):
            _valid_record(next_actions=[{"id": "ACT-1", "description": "do it", "owner": "   "}])

    def test_one_unowned_among_several_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AAR_NO_OWNED_ACTION"):
            _valid_record(next_actions=[_action(action_id="ACT-1"), {"id": "ACT-2", "description": "do the other thing", "owner": ""}])

    def test_owner_with_surrounding_whitespace_but_real_content_passes_and_is_stored_verbatim(self):
        record = _valid_record(next_actions=[_action(owner="  ops_lead  ")])
        self.assertEqual(record["next_actions"][0]["owner"], "  ops_lead  ")

    def test_multiple_owned_actions_passes(self):
        record = _valid_record(next_actions=[_action(action_id="ACT-1"), _action(action_id="ACT-2", owner="devops_lead")])
        self.assertEqual(len(record["next_actions"]), 2)


class RecordIntegrityTests(unittest.TestCase):
    """Rebuild-from-known-fields regression guard, same discipline every builder in this package uses."""

    def test_mutating_caller_supplied_why_factors_list_after_construction_does_not_affect_stored_record(self):
        source = [_why(), _why2()]
        record = _valid_record(why_factors=source)
        source.append(why_factor("WHY-3", "a factor added after construction"))
        self.assertEqual(len(record["why_factors"]), 2)

    def test_mutating_caller_supplied_next_actions_list_after_construction_does_not_affect_stored_record(self):
        source = [_action()]
        record = _valid_record(next_actions=source)
        source.append(_action(action_id="ACT-2"))
        self.assertEqual(len(record["next_actions"]), 1)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(AAR_SCHEMA, _valid_record(), "after action review record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_after_action_review_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_all_three_gates(self):
        results = evaluate_after_action_review_gates(_valid_record(), "test", "2026-09-07T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "why_analysis", "ownership"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        record = _valid_record()
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(evaluate_why_analysis_gate(record, "test", "2026-09-07T00:00:00Z")["status"], "PASS")
        self.assertEqual(evaluate_ownership_gate(record, "test", "2026-09-07T00:00:00Z")["status"], "PASS")

    def test_hand_tampered_empty_why_factors_fails_why_analysis_gate_only(self):
        record = _valid_record()
        record["why_factors"] = []
        gate = evaluate_why_analysis_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(evaluate_provenance_required_gate(record, "test", "2026-09-07T00:00:00Z")["status"], "PASS")
        self.assertEqual(evaluate_ownership_gate(record, "test", "2026-09-07T00:00:00Z")["status"], "PASS")

    def test_hand_tampered_duplicate_why_factor_id_fails_why_analysis_gate(self):
        """Mutation-style: the gate re-checks structurally, it does not just trust that the builder's own
        construction-time check already ran (a hand-crafted/tampered record must still be caught)."""
        record = _valid_record()
        record["why_factors"] = [{**record["why_factors"][0], "id": "SAME"}, {**record["why_factors"][1], "id": "SAME"}]
        gate = evaluate_why_analysis_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("SAME", gate["evidence"][0]["duplicate_ids"])

    def test_hand_tampered_why_factor_edited_to_duplicate_fails_why_analysis_gate(self):
        """Post-construction edit of one entry's own description to match another's -- the gate must catch
        this even though both entries individually passed shape validation at construction time."""
        record = _valid_record()
        record["why_factors"][1] = {**record["why_factors"][1], "description": record["why_factors"][0]["description"]}
        gate = evaluate_why_analysis_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_why_factor_shortened_below_word_floor_fails_why_analysis_gate(self):
        record = _valid_record()
        record["why_factors"][0] = {**record["why_factors"][0], "description": "short"}
        gate = evaluate_why_analysis_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_blank_owner_fails_ownership_gate_only(self):
        record = _valid_record()
        record["next_actions"][0] = {**record["next_actions"][0], "owner": "   "}
        gate = evaluate_ownership_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(evaluate_provenance_required_gate(record, "test", "2026-09-07T00:00:00Z")["status"], "PASS")
        self.assertEqual(evaluate_why_analysis_gate(record, "test", "2026-09-07T00:00:00Z")["status"], "PASS")

    def test_hand_tampered_empty_next_actions_fails_ownership_gate(self):
        record = _valid_record()
        record["next_actions"] = []
        gate = evaluate_ownership_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_duplicate_next_action_id_fails_ownership_gate(self):
        record = _valid_record(next_actions=[_action(action_id="ACT-1"), _action(action_id="ACT-2")])
        record["next_actions"][1] = {**record["next_actions"][1], "id": "ACT-1"}
        gate = evaluate_ownership_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("ACT-1", gate["evidence"][0]["duplicate_ids"])

    def test_malformed_record_not_a_dict_fails_closed_on_every_gate(self):
        for malformed in (None, [], "not-a-dict", 42):
            for gate_fn in (evaluate_provenance_required_gate, evaluate_why_analysis_gate, evaluate_ownership_gate):
                gate = gate_fn(malformed, "test", "2026-09-07T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL", f"{gate_fn.__name__} did not fail closed on {malformed!r}")

    def test_malformed_why_factors_entries_fail_closed_not_a_crash(self):
        record = _valid_record()
        record["why_factors"] = ["not-a-dict", 42, None]
        gate = evaluate_why_analysis_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_malformed_next_actions_entries_fail_closed_not_a_crash(self):
        record = _valid_record()
        record["next_actions"] = ["not-a-dict", 42, None]
        gate = evaluate_ownership_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_why_factors_not_a_list_fails_closed_on_why_analysis_gate(self):
        record = _valid_record()
        record["why_factors"] = "not-a-list"
        gate = evaluate_why_analysis_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_next_actions_not_a_list_fails_closed_on_ownership_gate(self):
        record = _valid_record()
        record["next_actions"] = "not-a-list"
        gate = evaluate_ownership_gate(record, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_results_validate_against_the_real_gate_result_schema(self):
        contracts = SchemaContracts(resolve_spec_root())
        results = evaluate_after_action_review_gates(_valid_record(), "test", "2026-09-07T00:00:00Z")
        for gate in results:
            contracts.validate("ai-lego://specs/execution/gate.schema.yaml#/gate_result", gate, f"gate {gate['gate_id']}")


if __name__ == "__main__":
    unittest.main()
