"""Mutation-style tests for ``foresight.weak_signal_detection`` (F13 foresight family, Atlas L673).

Atlas L673's own "triangulate" pipeline word is proven at BOTH independent
layers: the construction-time builder refuses a weak signal corroborated by
fewer than 2 DISTINCT sources (including the whitespace-normalization
bug class a prior batch shipped), and the independent gates re-derive the
same rule directly from a raw (possibly hand-tampered) dict. A dedicated
``NestedListAliasingTests`` class proves ``corroborating_source_refs`` is
deep-copied, not shallow-copied.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.weak_signal_detection import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_MONITOR_STATUSES,
    all_gates_pass,
    evaluate_no_duplicate_id_gate,
    evaluate_provenance_required_gate,
    evaluate_triangulation_gate,
    evaluate_weak_signal_detection_gates,
    generate_weak_signal_detection_record,
    weak_signal,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

WEAK_SIGNAL_DETECTION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/weak-signal-detection.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _weak_signal(**overrides: object) -> dict:
    base = {
        "id": "WS-1",
        "description": "東南亞小型工廠開始詢問客製化 AI 品檢方案",
        "corroborating_source_refs": ["越南展會攤位訪談紀錄", "泰國經銷商季度回報"],
        "monitor_status": "MONITORING",
    }
    base.update(overrides)
    return base


def _kwargs(**overrides: object) -> dict:
    base = dict(weak_signals=[_weak_signal()], provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "WSIG-T-001", **overrides: object):
    return generate_weak_signal_detection_record(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(WEAK_SIGNAL_DETECTION_SCHEMA, _valid_record(), "weak signal detection record")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_weak_signal_detection_record, "WSIG-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.weak_signal_detection.contract.yaml")
        self.assertEqual(record["id"], "WSIG-T-INVOKE")

    def test_empty_catalog_blocks_weak_signal_detection_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WEAK_SIGNAL_DETECTION_SCHEMA, record, "weak signal detection record with a smuggled top-level key")

    def test_schema_rejects_zero_weak_signals(self):
        record = _valid_record()
        record["weak_signals"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WEAK_SIGNAL_DETECTION_SCHEMA, record, "weak signal detection record with zero weak signals")

    def test_schema_rejects_an_invalid_monitor_status(self):
        record = _valid_record()
        record["weak_signals"][0]["monitor_status"] = "VIBES"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WEAK_SIGNAL_DETECTION_SCHEMA, record, "weak signal detection record with an invalid monitor_status")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.weak_signal_detection.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.weak_signal_detection contract")


class TriangulationTests(unittest.TestCase):
    """Atlas L673's own 'triangulate' pipeline word: >=2 distinct corroborating sources required."""

    def test_well_formed_record_is_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["weak_signals"]), 1)

    def test_single_source_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSIG_INVALID_WEAK_SIGNAL"):
            _valid_record(weak_signals=[_weak_signal(corroborating_source_refs=["只有一個來源"])])

    def test_two_whitespace_variants_of_the_same_source_count_as_one_and_are_refused(self):
        """The exact bug class flagged in the brief: 'eu' and 'eu ' must not count as 2 distinct sources."""
        with self.assertRaisesRegex(InvariantViolation, "WSIG_INVALID_WEAK_SIGNAL"):
            _valid_record(weak_signals=[_weak_signal(corroborating_source_refs=["eu", "eu "])])

    def test_two_genuinely_distinct_sources_is_accepted(self):
        record = _valid_record(weak_signals=[_weak_signal(corroborating_source_refs=["eu", "us"])])
        self.assertEqual(len(record["weak_signals"][0]["corroborating_source_refs"]), 2)

    def test_zero_sources_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSIG_INVALID_WEAK_SIGNAL"):
            _valid_record(weak_signals=[_weak_signal(corroborating_source_refs=[])])

    def test_blank_source_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSIG_INVALID_WEAK_SIGNAL"):
            _valid_record(weak_signals=[_weak_signal(corroborating_source_refs=["real source", "   "])])

    def test_invalid_monitor_status_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "WSIG_INVALID_WEAK_SIGNAL"):
            weak_signal("WS-1", "desc", ["a", "b"], "VIBES")

    def test_weak_signal_helper_constructs(self):
        built = weak_signal("WS-1", "desc", ["a", "b"], "MONITORING")
        self.assertEqual(built["monitor_status"], "MONITORING")

    def test_valid_monitor_statuses_constant(self):
        self.assertEqual(VALID_MONITOR_STATUSES, frozenset({"MONITORING", "ESCALATING", "CONFIRMED", "DISCONFIRMED", "ARCHIVED"}))


class DuplicateIdTests(unittest.TestCase):
    def test_duplicate_weak_signal_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSIG_DUPLICATE_ID"):
            _valid_record(weak_signals=[_weak_signal(id="WS-1"), _weak_signal(id="WS-1", corroborating_source_refs=["x", "y"])])

    def test_zero_weak_signals_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSIG_NO_WEAK_SIGNALS"):
            _valid_record(weak_signals=[])


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "WSIG-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSIG_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSIG_INVALID_VERSION"):
            generate_weak_signal_detection_record("WSIG-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WSIG_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.weak_signal_detection")

    def test_evaluate_weak_signal_detection_gates_returns_three_gates_in_order(self):
        results = evaluate_weak_signal_detection_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "triangulation_required", "no_duplicate_id"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "weak_signals", "provenance"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. Proves the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_weak_signal_detection_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_triangulation_gate_catches_hand_tampered_single_source(self):
        record = copy.deepcopy(_valid_record())
        record["weak_signals"][0]["corroborating_source_refs"] = record["weak_signals"][0]["corroborating_source_refs"][:1]
        gate = evaluate_triangulation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_triangulation_gate_catches_hand_tampered_whitespace_variant_duplicate(self):
        record = copy.deepcopy(_valid_record())
        record["weak_signals"][0]["corroborating_source_refs"] = ["eu", "eu  "]
        gate = evaluate_triangulation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_triangulation_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_triangulation_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_triangulation_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_triangulation_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_no_duplicate_id_gate_catches_hand_tampered_duplicate(self):
        record = copy.deepcopy(_valid_record())
        record["weak_signals"].append(dict(record["weak_signals"][0]))
        gate = evaluate_no_duplicate_id_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_no_duplicate_id_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_no_duplicate_id_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_no_duplicate_id_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_no_duplicate_id_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                results = evaluate_weak_signal_detection_gates(bad, "test", "2026-09-12T00:00:00Z")
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

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class NestedListAliasingTests(unittest.TestCase):
    """``corroborating_source_refs`` is a NESTED LIST field on each weak_signals[] entry -- a shallow
    ``dict(item)`` copy would NOT copy that list, silently aliasing the caller's own mutable list (the F09-batch
    critic lesson ``epistemic.evidence_matrix``'s own module docstring documents)."""

    def test_mutating_the_callers_source_refs_list_after_the_call_does_not_affect_the_returned_record(self):
        caller_refs = ["越南展會攤位訪談紀錄", "泰國經銷商季度回報"]
        caller_signal = _weak_signal(corroborating_source_refs=caller_refs)
        record = _valid_record(weak_signals=[caller_signal])
        caller_refs.append("額外來源")
        self.assertEqual(len(record["weak_signals"][0]["corroborating_source_refs"]), 2, "returned record must not alias the caller's own mutable source-refs list")

    def test_mutating_the_returned_source_refs_list_does_not_affect_the_caller(self):
        caller_refs = ["越南展會攤位訪談紀錄", "泰國經銷商季度回報"]
        caller_signal = _weak_signal(corroborating_source_refs=caller_refs)
        record = _valid_record(weak_signals=[caller_signal])
        record["weak_signals"][0]["corroborating_source_refs"].append("MUTATED")
        self.assertEqual(len(caller_refs), 2, "mutating the returned record's list must not affect the caller's own original list")



class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of this batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_record()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_weak_signal_detection_record(base["id"], base["weak_signals"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
