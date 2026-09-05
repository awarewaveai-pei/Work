import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TRUST_DOMAINS } from '../../../packages/contracts/trust-domains.mjs';

// Critic review, 2026-09-06 M2: a "keep in sync" comment on trust-domains.mjs
// was unenforced -- adding an 8th domain, deleting one, or renaming one all
// left the suite green. This reads the actual CHECK constraint text out of
// the migration so JS-side and SQL-side can never silently diverge (same
// class of cross-artifact check tests/architecture/peer-boundary.test.mjs
// already does by scanning repo source from Node).
const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../database/migrations/0011_wave1_trust_domain_scope_up.sql',
);

test('TRUST_DOMAINS matches the domain CHECK constraint in migration 0011, verbatim and in order', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const match = sql.match(/CHECK \(domain IN \(([^)]*)\)\)/);
  assert.ok(match, 'expected a `CHECK (domain IN (...))` constraint in 0011_wave1_trust_domain_scope_up.sql');
  const sqlDomains = match[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual([...TRUST_DOMAINS], sqlDomains);
});
