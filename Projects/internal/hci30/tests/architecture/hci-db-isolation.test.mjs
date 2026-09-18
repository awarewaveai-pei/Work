// ADR-0021 gate 1: hci-postgres must be a dedicated compose service with its own named volume,
// never a bind-mount under lobster-factory/infra/supabase/volumes/ (that would silently put its
// data on the shared Supabase instance's own disk layout, defeating the whole point of a
// "physically isolated" second instance), and no OTHER service besides hci-app itself may hold a
// connection string pointing at host `hci-postgres` (ADR-0021's isolation is meaningless if a third
// service quietly gets direct access).
//
// Text-scan of the compose YAML, not a full parser -- matches this repo's own established
// convention for architecture tests (peer-boundary.test.mjs, no-second-db-dsn.test.mjs) and avoids
// a new YAML-parsing dependency for a check this simple. Service-block extraction relies on
// docker-compose's own indentation convention (2-space service names under `services:`, 4-space
// properties) -- fixture-proven below, not assumed.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const COMPOSE_PATH = path.join(repoRoot, 'lobster-factory', 'infra', 'hetzner-phase1-core', 'docker-compose.yml');

/** Extracts one top-level service's block (its own lines, up to but excluding the next top-level
 *  services-section key or a lower-indented section like `volumes:`/`networks:`). Returns null if
 *  the service does not exist in this file yet. */
export function extractServiceBlock(composeText, serviceName) {
  const lines = composeText.split('\n');
  const startPattern = new RegExp(`^  ${serviceName}:\\s*$`);
  const start = lines.findIndex((l) => startPattern.test(l));
  if (start === -1) return null;
  const block = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    // A line indented less than 4 spaces (and non-blank) ends this service's block -- either the
    // next top-level service (2-space) or a top-level section like `volumes:`/`networks:` (0-space).
    if (lines[i].trim() !== '' && !/^ {4,}/.test(lines[i])) break;
    block.push(lines[i]);
  }
  return block.join('\n');
}

/** Every OTHER top-level service block's text (for the "nobody else talks to hci-postgres"
 *  half of the check) -- same extraction logic, applied to every service name found in the file. */
function extractAllOtherServiceBlocks(composeText, excludeServiceName) {
  const names = [...composeText.matchAll(/^ {2}([a-zA-Z0-9_-]+):\s*$/gm)].map((m) => m[1]);
  return names.filter((n) => n !== excludeServiceName).map((n) => ({ name: n, block: extractServiceBlock(composeText, n) }));
}

/** Strips full-line comments before checking content -- a block's own explanatory prose (e.g.
 *  "physically isolated from the shared Supabase instance") legitimately mentions "supabase" and
 *  must not trip a check that only cares about actual YAML values like a volume path. */
function stripComments(text) {
  return text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
}

/** The `volumes:` sub-list's own entry lines only (` - name:/path` or ` - path:path`), not the
 *  whole service block -- ADR-0021 gate 1 is specifically about volume PATHS, and a `:?message`
 *  required-env-var directive elsewhere in the block (e.g. POSTGRES_PASSWORD's own error text) is
 *  free to mention "Supabase" in prose without that being a volume-path violation. */
function extractVolumesList(serviceBlockText) {
  const lines = stripComments(serviceBlockText).split('\n');
  const start = lines.findIndex((l) => /^ {4}volumes:\s*$/.test(l));
  if (start === -1) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() !== '' && !/^ {6,}/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

export function checkHciDbIsolation(composeText) {
  const violations = [];
  const hciPostgresBlock = extractServiceBlock(composeText, 'hci-postgres');
  if (hciPostgresBlock === null) {
    // ADR-0021 gate 1 not implemented yet -- reported as its own violation rather than a silent
    // pass, so this test cannot be satisfied by simply never adding the service.
    violations.push({ kind: 'MISSING_SERVICE', detail: 'no hci-postgres service block found' });
    return violations;
  }
  if (/supabase/i.test(extractVolumesList(hciPostgresBlock))) {
    violations.push({ kind: 'VOLUME_UNDER_SUPABASE', detail: 'hci-postgres\'s volumes: list references "supabase" -- must use its own hci_-prefixed named volume, never a path under infra/supabase/' });
  }
  for (const other of extractAllOtherServiceBlocks(composeText, 'hci-postgres')) {
    if (other.name.startsWith('hci-')) continue; // hci-app itself is the one permitted consumer
    if (other.block && /\bhci-postgres\b/.test(stripComments(other.block))) {
      violations.push({ kind: 'UNEXPECTED_CONSUMER', detail: `service "${other.name}" references hci-postgres directly` });
    }
  }
  return violations;
}

test('ARCH-DB-ISOLATION (ADR-0021 gate 1): hci-postgres exists, uses its own volume, has no unexpected consumer', () => {
  const composeText = fs.readFileSync(COMPOSE_PATH, 'utf8');
  const violations = checkHciDbIsolation(composeText);
  assert.deepEqual(violations, [], `hci-db-isolation violations: ${JSON.stringify(violations)}`);
});

// Non-vacuity (this repo's established discipline): prove each violation kind is actually
// detectable before trusting that today none are present.
test('ARCH-DB-ISOLATION non-vacuity: the detector actually flags each violation kind', () => {
  const missing = checkHciDbIsolation('services:\n  next-admin:\n    image: foo\n');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].kind, 'MISSING_SERVICE');

  const volumeViolation = checkHciDbIsolation(
    'services:\n  hci-postgres:\n    image: postgres:15.8\n    volumes:\n      - ../supabase/volumes/hci-data:/var/lib/postgresql/data\n',
  );
  assert.equal(volumeViolation.length, 1);
  assert.equal(volumeViolation[0].kind, 'VOLUME_UNDER_SUPABASE');

  const consumerViolation = checkHciDbIsolation(
    'services:\n  hci-postgres:\n    image: postgres:15.8\n    volumes:\n      - hci_pgdata:/var/lib/postgresql/data\n' +
    '  n8n:\n    image: n8n\n    environment:\n      DB_HOST: hci-postgres\n',
  );
  assert.equal(consumerViolation.length, 1);
  assert.equal(consumerViolation[0].kind, 'UNEXPECTED_CONSUMER');

  // The clean case really does pass -- proves the detector isn't just permanently red.
  const clean = checkHciDbIsolation(
    'services:\n  hci-postgres:\n    image: postgres:15.8\n    volumes:\n      - hci_pgdata:/var/lib/postgresql/data\n' +
    '  hci-app:\n    image: hci30-app\n    environment:\n      HCI_DB_HOST: hci-postgres\n',
  );
  assert.deepEqual(clean, []);
});
