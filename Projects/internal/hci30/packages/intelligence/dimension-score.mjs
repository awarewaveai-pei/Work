import { ASSESSMENT_DIMENSIONS } from './assessment-dimensions.mjs';
import { BANDS } from './band-scale.mjs';

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
  const evidenceRefsInput = entry.evidence_refs;
  if (!ASSESSMENT_DIMENSIONS.includes(dimension)) throw new Error(`dimensionScores[${index}]: invalid dimension: ${dimension}`);
  if (!BANDS.includes(value)) throw new Error(`dimensionScores[${index}]: invalid band: ${value}`);
  if (!Array.isArray(evidenceRefsInput) || evidenceRefsInput.length === 0) throw new Error(`dimensionScores[${index}]: evidence_refs must be a non-empty array`);
  const evidenceRefs = evidenceRefsInput.map((ref) => {
    if (typeof ref !== 'string' || ref.trim() === '') throw new Error(`dimensionScores[${index}]: evidence_refs must contain only non-empty strings`);
    return ref;
  });
  return { dimension, value, evidence_refs: evidenceRefs };
}

// Shared duplicate-dimension check, same reasoning: both rollupTrustDomains
// and detectSeverityFloor take the full 14-dimension input and must reject
// the same malformed shape (two entries for one dimension) the same way.
export function assertNoDuplicateDimensions(normalized) {
  const seen = new Set();
  for (const entry of normalized) {
    if (seen.has(entry.dimension)) throw new Error(`duplicate dimension in input: ${entry.dimension}`);
    seen.add(entry.dimension);
  }
}
