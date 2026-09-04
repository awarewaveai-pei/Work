// ARCH-PEER-01 (ADR-0001 gate 1) - import/path/SQL-reference boundary between
// HCI-30 and AI LEGO Cognitive Engineering OS.
//
// HCI-30 and AI LEGO are independent peer products (ADR-0001, ACCEPTED):
// neither may reference the other's source tree except through the
// integrations/cognitive-os/ adapter (ADR-0001 gate 1, not yet built - Wave
// 10). This file is that boundary as a machine-enforced test, not prose.
//
// Scans every core-domain directory named in ADR-0001 gate 1
// (domain/, intelligence/, public-intelligence/, database/, api/) for any
// file whose content contains a literal reference to the other product's
// source tree. None of domain/, intelligence/, public-intelligence/, or api/
// exist yet in this Wave 1 skeleton (README.md, no application code built
// yet) - only database/ does. The scan still names all five so this file
// does not need editing the day any of the missing four is created; an
// absent directory scans as zero files, not as a skipped assertion.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hciRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Literal path/name fragments a reference to the other product would
// contain, matched case-insensitively against raw file text - not an
// import-graph analysis (no bundler/resolver exists yet for this skeleton),
// but exactly the "import, require, path string, or SQL reference" surface
// ADR-0001 gate 1 names, and the one a dblink/fdw/import-string coupling
// would actually leave behind in source text.
const BANNED_REFERENCES = [
  'cognitive-engineering-os',
  'ai_lego_cognitive_engineering_os',
];

// The one directory ADR-0001 gate 1 permits to reference the other product
// (not built yet - Wave 10) is excluded from the scan, so building it later
// does not retroactively fail this test.
const EXCLUDED_RELATIVE_DIR = path.join('integrations', 'cognitive-os');

const SCANNED_RELATIVE_DIRS = ['domain', 'intelligence', 'public-intelligence', 'database', 'api'];

function listFilesRecursive(dir) {
  let out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out; // directory not built yet - zero files, not an error
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(listFilesRecursive(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// Exported so the non-vacuity test below exercises the exact same detection
// logic the real assertion uses, not a reimplementation of it that could
// silently drift from what actually runs.
export function scanForCoupling(rootDir, relativeDirs) {
  const violations = [];
  for (const rel of relativeDirs) {
    const absDir = path.join(rootDir, rel);
    for (const file of listFilesRecursive(absDir)) {
      const relFromRoot = path.relative(rootDir, file);
      if (relFromRoot.split(path.sep).slice(0, 2).join(path.sep) === EXCLUDED_RELATIVE_DIR) continue;
      const text = fs.readFileSync(file, 'utf8').toLowerCase();
      for (const banned of BANNED_REFERENCES) {
        if (text.includes(banned)) { violations.push({ file: relFromRoot, banned }); break; }
      }
    }
  }
  return violations;
}

test('ARCH-PEER-01: no HCI core-domain file references AI LEGO Cognitive OS', () => {
  const violations = scanForCoupling(hciRoot, SCANNED_RELATIVE_DIRS);
  assert.deepEqual(violations, [],
    `found ${violations.length} coupling reference(s) outside integrations/cognitive-os/: ` +
    violations.map((v) => `${v.file} (matched "${v.banned}")`).join('; '));
});

// Non-vacuity proof (this repo's established discipline for every negative
// assertion, see database/tests/00_test_harness.sql's header and
// scripts/mutation-check-wave1.ps1): a scan that can never find anything is
// not evidence, it is an unexercised code path. There is no existing
// domain/ file to mutate (nothing has been built there yet), so this test
// creates one, confirms the SAME detector function used above actually
// flags it by content, then removes it - proving the detector can fail
// before trusting that today it does not.
test('ARCH-PEER-01 non-vacuity: the detector actually flags a real violation', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'hci-arch-peer-01-'));
  const fixtureDomainDir = path.join(fixtureRoot, 'domain');
  fs.mkdirSync(fixtureDomainDir, { recursive: true });
  const fixtureFile = path.join(fixtureDomainDir, 'violation.mjs');
  fs.writeFileSync(fixtureFile, "import { run } from '../../Projects/internal/cognitive-engineering-os/ai_lego/index.mjs';\n");
  try {
    const violations = scanForCoupling(fixtureRoot, ['domain']);
    assert.equal(violations.length, 1, 'detector did not flag the planted violation - it would not have caught a real one either');
    assert.equal(violations[0].banned, 'cognitive-engineering-os');

    // Also prove the exclusion path does not swallow a real violation
    // planted anywhere else - only integrations/cognitive-os/ itself is
    // exempt.
    const excludedDir = path.join(fixtureRoot, 'integrations', 'cognitive-os');
    fs.mkdirSync(excludedDir, { recursive: true });
    fs.writeFileSync(path.join(excludedDir, 'adapter.mjs'), "// cognitive-engineering-os adapter, permitted here\n");
    const violationsWithExclusion = scanForCoupling(fixtureRoot, ['domain', 'integrations']);
    assert.equal(violationsWithExclusion.length, 1, 'the permitted adapter directory must not itself be flagged, and must not hide the real domain/ violation');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

