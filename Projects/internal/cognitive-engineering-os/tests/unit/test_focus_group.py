"""Mutation-style tests for ``insight.focus_group`` (F06 human/customer-insight family, one of 9 members
opened in this same batch).

Two real invariants beyond per-field shape (``participant_count`` a bool-excluded integer in the closed
range [6,10]; ``generalizability_scope`` structurally locked to
``QUALITATIVE_EXPLORATION_NOT_POPULATION_ESTIMATE``), exercised at BOTH layers where the builder accepts the
field at all: construction-time refusal (``generate_focus_group_session`` raising a specific
``InvariantViolation`` code for invariant 1) and independent gate re-derivation
(``evaluate_focus_group_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself, for both invariants including ``generalizability_scope`` which
the builder never accepts as a parameter). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/focus-group-session.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.insight.focus_group import (
    GENERALIZABILITY_SCOPE,
    MAX_PARTICIPANTS,
    METHOD_ID,
    MIN_PARTICIPANTS,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_focus_group_gates,
    evaluate_focus_group_integrity_gate,
    evaluate_provenance_required_gate,
    generate_focus_group_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

FOCUS_GROUP_SCHEMA = "ai-lego://specs/cognitive/typed-objects/focus-group-session.schema.yaml"


def _kwargs(**overrides: object) -> dict:
    base = dict(
        topic="新版 onboarding 流程的第一印象與情緒反應",
        participant_count=8,
        moderation_approach="半結構式引導，主持人準備 6 道開放式問題",
        discussion_summary="多數參與者認為步驟數變少是正面改變，但有人提到找不到回頭重看的入口",
        analysis="步驟精簡本身被普遍接受，但『教學可回頭查看』是目前設計缺口",
    )
    base.update(overrides)
    return base


def _valid_session(
    *,
    session_id: str = "FOCUSGROUP-T-001",
    provenance: dict | None = None,
    **kwarg_overrides: object,
):
    return generate_focus_group_session(
        session_id,
        provenance=provenance if provenance is not None else make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
        **_kwargs(**kwarg_overrides),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_session_validates_against_the_real_schema(self):
        self.contracts.validate(FOCUS_GROUP_SCHEMA, _valid_session(), "focus group session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, session = live.invoke(
            METHOD_ID,
            generate_focus_group_session,
            "FOCUSGROUP-T-INVOKE",
            provenance=make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            **_kwargs(),
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/insight.focus_group.contract.yaml")
        self.assertEqual(session["id"], "FOCUSGROUP-T-INVOKE")

    def test_empty_catalog_blocks_focus_group_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_session())
        tampered["generalizability_scope"] = "POPULATION_REPRESENTATIVE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FOCUS_GROUP_SCHEMA, tampered, "tampered session")
        gate = evaluate_focus_group_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        bcg-matrix-analysis.schema.yaml's own equivalent test)."""
        session = _valid_session()
        session["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FOCUS_GROUP_SCHEMA, session, "session with a smuggled top-level key")

    def test_schema_rejects_participant_count_below_range(self):
        session = _valid_session()
        session["participant_count"] = 5
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FOCUS_GROUP_SCHEMA, session, "session with participant_count=5")

    def test_schema_rejects_participant_count_above_range(self):
        session = _valid_session()
        session["participant_count"] = 11
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FOCUS_GROUP_SCHEMA, session, "session with participant_count=11")

    def test_schema_rejects_a_different_generalizability_scope_value(self):
        session = _valid_session()
        session["generalizability_scope"] = "POPULATION_REPRESENTATIVE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FOCUS_GROUP_SCHEMA, session, "session claiming a population-representative scope")

    def test_id_is_distinct_from_strategy_bcg_matrix_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.bcg_matrix")
        self.assertEqual(METHOD_ID, "insight.focus_group")

    def test_focus_group_and_bcg_matrix_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.bcg_matrix"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "insight.focus_group.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "insight.focus_group contract")


class ParticipantCountTests(unittest.TestCase):
    """Invariant 1 (module docstring): participant_count must be an int (bool excluded) in the closed
    range [MIN_PARTICIPANTS, MAX_PARTICIPANTS]."""

    def test_min_max_constants(self):
        self.assertEqual(MIN_PARTICIPANTS, 6)
        self.assertEqual(MAX_PARTICIPANTS, 10)

    def test_every_value_in_the_closed_range_is_accepted(self):
        for count in range(MIN_PARTICIPANTS, MAX_PARTICIPANTS + 1):
            with self.subTest(count=count):
                session = _valid_session(session_id=f"FOCUSGROUP-T-{count}", participant_count=count)
                self.assertEqual(session["participant_count"], count)

    def test_participant_count_of_5_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"):
            _valid_session(participant_count=5)

    def test_participant_count_of_11_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"):
            _valid_session(participant_count=11)

    def test_participant_count_of_zero_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"):
            _valid_session(participant_count=0)

    def test_participant_count_of_negative_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"):
            _valid_session(participant_count=-3)

    def test_participant_count_non_int_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"):
            _valid_session(participant_count="8")

    def test_participant_count_float_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"):
            _valid_session(participant_count=8.0)

    def test_participant_count_true_is_refused_despite_bool_being_an_int_subclass(self):
        """bool is a subclass of int in Python (True == 1) -- True/False must never masquerade as a real
        participant_count, even though both already fall outside [6,10] by construction here. This is the
        real refusal proof CLI step 4 also demonstrates."""
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"):
            _valid_session(participant_count=True)

    def test_participant_count_false_is_refused_despite_bool_being_an_int_subclass(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_PARTICIPANT_COUNT"):
            _valid_session(participant_count=False)


class ContentFieldTests(unittest.TestCase):
    """Every content field must be a non-empty string -- exercised via the builder's own parameters."""

    def test_empty_topic_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_EMPTY_TOPIC"):
            _valid_session(topic="   ")

    def test_empty_moderation_approach_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_EMPTY_MODERATION_APPROACH"):
            _valid_session(moderation_approach="")

    def test_empty_discussion_summary_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_EMPTY_DISCUSSION_SUMMARY"):
            _valid_session(discussion_summary="   ")

    def test_empty_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_EMPTY_ANALYSIS"):
            _valid_session(analysis="")

    def test_well_formed_content_round_trips(self):
        session = _valid_session()
        self.assertEqual(session["topic"], _kwargs()["topic"])
        self.assertEqual(session["moderation_approach"], _kwargs()["moderation_approach"])
        self.assertEqual(session["discussion_summary"], _kwargs()["discussion_summary"])
        self.assertEqual(session["analysis"], _kwargs()["analysis"])


class GeneralizabilityScopeTests(unittest.TestCase):
    """Invariant 2 (module docstring): generalizability_scope is ALWAYS exactly GENERALIZABILITY_SCOPE,
    guaranteed by the builder NOT accepting it as a parameter at all (structural elimination) -- unlike
    invariant 1, there is no builder call to refuse with an InvariantViolation, so these tests prove the
    elimination itself (a TypeError, since it is not a keyword the function signature has at all) plus the
    independent gate re-derivation."""

    def test_generalizability_scope_constant(self):
        self.assertEqual(GENERALIZABILITY_SCOPE, "QUALITATIVE_EXPLORATION_NOT_POPULATION_ESTIMATE")

    def test_builder_does_not_accept_generalizability_scope_as_a_keyword_argument(self):
        with self.assertRaises(TypeError):
            generate_focus_group_session(
                "FOCUSGROUP-T-BADKWARG",
                provenance=make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
                generalizability_scope="POPULATION_REPRESENTATIVE",  # type: ignore[call-arg]
                **_kwargs(),
            )

    def test_builder_always_stamps_the_one_legal_generalizability_scope(self):
        session = _valid_session()
        self.assertEqual(session["generalizability_scope"], "QUALITATIVE_EXPLORATION_NOT_POPULATION_ESTIMATE")
        self.assertEqual(session["generalizability_scope"], GENERALIZABILITY_SCOPE)

    def test_gate_catches_hand_tampered_generalizability_scope_claiming_population_representative(self):
        """The builder can never be made to emit a wrong generalizability_scope, so this hand-tampers a raw
        dict directly (bypassing the builder entirely) to prove the gate re-derives invariant 2 rather than
        merely trusting that the builder always got it right."""
        session = copy.deepcopy(_valid_session())
        session["generalizability_scope"] = "POPULATION_REPRESENTATIVE"
        gate = evaluate_focus_group_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_generalizability_scope(self):
        session = copy.deepcopy(_valid_session())
        del session["generalizability_scope"]
        gate = evaluate_focus_group_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "FOCUSGROUP-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "insight.focus_group")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_ID"):
            _valid_session(session_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_ID"):
            _valid_session(session_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_VERSION"):
            generate_focus_group_session(
                "FOCUSGROUP-T-002", provenance=make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1, **_kwargs()
            )

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FOCUSGROUP_INVALID_PROVENANCE"):
            generate_focus_group_session("FOCUSGROUP-T-003", provenance={"epistemic_type": "NOT_REAL", "authorship_state": "AI_SUGGESTED"}, **_kwargs())


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID session's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_session(self):
        gate = evaluate_focus_group_integrity_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_participant_count_too_low(self):
        session = copy.deepcopy(_valid_session())
        session["participant_count"] = 5
        gate = evaluate_focus_group_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_participant_count_too_high(self):
        session = copy.deepcopy(_valid_session())
        session["participant_count"] = 11
        gate = evaluate_focus_group_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_participant_count_as_bool(self):
        session = copy.deepcopy(_valid_session())
        session["participant_count"] = True
        gate = evaluate_focus_group_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_topic(self):
        session = copy.deepcopy(_valid_session())
        session["topic"] = ""
        gate = evaluate_focus_group_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_session(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_focus_group_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        session = copy.deepcopy(_valid_session())
        session["id"] = "WRONG-001"
        gate = evaluate_focus_group_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        session = copy.deepcopy(_valid_session())
        session["version"] = 1
        gate = evaluate_focus_group_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        session = copy.deepcopy(_valid_session())
        session["provenance"] = None
        gate = evaluate_provenance_required_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_focus_group_gates_returns_two_gates_in_order(self):
        results = evaluate_focus_group_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "focus_group_integrity"])

    def test_evaluate_focus_group_gates_all_pass_on_a_valid_session(self):
        results = evaluate_focus_group_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_builder_does_not_leak_extra_top_level_keys(self):
        session = _valid_session()
        self.assertEqual(
            set(session.keys()),
            {"id", "version", "generated_by_method", "topic", "participant_count", "moderation_approach", "discussion_summary", "analysis", "generalizability_scope", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
