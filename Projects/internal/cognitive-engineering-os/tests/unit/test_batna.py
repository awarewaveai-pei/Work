"""Mutation-style tests for ``stakeholders.batna`` (F07 stakeholder/power/negotiation family, OPENING member).

Two real invariants (referential integrity of ``best_alternative_id`` into ``alternatives[].id``; genuine-
compute ``reservation_point`` = selected alternative's own value_estimate minus cost_estimate) plus the
``alternatives`` floor (non-empty, well-shaped, unique ids), exercised at BOTH layers: construction-time
refusal (``generate_batna_analysis`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_batna_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/batna.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.stakeholders.batna import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_batna_gates,
    evaluate_batna_integrity_gate,
    evaluate_provenance_required_gate,
    generate_batna_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

BATNA_SCHEMA = "ai-lego://specs/cognitive/typed-objects/batna.schema.yaml"
PROVENANCE = make_provenance("CALCULATED_RESULT", "HUMAN_ORIGINAL")


def _alternatives(**overrides: object) -> list:
    base = [
        {"id": "ALT-STATUS-QUO", "label": "維持現狀", "value_estimate": 20.0, "cost_estimate": 5.0},
        {"id": "ALT-SWITCH-VENDOR-B", "label": "改用供應商 B", "value_estimate": 60.0, "cost_estimate": 15.0},
        {"id": "ALT-IN-HOUSE", "label": "自建內部能力", "value_estimate": 80.0, "cost_estimate": 50.0},
    ]
    if "alternatives" in overrides:
        return overrides["alternatives"]
    return base


def _kwargs(**overrides: object) -> dict:
    base = dict(
        subject="供應商合約續約談判 -- Q4",
        alternatives=_alternatives(),
        best_alternative_id="ALT-SWITCH-VENDOR-B",
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "BATNA-T-001", **overrides: object):
    return generate_batna_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(BATNA_SCHEMA, _valid_analysis(), "batna analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_batna_analysis, "BATNA-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/stakeholders.batna.contract.yaml")
        self.assertEqual(analysis["id"], "BATNA-T-INVOKE")

    def test_empty_catalog_blocks_batna_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_analysis())
        tampered["alternatives"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BATNA_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_batna_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BATNA_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_an_unknown_alternative_key(self):
        analysis = _valid_analysis()
        analysis["alternatives"][0]["confidence"] = 0.9
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BATNA_SCHEMA, analysis, "analysis with a smuggled alternative-level key")

    def test_schema_rejects_missing_best_alternative_id(self):
        analysis = _valid_analysis()
        del analysis["best_alternative_id"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BATNA_SCHEMA, analysis, "analysis with best_alternative_id removed")

    def test_id_is_distinct_from_a_sibling_f07_machine_id(self):
        self.assertEqual(METHOD_ID, "stakeholders.batna")
        self.assertNotEqual(METHOD_ID, "stakeholders.zopa")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "stakeholders.batna.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "stakeholders.batna contract")


class AlternativesFloorTests(unittest.TestCase):
    """Step 1-2's own floor: alternatives non-empty, well-shaped, unique ids."""

    def test_well_formed_analysis_is_accepted(self):
        analysis = _valid_analysis()
        self.assertEqual(len(analysis["alternatives"]), 3)

    def test_empty_alternatives_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_ALTERNATIVES"):
            _valid_analysis(alternatives=[])

    def test_non_list_alternatives_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_ALTERNATIVES"):
            _valid_analysis(alternatives="not-a-list")

    def test_alternative_missing_a_key_is_refused(self):
        bad = [{"id": "ALT-A", "label": "A", "value_estimate": 1.0}]  # cost_estimate missing
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_ALTERNATIVES"):
            _valid_analysis(alternatives=bad, best_alternative_id="ALT-A")

    def test_alternative_with_extra_key_is_refused(self):
        bad = [{"id": "ALT-A", "label": "A", "value_estimate": 1.0, "cost_estimate": 0.5, "confidence": 0.9}]
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_ALTERNATIVES"):
            _valid_analysis(alternatives=bad, best_alternative_id="ALT-A")

    def test_alternative_with_non_numeric_value_estimate_is_refused(self):
        bad = [{"id": "ALT-A", "label": "A", "value_estimate": "high", "cost_estimate": 0.5}]
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_ALTERNATIVES"):
            _valid_analysis(alternatives=bad, best_alternative_id="ALT-A")

    def test_alternative_with_boolean_value_estimate_is_refused(self):
        """bool is an int subclass in Python -- must not silently pass the numeric check."""
        bad = [{"id": "ALT-A", "label": "A", "value_estimate": True, "cost_estimate": 0.5}]
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_ALTERNATIVES"):
            _valid_analysis(alternatives=bad, best_alternative_id="ALT-A")

    def test_alternative_with_non_finite_cost_estimate_is_refused(self):
        bad = [{"id": "ALT-A", "label": "A", "value_estimate": 1.0, "cost_estimate": float("inf")}]
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_ALTERNATIVES"):
            _valid_analysis(alternatives=bad, best_alternative_id="ALT-A")

    def test_alternative_with_empty_id_is_refused(self):
        bad = [{"id": "", "label": "A", "value_estimate": 1.0, "cost_estimate": 0.5}]
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_ALTERNATIVES"):
            _valid_analysis(alternatives=bad, best_alternative_id="")

    def test_duplicate_alternative_id_is_refused(self):
        dup = [
            {"id": "ALT-A", "label": "A", "value_estimate": 1.0, "cost_estimate": 0.5},
            {"id": "ALT-A", "label": "A again", "value_estimate": 2.0, "cost_estimate": 1.0},
        ]
        with self.assertRaisesRegex(InvariantViolation, "BATNA_DUPLICATE_ALTERNATIVE_ID"):
            _valid_analysis(alternatives=dup, best_alternative_id="ALT-A")

    def test_single_alternative_is_a_legitimate_complete_batna(self):
        """Atlas's own plural wording describes the general case, not a floor of 2 -- a single, well-estimated
        fallback is a legitimate, complete BATNA."""
        single = [{"id": "ALT-ONLY", "label": "Only option", "value_estimate": 10.0, "cost_estimate": 2.0}]
        analysis = _valid_analysis(alternatives=single, best_alternative_id="ALT-ONLY")
        self.assertEqual(analysis["reservation_point"], 8.0)


class ReferentialIntegrityTests(unittest.TestCase):
    """Invariant: best_alternative_id (step 3) must equal a real alternatives[].id."""

    def test_best_alternative_id_matching_a_real_id_is_accepted(self):
        # ALT-SWITCH-VENDOR-B (net 45.0) is the actual optimum of the default 3-alternative fixture --
        # BATNA_BEST_ALTERNATIVE_NOT_OPTIMAL (added 2026-09-11, critic-found gap) now requires the selected
        # id to genuinely be the best one, not merely a real one.
        analysis = _valid_analysis(best_alternative_id="ALT-SWITCH-VENDOR-B")
        self.assertEqual(analysis["best_alternative_id"], "ALT-SWITCH-VENDOR-B")

    def test_best_alternative_id_naming_no_real_alternative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_BEST_ALTERNATIVE_NOT_FOUND"):
            _valid_analysis(best_alternative_id="ALT-DOES-NOT-EXIST")

    def test_empty_best_alternative_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_BEST_ALTERNATIVE_NOT_FOUND"):
            _valid_analysis(best_alternative_id="")

    def test_none_best_alternative_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_BEST_ALTERNATIVE_NOT_FOUND"):
            _valid_analysis(best_alternative_id=None)


class OptimalityTests(unittest.TestCase):
    """Critic-found gap (2026-09-11): referential integrity alone (BATNA_BEST_ALTERNATIVE_NOT_FOUND) only
    confirmed best_alternative_id resolves to a REAL alternative, not that it is the BEST one -- §11.16 step
    3 is literally "選最佳 BATNA" (select the BEST). Naming a strictly inferior, but real, alternative
    (ALT-STATUS-QUO nets 15.0 vs. ALT-SWITCH-VENDOR-B's 45.0 in the default fixture) previously passed."""

    def test_naming_a_strictly_inferior_real_alternative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_BEST_ALTERNATIVE_NOT_OPTIMAL"):
            _valid_analysis(best_alternative_id="ALT-STATUS-QUO")

    def test_naming_the_actual_optimum_is_accepted(self):
        analysis = _valid_analysis(best_alternative_id="ALT-SWITCH-VENDOR-B")
        self.assertEqual(analysis["reservation_point"], 60.0 - 15.0)

    def test_tie_for_optimum_either_alternative_is_accepted(self):
        """Ties are legitimate (>=, not >) -- either alternative achieving the max net value is a valid
        'best' selection, not just the first one encountered."""
        tied = [
            {"id": "ALT-A", "label": "A", "value_estimate": 100.0, "cost_estimate": 50.0},
            {"id": "ALT-B", "label": "B", "value_estimate": 80.0, "cost_estimate": 30.0},
        ]
        first = _valid_analysis(alternatives=tied, best_alternative_id="ALT-A")
        second = _valid_analysis(alternatives=tied, best_alternative_id="ALT-B")
        self.assertEqual(first["reservation_point"], second["reservation_point"])


class GenuineComputeReservationPointTests(unittest.TestCase):
    """Invariant: reservation_point (step 5) is ALWAYS computed as the selected alternative's own
    value_estimate minus cost_estimate -- never accepted as a constructor input."""

    def test_reservation_point_equals_value_minus_cost_of_the_selected_alternative(self):
        analysis = _valid_analysis(best_alternative_id="ALT-SWITCH-VENDOR-B")
        self.assertEqual(analysis["reservation_point"], 60.0 - 15.0)

    def test_reservation_point_tracks_whichever_alternative_is_selected(self):
        """A real referential-traceability check, not just an adjacent-field coincidence: selecting the
        (genuinely optimal, per BATNA_BEST_ALTERNATIVE_NOT_OPTIMAL) best_alternative_id against a DIFFERENT
        alternatives[] list changes the computed reservation_point to match that list's own best option --
        not a hardcoded/first-entry value. (Both cases must select their own list's actual optimum since
        2026-09-11's critic-found optimality fix -- this no longer free-selects among status-quo/in-house of
        the same shared fixture, one of which was never the optimum.)"""
        best_of_default = _valid_analysis(best_alternative_id="ALT-SWITCH-VENDOR-B")
        single_alt = _valid_analysis(
            alternatives=[{"id": "ALT-ONLY", "label": "唯一選項", "value_estimate": 80.0, "cost_estimate": 50.0}],
            best_alternative_id="ALT-ONLY",
        )
        self.assertEqual(best_of_default["reservation_point"], 60.0 - 15.0)
        self.assertEqual(single_alt["reservation_point"], 80.0 - 50.0)
        self.assertNotEqual(best_of_default["reservation_point"], single_alt["reservation_point"])

    def test_generate_batna_analysis_has_no_reservation_point_parameter(self):
        """A caller cannot smuggle in an unrelated reservation_point -- the builder's own signature has no such
        parameter at all."""
        import inspect

        signature = inspect.signature(generate_batna_analysis)
        self.assertNotIn("reservation_point", signature.parameters)


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BATNA-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_ID"):
            _valid_analysis(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_VERSION"):
            generate_batna_analysis("BATNA-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BATNA_EMPTY_SUBJECT"):
            _valid_analysis(subject="   ")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_batna_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_integrity_gate_catches_hand_tampered_reservation_point(self):
        record = copy.deepcopy(_valid_analysis())
        record["reservation_point"] = record["reservation_point"] + 1000.0
        gate = evaluate_batna_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_unknown_best_alternative_id(self):
        record = copy.deepcopy(_valid_analysis())
        record["best_alternative_id"] = "ALT-GHOST"
        gate = evaluate_batna_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_self_consistent_but_non_optimal_best_alternative(self):
        """Critic-found gap (2026-09-11): a hand-tampered record where best_alternative_id names a REAL,
        non-optimal alternative and reservation_point IS correctly recomputed for that (non-optimal) choice
        -- self-consistent, but not actually the best available (ALT-STATUS-QUO nets 15.0; ALT-SWITCH-VENDOR-B
        in the same fixture nets 45.0). The earlier reservation_point-mismatch check alone would NOT have
        caught this; a dedicated optimality re-derivation is required. Hand-built directly (not via the
        builder, which now itself refuses this) to test the gate's own independent re-derivation."""
        record = copy.deepcopy(_valid_analysis())
        record["best_alternative_id"] = "ALT-STATUS-QUO"
        record["reservation_point"] = 20.0 - 5.0  # correctly recomputed for ALT-STATUS-QUO -- self-consistent
        gate = evaluate_batna_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_duplicate_alternative_id(self):
        record = copy.deepcopy(_valid_analysis())
        record["alternatives"][0]["id"] = record["alternatives"][1]["id"]
        gate = evaluate_batna_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_nan_reservation_point(self):
        """NaN-tampering must not slip through a naive abs()-based comparison."""
        record = copy.deepcopy(_valid_analysis())
        record["reservation_point"] = float("nan")
        gate = evaluate_batna_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_batna_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_analysis())
        record["id"] = "WRONG-001"
        gate = evaluate_batna_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_analysis())
        record["version"] = 1
        gate = evaluate_batna_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_analysis())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_batna_gates_returns_two_gates_in_order(self):
        results = evaluate_batna_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "batna_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "stakeholders.batna")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "subject", "alternatives", "best_alternative_id", "reservation_point", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
