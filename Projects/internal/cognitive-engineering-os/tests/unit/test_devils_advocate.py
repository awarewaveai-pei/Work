"""Mutation-style tests for ``challenge.devils_advocate`` (F12 challenge/red-team/risk family, fourth
built member).

THE real invariants (module docstring): (1) alternative_position must be substantively distinct from
mainstream_position after normalization, and (2) supporting_arguments must contain at least one non-empty
entry -- Atlas §12.21's own "build the strongest version" framing requires actual argument content, not a
bare assertion. Both exercised at BOTH layers: construction-time refusal
(``generate_devils_advocate_position`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_devils_advocate_content_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely, never calling the builder itself). Schema conformance is checked against the
real spec-root schema this same slice added (``typed-objects/devils-advocate-position.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.challenge.devils_advocate import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_devils_advocate_content_integrity_gate,
    evaluate_devils_advocate_gates,
    evaluate_provenance_required_gate,
    generate_devils_advocate_position,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

DEVILS_ADVOCATE_POSITION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/devils-advocate-position.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _mainstream_position() -> str:
    return "團隊多數共識：功能已達最低可行標準，週五準時上線，靠 kill-switch 兜底風險。"


def _alternative_position() -> str:
    return "應延後一週上線：kill-switch 本身從未在真實流量下驗證過。"


def _supporting_arguments() -> list[str]:
    return [
        "kill-switch 只在 staging 用合成流量測過一次，從未在生產環境的真實併發下驗證",
        "上線窗口在週五，若 kill-switch 失效，週末值班人力最薄弱，修復時間拉長",
        "多數共識本身建立在未經驗證的假設上",
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        mainstream_position=_mainstream_position(),
        alternative_position=_alternative_position(),
        supporting_arguments=_supporting_arguments(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_position(*, record_id: str = "DEVADV-T-001", **overrides: object):
    return generate_devils_advocate_position(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_position_validates_against_the_real_schema(self):
        self.contracts.validate(DEVILS_ADVOCATE_POSITION_SCHEMA, _valid_position(), "devils advocate position")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, position = live.invoke(METHOD_ID, generate_devils_advocate_position, "DEVADV-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/challenge.devils_advocate.contract.yaml")
        self.assertEqual(position["id"], "DEVADV-T-INVOKE")

    def test_empty_catalog_blocks_devils_advocate_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_position())
        tampered["supporting_arguments"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DEVILS_ADVOCATE_POSITION_SCHEMA, tampered, "tampered position")
        gate = evaluate_devils_advocate_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        position = _valid_position()
        position["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DEVILS_ADVOCATE_POSITION_SCHEMA, position, "position with a smuggled top-level key")

    def test_schema_rejects_missing_alternative_position(self):
        position = _valid_position()
        del position["alternative_position"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DEVILS_ADVOCATE_POSITION_SCHEMA, position, "position with alternative_position removed")

    def test_schema_rejects_empty_supporting_arguments(self):
        position = _valid_position()
        position["supporting_arguments"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(DEVILS_ADVOCATE_POSITION_SCHEMA, position, "position with empty supporting_arguments")

    def test_id_is_distinct_from_a_sibling_f12_machine_id(self):
        self.assertEqual(METHOD_ID, "challenge.devils_advocate")
        self.assertNotEqual(METHOD_ID, "challenge.red_team")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "challenge.devils_advocate.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "challenge.devils_advocate contract")


class PositionsDistinctnessTests(unittest.TestCase):
    """THE first real invariant (module docstring): alternative_position must be substantively distinct
    from mainstream_position after normalization (strip + casefold) -- a copied position argued nothing."""

    def test_well_formed_position_is_accepted(self):
        position = _valid_position()
        self.assertNotEqual(position["mainstream_position"], position["alternative_position"])

    def test_identical_positions_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_POSITIONS_NOT_DISTINCT"):
            _valid_position(alternative_position=_mainstream_position())

    def test_positions_differing_only_by_whitespace_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_POSITIONS_NOT_DISTINCT"):
            _valid_position(alternative_position=f"  {_mainstream_position()}  ")

    def test_positions_differing_only_by_case_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_POSITIONS_NOT_DISTINCT"):
            _valid_position(mainstream_position="ship on schedule", alternative_position="SHIP ON SCHEDULE")

    def test_genuinely_different_positions_are_accepted(self):
        position = _valid_position(mainstream_position="ship on schedule", alternative_position="delay one week instead")
        self.assertEqual(position["alternative_position"], "delay one week instead")

    def test_empty_mainstream_position_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_INVALID_MAINSTREAM_POSITION"):
            _valid_position(mainstream_position="   ")

    def test_empty_alternative_position_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_INVALID_ALTERNATIVE_POSITION"):
            _valid_position(alternative_position="")

    def test_none_mainstream_position_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_INVALID_MAINSTREAM_POSITION"):
            _valid_position(mainstream_position=None)

    def test_distinctness_is_checked_before_supporting_arguments(self):
        """Ordering proof: identical positions are refused even when supporting_arguments is ALSO empty --
        the distinctness error must surface first."""
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_POSITIONS_NOT_DISTINCT"):
            _valid_position(alternative_position=_mainstream_position(), supporting_arguments=[])


class SupportingArgumentsTests(unittest.TestCase):
    """THE second real invariant (module docstring): supporting_arguments must have at least one non-empty
    entry -- a bare assertion is not the 'strongest version' Atlas L2805 requires."""

    def test_well_formed_arguments_are_accepted(self):
        position = _valid_position()
        self.assertEqual(len(position["supporting_arguments"]), 3)

    def test_empty_supporting_arguments_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_NO_SUPPORTING_ARGUMENTS"):
            _valid_position(supporting_arguments=[])

    def test_non_list_supporting_arguments_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_NO_SUPPORTING_ARGUMENTS"):
            _valid_position(supporting_arguments="not-a-list")

    def test_none_supporting_arguments_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_NO_SUPPORTING_ARGUMENTS"):
            _valid_position(supporting_arguments=None)

    def test_single_real_argument_is_accepted(self):
        position = _valid_position(supporting_arguments=["kill-switch 從未在生產環境驗證過"])
        self.assertEqual(len(position["supporting_arguments"]), 1)

    def test_one_empty_string_argument_among_real_ones_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_INVALID_SUPPORTING_ARGUMENT"):
            _valid_position(supporting_arguments=["real argument", "   ", "another real argument"])

    def test_non_string_argument_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_INVALID_SUPPORTING_ARGUMENT"):
            _valid_position(supporting_arguments=["real argument", 12345])

    def test_builder_does_not_alias_the_callers_supplied_arguments_list(self):
        arguments = _supporting_arguments()
        position = _valid_position(supporting_arguments=arguments)
        arguments.append("appended after construction")
        self.assertEqual(len(position["supporting_arguments"]), 3)


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "DEVADV-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_INVALID_ID"):
            _valid_position(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_INVALID_ID"):
            _valid_position(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_INVALID_VERSION"):
            generate_devils_advocate_position("DEVADV-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "DEVADV_INVALID_PROVENANCE"):
            _valid_position(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID position's raw dict directly (never going through the builder again), then call
    the gates. These prove the gates re-derive from raw fields rather than trusting the builder's own
    work -- the single most common gap a critic review in this corpus catches (module docstring)."""

    def test_gates_pass_a_genuinely_valid_hand_built_position(self):
        results = evaluate_devils_advocate_gates(_valid_position(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_alternative_matching_mainstream(self):
        """The exact tamper the CLI slice's own demonstration step performs: overwrite
        alternative_position to equal mainstream_position AFTER a valid record was already built,
        bypassing the builder entirely."""
        record = copy.deepcopy(_valid_position())
        record["alternative_position"] = record["mainstream_position"]
        gate = evaluate_devils_advocate_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_supporting_arguments(self):
        record = copy.deepcopy(_valid_position())
        record["supporting_arguments"] = []
        gate = evaluate_devils_advocate_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_position())
        record["extra_field"] = "smuggled"
        gate = evaluate_devils_advocate_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_position())
        del record["mainstream_position"]
        gate = evaluate_devils_advocate_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_devils_advocate_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_position())
        record["id"] = "WRONG-001"
        gate = evaluate_devils_advocate_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_position())
        record["version"] = 1
        gate = evaluate_devils_advocate_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_position(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_position())
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

    def test_evaluate_devils_advocate_gates_returns_two_gates_in_order(self):
        results = evaluate_devils_advocate_gates(_valid_position(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "devils_advocate_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "challenge.devils_advocate")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        position = _valid_position()
        self.assertEqual(
            set(position.keys()),
            {"id", "version", "generated_by_method", "mainstream_position", "alternative_position", "supporting_arguments", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
