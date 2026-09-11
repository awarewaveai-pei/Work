"""Mutation-style tests for ``insight.service_blueprint`` (F06 human/customer insight family, new family,
5th member).

Three real invariants beyond per-field shape (layer set-coverage, per-layer content, top-level
service_name), exercised at BOTH layers: construction-time refusal (``generate_service_blueprint`` raising
a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_service_blueprint_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/service-blueprint.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.insight.service_blueprint import (
    LAYER_TYPES,
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_provenance_required_gate,
    evaluate_service_blueprint_gates,
    evaluate_service_blueprint_integrity_gate,
    generate_service_blueprint,
    layer_entry,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

SERVICE_BLUEPRINT_SCHEMA = "ai-lego://specs/cognitive/typed-objects/service-blueprint.schema.yaml"
SERVICE_NAME = "mobile pre-order and in-store pickup coffee service"


def _layers(**overrides: dict) -> list[dict]:
    base = {
        "customer_actions": dict(layer_type="CUSTOMER_ACTIONS", description="customer selects items and pays in-app, scans a code to pick up in store"),
        "frontstage": dict(layer_type="FRONTSTAGE", description="staff sees the order notification, verifies the pickup code, hands over the drink"),
        "backstage": dict(layer_type="BACKSTAGE", description="barista prepares the drink in order-number sequence, places it in the pickup slot"),
        "support_processes": dict(layer_type="SUPPORT_PROCESSES", description="inventory system decrements stock in real time, triggers low-stock reordering"),
        "systems_data": dict(layer_type="SYSTEMS_DATA", description="POS/app backend order database records order status for refunds and support lookups"),
    }
    base.update(overrides)
    return [layer_entry(v["layer_type"], v["description"]) for v in base.values()]


def _valid_blueprint(
    *,
    blueprint_id: str = "SVCBLUEPRINT-T-001",
    service_name: str = SERVICE_NAME,
    layers: list[dict] | None = None,
):
    return generate_service_blueprint(
        blueprint_id,
        service_name,
        layers if layers is not None else _layers(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_blueprint_validates_against_the_real_schema(self):
        self.contracts.validate(SERVICE_BLUEPRINT_SCHEMA, _valid_blueprint(), "service blueprint")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, blueprint = live.invoke(
            METHOD_ID, generate_service_blueprint, "SVCBLUEPRINT-T-INVOKE", SERVICE_NAME, _layers(), make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/insight.service_blueprint.contract.yaml")
        self.assertEqual(blueprint["id"], "SVCBLUEPRINT-T-INVOKE")

    def test_empty_catalog_blocks_service_blueprint_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_blueprint())
        tampered["service_name"] = ""
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SERVICE_BLUEPRINT_SCHEMA, tampered, "tampered blueprint")
        gate = evaluate_service_blueprint_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        porter-five-forces-analysis.schema.yaml's own equivalent test)."""
        blueprint = _valid_blueprint()
        blueprint["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SERVICE_BLUEPRINT_SCHEMA, blueprint, "blueprint with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_layers_entry(self):
        blueprint = _valid_blueprint()
        blueprint["layers"][0] = {**blueprint["layers"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SERVICE_BLUEPRINT_SCHEMA, blueprint, "blueprint with a smuggled layers[] key")

    def test_schema_rejects_a_provenance_key_smuggled_into_a_layers_entry(self):
        """Record-level-only provenance placement (this F06 batch's own fixed decision): a layers[] entry
        must NOT carry its own provenance field."""
        blueprint = _valid_blueprint()
        blueprint["layers"][0] = {**blueprint["layers"][0], "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(SERVICE_BLUEPRINT_SCHEMA, blueprint, "blueprint with a smuggled per-layer provenance")

    def test_id_is_distinct_from_strategy_porter_five_forces_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.porter_five_forces")
        self.assertEqual(METHOD_ID, "insight.service_blueprint")

    def test_service_blueprint_and_porter_five_forces_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.porter_five_forces"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "insight.service_blueprint.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "insight.service_blueprint contract")


class LayerVocabularyTests(unittest.TestCase):
    def test_layer_types_is_exactly_the_atlas_1216_five(self):
        self.assertEqual(LAYER_TYPES, frozenset({"CUSTOMER_ACTIONS", "FRONTSTAGE", "BACKSTAGE", "SUPPORT_PROCESSES", "SYSTEMS_DATA"}))

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "SVCBLUEPRINT-")

    def test_layer_entry_rejects_an_unknown_layer_type(self):
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_UNKNOWN_LAYER_TYPE"):
            layer_entry("MIDDLE_OFFICE", "not one of the five")

    def test_layer_entry_accepts_all_5_layer_types(self):
        for layer_type in sorted(LAYER_TYPES):
            entry = layer_entry(layer_type, "some description")
            self.assertEqual(entry["layer_type"], layer_type)

    def test_layer_entry_does_not_leak_a_provenance_key(self):
        """Structural elimination: layer_entry() has no provenance parameter at all -- record-level-only
        placement, see module docstring."""
        entry = layer_entry("FRONTSTAGE", "some description")
        self.assertNotIn("provenance", entry)
        self.assertEqual(set(entry.keys()), {"layer_type", "description"})


class LayerCoverageTests(unittest.TestCase):
    """Invariant 1 (module docstring): layers[].layer_type must cover all 5 LAYER_TYPES at least once,
    duplicates permitted, unlike porter_five_forces's exactly-once-each closed set."""

    def test_5_layers_one_each_is_accepted(self):
        blueprint = _valid_blueprint()
        self.assertEqual(len(blueprint["layers"]), 5)

    def test_layers_in_a_shuffled_order_is_also_accepted(self):
        """Order carries no meaning either citation states -- unlike causal.logic_model's STAGE_ORDER,
        position is not enforced."""
        layers = _layers()
        shuffled = [layers[4], layers[1], layers[3], layers[0], layers[2]]
        blueprint = generate_service_blueprint("SVCBLUEPRINT-T-SHUFFLED", SERVICE_NAME, shuffled, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual({layer["layer_type"] for layer in blueprint["layers"]}, LAYER_TYPES)

    def test_duplicate_layer_type_alongside_full_coverage_is_accepted(self):
        """Core design-shape difference from porter_five_forces: a layer type may appear MORE than once as
        long as all 5 are still covered at least once."""
        layers = _layers() + [layer_entry("FRONTSTAGE", "a second frontstage touchpoint, e.g. a phone call")]
        blueprint = generate_service_blueprint("SVCBLUEPRINT-T-DUP-OK", SERVICE_NAME, layers, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(len(blueprint["layers"]), 6)
        self.assertEqual({layer["layer_type"] for layer in blueprint["layers"]}, LAYER_TYPES)

    def test_missing_one_layer_type_is_refused(self):
        layers = [layer for layer in _layers() if layer["layer_type"] != "SYSTEMS_DATA"]
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_INCOMPLETE_LAYER_COVERAGE"):
            generate_service_blueprint("SVCBLUEPRINT-T-MISSING", SERVICE_NAME, layers, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_missing_all_layers_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_INCOMPLETE_LAYER_COVERAGE"):
            generate_service_blueprint("SVCBLUEPRINT-T-EMPTY", SERVICE_NAME, [], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_duplicate_layer_type_replacing_a_different_one_is_still_refused(self):
        """5 entries where one layer type is duplicated and a different one is entirely missing must still
        be refused -- coverage, not count, is the real invariant."""
        layers = [layer for layer in _layers() if layer["layer_type"] != "SYSTEMS_DATA"] + [_layers()[0]]  # CUSTOMER_ACTIONS twice, SYSTEMS_DATA missing
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_INCOMPLETE_LAYER_COVERAGE"):
            generate_service_blueprint("SVCBLUEPRINT-T-DUP-MISSING", SERVICE_NAME, layers, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_non_list_layers_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_INVALID_LAYER_SET"):
            generate_service_blueprint("SVCBLUEPRINT-T-NONLIST", SERVICE_NAME, "not a list", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_unknown_layer_type_smuggled_in_via_raw_dict_is_refused(self):
        layers = [layer for layer in _layers() if layer["layer_type"] != "SYSTEMS_DATA"] + [{"layer_type": "MIDDLE_OFFICE", "description": "x"}]
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_UNKNOWN_LAYER_TYPE"):
            generate_service_blueprint("SVCBLUEPRINT-T-UNKNOWNTYPE", SERVICE_NAME, layers, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class LayerContentTests(unittest.TestCase):
    """Invariant 2 (module docstring): every layers[] entry needs a non-empty description."""

    def test_empty_description_is_refused(self):
        layers = _layers()
        layers[0] = {**layers[0], "description": ""}
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_EMPTY_DESCRIPTION"):
            generate_service_blueprint("SVCBLUEPRINT-T-EMPTYDESC", SERVICE_NAME, layers, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_description_is_refused(self):
        layers = _layers()
        layers[0] = {**layers[0], "description": "   "}
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_EMPTY_DESCRIPTION"):
            generate_service_blueprint("SVCBLUEPRINT-T-WSDESC", SERVICE_NAME, layers, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_missing_description_key_is_refused(self):
        layers = _layers()
        del layers[0]["description"]
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_INVALID_LAYER_SET"):
            generate_service_blueprint("SVCBLUEPRINT-T-NODESC", SERVICE_NAME, layers, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class ServiceNameTests(unittest.TestCase):
    """Invariant 3 (module docstring): service_name is required, non-empty, never auto-derived."""

    def test_empty_service_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_EMPTY_SERVICE_NAME"):
            _valid_blueprint(service_name="")

    def test_whitespace_only_service_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_EMPTY_SERVICE_NAME"):
            _valid_blueprint(service_name="   ")

    def test_none_service_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_EMPTY_SERVICE_NAME"):
            _valid_blueprint(service_name=None)

    def test_a_real_service_name_is_accepted_and_stored_verbatim(self):
        text = "airport express check-in and baggage drop service"
        blueprint = _valid_blueprint(service_name=text)
        self.assertEqual(blueprint["service_name"], text)


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_INVALID_ID"):
            _valid_blueprint(blueprint_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_INVALID_ID"):
            _valid_blueprint(blueprint_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "SVCBLUEPRINT_INVALID_VERSION"):
            generate_service_blueprint("SVCBLUEPRINT-T-002", SERVICE_NAME, _layers(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID blueprint's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own work."""

    def test_gate_passes_a_genuinely_valid_hand_built_blueprint(self):
        gate = evaluate_service_blueprint_integrity_gate(_valid_blueprint(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_layer_type(self):
        blueprint = copy.deepcopy(_valid_blueprint())
        blueprint["layers"] = [layer for layer in blueprint["layers"] if layer["layer_type"] != "BACKSTAGE"]
        gate = evaluate_service_blueprint_integrity_gate(blueprint, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_description(self):
        blueprint = copy.deepcopy(_valid_blueprint())
        blueprint["layers"][0]["description"] = ""
        gate = evaluate_service_blueprint_integrity_gate(blueprint, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_service_name(self):
        blueprint = copy.deepcopy(_valid_blueprint())
        blueprint["service_name"] = ""
        gate = evaluate_service_blueprint_integrity_gate(blueprint, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_blueprint(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_service_blueprint_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        blueprint = copy.deepcopy(_valid_blueprint())
        blueprint["id"] = "WRONG-001"
        gate = evaluate_service_blueprint_integrity_gate(blueprint, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        blueprint = copy.deepcopy(_valid_blueprint())
        blueprint["version"] = 1
        gate = evaluate_service_blueprint_integrity_gate(blueprint, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    """Record-level-only provenance placement (this F06 batch's own fixed decision): the gate checks ONLY
    the top-level provenance field, never a per-layer one."""

    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_blueprint(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        blueprint = copy.deepcopy(_valid_blueprint())
        blueprint["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(blueprint, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_record_provenance_missing(self):
        blueprint = copy.deepcopy(_valid_blueprint())
        del blueprint["provenance"]
        gate = evaluate_provenance_required_gate(blueprint, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_ignores_per_layer_content_entirely(self):
        """A layer entry can never carry its own provenance (layer_entry() has no such parameter) -- this
        gate's PASS/FAIL must depend only on the top-level field, confirmed by an otherwise-invalid layer
        set not affecting this gate's own verdict when the top-level provenance is itself valid."""
        blueprint = copy.deepcopy(_valid_blueprint())
        blueprint["layers"][0]["description"] = ""  # invalid content, but irrelevant to THIS gate
        gate = evaluate_provenance_required_gate(blueprint, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_service_blueprint_gates_returns_two_gates_in_order(self):
        results = evaluate_service_blueprint_gates(_valid_blueprint(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "service_blueprint_integrity"])

    def test_evaluate_service_blueprint_gates_all_pass_on_a_valid_blueprint(self):
        results = evaluate_service_blueprint_gates(_valid_blueprint(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "insight.service_blueprint")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        blueprint = _valid_blueprint()
        self.assertEqual(set(blueprint.keys()), {"id", "version", "generated_by_method", "provenance", "service_name", "layers"})


if __name__ == "__main__":
    unittest.main()
