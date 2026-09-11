"""Mutation-style tests for ``divergent.random_stimulus`` (F03 divergent ideation family, 1st built
member).

Three real invariants beyond per-field shape (non-empty entries, per-entry disclosed content, single-
legal-value ``feasibility_status``), exercised at BOTH layers where the builder accepts the field at all:
construction-time refusal (``generate_random_stimulus_session`` raising a specific ``InvariantViolation``
code for invariants 1+2) and independent gate re-derivation
(``evaluate_random_stimulus_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself, for all 3 invariants including ``feasibility_status`` which
the builder never accepts as a parameter). Schema conformance is checked against the real spec-root
schema this same slice added (``typed-objects/random-stimulus-session.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.divergent.random_stimulus import (
    FEASIBILITY_STATUS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_random_stimulus_gates,
    evaluate_random_stimulus_integrity_gate,
    generate_random_stimulus_session,
    stimulus_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RANDOM_STIMULUS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/random-stimulus-session.schema.yaml"


def _entries(**overrides: dict) -> list[dict]:
    base = {
        "jellyfish": dict(
            stimulus="jellyfish",
            forced_connection="a jellyfish has no skeleton yet floats freely -- maps to our product's zero-install, launch-and-go trait",
            resulting_idea="reposition the product around 'weightlessness', emphasizing zero install burden",
        ),
        "traffic_light": dict(
            stimulus="traffic light",
            forced_connection="a traffic light conveys state instantly through color, no text needed -- maps to needing an at-a-glance dashboard health read",
            resulting_idea="replace the dashboard's long status paragraph with a 3-color status light",
        ),
    }
    base.update(overrides)
    return [stimulus_entry(v["stimulus"], v["forced_connection"], v["resulting_idea"]) for v in base.values()]


def _valid_session(
    *,
    session_id: str = "RANDOMSTIM-T-001",
    entries: list[dict] | None = None,
):
    return generate_random_stimulus_session(
        session_id,
        entries if entries is not None else _entries(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_session_validates_against_the_real_schema(self):
        self.contracts.validate(RANDOM_STIMULUS_SCHEMA, _valid_session(), "random stimulus session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, session = live.invoke(
            METHOD_ID, generate_random_stimulus_session, "RANDOMSTIM-T-INVOKE", _entries(), make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/divergent.random_stimulus.contract.yaml")
        self.assertEqual(session["id"], "RANDOMSTIM-T-INVOKE")

    def test_empty_catalog_blocks_random_stimulus_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_session())
        tampered["entries"][0]["feasibility_status"] = "FEASIBLE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RANDOM_STIMULUS_SCHEMA, tampered, "tampered session")
        gate = evaluate_random_stimulus_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        bcg-matrix-analysis.schema.yaml's own equivalent test)."""
        session = _valid_session()
        session["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RANDOM_STIMULUS_SCHEMA, session, "session with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_an_entries_entry(self):
        session = _valid_session()
        session["entries"][0] = {**session["entries"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RANDOM_STIMULUS_SCHEMA, session, "session with a smuggled entries[] key")

    def test_schema_rejects_an_empty_entries_array(self):
        session = _valid_session()
        session["entries"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RANDOM_STIMULUS_SCHEMA, session, "session with an empty entries array")

    def test_id_is_distinct_from_strategy_bcg_matrix_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.bcg_matrix")
        self.assertEqual(METHOD_ID, "divergent.random_stimulus")

    def test_random_stimulus_and_bcg_matrix_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.bcg_matrix"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "divergent.random_stimulus.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "divergent.random_stimulus contract")


class StimulusEntryTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "RANDOMSTIM-")

    def test_stimulus_entry_rejects_an_empty_stimulus(self):
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_EMPTY_STIMULUS"):
            stimulus_entry("   ", "connection", "idea")

    def test_stimulus_entry_rejects_an_empty_forced_connection(self):
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_EMPTY_FORCED_CONNECTION"):
            stimulus_entry("word", "   ", "idea")

    def test_stimulus_entry_rejects_an_empty_resulting_idea(self):
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_EMPTY_RESULTING_IDEA"):
            stimulus_entry("word", "connection", "   ")

    def test_stimulus_entry_does_not_leak_a_feasibility_status_key(self):
        """Structural elimination: stimulus_entry() has no feasibility_status parameter at all -- see
        module docstring."""
        entry = stimulus_entry("word", "connection", "idea")
        self.assertNotIn("feasibility_status", entry)
        self.assertEqual(set(entry.keys()), {"stimulus", "forced_connection", "resulting_idea"})

    def test_stimulus_entry_accepts_well_formed_content(self):
        entry = stimulus_entry("word", "connection", "idea")
        self.assertEqual(entry["stimulus"], "word")
        self.assertEqual(entry["forced_connection"], "connection")
        self.assertEqual(entry["resulting_idea"], "idea")


class EntriesNonEmptyTests(unittest.TestCase):
    """Invariant 1 (module docstring): entries must be a non-empty list."""

    def test_2_entries_is_accepted(self):
        session = _valid_session()
        self.assertEqual(len(session["entries"]), 2)

    def test_single_entry_session_is_accepted(self):
        session = generate_random_stimulus_session("RANDOMSTIM-T-SINGLE", _entries()[:1], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(len(session["entries"]), 1)

    def test_empty_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_EMPTY_ENTRIES"):
            generate_random_stimulus_session("RANDOMSTIM-T-EMPTY", [], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_non_list_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_EMPTY_ENTRIES"):
            generate_random_stimulus_session("RANDOMSTIM-T-NONLIST", "not a list", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_large_entries_list_is_accepted(self):
        """Open-ended, no maxItems -- unlike a fixed closed set, see module docstring."""
        entries = _entries() * 5  # 10 entries, duplicates allowed (no uniqueness invariant, see contract's own compilation_decisions)
        session = generate_random_stimulus_session("RANDOMSTIM-T-LARGE", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(len(session["entries"]), 10)


class EntryContentTests(unittest.TestCase):
    """Invariant 2 (module docstring): every entry needs non-empty stimulus/forced_connection/resulting_idea."""

    def test_missing_forced_connection_key_smuggled_in_via_raw_dict_is_refused(self):
        entries = _entries()
        del entries[0]["forced_connection"]
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_INVALID_ENTRY"):
            generate_random_stimulus_session("RANDOMSTIM-T-NOCONNECTION", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_empty_stimulus_smuggled_in_via_raw_dict_is_refused(self):
        entries = _entries()
        entries[0] = {**entries[0], "stimulus": ""}
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_INVALID_ENTRY"):
            generate_random_stimulus_session("RANDOMSTIM-T-EMPTYSTIMULUS", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_empty_resulting_idea_smuggled_in_via_raw_dict_is_refused(self):
        entries = _entries()
        entries[0] = {**entries[0], "resulting_idea": "   "}
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_INVALID_ENTRY"):
            generate_random_stimulus_session("RANDOMSTIM-T-EMPTYIDEA", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_smuggled_feasibility_status_key_on_an_input_entry_is_refused(self):
        """feasibility_status is never an accepted input key -- see stimulus_entry()/module docstring."""
        entries = _entries()
        entries[0] = {**entries[0], "feasibility_status": "NOT_YET_SCREENED"}
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_INVALID_ENTRY"):
            generate_random_stimulus_session("RANDOMSTIM-T-SMUGGLEDSTATUS", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class FeasibilityStatusTests(unittest.TestCase):
    """Invariant 3 (module docstring): feasibility_status is ALWAYS exactly FEASIBILITY_STATUS,
    guaranteed by the builder NOT accepting it as a parameter at all (structural elimination) -- unlike
    invariants 1+2, there is no builder call to refuse with an InvariantViolation, so these tests prove
    the elimination itself (a TypeError, since it is not a keyword the function signature has at all)
    plus the independent gate re-derivation."""

    def test_feasibility_status_constant(self):
        self.assertEqual(FEASIBILITY_STATUS, "NOT_YET_SCREENED")

    def test_builder_does_not_accept_feasibility_status_as_a_keyword_argument(self):
        with self.assertRaises(TypeError):
            generate_random_stimulus_session(
                "RANDOMSTIM-T-BADKWARG", _entries(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), feasibility_status="FEASIBLE"  # type: ignore[call-arg]
            )

    def test_every_builder_produced_entry_carries_exactly_the_constant(self):
        session = _valid_session()
        for entry in session["entries"]:
            self.assertEqual(entry["feasibility_status"], FEASIBILITY_STATUS)
            self.assertEqual(entry["feasibility_status"], "NOT_YET_SCREENED")

    def test_gate_catches_hand_tampered_feasibility_status_claiming_feasible(self):
        """The builder can never be made to emit a wrong feasibility_status, so this hand-tampers a raw
        dict directly (bypassing the builder entirely) to prove the gate re-derives invariant 3 rather
        than merely trusting that the builder always got it right."""
        session = copy.deepcopy(_valid_session())
        session["entries"][0]["feasibility_status"] = "FEASIBLE"
        gate = evaluate_random_stimulus_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_feasibility_status_claiming_infeasible(self):
        session = copy.deepcopy(_valid_session())
        session["entries"][0]["feasibility_status"] = "INFEASIBLE"
        gate = evaluate_random_stimulus_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_feasibility_status(self):
        session = copy.deepcopy(_valid_session())
        del session["entries"][0]["feasibility_status"]
        gate = evaluate_random_stimulus_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_INVALID_ID"):
            _valid_session(session_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_INVALID_ID"):
            _valid_session(session_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RANDOMSTIM_INVALID_VERSION"):
            generate_random_stimulus_session("RANDOMSTIM-T-002", _entries(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID session's raw dict directly (never going through the builder again), then
    call the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own
    work."""

    def test_gate_passes_a_genuinely_valid_hand_built_session(self):
        gate = evaluate_random_stimulus_integrity_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_entries(self):
        session = copy.deepcopy(_valid_session())
        session["entries"] = []
        gate = evaluate_random_stimulus_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_stimulus(self):
        session = copy.deepcopy(_valid_session())
        session["entries"][0]["stimulus"] = ""
        gate = evaluate_random_stimulus_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_session(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_random_stimulus_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        session = copy.deepcopy(_valid_session())
        session["id"] = "WRONG-001"
        gate = evaluate_random_stimulus_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        session = copy.deepcopy(_valid_session())
        session["version"] = 1
        gate = evaluate_random_stimulus_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        session = copy.deepcopy(_valid_session())
        session["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_empty_entries(self):
        gate = evaluate_provenance_required_gate({"entries": [], "provenance": make_provenance("AI_INFERENCE", "AI_SUGGESTED")}, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_random_stimulus_gates_returns_two_gates_in_order(self):
        results = evaluate_random_stimulus_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "random_stimulus_integrity"])

    def test_evaluate_random_stimulus_gates_all_pass_on_a_valid_session(self):
        results = evaluate_random_stimulus_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "divergent.random_stimulus")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        session = _valid_session()
        self.assertEqual(set(session.keys()), {"id", "version", "generated_by_method", "entries", "provenance"})


if __name__ == "__main__":
    unittest.main()
