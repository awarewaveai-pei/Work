import { TRUST_DOMAINS } from '../contracts/trust-domains.mjs';

// Verbatim copy of the 14 dimensions in 04_HCI30_PRODUCT_SPEC.md:72-85.
// tests/unit/intelligence/assessment-dimensions.test.mjs enforces the
// partition invariant below mechanically (every dimension assigned exactly
// once, across all 7 domains) rather than trusting this comment.
export const ASSESSMENT_DIMENSIONS = Object.freeze([
  'INTEGRITY_CONSISTENCY',
  'RELIABILITY_FULFILLMENT',
  'COMPETENCE',
  'COMMUNICATION_QUALITY',
  'BOUNDARY_RESPECT',
  'RECIPROCITY_FAIRNESS',
  'CONFLICT_REPAIR',
  'POWER_BEHAVIOR',
  'INCENTIVE_ALIGNMENT',
  'RISK_EXTERNALIZATION',
  'INFORMATION_GOVERNANCE',
  'LEARNING_ADAPTABILITY',
  'CONTEXT_STABILITY',
  'PREDICTABILITY',
]);

// HCI_TRUST_DOMAIN_SPEC.md §Roll-up formula: a strict partition (2
// dimensions per domain, primary assignment only) -- not a weighted
// many-to-many matrix. See that spec's rationale table for why each
// dimension was assigned to its domain.
export const DIMENSION_TO_DOMAIN = Object.freeze({
  RELIABILITY_FULFILLMENT: 'OPERATIONAL',
  PREDICTABILITY: 'OPERATIONAL',
  COMPETENCE: 'COMPETENCE',
  LEARNING_ADAPTABILITY: 'COMPETENCE',
  INFORMATION_GOVERNANCE: 'CONFIDENTIALITY',
  BOUNDARY_RESPECT: 'CONFIDENTIALITY',
  INCENTIVE_ALIGNMENT: 'FINANCIAL',
  RISK_EXTERNALIZATION: 'FINANCIAL',
  RECIPROCITY_FAIRNESS: 'STRATEGIC',
  CONTEXT_STABILITY: 'STRATEGIC',
  INTEGRITY_CONSISTENCY: 'REPUTATIONAL',
  COMMUNICATION_QUALITY: 'REPUTATIONAL',
  POWER_BEHAVIOR: 'GOVERNANCE_POWER',
  CONFLICT_REPAIR: 'GOVERNANCE_POWER',
});

// Defense-in-depth, same reasoning as trust-domains.mjs's own drift test:
// fail loudly at import time rather than silently producing a wrong
// roll-up if the two constants above are ever edited out of sync with each
// other (e.g. a dimension renamed in one place, not the other). Critic
// review, 2026-09-06 M2: the original version of this guard checked total
// count and domain validity but not per-domain arity, so a dimension
// silently reassigned to the wrong domain (leaving one domain with 3
// assignments and another with 1) passed this guard and then produced a
// wrong `coverage` value in rollup-trust-domains.mjs, which derives
// coverage from "how many of this domain's assigned dimensions are
// present" -- a check that is only meaningful if every domain's assigned
// count is verified fixed. The per-domain arity check below closes that.
const assignedDimensions = Object.keys(DIMENSION_TO_DOMAIN);
if (assignedDimensions.length !== ASSESSMENT_DIMENSIONS.length) {
  throw new Error(`DIMENSION_TO_DOMAIN assigns ${assignedDimensions.length} dimensions, expected all ${ASSESSMENT_DIMENSIONS.length} of ASSESSMENT_DIMENSIONS`);
}
for (const dimension of ASSESSMENT_DIMENSIONS) {
  if (!Object.hasOwn(DIMENSION_TO_DOMAIN, dimension)) throw new Error(`ASSESSMENT_DIMENSIONS entry has no domain assignment: ${dimension}`);
}
for (const domain of Object.values(DIMENSION_TO_DOMAIN)) {
  if (!TRUST_DOMAINS.includes(domain)) throw new Error(`DIMENSION_TO_DOMAIN assigns an unknown domain: ${domain}`);
}
const EXPECTED_DIMENSIONS_PER_DOMAIN = ASSESSMENT_DIMENSIONS.length / TRUST_DOMAINS.length;
for (const domain of TRUST_DOMAINS) {
  const assignedToDomain = assignedDimensions.filter((dimension) => DIMENSION_TO_DOMAIN[dimension] === domain);
  if (assignedToDomain.length !== EXPECTED_DIMENSIONS_PER_DOMAIN) {
    throw new Error(`${domain} has ${assignedToDomain.length} assigned dimensions, expected exactly ${EXPECTED_DIMENSIONS_PER_DOMAIN} (got: ${assignedToDomain.join(', ')})`);
  }
}
