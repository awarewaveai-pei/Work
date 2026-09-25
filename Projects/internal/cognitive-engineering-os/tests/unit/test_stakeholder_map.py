"""Mutation-style tests for ``stakeholders.stakeholder_map`` (F07 stakeholder/power/negotiation family,
OPENING member).

3 real invariants beyond id/version/provenance shape (non-empty map, per-entry shape, whole-map
relationship_types coverage >=2), exercised at BOTH layers: construction-time refusal
(``generate_stakeholder_map`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_stakeholder_map_integrity_gate``/``evaluate_relationship_coverage_gate`` catching a
hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself). Schema
conformance is checked against the real spec-root schema this same slice added
(``typed-objects/stakeholder-map.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.stakeholders.stakeholder_map import (
    BENEFICIARY,
    DIRECT,
    INDIRECT,
    METHOD_ID,
    RECORD_ID_PREFIX,
    RISK_BEARER,
    VALID_RELATIONSHIP_TYPES,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_relationship_coverage_gate,
    evaluate_stakeholder_map_gates,
    evaluate_stakeholder_map_integrity_gate,
    generate_stakeholder_map,
    stakeholder_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

STAKEHOLDER_MAP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/stakeholder-map.schema.yaml"
PROVENANCE = make_provenance("EVIDENCE", "HUMAN_ORIGINAL")


def _entries(**overrides: object) -> list[dict]:
    base = [
        {"name": "市府交通局長", "category": "Policy Maker", "relationship_types": [DIRECT]},
        {"name": "每日通勤的市民", "category": "User", "relationship_types": [INDIRECT, BENEFICIARY]},
        {"name": "公車司機工會", "category": "Employee", "relationship_types": [DIRECT, RISK_BEARER]},
    ]
    if "entries" in overrides:
        return overrides["entries"]  # type: ignore[return-value]
    return base


def _valid_map(*, record_id: str = "STKMAP-T-001", entries: list[dict] | None = None, provenance: dict | None = None):
    return generate_stakeholder_map(record_id, entries if entries is not None else _entries(), provenance if provenance is not None else PROVENANCE)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_map_validates_against_the_real_schema(self):
        self.contracts.validate(STAKEHOLDER_MAP_SCHEMA, _valid_map(), "stakeholder map")

    def test_valid_map_with_null_category_entry_validates(self):
        entries = [{"name": "早期採用團隊", "category": None, "relationship_types": [DIRECT]}, {"name": "下游部門", "category": None, "relationship_types": [INDIRECT, RISK_BEARER]}]
        self.contracts.validate(STAKEHOLDER_MAP_SCHEMA, _valid_map(entries=entries), "stakeholder map, null category")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_stakeholder_map, "STKMAP-T-INVOKE", _entries(), PROVENANCE)
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/stakeholders.stakeholder_map.contract.yaml")
        self.assertEqual(record["id"], "STKMAP-T-INVOKE")

    def test_empty_catalog_blocks_stakeholder_map_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_map())
        tampered["stakeholders"][0]["name"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STAKEHOLDER_MAP_SCHEMA, tampered, "tampered map")
        gate = evaluate_stakeholder_map_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_map()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STAKEHOLDER_MAP_SCHEMA, record, "map with a smuggled top-level key")

    def test_schema_rejects_an_unknown_entry_key(self):
        record = _valid_map()
        record["stakeholders"][0]["extra"] = "nope"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STAKEHOLDER_MAP_SCHEMA, record, "map with a smuggled entry key")

    def test_schema_rejects_empty_category_string(self):
        """category must be null or non-empty -- an empty string is not a legal disclosure."""
        record = _valid_map()
        record["stakeholders"][0]["category"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STAKEHOLDER_MAP_SCHEMA, record, "map with an empty-string category")

    def test_schema_rejects_relationship_type_outside_the_enum(self):
        record = _valid_map()
        record["stakeholders"][0]["relationship_types"] = ["OBSERVER"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STAKEHOLDER_MAP_SCHEMA, record, "map with an illegal relationship_type value")

    def test_schema_rejects_duplicate_relationship_type_within_one_entry(self):
        record = _valid_map()
        record["stakeholders"][0]["relationship_types"] = [DIRECT, DIRECT]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STAKEHOLDER_MAP_SCHEMA, record, "map with a duplicate relationship_type")

    def test_schema_rejects_empty_stakeholders_list(self):
        record = _valid_map()
        record["stakeholders"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(STAKEHOLDER_MAP_SCHEMA, record, "map with an empty stakeholders list")

    def test_id_is_distinct_from_a_sibling_f07_machine_id(self):
        self.assertEqual(METHOD_ID, "stakeholders.stakeholder_map")
        self.assertNotEqual(METHOD_ID, "stakeholders.power_interest")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "stakeholders.stakeholder_map.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "stakeholders.stakeholder_map contract")


class NonEmptyMapTests(unittest.TestCase):
    """Invariant #1 (module docstring): stakeholders must be a non-empty list."""

    def test_well_formed_map_is_accepted(self):
        record = _valid_map()
        self.assertEqual(len(record["stakeholders"]), 3)

    def test_empty_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_EMPTY_MAP"):
            _valid_map(entries=[])

    def test_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_EMPTY_MAP"):
            generate_stakeholder_map("STKMAP-T-002", "not-a-list", PROVENANCE)  # type: ignore[arg-type]


class EntryShapeTests(unittest.TestCase):
    """Invariant #2 (module docstring): every entry needs a non-empty name, nullable-but-non-empty-if-present
    category, and a non-empty relationship_types list of unique legal values."""

    def test_empty_name_entry_is_refused(self):
        entries = [{"name": "   ", "category": None, "relationship_types": [DIRECT]}, {"name": "受影響者", "category": None, "relationship_types": [INDIRECT]}]
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_ENTRY"):
            _valid_map(entries=entries)

    def test_missing_key_entry_is_refused(self):
        entries = [{"name": "決策者", "relationship_types": [DIRECT]}, {"name": "受影響者", "category": None, "relationship_types": [INDIRECT]}]
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_ENTRY"):
            _valid_map(entries=entries)

    def test_empty_string_category_is_refused(self):
        entries = [{"name": "決策者", "category": "", "relationship_types": [DIRECT]}, {"name": "受影響者", "category": None, "relationship_types": [INDIRECT]}]
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_ENTRY"):
            _valid_map(entries=entries)

    def test_empty_relationship_types_is_refused(self):
        entries = [{"name": "決策者", "category": None, "relationship_types": []}, {"name": "受影響者", "category": None, "relationship_types": [INDIRECT]}]
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_ENTRY"):
            _valid_map(entries=entries)

    def test_illegal_relationship_type_value_is_refused(self):
        entries = [{"name": "決策者", "category": None, "relationship_types": ["OBSERVER"]}, {"name": "受影響者", "category": None, "relationship_types": [INDIRECT]}]
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_ENTRY"):
            _valid_map(entries=entries)

    def test_duplicate_relationship_type_within_one_entry_is_refused(self):
        entries = [{"name": "決策者", "category": None, "relationship_types": [DIRECT, DIRECT]}, {"name": "受影響者", "category": None, "relationship_types": [INDIRECT]}]
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_ENTRY"):
            _valid_map(entries=entries)


class RelationshipCoverageTests(unittest.TestCase):
    """Invariant #3 (module docstring), THE real invariant: the whole map's relationship_types union must
    cover >=2 distinct values -- prevents the '只看決策者' degenerate case."""

    def test_all_entries_only_direct_is_refused(self):
        entries = [{"name": "決策者甲", "category": None, "relationship_types": [DIRECT]}, {"name": "決策者乙", "category": None, "relationship_types": [DIRECT]}]
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_RELATIONSHIP_COVERAGE_TOO_NARROW"):
            _valid_map(entries=entries)

    def test_single_entry_with_only_one_relationship_type_is_refused(self):
        entries = [{"name": "唯一的決策者", "category": None, "relationship_types": [DIRECT]}]
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_RELATIONSHIP_COVERAGE_TOO_NARROW"):
            _valid_map(entries=entries)

    def test_two_distinct_relationship_types_across_entries_is_accepted(self):
        entries = [{"name": "決策者", "category": None, "relationship_types": [DIRECT]}, {"name": "受影響者", "category": None, "relationship_types": [INDIRECT]}]
        record = _valid_map(entries=entries)
        self.assertEqual(len(record["stakeholders"]), 2)

    def test_one_entry_covering_two_relationship_types_itself_is_accepted(self):
        """Coverage is a whole-map union, not a per-entry-count check -- a single entry legitimately tagged
        with 2+ relationship_types already satisfies the invariant on its own."""
        entries = [{"name": "多重角色的利害關係人", "category": None, "relationship_types": [DIRECT, RISK_BEARER]}]
        record = _valid_map(entries=entries)
        self.assertEqual(record["stakeholders"][0]["relationship_types"], [DIRECT, RISK_BEARER])

    def test_all_four_relationship_types_present_is_accepted(self):
        entries = [
            {"name": "A", "category": None, "relationship_types": [DIRECT]},
            {"name": "B", "category": None, "relationship_types": [INDIRECT]},
            {"name": "C", "category": None, "relationship_types": [BENEFICIARY]},
            {"name": "D", "category": None, "relationship_types": [RISK_BEARER]},
        ]
        record = _valid_map(entries=entries)
        self.assertEqual(len(record["stakeholders"]), 4)


class StakeholderEntryConstructorTests(unittest.TestCase):
    """``stakeholder_entry`` convenience constructor -- eager validation, same discipline every sibling
    module's own convenience constructor (``portfolio_item``/``function_node``) uses."""

    def test_well_formed_entry_is_accepted(self):
        entry = stakeholder_entry("決策者", [DIRECT], category="Policy Maker")
        self.assertEqual(entry, {"name": "決策者", "category": "Policy Maker", "relationship_types": [DIRECT]})

    def test_null_category_is_accepted(self):
        entry = stakeholder_entry("決策者", [DIRECT])
        self.assertIsNone(entry["category"])

    def test_empty_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_EMPTY_NAME"):
            stakeholder_entry("   ", [DIRECT])

    def test_empty_string_category_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_CATEGORY"):
            stakeholder_entry("決策者", [DIRECT], category="")

    def test_empty_relationship_types_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_RELATIONSHIP_TYPES"):
            stakeholder_entry("決策者", [])

    def test_illegal_relationship_type_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_RELATIONSHIP_TYPES"):
            stakeholder_entry("決策者", ["OBSERVER"])


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "STKMAP-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_ID"):
            _valid_map(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_ID"):
            _valid_map(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_VERSION"):
            generate_stakeholder_map("STKMAP-T-003", _entries(), PROVENANCE, version=1)  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STKMAP_INVALID_PROVENANCE"):
            _valid_map(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID map's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_map(self):
        results = evaluate_stakeholder_map_gates(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_relationship_coverage_gate_catches_a_hand_tampered_all_direct_map(self):
        """THE real invariant's own tamper test (task-mandated): all entries collapsed to only DIRECT after
        construction, bypassing the builder entirely, must still be caught by the independent gate."""
        record = copy.deepcopy(_valid_map())
        for entry in record["stakeholders"]:
            entry["relationship_types"] = [DIRECT]
        gate = evaluate_relationship_coverage_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["relationship_types_covered"], [DIRECT])
        overall = evaluate_stakeholder_map_gates(record, "test", "2026-09-11T00:00:00Z")
        self.assertFalse(all_gates_pass(overall))

    def test_relationship_coverage_gate_passes_a_hand_built_map_covering_two_types(self):
        record = {
            "id": "STKMAP-HAND-001",
            "version": "1.0.0",
            "generated_by_method": METHOD_ID,
            "stakeholders": [{"name": "決策者", "category": None, "relationship_types": [DIRECT]}, {"name": "受影響者", "category": None, "relationship_types": [INDIRECT]}],
            "provenance": PROVENANCE,
        }
        gate = evaluate_relationship_coverage_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_integrity_gate_catches_hand_tampered_empty_name(self):
        record = copy.deepcopy(_valid_map())
        record["stakeholders"][0]["name"] = ""
        gate = evaluate_stakeholder_map_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_empty_string_category(self):
        record = copy.deepcopy(_valid_map())
        record["stakeholders"][0]["category"] = ""
        gate = evaluate_stakeholder_map_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_passes_hand_tampered_record_with_null_category(self):
        """null category is legitimate -- the gate must not conflate 'no category' with a defect."""
        record = copy.deepcopy(_valid_map())
        record["stakeholders"][0]["category"] = None
        gate = evaluate_stakeholder_map_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_integrity_gate_catches_hand_tampered_duplicate_relationship_type(self):
        record = copy.deepcopy(_valid_map())
        record["stakeholders"][0]["relationship_types"] = [DIRECT, DIRECT]
        gate = evaluate_stakeholder_map_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_illegal_relationship_type(self):
        record = copy.deepcopy(_valid_map())
        record["stakeholders"][0]["relationship_types"] = ["OBSERVER"]
        gate = evaluate_stakeholder_map_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_empty_stakeholders_list(self):
        record = copy.deepcopy(_valid_map())
        record["stakeholders"] = []
        gate = evaluate_stakeholder_map_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_stakeholder_map_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_map())
        record["id"] = "WRONG-001"
        gate = evaluate_stakeholder_map_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_map())
        record["version"] = 1
        gate = evaluate_stakeholder_map_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_coverage_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_relationship_coverage_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_map())
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

    def test_evaluate_stakeholder_map_gates_returns_three_gates_in_order(self):
        results = evaluate_stakeholder_map_gates(_valid_map(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "stakeholder_map_integrity", "relationship_coverage"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "stakeholders.stakeholder_map")

    def test_valid_relationship_types_constant(self):
        self.assertEqual(VALID_RELATIONSHIP_TYPES, frozenset({DIRECT, INDIRECT, BENEFICIARY, RISK_BEARER}))

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_map()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "stakeholders", "provenance"})

    def test_builder_does_not_alias_the_caller_supplied_entries(self):
        """Same aliasing fix class functional_decomposition.py's own _rebuild_node establishes -- a caller
        retaining a reference to its input list must not be able to mutate an already-validated record."""
        entries = _entries()
        record = generate_stakeholder_map("STKMAP-T-ALIAS", entries, PROVENANCE)
        entries[0]["name"] = "MUTATED-AFTER-CONSTRUCTION"
        entries[0]["relationship_types"].append("SHOULD-NOT-LEAK")
        self.assertNotEqual(record["stakeholders"][0]["name"], "MUTATED-AFTER-CONSTRUCTION")
        self.assertNotIn("SHOULD-NOT-LEAK", record["stakeholders"][0]["relationship_types"])


if __name__ == "__main__":
    unittest.main()
