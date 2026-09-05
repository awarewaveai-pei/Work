"""Mutation-style tests for ``devops_sre.rto_rpo`` (thirty-eighth Method Atlas slice, thirteenth and last
member of the `devops_sre` family -- F19 complete). Atlas's own formula (business impact->tiers->
architecture->drill) is proven at BOTH independent layers -- construction-time and gate re-derivation, the
gate RE-DERIVING every field fresh from the record's own raw values rather than trusting stored ones. One
dedicated gate-layer test per scalar field (id/system_or_component/business_impact_statement/tier), the
lesson devops_sre.game_day's own critic round taught when a sibling field's own re-validation turned out
untested independently of id."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.rto_rpo import (
    METHOD_ID,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_rto_rpo_gates,
    evaluate_rto_rpo_integrity_gate,
    generate_rto_rpo_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/rto-rpo-record.schema.yaml"
TS = "2026-09-05T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _build(record_id="RTORPO-T-001", system="checkout-api order database", impact="checkout-api outage stops all revenue", tier="Tier 0 - Critical", rto=7200, rpo=300, drill_ref="DRILL-2026-09-05-001"):
    return generate_rto_rpo_record(record_id, system, impact, tier, rto, rpo, drill_ref, _prov())


def _valid_record():
    return _build()


def _valid_record_no_drill_ref():
    return _build(record_id="RTORPO-T-002", drill_ref=None)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_record_with_drill_ref_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "rto/rpo record with drill_ref")

    def test_record_without_drill_ref_validates(self):
        record = _valid_record_no_drill_ref()
        self.contracts.validate(RECORD_SCHEMA, record, "rto/rpo record without drill_ref")
        self.assertNotIn("drill_ref", record)

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_rto_rpo_record("RTORPO-T-003", "s", "i", "t", 1, 1, None, _prov(), version="2.3.4", generated_by_method="devops_sre.rto_rpo@test")
        self.assertEqual(record["generated_by_method"], "devops_sre.rto_rpo@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_tier_is_free_text_not_an_enum(self):
        """Compilation decision: no invented tier taxonomy -- any non-empty string is legal."""
        record = _build(tier="Enterprise/Sovereign Core metadata")
        self.assertEqual(record["tier"], "Enterprise/Sovereign Core metadata")

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_rtorpo_prefix(self):
        record = _valid_record()
        record["id"] = "DRILL-999"
        with self.assertRaisesRegex(Exception, "RTORPO-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_drill_ref_without_the_drill_prefix(self):
        record = _valid_record()
        record["drill_ref"] = "RTORPO-999"
        with self.assertRaisesRegex(Exception, "DRILL-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema drill_ref prefix")

    def test_schema_layer_requires_rpo_target_seconds(self):
        record = _valid_record()
        del record["rpo_target_seconds"]
        with self.assertRaisesRegex(Exception, "rpo_target_seconds"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_a_zero_rto(self):
        record = _valid_record()
        record["rto_target_seconds"] = 0
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema rto exclusiveMinimum")

    def test_schema_layer_rejects_whitespace_only_business_impact(self):
        record = _valid_record()
        record["business_impact_statement"] = "   "
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema whitespace-only business_impact_statement")

    # --- scalar fields, one dedicated test each ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_EMPTY_RECORD_ID"):
            _build(record_id="")

    def test_whitespace_only_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_EMPTY_SYSTEM_OR_COMPONENT"):
            _build(system="   ")

    def test_empty_business_impact_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_EMPTY_BUSINESS_IMPACT"):
            _build(impact="")

    def test_whitespace_only_tier_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_EMPTY_TIER"):
            _build(tier="  ")

    def test_non_string_system_or_component_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_EMPTY_SYSTEM_OR_COMPONENT"):
            _build(system=123)

    # --- rto/rpo numeric validity ---
    def test_zero_rto_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_INVALID_RTO"):
            _build(rto=0)

    def test_negative_rpo_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_INVALID_RPO"):
            _build(rpo=-1)

    def test_infinite_rto_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_INVALID_RTO"):
            _build(rto=float("inf"))

    def test_nan_rpo_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_INVALID_RPO"):
            _build(rpo=float("nan"))

    def test_bool_rto_is_refused_not_coerced(self):
        """bool is a subclass of int in Python -- True/False must be rejected as rto_target_seconds."""
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_INVALID_RTO"):
            _build(rto=True)

    def test_string_rpo_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_INVALID_RPO"):
            _build(rpo="300")

    # --- drill_ref ---
    def test_drill_ref_with_wrong_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_INVALID_DRILL_REF"):
            _build(drill_ref="RTORPO-2026-09-05-001")

    def test_drill_ref_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RTORPO_INVALID_DRILL_REF"):
            _build(drill_ref="")

    def test_drill_ref_none_is_legal_and_omitted_from_the_record(self):
        record = _valid_record_no_drill_ref()
        self.assertNotIn("drill_ref", record)

    def test_drill_ref_on_a_low_tier_record_is_still_legal(self):
        """The soft link is not restricted to any particular tier -- any record may cite a drill."""
        record = _build(tier="Tier 3 - Low", drill_ref="DRILL-2026-01-01-999")
        self.assertEqual(record["drill_ref"], "DRILL-2026-01-01-999")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_rto_rpo_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_rto_rpo_integrity_gate(record, "test", TS)

    def test_valid_record_with_drill_ref_passes_both_gates(self):
        results = evaluate_rto_rpo_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "rto_rpo_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_record_without_drill_ref_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_rto_rpo_gates(_valid_record_no_drill_ref(), "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing or empty")

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        """Regression for a critic-caught Major: all_gates_pass's own FAIL direction was untested -- mutating
        it to unconditionally return True survived the entire suite (every existing call site only asserts
        the PASS direction)."""
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_rto_rpo_gates(record, "test", TS)))

    def test_hand_tampered_empty_system_or_component_fails_the_gate(self):
        record = _valid_record()
        record["system_or_component"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "system_or_component missing or empty")

    def test_hand_tampered_empty_business_impact_statement_fails_the_gate(self):
        record = _valid_record()
        record["business_impact_statement"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "business_impact_statement missing or empty")

    def test_hand_tampered_empty_tier_fails_the_gate(self):
        record = _valid_record()
        record["tier"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "tier missing or empty")

    def test_hand_tampered_zero_rto_fails_the_gate(self):
        record = _valid_record()
        record["rto_target_seconds"] = 0
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "rto_target_seconds missing or invalid")

    def test_hand_tampered_negative_rpo_fails_the_gate(self):
        record = _valid_record()
        record["rpo_target_seconds"] = -1
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "rpo_target_seconds missing or invalid")

    def test_hand_tampered_bool_rpo_fails_the_gate(self):
        record = _valid_record()
        record["rpo_target_seconds"] = True
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "rpo_target_seconds missing or invalid")

    def test_hand_tampered_drill_ref_prefix_broken_fails_the_gate(self):
        record = _valid_record()
        record["drill_ref"] = "RTORPO-999"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "drill_ref present but malformed (missing DRILL- prefix or empty)")

    def test_hand_tampered_drill_ref_empty_string_fails_the_gate(self):
        record = _valid_record()
        record["drill_ref"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "drill_ref present but malformed (missing DRILL- prefix or empty)")

    def test_hand_tampered_drill_ref_null_fails_the_gate_not_treated_as_absent(self):
        """A present-but-null drill_ref must be refused, not silently treated as 'absent'."""
        record = _valid_record()
        record["drill_ref"] = None
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "drill_ref present but malformed (missing DRILL- prefix or empty)")

    def test_hand_tampered_missing_drill_ref_key_still_passes(self):
        """Absence (no key at all) remains legal -- only a present-but-malformed value fails."""
        record = _valid_record()
        del record["drill_ref"]
        self.assertTrue(all_gates_pass(evaluate_rto_rpo_gates(record, "test", TS)))

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
        before = copy.deepcopy(record)
        self._gate(record)
        self.assertEqual(record, before)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
