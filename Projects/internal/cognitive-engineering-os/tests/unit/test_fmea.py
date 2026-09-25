"""Mutation-style tests for ``challenge.fmea`` (F12 challenge/red-team/risk family, eighth built member).

THE real invariant (Atlas §11.26 L1799-1800's own verbatim warning: "不要只依賴 RPN；高 Severity 即使機率低仍可能
需強制控制") plus the structural invariants supporting it (at least one failure mode, well-formed text fields,
1-10 integer scores excluding Python's bool-is-int-subclass trap, unique failure-mode ids, rpn/action_priority
never caller-supplied), exercised at BOTH layers: construction-time refusal (``generate_fmea_analysis`` raising a
specific ``InvariantViolation`` code) and independent gate re-derivation (``evaluate_fmea_content_integrity_gate``
catching a hand-tampered raw dict that bypassed the builder entirely, never calling the builder itself). Schema
conformance is checked against the real spec-root schema this same slice added
(``typed-objects/fmea-analysis.schema.yaml``).
"""

from __future__ import annotations

import copy
import inspect
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.challenge.fmea import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    compute_action_priority,
    compute_rpn,
    evaluate_fmea_content_integrity_gate,
    evaluate_fmea_gates,
    evaluate_provenance_required_gate,
    generate_fmea_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

FMEA_ANALYSIS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/fmea-analysis.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")


def _failure_modes() -> list[dict]:
    return [
        {
            "id": "FMEA-T-001-FM1",
            "function": "重試失敗的付款請求，最多 3 次",
            "failure_mode": "重試邏輯把同一筆款項重複扣款兩次",
            "effect": "客戶被重複收費，需人工退款",
            "cause": "重試前未先查詢是否已有成功交易記錄（幂等鍵缺失）",
            "existing_control": "",
            "severity": 10,
            "occurrence": 1,
            "detection": 1,
        },
        {
            "id": "FMEA-T-001-FM2",
            "function": "重試失敗的付款請求，最多 3 次",
            "failure_mode": "重試間隔過短導致第三方 API rate limit",
            "effect": "整批重試被拒絕，付款延遲",
            "cause": "固定 1 秒間隔，未實作指數退避",
            "existing_control": "重試次數上限 3 次",
            "severity": 5,
            "occurrence": 8,
            "detection": 6,
        },
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        subject_ref="付款重試背景工作（payment-retry-worker）",
        failure_modes=_failure_modes(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "FMEA-T-001", **overrides: object):
    return generate_fmea_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(FMEA_ANALYSIS_SCHEMA, _valid_analysis(), "fmea analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_fmea_analysis, "FMEA-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/challenge.fmea.contract.yaml")
        self.assertEqual(analysis["id"], "FMEA-T-INVOKE")

    def test_empty_catalog_blocks_fmea_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_analysis())
        tampered["failure_modes"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FMEA_ANALYSIS_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_fmea_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FMEA_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_missing_subject_ref(self):
        analysis = _valid_analysis()
        del analysis["subject_ref"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FMEA_ANALYSIS_SCHEMA, analysis, "analysis with subject_ref removed")

    def test_schema_rejects_non_integer_rpn(self):
        analysis = _valid_analysis()
        analysis["failure_modes"][0]["rpn"] = "high"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FMEA_ANALYSIS_SCHEMA, analysis, "analysis with a non-integer rpn")

    def test_schema_rejects_invented_action_priority_value(self):
        analysis = _valid_analysis()
        analysis["failure_modes"][0]["action_priority"] = "SOMEDAY"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FMEA_ANALYSIS_SCHEMA, analysis, "analysis with an invented action_priority")

    def test_schema_rejects_smuggled_key_on_a_failure_mode_item(self):
        analysis = _valid_analysis()
        analysis["failure_modes"][0]["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FMEA_ANALYSIS_SCHEMA, analysis, "analysis with a smuggled failure_mode key")

    def test_id_is_distinct_from_a_sibling_f12_machine_id(self):
        self.assertEqual(METHOD_ID, "challenge.fmea")
        self.assertNotEqual(METHOD_ID, "challenge.red_team")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "challenge.fmea.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "challenge.fmea contract")


class GenuineComputeTests(unittest.TestCase):
    """rpn/action_priority are GENUINE_COMPUTE -- never accepted as caller-supplied input, always derived."""

    def test_builder_signature_has_no_rpn_parameter(self):
        params = inspect.signature(generate_fmea_analysis).parameters
        self.assertNotIn("rpn", params)

    def test_builder_signature_has_no_action_priority_parameter(self):
        params = inspect.signature(generate_fmea_analysis).parameters
        self.assertNotIn("action_priority", params)

    def test_caller_supplied_rpn_on_a_failure_mode_spec_is_refused(self):
        bad_failure_modes = [{**_failure_modes()[0], "rpn": 999}, _failure_modes()[1]]
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_FAILURE_MODE"):
            _valid_analysis(failure_modes=bad_failure_modes)

    def test_caller_supplied_action_priority_on_a_failure_mode_spec_is_refused(self):
        bad_failure_modes = [{**_failure_modes()[0], "action_priority": "LOW"}, _failure_modes()[1]]
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_FAILURE_MODE"):
            _valid_analysis(failure_modes=bad_failure_modes)

    def test_rpn_is_severity_times_occurrence_times_detection(self):
        self.assertEqual(compute_rpn(5, 8, 6), 240)
        self.assertEqual(compute_rpn(10, 1, 1), 10)
        self.assertEqual(compute_rpn(10, 10, 10), 1000)

    def test_generated_rpn_matches_the_pure_function(self):
        analysis = _valid_analysis()
        fm2 = next(fm for fm in analysis["failure_modes"] if fm["id"] == "FMEA-T-001-FM2")
        self.assertEqual(fm2["rpn"], compute_rpn(5, 8, 6))
        self.assertEqual(fm2["rpn"], 240)


class SeverityOverrideTests(unittest.TestCase):
    """THE real invariant (module docstring): Atlas §11.26 L1799-1800's own explicit warning -- a
    severity>=9 finding MUST resolve to MANDATORY_CONTROL_REQUIRED regardless of how low occurrence/detection
    (and therefore rpn) are. This is the single most important test in this whole method."""

    def test_high_severity_low_occurrence_low_detection_is_forced_mandatory(self):
        """severity=10, occurrence=1, detection=1 -> rpn=10, which the rpn-only tier table (rpn>=50 is the
        lowest non-LOW tier) would call LOW. The severity>=9 override must win anyway."""
        self.assertEqual(compute_rpn(10, 1, 1), 10)
        self.assertLess(compute_rpn(10, 1, 1), 50)  # would be LOW by the tier table alone
        self.assertEqual(compute_action_priority(10, compute_rpn(10, 1, 1)), "MANDATORY_CONTROL_REQUIRED")

    def test_built_analysis_carries_the_override_for_its_high_severity_failure_mode(self):
        analysis = _valid_analysis()
        fm1 = next(fm for fm in analysis["failure_modes"] if fm["id"] == "FMEA-T-001-FM1")
        self.assertEqual(fm1["severity"], 10)
        self.assertEqual(fm1["rpn"], 10)
        self.assertEqual(fm1["action_priority"], "MANDATORY_CONTROL_REQUIRED")

    def test_severity_exactly_at_threshold_is_forced_mandatory(self):
        self.assertEqual(compute_action_priority(9, 1), "MANDATORY_CONTROL_REQUIRED")

    def test_severity_just_below_threshold_is_not_forced(self):
        self.assertNotEqual(compute_action_priority(8, 1), "MANDATORY_CONTROL_REQUIRED")
        self.assertEqual(compute_action_priority(8, 1), "LOW")

    def test_rpn_tier_high(self):
        self.assertEqual(compute_action_priority(5, 200), "HIGH")
        self.assertEqual(compute_action_priority(5, 1000), "HIGH")

    def test_rpn_tier_medium(self):
        self.assertEqual(compute_action_priority(5, 50), "MEDIUM")
        self.assertEqual(compute_action_priority(5, 199), "MEDIUM")

    def test_rpn_tier_low(self):
        self.assertEqual(compute_action_priority(5, 49), "LOW")
        self.assertEqual(compute_action_priority(5, 1), "LOW")

    def test_severity_override_wins_even_at_maximum_rpn_tier_boundary(self):
        """Ordering proof: even when rpn is ALSO high (so the tier table alone would already say HIGH), the
        override still applies -- action_priority is MANDATORY_CONTROL_REQUIRED, not merely HIGH-that-happens-
        to-coincide."""
        self.assertEqual(compute_action_priority(9, 1000), "MANDATORY_CONTROL_REQUIRED")


class FailureModeStructureTests(unittest.TestCase):
    def test_well_formed_analysis_is_accepted(self):
        analysis = _valid_analysis()
        self.assertEqual(len(analysis["failure_modes"]), 2)

    def test_empty_failure_modes_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FMEA_NO_FAILURE_MODES"):
            _valid_analysis(failure_modes=[])

    def test_non_list_failure_modes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FMEA_NO_FAILURE_MODES"):
            _valid_analysis(failure_modes="not-a-list")

    def test_duplicate_failure_mode_id_is_refused(self):
        dup = [_failure_modes()[0], {**_failure_modes()[1], "id": _failure_modes()[0]["id"]}]
        with self.assertRaisesRegex(InvariantViolation, "FMEA_DUPLICATE_FAILURE_MODE_ID"):
            _valid_analysis(failure_modes=dup)

    def test_missing_required_key_on_failure_mode_is_refused(self):
        bad = dict(_failure_modes()[0])
        del bad["cause"]
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_FAILURE_MODE"):
            _valid_analysis(failure_modes=[bad, _failure_modes()[1]])

    def test_empty_function_is_refused(self):
        bad = {**_failure_modes()[0], "function": "   "}
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_FAILURE_MODE"):
            _valid_analysis(failure_modes=[bad, _failure_modes()[1]])

    def test_empty_existing_control_is_accepted(self):
        """'No control exists yet' is itself a valid, common, important finding -- must NOT be refused."""
        analysis = _valid_analysis()
        fm1 = next(fm for fm in analysis["failure_modes"] if fm["id"] == "FMEA-T-001-FM1")
        self.assertEqual(fm1["existing_control"], "")

    def test_non_string_existing_control_is_refused(self):
        bad = {**_failure_modes()[0], "existing_control": None}
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_FAILURE_MODE"):
            _valid_analysis(failure_modes=[bad, _failure_modes()[1]])

    def test_empty_subject_ref_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_SUBJECT_REF"):
            _valid_analysis(subject_ref="   ")


class ScoreValidationTests(unittest.TestCase):
    """severity/occurrence/detection must each be a genuine 1-10 integer, bool excluded (Python's bool is an
    int subclass -- isinstance(True, int) is True, the same documented trap stakeholders.game_theory's own
    _is_number_excluding_bool guards against)."""

    def test_severity_above_ten_is_refused(self):
        bad = {**_failure_modes()[0], "severity": 11}
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_SCORE"):
            _valid_analysis(failure_modes=[bad, _failure_modes()[1]])

    def test_occurrence_below_one_is_refused(self):
        bad = {**_failure_modes()[0], "occurrence": 0}
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_SCORE"):
            _valid_analysis(failure_modes=[bad, _failure_modes()[1]])

    def test_detection_negative_is_refused(self):
        bad = {**_failure_modes()[0], "detection": -1}
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_SCORE"):
            _valid_analysis(failure_modes=[bad, _failure_modes()[1]])

    def test_boolean_severity_true_is_refused(self):
        """Python's bool is an int subclass -- a bare isinstance(value, int) would silently accept True/False
        as scores 1/0. Must be explicitly refused."""
        bad = {**_failure_modes()[0], "severity": True}
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_SCORE"):
            _valid_analysis(failure_modes=[bad, _failure_modes()[1]])

    def test_boolean_occurrence_false_is_refused(self):
        bad = {**_failure_modes()[0], "occurrence": False}
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_SCORE"):
            _valid_analysis(failure_modes=[bad, _failure_modes()[1]])

    def test_float_detection_is_refused(self):
        """Unlike a payoff, an FMEA score is a discrete 1-10 rank -- 5.5 has no defined meaning, refused
        outright rather than accepted-and-finiteness-checked."""
        bad = {**_failure_modes()[0], "detection": 5.5}
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_SCORE"):
            _valid_analysis(failure_modes=[bad, _failure_modes()[1]])

    def test_string_severity_is_refused(self):
        bad = {**_failure_modes()[0], "severity": "10"}
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_SCORE"):
            _valid_analysis(failure_modes=[bad, _failure_modes()[1]])

    def test_boundary_values_one_and_ten_are_accepted(self):
        boundary = {**_failure_modes()[0], "severity": 1, "occurrence": 1, "detection": 1}
        analysis = _valid_analysis(failure_modes=[boundary, _failure_modes()[1]])
        fm = next(fm for fm in analysis["failure_modes"] if fm["id"] == boundary["id"])
        self.assertEqual(fm["rpn"], 1)
        self.assertEqual(fm["action_priority"], "LOW")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "FMEA-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_ID"):
            _valid_analysis(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_VERSION"):
            generate_fmea_analysis("FMEA-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FMEA_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_fmea_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_wrong_rpn(self):
        record = copy.deepcopy(_valid_analysis())
        record["failure_modes"][1]["rpn"] = 1  # true rpn for FM2 (5,8,6) is 240
        gate = evaluate_fmea_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_action_priority_that_ignores_severity_override(self):
        """THE defense-in-depth proof: a hand-tampered record downgrades FM1 (severity=10) from
        MANDATORY_CONTROL_REQUIRED to LOW -- the independent gate, not just the builder, must catch this."""
        record = copy.deepcopy(_valid_analysis())
        fm1 = next(fm for fm in record["failure_modes"] if fm["id"] == "FMEA-T-001-FM1")
        self.assertEqual(fm1["action_priority"], "MANDATORY_CONTROL_REQUIRED")
        fm1["action_priority"] = "LOW"
        gate = evaluate_fmea_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_boolean_score(self):
        record = copy.deepcopy(_valid_analysis())
        record["failure_modes"][0]["severity"] = True
        gate = evaluate_fmea_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_analysis())
        record["extra_field"] = "smuggled"
        gate = evaluate_fmea_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_analysis())
        del record["subject_ref"]
        gate = evaluate_fmea_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_smuggled_key_on_a_failure_mode_item(self):
        record = copy.deepcopy(_valid_analysis())
        record["failure_modes"][0]["approved"] = True
        gate = evaluate_fmea_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_duplicate_failure_mode_id(self):
        record = copy.deepcopy(_valid_analysis())
        record["failure_modes"][1]["id"] = record["failure_modes"][0]["id"]
        gate = evaluate_fmea_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_fmea_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_analysis())
        record["id"] = "WRONG-001"
        gate = evaluate_fmea_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_analysis())
        record["version"] = 1
        gate = evaluate_fmea_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_empty_failure_modes(self):
        record = copy.deepcopy(_valid_analysis())
        record["failure_modes"] = []
        gate = evaluate_fmea_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_analysis())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    """Mirrors stakeholders.game_theory's own aliasing test class -- mutating the caller's own input dict after
    construction must not silently rewrite a gate-passed record."""

    def test_builder_does_not_alias_the_callers_supplied_failure_mode_dicts(self):
        failure_modes = _failure_modes()
        analysis = _valid_analysis(failure_modes=failure_modes)
        failure_modes[0]["cause"] = "tampered-after-construction"
        stored_fm1 = next(fm for fm in analysis["failure_modes"] if fm["id"] == "FMEA-T-001-FM1")
        self.assertNotEqual(stored_fm1["cause"], "tampered-after-construction")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_fmea_gates_returns_two_gates_in_order(self):
        results = evaluate_fmea_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "fmea_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "challenge.fmea")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "subject_ref", "failure_modes", "provenance"},
        )

    def test_builder_does_not_leak_extra_failure_mode_keys(self):
        analysis = _valid_analysis()
        expected_keys = {"id", "function", "failure_mode", "effect", "cause", "existing_control", "severity", "occurrence", "detection", "rpn", "action_priority"}
        for fm in analysis["failure_modes"]:
            self.assertEqual(set(fm.keys()), expected_keys)


if __name__ == "__main__":
    unittest.main()
