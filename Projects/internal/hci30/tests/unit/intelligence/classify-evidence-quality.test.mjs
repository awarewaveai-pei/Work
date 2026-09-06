import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEvidenceQuality } from '../../../packages/intelligence/classify-evidence-quality.mjs';

test('worked example from the spec: a single-ref dimension is SINGLE_SOURCE, a multi-ref one is MULTIPLE_SOURCES', () => {
  const classified = classifyEvidenceQuality([
    { dimension: 'RELIABILITY_FULFILLMENT', value: 'HIGH', evidence_refs: ['ev-1'] },
    { dimension: 'PREDICTABILITY', value: 'HIGH', evidence_refs: ['ev-2', 'ev-3', 'ev-4'] },
  ]);
  assert.deepEqual(classified, [
    { dimension: 'RELIABILITY_FULFILLMENT', domain: 'OPERATIONAL', value: 'HIGH', quality: 'SINGLE_SOURCE', evidence_refs: ['ev-1'] },
    { dimension: 'PREDICTABILITY', domain: 'OPERATIONAL', value: 'HIGH', quality: 'MULTIPLE_SOURCES', evidence_refs: ['ev-2', 'ev-3', 'ev-4'] },
  ]);
});

// The boundary is 1 vs 2 distinct refs, not raw array length -- checked at
// exactly the boundary in both directions.
test('exactly one evidence ref classifies as SINGLE_SOURCE', () => {
  const classified = classifyEvidenceQuality([{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] }]);
  assert.equal(classified[0].quality, 'SINGLE_SOURCE');
});

test('exactly two distinct evidence refs classifies as MULTIPLE_SOURCES', () => {
  const classified = classifyEvidenceQuality([{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1', 'ev-2'] }]);
  assert.equal(classified[0].quality, 'MULTIPLE_SOURCES');
});

// Critic review, 2026-09-06 C2: raw array length, not distinct count, let
// a genuinely single-sourced dimension escape the SINGLE_SOURCE label by
// repeating one ref -- the realistic case when two methods cite the same
// underlying source (rollup-trust-domains.mjs's own evidence_refs union
// already dedupes for exactly this reason).
test('duplicate refs count as one distinct source, not two -- classifies as SINGLE_SOURCE, not MULTIPLE_SOURCES', () => {
  const classified = classifyEvidenceQuality([
    { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['https://acme.com/about', 'https://acme.com/about'] },
  ]);
  assert.equal(classified[0].quality, 'SINGLE_SOURCE');
});

test('three refs with only two distinct values classifies as MULTIPLE_SOURCES (2 distinct, above the boundary)', () => {
  const classified = classifyEvidenceQuality([
    { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1', 'ev-1', 'ev-2'] },
  ]);
  assert.equal(classified[0].quality, 'MULTIPLE_SOURCES');
});

test('a dimension absent from the input does not appear in the output at all', () => {
  const classified = classifyEvidenceQuality([{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] }]);
  assert.equal(classified.find((c) => c.dimension === 'PREDICTABILITY'), undefined);
});

test('an empty input produces an empty classification', () => assert.deepEqual(classifyEvidenceQuality([]), []));

// Ordered by ASSESSMENT_DIMENSIONS position, not input array order --
// pinned exactly via deepEqual on the full array (not a Set, which cannot
// detect an order or field-value regression -- critic review, 2026-09-06
// M2, which found a "different domains" test that fed a non-default
// domain/value but only ever asserted dimension names via a Set,
// leaving both the `domain` and `value` output fields unproven).
test('output is ordered by ASSESSMENT_DIMENSIONS position, and domain/value fields are correct for a non-default domain', () => {
  const classified = classifyEvidenceQuality([
    { dimension: 'COMPETENCE', value: 'LOW', evidence_refs: ['ev-competence'] },
    { dimension: 'INTEGRITY_CONSISTENCY', value: 'VERY_HIGH', evidence_refs: ['ev-integrity'] },
  ]);
  // INTEGRITY_CONSISTENCY (index 0, domain REPUTATIONAL) precedes
  // COMPETENCE (index 2, domain COMPETENCE) in ASSESSMENT_DIMENSIONS, even
  // though it was supplied second here -- and each row's own domain/value
  // must match its OWN dimension, not the first fixture's.
  assert.deepEqual(classified, [
    { dimension: 'INTEGRITY_CONSISTENCY', domain: 'REPUTATIONAL', value: 'VERY_HIGH', quality: 'SINGLE_SOURCE', evidence_refs: ['ev-integrity'] },
    { dimension: 'COMPETENCE', domain: 'COMPETENCE', value: 'LOW', quality: 'SINGLE_SOURCE', evidence_refs: ['ev-competence'] },
  ]);
});

test('multiple dimensions across different domains and qualities are all reported, each with correct domain/value', () => {
  const classified = classifyEvidenceQuality([
    { dimension: 'PREDICTABILITY', value: 'HIGH', evidence_refs: ['ev-1'] },
    { dimension: 'COMPETENCE', value: 'LOW', evidence_refs: ['ev-2', 'ev-3'] },
  ]);
  assert.deepEqual(classified, [
    { dimension: 'COMPETENCE', domain: 'COMPETENCE', value: 'LOW', quality: 'MULTIPLE_SOURCES', evidence_refs: ['ev-2', 'ev-3'] },
    { dimension: 'PREDICTABILITY', domain: 'OPERATIONAL', value: 'HIGH', quality: 'SINGLE_SOURCE', evidence_refs: ['ev-1'] },
  ]);
});

test('rejects a duplicate dimension in the input', () =>
  assert.throws(() => classifyEvidenceQuality([
    { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] },
    { dimension: 'COMPETENCE', value: 'LOW', evidence_refs: ['ev-2'] },
  ]), /duplicate dimension/));

test('rejects an invalid dimension name', () =>
  assert.throws(() => classifyEvidenceQuality([{ dimension: 'HONESTY', value: 'HIGH', evidence_refs: ['ev-1'] }]), /invalid dimension/));

test('rejects an invalid band', () =>
  assert.throws(() => classifyEvidenceQuality([{ dimension: 'COMPETENCE', value: 0.5, evidence_refs: ['ev-1'] }]), /invalid band/));

test('rejects a dimension entry with no evidence_refs', () =>
  assert.throws(() => classifyEvidenceQuality([{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: [] }]), /evidence_refs/));

test('rejects a non-array input', () =>
  assert.throws(() => classifyEvidenceQuality('HIGH'), /must be an array/));

// Regression for the sparse-array hole bug (TASKS.md, fixed 2026-09-06):
// classifyEvidenceQuality itself, not just normalizeDimensionScores in
// isolation, must reject a hole in the outer array with a clean validation
// error (critic review, 2026-09-06 m1).
test('rejects a sparse-array hole in the outer input with a clean validation error, not a crash', () => {
  const sparse = [, { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] }];
  assert.throws(() => classifyEvidenceQuality(sparse), /dimensionScores\[0\] must be an object/);
});

// Flagship regression for critic review 2026-09-06 M1 -- the actually
// dangerous variant of the sparse-array bug, found while reviewing the
// fix above: a hole inside evidence_refs itself (not the outer
// dimensionScores array) was previously skipped by a direct .map() and
// left completely unvalidated, so `new Set(entry.evidence_refs).size`
// would count the hole as one distinct value and mislabel a genuinely
// single-source dimension as MULTIPLE_SOURCES -- a false claim about
// evidence strength, silently produced, not a crash. Must now throw
// instead of ever reaching that mislabeled output.
test('a hole inside evidence_refs is rejected, not silently counted as an extra distinct source', () => {
  const sparseRefs = [, 'ev-1']; // one real ref, one hole -- must NOT classify as MULTIPLE_SOURCES
  assert.throws(
    () => classifyEvidenceQuality([{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: sparseRefs }]),
    /evidence_refs must contain only non-empty strings/,
  );
});
