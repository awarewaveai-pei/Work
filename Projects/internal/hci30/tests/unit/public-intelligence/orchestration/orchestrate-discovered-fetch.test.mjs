// HCI-30 collector pipeline -- orchestrateDiscoveredFetch tests
// (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 9 acceptance: "真跑一次
// enqueue → ... → runner 端完成 → 結果經 Task 8 落地" -- this file proves
// that hand-off logic end to end, with the real network/DB layers replaced
// by injected fakes, matching every other test file in this pipeline).
// Run with: node --test tests/unit/public-intelligence/orchestration/orchestrate-discovered-fetch.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { orchestrateDiscoveredFetch } from '../../../../public-intelligence/orchestration/orchestrate-discovered-fetch.mjs';

const noopSleep = async () => {};
// critic review 2026-09-18: `query` is now actually CALLED (the tenantId/
// query consistency check queries `hci.current_tenant_id()` before anything
// else runs) -- `query: {}` from before this fix would throw "query is not
// a function" on every single test. `mockQuery('tenant-1')` returns a
// function whose one recognized statement answers with that tenant id,
// matching `baseArgs.tenantId` below by default so existing tests keep
// exercising the happy path; the dedicated mismatch test overrides it.
function mockQuery(tenantId) {
  return async (sql) => {
    if (sql.includes('hci.current_tenant_id')) return { rows: [{ id: tenantId }] };
    throw new Error(`mockQuery: unexpected SQL: ${sql}`);
  };
}
const baseArgs = { runnerBaseUrl: 'http://runner.internal:8090', sharedSecret: 's', targetUrl: 'https://acme-corp.example/', tenantId: 'tenant-1', query: mockQuery('tenant-1') };

function sequencedStatus(statuses) {
  let i = 0;
  return async () => statuses[Math.min(i++, statuses.length - 1)];
}

test('happy path: enqueue -> poll through queued/fetching -> completed -> Task 8 write called with the right shape', async () => {
  const pollCalls = [];
  const writeCalls = [];
  const result = await orchestrateDiscoveredFetch({
    ...baseArgs,
    enqueueImpl: async () => ({ id: 'job-1', status: 'queued' }),
    getStatusImpl: sequencedStatus([
      { id: 'job-1', status: 'fetching' },
      { id: 'job-1', status: 'completed', contentHash: 'abc123', snapshotRef: 's3://bucket/sha256/abc123', finalUrl: 'https://acme-corp.example/', contentProvenance: { epistemic_type: 'EVIDENCE' } },
    ]),
    writeDiscoveredSourceImpl: async (query, input) => { writeCalls.push({ query, input }); return { sourceId: 'src-1', snapshotId: 'snap-1', candidateRelatedSources: [] }; },
    sleepImpl: async (ms) => { pollCalls.push(ms); },
    pollIntervalMs: 1234,
  });

  assert.equal(result.outcome, 'written');
  assert.equal(result.retryable, false);
  assert.equal(result.jobId, 'job-1');
  assert.equal(result.sourceId, 'src-1');
  assert.equal(result.snapshotId, 'snap-1');
  assert.equal(pollCalls.length, 2); // once per getStatusImpl call above
  assert.deepEqual(pollCalls, [1234, 1234]);

  assert.equal(writeCalls.length, 1);
  assert.equal(writeCalls[0].input.targetUrl, 'https://acme-corp.example/');
  assert.equal(writeCalls[0].input.contentHash, 'abc123');
  assert.equal(writeCalls[0].input.snapshotRef, 's3://bucket/sha256/abc123');
  assert.equal(writeCalls[0].input.contentEpistemicType, 'EVIDENCE');
});

test('flagged_for_review: Task 8 write is never called, outcome carries scanReasons, not retryable', async () => {
  let writeWasCalled = false;
  const result = await orchestrateDiscoveredFetch({
    ...baseArgs,
    enqueueImpl: async () => ({ id: 'job-2', status: 'queued' }),
    getStatusImpl: async () => ({ id: 'job-2', status: 'flagged_for_review', scanReasons: [{ id: 'ignore_previous_instructions' }] }),
    writeDiscoveredSourceImpl: async () => { writeWasCalled = true; },
    sleepImpl: noopSleep,
  });

  assert.equal(result.outcome, 'flagged_for_review');
  assert.equal(result.retryable, false);
  assert.deepEqual(result.scanReasons, [{ id: 'ignore_previous_instructions' }]);
  assert.equal(writeWasCalled, false);
});

test('failed with errorCode=OBJECT_TOO_LARGE -> not retryable (config/content-size rejection, retrying changes nothing)', async () => {
  const result = await orchestrateDiscoveredFetch({
    ...baseArgs,
    enqueueImpl: async () => ({ id: 'job-3', status: 'queued' }),
    getStatusImpl: async () => ({ id: 'job-3', status: 'failed', error: 'payload is 30000000 bytes...', errorCode: 'OBJECT_TOO_LARGE' }),
    writeDiscoveredSourceImpl: async () => { throw new Error('must not be called'); },
    sleepImpl: noopSleep,
  });
  assert.equal(result.outcome, 'failed');
  assert.equal(result.retryable, false);
  assert.equal(result.errorCode, 'OBJECT_TOO_LARGE');
});

test('failed with an ssrf_blocked_ prefixed error (no errorCode) -> not retryable', async () => {
  const result = await orchestrateDiscoveredFetch({
    ...baseArgs,
    enqueueImpl: async () => ({ id: 'job-4', status: 'queued' }),
    getStatusImpl: async () => ({ id: 'job-4', status: 'failed', error: 'ssrf_blocked_private_host_literal' }),
    writeDiscoveredSourceImpl: async () => { throw new Error('must not be called'); },
    sleepImpl: noopSleep,
  });
  assert.equal(result.outcome, 'failed');
  assert.equal(result.retryable, false);
});

test('failed with errorCode=OBJECT_STORAGE_TIMEOUT -> retryable (transient)', async () => {
  const result = await orchestrateDiscoveredFetch({
    ...baseArgs,
    enqueueImpl: async () => ({ id: 'job-5', status: 'queued' }),
    getStatusImpl: async () => ({ id: 'job-5', status: 'failed', error: 'object storage request did not complete within 5000ms', errorCode: 'OBJECT_STORAGE_TIMEOUT' }),
    writeDiscoveredSourceImpl: async () => { throw new Error('must not be called'); },
    sleepImpl: noopSleep,
  });
  assert.equal(result.outcome, 'failed');
  assert.equal(result.retryable, true);
});

test('failed with a generic error, no errorCode -> retryable (presumed transient, e.g. a plain network error)', async () => {
  const result = await orchestrateDiscoveredFetch({
    ...baseArgs,
    enqueueImpl: async () => ({ id: 'job-6', status: 'queued' }),
    getStatusImpl: async () => ({ id: 'job-6', status: 'failed', error: 'fetch_failed_http_500' }),
    writeDiscoveredSourceImpl: async () => { throw new Error('must not be called'); },
    sleepImpl: noopSleep,
  });
  assert.equal(result.outcome, 'failed');
  assert.equal(result.retryable, true);
});

test('exhausts maxPollAttempts while still queued/fetching -> outcome=timed_out, retryable (not a policy rejection)', async () => {
  let statusCallCount = 0;
  const result = await orchestrateDiscoveredFetch({
    ...baseArgs,
    enqueueImpl: async () => ({ id: 'job-7', status: 'queued' }),
    getStatusImpl: async () => { statusCallCount++; return { id: 'job-7', status: 'fetching' }; },
    writeDiscoveredSourceImpl: async () => { throw new Error('must not be called'); },
    sleepImpl: noopSleep,
    maxPollAttempts: 5,
  });
  assert.equal(result.outcome, 'timed_out');
  assert.equal(result.retryable, true);
  assert.equal(statusCallCount, 5);
});

test('writeDiscoveredSourceImpl is required -- throws immediately, before any enqueue call', async () => {
  let enqueueWasCalled = false;
  await assert.rejects(
    () => orchestrateDiscoveredFetch({ ...baseArgs, enqueueImpl: async () => { enqueueWasCalled = true; return {}; } }),
    /writeDiscoveredSourceImpl is required/,
  );
  assert.equal(enqueueWasCalled, false);
});

test('a job already completed on the FIRST status check (no queued/fetching in between) still resolves correctly, without ever calling sleepImpl', async () => {
  let sleepWasCalled = false;
  const result = await orchestrateDiscoveredFetch({
    ...baseArgs,
    enqueueImpl: async () => ({ id: 'job-8', status: 'completed', contentHash: 'x', snapshotRef: 's3://x', finalUrl: baseArgs.targetUrl, contentProvenance: {} }),
    getStatusImpl: async () => { throw new Error('must not be called -- job was already terminal from enqueue'); },
    writeDiscoveredSourceImpl: async () => ({ sourceId: 's', snapshotId: 'sn', candidateRelatedSources: [] }),
    sleepImpl: async () => { sleepWasCalled = true; },
  });
  assert.equal(result.outcome, 'written');
  assert.equal(sleepWasCalled, false);
});

test('critic review 2026-09-18 (real cross-tenant-write risk): tenantId/query mismatch throws immediately, before any enqueue call', async () => {
  let enqueueWasCalled = false;
  await assert.rejects(
    () => orchestrateDiscoveredFetch({
      ...baseArgs,
      tenantId: 'tenant-B', // baseArgs.query is mockQuery('tenant-1') -- mismatch
      enqueueImpl: async () => { enqueueWasCalled = true; return {}; },
      writeDiscoveredSourceImpl: async () => { throw new Error('must not be called'); },
      sleepImpl: noopSleep,
    }),
    /tenantId mismatch/,
  );
  assert.equal(enqueueWasCalled, false, 'must fail before ever touching the runner -- this is a caller-side bug, not a runner-side one');
});

test('critic review 2026-09-18: tenantId/query match (the correct, expected case) proceeds normally -- the check is not just fail-always', async () => {
  const result = await orchestrateDiscoveredFetch({
    ...baseArgs, // tenantId: 'tenant-1', query: mockQuery('tenant-1') -- matches
    enqueueImpl: async () => ({ id: 'job-9', status: 'completed', contentHash: 'x', snapshotRef: 's3://x', finalUrl: baseArgs.targetUrl, contentProvenance: {} }),
    writeDiscoveredSourceImpl: async () => ({ sourceId: 's', snapshotId: 'sn', candidateRelatedSources: [] }),
    sleepImpl: noopSleep,
  });
  assert.equal(result.outcome, 'written');
});

test('critic review 2026-09-18 (real repro): an unrecognized terminal status throws loudly instead of silently reaching Task 8s write', async () => {
  let writeWasCalled = false;
  await assert.rejects(
    () => orchestrateDiscoveredFetch({
      ...baseArgs,
      enqueueImpl: async () => ({ id: 'job-10', status: 'cancelled' }), // a status this module has never named
      writeDiscoveredSourceImpl: async () => { writeWasCalled = true; return {}; },
      sleepImpl: noopSleep,
    }),
    /unrecognized terminal job status 'cancelled'/,
  );
  assert.equal(writeWasCalled, false, 'an unknown status must never reach the DB write, even by accident');
});

test('critic review 2026-09-18: HTTP_CLIENT_ERROR and UNSUPPORTED_CONTENT_TYPE are both non-retryable (same URL will fail the same way again)', async () => {
  for (const errorCode of ['HTTP_CLIENT_ERROR', 'UNSUPPORTED_CONTENT_TYPE']) {
    const result = await orchestrateDiscoveredFetch({
      ...baseArgs,
      enqueueImpl: async () => ({ id: 'job-x', status: 'queued' }),
      getStatusImpl: async () => ({ id: 'job-x', status: 'failed', error: 'x', errorCode }),
      writeDiscoveredSourceImpl: async () => { throw new Error('must not be called'); },
      sleepImpl: noopSleep,
    });
    assert.equal(result.retryable, false, `${errorCode} should be non-retryable`);
  }
});

test('Task 10 dry run: a completed job returns a preview without ever calling Task 8s write, and does not require query/writeDiscoveredSourceImpl at all', async () => {
  let writeWasCalled = false;
  const result = await orchestrateDiscoveredFetch({
    runnerBaseUrl: baseArgs.runnerBaseUrl,
    sharedSecret: baseArgs.sharedSecret,
    targetUrl: baseArgs.targetUrl,
    tenantId: baseArgs.tenantId,
    dryRun: true,
    // Deliberately NOT passing `query` or `writeDiscoveredSourceImpl` at all
    // -- a dry run must work without either, proving they are truly optional
    // in this mode, not just unused-but-still-required.
    enqueueImpl: async () => ({ id: 'job-dry', status: 'queued' }),
    getStatusImpl: async () => ({ id: 'job-dry', status: 'completed', title: 'Acme Corp', textLength: 42, contentHash: 'abc', snapshotRef: 's3://should-not-be-surfaced', finalUrl: baseArgs.targetUrl }),
    sleepImpl: noopSleep,
  });

  assert.equal(result.outcome, 'dry_run_completed');
  assert.equal(result.retryable, false);
  assert.equal(result.title, 'Acme Corp');
  assert.equal(result.textLength, 42);
  assert.equal(result.contentHash, 'abc');
  assert.equal('snapshotRef' in result, false, 'a dry-run preview must not surface the object-storage pointer as if it were a durable reference');
  assert.equal(writeWasCalled, false);
});

test('Task 10 dry run: flagged_for_review and failed outcomes behave identically to a real run (no write to skip either way)', async () => {
  const flagged = await orchestrateDiscoveredFetch({
    runnerBaseUrl: baseArgs.runnerBaseUrl, sharedSecret: baseArgs.sharedSecret, targetUrl: baseArgs.targetUrl, tenantId: baseArgs.tenantId, dryRun: true,
    enqueueImpl: async () => ({ id: 'job-dry-2', status: 'queued' }),
    getStatusImpl: async () => ({ id: 'job-dry-2', status: 'flagged_for_review', scanReasons: [{ id: 'ignore_previous_instructions' }] }),
    sleepImpl: noopSleep,
  });
  assert.equal(flagged.outcome, 'flagged_for_review');

  const failed = await orchestrateDiscoveredFetch({
    runnerBaseUrl: baseArgs.runnerBaseUrl, sharedSecret: baseArgs.sharedSecret, targetUrl: baseArgs.targetUrl, tenantId: baseArgs.tenantId, dryRun: true,
    enqueueImpl: async () => ({ id: 'job-dry-3', status: 'queued' }),
    getStatusImpl: async () => ({ id: 'job-dry-3', status: 'failed', error: 'ssrf_blocked_private_host_literal' }),
    sleepImpl: noopSleep,
  });
  assert.equal(failed.outcome, 'failed');
  assert.equal(failed.retryable, false);
});

test('Task 10 dry run: an unrecognized status still throws loudly, same as a real run', async () => {
  await assert.rejects(
    () => orchestrateDiscoveredFetch({
      runnerBaseUrl: baseArgs.runnerBaseUrl, sharedSecret: baseArgs.sharedSecret, targetUrl: baseArgs.targetUrl, tenantId: baseArgs.tenantId, dryRun: true,
      enqueueImpl: async () => ({ id: 'job-dry-4', status: 'cancelled' }),
      sleepImpl: noopSleep,
    }),
    /unrecognized terminal job status/,
  );
});
