// 從 data.mjs 產生 supervisor.html（claude.ai artifact 頁）。頁面不手改；文字全在 data.mjs（COPY 與資料列），數字全算出來。版面在 scripts/supervisor-kit。
//   node build.mjs      寫 supervisor.html
// 段落由上往下：規則 → 現況 → 五種客戶 → 先後與定價 → 待建項目 → 待你決定 → 入口 → 檔案。每項先寫白話與例子，技術值放小字。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { esc, t, page, section, yesNo, ruleList, stepList, stepLink, openList, pathRows } from '../../../scripts/supervisor-kit/build.mjs';
import { META, COPY, RULES, PRIORITY, NEXT, PRICING, DOORS, AXES, WAYS, NOW, STEPS, OPEN, SIDE, DRILL } from './data.mjs';

// 本頁專屬：五種客戶卡、入口列
const CSS = `.ways{display:grid;gap:12px}
.way{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-width:0;border-left:5px solid var(--todo)}
.way.live{border-left-color:var(--done)}
.way header{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.way .k{width:26px;height:26px;border-radius:50%;background:var(--ink);color:var(--paper);text-align:center;line-height:26px;font-weight:700;font-size:13px;flex:none}
.way h3{margin:0;font-size:18px;flex:1;min-width:0}
.way .tag{font-size:13px;color:var(--todo);border:1px solid currentColor;border-radius:999px;padding:1px 9px;white-space:nowrap}
.way.live .tag{color:var(--done)}
.way .story{margin:0 0 10px;font-size:15px}
.way dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0;background:var(--bg);border-radius:8px;padding:8px 10px}
@media (max-width:560px){.way dl{grid-template-columns:1fr}}
.way dt{font-size:12.5px;color:var(--muted)}.way dd{margin:0;font-size:14px;font-weight:500}
.way dd code{display:block;margin-top:2px;background:transparent;padding:0;font-weight:400}
.way .note{margin:8px 0 0;font-size:13px;color:var(--muted)}
ul.doors{list-style:none;margin:0;padding:0;display:grid;gap:8px}
ul.doors li{display:grid;grid-template-columns:72px 1fr;gap:10px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0;font-size:14.5px}
ul.doors li span{min-width:0}`;

export function render() {
  const L = COPY.label;
  const P = COPY.paths;
  const code = (s) => `<code>${esc(s)}</code>`;
  const axisOf = Object.fromEntries(AXES.map((a) => [a.key, a]));
  const val = (k, v) => axisOf[k].values.find((x) => x.v === v);

  const ways = WAYS.map((w, i) => `<article class="way ${w.live ? 'live' : ''}">
    <header><span class="k">${i + 1}</span><h3>${esc(w.name)}<small>${esc(w.zh)}</small></h3><span class="tag">${w.live ? esc(L.live) : esc(L.notLive)}</span></header>
    <p class="story">${esc(w.story)}</p>
    <dl>${AXES.map((a) => `<div><dt>${esc(a.q)}</dt><dd>${esc(val(a.key, w[a.key]).plain)}<code>${esc(w[a.key])}</code></dd></div>`).join('')}</dl>
    <p class="note">${esc(w.note)}</p></article>`).join('');
  const doors = DOORS.map((d) => `<li><b>${esc(d.name)}</b><span><code>${esc(d.host)}</code><br>${esc(d.who)}：${esc(d.does)}<small>${esc(COPY.doors.login)}：${esc(d.login)}</small></span></li>`).join('');
  const linked = (rows) => ruleList(rows.map((p) => ({ h: p.h, t: p.t, small: p.steps.map((d) => stepLink(STEPS, L, d)).join('、') })));
  const side = SIDE.map((x) => `<li><b>${esc(L.also)}</b><span>${esc(x.what)}<small>${x.step ? stepLink(STEPS, L, x.step) : ''}${esc(x.when)}；${esc(x.src)}</small></span></li>`).join('');

  const body = [
    section('rules', COPY.rules, ruleList(RULES)),
    section('now', COPY.now, yesNo(NOW, L)),
    section('ways', COPY.ways, `<div class="ways">${ways}</div>`
      + `
<h3 class="sub-h">${esc(COPY.drill.h)}</h3>
<p class="lead">${esc(COPY.drill.lead)}</p>
`
      + ruleList(DRILL.map((d) => ({ h: d.way, t: `${d.who}：${d.result}`, small: d.axes })))),
    section('priority', COPY.priority, linked(PRIORITY)
      + `\n<h3 class="sub-h">${esc(COPY.priority.next)}</h3>\n<p class="lead">${esc(COPY.priority.nextLead)}</p>\n${linked(NEXT)}`
      + `\n<h3 class="sub-h">${esc(COPY.priority.pricing)}</h3>\n${ruleList(PRICING)}`),
    section('steps', COPY.steps, stepList(STEPS, L, (s) => META.self + s.card)),
    section('open', COPY.open, openList(OPEN, STEPS, COPY.open)),
    section('doors', COPY.doors, `<ul class="doors">${doors}${side}</ul>`),
    section('paths', { h: P.h }, pathRows([
      [P.plan, code(META.adr017)],
      [P.doors, code(META.adr018)],
      [P.platform, `<span>${code(META.adr012)}<br>${code(META.adr015)}</span>`],
      [P.track, `<span>${code(META.tasks)}<br>${code(META.worklog)}</span>`],
      [P.self, `<span>${code(META.self)}<br>${esc(P.howto)}</span>`],
    ])),
  ].join('\n\n');
  const live = WAYS.filter((w) => w.live).length;
  return page({ META, COPY, STEPS, OPEN, body, css: CSS, counts: { ways: t(COPY.ways.count, { total: WAYS.length, live }) } });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  writeFileSync(path.join(here, 'supervisor.html'), render(), 'utf8');
  console.log('wrote supervisor.html');
}
