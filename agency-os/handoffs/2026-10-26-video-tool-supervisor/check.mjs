// 監工台的閘：共用規則在 scripts/supervisor-kit/check.mjs；這裡只加跟計畫 §7 的綁定。任何一條破了 exit 1。
//   node check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommon, report } from '../../../scripts/supervisor-kit/check.mjs';
import { META, NOW, STEPS, OPEN, COPY } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const errors = checkCommon({ here, STEPS, OPEN, NOW, COPY, render, fields: ['code', 'group', 'items'] });
const fail = (m) => errors.push(m);

// 計畫 §7：每個「### Vn」= 一個階段；表格第一欄「| Vn.m |」= 該階段的卡；標題不寫狀態（狀態只在 data.mjs）。
const plan = readFileSync(path.join(repo, META.plan), 'utf8');
const sec7 = plan.split(/^## 7\. /m)[1]?.split(/^## /m)[0] || '';
const phases = sec7.split(/^### /m).slice(1).map((b) => ({ code: (b.match(/^(V\d+)/) || [])[1], head: b.split('\n')[0], body: b }));
const planCodes = phases.map((p) => p.code).filter(Boolean);
if (planCodes.join() !== STEPS.map((s) => s.code).join()) fail(`計畫 §7 階段 ${planCodes.join(',')} ≠ 監工台 ${STEPS.map((s) => s.code).join(',')}`);
for (const p of phases) {
  if (/✅|🔲|已完成|進行中/.test(p.head)) fail(`${p.code}: 計畫標題寫了狀態；狀態只在 data.mjs`);
  const ids = [...p.body.matchAll(/^\| (V\d+\.\d+) /gm)].map((m) => m[1]);
  const ours = (STEPS.find((x) => x.code === p.code)?.items || []).map((it) => it.id);
  if (ids.join() !== ours.join()) fail(`${p.code}: 計畫卡號 ${ids.join(',')} ≠ 監工台 ${ours.join(',')}`);
}

const items = STEPS.flatMap((s) => s.items);
report(errors, `ok: ${STEPS.length} phases, ${items.length} items bound to plan §7 (${items.filter((i) => i.status === 'done').length} done), ${OPEN.length} open, page fresh`);
