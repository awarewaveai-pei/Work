"""Mutation-style tests for ``experiment.fake_door`` (F15 experiment & validation family, Atlas L744).

Atlas's own "告知尚未開放" (disclose: not yet available) pipeline stage is proven at BOTH
independent layers: the construction-time builder refuses an undisclosed or under-measured record,
and the independent gates re-derive the same rules directly from a raw (possibly hand-tampered)
dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.experiment.fake_door import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_disclosure_gate,
    evaluate_fake_door_gates,
    evaluate_measurement_integrity_gate,
    evaluate_provenance_required_gate,
    generate_fake_door_experiment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

FAKE_DOOR_SCHEMA = "ai-lego://specs/cognitive/typed-objects/fake-door-record.schema.yaml"
PROVENANCE = make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        feature_under_test="一鍵匯出到 Notion",
        cta_copy="立即匯出到 Notion",
        disclosure_shown=True,
        disclosure_text="此功能尚未開放，感謝您的興趣，我們已記錄下來",
        impression_count=1200,
        click_count=87,
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_experiment(*, record_id: str = "FAKEDOOR-T-001", **overrides: object):
    return generate_fake_door_experiment(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_experiment_validates_against_the_real_schema(self):
        self.contracts.validate(FAKE_DOOR_SCHEMA, _valid_experiment(), "fake door experiment")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, experiment = live.invoke(METHOD_ID, generate_fake_door_experiment, "FAKEDOOR-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/experiment.fake_door.contract.yaml")
        self.assertEqual(experiment["id"], "FAKEDOOR-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        experiment = _valid_experiment()
        experiment["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FAKE_DOOR_SCHEMA, experiment, "experiment with a smuggled top-level key")

    def test_schema_rejects_negative_click_count(self):
        experiment = _valid_experiment()
        experiment["click_count"] = -1
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FAKE_DOOR_SCHEMA, experiment, "experiment with a negative click_count")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "experiment.fake_door.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "experiment.fake_door contract")


class DisclosureInvariantTests(unittest.TestCase):
    """Atlas L744's own '告知尚未開放' pipeline stage -- non-negotiable, not optional narrative color."""

    def test_disclosure_shown_false_is_refused(self):
        kwargs = _kwargs(disclosure_shown=False)
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_NOT_DISCLOSED"):
            generate_fake_door_experiment("FAKEDOOR-T-002", **kwargs)

    def test_disclosure_shown_as_truthy_int_one_is_refused_not_silently_coerced(self):
        """``disclosure_shown`` must be the real bool ``True``, not merely truthy -- ``1`` is refused."""
        kwargs = _kwargs(disclosure_shown=1)
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_NOT_DISCLOSED"):
            generate_fake_door_experiment("FAKEDOOR-T-003", **kwargs)

    def test_empty_disclosure_text_is_refused_even_when_disclosure_shown_true(self):
        kwargs = _kwargs(disclosure_text="")
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_NOT_DISCLOSED"):
            generate_fake_door_experiment("FAKEDOOR-T-004", **kwargs)

    def test_whitespace_only_disclosure_text_is_refused(self):
        kwargs = _kwargs(disclosure_text="   ")
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_NOT_DISCLOSED"):
            generate_fake_door_experiment("FAKEDOOR-T-005", **kwargs)

    def test_genuinely_disclosed_record_is_accepted(self):
        experiment = _valid_experiment()
        self.assertTrue(experiment["disclosure_shown"])


class MeasurementIntegrityTests(unittest.TestCase):
    def test_click_count_above_impression_count_is_refused(self):
        kwargs = _kwargs(click_count=1201, impression_count=1200)
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_INVALID_MEASUREMENT"):
            generate_fake_door_experiment("FAKEDOOR-T-006", **kwargs)

    def test_negative_click_count_is_refused(self):
        kwargs = _kwargs(click_count=-1)
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_INVALID_MEASUREMENT"):
            generate_fake_door_experiment("FAKEDOOR-T-007", **kwargs)

    def test_negative_impression_count_is_refused(self):
        kwargs = _kwargs(impression_count=-1, click_count=0)
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_INVALID_MEASUREMENT"):
            generate_fake_door_experiment("FAKEDOOR-T-008", **kwargs)

    def test_boolean_click_count_is_refused_not_silently_coerced(self):
        kwargs = _kwargs(click_count=True)
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_INVALID_MEASUREMENT"):
            generate_fake_door_experiment("FAKEDOOR-T-009", **kwargs)

    def test_click_count_exactly_equal_to_impression_count_is_a_legal_boundary(self):
        kwargs = _kwargs(click_count=50, impression_count=50)
        experiment = generate_fake_door_experiment("FAKEDOOR-T-010", **kwargs)
        self.assertEqual(experiment["click_count"], experiment["impression_count"])

    def test_zero_zero_is_a_legal_boundary(self):
        kwargs = _kwargs(click_count=0, impression_count=0)
        experiment = generate_fake_door_experiment("FAKEDOOR-T-011", **kwargs)
        self.assertEqual(experiment["click_count"], 0)


class FieldCompletenessTests(unittest.TestCase):
    def test_empty_feature_under_test_is_refused(self):
        kwargs = _kwargs(feature_under_test="")
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_EMPTY_FEATURE_UNDER_TEST"):
            generate_fake_door_experiment("FAKEDOOR-T-012", **kwargs)

    def test_empty_cta_copy_is_refused(self):
        kwargs = _kwargs(cta_copy="")
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_EMPTY_CTA_COPY"):
            generate_fake_door_experiment("FAKEDOOR-T-013", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_provenance_after_construction_does_not_affect_the_returned_record(self):
        provenance = make_provenance("SOURCE_FACT", "HUMAN_ORIGINAL")
        experiment = generate_fake_door_experiment("FAKEDOOR-T-014", **_kwargs(provenance=provenance))
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(experiment["provenance"]["epistemic_type"], "SOURCE_FACT")
        self.assertIsNot(experiment["provenance"], provenance)


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_experiment(self):
        results = evaluate_fake_door_gates(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_disclosure_gate_catches_hand_tampered_disclosure_shown_false(self):
        record = copy.deepcopy(_valid_experiment())
        record["disclosure_shown"] = False
        gate = evaluate_disclosure_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_disclosure_gate_catches_hand_tampered_empty_disclosure_text(self):
        record = copy.deepcopy(_valid_experiment())
        record["disclosure_text"] = ""
        gate = evaluate_disclosure_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_disclosure_gate_passes_a_genuinely_disclosed_record(self):
        gate = evaluate_disclosure_gate(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_measurement_integrity_gate_catches_hand_tampered_over_limit_click_count(self):
        record = copy.deepcopy(_valid_experiment())
        record["click_count"] = record["impression_count"] + 1
        gate = evaluate_measurement_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_measurement_integrity_gate_passes_a_genuinely_valid_measurement(self):
        gate = evaluate_measurement_integrity_gate(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_fake_door_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_experiment())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "FAKEDOOR-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_INVALID_ID"):
            _valid_experiment(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_INVALID_VERSION"):
            generate_fake_door_experiment("FAKEDOOR-T-015", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FAKEDOOR_INVALID_PROVENANCE"):
            _valid_experiment(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "experiment.fake_door")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_fake_door_gates(_valid_experiment(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "disclosure", "measurement_integrity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        experiment = _valid_experiment()
        self.assertEqual(
            set(experiment.keys()),
            {"id", "version", "generated_by_method", "feature_under_test", "cta_copy", "disclosure_shown", "disclosure_text", "impression_count", "click_count", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
