"""Mutation-style tests for ``foresight.black_swan_exercise`` (F13 unknown-unknowns/foresight family, FIRST
built member).

THE real invariants (chain referential completeness, Atlas L679's own "tail events→exposure→survivability→
hedges") plus the structural invariants supporting them (well-shaped entries, unique ids, no dangling
references), exercised at BOTH layers: construction-time refusal (``generate_black_swan_exercise`` raising a
specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_black_swan_chain_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/black-swan-exercise.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.black_swan_exercise import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_black_swan_chain_integrity_gate,
    evaluate_black_swan_exercise_gates,
    evaluate_provenance_required_gate,
    exposure,
    generate_black_swan_exercise,
    hedge,
    survivability_assessment,
    tail_event,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

BLACK_SWAN_SCHEMA = "ai-lego://specs/cognitive/typed-objects/black-swan-exercise.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")


def _tail_events() -> list[dict]:
    return [{"id": "TE-001", "description": "唯一雲端區域發生連續 72 小時全區中斷"}]


def _exposures() -> list[dict]:
    return [{"id": "EXP-001", "tail_event_id": "TE-001", "description": "無跨區備援，中斷期間完全無法對外服務"}]


def _survivability_assessments() -> list[dict]:
    return [{"id": "SA-001", "exposure_id": "EXP-001", "description": "不可存活超過 24 小時"}]


def _hedges() -> list[dict]:
    return [{"id": "HDG-001", "exposure_id": "EXP-001", "description": "建立第二區域的唯讀備援"}]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        tail_events=_tail_events(),
        exposures=_exposures(),
        survivability_assessments=_survivability_assessments(),
        hedges=_hedges(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_exercise(*, record_id: str = "BSWAN-T-001", **overrides: object):
    return generate_black_swan_exercise(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_exercise_validates_against_the_real_schema(self):
        self.contracts.validate(BLACK_SWAN_SCHEMA, _valid_exercise(), "black swan exercise")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, exercise = live.invoke(METHOD_ID, generate_black_swan_exercise, "BSWAN-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.black_swan_exercise.contract.yaml")
        self.assertEqual(exercise["id"], "BSWAN-T-INVOKE")

    def test_empty_catalog_blocks_black_swan_exercise_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_exercise())
        tampered["tail_events"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BLACK_SWAN_SCHEMA, tampered, "tampered exercise")
        gate = evaluate_black_swan_chain_integrity_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        exercise = _valid_exercise()
        exercise["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BLACK_SWAN_SCHEMA, exercise, "exercise with a smuggled top-level key")

    def test_schema_rejects_missing_tail_events(self):
        exercise = _valid_exercise()
        del exercise["tail_events"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BLACK_SWAN_SCHEMA, exercise, "exercise with tail_events removed")

    def test_id_is_distinct_from_prior_challenge_family_prefixes(self):
        self.assertEqual(METHOD_ID, "foresight.black_swan_exercise")
        self.assertEqual(RECORD_ID_PREFIX, "BSWAN-")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.black_swan_exercise.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.black_swan_exercise contract")


class ChainCompletenessTests(unittest.TestCase):
    """THE real invariants (module docstring): every tail_events[] entry must be covered by >=1 exposures[]
    entry, and every exposures[] entry must be covered by >=1 survivability_assessments[] entry, before
    construction succeeds -- Atlas L679's own chain mechanized."""

    def test_well_formed_exercise_is_accepted(self):
        exercise = _valid_exercise()
        self.assertEqual(len(exercise["tail_events"]), 1)
        self.assertEqual(len(exercise["exposures"]), 1)
        self.assertEqual(len(exercise["survivability_assessments"]), 1)
        self.assertEqual(len(exercise["hedges"]), 1)

    def test_tail_event_with_zero_exposures_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_UNCOVERED_TAIL_EVENT"):
            _valid_exercise(exposures=[], survivability_assessments=[], hedges=[])

    def test_exposure_with_zero_survivability_assessments_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_UNCOVERED_EXPOSURE"):
            _valid_exercise(survivability_assessments=[])

    def test_exposure_referencing_unknown_tail_event_is_refused(self):
        bad_exposures = _exposures() + [{"id": "EXP-999", "tail_event_id": "TE-GHOST", "description": "幽靈曝險"}]
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_EXPOSURE_UNKNOWN_TAIL_EVENT"):
            _valid_exercise(exposures=bad_exposures)

    def test_survivability_assessment_referencing_unknown_exposure_is_refused(self):
        bad_assessments = _survivability_assessments() + [{"id": "SA-999", "exposure_id": "EXP-GHOST", "description": "幽靈評估"}]
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_SURVIVABILITY_ASSESSMENT_UNKNOWN_EXPOSURE"):
            _valid_exercise(survivability_assessments=bad_assessments)

    def test_hedge_referencing_unknown_exposure_is_refused(self):
        bad_hedges = _hedges() + [{"id": "HDG-999", "exposure_id": "EXP-GHOST", "description": "幽靈避險"}]
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_HEDGE_UNKNOWN_EXPOSURE"):
            _valid_exercise(hedges=bad_hedges)

    def test_empty_hedges_is_legal_no_per_exposure_hedge_coverage_is_required(self):
        """Disclosed scope choice: hedges[] carries only referential integrity, not coverage completeness."""
        exercise = _valid_exercise(hedges=[])
        self.assertEqual(exercise["hedges"], [])

    def test_multiple_exposures_may_trace_to_the_same_tail_event(self):
        exposures = _exposures() + [{"id": "EXP-002", "tail_event_id": "TE-001", "description": "第二個曝險面向"}]
        assessments = _survivability_assessments() + [{"id": "SA-002", "exposure_id": "EXP-002", "description": "第二個曝險的存活評估"}]
        exercise = _valid_exercise(exposures=exposures, survivability_assessments=assessments, hedges=[])
        self.assertEqual(len(exercise["exposures"]), 2)

    def test_multiple_survivability_assessments_may_cover_the_same_exposure(self):
        assessments = _survivability_assessments() + [{"id": "SA-002", "exposure_id": "EXP-001", "description": "第二個獨立評估視角"}]
        exercise = _valid_exercise(survivability_assessments=assessments)
        exp001_assessments = [a for a in exercise["survivability_assessments"] if a["exposure_id"] == "EXP-001"]
        self.assertEqual(len(exp001_assessments), 2)


class TailEventShapeTests(unittest.TestCase):
    def test_empty_tail_events_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_EMPTY_TAIL_EVENTS"):
            _valid_exercise(tail_events=[], exposures=[], survivability_assessments=[], hedges=[])

    def test_non_list_tail_events_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_EMPTY_TAIL_EVENTS"):
            _valid_exercise(tail_events="not-a-list")

    def test_duplicate_tail_event_id_is_refused(self):
        bad_events = _tail_events() + [{"id": "TE-001", "description": "重複 id"}]
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_DUPLICATE_TAIL_EVENT_ID"):
            _valid_exercise(tail_events=bad_events)

    def test_empty_description_is_refused(self):
        bad_events = [{"id": "TE-001", "description": "   "}]
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_INVALID_TAIL_EVENT_ENTRY"):
            _valid_exercise(tail_events=bad_events)

    def test_extra_key_is_refused(self):
        bad_events = [{"id": "TE-001", "description": "x", "extra": "y"}]
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_INVALID_TAIL_EVENT_ENTRY"):
            _valid_exercise(tail_events=bad_events)


class ConvenienceConstructorTests(unittest.TestCase):
    def test_tail_event_builds_a_well_formed_entry(self):
        entry = tail_event("TE-010", "描述")
        self.assertEqual(entry, {"id": "TE-010", "description": "描述"})

    def test_tail_event_rejects_empty_description(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_INVALID_TAIL_EVENT"):
            tail_event("TE-010", "")

    def test_exposure_builds_a_well_formed_entry(self):
        entry = exposure("EXP-010", "TE-010", "描述")
        self.assertEqual(entry, {"id": "EXP-010", "tail_event_id": "TE-010", "description": "描述"})

    def test_exposure_rejects_empty_tail_event_id(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_INVALID_EXPOSURE"):
            exposure("EXP-010", "", "描述")

    def test_survivability_assessment_builds_a_well_formed_entry(self):
        entry = survivability_assessment("SA-010", "EXP-010", "描述")
        self.assertEqual(entry, {"id": "SA-010", "exposure_id": "EXP-010", "description": "描述"})

    def test_survivability_assessment_rejects_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_INVALID_SURVIVABILITY_ASSESSMENT"):
            survivability_assessment("", "EXP-010", "描述")

    def test_hedge_builds_a_well_formed_entry(self):
        entry = hedge("HDG-010", "EXP-010", "描述")
        self.assertEqual(entry, {"id": "HDG-010", "exposure_id": "EXP-010", "description": "描述"})

    def test_hedge_rejects_empty_description(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_INVALID_HEDGE"):
            hedge("HDG-010", "EXP-010", "")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_INVALID_ID"):
            _valid_exercise(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_INVALID_ID"):
            _valid_exercise(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_INVALID_VERSION"):
            generate_black_swan_exercise("BSWAN-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BSWAN_INVALID_PROVENANCE"):
            _valid_exercise(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID exercise's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_exercise(self):
        results = evaluate_black_swan_exercise_gates(_valid_exercise(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_integrity_gate_catches_hand_tampered_missing_covering_survivability_assessment(self):
        """The exact scenario the task brief prescribes: a hand-tampered record (bypassing the builder to
        construct an uncovered-exposure dict directly) must be caught by the independent gate, not just the
        builder."""
        record = copy.deepcopy(_valid_exercise())
        record["survivability_assessments"] = [a for a in record["survivability_assessments"] if a["id"] != "SA-001"]
        gate = evaluate_black_swan_chain_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("EXP-001", gate["evidence"][0]["problems"][0])

    def test_integrity_gate_catches_hand_tampered_missing_covering_exposure(self):
        record = copy.deepcopy(_valid_exercise())
        record["exposures"] = []
        record["survivability_assessments"] = []
        record["hedges"] = []
        gate = evaluate_black_swan_chain_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_dangling_tail_event_ref(self):
        record = copy.deepcopy(_valid_exercise())
        record["exposures"][0]["tail_event_id"] = "TE-GHOST"
        gate = evaluate_black_swan_chain_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_dangling_exposure_ref_from_hedge(self):
        record = copy.deepcopy(_valid_exercise())
        record["hedges"][0]["exposure_id"] = "EXP-GHOST"
        gate = evaluate_black_swan_chain_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_unknown_top_level_key_via_schema(self):
        record = copy.deepcopy(_valid_exercise())
        record["extra_field"] = "smuggled"
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        with self.assertRaises(SchemaValidationError):
            contracts.validate(BLACK_SWAN_SCHEMA, record, "record with a smuggled top-level key")

    def test_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_exercise())
        record["id"] = "WRONG-001"
        gate = evaluate_black_swan_chain_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_exercise())
        record["version"] = 1
        gate = evaluate_black_swan_chain_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_duplicate_tail_event_id(self):
        record = copy.deepcopy(_valid_exercise())
        record["tail_events"].append(dict(record["tail_events"][0]))
        gate = evaluate_black_swan_chain_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_fails_closed_on_top_level_junk_never_crashes(self):
        for bad in (None, "not-a-dict", 42, 3.14, True, [], {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_black_swan_chain_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_fails_closed_on_malformed_list_entries_never_crashes(self):
        record = copy.deepcopy(_valid_exercise())
        record["tail_events"] = [None, "not-a-dict", 42, [], True, {"junk": 1}]
        record["exposures"] = [None, 7, {"id": None, "tail_event_id": None, "description": None}]
        record["survivability_assessments"] = [None, {"id": 1, "exposure_id": 2, "description": 3}]
        record["hedges"] = [None, True]
        gate = evaluate_black_swan_chain_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_gate_fails_closed_on_top_level_junk_never_crashes(self):
        for bad in (None, "not-a-dict", 42, [], True):
            with self.subTest(bad=bad):
                gate = evaluate_provenance_required_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_exercise(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_exercise())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    """The builder must not alias the caller's own nested dicts -- post-construction mutation of the caller's
    input must not silently rewrite a gate-passed record. Same discipline every sibling module in this package
    (e.g. epistemic.evidence_matrix's own critic-fixed gap) already establishes."""

    def test_builder_does_not_alias_the_callers_supplied_tail_event_dicts(self):
        events = _tail_events()
        exercise = _valid_exercise(tail_events=events)
        events[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(exercise["tail_events"][0]["description"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_exposure_dicts(self):
        exposures = _exposures()
        exercise = _valid_exercise(exposures=exposures)
        exposures[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(exercise["exposures"][0]["description"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_survivability_assessment_dicts(self):
        assessments = _survivability_assessments()
        exercise = _valid_exercise(survivability_assessments=assessments)
        assessments[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(exercise["survivability_assessments"][0]["description"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_hedge_dicts(self):
        hedges = _hedges()
        exercise = _valid_exercise(hedges=hedges)
        hedges[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(exercise["hedges"][0]["description"], "tampered-after-construction")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_black_swan_exercise_gates_returns_two_gates_in_order(self):
        results = evaluate_black_swan_exercise_gates(_valid_exercise(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "black_swan_chain_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.black_swan_exercise")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        exercise = _valid_exercise()
        self.assertEqual(
            set(exercise.keys()),
            {"id", "version", "generated_by_method", "tail_events", "exposures", "survivability_assessments", "hedges", "provenance"},
        )



class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of this batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_exercise()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_black_swan_exercise(base["id"], base["tail_events"], base["exposures"], base["survivability_assessments"], base["hedges"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
