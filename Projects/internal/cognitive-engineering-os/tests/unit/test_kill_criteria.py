"""Mutation-style tests for ``learning.kill_criteria`` (second Method Atlas slice from the learning family,
immediately after ``learning.reversal_criteria``).

Covers: happy path, each of the two real invariants (threshold coverage,
ownership) violated at construction with its own distinct error code, each
invariant violated via hand-tampering a dict AFTER construction (bypassing
the constructor entirely) and caught only by the independent gate,
fail-closed behavior on malformed (non-dict / wrong-type) input, and
structural edge cases (a zero-value threshold must NOT be rejected as
falsy; a bool must NOT silently pass as a number).
"""

from __future__ import annotations

import math
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.learning.kill_criteria import (
    METHOD_ID,
    VALID_DIMENSIONS,
    all_gates_pass,
    evaluate_kill_criteria_gates,
    evaluate_ownership_gate,
    evaluate_provenance_required_gate,
    evaluate_threshold_breach,
    evaluate_threshold_coverage_gate,
    generate_kill_criteria_set,
    kill_threshold,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

KILL_CRITERIA_SET_SCHEMA = "ai-lego://specs/cognitive/typed-objects/kill-criteria-set.schema.yaml"


def _loss_threshold(**overrides):
    kwargs = dict(
        threshold_id="KCS-T-001-T1", dimension="max_loss", value=2000, unit="USD", owner="ops_lead",
        provenance=make_provenance("DECISION", "HUMAN_APPROVED"), stop_action="terminate pilot",
    )
    kwargs.update(overrides)
    return kill_threshold(**kwargs)


def _time_threshold(**overrides):
    kwargs = dict(
        threshold_id="KCS-T-001-T2", dimension="max_time", value=21, unit="days", owner="devops_lead",
        provenance=make_provenance("DECISION", "HUMAN_APPROVED"),
    )
    kwargs.update(overrides)
    return kill_threshold(**kwargs)


def _quality_threshold(**overrides):
    kwargs = dict(
        threshold_id="KCS-T-001-T3", dimension="min_quality", value=95, unit="uptime_score_pct", owner="client_success_lead",
        provenance=make_provenance("DECISION", "HUMAN_APPROVED"),
    )
    kwargs.update(overrides)
    return kill_threshold(**kwargs)


def _valid_set():
    return generate_kill_criteria_set(
        "KCS-T-001", "DEC-T-001: pilot alternate hosting provider",
        [_loss_threshold(), _time_threshold(), _quality_threshold()],
        make_provenance("DECISION", "HUMAN_APPROVED"),
    )


class BreachComputeTests(unittest.TestCase):
    """Real, dimension-derived comparison logic, not a constant."""

    def test_max_loss_breaches_at_or_above_threshold(self):
        t = _loss_threshold()
        self.assertTrue(evaluate_threshold_breach(t, 2000))  # exactly at cap
        self.assertTrue(evaluate_threshold_breach(t, 2500))  # over cap

    def test_max_loss_does_not_breach_below_threshold(self):
        self.assertFalse(evaluate_threshold_breach(_loss_threshold(), 1500))

    def test_max_time_breaches_at_or_above_threshold(self):
        t = _time_threshold()
        self.assertTrue(evaluate_threshold_breach(t, 21))
        self.assertTrue(evaluate_threshold_breach(t, 30))

    def test_max_time_does_not_breach_below_threshold(self):
        self.assertFalse(evaluate_threshold_breach(_time_threshold(), 14))

    def test_min_quality_breaches_at_or_below_threshold(self):
        t = _quality_threshold()
        self.assertTrue(evaluate_threshold_breach(t, 95))  # exactly at floor
        self.assertTrue(evaluate_threshold_breach(t, 90))  # under floor

    def test_min_quality_does_not_breach_above_threshold(self):
        self.assertFalse(evaluate_threshold_breach(_quality_threshold(), 98))


class ConstructionInvariantTests(unittest.TestCase):
    """Each invariant refused at construction, not left to schema validation, with its own distinct code."""

    def test_unowned_threshold_whitespace_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_UNOWNED_THRESHOLD"):
            kill_threshold("T1", "max_loss", 100, "USD", "   ", make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_unowned_threshold_empty_string_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_UNOWNED_THRESHOLD"):
            kill_threshold("T1", "max_loss", 100, "USD", "", make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_unknown_dimension_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_UNKNOWN_DIMENSION"):
            kill_threshold("T1", "max_speed", 100, "kph", "owner", make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_non_numeric_value_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_INVALID_VALUE"):
            kill_threshold("T1", "max_loss", "a lot", "USD", "owner", make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_bool_value_is_rejected_as_not_a_real_number(self):
        """isinstance(True, int) is True in Python -- a bare isinstance check would silently accept a bool as
        1/0. Must be explicitly excluded."""
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_INVALID_VALUE"):
            kill_threshold("T1", "max_loss", True, "USD", "owner", make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_nan_value_is_rejected(self):
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_INVALID_VALUE"):
            kill_threshold("T1", "max_loss", math.nan, "USD", "owner", make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_infinite_value_is_rejected(self):
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_INVALID_VALUE"):
            kill_threshold("T1", "max_loss", math.inf, "USD", "owner", make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_empty_unit_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_EMPTY_UNIT"):
            kill_threshold("T1", "max_loss", 100, "  ", "owner", make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_zero_value_threshold_is_accepted_not_treated_as_falsy(self):
        """Regression guard: `value=0` is a legitimate finite number (e.g. a zero-tolerance max_loss cap) and
        must not be rejected by a careless `if not value` style check anywhere in the validation path."""
        threshold = kill_threshold("T1", "max_loss", 0, "USD", "owner", make_provenance("DECISION", "HUMAN_APPROVED"))
        self.assertEqual(threshold["value"], 0)
        self.assertTrue(evaluate_threshold_breach(threshold, 0))
        self.assertTrue(evaluate_threshold_breach(threshold, 1))


class SetConstructionTests(unittest.TestCase):
    def test_no_threshold_defined_is_refused_for_empty_list(self):
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_NO_THRESHOLD_DEFINED"):
            generate_kill_criteria_set("KCS-T-002", "DEC-T-002", [], make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_no_threshold_defined_is_refused_for_malformed_entries(self):
        """A list that is non-empty but whose entries are not well-shaped dicts must be refused with the same
        code -- 'a list with something in it' is not the same as 'a real threshold is defined'."""
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_NO_THRESHOLD_DEFINED"):
            generate_kill_criteria_set("KCS-T-003", "DEC-T-003", ["not-a-dict"], make_provenance("DECISION", "HUMAN_APPROVED"))

    def test_duplicate_threshold_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "KILLCRITERIA_DUPLICATE_THRESHOLD_ID"):
            generate_kill_criteria_set(
                "KCS-T-004", "DEC-T-004",
                [_loss_threshold(threshold_id="DUP"), _time_threshold(threshold_id="DUP")],
                make_provenance("DECISION", "HUMAN_APPROVED"),
            )

    def test_valid_set_with_all_three_dimensions_builds_successfully(self):
        criteria_set = _valid_set()
        self.assertEqual(criteria_set["id"], "KCS-T-001")
        self.assertEqual(len(criteria_set["thresholds"]), 3)
        self.assertEqual({t["dimension"] for t in criteria_set["thresholds"]}, VALID_DIMENSIONS)

    def test_single_dimension_set_is_also_valid(self):
        """Atlas's own L808 formula does not require all three dimensions simultaneously -- one is enough."""
        criteria_set = generate_kill_criteria_set("KCS-T-005", "DEC-T-005", [_quality_threshold()], make_provenance("DECISION", "HUMAN_APPROVED"))
        self.assertEqual(len(criteria_set["thresholds"]), 1)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_kill_criteria_set_validates_against_the_real_schema(self):
        self.contracts.validate(KILL_CRITERIA_SET_SCHEMA, _valid_set(), "kill criteria set")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_kill_criteria_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_set_passes_all_three_gates(self):
        results = evaluate_kill_criteria_gates(_valid_set(), "test", "2026-09-07T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "threshold_coverage", "ownership"})
        self.assertTrue(all_gates_pass(results))

    def test_missing_provenance_fails_provenance_required_only(self):
        criteria_set = _valid_set()
        criteria_set["thresholds"][0] = {**criteria_set["thresholds"][0], "provenance": None}
        gate = evaluate_provenance_required_gate(criteria_set, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        # Coverage/ownership are untouched by this specific mutation -- each gate stays independently diagnosable.
        self.assertEqual(evaluate_threshold_coverage_gate(criteria_set, "test", "2026-09-07T00:00:00Z")["status"], "PASS")
        self.assertEqual(evaluate_ownership_gate(criteria_set, "test", "2026-09-07T00:00:00Z")["status"], "PASS")

    def test_hand_tampered_empty_owner_fails_ownership_gate_only(self):
        """Mutation-style: the ownership gate re-checks structurally, it does not just trust that the
        builder's own construction-time check already ran (a hand-crafted/tampered record must still be
        caught)."""
        criteria_set = _valid_set()
        criteria_set["thresholds"][0] = {**criteria_set["thresholds"][0], "owner": "   "}
        gate = evaluate_ownership_gate(criteria_set, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn(criteria_set["thresholds"][0]["id"], gate["evidence"][0]["unowned_ids"])
        # dimension/value untouched -- coverage still passes for this same tampered record.
        self.assertEqual(evaluate_threshold_coverage_gate(criteria_set, "test", "2026-09-07T00:00:00Z")["status"], "PASS")

    def test_hand_tampered_empty_thresholds_fails_threshold_coverage_gate(self):
        """Bypasses the constructor entirely (mutates an already-built valid record) -- proves the gate, not
        just generate_kill_criteria_set, is what actually enforces Invariant #1."""
        criteria_set = _valid_set()
        criteria_set["thresholds"] = []
        gate = evaluate_threshold_coverage_gate(criteria_set, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_invalid_dimension_fails_threshold_coverage_gate_on_a_single_threshold_set(self):
        """A single-threshold set whose only entry is corrupted to a bogus dimension has NO valid dimension
        left -- threshold_coverage must fail."""
        criteria_set = generate_kill_criteria_set("KCS-T-006", "DEC-T-006", [_loss_threshold()], make_provenance("DECISION", "HUMAN_APPROVED"))
        criteria_set["thresholds"][0] = {**criteria_set["thresholds"][0], "dimension": "max_speed"}
        coverage = evaluate_threshold_coverage_gate(criteria_set, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(coverage["status"], "FAIL")
        self.assertIn(0, coverage["evidence"][0]["invalid_entry_indices"])
        # owner untouched by this mutation -- ownership gate must still independently pass.
        self.assertEqual(evaluate_ownership_gate(criteria_set, "test", "2026-09-07T00:00:00Z")["status"], "PASS")

    def test_one_corrupted_dimension_among_several_still_passes_coverage_but_is_flagged_in_evidence(self):
        """Correct, non-obvious gate behavior locked in as a regression guard: threshold_coverage only
        requires AT LEAST ONE valid dimension (Atlas L808's own 'at least one' bar) -- corrupting ONE of
        THREE entries in an otherwise-valid set must NOT flip the whole gate to FAIL, since the other two
        entries still genuinely cover a real dimension. The corrupted entry is still individually
        diagnosable via invalid_entry_indices, so this is not silently swallowed."""
        criteria_set = _valid_set()
        criteria_set["thresholds"][0] = {**criteria_set["thresholds"][0], "dimension": "max_speed"}
        coverage = evaluate_threshold_coverage_gate(criteria_set, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(coverage["status"], "PASS")
        self.assertIn(0, coverage["evidence"][0]["invalid_entry_indices"])
        self.assertEqual(set(coverage["evidence"][0]["dimensions_covered"]), {"max_time", "min_quality"})

    def test_malformed_record_not_a_dict_fails_closed_on_every_gate(self):
        for malformed in (None, [], "not-a-dict", 42):
            for gate_fn in (evaluate_provenance_required_gate, evaluate_threshold_coverage_gate, evaluate_ownership_gate):
                gate = gate_fn(malformed, "test", "2026-09-07T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL", f"{gate_fn.__name__} did not fail closed on {malformed!r}")

    def test_malformed_threshold_entry_fails_closed_not_a_crash(self):
        criteria_set = _valid_set()
        criteria_set["thresholds"] = ["not-a-dict", 42, None]
        for gate_fn in (evaluate_provenance_required_gate, evaluate_threshold_coverage_gate, evaluate_ownership_gate):
            gate = gate_fn(criteria_set, "test", "2026-09-07T00:00:00Z")
            self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
