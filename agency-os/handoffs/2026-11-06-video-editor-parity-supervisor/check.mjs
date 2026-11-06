// 監工台的閘：共用規則在 scripts/supervisor-kit/check.mjs；這裡只加跟規格 §3 卡片表的綁定。任何一條破了 exit 1。
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

// 規格 §3 表格第一欄＝卡號，順序與監工台一致；規格不寫狀態。
const plan = readFileSync(path.join(repo, META.plan), 'utf8');
const sec = plan.split(/^## 3\. /m)[1]?.split(/^## /m)[0] || '';
const codes = [...sec.matchAll(/^\| ([^|]+?) \|/gm)].map((m) => m[1]).filter((c) => c !== '卡' && !/^-+$/.test(c));
if (codes.join() !== STEPS.map((s) => s.code).join()) fail(`規格 §3 卡 ${codes.join(',')} ≠ 監工台 ${STEPS.map((s) => s.code).join(',')}`);
if (/✅|🔲|☑|狀態[:：]|\| *(已完成|進行中|未開始) *\|/.test(sec)) fail('規格 §3 寫了狀態；狀態只在 data.mjs');
if (/我們/.test(JSON.stringify({ COPY, NOW, STEPS, OPEN }))) fail('文案出現「我們」');

const items = STEPS.flatMap((s) => s.items);
report(errors, `ok: ${STEPS.length} cards bound to spec §3, ${items.length} items (${items.filter((i) => i.status === 'done').length} done), ${OPEN.length} open, page fresh`);
