import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDimensionScore, assertNoDuplicateDimensions } from '../../../packages/intelligence/dimension-score.mjs';

// Extracted from rollup-trust-domains.mjs when detect-severity-floor.mjs
// needed the identical {dimension, value, evidence_refs} validation a
// second time (2026-09-06; critic review M1 caught this comment
// originally miscounting it as "a third time"). These tests were
// previously exercised only indirectly through rollup-trust-domains.test.mjs's
// own input-validation cases; now asserted directly against the shared
// module.

test('accepts a well-formed entry and returns a plain snapshot', () => {
  const entry = { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] };
  assert.deepEqual(normalizeDimensionScore(entry, 0), entry);
});

test('rejects a non-object entry', () =>
  assert.throws(() => normalizeDimensionScore(null, 0), /must be an object/));

test('rejects an array passed as the entry', () =>
  assert.throws(() => normalizeDimensionScore(['COMPETENCE', 'HIGH'], 0), /must be an object/));

test('rejects an invalid dimension name', () =>
  assert.throws(() => normalizeDimensionScore({ dimension: 'HONESTY', value: 'HIGH', evidence_refs: ['ev-1'] }, 0), /invalid dimension/));

test('rejects an invalid band', () =>
  assert.throws(() => normalizeDimensionScore({ dimension: 'COMPETENCE', value: 0.9, evidence_refs: ['ev-1'] }, 0), /invalid band/));

test('rejects a non-array or empty evidence_refs', () => {
  assert.throws(() => normalizeDimensionScore({ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: 'ev-1' }, 0), /evidence_refs/);
  assert.throws(() => normalizeDimensionScore({ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: [] }, 0), /evidence_refs/);
});

test('rejects evidence_refs containing a non-string or blank element', () => {
  assert.throws(() => normalizeDimensionScore({ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: [null] }, 0), /evidence_refs/);
  assert.throws(() => normalizeDimensionScore({ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['   '] }, 0), /evidence_refs/);
});

test('the returned snapshot is re-read-proof against a getter-backed input (time-of-check/time-of-use)', () => {
  let calls = 0;
  const entry = {
    dimension: 'COMPETENCE',
    get value() { calls += 1; return calls === 1 ? 'HIGH' : 'LOW'; },
    evidence_refs: ['ev-1'],
  };
  const snapshot = normalizeDimensionScore(entry, 0);
  assert.equal(snapshot.value, 'HIGH');
  assert.equal(calls, 1);
});

test('the returned snapshot\'s evidence_refs is a copy, not an alias of the caller\'s array', () => {
  const refs = ['ev-1'];
  const snapshot = normalizeDimensionScore({ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: refs }, 0);
  refs.push('ev-injected-after-normalize');
  assert.deepEqual(snapshot.evidence_refs, ['ev-1']);
});

test('assertNoDuplicateDimensions passes for distinct dimensions', () =>
  assert.doesNotThrow(() => assertNoDuplicateDimensions([
    { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] },
    { dimension: 'PREDICTABILITY', value: 'LOW', evidence_refs: ['ev-2'] },
  ])));

test('assertNoDuplicateDimensions rejects a repeated dimension', () =>
  assert.throws(() => assertNoDuplicateDimensions([
    { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] },
    { dimension: 'COMPETENCE', value: 'LOW', evidence_refs: ['ev-2'] },
  ]), /duplicate dimension/));
