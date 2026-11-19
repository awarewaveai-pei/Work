// 監工台的閘：共用規則在 scripts/supervisor-kit/check.mjs；這裡只加跟計畫 §4 卡片的綁定。任何一條破了 exit 1。
//   node check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommon, report } from '../../../scripts/supervisor-kit/check.mjs';
import { META, NOW, STEPS, OPEN, COPY } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const errors = checkCommon({ here, STEPS, OPEN, NOW, COPY, render, fields: ['code', 'items'] });
const fail = (m) => errors.push(m);

// 計畫 §4 每張卡一行「**U<n> 標題（…）**」，順序與監工台一致；計畫不寫狀態。
const plan = readFileSync(path.join(repo, META.plan), 'utf8');
const sec = plan.split(/^## 4\. 卡片/m)[1]?.split(/^## 5\./m)[0] || '';
const codes = [...sec.matchAll(/^\*\*(U\d+) /gm)].map((m) => m[1]);
if (!codes.length) fail('計畫 §4 找不到任何卡（標題或格式變了）');
const own = STEPS.filter((s) => !s.next).map((s) => s.code);
if (codes.join() !== own.join()) fail(`計畫 §4 卡 ${codes.join(',')} ≠ 監工台 ${own.join(',')}`);
if (/✅|🔲|☑|狀態[:：]|\| *(已完成|進行中|未開始) *\|/.test(sec)) fail('計畫 §4 寫了狀態；狀態只在 data.mjs');

// 下一階段計畫 §8：每批一行「**批 n：…**」，每張卡一行「- **N<號> 標題**」，沿用的舊項寫成「**B19**」；批、卡號、所屬的批都要跟監工台一致。
const nextPlan = readFileSync(path.join(repo, META.next), 'utf8');
const sec8 = nextPlan.split(/^## 8\. 卡片/m)[1]?.split(/^## 9\./m)[0] || '';
const planBatches = sec8.split(/^(?=\*\*批 \d+：)/m).slice(1).map((b) => ({
  code: `批${/^\*\*批 (\d+)：/.exec(b)[1]}`,
  ids: [...[...b.matchAll(/^- \*\*(N\d+[a-z]?) /gm)].map((m) => m[1]), ...[...b.matchAll(/\*\*([BR]\d+)\*\*/g)].map((m) => m[1])],
}));
const pageBatches = STEPS.filter((s) => s.next).map((s) => ({ code: s.code, ids: s.items.map((it) => it.id) }));
if (!planBatches.length) fail('下一階段計畫 §8 找不到任何批（標題或格式變了）');
const flat = (bs) => bs.map((b) => `${b.code}[${b.ids.join(',')}]`).join(' ');
if (flat(planBatches) !== flat(pageBatches)) fail(`下一階段計畫 §8 ${flat(planBatches)} ≠ 監工台 ${flat(pageBatches)}`);
if (/✅|🔲|☑|狀態[:：]|\| *(已完成|進行中|未開始) *\|/.test(sec8)) fail('下一階段計畫 §8 寫了狀態；狀態只在 data.mjs');
if (/我們/.test(JSON.stringify({ COPY, NOW, STEPS, OPEN }))) fail('文案出現「我們」');

const items = STEPS.flatMap((s) => s.items);
report(errors, `ok: ${own.length} cards bound to plan §4, ${pageBatches.length} batches bound to next-phase §8, ${items.length} items (${items.filter((i) => i.status === 'done').length} done), ${OPEN.length} open, page fresh`);
