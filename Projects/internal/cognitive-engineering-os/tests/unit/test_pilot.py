"""Mutation-style tests for ``experiment.pilot`` (F15 experiment & validation family, Atlas L747, §12.31).

Atlas §12.31's own 強制 (MANDATORY) rule -- Success/Stop/Rollback criteria
defined before the pilot starts -- is proven at BOTH independent layers: the
construction-time builder refuses a Pilot missing any of the 3 criteria
sets, and the independent gates re-derive the same rule directly from a raw
(possibly hand-tampered) dict, never trusting that the builder's own check
already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.experiment.pilot import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_criteria_mandate_gate,
    evaluate_pilot_gates,
    evaluate_provenance_required_gate,
    evaluate_structural_shape_gate,
    generate_pilot,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

PILOT_RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/pilot-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        scope={
            "description": "New checkout flow, one region, opt-in cohort only",
            "boundaries": ["region=TW", "cohort=opt-in-beta", "duration<=30 days"],
        },
        success_criteria=["conversion rate >= baseline + 2pp"],
        stop_criteria=["error rate > 1% for 2 consecutive hours"],
        rollback_criteria=["feature flag off within 15 minutes of a STOP trigger"],
        monitoring_metrics=["conversion_rate", "error_rate", "checkout_latency_p95"],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_pilot(*, record_id: str = "PILOT-T-001", **overrides: object):
    return generate_pilot(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_pilot_validates_against_the_real_schema(self):
        self.contracts.validate(PILOT_RECORD_SCHEMA, _valid_pilot(), "pilot record")

    def test_pilot_with_review_validates_against_the_real_schema(self):
        record = generate_pilot(
            "PILOT-T-001B",
            **_kwargs(),
            review={"conducted": True, "verdict": "EXPAND", "notes": "Success criteria met on day 21."},
        )
        self.contracts.validate(PILOT_RECORD_SCHEMA, record, "pilot record with review")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_pilot, "PILOT-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.pilot.contract.yaml")
        self.assertEqual(record["id"], "PILOT-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_pilot()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PILOT_RECORD_SCHEMA, record, "pilot with a smuggled top-level key")

    def test_schema_rejects_empty_success_criteria(self):
        record = _valid_pilot()
        record["success_criteria"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PILOT_RECORD_SCHEMA, record, "pilot with empty success_criteria")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.pilot.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.pilot contract")


class CriteriaMandateTests(unittest.TestCase):
    """Atlas §12.31's own 強制 (MANDATORY) rule -- the real invariant this method exists to enforce."""

    def test_missing_success_criteria_is_refused(self):
        kwargs = _kwargs(success_criteria=[])
        with self.assertRaisesRegex(InvariantViolation, "PILOT_CRITERIA_MANDATE_VIOLATION"):
            generate_pilot("PILOT-T-002", **kwargs)

    def test_missing_stop_criteria_is_refused(self):
        kwargs = _kwargs(stop_criteria=[])
        with self.assertRaisesRegex(InvariantViolation, "PILOT_CRITERIA_MANDATE_VIOLATION"):
            generate_pilot("PILOT-T-003", **kwargs)

    def test_missing_rollback_criteria_is_refused(self):
        kwargs = _kwargs(rollback_criteria=[])
        with self.assertRaisesRegex(InvariantViolation, "PILOT_CRITERIA_MANDATE_VIOLATION"):
            generate_pilot("PILOT-T-004", **kwargs)

    def test_all_three_missing_at_once_is_refused_and_names_all_three(self):
        kwargs = _kwargs(success_criteria=[], stop_criteria=[], rollback_criteria=[])
        with self.assertRaises(InvariantViolation) as ctx:
            generate_pilot("PILOT-T-005", **kwargs)
        message = str(ctx.exception)
        self.assertIn("success_criteria", message)
        self.assertIn("stop_criteria", message)
        self.assertIn("rollback_criteria", message)

    def test_criteria_with_a_blank_string_item_is_refused(self):
        kwargs = _kwargs()
        kwargs["stop_criteria"] = ["   "]
        with self.assertRaisesRegex(InvariantViolation, "PILOT_CRITERIA_MANDATE_VIOLATION"):
            generate_pilot("PILOT-T-006", **kwargs)

    def test_criteria_that_is_not_a_list_is_refused(self):
        kwargs = _kwargs()
        kwargs["rollback_criteria"] = "not a list"
        with self.assertRaisesRegex(InvariantViolation, "PILOT_CRITERIA_MANDATE_VIOLATION"):
            generate_pilot("PILOT-T-007", **kwargs)

    def test_complete_criteria_is_accepted(self):
        record = _valid_pilot()
        self.assertEqual(record["success_criteria"], ["conversion rate >= baseline + 2pp"])
        self.assertEqual(record["stop_criteria"], ["error rate > 1% for 2 consecutive hours"])
        self.assertEqual(record["rollback_criteria"], ["feature flag off within 15 minutes of a STOP trigger"])


class ScopeTests(unittest.TestCase):
    def test_scope_missing_boundaries_is_refused(self):
        kwargs = _kwargs()
        kwargs["scope"] = {"description": "x"}
        with self.assertRaisesRegex(InvariantViolation, "PILOT_INVALID_SCOPE"):
            generate_pilot("PILOT-T-008", **kwargs)

    def test_scope_empty_boundaries_is_refused(self):
        kwargs = _kwargs()
        kwargs["scope"] = {"description": "x", "boundaries": []}
        with self.assertRaisesRegex(InvariantViolation, "PILOT_INVALID_SCOPE"):
            generate_pilot("PILOT-T-009", **kwargs)

    def test_scope_unknown_key_is_refused(self):
        kwargs = _kwargs()
        kwargs["scope"] = {"description": "x", "boundaries": ["y"], "extra": "z"}
        with self.assertRaisesRegex(InvariantViolation, "PILOT_INVALID_SCOPE"):
            generate_pilot("PILOT-T-010", **kwargs)


class MonitoringMetricsTests(unittest.TestCase):
    def test_empty_monitoring_metrics_is_refused(self):
        kwargs = _kwargs(monitoring_metrics=[])
        with self.assertRaisesRegex(InvariantViolation, "PILOT_INVALID_MONITORING_METRICS"):
            generate_pilot("PILOT-T-011", **kwargs)


class ReviewConsistencyTests(unittest.TestCase):
    def test_conducted_true_without_verdict_is_refused(self):
        kwargs = _kwargs()
        with self.assertRaisesRegex(InvariantViolation, "PILOT_INCONSISTENT_REVIEW"):
            generate_pilot("PILOT-T-012", **kwargs, review={"conducted": True, "notes": "done"})

    def test_conducted_true_without_notes_is_refused(self):
        kwargs = _kwargs()
        with self.assertRaisesRegex(InvariantViolation, "PILOT_INCONSISTENT_REVIEW"):
            generate_pilot("PILOT-T-013", **kwargs, review={"conducted": True, "verdict": "CONTINUE"})

    def test_conducted_true_with_invalid_verdict_is_refused(self):
        kwargs = _kwargs()
        with self.assertRaisesRegex(InvariantViolation, "PILOT_INCONSISTENT_REVIEW"):
            generate_pilot("PILOT-T-014", **kwargs, review={"conducted": True, "verdict": "MAYBE", "notes": "n"})

    def test_conducted_false_with_no_verdict_is_accepted(self):
        record = generate_pilot("PILOT-T-015", **_kwargs(), review={"conducted": False})
        self.assertEqual(record["review"], {"conducted": False})

    def test_conducted_true_with_verdict_and_notes_is_accepted(self):
        record = generate_pilot("PILOT-T-016", **_kwargs(), review={"conducted": True, "verdict": "STOP", "notes": "stop trigger fired on day 4"})
        self.assertEqual(record["review"]["verdict"], "STOP")

    def test_review_omitted_entirely_leaves_no_review_key(self):
        record = _valid_pilot()
        self.assertNotIn("review", record)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        record = generate_pilot("PILOT-T-017", **kwargs)
        kwargs["scope"]["boundaries"].append("mutated-after-construction")
        self.assertEqual(record["scope"]["boundaries"], ["region=TW", "cohort=opt-in-beta", "duration<=30 days"])
        self.assertIsNot(record["scope"], kwargs["scope"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_pilot(self):
        results = evaluate_pilot_gates(_valid_pilot(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_criteria_mandate_gate_catches_hand_tampered_emptied_criteria(self):
        record = copy.deepcopy(_valid_pilot())
        record["stop_criteria"] = []
        gate = evaluate_criteria_mandate_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_criteria_mandate_gate_catches_hand_tampered_removed_key(self):
        record = copy.deepcopy(_valid_pilot())
        del record["rollback_criteria"]
        gate = evaluate_criteria_mandate_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_criteria_mandate_gate_passes_a_genuinely_complete_pilot(self):
        gate = evaluate_criteria_mandate_gate(_valid_pilot(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_structural_shape_gate_catches_hand_tampered_bad_scope(self):
        record = copy.deepcopy(_valid_pilot())
        record["scope"]["boundaries"] = []
        gate = evaluate_structural_shape_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_structural_shape_gate_catches_hand_tampered_inconsistent_review(self):
        record = copy.deepcopy(_valid_pilot())
        record["review"] = {"conducted": True}
        gate = evaluate_structural_shape_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_structural_shape_gate_does_not_flag_a_genuinely_valid_review(self):
        record = copy.deepcopy(_valid_pilot())
        record["review"] = {"conducted": True, "verdict": "CONTINUE", "notes": "on track"}
        gate = evaluate_structural_shape_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_pilot_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_pilot(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_pilot())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "PILOT-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PILOT_INVALID_ID"):
            _valid_pilot(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PILOT_INVALID_VERSION"):
            generate_pilot("PILOT-T-018", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PILOT_INVALID_PROVENANCE"):
            _valid_pilot(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.pilot")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_pilot_gates(_valid_pilot(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "structural_shape", "criteria_mandate"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_pilot()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "scope", "success_criteria", "stop_criteria", "rollback_criteria", "monitoring_metrics", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class this corpus's own F13 batch found in 11/14 builders (see
    foresight.cross_impact_analysis's own regression test): a builder that returns the caller's
    ``provenance`` dict BY REFERENCE lets a post-construction mutation silently rewrite the
    already-'validated' record. This test proves ``experiment.pilot`` does not repeat that defect."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_pilot()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_pilot(
            base["id"],
            base["scope"],
            base["success_criteria"],
            base["stop_criteria"],
            base["rollback_criteria"],
            base["monitoring_metrics"],
            provenance,
        )
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
