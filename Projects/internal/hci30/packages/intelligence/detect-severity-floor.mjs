import { ASSESSMENT_DIMENSIONS, DIMENSION_TO_DOMAIN } from './assessment-dimensions.mjs';
import { BAND_RANK } from './band-scale.mjs';
import { normalizeDimensionScore, assertNoDuplicateDimensions } from './dimension-score.mjs';

// HCI_RISK_SPEC.md §Severity floor rule: VERY_LOW only, not LOW -- LOW is
// ordinary weak-but-not-alarming signal; including it would fire too often
// to be a useful attention signal (same reasoning
// HCI_CONFIDENCE_SPEC.md's DISAGREEMENT_SPREAD_THRESHOLD uses to separate
// ordinary variation from a real divergence). Named as its own constant so
// revising it is a one-line change, not a re-derivation -- which is only
// true because the comparison below is `<=`, not `===` (critic review,
// 2026-09-06 C1: an earlier `===` version meant raising this constant to
// LOW would silently stop VERY_LOW from firing at all, exactly the
// "safety claim falsified by executing the spec's own instructions"
// failure the sibling HCI_CONFIDENCE_SPEC.md commit was already caught by
// once). A "floor" is "at or below" by definition; `<=` matches the name.
const SEVERITY_FLOOR_RANK = BAND_RANK.VERY_LOW;

// Every other dimension assigned to the same domain -- returned as an
// array, not a single "sibling", so this stays correct if the partition
// (currently exactly 2 dimensions per domain, enforced by
// assessment-dimensions.mjs's own import-time guard) is ever widened.
// Hardcoding "find the one other dimension" would silently drop data the
// day that guard's constant changes (verified against a scratch 3-per-
// domain partition, critic review 2026-09-06 -- no crash, correct output).
// Ordered by ASSESSMENT_DIMENSIONS position, same as every other ordering
// contract in this package (HCI_TRUST_DOMAIN_SPEC.md §Aggregation rule,
// dimension-score.mjs's callers) -- pinned so two independent
// implementations given the same input cannot disagree merely by
// iterating a Map differently (critic review, 2026-09-06 M4: the alert
// list itself and this sibling list were both order-unstated at first).
function findSiblingDimensions(dimension, byDimension) {
  const domain = DIMENSION_TO_DOMAIN[dimension];
  return ASSESSMENT_DIMENSIONS
    .filter((other) => other !== dimension && DIMENSION_TO_DOMAIN[other] === domain)
    .map((other) => ({ dimension: other, value: byDimension.has(other) ? byDimension.get(other).value : null }));
}

// HCI_RISK_SPEC.md's worked function: the same 14-already-resolved-
// dimension-value input rollupTrustDomains takes, in; a flat list of
// severity-floor crossings out -- deliberately NOT a change to any Trust
// Domain average (see the spec's own "Design choice" section for why a
// parallel signal was chosen over an override). Pure function: same input
// always produces the same output, no model calls, no hidden state.
// Output is ordered by ASSESSMENT_DIMENSIONS position (not input order --
// critic review, 2026-09-06 M4), consistent with `siblings` above and
// with the rest of this package's ordering conventions.
export function detectSeverityFloor(dimensionScores) {
  if (!Array.isArray(dimensionScores)) throw new Error('dimensionScores must be an array');
  const normalized = dimensionScores.map(normalizeDimensionScore);
  assertNoDuplicateDimensions(normalized);

  const byDimension = new Map(normalized.map((entry) => [entry.dimension, entry]));

  return ASSESSMENT_DIMENSIONS
    .map((dimension) => byDimension.get(dimension))
    .filter((entry) => entry && BAND_RANK[entry.value] <= SEVERITY_FLOOR_RANK)
    .map((entry) => ({
      dimension: entry.dimension,
      domain: DIMENSION_TO_DOMAIN[entry.dimension],
      value: entry.value,
      siblings: findSiblingDimensions(entry.dimension, byDimension),
      evidence_refs: entry.evidence_refs,
    }));
}
