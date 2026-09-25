"""``divergent.reverse_brainstorming`` -- real construction + gate re-derivation, mirroring
divergent.classic_brainstorming's own test shape for the same flat-list-plus-referential-
integrity method class."""

from __future__ import annotations

import datetime
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.divergent.reverse_brainstorming import (
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_reverse_brainstorming_gates,
    generate_reverse_brainstorming_session,
    inversion,
    worsening_idea,
)
from tests.unit.method_testkit import shared_method_catalog

_NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()
_METHOD_SCHEMA = "ai-lego://specs/cognitive/method.schema.yaml"


def _provenance():
    # Same default main.py's real /methods/{id}/invoke uses for an un-supplied caller value --
    # this method has no genuine-compute gate, so (unlike the quadrant methods) AI_INFERENCE is
    # actually fine here; asserted explicitly so a future gate addition can't silently break this.
    return make_provenance("AI_INFERENCE", "AI_GENERATED")


def _worsening_ideas():
    return [
        worsening_idea("W1", "Ship with no error handling at all", _provenance()),
        worsening_idea("W2", "Never write down why any decision was made", _provenance()),
    ]


def _build(**overrides):
    kwargs = dict(
        record_id=f"{RECORD_ID_PREFIX}TEST0001",
        problem_statement="New hires take too long to become productive",
        worsening_ideas=_worsening_ideas(),
        provenance=_provenance(),
    )
    kwargs.update(overrides)
    return generate_reverse_brainstorming_session(**kwargs)


class BuilderTests(unittest.TestCase):
    def test_builds_a_real_record_with_no_inversions_yet(self):
        record = _build()
        self.assertTrue(record["id"].startswith(RECORD_ID_PREFIX))
        self.assertEqual(len(record["worsening_ideas"]), 2)
        self.assertEqual(record["inversions"], [])

    def test_builds_a_record_with_inversions_that_resolve(self):
        record = _build(inversions=[inversion("W1", "Always validate input and handle every error path explicitly", _provenance())])
        self.assertEqual(len(record["inversions"]), 1)
        gates = evaluate_reverse_brainstorming_gates(record, "test", _NOW)
        self.assertTrue(all_gates_pass(gates), gates)

    def test_rejects_invalid_record_id_prefix(self):
        with self.assertRaises(InvariantViolation):
            _build(record_id="WRONG-0001")

    def test_rejects_empty_problem_statement(self):
        with self.assertRaises(InvariantViolation):
            _build(problem_statement="")

    def test_rejects_empty_worsening_ideas(self):
        with self.assertRaises(InvariantViolation):
            _build(worsening_ideas=[])

    def test_rejects_duplicate_worsening_idea_id(self):
        ideas = _worsening_ideas()
        ideas[1] = worsening_idea("W1", "duplicate id", _provenance())
        with self.assertRaises(InvariantViolation):
            _build(worsening_ideas=ideas)

    def test_rejects_a_score_field_on_a_worsening_idea(self):
        """Structural elimination, same discipline classic_brainstorming's own idea() uses:
        judging happens via inversion, never a verdict/score baked into the idea itself."""
        bad_idea = {"id": "W1", "text": "x", "provenance": _provenance(), "score": 5}
        with self.assertRaises(InvariantViolation):
            _build(worsening_ideas=[bad_idea])

    def test_rejects_dangling_inversion_reference(self):
        with self.assertRaises(InvariantViolation):
            _build(inversions=[inversion("W-DOES-NOT-EXIST", "some solution", _provenance())])

    def test_worsening_idea_constructor_rejects_empty_text(self):
        with self.assertRaises(InvariantViolation):
            worsening_idea("W1", "", _provenance())

    def test_inversion_constructor_rejects_empty_solution(self):
        with self.assertRaises(InvariantViolation):
            inversion("W1", "", _provenance())


class GateTests(unittest.TestCase):
    def test_all_gates_pass_for_a_genuine_record(self):
        record = _build()
        gates = evaluate_reverse_brainstorming_gates(record, "test", _NOW)
        self.assertTrue(all_gates_pass(gates), gates)

    def test_idea_integrity_gate_catches_a_hand_tampered_duplicate(self):
        record = _build()
        record["worsening_ideas"].append(dict(record["worsening_ideas"][0]))  # duplicate id spliced in after construction
        gates = evaluate_reverse_brainstorming_gates(record, "test", _NOW)
        integrity = next(g for g in gates if g["gate_id"] == "idea_integrity")
        self.assertEqual(integrity["status"], "FAIL")

    def test_referential_integrity_gate_catches_a_hand_tampered_dangling_ref(self):
        record = _build()
        record["inversions"] = [{"worsening_idea_ref": "NOT-REAL", "inverted_solution": "x", "provenance": _provenance()}]
        gates = evaluate_reverse_brainstorming_gates(record, "test", _NOW)
        referential = next(g for g in gates if g["gate_id"] == "idea_referential_integrity")
        self.assertEqual(referential["status"], "FAIL")

    def test_gates_fail_closed_on_malformed_input(self):
        gates = evaluate_reverse_brainstorming_gates("not a dict", "test", _NOW)
        self.assertFalse(all_gates_pass(gates))


class SpecConformanceTests(unittest.TestCase):
    def test_method_contract_yaml_validates_against_method_schema(self):
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        contract_path = spec_root / "methods" / "contracts" / "divergent.reverse_brainstorming.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        contracts.validate(_METHOD_SCHEMA, instance, "divergent.reverse_brainstorming contract")

    def test_real_catalog_resolves_and_dispatches_the_method_end_to_end(self):
        from ai_lego.apps.api.dispatch import invoke_builder, record_id_prefix, resolve_builder, resolve_gate_runner

        catalog = shared_method_catalog(resolve_spec_root())
        self.assertTrue(catalog.is_resolvable("divergent.reverse_brainstorming"))

        builder = resolve_builder("divergent.reverse_brainstorming")
        gate_runner = resolve_gate_runner("divergent.reverse_brainstorming")
        record_id = record_id_prefix("divergent.reverse_brainstorming", required=True) + "E2E0001"
        record = invoke_builder(builder, record_id, make_provenance("AI_INFERENCE", "AI_GENERATED"), {
            "problem_statement": "wiring smoke test",
            "worsening_ideas": [{"id": "W1", "text": "x", "provenance": make_provenance("AI_INFERENCE", "AI_GENERATED")}],
        })
        gates = gate_runner(record, "test", _NOW)
        self.assertTrue(all_gates_pass(gates), gates)
