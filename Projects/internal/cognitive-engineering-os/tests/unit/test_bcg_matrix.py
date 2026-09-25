"""Mutation-style tests for ``strategy.bcg_matrix`` (F08 context/strategy family, 14th and final member).

Two real invariants beyond per-field shape (non-empty portfolio, per-item disclosed content), exercised at
BOTH layers: construction-time refusal (``generate_bcg_matrix`` raising a specific ``InvariantViolation``
code) and independent gate re-derivation (``evaluate_bcg_matrix_integrity_gate`` catching a hand-tampered raw
dict that bypassed the builder entirely, never calling the builder itself). The GENUINE_COMPUTE ``quadrant``
lookup table is confirmed TOTAL over all 4 HIGH/LOW combinations via an exhaustive ``itertools.product`` check
(same discipline ``test_vrio.py``'s own ``ClassificationTableTests`` already establishes for a 16-cell table).
Schema conformance is checked against the real spec-root schema this same slice added
(``typed-objects/bcg-matrix-analysis.schema.yaml``).
"""

from __future__ import annotations

import copy
import itertools
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.bcg_matrix import (
    CASH_COW,
    DOG,
    METHOD_ID,
    QUESTION_MARK,
    RECORD_ID_PREFIX,
    STAR,
    VALID_AXIS_VALUES,
    VALID_QUADRANTS,
    all_gates_pass,
    derive_bcg_quadrant,
    evaluate_bcg_matrix_gates,
    evaluate_bcg_matrix_integrity_gate,
    evaluate_provenance_required_gate,
    generate_bcg_matrix,
    portfolio_item,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

BCG_MATRIX_SCHEMA = "ai-lego://specs/cognitive/typed-objects/bcg-matrix-analysis.schema.yaml"


def _items(**overrides: dict) -> list[dict]:
    base = {
        "star": dict(
            item_name="flagship analytics module",
            growth_rate="HIGH", growth_rate_reasoning="category growing 22% YoY, well above company average",
            relative_share="HIGH", relative_share_reasoning="2.3x the largest competitor's share in this segment",
            provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
        "cash_cow": dict(
            item_name="legacy reporting tool",
            growth_rate="LOW", growth_rate_reasoning="category growth has slowed to under 5% YoY",
            relative_share="HIGH", relative_share_reasoning="long-standing category leader, steady cash contributor",
            provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
        "question_mark": dict(
            item_name="new real-time collaboration feature",
            growth_rate="HIGH", growth_rate_reasoning="category growing over 30% YoY",
            relative_share="LOW", relative_share_reasoning="just launched, far behind the category leader",
            provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
        ),
    }
    base.update(overrides)
    return [
        portfolio_item(v["item_name"], v["growth_rate"], v["growth_rate_reasoning"], v["relative_share"], v["relative_share_reasoning"], v["provenance"])
        for v in base.values()
    ]


def _valid_matrix(
    *,
    matrix_id: str = "BCG-T-001",
    portfolio_items: list[dict] | None = None,
):
    return generate_bcg_matrix(
        matrix_id,
        portfolio_items if portfolio_items is not None else _items(),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_matrix_validates_against_the_real_schema(self):
        self.contracts.validate(BCG_MATRIX_SCHEMA, _valid_matrix(), "bcg matrix analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, matrix = live.invoke(METHOD_ID, generate_bcg_matrix, "BCG-T-INVOKE", _items())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.bcg_matrix.contract.yaml")
        self.assertEqual(matrix["id"], "BCG-T-INVOKE")

    def test_empty_catalog_blocks_bcg_matrix_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_matrix())
        tampered["portfolio_items"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BCG_MATRIX_SCHEMA, tampered, "tampered matrix")
        gate = evaluate_bcg_matrix_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        ansoff-matrix.schema.yaml's own equivalent test)."""
        matrix = _valid_matrix()
        matrix["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BCG_MATRIX_SCHEMA, matrix, "matrix with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_portfolio_items_entry(self):
        matrix = _valid_matrix()
        matrix["portfolio_items"][0] = {**matrix["portfolio_items"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BCG_MATRIX_SCHEMA, matrix, "matrix with a smuggled portfolio_items[] key")

    def test_id_is_distinct_from_strategy_ansoff_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.ansoff")
        self.assertEqual(METHOD_ID, "strategy.bcg_matrix")

    def test_bcg_matrix_and_ansoff_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.ansoff"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.bcg_matrix.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.bcg_matrix contract")


class ClassificationTableTests(unittest.TestCase):
    """The real, standard BCG Growth-Share Matrix 2x2 classification must be TOTAL over all 4 HIGH/LOW
    combinations and match the textbook mapping exactly (exhaustive check, same discipline test_vrio.py's own
    ClassificationTableTests already establishes for a 16-cell table)."""

    EXPECTED = {
        ("HIGH", "HIGH"): STAR,
        ("LOW", "HIGH"): CASH_COW,
        ("HIGH", "LOW"): QUESTION_MARK,
        ("LOW", "LOW"): DOG,
    }

    def test_table_is_total_and_matches_the_textbook_mapping_for_all_4_combinations(self):
        for growth_rate, relative_share in itertools.product(sorted(VALID_AXIS_VALUES), repeat=2):
            with self.subTest(growth_rate=growth_rate, relative_share=relative_share):
                self.assertEqual(derive_bcg_quadrant(growth_rate, relative_share), self.EXPECTED[(growth_rate, relative_share)])

    def test_valid_quadrants_is_exactly_the_4_real_names(self):
        self.assertEqual(VALID_QUADRANTS, frozenset({"STAR", "CASH_COW", "QUESTION_MARK", "DOG"}))

    def test_derive_bcg_quadrant_rejects_an_illegal_axis_value(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_UNRESOLVABLE_QUADRANT"):
            derive_bcg_quadrant("MEDIUM", "HIGH")
        with self.assertRaisesRegex(InvariantViolation, "BCG_UNRESOLVABLE_QUADRANT"):
            derive_bcg_quadrant("HIGH", "MEDIUM")


class PortfolioItemVocabularyTests(unittest.TestCase):
    def test_valid_axis_values_is_exactly_high_low(self):
        self.assertEqual(VALID_AXIS_VALUES, frozenset({"HIGH", "LOW"}))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BCG-")

    def test_portfolio_item_rejects_an_unknown_growth_rate(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_INVALID_GROWTH_RATE"):
            portfolio_item("x", "MEDIUM", "reasoning", "HIGH", "reasoning", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_portfolio_item_rejects_an_unknown_relative_share(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_INVALID_RELATIVE_SHARE"):
            portfolio_item("x", "HIGH", "reasoning", "MEDIUM", "reasoning", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_portfolio_item_rejects_an_empty_item_name(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_EMPTY_ITEM_NAME"):
            portfolio_item("   ", "HIGH", "reasoning", "HIGH", "reasoning", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_portfolio_item_rejects_an_empty_growth_rate_reasoning(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_EMPTY_GROWTH_RATE_REASONING"):
            portfolio_item("x", "HIGH", "   ", "HIGH", "reasoning", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_portfolio_item_rejects_an_empty_relative_share_reasoning(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_EMPTY_RELATIVE_SHARE_REASONING"):
            portfolio_item("x", "HIGH", "reasoning", "HIGH", "   ", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_portfolio_item_accepts_all_4_axis_combinations(self):
        for growth_rate in sorted(VALID_AXIS_VALUES):
            for relative_share in sorted(VALID_AXIS_VALUES):
                entry = portfolio_item("x", growth_rate, "reasoning", relative_share, "reasoning", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
                self.assertEqual(entry["growth_rate"], growth_rate)
                self.assertEqual(entry["relative_share"], relative_share)

    def test_portfolio_item_does_not_leak_a_quadrant_key(self):
        """Structural elimination: portfolio_item() has no quadrant parameter at all -- see module docstring."""
        entry = portfolio_item("x", "HIGH", "reasoning", "HIGH", "reasoning", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertNotIn("quadrant", entry)
        self.assertEqual(set(entry.keys()), {"item_name", "growth_rate", "growth_rate_reasoning", "relative_share", "relative_share_reasoning", "provenance"})


class PortfolioCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): portfolio_items must be a non-empty list."""

    def test_3_items_is_accepted(self):
        matrix = _valid_matrix()
        self.assertEqual(len(matrix["portfolio_items"]), 3)

    def test_single_item_portfolio_is_accepted(self):
        matrix = generate_bcg_matrix("BCG-T-SINGLE", _items()[:1])
        self.assertEqual(len(matrix["portfolio_items"]), 1)

    def test_empty_portfolio_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_EMPTY_PORTFOLIO"):
            generate_bcg_matrix("BCG-T-EMPTY", [])

    def test_non_list_portfolio_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_EMPTY_PORTFOLIO"):
            generate_bcg_matrix("BCG-T-NONLIST", "not a list")

    def test_large_portfolio_is_accepted(self):
        """Open-ended, no maxItems -- unlike ansoff/vrio's fixed-4 closed sets, see module docstring."""
        items = _items() * 5  # 15 items, duplicates allowed (no uniqueness invariant, see contract's own compilation_decisions)
        matrix = generate_bcg_matrix("BCG-T-LARGE", items)
        self.assertEqual(len(matrix["portfolio_items"]), 15)


class PortfolioItemContentTests(unittest.TestCase):
    """Invariant 2 (module docstring): every portfolio item entry needs disclosed growth_rate/relative_share
    with non-empty reasoning, plus a non-empty item_name."""

    def test_missing_reasoning_key_smuggled_in_via_raw_dict_is_refused(self):
        items = _items()
        del items[0]["growth_rate_reasoning"]
        with self.assertRaisesRegex(InvariantViolation, "BCG_INVALID_PORTFOLIO_ITEM"):
            generate_bcg_matrix("BCG-T-NOREASONING", items)

    def test_empty_item_name_smuggled_in_via_raw_dict_is_refused(self):
        items = _items()
        items[0] = {**items[0], "item_name": ""}
        with self.assertRaisesRegex(InvariantViolation, "BCG_INVALID_PORTFOLIO_ITEM"):
            generate_bcg_matrix("BCG-T-EMPTYNAME", items)

    def test_invalid_growth_rate_smuggled_in_via_raw_dict_is_refused(self):
        items = _items()
        items[0] = {**items[0], "growth_rate": "EXTREME"}
        with self.assertRaisesRegex(InvariantViolation, "BCG_INVALID_PORTFOLIO_ITEM"):
            generate_bcg_matrix("BCG-T-BADGROWTH", items)

    def test_smuggled_quadrant_key_on_an_input_item_is_refused(self):
        """quadrant is never an accepted input key -- see portfolio_item()/module docstring."""
        items = _items()
        items[0] = {**items[0], "quadrant": "STAR"}
        with self.assertRaisesRegex(InvariantViolation, "BCG_INVALID_PORTFOLIO_ITEM"):
            generate_bcg_matrix("BCG-T-SMUGGLEDQUADRANT", items)

    def test_builder_never_hardcodes_quadrant_and_always_computes_the_real_mapping(self):
        matrix = _valid_matrix()
        by_name = {item["item_name"]: item["quadrant"] for item in matrix["portfolio_items"]}
        self.assertEqual(by_name["flagship analytics module"], "STAR")
        self.assertEqual(by_name["legacy reporting tool"], "CASH_COW")
        self.assertEqual(by_name["new real-time collaboration feature"], "QUESTION_MARK")

    def test_dog_quadrant_is_reachable(self):
        matrix = generate_bcg_matrix(
            "BCG-T-DOG",
            [portfolio_item("declining print add-on", "LOW", "shrinking category", "LOW", "far behind the category leader", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))],
        )
        self.assertEqual(matrix["portfolio_items"][0]["quadrant"], "DOG")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_INVALID_ID"):
            _valid_matrix(matrix_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_INVALID_ID"):
            _valid_matrix(matrix_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BCG_INVALID_VERSION"):
            generate_bcg_matrix("BCG-T-002", _items(), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID matrix's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_matrix(self):
        gate = evaluate_bcg_matrix_integrity_gate(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_portfolio(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["portfolio_items"] = []
        gate = evaluate_bcg_matrix_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_quadrant_disagreeing_with_its_own_axes(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["portfolio_items"][0]["quadrant"] = "DOG"  # was STAR (HIGH/HIGH)
        gate = evaluate_bcg_matrix_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_reasoning(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["portfolio_items"][0]["growth_rate_reasoning"] = ""
        gate = evaluate_bcg_matrix_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_axis_value(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["portfolio_items"][0]["relative_share"] = "EXTREME"
        gate = evaluate_bcg_matrix_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_matrix(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_bcg_matrix_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["id"] = "WRONG-001"
        gate = evaluate_bcg_matrix_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["version"] = 1
        gate = evaluate_bcg_matrix_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_an_item_provenance_invalid(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["portfolio_items"][0]["provenance"] = None
        gate = evaluate_provenance_required_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_empty_portfolio_items(self):
        gate = evaluate_provenance_required_gate({"portfolio_items": []}, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_bcg_matrix_gates_returns_two_gates_in_order(self):
        results = evaluate_bcg_matrix_gates(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "bcg_matrix_integrity"])

    def test_evaluate_bcg_matrix_gates_all_pass_on_a_valid_matrix(self):
        results = evaluate_bcg_matrix_gates(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.bcg_matrix")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        matrix = _valid_matrix()
        self.assertEqual(set(matrix.keys()), {"id", "version", "generated_by_method", "portfolio_items"})


if __name__ == "__main__":
    unittest.main()
