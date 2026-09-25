"""Mutation-style tests for ``security.stride`` (forty-fourth Method Atlas slice, FIRST member of a NEW
`security` family, F20). A STRUCTURAL record (provenance_required + one integrity gate), not genuine compute:
`elements_with_no_recorded_threats` is a re-derived structural set-difference, proven at BOTH independent
layers -- referential integrity of threats[].element_name against data_flow_elements[] is checked at
construction, and the gate independently RECOMPUTES elements_with_no_recorded_threats fresh from the record's
own raw fields rather than trusting a stored value."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.security.stride import (
    METHOD_ID,
    VALID_CATEGORIES,
    VALID_ELEMENT_TYPES,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_stride_gates,
    evaluate_stride_integrity_gate,
    generate_stride_threat_model_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/stride-threat-model-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _tb(name="boundary A", description="a description"):
    return {"name": name, "description": description}


def _dfd(name="process_a", element_type="process"):
    return {"name": name, "element_type": element_type}


def _threat(element_name="process_a", category="tampering", description="d", control="c", residual_risk="r", test_evidence="t"):
    return {"element_name": element_name, "category": category, "description": description, "control": control, "residual_risk": residual_risk, "test_evidence": test_evidence}


def _build(
    record_id="STRIDE-T-001",
    system_or_component="a system",
    assets=None,
    trust_boundaries=None,
    entry_points=None,
    data_flow_elements=None,
    threats=None,
):
    return generate_stride_threat_model_record(
        record_id,
        system_or_component,
        ["an asset"] if assets is None else assets,
        [] if trust_boundaries is None else trust_boundaries,
        [] if entry_points is None else entry_points,
        [_dfd()] if data_flow_elements is None else data_flow_elements,
        [] if threats is None else threats,
        _prov(),
    )


def _valid_record():
    return _build()


def _checkout_record():
    return _build(
        record_id="STRIDE-T-002",
        system_or_component="checkout-api order processing service",
        assets=["customer PII database", "payment processing credentials"],
        trust_boundaries=[_tb("public internet to API gateway", "unauthenticated traffic crosses here")],
        entry_points=["POST /v1/checkout"],
        data_flow_elements=[_dfd("checkout_api_process", "process"), _dfd("order_database", "data_store")],
        threats=[_threat("checkout_api_process", "elevation_of_privilege")],
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "single-element STRIDE record")

    def test_checkout_record_validates_and_surfaces_uncovered_element(self):
        record = _checkout_record()
        self.contracts.validate(RECORD_SCHEMA, record, "checkout-api STRIDE record")
        self.assertEqual(record["elements_with_no_recorded_threats"], ["order_database"])

    def test_zero_threats_record_validates_and_surfaces_every_element_as_uncovered(self):
        record = _build(record_id="STRIDE-T-003", data_flow_elements=[_dfd("a"), _dfd("b")], threats=[])
        self.contracts.validate(RECORD_SCHEMA, record, "zero-threats STRIDE record")
        self.assertEqual(record["elements_with_no_recorded_threats"], ["a", "b"])

    def test_fully_covered_record_has_empty_elements_with_no_recorded_threats(self):
        record = _build(record_id="STRIDE-T-004", data_flow_elements=[_dfd("a"), _dfd("b")], threats=[_threat("a"), _threat("b", category="spoofing")])
        self.contracts.validate(RECORD_SCHEMA, record, "fully-covered STRIDE record")
        self.assertEqual(record["elements_with_no_recorded_threats"], [])

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_stride_threat_model_record(
            "STRIDE-T-005", "s", ["a"], [], [], [_dfd()], [], _prov(), version="2.3.4", generated_by_method="security.stride@test"
        )
        self.assertEqual(record["generated_by_method"], "security.stride@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_elements_with_no_recorded_threats_is_not_a_builder_parameter(self):
        """Confirms the builder signature has no way to directly set this field -- always computed."""
        import inspect

        params = list(inspect.signature(generate_stride_threat_model_record).parameters)
        self.assertNotIn("elements_with_no_recorded_threats", params)

    # --- all six STRIDE categories and all four DFD element types round-trip ---
    def test_all_six_stride_categories_round_trip_through_builder_and_gates(self):
        expected = {"spoofing", "tampering", "repudiation", "information_disclosure", "denial_of_service", "elevation_of_privilege"}
        self.assertEqual(VALID_CATEGORIES, frozenset(expected))
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "stride-threat-model-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        schema_enum = set(schema_doc["$defs"]["threat"]["properties"]["category"]["enum"])
        self.assertEqual(schema_enum, expected)
        for category in expected:
            with self.subTest(category=category):
                record = _build(threats=[_threat(category=category)])
                self.contracts.validate(RECORD_SCHEMA, record, f"round-trip for category={category}")
                self.assertTrue(all_gates_pass(evaluate_stride_gates(record, "test", TS)))

    def test_all_four_dfd_element_types_round_trip_through_builder_and_gates(self):
        expected = {"external_entity", "process", "data_store", "data_flow"}
        self.assertEqual(VALID_ELEMENT_TYPES, frozenset(expected))
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "stride-threat-model-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        schema_enum = set(schema_doc["$defs"]["data_flow_element"]["properties"]["element_type"]["enum"])
        self.assertEqual(schema_enum, expected)
        for element_type in expected:
            with self.subTest(element_type=element_type):
                record = _build(data_flow_elements=[_dfd("e", element_type)])
                self.contracts.validate(RECORD_SCHEMA, record, f"round-trip for element_type={element_type}")
                self.assertTrue(all_gates_pass(evaluate_stride_gates(record, "test", TS)))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "stride-threat-model-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "stride-threat-model-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_stride_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version (checked at both layers from this first draft) ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_stride_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_RECORD_ID"):
            _build(record_id="ERD-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_VERSION"):
            generate_stride_threat_model_record("STRIDE-T-V1", "s", ["a"], [], [], [_dfd()], [], _prov(), version=123)

    def test_none_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_VERSION"):
            generate_stride_threat_model_record("STRIDE-T-V2", "s", ["a"], [], [], [_dfd()], [], _prov(), version=None)

    def test_empty_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_EMPTY_RECORD_FIELD"):
            _build(system_or_component="")

    def test_whitespace_only_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_EMPTY_RECORD_FIELD"):
            _build(system_or_component="   ")

    # --- assets ---
    def test_empty_assets_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_ASSETS"):
            _build(assets=[])

    def test_non_list_assets_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_ASSETS"):
            _build(assets="an asset")

    def test_assets_with_empty_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_ASSETS"):
            _build(assets=["a", ""])

    def test_assets_with_non_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_ASSETS"):
            _build(assets=["a", 123])

    # --- trust_boundaries ---
    def test_empty_trust_boundaries_list_is_legal(self):
        record = _build(trust_boundaries=[])
        self.assertEqual(record["trust_boundaries"], [])

    def test_trust_boundary_missing_a_required_key_is_refused(self):
        entry = _tb()
        del entry["description"]
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_TRUST_BOUNDARIES"):
            _build(trust_boundaries=[entry])

    def test_trust_boundary_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_TRUST_BOUNDARIES"):
            _build(trust_boundaries=[dict(_tb(), owner="x")])

    def test_trust_boundary_with_empty_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_TRUST_BOUNDARIES"):
            _build(trust_boundaries=[_tb(name="")])

    def test_non_list_trust_boundaries_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_TRUST_BOUNDARIES"):
            _build(trust_boundaries="not a list")

    # --- entry_points ---
    def test_empty_entry_points_list_is_legal(self):
        record = _build(entry_points=[])
        self.assertEqual(record["entry_points"], [])

    def test_entry_points_with_non_string_entry_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_ENTRY_POINTS"):
            _build(entry_points=["a", 1])

    def test_non_list_entry_points_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_ENTRY_POINTS"):
            _build(entry_points="a")

    # --- data_flow_elements ---
    def test_empty_data_flow_elements_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_DATA_FLOW_ELEMENTS"):
            _build(data_flow_elements=[])

    def test_data_flow_element_illegal_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_DATA_FLOW_ELEMENTS"):
            _build(data_flow_elements=[_dfd(element_type="database")])

    def test_data_flow_element_missing_key_is_refused(self):
        entry = _dfd()
        del entry["element_type"]
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_DATA_FLOW_ELEMENTS"):
            _build(data_flow_elements=[entry])

    def test_data_flow_element_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_DATA_FLOW_ELEMENTS"):
            _build(data_flow_elements=[dict(_dfd(), owner="x")])

    def test_duplicate_data_flow_element_names_are_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_DATA_FLOW_ELEMENTS"):
            _build(data_flow_elements=[_dfd("same"), _dfd("same", "data_store")])

    def test_non_list_data_flow_elements_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_DATA_FLOW_ELEMENTS"):
            _build(data_flow_elements="process_a")

    # --- threats: shape + referential integrity (the core real invariant) ---
    def test_empty_threats_list_is_legal(self):
        record = _build(threats=[])
        self.assertEqual(record["threats"], [])

    def test_threat_naming_a_nonexistent_element_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_THREATS"):
            _build(data_flow_elements=[_dfd("real_element")], threats=[_threat("nonexistent_element")])

    def test_threat_illegal_category_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_THREATS"):
            _build(threats=[_threat(category="sql_injection")])

    def test_threat_missing_a_required_key_is_refused(self):
        entry = _threat()
        del entry["control"]
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_THREATS"):
            _build(threats=[entry])

    def test_threat_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_THREATS"):
            _build(threats=[dict(_threat(), severity="high")])

    def test_threat_with_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_THREATS"):
            _build(threats=[_threat(description="")])

    def test_threat_with_empty_control_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_THREATS"):
            _build(threats=[_threat(control="  ")])

    def test_threat_with_empty_residual_risk_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_THREATS"):
            _build(threats=[_threat(residual_risk="")])

    def test_threat_with_empty_test_evidence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_THREATS"):
            _build(threats=[_threat(test_evidence="")])

    def test_non_list_threats_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "STRIDE_INVALID_THREATS"):
            _build(threats="a threat")

    def test_multiple_threats_against_the_same_element_are_legal(self):
        record = _build(threats=[_threat(category="spoofing"), _threat(category="tampering")])
        self.assertEqual(len(record["threats"]), 2)
        self.assertEqual(record["elements_with_no_recorded_threats"], [])

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_stride_prefix(self):
        record = _valid_record()
        record["id"] = "ERD-1"
        with self.assertRaisesRegex(Exception, "STRIDE-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_an_illegal_element_type_value(self):
        record = _valid_record()
        record["data_flow_elements"][0]["element_type"] = "database"
        with self.assertRaisesRegex(Exception, "database"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema element_type enum")

    def test_schema_layer_rejects_an_illegal_category_value(self):
        record = _build(threats=[_threat(category="tampering")])
        record["threats"][0]["category"] = "sql_injection"
        with self.assertRaisesRegex(Exception, "sql_injection"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema category enum")

    def test_schema_layer_rejects_extra_key_on_a_threat_entry(self):
        record = _build(threats=[_threat()])
        record["threats"][0]["severity"] = "high"
        with self.assertRaisesRegex(Exception, "severity"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema threat additionalProperties")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["assets"]
        with self.assertRaisesRegex(Exception, "assets"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_empty_data_flow_elements(self):
        record = _valid_record()
        record["data_flow_elements"] = []
        with self.assertRaisesRegex(Exception, "data_flow_elements"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema data_flow_elements minItems")

    def test_schema_layer_accepts_empty_threats(self):
        record = _build(threats=[])
        self.contracts.validate(RECORD_SCHEMA, record, "schema empty threats")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        assets = ["a"]
        trust_boundaries = [_tb()]
        entry_points = ["ep"]
        data_flow_elements = [_dfd()]
        threats = [_threat()]
        record = generate_stride_threat_model_record("STRIDE-T-010", "s", assets, trust_boundaries, entry_points, data_flow_elements, threats, _prov())
        assets.append("mutated")
        trust_boundaries[0]["name"] = "mutated"
        entry_points.append("mutated")
        data_flow_elements[0]["name"] = "mutated"
        threats[0]["description"] = "mutated"
        self.assertEqual(record["assets"], ["a"])
        self.assertEqual(record["trust_boundaries"][0]["name"], "boundary A")
        self.assertEqual(record["entry_points"], ["ep"])
        self.assertEqual(record["data_flow_elements"][0]["name"], "process_a")
        self.assertEqual(record["threats"][0]["description"], "d")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_stride_threat_model_record("STRIDE-T-011", "s", ["a"], [], [], [_dfd()], [], provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_stride_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_stride_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_stride_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "stride_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_checkout_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_stride_gates(_checkout_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_stride_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'STRIDE-'")

    def test_hand_tampered_id_without_stride_prefix_fails_the_gate(self):
        record = _valid_record()
        record["id"] = "ERD-1"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'STRIDE-'")

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_missing_version_key_fails_the_gate(self):
        record = _valid_record()
        del record["version"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_empty_system_or_component_fails_the_gate(self):
        record = _valid_record()
        record["system_or_component"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "system_or_component missing or empty")

    def test_hand_tampered_empty_assets_fails_the_gate(self):
        record = _valid_record()
        record["assets"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "assets invalid (empty, malformed, or non-string entry)")

    def test_hand_tampered_trust_boundary_extra_key_fails_the_gate(self):
        record = _build(trust_boundaries=[_tb()])
        record["trust_boundaries"][0]["owner"] = "x"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "trust_boundaries invalid (malformed entry or unknown keys)")

    def test_hand_tampered_non_string_entry_point_fails_the_gate(self):
        record = _build(entry_points=["a"])
        record["entry_points"][0] = 1
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "entry_points invalid (not a list, or contains a non-string/empty entry)")

    def test_hand_tampered_illegal_element_type_fails_the_gate(self):
        record = _valid_record()
        record["data_flow_elements"][0]["element_type"] = "database"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "data_flow_elements invalid (empty, malformed entry, illegal element_type, or duplicate name)")

    def test_hand_tampered_duplicate_element_names_fails_the_gate(self):
        record = _build(data_flow_elements=[_dfd("a"), _dfd("b")])
        record["data_flow_elements"][1]["name"] = "a"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "data_flow_elements invalid (empty, malformed entry, illegal element_type, or duplicate name)")

    def test_hand_tampered_dangling_threat_element_name_fails_the_gate(self):
        """The core referential-integrity invariant re-checked at the independent gate layer: a threat's
        element_name renamed to something no longer present in data_flow_elements[]."""
        record = _checkout_record()
        record["threats"][0]["element_name"] = "nonexistent_element"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "threats invalid (malformed entry, unknown keys, illegal category, dangling element_name, or empty description/control/residual_risk/test_evidence)")

    def test_hand_tampered_illegal_threat_category_fails_the_gate(self):
        record = _build(threats=[_threat()])
        record["threats"][0]["category"] = "sql_injection"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "threats invalid (malformed entry, unknown keys, illegal category, dangling element_name, or empty description/control/residual_risk/test_evidence)")

    def test_hand_tampered_empty_threat_field_fails_the_gate(self):
        """Regression guard mirroring the immediately preceding slice's own critic-caught Major: pins the
        gate's re-derivation for EVERY per-threat text field individually, not just one."""
        for field_name in ("description", "control", "residual_risk", "test_evidence"):
            with self.subTest(field_name=field_name):
                record = _build(threats=[_threat()])
                record["threats"][0][field_name] = " "
                gate = self._gate(record)
                self.assertEqual(gate["status"], "FAIL")
                self.assertEqual(
                    gate["evidence"][0]["reason"],
                    "threats invalid (malformed entry, unknown keys, illegal category, dangling element_name, or empty description/control/residual_risk/test_evidence)",
                )

    def test_hand_tampered_elements_with_no_recorded_threats_mismatch_fails_the_gate(self):
        """The core re-derived-not-trusted invariant: falsely emptying elements_with_no_recorded_threats on a
        record that genuinely has an uncovered element must be caught by recomputation, not accepted because
        the stored value merely LOOKS well-formed."""
        record = _checkout_record()
        self.assertEqual(record["elements_with_no_recorded_threats"], ["order_database"])
        record["elements_with_no_recorded_threats"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored elements_with_no_recorded_threats disagrees with recomputation")
        self.assertEqual(gate["evidence"][0]["stored"], [])
        self.assertEqual(gate["evidence"][0]["recomputed"], ["order_database"])

    def test_hand_tampered_elements_with_no_recorded_threats_falsely_populated_fails_the_gate(self):
        """The inverse direction: falsely claiming a fully-covered element has no recorded threats."""
        record = _build(data_flow_elements=[_dfd("a"), _dfd("b")], threats=[_threat("a"), _threat("b", category="spoofing")])
        self.assertEqual(record["elements_with_no_recorded_threats"], [])
        record["elements_with_no_recorded_threats"] = ["a"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "stored elements_with_no_recorded_threats disagrees with recomputation")

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_checkout_record())
        self.assertEqual(gate["evidence"][0], {"asset_count": 2, "data_flow_element_count": 2, "threat_count": 1, "elements_with_no_recorded_threats_count": 1})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _checkout_record()
        before = copy.deepcopy(record)
        self._gate(record)
        self.assertEqual(record, before)

    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
