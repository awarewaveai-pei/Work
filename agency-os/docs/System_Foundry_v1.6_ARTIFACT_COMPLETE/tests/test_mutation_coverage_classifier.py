"""Regression tests for explain_redundant_edge()/forced_prereq_qids() in
scripts/test_mutation_coverage.py (AGENTS-facing name: the mutation-coverage classifier).

These protect the two logic bugs found by an independent critic review of the classifier itself
(agency-os/TASKS.md System Foundry v1.6, "explain_redundant_edge() 分類器的閉包計算與 any gate
處理都有真實邏輯缺陷"), using fixture cases mirroring the critic's own constructed counterexamples
rather than depending on the live, frequently-edited catalog/questionnaire/rule JSON files:

1. Closure circularity (shapes checking "is dep_id reachable via some OTHER path"): computing that
   alternate path over the FULL, unmodified graph lets it loop back out through cap_id's own
   requires list and "discover" dep_id via the very edge under test. Concrete real counterexample
   at review time (2026-09-06): CAP-PAYMENTS -> CAP-COMMERCIAL and CAP-REFUNDS -> CAP-PAYMENTS
   were empirically load-bearing then, but the classifier could "explain" them as redundant using
   a path through themselves -- a separate, concurrently-landing catalog change may since have
   made one or both of these two specific edges genuinely redundant for an unrelated reason, so
   this is cited as the historical motivation, not a live assertion about their current status
   (the synthetic TEST-* fixtures below, not these real ids, are what the tests actually check). A
   sibling flaw in the same area: a DER-* capability derived by TWO different
   derivation rules with two different when_capability triggers (DER-AI-AUTHORITY/DER-AI-TOOLS,
   both derived by DERIVE-AI-WRITE when_capability=CAP-AI-WRITE and DERIVE-AI-EXT
   when_capability=CAP-AI-EXTERNAL) got a false "single trigger" explanation just because ONE of
   the two triggers happened to equal dep_id.

2. `forced_prereq_qids()` only walked `{all:[...]}` and single `{question,equals}` active_when
   shapes; a `{any:[...]}` branch was skipped entirely (not even at the immediate/direct layer),
   so any capability whose only driving question sits behind an `any` gate fell through to
   "unexplained" -- a hard FAIL -- even when genuinely, safely redundant.

None of these tests touch the real catalog/questionnaire/rule JSON files on disk; synthetic
TEST-* ids are injected directly into the already-loaded module-level dicts/lists in
test_mutation_coverage and removed again in tearDown.
"""
from pathlib import Path
import sys, unittest
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import test_mutation_coverage as tmc


class ClosureExcludesEdgeUnderTestTests(unittest.TestCase):
    """Bug 1a: closure_requires() must exclude the specific edge under test, not search the full,
    unmodified graph -- otherwise a derivation-trigger chain that loops back through cap_id's own
    requires edge can "prove" a genuinely load-bearing edge redundant using that edge itself.
    Mirrors the real CAP-PAYMENTS -> CAP-COMMERCIAL / DER-PAYMENT-ADAPTER shape: CAP-PAYMENTS
    triggers a derivation rule whose derived DER-* capability requires CAP-PAYMENTS right back,
    and CAP-PAYMENTS's own edge to CAP-COMMERCIAL is the only way that closure would ever reach
    CAP-COMMERCIAL."""

    def setUp(self):
        # Registered one mutation at a time (not a single tearDown) so a mid-setUp exception still
        # cleans up whatever was already mutated -- these dicts/lists are the SAME objects
        # configurator_engine.load()'s @lru_cache hands to every other test in this process; a
        # half-applied setUp otherwise leaks a synthetic TEST-* id into later, unrelated tests.
        tmc.CAPMAP['TEST-CAP-TRIGGER'] = {'id': 'TEST-CAP-TRIGGER', 'requires': ['TEST-CAP-DEP']}
        self.addCleanup(tmc.CAPMAP.pop, 'TEST-CAP-TRIGGER', None)
        tmc.CAPMAP['TEST-CAP-DEP'] = {'id': 'TEST-CAP-DEP', 'requires': []}
        self.addCleanup(tmc.CAPMAP.pop, 'TEST-CAP-DEP', None)
        tmc.CAPMAP['TEST-DER-CHILD'] = {'id': 'TEST-DER-CHILD', 'requires': ['TEST-CAP-TRIGGER']}
        self.addCleanup(tmc.CAPMAP.pop, 'TEST-DER-CHILD', None)
        rule = {'id': 'TEST-DERIVE-TRIGGER', 'when_capability': 'TEST-CAP-TRIGGER',
                'derive': ['TEST-DER-CHILD']}
        tmc.DRULES.append(rule)
        self.addCleanup(tmc.DRULES.remove, rule)

    def test_closure_requires_stops_at_the_excluded_edge(self):
        full = tmc.closure_requires('TEST-DER-CHILD')
        self.assertIn('TEST-CAP-DEP', full,
                       'sanity check: without exclusion the closure does reach TEST-CAP-DEP through '
                       "TEST-CAP-TRIGGER's own edge")
        excluded = tmc.closure_requires('TEST-DER-CHILD', exclude_edge=('TEST-CAP-TRIGGER', 'TEST-CAP-DEP'))
        self.assertNotIn('TEST-CAP-DEP', excluded)

    def test_explain_redundant_edge_refuses_the_circular_proof(self):
        # TEST-CAP-TRIGGER -> TEST-CAP-DEP is the edge under test. Its only "alternate path" is the
        # derivation-trigger chain TEST-DER-CHILD -> TEST-CAP-TRIGGER -> TEST-CAP-DEP, and that last
        # hop *is* the edge under test -- a correct classifier must refuse to explain this as
        # redundant (there is no genuinely independent alternate path here).
        reason = tmc.explain_redundant_edge('TEST-CAP-TRIGGER', 'TEST-CAP-DEP')
        self.assertIsNone(reason, f'classifier fabricated a circular explanation: {reason!r}')


class DerSiblingSharedTriggerTests(unittest.TestCase):
    """Bug 1b: a DER-* capability derived by MULTIPLE derivation rules with different
    when_capability triggers must not be given a "single trigger" (own-derivation-trigger)
    explanation just because ONE of those triggers happens to equal dep_id -- the capability could
    also come into existence via the OTHER trigger, which does not guarantee dep_id by itself.
    Mirrors the real DER-AI-AUTHORITY/DER-AI-TOOLS pair (both derived by DERIVE-AI-WRITE,
    when_capability CAP-AI-WRITE, AND DERIVE-AI-EXT, when_capability CAP-AI-EXTERNAL): the correct
    explanation is the co-derived sibling relationship, not the single-trigger claim."""

    def setUp(self):
        tmc.CAPMAP['DER-TEST-A'] = {'id': 'DER-TEST-A', 'requires': ['TEST-CAP-DEP']}
        self.addCleanup(tmc.CAPMAP.pop, 'DER-TEST-A', None)
        tmc.CAPMAP['DER-TEST-B'] = {'id': 'DER-TEST-B', 'requires': ['TEST-CAP-DEP']}
        self.addCleanup(tmc.CAPMAP.pop, 'DER-TEST-B', None)
        tmc.CAPMAP['TEST-CAP-DEP'] = {'id': 'TEST-CAP-DEP', 'requires': []}
        self.addCleanup(tmc.CAPMAP.pop, 'TEST-CAP-DEP', None)
        rule_a = {'id': 'TEST-DERIVE-VIA-DEP', 'when_capability': 'TEST-CAP-DEP',
                  'derive': ['DER-TEST-A', 'DER-TEST-B']}
        tmc.DRULES.append(rule_a)
        self.addCleanup(tmc.DRULES.remove, rule_a)
        rule_b = {'id': 'TEST-DERIVE-VIA-OTHER', 'when_capability': 'TEST-CAP-OTHER-TRIGGER',
                  'derive': ['DER-TEST-A', 'DER-TEST-B']}
        tmc.DRULES.append(rule_b)
        self.addCleanup(tmc.DRULES.remove, rule_b)

    def test_does_not_claim_single_trigger_when_a_second_rule_has_a_different_trigger(self):
        reason = tmc.explain_redundant_edge('DER-TEST-A', 'TEST-CAP-DEP')
        self.assertIsNotNone(reason)
        self.assertNotIn('own derivation trigger', reason,
                          f'falsely claimed single-trigger uniqueness despite a second rule deriving '
                          f'DER-TEST-A from an unrelated trigger: {reason!r}')

    def test_correctly_falls_back_to_the_true_sibling_explanation(self):
        reason = tmc.explain_redundant_edge('DER-TEST-A', 'TEST-CAP-DEP')
        self.assertIn('DER-TEST-B', reason)
        self.assertIn('sibling', reason)
        # And symmetrically for the other sibling.
        reason_b = tmc.explain_redundant_edge('DER-TEST-B', 'TEST-CAP-DEP')
        self.assertIn('DER-TEST-A', reason_b)

    def test_real_der_ai_authority_tools_pair_no_longer_falsely_single_trigger(self):
        # Integration-style check against the real, live catalog (same convention as
        # tests/test_configurator.py's test_ai_write_derives_authority): as of this fix,
        # DER-AI-AUTHORITY and DER-AI-TOOLS are each derived by both DERIVE-AI-WRITE
        # (when_capability CAP-AI-WRITE) and DERIVE-AI-EXT (when_capability CAP-AI-EXTERNAL).
        if 'DER-AI-AUTHORITY' not in tmc.CAPMAP or 'CAP-AI-WRITE' not in tmc.CAPMAP:
            self.skipTest('real catalog no longer has DER-AI-AUTHORITY/CAP-AI-WRITE')
        reason = tmc.explain_redundant_edge('DER-AI-AUTHORITY', 'CAP-AI-WRITE')
        if reason is not None:
            self.assertNotIn('own derivation trigger', reason)


class AnyGateForcedPrereqTests(unittest.TestCase):
    """Bug 2: forced_prereq_qids() must handle an `{any:[...]}` active_when branch by intersecting
    each branch's FULLY transitively-expanded forced set (a question is only genuinely forced if
    EVERY branch of the `any` independently guarantees it, since only one, unknown, branch actually
    holds) -- not skip `any` entirely, and not intersect only the immediate/direct layer (two `any`
    branches can be different immediate questions that only converge on a shared ancestor deeper in
    each one's own active_when chain)."""

    def setUp(self):
        tmc.QMAP['TEST-QZ'] = {'id': 'TEST-QZ'}
        self.addCleanup(tmc.QMAP.pop, 'TEST-QZ', None)
        tmc.QMAP['TEST-QA'] = {'id': 'TEST-QA', 'active_when': {'question': 'TEST-QZ', 'equals': True}}
        self.addCleanup(tmc.QMAP.pop, 'TEST-QA', None)
        tmc.QMAP['TEST-QB'] = {'id': 'TEST-QB', 'active_when': {'question': 'TEST-QZ', 'equals': True}}
        self.addCleanup(tmc.QMAP.pop, 'TEST-QB', None)
        tmc.QMAP['TEST-QX'] = {'id': 'TEST-QX', 'active_when': {'any': [
            {'question': 'TEST-QA', 'equals': True},
            {'question': 'TEST-QB', 'equals': True},
        ]}}
        self.addCleanup(tmc.QMAP.pop, 'TEST-QX', None)
        rule_z = {'id': 'TEST-RULE-QZ', 'when': {'question': 'TEST-QZ', 'equals': True},
                  'require': ['TEST-CAP-Y']}
        tmc.QRULES.append(rule_z)
        self.addCleanup(tmc.QRULES.remove, rule_z)
        rule_x = {'id': 'TEST-RULE-QX', 'when': {'question': 'TEST-QX', 'equals': True},
                  'require': ['TEST-CAP-X']}
        tmc.QRULES.append(rule_x)
        self.addCleanup(tmc.QRULES.remove, rule_x)
        # TEST-CAP-X is a synthetic id guaranteed absent from the real dict, so a plain key
        # assignment + pop (not append/remove) is the correct, fully-clean round trip.
        tmc.CAP_TO_DRIVING_QIDS['TEST-CAP-X'] = ['TEST-QX']
        self.addCleanup(tmc.CAP_TO_DRIVING_QIDS.pop, 'TEST-CAP-X', None)
        tmc.CAPMAP['TEST-CAP-X'] = {'id': 'TEST-CAP-X', 'requires': ['TEST-CAP-Y']}
        self.addCleanup(tmc.CAPMAP.pop, 'TEST-CAP-X', None)
        tmc.CAPMAP['TEST-CAP-Y'] = {'id': 'TEST-CAP-Y', 'requires': []}
        self.addCleanup(tmc.CAPMAP.pop, 'TEST-CAP-Y', None)

    def test_forced_prereq_qids_finds_the_shared_ancestor_across_any_branches(self):
        # TEST-QA and TEST-QB are different immediate questions; they only converge on TEST-QZ one
        # level up. A shallow, direct-layer-only intersection would find nothing here.
        forced = tmc.forced_prereq_qids('TEST-QX')
        self.assertEqual(forced, {'TEST-QZ'})

    def test_explain_redundant_edge_no_longer_falsely_fails_the_any_gated_edge(self):
        reason = tmc.explain_redundant_edge('TEST-CAP-X', 'TEST-CAP-Y')
        self.assertIsNotNone(
            reason, 'a genuinely safe edge behind an any-gate was misclassified as unexplained '
            '(would be a false hard FAIL in main() if this edge were empirically dead)')
        self.assertIn('TEST-CAP-Y', reason)


if __name__ == '__main__':
    unittest.main()
