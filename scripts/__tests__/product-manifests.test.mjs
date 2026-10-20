import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { manifestStatus } from '../product-manifests.mjs';
import { DECLARATIONS } from '../new-product.mjs';

const APP = 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin';
function fixture(manifest) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'));
  fs.mkdirSync(path.join(root, APP, 'lib/demo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'infra'), { recursive: true });
  fs.writeFileSync(path.join(root, 'infra/docker-compose.yml'), 'services:\n  next-admin:\n    image: x\nvolumes:\n  data:\n');
  if (manifest) fs.writeFileSync(path.join(root, APP, 'lib/demo/MODULE_MANIFEST.json'), JSON.stringify(manifest));
  return { root, products: [{ key: 'demo', modules: { manifest: 'lib/demo/MODULE_MANIFEST.json' } }] };
}
const complete = () => ({ schema_version: 1, module_id: 'demo', declarations: Object.fromEntries(DECLARATIONS.map((k) => [k, `${k} fact (lib/demo/x.ts:1)`])),
  services: [{ compose: 'infra/docker-compose.yml', service: 'next-admin' }], env: ['DEMO_API_KEY'] });

test('a manifest with ten declarations, services found in their compose file and env is complete', () => {
  assert.deepEqual(manifestStatus(fixture(complete()))[0], { key: 'demo', ok: true, problems: [] });
});

test('a TODO declaration, a service absent from its compose file or a missing manifest is incomplete', () => {
  const todo = complete(); todo.declarations.invariants = 'TODO: later';
  assert.deepEqual(manifestStatus(fixture(todo))[0].problems, ['declaration invariants']);
  const svc = complete(); svc.services = [{ compose: 'infra/docker-compose.yml', service: 'data' }]; // a volume, not a service
  assert.deepEqual(manifestStatus(fixture(svc))[0].problems, ['service data not in infra/docker-compose.yml']);
  assert.deepEqual(manifestStatus(fixture(null))[0].problems, ['manifest missing']);
});
