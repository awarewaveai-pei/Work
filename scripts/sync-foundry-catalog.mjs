#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultApp = path.join(root, 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin');
const defaultFoundry = path.join(root, 'agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE');
const encode = (value) => JSON.stringify(value, null, 2) + '\n';
const suffix = (key) => key.toUpperCase();
const capId = (key) => `CAP-AW-${suffix(key)}`;
const moduleId = (key) => `aw-${key}`;
const managedCap = (id) => id.startsWith('CAP-AW-');

export async function syncCatalog({ app = defaultApp, foundry = defaultFoundry, check = false } = {}) {
  app = path.resolve(app); foundry = path.resolve(foundry);
  const require = createRequire(path.join(app, 'package.json'));
  const { tsImport } = require('tsx/esm/api');
  const { PRODUCTS } = await tsImport(pathToFileURL(path.join(app, 'lib/portal/products.ts')).href, import.meta.url);
  const read = async (rel) => JSON.parse(await readFile(path.join(foundry, rel), 'utf8'));
  const [questions, capabilities, rules, manifests, obligations] = await Promise.all([
    read('questionnaires/catalog.json'), read('capabilities/catalog.json'), read('rules/question-rules.json'),
    read('generation/module-manifests.json'), read('generation/module-obligations.json'),
  ]);
  const products = [...PRODUCTS].sort((a, b) => a.key.localeCompare(b.key, 'en'));
  const byKey = new Map(products.map((p) => [p.key, p]));
  if (byKey.size !== products.length) throw new Error('duplicate product key');
  for (const p of products) {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(p.key)) throw new Error(`invalid product key: ${p.key}`);
    if (!p.name || !p.description || !Array.isArray(p.modules?.dependsOn) || !p.modules.manifest) {
      throw new Error(`${p.key}: missing product description or modules declaration`);
    }
  }

  // The AW namespace is generated as a unit; native Foundry rows keep their content and order.
  questions.categories = questions.categories.filter((c) => c.id !== 'AW');
  questions.questions = questions.questions.filter((q) => !q.id.startsWith('Q-AW-'));
  capabilities.capabilities = capabilities.capabilities.filter((c) => !managedCap(c.id));
  rules.rules = rules.rules.filter((r) => !r.id.startsWith('RULE-Q-AW-'));
  manifests.modules = manifests.modules.filter((m) => !m.id.startsWith('aw-')).map((m) => ({
    ...m, activated_by: m.activated_by.filter((cid) => !managedCap(cid)),
  }));
  for (const mid of Object.keys(obligations.modules)) if (mid.startsWith('aw-')) delete obligations.modules[mid];
  const nativeModules = new Map(manifests.modules.map((m) => [m.id, m]));
  const dependencyCaps = new Map();
  const dependency = (dep) => {
    const productKey = byKey.has(dep) ? dep : dep.startsWith('aw-') ? dep.slice(3) : null;
    if (productKey && byKey.has(productKey)) return capId(productKey);
    const native = nativeModules.get(dep);
    if (!native) throw new Error(`unknown product/module dependency: ${dep}`);
    // A dependency on an existing module activates only that module, not all of its optional capabilities.
    const id = `CAP-AW-DEPENDENCY-${suffix(dep)}`;
    if (products.some((p) => capId(p.key) === id)) throw new Error(`dependency capability collision: ${id}`);
    if (!dependencyCaps.has(id)) {
      dependencyCaps.set(id, { id, name: `AwareWave dependency: ${dep}`, description: `Required module: ${dep}.`, module: dep, requires: [] });
      native.activated_by.push(id);
    }
    return id;
  };
  questions.categories.push({ id: 'AW', order: Math.max(0, ...questions.categories.map((c) => c.order)) + 1,
    title: 'AwareWave 積木', description: '選擇要組裝的 AwareWave 產品；依賴由登記表自動加入。' });
  for (const p of products) {
    const cid = capId(p.key), mid = moduleId(p.key), qid = `Q-AW-${suffix(p.key)}`;
    const requires = [...new Set(p.modules.dependsOn.map(dependency))].sort();
    const sourcePath = path.resolve(app, p.modules.manifest);
    const relativeSource = path.relative(app, sourcePath);
    if (relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) throw new Error(`${p.key}: manifest outside app`);
    let sourceManifest = null;
    try { sourceManifest = JSON.parse(await readFile(sourcePath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT' || p.status === 'available') throw error;
    }
    questions.questions.push({ id: qid, category: 'AW', label: p.name, description: p.description,
      answer_type: 'boolean', required_when_active: true });
    // Acceptance comes only from the product manifest; absent stays absent so report_acceptance_gap.py shows it.
    const acceptance = Array.isArray(sourceManifest?.acceptance) && sourceManifest.acceptance.length
      ? sourceManifest.acceptance.map(({ test, expect }) => ({ test, expect })) : null;
    capabilities.capabilities.push({ id: cid, name: p.name, description: p.description, module: mid, requires, ...(acceptance && { acceptance }) });
    rules.rules.push({ id: `RULE-${qid}`, when: { question: qid, equals: true }, require: [cid] });
    manifests.modules.push({ id: mid, paths: [`packages/${mid}`], activated_by: [cid],
      product_key: p.key, source_manifest: p.modules.manifest, source_module_manifest: sourceManifest });
    obligations.modules[mid] = {
      purpose: p.description,
      invariants: [`Product registry key: ${p.key}.`, `Source module contract: ${p.modules.manifest}.`,
        ...(sourceManifest ? [] : ['TODO: source module manifest is missing; complete its ten declarations before status: available.']),
        'Keep authoritative state and public contracts within the declared module boundary.',
        'Product access uses the shared entitlement contract; no private billing ledger.'],
      security: ['Keep provider secrets in deployment configuration.', 'Authorize each paid feature through the shared entitlement boundary.'],
      tests: ['Verify the product module contract and its declared dependencies before release.'],
      operations: ['Record module logs, metrics, alert ownership and the operational runbook.'],
      recovery: ['Define and verify module migration, rollback and replacement before release.'],
    };
  }
  capabilities.capabilities.push(...[...dependencyCaps.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')));
  // Fail before writing if registry dependencies form a cycle (the resolver must always terminate).
  const caps = new Map(capabilities.capabilities.map((c) => [c.id, c]));
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`capability dependency cycle: ${id}`);
    if (visited.has(id)) return;
    const cap = caps.get(id);
    if (!cap) throw new Error(`unknown capability dependency: ${id}`);
    visiting.add(id); for (const dep of cap.requires) visit(dep);
    visiting.delete(id); visited.add(id);
  }
  for (const id of caps.keys()) visit(id);
  const outputs = new Map([
    ['generation/awarewave-products.json', { schema_version: 1, source: 'lib/portal/products.ts', products }],
    ['questionnaires/catalog.json', questions], ['capabilities/catalog.json', capabilities],
    ['rules/question-rules.json', rules], ['generation/module-manifests.json', manifests],
    ['generation/module-obligations.json', obligations],
  ]);
  const changed = [];
  for (const [rel, data] of outputs) {
    const target = path.join(foundry, rel), content = encode(data);
    let current;
    try { current = await readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current === content) continue;
    changed.push(rel);
    if (!check) { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content, 'utf8'); }
  }
  return changed;
}

async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') options.check = true;
    else if (['--app', '--foundry'].includes(args[i]) && args[i + 1]) { const key = args[i].slice(2); options[key] = args[++i]; }
    else throw new Error(`unknown or incomplete argument: ${args[i]}`);
  }
  const changed = await syncCatalog(options);
  if (options.check && changed.length) { console.error('Foundry catalog drift:\n' + changed.join('\n')); return 1; }
  console.log(`Foundry catalog ${options.check ? 'check PASS' : 'synced'}: ${changed.length} changed files`);
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.message); process.exitCode = 2; });
}
