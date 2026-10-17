// 從 data.mjs 產生 supervisor.html（claude.ai artifact 頁）。頁面不手改；文字全在 data.mjs，數字全算出來。
//   node build.mjs      寫 supervisor.html
// 版面照「客戶怎麼來 監工台」第 5 版（操作者 2026-10-16 接受）：左側欄（標題、進度、各段連結與數量），右側一欄。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { META, COPY, NOW, STEPS, OPEN } from './data.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const t = (s, v = {}) => esc(s).replace(/\{(\w+)\}/g, (_, k) => `<span data-computed>${esc(v[k])}</span>`);
const L = COPY.label;
const STATUS = { not_started: [L.todo, 'todo'], in_progress: [L.doing, 'doing'], done: [L.done, 'done'] };
const riskClass = (r) => (r.startsWith('High') ? 'high' : r.startsWith('Medium') ? 'med' : 'low');

export function render() {
  const done = STEPS.filter((s) => s.status === 'done').length;
  const doing = STEPS.filter((s) => s.status === 'in_progress').length;
  const counts = { now: '', steps: t(COPY.steps.count, { done, total: STEPS.length }), open: t(COPY.open.count, { n: OPEN.length }), paths: '' };
  const nav = Object.entries(COPY.nav).map(([k, label]) => `<a href="#${k}"><span>${esc(label)}</span><small>${counts[k]}</small></a>`).join('');
  const now = NOW.map((r) => `<li class="${r.state}"><b>${r.state === 'yes' ? esc(L.yes) : esc(L.no)}</b><span>${esc(r.what)}<small>${esc(r.ev)}</small></span></li>`).join('');

  const groups = [...new Set(STEPS.map((s) => s.group))];
  const steps = groups.map((g) => {
    const rows = STEPS.filter((s) => s.group === g);
    const head = rows.length > 1 ? `<li class="grp">${esc(L.group)}${rows.map((s) => `<a href="#${s.code}">${esc(s.code)}</a>`).join('、')}</li>` : '';
    return head + rows.map((s) => `<li class="step ${STATUS[s.status][1]}" id="${s.code}">
    <div class="n">${s.n}</div>
    <div class="b">
      <p class="plain">${esc(s.plain)}</p>
      <p class="meta"><span class="pill st-${STATUS[s.status][1]}">${esc(STATUS[s.status][0])}</span><span class="pill risk-${riskClass(s.risk)}">${esc(L.risk)} ${esc(s.risk)}</span><span class="who">${esc(L.who)}：${esc(s.model)}</span>${s.waitFor ? `<span class="who wait">${esc(s.waitFor)}</span>` : ''}</p>
      <p class="donewhen"><b>${esc(L.evidence)}：</b>${esc(s.gate)}</p>
      <details><summary>${esc(L.details)}：${esc(s.code)} ${esc(s.title)}</summary>
        <p><b>${esc(L.depends)}：</b>${s.depends.length ? s.depends.map((c) => `<a href="#${c}">${esc(c)}</a>`).join('、') : esc(L.none)}${s.before ? `；${esc(s.before)}` : ''}</p>
        ${s.decided ? `<p><b>${esc(L.decided)}：</b>${esc(s.decided)}</p>` : ''}
        <p><b>${esc(L.card)}：</b><code>${esc(META.plan)} §1b ${esc(s.code)}</code></p>
        ${s.commit ? `<p><b>${esc(L.doneAt)}：</b><code>${esc(s.commit)}</code></p>` : ''}
      </details>
    </div></li>`).join('');
  }).join('');

  const open = OPEN.map((o) => `<li><div class="n">${o.n}</div><div class="b"><p class="plain">${esc(o.what)}</p><p class="meta"><a href="#${o.before}" class="who">${t(COPY.open.before, { code: o.before })}</a><span class="who">${esc(COPY.open.src)}：${esc(o.src)}</span></p></div></li>`).join('');
  const P = COPY.paths;

  return `<title>${esc(META.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@700&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
/* 左側欄＋右側單欄內容；手機時側欄在上。顏色只載意義：有／沒有、狀態、風險。 */
:root{
  --bg:#f4f5f7; --paper:#ffffff; --ink:#1b2230; --muted:#5d6878; --line:#d8dde5; --accent:#2b4ea2; --rail:#e9ecf1;
  --todo:#8b95a5; --doing:#c2410c; --done:#1f7a3a; --no:#b42318; --high:#b42318; --med:#9a6700; --low:#1f7a3a; --onDot:#ffffff;
  --display:"Noto Serif TC","Songti TC",serif; --body:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif; --mono:"IBM Plex Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121722;--paper:#1b2231;--ink:#e7eaf1;--muted:#9aa5b6;--line:#2c3547;--accent:#92a9ea;--rail:#171d2a;--todo:#7c8698;--doing:#f49c5c;--done:#62c983;--no:#f0776b;--high:#f0776b;--med:#e4b84a;--low:#62c983;--onDot:#121722;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121722;--paper:#1b2231;--ink:#e7eaf1;--muted:#9aa5b6;--line:#2c3547;--accent:#92a9ea;--rail:#171d2a;--todo:#7c8698;--doing:#f49c5c;--done:#62c983;--no:#f0776b;--high:#f0776b;--med:#e4b84a;--low:#62c983;--onDot:#121722;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--body);line-height:1.6;font-size:16px}
.shell{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:100%}
@media (max-width:820px){.shell{grid-template-columns:1fr}}
aside{background:var(--rail);border-right:1px solid var(--line);padding-block:24px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:16px}
@media (max-width:820px){aside{border-right:0;border-bottom:1px solid var(--line);padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:16px}}
aside .in{position:sticky;top:calc(env(safe-area-inset-top,0px) + 16px)}
@media (max-width:820px){aside .in{position:static}}
aside h1{font-family:var(--display);font-size:20px;margin:0 0 4px;text-wrap:balance}
aside .upd{color:var(--muted);font-size:12.5px;margin:0 0 14px}
.bar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:var(--line);margin:0 0 16px}
.bar i{display:block;height:100%}.bar .d{background:var(--done)}.bar .g{background:var(--doing)}
nav{display:grid;gap:2px}
@media (max-width:820px){nav{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}}
nav a{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:7px 10px;border-radius:8px;color:var(--ink);text-decoration:none;font-size:15px}
nav a:hover,nav a:focus-visible{background:var(--paper);outline:none}
nav a small{color:var(--muted);font-size:12.5px;white-space:nowrap}
main{min-width:0;max-width:820px;padding-block:24px 56px;padding-left:24px;padding-right:max(16px,env(safe-area-inset-right,0px))}
@media (max-width:820px){main{padding-left:max(16px,env(safe-area-inset-left,0px))}}
.sub{color:var(--muted);margin:0 0 24px;font-size:15px}
section{margin-bottom:36px;scroll-margin-top:16px}
section>h2{font-family:var(--display);font-size:21px;margin:0 0 4px}
section>.lead{color:var(--muted);margin:0 0 14px;font-size:15px}
code{font-family:var(--mono);font-size:12.5px;background:var(--bg);border-radius:4px;padding:1px 5px;color:var(--muted)}
small{display:block;color:var(--muted);font-size:13px;font-weight:400}
ul.yn{list-style:none;margin:0;padding:0;display:grid;gap:8px}
ul.yn li{display:grid;grid-template-columns:64px 1fr;gap:10px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
ul.yn li.yes b{color:var(--done)}ul.yn li.no b{color:var(--no)}
ul.yn li span{min-width:0}
ol.steps{list-style:none;margin:0;padding:0;display:grid;gap:10px}
ol.steps li.grp{color:var(--muted);font-size:13.5px;padding:4px 2px 0}
ol.steps li.grp a{color:var(--accent)}
ol.steps li.step,ol.open li{display:grid;grid-template-columns:34px 1fr;gap:12px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-width:0;scroll-margin-top:16px}
ol.steps .n,ol.open .n{width:30px;height:30px;border-radius:50%;background:var(--todo);color:var(--onDot);text-align:center;line-height:30px;font-weight:700;font-size:14px}
.step.doing .n{background:var(--doing)}.step.done .n{background:var(--done)}
ol.open .n{background:var(--accent)}
.b{min-width:0}
.plain{margin:0 0 6px;font-size:16px;font-weight:500}
.meta{margin:0 0 6px;display:flex;flex-wrap:wrap;gap:6px 10px;font-size:13px;align-items:center}
.pill{border-radius:999px;padding:1px 9px;border:1px solid currentColor;white-space:nowrap}
.st-todo{color:var(--todo)}.st-doing{color:var(--doing)}.st-done{color:var(--done)}
.risk-high{color:var(--high)}.risk-med{color:var(--med)}.risk-low{color:var(--low)}
.who{color:var(--muted)} a.who{color:var(--accent)} .wait{color:var(--med)}
.donewhen{margin:0 0 6px;font-size:14px}
details{font-size:13.5px;color:var(--muted)}
details summary{cursor:pointer;color:var(--accent)}
details p{margin:6px 0 0}
details a{color:var(--accent)}
details code{font-size:12px;word-break:break-all}
.paths{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px}
.paths div{display:grid;grid-template-columns:130px 1fr;gap:8px;padding:5px 0;border-top:1px solid var(--line);min-width:0}
.paths div:first-child{border-top:0}
.paths code{word-break:break-all}
@media (max-width:560px){.paths div{grid-template-columns:1fr}}
:target{box-shadow:0 0 0 2px var(--accent)}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
</style>
<div class="shell">
<aside><div class="in">
  <h1>${esc(META.title)}</h1>
  <p class="upd">${t(COPY.updated, { date: META.updated })}</p>
  <div class="bar" data-computed><i class="d" style="width:${(done / STEPS.length) * 100}%"></i><i class="g" style="width:${(doing / STEPS.length) * 100}%"></i></div>
  <nav>${nav}</nav>
</div></aside>
<main>
<p class="sub">${t(COPY.sub, { total: STEPS.length })}</p>

<section id="now"><h2>${esc(COPY.now.h)}</h2><p class="lead">${esc(COPY.now.lead)}</p><ul class="yn">${now}</ul></section>

<section id="steps"><h2>${esc(COPY.steps.h)}</h2><p class="lead">${esc(COPY.steps.lead)}</p><ol class="steps">${steps}</ol></section>

<section id="open"><h2>${esc(COPY.open.h)}</h2><p class="lead">${esc(COPY.open.lead)}</p>${OPEN.length ? `<ol class="open">${open}</ol>` : `<p class="lead">${esc(COPY.open.none)}</p>`}</section>

<section id="paths"><h2>${esc(P.h)}</h2>
<div class="paths">
<div><b>${esc(P.plan)}</b><code>${esc(META.plan)} §1b</code></div>
<div><b>${esc(P.adr)}</b><code>${esc(META.adr)} §5</code></div>
<div><b>${esc(P.mock)}</b><code>${esc(META.mock)}</code></div>
<div><b>${esc(P.track)}</b><span><code>${esc(META.tasks)}</code><br><code>${esc(META.worklog)}</code></span></div>
<div><b>${esc(P.self)}</b><span><code>${esc(META.self)}</code><br>${esc(P.howto)}</span></div>
</div></section>
</main>
</div>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  writeFileSync(path.join(here, 'supervisor.html'), render(), 'utf8');
  console.log('wrote supervisor.html');
}
