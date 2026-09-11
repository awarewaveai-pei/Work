"""Mutation-style tests for ``stakeholders.game_theory`` (F07 stakeholder/power/negotiation family, OPENING
member).

THE real invariant (payoff completeness, §12.19's own "Payoff 設錯，模型再漂亮也無用") plus the structural
invariants supporting it (players >=2 and unique, every player has >=1 strategy, every strategy/payoff
reference resolves, no duplicates, payoff values are genuine numbers excluding Python's bool-is-int-subclass
trap), exercised at BOTH layers: construction-time refusal (``generate_game_theory_model`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation (``evaluate_game_theory_content_integrity_gate``
catching a hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself). Schema
conformance is checked against the real spec-root schema this same slice added
(``typed-objects/game-theory.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.stakeholders.game_theory import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_game_theory_content_integrity_gate,
    evaluate_game_theory_gates,
    evaluate_provenance_required_gate,
    generate_game_theory_model,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

GAME_THEORY_MODEL_SCHEMA = "ai-lego://specs/cognitive/typed-objects/game-theory.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")


def _players() -> list[dict]:
    return [
        {"id": "P1", "name": "平台 A"},
        {"id": "P2", "name": "平台 B"},
    ]


def _strategies() -> list[dict]:
    return [
        {"player_id": "P1", "strategy_id": "S1", "name": "維持現有補貼"},
        {"player_id": "P1", "strategy_id": "S2", "name": "調漲車資 10%"},
        {"player_id": "P2", "strategy_id": "S1", "name": "維持現有補貼"},
        {"player_id": "P2", "strategy_id": "S2", "name": "調漲車資 10%"},
    ]


def _payoffs() -> list[dict]:
    return [
        {"player_id": "P1", "strategy_id": "S1", "value": 15},
        {"player_id": "P1", "strategy_id": "S2", "value": -8},
        {"player_id": "P2", "strategy_id": "S1", "value": 12},
        {"player_id": "P2", "strategy_id": "S2", "value": -5},
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        players=_players(),
        strategies=_strategies(),
        payoffs=_payoffs(),
        equilibrium="雙方皆維持現有補貼（S1）是穩定策略組合，任一方片面調漲車資預期 payoff 由正轉負。",
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_model(*, record_id: str = "GAMETH-T-001", **overrides: object):
    return generate_game_theory_model(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_model_validates_against_the_real_schema(self):
        self.contracts.validate(GAME_THEORY_MODEL_SCHEMA, _valid_model(), "game theory model")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, model = live.invoke(METHOD_ID, generate_game_theory_model, "GAMETH-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/stakeholders.game_theory.contract.yaml")
        self.assertEqual(model["id"], "GAMETH-T-INVOKE")

    def test_empty_catalog_blocks_game_theory_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_model())
        tampered["payoffs"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(GAME_THEORY_MODEL_SCHEMA, tampered, "tampered model")
        gate = evaluate_game_theory_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        model = _valid_model()
        model["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(GAME_THEORY_MODEL_SCHEMA, model, "model with a smuggled top-level key")

    def test_schema_rejects_missing_equilibrium(self):
        model = _valid_model()
        del model["equilibrium"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(GAME_THEORY_MODEL_SCHEMA, model, "model with equilibrium removed")

    def test_schema_rejects_non_numeric_payoff_value(self):
        model = _valid_model()
        model["payoffs"][0]["value"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(GAME_THEORY_MODEL_SCHEMA, model, "model with a non-numeric payoff value")

    def test_id_is_distinct_from_a_sibling_f07_machine_id(self):
        self.assertEqual(METHOD_ID, "stakeholders.game_theory")
        self.assertNotEqual(METHOD_ID, "stakeholders.stakeholder_map")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "stakeholders.game_theory.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "stakeholders.game_theory contract")


class PayoffCompletenessTests(unittest.TestCase):
    """THE real invariant (module docstring): every declared (player, strategy) pair MUST have exactly one
    payoff before equilibrium can be accepted -- §12.19's own 'Payoff 設錯，模型再漂亮也無用' mechanized."""

    def test_well_formed_model_is_accepted(self):
        model = _valid_model()
        self.assertEqual(len(model["payoffs"]), 4)

    def test_dropping_one_strategys_payoff_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_PAYOFF_INCOMPLETE"):
            _valid_model(payoffs=_payoffs()[:-1])

    def test_dropping_all_payoffs_for_one_player_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_PAYOFF_INCOMPLETE"):
            _valid_model(payoffs=[p for p in _payoffs() if p["player_id"] != "P2"])

    def test_payoff_referencing_unknown_strategy_is_refused(self):
        bad_payoffs = _payoffs() + [{"player_id": "P1", "strategy_id": "S99", "value": 1}]
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_PAYOFF_UNKNOWN_STRATEGY"):
            _valid_model(payoffs=bad_payoffs)

    def test_duplicate_payoff_for_same_strategy_is_refused(self):
        bad_payoffs = _payoffs() + [{"player_id": "P1", "strategy_id": "S1", "value": 999}]
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_PAYOFF_DUPLICATE"):
            _valid_model(payoffs=bad_payoffs)

    def test_non_numeric_payoff_value_is_refused(self):
        bad_payoffs = _payoffs()
        bad_payoffs[0] = {**bad_payoffs[0], "value": "high"}
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_PAYOFF"):
            _valid_model(payoffs=bad_payoffs)

    def test_boolean_payoff_value_is_refused(self):
        """Python's bool is an int subclass -- a bare isinstance(value, (int, float)) would silently accept
        True/False as payoffs 1/0. Must be explicitly refused."""
        bad_payoffs = _payoffs()
        bad_payoffs[0] = {**bad_payoffs[0], "value": True}
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_PAYOFF"):
            _valid_model(payoffs=bad_payoffs)

    def test_nan_payoff_value_is_refused(self):
        """Critic-found gap (2026-09-11): _is_number_excluding_bool guarded bool but not NaN/inf. NaN makes
        every payoff comparison False, so a NaN payoff would defeat GAMETH_PAYOFF_DUPLICATE/UNKNOWN_STRATEGY
        checks downstream while satisfying isinstance(value, (int, float)) -- must be refused up front."""
        bad_payoffs = _payoffs()
        bad_payoffs[0] = {**bad_payoffs[0], "value": float("nan")}
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_PAYOFF"):
            _valid_model(payoffs=bad_payoffs)

    def test_infinite_payoff_value_is_refused(self):
        bad_payoffs = _payoffs()
        bad_payoffs[0] = {**bad_payoffs[0], "value": float("inf")}
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_PAYOFF"):
            _valid_model(payoffs=bad_payoffs)

    def test_empty_payoffs_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_PAYOFF"):
            _valid_model(payoffs=[])

    def test_payoff_completeness_is_checked_before_equilibrium(self):
        """Ordering proof: an incomplete payoff table is refused even when equilibrium is ALSO empty -- the
        payoff-completeness error must surface first, encoding 'equilibrium cannot be accepted until payoffs
        are complete', not merely 'both happen to be validated'."""
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_PAYOFF_INCOMPLETE"):
            _valid_model(payoffs=_payoffs()[:-1], equilibrium="   ")


class PlayersTests(unittest.TestCase):
    def test_fewer_than_two_players_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_TOO_FEW_PLAYERS"):
            _valid_model(players=[{"id": "P1", "name": "平台 A"}], strategies=[s for s in _strategies() if s["player_id"] == "P1"], payoffs=[p for p in _payoffs() if p["player_id"] == "P1"])

    def test_duplicate_player_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_DUPLICATE_PLAYER_ID"):
            _valid_model(players=[{"id": "P1", "name": "平台 A"}, {"id": "P1", "name": "平台 A 重複"}])

    def test_player_missing_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_PLAYER"):
            _valid_model(players=[{"id": "P1", "name": "平台 A"}, {"id": "P2", "name": ""}])

    def test_non_list_players_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_TOO_FEW_PLAYERS"):
            _valid_model(players="not-a-list")


class StrategiesTests(unittest.TestCase):
    def test_player_with_zero_strategies_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_PLAYER_WITHOUT_STRATEGY"):
            _valid_model(
                strategies=[s for s in _strategies() if s["player_id"] != "P2"],
                payoffs=[p for p in _payoffs() if p["player_id"] != "P2"],
            )

    def test_strategy_referencing_unknown_player_is_refused(self):
        bad_strategies = _strategies() + [{"player_id": "P99", "strategy_id": "S1", "name": "幽靈玩家策略"}]
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_STRATEGY_UNKNOWN_PLAYER"):
            _valid_model(strategies=bad_strategies)

    def test_duplicate_strategy_pair_is_refused(self):
        bad_strategies = _strategies() + [{"player_id": "P1", "strategy_id": "S1", "name": "重複策略"}]
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_DUPLICATE_STRATEGY_ID"):
            _valid_model(strategies=bad_strategies)

    def test_empty_strategies_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_STRATEGY"):
            _valid_model(strategies=[], payoffs=[])


class EquilibriumTests(unittest.TestCase):
    def test_empty_equilibrium_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_EMPTY_EQUILIBRIUM"):
            _valid_model(equilibrium="   ")

    def test_none_equilibrium_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_EMPTY_EQUILIBRIUM"):
            _valid_model(equilibrium=None)

    def test_well_formed_equilibrium_is_accepted(self):
        model = _valid_model(equilibrium="兩方皆選擇維持補貼")
        self.assertEqual(model["equilibrium"], "兩方皆選擇維持補貼")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "GAMETH-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_ID"):
            _valid_model(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_ID"):
            _valid_model(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_VERSION"):
            generate_game_theory_model("GAMETH-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "GAMETH_INVALID_PROVENANCE"):
            _valid_model(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID model's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_model(self):
        results = evaluate_game_theory_gates(_valid_model(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_missing_payoff(self):
        record = copy.deepcopy(_valid_model())
        record["payoffs"] = record["payoffs"][:-1]
        gate = evaluate_game_theory_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_boolean_payoff(self):
        record = copy.deepcopy(_valid_model())
        record["payoffs"][0]["value"] = False
        gate = evaluate_game_theory_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_nan_payoff(self):
        record = copy.deepcopy(_valid_model())
        record["payoffs"][0]["value"] = float("nan")
        gate = evaluate_game_theory_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        """Critic-found gap (2026-09-11): _STORED_CONTENT_KEYS was defined but never checked -- an added
        top-level key was only caught by JSON Schema, not this gate."""
        record = copy.deepcopy(_valid_model())
        record["extra_field"] = "smuggled"
        gate = evaluate_game_theory_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_model())
        del record["equilibrium"]
        gate = evaluate_game_theory_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_player_without_strategy(self):
        record = copy.deepcopy(_valid_model())
        record["strategies"] = [s for s in record["strategies"] if s["player_id"] != "P2"]
        gate = evaluate_game_theory_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_equilibrium(self):
        record = copy.deepcopy(_valid_model())
        record["equilibrium"] = ""
        gate = evaluate_game_theory_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_game_theory_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_model())
        record["id"] = "WRONG-001"
        gate = evaluate_game_theory_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_model())
        record["version"] = 1
        gate = evaluate_game_theory_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
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
    """Critic-found gap (2026-09-11): the builder shallow-copied the players/strategies/payoffs LISTS but
    shared the caller's own nested dicts -- every other builder in this batch (stakeholder_map/
    power_interest/salience_model/incentive_mapping/raci/batna/coalition_mapping) already rebuilds each
    element; this was the one that didn't. Mirrors stakeholder_map's own aliasing test."""

    def test_builder_does_not_alias_the_callers_supplied_payoff_dicts(self):
        payoffs = _payoffs()
        model = _valid_model(payoffs=payoffs)
        payoffs[0]["value"] = 999999
        self.assertNotEqual(model["payoffs"][0]["value"], 999999)

    def test_builder_does_not_alias_the_callers_supplied_player_dicts(self):
        players = _players()
        model = _valid_model(players=players)
        players[0]["name"] = "tampered-after-construction"
        self.assertNotEqual(model["players"][0]["name"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_strategy_dicts(self):
        strategies = _strategies()
        model = _valid_model(strategies=strategies)
        strategies[0]["name"] = "tampered-after-construction"
        self.assertNotEqual(model["strategies"][0]["name"], "tampered-after-construction")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_game_theory_gates_returns_two_gates_in_order(self):
        results = evaluate_game_theory_gates(_valid_model(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "game_theory_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "stakeholders.game_theory")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        model = _valid_model()
        self.assertEqual(
            set(model.keys()),
            {"id", "version", "generated_by_method", "players", "strategies", "payoffs", "equilibrium", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
