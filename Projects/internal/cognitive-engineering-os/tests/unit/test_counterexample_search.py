"""Mutation-style tests for ``challenge.counterexample_search`` (F12 challenge/red-team/risk family, sixth built
member).

THE real invariant (referential integrity: every ``true_counterexamples[]`` entry's ``boundary_case_id`` must
resolve to a real ``boundary_cases[].id`` -- a case cannot be confirmed a counterexample if it was never
examined as a boundary case) plus the structural invariants supporting it (claim non-empty, boundary_cases
non-empty and well-formed with unique ids, true_counterexamples entries well-formed with non-empty
contradiction_explanation), exercised at BOTH layers: construction-time refusal
(``generate_counterexample_search`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_counterexample_search_content_integrity_gate`` catching a hand-tampered raw dict that
bypassed the builder entirely, never calling the builder itself). Schema conformance is checked against the
real spec-root schema this same slice added (``typed-objects/counterexample-search.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.challenge.counterexample_search import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_counterexample_search_content_integrity_gate,
    evaluate_counterexample_search_gates,
    evaluate_provenance_required_gate,
    generate_counterexample_search,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

COUNTEREXAMPLE_SEARCH_SCHEMA = "ai-lego://specs/cognitive/typed-objects/counterexample-search.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _boundary_cases() -> list[dict]:
    return [
        {"id": "BC-1", "description": "使用者帳號沒有綁定 email，只用手機號碼註冊"},
        {"id": "BC-2", "description": "使用者的 email 已停用但帳號仍是 active 狀態"},
    ]


def _true_counterexamples() -> list[dict]:
    return [
        {"boundary_case_id": "BC-1", "contradiction_explanation": "純手機號碼註冊帳號的 email 欄位為 null，重設密碼流程寄不出信，直接卡住。"},
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        claim="所有使用者都可以透過 email 重設密碼",
        boundary_cases=_boundary_cases(),
        true_counterexamples=_true_counterexamples(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_record(*, record_id: str = "CES-T-001", **overrides: object):
    return generate_counterexample_search(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(COUNTEREXAMPLE_SEARCH_SCHEMA, _valid_record(), "counterexample search result")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_counterexample_search, "CES-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/challenge.counterexample_search.contract.yaml")
        self.assertEqual(record["id"], "CES-T-INVOKE")

    def test_empty_catalog_blocks_counterexample_search_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["boundary_cases"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COUNTEREXAMPLE_SEARCH_SCHEMA, tampered, "tampered record")
        gate = evaluate_counterexample_search_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COUNTEREXAMPLE_SEARCH_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_missing_claim(self):
        record = _valid_record()
        del record["claim"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(COUNTEREXAMPLE_SEARCH_SCHEMA, record, "record with claim removed")

    def test_schema_accepts_empty_true_counterexamples(self):
        """R4: a claim surviving the search is a legitimate, non-error result -- must validate, not just be
        accepted by the builder."""
        record = _valid_record(true_counterexamples=[])
        self.contracts.validate(COUNTEREXAMPLE_SEARCH_SCHEMA, record, "record with empty true_counterexamples")

    def test_id_is_distinct_from_a_sibling_f12_machine_id(self):
        self.assertEqual(METHOD_ID, "challenge.counterexample_search")
        self.assertNotEqual(METHOD_ID, "challenge.red_team")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "challenge.counterexample_search.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "challenge.counterexample_search contract")


class ReferentialIntegrityTests(unittest.TestCase):
    """THE real invariant (module docstring): every true_counterexamples entry's boundary_case_id MUST resolve
    to a real boundary_cases entry -- a case cannot be confirmed a counterexample if it was never examined as a
    boundary case."""

    def test_well_formed_record_is_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["true_counterexamples"]), 1)

    def test_true_counterexample_referencing_unknown_boundary_case_is_refused(self):
        bad = _true_counterexamples() + [{"boundary_case_id": "BC-99", "contradiction_explanation": "幽靈邊界案例"}]
        with self.assertRaisesRegex(InvariantViolation, "CES_COUNTEREXAMPLE_UNKNOWN_BOUNDARY_CASE"):
            _valid_record(true_counterexamples=bad)

    def test_true_counterexample_referencing_only_unknown_boundary_case_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_COUNTEREXAMPLE_UNKNOWN_BOUNDARY_CASE"):
            _valid_record(true_counterexamples=[{"boundary_case_id": "BC-DOES-NOT-EXIST", "contradiction_explanation": "不存在的邊界案例"}])

    def test_empty_true_counterexamples_with_nonzero_boundary_cases_is_accepted(self):
        """A claim can survive the search -- this is a real, useful result, not a failure. Must NOT raise."""
        record = _valid_record(true_counterexamples=[])
        self.assertEqual(record["true_counterexamples"], [])
        self.assertEqual(len(record["boundary_cases"]), 2)

    def test_duplicate_counterexample_reference_is_refused(self):
        bad = _true_counterexamples() + [{"boundary_case_id": "BC-1", "contradiction_explanation": "重複引用同一個 boundary case"}]
        with self.assertRaisesRegex(InvariantViolation, "CES_DUPLICATE_COUNTEREXAMPLE"):
            _valid_record(true_counterexamples=bad)

    def test_counterexample_missing_explanation_is_refused(self):
        bad = [{"boundary_case_id": "BC-1", "contradiction_explanation": ""}]
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_COUNTEREXAMPLE"):
            _valid_record(true_counterexamples=bad)

    def test_counterexample_missing_boundary_case_id_is_refused(self):
        bad = [{"boundary_case_id": "", "contradiction_explanation": "有解釋但沒有引用"}]
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_COUNTEREXAMPLE"):
            _valid_record(true_counterexamples=bad)

    def test_non_list_true_counterexamples_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_TRUE_COUNTEREXAMPLES"):
            _valid_record(true_counterexamples="not-a-list")

    def test_malformed_counterexample_item_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_COUNTEREXAMPLE"):
            _valid_record(true_counterexamples=["not-a-dict"])

    def test_counterexample_with_extra_key_is_refused(self):
        bad = [{"boundary_case_id": "BC-1", "contradiction_explanation": "解釋", "severity": "high"}]
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_COUNTEREXAMPLE"):
            _valid_record(true_counterexamples=bad)


class BoundaryCasesTests(unittest.TestCase):
    def test_zero_boundary_cases_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_BOUNDARY_CASES"):
            _valid_record(boundary_cases=[], true_counterexamples=[])

    def test_non_list_boundary_cases_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_BOUNDARY_CASES"):
            _valid_record(boundary_cases="not-a-list", true_counterexamples=[])

    def test_duplicate_boundary_case_id_is_refused(self):
        bad = [{"id": "BC-1", "description": "第一個"}, {"id": "BC-1", "description": "重複 id"}]
        with self.assertRaisesRegex(InvariantViolation, "CES_DUPLICATE_BOUNDARY_CASE_ID"):
            _valid_record(boundary_cases=bad, true_counterexamples=[])

    def test_boundary_case_missing_description_is_refused(self):
        bad = [{"id": "BC-1", "description": ""}]
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_BOUNDARY_CASE"):
            _valid_record(boundary_cases=bad, true_counterexamples=[])

    def test_boundary_case_with_extra_key_is_refused(self):
        bad = [{"id": "BC-1", "description": "描述", "severity": "high"}]
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_BOUNDARY_CASE"):
            _valid_record(boundary_cases=bad, true_counterexamples=[])

    def test_malformed_boundary_case_item_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_BOUNDARY_CASE"):
            _valid_record(boundary_cases=["not-a-dict"], true_counterexamples=[])


class ClaimTests(unittest.TestCase):
    def test_empty_claim_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_EMPTY_CLAIM"):
            _valid_record(claim="   ")

    def test_none_claim_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_EMPTY_CLAIM"):
            _valid_record(claim=None)

    def test_well_formed_claim_is_accepted(self):
        record = _valid_record(claim="換一個宣稱")
        self.assertEqual(record["claim"], "換一個宣稱")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "CES-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_VERSION"):
            generate_counterexample_search("CES-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CES_INVALID_PROVENANCE"):
            _valid_record(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_counterexample_search_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_dangling_reference(self):
        """The task-mandated proof: a dangling boundary_case_id spliced in AFTER construction (bypassing the
        builder entirely) must still be caught by the independent gate, not just by the builder."""
        record = copy.deepcopy(_valid_record())
        record["true_counterexamples"].append({"boundary_case_id": "BC-99", "contradiction_explanation": "繞過 builder 直接塞入的幽靈引用"})
        gate = evaluate_counterexample_search_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_boundary_cases(self):
        record = copy.deepcopy(_valid_record())
        record["boundary_cases"] = []
        gate = evaluate_counterexample_search_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_claim(self):
        record = copy.deepcopy(_valid_record())
        record["claim"] = ""
        gate = evaluate_counterexample_search_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_record())
        record["extra_field"] = "smuggled"
        gate = evaluate_counterexample_search_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_record())
        del record["claim"]
        gate = evaluate_counterexample_search_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_passes_hand_tampered_empty_true_counterexamples(self):
        """Negative-of-a-negative control: emptying true_counterexamples is NOT a defect (a claim can survive
        the search) -- the gate must still PASS."""
        record = copy.deepcopy(_valid_record())
        record["true_counterexamples"] = []
        gate = evaluate_counterexample_search_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_counterexample_search_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_counterexample_search_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_counterexample_search_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    """Mirrors stakeholders.game_theory's own aliasing test: the builder must rebuild each nested dict, not just
    shallow-copy the outer list, or a caller mutating their own input after construction would silently rewrite
    a gate-passed record."""

    def test_builder_does_not_alias_the_callers_supplied_boundary_case_dicts(self):
        boundary_cases = _boundary_cases()
        record = _valid_record(boundary_cases=boundary_cases)
        boundary_cases[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(record["boundary_cases"][0]["description"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_counterexample_dicts(self):
        true_counterexamples = _true_counterexamples()
        record = _valid_record(true_counterexamples=true_counterexamples)
        true_counterexamples[0]["contradiction_explanation"] = "tampered-after-construction"
        self.assertNotEqual(record["true_counterexamples"][0]["contradiction_explanation"], "tampered-after-construction")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_counterexample_search_gates_returns_two_gates_in_order(self):
        results = evaluate_counterexample_search_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "counterexample_search_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "challenge.counterexample_search")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "claim", "boundary_cases", "true_counterexamples", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
