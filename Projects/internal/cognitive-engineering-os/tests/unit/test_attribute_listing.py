"""Mutation-style tests for ``association.attribute_listing`` (F04 associative-mapping family, Atlas F04
table row L415 -- the ONLY citation).

Three real invariants, each exercised at BOTH layers: construction-time refusal
(``generate_attribute_listing_record`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_attribute_listing_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely, never calling the builder itself). Schema conformance is checked against the real,
newly-minted spec-root schema (``typed-objects/attribute-listing-record.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.association.attribute_listing import (
    METHOD_ID,
    MIN_COMBINED_FROM,
    RECORD_ID_PREFIX,
    all_gates_pass,
    attribute_entry,
    evaluate_attribute_listing_gates,
    evaluate_attribute_listing_integrity_gate,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    generate_attribute_listing_record,
    recombination_entry,
    transformed_variant,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

ATTRIBUTE_LISTING_SCHEMA = "ai-lego://specs/cognitive/typed-objects/attribute-listing-record.schema.yaml"


def _variant(variant_id: str = "V1", text: str = "改成藍色", refs=None):
    return transformed_variant(variant_id, text, make_provenance("HYPOTHESIS", "AI_SUGGESTED"), supporting_evidence_refs=refs)


def _attribute(name: str = "顏色", original: str = "紅色", variants=None):
    return attribute_entry(name, original, variants if variants is not None else [_variant()], make_provenance("HYPOTHESIS", "AI_SUGGESTED"))


def _attributes():
    return [
        _attribute("顏色", "紅色", [_variant("V1", "改成藍色")]),
        _attribute("材質", "棉質", [_variant("V1", "改成聚酯纖維")]),
    ]


def _recombination(*, combined_from=None, description: str = "把兩個屬性的變換合併成一款新配色新材質提案"):
    combined_from = combined_from if combined_from is not None else [{"attribute_name": "顏色", "variant_id": "V1"}, {"attribute_name": "材質", "variant_id": "V1"}]
    return recombination_entry(combined_from, description, make_provenance("EVIDENCE", "HUMAN_APPROVED"))


def _valid_record(
    *,
    record_id: str = "ATTRLIST-T-001",
    subject: str = "測試產品",
    attributes=None,
    provenance=None,
    version: str = "1.0.0",
    recombination=None,
    informs_scamper_ref=None,
):
    return generate_attribute_listing_record(
        record_id,
        subject,
        attributes if attributes is not None else _attributes(),
        provenance if provenance is not None else make_provenance("EVIDENCE", "HUMAN_APPROVED"),
        version=version,
        recombination=recombination,
        informs_scamper_ref=informs_scamper_ref,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(ATTRIBUTE_LISTING_SCHEMA, _valid_record(), "attribute listing record")

    def test_valid_record_with_all_optional_fields_validates(self):
        record = _valid_record(recombination=_recombination(), informs_scamper_ref="SCAMPER-001")
        self.contracts.validate(ATTRIBUTE_LISTING_SCHEMA, record, "attribute listing record with all optional fields")
        self.assertIn("recombination", record)
        self.assertEqual(record["informs_scamper_ref"], "SCAMPER-001")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_attribute_listing_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_INVALID_VERSION"):
            generate_attribute_listing_record("ATTRLIST-T-002", "subject", _attributes(), make_provenance("EVIDENCE", "HUMAN_APPROVED"), version=1)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["smuggled"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ATTRIBUTE_LISTING_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_an_unknown_attribute_key(self):
        record = _valid_record()
        record["attributes"][0]["smuggled"] = "nope"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ATTRIBUTE_LISTING_SCHEMA, record, "record with a smuggled attribute key")

    def test_schema_rejects_an_unknown_variant_key(self):
        record = _valid_record()
        record["attributes"][0]["transformed_variants"][0]["smuggled"] = "nope"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ATTRIBUTE_LISTING_SCHEMA, record, "record with a smuggled variant key")

    def test_schema_rejects_zero_attributes(self):
        """Regression test for minItems:1 on attributes -- a hand-crafted empty array must fail real schema
        validation too, not just the runtime gate."""
        record = _valid_record()
        record["attributes"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ATTRIBUTE_LISTING_SCHEMA, record, "record with zero attributes")

    def test_schema_rejects_zero_transformed_variants(self):
        """Regression test for minItems:1 on transformed_variants."""
        record = _valid_record()
        record["attributes"][0]["transformed_variants"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ATTRIBUTE_LISTING_SCHEMA, record, "record with zero transformed_variants")

    def test_schema_rejects_a_single_combined_from_entry(self):
        """Regression test for minItems:2 on recombination.combined_from."""
        record = _valid_record(recombination=_recombination())
        record["recombination"]["combined_from"] = [record["recombination"]["combined_from"][0]]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(ATTRIBUTE_LISTING_SCHEMA, record, "record with a single combined_from entry")


class TooFewAttributesTests(unittest.TestCase):
    def test_empty_attributes_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_TOO_FEW_ATTRIBUTES"):
            _valid_record(attributes=[])

    def test_non_list_attributes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_TOO_FEW_ATTRIBUTES"):
            _valid_record(attributes="not-a-list")

    def test_single_attribute_is_accepted(self):
        record = _valid_record(attributes=[_attribute()])
        self.assertEqual(len(record["attributes"]), 1)


class AttributeShapeTests(unittest.TestCase):
    def test_missing_original_value_is_refused(self):
        malformed = {"attribute_name": "顏色", "transformed_variants": [_variant()], "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_INVALID_ATTRIBUTE_SHAPE"):
            _valid_record(attributes=[malformed])

    def test_empty_original_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_INVALID_ATTRIBUTE_SHAPE"):
            _valid_record(attributes=[_attribute("顏色", "   ")])

    def test_zero_transformed_variants_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_INVALID_ATTRIBUTE_SHAPE"):
            _valid_record(attributes=[_attribute("顏色", "紅色", [])])

    def test_unknown_extra_key_is_refused(self):
        attr = _attribute()
        attr["smuggled"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_INVALID_ATTRIBUTE_SHAPE"):
            _valid_record(attributes=[attr])


class DuplicateAttributeNameTests(unittest.TestCase):
    def test_duplicate_attribute_name_is_refused(self):
        attrs = [_attribute("顏色", "紅色"), _attribute("顏色", "藍色", [_variant("V1", "改成綠色")])]
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_DUPLICATE_ATTRIBUTE_NAME"):
            _valid_record(attributes=attrs)


class VariantIdUniquenessTests(unittest.TestCase):
    def test_duplicate_variant_id_within_same_attribute_is_refused(self):
        attr = _attribute("顏色", "紅色", [_variant("V1", "改成藍色"), _variant("V1", "改成綠色")])
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_DUPLICATE_VARIANT_ID"):
            _valid_record(attributes=[attr])

    def test_same_variant_id_across_different_attributes_is_legal(self):
        """variant_id only needs to be unique WITHIN its own attribute, not globally -- see module docstring."""
        record = _valid_record()
        ids_by_attribute = [{v["variant_id"] for v in a["transformed_variants"]} for a in record["attributes"]]
        self.assertTrue(all("V1" in ids for ids in ids_by_attribute))


class VariantDistinctnessTests(unittest.TestCase):
    """The core invariant: a transformed variant must genuinely differ from its own attribute's original_value
    and from its own siblings -- an echo is not '逐項變換' (transform)."""

    def test_variant_echoing_original_value_exactly_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_VARIANT_ECHOES_ORIGINAL"):
            _valid_record(attributes=[_attribute("顏色", "紅色", [_variant("V1", "紅色")])])

    def test_variant_echoing_original_value_case_and_whitespace_insensitive_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_VARIANT_ECHOES_ORIGINAL"):
            _valid_record(attributes=[_attribute("Color", "Blue", [_variant("V1", "  blue  ")])])

    def test_duplicate_variant_text_among_siblings_is_refused(self):
        attr = _attribute("顏色", "紅色", [_variant("V1", "改成藍色"), _variant("V2", "改成藍色")])
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_DUPLICATE_VARIANT_TEXT"):
            _valid_record(attributes=[attr])

    def test_duplicate_variant_text_case_and_whitespace_insensitive_is_refused(self):
        attr = _attribute("顏色", "紅色", [_variant("V1", "Change To Blue"), _variant("V2", "  change   to blue  ")])
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_DUPLICATE_VARIANT_TEXT"):
            _valid_record(attributes=[attr])

    def test_genuinely_distinct_variants_are_accepted(self):
        record = _valid_record()
        for attribute in record["attributes"]:
            texts = [v["variant_text"] for v in attribute["transformed_variants"]]
            self.assertNotIn(attribute["original_value"], texts)


class RecombinationTests(unittest.TestCase):
    def test_recombination_absent_is_legal(self):
        record = _valid_record()
        self.assertNotIn("recombination", record)

    def test_too_few_combined_from_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_TOO_FEW_COMBINED_FROM"):
            _valid_record(recombination=_recombination(combined_from=[{"attribute_name": "顏色", "variant_id": "V1"}]))

    def test_empty_combined_from_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_TOO_FEW_COMBINED_FROM"):
            _valid_record(recombination=_recombination(combined_from=[]))

    def test_combined_from_referencing_unknown_attribute_name_is_refused(self):
        bad = [{"attribute_name": "顏色", "variant_id": "V1"}, {"attribute_name": "從未存在的屬性", "variant_id": "V1"}]
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_COMBINED_FROM_NOT_FOUND"):
            _valid_record(recombination=_recombination(combined_from=bad))

    def test_combined_from_referencing_unknown_variant_id_under_real_attribute_is_refused(self):
        bad = [{"attribute_name": "顏色", "variant_id": "V1"}, {"attribute_name": "材質", "variant_id": "V-NEVER-GENERATED"}]
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_COMBINED_FROM_NOT_FOUND"):
            _valid_record(recombination=_recombination(combined_from=bad))

    def test_duplicate_combined_from_pair_is_refused(self):
        dup = [{"attribute_name": "顏色", "variant_id": "V1"}, {"attribute_name": "顏色", "variant_id": "V1"}]
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_DUPLICATE_COMBINED_FROM"):
            _valid_record(recombination=_recombination(combined_from=dup))

    def test_empty_proposal_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_INVALID_RECOMBINATION_SHAPE"):
            _valid_record(recombination=_recombination(description="   "))

    def test_valid_recombination_grounded_in_real_variants_is_accepted(self):
        record = _valid_record(recombination=_recombination())
        pairs = {(a["attribute_name"], v["variant_id"]) for a in record["attributes"] for v in a["transformed_variants"]}
        for entry in record["recombination"]["combined_from"]:
            self.assertIn((entry["attribute_name"], entry["variant_id"]), pairs)

    def test_min_combined_from_constant(self):
        self.assertEqual(MIN_COMBINED_FROM, 2)


class OptionalFieldValidationTests(unittest.TestCase):
    def test_empty_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_EMPTY_SUBJECT"):
            _valid_record(subject="")

    def test_whitespace_only_subject_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_EMPTY_SUBJECT"):
            _valid_record(subject="   ")

    def test_informs_scamper_ref_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ATTRIBUTELISTING_INVALID_INFORMS_SCAMPER_REF"):
            _valid_record(informs_scamper_ref="")

    def test_informs_scamper_ref_absent_by_default(self):
        record = _valid_record()
        self.assertNotIn("informs_scamper_ref", record)

    def test_informs_scamper_ref_present_when_given(self):
        record = _valid_record(informs_scamper_ref="SCAMPER-001")
        self.assertEqual(record["informs_scamper_ref"], "SCAMPER-001")

    def test_builder_copies_attributes_list_not_aliasing_caller_list(self):
        attrs = _attributes()
        record = _valid_record(attributes=attrs)
        attrs.append(_attribute("重量", "500g", [_variant("V1", "改成300g")]))
        self.assertEqual(len(record["attributes"]), 2)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_record(self):
        gate = evaluate_attribute_listing_integrity_gate(_valid_record(recombination=_recombination()), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_ungrounded_combined_from(self):
        record = copy.deepcopy(_valid_record(recombination=_recombination()))
        record["recombination"]["combined_from"][1]["variant_id"] = "V-NEVER-GENERATED"
        gate = evaluate_attribute_listing_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("COMBINED_FROM_NOT_FOUND", gate["evidence"][0]["reason"])

    def test_gate_catches_hand_tampered_too_few_combined_from(self):
        record = copy.deepcopy(_valid_record(recombination=_recombination()))
        record["recombination"]["combined_from"] = [record["recombination"]["combined_from"][0]]
        gate = evaluate_attribute_listing_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_attribute_name(self):
        record = copy.deepcopy(_valid_record())
        record["attributes"][1]["attribute_name"] = record["attributes"][0]["attribute_name"]
        gate = evaluate_attribute_listing_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_variant_echoing_original(self):
        record = copy.deepcopy(_valid_record())
        record["attributes"][0]["transformed_variants"][0]["variant_text"] = record["attributes"][0]["original_value"]
        gate = evaluate_attribute_listing_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_variant_id(self):
        record = copy.deepcopy(_valid_record())
        second_variant = dict(record["attributes"][0]["transformed_variants"][0])
        second_variant["variant_text"] = "另一個獨立變換"
        record["attributes"][0]["transformed_variants"].append(second_variant)
        gate = evaluate_attribute_listing_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_attribute_listing_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_attribute_listing_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_empty_subject(self):
        record = copy.deepcopy(_valid_record())
        record["subject"] = ""
        gate = evaluate_attribute_listing_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_invalid_informs_scamper_ref(self):
        record = copy.deepcopy(_valid_record())
        record["informs_scamper_ref"] = ""
        gate = evaluate_attribute_listing_integrity_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_attribute_listing_integrity_gate(bad_record, "test", "2026-09-10T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(recombination=_recombination()), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_an_attribute_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["attributes"][0]["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_a_variant_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["attributes"][0]["transformed_variants"][0]["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_recombination_provenance_invalid(self):
        record = copy.deepcopy(_valid_record(recombination=_recombination()))
        record["recombination"]["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class EvidenceLabelingGateTests(unittest.TestCase):
    def test_gate_passes_when_no_claim_is_evidence_labeled(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_passes_when_evidence_labeled_attribute_and_variant_cite_refs(self):
        attr = attribute_entry(
            "顏色",
            "紅色",
            [transformed_variant("V1", "改成藍色", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"])],
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            supporting_evidence_refs=["E-1"],
        )
        record = _valid_record(attributes=[attr, _attributes()[1]])
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_fails_when_evidence_labeled_attribute_cites_no_refs(self):
        record = copy.deepcopy(_valid_record())
        record["attributes"][0]["provenance"]["epistemic_type"] = "EVIDENCE"
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_when_evidence_labeled_variant_cites_no_refs(self):
        record = copy.deepcopy(_valid_record())
        record["attributes"][0]["transformed_variants"][0]["provenance"]["epistemic_type"] = "EVIDENCE"
        gate = evaluate_evidence_labeling_required_gate(record, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_on_empty_attributes(self):
        gate = evaluate_evidence_labeling_required_gate({"attributes": []}, "test", "2026-09-10T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_attribute_listing_gates_returns_three_gates_in_order(self):
        results = evaluate_attribute_listing_gates(_valid_record(), "test", "2026-09-10T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "attribute_listing_integrity"])

    def test_evaluate_attribute_listing_gates_all_pass_on_a_valid_record(self):
        results = evaluate_attribute_listing_gates(_valid_record(recombination=_recombination()), "test", "2026-09-10T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ATTRLIST-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "association.attribute_listing")

    def test_method_id_matches_schema_pattern(self):
        import re

        self.assertIsNotNone(re.fullmatch(r"[a-z_]+\.[a-z_]+", METHOD_ID))

    def test_transformed_variant_helper_omits_absent_optional_keys(self):
        entry = transformed_variant("V1", "改成藍色", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertNotIn("supporting_evidence_refs", entry)

    def test_transformed_variant_helper_includes_present_optional_keys(self):
        entry = transformed_variant("V1", "改成藍色", make_provenance("HYPOTHESIS", "AI_SUGGESTED"), supporting_evidence_refs=["E-1"])
        self.assertEqual(entry["supporting_evidence_refs"], ["E-1"])

    def test_attribute_entry_helper_omits_absent_optional_keys(self):
        entry = attribute_entry("顏色", "紅色", [_variant()], make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertNotIn("supporting_evidence_refs", entry)

    def test_recombination_entry_helper_builds_expected_shape(self):
        entry = recombination_entry([{"attribute_name": "顏色", "variant_id": "V1"}, {"attribute_name": "材質", "variant_id": "V1"}], "合併提案", make_provenance("EVIDENCE", "HUMAN_APPROVED"))
        self.assertEqual(entry["proposal_description"], "合併提案")
        self.assertEqual(len(entry["combined_from"]), 2)


if __name__ == "__main__":
    unittest.main()
