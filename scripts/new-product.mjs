#!/usr/bin/env node
// One registration path for a small tool or a Foundry delivery package (ADR 017 step 1).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultApp = path.join(repo, 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin');
export const DECLARATIONS = ['state_ownership', 'behavior_ownership', 'public_api_event_contract', 'invariants', 'dependencies', 'failure_isolation_boundary', 'data_lifecycle', 'observability_contract', 'migration_rollback_contract', 'replacement_strategy'];
const marker = '  // NEW_PRODUCT_ROWS:';
const slug = /^[a-z][a-z0-9-]{0,30}$/;
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function readFoundry(directory) {
  let root;
  try { root = fs.realpathSync(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const planPath = root && path.join(root, '.foundry/resolution/foundry-plan.json');
  if (!planPath || !fs.existsSync(planPath)) {
    const error = new Error('no foundry-plan.json'); error.exitCode = 2; throw error;
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert(Array.isArray(plan.modules) && plan.modules.length > 0 && plan.modules.every((m) => typeof m === 'string' && /^[a-z][a-z0-9_-]*$/.test(m)), 'invalid foundry modules');
  const blueprint = fs.readFileSync(path.join(root, 'PLAN.md'), 'utf8');
  const section = blueprint.split(/^## 交付登記\s*$/m)[1];
  const match = section?.match(/^```json\s*\n([\s\S]*?)^```\s*$/m);
  assert(match, 'no 交付登記 JSON in PLAN.md; regenerate the Foundry project');
  const delivery = JSON.parse(match[1]);
  assert(delivery.schema_version === 1, 'unsupported delivery schema');
  assert(JSON.stringify(delivery.modules) === JSON.stringify(plan.modules), 'delivery modules differ from foundry-plan.json');
  // Refuse incomplete packages rather than manufacture declarations from a directory name.
  for (const module of plan.modules) for (const rel of [`docs/modules/${module}/MODULE_MANIFEST.json`, `cards/${module}.md`]) {
    const file = path.join(root, rel);
    assert(fs.existsSync(file), `missing Foundry artifact: ${rel}`);
    assert(fs.readFileSync(file, 'utf8').trim(), `empty Foundry artifact: ${file}`);
  }
  assert(delivery.declarations && DECLARATIONS.every((k) => typeof delivery.declarations[k] === 'string' && delivery.declarations[k].trim()), 'missing Foundry declarations');
  return { plan, delivery };
}

function parseFeatures(text, key) {
  const features = text.split(',').filter(Boolean).map((item) => {
    const parts = item.trim().split(':');
    assert(parts.length >= 2 && parts.length <= 4, `invalid feature: ${item}`);
    const [feature_key, limitKind, billing = 'credits', buyout = limitKind === 'SAFETY_GATE' ? 'false' : 'true'] = parts;
    assert(/^[a-z][a-z0-9_.-]*$/.test(feature_key) && feature_key.startsWith(key + '.'), `feature must start with ${key}.`);
    assert(['QUOTA', 'RATE_LIMIT', 'SAFETY_GATE'].includes(limitKind), `invalid limit kind: ${limitKind}`);
    assert(['contract', 'credits'].includes(billing), `invalid billing: ${billing}`);
    assert(['true', 'false'].includes(buyout), 'buyout must be true or false');
    assert(limitKind !== 'SAFETY_GATE' || buyout === 'false', 'SAFETY_GATE cannot be bought out');
    return { feature_key, name: feature_key, limitKind, billing, buyout: buyout === 'true' };
  });
  assert(features.length && new Set(features.map((f) => f.feature_key)).size === features.length, 'features must be nonempty and unique');
  return features;
}

export async function createProduct(options) {
  const app = fs.realpathSync(options.app ?? defaultApp);
  const registry = path.join(app, 'lib/portal/products.ts');
  const original = fs.readFileSync(registry, 'utf8');
  const from = options['from-foundry'] ? readFoundry(path.resolve(options['from-foundry'])) : null;
  const delivery = from?.delivery;
  const key = options.key ?? delivery?.name;
  const name = options.name ?? delivery?.name;
  const page = options.page ?? delivery?.page;
  const loginSources = options.login ? options.login.split(',') : delivery?.loginSources;
  const standalone = options.standalone === undefined ? delivery?.standalone : options.standalone === 'yes';
  assert(slug.test(key ?? ''), 'invalid or missing --key');
  assert(typeof name === 'string' && name.trim(), 'missing --name');
  assert(slug.test(options.subdomain ?? '') && !['app', 'portal', 'www'].includes(options.subdomain), 'invalid or reserved --subdomain');
  assert(/^\/[a-z][a-z0-9-]{0,30}$/.test(page ?? ''), 'invalid or missing --page');
  assert(Array.isArray(loginSources) && loginSources.includes('local') && loginSources.every((s) => ['local', 'awarewave-wp', 'customer-wp'].includes(s)), 'login sources must include local');
  assert(typeof standalone === 'boolean' && (options.standalone === undefined || ['yes', 'no'].includes(options.standalone)), '--standalone must be yes or no');
  const features = parseFeatures(options.features ?? '', key);
  assert(!standalone || features.every((f) => f.limitKind !== 'SAFETY_GATE'), 'standalone module cannot carry SAFETY_GATE');
  assert(original.split(marker).length === 2, 'registry requires exactly one NEW_PRODUCT_ROWS marker');
  const requireApp = createRequire(path.join(app, 'package.json'));
  const { tsImport } = requireApp('tsx/esm/api');
  const imported = await tsImport(pathToFileURL(registry).href, import.meta.url);
  const { PRODUCTS } = imported.PRODUCTS ? imported : imported.default;
  for (const p of PRODUCTS) {
    assert(p.key !== key, `duplicate key: ${key}`);
    assert(p.subdomain !== options.subdomain, `duplicate subdomain: ${options.subdomain}`);
    assert(p.door.app !== 'next-admin' || p.door.page !== page, `duplicate page: ${page}`);
  }
  // Route groups share the URL namespace. Check every group, not just app/<page>.
  for (const entry of fs.readdirSync(path.join(app, 'app'), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('(')) assert(!fs.existsSync(path.join(app, 'app', entry.name, page.slice(1))), `staff route collision: ${page}`);
  }
  const declarations = Object.fromEntries(DECLARATIONS.map((k) => [k, delivery?.declarations[k] ?? 'TODO']));
  const product = { key, name, description: delivery?.description ?? name, subdomain: options.subdomain,
    door: { app: 'next-admin', page, api: ['/api/' + key], enabled: false }, loginSources: [...new Set(loginSources)], standalone,
    status: 'coming_soon', selfSignup: false, features, accessChannels: ['ui'],
    modules: { dependsOn: from?.plan.modules ?? [], manifest: `lib/${key}/MODULE_MANIFEST.json` }, staffPaths: [] };
  const manifest = { schema_version: 1, module_id: key, declarations,
    configuration: { PUBLIC_BASE_DOMAIN: 'installation base domain', [`PRODUCT_HOST_${key.toUpperCase()}`]: 'optional product host', loginSources: product.loginSources, apiKeys: options.config ?? 'TODO: customer-owned provider keys from installation environment' } };
  const files = new Map([
    [`app${page}/layout.tsx`, 'import type { ReactNode } from "react";\nexport default function ProductLayout({ children }: { children: ReactNode }) {\n  return <div className="shell"><main className="door-main">{children}</main></div>;\n}\n'],
    [`app${page}/page.tsx`, `export const metadata = { title: ${JSON.stringify(name)} };\nexport default function ProductPage() {\n  return <main><h1>{${JSON.stringify(name)}}</h1><p>功能建置中</p></main>;\n}\n`],
    [`lib/${key}/can-points.ts`, `// Step 3 replaces this fail-closed adapter with can(subject, featureKey, actor).\nexport async function requireFeature(subject: string, featureKey: string, actor: string): Promise<never> {\n  void subject; void featureKey; void actor;\n  throw new Error("尚未接 can()");\n}\n`],
    [`lib/${key}/MODULE_MANIFEST.json`, json(manifest)],
  ]);
  // Reject existing directories too, including junctions that would escape the selected app.
  for (const dir of [`app${page}`, `lib/${key}`]) {
    let exists = true; try { fs.lstatSync(path.join(app, dir)); } catch (e) { if (e.code === 'ENOENT') exists = false; else throw e; }
    assert(!exists, `refusing existing path: ${dir}`);
  }
  const row = JSON.stringify(product, null, 4).split('\n').map((line) => '  ' + line).join('\n') + ',\n';
  const nextRegistry = original.replace(marker, row + marker);
  const lock = registry + '.new-product.lock';
  const fd = fs.openSync(lock, 'wx');
  const staging = registry + '.new-product.tmp';
  let stagingFd;
  let stagingCreated = false;
  const created = [];
  const createdDirs = [];
  try {
    for (const dir of [`app${page}`, `lib/${key}`]) { fs.mkdirSync(path.join(app, dir)); createdDirs.push(path.join(app, dir)); }
    for (const [relative, content] of files) {
      const target = path.join(app, relative), output = fs.openSync(target, 'wx');
      created.push(target);
      try { fs.writeFileSync(output, content); } finally { fs.closeSync(output); }
    }
    assert(fs.readFileSync(registry, 'utf8') === original, 'registry changed during generation; retry');
    // A failed write must never truncate the shared registry. Rename only a complete sibling file.
    stagingFd = fs.openSync(staging, 'wx'); stagingCreated = true;
    fs.writeFileSync(stagingFd, nextRegistry); fs.closeSync(stagingFd); stagingFd = undefined;
    assert(fs.readFileSync(registry, 'utf8') === original, 'registry changed during generation; retry');
    fs.renameSync(staging, registry); stagingCreated = false;
  } catch (error) {
    for (const file of created.reverse()) fs.unlinkSync(file);
    for (const dir of createdDirs.reverse()) fs.rmdirSync(dir);
    throw error;
  } finally {
    if (stagingFd !== undefined) fs.closeSync(stagingFd);
    if (stagingCreated) fs.unlinkSync(staging);
    fs.closeSync(fd); fs.unlinkSync(lock);
  }
  return [registry, ...[...files.keys()].map((relative) => path.join(app, relative))];
}

async function main() {
  const { values } = parseArgs({ options: Object.fromEntries(['key', 'name', 'subdomain', 'page', 'login', 'standalone', 'features', 'config', 'app', 'from-foundry'].map((k) => [k, { type: 'string' }])) });
  // A noninteractive invocation never hangs asking for missing inputs.
  if (process.stdin.isTTY) {
    const foundry = values['from-foundry'] ? readFoundry(path.resolve(values['from-foundry'])) : null;
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (const [key, question] of (foundry ? [['subdomain', '子網域'], ['features', '收費功能（demo.run:QUOTA）']] : [
        ['key', '產品 key'], ['name', '產品名稱'], ['subdomain', '1. 子網域'], ['page', '2. 頁面前綴（/demo）'], ['login', '3. 登入來源（逗號分隔，必含 local）'], ['standalone', '4. 可否單獨安裝（yes/no）'], ['config', '5. 客戶 API key 設定位置'], ['features', '收費功能（demo.run:QUOTA）'],
      ])) if (values[key] === undefined) values[key] = await prompt.question(question + ': ');
    } finally { prompt.close(); }
  }
  const files = await createProduct(values);
  console.log(files.join('\n'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = error.exitCode ?? 1; });
}
