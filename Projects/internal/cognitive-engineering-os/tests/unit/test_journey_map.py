"""Mutation-style tests for ``insight.journey_map`` (F06 人類／顧客洞察 family).

One real invariant beyond per-field shape (stage_number values across ALL stages equal EXACTLY
{1..len(stages)}, no gaps, no duplicates -- a caller-determined-length generalization of
``divergent.lotus_blossom``'s fixed-8 numeric-slot completeness), exercised at BOTH layers:
construction-time refusal (``generate_journey_map`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_journey_map_integrity_gate`` catching a hand-tampered raw dict
that bypassed the builder entirely, never calling the builder itself). Schema conformance is checked against
the real spec-root schema this same slice added (``typed-objects/journey-map.schema.yaml``).

Also covers the bug-class awareness this module's docstring discloses: ``bool`` is a subclass of ``int`` in
Python (``True == 1``) -- a critic finding against the sibling F03 ``lotus_blossom.py`` module, guarded here
from the start.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.insight.journey_map import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_journey_map_gates,
    evaluate_journey_map_integrity_gate,
    evaluate_provenance_required_gate,
    generate_journey_map,
    stage_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

JOURNEY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/journey-map.schema.yaml"
JOURNEY_SUBJECT = "SaaS 免費試用轉付費旅程"


def _stages(n: int = 4, **overrides: dict) -> list[dict]:
    base = {
        i: dict(stage_number=i, stage_name=f"stage-{i}", actions=f"actions-{i}", emotion=f"emotion-{i}", pain=f"pain-{i}", opportunity=f"opportunity-{i}", evidence=None)
        for i in range(1, n + 1)
    }
    base.update(overrides)
    return [
        stage_entry(v["stage_number"], v["stage_name"], v["actions"], v["emotion"], v["pain"], v["opportunity"], evidence=v.get("evidence"))
        for v in base.values()
    ]


def _valid_journey_map(
    *,
    map_id: str = "JOURNEY-T-001",
    journey_subject: str = JOURNEY_SUBJECT,
    stages: list[dict] | None = None,
    provenance: dict | None = None,
):
    return generate_journey_map(
        map_id,
        journey_subject,
        stages if stages is not None else _stages(),
        provenance if provenance is not None else make_provenance("HYPOTHESIS", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_journey_map_validates_against_the_real_schema(self):
        self.contracts.validate(JOURNEY_SCHEMA, _valid_journey_map(), "journey map")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, journey_map = live.invoke(
            METHOD_ID, generate_journey_map, "JOURNEY-T-INVOKE", JOURNEY_SUBJECT, _stages(), make_provenance("HYPOTHESIS", "AI_SUGGESTED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/insight.journey_map.contract.yaml")
        self.assertEqual(journey_map["id"], "JOURNEY-T-INVOKE")

    def test_empty_catalog_blocks_journey_map_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_gap_is_schema_shape_valid_but_gate_rejected(self):
        """Defense in depth, half 1: dropping the MIDDLE stage (stage_number 2, out of 1/2/3/4) leaves 3
        entries -- still schema-shape-valid (minItems:1 satisfied, every remaining entry itself well-formed),
        because JSON Schema cannot express the cross-item 'covers exactly {1..len(stages)}' completeness this
        schema's own compilation_decisions disclose as a runtime-only invariant. The independent gate is the
        layer that actually catches this gap ({1,3,4} != {1,2,3})."""
        tampered = copy.deepcopy(_valid_journey_map())
        tampered["stages"] = [s for s in tampered["stages"] if s["stage_number"] != 2]
        self.contracts.validate(JOURNEY_SCHEMA, tampered, "journey map with a stage_number gap (schema-shape-valid)")
        gate = evaluate_journey_map_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_empty_stages_fails_both_schema_and_gate(self):
        """Defense in depth, half 2: an empty stages array IS schema-invalid (minItems:1) AND gate-invalid --
        both layers independently reject the same malformed record, not just one of the two."""
        tampered = copy.deepcopy(_valid_journey_map())
        tampered["stages"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(JOURNEY_SCHEMA, tampered, "empty-stages journey map")
        gate = evaluate_journey_map_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        journey_map = _valid_journey_map()
        journey_map["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(JOURNEY_SCHEMA, journey_map, "journey map with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_stages_entry(self):
        journey_map = _valid_journey_map()
        journey_map["stages"][0] = {**journey_map["stages"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(JOURNEY_SCHEMA, journey_map, "journey map with a smuggled stages[] key")

    def test_schema_rejects_an_empty_stages_array(self):
        journey_map = _valid_journey_map()
        journey_map["stages"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(JOURNEY_SCHEMA, journey_map, "journey map with empty stages")

    def test_schema_accepts_null_evidence(self):
        journey_map = _valid_journey_map()
        journey_map["stages"][0]["evidence"] = None
        self.contracts.validate(JOURNEY_SCHEMA, journey_map, "journey map with null evidence")

    def test_schema_accepts_absent_evidence_key(self):
        journey_map = _valid_journey_map()
        del journey_map["stages"][0]["evidence"]
        self.contracts.validate(JOURNEY_SCHEMA, journey_map, "journey map with evidence key entirely absent")

    def test_id_is_distinct_from_lotus_blossom_machine_id(self):
        self.assertNotEqual(METHOD_ID, "divergent.lotus_blossom")
        self.assertEqual(METHOD_ID, "insight.journey_map")

    def test_journey_map_and_lotus_blossom_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "divergent.lotus_blossom"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "insight.journey_map.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "insight.journey_map contract")


class ConstantsTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "JOURNEY-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "insight.journey_map")


class StageEntryTests(unittest.TestCase):
    def test_stage_entry_rejects_stage_number_zero(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_INVALID_STAGE_NUMBER"):
            stage_entry(0, "name", "actions", "emotion", "pain", "opportunity")

    def test_stage_entry_rejects_negative_stage_number(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_INVALID_STAGE_NUMBER"):
            stage_entry(-1, "name", "actions", "emotion", "pain", "opportunity")

    def test_stage_entry_rejects_bool_masquerading_as_stage_number(self):
        """Critic finding, F03 batch 2026-09-11: bool is a subclass of int -- True/False must never
        masquerade as 1/0 for a real stage_number."""
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_INVALID_STAGE_NUMBER"):
            stage_entry(True, "bool must not masquerade as int", "actions", "emotion", "pain", "opportunity")

    def test_stage_entry_rejects_false_masquerading_as_stage_number_zero(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_INVALID_STAGE_NUMBER"):
            stage_entry(False, "bool must not masquerade as int", "actions", "emotion", "pain", "opportunity")

    def test_stage_entry_rejects_an_empty_stage_name(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_EMPTY_STAGE_NAME"):
            stage_entry(1, "   ", "actions", "emotion", "pain", "opportunity")

    def test_stage_entry_rejects_empty_actions(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_EMPTY_ACTIONS"):
            stage_entry(1, "name", "   ", "emotion", "pain", "opportunity")

    def test_stage_entry_rejects_empty_emotion(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_EMPTY_EMOTION"):
            stage_entry(1, "name", "actions", "   ", "pain", "opportunity")

    def test_stage_entry_rejects_empty_pain(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_EMPTY_PAIN"):
            stage_entry(1, "name", "actions", "emotion", "   ", "opportunity")

    def test_stage_entry_rejects_empty_opportunity(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_EMPTY_OPPORTUNITY"):
            stage_entry(1, "name", "actions", "emotion", "pain", "   ")

    def test_stage_entry_rejects_empty_string_evidence(self):
        """evidence is OPTIONAL and NULLABLE, but a PRESENT string must still be non-empty (Atlas L464's
        '可加 evidence' does not license a meaningless blank string standing in for 'no evidence' -- use
        None for that)."""
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_INVALID_EVIDENCE"):
            stage_entry(1, "name", "actions", "emotion", "pain", "opportunity", evidence="   ")

    def test_stage_entry_accepts_none_evidence(self):
        entry = stage_entry(1, "name", "actions", "emotion", "pain", "opportunity", evidence=None)
        self.assertIsNone(entry["evidence"])

    def test_stage_entry_accepts_a_real_evidence_string(self):
        entry = stage_entry(1, "name", "actions", "emotion", "pain", "opportunity", evidence="訪談 N=12")
        self.assertEqual(entry["evidence"], "訪談 N=12")

    def test_stage_entry_does_not_leak_extra_keys(self):
        entry = stage_entry(1, "name", "actions", "emotion", "pain", "opportunity")
        self.assertEqual(set(entry.keys()), {"stage_number", "stage_name", "actions", "emotion", "pain", "opportunity", "evidence"})


class StageSequenceCompletenessTests(unittest.TestCase):
    """The real invariant (module docstring): stage_number values across ALL stages must equal EXACTLY
    {1..len(stages)}, no gaps, no duplicates -- a caller-determined-length N, unlike lotus_blossom's fixed
    N=8."""

    def test_valid_4_stages_in_canonical_order_is_accepted(self):
        journey_map = _valid_journey_map()
        self.assertEqual(len(journey_map["stages"]), 4)

    def test_valid_stages_in_a_shuffled_order_is_also_accepted(self):
        """Order carries no meaning Atlas cites beyond the stage_number field itself -- same "no position
        enforced" discipline divergent.lotus_blossom.py's own identical test establishes."""
        stages = _stages()
        shuffled = [stages[3], stages[1], stages[0], stages[2]]
        journey_map = generate_journey_map("JOURNEY-T-SHUFFLED", JOURNEY_SUBJECT, shuffled, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual({s["stage_number"] for s in journey_map["stages"]}, {1, 2, 3, 4})

    def test_single_stage_journey_map_is_accepted(self):
        """N=1 is the minimal valid length -- {1} is a complete sequence of length 1."""
        journey_map = generate_journey_map("JOURNEY-T-SINGLE", JOURNEY_SUBJECT, _stages(n=1), make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual([s["stage_number"] for s in journey_map["stages"]], [1])

    def test_seven_stage_journey_map_is_accepted(self):
        """Confirms the invariant genuinely generalizes past lotus_blossom's fixed 8 -- N=7 (matching
        §11.13's own illustrative mermaid diagram length) is just as valid as N=4 or N=1."""
        journey_map = generate_journey_map("JOURNEY-T-SEVEN", JOURNEY_SUBJECT, _stages(n=7), make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual(len(journey_map["stages"]), 7)

    def test_empty_stages_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_EMPTY_STAGES"):
            generate_journey_map("JOURNEY-T-EMPTY", JOURNEY_SUBJECT, [], make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_gap_missing_middle_stage_number_is_refused(self):
        stages = _stages()
        gapped = [stages[0], stages[1], stages[3]]  # 1, 2, 4 -- drops 3 (N=3 but no 3 present)
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_STAGE_NUMBER_GAP"):
            generate_journey_map("JOURNEY-T-GAP", JOURNEY_SUBJECT, gapped, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_gap_missing_first_stage_number_is_refused(self):
        stages = _stages()
        gapped = [stages[1], stages[2], stages[3]]  # 2, 3, 4 -- N=3 but does not start at 1
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_STAGE_NUMBER_GAP"):
            generate_journey_map("JOURNEY-T-GAP-START", JOURNEY_SUBJECT, gapped, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_duplicate_stage_number_replacing_a_different_one_is_refused(self):
        stages = _stages()
        duplicated = [stages[0], stages[1], stages[2], dict(stages[0])]  # 1, 2, 3, 1 (dup) -- 4 never appears
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_DUPLICATE_STAGE_NUMBER"):
            generate_journey_map("JOURNEY-T-DUP", JOURNEY_SUBJECT, duplicated, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_all_stages_sharing_the_same_stage_number_is_refused(self):
        stages = _stages()
        all_same = [{**s, "stage_number": 1} for s in stages]
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_DUPLICATE_STAGE_NUMBER"):
            generate_journey_map("JOURNEY-T-ALLSAME", JOURNEY_SUBJECT, all_same, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_stage_number_beyond_len_stages_is_refused_as_a_gap(self):
        """3 stages numbered 1, 2, 99 -- distinct (no duplicate) but does not cover {1,2,3}, so this is a
        GAP, not a duplicate."""
        stages = _stages(n=3)
        out_of_range = [stages[0], stages[1], {**stages[2], "stage_number": 99}]
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_STAGE_NUMBER_GAP"):
            generate_journey_map("JOURNEY-T-OUTOFRANGE", JOURNEY_SUBJECT, out_of_range, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_non_list_stages_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_INVALID_STAGES"):
            generate_journey_map("JOURNEY-T-NONLIST", JOURNEY_SUBJECT, "not a list", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_bool_stage_number_smuggled_in_via_raw_dict_is_refused(self):
        stages = _stages()
        smuggled = [stages[0], stages[1], stages[2], {"stage_number": True, "stage_name": "x", "actions": "x", "emotion": "x", "pain": "x", "opportunity": "x", "evidence": None}]
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_INVALID_STAGE_NUMBER"):
            generate_journey_map("JOURNEY-T-BOOLSMUGGLED", JOURNEY_SUBJECT, smuggled, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_empty_stage_name_smuggled_in_via_raw_dict_is_refused(self):
        stages = _stages()
        stages[0] = {**stages[0], "stage_name": ""}
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_EMPTY_STAGE_NAME"):
            generate_journey_map("JOURNEY-T-EMPTYNAME", JOURNEY_SUBJECT, stages, make_provenance("HYPOTHESIS", "AI_SUGGESTED"))


class SubjectIdAndVersionTests(unittest.TestCase):
    def test_empty_journey_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_EMPTY_SUBJECT"):
            generate_journey_map("JOURNEY-T-002", "   ", _stages(), make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_INVALID_ID"):
            _valid_journey_map(map_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_INVALID_ID"):
            _valid_journey_map(map_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JOURNEY_INVALID_VERSION"):
            generate_journey_map("JOURNEY-T-003", JOURNEY_SUBJECT, _stages(), make_provenance("HYPOTHESIS", "AI_SUGGESTED"), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID journey map's raw dict directly (never going through the builder again), then
    call the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own
    work."""

    def test_gate_passes_a_genuinely_valid_hand_built_journey_map(self):
        gate = evaluate_journey_map_integrity_gate(_valid_journey_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_stage_creating_a_gap(self):
        journey_map = copy.deepcopy(_valid_journey_map())
        journey_map["stages"] = [s for s in journey_map["stages"] if s["stage_number"] != 3]  # 1,2,4 remain, N now 3 -> gap
        gate = evaluate_journey_map_integrity_gate(journey_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicated_stage_number(self):
        journey_map = copy.deepcopy(_valid_journey_map())
        journey_map["stages"] = [s for s in journey_map["stages"] if s["stage_number"] != 4] + [journey_map["stages"][0]]
        gate = evaluate_journey_map_integrity_gate(journey_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_bool_masquerading_as_stage_number(self):
        """Critic finding, F03 batch 2026-09-11: bool is a subclass of int -- a hand-tampered
        stage_number: True standing in for stage 1 must NOT be accepted by either the builder or the
        independent gate."""
        journey_map = copy.deepcopy(_valid_journey_map())
        journey_map["stages"][0]["stage_number"] = True  # was 1
        gate = evaluate_journey_map_integrity_gate(journey_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_stage_name(self):
        journey_map = copy.deepcopy(_valid_journey_map())
        journey_map["stages"][0]["stage_name"] = ""
        gate = evaluate_journey_map_integrity_gate(journey_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_journey_subject(self):
        journey_map = copy.deepcopy(_valid_journey_map())
        journey_map["journey_subject"] = ""
        gate = evaluate_journey_map_integrity_gate(journey_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_journey_map(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_journey_map_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        journey_map = copy.deepcopy(_valid_journey_map())
        journey_map["id"] = "WRONG-001"
        gate = evaluate_journey_map_integrity_gate(journey_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        journey_map = copy.deepcopy(_valid_journey_map())
        journey_map["version"] = 1
        gate = evaluate_journey_map_integrity_gate(journey_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_stages(self):
        journey_map = copy.deepcopy(_valid_journey_map())
        journey_map["stages"] = []
        gate = evaluate_journey_map_integrity_gate(journey_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    """RECORD-LEVEL only (module docstring) -- unlike ansoff/bcg, there is no per-stage provenance to check
    here at all."""

    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_journey_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        journey_map = copy.deepcopy(_valid_journey_map())
        journey_map["provenance"] = None
        gate = evaluate_provenance_required_gate(journey_map, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_missing_provenance_key(self):
        gate = evaluate_provenance_required_gate({"stages": []}, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_journey_map_gates_returns_two_gates_in_order(self):
        results = evaluate_journey_map_gates(_valid_journey_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "journey_map_integrity"])

    def test_evaluate_journey_map_gates_all_pass_on_a_valid_journey_map(self):
        results = evaluate_journey_map_gates(_valid_journey_map(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_builder_does_not_leak_extra_top_level_keys(self):
        journey_map = _valid_journey_map()
        self.assertEqual(set(journey_map.keys()), {"id", "version", "generated_by_method", "journey_subject", "stages", "provenance"})


if __name__ == "__main__":
    unittest.main()
