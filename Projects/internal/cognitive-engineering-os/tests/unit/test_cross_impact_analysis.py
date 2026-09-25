"""Mutation-style tests for ``foresight.cross_impact_analysis`` (F13 foresight family, Atlas L685).

Atlas's own "event pair matrix" pipeline stage is proven at BOTH
independent layers: the construction-time builder refuses an incomplete or
over-complete matrix, a dangling event reference, and a self-pair, and the
independent gates re-derive the same rules directly from a raw (possibly
hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.cross_impact_analysis import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_cross_impact_analysis_gates,
    evaluate_matrix_completeness_gate,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    generate_cross_impact_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CROSS_IMPACT_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/cross-impact-analysis.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        events=[
            {"event_id": "E1", "description": "央行升息 1 碼"},
            {"event_id": "E2", "description": "主要出口市場需求下滑"},
            {"event_id": "E3", "description": "本國貨幣貶值 5%"},
        ],
        impact_pairs=[
            {"event_a_id": "E1", "event_b_id": "E2", "conditional_probability_shift": 0.1},
            {"event_a_id": "E1", "event_b_id": "E3", "conditional_probability_shift": -0.3},
            {"event_a_id": "E2", "event_b_id": "E3", "conditional_probability_shift": 0.2},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "XIMPACT-T-001", **overrides: object):
    return generate_cross_impact_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(CROSS_IMPACT_ANALYSIS_SCHEMA, _valid_analysis(), "cross impact analysis")

    def test_two_events_one_pair_is_a_complete_minimal_matrix(self):
        analysis = generate_cross_impact_analysis(
            "XIMPACT-T-002",
            events=[{"event_id": "E1", "description": "d1"}, {"event_id": "E2", "description": "d2"}],
            impact_pairs=[{"event_a_id": "E1", "event_b_id": "E2", "conditional_probability_shift": 0.5}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(CROSS_IMPACT_ANALYSIS_SCHEMA, analysis, "minimal complete matrix")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_cross_impact_analysis, "XIMPACT-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.cross_impact_analysis.contract.yaml")
        self.assertEqual(analysis["id"], "XIMPACT-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CROSS_IMPACT_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_shift_out_of_range(self):
        analysis = _valid_analysis()
        analysis["impact_pairs"][0]["conditional_probability_shift"] = 1.5
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CROSS_IMPACT_ANALYSIS_SCHEMA, analysis, "analysis with an out-of-range shift")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.cross_impact_analysis.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.cross_impact_analysis contract")


class EventCountTests(unittest.TestCase):
    def test_one_event_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_TOO_FEW_EVENTS"):
            generate_cross_impact_analysis("XIMPACT-T-003", events=[{"event_id": "E1", "description": "d"}], impact_pairs=[], provenance=PROVENANCE)

    def test_zero_events_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_TOO_FEW_EVENTS"):
            generate_cross_impact_analysis("XIMPACT-T-004", events=[], impact_pairs=[], provenance=PROVENANCE)

    def test_duplicate_event_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["events"].append({"event_id": "E1", "description": "duplicate"})
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_DUPLICATE_EVENT_ID"):
            generate_cross_impact_analysis("XIMPACT-T-005", **kwargs)


class SelfPairTests(unittest.TestCase):
    def test_self_pair_is_refused(self):
        kwargs = _kwargs()
        kwargs["impact_pairs"][0]["event_b_id"] = kwargs["impact_pairs"][0]["event_a_id"]
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_INVALID_IMPACT_PAIRS"):
            generate_cross_impact_analysis("XIMPACT-T-006", **kwargs)


class ReferentialIntegrityTests(unittest.TestCase):
    def test_dangling_event_a_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["impact_pairs"][0]["event_a_id"] = "E-NONEXISTENT"
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_DANGLING_EVENT_REF"):
            generate_cross_impact_analysis("XIMPACT-T-007", **kwargs)

    def test_dangling_event_b_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["impact_pairs"][0]["event_b_id"] = "E-NONEXISTENT"
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_DANGLING_EVENT_REF"):
            generate_cross_impact_analysis("XIMPACT-T-008", **kwargs)


class MatrixCompletenessTests(unittest.TestCase):
    """Atlas L685's own 'event pair matrix' pipeline stage -- every unordered pair present exactly once."""

    def test_missing_pair_is_refused(self):
        kwargs = _kwargs()
        kwargs["impact_pairs"] = kwargs["impact_pairs"][:-1]
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_MISSING_PAIR"):
            generate_cross_impact_analysis("XIMPACT-T-009", **kwargs)

    def test_literal_duplicate_pair_is_refused(self):
        kwargs = _kwargs()
        kwargs["impact_pairs"].append(dict(kwargs["impact_pairs"][0]))
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_DUPLICATE_PAIR"):
            generate_cross_impact_analysis("XIMPACT-T-010", **kwargs)

    def test_reversed_unordered_duplicate_pair_is_refused(self):
        """{A,B} then {B,A} is the SAME unordered pair -- must be caught, not treated as a distinct new pair."""
        kwargs = _kwargs()
        first = kwargs["impact_pairs"][0]
        kwargs["impact_pairs"].append({"event_a_id": first["event_b_id"], "event_b_id": first["event_a_id"], "conditional_probability_shift": 0.05})
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_DUPLICATE_PAIR"):
            generate_cross_impact_analysis("XIMPACT-T-011", **kwargs)

    def test_complete_matrix_is_accepted(self):
        analysis = _valid_analysis()
        self.assertEqual(len(analysis["impact_pairs"]), 3)


class ShiftRangeTests(unittest.TestCase):
    def test_shift_above_one_is_refused(self):
        kwargs = _kwargs()
        kwargs["impact_pairs"][0]["conditional_probability_shift"] = 1.1
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_INVALID_IMPACT_PAIRS"):
            generate_cross_impact_analysis("XIMPACT-T-012", **kwargs)

    def test_shift_below_negative_one_is_refused(self):
        kwargs = _kwargs()
        kwargs["impact_pairs"][0]["conditional_probability_shift"] = -1.1
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_INVALID_IMPACT_PAIRS"):
            generate_cross_impact_analysis("XIMPACT-T-013", **kwargs)

    def test_nan_shift_is_refused(self):
        kwargs = _kwargs()
        kwargs["impact_pairs"][0]["conditional_probability_shift"] = float("nan")
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_INVALID_IMPACT_PAIRS"):
            generate_cross_impact_analysis("XIMPACT-T-014", **kwargs)

    def test_boolean_shift_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["impact_pairs"][0]["conditional_probability_shift"] = True
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_INVALID_IMPACT_PAIRS"):
            generate_cross_impact_analysis("XIMPACT-T-015", **kwargs)

    def test_boundary_shifts_are_legal(self):
        kwargs = _kwargs()
        kwargs["impact_pairs"][0]["conditional_probability_shift"] = 1
        kwargs["impact_pairs"][1]["conditional_probability_shift"] = -1
        analysis = generate_cross_impact_analysis("XIMPACT-T-016", **kwargs)
        self.assertEqual(analysis["impact_pairs"][0]["conditional_probability_shift"], 1)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        analysis = generate_cross_impact_analysis("XIMPACT-T-017", **kwargs)
        kwargs["impact_pairs"][0]["conditional_probability_shift"] = -0.99
        self.assertEqual(analysis["impact_pairs"][0]["conditional_probability_shift"], 0.1)
        self.assertIsNot(analysis["impact_pairs"], kwargs["impact_pairs"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_cross_impact_analysis_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_referential_integrity_gate_catches_hand_tampered_dangling_ref(self):
        record = copy.deepcopy(_valid_analysis())
        record["impact_pairs"][0]["event_a_id"] = "E-NONEXISTENT"
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_too_few_events(self):
        record = copy.deepcopy(_valid_analysis())
        record["events"] = record["events"][:1]
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_matrix_completeness_gate_catches_hand_tampered_missing_pair(self):
        record = copy.deepcopy(_valid_analysis())
        record["impact_pairs"] = record["impact_pairs"][:-1]
        gate = evaluate_matrix_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_matrix_completeness_gate_catches_hand_tampered_reversed_duplicate(self):
        record = copy.deepcopy(_valid_analysis())
        first = record["impact_pairs"][0]
        record["impact_pairs"].append({"event_a_id": first["event_b_id"], "event_b_id": first["event_a_id"], "conditional_probability_shift": 0.01})
        gate = evaluate_matrix_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_matrix_completeness_gate_passes_a_genuinely_complete_matrix(self):
        gate = evaluate_matrix_completeness_gate(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_cross_impact_analysis_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_analysis())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "XIMPACT-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_INVALID_VERSION"):
            generate_cross_impact_analysis("XIMPACT-T-018", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "XIMPACT_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.cross_impact_analysis")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_cross_impact_analysis_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "referential_integrity", "matrix_completeness"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "events", "impact_pairs", "provenance"},
        )



class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of this batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_analysis()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_cross_impact_analysis(base["id"], base["events"], base["impact_pairs"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
