"""Mutation-style tests for ``divergent.six_three_five`` (F03 divergent-ideation family, one of 10 agents
opening independent F03 members in this same parallel batch).

Two layers, same split every sibling GENUINE_COMPUTE slice in this package already establishes
(``test_mece.py``'s own two-layer split): shared-predicate unit checks against hand-worked examples
directly, THEN the module layer (construction-time refusal for structural malformation, independent gate
re-derivation for hand-tampering) is checked end-to-end. Unlike ``decomposition.mece``'s own
``is_mece: false`` legal-but-imperfect outcome, BOTH real invariants here (exactly-3-ideas,
full-rotation completeness) are hard REFUSALS -- there is no legal-but-imperfect ``SixThreeFiveSession``,
same discipline this slice's own contract compilation_decisions disclose.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.divergent.six_three_five import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_six_three_five_gates,
    evaluate_six_three_five_integrity_gate,
    generate_six_three_five_session,
    round_entry,
    sheet,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

SESSION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/six-three-five-session.schema.yaml"
METHOD_SCHEMA = "ai-lego://specs/cognitive/method.schema.yaml"
VALIDATOR = "test"
TS = "2026-09-11T00:00:00Z"


def _prov():
    return make_provenance("AI_SUGGESTION", "AI_GENERATED")


def _clean_participants_and_sheets():
    participants = ["P1", "P2", "P3", "P4"]
    sheets = [
        sheet(
            "SHEET-A",
            [
                round_entry(1, "P1", ["a1", "a2", "a3"]),
                round_entry(2, "P2", ["a4", "a5", "a6"]),
                round_entry(3, "P3", ["a7", "a8", "a9"]),
                round_entry(4, "P4", ["a10", "a11", "a12"]),
            ],
        ),
        sheet(
            "SHEET-B",
            [
                round_entry(1, "P2", ["b1", "b2", "b3"]),
                round_entry(2, "P3", ["b4", "b5", "b6"]),
                round_entry(3, "P4", ["b7", "b8", "b9"]),
                round_entry(4, "P1", ["b10", "b11", "b12"]),
            ],
        ),
    ]
    return participants, sheets


def _build(session_id="SIXTHREEFIVE-T-001", participant_ids=None, sheets=None, provenance=None, version="1.0.0"):
    p, s = _clean_participants_and_sheets()
    return generate_six_three_five_session(
        session_id,
        participant_ids if participant_ids is not None else p,
        sheets if sheets is not None else s,
        provenance if provenance is not None else _prov(),
        version=version,
    )


def _valid_session():
    return _build()


class RoundEntryConstructorTests(unittest.TestCase):
    def test_round_entry_accepts_exactly_three_ideas(self):
        entry = round_entry(1, "P1", ["a", "b", "c"])
        self.assertEqual(entry, {"round_number": 1, "contributor_id": "P1", "ideas": ["a", "b", "c"]})

    def test_round_entry_rejects_two_ideas(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_IDEAS_COUNT"):
            round_entry(1, "P1", ["a", "b"])

    def test_round_entry_rejects_four_ideas(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_IDEAS_COUNT"):
            round_entry(1, "P1", ["a", "b", "c", "d"])

    def test_round_entry_rejects_zero_ideas(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_IDEAS_COUNT"):
            round_entry(1, "P1", [])

    def test_round_entry_rejects_blank_idea_string(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_IDEAS_COUNT"):
            round_entry(1, "P1", ["a", "   ", "c"])

    def test_round_entry_rejects_non_string_idea(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_IDEAS_COUNT"):
            round_entry(1, "P1", ["a", "b", 3])

    def test_round_entry_rejects_zero_round_number(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_ROUND_NUMBER"):
            round_entry(0, "P1", ["a", "b", "c"])

    def test_round_entry_rejects_non_int_round_number(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_ROUND_NUMBER"):
            round_entry("1", "P1", ["a", "b", "c"])

    def test_round_entry_rejects_bool_round_number(self):
        """bool is a subclass of int in Python -- must be explicitly excluded, same defensive check every
        sibling module's own round/step-number validation already applies."""
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_ROUND_NUMBER"):
            round_entry(True, "P1", ["a", "b", "c"])

    def test_round_entry_rejects_empty_contributor_id(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_EMPTY_CONTRIBUTOR_ID"):
            round_entry(1, "", ["a", "b", "c"])


class SheetConstructorTests(unittest.TestCase):
    def test_sheet_accepts_well_formed_rounds(self):
        rounds = [round_entry(1, "P1", ["a", "b", "c"])]
        result = sheet("SHEET-A", rounds)
        self.assertEqual(result["sheet_id"], "SHEET-A")
        self.assertEqual(result["rounds"], rounds)

    def test_sheet_rejects_empty_sheet_id(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_EMPTY_SHEET_ID"):
            sheet("   ", [round_entry(1, "P1", ["a", "b", "c"])])

    def test_sheet_rejects_empty_rounds(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_ROUNDS"):
            sheet("SHEET-A", [])

    def test_sheet_rejects_malformed_round_smuggled_in_via_raw_dict(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_ROUNDS"):
            sheet("SHEET-A", [{"round_number": 1, "contributor_id": "P1", "ideas": ["a", "b"]}])


class BuilderStructuralRefusalTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_ID"):
            _build(session_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_ID"):
            _build(session_id="")

    def test_invalid_version_non_string_is_refused(self):
        p, s = _clean_participants_and_sheets()
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_VERSION"):
            generate_six_three_five_session("SIXTHREEFIVE-T-002", p, s, _prov(), version=1)

    def test_solo_participant_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_PARTICIPANTS"):
            _build(participant_ids=["P1"], sheets=[sheet("SHEET-A", [round_entry(1, "P1", ["a", "b", "c"])])])

    def test_empty_participants_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_PARTICIPANTS"):
            _build(participant_ids=[], sheets=[sheet("SHEET-A", [round_entry(1, "P1", ["a", "b", "c"])])])

    def test_duplicate_participant_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_PARTICIPANTS"):
            _build(participant_ids=["P1", "P1"], sheets=[sheet("SHEET-A", [round_entry(1, "P1", ["a", "b", "c"])])])

    def test_non_list_participants_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_PARTICIPANTS"):
            _build(participant_ids="not-a-list")

    def test_empty_sheets_is_refused(self):
        p, _ = _clean_participants_and_sheets()
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_SHEETS"):
            _build(participant_ids=p, sheets=[])

    def test_non_list_sheets_is_refused(self):
        p, _ = _clean_participants_and_sheets()
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_SHEETS"):
            _build(participant_ids=p, sheets={"sheet_id": "x"})

    def test_duplicate_sheet_id_is_refused(self):
        p, s = _clean_participants_and_sheets()
        duped = [s[0], {**s[0]}]  # two sheets, same sheet_id "SHEET-A"
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_DUPLICATE_SHEET_ID"):
            _build(participant_ids=p, sheets=duped)

    def test_sheet_with_extra_key_smuggled_in_via_raw_dict_is_refused(self):
        p, _ = _clean_participants_and_sheets()
        cats = [{"sheet_id": "SHEET-A", "rounds": [round_entry(1, "P1", ["a", "b", "c"])], "extra": 1}]
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INVALID_SHEETS"):
            _build(participant_ids=p, sheets=cats)


class RotationCompletenessRefusalTests(unittest.TestCase):
    """Real invariant #2: every sheet's own rounds' contributor_id multiset must equal EXACTLY
    participant_ids -- refused at construction, unlike decomposition.mece's own legal is_mece: false."""

    def test_sheet_missing_a_participant_entirely_is_refused(self):
        p = ["P1", "P2", "P3", "P4"]
        s = [
            sheet(
                "SHEET-A",
                [
                    round_entry(1, "P1", ["a", "b", "c"]),
                    round_entry(2, "P2", ["d", "e", "f"]),
                    round_entry(3, "P3", ["g", "h", "i"]),
                    # P4 never appears, only 3 rounds -- shorter than participant_ids
                ],
            )
        ]
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INCOMPLETE_ROTATION"):
            _build(participant_ids=p, sheets=s)

    def test_sheet_with_a_participant_appearing_twice_and_another_missing_is_refused(self):
        p = ["P1", "P2", "P3", "P4"]
        s = [
            sheet(
                "SHEET-A",
                [
                    round_entry(1, "P1", ["a", "b", "c"]),
                    round_entry(2, "P2", ["d", "e", "f"]),
                    round_entry(3, "P3", ["g", "h", "i"]),
                    round_entry(4, "P1", ["j", "k", "l"]),  # P1 twice, P4 never
                ],
            )
        ]
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INCOMPLETE_ROTATION"):
            _build(participant_ids=p, sheets=s)

    def test_one_bad_sheet_among_good_sheets_still_refuses_the_whole_session(self):
        p, good_sheets = _clean_participants_and_sheets()
        bad_sheet = sheet(
            "SHEET-BAD",
            [
                round_entry(1, "P1", ["a", "b", "c"]),
                round_entry(2, "P1", ["d", "e", "f"]),  # P1 twice
                round_entry(3, "P3", ["g", "h", "i"]),
                round_entry(4, "P2", ["j", "k", "l"]),
            ],
        )
        with self.assertRaisesRegex(InvariantViolation, "SIXTHREEFIVE_INCOMPLETE_ROTATION"):
            _build(participant_ids=p, sheets=[*good_sheets, bad_sheet])

    def test_rotation_order_does_not_matter_only_the_multiset(self):
        """A sheet whose rounds visit participants out of 'natural' order is still complete -- the invariant
        is a multiset-equality fact, not a sequence fact."""
        p = ["P1", "P2", "P3", "P4"]
        s = [
            sheet(
                "SHEET-A",
                [
                    round_entry(1, "P4", ["a", "b", "c"]),
                    round_entry(2, "P1", ["d", "e", "f"]),
                    round_entry(3, "P3", ["g", "h", "i"]),
                    round_entry(4, "P2", ["j", "k", "l"]),
                ],
            )
        ]
        session = _build(participant_ids=p, sheets=s)
        self.assertEqual(session["sheets"][0]["sheet_id"], "SHEET-A")

    def test_more_sheets_than_participants_is_legal(self):
        """No cited ratio between sheet_count and participant_count -- see contract compilation_decisions."""
        p = ["P1", "P2"]
        s = [
            sheet("SHEET-A", [round_entry(1, "P1", ["a", "b", "c"]), round_entry(2, "P2", ["d", "e", "f"])]),
            sheet("SHEET-B", [round_entry(1, "P2", ["g", "h", "i"]), round_entry(2, "P1", ["j", "k", "l"])]),
            sheet("SHEET-C", [round_entry(1, "P1", ["m", "n", "o"]), round_entry(2, "P2", ["p", "q", "r"])]),
        ]
        session = _build(participant_ids=p, sheets=s)
        self.assertEqual(len(session["sheets"]), 3)


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_session_validates_against_the_real_schema(self):
        self.contracts.validate(SESSION_SCHEMA, _valid_session(), "six-three-five session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        p, s = _clean_participants_and_sheets()
        descriptor, session = live.invoke(METHOD_ID, generate_six_three_five_session, "SIXTHREEFIVE-T-INVOKE", p, s, _prov())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/divergent.six_three_five.contract.yaml")
        self.assertEqual(session["id"], "SIXTHREEFIVE-T-INVOKE")

    def test_empty_catalog_blocks_six_three_five_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same
        live check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "divergent.six_three_five.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate(METHOD_SCHEMA, instance, "divergent.six_three_five contract")

    def test_contract_id_avoids_digits_per_method_schema_pattern(self):
        self.assertEqual(METHOD_ID, "divergent.six_three_five")
        self.assertNotRegex(METHOD_ID, r"\d")

    def test_schema_rejects_an_unknown_top_level_key(self):
        session = _valid_session()
        session["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SESSION_SCHEMA, session, "session with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_sheets_entry(self):
        session = _valid_session()
        session["sheets"][0] = {**session["sheets"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SESSION_SCHEMA, session, "session with a smuggled sheets[] key")

    def test_schema_rejects_an_unknown_key_inside_a_rounds_entry(self):
        session = _valid_session()
        session["sheets"][0]["rounds"][0] = {**session["sheets"][0]["rounds"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SESSION_SCHEMA, session, "session with a smuggled rounds[] key")

    def test_schema_rejects_an_ideas_array_with_two_entries(self):
        session = _valid_session()
        session["sheets"][0]["rounds"][0]["ideas"] = ["only-one", "only-two"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SESSION_SCHEMA, session, "session with a 2-idea round")

    def test_schema_rejects_an_ideas_array_with_four_entries(self):
        session = _valid_session()
        session["sheets"][0]["rounds"][0]["ideas"] = ["a", "b", "c", "d"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SESSION_SCHEMA, session, "session with a 4-idea round")

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_session())
        tampered["participant_ids"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SESSION_SCHEMA, tampered, "tampered session")
        gate = evaluate_six_three_five_integrity_gate(tampered, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_id_is_distinct_from_sibling_f03_machine_ids(self):
        self.assertNotIn(METHOD_ID, {"divergent.brainwriting", "divergent.crazy_eights", "divergent.scamper", "divergent.starbursting"})
        self.assertEqual(METHOD_ID, "divergent.six_three_five")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID session's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_session(self):
        gate = evaluate_six_three_five_integrity_gate(_valid_session(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_ideas_count_dropped_to_two(self):
        session = copy.deepcopy(_valid_session())
        session["sheets"][0]["rounds"][0]["ideas"] = ["a", "b"]
        gate = evaluate_six_three_five_integrity_gate(session, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_ideas_count_raised_to_four(self):
        session = copy.deepcopy(_valid_session())
        session["sheets"][0]["rounds"][0]["ideas"] = ["a", "b", "c", "d"]
        gate = evaluate_six_three_five_integrity_gate(session, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_contributor_id_breaking_rotation(self):
        session = copy.deepcopy(_valid_session())
        session["sheets"][0]["rounds"][0]["contributor_id"] = "P4"  # duplicates P4, drops P1 on SHEET-A
        gate = evaluate_six_three_five_integrity_gate(session, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_sheet_id(self):
        session = copy.deepcopy(_valid_session())
        session["sheets"][1]["sheet_id"] = session["sheets"][0]["sheet_id"]
        gate = evaluate_six_three_five_integrity_gate(session, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_participants(self):
        session = copy.deepcopy(_valid_session())
        session["participant_ids"] = []
        gate = evaluate_six_three_five_integrity_gate(session, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_solo_participant(self):
        session = copy.deepcopy(_valid_session())
        session["participant_ids"] = ["P1"]
        gate = evaluate_six_three_five_integrity_gate(session, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_sheets(self):
        session = copy.deepcopy(_valid_session())
        session["sheets"] = []
        gate = evaluate_six_three_five_integrity_gate(session, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_session(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_six_three_five_integrity_gate(bad, VALIDATOR, TS)
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        session = copy.deepcopy(_valid_session())
        session["id"] = "WRONG-001"
        gate = evaluate_six_three_five_integrity_gate(session, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        session = copy.deepcopy(_valid_session())
        session["version"] = 1
        gate = evaluate_six_three_five_integrity_gate(session, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        session = _valid_session()
        snapshot = copy.deepcopy(session)
        evaluate_six_three_five_integrity_gate(session, VALIDATOR, TS)
        self.assertEqual(session, snapshot)


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_session(), VALIDATOR, TS)
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        session = copy.deepcopy(_valid_session())
        session["provenance"] = None
        gate = evaluate_provenance_required_gate(session, VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", VALIDATOR, TS)
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_six_three_five_gates_returns_two_gates_in_order(self):
        results = evaluate_six_three_five_gates(_valid_session(), VALIDATOR, TS)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "six_three_five_integrity"])

    def test_evaluate_six_three_five_gates_all_pass_on_a_valid_session(self):
        results = evaluate_six_three_five_gates(_valid_session(), VALIDATOR, TS)
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "divergent.six_three_five")

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SIXTHREEFIVE-")

    def test_builder_never_hardcodes_headcount_to_six(self):
        """Task-mandated: headcount must be adjustable, not fixed at 6 -- proven with 2 AND 4 participants."""
        two = _build(
            participant_ids=["Q1", "Q2"],
            sheets=[sheet("SHEET-X", [round_entry(1, "Q1", ["a", "b", "c"]), round_entry(2, "Q2", ["d", "e", "f"])])],
        )
        self.assertEqual(len(two["participant_ids"]), 2)
        four = _valid_session()
        self.assertEqual(len(four["participant_ids"]), 4)

    def test_builder_does_not_leak_extra_top_level_keys(self):
        session = _valid_session()
        self.assertEqual(
            set(session.keys()),
            {"id", "version", "generated_by_method", "participant_ids", "sheets", "provenance"},
        )

    def test_builder_deep_copies_sheets_not_aliasing_caller_lists(self):
        p, s = _clean_participants_and_sheets()
        session = generate_six_three_five_session("SIXTHREEFIVE-T-ALIAS", p, s, _prov())
        session["sheets"][0]["rounds"][0]["ideas"].append("mutated")
        self.assertNotIn("mutated", s[0]["rounds"][0]["ideas"])


if __name__ == "__main__":
    unittest.main()
