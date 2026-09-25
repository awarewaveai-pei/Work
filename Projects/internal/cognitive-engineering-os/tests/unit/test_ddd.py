"""Mutation-style tests for ``architecture.ddd`` (ninth Method Atlas slice, ninth `architecture`-family member --
real-world method name "Domain-Driven Design"). Two real DDD-standard structural invariants are proven at BOTH
independent layers -- construction-time and gate re-derivation: (1) every bounded_context must carry lineage to at
least one real subdomain; (2) every context_map relationship must reference two bounded_contexts that actually
exist. Test density here (not padded to an arbitrary count) reflects the record's own real structural surface: 3
array levels (subdomains/bounded_contexts/context_map), 1 structural precondition (non-empty subdomains), 2 real
cross-reference invariants, and a closed 9-value context_map pattern enum -- richer than the other 2-array
`architecture` siblings (event_storming, system_context_model, ~9-10 tests each) but not fabricated up to an
unrelated family's own test count."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.ddd import (
    METHOD_ID,
    VALID_CONTEXT_MAP_PATTERNS,
    VALID_SUBDOMAIN_TYPES,
    all_gates_pass,
    evaluate_context_map_integrity_gate,
    evaluate_ddd_gates,
    evaluate_provenance_required_gate,
    evaluate_subdomain_lineage_gate,
    generate_bounded_context_map,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

DDD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/bounded-context-map.schema.yaml"
TS = "2026-09-07T00:00:00Z"


def _subdomains():
    return [
        {"id": "SD1", "label": "Order Management", "type": "core"},
        {"id": "SD2", "label": "Payments", "type": "supporting"},
    ]


def _bounded_contexts():
    return [
        {"id": "BC1", "label": "Order Context", "subdomain_ids": ["SD1"]},
        {"id": "BC2", "label": "Payment Context", "subdomain_ids": ["SD2"]},
    ]


def _context_map():
    return [{"pattern": "customer_supplier", "from_context_id": "BC1", "to_context_id": "BC2", "notes": "Order is upstream"}]


def _valid_map():
    return generate_bounded_context_map(
        "BCM-T-001", "e-commerce order + payment domain", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
        bounded_contexts=_bounded_contexts(), context_map=_context_map(),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_map_validates_against_the_real_schema(self):
        self.contracts.validate(DDD_SCHEMA, _valid_map(), "bounded context map")

    def test_subdomains_only_no_bounded_contexts_is_legal(self):
        """A decomposition that has only reached the first pipeline stage (subdomain), not yet carved into
        bounded contexts, is a legitimate intermediate DDD artifact."""
        model = generate_bounded_context_map("BCM-T-002", "early-stage decomposition", [{"id": "SD1", "label": "Order Management"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(DDD_SCHEMA, model, "subdomains-only model")
        self.assertEqual(model["bounded_contexts"], [])
        self.assertEqual(model["context_map"], [])

    def test_bounded_contexts_with_empty_context_map_is_legal(self):
        """Contexts carved but not yet related to each other is legitimate -- context_map is the third, optional
        stage."""
        model = generate_bounded_context_map("BCM-T-003", "carved, not yet mapped", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"), bounded_contexts=_bounded_contexts())
        self.contracts.validate(DDD_SCHEMA, model, "bounded-contexts-only model")
        self.assertEqual(model["context_map"], [])

    def test_subdomain_with_no_type_is_legal(self):
        """subdomain.type is optional -- see method contract's own compilation_decisions."""
        model = generate_bounded_context_map("BCM-T-004", "x", [{"id": "SD1", "label": "untyped subdomain"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(DDD_SCHEMA, model, "untyped-subdomain model")

    def test_bounded_context_with_multiple_subdomain_ids_is_legal(self):
        """A bounded_context genuinely carved from more than one subdomain (real DDD practice) is legal, not just
        the 1-subdomain-per-context common case."""
        model = generate_bounded_context_map(
            "BCM-T-005", "x", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
            bounded_contexts=[{"id": "BC1", "label": "Order+Payment merged context", "subdomain_ids": ["SD1", "SD2"]}],
        )
        self.contracts.validate(DDD_SCHEMA, model, "multi-subdomain-lineage model")

    def test_self_referential_context_map_entry_is_currently_legal(self):
        """OQ-DDD-1: self-reference (from == to) is NOT enforced as a third invariant -- both real invariants
        (subdomain lineage, context existence) pass because BC1 genuinely exists. Documents the open question
        rather than silently forbidding an unconfirmed rule."""
        model = generate_bounded_context_map(
            "BCM-T-006", "x", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
            bounded_contexts=_bounded_contexts(),
            context_map=[{"pattern": "separate_ways", "from_context_id": "BC1", "to_context_id": "BC1"}],
        )
        self.contracts.validate(DDD_SCHEMA, model, "self-referential context_map model")
        gate = evaluate_context_map_integrity_gate(model, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_all_9_context_map_patterns_are_individually_legal(self):
        self.assertEqual(len(VALID_CONTEXT_MAP_PATTERNS), 9)
        for pattern in sorted(VALID_CONTEXT_MAP_PATTERNS):
            model = generate_bounded_context_map(
                f"BCM-T-PATTERN-{pattern}", "x", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
                bounded_contexts=_bounded_contexts(),
                context_map=[{"pattern": pattern, "from_context_id": "BC1", "to_context_id": "BC2"}],
            )
            self.contracts.validate(DDD_SCHEMA, model, f"pattern={pattern} model")

    def test_all_3_subdomain_types_are_individually_legal(self):
        self.assertEqual(VALID_SUBDOMAIN_TYPES, frozenset({"core", "supporting", "generic"}))
        for subdomain_type in sorted(VALID_SUBDOMAIN_TYPES):
            model = generate_bounded_context_map("BCM-T-TYPE", "x", [{"id": "SD1", "label": "x", "type": subdomain_type}], make_provenance("AI_INFERENCE", "AI_GENERATED"))
            self.contracts.validate(DDD_SCHEMA, model, f"subdomain type={subdomain_type} model")

    def test_no_subdomains_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DDD_NO_SUBDOMAINS"):
            generate_bounded_context_map("BCM-T-007", "x", [], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_subdomain_type_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DDD_INVALID_SUBDOMAIN_TYPE"):
            generate_bounded_context_map("BCM-T-008", "x", [{"id": "SD1", "label": "x", "type": "bespoke"}], make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_bounded_context_with_empty_subdomain_ids_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DDD_BOUNDED_CONTEXT_NO_SUBDOMAIN_LINEAGE"):
            generate_bounded_context_map(
                "BCM-T-009", "x", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
                bounded_contexts=[{"id": "BC1", "label": "x", "subdomain_ids": []}],
            )

    def test_bounded_context_referencing_unknown_subdomain_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DDD_BOUNDED_CONTEXT_UNKNOWN_SUBDOMAIN"):
            generate_bounded_context_map(
                "BCM-T-010", "x", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
                bounded_contexts=[{"id": "BC1", "label": "x", "subdomain_ids": ["SD-GHOST"]}],
            )

    def test_bounded_context_with_one_real_and_one_ghost_subdomain_is_refused_at_construction(self):
        """Partial validity does not save it -- ANY unknown reference fails, same strict full-set check
        architecture.system_context_model's own hierarchy_integrity check already applies."""
        with self.assertRaisesRegex(InvariantViolation, "DDD_BOUNDED_CONTEXT_UNKNOWN_SUBDOMAIN"):
            generate_bounded_context_map(
                "BCM-T-011", "x", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
                bounded_contexts=[{"id": "BC1", "label": "x", "subdomain_ids": ["SD1", "SD-GHOST"]}],
            )

    def test_context_map_with_invalid_pattern_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DDD_INVALID_CONTEXT_MAP_PATTERN"):
            generate_bounded_context_map(
                "BCM-T-012", "x", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
                bounded_contexts=_bounded_contexts(),
                context_map=[{"pattern": "friendship", "from_context_id": "BC1", "to_context_id": "BC2"}],
            )

    def test_context_map_referencing_unknown_from_context_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DDD_CONTEXT_MAP_UNKNOWN_BOUNDED_CONTEXT"):
            generate_bounded_context_map(
                "BCM-T-013", "x", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
                bounded_contexts=_bounded_contexts(),
                context_map=[{"pattern": "partnership", "from_context_id": "BC-GHOST", "to_context_id": "BC2"}],
            )

    def test_context_map_referencing_unknown_to_context_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DDD_CONTEXT_MAP_UNKNOWN_BOUNDED_CONTEXT"):
            generate_bounded_context_map(
                "BCM-T-014", "x", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
                bounded_contexts=_bounded_contexts(),
                context_map=[{"pattern": "partnership", "from_context_id": "BC1", "to_context_id": "BC-GHOST"}],
            )

    def test_context_map_referencing_two_unknown_contexts_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "DDD_CONTEXT_MAP_UNKNOWN_BOUNDED_CONTEXT"):
            generate_bounded_context_map(
                "BCM-T-015", "x", _subdomains(), make_provenance("AI_INFERENCE", "AI_GENERATED"),
                bounded_contexts=_bounded_contexts(),
                context_map=[{"pattern": "partnership", "from_context_id": "BC-GHOST-1", "to_context_id": "BC-GHOST-2"}],
            )

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_ddd_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_map_passes_all_three_gates(self):
        results = evaluate_ddd_gates(_valid_map(), "test", "2026-09-07T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "subdomain_lineage_integrity", "context_map_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_missing_provenance_fails_the_provenance_gate(self):
        model = _valid_map()
        model["provenance"] = None
        gate = evaluate_provenance_required_gate(model, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_emptied_subdomain_ids_fails_the_subdomain_lineage_gate(self):
        """Mutation-style: a record that bypassed the builder's own construction-time check (e.g. a caller emptying
        subdomain_ids after construction) must still be caught by the gate re-derivation."""
        model = _valid_map()
        model["bounded_contexts"][0]["subdomain_ids"] = []
        gate = evaluate_subdomain_lineage_gate(model, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BC1", gate["evidence"][0]["contexts_with_no_subdomain_lineage"])

    def test_hand_tampered_removed_subdomain_fails_the_subdomain_lineage_gate(self):
        """Mutation-style: the subdomain a bounded_context depends on is removed post-construction (not the
        subdomain_ids field itself) -- the gate must re-derive lineage from BOTH arrays, not trust either one in
        isolation."""
        model = _valid_map()
        model["subdomains"] = [s for s in model["subdomains"] if s["id"] != "SD2"]
        gate = evaluate_subdomain_lineage_gate(model, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("SD2", gate["evidence"][0]["contexts_referencing_unknown_subdomains"]["BC2"])

    def test_hand_tampered_dangling_context_map_from_fails_the_gate(self):
        model = _valid_map()
        model["bounded_contexts"] = [bc for bc in model["bounded_contexts"] if bc["id"] != "BC1"]
        gate = evaluate_context_map_integrity_gate(model, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BC1", gate["evidence"][0]["unknown_bounded_context_references"][0]["missing"])

    def test_hand_tampered_dangling_context_map_to_fails_the_gate(self):
        model = _valid_map()
        model["bounded_contexts"] = [bc for bc in model["bounded_contexts"] if bc["id"] != "BC2"]
        gate = evaluate_context_map_integrity_gate(model, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BC2", gate["evidence"][0]["unknown_bounded_context_references"][0]["missing"])

    def test_hand_tampered_both_context_map_endpoints_dangling_reports_both_missing(self):
        model = _valid_map()
        model["context_map"][0]["from_context_id"] = "BC-GHOST-1"
        model["context_map"][0]["to_context_id"] = "BC-GHOST-2"
        gate = evaluate_context_map_integrity_gate(model, "test", "2026-09-07T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(sorted(gate["evidence"][0]["unknown_bounded_context_references"][0]["missing"]), ["BC-GHOST-1", "BC-GHOST-2"])

    def test_gate_evidence_is_empty_on_a_passing_record(self):
        results = evaluate_ddd_gates(_valid_map(), "test", "2026-09-07T00:00:00Z")
        lineage = next(r for r in results if r["gate_id"] == "subdomain_lineage_integrity")
        context_map = next(r for r in results if r["gate_id"] == "context_map_integrity")
        self.assertEqual(lineage["evidence"][0]["contexts_with_no_subdomain_lineage"], [])
        self.assertEqual(lineage["evidence"][0]["contexts_referencing_unknown_subdomains"], {})
        self.assertEqual(context_map["evidence"][0]["unknown_bounded_context_references"], [])

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        """Critic finding (2026-09-07): all three gates must FAIL CLOSED on malformed input instead of
        raising -- a record missing exactly the field a gate exists to name (e.g. a bounded_context with no
        ``id``) is precisely the malformed case each gate must not crash on."""
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")
                self.assertEqual(evaluate_subdomain_lineage_gate(bad_record, "test", TS)["status"], "FAIL")
                self.assertEqual(evaluate_context_map_integrity_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_bounded_context_missing_id_fails_closed_not_a_crash(self):
        """The exact case the fail-closed fix targets: a lineage violation on a bounded_context that itself
        has no ``id`` used to KeyError inside the violation-reporting path instead of reporting FAIL."""
        model = _valid_map()
        del model["bounded_contexts"][0]["id"]
        model["bounded_contexts"][0]["subdomain_ids"] = []
        gate = evaluate_subdomain_lineage_gate(model, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("<missing id>", gate["evidence"][0]["contexts_with_no_subdomain_lineage"])

    def test_hand_tampered_empty_subdomains_fails_the_lineage_gate(self):
        """The gate now re-derives DDD_NO_SUBDOMAINS independently, not just at construction (critic
        finding: previously a hand-tampered record with subdomains=[] passed all three gates)."""
        model = _valid_map()
        model["subdomains"] = []
        gate = evaluate_subdomain_lineage_gate(model, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(gate["evidence"][0]["has_no_subdomains"])

    def test_hand_tampered_invalid_context_map_pattern_fails_the_context_map_gate(self):
        """The gate now re-derives DDD_INVALID_CONTEXT_MAP_PATTERN independently, not just at construction
        (critic finding: previously a hand-tampered record with pattern='friendship' passed all three gates)."""
        model = _valid_map()
        model["context_map"][0]["pattern"] = "friendship"
        gate = evaluate_context_map_integrity_gate(model, "test", TS)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("friendship", gate["evidence"][0]["invalid_context_map_patterns"])


if __name__ == "__main__":
    unittest.main()
