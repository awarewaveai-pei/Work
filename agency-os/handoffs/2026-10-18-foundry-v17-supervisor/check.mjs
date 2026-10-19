// 監工台的閘：共用規則在 scripts/supervisor-kit/check.mjs；這裡只加跟 V1_7_HANDOFF_PLAN.md 的綁定。任何一條破了 exit 1。
//   node check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommon, report } from '../../../scripts/supervisor-kit/check.mjs';
import { META, NOW, STEPS, OPEN, COPY } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const errors = checkCommon({ here, STEPS, OPEN, NOW, COPY, render, fields: ['code'] });
const fail = (m) => errors.push(m);

// 跟計畫檔綁定：「### V17-n 標題」的卡號＝步驟卡號、順序相同；標題不寫狀態（狀態只在 data.mjs）；計畫寫「照序做」＝每張卡依賴前一張
const plan = readFileSync(path.join(repo, META.plan), 'utf8');
const heads = [...plan.matchAll(/^### (V17-\d+) ([^\n]*)$/gm)].map((m) => ({ code: m[1], rest: m[2] }));
if (heads.map((h) => h.code).join() !== STEPS.map((s) => s.code).join()) fail(`計畫卡 ${heads.map((h) => h.code).join(',')} ≠ 監工台 ${STEPS.map((s) => s.code).join(',')}`);
for (const h of heads) if (/✅|已完成|進行中|done/i.test(h.rest)) fail(`${h.code}: 計畫標題寫了狀態；狀態只在 data.mjs`);
STEPS.forEach((s, i) => { const want = i ? [STEPS[i - 1].code] : []; if (s.depends.join() !== want.join()) fail(`${s.code}: 照序做，depends 應為 ${want.join(',') || '無'}`); });

report(errors, `ok: ${STEPS.length} cards bound to V1_7_HANDOFF_PLAN.md, ${OPEN.length} open, page fresh`);
