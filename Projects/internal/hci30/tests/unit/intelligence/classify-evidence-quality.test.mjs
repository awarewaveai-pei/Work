import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEvidenceQuality } from '../../../packages/intelligence/classify-evidence-quality.mjs';

test('worked example from the spec: a single-ref dimension is SINGLE_SOURCE, a multi-ref one is MULTIPLE_SOURCES', () => {
  const classified = classifyEvidenceQuality([
    { dimension: 'RELIABILITY_FULFILLMENT', value: 'HIGH', evidence_refs: ['ev-1'] },
    { dimension: 'PREDICTABILITY', value: 'HIGH', evidence_refs: ['ev-2', 'ev-3', 'ev-4'] },
  ]);
  assert.deepEqual(classified, [
    { dimension: 'RELIABILITY_FULFILLMENT', domain: 'OPERATIONAL', value: 'HIGH', quality: 'SINGLE_SOURCE', evidence_count: 1, evidence_refs: ['ev-1'] },
    { dimension: 'PREDICTABILITY', domain: 'OPERATIONAL', value: 'HIGH', quality: 'MULTIPLE_SOURCES', evidence_count: 3, evidence_refs: ['ev-2', 'ev-3', 'ev-4'] },
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
  // evidence_count must report the same distinct count the quality label
  // itself is based on (1), not the raw array length (2) -- the exact
  // "raw length vs distinct count" mismatch C2 above already guards for
  // `quality`, now also guarded for the new count field.
  assert.equal(classified[0].evidence_count, 1);
});

test('three refs with only two distinct values classifies as MULTIPLE_SOURCES (2 distinct, above the boundary)', () => {
  const classified = classifyEvidenceQuality([
    { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1', 'ev-1', 'ev-2'] },
  ]);
  assert.equal(classified[0].quality, 'MULTIPLE_SOURCES');
  assert.equal(classified[0].evidence_count, 2);
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
    { dimension: 'INTEGRITY_CONSISTENCY', domain: 'REPUTATIONAL', value: 'VERY_HIGH', quality: 'SINGLE_SOURCE', evidence_count: 1, evidence_refs: ['ev-integrity'] },
    { dimension: 'COMPETENCE', domain: 'COMPETENCE', value: 'LOW', quality: 'SINGLE_SOURCE', evidence_count: 1, evidence_refs: ['ev-competence'] },
  ]);
});

test('multiple dimensions across different domains and qualities are all reported, each with correct domain/value', () => {
  const classified = classifyEvidenceQuality([
    { dimension: 'PREDICTABILITY', value: 'HIGH', evidence_refs: ['ev-1'] },
    { dimension: 'COMPETENCE', value: 'LOW', evidence_refs: ['ev-2', 'ev-3'] },
  ]);
  assert.deepEqual(classified, [
    { dimension: 'COMPETENCE', domain: 'COMPETENCE', value: 'LOW', quality: 'MULTIPLE_SOURCES', evidence_count: 2, evidence_refs: ['ev-2', 'ev-3'] },
    { dimension: 'PREDICTABILITY', domain: 'OPERATIONAL', value: 'HIGH', quality: 'SINGLE_SOURCE', evidence_count: 1, evidence_refs: ['ev-1'] },
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

// resolveClusterRoot (2026-09-17, source-independence wiring, Task 11):
// mandatory fallback when omitted must reproduce today's exact behavior --
// every test above already proves this by never passing the second
// argument at all; this test proves it explicitly for an empty options
// object too, the other "nothing was configured" shape a real caller might
// pass.
test('an explicit empty options object behaves identically to omitting the second argument', () => {
  const classified = classifyEvidenceQuality(
    [{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['https://a.example/x', 'https://b.example/x'] }],
    {},
  );
  assert.equal(classified[0].quality, 'MULTIPLE_SOURCES');
  assert.equal(classified[0].evidence_count, 2);
});

test('resolveClusterRoot collapses syndicated URLs to their original-source root -- 3 distinct refs, 1 distinct root, classifies SINGLE_SOURCE', () => {
  // Simulates the 06_HCI30_PUBLIC_INTELLIGENCE.md:170 scenario directly:
  // three different outlets' URLs all citing the same original wire story.
  const resolveClusterRoot = (ref) => ({
    'https://outlet-a.example/story': 'wire-story-42',
    'https://outlet-b.example/story': 'wire-story-42',
    'https://outlet-c.example/story': 'wire-story-42',
  })[ref] ?? ref;
  const classified = classifyEvidenceQuality(
    [{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['https://outlet-a.example/story', 'https://outlet-b.example/story', 'https://outlet-c.example/story'] }],
    { resolveClusterRoot },
  );
  assert.equal(classified[0].quality, 'SINGLE_SOURCE');
  assert.equal(classified[0].evidence_count, 1);
  // evidence_refs itself must stay the raw, unresolved refs -- the cluster
  // root is a counting mechanism, not a rewrite of the underlying evidence
  // list callers still need for citation/audit purposes.
  assert.deepEqual(classified[0].evidence_refs, ['https://outlet-a.example/story', 'https://outlet-b.example/story', 'https://outlet-c.example/story']);
});

test('resolveClusterRoot: refs that map to genuinely distinct roots still classify MULTIPLE_SOURCES', () => {
  const resolveClusterRoot = (ref) => ({ 'https://a.example/x': 'root-a', 'https://b.example/y': 'root-b' })[ref] ?? ref;
  const classified = classifyEvidenceQuality(
    [{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['https://a.example/x', 'https://b.example/y'] }],
    { resolveClusterRoot },
  );
  assert.equal(classified[0].quality, 'MULTIPLE_SOURCES');
  assert.equal(classified[0].evidence_count, 2);
});

test('a non-function resolveClusterRoot is ignored, not thrown on -- falls back to identity, same as omitting it', () => {
  const classified = classifyEvidenceQuality(
    [{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1', 'ev-1'] }],
    { resolveClusterRoot: 'not-a-function' },
  );
  assert.equal(classified[0].quality, 'SINGLE_SOURCE');
  assert.equal(classified[0].evidence_count, 1);
});

test('passing null as the options argument falls back to identity, same as omitting it entirely', () => {
  const classified = classifyEvidenceQuality(
    [{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1', 'ev-2'] }],
    null,
  );
  assert.equal(classified[0].quality, 'MULTIPLE_SOURCES');
  assert.equal(classified[0].evidence_count, 2);
});

// Critic review, 2026-09-17: a resolver that falls back to undefined/null
// for an unmapped ref would otherwise collapse every such ref into one
// Set bucket regardless of how many genuinely distinct sources they are --
// silently downgrading a real MULTIPLE_SOURCES dimension to SINGLE_SOURCE.
test('resolveClusterRoot returning undefined for a ref throws a clean error, not a silent under-count', () => {
  const resolveClusterRoot = (ref) => (ref === 'ev-1' ? 'root-a' : undefined);
  assert.throws(
    () => classifyEvidenceQuality(
      [{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1', 'ev-2'] }],
      { resolveClusterRoot },
    ),
    /resolveClusterRoot must return a non-empty string for ref "ev-2"/,
  );
});

test('resolveClusterRoot returning a non-string (object identity would defeat Set dedup silently) throws a clean error', () => {
  const resolveClusterRoot = (ref) => ({ root: ref });
  assert.throws(
    () => classifyEvidenceQuality(
      [{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] }],
      { resolveClusterRoot },
    ),
    /resolveClusterRoot must return a non-empty string/,
  );
});

test('resolveClusterRoot returning an empty/blank string is treated the same as no root and throws', () => {
  const resolveClusterRoot = () => '   ';
  assert.throws(
    () => classifyEvidenceQuality(
      [{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] }],
      { resolveClusterRoot },
    ),
    /resolveClusterRoot must return a non-empty string/,
  );
});

test('a resolver that throws is re-thrown with this function\'s own name and the offending ref, not the resolver\'s raw stack', () => {
  const resolveClusterRoot = () => { throw new Error('lookup table unavailable'); };
  assert.throws(
    () => classifyEvidenceQuality(
      [{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-1'] }],
      { resolveClusterRoot },
    ),
    /classifyEvidenceQuality: resolveClusterRoot threw for ref "ev-1": lookup table unavailable/,
  );
});
