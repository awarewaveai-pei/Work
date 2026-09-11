"""Mutation-style tests for ``strategy.business_model_canvas`` (F08 context/strategy family, 11th
member).

Three real invariants beyond per-field shape (blocks completeness/distinctness, per-block content,
top-level ``validation_status``), exercised at BOTH layers where the builder accepts the field at
all: construction-time refusal (``generate_business_model_canvas`` raising a specific
``InvariantViolation`` code for invariants 1+2) and independent gate re-derivation
(``evaluate_business_model_canvas_integrity_gate`` catching a hand-tampered raw dict that bypassed
the builder entirely, never calling the builder itself, for all 3 invariants including
``validation_status`` which the builder never accepts as a parameter). Schema conformance is
checked against the real spec-root schema this same slice added
(``typed-objects/business-model-canvas.schema.yaml``).
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.strategy.business_model_canvas import (
    BLOCK_NAMES,
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALIDATION_STATUS,
    all_gates_pass,
    block_entry,
    evaluate_business_model_canvas_gates,
    evaluate_business_model_canvas_integrity_gate,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    generate_business_model_canvas,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

BMC_SCHEMA = "ai-lego://specs/cognitive/typed-objects/business-model-canvas.schema.yaml"


def _blocks(**overrides: dict) -> list[dict]:
    base = {
        "CUSTOMER_SEGMENTS": dict(block="CUSTOMER_SEGMENTS", content="mid-size accounting firms, 5-50 staff", provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-501"]),
        "VALUE_PROPOSITIONS": dict(block="VALUE_PROPOSITIONS", content="automated reconciliation, 70% less manual checking", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "CHANNELS": dict(block="CHANNELS", content="association referrals, direct sales, free-trial upsell", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "CUSTOMER_RELATIONSHIPS": dict(block="CUSTOMER_RELATIONSHIPS", content="dedicated CSM plus self-serve help center", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "REVENUE_STREAMS": dict(block="REVENUE_STREAMS", content="monthly subscription tiered by account count", provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-502"]),
        "KEY_RESOURCES": dict(block="KEY_RESOURCES", content="reconciliation algorithm, cloud infra, accounting staff", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "KEY_ACTIVITIES": dict(block="KEY_ACTIVITIES", content="product development, onboarding, regulatory upkeep", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "KEY_PARTNERS": dict(block="KEY_PARTNERS", content="cloud vendors, accounting-software integrators, associations", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "COST_STRUCTURE": dict(block="COST_STRUCTURE", content="R&D headcount, cloud compute, sales and marketing", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    }
    base.update(overrides)
    return [
        block_entry(v["block"], v["content"], v["provenance"], supporting_evidence_refs=v.get("supporting_evidence_refs"))
        for v in base.values()
    ]


def _valid_canvas(
    *,
    canvas_id: str = "BMC-T-001",
    blocks: list[dict] | None = None,
):
    return generate_business_model_canvas(
        canvas_id,
        blocks if blocks is not None else _blocks(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_canvas_validates_against_the_real_schema(self):
        self.contracts.validate(BMC_SCHEMA, _valid_canvas(), "business model canvas")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, canvas = live.invoke(
            METHOD_ID, generate_business_model_canvas, "BMC-T-INVOKE", _blocks(), make_provenance("AI_INFERENCE", "AI_SUGGESTED")
        )
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.business_model_canvas.contract.yaml")
        self.assertEqual(canvas["id"], "BMC-T-INVOKE")

    def test_empty_catalog_blocks_bmc_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_hand_tampered_record_that_fails_the_gate_also_fails_real_schema_validation(self):
        """Defense in depth: the runtime gate and the real JSON schema independently reject the same
        malformed record, not just one of the two layers."""
        tampered = copy.deepcopy(_valid_canvas())
        tampered["validation_status"] = "VALIDATED_BUSINESS"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BMC_SCHEMA, tampered, "tampered canvas")
        gate = evaluate_business_model_canvas_integrity_gate(tampered, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_schema_rejects_an_unknown_top_level_key(self):
        """additionalProperties:false must reject a smuggled top-level key (same discipline as
        porter-five-forces-analysis.schema.yaml's own equivalent test)."""
        canvas = _valid_canvas()
        canvas["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BMC_SCHEMA, canvas, "canvas with a smuggled top-level key")

    def test_schema_rejects_an_unknown_key_inside_a_blocks_entry(self):
        canvas = _valid_canvas()
        canvas["blocks"][0] = {**canvas["blocks"][0], "score": 42}
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(BMC_SCHEMA, canvas, "canvas with a smuggled blocks[] key")

    def test_id_is_distinct_from_strategy_porter_five_forces_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.porter_five_forces")
        self.assertEqual(METHOD_ID, "strategy.business_model_canvas")

    def test_bmc_and_porter_both_resolve_as_separate_entries(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.porter_five_forces"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification.method` claim ('Validated against
        specs/cognitive/method.schema.yaml') true going forward, same live check every sibling contract's
        own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.business_model_canvas.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.business_model_canvas contract")


class BlockVocabularyTests(unittest.TestCase):
    def test_block_names_is_exactly_the_atlas_12_15_nine(self):
        self.assertEqual(
            BLOCK_NAMES,
            frozenset(
                {
                    "CUSTOMER_SEGMENTS",
                    "VALUE_PROPOSITIONS",
                    "CHANNELS",
                    "CUSTOMER_RELATIONSHIPS",
                    "REVENUE_STREAMS",
                    "KEY_RESOURCES",
                    "KEY_ACTIVITIES",
                    "KEY_PARTNERS",
                    "COST_STRUCTURE",
                }
            ),
        )

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "BMC-")

    def test_validation_status_constant(self):
        self.assertEqual(VALIDATION_STATUS, "UNVALIDATED_HYPOTHESIS")

    def test_block_entry_rejects_an_unknown_block_name(self):
        with self.assertRaisesRegex(InvariantViolation, "BMC_UNKNOWN_BLOCK"):
            block_entry("MARKET_TIMING", "not one of the nine", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_block_entry_accepts_all_9_names(self):
        for name in sorted(BLOCK_NAMES):
            entry = block_entry(name, "some content", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
            self.assertEqual(entry["block"], name)


class BlockSetCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): blocks must name EXACTLY the 9 BLOCK_NAMES, each exactly once, in
    any order -- the core "closed SET, unordered, completeness required" design-shape invariant."""

    def test_valid_9_blocks_in_atlas_order_is_accepted(self):
        canvas = _valid_canvas()
        self.assertEqual(len(canvas["blocks"]), 9)

    def test_valid_9_blocks_in_a_shuffled_order_is_also_accepted(self):
        """Order carries no meaning Atlas cites -- unlike causal.logic_model's STAGE_ORDER, position is not enforced."""
        blocks = _blocks()
        shuffled = [blocks[8], blocks[2], blocks[5], blocks[0], blocks[7], blocks[1], blocks[6], blocks[3], blocks[4]]
        canvas = generate_business_model_canvas("BMC-T-SHUFFLED", shuffled, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual({b["block"] for b in canvas["blocks"]}, BLOCK_NAMES)

    def test_missing_one_block_is_refused(self):
        blocks = _blocks()[:8]  # drops COST_STRUCTURE (dict insertion order preserved -- it is last)
        with self.assertRaisesRegex(InvariantViolation, "BMC_INCOMPLETE_BLOCK_SET"):
            generate_business_model_canvas("BMC-T-MISSING", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_missing_all_blocks_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BMC_INCOMPLETE_BLOCK_SET"):
            generate_business_model_canvas("BMC-T-EMPTY", [], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_duplicate_block_replacing_a_different_one_is_refused(self):
        """10 slots is impossible (maxItems:9 at the schema layer already prevents 10), but a caller
        supplying 9 entries where one block is duplicated and another is entirely missing must still be
        refused by the runtime completeness check."""
        blocks = _blocks()[:8] + [_blocks()[0]]  # CUSTOMER_SEGMENTS appears twice, COST_STRUCTURE missing
        with self.assertRaisesRegex(InvariantViolation, "BMC_INCOMPLETE_BLOCK_SET"):
            generate_business_model_canvas("BMC-T-DUP", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_ten_blocks_is_refused(self):
        blocks = _blocks() + [block_entry("CUSTOMER_SEGMENTS", "a 10th duplicate entry", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "BMC_INCOMPLETE_BLOCK_SET"):
            generate_business_model_canvas("BMC-T-TEN", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_non_list_blocks_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BMC_INVALID_BLOCK_SET"):
            generate_business_model_canvas("BMC-T-NONLIST", "not a list", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_unknown_block_name_smuggled_in_via_raw_dict_is_refused(self):
        blocks = _blocks()[:8] + [{"block": "COMPETITIVE_ADVANTAGE", "content": "x", "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}]
        with self.assertRaisesRegex(InvariantViolation, "BMC_UNKNOWN_BLOCK"):
            generate_business_model_canvas("BMC-T-UNKNOWNBLOCK", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class BlockContentTests(unittest.TestCase):
    """Invariant 2 (module docstring): every block entry needs a non-empty content."""

    def test_empty_content_is_refused(self):
        blocks = _blocks()
        blocks[0] = {**blocks[0], "content": ""}
        with self.assertRaisesRegex(InvariantViolation, "BMC_EMPTY_CONTENT"):
            generate_business_model_canvas("BMC-T-EMPTYCONTENT", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_content_is_refused(self):
        blocks = _blocks()
        blocks[0] = {**blocks[0], "content": "   "}
        with self.assertRaisesRegex(InvariantViolation, "BMC_EMPTY_CONTENT"):
            generate_business_model_canvas("BMC-T-WSCONTENT", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_missing_content_key_is_refused(self):
        blocks = _blocks()
        del blocks[0]["content"]
        with self.assertRaisesRegex(InvariantViolation, "BMC_INVALID_BLOCK_SET"):
            generate_business_model_canvas("BMC-T-NOCONTENT", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class ValidationStatusTests(unittest.TestCase):
    """Invariant 3 (module docstring): validation_status is ALWAYS exactly VALIDATION_STATUS, guaranteed
    by the builder NOT accepting it as a parameter at all (structural elimination) -- unlike invariants
    1+2, there is no builder call to refuse, so these tests prove the elimination itself plus the
    independent gate re-derivation."""

    def test_builder_does_not_accept_validation_status_as_a_keyword_argument(self):
        with self.assertRaises(TypeError):
            generate_business_model_canvas(
                "BMC-T-BADKWARG", _blocks(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), validation_status="VALIDATED_BUSINESS"  # type: ignore[call-arg]
            )

    def test_every_builder_produced_record_carries_exactly_the_constant(self):
        canvas = _valid_canvas()
        self.assertEqual(canvas["validation_status"], VALIDATION_STATUS)
        self.assertEqual(canvas["validation_status"], "UNVALIDATED_HYPOTHESIS")

    def test_gate_catches_hand_tampered_validation_status(self):
        """The builder can never be made to emit a wrong validation_status, so this hand-tampers a raw
        dict directly (bypassing the builder entirely) to prove the gate re-derives invariant 3 rather
        than merely trusting that the builder always got it right."""
        canvas = copy.deepcopy(_valid_canvas())
        canvas["validation_status"] = "VALIDATED_BUSINESS"
        gate = evaluate_business_model_canvas_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_validation_status(self):
        canvas = copy.deepcopy(_valid_canvas())
        del canvas["validation_status"]
        gate = evaluate_business_model_canvas_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BMC_INVALID_ID"):
            _valid_canvas(canvas_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BMC_INVALID_ID"):
            _valid_canvas(canvas_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "BMC_INVALID_VERSION"):
            generate_business_model_canvas("BMC-T-002", _blocks(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID canvas's raw dict directly (never going through the builder again), then call
    the gate. These prove the gate re-derives from raw fields rather than trusting the builder's own
    work."""

    def test_gate_passes_a_genuinely_valid_hand_built_canvas(self):
        gate = evaluate_business_model_canvas_integrity_gate(_valid_canvas(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_block(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["blocks"] = canvas["blocks"][:8]
        gate = evaluate_business_model_canvas_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicated_block(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["blocks"] = canvas["blocks"][:8] + [canvas["blocks"][0]]
        gate = evaluate_business_model_canvas_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_content(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["blocks"][0]["content"] = ""
        gate = evaluate_business_model_canvas_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_canvas(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_business_model_canvas_integrity_gate(bad, "test", "2026-09-11T00:00:00Z")
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["id"] = "WRONG-001"
        gate = evaluate_business_model_canvas_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["version"] = 1
        gate = evaluate_business_model_canvas_integrity_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_canvas(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_block_provenance_invalid(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["blocks"][0]["provenance"] = None
        gate = evaluate_provenance_required_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class EvidenceLabelingGateTests(unittest.TestCase):
    """Atlas §12.15 gives no explicit misuse warning the way SWOT's own does (disclosed in this method's
    contract open_questions) -- this gate is a same-family generalization of
    porter_five_forces/vrio's identical check: a block claiming the EVIDENCE label must actually cite
    supporting_evidence_refs."""

    def test_valid_canvas_passes(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_canvas(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeled_block_with_no_supporting_refs_fails(self):
        blocks = _blocks()
        fabricated = block_entry("CUSTOMER_SEGMENTS", "mid-size accounting firms", make_provenance("EVIDENCE", "AI_SUGGESTED"))
        blocks = [b for b in blocks if b["block"] != "CUSTOMER_SEGMENTS"] + [fabricated]
        canvas = generate_business_model_canvas("BMC-T-UNEVIDENCED", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        gate = evaluate_evidence_labeling_required_gate(canvas, "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(any(p["block"] == "CUSTOMER_SEGMENTS" for p in gate["evidence"][0]["problems"]))

    def test_hypothesis_labeled_block_with_no_supporting_refs_still_passes(self):
        """Only EVIDENCE-labeled claims require a citation -- a disclosed HYPOTHESIS is not a violation."""
        gate = evaluate_evidence_labeling_required_gate(_valid_canvas(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_business_model_canvas_gates_returns_three_gates_in_order(self):
        results = evaluate_business_model_canvas_gates(_valid_canvas(), "test", "2026-09-11T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "business_model_canvas_integrity"])

    def test_evaluate_business_model_canvas_gates_all_pass_on_a_valid_canvas(self):
        results = evaluate_business_model_canvas_gates(_valid_canvas(), "test", "2026-09-11T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.business_model_canvas")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        canvas = _valid_canvas()
        self.assertEqual(set(canvas.keys()), {"id", "version", "generated_by_method", "blocks", "validation_status", "provenance"})

    def test_block_entry_does_not_leak_extra_keys_when_no_refs_given(self):
        entry = block_entry("CUSTOMER_SEGMENTS", "text", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual(set(entry.keys()), {"block", "content", "provenance"})

    def test_block_entry_includes_supporting_evidence_refs_when_provided(self):
        entry = block_entry("CUSTOMER_SEGMENTS", "text", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"])
        self.assertEqual(entry["supporting_evidence_refs"], ["E-1"])


if __name__ == "__main__":
    unittest.main()
