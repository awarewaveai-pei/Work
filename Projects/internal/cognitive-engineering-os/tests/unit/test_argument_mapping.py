"""Mutation-style tests for ``epistemic.argument_mapping`` (F10 epistemic-quality family, Atlas L573).

Atlas's own referential-integrity rule is proven at BOTH independent
layers: the construction-time builder refuses a dangling
``rebuttals[].objection_id``, zero supports, and duplicate ``objections[].id``
values, and the independent gate re-derives the same rules directly from a
raw (possibly hand-tampered) dict, never trusting that the builder's own
check already ran. A dedicated ``NestedListAliasingTests`` class proves
``main_claim`` is deep-copied, not shallow-copied -- the F09-batch critic
lesson this module's own docstring cites.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.epistemic.argument_mapping import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_argument_mapping_gates,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    generate_argument_map,
    objection,
    rebuttal,
    support,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

ARGUMENT_MAP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/argument-map.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _main_claim(**overrides: object) -> dict:
    base = {"claim_id": "C-1", "statement": "我們應該把客服知識庫遷移到向量搜尋", "provenance": make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")}
    base.update(overrides)
    return base


def _kwargs(**overrides: object) -> dict:
    base = dict(
        main_claim=_main_claim(),
        supports=[{"id": "SUP-1", "text": "關鍵字搜尋在同義詞查詢上命中率偏低"}, {"id": "SUP-2", "text": "向量搜尋在既有 POC 中命中率提升 40%"}],
        objections=[{"id": "OBJ-1", "text": "向量搜尋的維運成本與延遲可能高於現有方案"}],
        rebuttals=[{"id": "REB-1", "objection_id": "OBJ-1", "text": "POC 量測延遲增加不到 50ms"}],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_map(*, record_id: str = "ARGMAP-T-001", **overrides: object):
    return generate_argument_map(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_map_validates_against_the_real_schema(self):
        self.contracts.validate(ARGUMENT_MAP_SCHEMA, _valid_map(), "argument map")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, argument_map = live.invoke(METHOD_ID, generate_argument_map, "ARGMAP-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/epistemic.argument_mapping.contract.yaml")
        self.assertEqual(argument_map["id"], "ARGMAP-T-INVOKE")

    def test_empty_catalog_blocks_argument_mapping_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        argument_map = _valid_map()
        argument_map["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ARGUMENT_MAP_SCHEMA, argument_map, "argument map with a smuggled top-level key")

    def test_schema_rejects_zero_supports(self):
        argument_map = _valid_map()
        argument_map["supports"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ARGUMENT_MAP_SCHEMA, argument_map, "argument map with zero supports")

    def test_zero_objections_and_zero_rebuttals_is_legal(self):
        argument_map = generate_argument_map("ARGMAP-T-CLEAN", **_kwargs(objections=[], rebuttals=[]))
        self.contracts.validate(ARGUMENT_MAP_SCHEMA, argument_map, "argument map with no objections raised yet")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "epistemic.argument_mapping.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "epistemic.argument_mapping contract")


class ReferentialIntegrityTests(unittest.TestCase):
    """Atlas L573's own quartet -- rebuttals[].objection_id must resolve to a real objections[].id."""

    def test_well_formed_map_is_accepted(self):
        argument_map = _valid_map()
        self.assertEqual(len(argument_map["supports"]), 2)
        self.assertEqual(len(argument_map["objections"]), 1)
        self.assertEqual(len(argument_map["rebuttals"]), 1)

    def test_zero_supports_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_NO_SUPPORTS"):
            _valid_map(supports=[])

    def test_dangling_rebuttal_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_DANGLING_REBUTTAL"):
            _valid_map(rebuttals=[{"id": "REB-BAD", "objection_id": "OBJ-NEVER-RAISED", "text": "answers nothing real"}])

    def test_duplicate_objection_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_DUPLICATE_OBJECTION_ID"):
            _valid_map(objections=[{"id": "OBJ-1", "text": "a"}, {"id": "OBJ-1", "text": "b"}], rebuttals=[])

    def test_rebuttal_with_no_objections_declared_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_DANGLING_REBUTTAL"):
            _valid_map(objections=[], rebuttals=[{"id": "REB-1", "objection_id": "OBJ-1", "text": "x"}])

    def test_non_dict_support_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_SUPPORT\\b"):
            _valid_map(supports=["not-a-dict"])

    def test_non_dict_objection_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_OBJECTION\\b"):
            _valid_map(objections=["not-a-dict"], rebuttals=[])

    def test_non_dict_rebuttal_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_REBUTTAL\\b"):
            _valid_map(rebuttals=["not-a-dict"])


class HelperFunctionTests(unittest.TestCase):
    def test_support_helper_constructs(self):
        self.assertEqual(support("SUP-1", "reason"), {"id": "SUP-1", "text": "reason"})

    def test_support_helper_blank_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_SUPPORT_ID"):
            support("   ", "reason")

    def test_support_helper_blank_text_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_SUPPORT_TEXT"):
            support("SUP-1", "   ")

    def test_objection_helper_blank_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_OBJECTION_ID"):
            objection("", "text")

    def test_rebuttal_helper_blank_objection_id_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_REBUTTAL_OBJECTION_ID"):
            rebuttal("REB-1", "   ", "text")

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ARGMAP-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_ID"):
            _valid_map(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_VERSION"):
            generate_argument_map("ARGMAP-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_PROVENANCE"):
            _valid_map(provenance={"epistemic_type": "NOT_REAL"})

    def test_main_claim_missing_claim_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_MAIN_CLAIM"):
            _valid_map(main_claim={"statement": "no claim_id here"})

    def test_main_claim_missing_statement_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_MAIN_CLAIM"):
            _valid_map(main_claim={"claim_id": "C-1"})

    def test_main_claim_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ARGMAP_INVALID_MAIN_CLAIM"):
            _valid_map(main_claim="not-a-dict")

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "epistemic.argument_mapping")

    def test_evaluate_argument_mapping_gates_returns_two_gates_in_order(self):
        results = evaluate_argument_mapping_gates(_valid_map(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "referential_integrity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        argument_map = _valid_map()
        self.assertEqual(
            set(argument_map.keys()),
            {"id", "version", "generated_by_method", "main_claim", "supports", "objections", "rebuttals", "provenance"},
        )


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID map's raw dict directly (never going through the builder again), then call the
    gates. Proves the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_map(self):
        results = evaluate_argument_mapping_gates(_valid_map(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_referential_integrity_gate_catches_hand_tampered_dangling_rebuttal(self):
        record = copy.deepcopy(_valid_map())
        record["rebuttals"][0]["objection_id"] = "OBJ-NEVER-RAISED"
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_duplicate_objection_id(self):
        record = copy.deepcopy(_valid_map())
        record["objections"].append(dict(record["objections"][0]))
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_zero_supports(self):
        record = copy.deepcopy(_valid_map())
        record["supports"] = []
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_referential_integrity_gate(_valid_map(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_referential_integrity_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_referential_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_argument_mapping_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_map(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_map())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class NestedListAliasingTests(unittest.TestCase):
    """F09-batch critic lesson (ai_lego/modules/systems/__init__.py): a shallow dict(item) copy does NOT copy
    that item's own nested list fields. main_claim may carry claim.schema.yaml's own nested
    supporting_evidence/contradicting_evidence arrays -- generate_argument_map must deep-copy it, not alias the
    caller's own mutable list."""

    def test_returned_main_claim_does_not_share_a_mutable_list_with_the_caller(self):
        caller_main_claim = _main_claim(supporting_evidence=[{"evidence_id": "E-1", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")}])
        argument_map = _valid_map(main_claim=caller_main_claim)
        # Mutate the CALLER's own original list after construction.
        caller_main_claim["supporting_evidence"].append({"evidence_id": "E-2", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")})
        self.assertEqual(len(argument_map["main_claim"]["supporting_evidence"]), 1, "returned record's main_claim must not alias the caller's own nested list")

    def test_mutating_the_returned_main_claim_does_not_affect_the_caller(self):
        caller_main_claim = _main_claim(supporting_evidence=[{"evidence_id": "E-1", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")}])
        argument_map = _valid_map(main_claim=caller_main_claim)
        argument_map["main_claim"]["supporting_evidence"].append({"evidence_id": "E-3", "provenance": make_provenance("EVIDENCE", "SOURCE_QUOTATION")})
        self.assertEqual(len(caller_main_claim["supporting_evidence"]), 1, "mutating the returned record must not affect the caller's own original dict")


if __name__ == "__main__":
    unittest.main()
