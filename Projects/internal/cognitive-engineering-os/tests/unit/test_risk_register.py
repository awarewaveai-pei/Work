"""Mutation-style tests for ``delivery.risk_register`` (F22 PM/delivery/governance family, Atlas L926).

Atlas's own "probability/impact/exposure/owner/control/trigger" pipeline is proven at BOTH independent layers:
the construction-time builder (a) computes exposure itself -- the per-risk builder accepts no ``exposure``
parameter, so a caller cannot even attempt a mismatched value through the normal path -- and (b) refuses any
risk missing owner/control/trigger or carrying a duplicate risk_id; the independent gates re-derive the same
rules directly from a raw (possibly hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.delivery.risk_register import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_exposure_derivation_gate,
    evaluate_provenance_required_gate,
    evaluate_risk_register_gates,
    evaluate_trackability_gate,
    generate_risk_register,
    risk_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RISK_REGISTER_SCHEMA = "ai-lego://specs/cognitive/typed-objects/risk-register-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        risks=[
            {"risk_id": "R1", "description": "關鍵供應商延遲交貨", "probability": 0.2, "impact": 0.5, "owner": "採購經理", "control": "備援供應商已簽約", "trigger": "供應商未於交期前 3 天回覆"},
            {"risk_id": "R2", "description": "核心工程師離職", "probability": 0.3, "impact": 0.9, "owner": "工程總監", "control": "關鍵知識已文件化", "trigger": "遞出辭呈"},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_register(*, record_id: str = "RREG-T-001", **overrides: object):
    return generate_risk_register(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_register_validates_against_the_real_schema(self):
        self.contracts.validate(RISK_REGISTER_SCHEMA, _valid_register(), "risk register")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, register = live.invoke(METHOD_ID, generate_risk_register, "RREG-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/delivery.risk_register.contract.yaml")
        self.assertEqual(register["id"], "RREG-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        register = _valid_register()
        register["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RISK_REGISTER_SCHEMA, register, "register with a smuggled top-level key")

    def test_schema_rejects_probability_out_of_range(self):
        register = _valid_register()
        register["risks"][0]["probability"] = 1.5
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RISK_REGISTER_SCHEMA, register, "register with out-of-range probability")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "delivery.risk_register.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "delivery.risk_register contract")


class EmptyRisksTests(unittest.TestCase):
    def test_zero_risks_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RISKREG_EMPTY_RISKS"):
            generate_risk_register("RREG-T-002", risks=[], provenance=PROVENANCE)


class ExposureDerivationTests(unittest.TestCase):
    """Atlas L926's own 'exposure' pipeline stage -- mechanically derived, never asserted."""

    def test_risk_entry_computes_exposure_itself(self):
        entry = risk_entry("R1", "d", 0.4, 0.5, "owner", "control", "trigger")
        self.assertEqual(entry["exposure"], 0.2)

    def test_risk_entry_accepts_no_exposure_parameter(self):
        import inspect

        params = inspect.signature(risk_entry).parameters
        self.assertNotIn("exposure", params)

    def test_generate_risk_register_recomputes_exposure_discarding_any_caller_supplied_value(self):
        kwargs = _kwargs()
        kwargs["risks"][0]["exposure"] = 0.9999  # a raw dict smuggling a bogus exposure key
        register = generate_risk_register("RREG-T-003", **kwargs)
        self.assertEqual(register["risks"][0]["exposure"], kwargs["risks"][0]["probability"] * kwargs["risks"][0]["impact"])

    def test_invalid_probability_is_refused(self):
        kwargs = _kwargs()
        kwargs["risks"][0]["probability"] = 1.5
        with self.assertRaisesRegex(InvariantViolation, "RISKREG_INVALID_RISK"):
            generate_risk_register("RREG-T-004", **kwargs)

    def test_boolean_probability_is_refused_not_silently_coerced(self):
        kwargs = _kwargs()
        kwargs["risks"][0]["probability"] = True
        with self.assertRaisesRegex(InvariantViolation, "RISKREG_INVALID_RISK"):
            generate_risk_register("RREG-T-005", **kwargs)


class TrackabilityTests(unittest.TestCase):
    def test_empty_owner_is_refused(self):
        kwargs = _kwargs()
        kwargs["risks"][0]["owner"] = ""
        with self.assertRaisesRegex(InvariantViolation, "RISKREG_INVALID_RISK"):
            generate_risk_register("RREG-T-006", **kwargs)

    def test_empty_control_is_refused(self):
        kwargs = _kwargs()
        kwargs["risks"][0]["control"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "RISKREG_INVALID_RISK"):
            generate_risk_register("RREG-T-007", **kwargs)

    def test_empty_trigger_is_refused(self):
        kwargs = _kwargs()
        kwargs["risks"][0]["trigger"] = ""
        with self.assertRaisesRegex(InvariantViolation, "RISKREG_INVALID_RISK"):
            generate_risk_register("RREG-T-008", **kwargs)


class DuplicateRiskIdTests(unittest.TestCase):
    def test_duplicate_risk_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["risks"].append(dict(kwargs["risks"][0]))
        with self.assertRaisesRegex(InvariantViolation, "RISKREG_DUPLICATE_RISK_ID"):
            generate_risk_register("RREG-T-009", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        register = generate_risk_register("RREG-T-010", **kwargs)
        kwargs["risks"][0]["probability"] = 0.99
        self.assertEqual(register["risks"][0]["probability"], 0.2)
        self.assertIsNot(register["risks"], kwargs["risks"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_register(self):
        results = evaluate_risk_register_gates(_valid_register(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_exposure_derivation_gate_catches_hand_tampered_mismatched_exposure(self):
        record = copy.deepcopy(_valid_register())
        record["risks"][0]["exposure"] = 0.9999
        gate = evaluate_exposure_derivation_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_exposure_derivation_gate_passes_a_genuinely_derived_register(self):
        gate = evaluate_exposure_derivation_gate(_valid_register(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_trackability_gate_catches_hand_tampered_empty_owner(self):
        record = copy.deepcopy(_valid_register())
        record["risks"][0]["owner"] = ""
        gate = evaluate_trackability_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_trackability_gate_catches_hand_tampered_duplicate_risk_id(self):
        record = copy.deepcopy(_valid_register())
        record["risks"].append(copy.deepcopy(record["risks"][0]))
        gate = evaluate_trackability_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_risk_register_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_register(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_register())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "RREG-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RISKREG_INVALID_ID"):
            _valid_register(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RISKREG_INVALID_VERSION"):
            generate_risk_register("RREG-T-011", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RISKREG_INVALID_PROVENANCE"):
            _valid_register(provenance={"epistemic_type": "NOT_REAL"})

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "delivery.risk_register")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_risk_register_gates(_valid_register(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "exposure_derivation", "trackability"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        register = _valid_register()
        self.assertEqual(set(register.keys()), {"id", "version", "generated_by_method", "risks", "provenance"})


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same aliasing-regression class the F15 batch critic pass found in 11/14 builders (fixed via
    copy.deepcopy at the return statement) -- guarded here from the start."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_register()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_risk_register(base["id"], base["risks"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
