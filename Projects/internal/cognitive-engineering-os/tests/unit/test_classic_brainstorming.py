"""Mutation-style tests for ``divergent.classic_brainstorming`` (F03 divergent ideation family, opening
member).

Two real invariants beyond per-field shape (idea id uniqueness, idea referential integrity), exercised at BOTH
layers: construction-time refusal (``generate_classic_brainstorming_session`` raising a specific
``InvariantViolation`` code) and independent gate re-derivation (``evaluate_idea_integrity_gate``/
``evaluate_idea_referential_integrity_gate`` catching a hand-tampered raw dict that bypassed the builder
entirely, never calling the builder itself). Schema conformance is checked against the real spec-root schema
this same slice added (``typed-objects/classic-brainstorming-session.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.divergent.classic_brainstorming import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    collect_idea_ids,
    evaluate_classic_brainstorming_gates,
    evaluate_idea_integrity_gate,
    evaluate_idea_referential_integrity_gate,
    evaluate_provenance_required_gate,
    evaluation,
    generate_classic_brainstorming_session,
    idea,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

CLASSIC_BRAINSTORMING_SESSION_SCHEMA = "ai-lego://specs/cognitive/typed-objects/classic-brainstorming-session.schema.yaml"
IDEA_PROVENANCE = make_provenance("AI_SUGGESTION", "AI_GENERATED")
RECORD_PROVENANCE = make_provenance("HYPOTHESIS", "AI_SUGGESTED")


def _simple_ideas() -> list[dict]:
    return [
        idea("IDEA-1", "推出訂閱制而非一次性買斷", IDEA_PROVENANCE),
        idea("IDEA-2", "新增每日登入獎勵機制", IDEA_PROVENANCE),
        idea("IDEA-3", "推播個人化使用建議", IDEA_PROVENANCE),
    ]


def _simple_evaluations() -> list[dict]:
    return [
        evaluation("IDEA-1", "keep", "現金流可預測，符合本季度目標"),
        evaluation("IDEA-2", "discard", "合作對象名單目前空白，短期無法執行"),
    ]


def _valid_record(
    *,
    record_id: str = "BRAINSTORM-T-001",
    ideas: list[dict] | None = None,
    evaluations: list[dict] | None = None,
):
    return generate_classic_brainstorming_session(
        record_id,
        ideas if ideas is not None else _simple_ideas(),
        RECORD_PROVENANCE,
        evaluations=evaluations if evaluations is not None else _simple_evaluations(),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_record_validates_against_the_real_schema(self):
        self.contracts.validate(CLASSIC_BRAINSTORMING_SESSION_SCHEMA, _valid_record(), "classic brainstorming session")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, record = live.invoke(METHOD_ID, generate_classic_brainstorming_session, "BRAINSTORM-T-INVOKE", _simple_ideas(), RECORD_PROVENANCE)
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/divergent.classic_brainstorming.contract.yaml")
        self.assertEqual(record["id"], "BRAINSTORM-T-INVOKE")

    def test_empty_catalog_blocks_classic_brainstorming_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_still_passes_schema_validation(self):
        """Defense in depth, opposite framing from the funcdecomp precedent's own test name: the schema itself
        has no referential-integrity operator (runtime-only invariant, disclosed in the schema's own
        compilation_decisions) -- schema validation alone would NOT catch a dangling idea_ref, confirming the
        gate is the real enforcement layer here, not a redundant belt-and-suspenders check."""
        tampered = copy.deepcopy(_valid_record())
        tampered["evaluations"][0]["idea_ref"] = "IDEA-GHOST"
        gate = evaluate_idea_referential_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.contracts.validate(CLASSIC_BRAINSTORMING_SESSION_SCHEMA, tampered, "tampered record (schema-shape-valid, referentially broken)")

    def test_schema_rejects_an_unknown_top_level_key(self):
        record = _valid_record()
        record["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIC_BRAINSTORMING_SESSION_SCHEMA, record, "record with a smuggled top-level key")

    def test_schema_rejects_a_smuggled_score_field_inside_an_idea(self):
        """THE structural invariant this method exists to enforce: additionalProperties:false on the ideas[]
        item schema structurally forbids a score/verdict field at generation time -- Atlas's own caution
        ('不要邊想邊否決') made mechanically real, not just a written warning."""
        record = _valid_record()
        record["ideas"][0] = {**record["ideas"][0], "score": 10}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIC_BRAINSTORMING_SESSION_SCHEMA, record, "record with a smuggled per-idea score field")

    def test_schema_rejects_an_unknown_key_inside_an_evaluation_entry(self):
        record = _valid_record()
        record["evaluations"][0] = {**record["evaluations"][0], "weight": 1}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(CLASSIC_BRAINSTORMING_SESSION_SCHEMA, record, "record with a smuggled evaluations[] key")

    def test_schema_accepts_an_empty_evaluations_list(self):
        record = _valid_record(evaluations=[])
        self.contracts.validate(CLASSIC_BRAINSTORMING_SESSION_SCHEMA, record, "record with no evaluations")

    def test_id_is_distinct_from_a_sibling_family_machine_id(self):
        self.assertEqual(METHOD_ID, "divergent.classic_brainstorming")
        self.assertNotEqual(METHOD_ID, "decomposition.mece")

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's own
        test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "divergent.classic_brainstorming.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "divergent.classic_brainstorming contract")


class IdeaAndEvaluationVocabularyTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BRAINSTORM-")

    def test_idea_rejects_empty_id(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_EMPTY_IDEA_ID"):
            idea("   ", "x", IDEA_PROVENANCE)

    def test_idea_rejects_empty_text(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_EMPTY_IDEA_TEXT"):
            idea("IDEA-X", "   ", IDEA_PROVENANCE)

    def test_idea_rejects_invalid_provenance(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_INVALID_IDEA_PROVENANCE"):
            idea("IDEA-X", "some idea", {"epistemic_type": "NOT_REAL"})

    def test_evaluation_rejects_empty_idea_ref(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_EMPTY_IDEA_REF"):
            evaluation("   ", "keep", "reason")

    def test_evaluation_rejects_empty_verdict(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_EMPTY_VERDICT"):
            evaluation("IDEA-1", "   ", "reason")

    def test_evaluation_rejects_empty_rationale(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_EMPTY_RATIONALE"):
            evaluation("IDEA-1", "keep", "   ")


class CollectIdeaIdsTests(unittest.TestCase):
    def test_collects_every_idea_id_in_order(self):
        self.assertEqual(collect_idea_ids(_simple_ideas()), ["IDEA-1", "IDEA-2", "IDEA-3"])

    def test_single_idea_list(self):
        self.assertEqual(collect_idea_ids([idea("IDEA-ONLY", "x", IDEA_PROVENANCE)]), ["IDEA-ONLY"])


class IdeaUniquenessTests(unittest.TestCase):
    """Invariant #1 (module docstring): every ideas[].id is unique within the record."""

    def test_well_formed_ideas_are_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["ideas"]), 3)

    def test_single_idea_is_accepted(self):
        record = _valid_record(ideas=[idea("IDEA-ONLY", "the only idea", IDEA_PROVENANCE)], evaluations=[])
        self.assertEqual(record["ideas"][0]["id"], "IDEA-ONLY")

    def test_duplicate_idea_id_is_refused(self):
        dup_ideas = [idea("IDEA-DUP", "first", IDEA_PROVENANCE), idea("IDEA-DUP", "second, same id", IDEA_PROVENANCE)]
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_DUPLICATE_IDEA_ID"):
            generate_classic_brainstorming_session("BRAINSTORM-T-DUP", dup_ideas, RECORD_PROVENANCE)

    def test_malformed_idea_missing_a_required_key_is_refused(self):
        bad_ideas = [{"id": "IDEA-X", "text": "x"}]  # missing provenance
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_INVALID_IDEAS"):
            generate_classic_brainstorming_session("BRAINSTORM-T-BADSHAPE", bad_ideas, RECORD_PROVENANCE)

    def test_empty_ideas_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_INVALID_IDEAS"):
            generate_classic_brainstorming_session("BRAINSTORM-T-EMPTY", [], RECORD_PROVENANCE)

    def test_smuggled_score_field_on_input_is_refused(self):
        """Structural elimination at the builder layer too, not only the schema: an idea dict carrying an
        extra key (e.g. a caller-supplied score) has more than _IDEA_KEYS, so it fails the exact key-set
        check."""
        bad_ideas = [{"id": "IDEA-X", "text": "some idea", "provenance": IDEA_PROVENANCE, "score": 10}]
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_INVALID_IDEAS"):
            generate_classic_brainstorming_session("BRAINSTORM-T-SCORE", bad_ideas, RECORD_PROVENANCE)

    def test_ideas_are_rebuilt_not_aliased(self):
        """Same 'not aliased' regression class decomposition.functional_decomposition's own critic-fix-driven
        tests establish: mutating the ORIGINAL input list/dicts after construction must NOT be visible in the
        returned record."""
        ideas_list = _simple_ideas()
        record = generate_classic_brainstorming_session("BRAINSTORM-T-ALIAS", ideas_list, RECORD_PROVENANCE, evaluations=[])
        self.assertIsNot(record["ideas"], ideas_list)
        ideas_list[0]["text"] = "mutated after construction"
        ideas_list.append(idea("IDEA-99", "appended after construction", IDEA_PROVENANCE))
        self.assertEqual(record["ideas"][0]["text"], "推出訂閱制而非一次性買斷")
        self.assertEqual(len(record["ideas"]), 3)

    def test_evaluations_are_rebuilt_not_aliased(self):
        evaluations_list = _simple_evaluations()
        record = generate_classic_brainstorming_session("BRAINSTORM-T-ALIAS2", _simple_ideas(), RECORD_PROVENANCE, evaluations=evaluations_list)
        evaluations_list[0]["rationale"] = "mutated after construction"
        self.assertEqual(record["evaluations"][0]["rationale"], "現金流可預測，符合本季度目標")


class IdeaReferentialIntegrityTests(unittest.TestCase):
    """Invariant #2 (module docstring): every evaluations[].idea_ref must resolve to a real ideas[].id present
    in this same record."""

    def test_evaluations_referencing_real_ids_are_accepted(self):
        record = _valid_record()
        self.assertEqual(len(record["evaluations"]), 2)

    def test_empty_evaluations_list_is_accepted(self):
        """Atlas's own ordering places evaluation last and separate -- a pure-generation session is legal, not
        refused."""
        record = _valid_record(evaluations=[])
        self.assertEqual(record["evaluations"], [])

    def test_dangling_idea_ref_is_refused(self):
        bad_evaluations = [evaluation("IDEA-DOES-NOT-EXIST", "keep", "dangling ref")]
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_DANGLING_IDEA_REF"):
            generate_classic_brainstorming_session("BRAINSTORM-T-DANGLE1", _simple_ideas(), RECORD_PROVENANCE, evaluations=bad_evaluations)

    def test_one_of_several_dangling_refs_is_refused(self):
        bad_evaluations = [
            evaluation("IDEA-1", "keep", "real ref, fine"),
            evaluation("IDEA-GHOST", "discard", "dangling ref among otherwise-valid entries"),
        ]
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_DANGLING_IDEA_REF"):
            generate_classic_brainstorming_session("BRAINSTORM-T-DANGLE2", _simple_ideas(), RECORD_PROVENANCE, evaluations=bad_evaluations)

    def test_malformed_evaluation_missing_a_key_is_refused(self):
        bad_evaluations = [{"idea_ref": "IDEA-1", "verdict": "keep"}]  # missing rationale
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_INVALID_EVALUATION"):
            generate_classic_brainstorming_session("BRAINSTORM-T-BADEVAL", _simple_ideas(), RECORD_PROVENANCE, evaluations=bad_evaluations)

    def test_evaluations_checked_only_after_idea_shape_and_id_uniqueness(self):
        """A duplicate-id ideas list with an also-dangling evaluation must report the DUPLICATE_IDEA_ID failure
        first (builder's own documented check order) -- proves the ordering in the module docstring, not just
        that both invariants exist somewhere."""
        dup_ideas = [idea("IDEA-X", "first", IDEA_PROVENANCE), idea("IDEA-X", "dup", IDEA_PROVENANCE)]
        bad_evaluations = [evaluation("IDEA-GHOST", "keep", "dangling too")]
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_DUPLICATE_IDEA_ID"):
            generate_classic_brainstorming_session("BRAINSTORM-T-ORDER", dup_ideas, RECORD_PROVENANCE, evaluations=bad_evaluations)


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_INVALID_ID"):
            _valid_record(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_INVALID_ID"):
            _valid_record(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_INVALID_VERSION"):
            generate_classic_brainstorming_session("BRAINSTORM-T-002", _simple_ideas(), RECORD_PROVENANCE, version=1)

    def test_invalid_record_level_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BRAINSTORM_INVALID_PROVENANCE"):
            generate_classic_brainstorming_session("BRAINSTORM-T-003", _simple_ideas(), {"epistemic_type": "NOT_REAL"})


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID record's raw dict directly (never going through the builder again), then call the
    gates. These prove the gates re-derive from raw fields rather than trusting the builder's own work."""

    def test_gates_pass_a_genuinely_valid_hand_built_record(self):
        results = evaluate_classic_brainstorming_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_idea_integrity_gate_catches_hand_tampered_duplicate_id(self):
        record = copy.deepcopy(_valid_record())
        record["ideas"][1]["id"] = record["ideas"][0]["id"]
        gate = evaluate_idea_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_idea_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_idea_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_idea_integrity_gate_catches_missing_id_prefix(self):
        record = copy.deepcopy(_valid_record())
        record["id"] = "WRONG-001"
        gate = evaluate_idea_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_idea_integrity_gate_catches_non_string_version(self):
        record = copy.deepcopy(_valid_record())
        record["version"] = 1
        gate = evaluate_idea_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_idea_referential_integrity_gate_catches_hand_tampered_dangling_reference(self):
        record = copy.deepcopy(_valid_record())
        record["evaluations"].append({"idea_ref": "IDEA-GHOST", "verdict": "keep", "rationale": "spliced in after construction"})
        gate = evaluate_idea_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_idea_referential_integrity_gate_passes_when_ideas_valid_and_no_refs_dangle(self):
        record = copy.deepcopy(_valid_record())
        gate = evaluate_idea_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_idea_referential_integrity_gate_fails_closed_when_ideas_itself_is_invalid(self):
        record = copy.deepcopy(_valid_record())
        del record["ideas"][0]["text"]
        gate = evaluate_idea_referential_integrity_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_idea_referential_integrity_gate_catches_non_dict_record(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_idea_referential_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_both_record_and_idea_provenance_valid(self):
        gate = evaluate_provenance_required_gate(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_record_level_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_a_per_idea_provenance_invalid(self):
        record = copy.deepcopy(_valid_record())
        record["ideas"][0]["provenance"] = None
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

    def test_evaluate_classic_brainstorming_gates_returns_three_gates_in_order(self):
        results = evaluate_classic_brainstorming_gates(_valid_record(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "idea_integrity", "idea_referential_integrity"])

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "divergent.classic_brainstorming")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        record = _valid_record()
        self.assertEqual(set(record.keys()), {"id", "version", "generated_by_method", "ideas", "evaluations", "provenance"})


if __name__ == "__main__":
    unittest.main()
