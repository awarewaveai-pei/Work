// 監工台的閘：共用規則 scripts/supervisor-kit/check.mjs；另比對 PLAN-R2.md §7 的卡號與順序。任何一條破了 exit 1。
//   node check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommon, report } from '../../../scripts/supervisor-kit/check.mjs';
import { META, STEPS, OPEN, NOW, COPY, PROGRESS, COMMITS, RISKS, GO } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const errors = checkCommon({ here, STEPS, OPEN, NOW, COPY, render });
const fail = (m) => errors.push(m);
const ids = STEPS.map((s) => s.code);
const plan = readFileSync(path.resolve(here, '../../..', META.plan), 'utf8');
const s7 = plan.split(/^## 7\. /m)[1] || '';
const rows = [...s7.matchAll(/^\|\s*(R2-[A-Z]\d?)\s*\|/gm)].map((m) => m[1]);
if (rows.join() !== ids.join()) fail(`PLAN-R2 §7 卡號 ${rows.join()} ≠ data.mjs ${ids.join()}`);
for (const [k, v] of Object.entries(PROGRESS)) {
  if (!ids.includes(k)) fail(`PROGRESS ${k} 不是卡`);
  if (!['todo', 'doing', 'review', 'done'].includes(v)) fail(`PROGRESS ${k}: ${v}`);
}
for (const k of Object.keys(COMMITS)) if (!ids.includes(k)) fail(`COMMITS ${k} 不是卡`);
for (const r of [...RISKS, ...GO]) if (!ids.includes(r.card)) fail(`風險／等你決定 ${r.card} 不是卡`);
report(errors, `OK ${ids.length} 張卡`);
