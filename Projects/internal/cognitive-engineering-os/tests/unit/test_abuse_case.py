"""Mutation-style tests for ``security.abuse_case`` (fifty-second Method Atlas slice, ninth of Atlas's
own ten F20 table rows by table position). Three real invariant classes proven at BOTH the construction
and the independent gate layer: (1) the five-stage ORDER invariant (same class security.pasta/security
.dpia_pia already establish, shorter), (2) abuse_flow STEP uniqueness and forward referential integrity
(every control/detection addresses_step_ids entry must reference a real, declared step_id), and (3) the
core DUAL step-coverage completeness invariant grounded directly in Atlas's own citation: every abuse
_flow step_id must be addressed by AT LEAST ONE control AND, INDEPENDENTLY, AT LEAST ONE detection entry
-- a step with a control but zero detection (or vice versa) is refused. A real, faithfully-modeled
scenario drawn from this repository's own SECURITY_THREAT_MODEL.md (T2/E4/Uw1, Prioritized Threat List
item 6) is proven to be genuinely REFUSED by this same invariant, not just synthetic mutations."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.security.abuse_case import (
    METHOD_ID,
    STAGE_ORDER,
    all_gates_pass,
    evaluate_abuse_case_gates,
    evaluate_abuse_case_integrity_gate,
    evaluate_provenance_required_gate,
    generate_abuse_case_record,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/abuse-case-record.schema.yaml"
TS = "2026-09-06T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _narrative(stage_id, summary="s"):
    return {"stage_id": stage_id, "summary": summary}


def _step(step_id="STEP-1", description="d"):
    return {"step_id": step_id, "description": description}


def _control(control_id="CTRL-001", description="d", addresses_step_ids=None):
    return {"control_id": control_id, "description": description, "addresses_step_ids": ["STEP-1"] if addresses_step_ids is None else addresses_step_ids}


def _detection(detection_id="DET-001", description="d", addresses_step_ids=None):
    return {"detection_id": detection_id, "description": description, "addresses_step_ids": ["STEP-1"] if addresses_step_ids is None else addresses_step_ids}


def _valid_stages():
    return [
        _narrative("actor"),
        _narrative("goal"),
        {"stage_id": "abuse_flow", "steps": [_step()]},
        {"stage_id": "controls", "controls": [_control()]},
        {"stage_id": "detection", "detections": [_detection()]},
    ]


def _build(record_id="ABUSE-T-001", system_or_component="a system", stages=None):
    return generate_abuse_case_record(record_id, system_or_component, _valid_stages() if stages is None else stages, _prov())


def _valid_record():
    return _build()


def _supply_chain_stages():
    return [
        _narrative("actor", "External attacker or compromised CI credential holder able to interact with the CI/CD pipeline."),
        _narrative("goal", "Get a malicious artifact accepted as 'Verified Deployment', or obtain signing key material for reuse."),
        {
            "stage_id": "abuse_flow",
            "steps": [
                _step("STEP-1", "Attacker attempts to obtain or exfiltrate a long-lived CI artifact-signing private key."),
                _step("STEP-2", "Attacker uses or forges a signature over a malicious artifact."),
                _step("STEP-3", "The forged/stolen-key artifact is deployed to production."),
            ],
        },
        {
            "stage_id": "controls",
            "controls": [
                _control("CTRL-001", "Sigstore/cosign keyless signing -- no long-lived key exists to steal.", ["STEP-1"]),
                _control("CTRL-002", "SLSA L2 Artifact Attestations verify a real signature before deployment.", ["STEP-2", "STEP-3"]),
            ],
        },
        {
            "stage_id": "detection",
            "detections": [
                _detection("DET-001", "Rekor's public append-only transparency log makes every real signing event auditable.", ["STEP-1", "STEP-2", "STEP-3"]),
            ],
        },
    ]


def _supply_chain_record():
    return _build(record_id="ABUSE-T-002", system_or_component="CI/CD Artifact Signing Pipeline", stages=_supply_chain_stages())


def _prompt_injection_stages():
    """SECURITY_THREAT_MODEL.md's own T2/E4/Uw1 threat, modeled faithfully: a control exists for STEP-1
    only, and the detection entry ALSO addresses only STEP-1 -- STEP-2/STEP-3 have neither control nor
    detection coverage, the real, disclosed Prioritized Threat List item 6 gap."""
    return [
        _narrative("actor", "External attacker able to place content into any source EC §35 classifies UNTRUSTED DATA."),
        _narrative("goal", "Manipulate the agent's tool-call decision and/or poison Knowledge Memory with attacker-controlled content."),
        {
            "stage_id": "abuse_flow",
            "steps": [
                _step("STEP-1", "Attacker crafts untrusted content embedding instructions disguised as data."),
                _step("STEP-2", "Agent processes the untrusted content; the injected instruction manipulates a tool-call decision."),
                _step("STEP-3", "The manipulated output is written into Knowledge Memory as if it were a verified fact."),
            ],
        },
        {"stage_id": "controls", "controls": [_control("CTRL-001", "EC §35's structural principle: Policy/System Instructions != Retrieved Source Data.", ["STEP-1"])]},
        {"stage_id": "detection", "detections": [_detection("DET-001", "No landed detection mechanism exists yet -- placeholder addressing only STEP-1.", ["STEP-1"])]},
    ]


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal abuse case record")

    def test_supply_chain_record_validates_in_atlas_own_order(self):
        record = _supply_chain_record()
        self.contracts.validate(RECORD_SCHEMA, record, "T1 supply-chain abuse case record")
        self.assertEqual([s["stage_id"] for s in record["stages"]], list(STAGE_ORDER))

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_abuse_case_record("ABUSE-T-005", "s", _valid_stages(), _prov(), version="2.3.4", generated_by_method="security.abuse_case@test")
        self.assertEqual(record["generated_by_method"], "security.abuse_case@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_stage_order_constant_matches_atlas_own_five_word_chain(self):
        self.assertEqual(STAGE_ORDER, ("actor", "goal", "abuse_flow", "controls", "detection"))

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "abuse-case-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "abuse-case-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_abuse_case_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_abuse_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_RECORD_ID"):
            _build(record_id="DPIA-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_VERSION"):
            generate_abuse_case_record("ABUSE-T-V1", "s", _valid_stages(), _prov(), version=123)

    def test_empty_system_or_component_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_EMPTY_RECORD_FIELD"):
            _build(system_or_component="")

    # --- stages: shape and order ---
    def test_two_adjacent_stages_swapped_is_refused_even_though_the_set_is_unchanged(self):
        stages = _valid_stages()
        stages[0], stages[1] = stages[1], stages[0]
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_detection_stage_moved_to_the_front_is_refused(self):
        stages = _valid_stages()
        stages.insert(0, stages.pop())
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_missing_a_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # only four
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_stage_is_refused(self):
        stages = _valid_stages()[:-1]  # drop detection
        stages.append(_narrative("actor"))  # duplicate actor instead of detection
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_extra_sixth_stage_is_refused(self):
        """Regression guard, same class security.dpia_pia's own critic-caught test already establishes:
        the extra element must itself be SHAPE-VALID (a real detection stage), or this would pass 'by
        accident' via the shape check at position -1 rather than genuinely exercising the length guard."""
        stages = _valid_stages() + [{"stage_id": "detection", "detections": [_detection()]}]
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_narrative_stage_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[0] = dict(stages[0], control="c")
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_narrative_stage_missing_summary_is_refused(self):
        stages = _valid_stages()
        del stages[1]["summary"]
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_narrative_stage_empty_summary_is_refused(self):
        stages = _valid_stages()
        stages[0]["summary"] = "  "
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_narrative_stage_with_illegal_stage_id_value_is_refused(self):
        stages = _valid_stages()
        stages[0]["stage_id"] = "not_a_real_stage"
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_non_list_stages_is_refused_not_crashed(self):
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages="not a list")

    def test_non_dict_stage_entry_is_refused_not_crashed(self):
        stages = _valid_stages()
        stages[0] = "not a dict"
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    # --- abuse_flow stage ---
    def test_empty_steps_list_is_refused(self):
        stages = _valid_stages()
        stages[2]["steps"] = []
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_step_without_step_prefix_is_refused(self):
        stages = _valid_stages()
        stages[2]["steps"][0]["step_id"] = "S-001"
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_step_empty_description_is_refused(self):
        stages = _valid_stages()
        stages[2]["steps"][0]["description"] = " "
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_step_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[2]["steps"][0]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_duplicate_step_id_within_abuse_flow_is_refused(self):
        stages = _valid_stages()
        stages[2]["steps"].append(_step())  # same "STEP-1" twice
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_abuse_flow_stage_with_wrong_stage_id_is_refused(self):
        stages = _valid_stages()
        stages[2]["stage_id"] = "flow"
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    # --- controls stage: forward referential integrity ---
    def test_control_addressing_a_nonexistent_step_id_is_refused(self):
        """The core forward-traceability invariant: a control referencing a step_id NOT declared in the
        abuse_flow stage must be refused, even though the control's own shape is otherwise valid."""
        stages = _valid_stages()
        stages[3]["controls"][0]["addresses_step_ids"] = ["STEP-999"]
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_empty_controls_list_is_refused(self):
        stages = _valid_stages()
        stages[3]["controls"] = []
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_control_with_empty_addresses_step_ids_is_refused(self):
        stages = _valid_stages()
        stages[3]["controls"][0]["addresses_step_ids"] = []
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_control_entry_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[3]["controls"][0]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_control_id_without_ctrl_prefix_is_refused(self):
        stages = _valid_stages()
        stages[3]["controls"][0]["control_id"] = "C-001"
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    # --- controls stage: reverse completeness (a real step with zero controls) ---
    def test_a_step_with_zero_controls_is_refused(self):
        stages = _valid_stages()
        stages[2]["steps"].append(_step("STEP-2", "second step"))
        stages[4]["detections"][0]["addresses_step_ids"] = ["STEP-1", "STEP-2"]
        # controls stage still only addresses STEP-1; STEP-2 has no mitigating control at all.
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    # --- detection stage: forward referential integrity, mirrors controls ---
    def test_detection_addressing_a_nonexistent_step_id_is_refused(self):
        stages = _valid_stages()
        stages[4]["detections"][0]["addresses_step_ids"] = ["STEP-999"]
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_empty_detections_list_is_refused(self):
        stages = _valid_stages()
        stages[4]["detections"] = []
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_detection_with_empty_addresses_step_ids_is_refused(self):
        stages = _valid_stages()
        stages[4]["detections"][0]["addresses_step_ids"] = []
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_detection_entry_with_extra_key_is_refused(self):
        stages = _valid_stages()
        stages[4]["detections"][0]["extra"] = "x"
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_detection_id_without_det_prefix_is_refused(self):
        stages = _valid_stages()
        stages[4]["detections"][0]["detection_id"] = "D-001"
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_detection_stage_with_wrong_stage_id_is_refused(self):
        stages = _valid_stages()
        stages[4]["stage_id"] = "detect"
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    # --- detection stage: reverse completeness -- THE distinguishing half of the core invariant ---
    def test_a_step_with_zero_detections_is_refused_even_with_a_real_control(self):
        """The core, Atlas-grounded invariant's own distinguishing case: a step fully covered by a
        control but with ZERO detection coverage must still be refused -- controls alone are not
        enough, Atlas names detection as its own separate chain element."""
        stages = _valid_stages()
        stages[2]["steps"].append(_step("STEP-2", "second step"))
        stages[3]["controls"][0]["addresses_step_ids"] = ["STEP-1", "STEP-2"]
        # detection stage still only addresses STEP-1; STEP-2 has a control but no detection at all.
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_a_step_with_zero_controls_but_a_real_detection_is_also_refused(self):
        """The symmetric case: a step covered by detection but not by any control must also be
        refused -- the invariant runs in both directions independently."""
        stages = _valid_stages()
        stages[2]["steps"].append(_step("STEP-2", "second step"))
        stages[4]["detections"][0]["addresses_step_ids"] = ["STEP-1", "STEP-2"]
        # controls stage still only addresses STEP-1; STEP-2 has a detection but no control at all.
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(stages=stages)

    def test_the_real_prompt_injection_scenario_is_refused_by_this_same_invariant(self):
        """The real due-diligence claim, not a synthetic mutation: SECURITY_THREAT_MODEL.md's own
        T2/E4/Uw1 threat, modeled faithfully, is genuinely refused because STEP-2/STEP-3 have neither
        control nor detection coverage -- Prioritized Threat List item 6's own still-open gap."""
        with self.assertRaisesRegex(InvariantViolation, "ABUSE_INVALID_STAGES"):
            _build(record_id="ABUSE-T-PI-001", system_or_component="AI Agent Untrusted Content ingestion", stages=_prompt_injection_stages())

    # --- multi-step record: dual coverage holds across more than one step ---
    def test_two_steps_each_fully_covered_by_control_and_detection_validates(self):
        stages = _valid_stages()
        stages[2]["steps"].append(_step("STEP-2", "second step"))
        stages[3]["controls"].append(_control("CTRL-002", "second control", ["STEP-2"]))
        stages[4]["detections"].append(_detection("DET-002", "second detection", ["STEP-2"]))
        record = _build(stages=stages)
        self.assertEqual(len(record["stages"][2]["steps"]), 2)

    def test_one_control_covering_two_steps_validates(self):
        stages = _valid_stages()
        stages[2]["steps"].append(_step("STEP-2", "second step"))
        stages[3]["controls"][0]["addresses_step_ids"] = ["STEP-1", "STEP-2"]
        stages[4]["detections"].append(_detection("DET-002", "second detection", ["STEP-2"]))
        record = _build(stages=stages)
        self.assertEqual(record["stages"][3]["controls"][0]["addresses_step_ids"], ["STEP-1", "STEP-2"])

    def test_one_detection_covering_two_steps_validates(self):
        stages = _valid_stages()
        stages[2]["steps"].append(_step("STEP-2", "second step"))
        stages[3]["controls"].append(_control("CTRL-002", "second control", ["STEP-2"]))
        stages[4]["detections"][0]["addresses_step_ids"] = ["STEP-1", "STEP-2"]
        record = _build(stages=stages)
        self.assertEqual(record["stages"][4]["detections"][0]["addresses_step_ids"], ["STEP-1", "STEP-2"])

    def test_supply_chain_three_step_record_with_shared_controls_and_detection_validates(self):
        record = _supply_chain_record()
        self.assertEqual(len(record["stages"][2]["steps"]), 3)
        self.assertEqual(len(record["stages"][3]["controls"]), 2)
        self.assertEqual(len(record["stages"][4]["detections"]), 1)

    # --- schema-layer pins ---
    def test_schema_layer_rejects_an_id_without_the_abuse_prefix(self):
        record = _valid_record()
        record["id"] = "DPIA-1"
        with self.assertRaisesRegex(Exception, "ABUSE-"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema id prefix")

    def test_schema_layer_rejects_a_missing_required_top_level_field(self):
        record = _valid_record()
        del record["stages"]
        with self.assertRaisesRegex(Exception, "stages"):
            self.contracts.validate(RECORD_SCHEMA, record, "schema top-level required")

    def test_schema_layer_rejects_swapped_stage_order(self):
        record = _valid_record()
        record["stages"][0], record["stages"][1] = record["stages"][1], record["stages"][0]
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema prefixItems order")

    def test_schema_layer_rejects_a_narrative_stage_with_control_key(self):
        record = _valid_record()
        record["stages"][0]["control"] = "c"
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema narrative_stage additionalProperties")

    def test_schema_layer_rejects_a_control_entry_missing_addresses_step_ids(self):
        record = _valid_record()
        del record["stages"][3]["controls"][0]["addresses_step_ids"]
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema control_entry required")

    def test_schema_layer_rejects_a_detection_entry_missing_addresses_step_ids(self):
        record = _valid_record()
        del record["stages"][4]["detections"][0]["addresses_step_ids"]
        with self.assertRaises(Exception):
            self.contracts.validate(RECORD_SCHEMA, record, "schema detection_entry required")

    # --- rebuild-not-alias ---
    def test_mutating_the_callers_own_inputs_after_construction_does_not_affect_the_stored_record(self):
        stages = _valid_stages()
        record = generate_abuse_case_record("ABUSE-T-010", "s", stages, _prov())
        stages[0]["summary"] = "mutated"
        stages[2]["steps"][0]["description"] = "mutated"
        stages[3]["controls"][0]["description"] = "mutated"
        stages[3]["controls"][0]["addresses_step_ids"].append("STEP-2")
        stages[4]["detections"][0]["description"] = "mutated"
        self.assertEqual(record["stages"][0]["summary"], "s")
        self.assertEqual(record["stages"][2]["steps"][0]["description"], "d")
        self.assertEqual(record["stages"][3]["controls"][0]["description"], "d")
        self.assertEqual(record["stages"][3]["controls"][0]["addresses_step_ids"], ["STEP-1"])
        self.assertEqual(record["stages"][4]["detections"][0]["description"], "d")

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_abuse_case_record("ABUSE-T-011", "s", _valid_stages(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_abuse_case_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate(self, record):
        return evaluate_abuse_case_integrity_gate(record, "test", TS)

    def test_valid_record_passes_both_gates(self):
        results = evaluate_abuse_case_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "abuse_case_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_supply_chain_record_passes_both_gates(self):
        self.assertTrue(all_gates_pass(evaluate_abuse_case_gates(_supply_chain_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_abuse_case_gates(record, "test", TS)))

    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "id missing, empty, or not prefixed 'ABUSE-'")

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_empty_system_or_component_fails_the_gate(self):
        record = _valid_record()
        record["system_or_component"] = " "
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertEqual(gate["evidence"][0]["reason"], "system_or_component missing or empty")

    def test_hand_tampered_stage_reorder_fails_the_gate(self):
        """The core re-derived-not-trusted invariant: reordering two adjacent stages (same set, wrong
        order) after construction must be caught by the gate's own fresh re-validation."""
        record = _supply_chain_record()
        record["stages"][0], record["stages"][1] = record["stages"][1], record["stages"][0]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_stage_dropped_fails_the_gate(self):
        record = _valid_record()
        del record["stages"][1]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_extra_shape_valid_stage_appended_fails_the_gate(self):
        record = _valid_record()
        record["stages"].append({"stage_id": "detection", "detections": [_detection()]})
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_control_retargeted_to_nonexistent_step_fails_the_gate(self):
        """The core re-derived-not-trusted forward-referential invariant, at the gate layer: a copy's own
        control silently retargeted to a step_id that does not exist must be caught."""
        record = _supply_chain_record()
        record["stages"][3]["controls"][0]["addresses_step_ids"] = ["STEP-999"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_detection_retargeted_to_nonexistent_step_fails_the_gate(self):
        record = _supply_chain_record()
        record["stages"][4]["detections"][0]["addresses_step_ids"] = ["STEP-999"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_detection_coverage_narrowed_leaves_a_step_uncovered_fails_the_gate(self):
        """The core re-derived-not-trusted DUAL-completeness invariant, at the gate layer, on its
        distinguishing (detection) side: a copy's own single detection entry silently narrowed to cover
        only STEP-1, leaving STEP-2/STEP-3 with a real control but zero detection, must be caught."""
        record = _supply_chain_record()
        record["stages"][4]["detections"][0]["addresses_step_ids"] = ["STEP-1"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_control_removed_leaves_a_step_uncovered_fails_the_gate(self):
        """Symmetric case on the control side: removing the control that addresses STEP-2/STEP-3 leaves
        them with detection but zero control coverage."""
        record = _supply_chain_record()
        record["stages"][3]["controls"] = [record["stages"][3]["controls"][0]]  # drop CTRL-002
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_hand_tampered_step_removed_orphans_its_own_control_and_detection_fails_the_gate(self):
        """Removing a step from abuse_flow while a control/detection entry still references it turns
        those entries into dangling forward references -- must be caught."""
        record = _supply_chain_record()
        record["stages"][2]["steps"] = [s for s in record["stages"][2]["steps"] if s["step_id"] != "STEP-3"]
        gate = self._gate(record)
        self.assertEqual(gate["status"], "FAIL")
        self.assertIn("stages invalid", gate["evidence"][0]["reason"])

    def test_gate_evidence_reports_accurate_counts_on_a_valid_record(self):
        gate = self._gate(_supply_chain_record())
        self.assertEqual(gate["evidence"][0], {"stage_count": 5, "step_count": 3, "control_count": 2, "detection_count": 1})

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _supply_chain_record()
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
