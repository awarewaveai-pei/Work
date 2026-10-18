import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createProduct, DECLARATIONS } from '../new-product.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceApp = path.join(repo, 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin');
const script = path.join(repo, 'scripts/new-product.mjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-new-product-'));
  const app = path.join(root, 'app');
  fs.mkdirSync(path.join(app, 'lib/portal'), { recursive: true });
  fs.mkdirSync(path.join(app, 'app'));
  for (const f of ['package.json', 'lib/portal/products.ts', 'lib/portal/cognitive-features.json']) fs.copyFileSync(path.join(sourceApp, f), path.join(app, f));
  fs.symlinkSync(path.join(sourceApp, 'node_modules'), path.join(app, 'node_modules'), 'junction');
  t.after(() => {
    fs.unlinkSync(path.join(app, 'node_modules'));
    assert(root.startsWith(path.join(os.tmpdir(), 'aw-new-product-')));
    fs.rmSync(root, { recursive: true });
  });
  const run = (args) => spawnSync(process.execPath, [script, '--app', app, ...args], { encoding: 'utf8', input: '' });
  return { app, root, run };
}
const demo = ['--key', 'demo', '--name', '示範', '--subdomain', 'demo', '--page', '/demo', '--login', 'local', '--standalone', 'no', '--features', 'demo.run:QUOTA'];

test('direct CLI creates five paths, a fail-closed can point and ten TODO declarations; refuses overwrite', (t) => {
  const { app, run } = fixture(t);
  const result = run(demo);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 5);
  for (const f of result.stdout.trim().split(/\r?\n/)) assert(fs.existsSync(f));
  const manifest = JSON.parse(fs.readFileSync(path.join(app, 'lib/demo/MODULE_MANIFEST.json')));
  assert.deepEqual(Object.keys(manifest.declarations), DECLARATIONS);
  assert(Object.values(manifest.declarations).every((s) => s === 'TODO'));
  assert.match(fs.readFileSync(path.join(app, 'lib/demo/can-points.ts'), 'utf8'), /throw new Error\("尚未接 can\(\)"\)/);
  const registry = fs.readFileSync(path.join(app, 'lib/portal/products.ts'), 'utf8');
  assert.notEqual(run(demo).status, 0);
  assert.equal(fs.readFileSync(path.join(app, 'lib/portal/products.ts'), 'utf8'), registry);
});

test('Foundry CLI imports the module list and sourced declarations; missing plan exits 2', (t) => {
  const { root, app, run } = fixture(t);
  const project = path.join(root, 'generated');
  fs.mkdirSync(path.join(project, '.foundry/resolution'), { recursive: true });
  fs.mkdirSync(path.join(project, 'docs/modules/core'), { recursive: true });
  const roles = ['00_REQUIREMENTS', '01_ARCHITECTURE', '02_CONTRACTS', '03_SECURITY', '04_DATA_AND_MIGRATION', '05_TEST_STRATEGY', '06_OBSERVABILITY_AND_SRE', '07_ROLLBACK_AND_RECOVERY', '08_IMPLEMENTATION_BACKLOG'];
  for (const role of roles) fs.writeFileSync(path.join(project, 'docs/modules/core', role + '.md'), '# Core contract\n');
  fs.writeFileSync(path.join(project, '.foundry/resolution/foundry-plan.json'), JSON.stringify({ modules: ['core'] }));
  fs.writeFileSync(path.join(project, 'docs/SYSTEM_BLUEPRINT.md'), '## 交付登記\n\n```json\n' + JSON.stringify({ schema_version: 1, name: 'foundry-demo', page: '/foundry-demo', loginSources: ['local'], standalone: false, modules: ['core'], declarations: Object.fromEntries(DECLARATIONS.map((k) => [k, `core contract: ${k}`])) }) + '\n```\n');
  const result = run(['--from-foundry', project, '--key', 'demo2', '--subdomain', 'demo2', '--features', 'demo2.run:QUOTA']);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(app, 'lib/demo2/MODULE_MANIFEST.json')));
  assert(Object.values(manifest.declarations).filter((s) => !s.includes('TODO')).length >= 6);
  assert.match(fs.readFileSync(path.join(app, 'lib/portal/products.ts'), 'utf8'), /"dependsOn": \[\s*"core"/);
  const missing = run(['--from-foundry', path.join(root, 'missing')]);
  assert.equal(missing.status, 2, missing.stderr);
  assert.match(missing.stderr, /no foundry-plan.json/);
});

test('invalid delivery inputs leave no partial registration', (t) => {
  const { app, run } = fixture(t);
  const before = fs.readFileSync(path.join(app, 'lib/portal/products.ts'), 'utf8');
  for (const [flag, value] of [['--key', '../escape'], ['--subdomain', 'app'], ['--page', '/ops'], ['--login', 'customer-wp'], ['--features', 'demo.guard:SAFETY_GATE:contract:true']]) {
    if (value === '/ops') fs.mkdirSync(path.join(app, 'app/(shell)/ops'), { recursive: true });
    const args = [...demo]; args[args.indexOf(flag) + 1] = value;
    const result = run(args);
    assert.notEqual(result.status, 0, result.stdout);
    assert.equal(fs.readFileSync(path.join(app, 'lib/portal/products.ts'), 'utf8'), before);
    assert(!fs.existsSync(path.join(app, 'lib/demo')));
  }
});

test('partial writes preserve the registry and remove only this generation attempt', async (t) => {
  const { app } = fixture(t);
  const registry = path.join(app, 'lib/portal/products.ts');
  const before = fs.readFileSync(registry, 'utf8');
  for (const failure of ['page.tsx', 'products.ts.new-product.tmp']) {
    const open = fs.openSync, write = fs.writeFileSync;
    let failedFd;
    fs.openSync = (file, ...args) => { const fd = open(file, ...args); if (String(file).endsWith(failure)) failedFd = fd; return fd; };
    fs.writeFileSync = (file, content, ...args) => {
      if (typeof file === 'number' && file === failedFd) {
        write(file, String(content).slice(0, 100));
        throw Object.assign(new Error('injected partial write'), { code: 'ENOSPC' });
      }
      return write(file, content, ...args);
    };
    try {
      await assert.rejects(createProduct({ app, key: 'demo', name: '示範', subdomain: 'demo', page: '/demo', login: 'local', standalone: 'no', features: 'demo.run:QUOTA' }), /injected partial write/);
    } finally { fs.openSync = open; fs.writeFileSync = write; }
    assert.equal(fs.readFileSync(registry, 'utf8'), before);
    for (const file of ['app/demo', 'lib/demo', 'lib/portal/products.ts.new-product.tmp', 'lib/portal/products.ts.new-product.lock']) assert(!fs.existsSync(path.join(app, file)), file);
  }
});
