"""Mutation-style tests for ``devops_sre.game_day`` (thirty-fourth Method Atlas slice, ninth from the
`devops_sre` family). Atlas's own 5-phase formula (scenario->roles->inject->recover->AAR) is proven at BOTH
independent layers -- construction-time and gate re-derivation, the gate RECOMPUTING every precondition fresh
rather than trusting stored values.

Every gate-layer test below tampers ONE specific field and pins the SPECIFIC evidence reason, so that a
mutation disabling one predicate is caught by a test naming that predicate -- including one dedicated test
per scalar identity field (id / scenario / injected_failure), the lesson `devops_sre.runbook_execution`'s own
critic round taught when its `runbook_ref` re-validation turned out to be untested independently of `id`."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.devops_sre.game_day import (
    METHOD_ID,
    all_gates_pass,
    evaluate_game_day_gates,
    evaluate_game_day_integrity_gate,
    evaluate_provenance_required_gate,
    generate_game_day_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/game-day-record.schema.yaml"
TS = "2026-09-05T00:00:00Z"


def _prov():
    return make_provenance("AI_INFERENCE", "AI_GENERATED")


def _role(role, assignee):
    return {"role": role, "assignee": assignee}


def _roles():
    return [_role("Incident Commander", "alice"), _role("Communications Lead", "bob"), _role("Database Operator", "carol")]


def _recovered(minutes=23, ref="RBEXEC-2026-09-05-002"):
    recovery = {"outcome": "recovered", "time_to_recover_minutes": minutes}
    if ref is not None:
        recovery["runbook_execution_ref"] = ref
    return recovery


def _not_recovered():
    return {"outcome": "not_recovered"}


def _aar():
    return {
        "expected": "replica promoted and traffic repointed within 15 minutes",
        "actual": "repoint took until T+23 because the secret rotation step was undocumented",
        "why": "step 3 of the runbook assumed the connection secret was already rotated",
        "next": "add an explicit secret-rotation precondition to step 3",
    }


def _build(record_id="GAMEDAY-T-001", scenario="primary database loses its data volume", roles=None, injected="detached the primary's data volume", recovery=None, aar=None):
    return generate_game_day_record(
        record_id,
        scenario,
        _roles() if roles is None else roles,
        injected,
        _recovered() if recovery is None else recovery,
        _aar() if aar is None else aar,
        _prov(),
    )


def _valid_record():
    return _build()


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_recovered_record_with_runbook_link_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "recovered game day record")

    def test_recovered_record_without_runbook_link_validates(self):
        self.contracts.validate(RECORD_SCHEMA, _build(record_id="GAMEDAY-T-002", recovery=_recovered(ref=None)), "recovered, no runbook link")

    def test_not_recovered_record_validates(self):
        self.contracts.validate(RECORD_SCHEMA, _build(record_id="GAMEDAY-T-003", recovery=_not_recovered()), "not-recovered game day record")

    def test_schema_layer_itself_rejects_time_on_a_not_recovered_record(self):
        """Defense-in-depth: the schema's own if/then/else block must reject the coupling violation even if a
        record bypassed the builder entirely (the same class of check backup-restore-drill-record's own
        dependentRequired block provides). Pinned to the field name so an unrelated validation failure
        (missing schema, $ref error) cannot keep this green -- a critic-caught weak-oracle Suggestion."""
        record = _build(record_id="GAMEDAY-T-003B", recovery=_not_recovered())
        record["recovery"]["time_to_recover_minutes"] = 5
        with self.assertRaisesRegex(Exception, "time_to_recover_minutes"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema-layer coupling violation")

    def test_schema_layer_itself_rejects_a_recovered_record_missing_time(self):
        record = _valid_record()
        del record["recovery"]["time_to_recover_minutes"]
        with self.assertRaisesRegex(Exception, "time_to_recover_minutes"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema-layer missing-time violation")

    def test_schema_layer_itself_rejects_a_whitespace_only_scenario(self):
        """Regression for a critic-caught Minor: the schema's `pattern: \\S` lines were advertised as a
        carried-forward lesson but nothing pinned them -- weakening every `\\S` to `.` survived the suite."""
        record = _valid_record()
        record["scenario"] = "   "
        with self.assertRaisesRegex(Exception, "scenario"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema-layer whitespace-only scenario")

    def test_schema_layer_itself_rejects_an_extra_key_inside_recovery(self):
        """Regression for the same critic-caught Minor: `additionalProperties: false` on the nested objects
        was unproven -- flipping it to true on role/recovery/aar survived the suite."""
        record = _valid_record()
        record["recovery"]["approved_by"] = "nobody"
        with self.assertRaisesRegex(Exception, "approved_by"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema-layer extra key in recovery")

    def test_schema_layer_itself_rejects_an_id_without_the_gameday_prefix(self):
        """The runtime layer deliberately does NOT enforce this record's own id prefix (family-wide
        convention, disclosed in the contract's compilation_decisions) -- so the schema is the only defense
        and must be pinned."""
        record = _valid_record()
        record["id"] = "DRILL-999"
        with self.assertRaisesRegex(Exception, "GAMEDAY-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema-layer id prefix")

    def test_builder_round_trips_generated_by_method_and_version(self):
        """Regression for a critic-caught Minor: hardcoding generated_by_method (ignoring the parameter
        MethodCatalog.invoke provenance-chains on) survived the suite."""
        record = generate_game_day_record("GAMEDAY-T-004", "s", _roles(), "i", _recovered(), _aar(), _prov(), version="2.3.4", generated_by_method="devops_sre.game_day@test")
        self.assertEqual(record["generated_by_method"], "devops_sre.game_day@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    # --- scalar fields ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_EMPTY_RECORD_FIELD"):
            _build(record_id="")

    def test_whitespace_only_scenario_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_EMPTY_RECORD_FIELD"):
            _build(scenario="   ")

    def test_empty_injected_failure_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_EMPTY_RECORD_FIELD"):
            _build(injected="")

    def test_non_string_scenario_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_EMPTY_RECORD_FIELD"):
            _build(scenario=42)

    # --- roles ---
    def test_zero_roles_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_NO_ROLES"):
            _build(roles=[])

    def test_roles_not_a_list_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_NO_ROLES"):
            _build(roles="Incident Commander")

    def test_role_with_extra_field_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_ROLE"):
            _build(roles=[dict(_role("Incident Commander", "alice"), pager="123")])

    def test_role_missing_assignee_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_ROLE"):
            _build(roles=[{"role": "Incident Commander"}])

    def test_role_with_empty_assignee_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_ROLE"):
            _build(roles=[_role("Incident Commander", " ")])

    def test_non_dict_role_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_ROLE"):
            _build(roles=["Incident Commander"])

    def test_exact_duplicate_role_name_is_refused(self):
        """The core roles invariant: two entries holding the same role."""
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_DUPLICATE_ROLE"):
            _build(roles=[_role("Incident Commander", "alice"), _role("Incident Commander", "bob")])

    def test_duplicate_role_name_differing_only_by_case_and_whitespace_is_refused(self):
        """The normalization is load-bearing: 'Incident Commander' vs 'incident  commander' must be caught. A
        mutation replacing _normalize_role_name with the identity function survives every other test."""
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_DUPLICATE_ROLE"):
            _build(roles=[_role("Incident Commander", "alice"), _role(" incident  commander ", "bob")])

    def test_same_assignee_holding_two_distinct_roles_is_accepted(self):
        """DELIBERATELY NOT ENFORCED: assignee uniqueness (see contract compilation_decisions)."""
        record = _build(roles=[_role("Operations", "alice"), _role("Communications", "alice")])
        self.assertEqual([r["assignee"] for r in record["roles"]], ["alice", "alice"])

    def test_single_role_is_accepted(self):
        record = _build(roles=[_role("Incident Commander", "alice")])
        self.assertEqual(len(record["roles"]), 1)

    # --- recovery ---
    def test_recovered_without_time_is_refused(self):
        """The core recover invariant, direction 1: recovered REQUIRES a duration."""
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_RECOVERY_TIME_MISMATCH"):
            _build(recovery={"outcome": "recovered"})

    def test_not_recovered_with_time_is_refused(self):
        """The core recover invariant, direction 2: not_recovered FORBIDS a duration -- a failed exercise
        must not carry a number that reads as 'recovered in N minutes'."""
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_RECOVERY_TIME_MISMATCH"):
            _build(recovery={"outcome": "not_recovered", "time_to_recover_minutes": 12})

    def test_recovered_with_bool_time_is_refused(self):
        """bool is a subclass of int in Python -- True must be rejected as a duration, not coerced to 1."""
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_RECOVERY_TIME_MISMATCH"):
            _build(recovery=_recovered(minutes=True))

    def test_recovered_with_negative_time_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_RECOVERY_TIME_MISMATCH"):
            _build(recovery=_recovered(minutes=-1))

    def test_recovered_with_float_time_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_RECOVERY_TIME_MISMATCH"):
            _build(recovery=_recovered(minutes=2.5))

    def test_recovered_with_zero_time_is_accepted(self):
        record = _build(recovery=_recovered(minutes=0))
        self.assertEqual(record["recovery"]["time_to_recover_minutes"], 0)

    def test_invalid_outcome_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_RECOVERY"):
            _build(recovery={"outcome": "partially_recovered", "time_to_recover_minutes": 5})

    def test_recovery_with_unknown_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_RECOVERY"):
            _build(recovery=dict(_recovered(), signed_off_by="nobody"))

    def test_recovery_missing_outcome_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_RECOVERY"):
            _build(recovery={"time_to_recover_minutes": 5})

    def test_recovery_not_a_dict_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_RECOVERY"):
            _build(recovery="recovered")

    def test_runbook_ref_with_wrong_prefix_is_refused(self):
        """The core soft-link invariant: a ref naming some OTHER typed object (here a DRILL- id) is refused."""
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_RECOVERY"):
            _build(recovery=_recovered(ref="DRILL-2026-09-05-001"))

    def test_runbook_ref_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_RECOVERY"):
            _build(recovery=_recovered(ref=""))

    def test_runbook_ref_present_but_null_is_refused_not_treated_as_absent(self):
        recovery = _recovered(ref=None)
        recovery["runbook_execution_ref"] = None
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_RECOVERY"):
            _build(recovery=recovery)

    def test_runbook_ref_on_a_not_recovered_exercise_is_accepted(self):
        """A runbook may have been exercised and still not recovered -- the link is about what was
        exercised, not about success."""
        record = _build(recovery={"outcome": "not_recovered", "runbook_execution_ref": "RBEXEC-2026-09-05-002"})
        self.assertEqual(record["recovery"]["runbook_execution_ref"], "RBEXEC-2026-09-05-002")

    # --- aar ---
    def test_aar_missing_next_is_refused(self):
        aar = _aar()
        del aar["next"]
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_AAR"):
            _build(aar=aar)

    def test_aar_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_AAR"):
            _build(aar=dict(_aar(), blame="nobody"))

    def test_aar_with_whitespace_only_why_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_AAR"):
            _build(aar=dict(_aar(), why="  "))

    def test_aar_with_non_string_expected_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_AAR"):
            _build(aar=dict(_aar(), expected=["a", "b"]))

    def test_aar_not_a_dict_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMEDAY_INVALID_AAR"):
            _build(aar=["expected", "actual", "why", "next"])

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        caller_roles = _roles()
        caller_recovery = _recovered()
        caller_aar = _aar()
        record = generate_game_day_record("GAMEDAY-T-010", "s", caller_roles, "i", caller_recovery, caller_aar, _prov())
        caller_roles[0]["role"] = "Communications Lead"
        caller_recovery["outcome"] = "not_recovered"
        caller_aar["next"] = ""
        self.assertEqual(record["roles"][0]["role"], "Incident Commander")
        self.assertEqual(record["recovery"]["outcome"], "recovered")
        self.assertTrue(record["aar"]["next"])

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_game_day_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_game_day_integrity_gate(record, "test", TS)

    def test_valid_recovered_record_passes_both_gates(self):
        results = evaluate_game_day_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "game_day_integrity"})
        self.assertTrue(all_gates_pass(results))
        integrity = next(r for r in results if r["gate_id"] == "game_day_integrity")
        self.assertEqual(integrity["evidence"][0], {"roles_recorded": 3, "outcome": "recovered", "runbook_execution_ref": "RBEXEC-2026-09-05-002"})

    def test_valid_not_recovered_record_passes_both_gates(self):
        record = _build(record_id="GAMEDAY-T-020", recovery=_not_recovered())
        self.assertTrue(all_gates_pass(evaluate_game_day_gates(record, "test", TS)))

    def test_hand_tampered_time_smuggled_onto_a_not_recovered_record_fails_the_gate_via_recomputation(self):
        """The headline gate-layer regression: a failed exercise hand-edited to carry a recovery duration
        (every other field untouched) must be caught by the gate's own independent re-derivation."""
        record = _build(record_id="GAMEDAY-T-021", recovery=_not_recovered())
        record["recovery"]["time_to_recover_minutes"] = 12
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery time_to_recover_minutes inconsistent with outcome")
        self.assertEqual(gate["evidence"][0]["outcome"], "not_recovered")
        self.assertTrue(gate["evidence"][0]["time_present"])

    def test_hand_tampered_time_removed_from_a_recovered_record_fails_the_gate(self):
        record = _valid_record()
        del record["recovery"]["time_to_recover_minutes"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery time_to_recover_minutes inconsistent with outcome")
        self.assertFalse(gate["evidence"][0]["time_present"])

    def test_hand_tampered_time_replaced_by_bool_on_a_recovered_record_fails_the_gate(self):
        record = _valid_record()
        record["recovery"]["time_to_recover_minutes"] = True
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery time_to_recover_minutes inconsistent with outcome")

    def test_hand_tampered_case_variant_duplicate_role_fails_the_gate(self):
        """Gate-layer companion to the builder's own normalization test: the appended duplicate differs only
        by case and whitespace, so only a real normalized comparison inside the gate catches it."""
        record = _valid_record()
        record["roles"].append(_role("incident  commander", "dave"))
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "duplicate role name")
        self.assertEqual(gate["evidence"][0]["duplicate_role_names"], ["incident commander"])

    def test_hand_tampered_two_different_duplicate_roles_are_reported_sorted(self):
        """Regression for a critic-caught Minor: `_duplicate_role_names` returns `sorted(duplicates)`, but no
        test supplied TWO different duplicated names, so replacing the sort with `list(set)` survived the
        whole suite -- the same untested-sort class devops_sre.runbook_execution's own critic round caught.
        Gate evidence is machine-consumed; its ordering must be deterministic and proven."""
        record = _build(record_id="GAMEDAY-T-030")
        record["roles"].append(_role("incident  commander", "c"))
        record["roles"].insert(0, _role("COMMUNICATIONS LEAD", "d"))
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["duplicate_role_names"], ["communications lead", "incident commander"])

    def test_hand_tampered_extra_field_on_a_role_fails_the_gate(self):
        record = _valid_record()
        record["roles"][0]["pager"] = "123"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more roles is invalid (unknown/missing keys, or empty role/assignee)")
        self.assertEqual(gate["evidence"][0]["invalid_count"], 1)

    def test_hand_tampered_empty_assignee_fails_the_gate(self):
        record = _valid_record()
        record["roles"][1]["assignee"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "one or more roles is invalid (unknown/missing keys, or empty role/assignee)")

    def test_hand_tampered_empty_roles_fails_the_gate(self):
        record = _valid_record()
        record["roles"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "roles missing, not a list, or empty")

    # one dedicated test PER scalar field -- the runbook_execution lesson
    def test_hand_tampered_empty_record_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id/scenario/injected_failure missing or empty")

    def test_hand_tampered_empty_scenario_fails_the_gate(self):
        record = _valid_record()
        record["scenario"] = "   "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id/scenario/injected_failure missing or empty")

    def test_hand_tampered_empty_injected_failure_fails_the_gate(self):
        record = _valid_record()
        record["injected_failure"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id/scenario/injected_failure missing or empty")

    def test_hand_tampered_runbook_ref_prefix_broken_fails_the_gate(self):
        record = _valid_record()
        record["recovery"]["runbook_execution_ref"] = "DRILL-2026-09-05-001"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery invalid (unknown/missing keys, bad outcome, or malformed runbook_execution_ref)")

    def test_hand_tampered_bogus_outcome_fails_the_gate(self):
        record = _valid_record()
        record["recovery"]["outcome"] = "mostly_recovered"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery invalid (unknown/missing keys, bad outcome, or malformed runbook_execution_ref)")

    def test_hand_tampered_extra_key_on_recovery_fails_the_gate(self):
        record = _valid_record()
        record["recovery"]["approved_by"] = "nobody"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery invalid (unknown/missing keys, bad outcome, or malformed runbook_execution_ref)")

    def test_hand_tampered_recovery_replaced_by_string_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["recovery"] = "recovered"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "recovery invalid (unknown/missing keys, bad outcome, or malformed runbook_execution_ref)")

    def test_hand_tampered_blank_aar_next_fails_the_gate(self):
        record = _valid_record()
        record["aar"]["next"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "aar invalid (unknown/missing keys, or an unanswered question)")

    def test_hand_tampered_aar_missing_why_fails_the_gate(self):
        record = _valid_record()
        del record["aar"]["why"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "aar invalid (unknown/missing keys, or an unanswered question)")

    def test_hand_tampered_aar_replaced_by_list_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["aar"] = ["expected", "actual", "why", "next"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "aar invalid (unknown/missing keys, or an unanswered question)")

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
        before = copy.deepcopy(record)
        self._gate(record)
        self.assertEqual(record, before)

    def test_non_dict_record_fails_the_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
