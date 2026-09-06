import { ASSESSMENT_DIMENSIONS } from './assessment-dimensions.mjs';
import { BANDS } from './band-scale.mjs';
import { normalizeEvidenceRefs } from './evidence-refs.mjs';

// Extracted from rollup-trust-domains.mjs's own normalizeDimensionInput
// when detect-severity-floor.mjs needed the identical {dimension, value,
// evidence_refs} validation a second time -- same "extract on the second
// real duplication" reasoning band-scale.mjs's own header used for the
// rank/round arithmetic (critic review, 2026-09-06 M1, which caught this
// comment and three sibling references all miscounting it as "a third
// time" -- combine-method-findings.mjs's {method_id, value, evidence_refs}
// shape is a different consumer of a similar-looking shape, not a third
// consumer of this one). combine-method-findings.mjs is deliberately NOT
// unified with this one: the ID field name and meaning differ (a
// dimension is one of a fixed 14; a method_id is an open-ended catalog
// entry), and forcing one shared validator across both would be a
// premature abstraction over a coincidental structural similarity.
//
// Validates AND returns a plain, re-read-proof snapshot -- same time-of-
// check/time-of-use defense this logic already had in its original home,
// rollup-trust-domains.mjs (critic review, 2026-09-06 m2 on that file,
// carried over verbatim with the extraction, not re-discovered here).
export function normalizeDimensionScore(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`dimensionScores[${index}] must be an object`);
  const dimension = entry.dimension;
  const value = entry.value;
  if (!ASSESSMENT_DIMENSIONS.includes(dimension)) throw new Error(`dimensionScores[${index}]: invalid dimension: ${dimension}`);
  if (!BANDS.includes(value)) throw new Error(`dimensionScores[${index}]: invalid band: ${value}`);
  const evidenceRefs = normalizeEvidenceRefs(entry.evidence_refs, 'dimensionScores', index);
  return { dimension, value, evidence_refs: evidenceRefs };
}

// Shared duplicate-dimension check, same reasoning: rollupTrustDomains,
// detectSeverityFloor, and classifyEvidenceQuality (HCI_EVIDENCE_QUALITY_SPEC.md,
// added later the same day -- this module's genuine third consumer) all
// take the full 14-dimension input and must reject the same malformed
// shape (two entries for one dimension) the same way. Only reached via
// normalizeDimensionScores below in production; still exported (like
// normalizeDimensionScore above) so tests can exercise it directly without
// going through the full array-level wrapper (2026-09-06 extraction).
export function assertNoDuplicateDimensions(normalized) {
  const seen = new Set();
  for (const entry of normalized) {
    if (seen.has(entry.dimension)) throw new Error(`duplicate dimension in input: ${entry.dimension}`);
    seen.add(entry.dimension);
  }
}

// Consolidates the identical isArray-check -> map(normalizeDimensionScore)
// -> assertNoDuplicateDimensions sequence that was duplicated verbatim,
// byte-for-byte, across all three consumers (rollup-trust-domains.mjs,
// detect-severity-floor.mjs, classify-evidence-quality.mjs) -- extracted
// here on the third real copy rather than left triplicated, same "extract
// on genuine duplication" threshold this package already used for
// normalizeDimensionScore/assertNoDuplicateDimensions themselves and for
// band-scale.mjs's rank arithmetic.
//
// Also fixes a real bug found while consolidating (TASKS.md, tracked
// 2026-09-06 as open debt across two prior commits): `dimensionScores.map(...)`
// on a sparse array (e.g. `[, { dimension: ... }]`, a hole at index 0)
// SKIPS the hole during map per the JS spec (HasProperty check per index),
// leaving that same hole in `normalized`. `assertNoDuplicateDimensions`'s
// `for...of` then reads that hole as `undefined` (for-of always visits
// every index via the iterator protocol, unlike map) and crashes with an
// unguarded `TypeError: Cannot read properties of undefined` instead of a
// clean validation error. `Array.from` fills every hole with `undefined`
// before `.map()` runs, so `normalizeDimensionScore`'s own `!entry ||
// typeof entry !== 'object'` guard catches it as an ordinary "must be an
// object" error like any other malformed entry.
export function normalizeDimensionScores(dimensionScores) {
  if (!Array.isArray(dimensionScores)) throw new Error('dimensionScores must be an array');
  const normalized = Array.from(dimensionScores).map(normalizeDimensionScore);
  assertNoDuplicateDimensions(normalized);
  return normalized;
}
