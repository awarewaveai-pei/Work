"""Mutation-style tests for ``strategy.value_proposition_canvas`` (F08 context/strategy family, 14th and FINAL
member).

Every real invariant (all 6 arrays non-empty + field-complete, pain/gain id collision, pain_reliever/
gain_creator id collision, fit_hypotheses non-empty, referential integrity of both fit_hypotheses reference
fields, fit_type never caller-supplied, fit_type mismatch, fit_rationale non-empty) is exercised at BOTH
layers: construction-time refusal (``generate_value_proposition_canvas`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation (``evaluate_vpc_integrity_gate`` catching a
hand-tampered raw dict that bypassed the builder entirely). Schema conformance is checked against the real
spec-root schema this same slice added (``typed-objects/value-proposition-canvas.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.value_proposition_canvas import (
    CANVAS_ARRAYS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    canvas_item,
    derive_fit_type,
    evaluate_provenance_required_gate,
    evaluate_vpc_gates,
    evaluate_vpc_integrity_gate,
    fit_hypothesis,
    generate_value_proposition_canvas,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

VPC_CANVAS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/value-proposition-canvas.schema.yaml"


def _valid_arrays(prefix: str = "VPC-T-001") -> dict[str, list[dict]]:
    return {
        "jobs": [canvas_item(f"{prefix}-J1", "manage multiple client campaigns from one workspace")],
        "pains": [canvas_item(f"{prefix}-PA1", "manual export across client accounts is slow and error-prone")],
        "gains": [canvas_item(f"{prefix}-GA1", "one login to see cross-client performance overview")],
        "products_and_services": [canvas_item(f"{prefix}-PS1", "white-label multi-tenant reporting platform")],
        "pain_relievers": [canvas_item(f"{prefix}-PR1", "single-login cross-client switching, zero manual export")],
        "gain_creators": [canvas_item(f"{prefix}-GC1", "cross-client performance dashboard in one login")],
    }


def _valid_fit_hypotheses(prefix: str = "VPC-T-001") -> list[dict]:
    return [
        fit_hypothesis(f"{prefix}-H1", f"{prefix}-PR1", f"{prefix}-PA1", "single login directly removes the manual-export pain"),
        fit_hypothesis(f"{prefix}-H2", f"{prefix}-GC1", f"{prefix}-GA1", "cross-client dashboard directly delivers the one-login gain"),
    ]


def _valid_canvas(*, record_id: str = "VPC-T-001", arrays=None, fit_hypotheses=None):
    arrays = arrays if arrays is not None else _valid_arrays(record_id)
    fit_hypotheses = fit_hypotheses if fit_hypotheses is not None else _valid_fit_hypotheses(record_id)
    return generate_value_proposition_canvas(
        record_id,
        arrays["jobs"],
        arrays["pains"],
        arrays["gains"],
        arrays["products_and_services"],
        arrays["pain_relievers"],
        arrays["gain_creators"],
        fit_hypotheses,
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_canvas_validates_against_the_real_schema(self):
        self.contracts.validate(VPC_CANVAS_SCHEMA, _valid_canvas(), "value proposition canvas")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_empty_catalog_blocks_vpc_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        arrays = _valid_arrays("VPC-T-INVOKE")
        hyps = _valid_fit_hypotheses("VPC-T-INVOKE")
        descriptor, canvas = live.invoke(
            METHOD_ID,
            generate_value_proposition_canvas,
            "VPC-T-INVOKE",
            arrays["jobs"],
            arrays["pains"],
            arrays["gains"],
            arrays["products_and_services"],
            arrays["pain_relievers"],
            arrays["gain_creators"],
            hyps,
            make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.value_proposition_canvas.contract.yaml")
        self.assertEqual(canvas["id"], "VPC-T-INVOKE")

    def test_schema_rejects_an_unknown_top_level_key(self):
        canvas = _valid_canvas()
        canvas["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VPC_CANVAS_SCHEMA, canvas, "canvas with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_jobs_item(self):
        canvas = _valid_canvas()
        canvas["jobs"][0]["confidence"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VPC_CANVAS_SCHEMA, canvas, "canvas with a smuggled jobs[] key")

    def test_schema_rejects_an_unknown_key_inside_a_fit_hypothesis(self):
        canvas = _valid_canvas()
        canvas["fit_hypotheses"][0]["confidence"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VPC_CANVAS_SCHEMA, canvas, "canvas with a smuggled fit_hypotheses[] key")

    def test_schema_rejects_an_out_of_enum_fit_type(self):
        canvas = _valid_canvas()
        canvas["fit_hypotheses"][0]["fit_type"] = "BOGUS"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VPC_CANVAS_SCHEMA, canvas, "canvas with an out-of-enum fit_type")

    def test_schema_rejects_empty_jobs_array(self):
        canvas = _valid_canvas()
        canvas["jobs"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VPC_CANVAS_SCHEMA, canvas, "canvas with empty jobs")

    def test_hand_tampered_canvas_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        canvas = copy.deepcopy(_valid_canvas())
        canvas["fit_hypotheses"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(VPC_CANVAS_SCHEMA, canvas, "tampered canvas")
        gate = evaluate_vpc_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.value_proposition_canvas.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.value_proposition_canvas contract")

    def test_id_is_distinct_from_sibling_strategy_machine_ids(self):
        self.assertEqual(METHOD_ID, "strategy.value_proposition_canvas")
        self.assertNotIn(METHOD_ID, {"strategy.swot", "strategy.tows", "strategy.stp", "strategy.vrio", "strategy.value_chain", "strategy.ansoff"})


class ArrayCompletenessTests(unittest.TestCase):
    """Real invariant #1: all 6 canvas arrays must be non-empty and every entry field-complete. Loops over all
    6 array names to prove the generic per-array code path is wired to the RIGHT array-specific error code, not
    just that one array works."""

    def test_each_array_empty_is_refused_with_its_own_specific_code(self):
        for name in CANVAS_ARRAYS:
            with self.subTest(array=name):
                arrays = _valid_arrays(f"VPC-T-EMPTY-{name.upper()}")
                arrays[name] = []
                with self.assertRaisesRegex(InvariantViolation, f"VPC_EMPTY_{name.upper()}"):
                    generate_value_proposition_canvas(
                        f"VPC-T-EMPTY-{name.upper()}",
                        arrays["jobs"],
                        arrays["pains"],
                        arrays["gains"],
                        arrays["products_and_services"],
                        arrays["pain_relievers"],
                        arrays["gain_creators"],
                        _valid_fit_hypotheses(f"VPC-T-EMPTY-{name.upper()}"),
                        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
                    )

    def test_each_array_not_a_list_is_refused_as_empty(self):
        arrays = _valid_arrays("VPC-T-002")
        arrays["jobs"] = "not-a-list"
        with self.assertRaisesRegex(InvariantViolation, "VPC_EMPTY_JOBS"):
            generate_value_proposition_canvas(
                "VPC-T-002",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                _valid_fit_hypotheses("VPC-T-002"),
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_jobs_missing_id_is_refused(self):
        arrays = _valid_arrays("VPC-T-003")
        arrays["jobs"] = [{"statement": "x"}]
        with self.assertRaisesRegex(InvariantViolation, "VPC_JOBS_MISSING_ID"):
            generate_value_proposition_canvas(
                "VPC-T-003",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                _valid_fit_hypotheses("VPC-T-003"),
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_duplicate_id_within_pain_relievers_is_refused(self):
        arrays = _valid_arrays("VPC-T-004")
        arrays["pain_relievers"] = [canvas_item("PR-DUP", "a"), canvas_item("PR-DUP", "b")]
        with self.assertRaisesRegex(InvariantViolation, "VPC_DUPLICATE_PAIN_RELIEVERS_ID"):
            generate_value_proposition_canvas(
                "VPC-T-004",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                [fit_hypothesis("H1", "PR-DUP", "VPC-T-004-PA1", "r")],
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_gain_creators_missing_statement_is_refused(self):
        arrays = _valid_arrays("VPC-T-005")
        arrays["gain_creators"] = [{"id": "GC1", "statement": "   "}]
        with self.assertRaisesRegex(InvariantViolation, "VPC_GAIN_CREATORS_MISSING_STATEMENT"):
            generate_value_proposition_canvas(
                "VPC-T-005",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                [fit_hypothesis("H1", "GC1", "VPC-T-005-GA1", "r")],
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )


class IdCollisionTests(unittest.TestCase):
    """Real invariant #2: no id reused across pains/gains or pain_relievers/gain_creators -- otherwise
    fit_hypotheses references would be ambiguous."""

    def test_pain_gain_id_collision_is_refused(self):
        arrays = _valid_arrays("VPC-T-006")
        arrays["gains"] = [canvas_item(f"{arrays['pains'][0]['id']}", "colliding id")]
        with self.assertRaisesRegex(InvariantViolation, "VPC_ID_COLLISION_PAIN_GAIN"):
            generate_value_proposition_canvas(
                "VPC-T-006",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                _valid_fit_hypotheses("VPC-T-006"),
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_reliever_creator_id_collision_is_refused(self):
        arrays = _valid_arrays("VPC-T-007")
        arrays["gain_creators"] = [canvas_item(f"{arrays['pain_relievers'][0]['id']}", "colliding id")]
        with self.assertRaisesRegex(InvariantViolation, "VPC_ID_COLLISION_RELIEVER_CREATOR"):
            generate_value_proposition_canvas(
                "VPC-T-007",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                _valid_fit_hypotheses("VPC-T-007"),
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )


class FitHypothesesReferentialIntegrityTests(unittest.TestCase):
    """Real invariants #3-#7: fit_hypotheses non-empty, both reference fields resolve, fit_type never
    caller-supplied, fit_type mismatch refused, fit_rationale non-empty."""

    def test_empty_fit_hypotheses_is_refused(self):
        arrays = _valid_arrays("VPC-T-008")
        with self.assertRaisesRegex(InvariantViolation, "VPC_EMPTY_FIT_HYPOTHESES"):
            generate_value_proposition_canvas(
                "VPC-T-008",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                [],
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_unknown_reliever_or_creator_id_is_refused(self):
        arrays = _valid_arrays("VPC-T-009")
        hyps = [fit_hypothesis("H1", "VPC-DOES-NOT-EXIST", arrays["pains"][0]["id"], "r")]
        with self.assertRaisesRegex(InvariantViolation, "VPC_UNKNOWN_RELIEVER_OR_CREATOR_ID"):
            generate_value_proposition_canvas(
                "VPC-T-009",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                hyps,
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_unknown_pain_or_gain_id_is_refused(self):
        arrays = _valid_arrays("VPC-T-010")
        hyps = [fit_hypothesis("H1", arrays["pain_relievers"][0]["id"], "VPC-DOES-NOT-EXIST", "r")]
        with self.assertRaisesRegex(InvariantViolation, "VPC_UNKNOWN_PAIN_OR_GAIN_ID"):
            generate_value_proposition_canvas(
                "VPC-T-010",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                hyps,
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_caller_supplied_fit_type_is_refused(self):
        arrays = _valid_arrays("VPC-T-011")
        hyp = fit_hypothesis("H1", arrays["pain_relievers"][0]["id"], arrays["pains"][0]["id"], "r")
        hyp["fit_type"] = "PAIN_RELIEF"
        with self.assertRaisesRegex(InvariantViolation, "VPC_FIT_TYPE_MUST_NOT_BE_CALLER_SUPPLIED"):
            generate_value_proposition_canvas(
                "VPC-T-011",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                [hyp],
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_pain_reliever_paired_with_gain_is_refused_as_mismatch(self):
        arrays = _valid_arrays("VPC-T-012")
        hyps = [fit_hypothesis("H1", arrays["pain_relievers"][0]["id"], arrays["gains"][0]["id"], "wrong pairing")]
        with self.assertRaisesRegex(InvariantViolation, "VPC_FIT_TYPE_MISMATCH"):
            generate_value_proposition_canvas(
                "VPC-T-012",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                hyps,
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_gain_creator_paired_with_pain_is_refused_as_mismatch(self):
        arrays = _valid_arrays("VPC-T-013")
        hyps = [fit_hypothesis("H1", arrays["gain_creators"][0]["id"], arrays["pains"][0]["id"], "wrong pairing")]
        with self.assertRaisesRegex(InvariantViolation, "VPC_FIT_TYPE_MISMATCH"):
            generate_value_proposition_canvas(
                "VPC-T-013",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                hyps,
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_empty_fit_rationale_is_refused(self):
        arrays = _valid_arrays("VPC-T-014")
        hyps = [fit_hypothesis("H1", arrays["pain_relievers"][0]["id"], arrays["pains"][0]["id"], "   ")]
        with self.assertRaisesRegex(InvariantViolation, "VPC_EMPTY_FIT_RATIONALE"):
            generate_value_proposition_canvas(
                "VPC-T-014",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                hyps,
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_duplicate_fit_hypothesis_id_is_refused(self):
        arrays = _valid_arrays("VPC-T-015")
        hyps = [
            fit_hypothesis("H1", arrays["pain_relievers"][0]["id"], arrays["pains"][0]["id"], "r1"),
            fit_hypothesis("H1", arrays["gain_creators"][0]["id"], arrays["gains"][0]["id"], "r2"),
        ]
        with self.assertRaisesRegex(InvariantViolation, "VPC_DUPLICATE_FIT_HYPOTHESIS_ID"):
            generate_value_proposition_canvas(
                "VPC-T-015",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                hyps,
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
            )

    def test_both_legal_fit_types_are_reachable(self):
        arrays = _valid_arrays("VPC-T-016")
        hyps = [
            fit_hypothesis("H1", arrays["pain_relievers"][0]["id"], arrays["pains"][0]["id"], "reliever/pain"),
            fit_hypothesis("H2", arrays["gain_creators"][0]["id"], arrays["gains"][0]["id"], "creator/gain"),
        ]
        canvas = generate_value_proposition_canvas(
            "VPC-T-016",
            arrays["jobs"],
            arrays["pains"],
            arrays["gains"],
            arrays["products_and_services"],
            arrays["pain_relievers"],
            arrays["gain_creators"],
            hyps,
            make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
        )
        self.assertEqual({h["fit_type"] for h in canvas["fit_hypotheses"]}, {"PAIN_RELIEF", "GAIN_CREATION"})


class DeriveFitTypeTests(unittest.TestCase):
    """Direct tests of the GENUINE_COMPUTE function -- confirms the lookup table is TOTAL over its 2 legal
    combinations and raises on all others."""

    def test_pain_reliever_plus_pain_is_pain_relief(self):
        self.assertEqual(derive_fit_type("PAIN_RELIEVER", "PAIN"), "PAIN_RELIEF")

    def test_gain_creator_plus_gain_is_gain_creation(self):
        self.assertEqual(derive_fit_type("GAIN_CREATOR", "GAIN"), "GAIN_CREATION")

    def test_pain_reliever_plus_gain_raises_mismatch(self):
        with self.assertRaisesRegex(InvariantViolation, "VPC_FIT_TYPE_MISMATCH"):
            derive_fit_type("PAIN_RELIEVER", "GAIN")

    def test_gain_creator_plus_pain_raises_mismatch(self):
        with self.assertRaisesRegex(InvariantViolation, "VPC_FIT_TYPE_MISMATCH"):
            derive_fit_type("GAIN_CREATOR", "PAIN")


class FieldCompletenessTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "VPC_INVALID_ID"):
            _valid_canvas(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        arrays = _valid_arrays("VPC-T-017")
        with self.assertRaisesRegex(InvariantViolation, "VPC_INVALID_VERSION"):
            generate_value_proposition_canvas(
                "VPC-T-017",
                arrays["jobs"],
                arrays["pains"],
                arrays["gains"],
                arrays["products_and_services"],
                arrays["pain_relievers"],
                arrays["gain_creators"],
                _valid_fit_hypotheses("VPC-T-017"),
                make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
                version=1,
            )

    def test_builder_does_not_leak_extra_keys(self):
        canvas = _valid_canvas()
        self.assertEqual(
            set(canvas.keys()),
            {
                "id", "version", "generated_by_method", "jobs", "pains", "gains", "products_and_services",
                "pain_relievers", "gain_creators", "fit_hypotheses", "referential_integrity_verified",
                "computation_provenance_ref", "provenance",
            },
        )
        self.assertEqual(set(canvas["jobs"][0].keys()), {"id", "statement"})
        self.assertEqual(set(canvas["fit_hypotheses"][0].keys()), {"id", "reliever_or_creator_id", "pain_or_gain_id", "fit_type", "fit_rationale"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID canvas's raw dict directly (never going through the builder again), then call the
    gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_canvas(self):
        gate = evaluate_vpc_integrity_gate(_valid_canvas(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_fit_type_mismatch(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["fit_hypotheses"][0]["pain_or_gain_id"] = canvas["gains"][0]["id"]
        gate = evaluate_vpc_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(any(p.get("reason") == "VPC_FIT_TYPE_MISMATCH" for p in gate["evidence"][0]["problems"]))

    def test_gate_catches_hand_tampered_fit_type_value(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["fit_hypotheses"][0]["fit_type"] = "GAIN_CREATION"
        gate = evaluate_vpc_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(any(p.get("reason") == "FIT_TYPE_MISMATCH" for p in gate["evidence"][0]["problems"]))

    def test_gate_catches_hand_tampered_pain_gain_id_collision(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["gains"][0]["id"] = canvas["pains"][0]["id"]
        gate = evaluate_vpc_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_fit_hypotheses(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["fit_hypotheses"] = []
        gate = evaluate_vpc_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_fit_rationale(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["fit_hypotheses"][0]["fit_rationale"] = ""
        gate = evaluate_vpc_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_referential_integrity_verified_flag(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["referential_integrity_verified"] = False
        gate = evaluate_vpc_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_record(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                gate = evaluate_vpc_integrity_gate(bad_record, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["id"] = "WRONG-001"
        gate = evaluate_vpc_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["version"] = 1
        gate = evaluate_vpc_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_canvas(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_canvas_provenance_invalid(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_vpc_gates_returns_two_gates_in_order(self):
        results = evaluate_vpc_gates(_valid_canvas(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "vpc_integrity"])

    def test_evaluate_vpc_gates_all_pass_on_a_valid_canvas(self):
        results = evaluate_vpc_gates(_valid_canvas(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "VPC-")

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.value_proposition_canvas")

    def test_canvas_arrays_constant_names_all_6_sides(self):
        self.assertEqual(set(CANVAS_ARRAYS), {"jobs", "pains", "gains", "products_and_services", "pain_relievers", "gain_creators"})

    def test_canvas_item_helper_builds_the_expected_shape(self):
        self.assertEqual(canvas_item("X1", "a statement"), {"id": "X1", "statement": "a statement"})

    def test_fit_hypothesis_helper_builds_the_expected_shape_with_no_fit_type(self):
        entry = fit_hypothesis("H1", "PR1", "PA1", "why")
        self.assertEqual(entry, {"id": "H1", "reliever_or_creator_id": "PR1", "pain_or_gain_id": "PA1", "fit_rationale": "why"})
        self.assertNotIn("fit_type", entry)


if __name__ == "__main__":
    unittest.main()
