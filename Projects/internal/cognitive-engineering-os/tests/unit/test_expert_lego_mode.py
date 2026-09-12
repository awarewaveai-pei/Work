"""Mutation-style tests for ``representation.expert_lego_mode`` (F24 representation family, Atlas L972,
§11.57).

Atlas §11.57's own "因此是「自由組裝」，不是「自由破壞」" rule is proven at
BOTH independent layers: the construction-time builder refuses a missing/
duplicate/unknown check, a duplicate step_id, and too few chain steps, NEVER
accepts compile_status as a parameter at all, and the independent gates
re-derive the same rules directly from a raw (possibly hand-tampered) dict,
never trusting that the builder's own derivation already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.representation.expert_lego_mode import (
    CHECK_NAMES,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_check_completeness_gate,
    evaluate_compile_status_consistency_gate,
    evaluate_expert_lego_chain_gates,
    evaluate_provenance_required_gate,
    generate_expert_lego_chain,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

EXPERT_LEGO_CHAIN_SCHEMA = "ai-lego://specs/cognitive/typed-objects/expert-lego-chain.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _all_pass_checks() -> list[dict]:
    return [{"check": name, "status": "PASS", "note": f"{name} satisfied"} for name in CHECK_NAMES]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        chain=[
            {"step_id": "S1", "method_id": "insight.interview"},
            {"step_id": "S2", "method_id": "foresight.scenario_planning"},
            {"step_id": "S3", "method_id": "decision.decision_tree"},
        ],
        checks=_all_pass_checks(),
        # A FRESH dict per call, not the module-level PROVENANCE constant -- some tests mutate
        # kwargs["provenance"] in place after construction to prove non-aliasing, which would otherwise
        # corrupt the shared PROVENANCE singleton for every other test in this module.
        provenance=make_provenance("AI_INFERENCE", "AI_GENERATED"),
    )
    base.update(overrides)
    return base


def _valid_chain(*, record_id: str = "ELEGO-T-001", **overrides: object):
    return generate_expert_lego_chain(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_chain_validates_against_the_real_schema(self):
        self.contracts.validate(EXPERT_LEGO_CHAIN_SCHEMA, _valid_chain(), "expert lego chain")

    def test_all_pass_chain_derives_compiled(self):
        self.assertEqual(_valid_chain()["compile_status"], "COMPILED")

    def test_two_step_chain_is_a_complete_minimal_chain(self):
        chain = generate_expert_lego_chain(
            "ELEGO-T-002",
            chain=[{"step_id": "S1", "method_id": "insight.interview"}, {"step_id": "S2", "method_id": "decision.decision_tree"}],
            checks=_all_pass_checks(),
            provenance=PROVENANCE,
        )
        self.contracts.validate(EXPERT_LEGO_CHAIN_SCHEMA, chain, "minimal complete chain")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, chain = live.invoke(METHOD_ID, generate_expert_lego_chain, "ELEGO-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/representation.expert_lego_mode.contract.yaml")
        self.assertEqual(chain["id"], "ELEGO-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        chain = _valid_chain()
        chain["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EXPERT_LEGO_CHAIN_SCHEMA, chain, "chain with a smuggled top-level key")

    def test_schema_rejects_an_8th_check(self):
        chain = _valid_chain()
        chain["checks"].append({"check": "type_check", "status": "PASS", "note": "duplicate"})
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(EXPERT_LEGO_CHAIN_SCHEMA, chain, "chain with 8 checks")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "representation.expert_lego_mode.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "representation.expert_lego_mode contract")


class ChainShapeTests(unittest.TestCase):
    def test_one_step_chain_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_TOO_FEW_STEPS"):
            generate_expert_lego_chain("ELEGO-T-003", chain=[{"step_id": "S1", "method_id": "insight.interview"}], checks=_all_pass_checks(), provenance=PROVENANCE)

    def test_zero_step_chain_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_TOO_FEW_STEPS"):
            generate_expert_lego_chain("ELEGO-T-004", chain=[], checks=_all_pass_checks(), provenance=PROVENANCE)

    def test_duplicate_step_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["chain"].append({"step_id": "S1", "method_id": "decision.decision_tree"})
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_DUPLICATE_STEP_ID"):
            generate_expert_lego_chain("ELEGO-T-005", **kwargs)

    def test_malformed_method_id_in_chain_is_refused(self):
        kwargs = _kwargs()
        kwargs["chain"][0]["method_id"] = "NotDottedForm"
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_INVALID_CHAIN"):
            generate_expert_lego_chain("ELEGO-T-006", **kwargs)


class CheckCompletenessTests(unittest.TestCase):
    def test_missing_check_is_refused(self):
        kwargs = _kwargs()
        kwargs["checks"] = kwargs["checks"][:-1]
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_MISSING_CHECK"):
            generate_expert_lego_chain("ELEGO-T-007", **kwargs)

    def test_duplicate_check_is_refused(self):
        kwargs = _kwargs()
        kwargs["checks"].append(dict(kwargs["checks"][0]))
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_DUPLICATE_CHECK"):
            generate_expert_lego_chain("ELEGO-T-008", **kwargs)

    def test_unknown_check_name_is_refused(self):
        kwargs = _kwargs()
        kwargs["checks"][0]["check"] = "not_a_real_check"
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_INVALID_CHECKS"):
            generate_expert_lego_chain("ELEGO-T-009", **kwargs)

    def test_all_7_names_constant_matches_atlas_11_57(self):
        self.assertEqual(
            set(CHECK_NAMES),
            {"type_check", "precondition_check", "policy_check", "jurisdiction_check", "cost_estimate", "risk_estimate", "required_gate_injection"},
        )


class CompileStatusDerivationTests(unittest.TestCase):
    """THE real invariant this method exists to enforce -- compile_status is mechanically derived, never a
    builder parameter, matching jurisdiction.market_admission_control's own admission_decision precedent."""

    def test_builder_has_no_compile_status_parameter(self):
        import inspect

        signature = inspect.signature(generate_expert_lego_chain)
        self.assertNotIn("compile_status", signature.parameters)

    def test_all_pass_derives_compiled(self):
        self.assertEqual(_valid_chain()["compile_status"], "COMPILED")

    def test_one_fail_among_seven_derives_rejected(self):
        kwargs = _kwargs()
        kwargs["checks"][3]["status"] = "FAIL"
        chain = generate_expert_lego_chain("ELEGO-T-010", **kwargs)
        self.assertEqual(chain["compile_status"], "REJECTED")

    def test_all_fail_derives_rejected(self):
        kwargs = _kwargs()
        for c in kwargs["checks"]:
            c["status"] = "FAIL"
        chain = generate_expert_lego_chain("ELEGO-T-011", **kwargs)
        self.assertEqual(chain["compile_status"], "REJECTED")

    def test_invalid_check_status_value_is_refused(self):
        kwargs = _kwargs()
        kwargs["checks"][0]["status"] = "UNKNOWN"
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_INVALID_CHECKS"):
            generate_expert_lego_chain("ELEGO-T-012", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_provenance_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        chain = generate_expert_lego_chain("ELEGO-T-013", **kwargs)
        kwargs["provenance"]["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(chain["provenance"]["epistemic_type"], "AI_INFERENCE")
        self.assertIsNot(chain["provenance"], kwargs["provenance"])

    def test_mutating_caller_checks_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        chain = generate_expert_lego_chain("ELEGO-T-014", **kwargs)
        kwargs["checks"][0]["status"] = "FAIL"
        self.assertEqual(chain["checks"][0]["status"], "PASS")
        self.assertEqual(chain["compile_status"], "COMPILED")


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_chain(self):
        results = evaluate_expert_lego_chain_gates(_valid_chain(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_check_completeness_gate_catches_hand_tampered_missing_check(self):
        record = copy.deepcopy(_valid_chain())
        record["checks"] = record["checks"][:-1]
        gate = evaluate_check_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_check_completeness_gate_catches_hand_tampered_duplicate_check(self):
        record = copy.deepcopy(_valid_chain())
        record["checks"].append(dict(record["checks"][0]))
        gate = evaluate_check_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_compile_status_consistency_gate_catches_hand_asserted_compiled_despite_a_fail(self):
        """The central proof: a hand-built record can bypass the builder entirely (which has no
        compile_status parameter at all) and directly write `compile_status: COMPILED` into the dict --
        the independent gate must still catch the inconsistency against the real checks[]."""
        record = copy.deepcopy(_valid_chain())
        record["checks"][3]["status"] = "FAIL"  # jurisdiction_check now fails
        record["compile_status"] = "COMPILED"  # but the record still claims COMPILED
        gate = evaluate_compile_status_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_compile_status_consistency_gate_catches_hand_asserted_rejected_despite_all_pass(self):
        record = copy.deepcopy(_valid_chain())
        record["compile_status"] = "REJECTED"  # all 7 checks PASS but the record claims REJECTED
        gate = evaluate_compile_status_consistency_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_compile_status_consistency_gate_passes_a_genuinely_consistent_chain(self):
        gate = evaluate_compile_status_consistency_gate(_valid_chain(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_expert_lego_chain_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_chain(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_chain())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ELEGO-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_INVALID_ID"):
            _valid_chain(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_INVALID_VERSION"):
            generate_expert_lego_chain("ELEGO-T-015", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ELEGO_INVALID_PROVENANCE"):
            _valid_chain(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "representation.expert_lego_mode")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_expert_lego_chain_gates(_valid_chain(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "check_completeness", "compile_status_consistency"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        chain = _valid_chain()
        self.assertEqual(set(chain.keys()), {"id", "version", "generated_by_method", "chain", "checks", "compile_status", "provenance"})


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """This session's own standing instruction after the recurring F10/F13/F15/F22 aliasing bug (a builder
    returning `provenance` BY REFERENCE instead of via `copy.deepcopy`): proves the fix and guards against a
    future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_chain()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_expert_lego_chain(base["id"], base["chain"], base["checks"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
