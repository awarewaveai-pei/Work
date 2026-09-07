"""Mutation-style tests for ``security.security_control_mapping`` (fifty-third Method Atlas slice, TENTH
and LAST member of the `security` family, F20 -- closing F20 10/10). Two real invariant classes proven at
BOTH the construction and the independent gate layer: (1) WITHIN-RECORD referential integrity
(control_mappings[].control_id must name a real controls[].control_id) and (2) CROSS-RECORD referential
integrity (control_mappings[].source_threat_index/element_name/category must genuinely match the REAL
external source_record's own threats[] at that index) -- the first F20 invariant class that spans two
separate records, proven in BOTH of the gate's own two disclosed modes (full, with the real source_record
supplied; and the weaker, fully self-contained fallback that still catches a real tamper via
source_threat_count)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.security.security_control_mapping import (
    METHOD_ID,
    SOURCE_RECORD_TYPES,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_security_control_mapping_gates,
    evaluate_security_control_mapping_integrity_gate,
    generate_security_control_mapping_record,
)
from ai_lego.modules.security.stride import generate_stride_threat_model_record
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/security-control-mapping-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _evidence(description="d", verified_by="v", verified_date="2026-09-06"):
    return {"description": description, "verified_by": verified_by, "verified_date": verified_date}


def _control(control_id="CTRL-001", category="preventive", description="d", evidence=None):
    return {"control_id": control_id, "category": category, "description": description, "evidence": _evidence() if evidence is None else evidence}


def _mapping(index=0, element_name="checkout_api_process", category="elevation_of_privilege", control_id="CTRL-001"):
    return {"source_threat_index": index, "source_threat_element_name": element_name, "source_threat_category": category, "control_id": control_id}


def _stride_threat(element_name="checkout_api_process", category="elevation_of_privilege", **overrides):
    base = {"element_name": element_name, "category": category, "description": "d", "control": "c", "residual_risk": "r", "test_evidence": "t"}
    base.update(overrides)
    return base


def _stride_source(*threats, record_id="STRIDE-T-001", elements=None):
    default_elements = [{"name": "checkout_api_process", "element_type": "process"}, {"name": "order_database", "element_type": "data_store"}]
    return generate_stride_threat_model_record(
        record_id,
        "checkout-api",
        ["asset"],
        [],
        [],
        elements if elements is not None else default_elements,
        list(threats) if threats else [_stride_threat()],
        _prov(),
    )


def _linddun_source(record_id="LINDDUN-T-001"):
    """A hand-built LINDDUN-shaped dict -- security.linddun may be built concurrently by a different agent
    this session, so this test file does not import it; it only needs the RAW SHAPE this record's own
    _source_threats_from_record extracts (id prefix + threats[].element_name/category), which is identical
    to STRIDE's own per linddun-privacy-threat-model-record.schema.yaml L78-100."""
    return {
        "id": record_id,
        "version": "1.0.0",
        "system_or_component": "shared vector index",
        "assets": ["a"],
        "trust_boundaries": [],
        "entry_points": [],
        "data_flow_elements": [{"name": "shared_vector_index", "element_type": "data_store"}],
        "threats": [
            {"element_name": "shared_vector_index", "category": "identification", "description": "d", "control": "c", "residual_risk": "r", "test_evidence": "t"},
            {"element_name": "shared_vector_index", "category": "linkability", "description": "d", "control": "c", "residual_risk": "r", "test_evidence": "t"},
        ],
        "elements_with_no_recorded_threats": [],
        "provenance": _prov(),
    }


def _build(record_id="SCM-T-001", system_or_component="s", source_record=None, source_record_type="stride", controls=None, control_mappings=None):
    return generate_security_control_mapping_record(
        record_id,
        system_or_component,
        _stride_source() if source_record is None else source_record,
        source_record_type,
        [_control()] if controls is None else controls,
        [_mapping()] if control_mappings is None else control_mappings,
        _prov(),
    )


def _valid_record():
    return _build()


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal security control mapping record")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = _build_with_version("2.3.4", "security.security_control_mapping@test")
        self.assertEqual(record["generated_by_method"], "security.security_control_mapping@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_source_record_types_constant(self):
        self.assertEqual(SOURCE_RECORD_TYPES, frozenset({"stride", "linddun"}))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "security-control-mapping-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "security-control-mapping-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_security_control_mapping_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version / system_or_component ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_scm_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_RECORD_ID"):
            _build(record_id="STRIDE-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_VERSION"):
            generate_security_control_mapping_record("SCM-T-V1", "s", _stride_source(), "stride", [_control()], [_mapping()], _prov(), version=123)

    def test_empty_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_EMPTY_RECORD_FIELD"):
            _build(system_or_component="  ")

    # --- source_record_type ---
    def test_illegal_source_record_type_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_SOURCE_RECORD_TYPE"):
            _build(source_record_type="attack_tree")

    def test_linddun_source_record_type_is_accepted(self):
        record = _build(source_record=_linddun_source(), source_record_type="linddun", control_mappings=[_mapping(0, "shared_vector_index", "identification", "CTRL-001")])
        self.assertEqual(record["source_record_type"], "linddun")
        self.assertEqual(record["source_record_id"], "LINDDUN-T-001")

    # --- source_record shape ---
    def test_non_dict_source_record_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_SOURCE_RECORD"):
            _build(source_record="not-a-dict")

    def test_source_record_id_wrong_prefix_for_declared_type_is_refused(self):
        bad = _stride_source()
        bad["id"] = "LINDDUN-T-001"  # claims stride type but carries a linddun-prefixed id
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_SOURCE_RECORD"):
            _build(source_record=bad, source_record_type="stride")

    def test_source_record_missing_threats_key_is_refused(self):
        bad = _stride_source()
        del bad["threats"]
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_SOURCE_RECORD"):
            _build(source_record=bad)

    def test_source_record_threat_missing_element_name_is_refused(self):
        bad = _stride_source()
        del bad["threats"][0]["element_name"]
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_SOURCE_RECORD"):
            _build(source_record=bad)

    def test_source_record_with_zero_threats_is_refused(self):
        bad = _stride_source()
        bad["threats"] = []
        with self.assertRaisesRegex(InvariantViolation, "SCM_EMPTY_SOURCE_THREATS"):
            _build(source_record=bad)

    # --- controls[] ---
    def test_empty_controls_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROLS"):
            _build(controls=[])

    def test_control_id_without_ctrl_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROLS"):
            _build(controls=[_control(control_id="C-001")], control_mappings=[_mapping(control_id="C-001")])

    def test_control_illegal_category_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROLS"):
            _build(controls=[_control(category="mitigating")])

    def test_control_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROLS"):
            _build(controls=[_control(description=" ")])

    def test_control_with_extra_key_is_refused(self):
        control = _control()
        control["owner"] = "someone"
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROLS"):
            _build(controls=[control])

    def test_control_missing_evidence_is_refused(self):
        control = _control()
        del control["evidence"]
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROLS"):
            _build(controls=[control])

    def test_evidence_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROLS"):
            _build(controls=[_control(evidence=dict(_evidence(), extra="x"))])

    def test_evidence_empty_verified_by_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROLS"):
            _build(controls=[_control(evidence=_evidence(verified_by=" "))])

    def test_evidence_empty_verified_date_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROLS"):
            _build(controls=[_control(evidence=_evidence(verified_date=""))])

    def test_duplicate_control_id_within_controls_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROLS"):
            _build(controls=[_control(), _control(description="second")])

    def test_two_controls_different_categories_validates(self):
        record = _build(
            controls=[_control("CTRL-001", "preventive"), _control("CTRL-002", "detective")],
            control_mappings=[_mapping(control_id="CTRL-001"), _mapping(control_id="CTRL-002")],
        )
        self.assertEqual([c["category"] for c in record["controls"]], ["preventive", "detective"])

    # --- control_mappings[]: WITHIN-RECORD referential integrity ---
    def test_empty_control_mappings_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROL_MAPPINGS"):
            _build(control_mappings=[])

    def test_mapping_referencing_nonexistent_control_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROL_MAPPINGS"):
            _build(control_mappings=[_mapping(control_id="CTRL-999")])

    def test_mapping_with_extra_key_is_refused(self):
        mapping = _mapping()
        mapping["note"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROL_MAPPINGS"):
            _build(control_mappings=[mapping])

    def test_mapping_negative_index_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROL_MAPPINGS"):
            _build(control_mappings=[_mapping(index=-1)])

    def test_mapping_bool_index_is_refused(self):
        """Regression guard: True/False are int subclasses in Python -- must not silently pass as index 1/0."""
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROL_MAPPINGS"):
            _build(control_mappings=[_mapping(index=True)])

    def test_mapping_non_int_index_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROL_MAPPINGS"):
            _build(control_mappings=[_mapping(index="0")])

    def test_duplicate_source_threat_index_control_id_pair_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROL_MAPPINGS"):
            _build(control_mappings=[_mapping(), _mapping()])

    def test_same_threat_two_different_controls_validates(self):
        """Defense in depth: the SAME source_threat_index mapped by TWO DIFFERENT control_ids is legal."""
        record = _build(
            controls=[_control("CTRL-001", "preventive"), _control("CTRL-002", "detective")],
            control_mappings=[_mapping(control_id="CTRL-001"), _mapping(control_id="CTRL-002")],
        )
        self.assertEqual(len(record["control_mappings"]), 2)

    def test_one_control_two_different_threats_validates(self):
        """A shared control: the SAME control_id mapped against TWO DIFFERENT source_threat_index values."""
        source = _stride_source(_stride_threat("checkout_api_process", "elevation_of_privilege"), _stride_threat("order_database", "tampering"))
        record = _build(
            source_record=source,
            control_mappings=[_mapping(0, "checkout_api_process", "elevation_of_privilege", "CTRL-001"), _mapping(1, "order_database", "tampering", "CTRL-001")],
        )
        self.assertEqual(len(record["control_mappings"]), 2)
        self.assertEqual(record["source_threats_with_no_control_mapping"], [])

    # --- control_mappings[]: CROSS-RECORD referential integrity (the genuinely new invariant class) ---
    def test_mapping_index_out_of_range_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROL_MAPPINGS"):
            _build(control_mappings=[_mapping(index=5)])

    def test_mapping_element_name_disagreeing_with_real_source_is_refused(self):
        """The core cross-record invariant: element_name at the given index must genuinely match the REAL
        source_record, even though every other field (including a legal index) is well-shaped."""
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROL_MAPPINGS"):
            _build(control_mappings=[_mapping(element_name="the_wrong_name")])

    def test_mapping_category_disagreeing_with_real_source_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SCM_INVALID_CONTROL_MAPPINGS"):
            _build(control_mappings=[_mapping(category="spoofing")])  # real threat is elevation_of_privilege

    def test_mapping_against_second_threat_index_validates(self):
        source = _stride_source(_stride_threat("checkout_api_process", "elevation_of_privilege"), _stride_threat("order_database", "tampering"))
        record = _build(source_record=source, control_mappings=[_mapping(1, "order_database", "tampering", "CTRL-001")])
        self.assertEqual(record["control_mappings"][0]["source_threat_index"], 1)
        self.assertEqual(record["source_threats_with_no_control_mapping"], [{"source_threat_index": 0, "source_threat_element_name": "checkout_api_process", "source_threat_category": "elevation_of_privilege"}])

    # --- source_threat_count / source_threats_with_no_control_mapping: genuine, re-derived ---
    def test_source_threat_count_matches_real_source_record(self):
        source = _stride_source(_stride_threat("checkout_api_process", "elevation_of_privilege"), _stride_threat("order_database", "tampering"))
        record = _build(source_record=source, control_mappings=[_mapping(0, "checkout_api_process", "elevation_of_privilege", "CTRL-001")])
        self.assertEqual(record["source_threat_count"], 2)

    def test_fully_covered_source_yields_empty_unmapped_list(self):
        record = _valid_record()
        self.assertEqual(record["source_threat_count"], 1)
        self.assertEqual(record["source_threats_with_no_control_mapping"], [])

    def test_source_record_id_is_taken_from_the_real_source_record_not_a_parameter(self):
        record = _valid_record()
        self.assertEqual(record["source_record_id"], "STRIDE-T-001")

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_scm_prefix(self):
        record = _valid_record()
        record["id"] = "STRIDE-1"
        with self.assertRaisesRegex(Exception, "SCM-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["control_mappings"]
        with self.assertRaisesRegex(Exception, "control_mappings"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_illegal_source_record_type(self):
        record = _valid_record()
        record["source_record_type"] = "pasta"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema source_record_type enum")

    def test_schema_layer_rejects_illegal_control_category(self):
        record = _valid_record()
        record["controls"][0]["category"] = "mitigating"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema control category enum")

    def test_schema_layer_rejects_control_with_additional_property(self):
        record = _valid_record()
        record["controls"][0]["owner"] = "x"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema control additionalProperties")

    def test_schema_layer_rejects_negative_source_threat_count(self):
        record = _valid_record()
        record["source_threat_count"] = 0
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema source_threat_count minimum")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        controls = [_control()]
        mappings = [_mapping()]
        record = generate_security_control_mapping_record("SCM-T-010", "s", _stride_source(), "stride", controls, mappings, _prov())
        controls[0]["description"] = "mutated"
        controls[0]["evidence"]["verified_by"] = "mutated"
        mappings[0]["control_id"] = "CTRL-MUTATED"
        self.assertEqual(record["controls"][0]["description"], "d")
        self.assertEqual(record["controls"][0]["evidence"]["verified_by"], "v")
        self.assertEqual(record["control_mappings"][0]["control_id"], "CTRL-001")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_security_control_mapping_record("SCM-T-011", "s", _stride_source(), "stride", [_control()], [_mapping()], provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_security_control_mapping_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


def _build_with_version(version, generated_by_method):
    return generate_security_control_mapping_record("SCM-T-005", "s", _stride_source(), "stride", [_control()], [_mapping()], _prov(), version=version, generated_by_method=generated_by_method)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record, source_record=None):
        return evaluate_security_control_mapping_integrity_gate(record, "test", TS, source_record=source_record)

    def test_valid_record_passes_both_gates_without_source_record(self):
        results = evaluate_security_control_mapping_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "security_control_mapping_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_valid_record_passes_both_gates_with_real_source_record(self):
        source = _stride_source()
        record = _build(source_record=source)
        results = evaluate_security_control_mapping_gates(record, "test", TS, source_record=source)
        self.assertTrue(all_gates_pass(results))

    def test_self_contained_mode_reports_its_own_mode_in_evidence(self):
        gate = self._gate(_valid_record())
        self.assertEqual(gate["status"], "PASS")
        self.assertEqual(gate["evidence"][0]["mode"], "self_contained_no_source_record")

    def test_full_cross_record_mode_reports_its_own_mode_in_evidence(self):
        source = _stride_source()
        gate = self._gate(_build(source_record=source), source_record=source)
        self.assertEqual(gate["status"], "PASS")
        self.assertEqual(gate["evidence"][0]["mode"], "full_cross_record")

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_security_control_mapping_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("id missing", gate["evidence"][0]["reason"])

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("version missing", gate["evidence"][0]["reason"])

    def test_hand_tampered_empty_system_or_component_fails_the_gate(self):
        record = _valid_record()
        record["system_or_component"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("system_or_component missing", gate["evidence"][0]["reason"])

    def test_hand_tampered_source_record_type_fails_the_gate(self):
        record = _valid_record()
        record["source_record_type"] = "attack_tree"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("source_record_type", gate["evidence"][0]["reason"])

    def test_hand_tampered_source_record_id_prefix_mismatch_fails_the_gate(self):
        record = _valid_record()
        record["source_record_id"] = "LINDDUN-T-001"  # source_record_type is still "stride"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("source_record_id", gate["evidence"][0]["reason"])

    def test_hand_tampered_source_threat_count_zero_fails_the_gate(self):
        record = _valid_record()
        record["source_threat_count"] = 0
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("source_threat_count", gate["evidence"][0]["reason"])

    def test_hand_tampered_controls_dropped_fails_the_gate(self):
        record = _valid_record()
        record["controls"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("controls invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_mapping_control_id_retargeted_to_dangling_id_fails_the_gate(self):
        record = _valid_record()
        record["control_mappings"][0]["control_id"] = "CTRL-999"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_duplicate_mapping_pair_fails_the_gate_self_contained(self):
        record = _valid_record()
        record["control_mappings"].append(dict(record["control_mappings"][0]))
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("duplicate", gate["evidence"][0]["reason"])

    def test_hand_tampered_index_in_both_mapped_and_unmapped_fails_the_gate_self_contained(self):
        record = _build(
            source_record=_stride_source(_stride_threat("checkout_api_process", "elevation_of_privilege"), _stride_threat("order_database", "tampering")),
            control_mappings=[_mapping(0, "checkout_api_process", "elevation_of_privilege", "CTRL-001"), _mapping(1, "order_database", "tampering", "CTRL-001")],
        )
        record["source_threats_with_no_control_mapping"] = [{"source_threat_index": 0, "source_threat_element_name": "checkout_api_process", "source_threat_category": "elevation_of_privilege"}]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOTH", gate["evidence"][0]["reason"])

    def test_hand_tampered_hidden_coverage_gap_fails_the_gate_self_contained(self):
        """The real value of source_threat_count: deleting the ONLY unmapped entry, with count left
        UNCHANGED, must be caught -- without this, the remaining index would look accidentally complete."""
        source = _stride_source(_stride_threat("checkout_api_process", "elevation_of_privilege"), _stride_threat("order_database", "tampering"))
        record = _build(source_record=source, control_mappings=[_mapping(0, "checkout_api_process", "elevation_of_privilege", "CTRL-001")])
        self.assertEqual(record["source_threats_with_no_control_mapping"], [{"source_threat_index": 1, "source_threat_element_name": "order_database", "source_threat_category": "tampering"}])
        record["source_threats_with_no_control_mapping"] = []  # hide the real gap
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("0..source_threat_count-1", gate["evidence"][0]["reason"])

    def test_hand_tampered_hidden_coverage_gap_fails_the_gate_full_cross_record(self):
        source = _stride_source(_stride_threat("checkout_api_process", "elevation_of_privilege"), _stride_threat("order_database", "tampering"))
        record = _build(source_record=source, control_mappings=[_mapping(0, "checkout_api_process", "elevation_of_privilege", "CTRL-001")])
        record["source_threats_with_no_control_mapping"] = []
        gate = self._gate(record, source_record=source)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("disagrees with recomputation", gate["evidence"][0]["reason"])

    def test_full_mode_catches_source_record_id_mismatch(self):
        source = _stride_source()
        record = _build(source_record=source)
        other_source = _stride_source(record_id="STRIDE-T-999")
        gate = self._gate(record, source_record=other_source)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("disagrees with the stored source_record_id", gate["evidence"][0]["reason"])

    def test_full_mode_catches_source_threat_count_disagreement(self):
        source = _stride_source()
        record = _build(source_record=source)
        record["source_threat_count"] = 2
        gate = self._gate(record, source_record=source)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("source_threat_count disagrees", gate["evidence"][0]["reason"])

    def test_full_mode_rejects_malformed_supplied_source_record(self):
        record = _valid_record()
        gate = self._gate(record, source_record={"id": "STRIDE-T-001"})  # no threats[] at all
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("malformed", gate["evidence"][0]["reason"])

    def test_full_mode_catches_mapping_retargeted_to_wrong_real_element(self):
        source = _stride_source(_stride_threat("checkout_api_process", "elevation_of_privilege"), _stride_threat("order_database", "tampering"))
        record = _build(source_record=source, control_mappings=[_mapping(0, "checkout_api_process", "elevation_of_privilege", "CTRL-001")])
        record["control_mappings"][0]["source_threat_index"] = 1  # now claims index 1 but keeps index-0's own name/category
        gate = self._gate(record, source_record=source)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("dangling control_id, out-of-range or mismatched", gate["evidence"][0]["reason"])

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_valid_record())
        self.assertEqual(gate["evidence"][0]["control_count"], 1)
        self.assertEqual(gate["evidence"][0]["mapping_count"], 1)
        self.assertEqual(gate["evidence"][0]["unmapped_count"], 0)

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
        before = copy.deepcopy(record)
        self._gate(record)
        self.assertEqual(record, before)

    def test_gate_does_not_mutate_the_source_record_it_is_given(self):
        source = _stride_source()
        record = _build(source_record=source)
        before = copy.deepcopy(source)
        self._gate(record, source_record=source)
        self.assertEqual(source, before)

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
