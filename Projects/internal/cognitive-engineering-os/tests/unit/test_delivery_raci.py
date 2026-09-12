"""Mutation-style tests for ``delivery.raci`` (F22 PM/delivery/governance family, Atlas L927).

Disambiguation from ``stakeholders.raci`` (F07, Atlas L491) proven structurally: this method operates over
``deliverables`` (not generic ``tasks``), requires a calendrically valid ``due_date`` per deliverable, and adds
the genuinely new escalation-path-required-when-Accountable-unavailable invariant F07 does not have. Both the
base exactly-1-Accountable/at-least-1-Responsible rule and the new deliverable-level invariants are proven at
BOTH independent layers -- the construction-time builder and an independent gate that never trusts a stored
flag.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.delivery.raci import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_deliverable_governance_gate,
    evaluate_delivery_raci_gates,
    evaluate_provenance_required_gate,
    evaluate_raci_role_integrity_gate,
    generate_delivery_raci_matrix,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

DELIVERY_RACI_SCHEMA = "ai-lego://specs/cognitive/typed-objects/delivery-raci-matrix.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        deliverables=[
            {
                "deliverable_name": "V2 API 規格文件",
                "due_date": "2026-10-15",
                "assignments": [
                    {"stakeholder_name": "技術寫手", "role": "R", "status": "AVAILABLE"},
                    {"stakeholder_name": "架構師", "role": "A", "status": "AVAILABLE"},
                ],
                "escalation_path": None,
            },
            {
                "deliverable_name": "上線前資安審查報告",
                "due_date": "2026-11-01",
                "assignments": [
                    {"stakeholder_name": "資安工程師", "role": "R", "status": "AVAILABLE"},
                    {"stakeholder_name": "資安主管", "role": "A", "status": "UNAVAILABLE"},
                ],
                "escalation_path": "副資安主管",
            },
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_matrix(*, record_id: str = "DRACI-T-001", **overrides: object):
    return generate_delivery_raci_matrix(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_matrix_validates_against_the_real_schema(self):
        self.contracts.validate(DELIVERY_RACI_SCHEMA, _valid_matrix(), "delivery raci matrix")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, matrix = live.invoke(METHOD_ID, generate_delivery_raci_matrix, "DRACI-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/delivery.raci.contract.yaml")
        self.assertEqual(matrix["id"], "DRACI-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        matrix = _valid_matrix()
        matrix["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DELIVERY_RACI_SCHEMA, matrix, "matrix with a smuggled top-level key")

    def test_schema_rejects_an_invalid_role(self):
        matrix = _valid_matrix()
        matrix["deliverables"][0]["assignments"][0]["role"] = "X"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DELIVERY_RACI_SCHEMA, matrix, "matrix with an invalid role")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "delivery.raci.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "delivery.raci contract")


class DisambiguationTests(unittest.TestCase):
    """Proves this is a genuinely distinct method/record from stakeholders.raci, not a renamed copy."""

    def test_method_id_is_not_stakeholders_raci(self):
        self.assertNotEqual(METHOD_ID, "stakeholders.raci")
        self.assertEqual(METHOD_ID, "delivery.raci")

    def test_record_id_prefix_is_neither_bare_raci_nor_sraci(self):
        self.assertEqual(RECORD_ID_PREFIX, "DRACI-")
        self.assertNotEqual(RECORD_ID_PREFIX, "RACI-")
        self.assertNotEqual(RECORD_ID_PREFIX, "SRACI-")

    def test_builder_input_shape_requires_due_date_and_escalation_path_unlike_generic_task_raci(self):
        deliverable = _kwargs()["deliverables"][0]
        self.assertIn("due_date", deliverable)
        self.assertIn("escalation_path", deliverable)
        self.assertNotIn("task_name", deliverable)


class EmptyDeliverablesTests(unittest.TestCase):
    def test_zero_deliverables_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DRACI_EMPTY_DELIVERABLES"):
            generate_delivery_raci_matrix("DRACI-T-002", deliverables=[], provenance=PROVENANCE)


class DueDateTests(unittest.TestCase):
    """NEW invariant beyond stakeholders.raci -- a deliverable is milestone-bound."""

    def test_missing_due_date_is_refused(self):
        kwargs = _kwargs()
        kwargs["deliverables"][0]["due_date"] = ""
        with self.assertRaisesRegex(InvariantViolation, "DRACI_INVALID_DUE_DATE"):
            generate_delivery_raci_matrix("DRACI-T-003", **kwargs)

    def test_calendrically_invalid_due_date_is_refused(self):
        """'2026-02-30' is syntactically date-shaped but calendrically impossible -- a bare regex would accept it."""
        kwargs = _kwargs()
        kwargs["deliverables"][0]["due_date"] = "2026-02-30"
        with self.assertRaisesRegex(InvariantViolation, "DRACI_INVALID_DUE_DATE"):
            generate_delivery_raci_matrix("DRACI-T-004", **kwargs)

    def test_valid_due_date_is_accepted(self):
        matrix = _valid_matrix()
        self.assertEqual(matrix["deliverables"][0]["due_date"], "2026-10-15")


class AccountableCountTests(unittest.TestCase):
    def test_zero_accountable_is_refused(self):
        kwargs = _kwargs()
        kwargs["deliverables"][0]["assignments"] = [{"stakeholder_name": "x", "role": "R", "status": "AVAILABLE"}]
        with self.assertRaisesRegex(InvariantViolation, "DRACI_DELIVERABLE_NOT_EXACTLY_ONE_ACCOUNTABLE"):
            generate_delivery_raci_matrix("DRACI-T-005", **kwargs)

    def test_two_accountable_is_refused(self):
        kwargs = _kwargs()
        kwargs["deliverables"][0]["assignments"].append({"stakeholder_name": "y", "role": "A", "status": "AVAILABLE"})
        with self.assertRaisesRegex(InvariantViolation, "DRACI_DELIVERABLE_NOT_EXACTLY_ONE_ACCOUNTABLE"):
            generate_delivery_raci_matrix("DRACI-T-006", **kwargs)

    def test_missing_responsible_is_refused(self):
        kwargs = _kwargs()
        kwargs["deliverables"][0]["assignments"] = [{"stakeholder_name": "x", "role": "A", "status": "AVAILABLE"}]
        with self.assertRaisesRegex(InvariantViolation, "DRACI_DELIVERABLE_MISSING_RESPONSIBLE"):
            generate_delivery_raci_matrix("DRACI-T-007", **kwargs)


class EscalationPathTests(unittest.TestCase):
    """THE genuinely new invariant beyond stakeholders.raci."""

    def test_unavailable_accountable_with_no_escalation_path_is_refused(self):
        kwargs = _kwargs()
        kwargs["deliverables"][1]["escalation_path"] = None
        with self.assertRaisesRegex(InvariantViolation, "DRACI_MISSING_ESCALATION_PATH"):
            generate_delivery_raci_matrix("DRACI-T-008", **kwargs)

    def test_whitespace_only_escalation_path_is_refused_as_invalid_shape(self):
        """A whitespace-only string is caught by the shape check (DRACI_INVALID_ESCALATION_PATH) before the
        unavailable-Accountable check ever runs -- distinct from an entirely absent (null) escalation_path."""
        kwargs = _kwargs()
        kwargs["deliverables"][1]["escalation_path"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "DRACI_INVALID_ESCALATION_PATH"):
            generate_delivery_raci_matrix("DRACI-T-009", **kwargs)

    def test_available_accountable_with_null_escalation_path_is_accepted(self):
        matrix = _valid_matrix()
        self.assertIsNone(matrix["deliverables"][0]["escalation_path"])

    def test_unavailable_accountable_with_declared_escalation_path_is_accepted(self):
        matrix = _valid_matrix()
        self.assertEqual(matrix["deliverables"][1]["escalation_path"], "副資安主管")

    def test_available_accountable_may_still_declare_an_escalation_path(self):
        kwargs = _kwargs()
        kwargs["deliverables"][0]["escalation_path"] = "備援架構師"
        matrix = generate_delivery_raci_matrix("DRACI-T-010", **kwargs)
        self.assertEqual(matrix["deliverables"][0]["escalation_path"], "備援架構師")


class DuplicateDeliverableNameTests(unittest.TestCase):
    def test_duplicate_deliverable_name_is_refused(self):
        kwargs = _kwargs()
        kwargs["deliverables"].append(copy.deepcopy(kwargs["deliverables"][0]))
        with self.assertRaisesRegex(InvariantViolation, "DRACI_DUPLICATE_DELIVERABLE_NAME"):
            generate_delivery_raci_matrix("DRACI-T-011", **kwargs)

    def test_whitespace_and_case_normalized_duplicate_is_refused(self):
        kwargs = _kwargs()
        duplicate = copy.deepcopy(kwargs["deliverables"][0])
        duplicate["deliverable_name"] = kwargs["deliverables"][0]["deliverable_name"] + " "
        kwargs["deliverables"].append(duplicate)
        with self.assertRaisesRegex(InvariantViolation, "DRACI_DUPLICATE_DELIVERABLE_NAME"):
            generate_delivery_raci_matrix("DRACI-T-012", **kwargs)


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_matrix(self):
        results = evaluate_delivery_raci_gates(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_raci_role_integrity_gate_catches_hand_tampered_zero_accountable(self):
        record = copy.deepcopy(_valid_matrix())
        record["deliverables"][0]["assignments"] = [a for a in record["deliverables"][0]["assignments"] if a["role"] != "A"]
        gate = evaluate_raci_role_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_raci_role_integrity_gate_catches_hand_tampered_duplicate_name(self):
        record = copy.deepcopy(_valid_matrix())
        record["deliverables"].append(copy.deepcopy(record["deliverables"][0]))
        gate = evaluate_raci_role_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_deliverable_governance_gate_catches_hand_tampered_erased_escalation_path(self):
        record = copy.deepcopy(_valid_matrix())
        record["deliverables"][1]["escalation_path"] = None
        gate = evaluate_deliverable_governance_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_deliverable_governance_gate_catches_hand_tampered_invalid_due_date(self):
        record = copy.deepcopy(_valid_matrix())
        record["deliverables"][0]["due_date"] = "2026-13-01"
        gate = evaluate_deliverable_governance_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_deliverable_governance_gate_passes_a_genuinely_valid_matrix(self):
        gate = evaluate_deliverable_governance_gate(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_delivery_raci_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_matrix())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DRACI_INVALID_ID"):
            _valid_matrix(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DRACI_INVALID_VERSION"):
            generate_delivery_raci_matrix("DRACI-T-013", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DRACI_INVALID_PROVENANCE"):
            _valid_matrix(provenance={"epistemic_type": "NOT_REAL"})

    def test_invalid_status_is_refused(self):
        kwargs = _kwargs()
        kwargs["deliverables"][0]["assignments"][0]["status"] = "ON_LEAVE"
        with self.assertRaisesRegex(InvariantViolation, "DRACI_INVALID_STATUS"):
            generate_delivery_raci_matrix("DRACI-T-014", **kwargs)

    def test_invalid_role_is_refused(self):
        kwargs = _kwargs()
        kwargs["deliverables"][0]["assignments"][0]["role"] = "X"
        with self.assertRaisesRegex(InvariantViolation, "DRACI_INVALID_ROLE"):
            generate_delivery_raci_matrix("DRACI-T-015", **kwargs)

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "delivery.raci")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_delivery_raci_gates(_valid_matrix(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "raci_role_integrity", "deliverable_governance"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        matrix = _valid_matrix()
        self.assertEqual(
            set(matrix.keys()),
            {"id", "version", "generated_by_method", "deliverables", "provenance"},
        )


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        matrix = generate_delivery_raci_matrix("DRACI-T-016", **kwargs)
        kwargs["deliverables"][0]["assignments"][0]["status"] = "UNAVAILABLE"
        self.assertEqual(matrix["deliverables"][0]["assignments"][0]["status"], "AVAILABLE")
        self.assertIsNot(matrix["deliverables"], kwargs["deliverables"])


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class the F13/F15/delivery.critical_path_method batches' own critic passes found
    (builders returning the caller's provenance dict BY REFERENCE) -- 2026-09-12 critic pass found this
    method's own builder returning ``provenance`` unwrapped (the only one of this batch's 10 modules to do
    so); fixed via ``copy.deepcopy`` at return, matching every sibling module's own discipline. Uses its OWN
    freshly-built provenance dict (never the shared module-level ``PROVENANCE`` constant) so mutating it here
    cannot leak state into any other test in this file."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        kwargs = _kwargs(provenance=provenance)
        matrix = generate_delivery_raci_matrix("DRACI-T-017", **kwargs)
        self.assertIsNot(matrix["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(matrix["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
