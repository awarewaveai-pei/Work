// 從 data.mjs 產生 supervisor.html（claude.ai artifact 頁）。頁面不手改；文字全在 data.mjs，數字全算出來。版面在 scripts/supervisor-kit。
//   node build.mjs      寫 supervisor.html
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { esc, t, page, section, yesNo, stepList, openList, ruleList, pathRows, ITEM_CSS, OPEN_CSS } from '../../../scripts/supervisor-kit/build.mjs';
import { META, COPY, NOW, STEPS, OPEN, SAFE, RISKS } from './data.mjs';

const riskTables = () => RISKS.map((b) => `<h3 class="sub-h">${esc(b.batch)}</h3>${b.rows.length
  ? ruleList(b.rows.map((r) => ({ h: r.card, t: r.risk, small: `<b>${esc(COPY.risks.act)}：</b>${esc(r.act)}` })))
  : `<p class="lead">${esc(COPY.risks.empty)}</p>`}`).join('');

export function render() {
  const code = (s) => `<code>${esc(s)}</code>`;
  const P = COPY.paths;
  const body = [
    section('now', COPY.now, yesNo(NOW, COPY.label)),
    section('steps', COPY.steps, stepList(STEPS, COPY.label, (s) => s.card)),
    section('safe', COPY.safe, ruleList(SAFE)),
    section('open', COPY.open, openList(OPEN, STEPS, COPY.open)),
    section('risks', COPY.risks, riskTables()),
    section('paths', { h: P.h }, pathRows([
      [P.plan, code(META.plan)],
      [P.dispatch, code(META.dispatch)],
      [P.self, `<span>${code(META.self)}<br>${esc(P.howto)}</span>`],
    ])),
  ].join('\n\n');
  return page({ META, COPY, STEPS, OPEN, body, css: `${ITEM_CSS}\n${OPEN_CSS}` });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  writeFileSync(path.join(here, 'supervisor.html'), render(), 'utf8');
  console.log('wrote supervisor.html');
}
