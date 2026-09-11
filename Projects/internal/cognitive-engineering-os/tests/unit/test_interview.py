"""Mutation-style tests for ``insight.interview`` (F06 human/customer insight family, 7th of 9
members).

Two real invariants beyond id/version/provenance shape (all 9 of Atlas §12.17's own pipeline stages
present and non-empty; ``documented_biases`` as a SEPARATE, ADDITIONAL required field), exercised at
BOTH layers: construction-time refusal (``generate_interview_study`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_interview_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/interview-study.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.insight.interview import (
    DOCUMENTED_BIASES_FIELD,
    LIST_STAGE_FIELDS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    STAGE_FIELDS,
    all_gates_pass,
    evaluate_interview_gates,
    evaluate_interview_integrity_gate,
    evaluate_provenance_required_gate,
    generate_interview_study,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

INTERVIEW_STUDY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/interview-study.schema.yaml"
PROVENANCE = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        research_question="為什麼有結帳意圖的使用者最後沒有完成付款？",
        sampling_approach="從近 30 天內加入購物車但未結帳的使用者中，以 email 招募 8 位，涵蓋新舊客各半",
        documented_biases="樣本僅來自願意受訪的使用者（自我選擇偏誤），且全數為行動裝置使用者，結論不可直接推論到桌面使用者",
        guide="半結構式題綱：上次結帳經驗描述→卡關的具體步驟→當下情緒→最終決定原因→若能重來會怎麼做",
        consent_process="訪談前以書面說明錄音用途與資料保存期限，受訪者口頭同意錄音，同意記錄存於訪談排程表",
        interview_notes="多數受訪者在填寫地址與運費揭露的步驟猶豫，3 位提到運費出現得太晚感覺被欺騙",
        transcript_ref="docs/research/interviews/2026-09-checkout-abandon/transcripts/",
        codes=["late_shipping_disclosure", "trust_breach", "address_form_friction", "price_anchoring"],
        themes=["運費揭露時機影響信任", "表單摩擦造成放棄"],
        negative_cases="1 位受訪者反而覺得運費揭露時機沒有影響，放棄純粹因為想比價，顯示 late_shipping_disclosure 非唯一原因",
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_study(*, record_id: str = "INTERVIEW-T-001", **overrides: object):
    return generate_interview_study(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_study_validates_against_the_real_schema(self):
        self.contracts.validate(INTERVIEW_STUDY_SCHEMA, _valid_study(), "interview study")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, study = live.invoke(METHOD_ID, generate_interview_study, "INTERVIEW-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/insight.interview.contract.yaml")
        self.assertEqual(study["id"], "INTERVIEW-T-INVOKE")

    def test_empty_catalog_blocks_interview_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_study())
        tampered["negative_cases"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(INTERVIEW_STUDY_SCHEMA, tampered, "tampered study")
        gate = evaluate_interview_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        study = _valid_study()
        study["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(INTERVIEW_STUDY_SCHEMA, study, "study with a smuggled top-level key")

    def test_schema_rejects_a_missing_pipeline_stage(self):
        study = _valid_study()
        del study["guide"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(INTERVIEW_STUDY_SCHEMA, study, "study with guide removed")

    def test_schema_rejects_empty_documented_biases(self):
        study = _valid_study()
        study["documented_biases"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(INTERVIEW_STUDY_SCHEMA, study, "study with an empty documented_biases")

    def test_schema_rejects_empty_codes_list(self):
        study = _valid_study()
        study["codes"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(INTERVIEW_STUDY_SCHEMA, study, "study with an empty codes[] list")

    def test_id_is_distinct_from_a_sibling_f06_machine_id(self):
        self.assertEqual(METHOD_ID, "insight.interview")
        self.assertNotEqual(METHOD_ID, "insight.jtbd")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "insight.interview.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "insight.interview contract")


class NineStagePipelineConstantsTests(unittest.TestCase):
    """The module's own STAGE_FIELDS/LIST_STAGE_FIELDS constants must match §12.17's own literal
    9-word chain exactly -- these tests pin that shape so a future edit cannot silently drift it."""

    def test_stage_fields_is_exactly_nine_in_atlas_own_literal_order(self):
        self.assertEqual(
            STAGE_FIELDS,
            ("research_question", "sampling_approach", "guide", "consent_process", "interview_notes", "transcript_ref", "codes", "themes", "negative_cases"),
        )

    def test_list_stage_fields_is_exactly_codes_and_themes(self):
        self.assertEqual(LIST_STAGE_FIELDS, frozenset({"codes", "themes"}))

    def test_documented_biases_is_not_one_of_the_nine_stage_fields(self):
        self.assertNotIn(DOCUMENTED_BIASES_FIELD, STAGE_FIELDS)


class NineStageCompletenessTests(unittest.TestCase):
    """Invariant #1 (module docstring): all 9 of STAGE_FIELDS present and non-empty -- the 7 plain-
    string stages via blank/None, the 2 list stages (codes/themes) via empty list or a list holding
    a blank entry."""

    def test_well_formed_study_is_accepted(self):
        study = _valid_study()
        for field in STAGE_FIELDS:
            self.assertTrue(study[field])

    def test_empty_research_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(research_question="   ")

    def test_none_sampling_approach_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(sampling_approach=None)

    def test_empty_guide_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(guide="")

    def test_empty_consent_process_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(consent_process="   ")

    def test_empty_interview_notes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(interview_notes="")

    def test_empty_transcript_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(transcript_ref="   ")

    def test_empty_negative_cases_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(negative_cases="")

    def test_empty_codes_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(codes=[])

    def test_codes_list_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(codes=["real_code", "   "])

    def test_non_list_codes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(codes="not-a-list")

    def test_empty_themes_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(themes=[])

    def test_themes_list_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_STAGES"):
            _valid_study(themes=["real theme", None])


class DocumentedBiasesMandatoryTests(unittest.TestCase):
    """Invariant #2 (module docstring): documented_biases is a SEPARATE, ADDITIONAL required field
    -- NOT one of the 9 pipeline stages -- mechanizing the F06 table row's own explicit caution
    (L467: '樣本與偏誤要記錄')."""

    def test_empty_documented_biases_is_refused_even_though_all_9_stages_are_well_formed(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_EMPTY_DOCUMENTED_BIASES"):
            _valid_study(documented_biases="   ")

    def test_none_documented_biases_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_EMPTY_DOCUMENTED_BIASES"):
            _valid_study(documented_biases=None)

    def test_whitespace_only_documented_biases_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_EMPTY_DOCUMENTED_BIASES"):
            _valid_study(documented_biases="\t\n  ")

    def test_well_formed_documented_biases_is_accepted(self):
        study = _valid_study()
        self.assertTrue(study["documented_biases"])


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "INTERVIEW-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_ID"):
            _valid_study(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_ID"):
            _valid_study(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_VERSION"):
            generate_interview_study("INTERVIEW-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "INTERVIEW_INVALID_PROVENANCE"):
            _valid_study(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID study's raw dict directly (never going through the builder again), then
    call the gates. These prove the gates re-derive from raw fields rather than trusting the
    builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_study(self):
        results = evaluate_interview_gates(_valid_study(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_integrity_gate_catches_hand_tampered_empty_research_question(self):
        record = copy.deepcopy(_valid_study())
        record["research_question"] = ""
        gate = evaluate_interview_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_empty_codes_list(self):
        record = copy.deepcopy(_valid_study())
        record["codes"] = []
        gate = evaluate_interview_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_themes_with_a_blank_entry(self):
        record = copy.deepcopy(_valid_study())
        record["themes"] = ["", "second theme"]
        gate = evaluate_interview_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_empty_documented_biases(self):
        """The gate independently checks invariant #2 -- documented_biases -- even though it is NOT
        one of STAGE_FIELDS."""
        record = copy.deepcopy(_valid_study())
        record["documented_biases"] = ""
        gate = evaluate_interview_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_interview_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_study())
        record["id"] = "WRONG-001"
        gate = evaluate_interview_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_study())
        record["version"] = 1
        gate = evaluate_interview_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_study(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_study())
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

    def test_evaluate_interview_gates_returns_two_gates_in_order(self):
        results = evaluate_interview_gates(_valid_study(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "interview_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "insight.interview")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        study = _valid_study()
        self.assertEqual(
            set(study.keys()),
            {"id", "version", "generated_by_method", "provenance", *STAGE_FIELDS, DOCUMENTED_BIASES_FIELD},
        )


if __name__ == "__main__":
    unittest.main()
