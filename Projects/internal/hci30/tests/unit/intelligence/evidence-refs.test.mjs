import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEvidenceRefs } from '../../../packages/intelligence/evidence-refs.mjs';

// Extracted from dimension-score.mjs's normalizeDimensionScore and
// combine-method-findings.mjs's normalizeFinding (2026-09-06), which had
// byte-for-byte identical evidence_refs validation apart from the error
// message's label prefix.

test('accepts a well-formed array and returns a copy', () => {
  const refs = ['ev-1', 'ev-2'];
  const result = normalizeEvidenceRefs(refs, 'dimensionScores', 0);
  assert.deepEqual(result, ['ev-1', 'ev-2']);
  refs.push('ev-injected-after-normalize');
  assert.deepEqual(result, ['ev-1', 'ev-2']);
});

test('rejects a non-array input', () =>
  assert.throws(() => normalizeEvidenceRefs('ev-1', 'dimensionScores', 0), /dimensionScores\[0\]: evidence_refs must be a non-empty array/));

test('rejects an empty array', () =>
  assert.throws(() => normalizeEvidenceRefs([], 'findings', 2), /findings\[2\]: evidence_refs must be a non-empty array/));

test('rejects a non-string element', () =>
  assert.throws(() => normalizeEvidenceRefs([42], 'dimensionScores', 0), /evidence_refs must contain only non-empty strings/));

test('rejects a blank string element', () =>
  assert.throws(() => normalizeEvidenceRefs(['   '], 'dimensionScores', 0), /evidence_refs must contain only non-empty strings/));

test('the label and index are interpolated into every error message', () => {
  // No `^` anchor: node:assert/strict's assert.throws tests a RegExp
  // against String(error) ("Error: <message>"), not the bare .message, so
  // an anchored regex would never match regardless of the thrown text.
  assert.throws(() => normalizeEvidenceRefs([], 'findings', 3), /findings\[3\]:/);
  assert.throws(() => normalizeEvidenceRefs([null], 'findings', 3), /findings\[3\]:/);
});

// Regression for critic review 2026-09-06 M1: a direct .map() over a
// sparse array SKIPS the hole entirely, so a genuinely single-source
// dimension's evidence_refs (with a hole silently sitting in it) would
// pass through completely unvalidated instead of being rejected -- a
// false claim about evidence strength, not merely a crash. This is a
// STRICTLY WORSE failure mode than the outer dimensionScores/findings hole
// bug (fixed the same day): that one at least crashed loudly.
test('rejects a sparse-array hole among the refs, not silently passing it through', () => {
  const sparse = [, 'ev-1'];
  assert.throws(() => normalizeEvidenceRefs(sparse, 'dimensionScores', 0), /evidence_refs must contain only non-empty strings/);
});

// A sparse array with a single hole and zero real elements has length 1,
// so it survives the "non-empty array" length check undetected before the
// per-element validation runs -- must still be caught by the per-element
// check once Array.from densifies the hole to `undefined`.
test('rejects a sparse array containing only a hole (length 1, zero real elements)', () => {
  const onlyHole = [,];
  assert.throws(() => normalizeEvidenceRefs(onlyHole, 'dimensionScores', 0), /evidence_refs must contain only non-empty strings/);
});
