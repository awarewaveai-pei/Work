#!/usr/bin/env node
// Writes the public catalog index (lib/portal/catalog-index.ts buildCatalogIndex) to next-admin lib/portal/catalog.json.
// --check: write nothing, exit 1 when the file differs from a fresh export. The same comparison runs in next-admin's
// vitest (lib/portal/__tests__/catalog-index.test.ts), so CI and sg-deploy's npm test gate catch a stale file.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultApp = path.join(root, 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin');

export async function exportCatalog({ app = defaultApp, check = false } = {}) {
  app = path.resolve(app);
  const require = createRequire(path.join(app, 'package.json'));
  const { tsImport } = require('tsx/esm/api');
  const { buildCatalogIndex, encodeCatalogIndex } = await tsImport(
    pathToFileURL(path.join(app, 'lib/portal/catalog-index.ts')).href, import.meta.url);
  const target = path.join(app, 'lib/portal/catalog.json');
  const content = encodeCatalogIndex(buildCatalogIndex());
  let current;
  try { current = await readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const changed = current !== content;
  if (changed && !check) await writeFile(target, content, 'utf8');
  return { target, changed };
}

async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') options.check = true;
    else if (args[i] === '--app' && args[i + 1]) options.app = args[++i];
    else throw new Error(`unknown or incomplete argument: ${args[i]}`);
  }
  const { target, changed } = await exportCatalog(options);
  const rel = path.relative(root, target).split(path.sep).join('/');
  if (options.check && changed) { console.error(`catalog drift: ${rel} differs; run node scripts/export-catalog.mjs`); return 1; }
  console.log(`catalog ${options.check ? 'check PASS' : changed ? 'written' : 'unchanged'}: ${rel}`);
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.message); process.exitCode = 2; });
}
