// 從 data.mjs 產生 supervisor.html（claude.ai artifact 頁）。頁面不手改；文字全在 data.mjs，數字全算出來。版面在 scripts/supervisor-kit。
//   node build.mjs      寫 supervisor.html
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { esc, page, section, yesNo, stepList, openList, pathRows } from '../../../scripts/supervisor-kit/build.mjs';
import { META, COPY, NOW, STEPS, OPEN } from './data.mjs';

export function render() {
  const L = COPY.label;
  const P = COPY.paths;
  const code = (s) => `<code>${esc(s)}</code>`;
  const body = [
    section('now', COPY.now, yesNo(NOW, L)),
    section('steps', COPY.steps, stepList(STEPS, L, (s) => `${META.plan} §1b ${s.code}`)),
    section('open', COPY.open, openList(OPEN, STEPS, COPY.open)),
    section('paths', { h: P.h }, pathRows([
      [P.plan, code(`${META.plan} §1b`)],
      [P.adr, code(`${META.adr} §5`)],
      [P.mock, code(META.mock)],
      [P.track, `<span>${code(META.tasks)}<br>${code(META.worklog)}</span>`],
      [P.self, `<span>${code(META.self)}<br>${esc(P.howto)}</span>`],
    ])),
  ].join('\n\n');
  return page({ META, COPY, STEPS, OPEN, body });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  writeFileSync(path.join(here, 'supervisor.html'), render(), 'utf8');
  console.log('wrote supervisor.html');
}
