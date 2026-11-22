// 監工台的閘：共用規則在 scripts/supervisor-kit/check.mjs；這裡加：每張卡有狀態與模型、風險每列有處置、頁面與資料不含色碼。任何一條破了 exit 1。
//   node check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommon, report } from '../../../scripts/supervisor-kit/check.mjs';
import { NOW, STEPS, OPEN, COPY, RISKS, SAFE } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const errors = checkCommon({ here, STEPS, OPEN, NOW, COPY, render, fields: ['code', 'group', 'model', 'status'] });
const fail = (m) => errors.push(m);

// 風險：每列要有卡號、風險、處置；卡號必須是存在的步驟
const codes = new Set(STEPS.map((s) => s.code));
for (const b of RISKS) for (const r of b.rows) {
  if (!codes.has(r.card)) fail(`風險 ${b.batch}/${r.card}: 卡號不存在`);
  if (!r.risk) fail(`風險 ${b.batch}/${r.card}: 缺風險描述`);
  if (!(r.act || '').trim()) fail(`風險 ${b.batch}/${r.card}: 沒有處置`);
}
if (!SAFE.length) fail('缺隔離說明');

// 色碼：資料檔與頁面內容（<style> 以外）不得有 hex；顏色只用主題 token
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const strip = (s) => s.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/href="#[\w-]+"/g, '').replace(/&#\d+;/g, '');
const data = readFileSync(path.join(here, 'data.mjs'), 'utf8');
if (HEX.test(data)) fail('data.mjs 含色碼');
if (HEX.test(strip(render()))) fail('頁面內容含色碼');
if (/<select|<option/i.test(render())) fail('頁面使用了下拉');

report(errors, `ok: ${STEPS.length} cards, ${RISKS.reduce((n, b) => n + b.rows.length, 0)} risk rows with actions, ${OPEN.length} open, page fresh`);
