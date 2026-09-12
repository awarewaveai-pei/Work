"""Mutation-style tests for ``foresight.wild_cards`` (F13 unknown-unknowns/foresight family, second built
member).

THE real invariant (module docstring: every ``wild_cards[]`` entry must carry a non-empty ``strategy_rerun``
with a genuine boolean ``still_holds`` -- Atlas L680's own "wild card→重跑 strategy"), exercised at BOTH
layers: construction-time refusal (``generate_wild_card_set`` raising a specific ``InvariantViolation`` code)
and independent gate re-derivation (``evaluate_strategy_rerun_required_gate`` catching a hand-tampered raw
dict that bypassed the builder entirely, never calling the builder itself). Schema conformance is checked
against the real spec-root schema this same slice added (``typed-objects/wild-card-set.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.foresight.wild_cards import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_strategy_rerun_required_gate,
    evaluate_wild_card_set_gates,
    generate_wild_card_set,
    strategy_rerun,
    wild_card,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

WILD_CARD_SET_SCHEMA = "ai-lego://specs/cognitive/typed-objects/wild-card-set.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")


def _rerun(**overrides: object) -> dict:
    base = {"strategy_ref": "STRAT-2026-EXPAND-3-MARKETS", "outcome_under_card": "原計畫的集中式資料架構無法合規", "still_holds": True}
    base.update(overrides)
    return base


def _wild_cards(**rerun_overrides: object) -> list[dict]:
    return [{"id": "WC-001", "description": "三個目標市場同時禁止跨境資料傳輸", "strategy_rerun": _rerun(**rerun_overrides)}]


def _kwargs(**overrides: object) -> dict:
    base = dict(wild_cards=_wild_cards(), provenance=PROVENANCE)
    base.update(overrides)
    return base


def _valid_set(*, record_id: str = "WCARD-T-001", **overrides: object):
    return generate_wild_card_set(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_set_validates_against_the_real_schema(self):
        self.contracts.validate(WILD_CARD_SET_SCHEMA, _valid_set(), "wild card set")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, wild_card_set = live.invoke(METHOD_ID, generate_wild_card_set, "WCARD-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/foresight.wild_cards.contract.yaml")
        self.assertEqual(wild_card_set["id"], "WCARD-T-INVOKE")

    def test_empty_catalog_blocks_wild_cards_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_set())
        del tampered["wild_cards"][0]["strategy_rerun"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WILD_CARD_SET_SCHEMA, tampered, "tampered set")
        gate = evaluate_strategy_rerun_required_gate(tampered, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        wild_card_set = _valid_set()
        wild_card_set["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WILD_CARD_SET_SCHEMA, wild_card_set, "set with a smuggled top-level key")

    def test_schema_rejects_missing_wild_cards(self):
        wild_card_set = _valid_set()
        del wild_card_set["wild_cards"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WILD_CARD_SET_SCHEMA, wild_card_set, "set with wild_cards removed")

    def test_schema_rejects_non_boolean_still_holds(self):
        """The Python bool-is-int-subclass trap, at the schema layer: JSON Schema's own strict boolean type
        must reject 1/0, not silently accept them as truthy/falsy."""
        wild_card_set = _valid_set()
        wild_card_set["wild_cards"][0]["strategy_rerun"]["still_holds"] = 1
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(WILD_CARD_SET_SCHEMA, wild_card_set, "set with still_holds=1 instead of True")

    def test_id_is_distinct_from_sibling_foresight_family_prefix(self):
        self.assertEqual(METHOD_ID, "foresight.wild_cards")
        self.assertEqual(RECORD_ID_PREFIX, "WCARD-")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "foresight.wild_cards.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "foresight.wild_cards contract")


class StrategyRerunRequiredTests(unittest.TestCase):
    """THE real invariant (module docstring): every wild_cards[] entry must carry a non-empty, well-formed
    strategy_rerun before construction succeeds -- Atlas L680's own pipeline mechanized."""

    def test_well_formed_set_is_accepted(self):
        wild_card_set = _valid_set()
        self.assertEqual(len(wild_card_set["wild_cards"]), 1)
        self.assertIn("strategy_rerun", wild_card_set["wild_cards"][0])

    def test_missing_strategy_rerun_key_entirely_is_refused(self):
        bad_cards = [{"id": "WC-001", "description": "x"}]
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD_ENTRY"):
            _valid_set(wild_cards=bad_cards)

    def test_empty_strategy_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD_ENTRY"):
            _valid_set(wild_cards=_wild_cards(strategy_ref=""))

    def test_empty_outcome_under_card_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD_ENTRY"):
            _valid_set(wild_cards=_wild_cards(outcome_under_card="   "))

    def test_still_holds_as_int_1_is_refused(self):
        """The Python bool-is-int-subclass trap at the runtime layer: 1 must NOT be silently accepted as True."""
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD_ENTRY"):
            _valid_set(wild_cards=_wild_cards(still_holds=1))

    def test_still_holds_as_int_0_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD_ENTRY"):
            _valid_set(wild_cards=_wild_cards(still_holds=0))

    def test_still_holds_as_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD_ENTRY"):
            _valid_set(wild_cards=_wild_cards(still_holds="true"))

    def test_still_holds_false_is_legal(self):
        """A wild card whose strategy does NOT survive is still a complete, well-formed re-run -- still_holds
        is a genuine finding, not a required-true flag."""
        wild_card_set = _valid_set(wild_cards=_wild_cards(still_holds=False))
        self.assertFalse(wild_card_set["wild_cards"][0]["strategy_rerun"]["still_holds"])

    def test_strategy_rerun_extra_key_is_refused(self):
        bad_cards = [{"id": "WC-001", "description": "x", "strategy_rerun": {**_rerun(), "extra": "y"}}]
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD_ENTRY"):
            _valid_set(wild_cards=bad_cards)

    def test_strategy_rerun_missing_key_is_refused(self):
        bad_rerun = _rerun()
        del bad_rerun["outcome_under_card"]
        bad_cards = [{"id": "WC-001", "description": "x", "strategy_rerun": bad_rerun}]
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD_ENTRY"):
            _valid_set(wild_cards=bad_cards)

    def test_multiple_wild_cards_each_with_their_own_rerun_are_accepted(self):
        cards = _wild_cards() + [{"id": "WC-002", "description": "第二個劇烈事件", "strategy_rerun": _rerun(outcome_under_card="第二個結果", still_holds=False)}]
        wild_card_set = _valid_set(wild_cards=cards)
        self.assertEqual(len(wild_card_set["wild_cards"]), 2)


class WildCardShapeTests(unittest.TestCase):
    def test_empty_wild_cards_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_EMPTY_WILD_CARDS"):
            _valid_set(wild_cards=[])

    def test_non_list_wild_cards_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_EMPTY_WILD_CARDS"):
            _valid_set(wild_cards="not-a-list")

    def test_duplicate_wild_card_id_is_refused(self):
        bad_cards = _wild_cards() + [{"id": "WC-001", "description": "重複 id", "strategy_rerun": _rerun()}]
        with self.assertRaisesRegex(InvariantViolation, "WCARD_DUPLICATE_WILD_CARD_ID"):
            _valid_set(wild_cards=bad_cards)

    def test_empty_description_is_refused(self):
        bad_cards = [{"id": "WC-001", "description": "  ", "strategy_rerun": _rerun()}]
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD_ENTRY"):
            _valid_set(wild_cards=bad_cards)

    def test_extra_key_on_wild_card_is_refused(self):
        bad_cards = [{"id": "WC-001", "description": "x", "strategy_rerun": _rerun(), "extra": "y"}]
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD_ENTRY"):
            _valid_set(wild_cards=bad_cards)


class ConvenienceConstructorTests(unittest.TestCase):
    def test_strategy_rerun_builds_a_well_formed_value(self):
        entry = strategy_rerun("STRAT-010", "結果描述", True)
        self.assertEqual(entry, {"strategy_ref": "STRAT-010", "outcome_under_card": "結果描述", "still_holds": True})

    def test_strategy_rerun_rejects_non_bool_still_holds(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_STRATEGY_RERUN"):
            strategy_rerun("STRAT-010", "結果描述", 1)  # type: ignore[arg-type]

    def test_wild_card_builds_a_well_formed_entry(self):
        rerun = strategy_rerun("STRAT-010", "結果描述", True)
        entry = wild_card("WC-010", "描述", rerun)
        self.assertEqual(entry, {"id": "WC-010", "description": "描述", "strategy_rerun": rerun})

    def test_wild_card_rejects_empty_description(self):
        rerun = strategy_rerun("STRAT-010", "結果描述", True)
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD"):
            wild_card("WC-010", "", rerun)

    def test_wild_card_rejects_malformed_strategy_rerun(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_WILD_CARD"):
            wild_card("WC-010", "描述", {"strategy_ref": "x"})


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_ID"):
            _valid_set(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_ID"):
            _valid_set(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_VERSION"):
            generate_wild_card_set("WCARD-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "WCARD_INVALID_PROVENANCE"):
            _valid_set(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID set's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_set(self):
        results = evaluate_wild_card_set_gates(_valid_set(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_gate_catches_hand_tampered_missing_strategy_rerun(self):
        """The exact scenario the task brief prescribes: a hand-tampered record (bypassing the builder to
        delete strategy_rerun directly) must be caught by the independent gate, not just the builder."""
        record = copy.deepcopy(_valid_set())
        del record["wild_cards"][0]["strategy_rerun"]
        gate = evaluate_strategy_rerun_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_still_holds_as_int(self):
        record = copy.deepcopy(_valid_set())
        record["wild_cards"][0]["strategy_rerun"]["still_holds"] = 1
        gate = evaluate_strategy_rerun_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_outcome(self):
        record = copy.deepcopy(_valid_set())
        record["wild_cards"][0]["strategy_rerun"]["outcome_under_card"] = ""
        gate = evaluate_strategy_rerun_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicate_id(self):
        record = copy.deepcopy(_valid_set())
        record["wild_cards"].append(copy.deepcopy(record["wild_cards"][0]))
        gate = evaluate_strategy_rerun_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_unknown_top_level_key_via_schema(self):
        record = copy.deepcopy(_valid_set())
        record["extra_field"] = "smuggled"
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        with self.assertRaises(SchemaValidationError):
            contracts.validate(WILD_CARD_SET_SCHEMA, record, "record with a smuggled top-level key")

    def test_gate_fails_closed_on_top_level_junk_never_crashes(self):
        for bad in (None, "not-a-dict", 42, 3.14, True, [], {}, {"junk": 1}):
            with self.subTest(bad=bad):
                gate = evaluate_strategy_rerun_required_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_malformed_wild_card_entries_never_crashes(self):
        record = copy.deepcopy(_valid_set())
        record["wild_cards"] = [None, "not-a-dict", 42, [], True, {"junk": 1}, {"id": None, "description": None, "strategy_rerun": None}]
        gate = evaluate_strategy_rerun_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_fails_closed_on_empty_wild_cards_list(self):
        record = copy.deepcopy(_valid_set())
        record["wild_cards"] = []
        gate = evaluate_strategy_rerun_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_gate_fails_closed_on_top_level_junk_never_crashes(self):
        for bad in (None, "not-a-dict", 42, [], True):
            with self.subTest(bad=bad):
                gate = evaluate_provenance_required_gate(bad, "test", "2026-09-12T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_set(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_set())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    """The builder must not alias the caller's own nested dicts -- post-construction mutation of the caller's
    input must not silently rewrite a gate-passed record. The nested `strategy_rerun` dict is exactly the kind
    of NESTED CONTAINER a shallow `dict(item)` copy would fail to protect -- same discipline every sibling
    module in this package (e.g. epistemic.evidence_matrix's own critic-fixed gap) already establishes."""

    def test_builder_does_not_alias_the_callers_supplied_wild_card_dicts(self):
        cards = _wild_cards()
        wild_card_set = _valid_set(wild_cards=cards)
        cards[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(wild_card_set["wild_cards"][0]["description"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_nested_strategy_rerun_dict(self):
        """THE nested-container aliasing regression class: mutating the caller's own nested strategy_rerun
        dict after construction must NOT be visible in the returned record -- a shallow dict(card) copy would
        share this nested dict by reference and fail this test."""
        cards = _wild_cards()
        wild_card_set = _valid_set(wild_cards=cards)
        cards[0]["strategy_rerun"]["outcome_under_card"] = "tampered-after-construction"
        self.assertNotEqual(wild_card_set["wild_cards"][0]["strategy_rerun"]["outcome_under_card"], "tampered-after-construction")
        self.assertIsNot(wild_card_set["wild_cards"][0]["strategy_rerun"], cards[0]["strategy_rerun"])


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_wild_card_set_gates_returns_two_gates_in_order(self):
        results = evaluate_wild_card_set_gates(_valid_set(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "strategy_rerun_required"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "foresight.wild_cards")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        wild_card_set = _valid_set()
        self.assertEqual(set(wild_card_set.keys()), {"id", "version", "generated_by_method", "wild_cards", "provenance"})



class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """A critic pass found 11 of this batch's 14 builders returned the caller's own ``provenance`` dict BY
    REFERENCE rather than a copy -- mutating the caller's dict after construction silently rewrote the
    already-returned 'validated' record's provenance too, with no exception. Fixed by ``copy.deepcopy``ing
    provenance at the return statement; this test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_set()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_wild_card_set(base["id"], base["wild_cards"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
