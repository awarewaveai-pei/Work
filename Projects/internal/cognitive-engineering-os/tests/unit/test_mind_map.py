"""Mutation-style tests for ``association.mind_map`` (1st `association` family member, F04, opening a
brand-new family -- see the module's own docstring for the full due-diligence read: §11.1 dedicated Atlas
citation, the "Mind Map View" rendering-layer false positive ruled out, and the NESTED-not-id-cross-
referenced representation choice reused from ``decision.decision_tree``).

Two-layer discipline proven for BOTH headline invariants:

1. Tree shape/completeness (``MINDMAP_EMPTY_CENTRAL_TOPIC`` / ``MINDMAP_INVALID_MAIN_BRANCHES`` /
   ``MINDMAP_INVALID_BRANCH_ENTRY``) -- Atlas §11.1's own 5-step 標準使用方式 (L1124-1172): exactly one
   central_topic, main_branches[] each well-shaped, optional nested sub_branches[]/keywords[] each well-shaped
   when present.
2. Whole-tree id uniqueness (``MINDMAP_DUPLICATE_BRANCH_ID``) -- same invariant class
   ``framing.non_goals``'s own ``NONGOALS_DUPLICATE_ITEM_ID`` establishes, applied recursively so a
   main_branch id colliding with a NESTED sub_branch id (cross-level, not just within one array) is also
   caught.

Each is checked at CONSTRUCTION (raises before a malformed record is ever built) and independently
RE-DERIVED at the GATE (a hand-tampered copy of an already-valid record must still be caught -- the gate
never trusts a stored value, and never crashes on malformed/non-dict input -- fails closed instead).

Also covers: the real derived view ``all_keywords`` (recomputed fresh, never a stored field), schema
conformance against the real spec-root schema this same slice added, and the structural (nesting-only, no
runtime denylist needed) proof that no cross-branch reference field can even be smuggled into a valid
record, via the schema's closed key set.
"""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.association.mind_map import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    all_keywords,
    evaluate_mind_map_gates,
    evaluate_mind_map_integrity_gate,
    evaluate_provenance_required_gate,
    generate_mind_map_record,
    main_branch,
    sub_branch,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/mind-map-record.schema.yaml"
TS = "2026-09-10T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _raw_main_branch(**overrides):
    base = {"id": "MB-T-1", "label": "some direction", "provenance": _prov()}
    base.update(overrides)
    return base


def _raw_sub_branch(**overrides):
    base = {"id": "SB-T-1", "label": "some sub-direction", "provenance": _prov()}
    base.update(overrides)
    return base


def _minimal_branches():
    return [main_branch("MB-T-1", "some direction", _prov())]


def _build(record_id="MINDMAP-T-001", central_topic="a test topic", main_branches=None, version="1.0.0"):
    return generate_mind_map_record(
        record_id,
        central_topic,
        _minimal_branches() if main_branches is None else main_branches,
        _prov(),
        version=version,
    )


def _valid_record():
    return _build()


def _deliverable_branches():
    return [
        main_branch(
            "MB-D-1",
            "Mind Map 自己的結構",
            make_provenance("DECISION", "HUMAN_APPROVED"),
            sub_branches=[
                sub_branch("SB-D-1-1", "巢狀 vs 圖", make_provenance("DECISION", "HUMAN_APPROVED"), keywords=["nested", "no cross-branch ref"]),
                sub_branch("SB-D-1-2", "層級深度", make_provenance("DECISION", "HUMAN_APPROVED"), keywords=["中心", "主枝", "次枝", "關鍵詞"]),
            ],
        ),
        main_branch("MB-D-2", "下一步分群", make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    ]


def _deliverable_record():
    return _build(record_id="MINDMAP-T-DELIVERABLE", central_topic="F04 家族該怎麼開局", main_branches=_deliverable_branches())


class ConstructorTests(unittest.TestCase):
    def test_sub_branch_returns_the_three_base_keys(self):
        entry = sub_branch("S1", "label", _prov())
        self.assertEqual(set(entry.keys()), {"id", "label", "provenance"})

    def test_sub_branch_keywords_included_when_given(self):
        entry = sub_branch("S1", "label", _prov(), keywords=["a", "b"])
        self.assertEqual(entry["keywords"], ["a", "b"])

    def test_sub_branch_keywords_omitted_when_not_given(self):
        entry = sub_branch("S1", "label", _prov())
        self.assertNotIn("keywords", entry)

    def test_sub_branch_keywords_omitted_when_empty_list(self):
        entry = sub_branch("S1", "label", _prov(), keywords=[])
        self.assertNotIn("keywords", entry)

    def test_main_branch_returns_the_three_base_keys(self):
        entry = main_branch("M1", "label", _prov())
        self.assertEqual(set(entry.keys()), {"id", "label", "provenance"})

    def test_main_branch_sub_branches_included_when_given(self):
        subs = [sub_branch("S1", "l", _prov())]
        entry = main_branch("M1", "label", _prov(), sub_branches=subs)
        self.assertEqual(len(entry["sub_branches"]), 1)

    def test_main_branch_sub_branches_omitted_when_not_given(self):
        entry = main_branch("M1", "label", _prov())
        self.assertNotIn("sub_branches", entry)

    def test_main_branch_sub_branches_list_is_rebuilt_not_aliased(self):
        subs = [sub_branch("S1", "l", _prov())]
        entry = main_branch("M1", "label", _prov(), sub_branches=subs)
        subs[0]["label"] = "mutated after construction"
        self.assertEqual(entry["sub_branches"][0]["label"], "l")

    def test_fields_round_trip_verbatim(self):
        prov = _prov()
        entry = main_branch("M9", "some label", prov)
        self.assertEqual(entry["id"], "M9")
        self.assertEqual(entry["label"], "some label")
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
        record = generate_mind_map_record("MINDMAP-T-002", "topic", _minimal_branches(), _prov(), version="2.3.4", generated_by_method="association.mind_map@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(record["generated_by_method"], "association.mind_map@test")

    def test_multiple_branches_construct_successfully(self):
        record = _build(main_branches=_deliverable_branches())
        self.assertEqual(len(record["main_branches"]), 2)

    def test_provenance_stored_by_reference(self):
        prov = _prov()
        record = generate_mind_map_record("MINDMAP-T-003", "topic", _minimal_branches(), prov)
        self.assertIs(record["provenance"], prov)

    def test_main_branches_list_is_rebuilt_not_aliased(self):
        branches = _minimal_branches()
        record = _build(main_branches=branches)
        branches[0]["label"] = "mutated after construction"
        self.assertEqual(record["main_branches"][0]["label"], "some direction")

    def test_main_branches_dicts_are_rebuilt_not_aliased(self):
        branches = _minimal_branches()
        record = _build(main_branches=branches)
        self.assertIsNot(record["main_branches"][0], branches[0])

    def test_nested_sub_branches_are_rebuilt_not_aliased(self):
        branches = _deliverable_branches()
        record = _build(main_branches=branches)
        branches[0]["sub_branches"][0]["label"] = "mutated after construction"
        self.assertEqual(record["main_branches"][0]["sub_branches"][0]["label"], "巢狀 vs 圖")

    def test_sub_branches_and_keywords_round_trip(self):
        record = _build(main_branches=_deliverable_branches())
        self.assertEqual(record["main_branches"][0]["sub_branches"][0]["keywords"], ["nested", "no cross-branch ref"])

    def test_branch_without_sub_branches_omits_the_key(self):
        record = _build(main_branches=_deliverable_branches())
        self.assertNotIn("sub_branches", record["main_branches"][1])

    # --- record_id ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_whitespace_only_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_RECORD_ID"):
            _build(record_id="   ")

    def test_record_id_without_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_RECORD_ID"):
            _build(record_id="NONGOALS-1")

    def test_non_string_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_RECORD_ID"):
            _build(record_id=12345)

    def test_none_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_RECORD_ID"):
            _build(record_id=None)

    # --- version ---
    def test_non_string_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_VERSION"):
            _build(version=1.0)

    def test_none_version_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_VERSION"):
            _build(version=None)

    # --- central_topic ---
    def test_empty_central_topic_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_EMPTY_CENTRAL_TOPIC"):
            _build(central_topic="")

    def test_whitespace_only_central_topic_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_EMPTY_CENTRAL_TOPIC"):
            _build(central_topic="   ")

    def test_non_string_central_topic_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_EMPTY_CENTRAL_TOPIC"):
            _build(central_topic=42)

    def test_none_central_topic_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_EMPTY_CENTRAL_TOPIC"):
            _build(central_topic=None)

    # --- main_branches list shape ---
    def test_empty_main_branches_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_MAIN_BRANCHES"):
            _build(main_branches=[])

    def test_non_list_main_branches_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_MAIN_BRANCHES"):
            _build(main_branches={"id": "MB-T-1"})

    def test_none_main_branches_is_refused(self):
        # NOT via _build() -- that helper treats main_branches=None as "use the default minimal list", so it
        # would never actually exercise this path. Call the generator directly to pass a real None through.
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_MAIN_BRANCHES"):
            generate_mind_map_record("MINDMAP-T-001", "a topic", None, _prov())

    def test_string_main_branches_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_MAIN_BRANCHES"):
            _build(main_branches="MB-T-1")

    # --- per-main_branch shape ---
    def test_branch_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=["not a dict"])

    def test_branch_missing_id_is_refused(self):
        entry = _raw_main_branch()
        del entry["id"]
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[entry])

    def test_branch_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(id="")])

    def test_branch_non_string_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(id=7)])

    def test_branch_missing_label_is_refused(self):
        entry = _raw_main_branch()
        del entry["label"]
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[entry])

    def test_branch_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(label="")])

    def test_branch_whitespace_only_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(label="   ")])

    def test_branch_missing_provenance_is_refused(self):
        entry = _raw_main_branch()
        del entry["provenance"]
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[entry])

    def test_branch_non_dict_provenance_is_refused_at_shape_layer(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(provenance="not a dict")])

    def test_branch_structurally_garbage_provenance_passes_shape_but_fails_provenance_gate(self):
        record = _build(main_branches=[_raw_main_branch(provenance={"nonsense": "not a real provenance_record"})])
        gate = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_branch_unknown_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(unexpected_field="surprise")])

    def test_branch_empty_sub_branches_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(sub_branches=[])])

    def test_branch_non_list_sub_branches_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(sub_branches="not a list")])

    def test_branch_with_well_shaped_sub_branch_is_legal(self):
        record = _build(main_branches=[_raw_main_branch(sub_branches=[_raw_sub_branch()])])
        self.assertEqual(record["main_branches"][0]["sub_branches"][0]["id"], "SB-T-1")

    # --- per-sub_branch shape (nested one level down) ---
    def test_sub_branch_not_a_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(sub_branches=["not a dict"])])

    def test_sub_branch_missing_id_is_refused(self):
        entry = _raw_sub_branch()
        del entry["id"]
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(sub_branches=[entry])])

    def test_sub_branch_empty_label_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(sub_branches=[_raw_sub_branch(label="")])])

    def test_sub_branch_unknown_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(sub_branches=[_raw_sub_branch(unexpected_field="x")])])

    # --- keywords shape ---
    def test_sub_branch_empty_keywords_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(sub_branches=[_raw_sub_branch(keywords=[])])])

    def test_sub_branch_non_list_keywords_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(sub_branches=[_raw_sub_branch(keywords="not a list")])])

    def test_sub_branch_keywords_with_a_blank_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(sub_branches=[_raw_sub_branch(keywords=["ok", "   "])])])

    def test_sub_branch_keywords_with_a_non_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_INVALID_BRANCH_ENTRY"):
            _build(main_branches=[_raw_main_branch(sub_branches=[_raw_sub_branch(keywords=["ok", 42])])])

    def test_sub_branch_with_well_shaped_keywords_is_legal(self):
        record = _build(main_branches=[_raw_main_branch(sub_branches=[_raw_sub_branch(keywords=["a", "b"])])])
        self.assertEqual(record["main_branches"][0]["sub_branches"][0]["keywords"], ["a", "b"])

    # --- MECE-not-required (documented non-invariant) ---
    def test_two_main_branches_with_identical_labels_are_legal_not_mece(self):
        entries = [main_branch("MB-A", "same label", _prov()), main_branch("MB-B", "same label", _prov())]
        record = _build(main_branches=entries)
        self.assertEqual(len(record["main_branches"]), 2)

    # --- invariant #2: whole-tree duplicate branch id ---
    def test_duplicate_main_branch_id_is_refused(self):
        entries = [main_branch("SAME-ID", "i1", _prov()), main_branch("SAME-ID", "i2", _prov())]
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_DUPLICATE_BRANCH_ID"):
            _build(main_branches=entries)

    def test_duplicate_sub_branch_id_within_one_main_branch_is_refused(self):
        entries = [main_branch("MB-1", "m", _prov(), sub_branches=[sub_branch("SAME-ID", "s1", _prov()), sub_branch("SAME-ID", "s2", _prov())])]
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_DUPLICATE_BRANCH_ID"):
            _build(main_branches=entries)

    def test_duplicate_sub_branch_id_across_two_main_branches_is_refused(self):
        entries = [
            main_branch("MB-1", "m1", _prov(), sub_branches=[sub_branch("SAME-ID", "s1", _prov())]),
            main_branch("MB-2", "m2", _prov(), sub_branches=[sub_branch("SAME-ID", "s2", _prov())]),
        ]
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_DUPLICATE_BRANCH_ID"):
            _build(main_branches=entries)

    def test_main_branch_id_colliding_with_a_nested_sub_branch_id_is_refused(self):
        """THE cross-level case: the id namespace is shared across BOTH levels, not merely checked within
        one -- a main_branch reusing a different main_branch's own nested sub_branch id must be refused."""
        entries = [
            main_branch("MB-1", "m1", _prov(), sub_branches=[sub_branch("MB-2", "s1", _prov())]),
            main_branch("MB-2", "m2", _prov()),
        ]
        with self.assertRaisesRegex(InvariantViolation, "MINDMAP_DUPLICATE_BRANCH_ID"):
            _build(main_branches=entries)

    def test_duplicate_branch_id_error_names_the_id(self):
        entries = [main_branch("DUP-X", "i1", _prov()), main_branch("DUP-X", "i2", _prov())]
        with self.assertRaisesRegex(InvariantViolation, "DUP-X"):
            _build(main_branches=entries)

    def test_many_unique_branches_construct_successfully(self):
        entries = [main_branch(f"MB-{n}", f"direction {n}", _prov()) for n in range(20)]
        record = _build(main_branches=entries)
        self.assertEqual(len(record["main_branches"]), 20)


class AllKeywordsComputeTests(unittest.TestCase):
    def test_returns_keywords_in_tree_order(self):
        record = _deliverable_record()
        self.assertEqual(all_keywords(record), ["nested", "no cross-branch ref", "中心", "主枝", "次枝", "關鍵詞"])

    def test_returns_empty_list_when_no_branch_has_sub_branches(self):
        record = _valid_record()  # single bare main_branch, no sub_branches
        self.assertEqual(all_keywords(record), [])

    def test_returns_empty_list_when_sub_branches_carry_no_keywords(self):
        record = _build(main_branches=[main_branch("MB-1", "m", _prov(), sub_branches=[sub_branch("SB-1", "s", _prov())])])
        self.assertEqual(all_keywords(record), [])

    def test_flattens_keywords_across_multiple_sub_branches_and_main_branches(self):
        entries = [
            main_branch("MB-1", "m1", _prov(), sub_branches=[sub_branch("SB-1", "s1", _prov(), keywords=["a", "b"])]),
            main_branch("MB-2", "m2", _prov(), sub_branches=[sub_branch("SB-2", "s2", _prov(), keywords=["c"])]),
        ]
        record = _build(main_branches=entries)
        self.assertEqual(all_keywords(record), ["a", "b", "c"])


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_both_gates(self):
        record = _deliverable_record()
        self.assertTrue(all_gates_pass(evaluate_mind_map_gates(record, "test", TS)))

    def test_valid_record_passes_provenance_gate(self):
        self.assertEqual(evaluate_provenance_required_gate(_valid_record(), "test", TS)["status"], "PASS")

    def test_valid_record_passes_integrity_gate(self):
        self.assertEqual(evaluate_mind_map_integrity_gate(_valid_record(), "test", TS)["status"], "PASS")

    def test_integrity_gate_evidence_reports_counts(self):
        result = evaluate_mind_map_integrity_gate(_deliverable_record(), "test", TS)
        self.assertEqual(result["evidence"][0]["main_branch_count"], 2)
        self.assertEqual(result["evidence"][0]["total_branch_count"], 4)  # 2 main + 2 nested sub

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

    def test_provenance_gate_fails_on_invalid_main_branch_provenance(self):
        record = _valid_record()
        record["main_branches"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "ALSO_NOT_REAL"}
        result = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("MB-T-1", result["evidence"][0]["invalid_provenance_branch_ids"])

    def test_provenance_gate_fails_on_invalid_nested_sub_branch_provenance(self):
        record = _deliverable_record()
        record["main_branches"][0]["sub_branches"][0]["provenance"] = None
        result = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("SB-D-1-1", result["evidence"][0]["invalid_provenance_branch_ids"])

    # --- integrity gate: fails closed on malformed/non-dict input, never crashes ---
    def test_integrity_gate_fails_on_non_dict_record_without_raising(self):
        for bad_record in (None, "not-a-dict", [], 42, 3.14, True):
            with self.subTest(bad_record=bad_record):
                result = evaluate_mind_map_integrity_gate(bad_record, "test", TS)
                self.assertEqual(result["status"], "FAIL")

    def test_gates_bundle_fails_closed_on_non_dict_record_without_raising(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                results = evaluate_mind_map_gates(bad_record, "test", TS)
                self.assertFalse(all_gates_pass(results))
                self.assertEqual(len(results), 2)

    def test_integrity_gate_fails_on_tampered_id_prefix(self):
        record = _valid_record()
        record["id"] = "NOTMINDMAP-2026-001"
        result = evaluate_mind_map_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("id", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_empty_id(self):
        record = _valid_record()
        record["id"] = ""
        self.assertEqual(evaluate_mind_map_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_fails_on_non_string_version(self):
        record = _valid_record()
        record["version"] = 1.0
        result = evaluate_mind_map_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("version", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_empty_central_topic(self):
        record = _valid_record()
        record["central_topic"] = "   "
        result = evaluate_mind_map_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("central_topic", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_empty_main_branches(self):
        record = _valid_record()
        record["main_branches"] = []
        result = evaluate_mind_map_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("main_branches", result["evidence"][0]["reason"])

    def test_integrity_gate_fails_on_non_list_main_branches(self):
        record = _valid_record()
        record["main_branches"] = "not a list"
        self.assertEqual(evaluate_mind_map_integrity_gate(record, "test", TS)["status"], "FAIL")

    # --- integrity gate: re-derives per-entry shape (bypassing the constructor entirely) ---
    def test_integrity_gate_catches_hand_tampered_missing_branch_key(self):
        record = _valid_record()
        del record["main_branches"][0]["label"]
        self.assertEqual(evaluate_mind_map_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_unknown_branch_key(self):
        record = _valid_record()
        record["main_branches"][0]["smuggled_field"] = "should not be here"
        self.assertEqual(evaluate_mind_map_integrity_gate(record, "test", TS)["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_empty_branch_label(self):
        record = _deliverable_record()
        record["main_branches"][0]["label"] = ""
        result = evaluate_mind_map_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_nested_sub_branch_defect(self):
        record = _deliverable_record()
        record["main_branches"][0]["sub_branches"][0]["label"] = ""
        result = evaluate_mind_map_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_smuggled_cross_branch_ref_field(self):
        """No such field exists in this schema by design -- but if a caller hand-tampers one onto a stored
        sub_branch anyway (bypassing the schema entirely), the integrity gate's own closed-key-set shape
        check still rejects it, same defense-in-depth every sibling module's own unknown-key check provides."""
        record = _deliverable_record()
        record["main_branches"][0]["sub_branches"][0]["refers_to_branch_id"] = "MB-D-2"
        result = evaluate_mind_map_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")

    # --- integrity gate: re-derives invariant #2 (bypassing the constructor entirely) ---
    def test_integrity_gate_catches_hand_tampered_duplicate_main_branch_id(self):
        record = _deliverable_record()
        record["main_branches"][1]["id"] = record["main_branches"][0]["id"]
        result = evaluate_mind_map_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "MINDMAP_DUPLICATE_BRANCH_ID")

    def test_integrity_gate_catches_hand_tampered_cross_level_duplicate_id(self):
        record = _deliverable_record()
        record["main_branches"][1]["id"] = record["main_branches"][0]["sub_branches"][0]["id"]
        result = evaluate_mind_map_integrity_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "MINDMAP_DUPLICATE_BRANCH_ID")

    def test_integrity_gate_this_asymmetric_case_is_unreachable_through_the_real_constructor(self):
        # generate_mind_map_record's own duplicate-id check makes this construction-time unreachable (proven
        # above); the gate is the ONLY layer that can ever observe it, hence this dedicated hand-tampering
        # test (same asymmetric-coverage class framing.non_goals's own test suite documents).
        record = _deliverable_record()
        record["main_branches"].append(copy.deepcopy(record["main_branches"][0]))
        self.assertEqual(evaluate_mind_map_integrity_gate(record, "test", TS)["status"], "FAIL")


class EvaluateMindMapGatesTests(unittest.TestCase):
    def test_returns_exactly_two_gates_in_order(self):
        results = evaluate_mind_map_gates(_valid_record(), "test", TS)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "mind_map_integrity"])

    def test_all_gates_pass_true_when_both_pass(self):
        self.assertTrue(all_gates_pass(evaluate_mind_map_gates(_valid_record(), "test", TS)))

    def test_all_gates_pass_false_when_one_fails(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertFalse(all_gates_pass(evaluate_mind_map_gates(record, "test", TS)))

    def test_all_gates_pass_false_when_both_fail(self):
        record = _valid_record()
        record["provenance"] = None
        record["main_branches"] = []
        self.assertFalse(all_gates_pass(evaluate_mind_map_gates(record, "test", TS)))

    def test_all_gates_pass_treats_not_applicable_as_passing(self):
        fake = [{"gate_id": "x", "status": "PASS"}, {"gate_id": "y", "status": "NOT_APPLICABLE"}]
        self.assertTrue(all_gates_pass(fake))


class NoCrossBranchReferenceStructuralTests(unittest.TestCase):
    """Atlas §11.1's own 限制 ('邊沒有正式語意'／'不能因為兩個東西畫在一起就宣稱存在因果') is enforced by NESTING,
    not a runtime denylist -- this class proves the real structural guarantee: the schema's closed key set
    (``additionalProperties: false`` at every level) means no caller can even smuggle in a cross-branch
    reference field and have it validate, same class of guarantee ``framing.non_goals``'s own
    ``NoAutomaticAuthorityStructuralTests`` already establishes for a different limitation."""

    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_schema_rejects_a_smuggled_cross_branch_reference_field_on_a_main_branch(self):
        record = _valid_record()
        record["main_branches"][0]["refers_to"] = "some other branch id"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, record, "record with a smuggled cross-branch reference field")

    def test_schema_rejects_a_smuggled_cross_branch_reference_field_on_a_sub_branch(self):
        record = _deliverable_record()
        record["main_branches"][0]["sub_branches"][0]["causes"] = "MB-D-2"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, record, "record with a smuggled causal-edge field")

    def test_ai_generated_provenance_record_still_passes_every_gate(self):
        record = _build(main_branches=[main_branch("MB-AI-1", "direction", make_provenance("AI_INFERENCE", "AI_GENERATED"))])
        self.assertTrue(all_gates_pass(evaluate_mind_map_gates(record, "test", TS)))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_minimal_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal mind map record")

    def test_deliverable_scenario_record_validates_and_all_gates_pass(self):
        record = _deliverable_record()
        self.contracts.validate(RECORD_SCHEMA, record, "deliverable-set mind map record")
        self.assertTrue(all_gates_pass(evaluate_mind_map_gates(record, "test", TS)))

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["main_branches"][0]["label"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, tampered, "tampered mind map record")
        gate = evaluate_mind_map_integrity_gate(tampered, "test", TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "mind-map-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "mind-map-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_mind_map_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_mind_map_record("MINDMAP-T-005", "s", _minimal_branches(), _prov(), version="9.9.9", generated_by_method="association.mind_map@test")
        self.contracts.validate(RECORD_SCHEMA, record, "custom version/generated_by_method record")
        self.assertEqual(record["generated_by_method"], "association.mind_map@test")
        self.assertEqual(record["version"], "9.9.9")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_mind_map_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_record_without_any_sub_branches_still_validates(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "round-trip without sub_branches")

    def test_schema_rejects_unknown_top_level_key(self):
        record = _valid_record()
        record["unexpected_top_level_field"] = "smuggled in"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RECORD_SCHEMA, record, "record with unknown top-level key")

    def test_schema_rejects_duplicate_branch_ids_are_not_caught_by_schema_alone(self):
        """JSON Schema has no native cross-array uniqueness-by-subfield operator (disclosed in the schema's
        own top-level description) -- a duplicate id passes SCHEMA validation; only the runtime gate/builder
        catch it. This test documents that boundary rather than asserting a false schema guarantee."""
        record = _valid_record()
        record["main_branches"].append(dict(record["main_branches"][0]))
        self.contracts.validate(RECORD_SCHEMA, record, "schema does not itself reject a duplicate id")
        gate = evaluate_mind_map_integrity_gate(record, "test", TS)
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
