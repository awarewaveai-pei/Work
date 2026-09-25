"""Mutation-style tests for ``architecture.event_storming`` (thirteenth Method Atlas slice, second from the
`architecture` family -- a second member tool of F18's own 10-tool Software Architecture Pack).

Atlas §11.36's own causal-flow notation directly implies a real
structural invariant: every domain_event element must be traceable to at
least one causing element (no orphan events). Proven at BOTH independent
layers -- construction-time and gate re-derivation -- the same discipline
every prior forbidden-state guard this session built already established.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.event_storming import (
    METHOD_ID,
    all_gates_pass,
    evaluate_event_storming_gates,
    evaluate_no_orphan_domain_events_gate,
    generate_event_storming_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

EVENT_STORMING_SCHEMA = "ai-lego://specs/cognitive/typed-objects/event-storming-session.schema.yaml"


def _elements():
    return [
        {"id": "A1", "type": "actor", "label": "customer"},
        {"id": "C1", "type": "command", "label": "cancel order"},
        {"id": "AG1", "type": "aggregate", "label": "Order"},
        {"id": "E1", "type": "domain_event", "label": "order cancelled"},
        {"id": "P1", "type": "policy", "label": "auto-refund after cancellation"},
        {"id": "C2", "type": "command", "label": "initiate refund"},
        {"id": "RM1", "type": "read_model", "label": "customer order history"},
    ]


def _relationships():
    return [
        {"from_id": "A1", "to_id": "C1", "label": "issues"},
        {"from_id": "C1", "to_id": "AG1", "label": "handled by"},
        {"from_id": "AG1", "to_id": "E1", "label": "emits"},
        {"from_id": "E1", "to_id": "P1", "label": "triggers"},
        {"from_id": "P1", "to_id": "C2", "label": "issues"},
        {"from_id": "E1", "to_id": "RM1", "label": "updates"},
    ]


def _valid_session():
    return generate_event_storming_session("ES-T-001", "order cancellation with refund trigger", _elements(), _relationships(), make_provenance("AI_INFERENCE", "AI_GENERATED"))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_event_storming_session_validates_against_the_real_schema(self):
        self.contracts.validate(EVENT_STORMING_SCHEMA, _valid_session(), "event storming session")

    def test_single_external_system_no_relationships_is_legal(self):
        """A session with no domain_event elements needs no incoming relationships at all -- the orphan check only
        applies to domain_event elements specifically."""
        session = generate_event_storming_session("ES-T-002", "a bare trigger, no downstream modeled yet", [{"id": "X1", "type": "external_system", "label": "payment gateway webhook"}], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(EVENT_STORMING_SCHEMA, session, "single-element session")

    def test_no_elements_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTSTORMING_NO_ELEMENTS"):
            generate_event_storming_session("ES-T-003", "x", [], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_element_type_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTSTORMING_INVALID_ELEMENT_TYPE"):
            generate_event_storming_session("ES-T-004", "x", [{"id": "E1", "type": "sticky_note", "label": "x"}], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_relationship_referencing_unknown_element_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "EVENTSTORMING_UNKNOWN_ELEMENT_IN_RELATIONSHIP"):
            generate_event_storming_session("ES-T-005", "x", [{"id": "E1", "type": "domain_event", "label": "x"}], [{"from_id": "GHOST", "to_id": "E1"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_orphan_domain_event_is_refused_at_construction(self):
        """Atlas's own notation (§11.36): every domain_event is caused by something -- a domain_event with zero
        incoming relationships contradicts that reading."""
        with self.assertRaisesRegex(InvariantViolation, "EVENTSTORMING_ORPHAN_DOMAIN_EVENT"):
            generate_event_storming_session("ES-T-006", "an event with no cause", [{"id": "E_ORPHAN", "type": "domain_event", "label": "appears from nowhere"}], [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_event_storming_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_session_passes_both_gates(self):
        results = evaluate_event_storming_gates(_valid_session(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "no_orphan_domain_events"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_orphan_event_fails_the_gate(self):
        """Mutation-style: a record that bypassed the builder's own construction-time check (e.g. a relationship
        removed after construction) must still be caught by the gate re-derivation."""
        session = _valid_session()
        session["relationships"] = [r for r in session["relationships"] if r["to_id"] != "E1"]
        gate = evaluate_no_orphan_domain_events_gate(session, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("E1", gate["evidence"][0]["orphan_domain_events"])


if __name__ == "__main__":
    unittest.main()
