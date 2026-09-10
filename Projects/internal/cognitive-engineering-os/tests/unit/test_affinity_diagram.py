"""Mutation-style tests for ``association.affinity_diagram`` (F04 association family, Atlas F04 table row
L413 + §11.3, L1206-1224).

Two real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_affinity_diagram_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_affinity_diagram_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/affinity-diagram-record.schema.yaml``), including an
``additionalProperties: false`` top-level rejection check.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.association.affinity_diagram import (
    METHOD_ID,
    MIN_GROUP_REFS_FOR_THEME,
    RECORD_ID_PREFIX,
    all_gates_pass,
    card_entry,
    derive_ungrouped_card_refs,
    evaluate_affinity_diagram_gates,
    evaluate_affinity_diagram_integrity_gate,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    generate_affinity_diagram_record,
    group_entry,
    higher_level_theme_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

AFFINITY_DIAGRAM_SCHEMA = "ai-lego://specs/cognitive/typed-objects/affinity-diagram-record.schema.yaml"


def _card(card_id: str, text: str = "an idea", refs: list[str] | None = ("E-1",)) -> dict:
    return card_entry(card_id, text, make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=list(refs) if refs else None)


def _group(group_id: str, item_refs: list[str], name: str = "a group") -> dict:
    return group_entry(group_id, name, item_refs, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


def _six_cards() -> list[dict]:
    return [_card(f"C{i}") for i in range(1, 7)]


def _mixed_groups() -> list[dict]:
    # C1/C2 -> G1, C3/C4/C5 -> G2, C6 left ungrouped -- matches the CLI demo's own real shape.
    return [_group("G1", ["C1", "C2"]), _group("G2", ["C3", "C4", "C5"])]


def _valid_record(*, cards=None, groups=None, record_id: str = "AFFINITY-T-001", topic: str = "test topic", higher_level_themes=None):
    return generate_affinity_diagram_record(
        record_id,
        topic,
        cards if cards is not None else _six_cards(),
        groups if groups is not None else _mixed_groups(),
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        higher_level_themes=higher_level_themes,
    )


class RecordConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(AFFINITY_DIAGRAM_SCHEMA, _valid_record(), "affinity diagram record")

    def test_valid_record_with_higher_level_themes_validates(self):
        themes = [higher_level_theme_entry("cross-group pattern", ["G1", "G2"])]
        record = _valid_record(higher_level_themes=themes)
        self.contracts.validate(AFFINITY_DIAGRAM_SCHEMA, record, "affinity diagram record with themes")
        self.assertEqual(record["higher_level_themes"], themes)

    def test_all_cards_grouped_has_empty_ungrouped_card_refs_and_validates(self):
        groups = [_group("G1", ["C1", "C2", "C3", "C4", "C5", "C6"])]
        record = _valid_record(groups=groups)
        self.contracts.validate(AFFINITY_DIAGRAM_SCHEMA, record, "affinity diagram record, full coverage")
        self.assertEqual(record["ungrouped_card_refs"], [])

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_affinity_diagram_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_record_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_record_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_VERSION"):
            generate_affinity_diagram_record("AFFINITY-T-002", "topic", _six_cards(), _mixed_groups(), make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_empty_topic_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_EMPTY_TOPIC"):
            _valid_record(topic="   ")

    def test_hand_tampered_card_in_two_groups_fails_the_gate_but_still_passes_schema(self):
        """Defense in depth boundary: mutual exclusivity is a cross-array check JSON Schema cannot express
        (each group is, in isolation, individually well-shaped) -- schema validation alone would NOT catch
        this, only the runtime gate does."""
        tampered = copy.deepcopy(_valid_record())
        tampered["groups"][1]["item_refs"].append("C1")  # C1 already belongs to groups[0]
        self.contracts.validate(AFFINITY_DIAGRAM_SCHEMA, tampered, "tampered record (still schema-valid)")
        gate = evaluate_affinity_diagram_integrity_gate(tampered, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_unknown_top_level_key(self):
        """additionalProperties: false top-level check -- present from the start per this suite's own
        established mandate."""
        record = _valid_record()
        record["unexpected_top_level_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AFFINITY_DIAGRAM_SCHEMA, record, "record with unknown top-level key")

    def test_schema_rejects_unknown_card_entry_key(self):
        record = _valid_record()
        record["cards"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AFFINITY_DIAGRAM_SCHEMA, record, "record with unknown card key")

    def test_schema_rejects_unknown_group_entry_key(self):
        record = _valid_record()
        record["groups"][0]["unexpected_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AFFINITY_DIAGRAM_SCHEMA, record, "record with unknown group key")

    def test_schema_rejects_empty_cards_array(self):
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AFFINITY_DIAGRAM_SCHEMA, {**_valid_record(), "cards": []}, "record with empty cards")

    def test_schema_rejects_empty_groups_array(self):
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AFFINITY_DIAGRAM_SCHEMA, {**_valid_record(), "groups": []}, "record with empty groups")


class CardShapeTests(unittest.TestCase):
    def test_cards_empty_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_TOO_FEW_CARDS"):
            _valid_record(cards=[], groups=[])

    def test_cards_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_TOO_FEW_CARDS"):
            _valid_record(cards="not-a-list")

    def test_cards_duplicate_id_is_refused(self):
        cards = _six_cards()
        cards[1]["id"] = "C1"
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_DUPLICATE_CARD_ID"):
            _valid_record(cards=cards, groups=[_group("G1", ["C1"])])

    def test_card_missing_text_is_refused(self):
        cards = _six_cards()
        del cards[0]["text"]
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_CARD_SHAPE"):
            _valid_record(cards=cards)

    def test_card_empty_text_is_refused(self):
        cards = _six_cards()
        cards[0]["text"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_CARD_SHAPE"):
            _valid_record(cards=cards)

    def test_card_unexpected_key_is_refused(self):
        cards = _six_cards()
        cards[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_CARD_SHAPE"):
            _valid_record(cards=cards)

    def test_single_card_single_group_is_legal(self):
        record = _valid_record(cards=[_card("C1")], groups=[_group("G1", ["C1"])])
        self.assertEqual(record["ungrouped_card_refs"], [])


class GroupShapeTests(unittest.TestCase):
    def test_groups_empty_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_TOO_FEW_GROUPS"):
            _valid_record(groups=[])

    def test_groups_not_a_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_TOO_FEW_GROUPS"):
            _valid_record(groups="not-a-list")

    def test_groups_duplicate_id_is_refused(self):
        groups = [_group("G1", ["C1"]), _group("G1", ["C2"])]
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_DUPLICATE_GROUP_ID"):
            _valid_record(groups=groups)

    def test_group_missing_name_is_refused(self):
        groups = _mixed_groups()
        del groups[0]["name"]
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_GROUP_SHAPE"):
            _valid_record(groups=groups)

    def test_group_empty_name_is_refused(self):
        groups = _mixed_groups()
        groups[0]["name"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_GROUP_SHAPE"):
            _valid_record(groups=groups)

    def test_group_empty_item_refs_is_refused(self):
        groups = _mixed_groups()
        groups[0]["item_refs"] = []
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_GROUP_SHAPE"):
            _valid_record(groups=groups)

    def test_group_duplicate_item_ref_within_itself_is_refused(self):
        groups = _mixed_groups()
        groups[0]["item_refs"] = ["C1", "C1"]
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_GROUP_SHAPE"):
            _valid_record(groups=groups)

    def test_group_unexpected_key_is_refused(self):
        groups = _mixed_groups()
        groups[0]["unexpected_field"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_GROUP_SHAPE"):
            _valid_record(groups=groups)


class ReferentialIntegrityTests(unittest.TestCase):
    """The two core invariants this method exists for: referential integrity into cards[].id, and mutual
    exclusivity (a card belongs to zero or one groups, never more)."""

    def test_group_referencing_unknown_card_id_is_refused(self):
        groups = [_group("G1", ["C1", "C2"]), _group("G2", ["C3", "C4", "C5", "GHOST"])]
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_GROUP_REFERENCES_UNKNOWN_CARD"):
            _valid_record(groups=groups)

    def test_card_referenced_by_two_groups_is_refused(self):
        """THE core invariant: a card must not be referenced by more than one group."""
        groups = [_group("G1", ["C1", "C2"]), _group("G2", ["C1", "C3"])]  # C1 in both
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_CARD_IN_MULTIPLE_GROUPS"):
            _valid_record(groups=groups)

    def test_card_referenced_by_three_groups_is_also_refused(self):
        groups = [_group("G1", ["C1"]), _group("G2", ["C1"]), _group("G3", ["C1", "C2"])]
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_CARD_IN_MULTIPLE_GROUPS"):
            _valid_record(groups=groups)


class HigherLevelThemeTests(unittest.TestCase):
    def test_omitted_higher_level_themes_is_legal(self):
        record = _valid_record()
        self.assertNotIn("higher_level_themes", record)

    def test_empty_higher_level_themes_list_is_treated_as_omitted(self):
        record = _valid_record(higher_level_themes=[])
        self.assertNotIn("higher_level_themes", record)

    def test_theme_with_fewer_than_min_group_refs_is_refused(self):
        self.assertEqual(MIN_GROUP_REFS_FOR_THEME, 2)
        themes = [higher_level_theme_entry("not cross-group", ["G1"])]
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_THEME_TOO_FEW_GROUP_REFS"):
            _valid_record(higher_level_themes=themes)

    def test_theme_referencing_unknown_group_is_refused(self):
        themes = [higher_level_theme_entry("theme", ["G1", "GHOST"])]
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_THEME_REFERENCES_UNKNOWN_GROUP"):
            _valid_record(higher_level_themes=themes)

    def test_theme_missing_theme_text_is_refused(self):
        themes = [{"theme": "", "group_refs": ["G1", "G2"]}]
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_THEME_SHAPE"):
            _valid_record(higher_level_themes=themes)

    def test_theme_duplicate_group_refs_is_refused(self):
        themes = [higher_level_theme_entry("theme", ["G1", "G1"])]
        with self.assertRaisesRegex(InvariantViolation, "AFFINITYDIAGRAM_INVALID_THEME_SHAPE"):
            _valid_record(higher_level_themes=themes)

    def test_theme_with_exactly_two_group_refs_is_legal(self):
        themes = [higher_level_theme_entry("exactly two", ["G1", "G2"])]
        record = _valid_record(higher_level_themes=themes)
        self.assertEqual(record["higher_level_themes"][0]["group_refs"], ["G1", "G2"])


class UngroupedCoverageComputeTests(unittest.TestCase):
    """GENUINE_COMPUTE: ungrouped_card_refs is derived, never caller-supplied, verified re-derivable."""

    def test_mixed_record_ungrouped_is_exactly_c6(self):
        record = _valid_record()
        self.assertEqual(record["ungrouped_card_refs"], ["C6"])

    def test_generate_affinity_diagram_record_accepts_no_ungrouped_card_refs_parameter(self):
        """The builder signature itself has no ungrouped_card_refs parameter -- there is no code path for a
        caller to inject a mismatched value at construction time."""
        import inspect

        sig = inspect.signature(generate_affinity_diagram_record)
        self.assertNotIn("ungrouped_card_refs", sig.parameters)

    def test_zero_ungrouped_when_all_cards_covered(self):
        groups = [_group("G1", ["C1", "C2", "C3", "C4", "C5", "C6"])]
        record = _valid_record(groups=groups)
        self.assertEqual(record["ungrouped_card_refs"], [])

    def test_ungrouped_preserves_cards_array_order_not_group_order(self):
        cards = [_card("C1"), _card("C2"), _card("C3"), _card("C4")]
        groups = [_group("G1", ["C2"]), _group("G2", ["C4"])]
        record = _valid_record(cards=cards, groups=groups)
        self.assertEqual(record["ungrouped_card_refs"], ["C1", "C3"])

    def test_derive_ungrouped_card_refs_direct_call(self):
        cards = [_card("C1"), _card("C2"), _card("C3")]
        groups = [_group("G1", ["C2"])]
        self.assertEqual(derive_ungrouped_card_refs(cards, groups), ["C1", "C3"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        record = _valid_record()
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_ungrouped_card_refs_claiming_full_coverage(self):
        record = copy.deepcopy(_valid_record())
        record["ungrouped_card_refs"] = []  # lies -- C6 is still genuinely uncovered
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "AFFINITYDIAGRAM_UNGROUPED_MISMATCH")

    def test_gate_catches_hand_tampered_ungrouped_card_refs_claiming_more_than_reality(self):
        record = copy.deepcopy(_valid_record())
        record["ungrouped_card_refs"] = ["C1", "C2", "C3", "C4", "C5", "C6"]  # lies -- 5 are grouped
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "AFFINITYDIAGRAM_UNGROUPED_MISMATCH")

    def test_gate_catches_hand_tampered_card_in_multiple_groups(self):
        record = copy.deepcopy(_valid_record())
        record["groups"][1]["item_refs"].append("C1")
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_unknown_card_ref(self):
        record = copy.deepcopy(_valid_record())
        record["groups"][0]["item_refs"].append("GHOST")
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_group_id(self):
        record = copy.deepcopy(_valid_record())
        record["groups"][1]["id"] = record["groups"][0]["id"]
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_theme_referencing_unknown_group(self):
        record = copy.deepcopy(_valid_record(higher_level_themes=[higher_level_theme_entry("theme", ["G1", "G2"])]))
        record["higher_level_themes"][0]["group_refs"] = ["G1", "GHOST"]
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_affinity_diagram_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_topic(self):
        record = copy.deepcopy(_valid_record())
        record["topic"] = ""
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_cards(self):
        record = copy.deepcopy(_valid_record())
        record["cards"] = []
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_groups(self):
        record = copy.deepcopy(_valid_record())
        record["groups"] = []
        gate = evaluate_affinity_diagram_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceAndEvidenceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_all_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_card_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["cards"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_a_group_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["groups"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_APPROVED"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_when_evidence_labeled_cards_cite_refs(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeling_gate_fails_when_evidence_labeled_card_cites_no_refs(self):
        cards = _six_cards()
        cards[0] = card_entry("C1", "an idea", make_provenance("EVIDENCE", "HUMAN_APPROVED"))  # no refs
        record = _valid_record(cards=cards)
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_evidence_labeling_gate_passes_for_hypothesis_labeled_card_without_refs(self):
        cards = _six_cards()
        cards[0] = card_entry("C1", "an idea", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))  # no refs, not EVIDENCE
        record = _valid_record(cards=cards)
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_card_entry_helper_omits_supporting_evidence_refs_when_none(self):
        entry = card_entry("C1", "an idea", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertNotIn("supporting_evidence_refs", entry)

    def test_card_entry_helper_includes_supporting_evidence_refs_when_given(self):
        entry = card_entry("C1", "an idea", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"])
        self.assertEqual(entry["supporting_evidence_refs"], ["E-1"])

    def test_group_entry_helper_copies_item_refs(self):
        refs = ["C1", "C2"]
        entry = group_entry("G1", "a group", refs, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        refs.append("C3")
        self.assertEqual(entry["item_refs"], ["C1", "C2"])  # not aliased to caller's list

    def test_higher_level_theme_entry_helper_has_no_provenance_key(self):
        entry = higher_level_theme_entry("theme", ["G1", "G2"])
        self.assertNotIn("provenance", entry)

    def test_all_gates_pass_true_when_all_pass(self):
        results = [{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_false_when_one_fails(self):
        results = [{"status": "PASS"}, {"status": "FAIL"}]
        self.assertFalse(all_gates_pass(results))

    def test_evaluate_affinity_diagram_gates_returns_three_gates_in_order(self):
        results = evaluate_affinity_diagram_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "affinity_diagram_integrity"])

    def test_evaluate_affinity_diagram_gates_all_pass_on_a_valid_record(self):
        results = evaluate_affinity_diagram_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "AFFINITY-")

    def test_method_id_constant_is_schema_pattern_valid(self):
        """method.schema.yaml's own id pattern (^[a-z_]+\\.[a-z_]+$) -- verify the constant itself actually
        conforms, not just that it 'looks right'."""
        import re

        self.assertEqual(METHOD_ID, "association.affinity_diagram")
        self.assertIsNotNone(re.fullmatch(r"[a-z_]+\.[a-z_]+", METHOD_ID))


if __name__ == "__main__":
    unittest.main()
