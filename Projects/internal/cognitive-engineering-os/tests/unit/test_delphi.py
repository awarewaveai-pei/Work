"""Mutation-style tests for ``foresight.delphi`` (F13 foresight family, Atlas L684, §12.23 L2821-2828).

Three real invariants proven at BOTH independent layers each: anonymity
(Atlas L684), minority-range preservation (§12.23 L2827), and >=2 rounds
each with >=2 responses. ``dispersion`` is proven GENUINE_COMPUTE via
``inspect.signature`` (never a builder parameter) and independently
re-derived by its own gate.
"""

from __future__ import annotations

import copy
import inspect
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.delphi import (
    FORBIDDEN_IDENTITY_KEYS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    assert_no_identity_claim,
    compute_dispersion,
    evaluate_anonymity_gate,
    evaluate_delphi_gates,
    evaluate_dispersion_integrity_gate,
    evaluate_minority_range_preserved_gate,
    evaluate_provenance_required_gate,
    evaluate_round_structure_gate,
    generate_delphi_study,
    response,
    round_,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

DELPHI_STUDY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/delphi-study.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        rounds=[
            {"round_number": 1, "responses": [{"participant_id": "P1", "estimate": 5}, {"participant_id": "P2", "estimate": 2}]},
            {"round_number": 2, "responses": [{"participant_id": "P1", "estimate": 4}, {"participant_id": "P2", "estimate": 3}]},
        ],
        consensus_summary="多數專家估計 3-4 年內主流採用",
        minority_positions=["P1 認為時程應以最保守估計為準"],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_study(*, record_id: str = "DELPHI-T-001", **overrides: object):
    return generate_delphi_study(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_study_validates_against_the_real_schema(self):
        self.contracts.validate(DELPHI_STUDY_SCHEMA, _valid_study(), "delphi study")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, study = live.invoke(METHOD_ID, generate_delphi_study, "DELPHI-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.delphi.contract.yaml")
        self.assertEqual(study["id"], "DELPHI-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.delphi.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.delphi contract")


class GenuineComputeTests(unittest.TestCase):
    """``dispersion`` is never a builder parameter -- verified via inspect.signature, same idiom
    ``epistemic.bayesian_updating``'s own ``posterior`` establishes."""

    def test_dispersion_is_not_a_generate_delphi_study_parameter(self):
        params = inspect.signature(generate_delphi_study).parameters
        self.assertNotIn("dispersion", params)

    def test_caller_supplying_dispersion_kwarg_raises_type_error(self):
        with self.assertRaises(TypeError):
            generate_delphi_study("DELPHI-T-002", **{**_kwargs(), "dispersion": 0.5})  # type: ignore[arg-type]

    def test_compute_dispersion_is_population_stdev(self):
        # [1, 2, 3, 4, 5] -> mean 3, variance 2, stdev sqrt(2)
        self.assertAlmostEqual(compute_dispersion([1, 2, 3, 4, 5]), 1.41421356, places=6)

    def test_compute_dispersion_zero_for_identical_estimates(self):
        self.assertEqual(compute_dispersion([3, 3, 3]), 0.0)

    def test_compute_dispersion_undefined_for_empty_list(self):
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_DISPERSION_UNDEFINED"):
            compute_dispersion([])

    def test_dispersion_is_computed_from_the_final_round_only(self):
        study = _valid_study()
        # Final round (round_number=2) estimates: [4, 3] -> mean 3.5, variance 0.25, stdev 0.5
        self.assertAlmostEqual(study["dispersion"], 0.5, places=6)

    def test_dispersion_integrity_gate_recomputes_and_matches(self):
        gate = evaluate_dispersion_integrity_gate(_valid_study(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_dispersion_integrity_gate_catches_hand_tampered_stale_dispersion(self):
        record = copy.deepcopy(_valid_study())
        record["rounds"][1]["responses"][0]["estimate"] = 999
        gate = evaluate_dispersion_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_dispersion_integrity_gate_fails_closed_on_non_dict(self):
        for bad in (None, "not-a-dict", [], True, 42):
            with self.subTest(bad=bad):
                gate = evaluate_dispersion_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class AnonymityTests(unittest.TestCase):
    """Atlas L684: anonymous multi-round expert estimation, structural at both layers."""

    def test_forbidden_identity_keys_constant(self):
        self.assertEqual(FORBIDDEN_IDENTITY_KEYS, frozenset({"name", "expert_name", "author", "affiliation", "email", "title"}))

    def test_response_helper_accepts_a_clean_response(self):
        clean = response("P1", 5)
        self.assertEqual(clean, {"participant_id": "P1", "estimate": 5})

    def test_round_refuses_every_forbidden_identity_key(self):
        for key in FORBIDDEN_IDENTITY_KEYS:
            with self.subTest(key=key):
                with self.assertRaisesRegex(InvariantViolation, "DELPHI_INVALID_ROUND"):
                    round_(1, [{"participant_id": "P1", "estimate": 5, key: "Alice"}, {"participant_id": "P2", "estimate": 2}])

    def test_generate_delphi_study_refuses_a_smuggled_identity_key_on_a_response(self):
        kwargs = _kwargs()
        kwargs["rounds"][0]["responses"][0]["name"] = "Alice"
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_INVALID_ROUNDS"):
            generate_delphi_study("DELPHI-T-003", **kwargs)

    def test_clean_record_passes_the_anonymity_check(self):
        assert_no_identity_claim(_valid_study())  # must not raise

    def test_non_dict_record_is_refused_not_crashed_by_the_anonymity_assert(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                with self.assertRaisesRegex(InvariantViolation, "DELPHI_IDENTITY_CLAIM_FORBIDDEN"):
                    assert_no_identity_claim(bad_record)

    def test_schema_layer_independently_refuses_a_hand_crafted_bypass(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        tampered = _valid_study()
        tampered["rounds"][0]["responses"][0]["name"] = "Alice"
        with self.assertRaises(SchemaValidationError):
            contracts.validate(DELPHI_STUDY_SCHEMA, tampered, "hand-crafted anonymity bypass")

    def test_anonymity_gate_catches_a_hand_tampered_identity_key(self):
        record = copy.deepcopy(_valid_study())
        record["rounds"][0]["responses"][0]["name"] = "Alice"
        gate = evaluate_anonymity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_anonymity_gate_passes_a_genuinely_anonymous_record(self):
        gate = evaluate_anonymity_gate(_valid_study(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class MinorityRangePreservedTests(unittest.TestCase):
    """§12.23 L2827: 'Consensus 不是 truth；應保存 minority range' -- made structural."""

    def test_consensus_without_minority_positions_or_reason_is_refused(self):
        kwargs = _kwargs()
        del kwargs["minority_positions"]
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_MINORITY_RANGE_NOT_PRESERVED"):
            generate_delphi_study("DELPHI-T-004", **kwargs)

    def test_empty_minority_positions_list_without_reason_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_MINORITY_RANGE_NOT_PRESERVED"):
            _valid_study(minority_positions=[])

    def test_none_recorded_reason_alone_is_legal(self):
        kwargs = _kwargs()
        del kwargs["minority_positions"]
        kwargs["minority_positions_none_recorded_reason"] = "全部專家估計值皆落在 3-4 年區間，無顯著分歧"
        study = generate_delphi_study("DELPHI-T-005", **kwargs)
        self.contracts_validate(study)

    def contracts_validate(self, study):
        spec_root = resolve_spec_root()
        SchemaContracts(spec_root).validate(DELPHI_STUDY_SCHEMA, study, "none-recorded-reason study")

    def test_both_minority_positions_and_reason_present_is_contradictory(self):
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_CONTRADICTORY_MINORITY_STATE"):
            _valid_study(minority_positions_none_recorded_reason="no dissent")

    def test_minority_range_gate_passes_a_genuinely_valid_record(self):
        gate = evaluate_minority_range_preserved_gate(_valid_study(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_minority_range_gate_catches_hand_tampered_dropped_minority(self):
        record = copy.deepcopy(_valid_study())
        record["minority_positions"] = []
        gate = evaluate_minority_range_preserved_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_minority_range_gate_fails_closed_on_non_dict(self):
        for bad in (None, "not-a-dict", [], True, 42):
            with self.subTest(bad=bad):
                gate = evaluate_minority_range_preserved_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class RoundStructureTests(unittest.TestCase):
    """Atlas L684: 'round1->summary->round2->dispersion' -- Delphi is definitionally multi-round."""

    def test_one_round_is_refused(self):
        kwargs = _kwargs()
        kwargs["rounds"] = [kwargs["rounds"][0]]
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_TOO_FEW_ROUNDS"):
            generate_delphi_study("DELPHI-T-006", **kwargs)

    def test_zero_rounds_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_TOO_FEW_ROUNDS"):
            _valid_study(rounds=[])

    def test_one_response_in_a_round_is_refused(self):
        kwargs = _kwargs()
        kwargs["rounds"][0]["responses"] = [kwargs["rounds"][0]["responses"][0]]
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_INVALID_ROUNDS"):
            generate_delphi_study("DELPHI-T-007", **kwargs)

    def test_non_contiguous_round_numbers_is_refused(self):
        kwargs = _kwargs()
        kwargs["rounds"][1]["round_number"] = 3
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_INVALID_ROUND_SEQUENCE"):
            generate_delphi_study("DELPHI-T-008", **kwargs)

    def test_duplicate_round_numbers_is_refused(self):
        kwargs = _kwargs()
        kwargs["rounds"][1]["round_number"] = 1
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_INVALID_ROUND_SEQUENCE"):
            generate_delphi_study("DELPHI-T-009", **kwargs)

    def test_out_of_order_input_rounds_are_accepted_and_sorted(self):
        kwargs = _kwargs()
        kwargs["rounds"] = list(reversed(kwargs["rounds"]))
        study = generate_delphi_study("DELPHI-T-010", **kwargs)
        self.assertEqual([r["round_number"] for r in study["rounds"]], [1, 2])

    def test_round_structure_gate_catches_hand_tampered_single_response_round(self):
        record = copy.deepcopy(_valid_study())
        record["rounds"][0]["responses"] = [record["rounds"][0]["responses"][0]]
        gate = evaluate_round_structure_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_round_structure_gate_fails_closed_on_non_dict(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_round_structure_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        study = generate_delphi_study("DELPHI-T-011", **kwargs)
        kwargs["rounds"][0]["responses"].append({"participant_id": "P3", "estimate": 10})
        self.assertEqual(len(study["rounds"][0]["responses"]), 2)
        self.assertIsNot(study["rounds"][0]["responses"], kwargs["rounds"][0]["responses"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_study(self):
        results = evaluate_delphi_gates(_valid_study(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_delphi_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_evaluate_delphi_gates_returns_five_gates_in_order(self):
        results = evaluate_delphi_gates(_valid_study(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(
            [r["gate_id"] for r in results],
            ["provenance_required", "round_structure", "anonymity", "minority_range_preserved", "dispersion_integrity"],
        )


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_study(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_study())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "DELPHI-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_INVALID_ID"):
            _valid_study(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_INVALID_VERSION"):
            generate_delphi_study("DELPHI-T-012", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_INVALID_PROVENANCE"):
            _valid_study(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_consensus_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_INVALID_CONSENSUS_SUMMARY"):
            _valid_study(consensus_summary="")

    def test_boolean_estimate_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["rounds"][0]["responses"][0]["estimate"] = True
        with self.assertRaisesRegex(InvariantViolation, "DELPHI_INVALID_ROUNDS"):
            generate_delphi_study("DELPHI-T-013", **kwargs)

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.delphi")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        study = _valid_study()
        self.assertEqual(
            set(study.keys()),
            {"id", "version", "generated_by_method", "rounds", "dispersion", "minority_positions", "consensus_summary", "provenance"},
        )



class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of this batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_study()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_delphi_study(base["id"], base["rounds"], base["consensus_summary"], provenance, minority_positions=base.get("minority_positions"))
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
