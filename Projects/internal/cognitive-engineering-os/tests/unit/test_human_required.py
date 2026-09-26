"""``ai_lego.platform.workflow.human_required`` (plan §3.4 C5, §12.8 WC-P3-02): the registry loader fails
closed, and ``missing_human_required`` finds exactly the value-judgment fields no human has filled in yet."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from ai_lego import resolve_spec_root
from ai_lego.errors import InvariantViolation
from ai_lego.platform.workflow.human_required import load_human_required, missing_human_required

REAL_SPEC_ROOT = resolve_spec_root()


def _node(method_id: str, bindings: dict[str, str]) -> dict:
    return {"node_kind": "method", "method_id": method_id, "bindings": bindings}


class LoadHumanRequiredTests(unittest.TestCase):
    def test_real_registry_lists_the_two_known_methods(self):
        registry = load_human_required(REAL_SPEC_ROOT)
        self.assertEqual(registry["decision.weighted_decision_matrix"], ["weights", "scores", "scale_min", "scale_max"])
        self.assertEqual(registry["epistemic.toulmin_model"], ["warrant", "qualifier"])

    def test_missing_registry_file_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(InvariantViolation, "HUMAN_REQUIRED_REGISTRY_MISSING"):
                load_human_required(Path(tmp))

    def test_malformed_registry_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            registry_dir = Path(tmp) / "methods" / "registry"
            registry_dir.mkdir(parents=True)
            (registry_dir / "method-human-required.yaml").write_text("decision.weighted_decision_matrix: not-a-list\n", encoding="utf-8")
            with self.assertRaisesRegex(InvariantViolation, "HUMAN_REQUIRED_REGISTRY_INVALID"):
                load_human_required(Path(tmp))

    def test_registry_with_a_non_string_list_item_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            registry_dir = Path(tmp) / "methods" / "registry"
            registry_dir.mkdir(parents=True)
            (registry_dir / "method-human-required.yaml").write_text("decision.weighted_decision_matrix: [weights, 3]\n", encoding="utf-8")
            with self.assertRaisesRegex(InvariantViolation, "HUMAN_REQUIRED_REGISTRY_INVALID"):
                load_human_required(Path(tmp))


class MissingHumanRequiredTests(unittest.TestCase):
    def setUp(self):
        self.human_required = {"decision.weighted_decision_matrix": ["weights", "scores"]}

    def test_no_missing_when_every_field_is_filled(self):
        workflow_ir = {"nodes": [_node("decision.weighted_decision_matrix", {"weights": "source.decision.weights", "scores": "source.decision.scores"})]}
        source = {"decision": {"weights": [{"criterion_id": "C1", "weight": 0.5}], "scores": [{"option_id": "O1", "criterion_id": "C1", "value": 3}]}}
        self.assertEqual(missing_human_required(workflow_ir, source, self.human_required), [])

    def test_none_value_is_missing(self):
        workflow_ir = {"nodes": [_node("decision.weighted_decision_matrix", {"weights": "source.decision.weights"})]}
        source = {"decision": {"weights": None}}
        result = missing_human_required(workflow_ir, source, self.human_required)
        self.assertEqual(result, [{"index": 0, "method_id": "decision.weighted_decision_matrix", "param": "weights", "path": "source.decision.weights"}])

    def test_empty_string_is_missing(self):
        workflow_ir = {"nodes": [_node("decision.weighted_decision_matrix", {"weights": "source.decision.weights"})]}
        source = {"decision": {"weights": ""}}
        self.assertEqual(len(missing_human_required(workflow_ir, source, self.human_required)), 1)

    def test_empty_list_is_missing(self):
        workflow_ir = {"nodes": [_node("decision.weighted_decision_matrix", {"weights": "source.decision.weights"})]}
        source = {"decision": {"weights": []}}
        self.assertEqual(len(missing_human_required(workflow_ir, source, self.human_required)), 1)

    def test_empty_dict_is_missing(self):
        workflow_ir = {"nodes": [_node("decision.weighted_decision_matrix", {"weights": "source.decision.weights"})]}
        source = {"decision": {"weights": {}}}
        self.assertEqual(len(missing_human_required(workflow_ir, source, self.human_required)), 1)

    def test_absent_key_entirely_is_missing(self):
        workflow_ir = {"nodes": [_node("decision.weighted_decision_matrix", {"weights": "source.decision.weights"})]}
        source = {"decision": {}}
        self.assertEqual(len(missing_human_required(workflow_ir, source, self.human_required)), 1)

    def test_zero_is_not_treated_as_missing(self):
        workflow_ir = {"nodes": [_node("decision.weighted_decision_matrix", {"scale_min": "source.decision.scale_min"})]}
        source = {"decision": {"scale_min": 0}}
        self.assertEqual(missing_human_required(workflow_ir, source, {"decision.weighted_decision_matrix": ["scale_min"]}), [])

    def test_false_is_not_treated_as_missing(self):
        workflow_ir = {"nodes": [_node("decision.weighted_decision_matrix", {"weights": "source.decision.weights"})]}
        source = {"decision": {"weights": False}}
        self.assertEqual(missing_human_required(workflow_ir, source, self.human_required), [])

    def test_param_not_bound_to_source_is_not_checked(self):
        workflow_ir = {"nodes": [_node("decision.weighted_decision_matrix", {"weights": "outputs.upstream_step"})]}
        source = {}
        self.assertEqual(missing_human_required(workflow_ir, source, self.human_required), [])

    def test_method_not_in_registry_is_never_flagged(self):
        workflow_ir = {"nodes": [_node("framing.problem_statement", {"gap": "source.problem.gap"})]}
        source = {"problem": {"gap": ""}}
        self.assertEqual(missing_human_required(workflow_ir, source, self.human_required), [])

    def test_multiple_missing_fields_across_nodes_are_all_reported_with_correct_index(self):
        workflow_ir = {
            "nodes": [
                _node("framing.problem_statement", {"gap": "source.problem.gap"}),
                _node("decision.weighted_decision_matrix", {"weights": "source.decision.weights", "scores": "source.decision.scores"}),
            ]
        }
        source = {"problem": {"gap": "ok"}, "decision": {"weights": [], "scores": None}}
        result = missing_human_required(workflow_ir, source, self.human_required)
        self.assertEqual(
            sorted(result, key=lambda r: r["param"]),
            [
                {"index": 1, "method_id": "decision.weighted_decision_matrix", "param": "scores", "path": "source.decision.scores"},
                {"index": 1, "method_id": "decision.weighted_decision_matrix", "param": "weights", "path": "source.decision.weights"},
            ],
        )

    def test_non_method_nodes_are_skipped(self):
        workflow_ir = {"nodes": [{"node_kind": "capability", "ref": "some.capability", "bindings": {}}]}
        self.assertEqual(missing_human_required(workflow_ir, {}, self.human_required), [])


if __name__ == "__main__":
    unittest.main()
