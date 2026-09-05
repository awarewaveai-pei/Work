import assert from 'node:assert/strict';
import test from 'node:test';
import { combineMethodFindings } from '../../../packages/intelligence/combine-method-findings.mjs';

test('a single finding passes through unchanged, disagreement is false', () => {
  const result = combineMethodFindings('RELIABILITY_FULFILLMENT', [
    { method_id: 'payment-history-v1', value: 'HIGH', evidence_refs: ['ev-1'] },
  ]);
  assert.deepEqual(result, {
    dimension: 'RELIABILITY_FULFILLMENT',
    value: 'HIGH',
    disagreement: false,
    evidence_refs: ['ev-1'],
  });
});

test('two adjacent-band findings (spread 1) average without disagreement', () => {
  const result = combineMethodFindings('RELIABILITY_FULFILLMENT', [
    { method_id: 'method-a', value: 'MODERATE', evidence_refs: ['ev-1'] },
    { method_id: 'method-b', value: 'HIGH', evidence_refs: ['ev-2'] },
  ]);
  assert.equal(result.value, 'MODERATE'); // ranks (3,4), mean 3.5, round-half-down -> 3 -> MODERATE
  assert.equal(result.disagreement, false);
});

// The worked example from HCI_CONFIDENCE_SPEC.md: HIGH (4) and LOW (2),
// spread 2, is the boundary case that must flip disagreement to true.
test('worked example from the spec: HIGH + LOW -> MODERATE with disagreement flagged (spread 2)', () => {
  const result = combineMethodFindings('RELIABILITY_FULFILLMENT', [
    { method_id: 'payment-history-v1', value: 'HIGH', evidence_refs: ['ev-payment'] },
    { method_id: 'communication-timeliness-v1', value: 'LOW', evidence_refs: ['ev-comms'] },
  ]);
  assert.equal(result.value, 'MODERATE');
  assert.equal(result.disagreement, true);
  assert.deepEqual(result.evidence_refs, ['ev-payment', 'ev-comms']);
});

test('a spread of exactly 1 (the boundary just below the threshold) does not flag disagreement', () => {
  const result = combineMethodFindings('COMPETENCE', [
    { method_id: 'method-a', value: 'LOW', evidence_refs: ['ev-1'] },
    { method_id: 'method-b', value: 'MODERATE', evidence_refs: ['ev-2'] },
  ]);
  assert.equal(result.disagreement, false);
});

test('a spread of exactly 2 (the threshold itself) flags disagreement', () => {
  const result = combineMethodFindings('COMPETENCE', [
    { method_id: 'method-a', value: 'LOW', evidence_refs: ['ev-1'] },
    { method_id: 'method-b', value: 'HIGH', evidence_refs: ['ev-2'] },
  ]);
  assert.equal(result.disagreement, true);
});

test('a maximal spread of 4 (VERY_LOW vs VERY_HIGH) flags disagreement', () => {
  const result = combineMethodFindings('COMPETENCE', [
    { method_id: 'method-a', value: 'VERY_LOW', evidence_refs: ['ev-1'] },
    { method_id: 'method-b', value: 'VERY_HIGH', evidence_refs: ['ev-2'] },
  ]);
  assert.equal(result.disagreement, true);
  assert.equal(result.value, 'MODERATE'); // mean 3, exact
});

// The middle finding (index 1, not an extreme) carries the maximum rank --
// deliberately, so a mutation computing spread from only the first and
// last findings (e.g. Math.abs(ranks[0] - ranks[ranks.length-1])) cannot
// pass by coincidence (critic review, 2026-09-06 m1, which found the
// original ordering here put the max at an extreme, letting exactly that
// mutation survive).
test('three findings: mean-of-ranks and spread both computed across all of them, not just the first/last', () => {
  const result = combineMethodFindings('COMPETENCE', [
    { method_id: 'method-a', value: 'LOW', evidence_refs: ['ev-1'] },
    { method_id: 'method-b', value: 'VERY_HIGH', evidence_refs: ['ev-2'] },
    { method_id: 'method-c', value: 'MODERATE', evidence_refs: ['ev-3'] },
  ]);
  // ranks [2,5,3], mean 10/3=3.33, rounds to 3 -> MODERATE; spread 5-2=3 -> disagreement
  assert.equal(result.value, 'MODERATE');
  assert.equal(result.disagreement, true);
});

// Ordering contract is deliberately different from rollup-trust-domains.mjs's
// ASSESSMENT_DIMENSIONS-position order (HCI_CONFIDENCE_SPEC.md §Combination
// rule): methods have no fixed canonical order, so evidence_refs follows
// input array order instead.
test('evidence_refs follows input array order, not any canonical method order', () => {
  const reversed = combineMethodFindings('COMPETENCE', [
    { method_id: 'method-b', value: 'HIGH', evidence_refs: ['ev-b'] },
    { method_id: 'method-a', value: 'LOW', evidence_refs: ['ev-a'] },
  ]);
  assert.deepEqual(reversed.evidence_refs, ['ev-b', 'ev-a']);
});

test('evidence_refs across findings is deduplicated, and a zero spread (N >= 2) does not flag disagreement', () => {
  const result = combineMethodFindings('COMPETENCE', [
    { method_id: 'method-a', value: 'HIGH', evidence_refs: ['ev-1', 'ev-shared'] },
    { method_id: 'method-b', value: 'HIGH', evidence_refs: ['ev-shared', 'ev-2'] },
  ]);
  assert.deepEqual(result.evidence_refs, ['ev-1', 'ev-shared', 'ev-2']);
  assert.equal(result.disagreement, false);
  assert.equal(result.value, 'HIGH');
});

test('rejects a duplicate method_id across findings', () =>
  assert.throws(() => combineMethodFindings('COMPETENCE', [
    { method_id: 'method-a', value: 'HIGH', evidence_refs: ['ev-1'] },
    { method_id: 'method-a', value: 'LOW', evidence_refs: ['ev-2'] },
  ]), /duplicate method_id/));

test('rejects a blank or non-string method_id', () => {
  assert.throws(() => combineMethodFindings('COMPETENCE', [{ method_id: '   ', value: 'HIGH', evidence_refs: ['ev-1'] }]), /method_id must be a non-empty string/);
  assert.throws(() => combineMethodFindings('COMPETENCE', [{ method_id: 42, value: 'HIGH', evidence_refs: ['ev-1'] }]), /method_id must be a non-empty string/);
});

test('rejects an invalid band', () =>
  assert.throws(() => combineMethodFindings('COMPETENCE', [{ method_id: 'method-a', value: 0.9, evidence_refs: ['ev-1'] }]), /invalid band/));

test('rejects a finding with no evidence_refs', () =>
  assert.throws(() => combineMethodFindings('COMPETENCE', [{ method_id: 'method-a', value: 'HIGH', evidence_refs: [] }]), /evidence_refs/));

test('rejects evidence_refs containing a non-string or blank element', () => {
  assert.throws(() => combineMethodFindings('COMPETENCE', [{ method_id: 'method-a', value: 'HIGH', evidence_refs: [null] }]), /evidence_refs/);
  assert.throws(() => combineMethodFindings('COMPETENCE', [{ method_id: 'method-a', value: 'HIGH', evidence_refs: ['   '] }]), /evidence_refs/);
});

test('rejects an invalid dimension name', () =>
  assert.throws(() => combineMethodFindings('HONESTY', [{ method_id: 'method-a', value: 'HIGH', evidence_refs: ['ev-1'] }]), /invalid dimension/));

test('rejects an empty findings array', () =>
  assert.throws(() => combineMethodFindings('COMPETENCE', []), /findings must be a non-empty array/));

test('rejects a non-array findings argument', () =>
  assert.throws(() => combineMethodFindings('COMPETENCE', 'HIGH'), /findings must be a non-empty array/));

test('rejects a non-object finding entry', () =>
  assert.throws(() => combineMethodFindings('COMPETENCE', [null]), /must be an object/));
