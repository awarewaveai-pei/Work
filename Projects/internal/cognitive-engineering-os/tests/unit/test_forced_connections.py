"""Mutation-style tests for ``divergent.forced_connections`` (F03 divergent-ideation family, opened this same
batch).

Two real invariants beyond per-field shape (feature-pool completeness on both sides, two-sided referential
integrity), exercised at BOTH layers: construction-time refusal (``generate_forced_connections_session`` raising
a specific ``InvariantViolation`` code) and independent gate re-derivation (``evaluate_feature_pools_gate``/
``evaluate_combination_referential_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/forced-connections-session.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.divergent.forced_connections import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    combination,
    evaluate_combination_referential_integrity_gate,
    evaluate_feature_pools_gate,
    evaluate_forced_connections_gates,
    evaluate_provenance_required_gate,
    feature,
    feature_ids,
    generate_forced_connections_session,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

FORCED_CONNECTIONS_SESSION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/forced-connections-session.schema.yaml"
PROVENANCE = make_provenance("HYPOTHESIS", "AI_SUGGESTED")


def _concept_a_features() -> list[dict]:
    return [feature("A-CANOPY", "可撐開的防水傘面"), feature("A-HANDLE", "握把，收合時可當手杖")]


def _concept_b_features() -> list[dict]:
    return [feature("B-GPS", "即時定位與導航"), feature("B-NOTIFY", "推播通知使用者")]


def _combinations() -> list[dict]:
    return [
        combination("COMB-1", "A-CANOPY", "B-NOTIFY", "傘面內建震動提醒模組，偵測到降雨預報時推播提醒使用者攜帶雨傘"),
        combination("COMB-2", "A-HANDLE", "B-GPS", "傘柄內建定位晶片，遺失時可透過手機 App 定位找回"),
    ]


def _valid_record(
    *,
    record_id: str = "FORCEDCONN-T-001",
    concept_a_name: str = "雨傘",
    concept_a_features: list[dict] | None = None,
    concept_b_name: str = "智慧型手機",
    concept_b_features: list[dict] | None = None,
    combinations: list[dict] | None = None,
):
    return generate_forced_connections_session(
        record_id,
        concept_a_name,
        concept_a_features if concept_a_features is not None else _concept_a_features(),
        concept_b_name,
        concept_b_features if concept_b_features is not None else _concept_b_features(),
        combinations if combinations is not None else _combinations(),
        PROVENANCE,
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(FORCED_CONNECTIONS_SESSION_SCHEMA, _valid_record(), "forced connections session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, record = live.invoke(
            METHOD_ID,
            generate_forced_connections_session,
            "FORCEDCONN-T-INVOKE",
            "雨傘",
            _concept_a_features(),
            "智慧型手機",
            _concept_b_features(),
            _combinations(),
            PROVENANCE,
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/divergent.forced_connections.contract.yaml")
        self.assertEqual(record["id"], "FORCEDCONN-T-INVOKE")

    def test_empty_catalog_blocks_forced_connections_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_record())
        tampered["combinations"][0]["feature_b_ref"] = "B-GHOST"
        gate = evaluate_combination_referential_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        # The schema itself has no referential-integrity operator (runtime-only invariant, disclosed in the
        # schema's own compilation_decisions) -- schema validation alone would NOT catch this, confirming the
        # gate is the real enforcement layer here, not a redundant belt-and-suspenders check.
        self.contracts.validate(FORCED_CONNECTIONS_SESSION_SCHEMA, tampered, "tampered record (schema-shape-valid, referentially broken)")

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FORCED_CONNECTIONS_SESSION_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_feature_entry(self):
        record = _valid_record()
        record["concept_a_features"][0] = {**record["concept_a_features"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FORCED_CONNECTIONS_SESSION_SCHEMA, record, "record with a smuggled feature key")

    def test_schema_rejects_an_unknown_key_inside_a_combination_entry(self):
        record = _valid_record()
        record["combinations"][0] = {**record["combinations"][0], "weight": 1}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FORCED_CONNECTIONS_SESSION_SCHEMA, record, "record with a smuggled combinations[] key")

    def test_schema_rejects_a_per_feature_provenance_attempt(self):
        """Record-level-only provenance: additionalProperties:false on the feature $def structurally forbids a
        per-feature provenance key, same discipline functional-decomposition.schema.yaml's own identical test
        establishes."""
        record = _valid_record()
        record["concept_a_features"][0] = {**record["concept_a_features"][0], "provenance": PROVENANCE}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FORCED_CONNECTIONS_SESSION_SCHEMA, record, "record with a smuggled per-feature provenance")

    def test_schema_rejects_an_empty_concept_a_features_list(self):
        record = _valid_record()
        record["concept_a_features"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FORCED_CONNECTIONS_SESSION_SCHEMA, record, "record with empty concept_a_features")

    def test_schema_rejects_an_empty_combinations_list(self):
        record = _valid_record()
        record["combinations"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(FORCED_CONNECTIONS_SESSION_SCHEMA, record, "record with empty combinations")

    def test_id_is_distinct_from_a_sibling_f03_machine_id(self):
        self.assertEqual(METHOD_ID, "divergent.forced_connections")
        self.assertNotEqual(METHOD_ID, "divergent.scamper")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "divergent.forced_connections.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "divergent.forced_connections contract")


class FeatureAndCombinationVocabularyTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "FORCEDCONN-")

    def test_feature_rejects_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_FEATURE_ID"):
            feature("   ", "x")

    def test_feature_rejects_empty_description(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_FEATURE_DESCRIPTION"):
            feature("A-X", "   ")

    def test_combination_rejects_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_COMBINATION_ID"):
            combination("   ", "A-X", "B-Y", "idea")

    def test_combination_rejects_empty_feature_a_ref(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_FEATURE_A_REF"):
            combination("COMB-1", "   ", "B-Y", "idea")

    def test_combination_rejects_empty_feature_b_ref(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_FEATURE_B_REF"):
            combination("COMB-1", "A-X", "   ", "idea")

    def test_combination_rejects_empty_resulting_idea(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_RESULTING_IDEA"):
            combination("COMB-1", "A-X", "B-Y", "   ")


class FeatureIdsTests(unittest.TestCase):
    def test_collects_every_id_in_declared_order(self):
        self.assertEqual(feature_ids(_concept_a_features()), ["A-CANOPY", "A-HANDLE"])

    def test_single_feature_pool(self):
        self.assertEqual(feature_ids([feature("A-ONLY", "x")]), ["A-ONLY"])


class FeaturePoolCompletenessTests(unittest.TestCase):
    """Invariant #1 (module docstring): concept_a_features/concept_b_features are each present, well-shaped,
    and non-empty."""

    def test_well_formed_pools_are_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["concept_a_features"]), 2)
        self.assertEqual(len(record["concept_b_features"]), 2)

    def test_single_feature_pool_is_accepted(self):
        record = _valid_record(
            concept_a_features=[feature("A-ONLY", "the only feature")],
            concept_b_features=[feature("B-ONLY", "the only feature")],
            combinations=[combination("COMB-1", "A-ONLY", "B-ONLY", "idea")],
        )
        self.assertEqual(record["concept_a_features"][0]["id"], "A-ONLY")

    def test_empty_concept_a_features_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_FEATURE_POOL"):
            _valid_record(concept_a_features=[])

    def test_empty_concept_b_features_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_FEATURE_POOL"):
            _valid_record(concept_b_features=[])

    def test_non_list_concept_a_features_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_FEATURE_POOL"):
            _valid_record(concept_a_features="not-a-list")

    def test_malformed_feature_entry_missing_a_key_is_refused(self):
        bad_pool = [{"id": "A-X"}]  # missing "description"
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_FEATURE_POOL"):
            _valid_record(concept_a_features=bad_pool)

    def test_concept_a_features_are_rebuilt_not_aliased(self):
        """Critic-finding-class regression guard (same as decomposition.functional_decomposition's own
        _rebuild_node/_rebuild_interface): mutating the ORIGINAL input after construction must NOT be visible
        in the returned record."""
        pool = _concept_a_features()
        record = generate_forced_connections_session(
            "FORCEDCONN-T-ALIAS", "雨傘", pool, "智慧型手機", _concept_b_features(), _combinations(), PROVENANCE
        )
        self.assertIsNot(record["concept_a_features"], pool)
        pool[0]["description"] = "mutated after construction"
        self.assertEqual(record["concept_a_features"][0]["description"], "可撐開的防水傘面")

    def test_combinations_are_rebuilt_not_aliased(self):
        combos = _combinations()
        record = generate_forced_connections_session(
            "FORCEDCONN-T-ALIAS2", "雨傘", _concept_a_features(), "智慧型手機", _concept_b_features(), combos, PROVENANCE
        )
        combos[0]["resulting_idea"] = "mutated after construction"
        self.assertNotEqual(record["combinations"][0]["resulting_idea"], "mutated after construction")


class CombinationReferentialIntegrityTests(unittest.TestCase):
    """Invariant #2 (module docstring): every combinations[] entry's feature_a_ref/feature_b_ref must resolve
    to a real id in the CORRECT side's own feature pool."""

    def test_combinations_referencing_the_correct_pools_are_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["combinations"]), 2)

    def test_feature_a_ref_pointing_nowhere_is_refused(self):
        bad = [combination("COMB-BAD", "A-DOES-NOT-EXIST", "B-GPS", "dangling a-ref")]
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_DANGLING_FEATURE_REF"):
            _valid_record(combinations=bad)

    def test_feature_b_ref_pointing_nowhere_is_refused(self):
        bad = [combination("COMB-BAD", "A-CANOPY", "B-DOES-NOT-EXIST", "dangling b-ref")]
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_DANGLING_FEATURE_REF"):
            _valid_record(combinations=bad)

    def test_feature_a_ref_cross_wired_to_concept_b_own_id_is_refused(self):
        """THE differentiator case: a real id that exists, but only in the WRONG concept's own pool -- must be
        refused exactly like a reference that resolves nowhere at all (module docstring's own invariant #2)."""
        bad = [combination("COMB-BAD", "B-GPS", "B-NOTIFY", "feature_a_ref names a real concept_b id, not a concept_a id")]
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_DANGLING_FEATURE_REF"):
            _valid_record(combinations=bad)

    def test_feature_b_ref_cross_wired_to_concept_a_own_id_is_refused(self):
        bad = [combination("COMB-BAD", "A-CANOPY", "A-HANDLE", "feature_b_ref names a real concept_a id, not a concept_b id")]
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_DANGLING_FEATURE_REF"):
            _valid_record(combinations=bad)

    def test_both_refs_swapped_between_pools_is_refused(self):
        bad = [combination("COMB-BAD", "B-GPS", "A-CANOPY", "both refs point at the wrong side's pool")]
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_DANGLING_FEATURE_REF"):
            _valid_record(combinations=bad)

    def test_empty_combinations_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_COMBINATIONS"):
            _valid_record(combinations=[])

    def test_malformed_combination_missing_a_key_is_refused(self):
        bad = [{"id": "COMB-BAD", "feature_a_ref": "A-CANOPY", "feature_b_ref": "B-GPS"}]  # missing resulting_idea
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_INVALID_COMBINATION"):
            _valid_record(combinations=bad)

    def test_feature_pools_checked_before_combination_referential_integrity(self):
        """An empty concept_a_features with an also-dangling combination must report EMPTY_FEATURE_POOL first
        (builder's own documented check order), proving the ordering in the module docstring."""
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_FEATURE_POOL"):
            _valid_record(concept_a_features=[], combinations=[combination("COMB-BAD", "A-GHOST", "B-GHOST", "idea")])


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_INVALID_VERSION"):
            generate_forced_connections_session(
                "FORCEDCONN-T-002", "雨傘", _concept_a_features(), "智慧型手機", _concept_b_features(), _combinations(), PROVENANCE, version=1
            )

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_INVALID_PROVENANCE"):
            generate_forced_connections_session(
                "FORCEDCONN-T-003", "雨傘", _concept_a_features(), "智慧型手機", _concept_b_features(), _combinations(), {"epistemic_type": "NOT_REAL"}
            )

    def test_empty_concept_a_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_CONCEPT_A_NAME"):
            _valid_record(concept_a_name="   ")

    def test_empty_concept_b_name_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "FORCEDCONN_EMPTY_CONCEPT_B_NAME"):
            _valid_record(concept_b_name="   ")


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_forced_connections_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_feature_pools_gate_catches_hand_emptied_concept_a_features(self):
        record = copy.deepcopy(_valid_record())
        record["concept_a_features"] = []
        gate = evaluate_feature_pools_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_feature_pools_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_feature_pools_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_feature_pools_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_feature_pools_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_feature_pools_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_feature_pools_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_combination_gate_catches_hand_tampered_dangling_reference(self):
        record = copy.deepcopy(_valid_record())
        record["combinations"].append({"id": "COMB-TAMPERED", "feature_a_ref": "A-CANOPY", "feature_b_ref": "B-GHOST", "resulting_idea": "spliced in after construction"})
        gate = evaluate_combination_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_combination_gate_catches_hand_tampered_cross_wired_reference(self):
        """The gate independently catches the wrong-pool defect too, not just the resolves-nowhere case."""
        record = copy.deepcopy(_valid_record())
        record["combinations"][0]["feature_a_ref"] = "B-GPS"
        gate = evaluate_combination_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_combination_gate_passes_when_pools_are_valid_and_no_combination_dangles(self):
        record = copy.deepcopy(_valid_record())
        gate = evaluate_combination_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_combination_gate_fails_closed_when_a_feature_pool_itself_is_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["concept_b_features"] = []
        gate = evaluate_combination_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_combination_gate_fails_closed_on_empty_combinations(self):
        record = copy.deepcopy(_valid_record())
        record["combinations"] = []
        gate = evaluate_combination_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_combination_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_combination_referential_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
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


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_forced_connections_gates_returns_three_gates_in_order(self):
        results = evaluate_forced_connections_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "feature_pools", "combination_referential_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "divergent.forced_connections")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(
            set(record.keys()),
            {"id", "version", "generated_by_method", "concept_a_name", "concept_a_features", "concept_b_name", "concept_b_features", "combinations", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
