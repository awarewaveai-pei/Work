import { TRUST_DOMAINS } from '../contracts/trust-domains.mjs';
import { ASSESSMENT_DIMENSIONS, DIMENSION_TO_DOMAIN } from './assessment-dimensions.mjs';

// HCI_TRUST_DOMAIN_SPEC.md §Score semantics: the only representable values.
// The rank encoding below is normative for aggregation; a future
// band-to-probability-range display mapping (open, P0-04) is a separate,
// display-only concern and must never be used to re-derive this ranking
// (HCI_TRUST_DOMAIN_SPEC.md §Aggregation rule note on ordinal spacing).
const BAND_RANK = Object.freeze({ VERY_LOW: 1, LOW: 2, MODERATE: 3, HIGH: 4, VERY_HIGH: 5 });
const RANK_BAND = Object.freeze(['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']);
const BANDS = Object.freeze(Object.keys(BAND_RANK));

// Group each domain's assigned dimensions once, derived from
// DIMENSION_TO_DOMAIN rather than hand-duplicated, so the two files cannot
// silently disagree about which dimensions belong to which domain. Order
// follows ASSESSMENT_DIMENSIONS -- this is the normative evidence_refs
// ordering contract (HCI_TRUST_DOMAIN_SPEC.md §Aggregation rule), not an
// accident of object-key iteration.
const DOMAIN_DIMENSIONS = Object.freeze(
  TRUST_DOMAINS.reduce((acc, domain) => {
    acc[domain] = Object.freeze(ASSESSMENT_DIMENSIONS.filter((d) => DIMENSION_TO_DOMAIN[d] === domain));
    return acc;
  }, {}),
);

// Validates AND returns a plain, re-read-proof snapshot of the input entry
// -- reading each field exactly once into a new object closes a
// time-of-check/time-of-use gap a getter-backed input could otherwise open
// between validation and use (critic review, 2026-09-06 m2).
function normalizeDimensionInput(entry, index) {
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

// HCI_TRUST_DOMAIN_SPEC.md §Aggregation rule: mean of the assigned
// dimensions' ranks, rounded to the nearest integer rank, ties broken DOWN
// (conservative -- overstating trust is more harmful than understating it).
// Math.round rounds .5 UP, so the down-bias is applied explicitly here
// rather than relying on (or accidentally depending on) the built-in's
// default direction.
function roundHalfDown(mean) {
  const fractional = mean - Math.floor(mean);
  return fractional > 0.5 ? Math.ceil(mean) : Math.floor(mean);
}

// HCI_TRUST_DOMAIN_SPEC.md's own worked function: 14 already-resolved
// dimension values in, 0-7 domain values out (a domain with none of its
// assigned dimensions present is omitted entirely, never defaulted to
// MODERATE -- see the spec's §Score semantics). Pure function: same input
// always produces the same output, no model calls, no hidden state,
// satisfying P0-04's own "independent implementations ... produce
// equivalent outputs" requirement by construction.
export function rollupTrustDomains(dimensionScores) {
  if (!Array.isArray(dimensionScores)) throw new Error('dimensionScores must be an array');
  const normalized = dimensionScores.map(normalizeDimensionInput);

  const seenDimensions = new Set();
  for (const entry of normalized) {
    if (seenDimensions.has(entry.dimension)) throw new Error(`duplicate dimension in input: ${entry.dimension}`);
    seenDimensions.add(entry.dimension);
  }

  const byDimension = new Map(normalized.map((entry) => [entry.dimension, entry]));
  const domains = [];

  for (const domain of TRUST_DOMAINS) {
    const assigned = DOMAIN_DIMENSIONS[domain];
    const present = assigned.map((dimension) => byDimension.get(dimension)).filter(Boolean);

    if (present.length === 0) continue; // §Score semantics: no evidence, no row -- never MODERATE-by-default.

    const evidenceRefs = [...new Set(present.flatMap((entry) => entry.evidence_refs))];
    // Derived from how many of THIS domain's assigned dimensions are
    // present, not from a literal `=== 1` -- correct regardless of how
    // many dimensions a domain is ever assigned (critic review, 2026-09-06
    // M2: the prior `present.length === 1` check happened to agree with
    // `=== assigned.length` only because every domain currently has
    // exactly 2 assigned dimensions, an invariant nothing enforced).
    const coverage = present.length === assigned.length ? 'FULL' : 'PARTIAL';

    if (present.length === 1) {
      domains.push({ domain, value: present[0].value, coverage, evidence_refs: evidenceRefs });
      continue;
    }

    const meanRank = present.reduce((sum, entry) => sum + BAND_RANK[entry.value], 0) / present.length;
    const roundedRank = roundHalfDown(meanRank);
    domains.push({ domain, value: RANK_BAND[roundedRank - 1], coverage, evidence_refs: evidenceRefs });
  }

  return { domains };
}
