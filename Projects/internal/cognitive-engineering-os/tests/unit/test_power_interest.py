"""Mutation-style tests for ``stakeholders.power_interest`` (F07 stakeholder/power/negotiation family,
OPENING member).

Two real invariants beyond id/version/provenance shape (non-empty stakeholders, per-stakeholder disclosed
content), exercised at BOTH layers: construction-time refusal (``generate_power_interest_matrix`` raising a
specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_power_interest_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). The GENUINE_COMPUTE ``quadrant`` lookup table is confirmed TOTAL
over all 4 HIGH/LOW combinations via an exhaustive ``itertools.product`` check, same discipline
``test_bcg_matrix.py``'s own ``ClassificationTableTests`` already establishes for its own 4-cell table.
Schema conformance is checked against the real spec-root schema this same slice added
(``typed-objects/power-interest-matrix.schema.yaml``).
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
from ai_lego.modules.stakeholders.power_interest import (
    HIGH_THRESHOLD,
    KEEP_INFORMED,
    KEEP_SATISFIED,
    MANAGE_CLOSELY,
    MAX_SCORE,
    METHOD_ID,
    MIN_SCORE,
    MONITOR,
    RECORD_ID_PREFIX,
    VALID_QUADRANTS,
    all_gates_pass,
    derive_power_interest_quadrant,
    evaluate_power_interest_gates,
    evaluate_power_interest_integrity_gate,
    evaluate_provenance_required_gate,
    generate_power_interest_matrix,
    stakeholder_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

POWER_INTEREST_MATRIX_SCHEMA = "ai-lego://specs/cognitive/typed-objects/power-interest-matrix.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "AI_SUGGESTED")


def _score_level(score: int) -> str:
    return "HIGH" if score >= HIGH_THRESHOLD else "LOW"


def _stakeholders(**overrides: dict) -> list[dict]:
    base = {
        "manage_closely": dict(
            stakeholder_name="投資人董事會", power_score=9, power_reasoning="掌握預算核准權，可直接否決重大決策",
            interest_score=8, interest_reasoning="本次產品線是下一輪募資的主要故事，高度關注上市時程",
        ),
        "keep_satisfied": dict(
            stakeholder_name="現有付費客戶社群", power_score=8, power_reasoning="口碑與續約率直接影響營收",
            interest_score=3, interest_reasoning="多數客戶只在乎現有功能穩定，對新產品線關注度低",
        ),
        "monitor": dict(
            stakeholder_name="外部 SEO 內容外包團隊", power_score=2, power_reasoning="僅負責內容產出，無決定權",
            interest_score=2, interest_reasoning="只需按合約交付內容，沒有特別關注",
        ),
        "keep_informed": dict(
            stakeholder_name="內部客服團隊", power_score=3, power_reasoning="無產品決策權，僅能回報客訴趨勢",
            interest_score=7, interest_reasoning="上線後第一線承接客訴，高度關注上線細節",
        ),
    }
    base.update(overrides)
    return [
        stakeholder_entry(v["stakeholder_name"], v["power_score"], v["power_reasoning"], v["interest_score"], v["interest_reasoning"])
        for v in base.values()
    ]


def _valid_matrix(
    *,
    matrix_id: str = "POWINT-T-001",
    stakeholders: list[dict] | None = None,
    provenance: dict | None = None,
):
    return generate_power_interest_matrix(
        matrix_id,
        stakeholders if stakeholders is not None else _stakeholders(),
        provenance if provenance is not None else PROVENANCE,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_matrix_validates_against_the_real_schema(self):
        self.contracts.validate(POWER_INTEREST_MATRIX_SCHEMA, _valid_matrix(), "power interest matrix")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, matrix = live.invoke(METHOD_ID, generate_power_interest_matrix, "POWINT-T-INVOKE", _stakeholders(), PROVENANCE)
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/stakeholders.power_interest.contract.yaml")
        self.assertEqual(matrix["id"], "POWINT-T-INVOKE")

    def test_empty_catalog_blocks_power_interest_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_matrix())
        tampered["stakeholders"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(POWER_INTEREST_MATRIX_SCHEMA, tampered, "tampered matrix")
        gate = evaluate_power_interest_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        matrix = _valid_matrix()
        matrix["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(POWER_INTEREST_MATRIX_SCHEMA, matrix, "matrix with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_stakeholders_entry(self):
        matrix = _valid_matrix()
        matrix["stakeholders"][0] = {**matrix["stakeholders"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(POWER_INTEREST_MATRIX_SCHEMA, matrix, "matrix with a smuggled stakeholders[] key")

    def test_schema_rejects_an_importance_rank_key_smuggled_into_a_stakeholders_entry(self):
        """§11.15's own explicit reverse caution ('不是判斷誰比較「重要的人」') is enforced structurally --
        the schema's additionalProperties:false rejects an importance_rank key exactly like any other
        smuggled key, since no such key is ever declared."""
        matrix = _valid_matrix()
        matrix["stakeholders"][0] = {**matrix["stakeholders"][0], "importance_rank": 1}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(POWER_INTEREST_MATRIX_SCHEMA, matrix, "matrix with a smuggled importance_rank key")

    def test_id_is_distinct_from_strategy_bcg_matrix_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.bcg_matrix")
        self.assertEqual(METHOD_ID, "stakeholders.power_interest")

    def test_power_interest_and_bcg_matrix_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.bcg_matrix"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "stakeholders.power_interest.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "stakeholders.power_interest contract")


class ClassificationTableTests(unittest.TestCase):
    """The mermaid quadrantChart's own 4-cell classification (module docstring's independently-verified
    quadrant-N geometric convention) must be TOTAL over all 4 HIGH/LOW combinations and match the documented
    mapping exactly (exhaustive check, same discipline test_bcg_matrix.py's own ClassificationTableTests
    already establishes)."""

    EXPECTED = {
        ("HIGH", "HIGH"): MANAGE_CLOSELY,
        ("HIGH", "LOW"): KEEP_SATISFIED,
        ("LOW", "HIGH"): KEEP_INFORMED,
        ("LOW", "LOW"): MONITOR,
    }

    def test_table_is_total_and_matches_the_documented_mapping_for_all_4_combinations(self):
        levels = {"HIGH": MAX_SCORE, "LOW": MIN_SCORE}
        for power_level, interest_level in itertools.product(sorted(levels), repeat=2):
            with self.subTest(power_level=power_level, interest_level=interest_level):
                quadrant = derive_power_interest_quadrant(levels[power_level], levels[interest_level])
                self.assertEqual(quadrant, self.EXPECTED[(power_level, interest_level)])

    def test_valid_quadrants_is_exactly_the_4_real_names(self):
        self.assertEqual(VALID_QUADRANTS, frozenset({"MANAGE_CLOSELY", "KEEP_SATISFIED", "MONITOR", "KEEP_INFORMED"}))

    def test_high_threshold_splits_1_to_10_evenly_with_no_tie(self):
        self.assertEqual(MIN_SCORE, 1)
        self.assertEqual(MAX_SCORE, 10)
        self.assertEqual(HIGH_THRESHOLD, 6)
        self.assertEqual(_score_level(5), "LOW")
        self.assertEqual(_score_level(6), "HIGH")

    def test_derive_power_interest_quadrant_rejects_a_score_out_of_range(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_SCORE_OUT_OF_RANGE"):
            derive_power_interest_quadrant(0, 5)
        with self.assertRaisesRegex(InvariantViolation, "POWINT_SCORE_OUT_OF_RANGE"):
            derive_power_interest_quadrant(5, 11)

    def test_derive_power_interest_quadrant_rejects_a_bool_masquerading_as_a_score(self):
        """Critic-class finding this batch is explicitly told to avoid: bool is a subclass of int in Python
        (True == 1, False == 0) -- neither may masquerade as a real score."""
        with self.assertRaisesRegex(InvariantViolation, "POWINT_SCORE_OUT_OF_RANGE"):
            derive_power_interest_quadrant(True, 5)
        with self.assertRaisesRegex(InvariantViolation, "POWINT_SCORE_OUT_OF_RANGE"):
            derive_power_interest_quadrant(5, False)


class StakeholderEntryVocabularyTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "POWINT-")

    def test_stakeholder_entry_rejects_an_out_of_range_power_score(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_POWER_SCORE"):
            stakeholder_entry("x", 11, "reasoning", 5, "reasoning")
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_POWER_SCORE"):
            stakeholder_entry("x", 0, "reasoning", 5, "reasoning")

    def test_stakeholder_entry_rejects_an_out_of_range_interest_score(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_INTEREST_SCORE"):
            stakeholder_entry("x", 5, "reasoning", 11, "reasoning")

    def test_stakeholder_entry_rejects_a_bool_masquerading_as_power_score(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_POWER_SCORE"):
            stakeholder_entry("x", True, "reasoning", 5, "reasoning")

    def test_stakeholder_entry_rejects_a_bool_masquerading_as_interest_score(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_INTEREST_SCORE"):
            stakeholder_entry("x", 5, "reasoning", False, "reasoning")

    def test_stakeholder_entry_rejects_an_empty_stakeholder_name(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_EMPTY_STAKEHOLDER_NAME"):
            stakeholder_entry("   ", 5, "reasoning", 5, "reasoning")

    def test_stakeholder_entry_rejects_an_empty_power_reasoning(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_EMPTY_POWER_REASONING"):
            stakeholder_entry("x", 5, "   ", 5, "reasoning")

    def test_stakeholder_entry_rejects_an_empty_interest_reasoning(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_EMPTY_INTEREST_REASONING"):
            stakeholder_entry("x", 5, "reasoning", 5, "   ")

    def test_stakeholder_entry_accepts_the_full_1_to_10_score_range(self):
        for score in range(MIN_SCORE, MAX_SCORE + 1):
            entry = stakeholder_entry("x", score, "reasoning", score, "reasoning")
            self.assertEqual(entry["power_score"], score)
            self.assertEqual(entry["interest_score"], score)

    def test_stakeholder_entry_does_not_leak_a_quadrant_key(self):
        """Structural elimination: stakeholder_entry() has no quadrant parameter at all -- see module
        docstring."""
        entry = stakeholder_entry("x", 5, "reasoning", 5, "reasoning")
        self.assertNotIn("quadrant", entry)
        self.assertEqual(set(entry.keys()), {"stakeholder_name", "power_score", "power_reasoning", "interest_score", "interest_reasoning"})

    def test_stakeholder_entry_has_no_importance_or_rank_parameter(self):
        """§11.15's own explicit reverse caution ('不是判斷誰比較「重要的人」') -- structurally, this builder
        cannot accept any ranking-flavored input at all."""
        with self.assertRaises(TypeError):
            stakeholder_entry("x", 5, "reasoning", 5, "reasoning", importance_rank=1)  # type: ignore[call-arg]


class StakeholderCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): stakeholders must be a non-empty list."""

    def test_4_stakeholders_is_accepted(self):
        matrix = _valid_matrix()
        self.assertEqual(len(matrix["stakeholders"]), 4)

    def test_single_stakeholder_matrix_is_accepted(self):
        matrix = generate_power_interest_matrix("POWINT-T-SINGLE", _stakeholders()[:1], PROVENANCE)
        self.assertEqual(len(matrix["stakeholders"]), 1)

    def test_empty_stakeholders_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_EMPTY_STAKEHOLDERS"):
            generate_power_interest_matrix("POWINT-T-EMPTY", [], PROVENANCE)

    def test_non_list_stakeholders_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_EMPTY_STAKEHOLDERS"):
            generate_power_interest_matrix("POWINT-T-NONLIST", "not a list", PROVENANCE)

    def test_large_stakeholder_set_is_accepted(self):
        """Open-ended, no maxItems -- see module docstring."""
        stakeholders = _stakeholders() * 5  # 20 entries, duplicates allowed (no uniqueness invariant)
        matrix = generate_power_interest_matrix("POWINT-T-LARGE", stakeholders, PROVENANCE)
        self.assertEqual(len(matrix["stakeholders"]), 20)


class StakeholderContentTests(unittest.TestCase):
    """Invariant 2 (module docstring): every stakeholders[] entry needs disclosed power_score/interest_score
    with non-empty reasoning, plus a non-empty stakeholder_name."""

    def test_missing_reasoning_key_smuggled_in_via_raw_dict_is_refused(self):
        stakeholders = _stakeholders()
        del stakeholders[0]["power_reasoning"]
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_STAKEHOLDER_ENTRY"):
            generate_power_interest_matrix("POWINT-T-NOREASONING", stakeholders, PROVENANCE)

    def test_empty_stakeholder_name_smuggled_in_via_raw_dict_is_refused(self):
        stakeholders = _stakeholders()
        stakeholders[0] = {**stakeholders[0], "stakeholder_name": ""}
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_STAKEHOLDER_ENTRY"):
            generate_power_interest_matrix("POWINT-T-EMPTYNAME", stakeholders, PROVENANCE)

    def test_out_of_range_power_score_smuggled_in_via_raw_dict_is_refused(self):
        stakeholders = _stakeholders()
        stakeholders[0] = {**stakeholders[0], "power_score": 99}
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_STAKEHOLDER_ENTRY"):
            generate_power_interest_matrix("POWINT-T-BADSCORE", stakeholders, PROVENANCE)

    def test_smuggled_quadrant_key_on_an_input_entry_is_refused(self):
        """quadrant is never an accepted input key -- see stakeholder_entry()/module docstring."""
        stakeholders = _stakeholders()
        stakeholders[0] = {**stakeholders[0], "quadrant": "MANAGE_CLOSELY"}
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_STAKEHOLDER_ENTRY"):
            generate_power_interest_matrix("POWINT-T-SMUGGLEDQUADRANT", stakeholders, PROVENANCE)

    def test_builder_never_hardcodes_quadrant_and_always_computes_the_real_mapping(self):
        matrix = _valid_matrix()
        by_name = {item["stakeholder_name"]: item["quadrant"] for item in matrix["stakeholders"]}
        self.assertEqual(by_name["投資人董事會"], "MANAGE_CLOSELY")
        self.assertEqual(by_name["現有付費客戶社群"], "KEEP_SATISFIED")
        self.assertEqual(by_name["外部 SEO 內容外包團隊"], "MONITOR")
        self.assertEqual(by_name["內部客服團隊"], "KEEP_INFORMED")


class IdVersionAndProvenanceTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_ID"):
            _valid_matrix(matrix_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_ID"):
            _valid_matrix(matrix_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_VERSION"):
            generate_power_interest_matrix("POWINT-T-002", _stakeholders(), PROVENANCE, version=1)

    def test_invalid_provenance_is_refused_at_construction(self):
        """Builder-validates-provenance discipline (insight.jtbd's own precedent, not
        divergent.lotus_blossom's gate-only variant) -- see module docstring."""
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_PROVENANCE"):
            _valid_matrix(provenance={"epistemic_type": "NOT_REAL"})

    def test_none_provenance_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "POWINT_INVALID_PROVENANCE"):
            generate_power_interest_matrix("POWINT-T-003", _stakeholders(), None)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID matrix's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_matrix(self):
        gate = evaluate_power_interest_integrity_gate(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_stakeholders(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["stakeholders"] = []
        gate = evaluate_power_interest_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_quadrant_disagreeing_with_its_own_scores(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["stakeholders"][0]["quadrant"] = "MONITOR"  # was MANAGE_CLOSELY (HIGH/HIGH)
        gate = evaluate_power_interest_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_reasoning(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["stakeholders"][0]["power_reasoning"] = ""
        gate = evaluate_power_interest_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_out_of_range_score(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["stakeholders"][0]["interest_score"] = 99
        gate = evaluate_power_interest_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_bool_masquerading_as_a_score(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["stakeholders"][0]["power_score"] = True
        gate = evaluate_power_interest_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_matrix(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_power_interest_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["id"] = "WRONG-001"
        gate = evaluate_power_interest_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["version"] = 1
        gate = evaluate_power_interest_integrity_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        matrix = copy.deepcopy(_valid_matrix())
        matrix["provenance"] = None
        gate = evaluate_provenance_required_gate(matrix, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_power_interest_gates_returns_two_gates_in_order(self):
        results = evaluate_power_interest_gates(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "power_interest_integrity"])

    def test_evaluate_power_interest_gates_all_pass_on_a_valid_matrix(self):
        results = evaluate_power_interest_gates(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "stakeholders.power_interest")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        matrix = _valid_matrix()
        self.assertEqual(set(matrix.keys()), {"id", "version", "generated_by_method", "stakeholders", "provenance"})


if __name__ == "__main__":
    unittest.main()
