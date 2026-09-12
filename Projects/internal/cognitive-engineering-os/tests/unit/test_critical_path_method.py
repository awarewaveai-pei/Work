"""Mutation-style tests for ``delivery.critical_path_method`` (F22 PM/Delivery/Governance family, Atlas
L919, §12.41).

Proves the forward/backward pass is REAL, not hand-waved, using a 4-task diamond DAG fixture (A->B->D and
A->C->D, B longer than C) where the critical path is genuinely NOT "all tasks" -- C carries real slack.
Both independent layers are exercised: the construction-time builder refuses a cyclic dependency graph, a
dangling dependency, and a caller-smuggled computed field, and the independent ``cpm_integrity`` gate
re-derives the entire forward/backward pass directly from a raw (possibly hand-tampered) dict, never
trusting that the builder's own computation already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.compute.critical_path.forward_backward_pass import compute_critical_path, topological_order
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.delivery.critical_path_method import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_cpm_integrity_gate,
    evaluate_critical_path_method_gates,
    evaluate_provenance_required_gate,
    generate_critical_path_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

CPM_SCHEMA = "ai-lego://specs/cognitive/typed-objects/critical-path-analysis-record.schema.yaml"
PROVENANCE = make_provenance("CALCULATED_RESULT", "AI_GENERATED")


def _diamond_kwargs(**overrides: object) -> dict:
    """A->B->D and A->C->D, B (duration 5) longer than C (duration 2) -- critical path is A,B,D
    (project_duration 10); C is a genuine non-critical branch with slack 3."""
    base = dict(
        tasks=[
            {"task_id": "A", "duration": 2, "depends_on": []},
            {"task_id": "B", "duration": 5, "depends_on": ["A"]},
            {"task_id": "C", "duration": 2, "depends_on": ["A"]},
            {"task_id": "D", "duration": 3, "depends_on": ["B", "C"]},
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "CPM-T-001", **overrides: object):
    return generate_critical_path_analysis(record_id, **_diamond_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(CPM_SCHEMA, _valid_analysis(), "critical path analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_critical_path_analysis, "CPM-T-INVOKE", **_diamond_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/delivery.critical_path_method.contract.yaml")
        self.assertEqual(analysis["id"], "CPM-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CPM_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_a_task_missing_a_computed_field(self):
        analysis = _valid_analysis()
        del analysis["tasks"][0]["slack"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CPM_SCHEMA, analysis, "analysis with a task missing slack")

    def test_schema_rejects_an_unknown_key_on_a_task_entry(self):
        analysis = _valid_analysis()
        analysis["tasks"][0]["is_critical"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CPM_SCHEMA, analysis, "analysis with a smuggled task-level key")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "delivery.critical_path_method.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "delivery.critical_path_method contract")


class ForwardBackwardPassCorrectnessTests(unittest.TestCase):
    """Proves the algorithm itself is correct against a hand-verified diamond DAG, not just that
    SOMETHING gets returned."""

    def test_diamond_dag_produces_the_hand_verified_critical_path(self):
        analysis = _valid_analysis()
        self.assertEqual(analysis["critical_path"], ["A", "B", "D"])
        self.assertEqual(analysis["project_duration"], 10)

    def test_diamond_dag_produces_hand_verified_per_task_schedule(self):
        analysis = _valid_analysis()
        by_id = {t["task_id"]: t for t in analysis["tasks"]}
        # Hand-computed forward pass: A ES=0 EF=2; B ES=2 EF=7; C ES=2 EF=4; D ES=7 EF=10.
        self.assertEqual((by_id["A"]["earliest_start"], by_id["A"]["earliest_finish"]), (0, 2))
        self.assertEqual((by_id["B"]["earliest_start"], by_id["B"]["earliest_finish"]), (2, 7))
        self.assertEqual((by_id["C"]["earliest_start"], by_id["C"]["earliest_finish"]), (2, 4))
        self.assertEqual((by_id["D"]["earliest_start"], by_id["D"]["earliest_finish"]), (7, 10))
        # Hand-computed backward pass: A LS=0 LF=2; B LS=2 LF=7; C LS=5 LF=7; D LS=7 LF=10.
        self.assertEqual((by_id["A"]["latest_start"], by_id["A"]["latest_finish"]), (0, 2))
        self.assertEqual((by_id["B"]["latest_start"], by_id["B"]["latest_finish"]), (2, 7))
        self.assertEqual((by_id["C"]["latest_start"], by_id["C"]["latest_finish"]), (5, 7))
        self.assertEqual((by_id["D"]["latest_start"], by_id["D"]["latest_finish"]), (7, 10))
        # Slack: A=0, B=0, C=3 (genuinely non-critical), D=0.
        self.assertEqual(by_id["A"]["slack"], 0)
        self.assertEqual(by_id["B"]["slack"], 0)
        self.assertEqual(by_id["C"]["slack"], 3)
        self.assertEqual(by_id["D"]["slack"], 0)

    def test_c_is_not_on_the_declared_critical_path(self):
        """The genuinely non-critical branch is NOT included -- the critical path is not simply 'all tasks'."""
        analysis = _valid_analysis()
        self.assertNotIn("C", analysis["critical_path"])

    def test_single_task_no_dependencies(self):
        analysis = generate_critical_path_analysis(
            "CPM-T-002", tasks=[{"task_id": "A", "duration": 5, "depends_on": []}], provenance=PROVENANCE
        )
        self.assertEqual(analysis["critical_path"], ["A"])
        self.assertEqual(analysis["project_duration"], 5)

    def test_linear_chain_critical_path_is_every_task(self):
        analysis = generate_critical_path_analysis(
            "CPM-T-003",
            tasks=[
                {"task_id": "A", "duration": 1, "depends_on": []},
                {"task_id": "B", "duration": 2, "depends_on": ["A"]},
                {"task_id": "C", "duration": 3, "depends_on": ["B"]},
            ],
            provenance=PROVENANCE,
        )
        self.assertEqual(analysis["critical_path"], ["A", "B", "C"])
        self.assertEqual(analysis["project_duration"], 6)

    def test_zero_duration_task_is_legal(self):
        analysis = generate_critical_path_analysis(
            "CPM-T-004", tasks=[{"task_id": "A", "duration": 0, "depends_on": []}], provenance=PROVENANCE
        )
        self.assertEqual(analysis["project_duration"], 0)
        self.assertEqual(analysis["tasks"][0]["slack"], 0)


class ComputeModuleDirectTests(unittest.TestCase):
    """Direct tests of the Trusted Compute layer, independent of the method module."""

    def test_topological_order_respects_dependencies(self):
        order = topological_order([
            {"task_id": "A", "duration": 1, "depends_on": []},
            {"task_id": "B", "duration": 1, "depends_on": ["A"]},
        ])
        self.assertEqual(order, ["A", "B"])

    def test_topological_order_raises_on_a_two_node_cycle(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_CYCLE_DETECTED"):
            topological_order([
                {"task_id": "X", "duration": 1, "depends_on": ["Y"]},
                {"task_id": "Y", "duration": 1, "depends_on": ["X"]},
            ])

    def test_topological_order_raises_on_a_self_loop(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_CYCLE_DETECTED"):
            topological_order([{"task_id": "A", "duration": 1, "depends_on": ["A"]}])

    def test_topological_order_raises_on_a_three_node_cycle(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_CYCLE_DETECTED"):
            topological_order([
                {"task_id": "A", "duration": 1, "depends_on": ["C"]},
                {"task_id": "B", "duration": 1, "depends_on": ["A"]},
                {"task_id": "C", "duration": 1, "depends_on": ["B"]},
            ])

    def test_compute_critical_path_raises_on_dangling_dependency(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_DANGLING_DEPENDENCY"):
            compute_critical_path([{"task_id": "A", "duration": 1, "depends_on": ["GHOST"]}])


class CycleAndReferentialIntegrityTests(unittest.TestCase):
    def test_cyclic_dependency_graph_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_CYCLE_DETECTED"):
            generate_critical_path_analysis(
                "CPM-T-005",
                tasks=[
                    {"task_id": "X", "duration": 1, "depends_on": ["Y"]},
                    {"task_id": "Y", "duration": 1, "depends_on": ["X"]},
                ],
                provenance=PROVENANCE,
            )

    def test_dangling_dependency_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_DANGLING_DEPENDENCY"):
            generate_critical_path_analysis(
                "CPM-T-006", tasks=[{"task_id": "A", "duration": 1, "depends_on": ["GHOST"]}], provenance=PROVENANCE
            )

    def test_duplicate_task_id_is_refused(self):
        kwargs = _diamond_kwargs()
        kwargs["tasks"].append({"task_id": "A", "duration": 9, "depends_on": []})
        with self.assertRaisesRegex(InvariantViolation, "CPM_DUPLICATE_TASK_ID"):
            generate_critical_path_analysis("CPM-T-007", **kwargs)


class RawTaskShapeTests(unittest.TestCase):
    def test_negative_duration_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_INVALID_TASKS"):
            generate_critical_path_analysis("CPM-T-008", tasks=[{"task_id": "A", "duration": -1, "depends_on": []}], provenance=PROVENANCE)

    def test_boolean_duration_is_refused_not_silently_coerced(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_INVALID_TASKS"):
            generate_critical_path_analysis("CPM-T-009", tasks=[{"task_id": "A", "duration": True, "depends_on": []}], provenance=PROVENANCE)

    def test_float_duration_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_INVALID_TASKS"):
            generate_critical_path_analysis("CPM-T-010", tasks=[{"task_id": "A", "duration": 1.5, "depends_on": []}], provenance=PROVENANCE)

    def test_blank_task_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_INVALID_TASKS"):
            generate_critical_path_analysis("CPM-T-011", tasks=[{"task_id": "  ", "duration": 1, "depends_on": []}], provenance=PROVENANCE)

    def test_empty_tasks_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_TOO_FEW_TASKS"):
            generate_critical_path_analysis("CPM-T-012", tasks=[], provenance=PROVENANCE)

    def test_extra_computed_field_on_raw_builder_input_is_silently_dropped(self):
        """The builder extracts only task_id/duration/depends_on via .get() (same style
        ``foresight.cross_impact_analysis.event()`` already establishes) -- an extra ``earliest_start`` on
        the caller's raw input dict never reaches the constructed raw task, and the REAL computed value is
        what ends up in the record, not the caller's smuggled one. The independent ``cpm_integrity`` gate
        (below) is what actually refuses an unknown key on an already-STORED record."""
        kwargs = _diamond_kwargs()
        kwargs["tasks"][0]["earliest_start"] = 999
        analysis = generate_critical_path_analysis("CPM-T-013", **kwargs)
        self.assertEqual(analysis["tasks"][0]["earliest_start"], 0)  # the REAL computed value for A, not 999

    def test_extra_is_critical_key_on_raw_builder_input_is_silently_dropped(self):
        kwargs = _diamond_kwargs()
        kwargs["tasks"][0]["is_critical"] = True
        analysis = generate_critical_path_analysis("CPM-T-014", **kwargs)
        self.assertNotIn("is_critical", analysis["tasks"][0])



class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _diamond_kwargs()
        analysis = generate_critical_path_analysis("CPM-T-015", **kwargs)
        kwargs["tasks"][0]["duration"] = 999
        self.assertEqual(analysis["tasks"][0]["duration"], 2)


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_critical_path_method_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_cpm_integrity_gate_catches_a_genuinely_non_critical_task_hand_inserted_into_critical_path(self):
        """THE required proof: task C has real slack 3 (not on the true critical path) -- hand-inserting
        it into critical_path MUST be caught by independently recomputing slack from raw fields, not by
        trusting the stored (possibly-tampered) critical_path list."""
        record = copy.deepcopy(_valid_analysis())
        record["critical_path"] = ["A", "C", "D"]  # C is NOT critical -- slack 3
        gate = evaluate_cpm_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_cpm_integrity_gate_catches_a_tampered_slack_value(self):
        record = copy.deepcopy(_valid_analysis())
        for t in record["tasks"]:
            if t["task_id"] == "C":
                t["slack"] = 0  # lie: C's real slack is 3
        gate = evaluate_cpm_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_cpm_integrity_gate_catches_a_tampered_project_duration(self):
        record = copy.deepcopy(_valid_analysis())
        record["project_duration"] = 999
        gate = evaluate_cpm_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_cpm_integrity_gate_catches_a_broken_non_adjacent_critical_path(self):
        """A and D are both genuinely zero-slack, but A->D is not a declared dependency edge (the real
        edges are A->B->D) -- a path skipping the middle is not a genuine chain."""
        record = copy.deepcopy(_valid_analysis())
        record["critical_path"] = ["A", "D"]
        gate = evaluate_cpm_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_cpm_integrity_gate_passes_the_genuine_critical_path(self):
        gate = evaluate_cpm_integrity_gate(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_cpm_integrity_gate_catches_an_undeclared_task_id_in_critical_path(self):
        record = copy.deepcopy(_valid_analysis())
        record["critical_path"] = ["A", "GHOST", "D"]
        gate = evaluate_cpm_integrity_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_critical_path_method_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_analysis())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CPM-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_INVALID_VERSION"):
            generate_critical_path_analysis("CPM-T-016", **{**_diamond_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CPM_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "delivery.critical_path_method")

    def test_evaluate_gates_returns_two_gates_in_order(self):
        results = evaluate_critical_path_method_gates(_valid_analysis(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "cpm_integrity"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "tasks", "critical_path", "project_duration", "computation_provenance_ref", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """Same defect class the F13/F15 batches' own critic passes found (builders returning the caller's
    provenance dict BY REFERENCE) -- guarded here from the start via copy.deepcopy at return."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_analysis()
        provenance = make_provenance("CALCULATED_RESULT", "AI_GENERATED")
        record = generate_critical_path_analysis(base["id"], [{"task_id": "A", "duration": 1, "depends_on": []}], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "CALCULATED_RESULT")


if __name__ == "__main__":
    unittest.main()
