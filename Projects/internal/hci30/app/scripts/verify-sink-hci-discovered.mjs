// HCI-30 collector pipeline -- real-Postgres verification for Task 8's
// sink/hci-discovered write path (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md
// Task 8). Invoked by tests/architecture/sink-hci-discovered-write-path.test.ps1
// against a fresh, throwaway compose.test.yml Postgres (migrations 1-20 +
// fixtures applied, nothing else). Lives under app/ (not public-intelligence/)
// so `import pg from 'pg'` resolves via app/node_modules -- the write-path
// module itself (../../public-intelligence/source-registry/sink-hci-discovered.mjs)
// has zero npm dependencies by design; only this test harness needs a real
// Postgres driver.
//
// Connection details come from env vars the .ps1 caller sets (same shape as
// app/server.mjs's own pool config, but parameterized here since this runs
// against a throwaway per-test-run database, not the persistent dev one).
import pg from 'pg';
import { writeDiscoveredSource } from '../../public-intelligence/source-registry/sink-hci-discovered.mjs';

const HOST = process.env.HCI_VERIFY_DB_HOST || '127.0.0.1';
const PORT = Number(process.env.HCI_VERIFY_DB_PORT || 5432);
const PASSWORD = process.env.HCI_VERIFY_DB_PASSWORD;
if (!PASSWORD) {
  console.error('HCI_VERIFY_DB_PASSWORD is required.');
  process.exit(1);
}

const pool = new pg.Pool({ host: HOST, port: PORT, user: 'hci_owner', password: PASSWORD, database: 'hci_wave1_synthetic' });

// Same SET ROLE / RESET ROLE dance as app/server.mjs's own queryAsTenant --
// duplicated here (not imported) rather than refactoring that file's
// private helper out into a shared module. app/server.mjs is a working,
// currently-untested-by-automation file; this session already carries
// enough new surface for one sitting without adding a refactor to it with
// no regression safety net beyond manual verification.
async function queryAsTenant(role, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE ${role}`);
    return await client.query(sql, params);
  } finally {
    await client.query('RESET ROLE');
    client.release();
  }
}

const ROLE = 'hci_app_test_a';
const query = (sql, params) => queryAsTenant(ROLE, sql, params);

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`ASSERTION FAILED: ${label} -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`  ok: ${label} (${JSON.stringify(actual)})`);
}

async function main() {
  const targetUrl = 'https://acme-corp.example/press-release';

  console.log('Writing a fresh DISCOVERED source (first crawl)...');
  const first = await writeDiscoveredSource(query, {
    targetUrl,
    contentHash: 'a'.repeat(64),
    snapshotRef: 's3://hci-fetch-runner-raw/sha256/' + 'a'.repeat(64),
    contentEpistemicType: 'EVIDENCE',
  });
  console.log(`  sourceId=${first.sourceId} snapshotId=${first.snapshotId}`);

  console.log('Writing the SAME URL again (second crawl -- must resolve to the same source, a NEW snapshot)...');
  const second = await writeDiscoveredSource(query, {
    targetUrl,
    contentHash: 'b'.repeat(64),
    snapshotRef: 's3://hci-fetch-runner-raw/sha256/' + 'b'.repeat(64),
    contentEpistemicType: 'EVIDENCE',
  });
  console.log(`  sourceId=${second.sourceId} snapshotId=${second.snapshotId}`);

  assertEqual(second.sourceId, first.sourceId, 'same URL re-discovered resolves to the same hci.sources row');
  if (second.snapshotId === first.snapshotId) throw new Error('ASSERTION FAILED: second write must produce a NEW snapshot id, got the same one back');
  console.log(`  ok: second write produced a distinct snapshot id`);

  const { rows: sourceRows } = await query('SELECT id, source_ref, admission_state FROM hci.sources WHERE id = $1', [first.sourceId]);
  assertEqual(sourceRows.length, 1, 'exactly one hci.sources row exists for this source_ref');
  assertEqual(sourceRows[0].admission_state, 'DISCOVERED', 'admission_state is DISCOVERED after two writes');
  assertEqual(sourceRows[0].source_ref, targetUrl, 'source_ref matches the target URL');

  const { rows: snapshotRows } = await query('SELECT id, content_hash, content_epistemic_type FROM hci.source_snapshots WHERE source_id = $1 ORDER BY retrieved_at', [first.sourceId]);
  assertEqual(snapshotRows.length, 2, 'exactly two hci.source_snapshots rows exist (append-only, no record-level dedup)');
  assertEqual(snapshotRows[0].content_hash, 'a'.repeat(64), 'first snapshot carries the first crawl\'s content_hash');
  assertEqual(snapshotRows[1].content_hash, 'b'.repeat(64), 'second snapshot carries the second crawl\'s content_hash');

  const { rows: relationshipRows } = await query('SELECT count(*)::int AS n FROM hci.source_relationships');
  assertEqual(relationshipRows[0].n, 0, 'hci.source_relationships has zero rows -- candidate hints are never persisted there');

  // Second organization, different origin -- proves the candidate-hint
  // predicate is origin-scoped (would NOT list acme-corp.example as a
  // candidate for a totally unrelated domain).
  console.log('Writing a DIFFERENT organization\'s URL -- must NOT show up as a candidate for the first...');
  const unrelated = await writeDiscoveredSource(query, {
    targetUrl: 'https://globex-inc.example/about',
    contentHash: 'c'.repeat(64),
    snapshotRef: 's3://hci-fetch-runner-raw/sha256/' + 'c'.repeat(64),
  });
  assertEqual(unrelated.candidateRelatedSources.length, 0, 'an unrelated-origin URL has no candidate hints from the acme-corp.example sources');

  console.log('Writing a SECOND page on the SAME origin as the first -- must show up as a candidate hint...');
  const samePage = await writeDiscoveredSource(query, {
    targetUrl: 'https://acme-corp.example/investor-relations',
    contentHash: 'd'.repeat(64),
    snapshotRef: 's3://hci-fetch-runner-raw/sha256/' + 'd'.repeat(64),
  });
  const hintIds = samePage.candidateRelatedSources.map((c) => c.sourceId);
  if (!hintIds.includes(first.sourceId)) {
    throw new Error(`ASSERTION FAILED: expected candidateRelatedSources to include the first source (${first.sourceId}) -- same origin, got: ${JSON.stringify(samePage.candidateRelatedSources)}`);
  }
  console.log(`  ok: same-origin page correctly surfaced ${first.sourceId} as a candidate hint (non-authoritative, not written to any table)`);

  console.log('\nHCI-30 sink/hci-discovered write-path verification PASSED (Task 8).');
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err.stack || err.message);
    await pool.end();
    process.exit(1);
  });
