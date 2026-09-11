"""Mutation-style tests for ``insight.survey`` (opening member of the NEW F06 `insight` family).

Three real invariants (pipeline-stage completeness across all 5 flat stages; quality_dimensions
at-least-once completeness across the 4 named §12.18 concerns; the is_translated asymmetric
requirement for semantic_equivalence_check/local_pilot_ref), exercised at THREE layers:
construction-time refusal (``generate_survey_study``/``quality_dimension_entry`` raising a
specific ``InvariantViolation`` code), independent gate re-derivation
(``evaluate_pipeline_stages_gate``/``evaluate_quality_dimensions_gate``/
``evaluate_translation_consistency_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely), and the real JSON Schema itself (minItems, contains, enum, if/then), checked
against the spec-root schema this same slice added
(``typed-objects/survey-study.schema.yaml``), not a schema this test file invents.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.insight.survey import (
    METHOD_ID,
    PIPELINE_STAGE_FIELDS,
    QUALITY_DIMENSIONS,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_pipeline_stages_gate,
    evaluate_provenance_required_gate,
    evaluate_quality_dimensions_gate,
    evaluate_survey_gates,
    evaluate_translation_consistency_gate,
    generate_survey_study,
    quality_dimension_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

SURVEY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/survey-study.schema.yaml"


def _quality_dimensions():
    return [
        quality_dimension_entry("CONSTRUCT_VALIDITY", "以三個子構念收斂效度題組驗證滿意度構念"),
        quality_dimension_entry("SAMPLING", "採分層隨機抽樣涵蓋各訂單金額層級與地區"),
        quality_dimension_entry("QUESTION_WORDING", "題目經雙盲翻譯回譯比對，避免引導性用詞"),
        quality_dimension_entry("NON_RESPONSE_BIAS", "比對填答與未填答客戶的既有消費紀錄"),
    ]


def _valid_study(
    study_id="SURVEY-T-001",
    construct_definition="顧客整體滿意度，以 5 點 Likert 量表操作化",
    question_design="每個子構念各 3 題正向措辭題目",
    pilot_summary="先以 40 位既有客戶進行認知訪談",
    sampling_plan="依訂單金額分層隨機抽樣，各層目標樣本數 200",
    analysis_plan="以分層加權估計整體滿意度比例與信賴區間",
    quality_dimensions=None,
    is_translated=True,
    semantic_equivalence_check="原始英文題本經雙向回譯比對，語意一致",
    local_pilot_ref="PILOT-TW-2026-09-11-001",
):
    return generate_survey_study(
        study_id,
        construct_definition,
        question_design,
        pilot_summary,
        sampling_plan,
        analysis_plan,
        quality_dimensions if quality_dimensions is not None else _quality_dimensions(),
        is_translated,
        make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        semantic_equivalence_check=semantic_equivalence_check if is_translated else None,
        local_pilot_ref=local_pilot_ref if is_translated else None,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_translated_study_validates_against_the_real_schema(self):
        self.contracts.validate(SURVEY_SCHEMA, _valid_study(), "translated Survey study")

    def test_valid_untranslated_study_validates_against_the_real_schema(self):
        self.contracts.validate(SURVEY_SCHEMA, _valid_study(is_translated=False), "untranslated Survey study")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, study = live.invoke(
            METHOD_ID,
            generate_survey_study,
            "SURVEY-T-INVOKE",
            "construct",
            "question",
            "pilot",
            "sample",
            "analysis",
            _quality_dimensions(),
            False,
            make_provenance("EVIDENCE", "AI_SUGGESTED"),
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/insight.survey.contract.yaml")
        self.assertEqual(study["id"], "SURVEY-T-INVOKE")

    def test_empty_catalog_blocks_survey_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_INVALID_ID"):
            _valid_study(study_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_INVALID_ID"):
            _valid_study(study_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_INVALID_VERSION"):
            generate_survey_study(
                "SURVEY-T-002", "c", "q", "p", "s", "a", _quality_dimensions(), False, make_provenance("EVIDENCE", "AI_SUGGESTED"), version=1
            )

    def test_id_is_distinct_from_family_and_method_id(self):
        self.assertEqual(METHOD_ID, "insight.survey")
        self.assertEqual(RECORD_ID_PREFIX, "SURVEY-")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated
        against specs/cognitive/method.schema.yaml') true going forward, same live check
        strategy.blue_ocean.contract.yaml's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "insight.survey.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "insight.survey contract")


class PipelineStageInvariantTests(unittest.TestCase):
    """Atlas's own literal 5-stage arrow-chain (F06 L468: "construct→question→pilot→sample→
    analysis") IS the method's definition -- a record skipping any one stage has not actually
    run a Survey."""

    def test_empty_construct_definition_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_EMPTY_CONSTRUCT_DEFINITION"):
            _valid_study(construct_definition="")

    def test_whitespace_only_construct_definition_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_EMPTY_CONSTRUCT_DEFINITION"):
            _valid_study(construct_definition="   ")

    def test_empty_question_design_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_EMPTY_QUESTION_DESIGN"):
            _valid_study(question_design="")

    def test_empty_pilot_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_EMPTY_PILOT_SUMMARY"):
            _valid_study(pilot_summary="")

    def test_empty_sampling_plan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_EMPTY_SAMPLING_PLAN"):
            _valid_study(sampling_plan="")

    def test_empty_analysis_plan_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_EMPTY_ANALYSIS_PLAN"):
            _valid_study(analysis_plan="")

    def test_pipeline_stage_fields_constant_matches_atlas_l468_pipeline(self):
        self.assertEqual(PIPELINE_STAGE_FIELDS, ("construct_definition", "question_design", "pilot_summary", "sampling_plan", "analysis_plan"))

    def test_all_five_stages_present_is_accepted(self):
        study = _valid_study()
        for field in PIPELINE_STAGE_FIELDS:
            self.assertTrue(study[field].strip())


class QualityDimensionInvariantTests(unittest.TestCase):
    """Atlas's own §12.18 (L2771): construct validity/sampling/question wording/non-response
    bias are the method's own defining quality concerns, each required at least once (NOT an
    exactly-once partition -- see module docstring's contrast with strategy.porter_five_forces)."""

    def test_quality_dimensions_constant_matches_atlas_l2771_vocabulary(self):
        self.assertEqual(QUALITY_DIMENSIONS, frozenset({"CONSTRUCT_VALIDITY", "SAMPLING", "QUESTION_WORDING", "NON_RESPONSE_BIAS"}))

    def test_invalid_dimension_is_refused_at_entry_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_INVALID_QUALITY_DIMENSION"):
            quality_dimension_entry("RECALL_BIAS", "not a real dimension")

    def test_empty_mitigation_note_is_refused_at_entry_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_EMPTY_MITIGATION_NOTE"):
            quality_dimension_entry("SAMPLING", "")

    def test_whitespace_only_mitigation_note_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_EMPTY_MITIGATION_NOTE"):
            quality_dimension_entry("SAMPLING", "   ")

    def test_missing_one_of_four_dimensions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_INCOMPLETE_QUALITY_DIMENSIONS"):
            _valid_study(quality_dimensions=_quality_dimensions()[:3])

    def test_empty_quality_dimensions_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_INCOMPLETE_QUALITY_DIMENSIONS|SURVEY_INVALID_QUALITY_DIMENSIONS_SHAPE"):
            _valid_study(quality_dimensions=[])

    def test_all_four_dimensions_present_is_accepted(self):
        study = _valid_study()
        seen = {d["dimension"] for d in study["quality_dimensions"]}
        self.assertEqual(seen, QUALITY_DIMENSIONS)

    def test_duplicate_dimension_is_legal_at_least_once_not_exactly_once(self):
        """Distinct from strategy.porter_five_forces's own exactly-once-each-of-5 shape: §12.18
        names 4 non-exclusive risks, so 2 separate SAMPLING mitigations plus 1 each of the other
        3 (5 entries total, all 4 dimensions covered) is a legal, complete study."""
        dims = _quality_dimensions() + [quality_dimension_entry("SAMPLING", "第二個抽樣偏誤緩解措施：加權後與普查母體比對")]
        study = _valid_study(quality_dimensions=dims)
        self.assertEqual(len(study["quality_dimensions"]), 5)
        self.assertEqual({d["dimension"] for d in study["quality_dimensions"]}, QUALITY_DIMENSIONS)


class TranslationAsymmetryInvariantTests(unittest.TestCase):
    """Atlas's own §12.18 (L2773) explicit global requirement: "全球要求：翻譯後必須做語義等值
    與 local pilot，不是直譯即可"."""

    def test_translated_missing_semantic_equivalence_check_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_MISSING_SEMANTIC_EQUIVALENCE_CHECK"):
            generate_survey_study(
                "SURVEY-T-010", "c", "q", "p", "s", "a", _quality_dimensions(), True, make_provenance("EVIDENCE", "AI_SUGGESTED"), local_pilot_ref="PILOT-001"
            )

    def test_translated_missing_local_pilot_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_MISSING_LOCAL_PILOT_REF"):
            generate_survey_study(
                "SURVEY-T-011",
                "c",
                "q",
                "p",
                "s",
                "a",
                _quality_dimensions(),
                True,
                make_provenance("EVIDENCE", "AI_SUGGESTED"),
                semantic_equivalence_check="equivalent",
            )

    def test_translated_missing_both_translation_fields_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_MISSING_SEMANTIC_EQUIVALENCE_CHECK"):
            generate_survey_study("SURVEY-T-012", "c", "q", "p", "s", "a", _quality_dimensions(), True, make_provenance("EVIDENCE", "AI_SUGGESTED"))

    def test_untranslated_with_semantic_equivalence_check_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_UNEXPECTED_TRANSLATION_FIELD_WHEN_NOT_TRANSLATED"):
            generate_survey_study(
                "SURVEY-T-013",
                "c",
                "q",
                "p",
                "s",
                "a",
                _quality_dimensions(),
                False,
                make_provenance("EVIDENCE", "AI_SUGGESTED"),
                semantic_equivalence_check="equivalent",
            )

    def test_untranslated_with_local_pilot_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_UNEXPECTED_TRANSLATION_FIELD_WHEN_NOT_TRANSLATED"):
            generate_survey_study(
                "SURVEY-T-014", "c", "q", "p", "s", "a", _quality_dimensions(), False, make_provenance("EVIDENCE", "AI_SUGGESTED"), local_pilot_ref="PILOT-001"
            )

    def test_untranslated_with_neither_field_is_accepted(self):
        study = generate_survey_study("SURVEY-T-015", "c", "q", "p", "s", "a", _quality_dimensions(), False, make_provenance("EVIDENCE", "AI_SUGGESTED"))
        self.assertNotIn("semantic_equivalence_check", study)
        self.assertNotIn("local_pilot_ref", study)

    def test_translated_with_both_fields_is_accepted(self):
        study = generate_survey_study(
            "SURVEY-T-016",
            "c",
            "q",
            "p",
            "s",
            "a",
            _quality_dimensions(),
            True,
            make_provenance("EVIDENCE", "AI_SUGGESTED"),
            semantic_equivalence_check="equivalent",
            local_pilot_ref="PILOT-001",
        )
        self.assertEqual(study["semantic_equivalence_check"], "equivalent")
        self.assertEqual(study["local_pilot_ref"], "PILOT-001")

    def test_non_bool_is_translated_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SURVEY_INVALID_IS_TRANSLATED"):
            generate_survey_study("SURVEY-T-017", "c", "q", "p", "s", "a", _quality_dimensions(), "yes", make_provenance("EVIDENCE", "AI_SUGGESTED"))


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID study's raw dict directly (never going through the builder again),
    then call the gates. These prove the gates re-derive from raw fields rather than trusting
    the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_translated_study(self):
        results = evaluate_survey_gates(_valid_study(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_gate_passes_a_genuinely_valid_hand_built_untranslated_study(self):
        results = evaluate_survey_gates(_valid_study(is_translated=False), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_gate_catches_hand_tampered_empty_pipeline_stage(self):
        study = copy.deepcopy(_valid_study())
        study["analysis_plan"] = ""
        gate = evaluate_pipeline_stages_gate(study, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["failure_reason"], "EMPTY_ANALYSIS_PLAN")

    def test_gate_catches_hand_tampered_incomplete_quality_dimensions(self):
        study = copy.deepcopy(_valid_study())
        study["quality_dimensions"] = [d for d in study["quality_dimensions"] if d["dimension"] != "SAMPLING"]
        gate = evaluate_quality_dimensions_gate(study, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("SAMPLING", gate["evidence"][0]["missing_dimensions"])

    def test_gate_catches_hand_tampered_translated_study_missing_local_pilot_ref(self):
        study = copy.deepcopy(_valid_study())
        del study["local_pilot_ref"]  # is_translated stays True -- now inconsistent
        gate = evaluate_translation_consistency_gate(study, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["failure_reason"], "MISSING_LOCAL_PILOT_REF")

    def test_gate_catches_hand_tampered_untranslated_study_smuggling_semantic_equivalence_check(self):
        study = copy.deepcopy(_valid_study(is_translated=False))
        study["semantic_equivalence_check"] = "smuggled"  # is_translated stays False -- now inconsistent
        gate = evaluate_translation_consistency_gate(study, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["failure_reason"], "UNEXPECTED_TRANSLATION_FIELD_WHEN_NOT_TRANSLATED")

    def test_gate_catches_hand_tampered_missing_provenance(self):
        study = copy.deepcopy(_valid_study())
        study["provenance"] = None
        gate = evaluate_provenance_required_gate(study, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_all_gates_catch_non_dict_study(self):
        for bad_study in (None, "not-a-dict", [], 42):
            with self.subTest(bad_study=bad_study):
                self.assertEqual(evaluate_pipeline_stages_gate(bad_study, "test", "t")["status"], "FAIL")
                self.assertEqual(evaluate_quality_dimensions_gate(bad_study, "test", "t")["status"], "FAIL")
                self.assertEqual(evaluate_translation_consistency_gate(bad_study, "test", "t")["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_study, "test", "t")["status"], "FAIL")

    def test_hand_tampered_study_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the
        same malformed record, not just one of the two layers."""
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = copy.deepcopy(_valid_study())
        del tampered["local_pilot_ref"]
        with self.assertRaises(SchemaValidationError):
            contracts.validate(SURVEY_SCHEMA, tampered, "translated study illegally missing local_pilot_ref")
        gate = evaluate_translation_consistency_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class SchemaLevelCoverageTests(unittest.TestCase):
    """Proves the schema's own minItems/contains/enum/if-then constraints are real, not just the
    runtime gates."""

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_schema_rejects_fewer_than_four_quality_dimensions(self):
        study = copy.deepcopy(_valid_study())
        study["quality_dimensions"] = study["quality_dimensions"][:3]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SURVEY_SCHEMA, study, "study with only 3 quality_dimensions")

    def test_schema_rejects_an_unknown_top_level_key(self):
        study = _valid_study()
        study["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SURVEY_SCHEMA, study, "study with a smuggled top-level key")

    def test_schema_rejects_an_unknown_quality_dimension_item_key(self):
        study = copy.deepcopy(_valid_study())
        study["quality_dimensions"][0]["confidence"] = 0.9
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SURVEY_SCHEMA, study, "study with a smuggled quality_dimensions item key")

    def test_schema_rejects_out_of_enum_dimension(self):
        study = copy.deepcopy(_valid_study())
        study["quality_dimensions"][0]["dimension"] = "RECALL_BIAS"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SURVEY_SCHEMA, study, "study with an out-of-enum dimension")

    def test_schema_rejects_translated_study_missing_semantic_equivalence_check(self):
        study = copy.deepcopy(_valid_study())
        del study["semantic_equivalence_check"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SURVEY_SCHEMA, study, "translated study missing semantic_equivalence_check")

    def test_schema_rejects_untranslated_study_carrying_local_pilot_ref(self):
        study = copy.deepcopy(_valid_study(is_translated=False))
        study["local_pilot_ref"] = "PILOT-999"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SURVEY_SCHEMA, study, "untranslated study illegally carrying local_pilot_ref")

    def test_schema_accepts_the_unmodified_valid_translated_example(self):
        self.contracts.validate(SURVEY_SCHEMA, _valid_study(), "unmodified valid translated example")

    def test_schema_accepts_the_unmodified_valid_untranslated_example(self):
        self.contracts.validate(SURVEY_SCHEMA, _valid_study(is_translated=False), "unmodified valid untranslated example")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_survey_gates_returns_four_gates_in_order(self):
        results = evaluate_survey_gates(_valid_study(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(
            [r["gate_id"] for r in results],
            ["provenance_required", "pipeline_stages", "quality_dimensions", "translation_consistency"],
        )

    def test_evaluate_survey_gates_all_pass_on_a_valid_study(self):
        results = evaluate_survey_gates(_valid_study(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SURVEY-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "insight.survey")

    def test_builder_does_not_leak_extra_keys_when_untranslated(self):
        study = _valid_study(is_translated=False)
        self.assertEqual(
            set(study.keys()),
            {"id", "version", "generated_by_method", "provenance", "construct_definition", "question_design", "pilot_summary", "sampling_plan", "analysis_plan", "quality_dimensions", "is_translated"},
        )

    def test_builder_includes_translation_keys_when_translated(self):
        study = _valid_study(is_translated=True)
        self.assertEqual(
            set(study.keys()),
            {
                "id",
                "version",
                "generated_by_method",
                "provenance",
                "construct_definition",
                "question_design",
                "pilot_summary",
                "sampling_plan",
                "analysis_plan",
                "quality_dimensions",
                "is_translated",
                "semantic_equivalence_check",
                "local_pilot_ref",
            },
        )

    def test_quality_dimension_entry_emits_only_known_good_keys(self):
        entry = quality_dimension_entry("SAMPLING", "note")
        self.assertEqual(set(entry.keys()), {"dimension", "mitigation_note"})


if __name__ == "__main__":
    unittest.main()
