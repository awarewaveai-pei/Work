"""Mutation-style tests for ``challenge.pre_mortem`` (F12 challenge/red-team/risk family, 4th built member).

THE real invariant (cause-to-control coverage, Atlas §11.25 step 5's own "建 prevention/detection/recovery
control") plus the structural invariants supporting it (failure_scenario non-empty, >=1 failure cause each
well-shaped with a closed likelihood/impact vocabulary, every control referencing a real cause, no duplicates,
``priority`` GENUINE_COMPUTE and never caller-supplied), exercised at BOTH layers: construction-time refusal
(``generate_pre_mortem_analysis`` raising a specific ``InvariantViolation`` code) and independent gate
re-derivation (``evaluate_pre_mortem_integrity_gate`` catching a hand-tampered raw dict that bypassed the
builder entirely, never calling the builder itself). Schema conformance is checked against the real spec-root
schema this same slice added (``typed-objects/pre-mortem-analysis.schema.yaml``).
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
from ai_lego.modules.challenge.pre_mortem import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_CONTROL_TYPES,
    VALID_LEVELS,
    all_gates_pass,
    control,
    derive_cause_priority,
    evaluate_pre_mortem_gates,
    evaluate_pre_mortem_integrity_gate,
    evaluate_provenance_required_gate,
    failure_cause,
    generate_pre_mortem_analysis,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

PRE_MORTEM_SCHEMA = "ai-lego://specs/cognitive/typed-objects/pre-mortem-analysis.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "HUMAN_ORIGINAL")


def _failure_causes() -> list[dict]:
    return [
        {"id": "FC-001", "description": "AI 產出內容沒有任何自動品質監控", "cluster": "監控缺口", "likelihood": "HIGH", "impact": "HIGH"},
        {"id": "FC-002", "description": "上線前跳過人工審核步驟", "cluster": "流程缺口", "likelihood": "MEDIUM", "impact": "HIGH"},
    ]


def _controls() -> list[dict]:
    return [
        {"id": "CTRL-001", "control_type": "PREVENTION", "description": "上線前導入強制人工審核步驟", "addresses_cause_id": "FC-002"},
        {"id": "CTRL-002", "control_type": "DETECTION", "description": "加入內容品質異常自動告警", "addresses_cause_id": "FC-001"},
        {"id": "CTRL-003", "control_type": "RECOVERY", "description": "保留一鍵回滾到人工審核流程的開關", "addresses_cause_id": "FC-001"},
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        failure_scenario="一年後，這次全自動 AI 內容發布上線徹底失敗了，為什麼？",
        failure_causes=_failure_causes(),
        controls=_controls(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_analysis(*, record_id: str = "PREMORTEM-T-001", **overrides: object):
    return generate_pre_mortem_analysis(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_analysis_validates_against_the_real_schema(self):
        self.contracts.validate(PRE_MORTEM_SCHEMA, _valid_analysis(), "pre-mortem analysis")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, analysis = live.invoke(METHOD_ID, generate_pre_mortem_analysis, "PREMORTEM-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/challenge.pre_mortem.contract.yaml")
        self.assertEqual(analysis["id"], "PREMORTEM-T-INVOKE")

    def test_empty_catalog_blocks_pre_mortem_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_analysis())
        tampered["failure_causes"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PRE_MORTEM_SCHEMA, tampered, "tampered analysis")
        gate = evaluate_pre_mortem_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        analysis = _valid_analysis()
        analysis["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PRE_MORTEM_SCHEMA, analysis, "analysis with a smuggled top-level key")

    def test_schema_rejects_missing_failure_scenario(self):
        analysis = _valid_analysis()
        del analysis["failure_scenario"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PRE_MORTEM_SCHEMA, analysis, "analysis with failure_scenario removed")

    def test_schema_rejects_out_of_vocabulary_control_type(self):
        analysis = _valid_analysis()
        analysis["controls"][0]["control_type"] = "MITIGATION"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(PRE_MORTEM_SCHEMA, analysis, "analysis with an invalid control_type")

    def test_id_is_distinct_from_a_sibling_f12_machine_id(self):
        self.assertEqual(METHOD_ID, "challenge.pre_mortem")
        self.assertNotEqual(METHOD_ID, "challenge.red_team")
        self.assertNotEqual(METHOD_ID, "challenge.blue_team")
        self.assertNotEqual(METHOD_ID, "challenge.independent_judge")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "challenge.pre_mortem.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "challenge.pre_mortem contract")


class PriorityDerivationTests(unittest.TestCase):
    """GENUINE_COMPUTE: `priority` is a total 3x3 lookup over (likelihood, impact), never a builder parameter."""

    def test_all_nine_combinations_produce_a_deterministic_priority(self):
        expected = {
            ("LOW", "LOW"): "LOW",
            ("LOW", "MEDIUM"): "LOW",
            ("LOW", "HIGH"): "MEDIUM",
            ("MEDIUM", "LOW"): "LOW",
            ("MEDIUM", "MEDIUM"): "MEDIUM",
            ("MEDIUM", "HIGH"): "HIGH",
            ("HIGH", "LOW"): "MEDIUM",
            ("HIGH", "MEDIUM"): "HIGH",
            ("HIGH", "HIGH"): "CRITICAL",
        }
        for (likelihood, impact), priority in expected.items():
            with self.subTest(likelihood=likelihood, impact=impact):
                self.assertEqual(derive_cause_priority(likelihood, impact), priority)

    def test_invalid_likelihood_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_LEVEL"):
            derive_cause_priority("EXTREME", "HIGH")

    def test_invalid_impact_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_LEVEL"):
            derive_cause_priority("HIGH", "NONE")

    def test_builder_has_no_priority_parameter(self):
        """Verified via inspect.signature, not just by reading the source -- `priority` must never be an
        accepted constructor parameter anywhere in this method's own public surface."""
        self.assertNotIn("priority", inspect.signature(generate_pre_mortem_analysis).parameters)

    def test_failure_cause_convenience_constructor_has_no_priority_parameter(self):
        self.assertNotIn("priority", inspect.signature(failure_cause).parameters)

    def test_stored_cause_priority_matches_its_own_likelihood_and_impact(self):
        analysis = _valid_analysis()
        for entry in analysis["failure_causes"]:
            self.assertEqual(entry["priority"], derive_cause_priority(entry["likelihood"], entry["impact"]))
        fc001 = next(e for e in analysis["failure_causes"] if e["id"] == "FC-001")
        self.assertEqual(fc001["priority"], "CRITICAL")  # HIGH x HIGH
        fc002 = next(e for e in analysis["failure_causes"] if e["id"] == "FC-002")
        self.assertEqual(fc002["priority"], "HIGH")  # MEDIUM x HIGH

    def test_caller_supplied_priority_key_on_a_hand_built_cause_dict_is_refused(self):
        """A hand-crafted dict smuggling a `priority` key past `failure_cause()` must still be refused by the
        builder's own input-shape check (exactly the input keys, no more)."""
        bad_causes = _failure_causes()
        bad_causes[0] = {**bad_causes[0], "priority": "CRITICAL"}
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_CAUSE_ENTRY"):
            _valid_analysis(failure_causes=bad_causes)


class CoverageCompletenessTests(unittest.TestCase):
    """THE real invariant (module docstring): every failure_causes[] entry MUST be referenced by >=1
    controls[] entry's addresses_cause_id before construction succeeds -- Atlas §11.25 step 5 mechanized."""

    def test_well_formed_analysis_is_accepted(self):
        analysis = _valid_analysis()
        self.assertEqual(len(analysis["failure_causes"]), 2)
        self.assertEqual(len(analysis["controls"]), 3)

    def test_cause_with_zero_covering_controls_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_UNCOVERED_CAUSE"):
            _valid_analysis(controls=[c for c in _controls() if c["id"] != "CTRL-001"])

    def test_all_causes_uncovered_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_UNCOVERED_CAUSE"):
            _valid_analysis(controls=[])

    def test_control_referencing_unknown_cause_is_refused(self):
        bad_controls = _controls() + [{"id": "CTRL-999", "control_type": "PREVENTION", "description": "幽靈控制", "addresses_cause_id": "FC-999"}]
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_CONTROL_UNKNOWN_CAUSE"):
            _valid_analysis(controls=bad_controls)

    def test_multiple_controls_may_cover_the_same_cause(self):
        analysis = _valid_analysis()
        fc001_controls = [c for c in analysis["controls"] if c["addresses_cause_id"] == "FC-001"]
        self.assertEqual(len(fc001_controls), 2)

    def test_out_of_vocabulary_control_type_is_refused(self):
        bad_controls = _controls()
        bad_controls[0] = {**bad_controls[0], "control_type": "MITIGATION"}
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_CONTROL_ENTRY"):
            _valid_analysis(controls=bad_controls)

    def test_control_missing_description_is_refused(self):
        bad_controls = _controls()
        bad_controls[0] = {**bad_controls[0], "description": ""}
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_CONTROL_ENTRY"):
            _valid_analysis(controls=bad_controls)


class FailureCausesTests(unittest.TestCase):
    def test_empty_failure_causes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_EMPTY_CAUSES"):
            _valid_analysis(failure_causes=[], controls=[])

    def test_out_of_vocabulary_likelihood_is_refused(self):
        bad_causes = _failure_causes()
        bad_causes[0] = {**bad_causes[0], "likelihood": "EXTREME"}
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_CAUSE_ENTRY"):
            _valid_analysis(failure_causes=bad_causes)

    def test_out_of_vocabulary_impact_is_refused(self):
        bad_causes = _failure_causes()
        bad_causes[0] = {**bad_causes[0], "impact": "NONE"}
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_CAUSE_ENTRY"):
            _valid_analysis(failure_causes=bad_causes)

    def test_empty_cluster_is_refused(self):
        bad_causes = _failure_causes()
        bad_causes[0] = {**bad_causes[0], "cluster": "   "}
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_CAUSE_ENTRY"):
            _valid_analysis(failure_causes=bad_causes)

    def test_duplicate_cause_id_is_refused(self):
        bad_causes = _failure_causes()
        bad_causes[1] = {**bad_causes[1], "id": "FC-001"}
        bad_controls = [{"id": "CTRL-001", "control_type": "PREVENTION", "description": "涵蓋", "addresses_cause_id": "FC-001"}]
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_DUPLICATE_CAUSE_ID"):
            _valid_analysis(failure_causes=bad_causes, controls=bad_controls)

    def test_non_list_failure_causes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_EMPTY_CAUSES"):
            _valid_analysis(failure_causes="not-a-list")


class ScenarioTests(unittest.TestCase):
    def test_empty_failure_scenario_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_EMPTY_SCENARIO"):
            _valid_analysis(failure_scenario="   ")

    def test_none_failure_scenario_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_EMPTY_SCENARIO"):
            _valid_analysis(failure_scenario=None)

    def test_well_formed_scenario_is_accepted(self):
        analysis = _valid_analysis(failure_scenario="兩年後這個產品被競品徹底取代")
        self.assertEqual(analysis["failure_scenario"], "兩年後這個產品被競品徹底取代")


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "PREMORTEM-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_ID"):
            _valid_analysis(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_ID"):
            _valid_analysis(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_VERSION"):
            generate_pre_mortem_analysis("PREMORTEM-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_PROVENANCE"):
            _valid_analysis(provenance={"epistemic_type": "NOT_REAL"})


class ConvenienceConstructorTests(unittest.TestCase):
    def test_failure_cause_builds_a_well_formed_input_entry(self):
        entry = failure_cause("FC-010", "描述", "群組", "HIGH", "LOW")
        self.assertEqual(entry, {"id": "FC-010", "description": "描述", "cluster": "群組", "likelihood": "HIGH", "impact": "LOW"})

    def test_failure_cause_rejects_empty_description(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_CAUSE"):
            failure_cause("FC-010", "", "群組", "HIGH", "LOW")

    def test_failure_cause_rejects_invalid_likelihood(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_LEVEL"):
            failure_cause("FC-010", "描述", "群組", "EXTREME", "LOW")

    def test_control_builds_a_well_formed_entry(self):
        entry = control("CTRL-010", "DETECTION", "描述", "FC-001")
        self.assertEqual(entry, {"id": "CTRL-010", "control_type": "DETECTION", "description": "描述", "addresses_cause_id": "FC-001"})

    def test_control_rejects_invalid_control_type(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_CONTROL_TYPE"):
            control("CTRL-010", "MITIGATION", "描述", "FC-001")

    def test_control_rejects_empty_addresses_cause_id(self):
        with self.assertRaisesRegex(InvariantViolation, "PREMORTEM_INVALID_CONTROL"):
            control("CTRL-010", "DETECTION", "描述", "")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID analysis' raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_analysis(self):
        results = evaluate_pre_mortem_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_integrity_gate_catches_hand_tampered_missing_covering_control(self):
        """The exact scenario the task brief prescribes: a hand-tampered record (bypassing the builder to
        construct an uncovered-cause dict directly) must be caught by the independent gate, not just the
        builder."""
        record = copy.deepcopy(_valid_analysis())
        record["controls"] = [c for c in record["controls"] if c["id"] != "CTRL-001"]  # was the only cover for FC-002
        gate = evaluate_pre_mortem_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("FC-002", gate["evidence"][0]["uncovered_cause_ids"])

    def test_integrity_gate_catches_hand_tampered_priority_disagreeing_with_its_own_levels(self):
        record = copy.deepcopy(_valid_analysis())
        record["failure_causes"][0]["priority"] = "LOW"  # was CRITICAL for HIGH x HIGH
        gate = evaluate_pre_mortem_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_hand_tampered_control_referencing_unknown_cause(self):
        record = copy.deepcopy(_valid_analysis())
        record["controls"][0]["addresses_cause_id"] = "FC-GHOST"
        gate = evaluate_pre_mortem_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_analysis())
        record["extra_field"] = "smuggled"
        # unknown top-level key is not itself checked field-by-field by the gate (no _STORED_CONTENT_KEYS in
        # this module); assert schema-level rejection instead, matching this file's own defense-in-depth test.
        spec_root = resolve_spec_root()
        contracts = SchemaContracts(spec_root)
        with self.assertRaises(SchemaValidationError):
            contracts.validate(PRE_MORTEM_SCHEMA, record, "record with a smuggled top-level key")

    def test_integrity_gate_catches_missing_failure_scenario(self):
        record = copy.deepcopy(_valid_analysis())
        record["failure_scenario"] = ""
        gate = evaluate_pre_mortem_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_pre_mortem_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_analysis())
        record["id"] = "WRONG-001"
        gate = evaluate_pre_mortem_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_analysis())
        record["version"] = 1
        gate = evaluate_pre_mortem_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_integrity_gate_catches_duplicate_cause_id(self):
        record = copy.deepcopy(_valid_analysis())
        record["failure_causes"][1]["id"] = record["failure_causes"][0]["id"]
        gate = evaluate_pre_mortem_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
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
    """The builder must not alias the caller's own nested dicts -- post-construction mutation of the caller's
    input must not silently rewrite a gate-passed record. Same discipline every sibling module in this package
    (e.g. stakeholders.game_theory's own critic-fixed gap) already establishes."""

    def test_builder_does_not_alias_the_callers_supplied_control_dicts(self):
        controls = _controls()
        analysis = _valid_analysis(controls=controls)
        controls[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(analysis["controls"][0]["description"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_cause_dicts(self):
        causes = _failure_causes()
        analysis = _valid_analysis(failure_causes=causes)
        causes[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(analysis["failure_causes"][0]["description"], "tampered-after-construction")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_pre_mortem_gates_returns_two_gates_in_order(self):
        results = evaluate_pre_mortem_gates(_valid_analysis(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "pre_mortem_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "challenge.pre_mortem")

    def test_valid_levels_and_control_types_constants(self):
        self.assertEqual(VALID_LEVELS, frozenset({"LOW", "MEDIUM", "HIGH"}))
        self.assertEqual(VALID_CONTROL_TYPES, frozenset({"PREVENTION", "DETECTION", "RECOVERY"}))

    def test_builder_does_not_leak_extra_top_level_keys(self):
        analysis = _valid_analysis()
        self.assertEqual(
            set(analysis.keys()),
            {"id", "version", "generated_by_method", "failure_scenario", "failure_causes", "controls", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
