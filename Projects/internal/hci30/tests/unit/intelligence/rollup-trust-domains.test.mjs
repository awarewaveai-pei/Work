import assert from 'node:assert/strict';
import test from 'node:test';
import { rollupTrustDomains } from '../../../packages/intelligence/rollup-trust-domains.mjs';
import { validateTrustDomainResponse } from '../../../packages/contracts/validate-trust-domain-response.mjs';

const BANDS = ['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'];

// The exhaustive 25-rank-pair test that used to live here now lives in
// band-scale.test.mjs, against meanRankBand directly -- rollupTrustDomains's
// own mean-computation is a thin pass-through to that shared primitive
// (packages/intelligence/band-scale.mjs, extracted 2026-09-06 when
// combine-method-findings.mjs needed the same rank/round logic), so
// re-asserting all 25 combinations here would test the same arithmetic
// twice through two different textures. What remains below is specific to
// rollupTrustDomains's own logic: domain iteration, coverage FULL/PARTIAL,
// evidence dedup and ordering, and input validation.

// Critic review, 2026-09-06 M2: the trim above removed the ONLY tests that
// asserted a computed `value` for domains other than OPERATIONAL. Three
// mutations specific to THIS file's own logic (not band-scale.mjs's
// arithmetic) survived the entire repo suite as a result: hardcoding
// 'MODERATE' for every FULL-coverage domain, using the last present
// dimension's value instead of the mean, and using the minimum rank
// instead of the mean (the exact "severity override" HCI_RISK_SPEC.md is
// meant to decide, not something this file should silently do). The pair
// (MODERATE, VERY_HIGH) -> HIGH catches all three at once: hardcoded
// 'MODERATE' misses (real answer is HIGH), last-value misses (VERY_HIGH),
// min-based misses (MODERATE) -- so a single assertion per domain is
// sufficient, not a second 25-combination sweep duplicating band-scale.test.mjs.
// This also fixes M3: DOMAIN_DIMENSIONS below is each domain's real pair in
// ASSESSMENT_DIMENSIONS order (confirmed against the live module, not
// retyped by hand), used both to assert the computed value and the
// evidence_refs pair order for every domain, not only OPERATIONAL.
const DOMAIN_DIMENSIONS_IN_ORDER = {
  OPERATIONAL: ['RELIABILITY_FULFILLMENT', 'PREDICTABILITY'],
  COMPETENCE: ['COMPETENCE', 'LEARNING_ADAPTABILITY'],
  CONFIDENTIALITY: ['BOUNDARY_RESPECT', 'INFORMATION_GOVERNANCE'],
  FINANCIAL: ['INCENTIVE_ALIGNMENT', 'RISK_EXTERNALIZATION'],
  STRATEGIC: ['RECIPROCITY_FAIRNESS', 'CONTEXT_STABILITY'],
  REPUTATIONAL: ['INTEGRITY_CONSISTENCY', 'COMMUNICATION_QUALITY'],
  GOVERNANCE_POWER: ['CONFLICT_REPAIR', 'POWER_BEHAVIOR'],
};

test('every domain computes a real mean, not a hardcoded value, the last dimension, or the minimum rank', () => {
  for (const [domain, [firstDim, secondDim]] of Object.entries(DOMAIN_DIMENSIONS_IN_ORDER)) {
    const result = rollupTrustDomains([
      { dimension: firstDim, value: 'MODERATE', evidence_refs: [`ev-${firstDim}`] },
      { dimension: secondDim, value: 'VERY_HIGH', evidence_refs: [`ev-${secondDim}`] },
    ]);
    const row = result.domains.find((d) => d.domain === domain);
    assert.ok(row, `no row for ${domain}`);
    assert.equal(row.value, 'HIGH', `${domain}: expected HIGH (mean of MODERATE+VERY_HIGH), got ${row.value}`);
    assert.equal(row.coverage, 'FULL');
    // MODERATE(3) + VERY_HIGH(5) = spread 2, at the dimension_disagreement
    // threshold -- exercises the field across all 7 domains, not only the
    // domains dedicated tests below construct directly (critic review,
    // 2026-09-06, same "free coverage left on the table" shape this file's
    // own header already documents once for `value`).
    assert.equal(row.dimension_disagreement, true, `${domain}: expected dimension_disagreement=true (spread 2)`);
  }
});

test('evidence_refs pair order follows ASSESSMENT_DIMENSIONS position for every domain, not only OPERATIONAL', () => {
  for (const [domain, [firstDim, secondDim]] of Object.entries(DOMAIN_DIMENSIONS_IN_ORDER)) {
    const result = rollupTrustDomains([
      { dimension: firstDim, value: 'HIGH', evidence_refs: [`ev-${firstDim}`] },
      { dimension: secondDim, value: 'HIGH', evidence_refs: [`ev-${secondDim}`] },
    ]);
    const row = result.domains.find((d) => d.domain === domain);
    assert.deepEqual(row.evidence_refs, [`ev-${firstDim}`, `ev-${secondDim}`], `${domain}: pair order wrong`);
    // HIGH + HIGH = spread 0, across all 7 domains.
    assert.equal(row.dimension_disagreement, false, `${domain}: expected dimension_disagreement=false (spread 0)`);
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
  assert.equal(operational.dimension_disagreement, false); // spread 1 (HIGH=4, MODERATE=3), below the threshold
  assert.deepEqual(operational.evidence_refs, ['ev-1', 'ev-2']);
});

test('one of two dimensions present -> PARTIAL coverage, value is that dimension alone, dimension_disagreement is always false (nothing to compare)', () => {
  const result = rollupTrustDomains([
    { dimension: 'RELIABILITY_FULFILLMENT', value: 'VERY_HIGH', evidence_refs: ['ev-1'] },
  ]);
  const operational = result.domains.find((d) => d.domain === 'OPERATIONAL');
  assert.equal(operational.value, 'VERY_HIGH');
  assert.equal(operational.coverage, 'PARTIAL');
  assert.equal(operational.dimension_disagreement, false);
  assert.deepEqual(operational.evidence_refs, ['ev-1']);
});

// HCI_TRUST_DOMAIN_SPEC.md §Domain-internal disagreement (TASKS.md,
// 2026-09-06 second half): a domain's two assigned dimensions landing on
// materially different bands must be disclosed as a parallel signal, not
// silently averaged away -- same "Do not average lens disagreement away"
// principle combine-method-findings.mjs's own `disagreement` flag already
// applies one layer down, applied here across dimensions instead of across
// methods. Independently-thresholded (DOMAIN_DIMENSION_SPREAD_THRESHOLD),
// not the same constant as combine-method-findings.mjs's own threshold.

test('a spread of exactly 1 (the boundary just below the threshold) does not flag dimension_disagreement', () => {
  const result = rollupTrustDomains([
    { dimension: 'COMPETENCE', value: 'LOW', evidence_refs: ['ev-1'] },
    { dimension: 'LEARNING_ADAPTABILITY', value: 'MODERATE', evidence_refs: ['ev-2'] },
  ]);
  const competence = result.domains.find((d) => d.domain === 'COMPETENCE');
  assert.equal(competence.dimension_disagreement, false);
});

test('a spread of exactly 2 (the threshold itself) flags dimension_disagreement', () => {
  const result = rollupTrustDomains([
    { dimension: 'COMPETENCE', value: 'LOW', evidence_refs: ['ev-1'] },
    { dimension: 'LEARNING_ADAPTABILITY', value: 'HIGH', evidence_refs: ['ev-2'] },
  ]);
  const competence = result.domains.find((d) => d.domain === 'COMPETENCE');
  assert.equal(competence.dimension_disagreement, true);
});

test('a maximal spread of 4 (VERY_LOW vs VERY_HIGH) flags dimension_disagreement, value still rolls up to MODERATE', () => {
  const result = rollupTrustDomains([
    { dimension: 'COMPETENCE', value: 'VERY_LOW', evidence_refs: ['ev-1'] },
    { dimension: 'LEARNING_ADAPTABILITY', value: 'VERY_HIGH', evidence_refs: ['ev-2'] },
  ]);
  const competence = result.domains.find((d) => d.domain === 'COMPETENCE');
  assert.equal(competence.dimension_disagreement, true);
  assert.equal(competence.value, 'MODERATE'); // mean 3, exact -- the aggregation rule itself is unchanged
});

test('identical bands (zero spread) never flag dimension_disagreement', () => {
  const result = rollupTrustDomains([
    { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] },
    { dimension: 'LEARNING_ADAPTABILITY', value: 'HIGH', evidence_refs: ['ev-2'] },
  ]);
  const competence = result.domains.find((d) => d.domain === 'COMPETENCE');
  assert.equal(competence.dimension_disagreement, false);
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

// Regression for the sparse-array hole bug (TASKS.md, fixed 2026-09-06):
// rollupTrustDomains itself, not just normalizeDimensionScores in
// isolation, must reject a hole with a clean validation error -- guards
// against this consumer's own call site silently regressing back to a
// direct .map() (critic review, 2026-09-06 m1, which found no consumer-level
// test protected this after the shared fix landed).
test('rejects a sparse-array hole in the input with a clean validation error, not a crash', () => {
  const sparse = [, { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] }];
  assert.throws(() => rollupTrustDomains(sparse), /dimensionScores\[0\] must be an object/);
});
