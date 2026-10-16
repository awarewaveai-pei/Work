// 監工台的閘。規則全在這裡；任何一條破了 exit 1。
//   node check.mjs            驗 data.mjs 的規則，並確認 supervisor.html 是 build.mjs 最新產物
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AXES, WAYS, STEPS, OPEN, DOORS, NOW, COPY } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const errors = [];
const fail = (m) => errors.push(m);

// 1. 每種方式的三個值都在各軸的值域內；名字不重複
const domain = Object.fromEntries(AXES.map((a) => [a.key, new Set(a.values.map((x) => x.v))]));
for (const w of WAYS) for (const k of Object.keys(domain)) if (!domain[k].has(w[k])) fail(`way ${w.name}: ${k}=${w[k]} 不在軸的值域`);
if (new Set(WAYS.map((w) => w.name)).size !== WAYS.length) fail('WAYS 名字重複');
for (const w of WAYS) if (!w.story) fail(`way ${w.name}: 缺 story（白話例子）`);
if (!COPY || !COPY.nav) fail('缺 COPY.nav');
for (const a of AXES) { if (!a.q) fail(`axis ${a.key}: 缺 q`); for (const v of a.values) if (!v.plain) fail(`axis ${a.key}.${v.v}: 缺 plain`); }

// 2. 順序：編號 1..n 連續；每步有 gate／risk／model／status；done 必有 commit；depends 指向更小的編號
STEPS.forEach((s, i) => {
  if (s.n !== i + 1) fail(`step ${s.n}: 編號不連續`);
  for (const k of ['title', 'plain', 'what', 'gate', 'risk', 'model', 'status']) if (!s[k]) fail(`step ${s.n}: 缺 ${k}`);
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

// 6. 數字只能來自資料：拿掉 <span data-computed>…</span> 後，「N 種／N 項／N／M」不得再出現
const stripped = page.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<span data-computed>[^<]*<\/span>/g, '');
for (const m of stripped.matchAll(/\d+\s*(種|項|／\s*\d)/g)) fail(`手打數字：${m[0]}`);

// 7. 頁面不用「我們」（操作者 2026-10-16）
if (/我們/.test(page)) fail('頁面出現「我們」');

if (errors.length) { console.error(errors.map((e) => 'FAIL ' + e).join('\n')); process.exit(1); }
console.log(`ok: ${WAYS.length} ways, ${STEPS.length} steps, ${OPEN.length} open, page fresh`);
