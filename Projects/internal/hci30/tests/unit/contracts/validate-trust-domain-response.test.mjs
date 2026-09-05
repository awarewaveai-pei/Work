import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTrustDomainResponse } from '../../../packages/contracts/validate-trust-domain-response.mjs';

// TRUST-NEG-03 (ADR-0004 gate 4). See governance/ADR-0004-no-universal-human-trust-score.md
// "Required implementation gates" item 4. `value` is a qualitative band and
// `coverage` is required -- HCI_TRUST_DOMAIN_SPEC.md §Score semantics,
// extending ADR-0032's ratified confidence-band convention to Trust-Domain
// values (this file originally used a bare numeric `value`; fixed in the
// same change that wrote that spec, before any real consumer existed).
test('TRUST-NEG-03: rejects a bare top-level trust_score', () =>
  assert.throws(() => validateTrustDomainResponse({ trust_score: 62, domains: [] }), /TRUST-NEG-03/));

test('TRUST-NEG-03: rejects a bare top-level overall_trust', () =>
  assert.throws(() => validateTrustDomainResponse({ overall_trust: 62 }), /TRUST-NEG-03/));

test('TRUST-NEG-03: rejects composite_trust case-insensitively', () =>
  assert.throws(() => validateTrustDomainResponse({ Composite_Trust: 1, domains: [] }), /TRUST-NEG-03/));

test('TRUST-NEG-03: rejects aggregate_trust and universal_trust', () => {
  assert.throws(() => validateTrustDomainResponse({ aggregate_trust: 1 }), /TRUST-NEG-03/);
  assert.throws(() => validateTrustDomainResponse({ universal_trust: 1 }), /TRUST-NEG-03/);
});

test('accepts a well-formed multi-domain vector', () => {
  const response = {
    domains: [
      { domain: 'OPERATIONAL', value: 'HIGH', coverage: 'FULL', evidence_refs: ['ev-1'] },
      { domain: 'FINANCIAL', value: 'LOW', coverage: 'PARTIAL', evidence_refs: ['ev-2', 'ev-3'] },
    ],
  };
  assert.deepEqual(validateTrustDomainResponse(response), response);
});

test('accepts an empty domains vector', () =>
  assert.deepEqual(validateTrustDomainResponse({ domains: [] }), { domains: [] }));

test('rejects two entries for the same domain (the one-slot-per-Person shape ADR-0004 forbids)', () =>
  assert.throws(() => validateTrustDomainResponse({
    domains: [
      { domain: 'OPERATIONAL', value: 'HIGH', coverage: 'FULL', evidence_refs: ['ev-1'] },
      { domain: 'OPERATIONAL', value: 'LOW', coverage: 'FULL', evidence_refs: ['ev-2'] },
    ],
  }), /duplicate domain/));

test('rejects an invalid domain name', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [{ domain: 'OVERALL', value: 'HIGH', coverage: 'FULL', evidence_refs: ['ev-1'] }] }), /invalid domain/));

test('rejects a domain entry with no evidence_refs (the evidence-linked requirement)', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [{ domain: 'OPERATIONAL', value: 'HIGH', coverage: 'FULL', evidence_refs: [] }] }), /evidence_refs/));

test('rejects a numeric value (ADR-0032: bands only, no bare numbers until calibration evidence exists)', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [{ domain: 'OPERATIONAL', value: 0.75, coverage: 'FULL', evidence_refs: ['ev-1'] }] }), /invalid value band/));

test('rejects an unrecognized band string', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [{ domain: 'OPERATIONAL', value: 'EXTREMELY_HIGH', coverage: 'FULL', evidence_refs: ['ev-1'] }] }), /invalid value band/));

test('rejects a missing coverage property', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [{ domain: 'OPERATIONAL', value: 'HIGH', evidence_refs: ['ev-1'] }] }), /invalid coverage: undefined/));

test('rejects an invalid coverage value', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [{ domain: 'OPERATIONAL', value: 'HIGH', coverage: 'FULLY', evidence_refs: ['ev-1'] }] }), /invalid coverage: FULLY/));

test('rejects a response with no domains property', () =>
  assert.throws(() => validateTrustDomainResponse({}), /missing required property: domains/));

test('rejects a non-object response', () => {
  assert.throws(() => validateTrustDomainResponse(null), /must be an object/);
  assert.throws(() => validateTrustDomainResponse([]), /must be an object/);
});

test('rejects an unrelated unknown top-level property', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [], computed_at: 'x' }), /unknown property: computed_at/));

// Below: closes the vacuous checks a critic review found by mutation (2026-09-06
// M3) -- each of these was previously rejected correctly with no test proving it.

test('TRUST-NEG-03: the forbidden-name check wins over an unrelated unknown-property error when both are present', () =>
  assert.throws(() => validateTrustDomainResponse({ computed_at: 'x', overall_trust: 62, domains: [] }), /TRUST-NEG-03/));

test('rejects a non-array domains value', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: 'OPERATIONAL' }), /domains must be an array/));

test('rejects a null entry in domains', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [null] }), /domains\[0\] must be an object/));

test('TRUST-NEG-03: rejects a domain entry carrying an aggregate field nested inside the vector (m1 -- previously misrouted as a generic unknown-property error)', () =>
  assert.throws(() => validateTrustDomainResponse({
    domains: [{ domain: 'OPERATIONAL', value: 'HIGH', coverage: 'FULL', evidence_refs: ['ev-1'], overall_score: 62 }],
  }), /TRUST-NEG-03/));

test('rejects a domain entry carrying an unrelated unknown property (not a forbidden name)', () =>
  assert.throws(() => validateTrustDomainResponse({
    domains: [{ domain: 'OPERATIONAL', value: 'HIGH', coverage: 'FULL', evidence_refs: ['ev-1'], notes: 'x' }],
  }), /unknown property: notes/));

test('rejects evidence_refs given as a bare string instead of an array', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [{ domain: 'OPERATIONAL', value: 'HIGH', coverage: 'FULL', evidence_refs: 'ev-1' }] }), /evidence_refs/));

test('rejects evidence_refs containing a non-string element', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [{ domain: 'OPERATIONAL', value: 'HIGH', coverage: 'FULL', evidence_refs: [null] }] }), /evidence_refs/));

test('rejects evidence_refs containing a blank string', () =>
  assert.throws(() => validateTrustDomainResponse({ domains: [{ domain: 'OPERATIONAL', value: 'HIGH', coverage: 'FULL', evidence_refs: ['   '] }] }), /evidence_refs/));
