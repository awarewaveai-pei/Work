"""Mutation-style tests for ``divergent.scamper`` (F03 divergent ideation family, 1st member).

Two real invariants beyond per-field shape (non-empty entries over a closed 7-lens vocabulary,
validation_status structurally locked to UNVALIDATED_IDEATION), exercised at BOTH layers: construction-time
refusal (``generate_scamper_session`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_scamper_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/scamper-session.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.divergent.scamper import (
    ADAPT,
    COMBINE,
    ELIMINATE,
    METHOD_ID,
    MODIFY,
    PUT,
    RECORD_ID_PREFIX,
    REVERSE,
    SUBSTITUTE,
    VALID_LENSES,
    VALIDATION_STATUS,
    all_gates_pass,
    entry,
    evaluate_provenance_required_gate,
    evaluate_scamper_gates,
    evaluate_scamper_integrity_gate,
    generate_scamper_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

SCAMPER_SESSION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/scamper-session.schema.yaml"


def _entries(**overrides: dict) -> list[dict]:
    base = {
        "substitute": dict(lens="SUBSTITUTE", transformed_idea="reusable canvas tote instead of cardboard box", reasoning="cuts single-use packaging cost, matches sustainability positioning"),
        "combine": dict(lens="COMBINE", transformed_idea="bundle with a local coffee roaster's monthly pack", reasoning="cross-brand bundling raises perceived value per subscription cycle"),
        "eliminate": dict(lens="ELIMINATE", transformed_idea="drop the printed manual, replace with a QR-coded video", reasoning="cuts print cost and shipping weight"),
        "reverse": dict(lens="REVERSE", transformed_idea="let subscribers pick their own ship order instead of a fixed calendar", reasoning="hands control to the user, may raise renewal rate"),
    }
    base.update(overrides)
    return [entry(v["lens"], v["transformed_idea"], v["reasoning"]) for v in base.values()]


def _valid_session(
    *,
    session_id: str = "SCAMPER-T-001",
    entries: list[dict] | None = None,
    provenance: dict | None = None,
):
    return generate_scamper_session(
        session_id,
        entries if entries is not None else _entries(),
        provenance if provenance is not None else make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_session_validates_against_the_real_schema(self):
        self.contracts.validate(SCAMPER_SESSION_SCHEMA, _valid_session(), "scamper session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, session = live.invoke(METHOD_ID, generate_scamper_session, "SCAMPER-T-INVOKE", _entries(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/divergent.scamper.contract.yaml")
        self.assertEqual(session["id"], "SCAMPER-T-INVOKE")

    def test_empty_catalog_blocks_scamper_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_session())
        tampered["entries"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCAMPER_SESSION_SCHEMA, tampered, "tampered session")
        gate = evaluate_scamper_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        bcg-matrix-analysis.schema.yaml's own equivalent test)."""
        session = _valid_session()
        session["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCAMPER_SESSION_SCHEMA, session, "session with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_an_entries_entry(self):
        session = _valid_session()
        session["entries"][0] = {**session["entries"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCAMPER_SESSION_SCHEMA, session, "session with a smuggled entries[] key")

    def test_schema_rejects_an_illegal_lens_value(self):
        session = _valid_session()
        session["entries"][0] = {**session["entries"][0], "lens": "AMPLIFY"}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCAMPER_SESSION_SCHEMA, session, "session with an illegal lens value")

    def test_schema_rejects_a_different_validation_status_value(self):
        session = _valid_session()
        session["validation_status"] = "VALIDATED"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SCAMPER_SESSION_SCHEMA, session, "session claiming VALIDATED")

    def test_id_is_distinct_from_association_morphological_analysis_machine_id(self):
        self.assertNotEqual(METHOD_ID, "association.morphological_analysis")
        self.assertEqual(METHOD_ID, "divergent.scamper")

    def test_scamper_and_morphological_analysis_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "association.morphological_analysis"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "divergent.scamper.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "divergent.scamper contract")


class LensVocabularyTests(unittest.TestCase):
    """The 7 real Atlas-cited lenses must be exactly SUBSTITUTE/COMBINE/ADAPT/MODIFY/PUT/ELIMINATE/REVERSE,
    no more, no fewer."""

    def test_valid_lenses_is_exactly_the_7_atlas_cited_values(self):
        self.assertEqual(VALID_LENSES, frozenset({"SUBSTITUTE", "COMBINE", "ADAPT", "MODIFY", "PUT", "ELIMINATE", "REVERSE"}))

    def test_lens_constants_match_their_own_string_values(self):
        self.assertEqual((SUBSTITUTE, COMBINE, ADAPT, MODIFY, PUT, ELIMINATE, REVERSE), ("SUBSTITUTE", "COMBINE", "ADAPT", "MODIFY", "PUT", "ELIMINATE", "REVERSE"))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SCAMPER-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "divergent.scamper")

    def test_entry_accepts_all_7_legal_lenses(self):
        for lens in sorted(VALID_LENSES):
            built = entry(lens, "idea", "reasoning")
            self.assertEqual(built["lens"], lens)

    def test_entry_rejects_an_illegal_lens(self):
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_UNKNOWN_LENS"):
            entry("AMPLIFY", "idea", "reasoning")

    def test_entry_rejects_empty_transformed_idea(self):
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_EMPTY_TRANSFORMED_IDEA"):
            entry("SUBSTITUTE", "   ", "reasoning")

    def test_entry_rejects_empty_reasoning(self):
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_EMPTY_REASONING"):
            entry("SUBSTITUTE", "idea", "   ")

    def test_entry_does_not_leak_a_validation_status_key(self):
        """Structural elimination: entry() has no validation_status parameter at all -- see module
        docstring invariant 2."""
        built = entry("SUBSTITUTE", "idea", "reasoning")
        self.assertNotIn("validation_status", built)
        self.assertEqual(set(built.keys()), {"lens", "transformed_idea", "reasoning"})


class EntriesCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): entries must be a non-empty list, no completeness-across-7-lenses
    requirement (unlike business_model_canvas's closed 9-block set)."""

    def test_4_entries_is_accepted(self):
        session = _valid_session()
        self.assertEqual(len(session["entries"]), 4)

    def test_single_entry_session_is_accepted(self):
        session = generate_scamper_session("SCAMPER-T-SINGLE", _entries()[:1], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(len(session["entries"]), 1)

    def test_empty_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_EMPTY_SESSION"):
            generate_scamper_session("SCAMPER-T-EMPTY", [], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_non_list_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_EMPTY_SESSION"):
            generate_scamper_session("SCAMPER-T-NONLIST", "not a list", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_all_7_lenses_at_once_is_accepted(self):
        """Open-ended -- no maxItems, unlike business_model_canvas's fixed-9 closed set, see module
        docstring. Also confirms repeated-lens-free full coverage works."""
        entries = [entry(lens, f"idea for {lens}", f"reasoning for {lens}") for lens in sorted(VALID_LENSES)]
        session = generate_scamper_session("SCAMPER-T-ALL7", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(len(session["entries"]), 7)

    def test_repeated_lens_is_accepted(self):
        """No lens-uniqueness invariant -- Atlas gives none, see contract's own compilation_decisions."""
        entries = [entry("SUBSTITUTE", "idea A", "reasoning A"), entry("SUBSTITUTE", "idea B", "reasoning B")]
        session = generate_scamper_session("SCAMPER-T-REPEAT", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(len(session["entries"]), 2)


class EntryContentTests(unittest.TestCase):
    """Invariant 1 (module docstring) continued: every entry needs a legal lens and non-empty
    transformed_idea/reasoning, exercised via raw dicts smuggled past entry()'s own guard."""

    def test_missing_reasoning_key_smuggled_in_via_raw_dict_is_refused(self):
        entries = _entries()
        del entries[0]["reasoning"]
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_INVALID_ENTRY_SHAPE"):
            generate_scamper_session("SCAMPER-T-NOREASONING", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_empty_transformed_idea_smuggled_in_via_raw_dict_is_refused(self):
        entries = _entries()
        entries[0] = {**entries[0], "transformed_idea": ""}
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_EMPTY_TRANSFORMED_IDEA"):
            generate_scamper_session("SCAMPER-T-EMPTYIDEA", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_invalid_lens_smuggled_in_via_raw_dict_is_refused(self):
        entries = _entries()
        entries[0] = {**entries[0], "lens": "AMPLIFY"}
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_UNKNOWN_LENS"):
            generate_scamper_session("SCAMPER-T-BADLENS", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_smuggled_validation_status_key_on_an_input_entry_is_refused(self):
        """validation_status is never an accepted entry key -- see entry()/module docstring. This is the
        real refusal proof CLI step 3 also demonstrates."""
        entries = _entries()
        entries[0] = {**entries[0], "validation_status": "VALIDATED"}
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_INVALID_ENTRY_SHAPE"):
            generate_scamper_session("SCAMPER-T-SMUGGLEDSTATUS", entries, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_builder_always_stamps_the_one_legal_validation_status(self):
        session = _valid_session()
        self.assertEqual(session["validation_status"], "UNVALIDATED_IDEATION")
        self.assertEqual(session["validation_status"], VALIDATION_STATUS)


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_INVALID_ID"):
            _valid_session(session_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_INVALID_ID"):
            _valid_session(session_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_INVALID_VERSION"):
            generate_scamper_session("SCAMPER-T-002", _entries(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCAMPER_INVALID_PROVENANCE"):
            generate_scamper_session("SCAMPER-T-003", _entries(), {"epistemic_type": "NOT_REAL", "authorship_state": "AI_SUGGESTED"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID session's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_session(self):
        gate = evaluate_scamper_integrity_gate(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_empty_entries(self):
        session = copy.deepcopy(_valid_session())
        session["entries"] = []
        gate = evaluate_scamper_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_illegal_lens(self):
        session = copy.deepcopy(_valid_session())
        session["entries"][0]["lens"] = "AMPLIFY"
        gate = evaluate_scamper_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_reasoning(self):
        session = copy.deepcopy(_valid_session())
        session["entries"][0]["reasoning"] = ""
        gate = evaluate_scamper_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_validation_status_claiming_validated(self):
        """The independent-gate hand-tamper proof R0/verify requires: a tampered record claiming a
        different validation_status must be caught even though it never went through the builder."""
        session = copy.deepcopy(_valid_session())
        session["validation_status"] = "VALIDATED"  # was UNVALIDATED_IDEATION
        gate = evaluate_scamper_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_session(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_scamper_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        session = copy.deepcopy(_valid_session())
        session["id"] = "WRONG-001"
        gate = evaluate_scamper_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        session = copy.deepcopy(_valid_session())
        session["version"] = 1
        gate = evaluate_scamper_integrity_gate(session, "test", "2026-09-11T00:00:00Z")
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

    def test_evaluate_scamper_gates_returns_two_gates_in_order(self):
        results = evaluate_scamper_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "scamper_integrity"])

    def test_evaluate_scamper_gates_all_pass_on_a_valid_session(self):
        results = evaluate_scamper_gates(_valid_session(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_builder_does_not_leak_extra_top_level_keys(self):
        session = _valid_session()
        self.assertEqual(set(session.keys()), {"id", "version", "generated_by_method", "entries", "validation_status", "provenance"})


if __name__ == "__main__":
    unittest.main()
