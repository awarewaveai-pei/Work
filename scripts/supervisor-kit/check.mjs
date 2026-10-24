// 監工台共用的閘；各監工台的 check.mjs 加自己的跨檔綁定後呼叫 report()。
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { key } from './build.mjs';

// fields：該頁每步另外必填的欄位。回傳錯誤字串陣列。
export function checkCommon({ here, STEPS, OPEN, NOW = [], COPY, render, fields = [] }) {
  const errors = [];
  const fail = (m) => errors.push(m);
  const byKey = new Map(STEPS.map((s) => [key(s), s]));
  if (byKey.size !== STEPS.length) fail('步驟鍵重複');

  // 1. 編號 1..n 連續；欄位齊；done 必有 commit；depends 指向更前面的步驟；執行卡檔存在
  STEPS.forEach((s, i) => {
    const id = key(s);
    if (s.n !== i + 1) fail(`${id}: 編號不連續`);
    for (const k of ['plain', 'title', 'gate', 'risk', 'model', 'status', ...fields]) if (!s[k]) fail(`${id}: 缺 ${k}`);
    if (!['not_started', 'in_progress', 'done'].includes(s.status)) fail(`${id}: status ${s.status}`);
    if (s.status === 'done' && !/^[0-9a-f]{9,}$/.test(s.commit || '')) fail(`${id}: done 沒有 commit`);
    for (const d of s.depends || []) if (!byKey.has(d) || !(byKey.get(d).n < s.n)) fail(`${id}: depends ${d} 不在前面`);
    if (s.card && !existsSync(path.join(here, s.card))) fail(`${id}: 執行卡 ${s.card} 不存在`);
  });

  // 1b. 選用的 items：id 不重複；status 只有 done／todo；done 必有 commit；步驟狀態跟 items 一致
  const itemIds = new Set();
  for (const s of STEPS) {
    if (!s.items) continue;
    const id = key(s);
    for (const it of s.items) {
      if (itemIds.has(it.id)) fail(`${id}: 工作項 ${it.id} 重複`);
      itemIds.add(it.id);
      if (!it.plain) fail(`${it.id}: 缺 plain`);
      if (!['done', 'todo'].includes(it.status)) fail(`${it.id}: status ${it.status}`);
      if (it.status === 'done' && !/^[0-9a-f]{9,}$/.test(it.commit || '')) fail(`${it.id}: done 沒有 commit`);
    }
    const n = s.items.filter((it) => it.status === 'done').length;
    const want = n === 0 ? 'not_started' : n === s.items.length ? 'done' : 'in_progress';
    if (s.status !== want) fail(`${id}: 工作項 ${n}/${s.items.length} 完成，status 應為 ${want}，寫的是 ${s.status}`);
  }

  // 2. 待決每條指向存在的步驟，且那步的 before 寫了「待決 n」；before 不得寫不存在的待決
  for (const o of OPEN) {
    const s = byKey.get(o.before);
    if (!s) fail(`待決 ${o.n}: before=${o.before} 不存在`);
    else if (!(s.before || '').includes(`待決 ${o.n}`)) fail(`待決 ${o.n}: ${key(s)}.before 沒寫「待決 ${o.n}」`);
  }
  for (const s of STEPS) for (const m of (s.before || '').matchAll(/待決 (\d+)/g)) if (!OPEN.some((o) => o.n === +m[1])) fail(`${key(s)}: 寫了不存在的待決 ${m[1]}`);

  // 3. 現況只有 yes／no
  for (const r of NOW) if (!['yes', 'no'].includes(r.state)) fail(`NOW ${r.what}: state ${r.state}`);
  if (!COPY || !COPY.nav) fail('缺 COPY.nav');

  // 4. 頁面是最新產物（沒有手改 html）
  const file = path.join(here, 'supervisor.html');
  const page = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (page !== render()) fail('supervisor.html 不是 build.mjs 的最新產物：跑 node build.mjs');

  // 5. 數字只能來自資料：拿掉 <span data-computed>…</span> 後，「N 種／項／張／則／N／M」不得再出現
  const stripped = page.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<span data-computed>[^<]*<\/span>/g, '');
  for (const m of stripped.matchAll(/\d+\s*(種|項|張|則|／\s*\d)/g)) fail(`手打數字：${m[0]}`);

  // 6. 頁面不用「我們」（操作者 2026-10-16）
  if (/我們/.test(page)) fail('頁面出現「我們」');
  return errors;
}

export function report(errors, ok) {
  if (errors.length) { console.error(errors.map((e) => 'FAIL ' + e).join('\n')); process.exit(1); }
  console.log(ok);
}
