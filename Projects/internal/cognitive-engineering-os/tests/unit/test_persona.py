"""Mutation-style tests for ``insight.persona`` (F06 human/customer-insight family, 2nd member, FIRST-EVER
F06 module).

The real invariant (Atlas's own "Persona ≠ 真實民意" caution, mechanized as ``research_basis``
non-emptiness) plus the weaker "goals/behavior/context" completeness invariant, each exercised at BOTH
layers: construction-time refusal (``generate_persona_profile`` raising a specific ``InvariantViolation``
code) and independent gate re-derivation (``evaluate_research_basis_required_gate``/
``evaluate_persona_completeness_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root
schema this same slice added (``typed-objects/persona-profile.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.insight.persona import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_persona_completeness_gate,
    evaluate_persona_gates,
    evaluate_provenance_required_gate,
    evaluate_research_basis_required_gate,
    generate_persona_profile,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

PERSONA_SCHEMA = "ai-lego://specs/cognitive/typed-objects/persona-profile.schema.yaml"


def _kwargs(**overrides: object) -> dict:
    base = dict(
        persona_id="PERSONA-T-001",
        persona_name="獨立接案行銷顧問 Mei",
        goals=["在單一工作區內管理多個客戶的行銷活動成效", "減少每週花在手動報表整理上的時間"],
        behaviors=["每週一早上手動登入每個客戶的廣告後台匯出數據", "習慣用試算表比對不同客戶的成效指標"],
        context="同時服務 5-8 個中小企業客戶，多數客戶預算有限，工具採購決策需自行負擔成本",
        research_basis=[
            "2026-08 對 6 位獨立接案行銷顧問的半結構式訪談逐字稿（coding 主題：跨客戶報表疲勞）",
            "2026-07 匿名問卷（n=42 獨立行銷顧問），78% 回報每週花 3 小時以上在手動報表整理",
        ],
        provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )
    base.update(overrides)
    return base


def _valid_persona(**overrides: object) -> dict:
    return generate_persona_profile(**_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_persona_validates_against_the_real_schema(self):
        self.contracts.validate(PERSONA_SCHEMA, _valid_persona(), "persona profile")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, persona = live.invoke(METHOD_ID, generate_persona_profile, **_kwargs(persona_id="PERSONA-T-INVOKE"))
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/insight.persona.contract.yaml")
        self.assertEqual(persona["id"], "PERSONA-T-INVOKE")

    def test_empty_catalog_blocks_persona_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "insight.persona.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "insight.persona contract")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_INVALID_ID"):
            _valid_persona(persona_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_INVALID_ID"):
            _valid_persona(persona_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_INVALID_VERSION"):
            _valid_persona(version=1)

    def test_id_is_distinct_from_a_sibling_f06_machine_id_shape(self):
        self.assertEqual(METHOD_ID, "insight.persona")
        self.assertTrue(METHOD_ID.startswith("insight."))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "PERSONA-")


class NameCompletenessTests(unittest.TestCase):
    def test_empty_persona_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_NAME"):
            _valid_persona(persona_name="")

    def test_whitespace_only_persona_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_NAME"):
            _valid_persona(persona_name="   ")

    def test_none_persona_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_NAME"):
            _valid_persona(persona_name=None)


class GoalsAndBehaviorsCompletenessTests(unittest.TestCase):
    """Atlas's own literal 'goals/behavior/context' split (F06 L462): a persona with zero goals or zero
    behaviors has not actually modeled anything."""

    def test_empty_goals_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_GOALS"):
            _valid_persona(goals=[])

    def test_non_list_goals_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_GOALS"):
            _valid_persona(goals="not a list")

    def test_goals_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_GOALS"):
            _valid_persona(goals=["a real goal", "   "])

    def test_empty_behaviors_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_BEHAVIORS"):
            _valid_persona(behaviors=[])

    def test_behaviors_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_BEHAVIORS"):
            _valid_persona(behaviors=["a real behavior", ""])

    def test_single_goal_and_behavior_is_accepted(self):
        persona = _valid_persona(goals=["one goal"], behaviors=["one behavior"])
        self.assertEqual(persona["goals"], ["one goal"])
        self.assertEqual(persona["behaviors"], ["one behavior"])


class ContextCompletenessTests(unittest.TestCase):
    def test_empty_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_CONTEXT"):
            _valid_persona(context="")

    def test_whitespace_only_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_CONTEXT"):
            _valid_persona(context="   ")

    def test_none_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_CONTEXT"):
            _valid_persona(context=None)


class ResearchBasisInvariantTests(unittest.TestCase):
    """The REAL invariant: Atlas's own 'Persona ≠ 真實民意' misuse caution, mechanized. A persona built
    from zero disclosed research citations is the invented-composite-presented-as-real-people abuse that
    caution warns against."""

    def test_empty_research_basis_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_RESEARCH_BASIS"):
            _valid_persona(research_basis=[])

    def test_non_list_research_basis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_RESEARCH_BASIS"):
            _valid_persona(research_basis="a single string, not a list")

    def test_research_basis_with_only_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_RESEARCH_BASIS"):
            _valid_persona(research_basis=["   "])

    def test_single_research_basis_citation_is_accepted(self):
        persona = _valid_persona(research_basis=["one disclosed research citation"])
        self.assertEqual(persona["research_basis"], ["one disclosed research citation"])

    def test_none_research_basis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_EMPTY_RESEARCH_BASIS"):
            _valid_persona(research_basis=None)


class ProvenanceTests(unittest.TestCase):
    def test_invalid_provenance_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_INVALID_PROVENANCE"):
            _valid_persona(provenance=None)

    def test_provenance_with_illegal_epistemic_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PERSONA_INVALID_PROVENANCE"):
            _valid_persona(provenance={"epistemic_type": "NOT_REAL", "authorship_state": "AI_SUGGESTED", "locked": None})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID persona's raw dict directly (never going through the builder again), then call
    the gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_persona(self):
        results = evaluate_persona_gates(_valid_persona(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_research_basis_gate_catches_hand_tampered_empty_research_basis(self):
        persona = copy.deepcopy(_valid_persona())
        persona["research_basis"] = []
        gate = evaluate_research_basis_required_gate(persona, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_research_basis_gate_catches_hand_tampered_blank_entry(self):
        persona = copy.deepcopy(_valid_persona())
        persona["research_basis"] = ["   "]
        gate = evaluate_research_basis_required_gate(persona, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_completeness_gate_catches_hand_tampered_empty_goals(self):
        persona = copy.deepcopy(_valid_persona())
        persona["goals"] = []
        gate = evaluate_persona_completeness_gate(persona, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("PERSONA_EMPTY_GOALS", gate["evidence"][0]["problems"])

    def test_completeness_gate_catches_hand_tampered_empty_behaviors(self):
        persona = copy.deepcopy(_valid_persona())
        persona["behaviors"] = []
        gate = evaluate_persona_completeness_gate(persona, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("PERSONA_EMPTY_BEHAVIORS", gate["evidence"][0]["problems"])

    def test_completeness_gate_catches_hand_tampered_empty_context(self):
        persona = copy.deepcopy(_valid_persona())
        persona["context"] = ""
        gate = evaluate_persona_completeness_gate(persona, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("PERSONA_EMPTY_CONTEXT", gate["evidence"][0]["problems"])

    def test_completeness_gate_catches_hand_tampered_missing_id_prefix(self):
        persona = copy.deepcopy(_valid_persona())
        persona["id"] = "WRONG-001"
        gate = evaluate_persona_completeness_gate(persona, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("PERSONA_INVALID_ID", gate["evidence"][0]["problems"])

    def test_provenance_gate_catches_hand_tampered_missing_provenance(self):
        persona = copy.deepcopy(_valid_persona())
        persona["provenance"] = None
        gate = evaluate_provenance_required_gate(persona, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_all_three_gates_catch_non_dict_persona(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                self.assertEqual(evaluate_provenance_required_gate(bad, "test", "2026-09-11T00:00:00Z")["status"], "FAIL")
                self.assertEqual(evaluate_research_basis_required_gate(bad, "test", "2026-09-11T00:00:00Z")["status"], "FAIL")
                self.assertEqual(evaluate_persona_completeness_gate(bad, "test", "2026-09-11T00:00:00Z")["status"], "FAIL")

    def test_hand_tampered_persona_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = copy.deepcopy(_valid_persona())
        tampered["research_basis"] = []
        with self.assertRaises(SchemaValidationError):
            contracts.validate(PERSONA_SCHEMA, tampered, "tampered persona with empty research_basis")
        gate = evaluate_research_basis_required_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class SchemaLevelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_schema_rejects_an_unknown_top_level_key(self):
        persona = _valid_persona()
        persona["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PERSONA_SCHEMA, persona, "persona with a smuggled top-level key")

    def test_schema_rejects_empty_goals_array(self):
        persona = _valid_persona()
        persona["goals"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PERSONA_SCHEMA, persona, "persona with empty goals")

    def test_schema_rejects_empty_behaviors_array(self):
        persona = _valid_persona()
        persona["behaviors"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PERSONA_SCHEMA, persona, "persona with empty behaviors")

    def test_schema_rejects_empty_research_basis_array(self):
        persona = _valid_persona()
        persona["research_basis"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PERSONA_SCHEMA, persona, "persona with empty research_basis")

    def test_schema_rejects_missing_provenance(self):
        persona = _valid_persona()
        del persona["provenance"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PERSONA_SCHEMA, persona, "persona missing provenance")

    def test_schema_accepts_a_well_formed_persona(self):
        self.contracts.validate(PERSONA_SCHEMA, _valid_persona(), "well-formed persona")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_persona_gates_returns_three_gates_in_order(self):
        results = evaluate_persona_gates(_valid_persona(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "research_basis_required", "persona_completeness"])

    def test_evaluate_persona_gates_all_pass_on_a_valid_persona(self):
        results = evaluate_persona_gates(_valid_persona(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "insight.persona")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        persona = _valid_persona()
        self.assertEqual(
            set(persona.keys()),
            {"id", "version", "generated_by_method", "persona_name", "goals", "behaviors", "context", "research_basis", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
