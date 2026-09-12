"""Mutation-style tests for ``experiment.concierge_test`` (F15 experiment & validation family, Atlas L742).

Atlas's own "manual service->measure use/pay" pipeline is proven at BOTH independent layers: the
construction-time builder refuses a declared automation component, an empty/malformed measurement set, and
an invalid measurement value; the independent gates re-derive the same rules directly from a raw (possibly
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
from ai_lego.modules.experiment.concierge_test import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_concierge_test_gates,
    evaluate_manual_delivery_integrity_gate,
    evaluate_measurement_integrity_gate,
    evaluate_provenance_required_gate,
    generate_concierge_test_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

CONCIERGE_TEST_SCHEMA = "ai-lego://specs/cognitive/typed-objects/concierge-test-record.schema.yaml"
PROVENANCE = make_provenance("EVIDENCE", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        service_description="Weekly personalized meal plan, hand-assembled and emailed by a human nutritionist",
        manual_delivery={"delivered_by": "founder acting as the nutritionist", "automation_components": []},
        measurements=[
            {"metric_type": "USAGE_COUNT", "value": 34, "unit": "plans requested", "sample_size": 40, "measured_at": "2026-09-11T00:00:00Z"},
            {"metric_type": "WILLINGNESS_TO_PAY_AMOUNT", "value": 19.99, "unit": "USD/month median stated price", "sample_size": 40, "measured_at": "2026-09-11T00:00:00Z"},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "CONCIERGE-T-001", **overrides: object):
    return generate_concierge_test_record(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(CONCIERGE_TEST_SCHEMA, _valid_record(), "concierge test record")

    def test_single_measurement_is_a_valid_minimal_record(self):
        record = generate_concierge_test_record(
            "CONCIERGE-T-002",
            service_description="d",
            manual_delivery={"delivered_by": "founder", "automation_components": []},
            measurements=[{"metric_type": "USAGE_COUNT", "value": 1, "unit": "signups", "sample_size": 1, "measured_at": "2026-09-11T00:00:00Z"}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(CONCIERGE_TEST_SCHEMA, record, "minimal record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_concierge_test_record, "CONCIERGE-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.concierge_test.contract.yaml")
        self.assertEqual(record["id"], "CONCIERGE-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONCIERGE_TEST_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_an_unknown_metric_type(self):
        record = _valid_record()
        record["measurements"][0]["metric_type"] = "REVENUE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CONCIERGE_TEST_SCHEMA, record, "record with an illegal metric_type")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.concierge_test.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.concierge_test contract")


class ManualDeliveryTests(unittest.TestCase):
    """THE structural half distinguishing this method: zero automation in the declared scope."""

    def test_one_automation_component_is_refused(self):
        kwargs = _kwargs()
        kwargs["manual_delivery"]["automation_components"] = ["auto-email-scheduler"]
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_NOT_MANUAL"):
            generate_concierge_test_record("CONCIERGE-T-003", **kwargs)

    def test_multiple_automation_components_is_refused(self):
        kwargs = _kwargs()
        kwargs["manual_delivery"]["automation_components"] = ["scheduler", "chatbot"]
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_NOT_MANUAL"):
            generate_concierge_test_record("CONCIERGE-T-004", **kwargs)

    def test_empty_delivered_by_is_refused(self):
        kwargs = _kwargs()
        kwargs["manual_delivery"]["delivered_by"] = ""
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_MANUAL_DELIVERY"):
            generate_concierge_test_record("CONCIERGE-T-005", **kwargs)

    def test_zero_automation_components_is_the_legal_boundary(self):
        record = _valid_record()
        self.assertEqual(record["manual_delivery"]["automation_components"], [])


class MeasurementTests(unittest.TestCase):
    """THE real invariant this method exists to enforce: a measured usage/willingness-to-pay signal."""

    def test_zero_measurements_is_refused(self):
        kwargs = _kwargs()
        kwargs["measurements"] = []
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_TOO_FEW_MEASUREMENTS"):
            generate_concierge_test_record("CONCIERGE-T-006", **kwargs)

    def test_negative_value_is_refused(self):
        kwargs = _kwargs()
        kwargs["measurements"][0]["value"] = -1
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_MEASUREMENT"):
            generate_concierge_test_record("CONCIERGE-T-007", **kwargs)

    def test_nan_value_is_refused(self):
        kwargs = _kwargs()
        kwargs["measurements"][0]["value"] = float("nan")
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_MEASUREMENT"):
            generate_concierge_test_record("CONCIERGE-T-008", **kwargs)

    def test_boolean_value_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["measurements"][0]["value"] = True
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_MEASUREMENT"):
            generate_concierge_test_record("CONCIERGE-T-009", **kwargs)

    def test_zero_sample_size_is_refused(self):
        kwargs = _kwargs()
        kwargs["measurements"][0]["sample_size"] = 0
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_MEASUREMENT"):
            generate_concierge_test_record("CONCIERGE-T-010", **kwargs)

    def test_boolean_sample_size_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["measurements"][0]["sample_size"] = True
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_MEASUREMENT"):
            generate_concierge_test_record("CONCIERGE-T-011", **kwargs)

    def test_unparseable_measured_at_is_refused(self):
        kwargs = _kwargs()
        kwargs["measurements"][0]["measured_at"] = "not-a-timestamp"
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_MEASUREMENT"):
            generate_concierge_test_record("CONCIERGE-T-012", **kwargs)

    def test_illegal_metric_type_is_refused(self):
        kwargs = _kwargs()
        kwargs["measurements"][0]["metric_type"] = "REVENUE"
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_MEASUREMENT"):
            generate_concierge_test_record("CONCIERGE-T-013", **kwargs)

    def test_zero_value_and_sample_size_one_is_legal_boundary(self):
        kwargs = _kwargs()
        kwargs["measurements"][0]["value"] = 0
        record = generate_concierge_test_record("CONCIERGE-T-014", **kwargs)
        self.assertEqual(record["measurements"][0]["value"], 0)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        record = generate_concierge_test_record("CONCIERGE-T-015", **kwargs)
        kwargs["manual_delivery"]["automation_components"].append("late-addition")
        self.assertEqual(record["manual_delivery"]["automation_components"], [])

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        provenance = make_provenance("EVIDENCE", "HUMAN_ORIGINAL")
        record = generate_concierge_test_record("CONCIERGE-T-016", **_kwargs(provenance=provenance))
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "EVIDENCE")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_concierge_test_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_manual_delivery_integrity_gate_catches_hand_tampered_automation(self):
        record = copy.deepcopy(_valid_record())
        record["manual_delivery"]["automation_components"] = ["sneaked-in-bot"]
        gate = evaluate_manual_delivery_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_measurement_integrity_gate_catches_hand_tampered_emptied_measurements(self):
        record = copy.deepcopy(_valid_record())
        record["measurements"] = []
        gate = evaluate_measurement_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_measurement_integrity_gate_catches_hand_tampered_negative_value(self):
        record = copy.deepcopy(_valid_record())
        record["measurements"][0]["value"] = -5
        gate = evaluate_measurement_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_concierge_test_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CONCIERGE-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_VERSION"):
            generate_concierge_test_record("CONCIERGE-T-017", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_service_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CONCIERGE_EMPTY_SERVICE_DESCRIPTION"):
            _valid_record(service_description="   ")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.concierge_test")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_concierge_test_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "manual_delivery_integrity", "measurement_integrity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "service_description", "manual_delivery", "measurements", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
