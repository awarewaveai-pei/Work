"""Mutation-style tests for ``stakeholders.salience_model`` (F07 stakeholder/power/negotiation family).

Real invariants beyond id/version/provenance shape (each of power/legitimacy/urgency shaped {present, non-null
justification if present}, stakeholder_name non-empty, dimension_count/salience_class GENUINE_COMPUTE),
exercised at BOTH layers: construction-time refusal (``generate_salience_assessment`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_salience_content_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Includes a dedicated class proving the module's bool-is-
int-subclass trap guard (``_is_valid_dimension_count``) actually matters, not just documented. Schema
conformance is checked against the real spec-root schema this same slice added
(``typed-objects/salience-model.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.stakeholders.salience_model import (
    LEGITIMACY_ONLY,
    METHOD_ID,
    NONE_CLASS,
    POWER_LEGITIMACY_URGENCY,
    POWER_ONLY,
    RECORD_ID_PREFIX,
    VALID_SALIENCE_CLASSES,
    all_gates_pass,
    derive_salience_outputs,
    evaluate_provenance_required_gate,
    evaluate_salience_content_integrity_gate,
    evaluate_salience_gates,
    generate_salience_assessment,
    salience_dimension,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

SALIENCE_ASSESSMENT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/salience-model.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "AI_SUGGESTED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        stakeholder_name="資深忠誠客戶社群（付費會員制意見領袖）",
        power=salience_dimension(False),
        legitimacy=salience_dimension(True, "簽有正式付費會員合約，社群意見在既有治理流程中被正式採納為產品回饋來源"),
        urgency=salience_dimension(False),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_statement(*, record_id: str = "SALNCE-T-001", **overrides: object):
    return generate_salience_assessment(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_statement_validates_against_the_real_schema(self):
        self.contracts.validate(SALIENCE_ASSESSMENT_SCHEMA, _valid_statement(), "salience assessment")

    def test_valid_statement_with_all_three_dimensions_present_validates(self):
        statement = _valid_statement(
            power=salience_dimension(True, "掌握關鍵預算核准權"),
            legitimacy=salience_dimension(True, "合約明訂的正式利害關係人"),
            urgency=salience_dimension(True, "本季結束前須完成決策"),
        )
        self.assertEqual(statement["salience_class"], POWER_LEGITIMACY_URGENCY)
        self.assertEqual(statement["dimension_count"], 3)
        self.contracts.validate(SALIENCE_ASSESSMENT_SCHEMA, statement, "salience assessment, all 3 present")

    def test_valid_statement_with_none_present_validates(self):
        statement = _valid_statement(power=salience_dimension(False), legitimacy=salience_dimension(False), urgency=salience_dimension(False))
        self.assertEqual(statement["salience_class"], NONE_CLASS)
        self.assertEqual(statement["dimension_count"], 0)
        self.contracts.validate(SALIENCE_ASSESSMENT_SCHEMA, statement, "salience assessment, none present")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, statement = live.invoke(METHOD_ID, generate_salience_assessment, "SALNCE-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/stakeholders.salience_model.contract.yaml")
        self.assertEqual(statement["id"], "SALNCE-T-INVOKE")

    def test_empty_catalog_blocks_salience_model_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_statement())
        tampered["stakeholder_name"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SALIENCE_ASSESSMENT_SCHEMA, tampered, "tampered statement")
        gate = evaluate_salience_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        statement = _valid_statement()
        statement["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SALIENCE_ASSESSMENT_SCHEMA, statement, "statement with a smuggled top-level key")

    def test_schema_rejects_present_true_with_null_justification(self):
        statement = _valid_statement()
        statement["power"] = {"present": True, "justification": None}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SALIENCE_ASSESSMENT_SCHEMA, statement, "statement with present=True and null justification")

    def test_schema_rejects_missing_dimension_count(self):
        statement = _valid_statement()
        del statement["dimension_count"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SALIENCE_ASSESSMENT_SCHEMA, statement, "statement with dimension_count removed")

    def test_id_is_distinct_from_a_sibling_f07_machine_id(self):
        self.assertEqual(METHOD_ID, "stakeholders.salience_model")
        self.assertNotEqual(METHOD_ID, "stakeholders.stakeholder_map")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "stakeholders.salience_model.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "stakeholders.salience_model contract")


class DimensionShapeTests(unittest.TestCase):
    """Invariant #1/#2 (module docstring): each dimension is {present: bool, justification}, justification
    REQUIRED non-empty when present is True (不能只打勾沒證據), free when present is False."""

    def test_well_formed_statement_is_accepted(self):
        statement = _valid_statement()
        self.assertFalse(statement["power"]["present"])
        self.assertTrue(statement["legitimacy"]["present"])
        self.assertTrue(statement["legitimacy"]["justification"])

    def test_present_true_with_none_justification_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_LEGITIMACY"):
            _valid_statement(legitimacy={"present": True, "justification": None})

    def test_present_true_with_whitespace_only_justification_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_URGENCY"):
            _valid_statement(urgency={"present": True, "justification": "   "})

    def test_present_false_with_none_justification_is_accepted(self):
        statement = _valid_statement(power={"present": False, "justification": None})
        self.assertIsNone(statement["power"]["justification"])

    def test_present_false_with_a_disclosed_note_is_accepted(self):
        """present=False leaves justification free -- an optional disclosed note on why it was judged absent
        is legitimate, not refused (one-directional constraint, see module docstring)."""
        statement = _valid_statement(power={"present": False, "justification": "曾評估但無正式決策權"})
        self.assertEqual(statement["power"]["justification"], "曾評估但無正式決策權")

    def test_present_false_with_empty_string_justification_is_refused(self):
        """Empty string is never a legal disclosure regardless of present -- same discipline every other
        nullable content field in this corpus uses."""
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_POWER"):
            _valid_statement(power={"present": False, "justification": ""})

    def test_wrong_key_set_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_URGENCY"):
            _valid_statement(urgency={"present": False, "justification": None, "extra": 1})

    def test_non_bool_present_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_POWER"):
            _valid_statement(power={"present": 1, "justification": None})

    def test_non_dict_dimension_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_LEGITIMACY"):
            _valid_statement(legitimacy="not-a-dict")


class SalienceDimensionHelperTests(unittest.TestCase):
    """The salience_dimension convenience constructor enforces the same per-entry invariant directly."""

    def test_present_true_without_justification_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_MISSING_JUSTIFICATION"):
            salience_dimension(True)

    def test_present_true_with_empty_justification_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_JUSTIFICATION"):
            salience_dimension(True, "   ")

    def test_present_false_defaults_justification_to_none(self):
        self.assertEqual(salience_dimension(False), {"present": False, "justification": None})

    def test_non_bool_present_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_PRESENCE_TYPE"):
            salience_dimension(1)  # type: ignore[arg-type]


class StakeholderNameTests(unittest.TestCase):
    def test_empty_stakeholder_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_EMPTY_STAKEHOLDER_NAME"):
            _valid_statement(stakeholder_name="   ")

    def test_none_stakeholder_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_EMPTY_STAKEHOLDER_NAME"):
            _valid_statement(stakeholder_name=None)


class DeriveSalienceOutputsTests(unittest.TestCase):
    """Invariant #3 (module docstring): dimension_count/salience_class are GENUINE_COMPUTE, a single TOTAL
    function over all 8 combinations of 3 real booleans."""

    def test_all_eight_combinations_are_covered_and_distinct(self):
        seen_classes = set()
        for power in (False, True):
            for legitimacy in (False, True):
                for urgency in (False, True):
                    count, cls = derive_salience_outputs(power, legitimacy, urgency)
                    self.assertEqual(count, sum([power, legitimacy, urgency]))
                    self.assertIn(cls, VALID_SALIENCE_CLASSES)
                    seen_classes.add(cls)
        self.assertEqual(len(seen_classes), 8, "all 8 combinations must map to 8 DISTINCT salience_class values")

    def test_power_only_combination(self):
        count, cls = derive_salience_outputs(True, False, False)
        self.assertEqual((count, cls), (1, POWER_ONLY))

    def test_legitimacy_only_combination(self):
        count, cls = derive_salience_outputs(False, True, False)
        self.assertEqual((count, cls), (1, LEGITIMACY_ONLY))

    def test_generate_never_accepts_dimension_count_or_salience_class_as_a_parameter(self):
        """Structural elimination: no code path lets a caller pass these -- TypeError if attempted."""
        with self.assertRaises(TypeError):
            generate_salience_assessment("SALNCE-T-002", **{**_kwargs(), "dimension_count": 1})  # type: ignore[arg-type]

    def test_non_bool_input_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_PRESENCE_TYPE"):
            derive_salience_outputs(1, False, False)  # type: ignore[arg-type]


class BoolIsIntSubclassTrapTests(unittest.TestCase):
    """Dedicated proof the module's bool-is-int-subclass guard (module docstring) is load-bearing: a naive
    `isinstance(x, int) and 0 <= x <= 3` (WITHOUT excluding bool) would silently accept `dimension_count: True`
    as if it equalled the real int `1`."""

    def test_naive_int_range_check_would_have_wrongly_accepted_true_as_one(self):
        """Sanity-checks the trap itself is real in this Python runtime (not merely asserted) -- if this ever
        stops being true, the whole premise of the guard needs re-examination."""
        naive_check_passes = isinstance(True, int) and 0 <= True <= 3 and True == 1
        self.assertTrue(naive_check_passes, "expected the bool-is-int-subclass trap to be exploitable by a naive check in this Python runtime")

    def test_gate_rejects_bool_dimension_count_even_though_it_naively_equals_the_real_count(self):
        statement = _valid_statement(power=salience_dimension(True, "掌握關鍵預算核准權"), legitimacy=salience_dimension(False), urgency=salience_dimension(False))
        self.assertEqual(statement["dimension_count"], 1)
        tampered = copy.deepcopy(statement)
        tampered["dimension_count"] = True
        gate = evaluate_salience_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_accepts_the_real_int_count_the_bool_was_standing_in_for(self):
        statement = _valid_statement(power=salience_dimension(True, "掌握關鍵預算核准權"), legitimacy=salience_dimension(False), urgency=salience_dimension(False))
        gate = evaluate_salience_content_integrity_gate(statement, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID statement's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_statement(self):
        results = evaluate_salience_gates(_valid_statement(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_missing_justification(self):
        record = copy.deepcopy(_valid_statement())
        record["legitimacy"]["justification"] = None
        gate = evaluate_salience_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_salience_class_disagreeing_with_recomputation(self):
        record = copy.deepcopy(_valid_statement())
        record["salience_class"] = POWER_LEGITIMACY_URGENCY  # was LEGITIMACY_ONLY -- disagrees with power/urgency both False
        gate = evaluate_salience_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_stakeholder_name(self):
        record = copy.deepcopy(_valid_statement())
        record["stakeholder_name"] = "   "
        gate = evaluate_salience_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_salience_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_statement())
        record["id"] = "WRONG-001"
        gate = evaluate_salience_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_statement())
        record["version"] = 1
        gate = evaluate_salience_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_dimension_count_out_of_range(self):
        record = copy.deepcopy(_valid_statement())
        record["dimension_count"] = 4
        gate = evaluate_salience_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unrecognized_salience_class(self):
        record = copy.deepcopy(_valid_statement())
        record["salience_class"] = "DORMANT"  # the Mitchell-Agle-Wood label this suite deliberately does not use
        gate = evaluate_salience_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_forged_computation_provenance_ref(self):
        """Critic-found gap (2026-09-11): dimension_count/salience_class were re-derived and checked, but
        computation_provenance_ref itself was never compared against the module's own constant -- a value
        forged to point at a DIFFERENT method's compute function passed both this gate and the schema."""
        record = copy.deepcopy(_valid_statement())
        record["computation_provenance_ref"] = "ai_lego.modules.strategy.vrio.derive_vrio_outputs"
        gate = evaluate_salience_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_statement(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_statement())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SALNCE-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_ID"):
            _valid_statement(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_ID"):
            _valid_statement(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_VERSION"):
            generate_salience_assessment("SALNCE-T-003", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SALIENCE_INVALID_PROVENANCE"):
            _valid_statement(provenance={"epistemic_type": "NOT_REAL"})


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_salience_gates_returns_two_gates_in_order(self):
        results = evaluate_salience_gates(_valid_statement(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "salience_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "stakeholders.salience_model")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        statement = _valid_statement()
        self.assertEqual(
            set(statement.keys()),
            {"id", "version", "generated_by_method", "stakeholder_name", "power", "legitimacy", "urgency", "dimension_count", "salience_class", "computation_provenance_ref", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
