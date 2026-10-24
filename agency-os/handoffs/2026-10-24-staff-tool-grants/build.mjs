// 從 data.mjs 產生 supervisor.html（claude.ai artifact 頁；員工逐工具權限）。頁面不手改；文字全在 data.mjs，數字全算出來。版面在 scripts/supervisor-kit。
//   node build.mjs      寫 supervisor.html
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { esc, t, page, section, yesNo, stepList, openList, pathRows, ITEM_CSS } from '../../../scripts/supervisor-kit/build.mjs';
import { META, COPY, NOW, STEPS, OPEN } from './data.mjs';

export function render() {
  const P = COPY.paths;
  const code = (s) => `<code>${esc(s)}</code>`;
  const items = STEPS.flatMap((s) => s.items);
  const sub = t(COPY.sub, { total: STEPS.length, items: items.length, itemsDone: items.filter((it) => it.status === 'done').length });
  const body = [
    section('now', COPY.now, yesNo(NOW, COPY.label)),
    section('steps', COPY.steps, stepList(STEPS, COPY.label, (s) => `${META.plan} §6 ${s.code}`)),
    section('open', COPY.open, openList(OPEN, STEPS, COPY.open)),
    section('paths', { h: P.h }, pathRows([
      [P.plan, code(`${META.plan} §6`)],
      [P.req, code(META.req)],
      [P.track, code(META.worklog)],
      [P.self, `<span>${code(META.self)}<br>${esc(P.howto)}</span>`],
    ])),
  ].join('\n\n');
  // page() 的副標只代入 total；這頁多兩個算出來的數，所以換成本頁的副標
  return page({ META, COPY: { ...COPY, sub: '{total}' }, STEPS, OPEN, body, css: ITEM_CSS })
    .replace(`<p class="sub"><span data-computed>${STEPS.length}</span></p>`, `<p class="sub">${sub}</p>`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  writeFileSync(path.join(here, 'supervisor.html'), render(), 'utf8');
  console.log('wrote supervisor.html');
}
