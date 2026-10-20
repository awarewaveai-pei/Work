// 從 data.mjs 產生 supervisor.html（claude.ai artifact 頁）。頁面不手改；文字全在 data.mjs，數字全算出來。版面在 scripts/supervisor-kit。
//   node build.mjs      寫 supervisor.html
// 進度數字每次現算：能力缺驗收數＝Foundry report_acceptance_gap.py（唯一算法），manifest 完整度＝scripts/product-manifests.mjs。
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { esc, t, page, section, yesNo, stepList, openList, pathRows } from '../../../scripts/supervisor-kit/build.mjs';
import { manifestStatus } from '../../../scripts/product-manifests.mjs';
import { META, COPY, NOW, STEPS, OPEN } from './data.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function measures() {
  const foundry = path.join(repo, path.dirname(META.plan));
  const r = spawnSync('python', ['scripts/report_acceptance_gap.py'], { cwd: foundry, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  const m = /ACCEPTANCE GAP: (\d+) of (\d+)/.exec(r.stdout || '');
  if (!m) throw new Error('report_acceptance_gap.py output not parsed: ' + (r.stderr || r.stdout));
  const status = manifestStatus();
  return { gap: { n: +m[1], total: +m[2] }, manifests: { ok: status.filter((s) => s.ok).length, total: status.length, missing: status.filter((s) => !s.ok).map((s) => s.key) } };
}

export function render() {
  const L = COPY.label;
  const P = COPY.paths;
  const M = COPY.measure;
  const x = measures();
  const code = (s) => `<code>${esc(s)}</code>`;
  const row = (ok, html, small = '') => `<li class="${ok ? 'yes' : 'no'}"><b>${esc(ok ? L.yes : L.no)}</b><span>${html}${small ? `<small>${small}</small>` : ''}</span></li>`;
  const measure = `<ul class="yn">${row(x.gap.n === 0, t(M.gap, x.gap), 'V17-7')}${row(x.manifests.ok === x.manifests.total, t(M.manifests, x.manifests), x.manifests.missing.length ? `V17-8；${t(M.missing, { keys: x.manifests.missing.join('、') })}` : 'V17-8')}</ul>`;
  const body = [
    section('now', COPY.now, yesNo(NOW, L)),
    section('measure', M, measure),
    section('steps', COPY.steps, stepList(STEPS, L, (s) => `${META.plan} ${s.code}`)),
    section('open', COPY.open, openList(OPEN, STEPS, COPY.open)),
    section('paths', { h: P.h }, pathRows([
      [P.plan, code(META.plan)],
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
