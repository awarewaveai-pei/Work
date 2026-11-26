// 監工台的閘：共用規則在 scripts/supervisor-kit/check.mjs；這裡加跟 DISPATCH.md §1／§4／§6 的綁定與本頁專屬規則。任何一條破了 exit 1。
//   node check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommon, report } from '../../../scripts/supervisor-kit/check.mjs';
import { META, STEPS, OPEN, NOW, COPY, BATCHES, PROGRESS, COMMITS, GO, RISKS, DECIDE } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const errors = checkCommon({ here, STEPS, OPEN, NOW, COPY, render });
const fail = (m) => errors.push(m);
const ids = STEPS.map((s) => s.code);
const byId = new Map(STEPS.map((s) => [s.code, s]));

// 1. DISPATCH §1：每張卡一列「| 卡 | 白話 | 檔案 | 風險 | 模型 | 依賴 | 批 | 狀態 |」；卡、順序、風險、批必須一致。狀態只在 data.mjs 的 PROGRESS。
const dispatch = readFileSync(path.join(repo, META.dispatch), 'utf8');
const s1 = dispatch.split(/^## 1\. /m)[1]?.split(/^## 2\. /m)[0] || '';
const rows = [...s1.matchAll(/^\|\s*([A-Z]\d+)\s*\|(.*)\|\s*$/gm)].map((m) => {
  const c = m[2].split('|').map((x) => x.trim());
  return { id: m[1], risk: c[2].replace(/\*/g, ''), batch: c[5] };
});
const riskOf = (r) => ({ High: 'High', Medium: 'Medium', Low: 'Low' }[r] || 'Low'); // 「—」（K15 無程式）算 Low
const batchCode = (b) => (/^\d+$/.test(b) ? `b${b}` : b.toLowerCase());
if (rows.length !== 62) fail(`DISPATCH §1 解析到 ${rows.length} 列，應為 62（格式變了？）`);
if (rows.map((r) => r.id).join() !== ids.join()) fail('DISPATCH §1 的卡與順序 ≠ data.mjs');
for (const r of rows) {
  const s = byId.get(r.id);
  if (!s) continue;
  if (riskOf(r.risk) !== s.risk) fail(`${r.id}: 風險 DISPATCH=${r.risk} data=${s.risk}`);
  if (batchCode(r.batch) !== s.batch) fail(`${r.id}: 批 DISPATCH=${r.batch} data=${s.batch}`);
}

// 2. DISPATCH §4：每批的卡
const s4 = dispatch.split(/^## 4\. /m)[1]?.split(/^## 5\./m)[0] || '';
for (const m of s4.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/gm)) {
  const want = m[2].split('、').map((x) => x.trim()).join();
  const b = BATCHES.find((x) => x.code === `b${m[1]}`);
  if (!b) fail(`DISPATCH §4 批 ${m[1]} 不在 data.mjs`);
  else if (b.cards.map((c) => c.id).join() !== want) fail(`批 ${m[1]}: DISPATCH=${want} data=${b.cards.map((c) => c.id).join()}`);
}
if (BATCHES.filter((b) => b.phase === 'P1').length !== 11) fail('第一階段應為 11 批');

// 3. 進度欄位：PROGRESS／COMMITS 的鍵都是真的卡；done 必有 commit；階段值合法
for (const [k, v] of Object.entries(PROGRESS)) {
  if (!byId.has(k)) fail(`PROGRESS 有不存在的卡 ${k}`);
  if (!['todo', 'doing', 'review', 'done'].includes(v)) fail(`PROGRESS.${k} 階段 ${v} 不合法`);
  if (v === 'done' && !COMMITS[k]) fail(`${k} 標 done 但 COMMITS 沒填`);
}
for (const k of Object.keys(COMMITS)) if (PROGRESS[k] !== 'done') fail(`COMMITS.${k} 有 commit 但 PROGRESS 不是 done`);

// 4. 等你決定只放高風險、尚未完成的卡；風險列要有存在的卡
for (const g of GO) {
  const s = byId.get(g.card);
  if (!s) fail(`GO 有不存在的卡 ${g.card}`);
  else if (s.risk !== 'High') fail(`GO ${g.card} 不是高風險卡`);
  else if (s.stage === 'done') fail(`GO ${g.card} 已完成，請從 GO 刪掉`);
  if (!g.what || !g.rollback) fail(`GO ${g.card}: 缺 what／rollback`);
}
for (const r of RISKS) { if (!byId.has(r.card)) fail(`RISKS 有不存在的卡 ${r.card}`); if (!r.said || !r.handling) fail(`RISKS ${r.card}: 缺 said／handling`); }

// 5. DISPATCH §6.6 的高風險卡清單要跟 data.mjs 已排批（b<數字>）的高風險卡一致
const hi = (/High 卡（([^）]+)）/.exec(dispatch)?.[1] || '').split('、').map((x) => x.trim()).sort().join();
const mine = BATCHES.filter((b) => /^b\d+$/.test(b.code)).flatMap((b) => b.cards).filter((c) => c.risk === 'High').map((c) => c.id).sort().join();
if (hi !== mine) fail(`DISPATCH §6 高風險卡 ${hi} ≠ data.mjs ${mine}`);

// 6. 頁面：62 張卡、13 個區段（11 批＋兩階段）都在；沒有下拉選單；沒有橫向捲動的寫死寬度
const html = render();
for (const id of ids) if (!html.includes(`id="${id}"`)) fail(`頁面缺卡 ${id}`);
for (const b of BATCHES) if (!html.includes(`<section id="${b.code}">`)) fail(`頁面缺區段 ${b.code}`);
if (/<select|<option/.test(html)) fail('頁面出現下拉選單');
if ((html.match(/<li class="step[ "]/g) || []).length !== 62 + GO.length + RISKS.length) fail('卡片列數不是 62＋等你決定＋風險');
if (/我們/.test(JSON.stringify({ COPY, BATCHES, GO, RISKS, DECIDE }))) fail('文案出現「我們」');

report(errors, `ok: ${ids.length} cards bound to DISPATCH §1, ${BATCHES.length} sections (${BATCHES.filter((b) => b.phase === 'P1').length} batches bound to §4), ${STEPS.filter((s) => s.stage === 'done').length} done, ${GO.length} waiting for go, ${RISKS.length} risks, page fresh`);
