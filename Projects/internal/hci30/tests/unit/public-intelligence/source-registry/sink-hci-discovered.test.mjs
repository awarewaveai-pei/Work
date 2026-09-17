// HCI-30 collector pipeline -- sink/hci-discovered write path tests
// (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 8).
// Run with: node --test tests/unit/public-intelligence/source-registry/sink-hci-discovered.test.mjs
//
// `query` is mocked here (records every call, returns canned rows) --
// proves this module's OWN logic (right SQL, right parameter order,
// candidate-hint predicate, never touching hci.source_relationships), not
// Postgres/RLS/the trigger behavior underneath it, which Task 2 already
// exhaustively tested at the SQL level (302 assertions, 135 mutations
// killed). The real-Postgres proof for THIS module lives in
// tests/architecture/sink-hci-discovered-write-path.test.ps1.

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeDiscoveredSource } from '../../../../public-intelligence/source-registry/sink-hci-discovered.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeMockQuery({ upsertReturnsId, candidateRows = [], candidateHintError } = {}) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('hci.upsert_discovered_source')) {
      return { rows: [{ id: upsertReturnsId ?? params[0] }] };
    }
    if (sql.includes('INSERT INTO hci.source_snapshots')) {
      return { rows: [] };
    }
    if (sql.includes('starts_with(source_ref')) {
      if (candidateHintError) throw candidateHintError;
      return { rows: candidateRows };
    }
    throw new Error(`mock query: unexpected SQL: ${sql}`);
  };
  return { query, calls };
}

test('happy path: upserts the source, inserts a snapshot, returns both ids', async () => {
  const { query, calls } = makeMockQuery();
  const result = await writeDiscoveredSource(query, {
    targetUrl: 'https://acme-corp.example/about',
    contentHash: 'a'.repeat(64),
    snapshotRef: 's3://bucket/sha256/aaaa',
    contentEpistemicType: 'EVIDENCE',
  });

  assert.match(result.sourceId, UUID_RE);
  assert.match(result.snapshotId, UUID_RE);
  assert.deepEqual(result.candidateRelatedSources, []);

  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /hci\.upsert_discovered_source\(\$1, \$2\)/);
  assert.equal(calls[0].params[1], 'https://acme-corp.example/about');
  assert.match(calls[1].sql, /INSERT INTO hci\.source_snapshots/);
  assert.equal(calls[1].params[1], result.sourceId); // source_id FK must be the id upsert_discovered_source RETURNED
  assert.equal(calls[1].params[2], 'a'.repeat(64));
  assert.equal(calls[1].params[3], 's3://bucket/sha256/aaaa');
  assert.equal(calls[1].params[4], 'EVIDENCE');
});

test('contentEpistemicType defaults to UNKNOWN when not supplied (0020s own safe-default reasoning, not this module reinventing it)', async () => {
  const { query, calls } = makeMockQuery();
  await writeDiscoveredSource(query, { targetUrl: 'https://example.com/', contentHash: 'b'.repeat(64), snapshotRef: 's3://bucket/sha256/bbbb' });
  assert.equal(calls[1].params[4], 'UNKNOWN');
});

test('re-discovery: upsert_discovered_source returning an EXISTING id (not the freshly-generated candidate) is used for the snapshot FK, not the candidate id', async () => {
  const existingId = '99999999-9999-9999-9999-999999999999';
  const { query, calls } = makeMockQuery({ upsertReturnsId: existingId });
  const result = await writeDiscoveredSource(query, { targetUrl: 'https://example.com/again', contentHash: 'c'.repeat(64), snapshotRef: 's3://bucket/sha256/cccc' });

  assert.equal(result.sourceId, existingId);
  assert.notEqual(calls[0].params[0], existingId); // the candidate id generated here is NOT what got used
  assert.equal(calls[1].params[1], existingId); // but the snapshot FK correctly uses what upsert actually returned
});

test('candidate-hint query: matches by origin (scheme+host), excludes the just-written source id, never touches hci.source_relationships', async () => {
  const otherSource = { id: '11111111-1111-1111-1111-111111111111', source_ref: 'https://acme-corp.example/careers' };
  const { query, calls } = makeMockQuery({ candidateRows: [otherSource] });
  const result = await writeDiscoveredSource(query, { targetUrl: 'https://acme-corp.example/about', contentHash: 'd'.repeat(64), snapshotRef: 's3://bucket/sha256/dddd' });

  assert.deepEqual(result.candidateRelatedSources, [{ sourceId: otherSource.id, sourceRef: otherSource.source_ref }]);

  const candidateCall = calls.find((c) => c.sql.includes('starts_with(source_ref'));
  assert.ok(candidateCall, 'candidate-hint query must run');
  assert.equal(candidateCall.params[0], 'https://acme-corp.example/'); // origin-prefix match, not a bare substring
  assert.equal(candidateCall.params[1], result.sourceId); // excludes the source just written

  // The whole point of Task 8's Boundaries: candidate hints are NEVER
  // persisted to hci.source_relationships (that table requires a Claim,
  // which does not exist at DISCOVERED). Verified by asserting no query
  // this module issued, across the entire call, ever mentions that table.
  for (const call of calls) {
    assert.ok(!call.sql.includes('source_relationships'), `must never write to hci.source_relationships -- found in: ${call.sql}`);
  }
});

test('candidate-hint query is origin-scoped, not just a host substring (different scheme is a different origin)', async () => {
  const { query, calls } = makeMockQuery();
  await writeDiscoveredSource(query, { targetUrl: 'https://acme-corp.example:8443/page', contentHash: 'e'.repeat(64), snapshotRef: 's3://bucket/sha256/eeee' });
  const candidateCall = calls.find((c) => c.sql.includes('starts_with(source_ref'));
  assert.equal(candidateCall.params[0], 'https://acme-corp.example:8443/');
});

test('critic review 2026-09-17: uses starts_with(), not LIKE -- a hostname containing a literal underscore must not act as a SQL wildcard', async () => {
  // WHATWG URL host parsing legally permits `_` in a hostname (verified:
  // new URL('https://my_test.example.com/x').origin ->
  // 'https://my_test.example.com', unchanged). A bound `LIKE $1` parameter
  // is injection-safe but Postgres still treats a literal `_`/`%` INSIDE
  // that parameter as a wildcard -- 'my_test.example.com/%' would then also
  // match 'myXtest.example.com/...' for any single character X, surfacing
  // an unrelated tenant-visible source as a false "same story" candidate.
  // This test asserts the SQL text itself never uses LIKE for this query,
  // which is what actually closes the bug (starts_with has no wildcard
  // semantics at all, so no hostname shape can trigger it).
  const { query, calls } = makeMockQuery();
  await writeDiscoveredSource(query, { targetUrl: 'https://my_test.example.com/page', contentHash: '1'.repeat(64), snapshotRef: 's3://bucket/sha256/1111' });
  const candidateCall = calls.find((c) => c.params && c.params[0] === 'https://my_test.example.com/');
  assert.ok(candidateCall, 'candidate-hint query must run with the literal underscore preserved in the origin');
  assert.ok(!/\bLIKE\b/i.test(candidateCall.sql), `candidate-hint SQL must not use LIKE (wildcard-unsafe) -- got: ${candidateCall.sql}`);
  assert.match(candidateCall.sql, /starts_with\(/);
});

test('critic review 2026-09-17: candidate-hint step is fail-soft -- a DB error there degrades to no hints, never fails the whole write or the caller\'s retry-then-duplicate risk', async () => {
  const { query, calls } = makeMockQuery({ candidateHintError: new Error('simulated connection drop') });
  const result = await writeDiscoveredSource(query, { targetUrl: 'https://example.com/', contentHash: '2'.repeat(64), snapshotRef: 's3://bucket/sha256/2222' });

  // The two authoritative writes (upsert + snapshot insert) must still have
  // gone through -- this proves the failure was truly contained to the
  // non-authoritative step, not swallowed after also skipping the real writes.
  assert.ok(calls.some((c) => c.sql.includes('hci.upsert_discovered_source')));
  assert.ok(calls.some((c) => c.sql.includes('INSERT INTO hci.source_snapshots')));
  assert.match(result.sourceId, UUID_RE);
  assert.match(result.snapshotId, UUID_RE);
  assert.deepEqual(result.candidateRelatedSources, [], 'a failed candidate-hint lookup must degrade to an empty array, not throw');
});

test('an unparseable targetUrl in the candidate-hint step degrades to no hints, not a thrown error (defense in depth -- the SSRF gate upstream already rejects this long before this module runs)', async () => {
  const { query } = makeMockQuery();
  const result = await writeDiscoveredSource(query, { targetUrl: 'not a url at all', contentHash: 'f'.repeat(64), snapshotRef: 's3://bucket/sha256/ffff' });
  assert.deepEqual(result.candidateRelatedSources, []);
});

test('critic review 2026-09-17: a whitespace-only required field is rejected with the same clean TypeError, not a raw Postgres CHECK-constraint error downstream', async () => {
  const { query, calls } = makeMockQuery();
  await assert.rejects(() => writeDiscoveredSource(query, { targetUrl: '   ', contentHash: 'x'.repeat(64), snapshotRef: 's3://x' }), /targetUrl is required/);
  assert.equal(calls.length, 0);
});

test('missing required fields throw a clear TypeError before any query runs', async () => {
  const { query, calls } = makeMockQuery();
  await assert.rejects(() => writeDiscoveredSource(query, { contentHash: 'x'.repeat(64), snapshotRef: 's3://x' }), /targetUrl is required/);
  await assert.rejects(() => writeDiscoveredSource(query, { targetUrl: 'https://example.com/', snapshotRef: 's3://x' }), /contentHash is required/);
  await assert.rejects(() => writeDiscoveredSource(query, { targetUrl: 'https://example.com/', contentHash: 'x'.repeat(64) }), /snapshotRef is required/);
  assert.equal(calls.length, 0, 'no query should run when required input is missing');
});

test('never constructs any hci.subject_records / hci.identity_candidates / hci.identity_verifications write (Task 8 Boundaries: no Claim/Evidence/Assessment, no identity promotion)', async () => {
  const { query, calls } = makeMockQuery({ candidateRows: [{ id: '22222222-2222-2222-2222-222222222222', source_ref: 'https://example.com/other' }] });
  await writeDiscoveredSource(query, { targetUrl: 'https://example.com/', contentHash: 'g'.repeat(64), snapshotRef: 's3://bucket/sha256/gggg' });
  for (const call of calls) {
    assert.ok(!/subject_records|identity_candidates|identity_verifications/.test(call.sql), `must never touch identity/claim tables -- found in: ${call.sql}`);
  }
});
