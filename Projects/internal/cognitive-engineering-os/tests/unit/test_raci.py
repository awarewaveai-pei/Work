"""Mutation-style tests for ``stakeholders.raci`` (F07 stakeholder/power/negotiation family, OPENING member).

Real invariants beyond id/version/provenance shape and structural non-emptiness (exactly 1 Accountable per
task, at least 1 Responsible per task, closed R/A/C/I role enum), exercised at BOTH layers: construction-time
refusal (``generate_raci_matrix`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_raci_content_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real spec-root
schema this same slice added (``typed-objects/stakeholder-raci.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.stakeholders.raci import (
    ACCOUNTABLE,
    CONSULTED,
    INFORMED,
    METHOD_ID,
    RECORD_ID_PREFIX,
    RESPONSIBLE,
    VALID_ROLES,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_raci_content_integrity_gate,
    evaluate_raci_gates,
    generate_raci_matrix,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RACI_MATRIX_SCHEMA = "ai-lego://specs/cognitive/typed-objects/stakeholder-raci.schema.yaml"
PROVENANCE = make_provenance("DECISION", "HUMAN_APPROVED")


def _task(task_name: str = "核准最終定價", assignments: list[dict] | None = None) -> dict:
    return {
        "task_name": task_name,
        "assignments": assignments
        if assignments is not None
        else [
            {"stakeholder_name": "產品負責人", "role": ACCOUNTABLE},
            {"stakeholder_name": "業務代表", "role": RESPONSIBLE},
            {"stakeholder_name": "財務長", "role": CONSULTED},
            {"stakeholder_name": "客服團隊", "role": INFORMED},
        ],
    }


def _kwargs(**overrides: object) -> dict:
    base = dict(tasks=[_task()], provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_matrix(*, record_id: str = "SRACI-T-001", **overrides: object):
    return generate_raci_matrix(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_matrix_validates_against_the_real_schema(self):
        self.contracts.validate(RACI_MATRIX_SCHEMA, _valid_matrix(), "raci matrix")

    def test_valid_matrix_with_multiple_tasks_validates(self):
        second_task = _task("撰寫發佈公告文案", [{"stakeholder_name": "行銷經理", "role": ACCOUNTABLE}, {"stakeholder_name": "文案編輯", "role": RESPONSIBLE}])
        self.contracts.validate(RACI_MATRIX_SCHEMA, _valid_matrix(tasks=[_task(), second_task]), "raci matrix, 2 tasks")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, matrix = live.invoke(METHOD_ID, generate_raci_matrix, "SRACI-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/stakeholders.raci.contract.yaml")
        self.assertEqual(matrix["id"], "SRACI-T-INVOKE")

    def test_empty_catalog_blocks_raci_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_matrix())
        tampered["tasks"][0]["assignments"][0]["role"] = "NOT_A_REAL_ROLE"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RACI_MATRIX_SCHEMA, tampered, "tampered matrix")
        gate = evaluate_raci_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        matrix = _valid_matrix()
        matrix["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RACI_MATRIX_SCHEMA, matrix, "matrix with a smuggled top-level key")

    def test_schema_rejects_an_unknown_task_key(self):
        matrix = _valid_matrix()
        matrix["tasks"][0]["owner"] = "smuggled"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RACI_MATRIX_SCHEMA, matrix, "matrix with a smuggled task key")

    def test_schema_rejects_an_unknown_assignment_key(self):
        matrix = _valid_matrix()
        matrix["tasks"][0]["assignments"][0]["notes"] = "smuggled"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RACI_MATRIX_SCHEMA, matrix, "matrix with a smuggled assignment key")

    def test_schema_rejects_empty_tasks(self):
        matrix = _valid_matrix()
        matrix["tasks"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RACI_MATRIX_SCHEMA, matrix, "matrix with empty tasks")

    def test_schema_rejects_invalid_role_value(self):
        matrix = _valid_matrix()
        matrix["tasks"][0]["assignments"][0]["role"] = "X"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RACI_MATRIX_SCHEMA, matrix, "matrix with an illegal role value")

    def test_id_is_distinct_from_the_future_f22_delivery_raci(self):
        """Disambiguation (task's own explicit instruction): this method's machine_id and record prefix must
        never collide with method-inventory.yaml's own pending F22 pm-governance 'RACI (delivery)' entry."""
        self.assertEqual(METHOD_ID, "stakeholders.raci")
        self.assertEqual(RECORD_ID_PREFIX, "SRACI-")
        self.assertNotEqual(RECORD_ID_PREFIX, "RACI-")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "stakeholders.raci.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "stakeholders.raci contract")


class StructuralNonEmptinessTests(unittest.TestCase):
    """Invariant #1 (module docstring): tasks/task_name/assignments/stakeholder_name each non-empty."""

    def test_well_formed_matrix_is_accepted(self):
        matrix = _valid_matrix()
        self.assertTrue(matrix["tasks"])
        self.assertTrue(matrix["tasks"][0]["task_name"])
        self.assertTrue(matrix["tasks"][0]["assignments"])

    def test_empty_tasks_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_EMPTY_TASKS"):
            _valid_matrix(tasks=[])

    def test_non_list_tasks_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_EMPTY_TASKS"):
            _valid_matrix(tasks="not-a-list")

    def test_empty_task_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_EMPTY_TASK_NAME"):
            _valid_matrix(tasks=[_task(task_name="   ")])

    def test_malformed_task_shape_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_INVALID_TASK"):
            _valid_matrix(tasks=[{"task_name": "只有名字沒有 assignments"}])

    def test_empty_assignments_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_EMPTY_ASSIGNMENTS"):
            _valid_matrix(tasks=[_task(assignments=[])])

    def test_malformed_assignment_shape_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_INVALID_ASSIGNMENT"):
            _valid_matrix(tasks=[_task(assignments=[{"stakeholder_name": "只有名字"}])])

    def test_empty_stakeholder_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_EMPTY_STAKEHOLDER_NAME"):
            _valid_matrix(tasks=[_task(assignments=[{"stakeholder_name": "   ", "role": ACCOUNTABLE}, {"stakeholder_name": "X", "role": RESPONSIBLE}])])


class ClosedRoleEnumTests(unittest.TestCase):
    """Invariant #2 (module docstring): role must be one of the closed {R, A, C, I} set."""

    def test_valid_roles_constant(self):
        self.assertEqual(VALID_ROLES, frozenset({"R", "A", "C", "I"}))

    def test_invalid_role_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_INVALID_ROLE"):
            _valid_matrix(tasks=[_task(assignments=[{"stakeholder_name": "X", "role": "A"}, {"stakeholder_name": "Y", "role": "Z"}])])

    def test_lowercase_role_is_refused(self):
        """Case-sensitive -- 'a' is not a legal substitute for 'A'."""
        with self.assertRaisesRegex(InvariantViolation, "RACI_INVALID_ROLE"):
            _valid_matrix(tasks=[_task(assignments=[{"stakeholder_name": "X", "role": "a"}, {"stakeholder_name": "Y", "role": "R"}])])

    def test_none_role_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_INVALID_ROLE"):
            _valid_matrix(tasks=[_task(assignments=[{"stakeholder_name": "X", "role": None}, {"stakeholder_name": "Y", "role": "R"}])])


class ExactlyOneAccountableTests(unittest.TestCase):
    """Invariant #3 (module docstring, the CORE real invariant): exactly 1 Accountable per task, never 0, never 2+."""

    def test_zero_accountable_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_TASK_NOT_EXACTLY_ONE_ACCOUNTABLE"):
            _valid_matrix(tasks=[_task(assignments=[{"stakeholder_name": "X", "role": RESPONSIBLE}, {"stakeholder_name": "Y", "role": CONSULTED}])])

    def test_two_accountable_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_TASK_NOT_EXACTLY_ONE_ACCOUNTABLE"):
            _valid_matrix(
                tasks=[
                    _task(
                        assignments=[
                            {"stakeholder_name": "X", "role": ACCOUNTABLE},
                            {"stakeholder_name": "Y", "role": ACCOUNTABLE},
                            {"stakeholder_name": "Z", "role": RESPONSIBLE},
                        ]
                    )
                ]
            )

    def test_exactly_one_accountable_is_accepted(self):
        matrix = _valid_matrix()
        accountable = [a for a in matrix["tasks"][0]["assignments"] if a["role"] == ACCOUNTABLE]
        self.assertEqual(len(accountable), 1)

    def test_same_stakeholder_as_both_responsible_and_accountable_is_accepted(self):
        """Real RACI practice: one person can legitimately hold BOTH R and A on the same task (2 separate
        assignment entries, same stakeholder_name, different role) -- this is NOT '2 Accountable'."""
        matrix = _valid_matrix(
            tasks=[_task(assignments=[{"stakeholder_name": "產品負責人", "role": RESPONSIBLE}, {"stakeholder_name": "產品負責人", "role": ACCOUNTABLE}])]
        )
        roles = {a["role"] for a in matrix["tasks"][0]["assignments"]}
        self.assertEqual(roles, {RESPONSIBLE, ACCOUNTABLE})


class DuplicateTaskNameTests(unittest.TestCase):
    """Critic-found gap (2026-09-11): the exactly-1-Accountable check above is counted PER LIST ENTRY, with
    no uniqueness check on task_name -- two tasks[] entries both named "Ship release", each with its own
    single Accountable, passed the per-entry check while the real-world task now has 2 people who each think
    they are the one Accountable. Reachable through the normal builder path, not just tampering."""

    def test_two_tasks_with_the_same_name_each_with_one_accountable_is_refused(self):
        duplicated = [_task("核准最終定價"), _task("核准最終定價")]
        with self.assertRaisesRegex(InvariantViolation, "RACI_DUPLICATE_TASK_NAME"):
            _valid_matrix(tasks=duplicated)

    def test_gate_catches_hand_tampered_duplicate_task_name(self):
        record = copy.deepcopy(_valid_matrix())
        record["tasks"].append(copy.deepcopy(record["tasks"][0]))
        gate = evaluate_raci_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_two_tasks_with_different_names_are_accepted(self):
        matrix = _valid_matrix(tasks=[_task("核准最終定價"), _task("撰寫發佈公告文案", [{"stakeholder_name": "行銷經理", "role": ACCOUNTABLE}, {"stakeholder_name": "文案編輯", "role": RESPONSIBLE}])])
        self.assertEqual(len(matrix["tasks"]), 2)


class AtLeastOneResponsibleTests(unittest.TestCase):
    """Invariant #4 (module docstring): every task needs at least 1 Responsible assignment."""

    def test_zero_responsible_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_TASK_MISSING_RESPONSIBLE"):
            _valid_matrix(tasks=[_task(assignments=[{"stakeholder_name": "X", "role": ACCOUNTABLE}, {"stakeholder_name": "Y", "role": CONSULTED}])])

    def test_one_responsible_is_accepted(self):
        matrix = _valid_matrix()
        responsible = [a for a in matrix["tasks"][0]["assignments"] if a["role"] == RESPONSIBLE]
        self.assertGreaterEqual(len(responsible), 1)

    def test_multiple_responsible_is_accepted(self):
        matrix = _valid_matrix(
            tasks=[_task(assignments=[{"stakeholder_name": "X", "role": ACCOUNTABLE}, {"stakeholder_name": "Y", "role": RESPONSIBLE}, {"stakeholder_name": "Z", "role": RESPONSIBLE}])]
        )
        responsible = [a for a in matrix["tasks"][0]["assignments"] if a["role"] == RESPONSIBLE]
        self.assertEqual(len(responsible), 2)


class ZeroConsultedOrInformedIsLegitimateTests(unittest.TestCase):
    """C and I carry no minimum-count requirement (module docstring, contract OQ-RACI-3) -- a task with only
    an Accountable+Responsible pair and zero C/zero I must be accepted, not conflated with a defect."""

    def test_task_with_only_accountable_and_responsible_is_accepted(self):
        matrix = _valid_matrix(tasks=[_task(assignments=[{"stakeholder_name": "X", "role": ACCOUNTABLE}, {"stakeholder_name": "Y", "role": RESPONSIBLE}])])
        roles = [a["role"] for a in matrix["tasks"][0]["assignments"]]
        self.assertNotIn(CONSULTED, roles)
        self.assertNotIn(INFORMED, roles)


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SRACI-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_INVALID_ID"):
            _valid_matrix(record_id="WRONG-PREFIX-001")

    def test_bare_raci_prefix_without_s_is_refused(self):
        """Disambiguation: bare RACI- (no leading S) must NOT satisfy this method's own id prefix -- the whole
        point of SRACI- is to never collide with a future bare-RACI- id."""
        with self.assertRaisesRegex(InvariantViolation, "RACI_INVALID_ID"):
            _valid_matrix(record_id="RACI-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_INVALID_ID"):
            _valid_matrix(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_INVALID_VERSION"):
            generate_raci_matrix("SRACI-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "RACI_INVALID_PROVENANCE"):
            _valid_matrix(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID matrix's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_matrix(self):
        results = evaluate_raci_gates(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_second_accountable(self):
        record = copy.deepcopy(_valid_matrix())
        record["tasks"][0]["assignments"].append({"stakeholder_name": "插入的第二個 Accountable", "role": ACCOUNTABLE})
        gate = evaluate_raci_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_removed_responsible(self):
        record = copy.deepcopy(_valid_matrix())
        record["tasks"][0]["assignments"] = [a for a in record["tasks"][0]["assignments"] if a["role"] != RESPONSIBLE]
        gate = evaluate_raci_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_task_name(self):
        record = copy.deepcopy(_valid_matrix())
        record["tasks"][0]["task_name"] = ""
        gate = evaluate_raci_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_invalid_role(self):
        record = copy.deepcopy(_valid_matrix())
        record["tasks"][0]["assignments"][0]["role"] = "Q"
        gate = evaluate_raci_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_raci_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_matrix())
        record["id"] = "WRONG-001"
        gate = evaluate_raci_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_matrix())
        record["version"] = 1
        gate = evaluate_raci_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_empty_tasks(self):
        record = copy.deepcopy(_valid_matrix())
        record["tasks"] = []
        gate = evaluate_raci_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_matrix())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_raci_gates_returns_two_gates_in_order(self):
        results = evaluate_raci_gates(_valid_matrix(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "raci_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "stakeholders.raci")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        matrix = _valid_matrix()
        self.assertEqual(set(matrix.keys()), {"id", "version", "generated_by_method", "tasks", "provenance"})

    def test_builder_does_not_leak_extra_task_or_assignment_keys(self):
        matrix = _valid_matrix()
        self.assertEqual(set(matrix["tasks"][0].keys()), {"task_name", "assignments"})
        self.assertEqual(set(matrix["tasks"][0]["assignments"][0].keys()), {"stakeholder_name", "role"})


if __name__ == "__main__":
    unittest.main()
