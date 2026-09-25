"""Mutation-style tests for ``root_cause.change_analysis`` (seventh member of the `root_cause` family built,
F05 -- a flat, ranked LIST of discrete before/after deltas against one observed fault, deliberately NOT a
re-skin of `causal.dag`'s causal-role GRAPH shape; see the module's own docstring for the full due-diligence
read). Two-layer discipline proven for BOTH headline invariants:

1. The misuse guard (``CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD``) -- Atlas F05 L441's own "變更不等於
   因果" (change is not the same as causation), operationalized as a denylist of causal-claim field names
   checked on raw dicts, on TOP of the schema's own structural incapacity (no such field is even defined).
2. Before/after completeness (``CHANGEANALYSIS_INCOMPLETE_CHANGE_ENTRY``) and its own genuinely distinct
   sibling, non-degeneracy (``CHANGEANALYSIS_DEGENERATE_CHANGE_ENTRY``) -- every changes[] entry must carry
   both a before_state and an after_state, and the two must actually differ.

Each is checked at CONSTRUCTION (raises before a malformed record is ever built) and independently
RE-DERIVED at the GATE (a hand-tampered copy of an already-valid record must still be caught -- the gate
never trusts a stored value). The misuse guard's RECORD-level half is a genuinely ASYMMETRIC case: it can
ONLY be exercised by hand-tampering, never through the real constructor (see
``GateMutationTests.test_hand_tampered_top_level_root_cause_key_fails_the_gate``)."""

from __future__ import annotations

import copy
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.root_cause.change_analysis import (
    FORBIDDEN_CAUSAL_CLAIM_KEYS,
    METHOD_ID,
    RECORD_ID_PREFIX,
    VALID_CORRELATION_STRENGTH,
    VALID_TEMPORAL_PROXIMITY,
    all_gates_pass,
    change_entry,
    evaluate_change_analysis_gates,
    evaluate_change_analysis_integrity_gate,
    evaluate_evidence_labeling_required_gate,
    evaluate_provenance_required_gate,
    generate_change_analysis_record,
    rank_changes_by_correlation,
)
from ai_lego.platform.ai_execution.method_resolver import METHOD_RESOLUTION_BLOCKED, MethodCatalog
from tests.unit.method_testkit import shared_method_catalog

RECORD_SCHEMA = "ai-lego://specs/cognitive/typed-objects/change-analysis-record.schema.yaml"
TS = "2026-09-07T00:00:00Z"


def _prov():
    return make_provenance("HUMAN_OPINION", "HUMAN_ORIGINAL")


def _baseline():
    return {"before_state": "system healthy", "after_state": "system faulty"}


def _raw_change(**overrides):
    base = {
        "id": "CA-T-C1",
        "description": "a config value",
        "before_state": "before-value",
        "after_state": "after-value",
        "temporal_proximity": "IMMEDIATELY_BEFORE",
        "correlation_strength": "STRONG",
        "provenance": _prov(),
    }
    base.update(overrides)
    return base


def _minimal_changes():
    return [change_entry("CA-T-C1", "a config value", "before-value", "after-value", "IMMEDIATELY_BEFORE", "STRONG", _prov())]


def _build(
    record_id="CHANGEANALYSIS-T-001",
    system_under_analysis="a system",
    fault_description="a fault",
    baseline=None,
    changes=None,
    version="1.0.0",
):
    return generate_change_analysis_record(
        record_id,
        system_under_analysis,
        fault_description,
        _baseline() if baseline is None else baseline,
        _minimal_changes() if changes is None else changes,
        _prov(),
        version=version,
    )


def _valid_record():
    return _build()


def _incident_baseline():
    return {"before_state": "checkout error rate 0.1%, p99 latency 220ms", "after_state": "checkout error rate 40%, p99 latency 4100ms"}


def _incident_changes():
    return [
        change_entry(
            "CA-001-C1",
            "nginx upstream_timeout config value",
            "30s",
            "5s",
            "IMMEDIATELY_BEFORE",
            "STRONG",
            make_provenance("EVIDENCE", "HUMAN_APPROVED"),
            supporting_evidence_refs=["E-701"],
        ),
        change_entry("CA-001-C2", "on-call engineer roster rotation", "engineer A on call", "engineer B on call", "DISTANT_BEFORE", "NONE", _prov()),
    ]


def _incident_record():
    return _build(
        record_id="CHANGEANALYSIS-T-INCIDENT",
        system_under_analysis="checkout-service",
        fault_description="Checkout error rate spiked from 0.1% to 40% starting 14:02 UTC",
        baseline=_incident_baseline(),
        changes=_incident_changes(),
    )


class RankChangesByCorrelationComputeTests(unittest.TestCase):
    """Pure compute tests for ``rank_changes_by_correlation`` -- hand-computed expected values, independent
    of the module's own shape validation."""

    def test_higher_correlation_strength_ranks_first(self):
        record = _incident_record()
        self.assertEqual(rank_changes_by_correlation(record), ["CA-001-C1", "CA-001-C2"])

    def test_equal_correlation_broken_by_temporal_proximity_closer_first(self):
        changes = [
            change_entry("C1", "d1", "b1", "a1", "DISTANT_BEFORE", "STRONG", _prov()),
            change_entry("C2", "d2", "b2", "a2", "IMMEDIATELY_BEFORE", "STRONG", _prov()),
        ]
        record = _build(changes=changes)
        self.assertEqual(rank_changes_by_correlation(record), ["C2", "C1"])

    def test_concurrent_ranks_above_immediately_before(self):
        changes = [
            change_entry("C1", "d1", "b1", "a1", "IMMEDIATELY_BEFORE", "STRONG", _prov()),
            change_entry("C2", "d2", "b2", "a2", "CONCURRENT", "STRONG", _prov()),
        ]
        record = _build(changes=changes)
        self.assertEqual(rank_changes_by_correlation(record), ["C2", "C1"])

    def test_after_fault_ranks_last_even_with_strong_correlation(self):
        changes = [
            change_entry("C1", "d1", "b1", "a1", "AFTER_FAULT", "STRONG", _prov()),
            change_entry("C2", "d2", "b2", "a2", "DISTANT_BEFORE", "WEAK", _prov()),
        ]
        record = _build(changes=changes)
        self.assertEqual(rank_changes_by_correlation(record), ["C2", "C1"])

    def test_full_tie_broken_by_id_lexicographically(self):
        changes = [
            change_entry("C-B", "d1", "b1", "a1", "CONCURRENT", "STRONG", _prov()),
            change_entry("C-A", "d2", "b2", "a2", "CONCURRENT", "STRONG", _prov()),
        ]
        record = _build(changes=changes)
        self.assertEqual(rank_changes_by_correlation(record), ["C-A", "C-B"])

    def test_ranking_does_not_mutate_the_record(self):
        record = _incident_record()
        before = copy.deepcopy(record)
        rank_changes_by_correlation(record)
        self.assertEqual(record, before)

    def test_ranking_returns_all_change_ids_exactly_once(self):
        record = _incident_record()
        ranked = rank_changes_by_correlation(record)
        self.assertEqual(sorted(ranked), sorted(c["id"] for c in record["changes"]))

    def test_single_change_record_ranks_trivially(self):
        record = _valid_record()
        self.assertEqual(rank_changes_by_correlation(record), ["CA-T-C1"])


class SpecConformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec_root = resolve_spec_root()
        cls.contracts = SchemaContracts(cls.spec_root)

    # --- happy path / schema conformance ---
    def test_minimal_record_validates_against_the_real_schema(self):
        self.contracts.validate(RECORD_SCHEMA, _valid_record(), "minimal change analysis record")

    def test_incident_scenario_record_validates_and_all_gates_pass(self):
        record = _incident_record()
        self.contracts.validate(RECORD_SCHEMA, record, "checkout-service incident change analysis record")
        self.assertTrue(all_gates_pass(evaluate_change_analysis_gates(record, "test", TS)))

    def test_builder_round_trips_generated_by_method_and_version(self):
        record = generate_change_analysis_record(
            "CHANGEANALYSIS-T-005", "s", "f", _baseline(), _minimal_changes(), _prov(), version="2.3.4", generated_by_method="root_cause.change_analysis@test"
        )
        self.assertEqual(record["generated_by_method"], "root_cause.change_analysis@test")
        self.assertEqual(record["version"], "2.3.4")
        self.assertEqual(_valid_record()["generated_by_method"], METHOD_ID)

    def test_schema_own_examples_validate_and_pass_every_gate(self):
        import yaml

        schema_path = self.spec_root / "specs" / "cognitive" / "typed-objects" / "change-analysis-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        examples = schema_doc.get("examples") or []
        self.assertTrue(examples, "change-analysis-record.schema.yaml has no examples to check")
        for example in examples:
            with self.subTest(description=example.get("description")):
                value = example["value"]
                self.contracts.validate(RECORD_SCHEMA, value, f"schema example: {example.get('description')}")
                self.assertTrue(all_gates_pass(evaluate_change_analysis_gates(value, "test", TS)), f"schema example failed a real gate: {example.get('description')}")

    # --- id / version / system_under_analysis / fault_description ---
    def test_empty_record_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_RECORD_ID"):
            _build(record_id="")

    def test_record_id_without_changeanalysis_prefix_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_RECORD_ID"):
            _build(record_id="FAULTTREE-1")

    def test_non_string_version_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_VERSION"):
            generate_change_analysis_record("CHANGEANALYSIS-T-V1", "s", "f", _baseline(), _minimal_changes(), _prov(), version=123)

    def test_empty_system_under_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_EMPTY_RECORD_FIELD"):
            _build(system_under_analysis="")

    def test_whitespace_only_system_under_analysis_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_EMPTY_RECORD_FIELD"):
            _build(system_under_analysis="   ")

    def test_empty_fault_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_EMPTY_RECORD_FIELD"):
            _build(fault_description="")

    def test_whitespace_only_fault_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_EMPTY_RECORD_FIELD"):
            _build(fault_description="\t")

    # --- baseline shape ---
    def test_baseline_missing_after_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_BASELINE"):
            _build(baseline={"before_state": "b"})

    def test_baseline_missing_before_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_BASELINE"):
            _build(baseline={"after_state": "a"})

    def test_baseline_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_BASELINE"):
            _build(baseline={"before_state": "b", "after_state": "a", "notes": "extra"})

    def test_baseline_non_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_BASELINE"):
            _build(baseline="not a dict")

    def test_baseline_empty_before_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_BASELINE"):
            _build(baseline={"before_state": "", "after_state": "a"})

    def test_baseline_empty_after_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_BASELINE"):
            _build(baseline={"before_state": "b", "after_state": "   "})

    # --- changes list shape ---
    def test_empty_changes_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGES"):
            _build(changes=[])

    def test_changes_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGES"):
            _build(changes="not a list")

    # --- change entry generic shape (key present vs missing entirely) ---
    def test_change_entry_missing_description_key_is_refused(self):
        c = _raw_change()
        del c["description"]
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[c])

    def test_change_entry_missing_temporal_proximity_key_is_refused(self):
        c = _raw_change()
        del c["temporal_proximity"]
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[c])

    def test_change_entry_missing_correlation_strength_key_is_refused(self):
        c = _raw_change()
        del c["correlation_strength"]
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[c])

    def test_change_entry_missing_provenance_key_is_refused(self):
        c = _raw_change()
        del c["provenance"]
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[c])

    def test_change_entry_missing_before_state_key_is_refused(self):
        c = _raw_change()
        del c["before_state"]
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[c])

    def test_change_entry_missing_after_state_key_is_refused(self):
        c = _raw_change()
        del c["after_state"]
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[c])

    def test_change_entry_with_extra_key_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[_raw_change(severity="high")])

    def test_change_entry_empty_id_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[_raw_change(id="")])

    def test_change_entry_empty_description_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[_raw_change(description="")])

    def test_change_entry_non_string_before_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[_raw_change(before_state=30)])

    def test_change_entry_non_string_after_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[_raw_change(after_state=5)])

    def test_change_entry_illegal_temporal_proximity_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[_raw_change(temporal_proximity="YESTERDAY")])

    def test_change_entry_illegal_correlation_strength_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[_raw_change(correlation_strength="DEFINITELY")])

    def test_change_entry_non_dict_provenance_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[_raw_change(provenance="not a dict")])

    def test_change_entry_supporting_evidence_refs_non_list_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=[_raw_change(supporting_evidence_refs="E-1")])

    def test_change_entry_supporting_evidence_refs_omitted_is_legal(self):
        record = _build(changes=[change_entry("CA-T-C1", "d", "b", "a", "IMMEDIATELY_BEFORE", "STRONG", _prov())])
        self.assertNotIn("supporting_evidence_refs", record["changes"][0])
        self.contracts.validate(RECORD_SCHEMA, record, "record with omitted supporting_evidence_refs")

    def test_change_entry_non_dict_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INVALID_CHANGE_ENTRY"):
            _build(changes=["not a dict"])

    # --- invariant #1: misuse guard, at CONSTRUCTION ---
    def test_change_entry_with_caused_by_key_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD"):
            _build(changes=[_raw_change(caused_by="CA-T-C1")])

    def test_change_entry_with_root_cause_key_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD"):
            _build(changes=[_raw_change(root_cause="the deploy")])

    def test_change_entry_with_confirmed_cause_key_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD"):
            _build(changes=[_raw_change(confirmed_cause=True)])

    def test_change_entry_with_causal_link_key_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD"):
            _build(changes=[_raw_change(causal_link="CA-T-C1")])

    def test_change_entry_with_is_cause_key_is_refused_at_construction(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD"):
            _build(changes=[_raw_change(is_cause=True)])

    def test_forbidden_causal_claim_check_runs_before_generic_shape_check(self):
        """The misuse-guard check must fire FIRST, with its own diagnostic message -- even when the SAME
        entry is ALSO shape-invalid for an unrelated reason (missing description here)."""
        c = _raw_change()
        del c["description"]
        c["caused_by"] = "something"
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_FORBIDDEN_CAUSAL_CLAIM_FIELD"):
            _build(changes=[c])

    def test_change_entry_helper_cannot_produce_a_forbidden_key(self):
        c = change_entry("CA-X", "d", "b", "a", "CONCURRENT", "WEAK", _prov())
        self.assertEqual(set(c.keys()) & FORBIDDEN_CAUSAL_CLAIM_KEYS, set())

    # --- invariant #2: before/after completeness + non-degeneracy, at CONSTRUCTION ---
    def test_change_entry_empty_before_state_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INCOMPLETE_CHANGE_ENTRY"):
            _build(changes=[_raw_change(before_state="")])

    def test_change_entry_whitespace_only_before_state_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INCOMPLETE_CHANGE_ENTRY"):
            _build(changes=[_raw_change(before_state="   ")])

    def test_change_entry_empty_after_state_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INCOMPLETE_CHANGE_ENTRY"):
            _build(changes=[_raw_change(after_state="")])

    def test_change_entry_whitespace_only_after_state_value_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_INCOMPLETE_CHANGE_ENTRY"):
            _build(changes=[_raw_change(after_state="\n")])

    def test_change_entry_identical_before_and_after_state_is_refused(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_DEGENERATE_CHANGE_ENTRY"):
            _build(changes=[_raw_change(before_state="30s", after_state="30s")])

    def test_change_entry_before_after_differing_only_by_whitespace_is_refused_as_degenerate(self):
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_DEGENERATE_CHANGE_ENTRY"):
            _build(changes=[_raw_change(before_state="30s", after_state="30s ")])

    def test_change_entry_before_after_legitimately_different_is_legal(self):
        record = _build(changes=[_raw_change(before_state="30s", after_state="5s")])
        self.contracts.validate(RECORD_SCHEMA, record, "record with a legitimately different before/after pair")

    # --- duplicate id ---
    def test_duplicate_change_id_is_refused(self):
        changes = [
            change_entry("CA-DUP", "d1", "b1", "a1", "IMMEDIATELY_BEFORE", "STRONG", _prov()),
            change_entry("CA-DUP", "d2", "b2", "a2", "DISTANT_BEFORE", "WEAK", _prov()),
        ]
        with self.assertRaisesRegex(InvariantViolation, "CHANGEANALYSIS_DUPLICATE_CHANGE_ID"):
            _build(changes=changes)

    # --- change_entry() convenience constructor ---
    def test_change_entry_helper_omits_supporting_evidence_refs_when_not_given(self):
        c = change_entry("CA-X", "d", "b", "a", "CONCURRENT", "WEAK", _prov())
        self.assertNotIn("supporting_evidence_refs", c)

    def test_change_entry_helper_includes_supporting_evidence_refs_when_given(self):
        c = change_entry("CA-X", "d", "b", "a", "CONCURRENT", "WEAK", _prov(), supporting_evidence_refs=["E-1", "E-2"])
        self.assertEqual(c["supporting_evidence_refs"], ["E-1", "E-2"])

    # --- copy-on-construct discipline ---
    def test_mutating_the_callers_own_changes_list_after_construction_does_not_affect_the_stored_record(self):
        changes = _minimal_changes()
        record = _build(changes=changes)
        changes[0]["description"] = "MUTATED"
        changes.append(change_entry("CA-EXTRA", "d", "b", "a", "CONCURRENT", "WEAK", _prov()))
        self.assertEqual(record["changes"][0]["description"], "a config value")
        self.assertEqual(len(record["changes"]), 1)

    def test_mutating_the_callers_own_baseline_after_construction_does_not_affect_the_stored_record(self):
        baseline = _baseline()
        record = _build(baseline=baseline)
        baseline["before_state"] = "MUTATED"
        self.assertEqual(record["baseline"]["before_state"], "system healthy")

    def test_mutating_the_callers_own_supporting_evidence_refs_list_after_construction_does_not_affect_the_stored_record(self):
        refs = ["E-1"]
        changes = [change_entry("CA-T-C1", "d", "b", "a", "IMMEDIATELY_BEFORE", "STRONG", _prov(), supporting_evidence_refs=refs)]
        record = _build(changes=changes)
        refs.append("E-2")
        self.assertEqual(record["changes"][0]["supporting_evidence_refs"], ["E-1"])

    def test_provenance_is_deliberately_aliased_not_rebuilt(self):
        provenance = _prov()
        record = generate_change_analysis_record("CHANGEANALYSIS-T-011", "s", "f", _baseline(), _minimal_changes(), provenance)
        provenance["epistemic_type"] = "AI_INFERENCE"
        self.assertEqual(record["provenance"]["epistemic_type"], "AI_INFERENCE")

    # --- method resolution ---
    def test_method_resolves_through_the_unmodified_shared_resolver(self):
        live = shared_method_catalog(self.spec_root)
        self.assertIsNone(live.resolve([METHOD_ID])["blocked"])

    def test_empty_catalog_blocks_change_analysis_the_same_way_it_blocks_the_other_slices(self):
        empty = MethodCatalog.empty("snapshot:no-method-contracts")
        with self.assertRaisesRegex(InvariantViolation, f"{METHOD_RESOLUTION_BLOCKED}.*{METHOD_ID}"):
            empty.require(METHOD_ID)


class GateMutationTests(unittest.TestCase):
    def _gate_result(self, record):
        return evaluate_change_analysis_integrity_gate(record, "test", TS)

    def test_valid_record_passes_all_three_gates(self):
        results = evaluate_change_analysis_gates(_valid_record(), "test", TS)
        self.assertEqual({r["gate_id"] for r in results}, {"provenance_required", "evidence_labeling_required", "change_analysis_integrity"})
        self.assertTrue(all_gates_pass(results))

    def test_incident_record_passes_all_three_gates(self):
        self.assertTrue(all_gates_pass(evaluate_change_analysis_gates(_incident_record(), "test", TS)))

    def test_all_gates_pass_returns_false_when_a_gate_fails(self):
        record = _valid_record()
        record["id"] = ""
        self.assertFalse(all_gates_pass(evaluate_change_analysis_gates(record, "test", TS)))

    # --- hand-tampered shape fields fail the gate ---
    def test_hand_tampered_empty_id_fails_the_gate(self):
        record = _valid_record()
        record["id"] = ""
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], f"id missing, empty, or not prefixed {RECORD_ID_PREFIX!r}")

    def test_hand_tampered_non_string_version_fails_the_gate(self):
        record = _valid_record()
        record["version"] = 123
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "version missing or not a string")

    def test_hand_tampered_empty_system_under_analysis_fails_the_gate(self):
        record = _valid_record()
        record["system_under_analysis"] = "  "
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "system_under_analysis missing or empty")

    def test_hand_tampered_empty_fault_description_fails_the_gate(self):
        record = _valid_record()
        record["fault_description"] = ""
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "fault_description missing or empty")

    def test_hand_tampered_malformed_baseline_fails_the_gate(self):
        record = _valid_record()
        del record["baseline"]["after_state"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "baseline missing, malformed, or has an empty before_state/after_state")

    def test_hand_tampered_empty_changes_fails_the_gate(self):
        record = _valid_record()
        record["changes"] = []
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "changes missing, empty, or not a list")

    def test_hand_tampered_malformed_change_entry_fails_the_gate(self):
        record = _valid_record()
        record["changes"][0]["temporal_proximity"] = "YESTERDAY"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "a changes[] entry is malformed (unknown/missing key, wrong type, or illegal enum value)")

    def test_hand_tampered_duplicate_change_id_fails_the_gate(self):
        record = _incident_record()
        record["changes"][1]["id"] = record["changes"][0]["id"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "duplicate change id")

    # --- invariant #1, hand-tampered at the GATE layer only (the record-level case is UNREACHABLE through
    # the real constructor at all -- see module docstring). The gate's top-level check is now an exact
    # closed key set (critic finding, 2026-09-07), so the evidence reason names an unknown key generically --
    # it still catches every denylisted spelling, just no longer under the old denylist-only reason text. ---
    def test_hand_tampered_top_level_root_cause_key_fails_the_gate(self):
        record = _valid_record()
        record["root_cause"] = "CA-T-C1"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "record carries an unknown top-level key (may be a differently-spelled causal claim, or any other unrecognized field)")
        self.assertEqual(result["evidence"][0]["keys"], ["root_cause"])

    def test_hand_tampered_top_level_caused_by_key_fails_the_gate(self):
        record = _valid_record()
        record["caused_by"] = "the deploy"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "record carries an unknown top-level key (may be a differently-spelled causal claim, or any other unrecognized field)")

    def test_hand_tampered_top_level_camelcase_causedby_key_fails_the_gate(self):
        """Regression guard for the critic's exact 2026-09-07 finding: a differently-spelled causal claim
        (camelCase, not on the literal denylist) previously slipped past this gate silently when called
        standalone. The closed key set now rejects it as an unknown key, independent of spelling."""
        record = _valid_record()
        record["causedBy"] = "the deploy"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["keys"], ["causedBy"])

    def test_hand_tampered_top_level_unlisted_plural_root_causes_key_fails_the_gate(self):
        """Second regression guard for the same finding: an unlisted plural variant, also not on the
        literal denylist."""
        record = _valid_record()
        record["root_causes"] = ["CA-T-C1"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["keys"], ["root_causes"])

    def test_hand_tampered_change_entry_causal_link_key_fails_the_gate(self):
        record = _valid_record()
        record["changes"][0]["causal_link"] = "CA-T-C1"
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "a changes[] entry carries a denylisted causal-claim field")
        self.assertEqual(result["evidence"][0]["keys"], ["causal_link"])

    # --- invariant #2, hand-tampered at the GATE layer only ---
    def test_hand_tampered_empty_after_state_fails_the_gate(self):
        record = _valid_record()
        record["changes"][0]["after_state"] = ""
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "a changes[] entry is missing a non-empty before_state or after_state")

    def test_hand_tampered_empty_before_state_fails_the_gate(self):
        record = _valid_record()
        record["changes"][0]["before_state"] = "   "
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "a changes[] entry is missing a non-empty before_state or after_state")

    def test_hand_tampered_degenerate_before_after_fails_the_gate(self):
        """The core re-derived-not-trusted invariant for completeness: a copy of an already-VALID record,
        with one entry's own stored after_state hand-tampered to equal before_state afterward, must be
        caught by real re-derivation, not accepted because the record merely looked well-formed when built."""
        record = _incident_record()
        self.assertNotEqual(record["changes"][0]["before_state"], record["changes"][0]["after_state"])
        record["changes"][0]["after_state"] = record["changes"][0]["before_state"]
        result = self._gate_result(record)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["reason"], "a changes[] entry has identical before_state and after_state (not an actual change)")

    # --- gate evidence content ---
    def test_integrity_gate_evidence_reports_change_count_and_ranking(self):
        result = self._gate_result(_incident_record())
        self.assertEqual(result["status"], "PASS")
        evidence = result["evidence"][0]
        self.assertEqual(evidence["change_count"], 2)
        self.assertEqual(evidence["correlation_ranked_ids"], ["CA-001-C1", "CA-001-C2"])

    def test_gate_does_not_mutate_the_record_it_evaluates(self):
        record = _incident_record()
        before = copy.deepcopy(record)
        self._gate_result(record)
        self.assertEqual(record, before)

    # --- fail closed on malformed input ---
    def test_non_dict_record_fails_all_gates_not_a_crash(self):
        for bad_record in (None, "not-a-dict", [], 42):
            with self.subTest(bad_record=bad_record):
                self.assertEqual(self._gate_result(bad_record)["status"], "FAIL")
                self.assertEqual(evaluate_provenance_required_gate(bad_record, "test", TS)["status"], "FAIL")
                self.assertEqual(evaluate_evidence_labeling_required_gate(bad_record, "test", TS)["status"], "FAIL")

    def test_missing_record_provenance_fails_the_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["provenance"] = None
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")

    def test_non_list_changes_fails_provenance_gate_not_a_crash(self):
        record = _valid_record()
        record["changes"] = "not-a-list"
        self.assertEqual(evaluate_provenance_required_gate(record, "test", TS)["status"], "FAIL")

    def test_non_list_changes_fails_evidence_labeling_gate_not_a_crash(self):
        record = _valid_record()
        record["changes"] = "not-a-list"
        self.assertEqual(evaluate_evidence_labeling_required_gate(record, "test", TS)["status"], "FAIL")

    def test_non_dict_change_entry_fails_evidence_labeling_gate_reports_problem(self):
        record = _valid_record()
        record["changes"].append(None)
        result = evaluate_evidence_labeling_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn({"id": None, "reason": "entry is not a dict"}, result["evidence"][0]["problems"])

    # --- evidence labeling gate specifics ---
    def test_evidence_labeled_entry_without_supporting_refs_fails_evidence_labeling_gate(self):
        record = _build(changes=[_raw_change(provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"))])
        result = evaluate_evidence_labeling_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["problems"], [{"id": "CA-T-C1", "reason": "labeled EVIDENCE but cites no supporting_evidence_refs"}])

    def test_evidence_labeled_entry_with_supporting_refs_passes_evidence_labeling_gate(self):
        record = _build(changes=[_raw_change(provenance=make_provenance("EVIDENCE", "HUMAN_APPROVED"))])
        record["changes"][0]["supporting_evidence_refs"] = ["E-1"]
        result = evaluate_evidence_labeling_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "PASS")

    def test_non_evidence_labeled_entry_without_refs_still_passes_evidence_labeling_gate(self):
        record = _build(changes=[_raw_change(provenance=make_provenance("HYPOTHESIS", "AI_GENERATED"))])
        result = evaluate_evidence_labeling_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "PASS")

    def test_entry_with_no_epistemic_type_fails_evidence_labeling_gate(self):
        record = _build(changes=[_raw_change(provenance={})])
        result = evaluate_evidence_labeling_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["evidence"][0]["problems"], [{"id": "CA-T-C1", "reason": "no epistemic_type label"}])

    # --- provenance gate specifics ---
    def test_entry_with_invalid_provenance_fails_provenance_gate(self):
        record = _valid_record()
        record["changes"][0]["provenance"] = {"epistemic_type": "NOT_REAL", "authorship_state": "HUMAN_ORIGINAL", "locked": None}
        result = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("CA-T-C1", result["evidence"][0]["invalid_provenance_entry_ids"])

    def test_record_with_invalid_provenance_but_valid_entries_fails_provenance_gate(self):
        record = _valid_record()
        record["provenance"] = None
        result = evaluate_provenance_required_gate(record, "test", TS)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse(result["evidence"][0]["record_provenance_valid"])


class TemporalAndCorrelationVocabularyTests(unittest.TestCase):
    """Sanity checks on the module's own closed vocabularies -- these are compilation inventions (Atlas
    gives no explicit vocabulary here, see the contract's own compilation_decisions), so their exact
    membership is worth pinning down directly."""

    def test_valid_correlation_strength_matches_schema_enum(self):
        import yaml

        schema_path = resolve_spec_root() / "specs" / "cognitive" / "typed-objects" / "change-analysis-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(set(schema_doc["$defs"]["change_entry"]["properties"]["correlation_strength"]["enum"]), set(VALID_CORRELATION_STRENGTH))

    def test_valid_temporal_proximity_matches_schema_enum(self):
        import yaml

        schema_path = resolve_spec_root() / "specs" / "cognitive" / "typed-objects" / "change-analysis-record.schema.yaml"
        schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(set(schema_doc["$defs"]["change_entry"]["properties"]["temporal_proximity"]["enum"]), set(VALID_TEMPORAL_PROXIMITY))

    def test_every_correlation_strength_value_round_trips_through_a_real_record(self):
        for value in sorted(VALID_CORRELATION_STRENGTH):
            with self.subTest(correlation_strength=value):
                record = _build(changes=[_raw_change(correlation_strength=value)])
                contracts = SchemaContracts(resolve_spec_root())
                contracts.validate(RECORD_SCHEMA, record, f"round-trip for correlation_strength={value}")

    def test_every_temporal_proximity_value_round_trips_through_a_real_record(self):
        for value in sorted(VALID_TEMPORAL_PROXIMITY):
            with self.subTest(temporal_proximity=value):
                record = _build(changes=[_raw_change(temporal_proximity=value)])
                contracts = SchemaContracts(resolve_spec_root())
                contracts.validate(RECORD_SCHEMA, record, f"round-trip for temporal_proximity={value}")


if __name__ == "__main__":
    unittest.main()
