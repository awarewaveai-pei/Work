"""Mutation-style tests for ``insight.jtbd`` (F06 human/customer insight family, OPENING member).

Two real invariants beyond id/version/provenance shape (3-clause completeness, mandatory non-empty
local_evidence) plus workaround's own null-or-non-empty shape, exercised at BOTH layers: construction-time
refusal (``generate_jtbd_statement`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_jtbd_content_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real spec-root
schema this same slice added (``typed-objects/jtbd-statement.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.insight.jtbd import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_jtbd_content_integrity_gate,
    evaluate_jtbd_gates,
    evaluate_provenance_required_gate,
    generate_jtbd_statement,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

JTBD_STATEMENT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/jtbd-statement.schema.yaml"
PROVENANCE = make_provenance("EVIDENCE", "HUMAN_ORIGINAL")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        situation="小型工作室老闆每個月月底要同時處理 5-10 個客戶的請款單",
        motivation="想要在不切換到電腦的情況下把請款單正確送到對的客戶手上",
        desired_outcome="月底請款流程縮短到 30 分鐘內完成",
        local_evidence="訪談 6 位台灣工作室老闆，5 位表示 LINE 是主要客戶溝通管道（2026-08 訪談紀錄）",
        provenance=PROVENANCE,
        workaround="目前用手機拍 Excel 截圖傳 LINE",
    )
    base.update(overrides)
    return base


def _valid_statement(*, record_id: str = "JTBD-T-001", **overrides: object):
    return generate_jtbd_statement(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_statement_validates_against_the_real_schema(self):
        self.contracts.validate(JTBD_STATEMENT_SCHEMA, _valid_statement(), "jtbd statement")

    def test_valid_statement_with_null_workaround_validates(self):
        self.contracts.validate(JTBD_STATEMENT_SCHEMA, _valid_statement(workaround=None), "jtbd statement, no workaround")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, statement = live.invoke(METHOD_ID, generate_jtbd_statement, "JTBD-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/insight.jtbd.contract.yaml")
        self.assertEqual(statement["id"], "JTBD-T-INVOKE")

    def test_empty_catalog_blocks_jtbd_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_statement())
        tampered["local_evidence"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(JTBD_STATEMENT_SCHEMA, tampered, "tampered statement")
        gate = evaluate_jtbd_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        statement = _valid_statement()
        statement["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(JTBD_STATEMENT_SCHEMA, statement, "statement with a smuggled top-level key")

    def test_schema_rejects_empty_workaround_string(self):
        """workaround must be null or non-empty -- an empty string is not a legal disclosure (see schema's own
        compilation_decisions)."""
        statement = _valid_statement()
        statement["workaround"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(JTBD_STATEMENT_SCHEMA, statement, "statement with an empty-string workaround")

    def test_schema_rejects_missing_local_evidence(self):
        statement = _valid_statement()
        del statement["local_evidence"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(JTBD_STATEMENT_SCHEMA, statement, "statement with local_evidence removed")

    def test_id_is_distinct_from_a_sibling_f06_machine_id(self):
        self.assertEqual(METHOD_ID, "insight.jtbd")
        self.assertNotEqual(METHOD_ID, "insight.persona")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "insight.jtbd.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "insight.jtbd contract")


class ThreeClauseCompletenessTests(unittest.TestCase):
    """Invariant #1 (module docstring): situation/motivation/desired_outcome each non-empty."""

    def test_well_formed_statement_is_accepted(self):
        statement = _valid_statement()
        self.assertTrue(statement["situation"])
        self.assertTrue(statement["motivation"])
        self.assertTrue(statement["desired_outcome"])

    def test_empty_situation_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_EMPTY_SITUATION"):
            _valid_statement(situation="   ")

    def test_empty_motivation_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_EMPTY_MOTIVATION"):
            _valid_statement(motivation="")

    def test_empty_desired_outcome_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_EMPTY_DESIRED_OUTCOME"):
            _valid_statement(desired_outcome="   ")

    def test_non_string_situation_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_EMPTY_SITUATION"):
            _valid_statement(situation=None)


class LocalEvidenceMandatoryTests(unittest.TestCase):
    """Invariant #2 (module docstring): local_evidence is REQUIRED, never optional -- §11.12's own explicit
    standalone rule."""

    def test_empty_local_evidence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_EMPTY_LOCAL_EVIDENCE"):
            _valid_statement(local_evidence="   ")

    def test_none_local_evidence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_EMPTY_LOCAL_EVIDENCE"):
            _valid_statement(local_evidence=None)

    def test_whitespace_only_local_evidence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_EMPTY_LOCAL_EVIDENCE"):
            _valid_statement(local_evidence="\t\n  ")


class WorkaroundNullabilityTests(unittest.TestCase):
    """workaround is nullable but non-empty-if-present."""

    def test_null_workaround_is_accepted(self):
        statement = _valid_statement(workaround=None)
        self.assertIsNone(statement["workaround"])

    def test_non_empty_workaround_is_accepted(self):
        statement = _valid_statement(workaround="手動用試算表計算")
        self.assertEqual(statement["workaround"], "手動用試算表計算")

    def test_empty_string_workaround_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_INVALID_WORKAROUND"):
            _valid_statement(workaround="")

    def test_whitespace_only_workaround_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_INVALID_WORKAROUND"):
            _valid_statement(workaround="   ")

    def test_non_string_non_none_workaround_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_INVALID_WORKAROUND"):
            _valid_statement(workaround=42)


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "JTBD-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_INVALID_ID"):
            _valid_statement(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_INVALID_ID"):
            _valid_statement(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_INVALID_VERSION"):
            generate_jtbd_statement("JTBD-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "JTBD_INVALID_PROVENANCE"):
            _valid_statement(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID statement's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_statement(self):
        results = evaluate_jtbd_gates(_valid_statement(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_empty_situation(self):
        record = copy.deepcopy(_valid_statement())
        record["situation"] = ""
        gate = evaluate_jtbd_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_local_evidence(self):
        record = copy.deepcopy(_valid_statement())
        record["local_evidence"] = "   "
        gate = evaluate_jtbd_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_string_workaround(self):
        record = copy.deepcopy(_valid_statement())
        record["workaround"] = ""
        gate = evaluate_jtbd_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_passes_hand_tampered_record_with_null_workaround(self):
        """null workaround is legitimate -- the gate must not conflate 'no workaround' with a defect."""
        record = copy.deepcopy(_valid_statement())
        record["workaround"] = None
        gate = evaluate_jtbd_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_jtbd_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_statement())
        record["id"] = "WRONG-001"
        gate = evaluate_jtbd_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_statement())
        record["version"] = 1
        gate = evaluate_jtbd_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
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


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_jtbd_gates_returns_two_gates_in_order(self):
        results = evaluate_jtbd_gates(_valid_statement(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "jtbd_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "insight.jtbd")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        statement = _valid_statement()
        self.assertEqual(
            set(statement.keys()),
            {"id", "version", "generated_by_method", "situation", "motivation", "desired_outcome", "workaround", "local_evidence", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
