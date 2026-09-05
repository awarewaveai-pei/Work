import assert from 'node:assert/strict';
import test from 'node:test';
import { BAND_RANK, RANK_BAND, BANDS, roundHalfDown, meanRankBand } from '../../../packages/intelligence/band-scale.mjs';

// Extracted from rollup-trust-domains.mjs when combine-method-findings.mjs
// needed the same rank/round logic (2026-09-06) -- these tests were
// migrated from rollup-trust-domains.test.mjs's own exhaustive check, which
// now asserts against rollupTrustDomains's behavior only, not this
// primitive directly.

test('BAND_RANK and RANK_BAND are inverse mappings for all five bands', () => {
  assert.deepEqual(BANDS, ['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']);
  for (const band of BANDS) {
    assert.equal(RANK_BAND[BAND_RANK[band] - 1], band);
  }
});

test('roundHalfDown rounds integers unchanged', () => {
  assert.equal(roundHalfDown(3), 3);
  assert.equal(roundHalfDown(1), 1);
});

test('roundHalfDown rounds a .5 tie DOWN, never up', () => {
  assert.equal(roundHalfDown(3.5), 3);
  assert.equal(roundHalfDown(2.5), 2);
  assert.equal(roundHalfDown(1.5), 1);
  assert.equal(roundHalfDown(4.5), 4);
});

test('roundHalfDown rounds a non-tie fraction to the nearest integer', () => {
  assert.equal(roundHalfDown(3.34), 3);
  assert.equal(roundHalfDown(3.67), 4);
});

// Exhaustive: all 25 rank-pair combinations, independently computed here
// (not by importing the implementation's own logic) so this test cannot
// share a bug with meanRankBand.
test('meanRankBand: exhaustive 25 two-rank combinations match Math.floor((a+b)/2)', () => {
  for (let a = 1; a <= 5; a++) {
    for (let b = 1; b <= 5; b++) {
      const expectedRank = Math.floor((a + b) / 2);
      assert.equal(meanRankBand([a, b]), RANK_BAND[expectedRank - 1], `(${a}, ${b})`);
    }
  }
});

test('meanRankBand handles a single rank (no averaging needed)', () => {
  assert.equal(meanRankBand([3]), 'MODERATE');
});

test('meanRankBand rejects an empty array rather than returning undefined', () =>
  assert.throws(() => meanRankBand([]), /non-empty array of ranks/));

test('meanRankBand handles more than two ranks (non-tie and tie cases)', () => {
  assert.equal(meanRankBand([1, 3, 5]), 'MODERATE'); // mean 3, exact
  assert.equal(meanRankBand([1, 2, 5]), 'MODERATE'); // mean 8/3 = 2.667, not a .5 tie, rounds to nearest (3)
  assert.equal(meanRankBand([1, 2]), 'VERY_LOW'); // mean 1.5, tie rounds down
});
