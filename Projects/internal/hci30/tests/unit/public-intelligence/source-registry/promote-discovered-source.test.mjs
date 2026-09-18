// promote-discovered-source.mjs -- DISCOVERED source -> case EVIDENCE.
// Run with: node --test tests/unit/public-intelligence/source-registry/promote-discovered-source.test.mjs
// `query` is a fake that answers by SQL shape and records every statement, so
// these tests prove order (state steps, lock-ordered inserts) and every
// refusal path. Grants/RLS/trigger behavior against real Postgres is verified
// separately (WORKLOG 2026-09-19 entry: BEGIN..ROLLBACK probe on prod hci-postgres).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePromoteRequest, buildEvidencePayload, promoteDiscoveredSource, loadSnapshot, PromoteError,
  EVIDENCE_CONTENT_MAX_CHARS, MAX_PAIRS,
} from '../../../../public-intelligence/source-registry/promote-discovered-source.mjs';

const SRC = '4b058395-0000-4000-8000-000000000001';
const SNAP = '5c000000-0000-4000-8000-000000000002';
const CASE_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const CASE_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const P1 = 'cccccccc-0000-4000-8000-000000000001';
const P2 = 'dddddddd-0000-4000-8000-000000000002';
const TENANT = '11111111-1111-1111-1111-111111111111';

function fakeDb({ state = 'DISCOVERED', snapshotBelongs = true, openCases = null, persons = null } = {}) {
  const calls = [];
  let keyN = 0;
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM hci.sources WHERE id = $1 FOR UPDATE')) return { rows: state ? [{ admission_state: state }] : [] };
    if (sql.includes('FROM hci.source_snapshots WHERE id = $1 AND source_id = $2')) return { rows: snapshotBelongs ? [{ id: params[0] }] : [] };
    if (sql.includes('FROM hci.cases')) return { rows: (openCases ?? params[0]).map((id) => ({ id })) };
    if (sql.includes('FROM hci.persons')) return { rows: (persons ?? params[0]).map((id) => ({ id })) };
    if (sql.includes('mint_encryption_key')) return { rows: [{ id: `key-${++keyN}` }] };
    if (sql.startsWith('UPDATE hci.sources') || sql.startsWith('INSERT INTO hci.subject_records')) return { rows: [], rowCount: 1 };
    throw new Error(`unexpected SQL in test: ${sql}`);
  };
  return { query, calls };
}

const PAYLOAD = { content: 'Acme builds bridges.', source: { source_id: SRC } };

function args(overrides = {}) {
  return { tenantId: TENANT, sourceId: SRC, snapshotId: SNAP, caseIds: [CASE_A], personIds: [P1], payload: PAYLOAD, ...overrides };
}

async function rejectsWith(promise, status, pattern) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof PromoteError, `expected PromoteError, got ${err}`);
    assert.equal(err.status, status);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });
}

test('promote: walks DISCOVERED -> MATCHED -> VERIFIED -> ACCEPTED one legal step at a time, then inserts EVIDENCE', async () => {
  const { query, calls } = fakeDb();
  const result = await promoteDiscoveredSource(query, args());
  const steps = calls.filter((c) => c.sql.startsWith('UPDATE hci.sources')).map((c) => c.params[0]);
  assert.deepEqual(steps, ['MATCHED', 'VERIFIED', 'ACCEPTED']);
  const lastUpdate = calls.findLastIndex((c) => c.sql.startsWith('UPDATE hci.sources'));
  const firstInsert = calls.findIndex((c) => c.sql.startsWith('INSERT INTO hci.subject_records'));
  assert.ok(lastUpdate < firstInsert, 'state must reach ACCEPTED before any evidence row is written');
  assert.equal(result.admissionState, 'ACCEPTED');
  assert.equal(result.records.length, 1);
  const insert = calls[firstInsert];
  assert.deepEqual(insert.params.slice(1, 5), [TENANT, P1, 'EVIDENCE', CASE_A]);
  assert.deepEqual(JSON.parse(insert.params[5]), PAYLOAD);
  assert.equal(insert.params[6], 'DETERMINISTIC');
  assert.equal(insert.params[7], 'key-1');
});

test('promote: the source row is locked FOR UPDATE before anything else (double-submit serializes)', async () => {
  const { query, calls } = fakeDb();
  await promoteDiscoveredSource(query, args());
  assert.match(calls[0].sql, /FOR UPDATE/);
});

test('promote: one EVIDENCE per case x person, each with its own encryption key, cases inserted in ascending id order', async () => {
  const { query, calls } = fakeDb();
  const result = await promoteDiscoveredSource(query, args({ caseIds: [CASE_B, CASE_A], personIds: [P1, P2] }));
  assert.equal(result.records.length, 4);
  const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO hci.subject_records'));
  assert.deepEqual(inserts.map((c) => c.params[4]), [CASE_A, CASE_A, CASE_B, CASE_B]);
  assert.equal(new Set(inserts.map((c) => c.params[7])).size, 4);
});

for (const state of ['MATCHED', 'VERIFIED', 'ACCEPTED', 'ACTIVE', 'REJECTED']) {
  test(`promote: source already ${state} -> 409, no state change, no evidence`, async () => {
    const { query, calls } = fakeDb({ state });
    await rejectsWith(promoteDiscoveredSource(query, args()), 409, new RegExp(state));
    assert.equal(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT')), false);
  });
}

test('promote: source not visible to this tenant -> 404', async () => {
  const { query } = fakeDb({ state: null });
  await rejectsWith(promoteDiscoveredSource(query, args()), 404);
});

test('promote: snapshot of a different source -> 404, nothing written', async () => {
  const { query, calls } = fakeDb({ snapshotBelongs: false });
  await rejectsWith(promoteDiscoveredSource(query, args()), 404, /snapshot/);
  assert.equal(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT')), false);
});

test('promote: a CLOSED/unknown case among the selection -> 409, nothing written', async () => {
  const { query, calls } = fakeDb({ openCases: [CASE_A] });
  await rejectsWith(promoteDiscoveredSource(query, args({ caseIds: [CASE_A, CASE_B] })), 409, /case/);
  assert.equal(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT')), false);
});

test('promote: unknown person -> 404, nothing written', async () => {
  const { query, calls } = fakeDb({ persons: [] });
  await rejectsWith(promoteDiscoveredSource(query, args()), 404, /person/);
  assert.equal(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT')), false);
});

test('promote: empty content (page with no readable text) -> 422 before touching the DB', async () => {
  const { query, calls } = fakeDb();
  await rejectsWith(promoteDiscoveredSource(query, args({ payload: { content: '   ' } })), 422);
  assert.equal(calls.length, 0);
});

test('validatePromoteRequest: valid body -> normalized, de-duplicated lowercase ids', () => {
  const r = validatePromoteRequest({ snapshotId: SNAP.toUpperCase(), caseIds: [CASE_A, CASE_A.toUpperCase()], personIds: [P1] });
  assert.deepEqual(r, { snapshotId: SNAP, caseIds: [CASE_A], personIds: [P1] });
});

test('validatePromoteRequest: every malformed shape is a 400 PromoteError', () => {
  const bad = [
    undefined,
    {},
    { snapshotId: 'nope', caseIds: [CASE_A], personIds: [P1] },
    { snapshotId: SNAP, caseIds: [], personIds: [P1] },
    { snapshotId: SNAP, caseIds: CASE_A, personIds: [P1] },
    { snapshotId: SNAP, caseIds: [CASE_A], personIds: ['x'] },
    { snapshotId: SNAP, caseIds: [CASE_A], personIds: [P1, 42] },
  ];
  for (const body of bad) {
    assert.throws(() => validatePromoteRequest(body), (err) => err instanceof PromoteError && err.status === 400, JSON.stringify(body));
  }
});

test('validatePromoteRequest: more than MAX_PAIRS case x person combinations -> 400', () => {
  const uuids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`);
  const caseIds = uuids('a', 5);
  const personIds = uuids('b', Math.floor(MAX_PAIRS / 5) + 1);
  assert.throws(() => validatePromoteRequest({ snapshotId: SNAP, caseIds, personIds }), /at most/);
});

test('buildEvidencePayload: provenance points at the exact snapshot bytes; long text capped with truncation recorded', () => {
  const snapshot = {
    source_id: SRC, source_ref: 'https://acme.example/', snapshot_id: SNAP, content_hash: 'ab'.repeat(32),
    snapshot_ref: `s3://hci-fetch-runner-raw/sha256/${'ab'.repeat(32)}`, retrieved_at: new Date('2026-09-18T10:00:00Z'),
  };
  const text = 'x '.repeat(EVIDENCE_CONTENT_MAX_CHARS);
  const p = buildEvidencePayload(snapshot, { title: 'Acme', text, textLength: text.length, textTruncated: false });
  assert.equal(p.content.length, EVIDENCE_CONTENT_MAX_CHARS);
  assert.equal(p.content_truncated, true);
  assert.equal(p.full_text_length, text.length);
  assert.deepEqual(p.source, {
    source_id: SRC, source_ref: 'https://acme.example/', snapshot_id: SNAP, content_hash: 'ab'.repeat(32),
    snapshot_ref: snapshot.snapshot_ref, retrieved_at: '2026-09-18T10:00:00.000Z', title: 'Acme',
  });
  assert.deepEqual(p.provenance, { epistemic_type: 'EVIDENCE', authorship_state: 'SOURCE_QUOTATION' });
});

test('buildEvidencePayload: a cut through a surrogate pair never leaves a lone surrogate (jsonb would reject it)', () => {
  const text = 'a'.repeat(EVIDENCE_CONTENT_MAX_CHARS - 1) + '\u{20000}tail'; // CJK Ext-B char straddles the cut
  const p = buildEvidencePayload({ retrieved_at: '2026-09-18T10:00:00.000Z' }, { title: 'x\uD800', text, textLength: text.length });
  assert.equal(p.content.isWellFormed(), true);
  assert.equal(p.source.title.isWellFormed(), true);
});

test('buildEvidencePayload: runner-side truncation is carried even when the returned text is short enough', () => {
  const p = buildEvidencePayload({ retrieved_at: '2026-09-18T10:00:00.000Z' }, { title: null, text: 'short', textLength: 300000, textTruncated: true });
  assert.equal(p.content_truncated, true);
  assert.equal(p.full_text_length, 300000);
});

test('loadSnapshot: newest snapshot unless a specific one is requested; passes null, not undefined', async () => {
  const seen = [];
  const query = async (sql, params) => { seen.push(params); return { rows: [{ snapshot_id: SNAP }] }; };
  assert.deepEqual(await loadSnapshot(query, SRC), { snapshot_id: SNAP });
  await loadSnapshot(query, SRC, SNAP);
  assert.deepEqual(seen, [[SRC, null], [SRC, SNAP]]);
});
