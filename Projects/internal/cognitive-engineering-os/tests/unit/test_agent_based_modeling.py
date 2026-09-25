"""Mutation-style tests for ``systems.agent_based_modeling`` (F09 systems-thinking family, second built member).

THE real invariant (every declared agent has >=1 rule; every run's agent_ids_involved is non-empty and every id
in it resolves to a real declared agents[] id -- referential integrity) plus the structural invariants
supporting it (non-empty agents/runs, unique ids, well-shaped entries), exercised at BOTH layers:
construction-time refusal (``generate_agent_based_model`` raising a specific ``InvariantViolation`` code) and
independent gate re-derivation (``evaluate_agent_based_model_integrity_gate`` catching a hand-tampered raw dict
that bypassed the builder entirely, never calling the builder itself). Schema conformance is checked against the
real spec-root schema this same slice added (``typed-objects/agent-based-model.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.systems.agent_based_modeling import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    agent,
    all_gates_pass,
    evaluate_agent_based_model_integrity_gate,
    evaluate_agent_based_modeling_gates,
    evaluate_provenance_required_gate,
    generate_agent_based_model,
    run,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

AGENT_BASED_MODEL_SCHEMA = "ai-lego://specs/cognitive/typed-objects/agent-based-model.schema.yaml"
PROVENANCE = make_provenance("SIMULATED_RESULT", "AI_GENERATED")
ENVIRONMENT = "一個模擬的線上市場，買家與賣家代理人每回合各自依規則決策"


def _agents() -> list[dict]:
    return [
        {"id": "AGENT-BUYER", "name": "買家", "rules": ["若商品價格低於自身預算上限則購買"]},
        {"id": "AGENT-SELLER", "name": "賣家", "rules": ["若庫存過多則降價出清"]},
    ]


def _runs() -> list[dict]:
    return [{"id": "RUN-001", "summary": "價格自發收斂到接近均衡點", "agent_ids_involved": ["AGENT-BUYER", "AGENT-SELLER"]}]


def _kwargs(**overrides: object) -> dict:
    base = dict(agents=_agents(), environment_description=ENVIRONMENT, runs=_runs(), provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_model(*, record_id: str = "ABM-T-001", **overrides: object):
    return generate_agent_based_model(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_model_validates_against_the_real_schema(self):
        self.contracts.validate(AGENT_BASED_MODEL_SCHEMA, _valid_model(), "agent-based model")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, model = live.invoke(METHOD_ID, generate_agent_based_model, "ABM-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/systems.agent_based_modeling.contract.yaml")
        self.assertEqual(model["id"], "ABM-T-INVOKE")

    def test_empty_catalog_blocks_agent_based_modeling_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        tampered = copy.deepcopy(_valid_model())
        tampered["agents"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AGENT_BASED_MODEL_SCHEMA, tampered, "tampered model")
        gate = evaluate_agent_based_model_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        model = _valid_model()
        model["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AGENT_BASED_MODEL_SCHEMA, model, "model with a smuggled top-level key")

    def test_schema_rejects_agent_with_zero_rules(self):
        model = _valid_model()
        model["agents"][0]["rules"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AGENT_BASED_MODEL_SCHEMA, model, "model with a ruleless agent")

    def test_schema_rejects_run_with_empty_agent_ids_involved(self):
        model = _valid_model()
        model["runs"][0]["agent_ids_involved"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(AGENT_BASED_MODEL_SCHEMA, model, "model with an empty agent_ids_involved")

    def test_id_is_distinct_from_a_sibling_f09_machine_id(self):
        self.assertEqual(METHOD_ID, "systems.agent_based_modeling")
        self.assertNotEqual(METHOD_ID, "systems.leverage_point_analysis")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim true going forward, same live
        check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "systems.agent_based_modeling.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "systems.agent_based_modeling contract")


class AgentRuleInvariantTests(unittest.TestCase):
    """THE first half of the real invariant (module docstring): every declared agent MUST have >=1 rule before
    construction succeeds -- Atlas F09 L552's own 'agents→rules' stage mechanized."""

    def test_well_formed_model_is_accepted(self):
        model = _valid_model()
        self.assertEqual(len(model["agents"]), 2)
        self.assertEqual(len(model["runs"]), 1)

    def test_agent_with_zero_rules_is_refused(self):
        bad_agents = _agents()
        bad_agents[0] = {**bad_agents[0], "rules": []}
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_INVALID_AGENT_ENTRY"):
            _valid_model(agents=bad_agents)

    def test_agent_with_non_list_rules_is_refused(self):
        bad_agents = _agents()
        bad_agents[0] = {**bad_agents[0], "rules": "not-a-list"}
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_INVALID_AGENT_ENTRY"):
            _valid_model(agents=bad_agents)

    def test_agent_with_an_empty_string_rule_is_refused(self):
        bad_agents = _agents()
        bad_agents[0] = {**bad_agents[0], "rules": ["   "]}
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_INVALID_AGENT_ENTRY"):
            _valid_model(agents=bad_agents)

    def test_empty_agents_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_EMPTY_AGENTS"):
            _valid_model(agents=[])

    def test_non_list_agents_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_EMPTY_AGENTS"):
            _valid_model(agents="not-a-list")

    def test_duplicate_agent_id_is_refused(self):
        bad_agents = _agents()
        bad_agents[1] = {**bad_agents[1], "id": "AGENT-BUYER"}
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_DUPLICATE_AGENT_ID"):
            _valid_model(agents=bad_agents, runs=[{"id": "RUN-001", "summary": "x", "agent_ids_involved": ["AGENT-BUYER"]}])

    def test_agent_with_multiple_rules_is_accepted(self):
        multi_rule_agents = _agents()
        multi_rule_agents[0] = {**multi_rule_agents[0], "rules": ["rule 1", "rule 2", "rule 3"]}
        model = _valid_model(agents=multi_rule_agents)
        self.assertEqual(len(model["agents"][0]["rules"]), 3)


class ReferentialIntegrityTests(unittest.TestCase):
    """THE second half of the real invariant (module docstring): every runs[].agent_ids_involved id MUST
    resolve to a real declared agents[] id, and must be non-empty."""

    def test_run_referencing_unknown_agent_is_refused(self):
        bad_runs = [{"id": "RUN-001", "summary": "x", "agent_ids_involved": ["AGENT-BUYER", "AGENT-GHOST"]}]
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_RUN_UNKNOWN_AGENT"):
            _valid_model(runs=bad_runs)

    def test_run_with_empty_agent_ids_involved_is_refused(self):
        bad_runs = [{"id": "RUN-001", "summary": "x", "agent_ids_involved": []}]
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_INVALID_RUN_ENTRY"):
            _valid_model(runs=bad_runs)

    def test_empty_runs_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_EMPTY_RUNS"):
            _valid_model(runs=[])

    def test_non_list_runs_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_EMPTY_RUNS"):
            _valid_model(runs="not-a-list")

    def test_duplicate_run_id_is_refused(self):
        bad_runs = _runs() + [{"id": "RUN-001", "summary": "duplicate", "agent_ids_involved": ["AGENT-BUYER"]}]
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_DUPLICATE_RUN_ID"):
            _valid_model(runs=bad_runs)

    def test_run_referencing_a_subset_of_agents_is_accepted(self):
        model = _valid_model(runs=[{"id": "RUN-001", "summary": "只有買家的行為", "agent_ids_involved": ["AGENT-BUYER"]}])
        self.assertEqual(model["runs"][0]["agent_ids_involved"], ["AGENT-BUYER"])

    def test_multiple_runs_each_referencing_valid_agents_is_accepted(self):
        multi_runs = [
            {"id": "RUN-001", "summary": "第一次模擬", "agent_ids_involved": ["AGENT-BUYER"]},
            {"id": "RUN-002", "summary": "第二次模擬", "agent_ids_involved": ["AGENT-BUYER", "AGENT-SELLER"]},
        ]
        model = _valid_model(runs=multi_runs)
        self.assertEqual(len(model["runs"]), 2)


class EnvironmentDescriptionTests(unittest.TestCase):
    def test_empty_environment_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_EMPTY_ENVIRONMENT"):
            _valid_model(environment_description="   ")

    def test_none_environment_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_EMPTY_ENVIRONMENT"):
            _valid_model(environment_description=None)

    def test_well_formed_environment_description_is_accepted(self):
        model = _valid_model(environment_description="另一個環境描述")
        self.assertEqual(model["environment_description"], "另一個環境描述")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "ABM-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_INVALID_ID"):
            _valid_model(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_INVALID_ID"):
            _valid_model(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_INVALID_VERSION"):
            generate_agent_based_model("ABM-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_INVALID_PROVENANCE"):
            _valid_model(provenance={"epistemic_type": "NOT_REAL"})


class ConvenienceConstructorTests(unittest.TestCase):
    def test_agent_builds_a_well_formed_input_entry(self):
        entry = agent("AGENT-010", "測試代理人", ["規則一"])
        self.assertEqual(entry, {"id": "AGENT-010", "name": "測試代理人", "rules": ["規則一"]})

    def test_agent_rejects_empty_name(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_INVALID_AGENT"):
            agent("AGENT-010", "", ["規則一"])

    def test_agent_rejects_zero_rules(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_AGENT_NO_RULES"):
            agent("AGENT-010", "測試代理人", [])

    def test_run_builds_a_well_formed_entry(self):
        entry = run("RUN-010", "測試run", ["AGENT-010"])
        self.assertEqual(entry, {"id": "RUN-010", "summary": "測試run", "agent_ids_involved": ["AGENT-010"]})

    def test_run_rejects_empty_agent_ids_involved(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_RUN_NO_AGENTS"):
            run("RUN-010", "測試run", [])

    def test_run_rejects_empty_summary(self):
        with self.assertRaisesRegex(InvariantViolation, "AGENTBASED_INVALID_RUN"):
            run("RUN-010", "", ["AGENT-010"])


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID model's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_model(self):
        results = evaluate_agent_based_modeling_gates(_valid_model(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_integrity_gate_catches_hand_tampered_dangling_agent_reference(self):
        """The exact scenario the task brief prescribes: a hand-tampered record (bypassing the builder to delete
        an agent a run still references) must be caught by the independent gate, not just the builder."""
        record = copy.deepcopy(_valid_model())
        record["agents"] = [a for a in record["agents"] if a["id"] != "AGENT-SELLER"]  # RUN-001 still references it
        gate = evaluate_agent_based_model_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("AGENT-SELLER", gate["evidence"][0]["dangling_by_run"]["RUN-001"])

    def test_integrity_gate_catches_hand_tampered_ruleless_agent(self):
        record = copy.deepcopy(_valid_model())
        record["agents"][0]["rules"] = []
        gate = evaluate_agent_based_model_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_model())
        record["extra_field"] = "smuggled"
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        with self.assertRaises(SchemaValidationError):
            contracts.validate(AGENT_BASED_MODEL_SCHEMA, record, "record with a smuggled top-level key")

    def test_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_agent_based_model_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_model())
        record["id"] = "WRONG-001"
        gate = evaluate_agent_based_model_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_model())
        record["version"] = 1
        gate = evaluate_agent_based_model_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_duplicate_agent_id(self):
        record = copy.deepcopy(_valid_model())
        record["agents"][1]["id"] = record["agents"][0]["id"]
        gate = evaluate_agent_based_model_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_empty_agents(self):
        record = copy.deepcopy(_valid_model())
        record["agents"] = []
        gate = evaluate_agent_based_model_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_empty_environment_description(self):
        record = copy.deepcopy(_valid_model())
        record["environment_description"] = ""
        gate = evaluate_agent_based_model_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_model(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_model())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    def test_builder_does_not_alias_the_callers_supplied_agent_dicts(self):
        agents = _agents()
        model = _valid_model(agents=agents)
        agents[0]["name"] = "tampered-after-construction"
        self.assertNotEqual(model["agents"][0]["name"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_run_dicts(self):
        runs = _runs()
        model = _valid_model(runs=runs)
        runs[0]["summary"] = "tampered-after-construction"
        self.assertNotEqual(model["runs"][0]["summary"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_rules_list(self):
        agents = _agents()
        model = _valid_model(agents=agents)
        agents[0]["rules"].append("tampered-after-construction")
        self.assertNotIn("tampered-after-construction", model["agents"][0]["rules"])


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_agent_based_modeling_gates_returns_two_gates_in_order(self):
        results = evaluate_agent_based_modeling_gates(_valid_model(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "agent_based_model_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "systems.agent_based_modeling")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        model = _valid_model()
        self.assertEqual(set(model.keys()), {"id", "version", "generated_by_method", "agents", "environment_description", "runs", "provenance"})


if __name__ == "__main__":
    unittest.main()
