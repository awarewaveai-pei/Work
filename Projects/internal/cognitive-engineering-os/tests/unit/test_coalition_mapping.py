"""Mutation-style tests for ``stakeholders.coalition_mapping`` (F07 stakeholder/power/negotiation family, 1 of
10 concurrent agents opening this family's members in the same parallel batch).

Two real invariants beyond id/version/context/provenance shape (stakeholder-profile completeness,
coalition-scenario referential integrity + minimum size), exercised at BOTH layers: construction-time refusal
(``generate_coalition_mapping_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_coalition_mapping_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/coalition-mapping.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.stakeholders.coalition_mapping import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    coalition_scenario,
    evaluate_coalition_mapping_gates,
    evaluate_coalition_mapping_integrity_gate,
    evaluate_provenance_required_gate,
    generate_coalition_mapping_record,
    stakeholder_profile,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

COALITION_MAPPING_SCHEMA = "ai-lego://specs/cognitive/typed-objects/coalition-mapping.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _profiles() -> list[dict]:
    return [
        stakeholder_profile("S1", "在地商圈協會", "維持街道停車位與人流", "可動員會員向議員陳情", "會員基礎、地方媒體聯繫管道"),
        stakeholder_profile("S2", "自行車倡議團體", "增加自行車道", "動員能力較小，但有議員個人支持", "志工人力、社群媒體聲量"),
        stakeholder_profile("S3", "都市計畫局", "在不引發訴訟的前提下推動修法", "法規制定權，但需議會通過", "技術報告、法規草案起草權"),
    ]


def _scenarios() -> list[dict]:
    return [
        coalition_scenario("C1", "商圈協會 + 都市計畫局", ["S1", "S3"]),
        coalition_scenario("C2", "自行車倡議團體 + 都市計畫局", ["S2", "S3"]),
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        context="市議會分區法規修訂案的利害關係人聯盟分析",
        stakeholder_profiles=_profiles(),
        coalition_scenarios=_scenarios(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "COALMAP-T-001", **overrides: object):
    return generate_coalition_mapping_record(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(COALITION_MAPPING_SCHEMA, _valid_record(), "coalition mapping record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_coalition_mapping_record, "COALMAP-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/stakeholders.coalition_mapping.contract.yaml")
        self.assertEqual(record["id"], "COALMAP-T-INVOKE")

    def test_empty_catalog_blocks_coalition_mapping_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["coalition_scenarios"][0]["member_ids"] = ["S1"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COALITION_MAPPING_SCHEMA, tampered, "tampered record")
        gate = evaluate_coalition_mapping_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COALITION_MAPPING_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_unknown_key_on_a_stakeholder_profile(self):
        record = _valid_record()
        record["stakeholder_profiles"][0]["role"] = "extra"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COALITION_MAPPING_SCHEMA, record, "record with a smuggled profile key")

    def test_schema_rejects_unknown_key_on_a_coalition_scenario(self):
        record = _valid_record()
        record["coalition_scenarios"][0]["rationale"] = "extra"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COALITION_MAPPING_SCHEMA, record, "record with a smuggled scenario key")

    def test_schema_rejects_a_single_member_scenario(self):
        record = _valid_record()
        record["coalition_scenarios"][0]["member_ids"] = ["S1"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COALITION_MAPPING_SCHEMA, record, "record with a single-member scenario")

    def test_schema_rejects_duplicate_member_ids_in_one_scenario(self):
        record = _valid_record()
        record["coalition_scenarios"][0]["member_ids"] = ["S1", "S1"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COALITION_MAPPING_SCHEMA, record, "record with duplicate member_ids")

    def test_schema_rejects_missing_interests_field(self):
        record = _valid_record()
        del record["stakeholder_profiles"][0]["interests"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COALITION_MAPPING_SCHEMA, record, "record with interests removed")

    def test_id_is_distinct_from_a_sibling_f07_machine_id(self):
        self.assertEqual(METHOD_ID, "stakeholders.coalition_mapping")
        self.assertNotEqual(METHOD_ID, "stakeholders.batna")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "stakeholders.coalition_mapping.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "stakeholders.coalition_mapping contract")


class StakeholderProfileCompletenessTests(unittest.TestCase):
    """Invariant #1 (module docstring): stakeholder_profiles is a list of >=2 well-shaped entries, each of
    interests/power/resources non-empty, ids unique."""

    def test_well_formed_record_is_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["stakeholder_profiles"]), 3)

    def test_single_stakeholder_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_STAKEHOLDER_PROFILES"):
            _valid_record(stakeholder_profiles=[_profiles()[0]], coalition_scenarios=[coalition_scenario("C1", "solo", ["S1", "S1"])])

    def test_empty_stakeholder_profiles_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_STAKEHOLDER_PROFILES"):
            _valid_record(stakeholder_profiles=[])

    def test_empty_interests_is_refused(self):
        profiles = _profiles()
        profiles[0]["interests"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_STAKEHOLDER_PROFILES"):
            _valid_record(stakeholder_profiles=profiles)

    def test_empty_power_is_refused(self):
        profiles = _profiles()
        profiles[0]["power"] = ""
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_STAKEHOLDER_PROFILES"):
            _valid_record(stakeholder_profiles=profiles)

    def test_empty_resources_is_refused(self):
        profiles = _profiles()
        profiles[0]["resources"] = "\t\n"
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_STAKEHOLDER_PROFILES"):
            _valid_record(stakeholder_profiles=profiles)

    def test_duplicate_stakeholder_id_is_refused(self):
        profiles = _profiles()
        profiles[1]["id"] = profiles[0]["id"]
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_DUPLICATE_STAKEHOLDER_ID"):
            _valid_record(stakeholder_profiles=profiles)

    def test_non_list_stakeholder_profiles_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_STAKEHOLDER_PROFILES"):
            _valid_record(stakeholder_profiles="not-a-list")


class CoalitionScenarioIntegrityTests(unittest.TestCase):
    """Invariant #2 (module docstring): coalition_scenarios is non-empty, every member_ids has >=2 unique
    entries, every entry resolves to a real stakeholder_profiles id."""

    def test_well_formed_record_is_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["coalition_scenarios"]), 2)

    def test_empty_coalition_scenarios_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_EMPTY_COALITION_SCENARIOS"):
            _valid_record(coalition_scenarios=[])

    def test_single_member_scenario_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_SCENARIO_TOO_FEW_MEMBERS"):
            _valid_record(coalition_scenarios=[coalition_scenario("C1", "solo", ["S1"])])

    def test_zero_member_scenario_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_SCENARIO_TOO_FEW_MEMBERS"):
            _valid_record(coalition_scenarios=[coalition_scenario("C1", "empty", [])])

    def test_duplicate_member_within_one_scenario_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_SCENARIO_DUPLICATE_MEMBER"):
            _valid_record(coalition_scenarios=[coalition_scenario("C1", "dup", ["S1", "S1"])])

    def test_dangling_member_reference_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_SCENARIO_DANGLING_MEMBER_REF"):
            _valid_record(coalition_scenarios=[coalition_scenario("C1", "ghost", ["S1", "S-UNKNOWN"])])

    def test_duplicate_scenario_id_is_refused(self):
        scenarios = [coalition_scenario("C1", "a", ["S1", "S2"]), coalition_scenario("C1", "b", ["S2", "S3"])]
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_DUPLICATE_SCENARIO_ID"):
            _valid_record(coalition_scenarios=scenarios)

    def test_scenario_missing_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_COALITION_SCENARIOS"):
            _valid_record(coalition_scenarios=[{"id": "C1", "label": "", "member_ids": ["S1", "S2"]}])

    def test_non_list_coalition_scenarios_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_EMPTY_COALITION_SCENARIOS"):
            _valid_record(coalition_scenarios="not-a-list")

    def test_valid_scenario_referencing_all_three_stakeholders_is_accepted(self):
        record = _valid_record(coalition_scenarios=[coalition_scenario("C1", "全體聯盟", ["S1", "S2", "S3"])])
        self.assertEqual(record["coalition_scenarios"][0]["member_ids"], ["S1", "S2", "S3"])

    def test_whitespace_padded_member_id_is_refused_at_the_shape_boundary(self):
        """2nd critic pass (2026-09-11): the first fix silently STRIPPED ids for comparison while storing the
        raw, unstripped value -- closing the immediate "counts as 2 members" symptom but leaving the record
        internally inconsistent (member_ids could disagree byte-for-byte with the profile id it was supposed
        to reference, an unjoinable-downstream regression). Root-caused instead: a whitespace-padded id is
        refused at construction, never stored at all -- same discipline as any other malformed shape, not a
        duplicate-detection special case."""
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_COALITION_SCENARIOS"):
            _valid_record(coalition_scenarios=[coalition_scenario("C1", "dup-via-whitespace", ["S1", "S1 "])])


class WhitespaceVariantStakeholderIdTests(unittest.TestCase):
    """Same critic-found gap (2026-09-11), profile side: a whitespace-padded profile id is rejected outright
    at the shape boundary, not silently accepted-then-deduped."""

    def test_whitespace_padded_profile_id_is_refused_at_the_shape_boundary(self):
        profiles = [
            stakeholder_profile("S1", "在地商圈協會", "維持街道停車位與人流", "可動員會員向議員陳情", "會員基礎、地方媒體聯繫管道"),
            stakeholder_profile("S1 ", "重複的同一方", "x", "x", "x"),
        ]
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_STAKEHOLDER_PROFILES"):
            _valid_record(stakeholder_profiles=profiles, coalition_scenarios=[coalition_scenario("C1", "a", ["S1", "S1 "])])

    def test_whitespace_padded_scenario_id_is_refused_at_the_shape_boundary(self):
        """M4 (2nd critic pass, 2026-09-11): scenario-id uniqueness was never normalized at all in the first
        fix -- "s1" and "s1 " bypassed COALMAP_DUPLICATE_SCENARIO_ID entirely. Closed by the same shape-level
        _is_valid_id rejection as the profile/member-id cases, not a third separate normalization."""
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_COALITION_SCENARIOS"):
            _valid_record(coalition_scenarios=[coalition_scenario("C1", "a", ["S1", "S2"]), coalition_scenario("C1 ", "b", ["S2", "S3"])])

    def test_gate_catches_hand_tampered_whitespace_variant_member_id(self):
        record = copy.deepcopy(_valid_record())
        record["coalition_scenarios"][0]["member_ids"] = ["S1", "S1 "]
        gate = evaluate_coalition_mapping_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_whitespace_variant_scenario_id(self):
        record = copy.deepcopy(_valid_record())
        record["coalition_scenarios"].append({**copy.deepcopy(record["coalition_scenarios"][0]), "id": record["coalition_scenarios"][0]["id"] + " "})
        gate = evaluate_coalition_mapping_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class IdContextAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "COALMAP-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_VERSION"):
            generate_coalition_mapping_record("COALMAP-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_empty_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_EMPTY_CONTEXT"):
            _valid_record(context="   ")

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "COALMAP_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_coalition_mapping_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_too_few_members(self):
        record = copy.deepcopy(_valid_record())
        record["coalition_scenarios"][0]["member_ids"] = ["S1"]
        gate = evaluate_coalition_mapping_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_dangling_member_ref(self):
        record = copy.deepcopy(_valid_record())
        record["coalition_scenarios"][0]["member_ids"] = ["S1", "S-GHOST"]
        gate = evaluate_coalition_mapping_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_interests(self):
        record = copy.deepcopy(_valid_record())
        record["stakeholder_profiles"][0]["interests"] = "   "
        gate = evaluate_coalition_mapping_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_duplicate_stakeholder_id(self):
        record = copy.deepcopy(_valid_record())
        record["stakeholder_profiles"][1]["id"] = record["stakeholder_profiles"][0]["id"]
        gate = evaluate_coalition_mapping_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_coalition_mapping_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_coalition_mapping_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_coalition_mapping_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_empty_context(self):
        record = copy.deepcopy(_valid_record())
        record["context"] = ""
        gate = evaluate_coalition_mapping_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
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

    def test_evaluate_coalition_mapping_gates_returns_two_gates_in_order(self):
        results = evaluate_coalition_mapping_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "coalition_mapping_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "stakeholders.coalition_mapping")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "context", "stakeholder_profiles", "coalition_scenarios", "provenance"},
        )

    def test_stakeholder_profile_helper_shape(self):
        profile = stakeholder_profile("S9", "Name", "Interests", "Power", "Resources")
        self.assertEqual(set(profile.keys()), {"id", "name", "interests", "power", "resources"})

    def test_coalition_scenario_helper_shape(self):
        scenario = coalition_scenario("C9", "Label", ["S1", "S2"])
        self.assertEqual(set(scenario.keys()), {"id", "label", "member_ids"})


if __name__ == "__main__":
    unittest.main()
