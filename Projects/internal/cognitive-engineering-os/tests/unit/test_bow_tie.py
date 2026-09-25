"""Mutation-style tests for ``root_cause.bow_tie`` (F05 root_cause family, fourth concrete entry
alongside fishbone/five_whys/pareto). Two real invariant classes proven at BOTH the construction and the
independent gate layer: (1) OWNER/TEST -- Atlas's own literal misuse warning ('控制措施要有 owner/test'),
every control must carry a non-empty owner AND test, with distinct error codes for each so a control
missing only one of the two is diagnosable; (2) STRUCTURAL -- every threat/consequence must stay
textually distinct from the top event, and every control's own side+target_id must resolve to a real
threat/consequence living INSIDE this SAME record (self-contained, unlike
security.security_control_mapping's cross-record design)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.root_cause.bow_tie import (
    CONTROL_SIDES,
    METHOD_ID,
    all_gates_pass,
    evaluate_bow_tie_gates,
    evaluate_bow_tie_integrity_gate,
    evaluate_provenance_required_gate,
    generate_bow_tie_analysis_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/bow-tie-analysis-record.schema.yaml"
TS = "2026-09-07T00:00:00Z"
TOP_EVENT = "Unauthorized cross-tenant data access"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _threat(threat_id="T-001", description="Multi-tenant query missing a tenant_id filter"):
    return {"threat_id": threat_id, "description": description}


def _consequence(consequence_id="C-001", description="Tenant A's PII exposed to Tenant B"):
    return {"consequence_id": consequence_id, "description": description}


def _control(control_id="CTRL-001", side="prevention", target_id="T-001", description="d", owner="o", test="t"):
    return {"control_id": control_id, "side": side, "target_id": target_id, "description": description, "owner": owner, "test": test}


def _build(
    record_id="BOWTIE-T-001",
    system_or_component="s",
    top_event_description=None,
    threats=None,
    consequences=None,
    controls=None,
):
    return generate_bow_tie_analysis_record(
        record_id,
        system_or_component,
        TOP_EVENT if top_event_description is None else top_event_description,
        [_threat()] if threats is None else threats,
        [_consequence()] if consequences is None else consequences,
        [_control()] if controls is None else controls,
        _prov(),
    )


def _valid_record():
    return _build()


def _build_with_version(version, generated_by_method):
    return generate_bow_tie_analysis_record(
        "BOWTIE-T-005", "s", TOP_EVENT, [_threat()], [_consequence()], [_control()], _prov(), version=version, generated_by_method=generated_by_method
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal bow-tie analysis record")

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = _build_with_version("2.3.4", "root_cause.bow_tie@test")
        self.assertEqual(record["generated_by_method"], "root_cause.bow_tie@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_control_sides_constant(self):
        self.assertEqual(CONTROL_SIDES, frozenset({"prevention", "mitigation"}))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "bow-tie-analysis-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "bow-tie-analysis-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_bow_tie_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version / system_or_component / top_event_description ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_bowtie_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_RECORD_ID"):
            _build(record_id="STRIDE-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_VERSION"):
            generate_bow_tie_analysis_record("BOWTIE-T-V1", "s", TOP_EVENT, [_threat()], [_consequence()], [_control()], _prov(), version=123)

    def test_empty_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_EMPTY_RECORD_FIELD"):
            _build(system_or_component="  ")

    def test_empty_top_event_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_TOP_EVENT"):
            _build(top_event_description=" ")

    # --- threats[]: shape ---
    def test_empty_threats_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_THREATS"):
            _build(threats=[])

    def test_threat_id_without_t_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_THREATS"):
            _build(threats=[_threat(threat_id="TH-001")])

    def test_threat_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_THREATS"):
            _build(threats=[_threat(description=" ")])

    def test_threat_with_extra_key_is_refused(self):
        threat = _threat()
        threat["category"] = "process"
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_THREATS"):
            _build(threats=[threat])

    def test_threat_missing_key_is_refused(self):
        threat = _threat()
        del threat["description"]
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_THREATS"):
            _build(threats=[threat])

    def test_duplicate_threat_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_THREATS"):
            _build(threats=[_threat(), _threat(description="a second, different description")])

    def test_two_threats_different_ids_validates(self):
        record = _build(threats=[_threat("T-001", "a"), _threat("T-002", "b")], controls=[_control(target_id="T-001")])
        self.assertEqual(len(record["threats"]), 2)

    # --- threats[]: STRUCTURAL invariant (distinctness from top_event) ---
    def test_threat_identical_to_top_event_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_THREAT_MATCHES_TOP_EVENT"):
            _build(threats=[_threat(description=TOP_EVENT)])

    def test_threat_identical_to_top_event_after_whitespace_trim_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_THREAT_MATCHES_TOP_EVENT"):
            _build(threats=[_threat(description=f"  {TOP_EVENT}  ")])

    def test_threat_similar_but_not_identical_to_top_event_validates(self):
        record = _build(threats=[_threat(description=f"{TOP_EVENT} caused by a misconfigured ORM")])
        self.assertEqual(len(record["threats"]), 1)

    # --- consequences[]: shape (mirror of threats[]) ---
    def test_empty_consequences_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONSEQUENCES"):
            _build(consequences=[])

    def test_consequence_id_without_c_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONSEQUENCES"):
            _build(consequences=[_consequence(consequence_id="CON-001")])

    def test_consequence_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONSEQUENCES"):
            _build(consequences=[_consequence(description=" ")])

    def test_consequence_with_extra_key_is_refused(self):
        consequence = _consequence()
        consequence["severity"] = "high"
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONSEQUENCES"):
            _build(consequences=[consequence])

    def test_consequence_missing_key_is_refused(self):
        consequence = _consequence()
        del consequence["description"]
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONSEQUENCES"):
            _build(consequences=[consequence])

    def test_duplicate_consequence_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONSEQUENCES"):
            _build(consequences=[_consequence(), _consequence(description="a second, different description")])

    def test_two_consequences_different_ids_validates(self):
        record = _build(consequences=[_consequence("C-001", "a"), _consequence("C-002", "b")])
        self.assertEqual(len(record["consequences"]), 2)

    # --- consequences[]: STRUCTURAL invariant (distinctness from top_event) ---
    def test_consequence_identical_to_top_event_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_CONSEQUENCE_MATCHES_TOP_EVENT"):
            _build(consequences=[_consequence(description=TOP_EVENT)])

    def test_consequence_identical_to_top_event_after_whitespace_trim_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_CONSEQUENCE_MATCHES_TOP_EVENT"):
            _build(consequences=[_consequence(description=f"\n{TOP_EVENT}\n")])

    def test_consequence_similar_but_not_identical_to_top_event_validates(self):
        record = _build(consequences=[_consequence(description=f"{TOP_EVENT} resulting in a breach notification")])
        self.assertEqual(len(record["consequences"]), 1)

    # --- controls[]: shape ---
    def test_empty_controls_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONTROL_SHAPE"):
            _build(controls=[])

    def test_control_id_without_ctrl_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONTROL_SHAPE"):
            _build(controls=[_control(control_id="C-001")])

    def test_control_illegal_side_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONTROL_SHAPE"):
            _build(controls=[_control(side="recovery")])

    def test_control_empty_target_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONTROL_SHAPE"):
            _build(controls=[_control(target_id=" ")])

    def test_control_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONTROL_SHAPE"):
            _build(controls=[_control(description=" ")])

    def test_control_with_extra_key_is_refused(self):
        control = _control()
        control["priority"] = "high"
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONTROL_SHAPE"):
            _build(controls=[control])

    def test_control_missing_key_is_refused(self):
        control = _control()
        del control["side"]
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONTROL_SHAPE"):
            _build(controls=[control])

    def test_duplicate_control_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_INVALID_CONTROL_SHAPE"):
            _build(controls=[_control(), _control(description="a second, different description")])

    # --- controls[]: OWNER/TEST invariant (Atlas's own misuse warning), each with its own distinct code ---
    def test_control_missing_owner_only_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_CONTROL_MISSING_OWNER"):
            _build(controls=[_control(owner="")])

    def test_control_whitespace_only_owner_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_CONTROL_MISSING_OWNER"):
            _build(controls=[_control(owner="   ")])

    def test_control_missing_test_only_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_CONTROL_MISSING_TEST"):
            _build(controls=[_control(test="")])

    def test_control_whitespace_only_test_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_CONTROL_MISSING_TEST"):
            _build(controls=[_control(test="  ")])

    def test_control_missing_both_owner_and_test_reports_owner_first(self):
        """Ordered check: owner is validated before test, so a control missing BOTH surfaces the owner
        code -- deterministic, not incidental."""
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_CONTROL_MISSING_OWNER"):
            _build(controls=[_control(owner="", test="")])

    def test_control_with_owner_and_test_present_validates(self):
        record = _build(controls=[_control(owner="Platform Security", test="RLS-2026-09-06")])
        self.assertEqual(record["controls"][0]["owner"], "Platform Security")
        self.assertEqual(record["controls"][0]["test"], "RLS-2026-09-06")

    # --- controls[]: STRUCTURAL invariant (referential integrity, self-contained) ---
    def test_control_pointing_at_nonexistent_threat_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_DANGLING_CONTROL_REFERENCE"):
            _build(controls=[_control(side="prevention", target_id="T-999")])

    def test_control_pointing_at_nonexistent_consequence_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_DANGLING_CONTROL_REFERENCE"):
            _build(controls=[_control(side="mitigation", target_id="C-999")])

    def test_prevention_control_pointing_at_a_real_consequence_id_is_refused(self):
        """A control's side determines WHICH set its target_id is checked against -- a prevention control
        naming a real consequence_id is still a dangling reference from the threat side's own perspective."""
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_DANGLING_CONTROL_REFERENCE"):
            _build(controls=[_control(side="prevention", target_id="C-001")])

    def test_mitigation_control_pointing_at_a_real_threat_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BOWTIE_DANGLING_CONTROL_REFERENCE"):
            _build(controls=[_control(side="mitigation", target_id="T-001")])

    def test_prevention_control_pointing_at_real_threat_validates(self):
        record = _build(controls=[_control(side="prevention", target_id="T-001")])
        self.assertEqual(record["controls"][0]["target_id"], "T-001")

    def test_mitigation_control_pointing_at_real_consequence_validates(self):
        record = _build(controls=[_control(control_id="CTRL-001", side="mitigation", target_id="C-001")])
        self.assertEqual(record["controls"][0]["target_id"], "C-001")

    def test_two_controls_same_threat_defense_in_depth_validates(self):
        record = _build(controls=[_control("CTRL-001", target_id="T-001"), _control("CTRL-002", target_id="T-001")])
        self.assertEqual(len(record["controls"]), 2)

    def test_two_controls_different_sides_validates(self):
        record = _build(
            controls=[_control("CTRL-001", "prevention", "T-001"), _control("CTRL-002", "mitigation", "C-001")]
        )
        self.assertEqual({c["side"] for c in record["controls"]}, {"prevention", "mitigation"})

    def test_controls_need_not_cover_every_threat_or_consequence(self):
        """No coverage requirement -- unlike security.security_control_mapping's own
        source_threats_with_no_control_mapping surfacing, Bow-Tie only validates DECLARED references."""
        record = _build(
            threats=[_threat("T-001", "a"), _threat("T-002", "b")],
            consequences=[_consequence("C-001", "a"), _consequence("C-002", "b")],
            controls=[_control("CTRL-001", "prevention", "T-001")],
        )
        self.assertEqual(len(record["threats"]), 2)
        self.assertEqual(len(record["controls"]), 1)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_bowtie_prefix(self):
        record = _valid_record()
        record["id"] = "STRIDE-1"
        with self.assertRaisesRegex(Exception, "BOWTIE-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["controls"]
        with self.assertRaisesRegex(Exception, "controls"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_illegal_control_side(self):
        record = _valid_record()
        record["controls"][0]["side"] = "recovery"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema side enum")

    def test_schema_layer_rejects_control_with_additional_property(self):
        record = _valid_record()
        record["controls"][0]["priority"] = "high"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema control additionalProperties")

    def test_schema_layer_rejects_threat_id_without_t_prefix(self):
        record = _valid_record()
        record["threats"][0]["threat_id"] = "TH-001"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema threat_id pattern")

    def test_schema_layer_rejects_empty_top_event_description(self):
        record = _valid_record()
        record["top_event_description"] = ""
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top_event_description minLength")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        threats = [_threat()]
        consequences = [_consequence()]
        controls = [_control()]
        record = generate_bow_tie_analysis_record("BOWTIE-T-010", "s", TOP_EVENT, threats, consequences, controls, _prov())
        threats[0]["description"] = "mutated"
        consequences[0]["description"] = "mutated"
        controls[0]["owner"] = "mutated"
        self.assertNotEqual(record["threats"][0]["description"], "mutated")
        self.assertNotEqual(record["consequences"][0]["description"], "mutated")
        self.assertNotEqual(record["controls"][0]["owner"], "mutated")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_bow_tie_analysis_record("BOWTIE-T-011", "s", TOP_EVENT, [_threat()], [_consequence()], [_control()], provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_bow_tie_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_bow_tie_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_bow_tie_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "bow_tie_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_bow_tie_gates(record, "test", TS)))

    # --- basic field shape, hand-tampered (bypassing the builder entirely) ---
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

    def test_hand_tampered_empty_top_event_description_fails_the_gate(self):
        record = _valid_record()
        record["top_event_description"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("top_event_description missing", gate["evidence"][0]["reason"])

    def test_hand_tampered_threats_dropped_fails_the_gate(self):
        record = _valid_record()
        record["threats"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_INVALID_THREATS", gate["evidence"][0]["reason"])

    def test_hand_tampered_consequences_dropped_fails_the_gate(self):
        record = _valid_record()
        record["consequences"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_INVALID_CONSEQUENCES", gate["evidence"][0]["reason"])

    def test_hand_tampered_controls_dropped_fails_the_gate(self):
        record = _valid_record()
        record["controls"] = []
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_INVALID_CONTROL_SHAPE", gate["evidence"][0]["reason"])

    def test_hand_tampered_duplicate_threat_id_fails_the_gate(self):
        record = _build(threats=[_threat("T-001", "a"), _threat("T-002", "b")], controls=[_control(target_id="T-001")])
        record["threats"][1]["threat_id"] = "T-001"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_INVALID_THREATS", gate["evidence"][0]["reason"])

    # --- STRUCTURAL invariant (distinctness), caught ONLY by the gate after hand-tampering ---
    def test_hand_tampered_threat_text_set_to_top_event_fails_the_gate(self):
        """The record was VALID at construction; a hand-tamperer later edits a threat's own description to
        collide with top_event_description. Only the independent gate re-derivation catches this."""
        record = _valid_record()
        record["threats"][0]["description"] = record["top_event_description"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_THREAT_MATCHES_TOP_EVENT", gate["evidence"][0]["reason"])

    def test_hand_tampered_consequence_text_set_to_top_event_fails_the_gate(self):
        record = _valid_record()
        record["consequences"][0]["description"] = record["top_event_description"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_CONSEQUENCE_MATCHES_TOP_EVENT", gate["evidence"][0]["reason"])

    def test_hand_tampered_top_event_description_edited_to_match_a_threat_fails_the_gate(self):
        """The inverse direction: top_event_description itself is edited (not the threat) to collide."""
        record = _valid_record()
        record["top_event_description"] = record["threats"][0]["description"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_THREAT_MATCHES_TOP_EVENT", gate["evidence"][0]["reason"])

    # --- OWNER/TEST invariant, caught ONLY by the gate after hand-tampering ---
    def test_hand_tampered_control_owner_emptied_fails_the_gate(self):
        record = _valid_record()
        record["controls"][0]["owner"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_CONTROL_MISSING_OWNER", gate["evidence"][0]["reason"])

    def test_hand_tampered_control_owner_set_to_whitespace_fails_the_gate(self):
        record = _valid_record()
        record["controls"][0]["owner"] = "   "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_CONTROL_MISSING_OWNER", gate["evidence"][0]["reason"])

    def test_hand_tampered_control_test_emptied_fails_the_gate(self):
        record = _valid_record()
        record["controls"][0]["test"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_CONTROL_MISSING_TEST", gate["evidence"][0]["reason"])

    # --- referential integrity (dangling reference), caught ONLY by the gate after hand-tampering ---
    def test_hand_tampered_control_retargeted_to_dangling_threat_fails_the_gate(self):
        record = _valid_record()
        record["controls"][0]["target_id"] = "T-DOES-NOT-EXIST"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_DANGLING_CONTROL_REFERENCE", gate["evidence"][0]["reason"])

    def test_hand_tampered_control_side_flipped_creates_dangling_reference_fails_the_gate(self):
        """Flipping side without changing target_id turns a legal prevention->threat reference into an
        illegal mitigation->threat reference (threats and consequences are different id spaces)."""
        record = _valid_record()
        record["controls"][0]["side"] = "mitigation"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_DANGLING_CONTROL_REFERENCE", gate["evidence"][0]["reason"])

    def test_hand_tampered_duplicate_control_id_fails_the_gate(self):
        record = _build(controls=[_control("CTRL-001", target_id="T-001"), _control("CTRL-002", target_id="T-001")])
        record["controls"][1]["control_id"] = "CTRL-001"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("BOWTIE_INVALID_CONTROL_SHAPE", gate["evidence"][0]["reason"])

    # --- evidence / non-crashing / no-mutation discipline ---
    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_valid_record())
        self.assertEqual(gate["evidence"][0]["threat_count"], 1)
        self.assertEqual(gate["evidence"][0]["consequence_count"], 1)
        self.assertEqual(gate["evidence"][0]["control_count"], 1)

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _valid_record()
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

    def test_hand_tampered_threats_wrong_type_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["threats"] = "not-a-list"
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")

    def test_hand_tampered_controls_wrong_type_fails_the_gate_not_a_crash(self):
        record = _valid_record()
        record["controls"] = {"not": "a list"}
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
