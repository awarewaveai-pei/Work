import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TRUST_DOMAINS } from '../../../packages/contracts/trust-domains.mjs';
import { ASSESSMENT_DIMENSIONS, DIMENSION_TO_DOMAIN } from '../../../packages/intelligence/assessment-dimensions.mjs';

// HCI_TRUST_DOMAIN_SPEC.md §Roll-up formula: a strict partition -- every
// one of the 14 dimensions assigned exactly once, every one of the 7
// domains receiving exactly two. Proven mechanically here rather than
// trusted from the module's own comment (same lesson as trust-domains.mjs's
// own drift test, critic review 2026-09-06 M2: an unenforced "this should
// add up" claim is not a control).

test('every dimension in ASSESSMENT_DIMENSIONS has exactly one domain assignment', () => {
  for (const dimension of ASSESSMENT_DIMENSIONS) {
    assert.ok(Object.hasOwn(DIMENSION_TO_DOMAIN, dimension), `${dimension} has no domain assignment`);
  }
});

test('DIMENSION_TO_DOMAIN assigns no dimension outside ASSESSMENT_DIMENSIONS', () => {
  for (const dimension of Object.keys(DIMENSION_TO_DOMAIN)) {
    assert.ok(ASSESSMENT_DIMENSIONS.includes(dimension), `${dimension} is assigned but not a real dimension`);
  }
});

test('every domain in TRUST_DOMAINS receives exactly 2 assigned dimensions', () => {
  for (const domain of TRUST_DOMAINS) {
    const assigned = Object.entries(DIMENSION_TO_DOMAIN).filter(([, d]) => d === domain).map(([dim]) => dim);
    assert.equal(assigned.length, 2, `${domain} has ${assigned.length} assigned dimensions, expected 2 (got: ${assigned.join(', ')})`);
  }
});

test('DIMENSION_TO_DOMAIN assigns no domain outside TRUST_DOMAINS', () => {
  for (const domain of Object.values(DIMENSION_TO_DOMAIN)) {
    assert.ok(TRUST_DOMAINS.includes(domain), `${domain} is not a real Trust Domain`);
  }
});

test('the partition is exhaustive: 14 dimensions across 7 domains, 2 each, no overlap', () => {
  assert.equal(ASSESSMENT_DIMENSIONS.length, 14);
  assert.equal(TRUST_DOMAINS.length, 7);
  assert.equal(Object.keys(DIMENSION_TO_DOMAIN).length, 14);
  const uniqueDomainsCovered = new Set(Object.values(DIMENSION_TO_DOMAIN));
  assert.equal(uniqueDomainsCovered.size, 7);
});

// Critic review, 2026-09-06 M1: the spec doc's prose rationale table and
// this module's DIMENSION_TO_DOMAIN had no test binding them together --
// swapping two assignments (e.g. COMPETENCE <-> INTEGRITY_CONSISTENCY)
// passed the whole suite. Fixed the same way trust-domains.test.mjs binds
// to migration 0011's real SQL text: parse the spec's own machine-checked
// appendix block and deepEqual it against the code's actual export.
const specPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/intelligence/HCI_TRUST_DOMAIN_SPEC.md',
);

test('DIMENSION_TO_DOMAIN matches the machine-checked partition block in HCI_TRUST_DOMAIN_SPEC.md, verbatim', () => {
  const spec = readFileSync(specPath, 'utf8');
  const block = spec.match(/```text\n((?:[A-Z_]+ -> [A-Z_]+\n)+)```/);
  assert.ok(block, 'expected a fenced ```text block of "DIMENSION -> DOMAIN" lines in HCI_TRUST_DOMAIN_SPEC.md');
  const specMapping = Object.fromEntries(
    block[1].trim().split('\n').map((line) => line.split(' -> ')),
  );
  assert.deepEqual(specMapping, DIMENSION_TO_DOMAIN);
});

// Critic review, 2026-09-06 M2: the module's own import-time self-check
// verified total count and domain validity but not per-domain arity, so a
// dimension silently reassigned to the wrong domain (leaving one domain
// with 3 assignments and another with 1) imported successfully. This test
// proves the guard now catches that drift mode directly, by re-importing a
// mutated copy in a child process rather than asserting against the
// already-loaded (and therefore already-valid) module.
test('the module throws at import time if a domain ends up with the wrong number of assigned dimensions', async () => {
  const source = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/intelligence/assessment-dimensions.mjs'),
    'utf8',
  );
  const drifted = source.replace("COMPETENCE: 'COMPETENCE',", "COMPETENCE: 'REPUTATIONAL',");
  assert.notEqual(drifted, source, 'the targeted line was not found -- test fixture is stale');

  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'assessment-dimensions-drift-'));
  const contractsDir = path.join(tmpDir, 'contracts');
  await fs.mkdir(contractsDir);
  await fs.copyFile(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/contracts/trust-domains.mjs'),
    path.join(contractsDir, 'trust-domains.mjs'),
  );
  const driftedPath = path.join(tmpDir, 'assessment-dimensions.drifted.mjs');
  await fs.writeFile(driftedPath, drifted.replace("'../contracts/trust-domains.mjs'", "'./contracts/trust-domains.mjs'"));

  await assert.rejects(() => import(`file://${driftedPath.replace(/\\/g, '/')}`), /has \d+ assigned dimensions, expected exactly 2/);
  await fs.rm(tmpDir, { recursive: true, force: true });
});
