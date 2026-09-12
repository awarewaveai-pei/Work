"""Mutation-style tests for ``jurisdiction.localization_review`` (F23 Global Jurisdiction/
Compliance/Localization family, Atlas L940, §12.43).

§12.43's own "不把翻譯當在地化" requirement is proven at BOTH independent layers: the
construction-time builder refuses a record missing any of the 13 declared dimensions and
mechanically DERIVES (never accepts) overall_status from the 13 dimension statuses; the
independent gates re-derive the same rules directly from a raw (possibly hand-tampered) dict,
never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.jurisdiction.localization_review import (
    DIMENSIONS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_dimension_completeness_gate,
    evaluate_localization_review_gates,
    evaluate_provenance_required_gate,
    evaluate_status_derivation_gate,
    generate_localization_review,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

LOCREVIEW_SCHEMA = "ai-lego://specs/cognitive/typed-objects/localization-review-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _all_met() -> dict:
    return {name: {"status": "MET", "note": f"{name} evidence"} for name in DIMENSIONS}


def _kwargs(**overrides: object) -> dict:
    base = dict(
        target="zh-TW Taiwan storefront checkout flow",
        dimensions=_all_met(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_review(*, record_id: str = "LOCREVIEW-T-001", **overrides: object):
    return generate_localization_review(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_review_validates_against_the_real_schema(self):
        self.contracts.validate(LOCREVIEW_SCHEMA, _valid_review(), "localization review record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, review = live.invoke(METHOD_ID, generate_localization_review, "LOCREVIEW-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/jurisdiction.localization_review.contract.yaml")
        self.assertEqual(review["id"], "LOCREVIEW-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        review = _valid_review()
        review["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(LOCREVIEW_SCHEMA, review, "review with a smuggled top-level key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "jurisdiction.localization_review.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "jurisdiction.localization_review contract")


class DimensionCountTests(unittest.TestCase):
    def test_exactly_thirteen_dimensions_declared(self):
        self.assertEqual(len(DIMENSIONS), 13)
        self.assertEqual(
            set(DIMENSIONS),
            {"language", "date_time", "timezone", "currency", "number_format", "units", "address", "name", "phone", "tax", "ui_layout", "accessibility", "content_expectations"},
        )


class DimensionCompletenessTests(unittest.TestCase):
    """§12.43's own 13-dimension list -- no missing, no extra."""

    def test_missing_dimension_is_refused(self):
        kwargs = _kwargs()
        del kwargs["dimensions"]["tax"]
        with self.assertRaisesRegex(InvariantViolation, "LOCREVIEW_INVALID_DIMENSIONS"):
            generate_localization_review("LOCREVIEW-T-002", **kwargs)

    def test_language_only_review_is_refused(self):
        """The exact anti-pattern L940 names: a review declaring only Language (translation) is not localization."""
        kwargs = _kwargs()
        kwargs["dimensions"] = {"language": {"status": "MET", "note": "translated"}}
        with self.assertRaisesRegex(InvariantViolation, "LOCREVIEW_INVALID_DIMENSIONS"):
            generate_localization_review("LOCREVIEW-T-003", **kwargs)

    def test_unknown_extra_dimension_is_refused(self):
        kwargs = _kwargs()
        kwargs["dimensions"]["punctuation"] = {"status": "MET", "note": "n/a"}
        with self.assertRaisesRegex(InvariantViolation, "LOCREVIEW_INVALID_DIMENSIONS"):
            generate_localization_review("LOCREVIEW-T-004", **kwargs)

    def test_invalid_status_value_is_refused(self):
        kwargs = _kwargs()
        kwargs["dimensions"]["currency"]["status"] = "PARTIALLY_MET"
        with self.assertRaisesRegex(InvariantViolation, "LOCREVIEW_INVALID_DIMENSIONS"):
            generate_localization_review("LOCREVIEW-T-005", **kwargs)

    def test_empty_note_is_refused(self):
        kwargs = _kwargs()
        kwargs["dimensions"]["currency"]["note"] = ""
        with self.assertRaisesRegex(InvariantViolation, "LOCREVIEW_INVALID_DIMENSIONS"):
            generate_localization_review("LOCREVIEW-T-006", **kwargs)

    def test_all_thirteen_present_and_well_shaped_is_accepted(self):
        review = _valid_review()
        self.assertEqual(set(review["dimensions"].keys()), set(DIMENSIONS))


class StatusDerivationTests(unittest.TestCase):
    """overall_status must equal the mechanical recomputation, not a narrative override."""

    def test_all_met_derives_ready(self):
        review = _valid_review()
        self.assertEqual(review["overall_status"], "READY")

    def test_all_not_applicable_derives_ready(self):
        kwargs = _kwargs(dimensions={name: {"status": "NOT_APPLICABLE", "note": "n/a for this locale"} for name in DIMENSIONS})
        review = generate_localization_review("LOCREVIEW-T-007", **kwargs)
        self.assertEqual(review["overall_status"], "READY")

    def test_one_not_met_derives_not_ready(self):
        kwargs = _kwargs()
        kwargs["dimensions"]["currency"] = {"status": "NOT_MET", "note": "still shows USD"}
        review = generate_localization_review("LOCREVIEW-T-008", **kwargs)
        self.assertEqual(review["overall_status"], "NOT_READY")

    def test_language_met_alone_with_rest_not_met_is_not_ready(self):
        """The exact anti-pattern §12.43 exists to prevent: translation-only completion is NOT enough."""
        dimensions = {name: {"status": "NOT_MET", "note": "not yet addressed"} for name in DIMENSIONS}
        dimensions["language"] = {"status": "MET", "note": "translated"}
        review = generate_localization_review("LOCREVIEW-T-009", **_kwargs(dimensions=dimensions))
        self.assertEqual(review["overall_status"], "NOT_READY")


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        review = generate_localization_review("LOCREVIEW-T-010", **kwargs)
        kwargs["dimensions"]["currency"]["note"] = "MUTATED AFTER RETURN"
        self.assertEqual(review["dimensions"]["currency"]["note"], "currency evidence")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_review(self):
        results = evaluate_localization_review_gates(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_dimension_completeness_gate_catches_hand_tampered_missing_dimension(self):
        record = copy.deepcopy(_valid_review())
        del record["dimensions"]["tax"]
        gate = evaluate_dimension_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_status_derivation_gate_catches_hand_tampered_not_met_under_forced_ready(self):
        record = copy.deepcopy(_valid_review())
        record["dimensions"]["currency"] = {"status": "NOT_MET", "note": "still shows USD"}
        # record["overall_status"] is left at "READY" -- the exact bypass this gate exists to catch.
        gate = evaluate_status_derivation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_status_derivation_gate_catches_hand_tampered_not_ready_forced_when_all_met(self):
        record = copy.deepcopy(_valid_review())
        record["overall_status"] = "NOT_READY"
        gate = evaluate_status_derivation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_status_derivation_gate_passes_a_genuinely_consistent_record(self):
        gate = evaluate_status_derivation_gate(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_localization_review_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_review())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "LOCREVIEW-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOCREVIEW_INVALID_ID"):
            _valid_review(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOCREVIEW_INVALID_VERSION"):
            generate_localization_review("LOCREVIEW-T-011", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOCREVIEW_INVALID_PROVENANCE"):
            _valid_review(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_target_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LOCREVIEW_INVALID_TARGET"):
            _valid_review(target="")

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "jurisdiction.localization_review")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_localization_review_gates(_valid_review(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "dimension_completeness", "status_derivation"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        review = _valid_review()
        self.assertEqual(
            set(review.keys()),
            {"id", "version", "generated_by_method", "target", "dimensions", "overall_status", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class this corpus's F13/F15/F22 batches repeatedly found in a majority of their
    builders -- returning the caller's own ``provenance`` dict BY REFERENCE rather than a copy.
    Guards against a 5th recurrence."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_review()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_localization_review(base["id"], base["target"], base["dimensions"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
