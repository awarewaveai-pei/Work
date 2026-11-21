// 監工台的閘：共用規則在 scripts/supervisor-kit/check.mjs；這裡只加跟 R0-PLAN.md §6 的綁定。任何一條破了 exit 1。
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

// 計畫 §6 每節（### Cn）＝一個步驟；表格第一欄的卡號＝該步驟 items；計畫不寫狀態。
const plan = readFileSync(path.join(repo, META.plan), 'utf8');
const sec = plan.split(/^## 6\. /m)[1]?.split(/^## /m)[0] || '';
const cards = sec.split(/^### /m).slice(1).map((b) => ({ code: (b.match(/^(C\d+)/) || [])[1], head: b.split('\n')[0], body: b }));
if (cards.map((c) => c.code).join() !== STEPS.map((s) => s.code).join()) fail(`計畫 §6 卡 ${cards.map((c) => c.code).join(',')} ≠ 監工台 ${STEPS.map((s) => s.code).join(',')}`);
if (/✅|🔲|已完成|進行中/.test(sec)) fail('計畫 §6 寫了狀態；狀態只在 data.mjs');
for (const c of cards) {
  const ids = [...c.body.matchAll(/^\| (C\d+\.\d+) /gm)].map((m) => m[1]);
  const ours = (STEPS.find((s) => s.code === c.code)?.items || []).map((it) => it.id);
  if (ids.join() !== ours.join()) fail(`${c.code}: 計畫卡號 ${ids.join(',')} ≠ 監工台 ${ours.join(',')}`);
}

const items = STEPS.flatMap((s) => s.items);
report(errors, `ok: ${STEPS.length} cards, ${items.length} items bound to plan §6 (${items.filter((i) => i.status === 'done').length} done), ${OPEN.length} open, page fresh`);
