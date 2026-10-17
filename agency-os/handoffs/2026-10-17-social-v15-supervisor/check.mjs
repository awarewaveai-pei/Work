// 監工台的閘。規則全在這裡；任何一條破了 exit 1。
//   node check.mjs            驗 data.mjs 的規則、跟 PLAN.md §1b 的綁定，並確認 supervisor.html 是 build.mjs 最新產物
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { META, NOW, STEPS, OPEN, COPY } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const errors = [];
const fail = (m) => errors.push(m);

// 1. 每張卡欄位齊；編號 1..n 連續；done 必有 commit；depends 指向更前面的卡
const byCode = Object.fromEntries(STEPS.map((s) => [s.code, s]));
STEPS.forEach((s, i) => {
  if (s.n !== i + 1) fail(`${s.code}: 編號不連續`);
  for (const k of ['code', 'group', 'plain', 'title', 'gate', 'risk', 'model', 'status']) if (!s[k]) fail(`${s.code || s.n}: 缺 ${k}`);
  if (!['not_started', 'in_progress', 'done'].includes(s.status)) fail(`${s.code}: status ${s.status}`);
  if (s.status === 'done' && !/^[0-9a-f]{9,}$/.test(s.commit || '')) fail(`${s.code}: done 沒有 commit`);
  for (const c of s.depends) if (!byCode[c] || !(byCode[c].n < s.n)) fail(`${s.code}: depends ${c} 不在前面`);
});
if (new Set(STEPS.map((s) => s.code)).size !== STEPS.length) fail('卡號重複');

// 2. 跟 PLAN.md §1b 綁定：卡數、卡號一樣；標題括號裡的「Cxx 之後」＝depends；標題不寫狀態（狀態只在這裡）
const plan = readFileSync(path.join(repo, META.plan), 'utf8');
const sec = plan.split(/^## 1b\. /m)[1]?.split(/^## /m)[0] || '';
const heads = [...sec.matchAll(/^### (C\d+) ([^\n]*)$/gm)].map((m) => ({ code: m[1], rest: m[2] }));
const planCodes = heads.map((h) => h.code).sort();
const ourCodes = STEPS.map((s) => s.code).sort();
if (planCodes.join() !== ourCodes.join()) fail(`PLAN §1b 卡 ${planCodes.join(',')} ≠ 監工台 ${ourCodes.join(',')}`);
for (const h of heads) {
  const s = byCode[h.code]; if (!s) continue;
  const paren = (h.rest.match(/（([^）]*)）/) || [])[1] || '';
  const after = paren.split('；').filter((p) => p.includes('之後')).join('；');
  const deps = [...after.matchAll(/C\d+/g)].map((m) => m[0]).filter((c) => byCode[c]).sort();
  if (deps.join() !== [...s.depends].sort().join()) fail(`${h.code}: PLAN 標題寫「${after}」，監工台 depends=${s.depends.join(',')}`);
  if (/✅|已完成|進行中/.test(h.rest)) fail(`${h.code}: PLAN 卡片標題寫了狀態；狀態只在 data.mjs`);
}

// 3. 待決每條指向存在的卡，且那張卡的 before 寫了「待決 n」
for (const o of OPEN) {
  const s = byCode[o.before];
  if (!s) fail(`待決 ${o.n}: before=${o.before} 不存在`);
  else if (!(s.before || '').includes(`待決 ${o.n}`)) fail(`待決 ${o.n}: ${s.code}.before 沒寫「待決 ${o.n}」`);
}
for (const s of STEPS) for (const m of (s.before || '').matchAll(/待決 (\d+)/g)) if (!OPEN.some((o) => o.n === +m[1])) fail(`${s.code}: 寫了不存在的待決 ${m[1]}`);

// 4. 現況只有 yes／no
for (const r of NOW) if (!['yes', 'no'].includes(r.state)) fail(`NOW ${r.what}: state ${r.state}`);
if (!COPY.nav) fail('缺 COPY.nav');

// 5. 頁面是最新產物（沒有手改 html）
const page = readFileSync(path.join(here, 'supervisor.html'), 'utf8');
if (page !== render()) fail('supervisor.html 不是 build.mjs 的最新產物：跑 node build.mjs');

// 6. 數字只能來自資料：拿掉 <span data-computed>…</span> 後，「N 項／N／M」不得再出現
const stripped = page.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<span data-computed>[^<]*<\/span>/g, '');
for (const m of stripped.matchAll(/\d+\s*(項|張|則|／\s*\d)/g)) fail(`手打數字：${m[0]}`);

// 7. 頁面不用「我們」（操作者 2026-10-16）
if (/我們/.test(page)) fail('頁面出現「我們」');

if (errors.length) { console.error(errors.map((e) => 'FAIL ' + e).join('\n')); process.exit(1); }
console.log(`ok: ${STEPS.length} cards bound to PLAN §1b, ${OPEN.length} open, page fresh`);
