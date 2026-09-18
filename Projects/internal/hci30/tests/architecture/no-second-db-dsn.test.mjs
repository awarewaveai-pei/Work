// ADR-0007 gate 2, as reconciled by ADR-0021 gate 6: ADR-0007 originally required HCI-30 to live
// inside the shared Supabase instance with no second DSN. ADR-0021 (ACCEPTED, supersedes ADR-0007
// on this one point) later decided the opposite -- a dedicated `hci-postgres` instance, for RLS
// blast-radius isolation from n8n's workflow secrets sharing the same Supabase cluster. This test
// enforces the RECONCILED rule: exactly one non-Supabase DSN/connection-string surface is permitted
// under Projects/internal/hci30/, and it must be the one literally named `hci-postgres`
// (docker-compose.yml service name) or `HCI_DB_*` (app/server.mjs's own env var prefix) -- anything
// else (a second, unexplained DSN) would mean a THIRD database nobody decided on.
//
// This file did not exist before 2026-09-18 -- ADR-0007's gate 2 named it but it was never written,
// discovered while implementing ADR-0021's gates.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hciRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Matches a literal connection-string scheme or a `DATABASE_URL`-shaped env key -- the two forms a
// second DSN could actually take in this codebase's own style (app/server.mjs uses discrete
// HCI_DB_HOST/PORT/USER/PASSWORD/NAME fields, never a single URL string).
const DSN_PATTERNS = [/postgres(?:ql)?:\/\//i, /\bDATABASE_URL\b/];

// The one legitimate DSN surface (app/server.mjs's own pool config) and its own dedicated
// container/volume names -- excluded from the scan, not because it's a DSN-shaped string that
// happens to be safe, but because it IS the ADR-0021-decided one, by construction.
const PERMITTED_MARKERS = ['hci_db_host', 'hci_db_port', 'hci_db_user', 'hci_db_password', 'hci_db_name', 'hci-postgres', 'hci_owner', 'hci_wave1_synthetic'];

const SCANNED_RELATIVE_DIRS = ['app', 'database', 'infra', 'public-intelligence', 'packages'];

function listFilesRecursive(dir) {
  let out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(listFilesRecursive(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export function scanForSecondDsn(rootDir, relativeDirs) {
  const violations = [];
  for (const rel of relativeDirs) {
    const absDir = path.join(rootDir, rel);
    for (const file of listFilesRecursive(absDir)) {
      const relFromRoot = path.relative(rootDir, file);
      const text = fs.readFileSync(file, 'utf8');
      const lower = text.toLowerCase();
      for (const pattern of DSN_PATTERNS) {
        const match = pattern.exec(text);
        if (!match) continue;
        // A DSN-shaped string is only a violation if it does NOT also carry one of the
        // ADR-0021-permitted markers anywhere in the same file -- a file can legitimately
        // mention `postgres://` in a comment explaining why it does NOT use one, for example.
        const permitted = PERMITTED_MARKERS.some((marker) => lower.includes(marker));
        if (!permitted) violations.push({ file: relFromRoot, matched: match[0] });
        break;
      }
    }
  }
  return violations;
}

test('ARCH-DB-NO-SECOND-DSN: no unexplained second database connection surface under hci30', () => {
  const violations = scanForSecondDsn(hciRoot, SCANNED_RELATIVE_DIRS);
  assert.deepEqual(violations, [],
    `found ${violations.length} unexplained DSN-shaped reference(s): ` +
    violations.map((v) => `${v.file} (matched "${v.matched}")`).join('; '));
});

// Non-vacuity (this repo's established discipline, see peer-boundary.test.mjs): prove the detector
// can actually fail before trusting that today it does not.
test('ARCH-DB-NO-SECOND-DSN non-vacuity: the detector actually flags a real unexplained DSN', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'hci-arch-no-second-dsn-'));
  const fixtureDir = path.join(fixtureRoot, 'app');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const fixtureFile = path.join(fixtureDir, 'rogue-client.mjs');
  fs.writeFileSync(fixtureFile, "const pool = new Pool({ connectionString: 'postgres://someone:pw@a-third-database:5432/oops' });\n");
  try {
    const violations = scanForSecondDsn(fixtureRoot, ['app']);
    assert.equal(violations.length, 1, 'detector did not flag the planted second DSN -- it would not have caught a real one either');
    assert.equal(violations[0].matched.toLowerCase(), 'postgres://');

    // The permitted marker really does suppress the detector -- proves PERMITTED_MARKERS isn't
    // just decorative and the test isn't silently vacuous in the OTHER direction either.
    fs.writeFileSync(fixtureFile, "// hci_owner connects via HCI_DB_HOST/PORT env vars, see app/server.mjs\nconst x = 'postgres://placeholder-in-a-comment';\n");
    const suppressed = scanForSecondDsn(fixtureRoot, ['app']);
    assert.deepEqual(suppressed, [], 'a file carrying a permitted ADR-0021 marker must not be flagged');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
