"""Mutation-style tests for ``jurisdiction.regulatory_horizon_scan`` (F23 global jurisdiction/compliance/
localization family, Atlas L939).

Atlas's own "official source" pipeline stage is proven at BOTH independent layers: the construction-time
builder refuses an entry sourced from an unofficial channel, or missing any of status/effective_date_or_
estimate/impact/owner, and the independent gates re-derive the same rules directly from a raw (possibly
hand-tampered) dict, never trusting that the builder's own check already ran.
"""

from __future__ import annotations

import copy
import unittest

import yaml

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation, SchemaValidationError
from ai_lego.modules.jurisdiction.regulatory_horizon_scan import (
    METHOD_ID,
    RECORD_ID_PREFIX,
    all_gates_pass,
    evaluate_entry_completeness_gate,
    evaluate_official_source_gate,
    evaluate_provenance_required_gate,
    evaluate_regulatory_horizon_scan_gates,
    generate_regulatory_horizon_scan,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog

RHS_SCHEMA = "ai-lego://specs/cognitive/typed-objects/regulatory-horizon-scan-record.schema.yaml"
PROVENANCE = make_provenance("AI_INFERENCE", "AI_GENERATED")


def _kwargs(**overrides: object) -> dict:
    base = dict(
        entries=[
            {
                "entry_id": "REG-1",
                "regulation_title": "EU AI Act Art.6 high-risk classification amendment",
                "source": "Official Journal of the European Union, C-series draft amendment",
                "source_type": "OFFICIAL_LEGISLATIVE_RECORD",
                "status": "proposed, in trilogue negotiation",
                "effective_date_or_estimate": "estimated H1 2028",
                "impact": "may reclassify our scoring feature as high-risk",
                "owner": "Compliance Steward",
            },
            {
                "entry_id": "REG-2",
                "regulation_title": "California Delete Act enforcement regulations",
                "source": "California Privacy Protection Agency rulemaking docket",
                "source_type": "OFFICIAL_REGULATOR",
                "status": "final rule adopted, enforcement phase-in",
                "effective_date_or_estimate": "2026-08-01",
                "impact": "requires a data-broker deletion mechanism integration",
                "owner": "Data Protection Steward",
            },
        ],
        provenance=PROVENANCE,
    )
    base.update(overrides)
    return base


def _valid_scan(*, record_id: str = "RHS-T-001", **overrides: object):
    return generate_regulatory_horizon_scan(record_id, **_kwargs(**overrides))


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    def test_valid_scan_validates_against_the_real_schema(self):
        self.contracts.validate(RHS_SCHEMA, _valid_scan(), "regulatory horizon scan")

    def test_one_entry_is_a_complete_minimal_scan(self):
        scan = generate_regulatory_horizon_scan(
            "RHS-T-002",
            entries=[
                {
                    "entry_id": "REG-1",
                    "regulation_title": "d1",
                    "source": "s1",
                    "source_type": "OFFICIAL_GOVERNMENT",
                    "status": "proposed",
                    "effective_date_or_estimate": "TBD",
                    "impact": "i1",
                    "owner": "o1",
                }
            ],
            provenance=PROVENANCE,
        )
        self.contracts.validate(RHS_SCHEMA, scan, "minimal complete scan")

    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        resolved = live.resolve([METHOD_ID])
        self.assertIsNone(resolved["blocked"])

    def test_invoke_through_the_catalog_runs_the_real_implementation(self):
        live = MethodCatalog.from_spec_root(self.spec_root)
        descriptor, scan = live.invoke(METHOD_ID, generate_regulatory_horizon_scan, "RHS-T-INVOKE", **_kwargs())
        self.assertEqual(descriptor["ref"], METHOD_ID)
        self.assertEqual(descriptor["path"], "methods/contracts/jurisdiction.regulatory_horizon_scan.contract.yaml")
        self.assertEqual(scan["id"], "RHS-T-INVOKE")

    def test_empty_catalog_blocks_the_method_the_same_way_it_blocks_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)

    def test_schema_rejects_an_unknown_top_level_key(self):
        scan = _valid_scan()
        scan["approved"] = True
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RHS_SCHEMA, scan, "scan with a smuggled top-level key")

    def test_schema_rejects_invalid_source_type_value(self):
        scan = _valid_scan()
        scan["entries"][0]["source_type"] = "BLOG_POST"
        with self.assertRaises(SchemaValidationError):
            self.contracts.validate(RHS_SCHEMA, scan, "scan with an invalid source_type")

    def test_contract_yaml_validates_against_method_schema(self):
        contract_path = self.spec_root / "methods" / "contracts" / "jurisdiction.regulatory_horizon_scan.contract.yaml"
        instance = yaml.safe_load(contract_path.read_text(encoding="utf-8"))
        self.contracts.validate("ai-lego://specs/cognitive/method.schema.yaml", instance, "jurisdiction.regulatory_horizon_scan contract")


class EntryCountTests(unittest.TestCase):
    def test_zero_entries_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_EMPTY_ENTRIES"):
            generate_regulatory_horizon_scan("RHS-T-003", entries=[], provenance=PROVENANCE)

    def test_duplicate_entry_id_is_refused(self):
        kwargs = _kwargs()
        kwargs["entries"].append(dict(kwargs["entries"][0]))
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_DUPLICATE_ENTRY_ID"):
            generate_regulatory_horizon_scan("RHS-T-004", **kwargs)


class OfficialSourceTests(unittest.TestCase):
    """Atlas L939's own 'official source' pipeline stage -- source_type restricted to a closed official-channel set."""

    def test_news_article_source_type_is_refused(self):
        kwargs = _kwargs()
        kwargs["entries"][0]["source_type"] = "NEWS_ARTICLE"
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_UNOFFICIAL_SOURCE"):
            generate_regulatory_horizon_scan("RHS-T-005", **kwargs)

    def test_empty_source_type_is_refused(self):
        kwargs = _kwargs()
        kwargs["entries"][0]["source_type"] = ""
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_UNOFFICIAL_SOURCE"):
            generate_regulatory_horizon_scan("RHS-T-006", **kwargs)

    def test_all_three_official_source_types_are_legal(self):
        for source_type in ("OFFICIAL_GOVERNMENT", "OFFICIAL_REGULATOR", "OFFICIAL_LEGISLATIVE_RECORD"):
            with self.subTest(source_type=source_type):
                kwargs = _kwargs()
                kwargs["entries"][0]["source_type"] = source_type
                scan = generate_regulatory_horizon_scan("RHS-T-007", **kwargs)
                self.assertEqual(scan["entries"][0]["source_type"], source_type)


class EntryCompletenessTests(unittest.TestCase):
    def test_missing_status_is_refused(self):
        kwargs = _kwargs()
        kwargs["entries"][0]["status"] = ""
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_INCOMPLETE_ENTRY"):
            generate_regulatory_horizon_scan("RHS-T-008", **kwargs)

    def test_missing_effective_date_or_estimate_is_refused(self):
        kwargs = _kwargs()
        kwargs["entries"][0]["effective_date_or_estimate"] = None
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_INCOMPLETE_ENTRY"):
            generate_regulatory_horizon_scan("RHS-T-009", **kwargs)

    def test_missing_impact_is_refused(self):
        kwargs = _kwargs()
        kwargs["entries"][0]["impact"] = "   "
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_INCOMPLETE_ENTRY"):
            generate_regulatory_horizon_scan("RHS-T-010", **kwargs)

    def test_missing_owner_is_refused(self):
        kwargs = _kwargs()
        del kwargs["entries"][0]["owner"]
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_INCOMPLETE_ENTRY"):
            generate_regulatory_horizon_scan("RHS-T-011", **kwargs)


class NestedContainerAliasingTests(unittest.TestCase):
    def test_mutating_caller_input_after_construction_does_not_affect_the_returned_record(self):
        kwargs = _kwargs()
        scan = generate_regulatory_horizon_scan("RHS-T-012", **kwargs)
        kwargs["entries"][0]["owner"] = "Someone Else Entirely"
        self.assertEqual(scan["entries"][0]["owner"], "Compliance Steward")
        self.assertIsNot(scan["entries"], kwargs["entries"])


class GateIndependenceTests(unittest.TestCase):
    def test_gates_pass_a_genuinely_valid_hand_built_scan(self):
        results = evaluate_regulatory_horizon_scan_gates(_valid_scan(), "test", "2026-09-12T00:00:00Z")
        self.assertTrue(all_gates_pass(results))

    def test_official_source_gate_catches_hand_tampered_unofficial_source(self):
        record = copy.deepcopy(_valid_scan())
        record["entries"][0]["source_type"] = "BLOG_POST"
        gate = evaluate_official_source_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_official_source_gate_passes_a_genuinely_official_scan(self):
        gate = evaluate_official_source_gate(_valid_scan(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_entry_completeness_gate_catches_hand_tampered_empty_impact(self):
        record = copy.deepcopy(_valid_scan())
        record["entries"][0]["impact"] = ""
        gate = evaluate_entry_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_entry_completeness_gate_catches_hand_tampered_duplicate_entry_id(self):
        record = copy.deepcopy(_valid_scan())
        record["entries"].append(dict(record["entries"][0]))
        gate = evaluate_entry_completeness_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_gates_fail_closed_on_every_top_level_junk_type(self):
        for bad in (None, "not-a-dict", [], True, 42, 3.14, {}, {"junk": 1}):
            with self.subTest(bad=bad):
                results = evaluate_regulatory_horizon_scan_gates(bad, "test", "2026-09-12T00:00:00Z")
                self.assertFalse(all_gates_pass(results))
                self.assertTrue(all(r["status"] == "FAIL" for r in results))


class ProvenanceGateTests(unittest.TestCase):
    def test_provenance_required_gate_passes_when_valid(self):
        gate = evaluate_provenance_required_gate(_valid_scan(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "PASS")

    def test_provenance_required_gate_fails_when_provenance_invalid(self):
        record = copy.deepcopy(_valid_scan())
        record["provenance"] = None
        gate = evaluate_provenance_required_gate(record, "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")

    def test_provenance_required_gate_fails_on_non_dict_record(self):
        gate = evaluate_provenance_required_gate("not-a-dict", "test", "2026-09-12T00:00:00Z")
        self.assertEqual(gate["status"], "FAIL")


class HelperFunctionTests(unittest.TestCase):
    def test_record_id_prefix_constant(self):
        self.assertEqual(RECORD_ID_PREFIX, "RHS-")

    def test_invalid_id_missing_prefix_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_INVALID_ID"):
            _valid_scan(record_id="WRONG-PREFIX-001")

    def test_invalid_version_non_string_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_INVALID_VERSION"):
            generate_regulatory_horizon_scan("RHS-T-013", **{**_kwargs(), "version": 1})  # type: ignore[arg-type]

    def test_invalid_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "REGHORIZON_INVALID_PROVENANCE"):
            _valid_scan(provenance={"epistemic_type": "NOT_REAL"})

    def test_all_gates_pass_true_when_all_pass(self):
        self.assertTrue(all_gates_pass([{"status": "PASS"}, {"status": "NOT_APPLICABLE"}]))

    def test_all_gates_pass_false_when_one_fails(self):
        self.assertFalse(all_gates_pass([{"status": "PASS"}, {"status": "FAIL"}]))

    def test_method_id_constant(self):
        self.assertEqual(METHOD_ID, "jurisdiction.regulatory_horizon_scan")

    def test_evaluate_gates_returns_three_gates_in_order(self):
        results = evaluate_regulatory_horizon_scan_gates(_valid_scan(), "test", "2026-09-12T00:00:00Z")
        self.assertEqual([r["gate_id"] for r in results], ["provenance_required", "official_source", "entry_completeness"])

    def test_builder_does_not_leak_extra_top_level_keys(self):
        scan = _valid_scan()
        self.assertEqual(
            set(scan.keys()),
            {"id", "version", "generated_by_method", "entries", "provenance"},
        )


class ProvenanceAliasingRegressionTests(unittest.TestCase):
    """This corpus's own ``foresight.cross_impact_analysis`` module docstring records that 11 of a prior
    14-method batch returned the caller's own ``provenance`` dict BY REFERENCE rather than a copy -- mutating
    the caller's dict after construction silently rewrote the already-returned 'validated' record's provenance
    too, with no exception. This method's builder ``copy.deepcopy``s provenance at the return statement; this
    test proves the fix and guards against a future regression."""

    def test_returned_record_does_not_alias_the_callers_provenance_dict(self):
        base = _valid_scan()
        provenance = make_provenance("AI_INFERENCE", "AI_GENERATED")
        record = generate_regulatory_horizon_scan(base["id"], base["entries"], provenance)
        self.assertIsNot(record["provenance"], provenance)
        provenance["epistemic_type"] = "MUTATED_AFTER_RETURN"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")


if __name__ == "__main__":
    unittest.main()
