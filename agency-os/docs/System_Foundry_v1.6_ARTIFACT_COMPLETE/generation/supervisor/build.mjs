// 產生專案的監工台（System Foundry v1.7 V17-3）。data.mjs 由 foundry_generate.py 寫；版面在 ./kit（= AwareWave scripts/supervisor-kit 原樣複製）。
//   node supervisor/build.mjs      寫 supervisor/supervisor.html
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { esc, t, page, section, ruleList, stepList, stepLink, openList, pathRows } from './kit/build.mjs';
import { META, COPY, RULES, PRIORITY, STEPS, OPEN } from './data.mjs';

export function render() {
  const L = COPY.label;
  const P = COPY.paths;
  const code = (s) => `<code>${esc(s)}</code>`;
  const cycles = (p) => p.cycles.map((g) => `${esc(COPY.priority.cycle)}${g.map((c) => stepLink(STEPS, L, c)).join('、')}`).join('<br>');
  const layers = PRIORITY.map((p) => `<li><b>${t(COPY.priority.layer, { k: p.k })}</b><span>${esc(COPY.priority.free)}<small>${p.steps.map((c) => stepLink(STEPS, L, c)).join('、')}${p.cycles.length ? `<br>${cycles(p)}` : ''}</small></span></li>`).join('');
  const body = [
    section('rules', COPY.rules, ruleList(RULES)),
    section('priority', COPY.priority, `<ul class="yn rules">${layers}</ul>`),
    section('steps', COPY.steps, stepList(STEPS, L, (s) => s.card.replace(/^\.\.\//, ''))),
    section('open', COPY.open, openList(OPEN, STEPS, COPY.open)),
    section('paths', { h: P.h }, pathRows([
      [P.plan, code(META.plan)],
      [P.planJson, code(META.planJson)],
      [P.self, `<span>${code(META.self)}<br>${esc(P.howto)}</span>`],
    ])),
  ].join('\n\n');
  return page({ META, COPY, STEPS, OPEN, body, counts: { rules: t(COPY.rules.count, { n: RULES.length }) } });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  writeFileSync(path.join(here, 'supervisor.html'), render(), 'utf8');
  console.log('wrote supervisor/supervisor.html');
}
