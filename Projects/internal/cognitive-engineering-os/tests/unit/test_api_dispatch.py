"""Tests for ``ai_lego.apps.api.dispatch`` -- the generic method-dispatch introspection layer.

Exercised against real, already-shipped Method Atlas methods (not mocks) to prove the
introspection actually finds the right function for methods whose builder name does NOT match a
naive ``generate_<method_name>`` guess (this is exactly why introspection was chosen over a
naming convention -- see the module's own docstring).
"""

from __future__ import annotations

import unittest

from ai_lego.apps.api.dispatch import MethodDispatchError, invoke_builder, invoke_gate_runner, record_id_prefix, resolve_builder, resolve_gate_runner
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation


class ResolveBuilderTests(unittest.TestCase):
    def test_uniform_naming_case(self):
        builder = resolve_builder("foresight.cross_impact_analysis")
        self.assertEqual(builder.__name__, "generate_cross_impact_analysis")

    def test_non_uniform_naming_case_market_admission_control(self):
        """The real reason this module exists: the builder is generate_market_admission, not
        generate_market_admission_control -- a naive string-convention dispatcher would 404 here."""
        builder = resolve_builder("jurisdiction.market_admission_control")
        self.assertEqual(builder.__name__, "generate_market_admission")

    def test_non_uniform_naming_case_expert_lego_mode(self):
        builder = resolve_builder("representation.expert_lego_mode")
        self.assertEqual(builder.__name__, "generate_expert_lego_chain")

    def test_contract_only_reuse_has_a_thin_dispatch_adapter(self):
        builder = resolve_builder("architecture.trade_off_matrix")
        gate_runner = resolve_gate_runner("architecture.trade_off_matrix")
        self.assertEqual(builder.__name__, "generate_trade_off_matrix")
        self.assertEqual(gate_runner.__name__, "evaluate_trade_off_matrix_gates")

    def test_unknown_method_id_raises_dispatch_error(self):
        with self.assertRaises(MethodDispatchError):
            resolve_builder("nonexistent_family.nonexistent_method")

    def test_malformed_method_id_raises_dispatch_error(self):
        with self.assertRaises(MethodDispatchError):
            resolve_builder("no-dot-here")


class ResolveGateRunnerTests(unittest.TestCase):
    def test_finds_the_gate_runner_for_a_non_uniform_builder_name_method(self):
        gate_runner = resolve_gate_runner("jurisdiction.market_admission_control")
        self.assertTrue(gate_runner.__name__.startswith("evaluate_"))
        self.assertTrue(gate_runner.__name__.endswith("_gates"))

    def test_gate_runner_receives_only_declared_arguments_and_context_dependency(self):
        seen = []

        def gate(analysis, upstream, validator, timestamp):
            seen.append((analysis, upstream, validator, timestamp))
            return [{"status": "PASS"}]

        result = invoke_gate_runner(
            gate,
            {"id": "current"},
            {"outputs": {"Upstream": {"id": "prior"}}},
            "test",
            "2026-09-14T00:00:00Z",
        )
        self.assertEqual(result, [{"status": "PASS"}])
        self.assertEqual(seen, [({"id": "current"}, {"id": "prior"}, "test", "2026-09-14T00:00:00Z")])


class RecordIdPrefixTests(unittest.TestCase):
    def test_known_method_has_a_prefix(self):
        self.assertEqual(record_id_prefix("foresight.cross_impact_analysis"), "XIMPACT-")


class InvokeBuilderTests(unittest.TestCase):
    def test_invoke_a_real_method_end_to_end(self):
        builder = resolve_builder("foresight.cross_impact_analysis")
        gate_runner = resolve_gate_runner("foresight.cross_impact_analysis")
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        body = {
            "events": [{"event_id": "E1", "description": "d1"}, {"event_id": "E2", "description": "d2"}],
            "impact_pairs": [{"event_a_id": "E1", "event_b_id": "E2", "conditional_probability_shift": 0.1}],
        }
        record = invoke_builder(builder, "XIMPACT-TEST-001", provenance, dict(body))
        self.assertEqual(record["id"], "XIMPACT-TEST-001")
        results = gate_runner(record, "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all(r["status"] in {"PASS", "NOT_APPLICABLE"} for r in results))

    def test_invoke_raises_invariant_violation_on_real_refusal(self):
        """Confirms InvariantViolation propagates un-wrapped -- the API layer is responsible for
        turning it into an HTTP 400, not this module."""
        builder = resolve_builder("foresight.cross_impact_analysis")
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        body = {"events": [{"event_id": "E1", "description": "only one event"}], "impact_pairs": []}
        with self.assertRaises(InvariantViolation):
            invoke_builder(builder, "XIMPACT-TEST-002", provenance, dict(body))

    def test_invoke_raises_invariant_violation_on_unexpected_kwarg(self):
        """A bad-argument-shape TypeError from inspect.signature.bind() is deliberately
        normalized to InvariantViolation (see invoke_builder's own docstring) -- the API layer
        (ai_lego/apps/api/main.py) only needs to catch one exception type for both "the record
        would be structurally invalid" and "the caller sent arguments this builder doesn't
        accept", both surfaced as HTTP 400."""
        builder = resolve_builder("foresight.cross_impact_analysis")
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        body = {"events": [], "impact_pairs": [], "this_kwarg_does_not_exist": True}
        with self.assertRaisesRegex(InvariantViolation, "DISPATCH_BAD_ARGUMENTS"):
            invoke_builder(builder, "XIMPACT-TEST-003", provenance, dict(body))

    def test_caller_supplied_record_id_and_provenance_are_not_overridden(self):
        builder = resolve_builder("foresight.cross_impact_analysis")
        custom_provenance = make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")
        body = {
            "record_id": "XIMPACT-CUSTOM-001",
            "provenance": custom_provenance,
            "events": [{"event_id": "E1", "description": "d1"}, {"event_id": "E2", "description": "d2"}],
            "impact_pairs": [{"event_a_id": "E1", "event_b_id": "E2", "conditional_probability_shift": 0.1}],
        }
        record = invoke_builder(builder, "XIMPACT-SHOULD-NOT-BE-USED", make_provenance("AI_INFERENCE", "AI_GENERATED"), dict(body))
        self.assertEqual(record["id"], "XIMPACT-CUSTOM-001")
        self.assertEqual(record["provenance"]["epistemic_type"], "HUMAN_OPINION")


if __name__ == "__main__":
    unittest.main()
