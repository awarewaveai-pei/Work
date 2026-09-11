"""Mutation-style tests for ``stakeholders.interest_based_negotiation`` (F07 利害關係人／權力／協商 family,
opening member).

Two real invariants beyond id/version/provenance shape (all 4 of the row's own pipeline stages present and
non-empty; an ``interests`` entry may not verbatim-echo an optional, present ``position``), exercised at BOTH
layers: construction-time refusal (``generate_interest_based_negotiation_record`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation (``evaluate_ibn_integrity_gate`` catching a
hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself). Schema
conformance is checked against the real spec-root schema this same slice added
(``typed-objects/interest-based-negotiation.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.stakeholders.interest_based_negotiation import (
    LIST_STAGE_FIELDS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    STAGE_FIELDS,
    all_gates_pass,
    evaluate_ibn_integrity_gate,
    evaluate_interest_based_negotiation_gates,
    evaluate_provenance_required_gate,
    generate_interest_based_negotiation_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

IBN_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/interest-based-negotiation.schema.yaml"
PROVENANCE = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        separate_people_from_problem="房東對去年疫情期間租金緩繳一事仍有情緒，先花時間單獨確認『這次續約談判不是要翻舊帳』，再回到條款本身",
        interests=["房客需要月租金維持在可負擔範圍，以撐過目前的營運淡季", "房東需要長期穩定的租約，避免空租期造成的收入缺口"],
        options=["降低月租金 10%，但續約年限從 1 年延長為 3 年", "維持原月租金，但由房東負擔這次的裝潢整修費用"],
        objective_criteria=["鄰近同類型商辦近 6 個月實際成交租金行情", "本大樓過去 3 年平均空租期天數"],
        provenance=PROVENANCE,
        position="房東一開始堅持『租金一毛都不能少，且只簽 1 年』",
    )
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "IBN-T-001", **overrides: object):
    return generate_interest_based_negotiation_record(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(IBN_RECORD_SCHEMA, _valid_record(), "interest-based negotiation record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_interest_based_negotiation_record, "IBN-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/stakeholders.interest_based_negotiation.contract.yaml")
        self.assertEqual(record["id"], "IBN-T-INVOKE")

    def test_empty_catalog_blocks_ibn_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["objective_criteria"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(IBN_RECORD_SCHEMA, tampered, "tampered record")
        gate = evaluate_ibn_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(IBN_RECORD_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_a_missing_pipeline_stage(self):
        record = _valid_record()
        del record["options"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(IBN_RECORD_SCHEMA, record, "record with options removed")

    def test_schema_rejects_empty_interests_list(self):
        record = _valid_record()
        record["interests"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(IBN_RECORD_SCHEMA, record, "record with an empty interests[] list")

    def test_schema_accepts_null_position(self):
        record = _valid_record(position=None)
        self.contracts.validate(IBN_RECORD_SCHEMA, record, "record with null position")

    def test_schema_rejects_empty_string_position(self):
        record = _valid_record()
        record["position"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(IBN_RECORD_SCHEMA, record, "record with an empty-string position")

    def test_id_is_distinct_from_another_family_machine_id(self):
        self.assertEqual(METHOD_ID, "stakeholders.interest_based_negotiation")
        self.assertNotEqual(METHOD_ID, "insight.jtbd")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "stakeholders.interest_based_negotiation.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "stakeholders.interest_based_negotiation contract")


class FourStagePipelineConstantsTests(unittest.TestCase):
    """The module's own STAGE_FIELDS/LIST_STAGE_FIELDS constants must match Atlas L494's own literal 4-step
    chain exactly -- these tests pin that shape so a future edit cannot silently drift it."""

    def test_stage_fields_is_exactly_four_in_atlas_own_literal_order(self):
        self.assertEqual(STAGE_FIELDS, ("separate_people_from_problem", "interests", "options", "objective_criteria"))

    def test_list_stage_fields_is_exactly_interests_options_objective_criteria(self):
        self.assertEqual(LIST_STAGE_FIELDS, frozenset({"interests", "options", "objective_criteria"}))

    def test_position_is_not_one_of_the_four_stage_fields(self):
        self.assertNotIn("position", STAGE_FIELDS)


class FourStageCompletenessTests(unittest.TestCase):
    """Invariant #1 (module docstring): all 4 of STAGE_FIELDS present and non-empty -- the 1 plain-string
    stage via blank/None, the 3 list stages (interests/options/objective_criteria) via empty list or a list
    holding a blank entry."""

    def test_well_formed_record_is_accepted(self):
        record = _valid_record()
        for field in STAGE_FIELDS:
            self.assertTrue(record[field])

    def test_empty_separate_people_from_problem_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_STAGES"):
            _valid_record(separate_people_from_problem="   ")

    def test_none_separate_people_from_problem_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_STAGES"):
            _valid_record(separate_people_from_problem=None)

    def test_empty_interests_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_STAGES"):
            _valid_record(interests=[])

    def test_interests_list_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_STAGES"):
            _valid_record(interests=["real interest", "   "])

    def test_non_list_interests_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_STAGES"):
            _valid_record(interests="not-a-list")

    def test_empty_options_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_STAGES"):
            _valid_record(options=[])

    def test_options_list_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_STAGES"):
            _valid_record(options=["real option", None])

    def test_empty_objective_criteria_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_STAGES"):
            _valid_record(objective_criteria=[])

    def test_objective_criteria_list_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_STAGES"):
            _valid_record(objective_criteria=["real criterion", "   "])


class PositionAntiEchoTests(unittest.TestCase):
    """Invariant #2 (module docstring): IF position is present (non-null), no interests entry may be a
    case/whitespace-insensitive verbatim echo of it. Position itself is nullable and the invariant does not
    apply when it is None."""

    def test_position_none_is_accepted(self):
        record = _valid_record(position=None)
        self.assertIsNone(record["position"])

    def test_empty_string_position_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_POSITION"):
            _valid_record(position="   ")

    def test_exact_echo_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INTEREST_ECHOES_POSITION"):
            _valid_record(position="房東堅持不降租", interests=["房東堅持不降租", "希望租約穩定"])

    def test_case_and_whitespace_insensitive_echo_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INTEREST_ECHOES_POSITION"):
            _valid_record(position="Landlord will not budge", interests=["  landlord   WILL not budge  ", "genuine interest"])

    def test_echo_buried_among_genuine_interests_is_still_refused(self):
        """Per-entry check, not whole-list equality -- one echoed entry among several genuine ones must still
        be refused."""
        with self.assertRaisesRegex(InvariantViolation, "IBN_INTEREST_ECHOES_POSITION"):
            _valid_record(
                position="房東堅持不降租",
                interests=["需要現金流可預期", "房東堅持不降租", "希望長期穩定訂單"],
            )

    def test_genuinely_transformed_interests_are_accepted(self):
        record = _valid_record(position="房東堅持不降租", interests=["希望租金負擔可控以撐過淡季", "希望租約穩定不用常找新址"])
        self.assertEqual(record["position"], "房東堅持不降租")

    def test_nfd_decomposed_echo_is_refused(self):
        """Critic-found gap (2026-09-11): casefold() alone does not fold Unicode normalization forms -- an
        NFD-decomposed (combining-character) restatement of an NFC position previously compared unequal
        under plain casefold(), bypassing the invariant this method's contract calls its own distinctive
        contribution."""
        import unicodedata

        position_nfc = "café landlord will not budge"
        position_nfd = unicodedata.normalize("NFD", position_nfc)
        self.assertNotEqual(position_nfc, position_nfd, "test fixture must actually differ at the byte level")
        with self.assertRaisesRegex(InvariantViolation, "IBN_INTEREST_ECHOES_POSITION"):
            _valid_record(position=position_nfc, interests=[position_nfd, "genuine interest"])

    def test_fullwidth_latin_echo_is_refused(self):
        """Full-width Latin restatement (e.g. pasted from CJK input method) of an ASCII position previously
        bypassed plain casefold()."""
        position_ascii = "landlord will not budge"
        position_fullwidth = "ｌａｎｄｌｏｒｄ　ｗｉｌｌ　ｎｏｔ　ｂｕｄｇｅ"
        with self.assertRaisesRegex(InvariantViolation, "IBN_INTEREST_ECHOES_POSITION"):
            _valid_record(position=position_ascii, interests=[position_fullwidth, "genuine interest"])

    def test_no_echo_check_applied_when_position_is_none(self):
        """Even an interests entry identical to text that COULD be a position does not raise when position
        itself is None -- there is nothing to echo."""
        record = _valid_record(position=None, interests=["房東堅持不降租"])
        self.assertEqual(record["interests"], ["房東堅持不降租"])


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "IBN-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_VERSION"):
            generate_interest_based_negotiation_record("IBN-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "IBN_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_interest_based_negotiation_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_integrity_gate_catches_hand_tampered_empty_separate_people_from_problem(self):
        record = copy.deepcopy(_valid_record())
        record["separate_people_from_problem"] = ""
        gate = evaluate_ibn_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_empty_interests_list(self):
        record = copy.deepcopy(_valid_record())
        record["interests"] = []
        gate = evaluate_ibn_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_objective_criteria_with_a_blank_entry(self):
        record = copy.deepcopy(_valid_record())
        record["objective_criteria"] = ["", "second criterion"]
        gate = evaluate_ibn_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_position_echo(self):
        """The gate independently re-derives invariant #2 from raw fields -- a record hand-edited to inject
        an echo AFTER construction must still be caught."""
        record = copy.deepcopy(_valid_record())
        record["interests"] = [record["position"], "genuine interest"]
        gate = evaluate_ibn_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_empty_string_position(self):
        record = copy.deepcopy(_valid_record())
        record["position"] = ""
        gate = evaluate_ibn_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_accepts_hand_tampered_null_position(self):
        record = copy.deepcopy(_valid_record())
        record["position"] = None
        gate = evaluate_ibn_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_ibn_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_ibn_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_ibn_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
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

    def test_evaluate_interest_based_negotiation_gates_returns_two_gates_in_order(self):
        results = evaluate_interest_based_negotiation_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "ibn_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "stakeholders.interest_based_negotiation")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "provenance", "position", *STAGE_FIELDS},
        )


if __name__ == "__main__":
    unittest.main()
