"""Mutation-style tests for ``stakeholders.incentive_mapping`` (F07 stakeholder/power/negotiation family, one
of 10 concurrent members opened in this same batch).

Two real invariants beyond per-field shape (non-empty incentive_cards list, per-card 5-field completeness),
exercised at BOTH layers: construction-time refusal (``generate_incentive_map`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation (``evaluate_incentive_map_integrity_gate``
catching a hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself).
Schema conformance is checked against the real spec-root schema this same slice added
(``typed-objects/incentive-mapping.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.stakeholders.incentive_mapping import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    card,
    evaluate_incentive_map_integrity_gate,
    evaluate_incentive_mapping_gates,
    evaluate_provenance_required_gate,
    generate_incentive_map,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

INCENTIVE_MAP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/incentive-mapping.schema.yaml"


def _cards(**overrides: dict) -> list[dict]:
    base = {
        "procurement": dict(
            stakeholder_name="採購部主管",
            goals="在預算內完成年度供應商汰換",
            incentives="成本降幅直接算他的績效",
            constraints="時程只有 6 週",
            risks="若出包他第一個被究責",
        ),
        "security": dict(
            stakeholder_name="IT 資安主管",
            goals="確保新系統上線前完成資安稽核",
            incentives="穩健比速度更符合他的利益",
            constraints="稽核團隊人手有限",
            risks="若跳過稽核未來出事會指向他",
        ),
    }
    base.update(overrides)
    return [card(v["stakeholder_name"], v["goals"], v["incentives"], v["constraints"], v["risks"]) for v in base.values()]


def _valid_map(
    *,
    map_id: str = "INCMAP-T-001",
    incentive_cards: list[dict] | None = None,
):
    return generate_incentive_map(
        map_id,
        incentive_cards if incentive_cards is not None else _cards(),
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_map_validates_against_the_real_schema(self):
        self.contracts.validate(INCENTIVE_MAP_SCHEMA, _valid_map(), "incentive map")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, incentive_map = live.invoke(
            METHOD_ID, generate_incentive_map, "INCMAP-T-INVOKE", _cards(), make_provenance("EVIDENCE", "HUMAN_APPROVED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/stakeholders.incentive_mapping.contract.yaml")
        self.assertEqual(incentive_map["id"], "INCMAP-T-INVOKE")

    def test_empty_catalog_blocks_incentive_mapping_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_map())
        tampered["incentive_cards"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(INCENTIVE_MAP_SCHEMA, tampered, "tampered map")
        gate = evaluate_incentive_map_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        empathy-map.schema.yaml's own equivalent test)."""
        incentive_map = _valid_map()
        incentive_map["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(INCENTIVE_MAP_SCHEMA, incentive_map, "map with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_card(self):
        incentive_map = _valid_map()
        incentive_map["incentive_cards"][0] = {**incentive_map["incentive_cards"][0], "confidence": 0.9}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(INCENTIVE_MAP_SCHEMA, incentive_map, "map with a smuggled card key")

    def test_schema_rejects_a_smuggled_per_card_provenance_key(self):
        """Record-level-only provenance is a real, checked shape decision -- a card carrying its own
        provenance field must be rejected, not silently accepted."""
        incentive_map = _valid_map()
        incentive_map["incentive_cards"][0] = {**incentive_map["incentive_cards"][0], "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(INCENTIVE_MAP_SCHEMA, incentive_map, "map with a smuggled per-card provenance key")

    def test_id_is_distinct_from_insight_empathy_map_machine_id(self):
        self.assertNotEqual(METHOD_ID, "insight.empathy_map")
        self.assertEqual(METHOD_ID, "stakeholders.incentive_mapping")

    def test_incentive_mapping_and_empathy_map_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "insight.empathy_map"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "stakeholders.incentive_mapping.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "stakeholders.incentive_mapping contract")


class CardVocabularyTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "INCMAP-")

    def test_card_rejects_empty_stakeholder_name(self):
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INCOMPLETE_CARD"):
            card("", "goals", "incentives", "constraints", "risks")

    def test_card_rejects_whitespace_only_field(self):
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INCOMPLETE_CARD"):
            card("name", "goals", "incentives", "constraints", "   ")

    def test_card_accepts_all_5_fields_non_empty(self):
        built = card("name", "goals", "incentives", "constraints", "risks")
        self.assertEqual(built, {"stakeholder_name": "name", "goals": "goals", "incentives": "incentives", "constraints": "constraints", "risks": "risks"})


class CardCompletenessTests(unittest.TestCase):
    """Real invariant 2 (module docstring): every incentive_cards[] item must itself carry all 5 required
    fields non-empty -- a PER-CARD completeness check, not a cross-card floor."""

    def test_two_complete_cards_is_accepted(self):
        incentive_map = _valid_map()
        self.assertEqual(len(incentive_map["incentive_cards"]), 2)

    def test_a_single_complete_card_is_accepted(self):
        incentive_map = generate_incentive_map("INCMAP-T-ONE", _cards()[:1], make_provenance("EVIDENCE", "HUMAN_APPROVED"))
        self.assertEqual(len(incentive_map["incentive_cards"]), 1)

    def test_many_complete_cards_is_accepted(self):
        many = [
            card(f"stakeholder-{i}", f"goals-{i}", f"incentives-{i}", f"constraints-{i}", f"risks-{i}")
            for i in range(6)
        ]
        incentive_map = generate_incentive_map("INCMAP-T-MANY", many, make_provenance("EVIDENCE", "HUMAN_APPROVED"))
        self.assertEqual(len(incentive_map["incentive_cards"]), 6)

    def test_empty_incentive_cards_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_EMPTY_CARDS"):
            generate_incentive_map("INCMAP-T-EMPTY", [], make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_one_card_missing_risks_is_refused_even_though_the_other_card_is_complete(self):
        """The core per-card-not-cross-card distinction: one incomplete card is refused regardless of any
        other complete card in the same list."""
        cards = _cards()
        cards[0] = {**cards[0], "risks": ""}
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INCOMPLETE_CARD"):
            generate_incentive_map("INCMAP-T-MISSINGRISKS", cards, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_one_card_missing_goals_is_refused(self):
        cards = _cards()
        cards[0] = {**cards[0], "goals": ""}
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INCOMPLETE_CARD"):
            generate_incentive_map("INCMAP-T-MISSINGGOALS", cards, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_one_card_missing_incentives_is_refused(self):
        cards = _cards()
        cards[0] = {**cards[0], "incentives": ""}
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INCOMPLETE_CARD"):
            generate_incentive_map("INCMAP-T-MISSINGINCENTIVES", cards, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_one_card_missing_constraints_is_refused(self):
        cards = _cards()
        cards[0] = {**cards[0], "constraints": ""}
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INCOMPLETE_CARD"):
            generate_incentive_map("INCMAP-T-MISSINGCONSTRAINTS", cards, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_one_card_missing_stakeholder_name_is_refused(self):
        cards = _cards()
        cards[0] = {**cards[0], "stakeholder_name": ""}
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INCOMPLETE_CARD"):
            generate_incentive_map("INCMAP-T-MISSINGNAME", cards, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_whitespace_only_field_smuggled_in_via_raw_dict_is_refused(self):
        cards = _cards()
        cards[0] = {**cards[0], "risks": "   "}
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INCOMPLETE_CARD"):
            generate_incentive_map("INCMAP-T-WSRISKS", cards, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_non_list_incentive_cards_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INVALID_CARDS"):
            generate_incentive_map("INCMAP-T-NONLIST", "not a list", make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_unknown_key_smuggled_in_via_raw_dict_is_refused(self):
        cards = _cards()[:1] + [{"stakeholder_name": "x", "goals": "x", "incentives": "x", "constraints": "x", "risks": "x", "extra": "y"}]
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INVALID_CARDS"):
            generate_incentive_map("INCMAP-T-UNKNOWNKEY", cards, make_provenance("EVIDENCE", "HUMAN_APPROVED"))

    def test_missing_key_smuggled_in_via_raw_dict_is_refused(self):
        cards = _cards()
        del cards[0]["risks"]
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INVALID_CARDS"):
            generate_incentive_map("INCMAP-T-MISSINGKEY", cards, make_provenance("EVIDENCE", "HUMAN_APPROVED"))


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INVALID_ID"):
            _valid_map(map_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INVALID_ID"):
            _valid_map(map_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INVALID_VERSION"):
            generate_incentive_map("INCMAP-T-002", _cards(), make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INCMAP_INVALID_PROVENANCE"):
            generate_incentive_map("INCMAP-T-BADPROV", _cards(), {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID map's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_map(self):
        gate = evaluate_incentive_map_integrity_gate(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_cards(self):
        incentive_map = copy.deepcopy(_valid_map())
        incentive_map["incentive_cards"] = []
        gate = evaluate_incentive_map_integrity_gate(incentive_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_incomplete_card(self):
        incentive_map = copy.deepcopy(_valid_map())
        incentive_map["incentive_cards"][0]["risks"] = ""
        gate = evaluate_incentive_map_integrity_gate(incentive_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_map(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_incentive_map_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        incentive_map = copy.deepcopy(_valid_map())
        incentive_map["id"] = "WRONG-001"
        gate = evaluate_incentive_map_integrity_gate(incentive_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        incentive_map = copy.deepcopy(_valid_map())
        incentive_map["version"] = 1
        gate = evaluate_incentive_map_integrity_gate(incentive_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        incentive_map = copy.deepcopy(_valid_map())
        incentive_map["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(incentive_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_incentive_mapping_gates_returns_two_gates_in_order(self):
        results = evaluate_incentive_mapping_gates(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "incentive_map_integrity"])

    def test_evaluate_incentive_mapping_gates_all_pass_on_a_valid_map(self):
        results = evaluate_incentive_mapping_gates(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "stakeholders.incentive_mapping")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        incentive_map = _valid_map()
        self.assertEqual(set(incentive_map.keys()), {"id", "version", "generated_by_method", "incentive_cards", "provenance"})

    def test_card_does_not_leak_extra_keys(self):
        built = card("name", "goals", "incentives", "constraints", "risks")
        self.assertEqual(set(built.keys()), {"stakeholder_name", "goals", "incentives", "constraints", "risks"})


if __name__ == "__main__":
    unittest.main()
