"""Mutation-style tests for ``systems.rich_picture`` (F09 systems-thinking family, 1 of 2 members this agent
opens in a parallel batch alongside ``systems.systems_archetypes``).

Two real invariants beyond id/version/context/provenance shape (actor/issue structural minimum, issue
referential integrity + evidence minimum), exercised at BOTH layers: construction-time refusal
(``generate_rich_picture_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_rich_picture_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/rich-picture.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.systems.rich_picture import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    actor,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_rich_picture_gates,
    evaluate_rich_picture_integrity_gate,
    generate_rich_picture_record,
    issue,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RICH_PICTURE_SCHEMA = "ai-lego://specs/cognitive/typed-objects/rich-picture.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _actors() -> list[dict]:
    return [
        actor("A1", "在地商圈協會"),
        actor("A2", "自行車倡議團體"),
        actor("A3", "都市計畫局"),
    ]


def _issues() -> list[dict]:
    return [
        issue("I1", "商圈協會擔心縮減臨停格位會降低來客量，與自行車倡議團體的訴求直接衝突", ["A1", "A2"]),
        issue("I2", "都市計畫局需在不引發訴訟的前提下推動修法，時程壓力大", ["A3"]),
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(context="市中心停車格縮減案的利害關係人與衝突全貌", actors=_actors(), issues=_issues(), provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "RP-T-001", **overrides: object):
    return generate_rich_picture_record(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RICH_PICTURE_SCHEMA, _valid_record(), "rich picture record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_rich_picture_record, "RP-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/systems.rich_picture.contract.yaml")
        self.assertEqual(record["id"], "RP-T-INVOKE")

    def test_empty_catalog_blocks_rich_picture_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["issues"][0]["involves_actor_ids"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RICH_PICTURE_SCHEMA, tampered, "tampered record")
        gate = evaluate_rich_picture_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RICH_PICTURE_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_unknown_key_on_an_actor(self):
        record = _valid_record()
        record["actors"][0]["role"] = "extra"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RICH_PICTURE_SCHEMA, record, "record with a smuggled actor key")

    def test_schema_rejects_unknown_key_on_an_issue(self):
        record = _valid_record()
        record["issues"][0]["priority"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RICH_PICTURE_SCHEMA, record, "record with a smuggled issue key")

    def test_schema_rejects_an_empty_actors_array(self):
        record = _valid_record()
        record["actors"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RICH_PICTURE_SCHEMA, record, "record with empty actors")

    def test_schema_rejects_an_empty_issues_array(self):
        record = _valid_record()
        record["issues"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RICH_PICTURE_SCHEMA, record, "record with empty issues")

    def test_schema_rejects_an_issue_with_empty_involves_actor_ids(self):
        record = _valid_record()
        record["issues"][0]["involves_actor_ids"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RICH_PICTURE_SCHEMA, record, "record with an issue naming zero actors")

    def test_schema_accepts_a_single_actor_issue(self):
        """The >=1 (not >=2) floor is deliberate -- see the contract's own compilation_decisions."""
        record = _valid_record(issues=[issue("I1", "solo issue", ["A1"])])
        self.contracts.validate(RICH_PICTURE_SCHEMA, record, "single-actor issue record")

    def test_id_is_distinct_from_a_sibling_f09_machine_id(self):
        self.assertEqual(METHOD_ID, "systems.rich_picture")
        self.assertNotEqual(METHOD_ID, "systems.systems_archetypes")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "systems.rich_picture.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "systems.rich_picture contract")


class ActorStructuralMinimumTests(unittest.TestCase):
    """Invariant #1 (module docstring): actors is a list of >=1 well-shaped entries, unique ids, non-empty
    names."""

    def test_well_formed_record_is_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["actors"]), 3)

    def test_empty_actors_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_ACTORS"):
            _valid_record(actors=[])

    def test_single_actor_is_accepted_the_floor_is_one(self):
        record = _valid_record(actors=[actor("A1", "solo actor")], issues=[issue("I1", "solo issue", ["A1"])])
        self.assertEqual(len(record["actors"]), 1)

    def test_empty_name_is_refused(self):
        actors = _actors()
        actors[0]["name"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_ACTORS"):
            _valid_record(actors=actors)

    def test_duplicate_actor_id_is_refused(self):
        actors = _actors()
        actors[1]["id"] = actors[0]["id"]
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_DUPLICATE_ACTOR_ID"):
            _valid_record(actors=actors)

    def test_non_list_actors_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_ACTORS"):
            _valid_record(actors="not-a-list")

    def test_whitespace_padded_actor_id_is_refused_at_the_shape_boundary(self):
        actors = [actor("A1", "x"), actor("A1 ", "y")]
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_ACTORS"):
            _valid_record(actors=actors, issues=[issue("I1", "x", ["A1", "A1 "])])


class IssueReferentialIntegrityTests(unittest.TestCase):
    """Invariant #2 (module docstring): issues is non-empty, every involves_actor_ids has >=1 entry, every
    entry resolves to a real actors id."""

    def test_well_formed_record_is_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["issues"]), 2)

    def test_empty_issues_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_EMPTY_ISSUES"):
            _valid_record(issues=[])

    def test_issue_naming_zero_actors_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_ISSUE_NO_ACTORS_INVOLVED"):
            _valid_record(issues=[issue("I1", "ungrounded", [])])

    def test_dangling_actor_reference_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_ISSUE_DANGLING_ACTOR_REF"):
            _valid_record(issues=[issue("I1", "ghost", ["A1", "A-UNKNOWN"])])

    def test_duplicate_issue_id_is_refused(self):
        issues = [issue("I1", "a", ["A1"]), issue("I1", "b", ["A2"])]
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_DUPLICATE_ISSUE_ID"):
            _valid_record(issues=issues)

    def test_issue_missing_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_ISSUES"):
            _valid_record(issues=[{"id": "I1", "description": "", "involves_actor_ids": ["A1"]}])

    def test_non_list_issues_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_EMPTY_ISSUES"):
            _valid_record(issues="not-a-list")

    def test_valid_issue_referencing_all_three_actors_is_accepted(self):
        record = _valid_record(issues=[issue("I1", "全體相關", ["A1", "A2", "A3"])])
        self.assertEqual(record["issues"][0]["involves_actor_ids"], ["A1", "A2", "A3"])

    def test_whitespace_padded_involved_actor_id_is_refused_at_the_shape_boundary(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_ISSUES"):
            _valid_record(issues=[issue("I1", "padded ref", ["A1 "])])

    def test_whitespace_padded_issue_id_is_refused_at_the_shape_boundary(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_ISSUES"):
            _valid_record(issues=[issue("I1", "a", ["A1"]), issue("I1 ", "b", ["A2"])])

    def test_gate_catches_hand_tampered_whitespace_variant_actor_ref(self):
        record = copy.deepcopy(_valid_record())
        record["issues"][0]["involves_actor_ids"] = ["A1 "]
        gate = evaluate_rich_picture_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class IdContextAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "RP-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_VERSION"):
            generate_rich_picture_record("RP-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_empty_context_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_EMPTY_CONTEXT"):
            _valid_record(context="   ")

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RICHPIC_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_rich_picture_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_no_actors_involved(self):
        record = copy.deepcopy(_valid_record())
        record["issues"][0]["involves_actor_ids"] = []
        gate = evaluate_rich_picture_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_dangling_actor_ref(self):
        record = copy.deepcopy(_valid_record())
        record["issues"][0]["involves_actor_ids"] = ["A1", "A-GHOST"]
        gate = evaluate_rich_picture_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_actor_name(self):
        record = copy.deepcopy(_valid_record())
        record["actors"][0]["name"] = "   "
        gate = evaluate_rich_picture_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_duplicate_actor_id(self):
        record = copy.deepcopy(_valid_record())
        record["actors"][1]["id"] = record["actors"][0]["id"]
        gate = evaluate_rich_picture_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_rich_picture_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_rich_picture_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_rich_picture_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_empty_context(self):
        record = copy.deepcopy(_valid_record())
        record["context"] = ""
        gate = evaluate_rich_picture_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
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

    def test_evaluate_rich_picture_gates_returns_two_gates_in_order(self):
        results = evaluate_rich_picture_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "rich_picture_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "systems.rich_picture")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "context", "actors", "issues", "provenance"})

    def test_actor_helper_shape(self):
        a = actor("A9", "Name")
        self.assertEqual(set(a.keys()), {"id", "name"})

    def test_issue_helper_shape(self):
        i = issue("I9", "Description", ["A1", "A2"])
        self.assertEqual(set(i.keys()), {"id", "description", "involves_actor_ids"})


if __name__ == "__main__":
    unittest.main()
