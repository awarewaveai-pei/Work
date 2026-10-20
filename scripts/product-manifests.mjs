// One definition of a complete product MODULE_MANIFEST.json (System Foundry V17-8). Used by the v1.7 supervisor to
// count progress and by V17-8's closing test; format = new-product.mjs manifest + services/env (customer-model step-5.md:6).
//   services: [{ compose: "<repo-relative compose file>", service: "<service key under services:>" }]
//   env:      ["NAME", ...]  names the customer supplies (ADR 017 §5 inventory)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECLARATIONS } from './new-product.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin';
const PRODUCTS = 'agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/awarewave-products.json';
const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// products default to the Foundry export of products.ts (sync-foundry-catalog.mjs keeps it equal), so no tsx is needed.
export function manifestStatus({ root = repo, products } = {}) {
  products ??= JSON.parse(fs.readFileSync(path.join(root, PRODUCTS), 'utf8')).products;
  return products.map((p) => {
    const file = path.join(root, APP, p.modules.manifest);
    if (!fs.existsSync(file)) return { key: p.key, ok: false, problems: ['manifest missing'] };
    let m;
    try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { key: p.key, ok: false, problems: ['manifest is not JSON'] }; }
    const problems = [];
    if (m.module_id !== p.key) problems.push(`module_id ${m.module_id}`);
    for (const k of DECLARATIONS) {
      const v = m.declarations?.[k];
      if (typeof v !== 'string' || !v.trim() || /TODO/.test(v)) problems.push(`declaration ${k}`);
    }
    if (!Array.isArray(m.services) || !m.services.length) problems.push('services missing');
    else for (const s of m.services) {
      const compose = s?.compose && path.join(root, s.compose);
      if (!compose || !fs.existsSync(compose)) { problems.push(`compose file ${s?.compose}`); continue; }
      const block = fs.readFileSync(compose, 'utf8').split(/^services:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
      if (!new RegExp(`^  ${escape(s.service)}:\\s*$`, 'm').test(block)) problems.push(`service ${s.service} not in ${s.compose}`);
    }
    if (!Array.isArray(m.env) || m.env.some((e) => typeof e !== 'string' || !e.trim())) problems.push('env missing');
    return { key: p.key, ok: problems.length === 0, problems };
  });
}
