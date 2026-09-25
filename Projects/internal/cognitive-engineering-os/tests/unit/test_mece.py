"""Mutation-style tests for ``decomposition.mece`` (F02 decomposition & structuring family, opening member).

Two layers, same split every sibling GENUINE_COMPUTE slice in this package already establishes
(test_bcg_matrix.py's own two-layer split; ``database_data.normalization``'s own caller-supplied-structural-
input + GENUINE_COMPUTE-derived-classification split): the compute layer (``ai_lego.compute.mece.check
.mece_check``) is checked against hand-worked overlap/gap/clean examples directly, THEN the module layer
(construction-time refusal for structural malformation, independent gate re-derivation for hand-tampering) is
checked end-to-end. Atlas §12.7's own explicit caution ("不是所有現實系統都能完美 MECE；不要為形式強切世界")
is proven NOT to gate construction -- a real overlap/gap is a LEGAL ``is_mece: False`` outcome, never a
refusal (``MeceLegalFailureTests`` below), the same "do not conflate fails-the-check with invalid-record"
discipline this slice's own contract compilation_decisions disclose.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.compute.mece.check import mece_check
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.decomposition.mece import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    category,
    evaluate_genuine_compute_gate,
    evaluate_mece_gates,
    evaluate_mece_integrity_gate,
    evaluate_provenance_required_gate,
    generate_mece_check,
)
from ai_lego.modules.research.gates import evaluate_statistical_gate
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

MECE_CHECK_SCHEMA = "ai-lego://specs/cognitive/typed-objects/mece-check.schema.yaml"
METHOD_SCHEMA = "ai-lego://specs/cognitive/method.schema.yaml"
VALIDATOR = "test"
TS = "2026-09-11T00:00:00Z"


def _prov():
    return make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _clean_universe_and_categories():
    universe = ["A", "B", "C", "D"]
    categories = [
        category("evens", ["B", "D"]),
        category("odds", ["A", "C"]),
    ]
    return universe, categories


def _build(check_id="MECE-T-001", universe=None, categories=None, provenance=None, version="1.0.0"):
    u, c = _clean_universe_and_categories()
    return generate_mece_check(
        check_id,
        universe if universe is not None else u,
        categories if categories is not None else c,
        provenance if provenance is not None else _prov(),
        version=version,
    )


def _valid_check():
    return _build()


class MeceCheckComputeTests(unittest.TestCase):
    """Pure ``mece_check`` -- real hand-worked set-arithmetic examples, not just 'does it run'."""

    def test_clean_partition_is_mece(self):
        result = mece_check(
            ["A", "B", "C", "D"],
            [{"category_name": "evens", "member_item_ids": ["B", "D"]}, {"category_name": "odds", "member_item_ids": ["A", "C"]}],
        )
        self.assertEqual(result, {"overlaps": [], "gaps": [], "unknown_members": [], "is_mece": True})

    def test_real_overlap_is_detected_and_sorted(self):
        result = mece_check(
            ["A", "B", "C"],
            [{"category_name": "x", "member_item_ids": ["A", "B"]}, {"category_name": "y", "member_item_ids": ["B", "C"]}],
        )
        self.assertEqual(result["overlaps"], ["B"])
        self.assertEqual(result["gaps"], [])
        self.assertFalse(result["is_mece"])

    def test_real_gap_is_detected(self):
        result = mece_check(
            ["A", "B", "C"],
            [{"category_name": "x", "member_item_ids": ["A"]}, {"category_name": "y", "member_item_ids": ["B"]}],
        )
        self.assertEqual(result["gaps"], ["C"])
        self.assertEqual(result["overlaps"], [])
        self.assertFalse(result["is_mece"])

    def test_overlap_and_gap_together(self):
        result = mece_check(
            ["A", "B", "C", "D"],
            [{"category_name": "x", "member_item_ids": ["A", "B"]}, {"category_name": "y", "member_item_ids": ["B", "C"]}],
        )
        self.assertEqual(result["overlaps"], ["B"])
        self.assertEqual(result["gaps"], ["D"])
        self.assertFalse(result["is_mece"])

    def test_unknown_member_not_in_universe_is_reported_separately_and_does_not_gate_is_mece(self):
        result = mece_check(["A", "B"], [{"category_name": "x", "member_item_ids": ["A", "B", "Z"]}])
        self.assertEqual(result["unknown_members"], ["Z"])
        self.assertEqual(result["overlaps"], [])
        self.assertEqual(result["gaps"], [])
        self.assertTrue(result["is_mece"])  # unknown_members does not gate is_mece -- see module docstring

    def test_item_appearing_three_times_across_categories_is_still_a_single_sorted_overlap_entry(self):
        result = mece_check(
            ["A", "B", "C"],
            [
                {"category_name": "x", "member_item_ids": ["A"]},
                {"category_name": "y", "member_item_ids": ["A"]},
                {"category_name": "z", "member_item_ids": ["A", "B", "C"]},
            ],
        )
        self.assertEqual(result["overlaps"], ["A"])

    def test_duplicate_id_within_a_single_category_is_not_an_overlap(self):
        """A repeated id WITHIN one category's own member_item_ids is a duplicate listing, not a
        cross-category overlap -- see module docstring's dedupe-within-category discipline."""
        result = mece_check(["A"], [{"category_name": "x", "member_item_ids": ["A", "A"]}])
        self.assertEqual(result["overlaps"], [])
        self.assertTrue(result["is_mece"])

    def test_empty_categories_list_makes_every_universe_item_a_gap(self):
        result = mece_check(["A", "B"], [])
        self.assertEqual(result["gaps"], ["A", "B"])
        self.assertFalse(result["is_mece"])

    def test_result_does_not_depend_on_category_list_order(self):
        universe = ["A", "B", "C"]
        cats_1 = [{"category_name": "x", "member_item_ids": ["A"]}, {"category_name": "y", "member_item_ids": ["B", "C"]}]
        cats_2 = list(reversed(cats_1))
        self.assertEqual(mece_check(universe, cats_1), mece_check(universe, cats_2))

    def test_is_mece_true_only_when_both_overlaps_and_gaps_empty(self):
        universe = ["A", "B"]
        cases = {
            (False, False): [{"category_name": "x", "member_item_ids": ["A"]}, {"category_name": "y", "member_item_ids": ["B"]}],
            (True, False): [{"category_name": "x", "member_item_ids": ["A", "B"]}, {"category_name": "y", "member_item_ids": ["A"]}],
            (False, True): [{"category_name": "x", "member_item_ids": ["A"]}],
            (True, True): [{"category_name": "x", "member_item_ids": ["A"]}, {"category_name": "y", "member_item_ids": ["A"]}],
        }
        for (overlaps_present, gaps_present), categories in cases.items():
            with self.subTest(overlaps_present=overlaps_present, gaps_present=gaps_present):
                result = mece_check(universe, categories)
                self.assertEqual(result["is_mece"], not (overlaps_present or gaps_present))


class CategoryConstructorTests(unittest.TestCase):
    def test_category_rejects_empty_name(self):
        with self.assertRaisesRegex(InvariantViolation, "MECE_EMPTY_CATEGORY_NAME"):
            category("   ", ["A"])

    def test_category_rejects_duplicate_member_item_ids(self):
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_MEMBER_ITEM_IDS"):
            category("x", ["A", "A"])

    def test_category_accepts_empty_member_item_ids(self):
        entry = category("x", [])
        self.assertEqual(entry, {"category_name": "x", "member_item_ids": []})


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_check_validates_against_the_real_schema(self):
        self.contracts.validate(MECE_CHECK_SCHEMA, _valid_check(), "mece check")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        u, c = _clean_universe_and_categories()
        descriptor, check = live.invoke(METHOD_ID, generate_mece_check, "MECE-T-INVOKE", u, c, _prov())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/decomposition.mece.contract.yaml")
        self.assertEqual(check["id"], "MECE-T-INVOKE")

    def test_empty_catalog_blocks_mece_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same
        live check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "decomposition.mece.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate(METHOD_SCHEMA, instance, "decomposition.mece contract")

    def test_schema_rejects_an_unknown_top_level_key(self):
        check = _valid_check()
        check["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MECE_CHECK_SCHEMA, check, "check with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_categories_entry(self):
        check = _valid_check()
        check["categories"][0] = {**check["categories"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MECE_CHECK_SCHEMA, check, "check with a smuggled categories[] key")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_check())
        tampered["universe_item_ids"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(MECE_CHECK_SCHEMA, tampered, "tampered check")
        gate = evaluate_mece_integrity_gate(tampered, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_id_is_distinct_from_decomposition_issue_tree_machine_id(self):
        self.assertNotEqual(METHOD_ID, "decomposition.issue_tree")
        self.assertEqual(METHOD_ID, "decomposition.mece")


class BuilderStructuralRefusalTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_ID"):
            _build(check_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_ID"):
            _build(check_id="")

    def test_invalid_version_non_string_is_refused(self):
        u, c = _clean_universe_and_categories()
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_VERSION"):
            generate_mece_check("MECE-T-002", u, c, _prov(), version=1)

    def test_empty_universe_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_UNIVERSE"):
            _build(universe=[])

    def test_non_list_universe_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_UNIVERSE"):
            _build(universe="not-a-list")

    def test_duplicate_universe_item_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_UNIVERSE"):
            _build(universe=["A", "A", "B"])

    def test_empty_categories_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_CATEGORIES"):
            _build(categories=[])

    def test_non_list_categories_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_CATEGORIES"):
            _build(categories={"category_name": "x", "member_item_ids": ["A"]})

    def test_duplicate_category_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_CATEGORIES"):
            _build(categories=[category("x", ["A"]), category("x", ["B"])])

    def test_category_with_extra_key_smuggled_in_via_raw_dict_is_refused(self):
        cats = [{"category_name": "x", "member_item_ids": ["A"], "score": 1}]
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_CATEGORIES"):
            _build(universe=["A"], categories=cats)

    def test_category_with_duplicate_member_smuggled_in_via_raw_dict_is_refused(self):
        cats = [{"category_name": "x", "member_item_ids": ["A", "A"]}]
        with self.assertRaisesRegex(InvariantViolation, "MECE_INVALID_CATEGORIES"):
            _build(universe=["A"], categories=cats)

    def test_smuggled_overlaps_key_on_an_input_is_not_a_constructor_parameter(self):
        """Structural guarantee, not just a convention: generate_mece_check has no `overlaps`/`gaps`/
        `unknown_members`/`is_mece` parameter at all -- a caller cannot pass one even by mistake."""
        u, c = _clean_universe_and_categories()
        with self.assertRaises(TypeError):
            generate_mece_check("MECE-T-003", u, c, _prov(), overlaps=["A"])


class MeceLegalFailureTests(unittest.TestCase):
    """Atlas §12.7's own caution ('不是所有現實系統都能完美 MECE；不要為形式強切世界'): a real overlap/gap is
    a LEGAL is_mece: False outcome, never a construction-time refusal."""

    def test_real_overlap_is_constructed_not_refused(self):
        check = _build(categories=[category("x", ["A", "B"]), category("y", ["B", "C"]), category("z", ["D"])])
        self.assertFalse(check["is_mece"])
        self.assertEqual(check["overlaps"], ["B"])

    def test_real_gap_is_constructed_not_refused(self):
        check = _build(categories=[category("x", ["A"]), category("y", ["B"])])
        self.assertFalse(check["is_mece"])
        self.assertEqual(check["gaps"], ["C", "D"])

    def test_unknown_member_is_constructed_not_refused_and_does_not_flip_is_mece(self):
        check = _build(universe=["A", "B"], categories=[category("x", ["A", "B", "ZZZ"])])
        self.assertTrue(check["is_mece"])
        self.assertEqual(check["unknown_members"], ["ZZZ"])

    def test_builder_never_hardcodes_and_always_computes_the_real_result(self):
        check = _valid_check()
        self.assertEqual(check["overlaps"], [])
        self.assertEqual(check["gaps"], [])
        self.assertEqual(check["unknown_members"], [])
        self.assertTrue(check["is_mece"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID check's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_check(self):
        gate = evaluate_mece_integrity_gate(_valid_check(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_is_mece_disagreeing_with_recomputation(self):
        check = copy.deepcopy(_valid_check())
        check["is_mece"] = False  # was True
        gate = evaluate_mece_integrity_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_overlaps_disagreeing_with_recomputation(self):
        check = copy.deepcopy(_valid_check())
        check["overlaps"] = ["A"]  # was []
        gate = evaluate_mece_integrity_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_gaps_disagreeing_with_recomputation(self):
        check = copy.deepcopy(_valid_check())
        check["gaps"] = ["Z"]  # was []
        gate = evaluate_mece_integrity_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_unknown_members_disagreeing_with_recomputation(self):
        check = copy.deepcopy(_valid_check())
        check["unknown_members"] = ["Z"]  # was []
        gate = evaluate_mece_integrity_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_universe(self):
        check = copy.deepcopy(_valid_check())
        check["universe_item_ids"] = []
        gate = evaluate_mece_integrity_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_categories(self):
        check = copy.deepcopy(_valid_check())
        check["categories"] = []
        gate = evaluate_mece_integrity_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_category_name(self):
        check = copy.deepcopy(_valid_check())
        check["categories"][1]["category_name"] = check["categories"][0]["category_name"]
        gate = evaluate_mece_integrity_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_check(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_mece_integrity_gate(bad, VALIDATOR, TS)
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        check = copy.deepcopy(_valid_check())
        check["id"] = "WRONG-001"
        gate = evaluate_mece_integrity_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        check = copy.deepcopy(_valid_check())
        check["version"] = 1
        gate = evaluate_mece_integrity_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        check = _valid_check()
        snapshot = copy.deepcopy(check)
        evaluate_mece_integrity_gate(check, VALIDATOR, TS)
        self.assertEqual(check, snapshot)


class ProvenanceAndGenuineComputeGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_check(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        check = copy.deepcopy(_valid_check())
        check["provenance"] = None
        gate = evaluate_provenance_required_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_genuine_compute_gate_is_the_same_function_pareto_normalization_already_reuse(self):
        check = _valid_check()
        direct_pass, direct_evidence = evaluate_statistical_gate(check)
        gate = evaluate_genuine_compute_gate(check, VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS" if direct_pass else "FAIL")
        self.assertEqual(gate["evidence"], direct_evidence)

    def test_genuine_compute_gate_fails_on_non_dict_record(self):
        gate = evaluate_genuine_compute_gate("not-a-dict", VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_mece_gates_returns_three_gates_in_order(self):
        results = evaluate_mece_gates(_valid_check(), VALIDATOR, TS)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "genuine_compute", "mece_integrity"])

    def test_evaluate_mece_gates_all_pass_on_a_valid_check(self):
        results = evaluate_mece_gates(_valid_check(), VALIDATOR, TS)
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "decomposition.mece")

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "MECE-")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        check = _valid_check()
        self.assertEqual(
            set(check.keys()),
            {
                "id", "version", "generated_by_method", "universe_item_ids", "categories",
                "overlaps", "gaps", "unknown_members", "is_mece",
                "engine", "computation_provenance_ref", "provenance",
            },
        )


if __name__ == "__main__":
    unittest.main()
