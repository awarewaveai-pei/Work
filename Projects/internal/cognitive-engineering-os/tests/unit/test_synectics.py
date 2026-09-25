"""Mutation-style tests for ``divergent.synectics`` (F03 divergent-ideation family, 1 of 10 agents opening
independent F03 members in this same parallel batch).

Four real invariants beyond bare field presence (original_problem non-empty, analogies non-empty and
open-ended, per-entry analogy_type closed to the 3 Atlas-cited values, per-entry analogy_content/
reframed_insight non-empty), exercised at BOTH layers: construction-time refusal
(``generate_synectics_session``/``analogy_entry`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_synectics_integrity_gate`` catching a hand-tampered raw dict
that bypassed the builder entirely, never calling the builder itself). Schema conformance is checked
against the real spec-root schema this same slice added
(``typed-objects/synectics-session.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.divergent.synectics import (
    ANALOGY_TYPES,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    analogy_entry,
    evaluate_provenance_required_gate,
    evaluate_synectics_gates,
    evaluate_synectics_integrity_gate,
    generate_synectics_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

SYNECTICS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/synectics-session.schema.yaml"
ORIGINAL_PROBLEM = "customer support inbox average response time has grown to 48 hours, satisfaction is dropping"


def _analogies(**overrides: dict) -> list[dict]:
    base = {
        "DIRECT": dict(
            analogy_type="DIRECT",
            analogy_content="like a hospital ER triage system, patients are queued by urgency, not by arrival order",
            reframed_insight="the inbox should be triaged by urgency, not processed in received-time order",
        ),
        "PERSONAL": dict(
            analogy_type="PERSONAL",
            analogy_content="if I were the email left unread for 48 hours, I'd feel forgotten and unimportant",
            reframed_insight="the real problem is not raw speed, it's that customers get zero 'you are seen' signal while waiting",
        ),
        "SYMBOLIC": dict(
            analogy_type="SYMBOLIC",
            analogy_content="response time is like a dam's spillway gate -- opening it all at once floods what's downstream",
            reframed_insight="the fix is a steady, predictable clearing cadence, not periodic all-at-once inbox sprints",
        ),
    }
    base.update(overrides)
    return [analogy_entry(v["analogy_type"], v["analogy_content"], v["reframed_insight"]) for v in base.values()]


def _valid_session(
    *,
    session_id: str = "SYNECTICS-T-001",
    original_problem: str = ORIGINAL_PROBLEM,
    analogies: list[dict] | None = None,
):
    return generate_synectics_session(
        session_id,
        original_problem,
        analogies if analogies is not None else _analogies(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_session_validates_against_the_real_schema(self):
        self.contracts.validate(SYNECTICS_SCHEMA, _valid_session(), "synectics session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, session = live.invoke(
            METHOD_ID, generate_synectics_session, "SYNECTICS-T-INVOKE", ORIGINAL_PROBLEM, _analogies(), make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/divergent.synectics.contract.yaml")
        self.assertEqual(session["id"], "SYNECTICS-T-INVOKE")

    def test_empty_catalog_blocks_synectics_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_session())
        tampered["original_problem"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYNECTICS_SCHEMA, tampered, "tampered session")
        gate = evaluate_synectics_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        vrio-analysis.schema.yaml's own equivalent test)."""
        session = _valid_session()
        session["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYNECTICS_SCHEMA, session, "session with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_an_analogy_entry(self):
        session = _valid_session()
        session["analogies"][0] = {**session["analogies"][0], "confidence_score": 0.9}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYNECTICS_SCHEMA, session, "session with a smuggled analogies[] key")

    def test_schema_rejects_a_fourth_analogy_type_value(self):
        """The real, disclosed boundary: Atlas L388 names only 3 analogy types -- a 4th ('FANTASY', common
        in external Synectics literature) is refused by the schema enum itself, not just the runtime gate."""
        session = _valid_session()
        session["analogies"][0] = {**session["analogies"][0], "analogy_type": "FANTASY"}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYNECTICS_SCHEMA, session, "session with a 4th analogy_type value")

    def test_schema_rejects_an_empty_analogies_array(self):
        session = _valid_session()
        session["analogies"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SYNECTICS_SCHEMA, session, "session with an empty analogies array")

    def test_id_is_distinct_from_strategy_vrio_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.vrio")
        self.assertEqual(METHOD_ID, "divergent.synectics")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "divergent.synectics.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "divergent.synectics contract")


class AnalogyTypeVocabularyTests(unittest.TestCase):
    def test_analogy_types_is_exactly_the_atlas_l388_three(self):
        self.assertEqual(ANALOGY_TYPES, frozenset({"DIRECT", "PERSONAL", "SYMBOLIC"}))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SYNECTICS-")

    def test_analogy_entry_rejects_an_unknown_analogy_type(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_INVALID_ANALOGY_TYPE"):
            analogy_entry("FANTASY", "some content", "some insight")

    def test_analogy_entry_accepts_all_3_analogy_types(self):
        for analogy_type in sorted(ANALOGY_TYPES):
            entry = analogy_entry(analogy_type, "some analogy content", "some reframed insight")
            self.assertEqual(entry["analogy_type"], analogy_type)

    def test_analogy_entry_does_not_leak_extra_keys(self):
        entry = analogy_entry("DIRECT", "content", "insight")
        self.assertEqual(set(entry.keys()), {"analogy_type", "analogy_content", "reframed_insight"})


class AnalogyListInvariantTests(unittest.TestCase):
    """Invariant 2 (module docstring): analogies must be a non-empty, OPEN-ENDED list -- no per-type
    completeness or distinctness requirement, unlike strategy.vrio's forced 4-of-4 closed set."""

    def test_valid_3_analogies_one_per_type_is_accepted(self):
        session = _valid_session()
        self.assertEqual(len(session["analogies"]), 3)

    def test_a_single_analogy_is_accepted_open_ended(self):
        """Atlas gives no completeness requirement across the 3 types -- a session with just 1 analogy has
        still reframed the problem once."""
        session = _valid_session(analogies=[analogy_entry("DIRECT", "one analogy only", "one derived insight")])
        self.assertEqual(len(session["analogies"]), 1)

    def test_repeated_analogy_type_is_allowed_open_ended(self):
        """No per-type uniqueness/coverage requirement -- 3 DIRECT entries and zero PERSONAL/SYMBOLIC is a
        legal, if facilitation-thin, session (see contract's own OQ-SYNECTICS-1)."""
        analogies = [
            analogy_entry("DIRECT", "first direct analogy", "first insight"),
            analogy_entry("DIRECT", "second direct analogy", "second insight"),
            analogy_entry("DIRECT", "third direct analogy", "third insight"),
        ]
        session = _valid_session(analogies=analogies)
        self.assertEqual({a["analogy_type"] for a in session["analogies"]}, {"DIRECT"})

    def test_empty_analogies_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_ANALOGY_LIST"):
            generate_synectics_session("SYNECTICS-T-EMPTY", ORIGINAL_PROBLEM, [], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_non_list_analogies_is_refused(self):
        """A non-list value is treated the same as an empty list (both fail the same
        ``not isinstance(..., list) or not ...`` guard), same convention
        ``strategy.bcg_matrix.py``'s own ``BCG_EMPTY_PORTFOLIO`` check already establishes for an
        analogous open-ended list."""
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_ANALOGY_LIST"):
            generate_synectics_session("SYNECTICS-T-NONLIST", ORIGINAL_PROBLEM, "not a list", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_unknown_analogy_type_smuggled_in_via_raw_dict_is_refused(self):
        analogies = _analogies()[:2] + [{"analogy_type": "FANTASY", "analogy_content": "x", "reframed_insight": "y"}]
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_INVALID_ANALOGY_TYPE"):
            generate_synectics_session("SYNECTICS-T-UNKNOWNTYPE", ORIGINAL_PROBLEM, analogies, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_entry_missing_a_required_key_is_refused_as_invalid_shape(self):
        """A raw dict missing reframed_insight entirely (not just empty) fails the key-set shape check --
        the SHAPE reason, distinct from EMPTY_REFRAMED_INSIGHT, surfaces as SYNECTICS_INVALID_ANALOGY_LIST."""
        analogies = _analogies()[:2] + [{"analogy_type": "DIRECT", "analogy_content": "x"}]
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_INVALID_ANALOGY_LIST"):
            generate_synectics_session("SYNECTICS-T-MISSINGKEY", ORIGINAL_PROBLEM, analogies, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_non_dict_entry_in_list_is_refused_as_invalid_shape(self):
        analogies = _analogies()[:2] + ["not a dict"]
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_INVALID_ANALOGY_LIST"):
            generate_synectics_session("SYNECTICS-T-NONDICTENTRY", ORIGINAL_PROBLEM, analogies, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class AnalogyContentTests(unittest.TestCase):
    """Invariant 4 (module docstring): every analogy entry needs non-empty analogy_content and
    reframed_insight -- a category label alone is not a completed Synectics step."""

    def test_empty_analogy_content_is_refused(self):
        analogies = _analogies()
        analogies[0] = {**analogies[0], "analogy_content": ""}
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_ANALOGY_CONTENT"):
            generate_synectics_session("SYNECTICS-T-EMPTYCONTENT", ORIGINAL_PROBLEM, analogies, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_analogy_content_is_refused(self):
        analogies = _analogies()
        analogies[0] = {**analogies[0], "analogy_content": "   "}
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_ANALOGY_CONTENT"):
            generate_synectics_session("SYNECTICS-T-WSCONTENT", ORIGINAL_PROBLEM, analogies, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_empty_reframed_insight_is_refused(self):
        analogies = _analogies()
        analogies[0] = {**analogies[0], "reframed_insight": ""}
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_REFRAMED_INSIGHT"):
            generate_synectics_session("SYNECTICS-T-EMPTYINSIGHT", ORIGINAL_PROBLEM, analogies, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_reframed_insight_is_refused(self):
        analogies = _analogies()
        analogies[0] = {**analogies[0], "reframed_insight": "   "}
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_REFRAMED_INSIGHT"):
            generate_synectics_session("SYNECTICS-T-WSINSIGHT", ORIGINAL_PROBLEM, analogies, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_analogy_entry_rejects_empty_analogy_content(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_ANALOGY_CONTENT"):
            analogy_entry("DIRECT", "", "some insight")

    def test_analogy_entry_rejects_empty_reframed_insight(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_REFRAMED_INSIGHT"):
            analogy_entry("DIRECT", "some content", "")


class OriginalProblemTests(unittest.TestCase):
    """Invariant 1 (module docstring): original_problem is required, non-empty, names the subject under
    reframing."""

    def test_empty_original_problem_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_ORIGINAL_PROBLEM"):
            _valid_session(original_problem="")

    def test_whitespace_only_original_problem_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_ORIGINAL_PROBLEM"):
            _valid_session(original_problem="   ")

    def test_none_original_problem_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_EMPTY_ORIGINAL_PROBLEM"):
            _valid_session(original_problem=None)

    def test_a_real_original_problem_is_accepted_and_stored_verbatim(self):
        text = "onboarding drop-off rate exceeds 60% in the first session"
        session = _valid_session(original_problem=text)
        self.assertEqual(session["original_problem"], text)


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_INVALID_ID"):
            _valid_session(session_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_INVALID_ID"):
            _valid_session(session_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SYNECTICS_INVALID_VERSION"):
            generate_synectics_session("SYNECTICS-T-002", ORIGINAL_PROBLEM, _analogies(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID session's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_session(self):
        gate = evaluate_synectics_integrity_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_analogies(self):
        session = copy.deepcopy(_valid_session())
        session["analogies"] = []
        gate = evaluate_synectics_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_invalid_analogy_type(self):
        """The core closed-vocabulary proof: smuggling a 4th value directly onto a raw copy (bypassing the
        builder, which would have refused it) must still be caught by the independent gate."""
        session = copy.deepcopy(_valid_session())
        session["analogies"][0]["analogy_type"] = "FANTASY"
        gate = evaluate_synectics_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_analogy_content(self):
        session = copy.deepcopy(_valid_session())
        session["analogies"][0]["analogy_content"] = ""
        gate = evaluate_synectics_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_reframed_insight(self):
        session = copy.deepcopy(_valid_session())
        session["analogies"][0]["reframed_insight"] = ""
        gate = evaluate_synectics_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_original_problem(self):
        session = copy.deepcopy(_valid_session())
        session["original_problem"] = ""
        gate = evaluate_synectics_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_session(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_synectics_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        session = copy.deepcopy(_valid_session())
        session["id"] = "WRONG-001"
        gate = evaluate_synectics_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        session = copy.deepcopy(_valid_session())
        session["version"] = 1
        gate = evaluate_synectics_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_allows_repeated_analogy_type_open_ended(self):
        """Confirms the gate does NOT impose a per-type completeness/uniqueness rule the builder itself
        doesn't enforce either -- same open-ended shape verified end to end."""
        analogies = [
            analogy_entry("SYMBOLIC", "first symbolic analogy", "first insight"),
            analogy_entry("SYMBOLIC", "second symbolic analogy", "second insight"),
        ]
        session = _valid_session(analogies=analogies)
        gate = evaluate_synectics_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        session = copy.deepcopy(_valid_session())
        session["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_analogies_empty(self):
        session = copy.deepcopy(_valid_session())
        session["analogies"] = []
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

    def test_evaluate_synectics_gates_returns_two_gates_in_order(self):
        results = evaluate_synectics_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "synectics_integrity"])

    def test_evaluate_synectics_gates_all_pass_on_a_valid_session(self):
        results = evaluate_synectics_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "divergent.synectics")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        session = _valid_session()
        self.assertEqual(
            set(session.keys()),
            {"id", "version", "generated_by_method", "original_problem", "analogies", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
