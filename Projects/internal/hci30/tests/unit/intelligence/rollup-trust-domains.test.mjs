import assert from 'node:assert/strict';
import test from 'node:test';
import { rollupTrustDomains } from '../../../packages/intelligence/rollup-trust-domains.mjs';
import { validateTrustDomainResponse } from '../../../packages/contracts/validate-trust-domain-response.mjs';

const BANDS = ['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'];

// HCI_TRUST_DOMAIN_SPEC.md §Aggregation rule: mean of two ranks, rounded
// down on a .5 tie. Since both inputs are always integers 1-5, the mean's
// fractional part is always exactly 0 or 0.5, so this reduces to
// Math.floor((rankA + rankB) / 2) -- computed independently here (not by
// importing the module's own rounding helper) so the test cannot pass by
// sharing a bug with the implementation it is checking.
function expectedBand(bandA, bandB) {
  const rankA = BANDS.indexOf(bandA) + 1;
  const rankB = BANDS.indexOf(bandB) + 1;
  return BANDS[Math.floor((rankA + rankB) / 2) - 1];
}

// Exhaustive: all 25 rank-pair combinations for one domain (OPERATIONAL:
// RELIABILITY_FULFILLMENT + PREDICTABILITY), not a sample. This is exactly
// the P0-04 "independent implementations given the same inputs produce
// equivalent outputs" claim -- a sampled test would leave 24 of the 25
// input pairs unproven the same way a critic review already found other
// gates' self-tests leaving branches unproven by mutation.
test('exhaustive: all 25 rank-pair combinations round-half-down correctly', () => {
  for (const bandA of BANDS) {
    for (const bandB of BANDS) {
      const result = rollupTrustDomains([
        { dimension: 'RELIABILITY_FULFILLMENT', value: bandA, evidence_refs: ['ev-reliability'] },
        { dimension: 'PREDICTABILITY', value: bandB, evidence_refs: ['ev-predictability'] },
      ]);
      const operational = result.domains.find((d) => d.domain === 'OPERATIONAL');
      assert.ok(operational, `no OPERATIONAL row for (${bandA}, ${bandB})`);
      assert.equal(operational.value, expectedBand(bandA, bandB), `(${bandA}, ${bandB}) expected ${expectedBand(bandA, bandB)}, got ${operational.value}`);
      assert.equal(operational.coverage, 'FULL');
    }
  }
});

test('worked example from the spec: HIGH + MODERATE -> MODERATE (mean 3.5, round down)', () => {
  const result = rollupTrustDomains([
    { dimension: 'RELIABILITY_FULFILLMENT', value: 'HIGH', evidence_refs: ['ev-1'] },
    { dimension: 'PREDICTABILITY', value: 'MODERATE', evidence_refs: ['ev-2'] },
  ]);
  const operational = result.domains.find((d) => d.domain === 'OPERATIONAL');
  assert.equal(operational.value, 'MODERATE');
  assert.equal(operational.coverage, 'FULL');
  assert.deepEqual(operational.evidence_refs, ['ev-1', 'ev-2']);
});

test('one of two dimensions present -> PARTIAL coverage, value is that dimension alone', () => {
  const result = rollupTrustDomains([
    { dimension: 'RELIABILITY_FULFILLMENT', value: 'VERY_HIGH', evidence_refs: ['ev-1'] },
  ]);
  const operational = result.domains.find((d) => d.domain === 'OPERATIONAL');
  assert.equal(operational.value, 'VERY_HIGH');
  assert.equal(operational.coverage, 'PARTIAL');
  assert.deepEqual(operational.evidence_refs, ['ev-1']);
});

test('zero of two dimensions present -> the domain does not appear at all, never defaults to MODERATE', () => {
  const result = rollupTrustDomains([
    { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] },
  ]);
  assert.equal(result.domains.find((d) => d.domain === 'OPERATIONAL'), undefined);
});

// Ordering is a normative part of the contract (HCI_TRUST_DOMAIN_SPEC.md
// §Aggregation rule, critic review 2026-09-06 M3): evidence_refs is ordered
// by each dimension's position in ASSESSMENT_DIMENSIONS (RELIABILITY_FULFILLMENT
// before PREDICTABILITY for OPERATIONAL), not sorted and not input order --
// asserted exactly here, not via a sort that would hide an order regression.
test('evidence_refs for a FULL-coverage domain is the deduplicated union of both dimensions, in ASSESSMENT_DIMENSIONS order', () => {
  const result = rollupTrustDomains([
    { dimension: 'RELIABILITY_FULFILLMENT', value: 'HIGH', evidence_refs: ['ev-1', 'ev-shared'] },
    { dimension: 'PREDICTABILITY', value: 'HIGH', evidence_refs: ['ev-shared', 'ev-2'] },
  ]);
  const operational = result.domains.find((d) => d.domain === 'OPERATIONAL');
  assert.deepEqual(operational.evidence_refs, ['ev-1', 'ev-shared', 'ev-2']);
});

test('evidence_refs order does not depend on the input array order (dimensions supplied reversed)', () => {
  const result = rollupTrustDomains([
    { dimension: 'PREDICTABILITY', value: 'HIGH', evidence_refs: ['ev-2'] },
    { dimension: 'RELIABILITY_FULFILLMENT', value: 'HIGH', evidence_refs: ['ev-1'] },
  ]);
  const operational = result.domains.find((d) => d.domain === 'OPERATIONAL');
  assert.deepEqual(operational.evidence_refs, ['ev-1', 'ev-2']);
});

test('an empty input produces an empty domains array', () =>
  assert.deepEqual(rollupTrustDomains([]), { domains: [] }));

test('rejects a duplicate dimension in the input', () =>
  assert.throws(() => rollupTrustDomains([
    { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] },
    { dimension: 'COMPETENCE', value: 'LOW', evidence_refs: ['ev-2'] },
  ]), /duplicate dimension/));

test('rejects an invalid dimension name', () =>
  assert.throws(() => rollupTrustDomains([{ dimension: 'HONESTY', value: 'HIGH', evidence_refs: ['ev-1'] }]), /invalid dimension/));

test('rejects an invalid band', () =>
  assert.throws(() => rollupTrustDomains([{ dimension: 'COMPETENCE', value: 0.9, evidence_refs: ['ev-1'] }]), /invalid band/));

test('rejects a dimension entry with no evidence_refs', () =>
  assert.throws(() => rollupTrustDomains([{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: [] }]), /evidence_refs/));

test('rejects a non-array input', () =>
  assert.throws(() => rollupTrustDomains('OPERATIONAL'), /must be an array/));

// End-to-end composition (closes the loop between the roll-up formula and
// gate 4, built independently of each other in separate commits): the
// roll-up's own output must always be acceptable to the validator that
// exists specifically to gate what a trust-read response may look like.
test('end-to-end: rollupTrustDomains output always passes gate 4 (validateTrustDomainResponse) unchanged', () => {
  const allDimensions = [
    'INTEGRITY_CONSISTENCY', 'RELIABILITY_FULFILLMENT', 'COMPETENCE', 'COMMUNICATION_QUALITY',
    'BOUNDARY_RESPECT', 'RECIPROCITY_FAIRNESS', 'CONFLICT_REPAIR', 'POWER_BEHAVIOR',
    'INCENTIVE_ALIGNMENT', 'RISK_EXTERNALIZATION', 'INFORMATION_GOVERNANCE', 'LEARNING_ADAPTABILITY',
    'CONTEXT_STABILITY', 'PREDICTABILITY',
  ];
  const fullInput = allDimensions.map((dimension, i) => ({ dimension, value: BANDS[i % BANDS.length], evidence_refs: [`ev-${dimension}`] }));
  const fullResult = rollupTrustDomains(fullInput);
  assert.equal(fullResult.domains.length, 7);
  assert.deepEqual(validateTrustDomainResponse(fullResult), fullResult);

  const partialResult = rollupTrustDomains([{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] }]);
  assert.deepEqual(validateTrustDomainResponse(partialResult), partialResult);

  const emptyResult = rollupTrustDomains([]);
  assert.deepEqual(validateTrustDomainResponse(emptyResult), emptyResult);
});
