import { TRUST_DOMAINS, FORBIDDEN_AGGREGATE_KEY } from './trust-domains.mjs';

const DOMAIN_ENTRY_KEYS = new Set(['domain', 'value', 'evidence_refs']);

function validateDomainEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`domains[${index}] must be an object`);
  for (const key of Object.keys(entry)) if (!DOMAIN_ENTRY_KEYS.has(key)) throw new Error(`domains[${index}]: unknown property: ${key}`);
  if (!TRUST_DOMAINS.includes(entry.domain)) throw new Error(`domains[${index}]: invalid domain: ${entry.domain}`);
  if (typeof entry.value !== 'number' || !Number.isFinite(entry.value)) throw new Error(`domains[${index}]: value must be a finite number`);
  if (!Array.isArray(entry.evidence_refs) || entry.evidence_refs.length === 0) throw new Error(`domains[${index}]: evidence_refs must be a non-empty array`);
  for (const ref of entry.evidence_refs) if (typeof ref !== 'string' || ref.trim() === '') throw new Error(`domains[${index}]: evidence_refs must contain only non-empty strings`);
}

// TRUST-NEG-03 (ADR-0004 gate 4, "Required implementation gates" item 4):
// any Person-trust read response is validated against a schema requiring a
// `domains: []` array of {domain, value, evidence_refs} entries; a response
// carrying a bare top-level numeric trust_score/overall_trust (or any
// semantic equivalent) fails validation. CI-blocking before any trust-read
// endpoint ships. There is no real endpoint yet -- the roll-up formula
// (P0-04, 04_HCI30_PRODUCT_SPEC.md:87) is still unspecified -- so this
// validator exists ahead of that work, same sequencing gates 1-3 already
// used against the schema.
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
