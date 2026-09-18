// ADR-0007 gate 1: HCI-30's deployed application lives as service blocks inside the single existing
// deployment orchestration surface (lobster-factory/infra/hetzner-phase1-core/docker-compose.yml,
// see hci-db-isolation.test.mjs's own gate-1 check for that half) -- not a second docker-compose*.yml
// under Projects/internal/hci30/ that is itself deployed anywhere.
//
// Exemption list intentionally covers THREE files, not the one gate 1's own original text named:
// compose.test.yml (the literal exemption in ADR-0007's text) plus compose.dev.yml and
// compose.fetch-runner.yml, both pre-existing, both already critic-reviewed, and both carrying the
// identical "local/test only, never deployed to ks-aw-01" self-declaration this gate's own logic
// exempts compose.test.yml for -- found stale while implementing ADR-0021's gates, 2026-09-18: the
// text only ever named one of the three files that already satisfy its own stated reasoning.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hciRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const EXEMPT_RELATIVE_PATHS = [
  path.join('infra', 'local', 'compose.test.yml'),
  path.join('infra', 'local', 'compose.dev.yml'),
  path.join('infra', 'local', 'compose.fetch-runner.yml'),
];

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

export function findParallelDeployStacks(rootDir) {
  const violations = [];
  for (const file of listFilesRecursive(rootDir)) {
    if (!/docker-compose.*\.ya?ml$|^compose.*\.ya?ml$/i.test(path.basename(file))) continue;
    const relFromRoot = path.relative(rootDir, file);
    if (EXEMPT_RELATIVE_PATHS.includes(relFromRoot)) {
      // Exempt by path, but only while it stays non-deployed: a non-empty top-level `ports:` list
      // under a service (host port publish) would turn a test-only fixture into a de facto second
      // deployed stack, which this gate exists to forbid regardless of the file's name/location.
      const text = fs.readFileSync(file, 'utf8');
      if (/^\s+ports:\s*\n\s+- ['"]?0\.0\.0\.0/m.test(text)) {
        violations.push({ file: relFromRoot, reason: 'exempt local/test compose file publishes a 0.0.0.0 port -- would make it a de facto deployed stack' });
      }
      continue;
    }
    violations.push({ file: relFromRoot, reason: 'a docker-compose*.yml file exists outside the exempted local/test set' });
  }
  return violations;
}

test('ARCH-NO-PARALLEL-DEPLOY-STACK (ADR-0007 gate 1): no second deployed compose surface under hci30', () => {
  const violations = findParallelDeployStacks(hciRoot);
  assert.deepEqual(violations, [],
    `found ${violations.length} parallel-deploy-stack violation(s): ` +
    violations.map((v) => `${v.file} (${v.reason})`).join('; '));
});

// Non-vacuity (this repo's established discipline): prove the detector can actually fail.
test('ARCH-NO-PARALLEL-DEPLOY-STACK non-vacuity: the detector actually flags a real violation', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'hci-arch-no-parallel-stack-'));
  try {
    fs.mkdirSync(path.join(fixtureRoot, 'infra', 'prod'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'infra', 'prod', 'docker-compose.prod.yml'), 'services:\n  hci-app:\n    image: hci30-app\n');
    const violations = findParallelDeployStacks(fixtureRoot);
    assert.equal(violations.length, 1, 'detector did not flag a real second deploy-shaped compose file');
    assert.match(violations[0].file, /docker-compose\.prod\.yml$/);

    // The exempt set really does suppress the detector for the three legitimate local/test files.
    fs.mkdirSync(path.join(fixtureRoot, 'infra', 'local'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'infra', 'local', 'compose.dev.yml'), 'services:\n  db:\n    image: postgres:15.8\n');
    const stillOne = findParallelDeployStacks(fixtureRoot);
    assert.equal(stillOne.length, 1, 'an exempt local/test file must not itself be flagged');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
