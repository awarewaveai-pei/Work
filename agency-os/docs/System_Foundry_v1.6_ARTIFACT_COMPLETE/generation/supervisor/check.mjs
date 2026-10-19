// 產生專案監工台的閘：共用規則在 ./kit/check.mjs；這裡綁 .foundry/resolution/foundry-plan.json（模組＝步驟、foundation＝規則）。
//   node supervisor/check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkCommon, report } from './kit/check.mjs';
import { META, COPY, RULES, PRIORITY, STEPS, OPEN } from './data.mjs';
import { render } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const errors = checkCommon({ here, STEPS, OPEN, COPY, render, fields: ['code', 'group', 'card'] });
const fail = (m) => errors.push(m);

const plan = JSON.parse(readFileSync(path.join(here, '..', META.planJson), 'utf8'));
const same = (a, b) => [...a].sort().join() === [...b].sort().join();
const diff = (a, b) => `只在 plan：${a.filter((x) => !b.includes(x)).join(',') || '無'}；只在監工台：${b.filter((x) => !a.includes(x)).join(',') || '無'}`;
const codes = STEPS.map((s) => s.code);
if (!same(plan.modules, codes)) fail(`foundry-plan.json modules ≠ 監工台步驟（${diff(plan.modules, codes)}）`);
if (!same(plan.foundation, RULES.map((r) => r.id))) fail(`foundry-plan.json foundation ≠ 監工台規則（${diff(plan.foundation, RULES.map((r) => r.id))}）`);
for (const s of STEPS) if (s.card !== `../cards/${s.code}.md`) fail(`${s.code}: card ${s.card} 不是 ../cards/${s.code}.md`);
if (!same(PRIORITY.flatMap((p) => p.steps), codes)) fail('PRIORITY 沒有恰好涵蓋每一步一次');
const byCode = new Map(STEPS.map((s) => [s.code, s]));
for (const p of PRIORITY) {
  for (const c of p.steps) if (byCode.get(c)?.group !== `L${p.k}`) fail(`${c}: group 不是 L${p.k}`);
  for (const g of p.cycles) if (!g.every((c) => p.steps.includes(c))) fail(`第 ${p.k} 層：互相依賴的 ${g.join(',')} 不在同一層`);
}
// 依賴只能指向更前面的層（同一層＝可同時做，不得互相依賴）
const layerOf = (s) => +String(s?.group).slice(1);
for (const s of STEPS) for (const d of s.depends) if (!(layerOf(byCode.get(d)) < layerOf(s))) fail(`${s.code}: depends ${d} 不在更前面的層`);
for (const r of RULES) if (!r.id || !r.h || !r.t) fail(`規則 ${r.id || '?'}: 缺 id／h／t`);

report(errors, `ok: ${STEPS.length} modules bound to foundry-plan.json, ${RULES.length} rules, ${OPEN.length} open, page fresh`);
