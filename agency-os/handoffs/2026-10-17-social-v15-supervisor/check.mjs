// 監工台的閘：共用規則在 scripts/supervisor-kit/check.mjs；這裡只加跟 PLAN.md §1b 的綁定。任何一條破了 exit 1。
//   node check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommon, report } from '../../../scripts/supervisor-kit/check.mjs';
import { META, NOW, STEPS, OPEN, COPY } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const errors = checkCommon({ here, STEPS, OPEN, NOW, COPY, render, fields: ['code', 'group'] });
const fail = (m) => errors.push(m);

// 跟 PLAN.md §1b 綁定：卡數、卡號一樣；標題括號裡的「Cxx 之後」＝depends；標題不寫狀態（狀態只在這裡）
const byCode = Object.fromEntries(STEPS.map((s) => [s.code, s]));
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

report(errors, `ok: ${STEPS.length} cards bound to PLAN §1b, ${OPEN.length} open, page fresh`);
