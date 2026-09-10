"""Mutation-style tests for ``framing.non_goals`` (1st `framing` family member, F01, a brand-new family --
see the module's own docstring for the full due-diligence read verifying the decision.moscow WONT-bucket
distinction and the Atlas §22.3 automatic-authority-gate absence).

Two-layer discipline proven for BOTH headline invariants:

1. Pipeline completeness (three distinct codes -- ``NONGOALS_EMPTY_SCOPE_ITEM`` / ``NONGOALS_EMPTY_REASON`` /
   ``NONGOALS_EMPTY_REREVIEW_TRIGGER``) -- Atlas F01 L339's own 3-stage citation ("excluded scope→理由→重審
   條件"), all three mandatory per entry, unconditionally (contrast decision.moscow's WONT-only-conditional
   reason, which has no re-review field at all).
2. Item-id uniqueness (``NONGOALS_DUPLICATE_ITEM_ID``) -- same invariant class decision.moscow's own
   ``MOSCOW_DUPLICATE_ITEM_ID`` establishes for its own items[].

Each is checked at CONSTRUCTION (raises before a malformed record is ever built) and independently
RE-DERIVED at the GATE (a hand-tampered copy of an already-valid record must still be caught -- the gate
never trusts a stored value, and never crashes on malformed/non-dict input -- fails closed instead).

Also covers: the OPTIONAL related_moscow_wont_ref soft-link (format-only, resolves OQ-MOSCOW-1), schema
conformance against the real spec-root schema this same slice added, and a structural (not
Atlas-§22.3-cited -- see the module's own docstring on why no runtime guard was added) proof that no
automatic-authority-claiming field can even be smuggled into a valid record, via the schema's closed key set.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.framing.non_goals import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    entries_with_moscow_ref,
    evaluate_non_goals_gates,
    evaluate_non_goals_integrity_gate,
    evaluate_provenance_required_gate,
    excluded_scope_entry,
    generate_non_goals_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/non-goals-record.schema.yaml"
TS = "2026-09-08T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _raw_entry(**overrides):
    base = {
        "id": "NG-T-1",
        "scope_item": "some excluded item",
        "reason": "some reason",
        "re_review_trigger": "some trigger condition",
        "provenance": _prov(),
    }
    base.update(overrides)
    return base


def _minimal_entries():
    return [excluded_scope_entry("NG-T-1", "some excluded item", "some reason", "some trigger condition", _prov())]


def _build(record_id="NONGOALS-T-001", project_scope="a project scope", excluded_scope=None, version="1.0.0"):
    return generate_non_goals_record(
        record_id,
        project_scope,
        _minimal_entries() if excluded_scope is None else excluded_scope,
        _prov(),
        version=version,
    )


def _valid_record():
    return _build()


def _deliverable_entries():
    return [
        excluded_scope_entry(
            "NG-D-1",
            "即時多人協作編輯",
            "本批次目標是單人驗證管線",
            "第二個真實使用者需要同時寫入時",
            make_provenance("DECISION", "HUMAN_APPROVED"),
            related_moscow_wont_ref="MOSCOW-001-I6",
        ),
        excluded_scope_entry(
            "NG-D-2",
            "WBS（F02，尚未建置）",
            "本任務範疇明確排除",
            "F02 WBS mint 出 machine_id 時",
            make_provenance("DECISION", "HUMAN_APPROVED"),
        ),
    ]


def _deliverable_record():
    return _build(record_id="NONGOALS-T-DELIVERABLE", project_scope="Cognitive OS F01 framing family build batch", excluded_scope=_deliverable_entries())


class ExcludedScopeEntryConstructorTests(unittest.TestCase):
    def test_returns_the_five_base_keys(self):
        entry = excluded_scope_entry("E1", "item", "reason", "trigger", _prov())
        self.assertEqual(set(entry.keys()), {"id", "scope_item", "reason", "re_review_trigger", "provenance"})

    def test_related_moscow_wont_ref_included_when_given(self):
        entry = excluded_scope_entry("E1", "item", "reason", "trigger", _prov(), related_moscow_wont_ref="MOSCOW-001-I1")
        self.assertEqual(entry["related_moscow_wont_ref"], "MOSCOW-001-I1")

    def test_related_moscow_wont_ref_omitted_when_not_given(self):
        entry = excluded_scope_entry("E1", "item", "reason", "trigger", _prov())
        self.assertNotIn("related_moscow_wont_ref", entry)

    def test_related_moscow_wont_ref_omitted_when_explicitly_none(self):
        entry = excluded_scope_entry("E1", "item", "reason", "trigger", _prov(), related_moscow_wont_ref=None)
        self.assertNotIn("related_moscow_wont_ref", entry)

    def test_fields_round_trip_verbatim(self):
        prov = _prov()
        entry = excluded_scope_entry("E9", "some item", "some reason", "some trigger", prov)
        self.assertEqual(entry["id"], "E9")
        self.assertEqual(entry["scope_item"], "some item")
        self.assertEqual(entry["reason"], "some reason")
        self.assertEqual(entry["re_review_trigger"], "some trigger")
        self.assertIs(entry["provenance"], prov)


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
        record = generate_non_goals_record("NONGOALS-T-002", "scope", _minimal_entries(), _prov(), version="2.3.4", generated_by_method="framing.non_goals@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(record["generated_by_method"], "framing.non_goals@test")

    def test_multiple_entries_construct_successfully(self):
        record = _build(excluded_scope=_deliverable_entries())
        self.assertEqual(len(record["excluded_scope"]), 2)

    def test_provenance_stored_by_reference(self):
        prov = _prov()
        record = generate_non_goals_record("NONGOALS-T-003", "scope", _minimal_entries(), prov)
        self.assertIs(record["provenance"], prov)

    def test_entries_list_is_rebuilt_not_aliased(self):
        entries = _minimal_entries()
        record = _build(excluded_scope=entries)
        entries[0]["scope_item"] = "mutated after construction"
        self.assertEqual(record["excluded_scope"][0]["scope_item"], "some excluded item")

    def test_entries_dicts_are_rebuilt_not_aliased(self):
        entries = _minimal_entries()
        record = _build(excluded_scope=entries)
        self.assertIsNot(record["excluded_scope"][0], entries[0])

    def test_related_moscow_wont_ref_round_trips(self):
        record = _build(excluded_scope=_deliverable_entries())
        self.assertEqual(record["excluded_scope"][0]["related_moscow_wont_ref"], "MOSCOW-001-I6")

    def test_entry_without_moscow_ref_omits_the_key(self):
        record = _build(excluded_scope=_deliverable_entries())
        self.assertNotIn("related_moscow_wont_ref", record["excluded_scope"][1])

    # --- record_id ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_whitespace_only_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_RECORD_ID"):
            _build(record_id="   ")

    def test_record_id_without_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_RECORD_ID"):
            _build(record_id="MOSCOW-1")

    def test_non_string_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_RECORD_ID"):
            _build(record_id=12345)

    def test_none_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_RECORD_ID"):
            _build(record_id=None)

    # --- version ---
    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_VERSION"):
            _build(version=1.0)

    def test_none_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_VERSION"):
            _build(version=None)

    # --- project_scope ---
    def test_empty_project_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_PROJECT_SCOPE"):
            _build(project_scope="")

    def test_whitespace_only_project_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_PROJECT_SCOPE"):
            _build(project_scope="   ")

    def test_non_string_project_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_PROJECT_SCOPE"):
            _build(project_scope=42)

    def test_none_project_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_PROJECT_SCOPE"):
            _build(project_scope=None)

    # --- excluded_scope list shape ---
    def test_empty_excluded_scope_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_EXCLUDED_SCOPE"):
            _build(excluded_scope=[])

    def test_non_list_excluded_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_EXCLUDED_SCOPE"):
            _build(excluded_scope={"id": "NG-T-1"})

    def test_none_excluded_scope_is_refused(self):
        # NOT via _build() -- that helper treats excluded_scope=None as "use the default minimal list", so
        # it would never actually exercise this path. Call the generator directly to pass a real None through.
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_EXCLUDED_SCOPE"):
            generate_non_goals_record("NONGOALS-T-001", "a project scope", None, _prov())

    def test_string_excluded_scope_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_EXCLUDED_SCOPE"):
            _build(excluded_scope="NG-T-1")

    # --- per-entry shape: id ---
    def test_entry_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=["not a dict"])

    def test_entry_missing_id_is_refused(self):
        entry = _raw_entry()
        del entry["id"]
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[entry])

    def test_entry_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[_raw_entry(id="")])

    def test_entry_whitespace_only_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[_raw_entry(id="   ")])

    def test_entry_non_string_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[_raw_entry(id=7)])

    # --- per-entry shape: provenance / unknown keys ---
    def test_entry_missing_provenance_is_refused(self):
        entry = _raw_entry()
        del entry["provenance"]
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[entry])

    def test_entry_non_dict_provenance_is_refused_at_shape_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[_raw_entry(provenance="not a dict")])

    def test_entry_structurally_garbage_provenance_passes_shape_but_fails_provenance_gate(self):
        # Shape layer only confirms provenance IS a dict -- content validity is the provenance gate's own
        # job (same split decision.moscow's own module already establishes).
        record = _build(excluded_scope=[_raw_entry(provenance={"nonsense": "not a real provenance_record"})])
        gate = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_entry_unknown_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[_raw_entry(unexpected_field="surprise")])

    def test_entry_non_string_scope_item_is_refused_at_shape_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[_raw_entry(scope_item=42)])

    def test_entry_non_string_reason_is_refused_at_shape_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[_raw_entry(reason=42)])

    def test_entry_non_string_re_review_trigger_is_refused_at_shape_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[_raw_entry(re_review_trigger=42)])

    def test_entry_none_scope_item_fails_shape_not_the_completeness_check(self):
        # An explicit None is a TYPE violation (must be a string when the key is present), caught by the
        # generic shape check BEFORE the completeness-specific check ever runs -- same precedence every
        # sibling module uses (shape, then invariant).
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[_raw_entry(scope_item=None)])

    # --- invariant #1: pipeline completeness, three distinct codes ---
    def test_entry_missing_scope_item_key_is_refused_at_shape_layer(self):
        entry = _raw_entry()
        del entry["scope_item"]
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[entry])

    def test_entry_empty_scope_item_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_SCOPE_ITEM"):
            _build(excluded_scope=[_raw_entry(scope_item="")])

    def test_entry_whitespace_only_scope_item_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_SCOPE_ITEM"):
            _build(excluded_scope=[_raw_entry(scope_item="   ")])

    def test_entry_missing_reason_key_is_refused_at_shape_layer(self):
        entry = _raw_entry()
        del entry["reason"]
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[entry])

    def test_entry_empty_reason_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_REASON"):
            _build(excluded_scope=[_raw_entry(reason="")])

    def test_entry_whitespace_only_reason_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_REASON"):
            _build(excluded_scope=[_raw_entry(reason="   ")])

    def test_entry_missing_re_review_trigger_key_is_refused_at_shape_layer(self):
        entry = _raw_entry()
        del entry["re_review_trigger"]
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[entry])

    def test_entry_empty_re_review_trigger_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_REREVIEW_TRIGGER"):
            _build(excluded_scope=[_raw_entry(re_review_trigger="")])

    def test_entry_whitespace_only_re_review_trigger_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_REREVIEW_TRIGGER"):
            _build(excluded_scope=[_raw_entry(re_review_trigger="   ")])

    def test_completeness_checks_fire_in_atlas_citation_order(self):
        # All three empty at once -- scope_item (stage 1) must be reported first, matching Atlas's own
        # "excluded scope→理由→重審條件" order, not an arbitrary dict-iteration order.
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_EMPTY_SCOPE_ITEM"):
            _build(excluded_scope=[_raw_entry(scope_item="", reason="", re_review_trigger="")])

    def test_entry_error_names_the_entry_id(self):
        entry = _raw_entry(id="NG-T-BADENTRY", re_review_trigger="")
        with self.assertRaisesRegex(InvariantViolation, "NG-T-BADENTRY"):
            _build(excluded_scope=[entry])

    def test_entry_with_all_three_stages_filled_is_legal(self):
        record = _build(excluded_scope=[_raw_entry(scope_item="x", reason="y", re_review_trigger="z")])
        self.assertEqual(record["excluded_scope"][0]["re_review_trigger"], "z")

    # --- related_moscow_wont_ref format check ---
    def test_related_moscow_wont_ref_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_MOSCOW_REF"):
            _build(excluded_scope=[_raw_entry(related_moscow_wont_ref="")])

    def test_related_moscow_wont_ref_whitespace_only_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_MOSCOW_REF"):
            _build(excluded_scope=[_raw_entry(related_moscow_wont_ref="   ")])

    def test_related_moscow_wont_ref_non_string_is_refused_at_shape_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_INVALID_ENTRY"):
            _build(excluded_scope=[_raw_entry(related_moscow_wont_ref=42)])

    def test_related_moscow_wont_ref_any_nonempty_string_is_accepted_no_prefix_required(self):
        # Deliberately NOT prefix-checked (unlike record-level ids) -- moscow's own item ids carry no fixed
        # prefix either, see the schema's own compilation_decisions.
        record = _build(excluded_scope=[_raw_entry(related_moscow_wont_ref="anything-not-prefixed")])
        self.assertEqual(record["excluded_scope"][0]["related_moscow_wont_ref"], "anything-not-prefixed")

    def test_related_moscow_wont_ref_absent_is_legal(self):
        record = _valid_record()
        self.assertNotIn("related_moscow_wont_ref", record["excluded_scope"][0])

    # --- invariant #2: duplicate entry id ---
    def test_duplicate_entry_id_is_refused(self):
        entries = [
            excluded_scope_entry("SAME-ID", "i1", "r1", "t1", _prov()),
            excluded_scope_entry("SAME-ID", "i2", "r2", "t2", _prov()),
        ]
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_DUPLICATE_ITEM_ID"):
            _build(excluded_scope=entries)

    def test_duplicate_entry_id_error_names_the_id(self):
        entries = [
            excluded_scope_entry("DUP-X", "i1", "r1", "t1", _prov()),
            excluded_scope_entry("DUP-X", "i2", "r2", "t2", _prov()),
        ]
        with self.assertRaisesRegex(InvariantViolation, "DUP-X"):
            _build(excluded_scope=entries)

    def test_case_different_ids_are_not_duplicates(self):
        entries = [
            excluded_scope_entry("id-1", "i1", "r1", "t1", _prov()),
            excluded_scope_entry("ID-1", "i2", "r2", "t2", _prov()),
        ]
        record = _build(excluded_scope=entries)
        self.assertEqual(len(record["excluded_scope"]), 2)

    def test_three_way_duplicate_is_refused(self):
        entries = [
            excluded_scope_entry("TRIPLE", "i1", "r1", "t1", _prov()),
            excluded_scope_entry("OTHER", "i2", "r2", "t2", _prov()),
            excluded_scope_entry("TRIPLE", "i3", "r3", "t3", _prov()),
        ]
        with self.assertRaisesRegex(InvariantViolation, "NONGOALS_DUPLICATE_ITEM_ID"):
            _build(excluded_scope=entries)

    def test_many_unique_entries_construct_successfully(self):
        entries = [excluded_scope_entry(f"E{n}", f"item {n}", f"reason {n}", f"trigger {n}", _prov()) for n in range(25)]
        record = _build(excluded_scope=entries)
        self.assertEqual(len(record["excluded_scope"]), 25)


class EntriesWithMoscowRefComputeTests(unittest.TestCase):
    def test_returns_matching_ids_in_original_order(self):
        record = _deliverable_record()
        self.assertEqual(entries_with_moscow_ref(record), ["NG-D-1"])

    def test_returns_empty_list_when_none_carry_a_ref(self):
        record = _valid_record()  # single entry, no related_moscow_wont_ref
        self.assertEqual(entries_with_moscow_ref(record), [])

    def test_returns_all_ids_when_every_entry_carries_a_ref(self):
        entries = [
            excluded_scope_entry("E1", "i1", "r1", "t1", _prov(), related_moscow_wont_ref="MOSCOW-1"),
            excluded_scope_entry("E2", "i2", "r2", "t2", _prov(), related_moscow_wont_ref="MOSCOW-2"),
        ]
        record = _build(excluded_scope=entries)
        self.assertEqual(entries_with_moscow_ref(record), ["E1", "E2"])


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_both_gates(self):
        record = _deliverable_record()
        self.assertTrue(all_gates_pass(evaluate_non_goals_gates(record, "test", TS)))

    def test_valid_record_passes_provenance_gate(self):
        self.assertEqual(evaluate_provenance_required_gate(_valid_record(), "test", TS)["status"], "PASS")

    def test_valid_record_passes_integrity_gate(self):
        self.assertEqual(evaluate_non_goals_integrity_gate(_valid_record(), "test", TS)["status"], "PASS")

    def test_integrity_gate_evidence_reports_counts(self):
        result = evaluate_non_goals_integrity_gate(_deliverable_record(), "test", TS)
        self.assertEqual(result["evidence"][0]["excluded_scope_count"], 2)
        self.assertEqual(result["evidence"][0]["entries_with_moscow_ref"], 1)

    # --- provenance gate ---
    def test_provenance_gate_fails_on_non_dict_record(self):
        for bad_record in (None, "not a record", [], 42):
            with self.subTest(bad_record=bad_record):
                result = evaluate_provenance_required_gate(bad_record, "test", TS)
                self.assertEqual(result["status"], "FAIL")

    def test_provenance_gate_fails_on_missing_record_provenance(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")

    def test_provenance_gate_fails_on_invalid_entry_provenance(self):
        record = _valid_record()
        record["excluded_scope"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "ALSO_NOT_REAL"}
        result = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("NG-T-1", result["evidence"][0]["invalid_provenance_entry_ids"])

    def test_provenance_gate_lists_only_the_bad_entry(self):
        record = _deliverable_record()
        record["excluded_scope"][0]["provenance"] = None
        result = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(result["evidence"][0]["invalid_provenance_entry_ids"], ["NG-D-1"])

    # --- integrity gate: fails closed on malformed/non-dict input, never crashes ---
    def test_integrity_gate_fails_on_non_dict_record_without_raising(self):
        for bad_record in (None, "not-a-dict", [], 42, 3.14, True):
            with self.subTest(bad_record=bad_record):
                result = evaluate_non_goals_integrity_gate(bad_record, "test", TS)
                self.assertEqual(result["status"], "FAIL")

    def test_gates_bundle_fails_closed_on_non_dict_record_without_raising(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                results = evaluate_non_goals_gates(bad_record, "test", TS)
                self.assertFalse(all_gates_pass(results))
                self.assertEqual(len(results), 2)

    def test_integrity_gate_fails_on_tampered_id_prefix(self):
        record = _valid_record()
        record["id"] = "NOTNONGOALS-2026-001"
        result = evaluate_non_goals_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("id", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_empty_id(self):
        record = _valid_record()
        record["id"] = ""
        self.assertEqual(evaluate_non_goals_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_fails_on_non_string_version(self):
        record = _valid_record()
        record["version"] = 1.0
        result = evaluate_non_goals_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("version", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_empty_project_scope(self):
        record = _valid_record()
        record["project_scope"] = "   "
        result = evaluate_non_goals_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("project_scope", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_empty_excluded_scope(self):
        record = _valid_record()
        record["excluded_scope"] = []
        result = evaluate_non_goals_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("excluded_scope", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_non_list_excluded_scope(self):
        record = _valid_record()
        record["excluded_scope"] = "not a list"
        self.assertEqual(evaluate_non_goals_integrity_gate(record, "test", TS)["status"], "FAIL")

    # --- integrity gate: re-derives per-entry shape (bypassing the constructor entirely) ---
    def test_integrity_gate_catches_hand_tampered_missing_entry_key(self):
        record = _valid_record()
        del record["excluded_scope"][0]["scope_item"]
        self.assertEqual(evaluate_non_goals_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_unknown_entry_key(self):
        record = _valid_record()
        record["excluded_scope"][0]["smuggled_field"] = "should not be here"
        self.assertEqual(evaluate_non_goals_integrity_gate(record, "test", TS)["status"], "FAIL")

    # --- integrity gate: re-derives invariant #1 (bypassing the constructor entirely) ---
    def test_integrity_gate_catches_hand_tampered_empty_scope_item(self):
        record = _valid_record()
        record["excluded_scope"][0]["scope_item"] = ""
        result = evaluate_non_goals_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "NONGOALS_EMPTY_SCOPE_ITEM")

    def test_integrity_gate_catches_hand_tampered_empty_reason(self):
        record = _valid_record()
        record["excluded_scope"][0]["reason"] = ""
        result = evaluate_non_goals_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "NONGOALS_EMPTY_REASON")

    def test_integrity_gate_catches_hand_tampered_empty_re_review_trigger(self):
        record = _deliverable_record()
        record["excluded_scope"][0]["re_review_trigger"] = ""
        result = evaluate_non_goals_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "NONGOALS_EMPTY_REREVIEW_TRIGGER")
        self.assertEqual(result["evidence"][0]["entry_id"], "NG-D-1")

    def test_integrity_gate_catches_hand_tampered_deleted_re_review_trigger_key_via_generic_shape_reason(self):
        # Deleting a REQUIRED key entirely is a SHAPE failure (generic reason), not the specific completeness
        # code -- that code fires only once shape confirms the key is present and string-typed but blank.
        # Same layering kepner_tregoe.py's own _dimensions_are_valid establishes for its own required "is" key.
        record = _deliverable_record()
        del record["excluded_scope"][0]["re_review_trigger"]
        result = evaluate_non_goals_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("malformed", result["evidence"][0]["reason"])

    def test_integrity_gate_catches_hand_tampered_whitespace_re_review_trigger(self):
        record = _deliverable_record()
        record["excluded_scope"][0]["re_review_trigger"] = "   "
        self.assertEqual(evaluate_non_goals_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_invalid_moscow_ref(self):
        record = _deliverable_record()
        record["excluded_scope"][0]["related_moscow_wont_ref"] = "   "
        result = evaluate_non_goals_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("related_moscow_wont_ref", result["evidence"][0]["reason"])

    # --- integrity gate: re-derives invariant #2 (bypassing the constructor entirely) ---
    def test_integrity_gate_catches_hand_tampered_duplicate_id(self):
        record = _deliverable_record()
        record["excluded_scope"][1]["id"] = record["excluded_scope"][0]["id"]
        result = evaluate_non_goals_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "duplicate excluded_scope id")
        self.assertEqual(result["evidence"][0]["entry_id"], record["excluded_scope"][0]["id"])

    def test_integrity_gate_this_asymmetric_case_is_unreachable_through_the_real_constructor(self):
        # generate_non_goals_record's own duplicate-id check makes this construction-time unreachable
        # (proven above); the gate is the ONLY layer that can ever observe it, hence this dedicated
        # hand-tampering test (same asymmetric-coverage class decision.moscow's own test suite documents).
        record = _deliverable_record()
        record["excluded_scope"].append(copy.deepcopy(record["excluded_scope"][0]))
        self.assertEqual(evaluate_non_goals_integrity_gate(record, "test", TS)["status"], "FAIL")


class EvaluateNonGoalsGatesTests(unittest.TestCase):
    def test_returns_exactly_two_gates_in_order(self):
        results = evaluate_non_goals_gates(_valid_record(), "test", TS)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "non_goals_integrity"])

    def test_all_gates_pass_true_when_both_pass(self):
        self.assertTrue(all_gates_pass(evaluate_non_goals_gates(_valid_record(), "test", TS)))

    def test_all_gates_pass_false_when_one_fails(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertFalse(all_gates_pass(evaluate_non_goals_gates(record, "test", TS)))

    def test_all_gates_pass_false_when_both_fail(self):
        record = _valid_record()
        record["provenance"] = None
        record["excluded_scope"] = []
        self.assertFalse(all_gates_pass(evaluate_non_goals_gates(record, "test", TS)))

    def test_all_gates_pass_treats_not_applicable_as_passing(self):
        fake = [{"gate_id": "x", "status": "PASS"}, {"gate_id": "y", "status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(fake))


class NoAutomaticAuthorityStructuralTests(unittest.TestCase):
    """Atlas §22.3's Method-specific Gate table (grep-confirmed, see the contract's own
    forbidden_transition/compilation_decisions) does NOT cite framing.non_goals for a "no automatic
    authority" rule the way it cites MCDA (L4154) -- so no ``assert_no_automatic_authority_claim``-style
    runtime guard was added (inventing one would be fabricated scope). This class proves the WEAKER, but
    real, structural guarantee that already holds without one: the schema's closed key set
    (``additionalProperties: false``, both at the record level and the entry level) means no caller can even
    smuggle in a field like ``approved``/``final_decision``/``automatic_decision`` and have it validate --
    same class of key decision.mcda's own FORBIDDEN_AUTHORITY_KEYS denylist names."""

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_schema_rejects_an_unknown_top_level_authority_style_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, record, "record with a smuggled top-level authority-style key")

    def test_schema_rejects_an_unknown_entry_level_authority_style_key(self):
        record = _valid_record()
        record["excluded_scope"][0]["final_decision"] = "locked in, no review needed"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, record, "record with a smuggled entry-level authority-style key")

    def test_ai_generated_provenance_record_still_passes_every_gate(self):
        # The system does not silently require/inject human approval either -- gates check SHAPE validity,
        # never WHO authored it (informational only, same as every sibling in this suite).
        record = _build(excluded_scope=[excluded_scope_entry("NG-AI-1", "item", "reason", "trigger", make_provenance("AI_INFERENCE", "AI_GENERATED"))])
        self.assertTrue(all_gates_pass(evaluate_non_goals_gates(record, "test", TS)))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_minimal_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal non-goals record")

    def test_deliverable_scenario_record_validates_and_all_gates_pass(self):
        record = _deliverable_record()
        self.contracts.validate(RECORD_SCHEMA, record, "deliverable-set non-goals record")
        self.assertTrue(all_gates_pass(evaluate_non_goals_gates(record, "test", TS)))

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["excluded_scope"][0]["reason"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, tampered, "tampered non-goals record")
        gate = evaluate_non_goals_integrity_gate(tampered, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "non-goals-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "non-goals-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_non_goals_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_non_goals_record("NONGOALS-T-005", "s", _minimal_entries(), _prov(), version="9.9.9", generated_by_method="framing.non_goals@test")
        self.contracts.validate(RECORD_SCHEMA, record, "custom version/generated_by_method record")
        self.assertEqual(record["generated_by_method"], "framing.non_goals@test")
        self.assertEqual(record["version"], "9.9.9")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_non_goals_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_related_moscow_wont_ref_round_trips_through_schema(self):
        record = _build(excluded_scope=[excluded_scope_entry("NG-1", "item", "reason", "trigger", _prov(), related_moscow_wont_ref="MOSCOW-001-I6")])
        self.contracts.validate(RECORD_SCHEMA, record, "round-trip with related_moscow_wont_ref")

    def test_record_without_any_moscow_ref_still_validates(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "round-trip without related_moscow_wont_ref")


if __name__ == "__main__":
    unittest.main()
