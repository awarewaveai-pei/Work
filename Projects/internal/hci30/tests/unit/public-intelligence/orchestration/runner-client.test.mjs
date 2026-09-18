// HCI-30 collector pipeline -- runner-client.mjs tests
// (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 9).
// Run with: node --test tests/unit/public-intelligence/orchestration/runner-client.test.mjs
//
// `fetchImpl` is injected (same seam as every other module in this
// pipeline) -- this file proves the request shape (URL, method, headers,
// body) and response handling, never makes a real network call.

import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueueDiscoveredFetch, getRunnerJobStatus, readSnapshotText } from '../../../../public-intelligence/orchestration/runner-client.mjs';

function fakeFetch(response) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return response;
  };
  return { fetchImpl, calls };
}

test('enqueueDiscoveredFetch: POSTs the correct shape and returns the parsed job', async () => {
  const { fetchImpl, calls } = fakeFetch({ ok: true, json: async () => ({ id: 'job-1', status: 'queued' }) });
  const job = await enqueueDiscoveredFetch({
    runnerBaseUrl: 'http://runner.internal:8090',
    sharedSecret: 'sekrit',
    targetUrl: 'https://acme-corp.example/',
    tenantId: 'tenant-1',
    fetchImpl,
  });

  assert.deepEqual(job, { id: 'job-1', status: 'queued' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://runner.internal:8090/enqueue');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer sekrit');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { targetUrl: 'https://acme-corp.example/', tenantId: 'tenant-1', subject_kind: 'ORGANIZATION' });
});

test('enqueueDiscoveredFetch: subjectKind defaults to ORGANIZATION but can be overridden', async () => {
  const { fetchImpl, calls } = fakeFetch({ ok: true, json: async () => ({}) });
  await enqueueDiscoveredFetch({ runnerBaseUrl: 'http://x', sharedSecret: 's', targetUrl: 'https://x/', tenantId: 't', subjectKind: 'PERSON', fetchImpl });
  assert.equal(JSON.parse(calls[0].opts.body).subject_kind, 'PERSON');
});

test('enqueueDiscoveredFetch: non-2xx response throws with the status attached', async () => {
  const { fetchImpl } = fakeFetch({ ok: false, status: 400, json: async () => ({ error: 'subject_kind_required' }) });
  await assert.rejects(
    () => enqueueDiscoveredFetch({ runnerBaseUrl: 'http://x', sharedSecret: 's', targetUrl: 'https://x/', tenantId: 't', fetchImpl }),
    (err) => {
      assert.match(err.message, /enqueue_failed_http_400/);
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test('getRunnerJobStatus: GETs the correct URL with auth and returns the parsed job', async () => {
  const { fetchImpl, calls } = fakeFetch({ ok: true, json: async () => ({ id: 'job-1', status: 'completed', contentHash: 'abc' }) });
  const job = await getRunnerJobStatus({ runnerBaseUrl: 'http://runner.internal:8090', sharedSecret: 'sekrit', jobId: 'job-1', fetchImpl });

  assert.deepEqual(job, { id: 'job-1', status: 'completed', contentHash: 'abc' });
  assert.equal(calls[0].url, 'http://runner.internal:8090/status/job-1');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer sekrit');
});

test('critic review 2026-09-18: both functions pass an AbortSignal so a stuck runner cannot hang this call forever', async () => {
  const { fetchImpl: enqueueFetch, calls: enqueueCalls } = fakeFetch({ ok: true, json: async () => ({}) });
  await enqueueDiscoveredFetch({ runnerBaseUrl: 'http://x', sharedSecret: 's', targetUrl: 'https://x/', tenantId: 't', fetchImpl: enqueueFetch });
  assert.ok(enqueueCalls[0].opts.signal instanceof AbortSignal, 'enqueueDiscoveredFetch must pass an AbortSignal');

  const { fetchImpl: statusFetch, calls: statusCalls } = fakeFetch({ ok: true, json: async () => ({}) });
  await getRunnerJobStatus({ runnerBaseUrl: 'http://x', sharedSecret: 's', jobId: 'j', fetchImpl: statusFetch });
  assert.ok(statusCalls[0].opts.signal instanceof AbortSignal, 'getRunnerJobStatus must pass an AbortSignal');
});

test('critic review 2026-09-18: timeoutMs is configurable per call, not hardcoded', async () => {
  // Real, not mocked: AbortSignal.timeout(1) really aborts almost
  // immediately -- proves the parameter is actually wired through to a real
  // signal, not just accepted and ignored.
  const realSlowFetch = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  });
  await assert.rejects(
    () => enqueueDiscoveredFetch({ runnerBaseUrl: 'http://x', sharedSecret: 's', targetUrl: 'https://x/', tenantId: 't', fetchImpl: realSlowFetch, timeoutMs: 1 }),
    (err) => { assert.equal(err.name, 'AbortError'); return true; },
  );
});

test('getRunnerJobStatus: a 404 (unknown job id) throws rather than returning a falsy job', async () => {
  const { fetchImpl } = fakeFetch({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
  await assert.rejects(
    () => getRunnerJobStatus({ runnerBaseUrl: 'http://x', sharedSecret: 's', jobId: 'missing', fetchImpl }),
    (err) => {
      assert.match(err.message, /status_poll_failed_http_404/);
      assert.equal(err.status, 404);
      return true;
    },
  );
});

test('readSnapshotText: POSTs snapshotRef+contentHash with auth, returns {flagged:false, ...body}', async () => {
  const { fetchImpl, calls } = fakeFetch({ ok: true, status: 200, json: async () => ({ title: 'T', text: 'body', textLength: 4, textTruncated: false }) });
  const r = await readSnapshotText({ runnerBaseUrl: 'http://runner:8090', sharedSecret: 'sekrit', snapshotRef: 's3://b/sha256/h', contentHash: 'h', fetchImpl });
  assert.deepEqual(r, { flagged: false, title: 'T', text: 'body', textLength: 4, textTruncated: false });
  assert.equal(calls[0].url, 'http://runner:8090/snapshot-text');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer sekrit');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { snapshotRef: 's3://b/sha256/h', contentHash: 'h' });
});

test('readSnapshotText: 422 content_flagged is a modelled outcome, not a throw', async () => {
  const { fetchImpl } = fakeFetch({ ok: false, status: 422, json: async () => ({ error: 'content_flagged', scanReasons: [{ id: 'ignore_previous_instructions' }] }) });
  const r = await readSnapshotText({ runnerBaseUrl: 'http://x', sharedSecret: 's', snapshotRef: 'r', contentHash: 'h', fetchImpl });
  assert.deepEqual(r, { flagged: true, scanReasons: [{ id: 'ignore_previous_instructions' }] });
});

test('readSnapshotText: any other non-2xx throws with the runner error label and status', async () => {
  const { fetchImpl } = fakeFetch({ ok: false, status: 409, json: async () => ({ error: 'stored_bytes_hash_mismatch' }) });
  await assert.rejects(
    () => readSnapshotText({ runnerBaseUrl: 'http://x', sharedSecret: 's', snapshotRef: 'r', contentHash: 'h', fetchImpl }),
    (err) => { assert.match(err.message, /snapshot_text_failed_http_409_stored_bytes_hash_mismatch/); assert.equal(err.status, 409); return true; },
  );
});

test('readSnapshotText: a non-JSON error body still throws cleanly (no secondary parse crash)', async () => {
  const { fetchImpl } = fakeFetch({ ok: false, status: 502, json: async () => { throw new SyntaxError('bad json'); } });
  await assert.rejects(
    () => readSnapshotText({ runnerBaseUrl: 'http://x', sharedSecret: 's', snapshotRef: 'r', contentHash: 'h', fetchImpl }),
    /snapshot_text_failed_http_502$/,
  );
});
