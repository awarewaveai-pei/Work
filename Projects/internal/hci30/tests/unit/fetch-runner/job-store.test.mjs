// HCI-30 fetch runner -- job-store.mjs TTL + cap tests. Time comes from an injected now(); no sleeps.
// Run with: node --test tests/unit/fetch-runner/job-store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createJobStore, loadJobStoreConfigFromEnv, DEFAULT_JOB_TTL_MS, DEFAULT_MAX_JOBS } from '../../../infra/local/fetch-runner/job-store.mjs';

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

const done = (id) => ({ id, status: 'completed' });
const running = (id) => ({ id, status: 'fetching' });

test('expired finished job is removed by sweep()', () => {
  const clock = fakeClock();
  const store = createJobStore({ ttlMs: 1000, maxJobs: 10, now: clock.now });
  store.set('old', done('old'));
  clock.advance(500);
  store.set('young', done('young'));
  clock.advance(500); // 'old' is exactly ttlMs old, 'young' is half
  assert.equal(store.sweep(), 1);
  assert.equal(store.size, 1);
  assert.equal(store.get('old'), undefined);
  assert.equal(store.get('young').id, 'young');
});

test('expired job is hidden by get() even before a sweep runs', () => {
  const clock = fakeClock();
  const store = createJobStore({ ttlMs: 1000, maxJobs: 10, now: clock.now });
  store.set('a', done('a'));
  clock.advance(999);
  assert.equal(store.get('a').id, 'a');
  clock.advance(1);
  assert.equal(store.get('a'), undefined);
  assert.equal(store.size, 0);
});

test('in-flight job is never expired by TTL, and expires once it finishes', () => {
  const clock = fakeClock();
  const store = createJobStore({ ttlMs: 1000, maxJobs: 10, now: clock.now });
  const job = running('r');
  store.set('r', job);
  clock.advance(5000);
  assert.equal(store.sweep(), 0);
  assert.equal(store.get('r'), job);
  job.status = 'failed'; // processJob mutates the stored object in place
  assert.equal(store.sweep(), 1);
  assert.equal(store.get('r'), undefined);
});

test('over the cap, the oldest FINISHED job is evicted (older in-flight job kept)', () => {
  const clock = fakeClock();
  const store = createJobStore({ ttlMs: 1_000_000, maxJobs: 3, now: clock.now });
  store.set('inflight-oldest', running('inflight-oldest'));
  clock.advance(1);
  store.set('done-1', done('done-1'));
  clock.advance(1);
  store.set('done-2', done('done-2'));
  clock.advance(1);
  assert.equal(store.set('new', running('new')), true);
  assert.equal(store.size, 3);
  assert.equal(store.get('done-1'), undefined);
  assert.equal(store.get('inflight-oldest').id, 'inflight-oldest');
  assert.equal(store.get('done-2').id, 'done-2');
  assert.equal(store.get('new').id, 'new');
});

test('in-flight jobs are never evicted: a full store of in-flight jobs refuses admission', () => {
  const clock = fakeClock();
  const store = createJobStore({ ttlMs: 1000, maxJobs: 2, now: clock.now });
  store.set('a', running('a'));
  store.set('b', { id: 'b', status: 'queued' });
  clock.advance(10_000);
  assert.equal(store.set('c', running('c')), false);
  assert.equal(store.size, 2);
  assert.equal(store.get('a').id, 'a');
  assert.equal(store.get('b').id, 'b');
  assert.equal(store.get('c'), undefined);
});

test('get() of a cleared id returns undefined (server maps this to 404)', () => {
  const clock = fakeClock();
  const store = createJobStore({ ttlMs: 1000, maxJobs: 1, now: clock.now });
  store.set('evicted', done('evicted'));
  store.set('kept', done('kept')); // cap 1 -> 'evicted' goes
  assert.equal(store.get('evicted'), undefined);
  clock.advance(1000);
  store.sweep();
  assert.equal(store.get('kept'), undefined);
  assert.equal(store.get('never-existed'), undefined);
});

test('config: defaults are 1h / 1000; env overrides; invalid override throws', () => {
  assert.equal(DEFAULT_JOB_TTL_MS, 3_600_000);
  assert.equal(DEFAULT_MAX_JOBS, 1000);
  assert.deepEqual(loadJobStoreConfigFromEnv({}), { ttlMs: 3_600_000, maxJobs: 1000 });
  assert.deepEqual(
    loadJobStoreConfigFromEnv({ HCI_FETCH_RUNNER_JOB_TTL_MS: '60000', HCI_FETCH_RUNNER_JOB_MAX: '5' }),
    { ttlMs: 60_000, maxJobs: 5 },
  );
  for (const bad of ['0', '-1', '1.5', 'abc', '1e400']) {
    assert.throws(() => loadJobStoreConfigFromEnv({ HCI_FETCH_RUNNER_JOB_MAX: bad }), /HCI_FETCH_RUNNER_JOB_MAX must be a positive integer/);
  }
});
