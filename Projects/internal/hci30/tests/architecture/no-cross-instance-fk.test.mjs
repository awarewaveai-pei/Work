// ADR-0021 gate 2 (companion to database/tests/wave1-negative-tests.sql's ARCH-DB-03): no migration
// under Projects/internal/hci30/database/ may REFERENCES a table this same migration tree never
// creates. A cross-schema FK into the shared Supabase database (or any other instance) would
// silently reintroduce exactly the coupling ADR-0021's physical-isolation decision exists to
// prevent -- Postgres itself would refuse such a migration at apply time (a real FK cannot span two
// separate Postgres instances), but this test catches the mistake at review time, before a bad
// migration is even attempted against a real database.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database', 'migrations');

const CREATE_TABLE_RE = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g;
const REFERENCES_RE = /REFERENCES\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*\(/g;

/** All `*_up.sql` files only -- a `_down.sql` DROPs tables, it never creates the ones an up-migration
 *  references, and would falsely appear to define nothing. */
function listUpMigrations(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries.filter((f) => f.endsWith('_up.sql')).map((f) => path.join(dir, f));
}

export function findCrossInstanceReferences(dir) {
  const files = listUpMigrations(dir);
  const created = new Set();
  const referencedByFile = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(CREATE_TABLE_RE)) created.add(m[1].toLowerCase());
    const refs = [...text.matchAll(REFERENCES_RE)].map((m) => m[1].toLowerCase());
    if (refs.length) referencedByFile.push({ file: path.basename(file), refs });
  }
  const violations = [];
  for (const { file, refs } of referencedByFile) {
    for (const ref of refs) {
      if (!created.has(ref)) violations.push({ file, referenced: ref });
    }
  }
  return violations;
}

test('ARCH-DB-NO-CROSS-INSTANCE-FK (ADR-0021 gate 2): every REFERENCES target is created in this same migration tree', () => {
  const violations = findCrossInstanceReferences(migrationsDir);
  assert.deepEqual(violations, [],
    `found ${violations.length} reference(s) to a table never created in Projects/internal/hci30/database/migrations/: ` +
    violations.map((v) => `${v.file} -> ${v.referenced}`).join('; '));
});

// Non-vacuity (this repo's established discipline): prove the detector can actually fail.
test('ARCH-DB-NO-CROSS-INSTANCE-FK non-vacuity: the detector actually flags a real cross-instance reference', () => {
  const fixtureDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'hci-arch-no-cross-fk-'));
  try {
    fs.writeFileSync(
      path.join(fixtureDir, '0001_local_up.sql'),
      'CREATE TABLE hci.local_table (id uuid PRIMARY KEY);\n',
    );
    fs.writeFileSync(
      path.join(fixtureDir, '0002_bad_up.sql'),
      'CREATE TABLE hci.child (id uuid PRIMARY KEY, parent_id uuid REFERENCES hci.local_table(id), other_id uuid REFERENCES public.organizations(id));\n',
    );
    const violations = findCrossInstanceReferences(fixtureDir);
    assert.equal(violations.length, 1, 'detector did not flag the planted cross-instance reference -- it would not have caught a real one either');
    assert.equal(violations[0].referenced, 'public.organizations');

    // The legitimate in-tree reference (hci.local_table, created one file earlier) must NOT be
    // flagged -- proves this isn't just "REFERENCES exists = fail," which would make the real test
    // permanently red against HCI-30's own dozens of legitimate intra-tree foreign keys.
    assert.ok(!violations.some((v) => v.referenced === 'hci.local_table'));
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
