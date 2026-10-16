// 監工台的閘。規則全在這裡；任何一條破了 exit 1。
//   node check.mjs            驗 data.mjs 的規則，並確認 supervisor.html 是 build.mjs 最新產物
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AXES, WAYS, STEPS, OPEN, DOORS, NOW } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const errors = [];
const fail = (m) => errors.push(m);

// 1. 每種方式的三個值都在各軸的值域內；名字不重複
const domain = Object.fromEntries(AXES.map((a) => [a.key, new Set(a.values.map((x) => x.v))]));
for (const w of WAYS) for (const k of Object.keys(domain)) if (!domain[k].has(w[k])) fail(`way ${w.name}: ${k}=${w[k]} 不在軸的值域`);
if (new Set(WAYS.map((w) => w.name)).size !== WAYS.length) fail('WAYS 名字重複');

// 2. 順序：編號 1..n 連續；每步有 gate／risk／model／status；done 必有 commit；depends 指向更小的編號
STEPS.forEach((s, i) => {
  if (s.n !== i + 1) fail(`step ${s.n}: 編號不連續`);
  for (const k of ['title', 'what', 'gate', 'risk', 'model', 'status']) if (!s[k]) fail(`step ${s.n}: 缺 ${k}`);
  if (!['not_started', 'in_progress', 'done'].includes(s.status)) fail(`step ${s.n}: status ${s.status}`);
  if (s.status === 'done' && !/^[0-9a-f]{9,}$/.test(s.commit || '')) fail(`step ${s.n}: done 沒有 commit`);
  for (const d of s.depends) if (!(d < s.n)) fail(`step ${s.n}: depends ${d} 不在前面`);
});

// 3. 待決每條指向一個存在的步驟；該步驟的 before 欄提到它
for (const o of OPEN) {
  const s = STEPS.find((x) => x.n === o.before);
  if (!s) fail(`open ${o.n}: before=${o.before} 不存在`);
  else if (!(s.before || '').includes(`待決 ${o.n}`)) fail(`open ${o.n}: step ${s.n}.before 沒提到「待決 ${o.n}」`);
}

// 4. 三扇門三個、不重複；現況每列 state 只有 yes/no
if (DOORS.length !== 3) fail('DOORS 不是 3');
for (const r of NOW) if (!['yes', 'no'].includes(r.state)) fail(`NOW ${r.what}: state ${r.state}`);

// 5. 頁面是最新產物（沒有手改 html）
const page = readFileSync(path.join(here, 'supervisor.html'), 'utf8');
if (page !== render()) fail('supervisor.html 不是 build.mjs 的最新產物：跑 node build.mjs');

// 6. 頁面裡每個「N 步／N 種／N 扇」都是算出來的（帶 data-computed），不是手打
for (const m of page.matchAll(/(\d+)\s*(個步驟|種方式|扇門|步未開始|步完成)/g)) {
  const before = page.slice(Math.max(0, m.index - 40), m.index);
  if (!before.includes('data-computed')) fail(`手打數字：${m[0]}`);
}

if (errors.length) { console.error(errors.map((e) => 'FAIL ' + e).join('\n')); process.exit(1); }
console.log(`ok: ${WAYS.length} ways, ${STEPS.length} steps, ${OPEN.length} open, page fresh`);
