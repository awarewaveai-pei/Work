"""Mutation-style tests for ``feasibility.real_options`` (F14 feasibility family, Atlas L730).

Atlas L730's own stated purpose ("避免一次性 yes/no") is proven at BOTH
independent layers: the construction-time builder refuses an option with no
trigger_condition or with fewer than 2 distinct future states, and the
gates independently re-derive the same rules directly from a raw (possibly
hand-tampered) record, never trusting that the builder's own check already
ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.feasibility.real_options import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_OPTION_TYPES,
    all_gates_pass,
    evaluate_option_structure_gate,
    evaluate_provenance_required_gate,
    evaluate_real_options_gates,
    evaluate_referential_integrity_gate,
    future_state,
    generate_real_options_analysis,
    option,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

REAL_OPTIONS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/real-options-analysis.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _future_states(**overrides: object) -> list[dict]:
    base = [
        {"id": "FS-HIGH", "description": "海外需求持續成長，擴張後產能被充分利用", "estimated_value": 900000},
        {"id": "FS-FLAT", "description": "海外需求持平，擴張後產能閒置", "estimated_value": -120000},
    ]
    base_override = overrides.get("future_states")
    return base_override if base_override is not None else base


def _option(**overrides: object) -> dict:
    base = {
        "id": "OPT-EXPAND-WAREHOUSE",
        "option_type": "EXPAND",
        "trigger_condition": "首年海外訂單量連續 3 個月超過現有產能 80%",
        "cost": 250000,
        "future_states": _future_states(),
    }
    base.update(overrides)
    return base


def _kwargs(**overrides: object) -> dict:
    base = dict(subject_ref="海外倉儲擴張決策", options=[_option()], provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "ROPT-T-001", **overrides: object):
    return generate_real_options_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(REAL_OPTIONS_SCHEMA, _valid_record(), "real options analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_real_options_analysis, "ROPT-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/feasibility.real_options.contract.yaml")
        self.assertEqual(record["id"], "ROPT-T-INVOKE")

    def test_empty_catalog_blocks_real_options_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(REAL_OPTIONS_SCHEMA, record, "real options analysis with a smuggled top-level key")

    def test_schema_rejects_zero_options(self):
        record = _valid_record()
        record["options"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(REAL_OPTIONS_SCHEMA, record, "real options analysis with zero options")

    def test_schema_rejects_fewer_than_two_future_states(self):
        record = _valid_record()
        record["options"][0]["future_states"] = record["options"][0]["future_states"][:1]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(REAL_OPTIONS_SCHEMA, record, "real options analysis with 1 future state")

    def test_schema_rejects_an_unknown_option_type(self):
        record = _valid_record()
        record["options"][0]["option_type"] = "VIBES"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(REAL_OPTIONS_SCHEMA, record, "real options analysis with an invalid option_type")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "feasibility.real_options.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "feasibility.real_options contract")


class OneShotAvoidanceTests(unittest.TestCase):
    """Atlas L730's own stated purpose: avoid collapsing back into a single-scenario, one-shot yes/no decision."""

    def test_well_formed_option_with_two_distinct_future_states_is_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["options"][0]["future_states"]), 2)

    def test_single_future_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INSUFFICIENT_FUTURE_STATES"):
            _valid_record(options=[_option(future_states=[_future_states()[0]])])

    def test_zero_future_states_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INSUFFICIENT_FUTURE_STATES"):
            _valid_record(options=[_option(future_states=[])])

    def test_two_future_states_with_identical_descriptions_is_refused(self):
        duplicate = [_future_states()[0], {**_future_states()[0], "id": "FS-DUP"}]
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INSUFFICIENT_FUTURE_STATES"):
            _valid_record(options=[_option(future_states=duplicate)])

    def test_two_future_states_differing_only_by_whitespace_and_case_is_refused(self):
        """Normalized (casefolded + whitespace-collapsed) distinctness -- a cosmetic rewording is not a genuinely
        distinct future state."""
        fs = _future_states()[0]
        near_duplicate = {**fs, "id": "FS-DUP", "description": f"  {fs['description'].upper()}  "}
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INSUFFICIENT_FUTURE_STATES"):
            _valid_record(options=[_option(future_states=[fs, near_duplicate])])

    def test_empty_trigger_condition_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_OPTION"):
            _valid_record(options=[_option(trigger_condition="")])

    def test_blank_trigger_condition_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_OPTION"):
            _valid_record(options=[_option(trigger_condition="   ")])


class ShapeAndEnumTests(unittest.TestCase):
    def test_invalid_option_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_OPTION"):
            _valid_record(options=[_option(option_type="VIBES")])

    def test_all_five_option_types_are_accepted(self):
        for option_type in sorted(VALID_OPTION_TYPES):
            with self.subTest(option_type=option_type):
                record = _valid_record(options=[_option(option_type=option_type)])
                self.assertEqual(record["options"][0]["option_type"], option_type)

    def test_bool_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_OPTION"):
            _valid_record(options=[_option(cost=True)])

    def test_non_finite_cost_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_OPTION"):
            _valid_record(options=[_option(cost=float("nan"))])

    def test_future_state_helper_refuses_bool_estimated_value(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_FUTURE_STATE"):
            future_state("FS-1", "desc", True)

    def test_future_state_helper_constructs_a_well_formed_entry(self):
        built = future_state("FS-1", "desc", 100.0)
        self.assertEqual(built, {"id": "FS-1", "description": "desc", "estimated_value": 100.0})

    def test_option_helper_refuses_non_list_future_states(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_OPTION"):
            option("OPT-1", "EXPAND", "trigger", 100.0, "not-a-list")


class ReferentialIntegrityTests(unittest.TestCase):
    def test_zero_options_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_NO_OPTIONS"):
            _valid_record(options=[])

    def test_duplicate_option_ids_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_DUPLICATE_OPTION_ID"):
            _valid_record(options=[_option(), _option()])


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ROPT-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_VERSION"):
            generate_real_options_analysis("ROPT-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})

    def test_blank_subject_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ROPT_INVALID_SUBJECT_REF"):
            _valid_record(subject_ref="   ")

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "feasibility.real_options")

    def test_evaluate_real_options_gates_returns_three_gates_in_order(self):
        results = evaluate_real_options_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "option_structure", "referential_integrity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "subject_ref", "options", "provenance"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. Proves the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_real_options_gates(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_option_structure_gate_catches_hand_tampered_blank_trigger_condition(self):
        record = copy.deepcopy(_valid_record())
        record["options"][0]["trigger_condition"] = "   "
        gate = evaluate_option_structure_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_option_structure_gate_catches_hand_tampered_single_future_state(self):
        record = copy.deepcopy(_valid_record())
        record["options"][0]["future_states"] = record["options"][0]["future_states"][:1]
        gate = evaluate_option_structure_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_option_structure_gate_catches_hand_tampered_duplicate_descriptions(self):
        record = copy.deepcopy(_valid_record())
        record["options"][0]["future_states"][1]["description"] = record["options"][0]["future_states"][0]["description"]
        gate = evaluate_option_structure_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_option_structure_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_option_structure_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_option_structure_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42, True, 3.14, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_option_structure_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_catches_hand_tampered_duplicate_option_ids(self):
        """The exact defect class a critic pass found in 3 of this corpus's own F13 gates: a duplicate-id check
        present in the builder but absent from the gate."""
        record = copy.deepcopy(_valid_record())
        record["options"].append(copy.deepcopy(record["options"][0]))
        gate = evaluate_referential_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_referential_integrity_gate_passes_a_genuinely_well_formed_record(self):
        gate = evaluate_referential_integrity_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_referential_integrity_gate_fails_closed_on_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42, True, 3.14, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_referential_integrity_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad in (None, "not-a-dict", [], 42, True, 3.14, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_real_options_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))

    def test_malformed_option_entry_inside_list_fails_closed_not_a_crash(self):
        record = copy.deepcopy(_valid_record())
        record["options"].append("not-a-dict")
        results = evaluate_real_options_gates(record, "test", "2026-09-12T00:00:00Z")
        self.assertFalse(all_gates_pass(results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ContainerAliasingTests(unittest.TestCase):
    """Every options[]/future_states[] entry is rebuilt fresh (never a shallow reference to the caller's own
    dict) -- mutating the caller's own original list/dict after the call must not affect the returned record."""

    def test_mutating_the_callers_options_list_after_the_call_does_not_affect_the_returned_record(self):
        caller_options = [_option()]
        record = _valid_record(options=caller_options)
        caller_options.append(_option(id="OPT-EXTRA"))
        self.assertEqual(len(record["options"]), 1, "returned record must not alias the caller's own mutable options list")

    def test_mutating_the_returned_option_dict_does_not_affect_the_caller(self):
        caller_option = _option()
        record = _valid_record(options=[caller_option])
        record["options"][0]["cost"] = 999999999
        self.assertEqual(caller_option["cost"], 250000, "mutating the returned record's option must not affect the caller's own original dict")


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Guards the corpus-wide defect class (11 of 14 F13 builders returned provenance by reference) --
    ``provenance`` must be ``copy.deepcopy``d at the return statement."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_real_options_analysis("ROPT-T-003", "測試", [_option()], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
