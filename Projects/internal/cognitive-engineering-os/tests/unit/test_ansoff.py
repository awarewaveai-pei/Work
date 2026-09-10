"""Mutation-style tests for ``strategy.ansoff`` (F08 context/strategy family, 7th member).

Two real invariants beyond per-field shape (quadrant completeness/distinctness, per-quadrant content),
exercised at BOTH layers: construction-time refusal (``generate_ansoff_matrix`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation (``evaluate_ansoff_integrity_gate`` catching a
hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself). Schema
conformance is checked against the real spec-root schema this same slice added
(``typed-objects/ansoff-matrix.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.ansoff import (
    METHOD_ID,
    QUADRANT_NAMES,
    RECORD_ID_PREFIX,
    VALID_RISK_LEVELS,
    all_gates_pass,
    evaluate_ansoff_gates,
    evaluate_ansoff_integrity_gate,
    evaluate_provenance_required_gate,
    generate_ansoff_matrix,
    quadrant_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

ANSOFF_SCHEMA = "ai-lego://specs/cognitive/typed-objects/ansoff-matrix.schema.yaml"


def _quadrants(**overrides: dict) -> list[dict]:
    base = {
        "MARKET_PENETRATION": dict(quadrant="MARKET_PENETRATION", strategy_description="push harder into the existing customer base with the existing product", risk_level="LOW", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "MARKET_DEVELOPMENT": dict(quadrant="MARKET_DEVELOPMENT", strategy_description="take the existing product unmodified into a new geographic market", risk_level="MEDIUM", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "PRODUCT_DEVELOPMENT": dict(quadrant="PRODUCT_DEVELOPMENT", strategy_description="ship a new module to the existing customer base", risk_level="MEDIUM", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "DIVERSIFICATION": dict(quadrant="DIVERSIFICATION", strategy_description="enter a brand-new vertical with a brand-new, unproven product line", risk_level="HIGH", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    }
    base.update(overrides)
    return [
        quadrant_entry(v["quadrant"], v["strategy_description"], v["risk_level"], v["provenance"])
        for v in base.values()
    ]


def _valid_matrix(
    *,
    matrix_id: str = "ANSOFF-T-001",
    quadrants: list[dict] | None = None,
):
    return generate_ansoff_matrix(
        matrix_id,
        quadrants if quadrants is not None else _quadrants(),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_matrix_validates_against_the_real_schema(self):
        self.contracts.validate(ANSOFF_SCHEMA, _valid_matrix(), "ansoff matrix")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, matrix = live.invoke(METHOD_ID, generate_ansoff_matrix, "ANSOFF-T-INVOKE", _quadrants())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.ansoff.contract.yaml")
        self.assertEqual(matrix["id"], "ANSOFF-T-INVOKE")

    def test_empty_catalog_blocks_ansoff_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_matrix())
        tampered["quadrants"] = tampered["quadrants"][:3]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ANSOFF_SCHEMA, tampered, "tampered matrix")
        gate = evaluate_ansoff_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        porter-five-forces-analysis.schema.yaml's own equivalent test)."""
        matrix = _valid_matrix()
        matrix["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ANSOFF_SCHEMA, matrix, "matrix with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_quadrants_entry(self):
        matrix = _valid_matrix()
        matrix["quadrants"][0] = {**matrix["quadrants"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ANSOFF_SCHEMA, matrix, "matrix with a smuggled quadrants[] key")

    def test_id_is_distinct_from_strategy_porter_five_forces_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.porter_five_forces")
        self.assertEqual(METHOD_ID, "strategy.ansoff")

    def test_ansoff_and_porter_five_forces_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.porter_five_forces"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.ansoff.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.ansoff contract")


class QuadrantVocabularyTests(unittest.TestCase):
    def test_quadrant_names_is_exactly_the_disambiguated_four(self):
        self.assertEqual(QUADRANT_NAMES, frozenset({"MARKET_PENETRATION", "MARKET_DEVELOPMENT", "PRODUCT_DEVELOPMENT", "DIVERSIFICATION"}))

    def test_valid_risk_levels_is_exactly_low_medium_high(self):
        self.assertEqual(VALID_RISK_LEVELS, frozenset({"LOW", "MEDIUM", "HIGH"}))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ANSOFF-")

    def test_quadrant_entry_rejects_an_unknown_quadrant_name(self):
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_UNKNOWN_QUADRANT"):
            quadrant_entry("HORIZONTAL_INTEGRATION", "not one of the four", "HIGH", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_quadrant_entry_rejects_an_unknown_risk_level(self):
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INVALID_RISK_LEVEL"):
            quadrant_entry("MARKET_PENETRATION", "not one of the three", "SEVERE", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_quadrant_entry_rejects_an_empty_strategy_description(self):
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_EMPTY_STRATEGY_DESCRIPTION"):
            quadrant_entry("MARKET_PENETRATION", "   ", "LOW", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_quadrant_entry_accepts_all_4_names_and_all_3_risk_levels(self):
        for name in sorted(QUADRANT_NAMES):
            for risk in sorted(VALID_RISK_LEVELS):
                entry = quadrant_entry(name, "some strategy description", risk, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
                self.assertEqual(entry["quadrant"], name)
                self.assertEqual(entry["risk_level"], risk)


class QuadrantSetCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): quadrants must name EXACTLY the 4 QUADRANT_NAMES, each exactly once, in
    any order -- the core "closed SET, unordered, completeness required" design-shape invariant."""

    def test_valid_4_quadrants_in_canonical_order_is_accepted(self):
        matrix = _valid_matrix()
        self.assertEqual(len(matrix["quadrants"]), 4)

    def test_valid_4_quadrants_in_a_shuffled_order_is_also_accepted(self):
        """Order carries no meaning Atlas cites -- same "no position enforced" discipline
        porter_five_forces.py's own identical test establishes."""
        quadrants = _quadrants()
        shuffled = [quadrants[3], quadrants[1], quadrants[0], quadrants[2]]
        matrix = generate_ansoff_matrix("ANSOFF-T-SHUFFLED", shuffled)
        self.assertEqual({q["quadrant"] for q in matrix["quadrants"]}, QUADRANT_NAMES)

    def test_missing_one_quadrant_is_refused(self):
        quadrants = _quadrants()[:3]  # drops DIVERSIFICATION (dict insertion order preserved -- it is last)
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INCOMPLETE_QUADRANT_SET"):
            generate_ansoff_matrix("ANSOFF-T-MISSING", quadrants)

    def test_missing_all_quadrants_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INCOMPLETE_QUADRANT_SET"):
            generate_ansoff_matrix("ANSOFF-T-EMPTY", [])

    def test_duplicate_quadrant_replacing_a_different_one_is_refused(self):
        """5 slots is impossible (maxItems:4 at the schema layer already prevents 5), but a caller supplying 4
        entries where one quadrant is duplicated and another is entirely missing must still be refused by the
        runtime completeness check."""
        quadrants = _quadrants()[:3] + [_quadrants()[0]]  # MARKET_PENETRATION appears twice, DIVERSIFICATION missing
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INCOMPLETE_QUADRANT_SET"):
            generate_ansoff_matrix("ANSOFF-T-DUP", quadrants)

    def test_five_quadrants_is_refused(self):
        quadrants = _quadrants() + [quadrant_entry("MARKET_PENETRATION", "a 5th duplicate entry", "LOW", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INCOMPLETE_QUADRANT_SET"):
            generate_ansoff_matrix("ANSOFF-T-FIVE", quadrants)

    def test_non_list_quadrants_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INVALID_QUADRANT_SET"):
            generate_ansoff_matrix("ANSOFF-T-NONLIST", "not a list")

    def test_unknown_quadrant_name_smuggled_in_via_raw_dict_is_refused(self):
        quadrants = _quadrants()[:3] + [{"quadrant": "HORIZONTAL_INTEGRATION", "strategy_description": "x", "risk_level": "HIGH", "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}]
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_UNKNOWN_QUADRANT"):
            generate_ansoff_matrix("ANSOFF-T-UNKNOWNQUADRANT", quadrants)


class QuadrantContentTests(unittest.TestCase):
    """Invariant 2 (module docstring): every quadrant entry needs a non-empty strategy_description and a valid
    risk_level."""

    def test_empty_strategy_description_is_refused(self):
        quadrants = _quadrants()
        quadrants[0] = {**quadrants[0], "strategy_description": ""}
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_EMPTY_STRATEGY_DESCRIPTION"):
            generate_ansoff_matrix("ANSOFF-T-EMPTYDESC", quadrants)

    def test_whitespace_only_strategy_description_is_refused(self):
        quadrants = _quadrants()
        quadrants[0] = {**quadrants[0], "strategy_description": "   "}
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_EMPTY_STRATEGY_DESCRIPTION"):
            generate_ansoff_matrix("ANSOFF-T-WSDESC", quadrants)

    def test_invalid_risk_level_smuggled_in_via_raw_dict_is_refused(self):
        quadrants = _quadrants()
        quadrants[0] = {**quadrants[0], "risk_level": "CRITICAL"}
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INVALID_RISK_LEVEL"):
            generate_ansoff_matrix("ANSOFF-T-BADRISK", quadrants)

    def test_missing_risk_level_key_is_refused(self):
        quadrants = _quadrants()
        del quadrants[0]["risk_level"]
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INVALID_QUADRANT_SET"):
            generate_ansoff_matrix("ANSOFF-T-NORISK", quadrants)

    def test_builder_never_hardcodes_risk_level_per_quadrant_name(self):
        """Task-mandated restraint: even DIVERSIFICATION (conventionally riskiest) must accept a caller-
        supplied LOW risk_level verbatim -- the builder does not silently override or derive it from the
        quadrant name."""
        entry = quadrant_entry("DIVERSIFICATION", "a deliberately contrarian judgment call", "LOW", make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL"))
        self.assertEqual(entry["risk_level"], "LOW")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INVALID_ID"):
            _valid_matrix(matrix_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INVALID_ID"):
            _valid_matrix(matrix_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ANSOFF_INVALID_VERSION"):
            generate_ansoff_matrix("ANSOFF-T-002", _quadrants(), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID matrix's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_matrix(self):
        gate = evaluate_ansoff_integrity_gate(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_quadrant(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["quadrants"] = matrix["quadrants"][:3]
        gate = evaluate_ansoff_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicated_quadrant(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["quadrants"] = matrix["quadrants"][:3] + [matrix["quadrants"][0]]
        gate = evaluate_ansoff_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_strategy_description(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["quadrants"][0]["strategy_description"] = ""
        gate = evaluate_ansoff_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_risk_level(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["quadrants"][0]["risk_level"] = "EXTREME"
        gate = evaluate_ansoff_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_matrix(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_ansoff_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["id"] = "WRONG-001"
        gate = evaluate_ansoff_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["version"] = 1
        gate = evaluate_ansoff_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_quadrant_provenance_invalid(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["quadrants"][0]["provenance"] = None
        gate = evaluate_provenance_required_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_empty_quadrants(self):
        gate = evaluate_provenance_required_gate({"quadrants": []}, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_ansoff_gates_returns_two_gates_in_order(self):
        results = evaluate_ansoff_gates(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "ansoff_integrity"])

    def test_evaluate_ansoff_gates_all_pass_on_a_valid_matrix(self):
        results = evaluate_ansoff_gates(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.ansoff")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        matrix = _valid_matrix()
        self.assertEqual(set(matrix.keys()), {"id", "version", "generated_by_method", "quadrants"})

    def test_quadrant_entry_does_not_leak_extra_keys(self):
        entry = quadrant_entry("MARKET_PENETRATION", "text", "LOW", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual(set(entry.keys()), {"quadrant", "strategy_description", "risk_level", "provenance"})


if __name__ == "__main__":
    unittest.main()
