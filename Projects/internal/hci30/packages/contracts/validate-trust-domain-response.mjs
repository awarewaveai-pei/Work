import { TRUST_DOMAINS, FORBIDDEN_AGGREGATE_KEY } from './trust-domains.mjs';

// ADR-0032 (ACCEPTED, governance/ADR-0032-personality-and-behavioral-method-disposition.md):
// "qualitative bands are the only confidence surface until Wave 11
// delivers calibration evidence" -- ICD 203 Words-of-Estimative-Probability
// convention. HCI_TRUST_DOMAIN_SPEC.md §Score semantics extends this same
// ratified band convention to Trust-Domain values, since no calibration
// evidence exists for a Trust-Domain algorithm either. `value` was
// originally a bare finite number here; fixed to a band enum in the same
// change that wrote the roll-up spec -- no consumer of gate 4 existed yet
// (no real trust-read endpoint), so this correction has zero migration
// cost, the cheapest point at which to catch it.
const VALUE_BANDS = new Set(['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']);
const COVERAGE_VALUES = new Set(['FULL', 'PARTIAL']);

const DOMAIN_ENTRY_KEYS = new Set(['domain', 'value', 'coverage', 'evidence_refs']);

function validateDomainEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`domains[${index}] must be an object`);
  // Same ordering fix as the top-level check below (m2) applied one level
  // down (critic review, 2026-09-06 m1): a nested aggregate key such as
  // `{..., overall_score: 62}` inside a domain entry was still rejected,
  // but only as a generic "unknown property", misrouting a real
  // TRUST-NEG-03 violation away from its own named error.
  for (const key of Object.keys(entry)) if (FORBIDDEN_AGGREGATE_KEY.test(key)) throw new Error(`TRUST-NEG-03: forbidden cross-domain field: ${key}`);
  for (const key of Object.keys(entry)) if (!DOMAIN_ENTRY_KEYS.has(key)) throw new Error(`domains[${index}]: unknown property: ${key}`);
  if (!TRUST_DOMAINS.includes(entry.domain)) throw new Error(`domains[${index}]: invalid domain: ${entry.domain}`);
  if (!VALUE_BANDS.has(entry.value)) throw new Error(`domains[${index}]: invalid value band: ${entry.value}`);
  if (!COVERAGE_VALUES.has(entry.coverage)) throw new Error(`domains[${index}]: invalid coverage: ${entry.coverage}`);
  if (!Array.isArray(entry.evidence_refs) || entry.evidence_refs.length === 0) throw new Error(`domains[${index}]: evidence_refs must be a non-empty array`);
  for (const ref of entry.evidence_refs) if (typeof ref !== 'string' || ref.trim() === '') throw new Error(`domains[${index}]: evidence_refs must contain only non-empty strings`);
}

// TRUST-NEG-03 (ADR-0004 gate 4, "Required implementation gates" item 4):
// any Person-trust read response is validated against a schema requiring a
// `domains: []` array of {domain, value, coverage, evidence_refs} entries;
// a response carrying a bare top-level numeric trust_score/overall_trust
// (or any semantic equivalent) fails validation. CI-blocking before any
// trust-read endpoint ships. There is no real endpoint yet -- the roll-up
// formula (HCI_TRUST_DOMAIN_SPEC.md, P0-04) now exists and is the actual
// producer this validator expects to consume from.
export function validateTrustDomainResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('response must be an object');

  // Forbidden-name check runs over every key before the whitelist below, so
  // TRUST-NEG-03's own violation is never masked by an unrelated "unknown
  // property" error when a request happens to carry both (critic review,
  // 2026-09-06 m2: `{computed_at, overall_trust, domains}` previously threw
  // on `computed_at` first, misreporting the actual named-gate violation).
  for (const key of Object.keys(value)) if (FORBIDDEN_AGGREGATE_KEY.test(key)) throw new Error(`TRUST-NEG-03: forbidden cross-domain field: ${key}`);
  for (const key of Object.keys(value)) if (key !== 'domains') throw new Error(`unknown property: ${key}`);
  if (!Object.hasOwn(value, 'domains')) throw new Error('missing required property: domains');
  if (!Array.isArray(value.domains)) throw new Error('domains must be an array');

  const seen = new Set();
  value.domains.forEach((entry, index) => {
    validateDomainEntry(entry, index);
    if (seen.has(entry.domain)) throw new Error(`duplicate domain in response: ${entry.domain}`);
    seen.add(entry.domain);
  });
  return value;
}
