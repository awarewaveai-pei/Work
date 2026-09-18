// app/tenant-transaction.mjs -- transaction wrapper used by evidence promotion.
// Run with: node --test tests/unit/app/tenant-transaction.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { withTenantTransaction } from '../../../app/tenant-transaction.mjs';

function fakePool({ failOn = null } = {}) {
  const log = [];
  let released = null;
  const client = {
    query: async (sql, params) => {
      log.push(sql);
      if (failOn && sql.startsWith(failOn)) throw new Error(`boom on ${failOn}`);
      return { rows: [{ sql, params }] };
    },
    release: (destroy) => { released = destroy; },
  };
  return { pool: { connect: async () => client }, log, released: () => released };
}

test('success: BEGIN, SET LOCAL ROLE, statements, COMMIT; connection returned to the pool', async () => {
  const f = fakePool();
  const out = await withTenantTransaction(f.pool, 'hci_app_test_a', async (q) => (await q('SELECT 1', [7])).rows[0].params);
  assert.deepEqual(out, [7]);
  assert.deepEqual(f.log, ['BEGIN', 'SET LOCAL ROLE hci_app_test_a', 'SELECT 1', 'COMMIT']);
  assert.equal(f.released(), false);
});

test('fn throws: ROLLBACK, error rethrown, no COMMIT, connection re-pooled', async () => {
  const f = fakePool();
  await assert.rejects(withTenantTransaction(f.pool, 'hci_app_test_a', async () => { throw new Error('domain failure'); }), /domain failure/);
  assert.deepEqual(f.log, ['BEGIN', 'SET LOCAL ROLE hci_app_test_a', 'ROLLBACK']);
  assert.equal(f.released(), false);
});

test('ROLLBACK itself fails: original error still surfaces, connection destroyed (release(true))', async () => {
  const f = fakePool({ failOn: 'ROLLBACK' });
  await assert.rejects(withTenantTransaction(f.pool, 'hci_app_test_a', async () => { throw new Error('domain failure'); }), /domain failure/);
  assert.equal(f.released(), true);
});

test('COMMIT fails: rolled back and error rethrown', async () => {
  const f = fakePool({ failOn: 'COMMIT' });
  await assert.rejects(withTenantTransaction(f.pool, 'hci_app_test_a', async (q) => q('SELECT 1')), /boom on COMMIT/);
  assert.equal(f.log.at(-1), 'ROLLBACK');
  assert.equal(f.released(), false);
});
