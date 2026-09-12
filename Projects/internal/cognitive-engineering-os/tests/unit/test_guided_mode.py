"""Mutation-style tests for ``representation.guided_mode`` (F24 representation family, Atlas L971, §11.56).

Atlas §11.56's own "Method complexity 留在 engine，不丟給使用者" benefit is
proven at BOTH independent layers: the construction-time builder refuses an
empty answer trail, a malformed qa_trail entry, and a selected_method_id
with no ACTIVE contract in the corpus, and the independent gates re-derive
the same rules directly from a raw (possibly hand-tampered) dict -- the
method_registered gate against a LIVE MethodCatalog, never trusting that the
builder's own resolution already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.representation.guided_mode import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_guided_mode_gates,
    evaluate_method_registered_gate,
    evaluate_provenance_required_gate,
    evaluate_qa_trail_traceability_gate,
    generate_guided_mode_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

GUIDED_MODE_SESSION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/guided-mode-session.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")
REAL_SELECTED_METHOD_ID = "root_cause.fishbone"  # Atlas §11.56's own worked example


def _kwargs(**overrides: object) -> dict:
    base = dict(
        qa_trail=[
            {"question": "你目前是在找「可能原因」，還是已經有數據想驗證原因？", "answer": "在找可能原因"},
        ],
        selected_method_id=REAL_SELECTED_METHOD_ID,
        # A FRESH dict per call, not the module-level PROVENANCE constant -- some tests mutate
        # kwargs["provenance"] in place after construction to prove non-aliasing, which would otherwise
        # corrupt the shared PROVENANCE singleton for every other test in this module.
        provenance=make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    base.update(overrides)
    return base


class GuidedModeTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)
        cls.catalog = MethodCatalog.from_spec_root(cls.spec_root)

    def _valid_session(self, *, record_id: str = "GUIDED-T-001", **overrides: object):
        return generate_guided_mode_session(record_id, method_catalog=self.catalog, **_kwargs(**overrides))


class SpecConformanceTests(GuidedModeTestCase):
    def test_real_selected_method_id_actually_resolves_in_the_live_catalog(self):
        """Sanity check that Atlas §11.56's own Fishbone example is a genuinely registered method in this
        corpus -- if this ever fails, every other test in this file is exercising a fictional id."""
        resolution = self.catalog.resolve([REAL_SELECTED_METHOD_ID])
        self.assertIsNone(resolution["blocked"])

    def test_valid_session_validates_against_the_real_schema(self):
        self.contracts.validate(GUIDED_MODE_SESSION_SCHEMA, self._valid_session(), "guided mode session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        resolved = self.catalog.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        descriptor, session = self.catalog.invoke(METHOD_ID, generate_guided_mode_session, "GUIDED-T-INVOKE", method_catalog=self.catalog, **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/representation.guided_mode.contract.yaml")
        self.assertEqual(session["id"], "GUIDED-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        session = self._valid_session()
        session["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(GUIDED_MODE_SESSION_SCHEMA, session, "session with a smuggled top-level key")

    def test_schema_rejects_a_malformed_selected_method_id(self):
        session = self._valid_session()
        session["selected_method_id"] = "NotDottedForm"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(GUIDED_MODE_SESSION_SCHEMA, session, "session with a malformed selected_method_id")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "representation.guided_mode.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "representation.guided_mode contract")


class QaTrailTraceabilityTests(GuidedModeTestCase):
    """THE first half of the real invariant -- a real, non-empty question->answer trail."""

    def test_empty_qa_trail_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GUIDED_EMPTY_QA_TRAIL"):
            self._valid_session(qa_trail=[])

    def test_multi_question_trail_is_accepted(self):
        session = self._valid_session(qa_trail=[
            {"question": "你目前是在找「可能原因」，還是已經有數據想驗證原因？", "answer": "在找可能原因"},
            {"question": "問題是否已知重複發生？", "answer": "是"},
        ])
        self.assertEqual(len(session["qa_trail"]), 2)

    def test_empty_question_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GUIDED_INVALID_QA_TRAIL"):
            self._valid_session(qa_trail=[{"question": "", "answer": "在找可能原因"}])

    def test_empty_answer_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GUIDED_INVALID_QA_TRAIL"):
            self._valid_session(qa_trail=[{"question": "問題？", "answer": "   "}])

    def test_malformed_qa_pair_missing_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GUIDED_INVALID_QA_TRAIL"):
            self._valid_session(qa_trail=[{"question": "問題？"}])


class MethodRegisteredTests(GuidedModeTestCase):
    """THE real invariant this method exists to enforce -- live MethodCatalog resolution."""

    def test_well_shaped_but_unregistered_method_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GUIDED_METHOD_NOT_REGISTERED"):
            self._valid_session(selected_method_id="representation.does_not_exist")

    def test_malformed_method_id_grammar_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GUIDED_INVALID_METHOD_ID"):
            self._valid_session(selected_method_id="NotDottedForm")

    def test_a_second_real_registered_method_id_is_accepted(self):
        """Confirms the invariant checks REGISTRATION, not a hardcoded allowlist of one id."""
        session = self._valid_session(selected_method_id="strategy.swot")
        self.assertEqual(session["selected_method_id"], "strategy.swot")


class NestedContainerAliasingTests(GuidedModeTestCase):
    def test_mutating_caller_provenance_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        session = generate_guided_mode_session("GUIDED-T-002", method_catalog=self.catalog, **kwargs)
        kwargs["provenance"]["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(session["provenance"]["epistemic_type"], "AI_INFERENCE")
        self.assertIsNot(session["provenance"], kwargs["provenance"])

    def test_mutating_caller_qa_trail_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        session = generate_guided_mode_session("GUIDED-T-003", method_catalog=self.catalog, **kwargs)
        kwargs["qa_trail"][0]["answer"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(session["qa_trail"][0]["answer"], "在找可能原因")


class GateIndependenceTests(GuidedModeTestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_session(self):
        results = evaluate_guided_mode_gates(self._valid_session(), self.catalog, "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_qa_trail_traceability_gate_catches_hand_tampered_empty_trail(self):
        record = copy.deepcopy(self._valid_session())
        record["qa_trail"] = []
        gate = evaluate_qa_trail_traceability_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_qa_trail_traceability_gate_catches_hand_tampered_malformed_pair(self):
        record = copy.deepcopy(self._valid_session())
        del record["qa_trail"][0]["answer"]
        gate = evaluate_qa_trail_traceability_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_method_registered_gate_catches_hand_tampered_unregistered_id(self):
        """The central proof: a session's builder-time resolution CANNOT be trusted once the record is
        hand-tampered -- the gate independently re-resolves against the live catalog."""
        record = copy.deepcopy(self._valid_session())
        record["selected_method_id"] = "representation.does_not_exist"
        gate = evaluate_method_registered_gate(record, self.catalog, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_method_registered_gate_passes_a_genuinely_registered_id(self):
        gate = evaluate_method_registered_gate(self._valid_session(), self.catalog, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_method_registered_gate_fails_closed_against_an_empty_catalog(self):
        """Even a genuinely-once-valid session fails the gate if the live catalog no longer carries the
        contract -- proves the gate is a LIVE re-check, not a cached verdict."""
        empty_catalog = MethodCatalog.empty("snapshot:no-method-contracts")
        gate = evaluate_method_registered_gate(self._valid_session(), empty_catalog, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_guided_mode_gates(bad, self.catalog, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(GuidedModeTestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(self._valid_session(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(self._valid_session())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(GuidedModeTestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "GUIDED-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GUIDED_INVALID_ID"):
            self._valid_session(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GUIDED_INVALID_VERSION"):
            generate_guided_mode_session("GUIDED-T-004", method_catalog=self.catalog, **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GUIDED_INVALID_PROVENANCE"):
            self._valid_session(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "representation.guided_mode")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_guided_mode_gates(self._valid_session(), self.catalog, "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "qa_trail_traceability", "method_registered"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        session = self._valid_session()
        self.assertEqual(set(session.keys()), {"id", "version", "generated_by_method", "qa_trail", "selected_method_id", "provenance"})


class ProvenanceAliasingRegressionTests(GuidedModeTestCase):
    """This session's own standing instruction after the recurring F10/F13/F15/F22 aliasing bug (a builder
    returning `provenance` BY REFERENCE instead of via `copy.deepcopy`): proves the fix and guards against a
    future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = self._valid_session()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_guided_mode_session(base["id"], base["qa_trail"], base["selected_method_id"], provenance, self.catalog)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
