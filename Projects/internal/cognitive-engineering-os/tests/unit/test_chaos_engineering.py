"""Mutation-style tests for ``devops_sre.chaos_engineering`` (twenty-second Method Atlas slice, third from the
`devops_sre` family). Atlas's own explicit rule (step 5: stop immediately if not as expected) is proven at BOTH
independent layers -- construction-time and gate re-derivation -- same discipline every prior forbidden-state
guard this session built already established."""

from __future__ import annotations

import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.chaos_engineering import (
    METHOD_ID,
    all_gates_pass,
    evaluate_chaos_experiment_gates,
    evaluate_unrecovered_forbids_completed_gate,
    generate_chaos_experiment,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

CHAOS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/chaos-experiment.schema.yaml"


def _valid_experiment():
    return generate_chaos_experiment(
        "CHAOS-T-001", "killing one replica keeps latency under 500ms", "staging only, one replica",
        "force-kill one pod", True, "completed", make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_experiment_validates_against_the_real_schema(self):
        self.contracts.validate(CHAOS_SCHEMA, _valid_experiment(), "chaos experiment")

    def test_stopped_after_unrecovered_is_legal(self):
        experiment = generate_chaos_experiment("CHAOS-T-002", "x", "x", "x", False, "stopped", make_provenance("AI_INFERENCE", "AI_GENERATED"))
        self.contracts.validate(CHAOS_SCHEMA, experiment, "stopped experiment")

    def test_empty_steady_state_hypothesis_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CHAOS_EMPTY_REQUIRED_FIELD"):
            generate_chaos_experiment("CHAOS-T-003", "", "x", "x", True, "completed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_invalid_status_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CHAOS_INVALID_STATUS"):
            generate_chaos_experiment("CHAOS-T-004", "x", "x", "x", True, "in_progress", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_unrecovered_with_completed_status_is_refused_at_construction(self):
        """Atlas's own rule (§11.43 step 5): stop immediately if not as expected."""
        with self.assertRaisesRegex(InvariantViolation, "CHAOS_UNRECOVERED_CANNOT_COMPLETE"):
            generate_chaos_experiment("CHAOS-T-005", "x", "x", "x", False, "completed", make_provenance("AI_INFERENCE", "AI_GENERATED"))

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_chaos_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def test_valid_experiment_passes_both_gates(self):
        results = evaluate_chaos_experiment_gates(_valid_experiment(), "test", "2026-09-04T00:00:00Z")
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "unrecovered_forbids_completed"})
        self.assertTrue(all_gates_pass(results))

    def test_hand_tampered_unrecovered_experiment_fails_the_gate(self):
        """Mutation-style: a record that bypassed the builder's own construction-time check (e.g.
        recovered_as_hypothesized flipped after construction) must still be caught by the gate re-derivation."""
        experiment = _valid_experiment()
        experiment["recovered_as_hypothesized"] = False
        gate = evaluate_unrecovered_forbids_completed_gate(experiment, "test", "2026-09-04T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
