"""Mutation-style tests for ``challenge.hazop`` (F12 challenge/red-team/risk family, ninth built member).

Real invariants (module docstring): nodes >=1 well-formed unique; every deviation references a real node
(referential integrity) and a member of the closed 11-word guide-word vocabulary; cause/consequence non-empty;
safeguard may be empty; an optional risk_rating must be a real finite number excluding Python's bool-is-int-
subclass trap; deviations MAY be empty (a node examined against a guide word may be found clean) -- full
node-x-guide-word coverage is deliberately NOT required. Exercised at BOTH layers: construction-time refusal
(``generate_hazop_study`` raising a specific ``InvariantViolation`` code) and independent gate re-derivation
(``evaluate_hazop_content_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder entirely,
never calling the builder itself). Schema conformance is checked against the real spec-root schema this same
slice added (``typed-objects/hazop-study.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.challenge.hazop import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_GUIDE_WORDS,
    all_gates_pass,
    evaluate_hazop_content_integrity_gate,
    evaluate_hazop_gates,
    evaluate_provenance_required_gate,
    generate_hazop_study,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

HAZOP_STUDY_SCHEMA = "ai-lego://specs/cognitive/typed-objects/hazop-study.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _nodes() -> list[dict]:
    return [
        {"id": "N1", "description": "自動觸發週末遷移排程"},
        {"id": "N2", "description": "資料庫連線從舊機房切換到新機房"},
    ]


def _deviations() -> list[dict]:
    return [
        {
            "node_id": "N1",
            "guide_word": "EARLY",
            "cause": "排程時鐘漂移導致提前觸發",
            "consequence": "尚有生產流量時就開始遷移",
            "safeguard": "",
            "risk_rating": 7,
        },
        {
            "node_id": "N2",
            "guide_word": "OTHER_THAN",
            "cause": "設定檔誤填，切換到錯誤的目標資料庫實例",
            "consequence": "資料寫入錯誤環境",
            "safeguard": "部署前人工核對目標連線字串",
        },
    ]


def _kwargs(**overrides: object) -> dict:
    base = dict(
        nodes=_nodes(),
        deviations=_deviations(),
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_study(*, record_id: str = "HAZOP-T-001", **overrides: object):
    return generate_hazop_study(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_study_validates_against_the_real_schema(self):
        self.contracts.validate(HAZOP_STUDY_SCHEMA, _valid_study(), "hazop study")

    def test_zero_deviations_is_legal_a_node_may_be_examined_and_found_clean(self):
        study = generate_hazop_study("HAZOP-T-002", nodes=_nodes(), deviations=[], provenance=PROVENANCE)
        self.contracts.validate(HAZOP_STUDY_SCHEMA, study, "clean-pass study")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, study = live.invoke(METHOD_ID, generate_hazop_study, "HAZOP-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/challenge.hazop.contract.yaml")
        self.assertEqual(study["id"], "HAZOP-T-INVOKE")

    def test_empty_catalog_blocks_hazop_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same malformed
        record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_study())
        tampered["nodes"] = []
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HAZOP_STUDY_SCHEMA, tampered, "tampered study")
        gate = evaluate_hazop_content_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        study = _valid_study()
        study["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HAZOP_STUDY_SCHEMA, study, "study with a smuggled top-level key")

    def test_schema_rejects_missing_nodes(self):
        study = _valid_study()
        del study["nodes"]
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HAZOP_STUDY_SCHEMA, study, "study with nodes removed")

    def test_schema_rejects_non_enum_guide_word(self):
        study = _valid_study()
        study["deviations"][0]["guide_word"] = "VIBES"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(HAZOP_STUDY_SCHEMA, study, "study with an invalid guide_word")

    def test_id_is_distinct_from_a_sibling_f12_machine_id(self):
        self.assertEqual(METHOD_ID, "challenge.hazop")
        self.assertNotEqual(METHOD_ID, "challenge.red_team")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "challenge.hazop.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "challenge.hazop contract")


class GuideWordVocabularyTests(unittest.TestCase):
    def test_valid_guide_words_has_eleven_members(self):
        self.assertEqual(len(VALID_GUIDE_WORDS), 11)

    def test_valid_guide_words_matches_the_task_mandated_set(self):
        self.assertEqual(
            VALID_GUIDE_WORDS,
            frozenset({"NO_NOT", "MORE", "LESS", "AS_WELL_AS", "PART_OF", "REVERSE", "OTHER_THAN", "EARLY", "LATE", "BEFORE", "AFTER"}),
        )

    def test_guide_word_outside_closed_set_is_refused_at_construction(self):
        bad_deviations = _deviations()
        bad_deviations[0] = {**bad_deviations[0], "guide_word": "VIBES"}
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_GUIDE_WORD"):
            _valid_study(deviations=bad_deviations)

    def test_every_standard_guide_word_is_individually_accepted(self):
        for word in sorted(VALID_GUIDE_WORDS):
            with self.subTest(guide_word=word):
                deviations = [{"node_id": "N1", "guide_word": word, "cause": "x", "consequence": "y", "safeguard": ""}]
                study = _valid_study(deviations=deviations)
                self.assertEqual(study["deviations"][0]["guide_word"], word)


class ReferentialIntegrityTests(unittest.TestCase):
    """THE real invariant class this method exists to enforce alongside the closed vocabulary: every deviation
    must reference a node that actually exists."""

    def test_deviation_referencing_unknown_node_is_refused(self):
        bad_deviations = _deviations() + [{"node_id": "N99", "guide_word": "LATE", "cause": "x", "consequence": "y", "safeguard": ""}]
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_DEVIATION_UNKNOWN_NODE"):
            _valid_study(deviations=bad_deviations)

    def test_well_formed_study_is_accepted(self):
        study = _valid_study()
        self.assertEqual(len(study["nodes"]), 2)
        self.assertEqual(len(study["deviations"]), 2)


class NodesTests(unittest.TestCase):
    def test_empty_nodes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_TOO_FEW_NODES"):
            _valid_study(nodes=[], deviations=[])

    def test_non_list_nodes_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_TOO_FEW_NODES"):
            _valid_study(nodes="not-a-list", deviations=[])

    def test_duplicate_node_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_DUPLICATE_NODE_ID"):
            _valid_study(nodes=[{"id": "N1", "description": "a"}, {"id": "N1", "description": "b"}], deviations=[])

    def test_node_missing_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_NODE"):
            _valid_study(nodes=[{"id": "N1", "description": ""}], deviations=[])

    def test_node_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_NODE"):
            _valid_study(nodes=[{"id": "N1", "description": "a", "extra": "x"}], deviations=[])


class DeviationsTests(unittest.TestCase):
    def test_empty_deviations_with_non_empty_nodes_is_accepted(self):
        """The task-mandated non-invariant: a node can be examined against a guide word and found clean."""
        study = _valid_study(deviations=[])
        self.assertEqual(study["deviations"], [])

    def test_non_list_deviations_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_DEVIATIONS_TYPE"):
            _valid_study(deviations="not-a-list")

    def test_deviation_missing_cause_is_refused(self):
        bad = [{"node_id": "N1", "guide_word": "MORE", "cause": "", "consequence": "y", "safeguard": ""}]
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_DEVIATION"):
            _valid_study(deviations=bad)

    def test_deviation_missing_consequence_is_refused(self):
        bad = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "", "safeguard": ""}]
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_DEVIATION"):
            _valid_study(deviations=bad)

    def test_deviation_with_empty_safeguard_is_accepted(self):
        """'No safeguard exists yet' is itself a valid, important finding -- same reasoning FMEA's
        existing_control field uses."""
        deviations = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "y", "safeguard": ""}]
        study = _valid_study(deviations=deviations)
        self.assertEqual(study["deviations"][0]["safeguard"], "")

    def test_deviation_with_non_string_safeguard_is_refused(self):
        bad = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "y", "safeguard": None}]
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_DEVIATION"):
            _valid_study(deviations=bad)

    def test_deviation_missing_required_key_is_refused(self):
        bad = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "y"}]  # no safeguard
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_DEVIATION"):
            _valid_study(deviations=bad)

    def test_deviation_with_unknown_key_is_refused(self):
        bad = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "y", "safeguard": "", "verdict": "REJECTED"}]
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_DEVIATION"):
            _valid_study(deviations=bad)

    def test_non_dict_deviation_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_DEVIATION"):
            _valid_study(deviations=["not-a-dict"])

    def test_full_node_by_guide_word_coverage_is_not_required(self):
        """Task-mandated: examining only a subset of guide words against a subset of nodes is legal -- not every
        guide word applies to every node in practice."""
        study = _valid_study(deviations=[_deviations()[0]])
        self.assertEqual(len(study["deviations"]), 1)


class RiskRatingTests(unittest.TestCase):
    """Optional numeric extension -- Python's bool-is-int-subclass trap, guarded the same way
    stakeholders.game_theory's payoffs[].value already is."""

    def test_deviation_without_risk_rating_is_accepted(self):
        deviations = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "y", "safeguard": ""}]
        study = _valid_study(deviations=deviations)
        self.assertNotIn("risk_rating", study["deviations"][0])

    def test_integer_risk_rating_is_accepted(self):
        study = _valid_study()
        self.assertEqual(study["deviations"][0]["risk_rating"], 7)

    def test_float_risk_rating_is_accepted(self):
        deviations = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "y", "safeguard": "", "risk_rating": 3.5}]
        study = _valid_study(deviations=deviations)
        self.assertEqual(study["deviations"][0]["risk_rating"], 3.5)

    def test_boolean_risk_rating_is_refused(self):
        """Python's bool is an int subclass -- a bare isinstance(value, (int, float)) would silently accept
        True/False as ratings 1/0. Must be explicitly refused."""
        deviations = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "y", "safeguard": "", "risk_rating": True}]
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_RISK_RATING"):
            _valid_study(deviations=deviations)

    def test_nan_risk_rating_is_refused(self):
        deviations = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "y", "safeguard": "", "risk_rating": float("nan")}]
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_RISK_RATING"):
            _valid_study(deviations=deviations)

    def test_infinite_risk_rating_is_refused(self):
        deviations = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "y", "safeguard": "", "risk_rating": float("inf")}]
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_RISK_RATING"):
            _valid_study(deviations=deviations)

    def test_non_numeric_risk_rating_is_refused(self):
        deviations = [{"node_id": "N1", "guide_word": "MORE", "cause": "x", "consequence": "y", "safeguard": "", "risk_rating": "high"}]
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_RISK_RATING"):
            _valid_study(deviations=deviations)


class IdAndVersionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "HAZOP-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_ID"):
            _valid_study(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_ID"):
            _valid_study(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_VERSION"):
            generate_hazop_study("HAZOP-T-002", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "HAZOP_INVALID_PROVENANCE"):
            _valid_study(provenance={"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID study's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_study(self):
        results = evaluate_hazop_gates(_valid_study(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_content_gate_catches_hand_tampered_dangling_node_id(self):
        record = copy.deepcopy(_valid_study())
        record["deviations"].append({"node_id": "N99", "guide_word": "LATE", "cause": "x", "consequence": "y", "safeguard": ""})
        gate = evaluate_hazop_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_invalid_guide_word(self):
        record = copy.deepcopy(_valid_study())
        record["deviations"][0]["guide_word"] = "VIBES"
        gate = evaluate_hazop_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_boolean_risk_rating(self):
        record = copy.deepcopy(_valid_study())
        record["deviations"][0]["risk_rating"] = True
        gate = evaluate_hazop_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_unknown_top_level_key(self):
        record = copy.deepcopy(_valid_study())
        record["extra_field"] = "smuggled"
        gate = evaluate_hazop_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_top_level_key(self):
        record = copy.deepcopy(_valid_study())
        del record["deviations"]
        gate = evaluate_hazop_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_hand_tampered_empty_nodes(self):
        record = copy.deepcopy(_valid_study())
        record["nodes"] = []
        gate = evaluate_hazop_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_hazop_content_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_study())
        record["id"] = "WRONG-001"
        gate = evaluate_hazop_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_content_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_study())
        record["version"] = 1
        gate = evaluate_hazop_content_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_study(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_study())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class AliasingTests(unittest.TestCase):
    """Same aliasing discipline stakeholders.game_theory.py's own tests establish: the builder must rebuild
    every nested item dict, not just shallow-copy the outer list."""

    def test_builder_does_not_alias_the_callers_supplied_node_dicts(self):
        nodes = _nodes()
        study = _valid_study(nodes=nodes)
        nodes[0]["description"] = "tampered-after-construction"
        self.assertNotEqual(study["nodes"][0]["description"], "tampered-after-construction")

    def test_builder_does_not_alias_the_callers_supplied_deviation_dicts(self):
        deviations = _deviations()
        study = _valid_study(deviations=deviations)
        deviations[0]["cause"] = "tampered-after-construction"
        self.assertNotEqual(study["deviations"][0]["cause"], "tampered-after-construction")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_hazop_gates_returns_two_gates_in_order(self):
        results = evaluate_hazop_gates(_valid_study(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "hazop_content_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "challenge.hazop")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        study = _valid_study()
        self.assertEqual(
            set(study.keys()),
            {"id", "version", "generated_by_method", "nodes", "deviations", "provenance"},
        )


if __name__ == "__main__":
    unittest.main()
