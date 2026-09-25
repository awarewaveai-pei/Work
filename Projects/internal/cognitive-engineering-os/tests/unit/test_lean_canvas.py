"""Mutation-style tests for ``strategy.lean_canvas``, mirroring
``strategy.business_model_canvas``'s own test shape for the identical closed-block-set method
class (see that module's own test file, read in full before writing this).

Three real invariants beyond per-field shape (blocks completeness/distinctness, per-block content,
top-level ``validation_status``), exercised at BOTH layers where the builder accepts the field at
all: construction-time refusal and independent gate re-derivation (catching a hand-tampered raw
dict that bypassed the builder entirely). Unlike ``strategy.business_model_canvas``, this method has
no dedicated ``typed-objects/*.schema.yaml`` (same choice ``decision.eisenhower_matrix`` /
``divergent.reverse_brainstorming`` already make for a non-Atlas-cited method added the same day --
the builder + gate pair is this system's actual enforcement authority regardless of whether a
schema.yaml also exists), so schema-conformance assertions are limited to the method CONTRACT yaml
against ``method.schema.yaml``, not a typed-object record schema.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.strategy.lean_canvas import (
    BLOCK_NAMES,
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALIDATION_STATUS,
    all_gates_pass,
    block_entry,
    evaluate_evidence_labeling_required_gate,
    evaluate_lean_canvas_gates,
    evaluate_lean_canvas_integrity_gate,
    evaluate_provenance_required_gate,
    generate_lean_canvas,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

_NOW = "2026-09-18T00:00:00Z"


def _blocks(**overrides: dict) -> list[dict]:
    base = {
        "PROBLEM": dict(block="PROBLEM", content="Freelance accountants lose 5h/week reconciling multi-client books by hand", provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-901"]),
        "CUSTOMER_SEGMENTS": dict(block="CUSTOMER_SEGMENTS", content="solo/small freelance accounting practices, 1-5 staff", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "UNIQUE_VALUE_PROPOSITION": dict(block="UNIQUE_VALUE_PROPOSITION", content="reconcile every client's books in one sitting, not one tab per client", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "SOLUTION": dict(block="SOLUTION", content="single dashboard pulling all client bank feeds with auto-matched entries", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "CHANNELS": dict(block="CHANNELS", content="accounting-association referrals, direct outbound, free-trial upsell", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "REVENUE_STREAMS": dict(block="REVENUE_STREAMS", content="monthly subscription tiered by number of client books", provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-902"]),
        "COST_STRUCTURE": dict(block="COST_STRUCTURE", content="cloud infra, bank-feed API fees, founder time", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "KEY_METRICS": dict(block="KEY_METRICS", content="weekly active reconciliations per account, trial-to-paid conversion", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
        "UNFAIR_ADVANTAGE": dict(block="UNFAIR_ADVANTAGE", content="founder is a licensed accountant with an existing 200-firm mailing list", provenance=make_provenance("HYPOTHESIS", "AI_SUGGESTED")),
    }
    base.update(overrides)
    return [
        block_entry(v["block"], v["content"], v["provenance"], supporting_evidence_refs=v.get("supporting_evidence_refs"))
        for v in base.values()
    ]


def _valid_canvas(*, record_id: str = "LEANCANVAS-T-001", blocks: list[dict] | None = None):
    return generate_lean_canvas(
        record_id,
        blocks if blocks is not None else _blocks(),
        make_provenance("AI_INFERENCE", "AI_SUGGESTED"),
    )


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])
        self.assertEqual([c["method_id"] for c in resolved["candidate_methods"]], [METHOD_ID])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = shared_method_catalog(self.spec_root)
        descriptor, canvas = live.invoke(METHOD_ID, generate_lean_canvas, "LEANCANVAS-T-INVOKE", _blocks(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/strategy.lean_canvas.contract.yaml")
        self.assertEqual(canvas["id"], "LEANCANVAS-T-INVOKE")

    def test_empty_catalog_blocks_lean_canvas_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_id_is_distinct_from_business_model_canvas_machine_id(self):
        self.assertNotEqual(METHOD_ID, "strategy.business_model_canvas")
        self.assertEqual(METHOD_ID, "strategy.lean_canvas")

    def test_lean_canvas_and_bmc_both_resolve_as_separate_entries(self):
        live = shared_method_catalog(self.spec_root)
        resolved = live.resolve([METHOD_ID, "strategy.business_model_canvas"])
        self.assertIsNone(resolved["blocked"])

    def test_contract_yaml_validates_against_method_schema(self):
        """R4: mechanically keeps this contract's own `verification`/shape claims true going forward,
        same live check every sibling contract's own test suite already establishes."""
        contract_path = self.spec_root / "methods" / "contracts" / "strategy.lean_canvas.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "strategy.lean_canvas contract")


class BlockVocabularyTests(unittest.TestCase):
    def test_block_names_is_exactly_ash_mauryas_nine(self):
        self.assertEqual(
            BLOCK_NAMES,
            frozenset(
                {
                    "PROBLEM",
                    "CUSTOMER_SEGMENTS",
                    "UNIQUE_VALUE_PROPOSITION",
                    "SOLUTION",
                    "CHANNELS",
                    "REVENUE_STREAMS",
                    "COST_STRUCTURE",
                    "KEY_METRICS",
                    "UNFAIR_ADVANTAGE",
                }
            ),
        )

    def test_block_names_shares_only_the_4_expected_names_with_bmc(self):
        """Due-diligence assertion (module docstring): Lean Canvas and BMC share exactly Customer
        Segments/Channels/Revenue Streams/Cost Structure -- everything else genuinely differs."""
        from ai_lego.modules.strategy.business_model_canvas import BLOCK_NAMES as BMC_BLOCK_NAMES

        self.assertEqual(BLOCK_NAMES & BMC_BLOCK_NAMES, {"CUSTOMER_SEGMENTS", "CHANNELS", "REVENUE_STREAMS", "COST_STRUCTURE"})

    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "LEANCANVAS-")

    def test_validation_status_constant(self):
        self.assertEqual(VALIDATION_STATUS, "UNVALIDATED_HYPOTHESIS")

    def test_block_entry_rejects_an_unknown_block_name(self):
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_UNKNOWN_BLOCK"):
            block_entry("KEY_PARTNERS", "not one of the nine", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))

    def test_block_entry_accepts_all_9_names(self):
        for name in sorted(BLOCK_NAMES):
            entry = block_entry(name, "some content", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
            self.assertEqual(entry["block"], name)


class BlockSetCompletenessTests(unittest.TestCase):
    """Invariant 1 (module docstring): blocks must name EXACTLY the 9 BLOCK_NAMES, each exactly once,
    in any order."""

    def test_valid_9_blocks_is_accepted(self):
        canvas = _valid_canvas()
        self.assertEqual(len(canvas["blocks"]), 9)

    def test_valid_9_blocks_in_a_shuffled_order_is_also_accepted(self):
        blocks = _blocks()
        shuffled = [blocks[8], blocks[2], blocks[5], blocks[0], blocks[7], blocks[1], blocks[6], blocks[3], blocks[4]]
        canvas = generate_lean_canvas("LEANCANVAS-T-SHUFFLED", shuffled, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        self.assertEqual({b["block"] for b in canvas["blocks"]}, BLOCK_NAMES)

    def test_missing_one_block_is_refused(self):
        blocks = _blocks()[:8]  # drops UNFAIR_ADVANTAGE (dict insertion order preserved -- it is last)
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_INCOMPLETE_BLOCK_SET"):
            generate_lean_canvas("LEANCANVAS-T-MISSING", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_missing_all_blocks_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_INCOMPLETE_BLOCK_SET"):
            generate_lean_canvas("LEANCANVAS-T-EMPTY", [], make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_duplicate_block_replacing_a_different_one_is_refused(self):
        blocks = _blocks()[:8] + [_blocks()[0]]  # PROBLEM appears twice, UNFAIR_ADVANTAGE missing
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_INCOMPLETE_BLOCK_SET"):
            generate_lean_canvas("LEANCANVAS-T-DUP", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_ten_blocks_is_refused(self):
        blocks = _blocks() + [block_entry("PROBLEM", "a 10th duplicate entry", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))]
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_INCOMPLETE_BLOCK_SET"):
            generate_lean_canvas("LEANCANVAS-T-TEN", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_non_list_blocks_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_INVALID_BLOCK_SET"):
            generate_lean_canvas("LEANCANVAS-T-NONLIST", "not a list", make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_unknown_block_name_smuggled_in_via_raw_dict_is_refused(self):
        blocks = _blocks()[:8] + [{"block": "KEY_ACTIVITIES", "content": "x", "provenance": make_provenance("HYPOTHESIS", "AI_SUGGESTED")}]
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_UNKNOWN_BLOCK"):
            generate_lean_canvas("LEANCANVAS-T-UNKNOWNBLOCK", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class BlockContentTests(unittest.TestCase):
    """Invariant 2 (module docstring): every block entry needs non-empty content."""

    def test_empty_content_is_refused(self):
        blocks = _blocks()
        blocks[0] = {**blocks[0], "content": ""}
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_EMPTY_CONTENT"):
            generate_lean_canvas("LEANCANVAS-T-EMPTYCONTENT", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_whitespace_only_content_is_refused(self):
        blocks = _blocks()
        blocks[0] = {**blocks[0], "content": "   "}
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_EMPTY_CONTENT"):
            generate_lean_canvas("LEANCANVAS-T-WSCONTENT", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))

    def test_missing_content_key_is_refused(self):
        blocks = _blocks()
        del blocks[0]["content"]
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_INVALID_BLOCK_SET"):
            generate_lean_canvas("LEANCANVAS-T-NOCONTENT", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))


class ValidationStatusTests(unittest.TestCase):
    """Invariant 3 (module docstring): validation_status is ALWAYS exactly VALIDATION_STATUS,
    guaranteed by the builder NOT accepting it as a parameter at all."""

    def test_builder_does_not_accept_validation_status_as_a_keyword_argument(self):
        with self.assertRaises(TypeError):
            generate_lean_canvas("LEANCANVAS-T-BADKWARG", _blocks(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), validation_status="VALIDATED_BUSINESS")  # type: ignore[call-arg]

    def test_every_builder_produced_record_carries_exactly_the_constant(self):
        canvas = _valid_canvas()
        self.assertEqual(canvas["validation_status"], VALIDATION_STATUS)
        self.assertEqual(canvas["validation_status"], "UNVALIDATED_HYPOTHESIS")

    def test_gate_catches_hand_tampered_validation_status(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["validation_status"] = "VALIDATED_BUSINESS"
        gate = evaluate_lean_canvas_integrity_gate(canvas, "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_validation_status(self):
        canvas = copy.deepcopy(_valid_canvas())
        del canvas["validation_status"]
        gate = evaluate_lean_canvas_integrity_gate(canvas, "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")


class IdAndVersionTests(unittest.TestCase):
    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_INVALID_ID"):
            _valid_canvas(record_id="WRONG-PREFIX-001")

    def test_invalid_id_empty_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_INVALID_ID"):
            _valid_canvas(record_id="")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "LEANCANVAS_INVALID_VERSION"):
            generate_lean_canvas("LEANCANVAS-T-002", _blocks(), make_provenance("AI_INFERENCE", "AI_SUGGESTED"), version=1)


class GateIndependenceTests(unittest.TestCase):
    """Hand-tamper a VALID canvas's raw dict directly (never going through the builder again), then
    call the gate. These prove the gate re-derives from raw fields rather than trusting the builder."""

    def test_gate_passes_a_genuinely_valid_hand_built_canvas(self):
        gate = evaluate_lean_canvas_integrity_gate(_valid_canvas(), "test", _NOW)
        self.assertEqual(gate["status"], "PASS")

    def test_gate_catches_hand_tampered_missing_block(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["blocks"] = canvas["blocks"][:8]
        gate = evaluate_lean_canvas_integrity_gate(canvas, "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_duplicated_block(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["blocks"] = canvas["blocks"][:8] + [canvas["blocks"][0]]
        gate = evaluate_lean_canvas_integrity_gate(canvas, "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_hand_tampered_empty_content(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["blocks"][0]["content"] = ""
        gate = evaluate_lean_canvas_integrity_gate(canvas, "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_dict_canvas(self):
        for bad in (None, "not-a-dict", [], 42):
            with self.subTest(bad=bad):
                gate = evaluate_lean_canvas_integrity_gate(bad, "test", _NOW)
                self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_missing_id_prefix(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["id"] = "WRONG-001"
        gate = evaluate_lean_canvas_integrity_gate(canvas, "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")

    def test_gate_catches_non_string_version(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["version"] = 1
        gate = evaluate_lean_canvas_integrity_gate(canvas, "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_canvas(), "test", _NOW)
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_a_block_provenance_invalid(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["blocks"][0]["provenance"] = None
        gate = evaluate_provenance_required_gate(canvas, "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_when_record_provenance_invalid(self):
        canvas = copy.deepcopy(_valid_canvas())
        canvas["provenance"] = {"epistemic_type": "BOGUS", "authorship_state": "BOGUS"}
        gate = evaluate_provenance_required_gate(canvas, "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")


class EvidenceLabelingGateTests(unittest.TestCase):
    """Same-family generalization of business_model_canvas/porter_five_forces/vrio's identical
    check: a block claiming the EVIDENCE label must actually cite supporting_evidence_refs."""

    def test_valid_canvas_passes(self):
        gate = evaluate_evidence_labeling_required_gate(_valid_canvas(), "test", _NOW)
        self.assertEqual(gate["status"], "PASS")

    def test_evidence_labeled_block_with_no_supporting_refs_fails(self):
        blocks = _blocks()
        fabricated = block_entry("CUSTOMER_SEGMENTS", "solo freelance accountants", make_provenance("EVIDENCE", "AI_SUGGESTED"))
        blocks = [b for b in blocks if b["block"] != "CUSTOMER_SEGMENTS"] + [fabricated]
        canvas = generate_lean_canvas("LEANCANVAS-T-UNEVIDENCED", blocks, make_provenance("AI_INFERENCE", "AI_SUGGESTED"))
        gate = evaluate_evidence_labeling_required_gate(canvas, "test", _NOW)
        self.assertEqual(gate["status"], "FAIL")
        self.assertTrue(any(p["block"] == "CUSTOMER_SEGMENTS" for p in gate["evidence"][0]["problems"]))

    def test_hypothesis_labeled_block_with_no_supporting_refs_still_passes(self):
        """Only EVIDENCE-labeled claims require a citation -- a disclosed HYPOTHESIS is not a
        violation (module docstring: every Lean Canvas block starts life as a guess)."""
        gate = evaluate_evidence_labeling_required_gate(_valid_canvas(), "test", _NOW)
        self.assertEqual(gate["status"], "PASS")


class HelperFunctionTests(unittest.TestCase):
    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_evaluate_lean_canvas_gates_returns_three_gates_in_order(self):
        results = evaluate_lean_canvas_gates(_valid_canvas(), "test", _NOW)
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "evidence_labeling_required", "lean_canvas_integrity"])

    def test_evaluate_lean_canvas_gates_all_pass_on_a_valid_canvas(self):
        results = evaluate_lean_canvas_gates(_valid_canvas(), "test", _NOW)
        self.assertTrue(all_gates_pass(results))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "strategy.lean_canvas")

    def test_builder_does_not_leak_extra_top_level_keys(self):
        canvas = _valid_canvas()
        self.assertEqual(set(canvas.keys()), {"id", "version", "generated_by_method", "blocks", "validation_status", "provenance"})

    def test_block_entry_does_not_leak_extra_keys_when_no_refs_given(self):
        entry = block_entry("PROBLEM", "text", make_provenance("HYPOTHESIS", "AI_SUGGESTED"))
        self.assertEqual(set(entry.keys()), {"block", "content", "provenance"})

    def test_block_entry_includes_supporting_evidence_refs_when_provided(self):
        entry = block_entry("PROBLEM", "text", make_provenance("EVIDENCE", "HUMAN_APPROVED"), supporting_evidence_refs=["E-1"])
        self.assertEqual(entry["supporting_evidence_refs"], ["E-1"])


if __name__ == "__main__":
    unittest.main()
