"""Mutation-style tests for ``decision.moscow`` (3rd `decision` family member, F16, after ahp/mcda -- a
fixed 4-bucket CATEGORICAL classifier over many items, structurally closest to `strategy.swot`, distinct
from `decision.mcda`/`decision.ahp`'s numeric scoring shape; see the module's own docstring for the full
due-diligence read on F01 Non-goals, unbuilt).

Two-layer discipline proven for BOTH headline invariants:

1. Item-id uniqueness (``MOSCOW_DUPLICATE_ITEM_ID``) -- the real, catchable form of "exactly one bucket per
   item" (bucket is a single required enum field; two buckets for one logical item is only representable as
   a duplicate id).
2. WONT-requires-reason (``MOSCOW_MISSING_WONT_REASON``) -- Atlas F16 L763's own "建立明確不做清單" benefit:
   an unstated-reason WONT is silence, not an explicit decision. Enforced at the SCHEMA layer (if/then,
   genuinely real here -- conditional requiredness is native JSON Schema vocabulary, unlike a cross-field
   equality check) AND independently re-derived at the RUNTIME layer (construction + gate).

Each is checked at CONSTRUCTION (raises before a malformed record is ever built) and independently
RE-DERIVED at the GATE (a hand-tampered copy of an already-valid record must still be caught -- the gate
never trusts a stored value)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.decision.moscow import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_BUCKETS,
    all_gates_pass,
    bucket_counts,
    evaluate_moscow_gates,
    evaluate_moscow_integrity_gate,
    evaluate_provenance_required_gate,
    generate_moscow_prioritization_record,
    items_in_bucket,
    moscow_item,
    must_ratio,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/moscow-prioritization-record.schema.yaml"
TS = "2026-09-08T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _raw_item(**overrides):
    base = {
        "id": "MOSCOW-T-I1",
        "description": "a candidate item",
        "bucket": "MUST",
        "provenance": _prov(),
    }
    base.update(overrides)
    return base


def _minimal_items():
    return [moscow_item("MOSCOW-T-I1", "a candidate item", "MUST", _prov())]


def _build(
    record_id="MOSCOW-T-001",
    release_scope="a release scope",
    items=None,
    version="1.0.0",
):
    return generate_moscow_prioritization_record(
        record_id,
        release_scope,
        _minimal_items() if items is None else items,
        _prov(),
        version=version,
    )


def _valid_record():
    return _build()


def _deliverable_items():
    return [
        moscow_item("MOSCOW-D-I1", "method contract + typed-object schema", "MUST", make_provenance("DECISION", "HUMAN_APPROVED")),
        moscow_item("MOSCOW-D-I2", "builder+gate module, two-layer invariant enforcement", "MUST", make_provenance("DECISION", "HUMAN_APPROVED")),
        moscow_item("MOSCOW-D-I3", "CLI demo", "MUST", make_provenance("DECISION", "HUMAN_APPROVED")),
        moscow_item("MOSCOW-D-I4", "60-100+ test suite", "SHOULD", make_provenance("AI_SUGGESTION", "AI_GENERATED")),
        moscow_item("MOSCOW-D-I5", "auto-generated gate-flow diagram", "COULD", make_provenance("AI_SUGGESTION", "AI_GENERATED")),
        moscow_item("MOSCOW-D-I6", "GraphQL API wrapper", "WONT", make_provenance("DECISION", "HUMAN_APPROVED"), reason="no consumer or use case yet"),
    ]


def _deliverable_record():
    return _build(record_id="MOSCOW-T-DELIVERABLE", release_scope="Cognitive OS slice deliverable set", items=_deliverable_items())


class MoscowItemConstructorTests(unittest.TestCase):
    def test_returns_the_four_base_keys(self):
        entry = moscow_item("I1", "desc", "MUST", _prov())
        self.assertEqual(set(entry.keys()), {"id", "description", "bucket", "provenance"})

    def test_reason_included_when_given(self):
        entry = moscow_item("I1", "desc", "WONT", _prov(), reason="not needed")
        self.assertEqual(entry["reason"], "not needed")

    def test_reason_omitted_when_not_given(self):
        entry = moscow_item("I1", "desc", "MUST", _prov())
        self.assertNotIn("reason", entry)

    def test_reason_omitted_when_explicitly_none(self):
        entry = moscow_item("I1", "desc", "MUST", _prov(), reason=None)
        self.assertNotIn("reason", entry)

    def test_fields_round_trip_verbatim(self):
        prov = _prov()
        entry = moscow_item("I9", "some description", "SHOULD", prov)
        self.assertEqual(entry["id"], "I9")
        self.assertEqual(entry["description"], "some description")
        self.assertEqual(entry["bucket"], "SHOULD")
        self.assertIs(entry["provenance"], prov)

    def test_non_wont_bucket_may_still_carry_a_reason(self):
        entry = moscow_item("I1", "desc", "COULD", _prov(), reason="nice-to-have annotation")
        self.assertEqual(entry["reason"], "nice-to-have annotation")


class GenerateRecordConstructionTests(unittest.TestCase):
    # --- happy path ---
    def test_minimal_record_constructs(self):
        record = _valid_record()
        self.assertTrue(record["id"].startswith(RECORD_ID_PREFIX))

    def test_defaults_version_and_generated_by_method(self):
        record = _valid_record()
        self.assertEqual(record["version"], "1.0.0")
        self.assertEqual(record["generated_by_method"], METHOD_ID)

    def test_custom_version_and_generated_by_method_round_trip(self):
        record = generate_moscow_prioritization_record("MOSCOW-T-002", "scope", _minimal_items(), _prov(), version="2.3.4", generated_by_method="decision.moscow@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(record["generated_by_method"], "decision.moscow@test")

    def test_all_four_buckets_construct_successfully(self):
        items = [
            moscow_item("I1", "d1", "MUST", _prov()),
            moscow_item("I2", "d2", "SHOULD", _prov()),
            moscow_item("I3", "d3", "COULD", _prov()),
            moscow_item("I4", "d4", "WONT", _prov(), reason="explicit reason"),
        ]
        record = _build(items=items)
        self.assertEqual(len(record["items"]), 4)

    def test_all_must_items_is_legal(self):
        items = [moscow_item("I1", "d1", "MUST", _prov()), moscow_item("I2", "d2", "MUST", _prov())]
        record = _build(items=items)
        self.assertEqual(len(record["items"]), 2)

    def test_single_wont_item_with_reason_is_legal(self):
        items = [moscow_item("I1", "d1", "WONT", _prov(), reason="explicit reason")]
        record = _build(items=items)
        self.assertEqual(record["items"][0]["bucket"], "WONT")

    def test_provenance_stored_by_reference(self):
        prov = _prov()
        record = generate_moscow_prioritization_record("MOSCOW-T-003", "scope", _minimal_items(), prov)
        self.assertIs(record["provenance"], prov)

    def test_items_list_is_rebuilt_not_aliased(self):
        items = _minimal_items()
        record = _build(items=items)
        items[0]["description"] = "mutated after construction"
        self.assertEqual(record["items"][0]["description"], "a candidate item")

    def test_items_dicts_are_rebuilt_not_aliased(self):
        items = _minimal_items()
        record = _build(items=items)
        self.assertIsNot(record["items"][0], items[0])

    # --- record_id ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_whitespace_only_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_RECORD_ID"):
            _build(record_id="   ")

    def test_record_id_without_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_RECORD_ID"):
            _build(record_id="CHANGEANALYSIS-1")

    def test_non_string_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_RECORD_ID"):
            _build(record_id=12345)

    def test_none_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_RECORD_ID"):
            _build(record_id=None)

    # --- version ---
    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_VERSION"):
            _build(version=1.0)

    def test_none_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_VERSION"):
            _build(version=None)

    # --- release_scope ---
    def test_empty_release_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_EMPTY_RECORD_FIELD"):
            _build(release_scope="")

    def test_whitespace_only_release_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_EMPTY_RECORD_FIELD"):
            _build(release_scope="   ")

    def test_non_string_release_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_EMPTY_RECORD_FIELD"):
            _build(release_scope=42)

    def test_none_release_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_EMPTY_RECORD_FIELD"):
            _build(release_scope=None)

    # --- items list shape ---
    def test_empty_items_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEMS"):
            _build(items=[])

    def test_non_list_items_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEMS"):
            _build(items={"id": "MOSCOW-T-I1"})

    def test_none_items_is_refused(self):
        # NOT via _build() -- that helper treats items=None as "use the default minimal list" (same
        # convenience _valid_record() relies on), so it would never actually exercise this path. Call the
        # generator directly to pass a real None through.
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEMS"):
            generate_moscow_prioritization_record("MOSCOW-T-001", "a release scope", None, _prov())

    def test_string_items_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEMS"):
            _build(items="MOSCOW-T-I1")

    # --- per-item shape: id / description ---
    def test_item_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=["not a dict"])

    def test_item_missing_id_is_refused(self):
        entry = _raw_item()
        del entry["id"]
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[entry])

    def test_item_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(id="")])

    def test_item_whitespace_only_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(id="   ")])

    def test_item_non_string_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(id=7)])

    def test_item_missing_description_is_refused(self):
        entry = _raw_item()
        del entry["description"]
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[entry])

    def test_item_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(description="")])

    def test_item_whitespace_only_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(description="  ")])

    def test_item_non_string_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(description=123)])

    # --- per-item shape: bucket ---
    def test_item_missing_bucket_is_refused(self):
        entry = _raw_item()
        del entry["bucket"]
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[entry])

    def test_item_lowercase_bucket_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(bucket="must")])

    def test_item_apostrophe_wont_bucket_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(bucket="WON'T")])

    def test_item_unknown_bucket_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(bucket="MAYBE")])

    def test_item_none_bucket_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(bucket=None)])

    # --- per-item shape: provenance / reason / unknown keys ---
    def test_item_missing_provenance_is_refused(self):
        entry = _raw_item()
        del entry["provenance"]
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[entry])

    def test_item_non_dict_provenance_is_refused_at_shape_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(provenance="not a dict")])

    def test_item_structurally_garbage_provenance_passes_shape_but_fails_provenance_gate(self):
        # Shape layer only confirms provenance IS a dict -- content validity is the provenance gate's own
        # job (same split fault_tree.py/change_analysis.py already establish for their own families).
        record = _build(items=[_raw_item(provenance={"nonsense": "not a real provenance_record"})])
        gate = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_item_unknown_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(unexpected_field="surprise")])

    def test_item_non_string_reason_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(bucket="WONT", reason=42)])

    def test_item_reason_on_non_wont_bucket_is_legal(self):
        record = _build(items=[_raw_item(bucket="SHOULD", reason="optional annotation")])
        self.assertEqual(record["items"][0]["reason"], "optional annotation")

    # --- invariant #2: WONT requires reason ---
    def test_wont_item_with_no_reason_key_is_refused(self):
        entry = _raw_item(bucket="WONT")
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_MISSING_WONT_REASON"):
            _build(items=[entry])

    def test_wont_item_with_empty_reason_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_MISSING_WONT_REASON"):
            _build(items=[_raw_item(bucket="WONT", reason="")])

    def test_wont_item_with_whitespace_only_reason_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_MISSING_WONT_REASON"):
            _build(items=[_raw_item(bucket="WONT", reason="   ")])

    def test_wont_item_with_explicit_none_reason_fails_shape_check_not_missing_reason_check(self):
        # An explicit `reason: None` is a TYPE violation (reason must be a string when the key is present at
        # all), caught by the generic shape check BEFORE the WONT-specific semantic check ever runs -- same
        # precedence every sibling module uses (shape, then invariant). Distinct from an ABSENT reason key
        # (test_wont_item_with_no_reason_key_is_refused, above), which correctly raises MOSCOW_MISSING_WONT_REASON.
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_ITEM"):
            _build(items=[_raw_item(bucket="WONT", reason=None)])

    def test_wont_item_error_names_the_item_id(self):
        entry = _raw_item(id="MOSCOW-T-BADWONT", bucket="WONT")
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW-T-BADWONT"):
            _build(items=[entry])

    def test_wont_item_with_real_reason_is_legal(self):
        record = _build(items=[_raw_item(bucket="WONT", reason="a genuine, disclosed exclusion reason")])
        self.assertEqual(record["items"][0]["reason"], "a genuine, disclosed exclusion reason")

    # --- invariant #1: duplicate item id ---
    def test_duplicate_item_id_is_refused(self):
        items = [moscow_item("SAME-ID", "d1", "MUST", _prov()), moscow_item("SAME-ID", "d2", "SHOULD", _prov())]
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_DUPLICATE_ITEM_ID"):
            _build(items=items)

    def test_duplicate_item_id_error_names_the_id(self):
        items = [moscow_item("DUP-X", "d1", "MUST", _prov()), moscow_item("DUP-X", "d2", "SHOULD", _prov())]
        with self.assertRaisesRegex(InvariantViolation, "DUP-X"):
            _build(items=items)

    def test_duplicate_id_across_different_buckets_is_still_refused(self):
        # A duplicate id is refused regardless of whether the two entries agree on bucket -- this IS the
        # "one item in two buckets" case the docstring describes.
        items = [moscow_item("DUP-Y", "d1", "MUST", _prov()), moscow_item("DUP-Y", "d2", "WONT", _prov(), reason="r")]
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_DUPLICATE_ITEM_ID"):
            _build(items=items)

    def test_case_different_ids_are_not_duplicates(self):
        items = [moscow_item("id-1", "d1", "MUST", _prov()), moscow_item("ID-1", "d2", "SHOULD", _prov())]
        record = _build(items=items)
        self.assertEqual(len(record["items"]), 2)

    def test_three_way_duplicate_is_refused(self):
        items = [moscow_item("TRIPLE", "d1", "MUST", _prov()), moscow_item("OTHER", "d2", "SHOULD", _prov()), moscow_item("TRIPLE", "d3", "COULD", _prov())]
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_DUPLICATE_ITEM_ID"):
            _build(items=items)

    def test_many_unique_items_construct_successfully(self):
        items = [moscow_item(f"I{n}", f"description {n}", "MUST", _prov()) for n in range(25)]
        record = _build(items=items)
        self.assertEqual(len(record["items"]), 25)


class BucketCountsComputeTests(unittest.TestCase):
    def test_all_four_keys_always_present(self):
        record = _valid_record()
        self.assertEqual(set(bucket_counts(record).keys()), VALID_BUCKETS)

    def test_unused_bucket_counts_zero(self):
        record = _valid_record()  # single MUST item
        counts = bucket_counts(record)
        self.assertEqual(counts["SHOULD"], 0)
        self.assertEqual(counts["COULD"], 0)
        self.assertEqual(counts["WONT"], 0)

    def test_counts_match_the_deliverable_scenario(self):
        counts = bucket_counts(_deliverable_record())
        self.assertEqual(counts, {"MUST": 3, "SHOULD": 1, "COULD": 1, "WONT": 1})

    def test_counts_sum_to_total_item_count(self):
        record = _deliverable_record()
        self.assertEqual(sum(bucket_counts(record).values()), len(record["items"]))

    def test_all_must_record_counts_correctly(self):
        items = [moscow_item("I1", "d", "MUST", _prov()), moscow_item("I2", "d", "MUST", _prov()), moscow_item("I3", "d", "MUST", _prov())]
        counts = bucket_counts(_build(items=items))
        self.assertEqual(counts["MUST"], 3)

    def test_recomputed_fresh_not_cached(self):
        record = _valid_record()
        first = bucket_counts(record)
        first["MUST"] = 999  # mutate the returned dict
        second = bucket_counts(record)
        self.assertEqual(second["MUST"], 1)


class ItemsInBucketComputeTests(unittest.TestCase):
    def test_returns_matching_ids_in_original_order(self):
        record = _deliverable_record()
        self.assertEqual(items_in_bucket(record, "MUST"), ["MOSCOW-D-I1", "MOSCOW-D-I2", "MOSCOW-D-I3"])

    def test_returns_empty_list_for_unused_bucket(self):
        record = _valid_record()  # single MUST item
        self.assertEqual(items_in_bucket(record, "WONT"), [])

    def test_wont_bucket_returns_the_wont_item(self):
        record = _deliverable_record()
        self.assertEqual(items_in_bucket(record, "WONT"), ["MOSCOW-D-I6"])

    def test_invalid_bucket_argument_raises(self):
        record = _valid_record()
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_BUCKET_ARGUMENT"):
            items_in_bucket(record, "MAYBE")

    def test_lowercase_bucket_argument_raises(self):
        record = _valid_record()
        with self.assertRaisesRegex(InvariantViolation, "MOSCOW_INVALID_BUCKET_ARGUMENT"):
            items_in_bucket(record, "must")


class MustRatioComputeTests(unittest.TestCase):
    def test_deliverable_scenario_ratio(self):
        self.assertAlmostEqual(must_ratio(_deliverable_record()), 3 / 6)

    def test_all_must_ratio_is_one(self):
        items = [moscow_item("I1", "d", "MUST", _prov()), moscow_item("I2", "d", "MUST", _prov())]
        self.assertEqual(must_ratio(_build(items=items)), 1.0)

    def test_no_must_ratio_is_zero(self):
        items = [moscow_item("I1", "d", "SHOULD", _prov())]
        self.assertEqual(must_ratio(_build(items=items)), 0.0)

    def test_single_must_item_ratio_is_one(self):
        self.assertEqual(must_ratio(_valid_record()), 1.0)

    def test_ratio_is_informational_not_a_gate(self):
        # A record whose MUST ratio would fail any hypothetical Must<=X% guardrail (all-MUST) still
        # constructs and passes every real gate -- must_ratio enforces nothing (see OQ-MOSCOW-2).
        items = [moscow_item(f"I{n}", "d", "MUST", _prov()) for n in range(5)]
        record = _build(items=items)
        self.assertTrue(all_gates_pass(evaluate_moscow_gates(record, "test", TS)))


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_both_gates(self):
        record = _deliverable_record()
        self.assertTrue(all_gates_pass(evaluate_moscow_gates(record, "test", TS)))

    def test_valid_record_passes_provenance_gate(self):
        self.assertEqual(evaluate_provenance_required_gate(_valid_record(), "test", TS)["status"], "PASS")

    def test_valid_record_passes_integrity_gate(self):
        self.assertEqual(evaluate_moscow_integrity_gate(_valid_record(), "test", TS)["status"], "PASS")

    def test_integrity_gate_evidence_reports_bucket_counts(self):
        result = evaluate_moscow_integrity_gate(_deliverable_record(), "test", TS)
        self.assertEqual(result["evidence"][0]["bucket_counts"], {"MUST": 3, "SHOULD": 1, "COULD": 1, "WONT": 1})

    # --- provenance gate ---
    def test_provenance_gate_fails_on_non_dict_record(self):
        result = evaluate_provenance_required_gate("not a record", "test", TS)
        self.assertEqual(result["status"], "FAIL")

    def test_provenance_gate_fails_on_missing_record_provenance(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")

    def test_provenance_gate_fails_on_invalid_item_provenance(self):
        record = _valid_record()
        record["items"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "ALSO_NOT_REAL"}
        result = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("MOSCOW-T-I1", result["evidence"][0]["invalid_provenance_entry_ids"])

    def test_provenance_gate_lists_only_the_bad_item(self):
        record = _deliverable_record()
        record["items"][0]["provenance"] = None
        result = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(result["evidence"][0]["invalid_provenance_entry_ids"], ["MOSCOW-D-I1"])

    # --- integrity gate: record-level fields ---
    def test_integrity_gate_fails_on_non_dict_record(self):
        self.assertEqual(evaluate_moscow_integrity_gate(None, "test", TS)["status"], "FAIL")

    def test_integrity_gate_fails_on_tampered_id_prefix(self):
        record = _valid_record()
        record["id"] = "NOTMOSCOW-2026-001"
        result = evaluate_moscow_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("id", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_empty_id(self):
        record = _valid_record()
        record["id"] = ""
        self.assertEqual(evaluate_moscow_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_fails_on_non_string_version(self):
        record = _valid_record()
        record["version"] = 1.0
        result = evaluate_moscow_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("version", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_empty_release_scope(self):
        record = _valid_record()
        record["release_scope"] = "   "
        result = evaluate_moscow_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("release_scope", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_empty_items(self):
        record = _valid_record()
        record["items"] = []
        result = evaluate_moscow_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("items", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_non_list_items(self):
        record = _valid_record()
        record["items"] = "not a list"
        self.assertEqual(evaluate_moscow_integrity_gate(record, "test", TS)["status"], "FAIL")

    # --- integrity gate: re-derives per-item shape (bypassing the constructor entirely) ---
    def test_integrity_gate_catches_hand_tampered_illegal_bucket(self):
        record = _valid_record()
        record["items"][0]["bucket"] = "MAYBE"
        result = evaluate_moscow_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("malformed", result["evidence"][0]["reason"])

    def test_integrity_gate_catches_hand_tampered_missing_item_key(self):
        record = _valid_record()
        del record["items"][0]["description"]
        self.assertEqual(evaluate_moscow_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_unknown_item_key(self):
        record = _valid_record()
        record["items"][0]["smuggled_field"] = "should not be here"
        self.assertEqual(evaluate_moscow_integrity_gate(record, "test", TS)["status"], "FAIL")

    # --- integrity gate: re-derives invariant #2 (bypassing the constructor entirely) ---
    def test_integrity_gate_catches_hand_tampered_reasonless_wont(self):
        record = _deliverable_record()
        del record["items"][5]["reason"]
        result = evaluate_moscow_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "a WONT-bucket item has no non-empty reason")
        self.assertEqual(result["evidence"][0]["entry_id"], "MOSCOW-D-I6")

    def test_integrity_gate_catches_hand_tampered_whitespace_reason(self):
        record = _deliverable_record()
        record["items"][5]["reason"] = "   "
        self.assertEqual(evaluate_moscow_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_catches_bucket_flipped_to_wont_without_reason(self):
        # A MUST item hand-flipped to WONT post-construction, with no reason added -- must still be caught.
        record = _valid_record()
        record["items"][0]["bucket"] = "WONT"
        result = evaluate_moscow_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "a WONT-bucket item has no non-empty reason")

    # --- integrity gate: re-derives invariant #1 (bypassing the constructor entirely) ---
    def test_integrity_gate_catches_hand_tampered_duplicate_id(self):
        record = _deliverable_record()
        record["items"][1]["id"] = record["items"][0]["id"]
        result = evaluate_moscow_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "duplicate item id")
        self.assertEqual(result["evidence"][0]["entry_id"], record["items"][0]["id"])

    def test_integrity_gate_this_asymmetric_case_is_unreachable_through_the_real_constructor(self):
        # generate_moscow_prioritization_record's own duplicate-id check makes this construction-time
        # unreachable (proven above); the gate is the ONLY layer that can ever observe it, hence this
        # dedicated hand-tampering test.
        record = _deliverable_record()
        record["items"][2]["id"] = record["items"][3]["id"]
        self.assertEqual(evaluate_moscow_integrity_gate(record, "test", TS)["status"], "FAIL")


class EvaluateMoscowGatesTests(unittest.TestCase):
    def test_returns_exactly_two_gates_in_order(self):
        results = evaluate_moscow_gates(_valid_record(), "test", TS)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "moscow_integrity"])

    def test_all_gates_pass_true_when_both_pass(self):
        self.assertTrue(all_gates_pass(evaluate_moscow_gates(_valid_record(), "test", TS)))

    def test_all_gates_pass_false_when_one_fails(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertFalse(all_gates_pass(evaluate_moscow_gates(record, "test", TS)))

    def test_all_gates_pass_false_when_both_fail(self):
        record = _valid_record()
        record["provenance"] = None
        record["items"] = []
        self.assertFalse(all_gates_pass(evaluate_moscow_gates(record, "test", TS)))

    def test_all_gates_pass_treats_not_applicable_as_passing(self):
        fake = [{"gate_id": "x", "status": "PASS"}, {"gate_id": "y", "status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(fake))

    def test_all_gates_pass_false_on_empty_list_of_failures_is_still_true_vacuously(self):
        self.assertTrue(all_gates_pass([]))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_minimal_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal moscow record")

    def test_deliverable_scenario_record_validates_and_all_gates_pass(self):
        record = _deliverable_record()
        self.contracts.validate(RECORD_SCHEMA, record, "deliverable-set moscow record")
        self.assertTrue(all_gates_pass(evaluate_moscow_gates(record, "test", TS)))

    def test_schema_rejects_wont_item_with_no_reason(self):
        record = _valid_record()
        record["items"][0]["bucket"] = "WONT"  # no reason added -- the schema's own if/then must reject this
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "WONT item with no reason should fail schema validation")

    def test_schema_accepts_wont_item_with_reason(self):
        items = [moscow_item("I1", "d", "WONT", _prov(), reason="a real reason")]
        record = _build(items=items)
        self.contracts.validate(RECORD_SCHEMA, record, "WONT item with a reason should pass schema validation")

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "moscow-prioritization-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "moscow-prioritization-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_moscow_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_moscow_prioritization_record("MOSCOW-T-005", "s", _minimal_items(), _prov(), version="9.9.9", generated_by_method="decision.moscow@test")
        self.contracts.validate(RECORD_SCHEMA, record, "custom version/generated_by_method record")
        self.assertEqual(record["generated_by_method"], "decision.moscow@test")
        self.assertEqual(record["version"], "9.9.9")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_moscow_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_all_four_bucket_values_individually_round_trip_through_schema(self):
        for bucket in ("MUST", "SHOULD", "COULD"):
            with self.subTest(bucket=bucket):
                record = _build(items=[moscow_item("I1", "d", bucket, _prov())])
                self.contracts.validate(RECORD_SCHEMA, record, f"round-trip for bucket={bucket}")
        with self.subTest(bucket="WONT"):
            record = _build(items=[moscow_item("I1", "d", "WONT", _prov(), reason="r")])
            self.contracts.validate(RECORD_SCHEMA, record, "round-trip for bucket=WONT")


if __name__ == "__main__":
    unittest.main()
