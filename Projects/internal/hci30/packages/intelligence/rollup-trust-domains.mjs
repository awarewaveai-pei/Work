import { TRUST_DOMAINS } from '../contracts/trust-domains.mjs';
import { ASSESSMENT_DIMENSIONS, DIMENSION_TO_DOMAIN } from './assessment-dimensions.mjs';
import { BAND_RANK, meanRankBand } from './band-scale.mjs';
import { normalizeDimensionScores } from './dimension-score.mjs';

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

// HCI_TRUST_DOMAIN_SPEC.md §Domain-internal disagreement (TASKS.md,
// 2026-09-06 second half): a domain's two assigned dimensions can each be
// well-evidenced but land on a materially different band (e.g.
// Reliability/fulfillment=HIGH, Predictability=VERY_LOW under
// OPERATIONAL) -- averaging them into one MODERATE without disclosure
// would hide exactly the kind of internal inconsistency
// combine-method-findings.mjs's own `disagreement` flag already refuses to
// hide one layer down (HCI_CONFIDENCE_SPEC.md §Combination rule,
// 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:17, "Do not average lens
// disagreement away").
//
// Deliberately a SEPARATE, independently-named constant from
// combine-method-findings.mjs's own DISAGREEMENT_SPREAD_THRESHOLD, not a
// shared import, even though both currently equal 2 -- the two compare
// structurally different things (N methods measuring ONE dimension there,
// vs. TWO DIFFERENT dimensions under one domain here), and
// dimension-score.mjs's own header already establishes this package's
// precedent against forcing a shared constant OR VALIDATOR across
// coincidentally similar-looking comparisons (that header's own example is
// a shared validator/shape, not a shared constant -- critic review,
// 2026-09-06, which caught this comment dropping the qualifier). If a
// future revision needs these to diverge, neither module has to touch the
// other to do it.
const DOMAIN_DIMENSION_SPREAD_THRESHOLD = 2;

// HCI_TRUST_DOMAIN_SPEC.md's own worked function: 14 already-resolved
// dimension values in, 0-7 domain values out (a domain with none of its
// assigned dimensions present is omitted entirely, never defaulted to
// MODERATE -- see the spec's §Score semantics). Pure function: same input
// always produces the same output, no model calls, no hidden state,
// satisfying P0-04's own "independent implementations ... produce
// equivalent outputs" requirement by construction.
export function rollupTrustDomains(dimensionScores) {
  const normalized = normalizeDimensionScores(dimensionScores);

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
    const ranks = present.map((entry) => BAND_RANK[entry.value]);
    // With only one dimension present, spread is trivially 0 (max === min)
    // and dimension_disagreement is correctly `false` by this same
    // formula -- no separate PARTIAL-coverage branch needed, the same "the
    // general formula already produces the right degenerate answer"
    // pattern meanRankBand's own single-rank case already relies on below.
    const dimensionDisagreement = (Math.max(...ranks) - Math.min(...ranks)) >= DOMAIN_DIMENSION_SPREAD_THRESHOLD;
    // meanRankBand is a correct pass-through for a single rank (mean of one
    // number is itself), so no separate present.length === 1 branch is
    // needed here -- verified by band-scale.test.mjs's own single-rank case.
    const value = meanRankBand(ranks);
    domains.push({ domain, value, coverage, dimension_disagreement: dimensionDisagreement, evidence_refs: evidenceRefs });
  }

  return { domains };
}
