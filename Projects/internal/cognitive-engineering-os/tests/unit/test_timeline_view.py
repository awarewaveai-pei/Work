"""Mutation-style tests for ``representation.timeline_view`` (F24 representation family, Atlas L968).

Atlas's own "events->time" pipeline stage is proven at BOTH independent layers: the construction-time builder
refuses a caller-proposed ordered_event_refs sequence that disagrees with the real chronological order
computed from a fresh events[] ground truth, and the independent gates re-derive the same rule directly from a
raw (possibly hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.representation.timeline_view import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_chronological_order_gate,
    evaluate_provenance_required_gate,
    evaluate_referential_integrity_gate,
    evaluate_timeline_view_gates,
    generate_timeline_view,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

TLVIEW_SCHEMA = "ai-lego://specs/cognitive/typed-objects/timeline-view-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _events() -> list[dict[str, object]]:
    # Declared out of chronological order on purpose -- event_time is what actually orders them.
    return [
        {"event_id": "EVT-1", "event_time": 100},
        {"event_id": "EVT-2", "event_time": 300},
        {"event_id": "EVT-3", "event_time": 200},
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        knowledge_ref="KO-T-001",
        events=[
            {"event_id": "EVT-1", "event_time": 100},
            {"event_id": "EVT-2", "event_time": 300},
            {"event_id": "EVT-3", "event_time": 200},
        ],
        ordered_event_refs=[
            {"event_id": "EVT-1", "marker_type": "event"},
            {"event_id": "EVT-3", "marker_type": "decision"},
            {"event_id": "EVT-2", "marker_type": "change"},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_view(*, record_id: str = "TLVIEW-T-001", **overrides: object):
    return generate_timeline_view(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_view_validates_against_the_real_schema(self):
        self.contracts.validate(TLVIEW_SCHEMA, _valid_view(), "timeline view")

    def test_single_event_is_a_valid_minimal_timeline(self):
        view = generate_timeline_view(
            "TLVIEW-T-002",
            knowledge_ref="KO-T-002",
            events=[{"event_id": "EVT-1", "event_time": 42}],
            ordered_event_refs=[{"event_id": "EVT-1", "marker_type": "event"}],
            provenance=PROVENANCE,
        )
        self.contracts.validate(TLVIEW_SCHEMA, view, "minimal timeline")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, view = live.invoke(METHOD_ID, generate_timeline_view, "TLVIEW-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/representation.timeline_view.contract.yaml")
        self.assertEqual(view["id"], "TLVIEW-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        view = _valid_view()
        view["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TLVIEW_SCHEMA, view, "view with a smuggled top-level key")

    def test_schema_rejects_an_ordered_ref_with_a_smuggled_event_time_field(self):
        view = _valid_view()
        view["ordered_event_refs"][0]["event_time"] = 100
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TLVIEW_SCHEMA, view, "view with a smuggled event_time field")

    def test_schema_rejects_invalid_marker_type_value(self):
        view = _valid_view()
        view["ordered_event_refs"][0]["marker_type"] = "milestone"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(TLVIEW_SCHEMA, view, "view with an invalid marker_type")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "representation.timeline_view.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "representation.timeline_view contract")


class ChronologicalOrderTests(unittest.TestCase):
    """Atlas L968's own 'events->time' pipeline stage -- the order must be mechanically derived, never
    accepted as a caller-asserted sequence that disagrees with the real chronology."""

    def test_misordered_sequence_is_refused(self):
        kwargs = _kwargs()
        kwargs["ordered_event_refs"][1], kwargs["ordered_event_refs"][2] = kwargs["ordered_event_refs"][2], kwargs["ordered_event_refs"][1]
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_ORDER_MISMATCH"):
            generate_timeline_view("TLVIEW-T-003", **kwargs)

    def test_declaration_order_used_verbatim_when_it_happens_to_be_wrong_is_refused(self):
        kwargs = _kwargs()
        kwargs["ordered_event_refs"] = [{"event_id": e["event_id"], "marker_type": "event"} for e in kwargs["events"]]  # EVT-1, EVT-2, EVT-3 -- declaration order, not time order
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_ORDER_MISMATCH"):
            generate_timeline_view("TLVIEW-T-004", **kwargs)

    def test_genuinely_sorted_sequence_is_accepted(self):
        view = _valid_view()
        self.assertEqual([r["event_id"] for r in view["ordered_event_refs"]], ["EVT-1", "EVT-3", "EVT-2"])

    def test_tie_broken_deterministically_by_event_id(self):
        view = generate_timeline_view(
            "TLVIEW-T-005",
            knowledge_ref="KO-T-005",
            events=[{"event_id": "EVT-B", "event_time": 50}, {"event_id": "EVT-A", "event_time": 50}],
            ordered_event_refs=[{"event_id": "EVT-A", "marker_type": "event"}, {"event_id": "EVT-B", "marker_type": "event"}],
            provenance=PROVENANCE,
        )
        self.assertEqual([r["event_id"] for r in view["ordered_event_refs"]], ["EVT-A", "EVT-B"])


class ReferentialIntegrityTests(unittest.TestCase):
    def test_missing_event_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["ordered_event_refs"] = kwargs["ordered_event_refs"][:-1]
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_MISSING_EVENT_REF"):
            generate_timeline_view("TLVIEW-T-006", **kwargs)

    def test_dangling_event_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["ordered_event_refs"][0]["event_id"] = "EVT-NONEXISTENT"
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_DANGLING_EVENT_REF"):
            generate_timeline_view("TLVIEW-T-007", **kwargs)

    def test_duplicate_event_ref_is_refused(self):
        kwargs = _kwargs()
        kwargs["ordered_event_refs"].append(dict(kwargs["ordered_event_refs"][0]))
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_DUPLICATE_EVENT_REF"):
            generate_timeline_view("TLVIEW-T-008", **kwargs)

    def test_duplicate_source_event_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["events"].append({"event_id": "EVT-1", "event_time": 999})
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_DUPLICATE_EVENT_ID"):
            generate_timeline_view("TLVIEW-T-009", **kwargs)

    def test_empty_events_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_EMPTY_EVENTS"):
            generate_timeline_view("TLVIEW-T-010", knowledge_ref="KO-T-010", events=[], ordered_event_refs=[], provenance=PROVENANCE)


class OrderedRefShapeTests(unittest.TestCase):
    def test_ordered_ref_extra_key_on_caller_input_is_silently_dropped_never_persisted(self):
        """The builder rebuilds every entry from its own named fields (same ``.get()``-extraction convention
        ``foresight.cross_impact_analysis``'s ``event()`` uses) -- an extra key on the CALLER's raw input dict
        is dropped, not smuggled through. Hand-tampering the RETURNED record afterwards is what the schema's
        ``additionalProperties: false`` catches instead (see SpecConformanceTests)."""
        kwargs = _kwargs()
        kwargs["ordered_event_refs"][0]["event_time"] = 100
        view = generate_timeline_view("TLVIEW-T-011", **kwargs)
        self.assertNotIn("event_time", view["ordered_event_refs"][0])

    def test_ordered_ref_with_invalid_marker_type_is_refused(self):
        kwargs = _kwargs()
        kwargs["ordered_event_refs"][0]["marker_type"] = "milestone"
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_INVALID_ORDERED_REFS"):
            generate_timeline_view("TLVIEW-T-012", **kwargs)

    def test_source_event_with_non_numeric_event_time_is_refused(self):
        kwargs = _kwargs()
        kwargs["events"][0]["event_time"] = "yesterday"
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_INVALID_EVENTS"):
            generate_timeline_view("TLVIEW-T-013", **kwargs)

    def test_source_event_with_boolean_event_time_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["events"][0]["event_time"] = True
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_INVALID_EVENTS"):
            generate_timeline_view("TLVIEW-T-014", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        view = generate_timeline_view("TLVIEW-T-015", **kwargs)
        kwargs["ordered_event_refs"][0]["marker_type"] = "change"
        self.assertEqual(view["ordered_event_refs"][0]["marker_type"], "event")
        self.assertIsNot(view["ordered_event_refs"], kwargs["ordered_event_refs"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_view(self):
        results = evaluate_timeline_view_gates(_valid_view(), _events(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_chronological_order_gate_catches_hand_tampered_order_swap(self):
        record = copy.deepcopy(_valid_view())
        record["ordered_event_refs"][1], record["ordered_event_refs"][2] = record["ordered_event_refs"][2], record["ordered_event_refs"][1]
        gate = evaluate_chronological_order_gate(record, _events(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_chronological_order_gate_passes_a_genuinely_correct_order(self):
        gate = evaluate_chronological_order_gate(_valid_view(), _events(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_referential_integrity_gate_catches_hand_tampered_dangling_ref(self):
        record = copy.deepcopy(_valid_view())
        record["ordered_event_refs"][0]["event_id"] = "EVT-NONEXISTENT"
        gate = evaluate_referential_integrity_gate(record, _events(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_missing_ref(self):
        record = copy.deepcopy(_valid_view())
        record["ordered_event_refs"] = record["ordered_event_refs"][:-1]
        gate = evaluate_referential_integrity_gate(record, _events(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_timeline_view_gates(bad, _events(), "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_view(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_view())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "TLVIEW-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_INVALID_ID"):
            _valid_view(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_INVALID_VERSION"):
            generate_timeline_view("TLVIEW-T-016", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_INVALID_PROVENANCE"):
            _valid_view(provenance={"epistemic_type": "NOT_REAL"})

    def test_empty_knowledge_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "TLVIEW_INVALID_KNOWLEDGE_REF"):
            _valid_view(knowledge_ref="")

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "representation.timeline_view")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_timeline_view_gates(_valid_view(), _events(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "referential_integrity", "chronological_order"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        view = _valid_view()
        self.assertEqual(
            set(view.keys()),
            {"id", "version", "generated_by_method", "knowledge_ref", "ordered_event_refs", "provenance"},
        )

    def test_builder_never_persists_event_time_onto_the_record(self):
        """Direct proof of Atlas L1053's no-duplication law: the ground-truth events[].event_time the builder
        was given never appears anywhere on the returned record."""
        view = _valid_view()
        for ref in view["ordered_event_refs"]:
            self.assertNotIn("event_time", ref)
        self.assertNotIn("events", view)


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """This corpus's own ``foresight.cross_impact_analysis`` module docstring records that 11 of a prior
    14-method batch returned the caller's own ``provenance`` dict BY REFERENCE rather than a copy -- mutating
    the caller's dict after construction silently rewrote the already-returned 'validated' record's provenance
    too, with no exception. This method's builder ``copy.deepcopy``s provenance at the return statement; this
    test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_view()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_timeline_view(base["id"], base["knowledge_ref"], _events(), base["ordered_event_refs"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
