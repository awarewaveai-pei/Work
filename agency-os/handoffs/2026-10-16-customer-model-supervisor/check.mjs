// 監工台的閘：共用規則在 scripts/supervisor-kit/check.mjs；這裡只加本頁資料與 ADR 017／TASKS 的綁定。任何一條破了 exit 1。
//   node check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommon, report } from '../../../scripts/supervisor-kit/check.mjs';
import { META, AXES, WAYS, STEPS, OPEN, DOORS, NOW, COPY, RULES, PRIORITY, NEXT, PRICING, DRILL } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const errors = checkCommon({ here, STEPS, OPEN, NOW, COPY, render, fields: ['what', 'card'] });
const fail = (m) => errors.push(m);

// 1. 每種方式的三個值都在各軸的值域內；名字不重複
const domain = Object.fromEntries(AXES.map((a) => [a.key, new Set(a.values.map((x) => x.v))]));
for (const w of WAYS) for (const k of Object.keys(domain)) if (!domain[k].has(w[k])) fail(`way ${w.name}: ${k}=${w[k]} 不在軸的值域`);
if (new Set(WAYS.map((w) => w.name)).size !== WAYS.length) fail('WAYS 名字重複');
for (const w of WAYS) if (!w.story) fail(`way ${w.name}: 缺 story（白話例子）`);
for (const a of AXES) { if (!a.q) fail(`axis ${a.key}: 缺 q`); for (const v of a.values) if (!v.plain) fail(`axis ${a.key}.${v.v}: 缺 plain`); }

// 2. 跨檔綁定：ADR 017「順序」條數＝步驟數；TASKS 待決條數＝待決數；每張卡標題是「第 N 項」且不寫狀態
const repo = path.resolve(here, '../..', '..');
const adr = readFileSync(path.join(repo, META.adr017), 'utf8');
const order = adr.split(/^## 順序/m)[1]?.split(/^## /m)[0] || '';
const adrSteps = (order.match(/^\d+\. /gm) || []).length;
if (adrSteps !== STEPS.length) fail(`ADR 017 順序有 ${adrSteps} 條，監工台有 ${STEPS.length} 步`);
const tasks = readFileSync(path.join(repo, 'agency-os/TASKS.md'), 'utf8');
const taskOpen = (tasks.match(/^\s*- \[[ x]\] 待決 \d+：/gm) || []).length;
if (taskOpen !== OPEN.length) fail(`TASKS 有 ${taskOpen} 條待決，監工台有 ${OPEN.length} 條`);
for (const s of STEPS) {
  if (!s.card) continue;
  const card = readFileSync(path.join(here, s.card), 'utf8');
  if (!card.startsWith(`# 第 ${s.n} 項`)) fail(`卡 ${s.card} 標題不是「第 ${s.n} 項」`);
  if (/\*\*狀態\*\*/.test(card)) fail(`卡 ${s.card} 寫了狀態；狀態只在 data.mjs`);
}

// 3. 三扇門三個；規則至少三條；ADR 017 有 §0b 積木契約
if (DOORS.length !== 3) fail('DOORS 不是 3');
if (!Array.isArray(RULES) || RULES.length < 3 || RULES.some((r) => !r.h || !r.t)) fail('RULES 少於 3 條或有空欄');
if (!/### 0b\./.test(adr)) fail('ADR 017 沒有 §0b 積木契約');

// 4. 先後涵蓋每一步恰好一次；定價四條非空；ADR 017 有 Q9、Q10
const covered = PRIORITY.flatMap((p) => p.steps).sort((a, b) => a - b);
if (covered.join() !== STEPS.map((s) => s.n).join()) fail(`PRIORITY 沒有恰好涵蓋每一步一次：${covered.join()}`);
if (PRICING.length < 4 || PRICING.some((p) => !p.h || !p.t)) fail('PRICING 少於 4 條或有空欄');
if (!/^\| 9 \|/m.test(adr) || !/^\| 10 \|/m.test(adr)) fail('ADR 017 缺 Q9／Q10');

// 5. 接下來的順序：每列指向存在的步驟；每個未完成步驟都排進去（漏排＝沒人做）
const stepNs = new Set(STEPS.map((s) => s.n));
for (const x of NEXT) if (!x.h || !x.t || !x.steps.length || x.steps.some((n) => !stepNs.has(n))) fail(`NEXT ${x.h}: 空欄或指向不存在的步驟`);
for (const s of STEPS) if (s.status !== 'done' && !NEXT.some((x) => x.steps.includes(s.n))) fail(`第 ${s.n} 項未完成卻不在 NEXT`);
for (const w of WAYS) if (!DRILL.some((d) => d.way === w.name)) fail(`演練缺「${w.name}」`);
for (const d of DRILL) if (!WAYS.some((w) => w.name === d.way)) fail(`演練「${d.who}」的方式「${d.way}」不在五種裡`);

report(errors, `ok: ${WAYS.length} ways, ${STEPS.length} steps, ${OPEN.length} open, page fresh`);
