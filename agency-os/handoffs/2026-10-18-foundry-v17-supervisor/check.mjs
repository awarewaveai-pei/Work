// 監工台的閘：共用規則在 scripts/supervisor-kit/check.mjs；這裡只加跟 V1_7_HANDOFF_PLAN.md 的綁定與完成守衛。任何一條破了 exit 1。
//   node check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommon, report } from '../../../scripts/supervisor-kit/check.mjs';
import { META, NOW, STEPS, OPEN, COPY } from './data.mjs';
import { render, measures } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const errors = checkCommon({ here, STEPS, OPEN, NOW, COPY, render, fields: ['code'] });
const fail = (m) => errors.push(m);

// 跟計畫檔綁定：「### V17-n 標題」的卡號與順序＝步驟；標題不寫狀態；depends＝標題括號「Vxx 之後」，沒寫則為前一張
const plan = readFileSync(path.join(repo, META.plan), 'utf8');
const heads = [...plan.matchAll(/^### (V17-\d+) ([^\n]*)$/gm)].map((m) => ({ code: m[1], rest: m[2] }));
if (heads.map((h) => h.code).join() !== STEPS.map((s) => s.code).join()) fail(`計畫卡 ${heads.map((h) => h.code).join(',')} ≠ 監工台 ${STEPS.map((s) => s.code).join(',')}`);
heads.forEach((h, i) => {
  if (/✅|已完成|進行中|done/i.test(h.rest)) fail(`${h.code}: 計畫標題寫了狀態；狀態只在 data.mjs`);
  const after = [...((h.rest.match(/（([^）]*之後)）/) || [])[1] || '').matchAll(/V17-\d+/g)].map((m) => m[0]);
  const want = after.length ? after : i ? [heads[i - 1].code] : [];
  const s = STEPS.find((x) => x.code === h.code);
  if (s && [...s.depends].sort().join() !== [...want].sort().join()) fail(`${h.code}: 計畫寫 depends ${want.join(',') || '無'}，監工台 ${s.depends.join(',') || '無'}`);
});

// 完成守衛：數字沒到，卡不能標 done（數字由 build.mjs measures() 現算）
const x = measures();
const done = (c) => STEPS.find((s) => s.code === c)?.status === 'done';
if (done('V17-7') && x.gap.n !== 0) fail(`V17-7 標 done，但還有 ${x.gap.n} 個能力沒有驗收`);
if (done('V17-8') && x.manifests.ok !== x.manifests.total) fail(`V17-8 標 done，但 manifest 只有 ${x.manifests.ok}/${x.manifests.total} 完整（缺 ${x.manifests.missing.join(',')}）`);

report(errors, `ok: ${STEPS.length} cards bound to V1_7_HANDOFF_PLAN.md, gap ${x.gap.n}/${x.gap.total}, manifests ${x.manifests.ok}/${x.manifests.total}, page fresh`);
