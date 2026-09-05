import { TRUST_DOMAINS } from '../contracts/trust-domains.mjs';
import { ASSESSMENT_DIMENSIONS, DIMENSION_TO_DOMAIN } from './assessment-dimensions.mjs';
import { BAND_RANK, meanRankBand } from './band-scale.mjs';
import { normalizeDimensionScore, assertNoDuplicateDimensions } from './dimension-score.mjs';

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

// HCI_TRUST_DOMAIN_SPEC.md's own worked function: 14 already-resolved
// dimension values in, 0-7 domain values out (a domain with none of its
// assigned dimensions present is omitted entirely, never defaulted to
// MODERATE -- see the spec's §Score semantics). Pure function: same input
// always produces the same output, no model calls, no hidden state,
// satisfying P0-04's own "independent implementations ... produce
// equivalent outputs" requirement by construction.
export function rollupTrustDomains(dimensionScores) {
  if (!Array.isArray(dimensionScores)) throw new Error('dimensionScores must be an array');
  const normalized = dimensionScores.map(normalizeDimensionScore);
  assertNoDuplicateDimensions(normalized);

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
    // meanRankBand is a correct pass-through for a single rank (mean of one
    // number is itself), so no separate present.length === 1 branch is
    // needed here -- verified by band-scale.test.mjs's own single-rank case.
    const value = meanRankBand(present.map((entry) => BAND_RANK[entry.value]));
    domains.push({ domain, value, coverage, evidence_refs: evidenceRefs });
  }

  return { domains };
}
