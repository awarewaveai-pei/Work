"""Mutation-style tests for ``architecture.quality_attribute_scenario`` (fifteenth Method Atlas slice, fourth from
the `architecture` family). Simplest builder this session has written -- 6 required free-text fields, no compute
layer, no closed enum."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.architecture.quality_attribute_scenario import (
    METHOD_ID,
    all_gates_pass,
    evaluate_all_fields_present_gate,
    evaluate_quality_attribute_scenario_gates,
    generate_quality_attribute_scenario,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

QAS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/quality-attribute-scenario.schema.yaml"


def _valid_scenario(**overrides):
    kwargs = dict(
        scenario_id="QAS-T-001",
        quality_goal="fast",
        source="logged-in user",
        stimulus="issues an order-query request",
        artifact="order query API",
        environment="peak hours, 500 QPS",
        response="returns query result",
        measure="p99 latency < 300ms",
        provenance=make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    kwargs.update(overrides)
    return generate_quality_attribute_scenario(**kwargs)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_scenario_validates_against_the_real_schema(self):
        self.contracts.validate(QAS_SCHEMA, _valid_scenario(), "quality attribute scenario")

    def test_empty_measure_field_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "QAS_EMPTY_REQUIRED_FIELD"):
            _valid_scenario(measure="")

    def test_whitespace_only_field_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "QAS_EMPTY_REQUIRED_FIELD"):
            _valid_scenario(stimulus="   ")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_qas_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_scenario_passes_both_gates(self):
        results = evaluate_quality_attribute_scenario_gates(_valid_scenario(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "all_fields_present"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_empty_field_fails_the_gate(self):
        scenario = _valid_scenario()
        scenario["response"] = ""
        gate = evaluate_all_fields_present_gate(scenario, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("response", gate["evidence"][0]["empty_fields"])


if __name__ == "__main__":
    unittest.main()
