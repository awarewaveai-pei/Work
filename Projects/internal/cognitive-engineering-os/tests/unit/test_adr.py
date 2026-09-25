"""Mutation-style tests for ``architecture.adr`` (twelfth Method Atlas slice, first from the `architecture` family
-- one member of F18's own 10-tool Software Architecture Pack).

The first typed object this session builds with no genuine-compute layer
and no forbidden-authority guard -- Atlas's own §22.3 table has no ADR
row. Tests focus on the schema conformance of all 11 Atlas-cited template
sections plus the non-Atlas `status` field, and the
`alternatives_considered` precondition re-derived at the gate layer.
"""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.adr import (
    METHOD_ID,
    all_gates_pass,
    evaluate_adr_gates,
    evaluate_alternatives_considered_gate,
    generate_architecture_decision_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

ADR_SCHEMA = "ai-lego://specs/cognitive/typed-objects/architecture-decision-record.schema.yaml"


def _valid_record(**overrides):
    kwargs = dict(
        record_id="ADR-T-001",
        title="switch primary datastore",
        status="accepted",
        context="latency ceiling reached",
        decision="migrate to the new store",
        alternatives_considered=["stay on the current store", "shard the current store instead"],
        security_privacy_impact="no change expected",
        data_impact="full migration required",
        operational_impact="new on-call runbook needed",
        compatibility="breaking change for one downstream consumer",
        migration="phased, service by service",
        rollback="keep the old store running in parallel for one release cycle",
        validation="p99 latency under target for 7 consecutive days",
        revisit_reversal_conditions="revisit if migration cost exceeds estimate by 50%",
        provenance=make_provenance("DECISION", "HUMAN_APPROVED"),
    )
    kwargs.update(overrides)
    return generate_architecture_decision_record(**kwargs)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_adr_validates_against_the_real_schema(self):
        self.contracts.validate(ADR_SCHEMA, _valid_record(), "architecture decision record")

    def test_all_four_status_values_are_accepted(self):
        for status in ("proposed", "accepted", "superseded", "deprecated"):
            with self.subTest(status=status):
                record = _valid_record(status=status)
                self.contracts.validate(ADR_SCHEMA, record, f"adr status={status}")

    def test_invalid_status_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ADR_INVALID_STATUS"):
            _valid_record(status="draft")

    def test_zero_alternatives_considered_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ADR_NO_ALTERNATIVES_CONSIDERED"):
            _valid_record(alternatives_considered=[])

    def test_single_alternative_considered_is_the_legal_minimum(self):
        record = _valid_record(alternatives_considered=["the only alternative considered"])
        self.contracts.validate(ADR_SCHEMA, record, "adr with exactly 1 alternative")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_adr_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_record_passes_both_gates(self):
        results = evaluate_adr_gates(_valid_record(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "alternatives_considered_required"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_empty_alternatives_fails_the_gate(self):
        """Mutation-style: a record that bypassed the builder's own construction-time check must still be caught
        by the gate re-derivation, same discipline every prior slice's own gate-mutation test already established."""
        record = _valid_record()
        record["alternatives_considered"] = []
        gate = evaluate_alternatives_considered_gate(record, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_missing_provenance_fails_the_provenance_gate(self):
        record = _valid_record()
        record["provenance"] = None
        results = evaluate_adr_gates(record, "test", "2026-09-04T00:00:00Z")
        provenance_gate = next(r for r in results if r["gate_id"] == "provenance_required")
        self.assertEqual(provenance_gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
