"""Mutation-style tests for ``challenge.disconfirming_evidence`` (F12 challenge/red-team/risk family, 7th built
member).

THE real invariant (cross-array referential integrity: every ``search_results[].falsifier_criteria_id`` must
reference a declared ``falsifier_criteria[].id`` -- Atlas L649's own Popperian 'belief→falsifier→search' order,
making post-hoc rationalization structurally impossible) plus the second real invariant supporting evidence
labeling (``found:true`` requires a non-empty ``evidence_description``), exercised at BOTH layers: construction-
time refusal (``generate_disconfirming_evidence_search`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_disconfirming_evidence_content_integrity_gate`` catching a
hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself). Schema conformance
is checked against the real spec-root schema this same slice added
(``typed-objects/disconfirming-evidence-search.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.challenge.disconfirming_evidence import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_disconfirming_evidence_content_integrity_gate,
    evaluate_disconfirming_evidence_gates,
    evaluate_provenance_required_gate,
    falsifier_criterion,
    generate_disconfirming_evidence_search,
    search_result,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

DISCONFIRMING_EVIDENCE_SEARCH_SCHEMA = "ai-lego://specs/cognitive/typed-objects/disconfirming-evidence-search.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")


def _current_belief() -> str:
    return "新版 onboarding 流程降低了註冊流失率"


def _falsifier_criteria() -> list[dict]:
    return [
        {"id": "F1", "description": "若 A/B 測試顯示新流程的流失率不低於舊流程（信賴區間重疊），則此信念被推翻"},
        {"id": "F2", "description": "若流失率下降完全由同期行銷活動導致（去除該變因後差異消失），則此信念被推翻"},
    ]


def _search_results() -> list[dict]:
    return [
        {"falsifier_criteria_id": "F1", "found": False},
        {"falsifier_criteria_id": "F2", "found": True, "evidence_description": "移除同期行銷活動的流量後重新計算，流失率下降幅度從 12% 縮減到 2%"},
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        current_belief=_current_belief(),
        falsifier_criteria=_falsifier_criteria(),
        search_results=_search_results(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_search(*, record_id: str = "DISCONF-T-001", **overrides: object):
    return generate_disconfirming_evidence_search(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_search_validates_against_the_real_schema(self):
        self.contracts.validate(DISCONFIRMING_EVIDENCE_SEARCH_SCHEMA, _valid_search(), "disconfirming evidence search")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, search = live.invoke(METHOD_ID, generate_disconfirming_evidence_search, "DISCONF-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/challenge.disconfirming_evidence.contract.yaml")
        self.assertEqual(search["id"], "DISCONF-T-INVOKE")

    def test_empty_catalog_blocks_disconfirming_evidence_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_search())
        tampered["falsifier_criteria"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DISCONFIRMING_EVIDENCE_SEARCH_SCHEMA, tampered, "tampered search")
        gate = evaluate_disconfirming_evidence_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        search = _valid_search()
        search["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DISCONFIRMING_EVIDENCE_SEARCH_SCHEMA, search, "search with a smuggled top-level key")

    def test_schema_rejects_missing_current_belief(self):
        search = _valid_search()
        del search["current_belief"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DISCONFIRMING_EVIDENCE_SEARCH_SCHEMA, search, "search with current_belief removed")

    def test_schema_rejects_found_true_with_missing_evidence_description(self):
        """The schema's own if/then (not just the runtime invariant) refuses this -- defense in depth for the
        ONE invariant in this record that JSON Schema 2020-12 CAN express declaratively (single-item, not
        cross-array)."""
        search = _valid_search()
        search["search_results"] = [{"falsifier_criteria_id": "F1", "found": True}]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DISCONFIRMING_EVIDENCE_SEARCH_SCHEMA, search, "search with an unevidenced found:true result")

    def test_schema_accepts_found_false_with_no_evidence_description(self):
        search = _valid_search()
        search["search_results"] = [{"falsifier_criteria_id": "F1", "found": False}]
        self.contracts.validate(DISCONFIRMING_EVIDENCE_SEARCH_SCHEMA, search, "search with a found:false result and no evidence_description")

    def test_id_is_distinct_from_a_sibling_f12_machine_id(self):
        self.assertEqual(METHOD_ID, "challenge.disconfirming_evidence")
        self.assertNotEqual(METHOD_ID, "challenge.red_team")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "challenge.disconfirming_evidence.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "challenge.disconfirming_evidence contract")


class FalsifierCriteriaOrderTests(unittest.TestCase):
    """THE real invariant (module docstring): falsifier_criteria must be declared BEFORE search_results can
    reference them -- Popperian order, mechanized as cross-array referential integrity."""

    def test_well_formed_search_is_accepted(self):
        search = _valid_search()
        self.assertEqual(len(search["falsifier_criteria"]), 2)
        self.assertEqual(len(search["search_results"]), 2)

    def test_empty_falsifier_criteria_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_NO_FALSIFIERS"):
            _valid_search(falsifier_criteria=[], search_results=[])

    def test_non_list_falsifier_criteria_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_NO_FALSIFIERS"):
            _valid_search(falsifier_criteria="not-a-list")

    def test_falsifier_missing_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_INVALID_FALSIFIER"):
            _valid_search(falsifier_criteria=[{"id": "F1", "description": ""}], search_results=[])

    def test_falsifier_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_INVALID_FALSIFIER"):
            _valid_search(falsifier_criteria=[{"id": "F1", "description": "x", "extra": "y"}], search_results=[])

    def test_duplicate_falsifier_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_DUPLICATE_FALSIFIER_ID"):
            _valid_search(falsifier_criteria=[{"id": "F1", "description": "a"}, {"id": "F1", "description": "b"}], search_results=[])


class SearchResultsReferentialIntegrityTests(unittest.TestCase):
    """THE real invariant, exercised directly: a search_results entry referencing an undeclared falsifier is
    refused before any record is constructed."""

    def test_search_result_referencing_unknown_falsifier_is_refused(self):
        bad_results = [*_search_results(), {"falsifier_criteria_id": "F99-NEVER-DECLARED", "found": True, "evidence_description": "x"}]
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_SEARCH_RESULT_UNKNOWN_FALSIFIER"):
            _valid_search(search_results=bad_results)

    def test_empty_search_results_is_accepted(self):
        """MAY legitimately be empty -- no search performed yet is not itself an error."""
        search = _valid_search(search_results=[])
        self.assertEqual(search["search_results"], [])

    def test_all_found_false_search_results_is_accepted(self):
        """MAY legitimately be all found:false -- the belief surviving a genuine search is a real, useful,
        non-error result, not a failure of the method."""
        search = _valid_search(search_results=[{"falsifier_criteria_id": "F1", "found": False}, {"falsifier_criteria_id": "F2", "found": False}])
        self.assertTrue(all(not r["found"] for r in search["search_results"]))

    def test_found_true_with_empty_evidence_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_MISSING_EVIDENCE_DESCRIPTION"):
            _valid_search(search_results=[{"falsifier_criteria_id": "F1", "found": True, "evidence_description": "   "}])

    def test_found_true_with_missing_evidence_description_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_MISSING_EVIDENCE_DESCRIPTION"):
            _valid_search(search_results=[{"falsifier_criteria_id": "F1", "found": True}])

    def test_found_false_with_no_evidence_description_is_accepted(self):
        search = _valid_search(search_results=[{"falsifier_criteria_id": "F1", "found": False}])
        self.assertEqual(search["search_results"], [{"falsifier_criteria_id": "F1", "found": False}])

    def test_non_bool_found_is_refused(self):
        """found must be a genuine bool -- an int/string masquerading as a truthy value is refused, not
        silently coerced."""
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_INVALID_SEARCH_RESULT"):
            _valid_search(search_results=[{"falsifier_criteria_id": "F1", "found": 1}])

    def test_non_list_search_results_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_INVALID_SEARCH_RESULTS"):
            _valid_search(search_results="not-a-list")

    def test_search_result_missing_falsifier_criteria_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_INVALID_SEARCH_RESULT"):
            _valid_search(search_results=[{"found": False}])

    def test_search_result_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_INVALID_SEARCH_RESULT"):
            _valid_search(search_results=[{"falsifier_criteria_id": "F1", "found": False, "smuggled": "x"}])


class BeliefTests(unittest.TestCase):
    def test_empty_current_belief_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_EMPTY_BELIEF"):
            _valid_search(current_belief="   ")

    def test_none_current_belief_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_EMPTY_BELIEF"):
            _valid_search(current_belief=None)

    def test_well_formed_current_belief_is_accepted(self):
        search = _valid_search(current_belief="測試信念")
        self.assertEqual(search["current_belief"], "測試信念")

    def test_belief_checked_before_falsifier_criteria(self):
        """Ordering proof: an empty belief is refused even when falsifier_criteria is ALSO empty -- the belief
        error surfaces first."""
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_EMPTY_BELIEF"):
            _valid_search(current_belief="   ", falsifier_criteria=[], search_results=[])


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "DISCONF-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_INVALID_ID"):
            _valid_search(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_INVALID_ID"):
            _valid_search(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_INVALID_VERSION"):
            generate_disconfirming_evidence_search("DISCONF-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DISCONF_INVALID_PROVENANCE"):
            _valid_search(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID search's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_search(self):
        results = evaluate_disconfirming_evidence_gates(_valid_search(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_dangling_falsifier_reference(self):
        """The critical hand-tamper case the CLI slice also demonstrates: a search_results entry spliced
        directly into a raw dict, bypassing the builder, referencing a falsifier that does not exist."""
        record = copy.deepcopy(_valid_search())
        record["search_results"].append({"falsifier_criteria_id": "F99-SPLICED", "found": True, "evidence_description": "繞過 builder"})
        gate = evaluate_disconfirming_evidence_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_deleted_falsifier_still_referenced(self):
        """A falsifier_criteria entry deleted out from under an EXISTING search_results reference must also be
        caught -- not only a newly-spliced dangling entry."""
        record = copy.deepcopy(_valid_search())
        record["falsifier_criteria"] = [c for c in record["falsifier_criteria"] if c["id"] != "F2"]
        gate = evaluate_disconfirming_evidence_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_missing_evidence_description(self):
        record = copy.deepcopy(_valid_search())
        del record["search_results"][1]["evidence_description"]
        gate = evaluate_disconfirming_evidence_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_search())
        record["extra_field"] = "smuggled"
        gate = evaluate_disconfirming_evidence_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_search())
        del record["current_belief"]
        gate = evaluate_disconfirming_evidence_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_disconfirming_evidence_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_search())
        record["id"] = "WRONG-001"
        gate = evaluate_disconfirming_evidence_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_search())
        record["version"] = 1
        gate = evaluate_disconfirming_evidence_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_empty_falsifier_criteria(self):
        record = copy.deepcopy(_valid_search())
        record["falsifier_criteria"] = []
        record["search_results"] = []
        gate = evaluate_disconfirming_evidence_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_search(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_search())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    """Same aliasing discipline stakeholders.game_theory's own builder fix (2026-09-11 critic pass) already
    established for this corpus: the builder must rebuild each nested dict, not just shallow-copy the outer
    list, or a caller-side post-construction mutation would silently rewrite a gate-passed record."""

    def test_builder_does_not_alias_the_callers_supplied_falsifier_dicts(self):
        falsifiers = _falsifier_criteria()
        search = _valid_search(falsifier_criteria=falsifiers)
        falsifiers[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(search["falsifier_criteria"][0]["description"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_search_result_dicts(self):
        results = _search_results()
        search = _valid_search(search_results=results)
        results[0]["found"] = True
        self.assertNotEqual(search["search_results"][0]["found"], True)


class HelperFunctionTests(unittest.TestCase):
    def test_falsifier_criterion_shape(self):
        self.assertEqual(falsifier_criterion("F1", "desc"), {"id": "F1", "description": "desc"})

    def test_search_result_shape_without_evidence_description(self):
        self.assertEqual(search_result("F1", False), {"falsifier_criteria_id": "F1", "found": False})

    def test_search_result_shape_with_evidence_description(self):
        self.assertEqual(
            search_result("F1", True, evidence_description="x"),
            {"falsifier_criteria_id": "F1", "found": True, "evidence_description": "x"},
        )

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_disconfirming_evidence_gates_returns_two_gates_in_order(self):
        results = evaluate_disconfirming_evidence_gates(_valid_search(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "disconfirming_evidence_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "challenge.disconfirming_evidence")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        search = _valid_search()
        self.assertEqual(
            set(search.keys()),
            {"id", "version", "generated_by_method", "current_belief", "falsifier_criteria", "search_results", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
